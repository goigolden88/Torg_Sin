// Копия комнаты (этап 6, Р-02): один формат для выгрузки, переезда на другой хостинг и копии
// участника. Журнал — вся правда комнаты (Р-11), из него поднимается всё остальное; служебные записи
// хранилища — то, без чего после переезда не войти. Общее для экрана и сервера: ни DOM, ни Cloudflare
import { foldLog, type LogEntry } from './room'

// Версия формата копии; несовместимая правка — новая версия, старую сервер по-прежнему читает
export const BACKUP_FORMAT = 1

// Служебные записи хранилища комнаты (RoomStorage, server/src/room.ts) — ключи и значения, как хранятся:
//   key:<хеш>     — ключ телефона → номер участника или заявки; ключа в открытом виде нет
//   device:<хеш>  — ссылка для другого устройства; токена в открытом виде нет
//   invite        — токен ссылки-приглашения
//   secret        — секрет комнаты: из него выводится ключ по заявке
export const STORE_KEY = 'key:'
export const STORE_DEVICE = 'device:'
export const STORE_INVITE = 'invite'
export const STORE_SECRET = 'secret'

export type KeyRecord = { memberId: string; at: number; unlinkedAt?: number } // отвязанный — unlinkedAt
export type InviteRecord = { token: string; at: number }
export type SecretRecord = { secret: string; at: number }
export type DeviceRecord = {
  member: string
  unlink: boolean
  expiresAt: number
  at: number
  usedAt?: number // использована — второй раз не сработает
  revokedAt?: number // прежние ключи участника отвязаны — неиспользованные ссылки тоже гаснут
}

// Копия: полная — со служебными записями (store), копия участника — только журнал (store нет)
export type Backup = {
  format: typeof BACKUP_FORMAT
  roomId: string
  exportedAt: number // миг выгрузки, время сервера (UTC, мс)
  log: LogEntry[] // журнал целиком, по порядку
  store?: Record<string, unknown> // ключ хранилища → значение; только у полной копии
}

export const BAD_BACKUP = 'Это не копия комнаты'
export const UNKNOWN_FORMAT = 'Копия другой версии — этот сервер её не знает'
export const BAD_LOG = 'Журнал в копии битый — комната из него не собирается'
export const ROOM_MISMATCH = 'Номер комнаты в копии не сходится с журналом'
export const LOG_ORDER = 'Записи журнала в копии не по порядку'
export const NEED_FULL = 'Это копия участника — для загрузки нужна полная копия'
export const BAD_STORE = 'Служебные записи копии битые'

// Все виды записей журнала: новый вид без строки здесь — ошибка сборки
const LOG_TYPES: Record<LogEntry['type'], true> = {
  'room.created': true,
  'room.settle-mode': true,
  'room.pace': true,
  'member.added': true,
  'join.requested': true,
  'join.rejected': true,
  'invite.changed': true,
  'device.issued': true,
  'device.linked': true,
  'event.created': true,
  'bet.placed': true,
  'event.clarified': true,
  'event.cancelled': true,
  'outcome.proposed': true,
  'outcome.objected': true,
  'outcome.agreed': true,
  'outcome.decided': true,
  'outcome.voted': true,
  'offer.created': true,
  'offer.accepted': true,
  'offer.revoked': true,
  'offer.marked': true,
  'offer.decided': true,
  'offer.declined': true,
  'offer.nominated': true,
  'offer.bid': true,
  'offer.bid-accepted': true,
  'appeal.filed': true,
  'appeal.joined': true,
  'court.drawn': true,
  'court.voted': true,
  'court.replaced': true,
  'transfer.sent': true,
  'transfer.received': true,
  'transfer.rejected': true,
  'transfer.revoked': true,
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function isTime(x: unknown): x is number {
  return Number.isSafeInteger(x) && (x as number) >= 0
}

function isText(x: unknown): x is string {
  return typeof x === 'string' && x !== ''
}

function optionalTime(x: unknown): boolean {
  return x === undefined || isTime(x)
}

function isLogEntry(x: unknown): x is LogEntry {
  return (
    isRecord(x) &&
    isText(x.id) &&
    isTime(x.at) &&
    isText(x.memberId) &&
    typeof x.type === 'string' &&
    Object.prototype.hasOwnProperty.call(LOG_TYPES, x.type)
  )
}

// Служебная запись: ключ из списка выше и значение своего вида
function storeRecordValid(key: string, v: unknown): boolean {
  if (!isRecord(v) || !isTime(v.at)) return false
  if (key === STORE_INVITE) return isText(v.token)
  if (key === STORE_SECRET) return isText(v.secret)
  if (key.startsWith(STORE_KEY) && key.length > STORE_KEY.length) return isText(v.memberId) && optionalTime(v.unlinkedAt)
  if (key.startsWith(STORE_DEVICE) && key.length > STORE_DEVICE.length) {
    return isText(v.member) && typeof v.unlink === 'boolean' && isTime(v.expiresAt) && optionalTime(v.usedAt) && optionalTime(v.revokedAt)
  }
  return false
}

// Служебные записи полной копии: только известные ключи, приглашение — обязательно (без него в
// комнату не позвать). Порядок — как в копии
function checkStore(x: unknown): Record<string, unknown> | null {
  if (!isRecord(x) || !isRecord(x[STORE_INVITE])) return null
  for (const [key, v] of Object.entries(x)) if (!storeRecordValid(key, v)) return null
  return { ...x }
}

// Проверка копии: версия формата знакома, журнал — записи известного вида, первая — создание комнаты,
// сворачивается foldLog без ошибки; номер комнаты сходится с room.created; записи по порядку — время
// записи не убывает, номера (id) не повторяются (у записей одного мига случайная часть ULID не
// упорядочена — порядок держит время). need: 'full' — нужна полная копия (загрузка). Битая — отказ с
// текстом для человека; годная — копия без лишних полей
export function checkBackup(x: unknown, need?: 'full'): { ok: true; backup: Backup } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error })
  if (!isRecord(x)) return fail(BAD_BACKUP)
  if (x.format !== BACKUP_FORMAT) return fail(x.format === undefined ? BAD_BACKUP : UNKNOWN_FORMAT)
  if (!isText(x.roomId) || !isTime(x.exportedAt) || !Array.isArray(x.log)) return fail(BAD_BACKUP)
  const log: unknown[] = x.log
  if (log.length === 0 || !log.every(isLogEntry)) return fail(BAD_LOG)
  const entries = log as LogEntry[]
  const first = entries[0]
  if (first.type !== 'room.created') return fail(BAD_LOG)
  let state
  try {
    state = foldLog(entries)
  } catch {
    return fail(BAD_LOG)
  }
  if (!state) return fail(BAD_LOG)
  if (first.roomId !== x.roomId || state.id !== x.roomId) return fail(ROOM_MISMATCH)
  const ids = new Set<string>()
  for (let i = 0; i < entries.length; i++) {
    if (ids.has(entries[i].id) || (i > 0 && entries[i].at < entries[i - 1].at)) return fail(LOG_ORDER)
    ids.add(entries[i].id)
  }
  const backup: Backup = { format: BACKUP_FORMAT, roomId: x.roomId, exportedAt: x.exportedAt, log: entries }
  if (x.store === undefined) return need === 'full' ? fail(NEED_FULL) : { ok: true, backup }
  const store = checkStore(x.store)
  if (!store) return fail(BAD_STORE)
  return { ok: true, backup: { ...backup, store } }
}
