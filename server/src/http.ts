// Ответы Worker'а без привязки к Cloudflare: их же отдаст запасная обёртка на Node (Р-02).
// Комнаты даёт вызывающий (RoomsDeps): Cloudflare — объекты Room, тесты — подделки
import {
  PROTOCOL_VERSION,
  type CreateRoomResponse,
  type ErrorResponse,
  type Health,
  type RoomStateResponse,
} from '../../src/rules/protocol'
import { checkAmount, checkClarification, checkEventInput, checkReason, eventView } from '../../src/rules/event'
import { checkMemberName, checkRoomInput } from '../../src/rules/room'
import { ulid } from '../../src/rules/ulid'
import { deriveCreation, hashKey, randomToken, sameText, ULID_PATTERN } from './keys'
import {
  BAD_DEVICE_LINK,
  BAD_LINK,
  NO_EVENT,
  NO_OUTCOME,
  NO_ROOM,
  type ActionResult,
  type ActionType,
  type CreateInput,
  type CreateResult,
  type RoomAction,
  type StateResult,
} from './room'

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
  // Остальные действия комнаты (room.ts, act) — по одному, в очереди комнаты
  act: <K extends ActionType>(roomId: string, action: Extract<RoomAction, { type: K }>) => Promise<ActionResult<K>>
}

type Reply<T> = { status: number; body: T | ErrorResponse }

function failure(status: number, error: string, join?: ErrorResponse['join']): Reply<never> {
  return { status, body: join ? { v: PROTOCOL_VERSION, error, join } : { v: PROTOCOL_VERSION, error } }
}

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
  const sub = /^\/rooms\/([^/]+)\/(preview|join|requests|admit|reject|invite|device|device\/claim)$/.exec(path)
  if (sub) {
    const r = await roomAction(sub[1], sub[2], request, deps)
    if (r) return json(r.status, r.body)
  }
  // События-пул: /rooms/<номер>/events и /rooms/<номер>/events/<событие>/<действие>
  const ev = /^\/rooms\/([^/]+)\/events(?:\/([^/]+)\/(bets|clarify|cancel))?$/.exec(path)
  if (ev && request.method === 'POST') {
    const r = await eventAction(ev[1], ev[2], ev[3], request, deps)
    return json(r.status, r.body)
  }
  return notFound()
}

// POST /rooms/<номер>/events — завести; …/events/<событие>/bets | clarify | cancel
async function eventAction(
  roomId: string,
  eventId: string | undefined,
  action: string | undefined,
  request: Request,
  deps: RoomsDeps,
): Promise<Reply<unknown>> {
  const authorization = request.headers.get('Authorization')
  const raw: unknown = await request.json().catch(() => null)
  if (eventId === undefined) return createEvent(roomId, authorization, raw, deps)
  return withKey(roomId, authorization, async (keyHash) => {
    if (!ULID_PATTERN.test(eventId)) return failure(404, NO_EVENT)
    const read = readBody(raw, action === 'cancel')
    if (!read.ok) return read.reply
    const body = read.body
    switch (action) {
      case 'bets': {
        const amount = checkAmount(body.amount)
        if (typeof body.outcome !== 'string' || !body.outcome) return failure(400, NO_OUTCOME)
        if (!amount.ok) return failure(400, amount.error)
        const requestId = requestIdOf(body, deps)
        if (!requestId) return failure(400, BAD_REQUEST_ID)
        return reply(await deps.act(roomId, { type: 'placeBet', keyHash, event: eventId, outcome: body.outcome, amount: amount.value, requestId }))
      }
      case 'clarify': {
        const text = checkClarification(body.text)
        if (!text.ok) return failure(400, text.error)
        return reply(await deps.act(roomId, { type: 'clarifyEvent', keyHash, event: eventId, text: text.value }))
      }
      default: {
        const reason = checkReason(body.reason)
        if (!reason.ok) return failure(400, reason.error)
        return reply(await deps.act(roomId, { type: 'cancelEvent', keyHash, event: eventId, reason: reason.value }))
      }
    }
  })
}

// Номер запроса из тела: нет — новый (повтор не узнать, но действие выполняется); кривой — null
function requestIdOf(body: Record<string, unknown>, deps: RoomsDeps): string | null {
  const id = body.requestId === undefined ? ulid(deps.now()) : body.requestId
  return typeof id === 'string' && ULID_PATTERN.test(id) ? id : null
}

// POST /rooms/<номер>/events { condition, check, outcomes?, closesAt, expectedAt, subject?, requestId? }
export async function createEvent(roomId: string, authorization: string | null, raw: unknown, deps: RoomsDeps): Promise<Reply<unknown>> {
  return withKey(roomId, authorization, async (keyHash) => {
    const read = readBody(raw)
    if (!read.ok) return read.reply
    const b = read.body
    const checked = checkEventInput({
      condition: b.condition,
      check: b.check,
      outcomes: b.outcomes,
      closesAt: b.closesAt,
      expectedAt: b.expectedAt,
      subject: b.subject,
    })
    if (!checked.ok) return failure(400, checked.error)
    const requestId = requestIdOf(b, deps)
    if (!requestId) return failure(400, BAD_REQUEST_ID)
    return reply(await deps.act(roomId, { type: 'createEvent', keyHash, input: checked.value, requestId }))
  })
}

// Адреса входа по ссылке (Р-03): /rooms/<номер>/<действие>. Не тот метод — null (404)
async function roomAction(roomId: string, action: string, request: Request, deps: RoomsDeps): Promise<Reply<unknown> | null> {
  const authorization = request.headers.get('Authorization')
  if (action === 'requests') return request.method === 'GET' ? listRequests(roomId, authorization, deps) : null
  if (request.method !== 'POST') return null
  const body: unknown = await request.json().catch(() => null)
  switch (action) {
    case 'preview':
      return previewRoom(roomId, body, deps)
    case 'join':
      return joinRoom(roomId, body, deps)
    case 'admit':
    case 'reject':
      return decide(roomId, action, authorization, body, deps)
    case 'invite':
      return renewInvite(roomId, authorization, body, deps)
    case 'device':
      return issueDevice(roomId, authorization, body, deps)
    case 'device/claim':
      return claimDevice(roomId, body, deps)
  }
  return null
}

// Тело запроса: версия протокола не та — отказ. Без тела (или не JSON) — пустое, если можно
function readBody(body: unknown, optional = false): { ok: true; body: Record<string, unknown> } | { ok: false; reply: Reply<never> } {
  const record = isRecord(body) ? body : optional && body === null ? {} : null
  if (!record) return { ok: false, reply: failure(400, BAD_REQUEST) }
  if (record.v !== undefined && record.v !== PROTOCOL_VERSION) return { ok: false, reply: failure(400, VERSION_ERROR) }
  return { ok: true, body: record }
}

function reply<K extends ActionType>(r: ActionResult<K>, extra: Record<string, unknown> = {}): Reply<unknown> {
  if (!r.ok) return failure(r.status, r.error, r.join)
  return { status: 200, body: { v: PROTOCOL_VERSION, ...r.value, ...extra } }
}

// Ключ телефона из заголовка Authorization: Bearer <ключ>
function bearer(authorization: string | null): string | undefined {
  return /^Bearer\s+(\S+)$/i.exec(authorization ?? '')?.[1]
}

// Действие по ключу телефона: нет ключа — 403; кривой номер комнаты — 404, хранилище не трогаем
async function withKey(
  roomId: string,
  authorization: string | null,
  run: (keyHash: string) => Promise<Reply<unknown>>,
): Promise<Reply<unknown>> {
  const key = bearer(authorization)
  if (!key) return failure(403, NEED_KEY)
  if (!ULID_PATTERN.test(roomId)) return failure(404, NO_ROOM)
  return run(await hashKey(key))
}

// POST /rooms/<номер>/preview { invite } → название комнаты и имя ведущего
export async function previewRoom(roomId: string, raw: unknown, deps: RoomsDeps): Promise<Reply<unknown>> {
  const read = readBody(raw)
  if (!read.ok) return read.reply
  const invite = read.body.invite
  if (typeof invite !== 'string' || !invite || !ULID_PATTERN.test(roomId)) return failure(403, BAD_LINK)
  return reply(await deps.act(roomId, { type: 'preview', invite }))
}

// POST /rooms/<номер>/join { invite, name, requestId? } → ключ заявки
export async function joinRoom(roomId: string, raw: unknown, deps: RoomsDeps): Promise<Reply<unknown>> {
  const read = readBody(raw)
  if (!read.ok) return read.reply
  const { invite } = read.body
  if (typeof invite !== 'string' || !invite || !ULID_PATTERN.test(roomId)) return failure(403, BAD_LINK)
  const name = checkMemberName(read.body.name)
  if (!name.ok) return failure(400, name.error)
  // Номера запроса нет — повтор не узнать, но заявка подаётся
  const requestId = read.body.requestId === undefined ? ulid(deps.now()) : read.body.requestId
  if (typeof requestId !== 'string' || !ULID_PATTERN.test(requestId)) return failure(400, BAD_REQUEST_ID)
  return reply(await deps.act(roomId, { type: 'join', invite, name: name.name, requestId }))
}

// GET /rooms/<номер>/requests — ждущие заявки, ведущему
export async function listRequests(roomId: string, authorization: string | null, deps: RoomsDeps): Promise<Reply<unknown>> {
  return withKey(roomId, authorization, async (keyHash) => reply(await deps.act(roomId, { type: 'requests', keyHash })))
}

// POST /rooms/<номер>/admit | reject { request } — решение ведущего
export async function decide(
  roomId: string,
  decision: 'admit' | 'reject',
  authorization: string | null,
  raw: unknown,
  deps: RoomsDeps,
): Promise<Reply<unknown>> {
  return withKey(roomId, authorization, async (keyHash) => {
    const read = readBody(raw)
    if (!read.ok) return read.reply
    const request = read.body.request
    if (typeof request !== 'string' || !request) return failure(400, BAD_REQUEST)
    return decision === 'admit'
      ? reply(await deps.act(roomId, { type: 'admit', keyHash, request }))
      : reply(await deps.act(roomId, { type: 'reject', keyHash, request }))
  })
}

// POST /rooms/<номер>/invite — новая ссылка-приглашение, ведущему
export async function renewInvite(roomId: string, authorization: string | null, raw: unknown, deps: RoomsDeps): Promise<Reply<unknown>> {
  return withKey(roomId, authorization, async (keyHash) => {
    const read = readBody(raw, true)
    if (!read.ok) return read.reply
    return reply(await deps.act(roomId, { type: 'renewInvite', keyHash, invite: randomToken() }))
  })
}

// POST /rooms/<номер>/device { member?, unlink? } — ссылка для другого устройства; токен — только в ответе
export async function issueDevice(roomId: string, authorization: string | null, raw: unknown, deps: RoomsDeps): Promise<Reply<unknown>> {
  return withKey(roomId, authorization, async (keyHash) => {
    const read = readBody(raw, true)
    if (!read.ok) return read.reply
    const { member, unlink } = read.body
    if ((member !== undefined && (typeof member !== 'string' || !member)) || (unlink !== undefined && typeof unlink !== 'boolean')) {
      return failure(400, BAD_REQUEST)
    }
    const token = randomToken()
    const r = await deps.act(roomId, {
      type: 'issueDevice',
      keyHash,
      member: typeof member === 'string' ? member : null,
      unlink: unlink === true,
      tokenHash: await hashKey(token),
    })
    return reply(r, { token })
  })
}

// POST /rooms/<номер>/device/claim { token } — новое устройство получает свой ключ участника
export async function claimDevice(roomId: string, raw: unknown, deps: RoomsDeps): Promise<Reply<unknown>> {
  const read = readBody(raw)
  if (!read.ok) return read.reply
  const token = read.body.token
  if (typeof token !== 'string' || !token || !ULID_PATTERN.test(roomId)) return failure(403, BAD_DEVICE_LINK)
  const key = randomToken(32)
  return reply(await deps.act(roomId, { type: 'claimDevice', tokenHash: await hashKey(token), keyHash: await hashKey(key) }), { key })
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
  const key = bearer(authorization)
  if (!key) return fail(403, NEED_KEY)
  // Кривой номер — комнаты точно нет: хранилище не трогаем
  if (!ULID_PATTERN.test(roomId)) return fail(404, NO_ROOM)
  const r = await deps.state(roomId, await hashKey(key))
  // Ключ заявки: «ждём, пока ведущий впустит» или «отклонил» — с отметкой join для экрана ожидания
  if (!r.ok) return failure(r.status, r.error, r.join)
  const { state } = r
  // Статус событий — на время сервера в ответе: им же сайт считает отсчёт
  const now = deps.now()
  return {
    status: 200,
    body: {
      v: PROTOCOL_VERSION,
      room: { id: state.id, name: state.name, currency: state.currency, hostId: state.hostId, createdAt: state.createdAt },
      members: state.members.map((m) => ({ id: m.id, name: m.name })),
      me: r.me,
      events: r.events.map((e) => eventView(e, now)),
      now,
    },
  }
}

// Сравнение без раннего выхода (keys.ts): время ответа не подсказывает, сколько знаков угадано
function samePassword(given: string, expected: string): boolean {
  return sameText(given, expected)
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}
