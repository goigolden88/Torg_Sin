// Ответы Worker'а без привязки к Cloudflare: их же отдаст запасная обёртка на Node (Р-02).
// Комнаты даёт вызывающий (RoomsDeps): Cloudflare — объекты Room, тесты — подделки
import {
  PROTOCOL_VERSION,
  type CreateRoomResponse,
  type ErrorResponse,
  type Health,
  type RoomStateResponse,
} from '../../src/rules/protocol'
import { checkRoomInput } from '../../src/rules/room'
import { ulid } from '../../src/rules/ulid'
import { deriveCreation, hashKey, randomToken, ULID_PATTERN } from './keys'
import { NO_ROOM, type CreateInput, type CreateResult, type StateResult } from './room'

// Сайт живёт на другом адресе (GitHub Pages) — браузеру нужно разрешение
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export const STATUS_TEXT = 'Сервер комнат ТоргСина работает. Протокол ' + PROTOCOL_VERSION + '.'

export const BAD_REQUEST = 'Неверный запрос'
export const VERSION_ERROR = 'Версия сайта и сервера разная — обновите страницу'
export const CREATION_OFF = 'Создание комнат выключено'
export const WRONG_PASSWORD = 'Неверный пароль компании'
export const BAD_REQUEST_ID = 'Неверный номер запроса'
export const NEED_KEY = 'Нет доступа: нужен ключ телефона'

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  })
}

// Общие адреса сервера; не наш адрес — null (решает вызывающий)
export function route(method: string, path: string, now: number): Response | null {
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (method === 'GET' && path === '/') {
    return new Response(STATUS_TEXT, { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS_HEADERS } })
  }
  if (method === 'GET' && path === '/health') {
    const body: Health = { v: PROTOCOL_VERSION, ok: true, time: now }
    return json(200, body)
  }
  return null
}

export function notFound(): Response {
  return json(404, { v: PROTOCOL_VERSION, error: 'Нет такого адреса' })
}

// Комнаты для адресов /rooms: обёртка находит хранилище комнаты по номеру
export type RoomsDeps = {
  password: string | undefined // секрет ROOM_PASSWORD; не задан — создание выключено
  now: () => number // время сервера, UTC, мс
  create: (input: CreateInput) => Promise<CreateResult>
  state: (roomId: string, keyHash: string) => Promise<StateResult>
}

type Reply<T> = { status: number; body: T | ErrorResponse }

// Все адреса сервера
export async function handle(request: Request, deps: RoomsDeps): Promise<Response> {
  const path = new URL(request.url).pathname
  const common = route(request.method, path, deps.now())
  if (common) return common
  if (path === '/rooms' && request.method === 'POST') {
    const body: unknown = await request.json().catch(() => null)
    const r = await createRoom(body, deps)
    return json(r.status, r.body)
  }
  const match = /^\/rooms\/([^/]+)$/.exec(path)
  if (match && request.method === 'GET') {
    const r = await getRoom(match[1],request.headers.get('Authorization'), deps)
    return json(r.status, r.body)
  }
  return notFound()
}

// POST /rooms: пароль компании → проверка формы → комната. Пароль проверяется до всего
// остального: без него сервер не говорит, что не так с формой
export async function createRoom(body: unknown, deps: RoomsDeps): Promise<Reply<CreateRoomResponse>> {
  const fail = (status: number, error: string) => ({ status, body: { v: PROTOCOL_VERSION, error } })
  if (!isRecord(body)) return fail(400, BAD_REQUEST)
  if (!deps.password) return fail(503, CREATION_OFF)
  if (typeof body.password !== 'string' || !samePassword(body.password, deps.password)) return fail(403, WRONG_PASSWORD)
  if (body.v !== undefined && body.v !== PROTOCOL_VERSION) return fail(400, VERSION_ERROR)
  // Номера запроса нет — повтор не узнать, но комната создаётся
  const requestId = body.requestId === undefined ? ulid(deps.now()) : body.requestId
  if (typeof requestId !== 'string' || !ULID_PATTERN.test(requestId)) return fail(400, BAD_REQUEST_ID)
  const checked = checkRoomInput({ name: body.name, currency: body.currency, hostName: body.hostName })
  if (!checked.ok) return fail(400, checked.error)
  const { roomId, key } = await deriveCreation(requestId, deps.password)
  const created = await deps.create({ ...checked.input, roomId, keyHash: await hashKey(key), invite: randomToken() })
  if (!created.ok) return fail(created.status, created.error)
  return { status: 200, body: { v: PROTOCOL_VERSION, roomId: created.roomId, invite: created.invite, memberId: created.memberId, key } }
}

// GET /rooms/<номер>: ключ телефона — в заголовке Authorization: Bearer <ключ>
export async function getRoom(roomId: string, authorization: string | null, deps: RoomsDeps): Promise<Reply<RoomStateResponse>> {
  const fail = (status: number, error: string) => ({ status, body: { v: PROTOCOL_VERSION, error } })
  const key = /^Bearer\s+(\S+)$/i.exec(authorization ?? '')?.[1]
  if (!key) return fail(403, NEED_KEY)
  // Кривой номер — комнаты точно нет: хранилище не трогаем
  if (!ULID_PATTERN.test(roomId)) return fail(404, NO_ROOM)
  const r = await deps.state(roomId, await hashKey(key))
  if (!r.ok) return fail(r.status, r.error)
  const { state } = r
  return {
    status: 200,
    body: {
      v: PROTOCOL_VERSION,
      room: { id: state.id, name: state.name, currency: state.currency, hostId: state.hostId, createdAt: state.createdAt },
      members: state.members.map((m) => ({ id: m.id, name: m.name })),
      me: r.me,
    },
  }
}

// Сравнение без раннего выхода: время ответа не подсказывает, сколько знаков угадано
function samePassword(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given)
  const b = new TextEncoder().encode(expected)
  let diff = a.length ^ b.length
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i]
  return diff === 0
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}
