// Жизнь комнаты на сайте (Р-40, Р-41, Р-46): вышел и «выбыл» у участника — по ответу сервера (left, dropped);
// когда — по журналу комнаты из копии участника (GET …/export): в ответе комнаты времени нет. Проверки
// действий — на сервере (member.ts); здесь — что показать. Чистые функции без DOM — с тестами
// (memberParts.test.ts)
import { formatDate } from '../rules/date'
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
export const HOST_CANNOT_LEAVE = 'Сначала передайте ведение'
export const REJECTED_HINT = 'Можно подать заявку с другим именем'

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

// «Боря — вышел», «Ведущий пометил „выбыл“: Вера», «Ведущий снял „выбыл“: Вера» из журнала комнаты (без рода:
// имя ведущего не говорит, «пометил» он или «пометила»), новое сверху (равные — по номеру записи)
export function lifeItems(room: Pick<SavedRoom, 'members'>, log: readonly LogEntry[]): LifeItem[] {
  const items: LifeItem[] = []
  for (const e of log) {
    if (e.type === 'member.left') items.push({ id: e.id, at: e.at, text: `${nameIn(room, e.memberId)} — вышел` })
    if (e.type === 'member.dropped') items.push({ id: e.id, at: e.at, text: `Ведущий пометил „выбыл“: ${nameIn(room, e.member)}` })
    if (e.type === 'member.reinstated') items.push({ id: e.id, at: e.at, text: `Ведущий снял „выбыл“: ${nameIn(room, e.member)}` })
  }
  return items.sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
}
