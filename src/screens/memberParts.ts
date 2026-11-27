// Жизнь комнаты на сайте (Р-40, Р-41, Р-46): вышел и «выбыл» у участника — по ответу сервера (left, dropped);
// когда — по журналу комнаты из копии участника (GET …/export): в ответе комнаты времени нет. Проверки
// действий — на сервере (member.ts); здесь — что показать. Чистые функции без DOM — с тестами
// (memberParts.test.ts)
import { formatDate, formatDateTime } from '../rules/date'
import type { LogEntry } from '../rules/room'
import type { SavedRoom } from '../store/db'

type RoomMember = SavedRoom['members'][number]

// Пометка у имени в списке участников: вышел — «вышел», помечен — «выбыл», иначе — нет
export function memberMark(m: RoomMember): 'вышел' | 'выбыл' | null {
  if (m.left) return 'вышел'
  if (m.dropped) return 'выбыл'
  return null
}

// В игре: не вышел и не помечен «выбыл» — его можно назвать гарантом и адресатом пари
export function inPlayMember(m: RoomMember): boolean {
  return !m.left && !m.dropped
}

// Я помечен «выбыл»: новых ставок, пари, встречных, вкладов, событий не делаю — доигрываю своё
export function iAmDropped(room: Pick<SavedRoom, 'members' | 'memberId'>): boolean {
  return room.members.some((m) => m.id === room.memberId && m.dropped === true)
}

// Ведущему у участника: пометить «выбыл» — у того, кто в игре; снять — у помеченного; у себя и у
// вышедшего — ничего (сервер откажет: ведущего и вышедшего — 409)
export function dropAction(room: Pick<SavedRoom, 'hostId' | 'memberId'>, m: RoomMember): 'drop' | 'restore' | null {
  if (room.memberId !== room.hostId || m.id === room.hostId || m.left) return null
  return m.dropped ? 'restore' : 'drop'
}

export const DROP_LABEL = { drop: 'Пометить „выбыл“', restore: 'Снять „выбыл“' } as const

// Вопрос подтверждения пометки: что будет с участником
export function dropQuestion(action: 'drop' | 'restore', name: string): string {
  return action === 'drop'
    ? `Пометить «${name}» „выбыл“? Новых ставок, пари и вкладов делать не сможет — только доиграет своё и отметит переводы.`
    : `Снять с «${name}» пометку „выбыл“? Снова сможет ставить, предлагать пари и вкладывать.`
}

export const DROPPED_NOTE = 'Ведущий пометил вас „выбыл“: доигрывайте своё и отмечайте переводы'
export const LEAVE_CONFIRM = 'Выйти из комнаты? Ваши непринятые пари будут отозваны.'
// Ведущему вместо «Выйти из комнаты» (Р-42): «Чтобы выйти, сначала передайте ведение участнику в списке» —
// середина — ссылка к списку участников
export const HOST_LEAVE = { before: 'Чтобы выйти, сначала ', link: 'передайте ведение', after: ' участнику в списке' } as const
export const REJECTED_HINT = 'Можно подать заявку с другим именем'

// Ведение (Р-42). Когда ведущий заходил и с какого мига ведение можно взять — из ответа комнаты (hostSeenAt,
// hostTakeFrom); сервер до выкатки полей не шлёт — null: ни «заходил», ни «Взять ведение»
export type HostTimes = { seenAt: number; takeFrom: number }

export function hostTimes(room: { hostSeenAt?: number; hostTakeFrom?: number }): HostTimes | null {
  return room.hostSeenAt === undefined || room.hostTakeFrom === undefined ? null : { seenAt: room.hostSeenAt, takeFrom: room.hostTakeFrom }
}

const DAY = 24 * 60 * 60 * 1000

// Ведущему у участника — «Передать ведение»: только тому, кто в игре, и не себе (сервер откажет: вышедшему и
// «выбыл» — 409)
export function passAction(room: Pick<SavedRoom, 'hostId' | 'memberId'>, m: RoomMember): boolean {
  return room.memberId === room.hostId && m.id !== room.hostId && inPlayMember(m)
}

export const PASS_LABEL = 'Передать ведение'
export const TAKE_LABEL = 'Взять ведение'

export function passQuestion(name: string): string {
  return `Передать ведение «${name}»? Вы станете обычным участником: впускать, помечать „выбыл“ и решать возражения будет «${name}».`
}

// «заходил 25.11.2026, 14:00» под ведущим — местным временем (сервер знает час, не минуту)
export function seenLine(seenAt: number, timeZone?: string): string {
  return 'заходил ' + formatDateTime(seenAt, timeZone)
}

// Взять ведение — остальным, кто в игре: ведущий не заходил 7 дней (now — время сервера) — кнопка; не заходил
// больше суток — подпись «можно с …»; иначе, у ведущего, у «выбыл» и без времён с сервера — ничего
export type TakeState = { kind: 'take' } | { kind: 'wait'; from: number } | null

export function takeState(room: Pick<SavedRoom, 'hostId' | 'memberId' | 'members'>, host: HostTimes | null, now: number): TakeState {
  const me = room.members.find((m) => m.id === room.memberId)
  if (!host || room.memberId === room.hostId || !me || !inPlayMember(me)) return null
  if (now >= host.takeFrom) return { kind: 'take' }
  if (now - host.seenAt > DAY) return { kind: 'wait', from: host.takeFrom }
  return null
}

export function takeLine(from: number, timeZone?: string): string {
  return 'Взять ведение можно с ' + formatDateTime(from, timeZone)
}

export function takeQuestion(hostName: string, seenAt: number, timeZone?: string): string {
  return `Взять ведение? Ведущий «${hostName}» не заходил с ${formatDateTime(seenAt, timeZone)}. Вы станете ведущим: впускать, помечать „выбыл“ и решать возражения будете вы.`
}

// Отказ сервера на «Взять ведение»: его текст как есть («…можно через 6 дн» — сервер не знает часового пояса
// телефона); срок ещё не настал по hostTakeFrom — к нему дата местным временем
export function takeRefusal(error: string, host: HostTimes | null, now: number, timeZone?: string): string {
  return host && host.takeFrom > now ? `${error} — можно с ${formatDateTime(host.takeFrom, timeZone)}` : error
}

// Когда участник вышел последний раз — по журналу комнаты; не выходил или журнала нет — null
export function leftAt(log: readonly LogEntry[], memberId: string): number | null {
  let at: number | null = null
  for (const e of log) if (e.type === 'member.left' && e.memberId === memberId) at = e.at
  return at
}

// Строка заявки-возврата у ведущего (Р-46): «Похож на вышедшего „Боря“ (вышел 24.11)»; дата неизвестна —
// без скобок
export function returnLine(name: string, at: number | null, timeZone?: string): string {
  return `Похож на вышедшего „${name}“` + (at === null ? '' : ` (вышел ${formatDate(at, timeZone).slice(0, 5)})`)
}

// Строка «Истории» о жизни комнаты: кто, что сделал, когда
export type LifeItem = { id: string; at: number; text: string }

function nameIn(room: Pick<SavedRoom, 'members'>, id: string): string {
  return room.members.find((m) => m.id === id)?.name ?? 'участник'
}

// «Боря — вышел», «Ведущий пометил „выбыл“: Вера», «Ведущий снял „выбыл“: Вера»; ведение (Р-42) — «Ведущий Лена
// передал ведение: Костя», «Участник Вера взял ведение: ведущий не заходил с <дата>» из журнала комнаты
// (без рода: имя не говорит, «пометил» он или «пометила» — род у слов «ведущий», «участник»), новое сверху
// (равные — по номеру записи)
export function lifeItems(room: Pick<SavedRoom, 'members'>, log: readonly LogEntry[], timeZone?: string): LifeItem[] {
  const items: LifeItem[] = []
  for (const e of log) {
    if (e.type === 'member.left') items.push({ id: e.id, at: e.at, text: `${nameIn(room, e.memberId)} — вышел` })
    if (e.type === 'member.dropped') items.push({ id: e.id, at: e.at, text: `Ведущий пометил „выбыл“: ${nameIn(room, e.member)}` })
    if (e.type === 'member.reinstated') items.push({ id: e.id, at: e.at, text: `Ведущий снял „выбыл“: ${nameIn(room, e.member)}` })
    if (e.type === 'host.passed') items.push({ id: e.id, at: e.at, text: `Ведущий ${nameIn(room, e.memberId)} передал ведение: ${nameIn(room, e.member)}` })
    if (e.type === 'host.taken') {
      const why = `ведущий не заходил с ${formatDateTime(e.seenAt, timeZone)}`
      items.push({ id: e.id, at: e.at, text: `Участник ${nameIn(room, e.memberId)} взял ведение: ${why}` })
    }
  }
  return items.sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
}
