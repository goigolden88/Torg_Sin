// Комната и её журнал (Р-11): журнал только дописывается, текущее состояние считается из него.
// Общее для экрана и сервера: ни DOM, ни Cloudflare
import { CURRENCIES, isCurrencyCode, type CurrencyCode } from './currency'

export const MAX_ROOM_NAME = 60
export const MAX_MEMBER_NAME = 30

export const NEED_ROOM_NAME = 'Нужно название комнаты'
export const LONG_ROOM_NAME = `Название комнаты — не длиннее ${MAX_ROOM_NAME} знаков`
export const NEED_MEMBER_NAME = 'Нужно ваше имя'
export const LONG_MEMBER_NAME = `Имя — не длиннее ${MAX_MEMBER_NAME} знаков`
export const BAD_CURRENCY = 'Нет такой валюты: выберите из ' + CURRENCIES.map((c) => c.code).join(', ')
export const NAME_TAKEN = 'Такое имя уже есть — добавьте букву'

// Запись журнала: номер (ULID), автор (номер участника), время сервера (UTC, мс)
type EntryBase = { id: string; at: number; memberId: string }

export type LogEntry =
  // Комната создана; автор — ведущий
  | (EntryBase & { type: 'room.created'; roomId: string; name: string; currency: CurrencyCode })
  // Участник впущен; автор — кто впустил (ведущего при создании «впускает» он сам).
  // Впущен по заявке — номер участника тот же, что у заявки
  | (EntryBase & { type: 'member.added'; member: string; name: string })
  // Заявка по ссылке-приглашению; автор — сама заявка (номер будущего участника)
  | (EntryBase & { type: 'join.requested'; request: string; name: string })
  // Ведущий отклонил заявку; автор — ведущий
  | (EntryBase & { type: 'join.rejected'; request: string })
  // Ведущий сменил ссылку-приглашение; токена в журнале нет
  | (EntryBase & { type: 'invite.changed' })
  // Выдана «ссылка для другого устройства» участнику member; автор — он сам или ведущий;
  // unlink — после использования прежние ключи участника не открывают комнату. Токена в журнале нет
  | (EntryBase & { type: 'device.issued'; member: string; unlink: boolean; expiresAt: number })
  // По ссылке для другого устройства участник получил новый ключ; автор — участник
  | (EntryBase & { type: 'device.linked'; member: string; unlink: boolean })
  // События-пул (этап 2, event.ts). Номер события — id записи event.created; автор — кто завёл.
  // outcomes — все исходы по порядку, со «Другое» в конце, если исходы свои; subject — предмет
  // спора (участник) или null; requestId — номер запроса телефона: повтор узнаётся по нему
  | (EntryBase & {
      type: 'event.created'
      condition: string
      check: string
      outcomes: { id: string; title: string }[]
      closesAt: number // приём ставок до (UTC, мс), не включая
      expectedAt: number // исход ожидается к
      subject: string | null
      requestId: string
    })
  // Ставка участника (автор) на исход события; отменить нельзя
  | (EntryBase & { type: 'bet.placed'; event: string; outcome: string; amount: number; requestId: string })
  // Уточнение автора события под условием; условие, «как проверяем» и исходы не меняются
  | (EntryBase & { type: 'event.clarified'; event: string; text: string })
  // Событие отменено: до закрытия приёма — автором, после — ведущим с причиной; ставки возвращаются
  | (EntryBase & { type: 'event.cancelled'; event: string; reason: string | null })

export type Member = {
  id: string // номер участника: не привязан к способу входа (Р-03)
  name: string
  addedBy: string // впущен кем
  addedAt: number // и когда
}

export type RoomState = {
  id: string
  name: string
  currency: CurrencyCode
  hostId: string // ведущий
  createdAt: number
  members: Member[] // по порядку входа
}

// Одна запись поверх состояния; прежнее состояние не меняется
export function applyEntry(state: RoomState | null, e: LogEntry): RoomState | null {
  switch (e.type) {
    case 'room.created':
      if (state) return state
      return { id: e.roomId, name: e.name, currency: e.currency, hostId: e.memberId, createdAt: e.at, members: [] }
    case 'member.added':
      if (!state || state.members.some((m) => m.id === e.member)) return state
      return { ...state, members: [...state.members, { id: e.member, name: e.name, addedBy: e.memberId, addedAt: e.at }] }
    // Заявки, ссылка и устройства участников не меняют: заявки считает joinRequests
    case 'join.requested':
    case 'join.rejected':
    case 'invite.changed':
    case 'device.issued':
    case 'device.linked':
      return state
    // События и ставки считает roomEvents (event.ts)
    case 'event.created':
    case 'bet.placed':
    case 'event.clarified':
    case 'event.cancelled':
      return state
  }
}

// Состояние комнаты из журнала по порядку; комнаты нет — null
export function foldLog(log: readonly LogEntry[]): RoomState | null {
  let state: RoomState | null = null
  for (const e of log) state = applyEntry(state, e)
  return state
}

// Заявка на вход: ждёт ведущего, впущена (member.added с её номером) или отклонена
export type JoinRequest = {
  id: string // номер заявки — он же номер участника, если впустят
  name: string
  at: number // подана
  status: 'waiting' | 'admitted' | 'rejected'
}

// Заявки из журнала по порядку подачи. Решение — первое: впущенную не отклонить и наоборот
export function joinRequests(log: readonly LogEntry[]): JoinRequest[] {
  const requests = new Map<string, JoinRequest>()
  for (const e of log) {
    if (e.type === 'join.requested' && !requests.has(e.request)) {
      requests.set(e.request, { id: e.request, name: e.name, at: e.at, status: 'waiting' })
      continue
    }
    const id = e.type === 'member.added' ? e.member : e.type === 'join.rejected' ? e.request : null
    const r = id === null ? undefined : requests.get(id)
    if (r && r.status === 'waiting') requests.set(r.id, { ...r, status: e.type === 'member.added' ? 'admitted' : 'rejected' })
  }
  return [...requests.values()]
}

// Имя для сравнения: без учёта регистра
function nameKey(name: string): string {
  return name.trim().toLowerCase()
}

// Имя занято участником или ждущей заявкой (отклонённая имя не держит)
export function nameTaken(state: RoomState, requests: readonly JoinRequest[], name: string): boolean {
  const key = nameKey(name)
  return (
    state.members.some((m) => nameKey(m.name) === key) || requests.some((r) => r.status === 'waiting' && nameKey(r.name) === key)
  )
}

// Длина — в знаках, а не в единицах UTF-16: эмодзи — один знак
function length(s: string): number {
  return [...s].length
}

// Проверка имени участника: пробелы по краям срезаются
export function checkMemberName(x: unknown): { ok: true; name: string } | { ok: false; error: string } {
  const name = typeof x === 'string' ? x.trim() : ''
  if (!name) return { ok: false, error: NEED_MEMBER_NAME }
  if (length(name) > MAX_MEMBER_NAME) return { ok: false, error: LONG_MEMBER_NAME }
  return { ok: true, name }
}

export type RoomInput = { name: string; currency: CurrencyCode; hostName: string }

// Проверка формы создания комнаты: пробелы по краям срезаются
export function checkRoomInput(x: {
  name: unknown
  currency: unknown
  hostName: unknown
}): { ok: true; input: RoomInput } | { ok: false; error: string } {
  const name = typeof x.name === 'string' ? x.name.trim() : ''
  if (!name) return { ok: false, error: NEED_ROOM_NAME }
  if (length(name) > MAX_ROOM_NAME) return { ok: false, error: LONG_ROOM_NAME }
  if (!isCurrencyCode(x.currency)) return { ok: false, error: BAD_CURRENCY }
  const host = checkMemberName(x.hostName)
  if (!host.ok) return host
  return { ok: true, input: { name, currency: x.currency, hostName: host.name } }
}
