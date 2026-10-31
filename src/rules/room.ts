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

// Запись журнала: номер (ULID), автор (номер участника), время сервера (UTC, мс)
type EntryBase = { id: string; at: number; memberId: string }

export type LogEntry =
  // Комната создана; автор — ведущий
  | (EntryBase & { type: 'room.created'; roomId: string; name: string; currency: CurrencyCode })
  // Участник впущен; автор — кто впустил (ведущего при создании «впускает» он сам)
  | (EntryBase & { type: 'member.added'; member: string; name: string })

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
  }
}

// Состояние комнаты из журнала по порядку; комнаты нет — null
export function foldLog(log: readonly LogEntry[]): RoomState | null {
  let state: RoomState | null = null
  for (const e of log) state = applyEntry(state, e)
  return state
}

// Длина — в знаках, а не в единицах UTF-16: эмодзи — один знак
function length(s: string): number {
  return [...s].length
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
  const hostName = typeof x.hostName === 'string' ? x.hostName.trim() : ''
  if (!hostName) return { ok: false, error: NEED_MEMBER_NAME }
  if (length(hostName) > MAX_MEMBER_NAME) return { ok: false, error: LONG_MEMBER_NAME }
  return { ok: true, input: { name, currency: x.currency, hostName } }
}
