// Комната на сервере без привязки к Cloudflare (Р-02): хранилище — только через RoomStorage;
// Cloudflare даёт его объекту Room (index.ts), запасная обёртка — SQLite в Node.
//
// Что лежит в хранилище комнаты:
//   log:00000001…  — журнал комнаты (Р-11), только дописывается: запись по ключу не меняется
//   key:<хеш>      — ключ телефона → номер участника; ключа в открытом виде нет
//   invite         — токен ссылки-приглашения (меняется — не журнал)
import { foldLog, type LogEntry, type RoomInput, type RoomState } from '../../src/rules/room'
import { ulid } from '../../src/rules/ulid'

export type RoomStorage = {
  get<T>(key: string): Promise<T | undefined>
  put<T>(key: string, value: T): Promise<void>
  list<T>(options: { prefix: string }): Promise<Map<string, T>> // по возрастанию ключа
  setAlarm(time: number): Promise<void>
}

export const NO_ROOM = 'Нет такой комнаты'
export const WRONG_KEY = 'Нет доступа: этот телефон не участник комнаты'
export const REQUEST_TAKEN = 'Этот номер запроса уже занят другой комнатой'
export const APPEND_ONLY = 'Журнал комнаты только дописывается'

const LOG = 'log:'
const KEY = 'key:'
const INVITE = 'invite'

type KeyRecord = { memberId: string; at: number }
type InviteRecord = { token: string; at: number }

// Номер записи — по порядку: 8 цифр, ключи сортируются как числа
function logKey(n: number): string {
  return LOG + String(n).padStart(8, '0')
}

export async function readLog(storage: RoomStorage): Promise<LogEntry[]> {
  return [...(await storage.list<LogEntry>({ prefix: LOG })).values()]
}

// Дописать записи в конец журнала. Занятый ключ не перезаписывается — ошибка
export async function append(storage: RoomStorage, entries: readonly LogEntry[]): Promise<void> {
  let n = (await storage.list({ prefix: LOG })).size
  for (const e of entries) {
    const key = logKey(++n)
    if ((await storage.get(key)) !== undefined) throw new Error(APPEND_ONLY)
    await storage.put(key, e)
  }
}

// Что Worker передаёт комнате при создании: номер, проверенная форма, хеш ключа ведущего, приглашение
export type CreateInput = RoomInput & { roomId: string; keyHash: string; invite: string }

export type CreateResult =
  | { ok: true; roomId: string; memberId: string; invite: string }
  | { ok: false; status: 409; error: string }

// Создать комнату. Комната уже есть (повтор того же запроса) — тот же ответ, ничего не дописывая;
// тот же номер, но другая форма или ключ — отказ
export async function createRoom(storage: RoomStorage, input: CreateInput, now: number): Promise<CreateResult> {
  const existing = foldLog(await readLog(storage))
  if (existing) {
    const owner = await storage.get<KeyRecord>(KEY + input.keyHash)
    const host = existing.members.find((m) => m.id === existing.hostId)
    const invite = await storage.get<InviteRecord>(INVITE)
    const same =
      owner?.memberId === existing.hostId &&
      existing.name === input.name &&
      existing.currency === input.currency &&
      host?.name === input.hostName
    if (!same || !invite) return { ok: false, status: 409, error: REQUEST_TAKEN }
    return { ok: true, roomId: existing.id, memberId: existing.hostId, invite: invite.token }
  }
  const hostId = ulid(now)
  // Ключ и приглашение — до журнала: журнал есть — значит, комната создана целиком
  await storage.put<KeyRecord>(KEY + input.keyHash, { memberId: hostId, at: now })
  await storage.put<InviteRecord>(INVITE, { token: input.invite, at: now })
  await append(storage, [
    { id: ulid(now), at: now, memberId: hostId, type: 'room.created', roomId: input.roomId, name: input.name, currency: input.currency },
    { id: ulid(now), at: now, memberId: hostId, type: 'member.added', member: hostId, name: input.hostName },
  ])
  return { ok: true, roomId: input.roomId, memberId: hostId, invite: input.invite }
}

export type StateResult =
  | { ok: true; state: RoomState; me: string }
  | { ok: false; status: 403 | 404; error: string }

// Состояние комнаты для владельца ключа (по хешу ключа)
export async function roomState(storage: RoomStorage, keyHash: string): Promise<StateResult> {
  const state = foldLog(await readLog(storage))
  if (!state) return { ok: false, status: 404, error: NO_ROOM }
  const owner = await storage.get<KeyRecord>(KEY + keyHash)
  if (!owner || !state.members.some((m) => m.id === owner.memberId)) return { ok: false, status: 403, error: WRONG_KEY }
  return { ok: true, state, me: owner.memberId }
}
