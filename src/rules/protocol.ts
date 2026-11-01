// Протокол сайта и сервера (Р-01): версия — в каждом ответе и сообщении. Чистые
// функции и типы — ими пользуются и экран, и сервер; ни DOM, ни Cloudflare здесь нет
export const PROTOCOL_VERSION = 1

// Ответ GET /health: сервер жив, его протокол и время (UTC, мс) — по нему закрываются сроки
export type Health = { v: number; ok: true; time: number }

// Отказ: понятный человеку текст. join — у ключа заявки, которую ещё не впустили
// («waiting») или отклонили («rejected»): экран ожидания различает их без разбора текста
export type ErrorResponse = { v: number; error: string; join?: 'waiting' | 'rejected' }

// POST /rooms: создать комнату по паролю компании (Р-03). requestId — номер запроса (ULID)
// от телефона: повтор с тем же номером даёт ту же комнату и тот же ответ
export type CreateRoomRequest = {
  v?: number
  password: string
  name: string
  currency: string
  hostName: string
  requestId?: string
}

// Ответ на создание: номер комнаты, токен приглашения, номер участника-ведущего и ключ его
// телефона — ключ дальше идёт в заголовке Authorization: Bearer <ключ>
export type CreateRoomResponse = { v: number; roomId: string; invite: string; memberId: string; key: string }

// GET /rooms/<номер> с ключом телефона: состояние комнаты; me — номер владельца ключа;
// events — события-пул по порядку создания; now — время сервера (UTC, мс): по нему сайт
// считает отсчёт до закрытия приёма, а не по часам телефона
export type RoomStateResponse = {
  v: number
  room: { id: string; name: string; currency: string; hostId: string; createdAt: number }
  members: { id: string; name: string }[]
  me: string
  events: EventView[]
  now: number
}

// Событие-пул: что не меняется никогда. Исход — номер и текст; свои исходы кончаются «Другое»
export type EventInfo = {
  id: string
  at: number // заведено
  authorId: string
  condition: string
  check: string // как проверяем
  outcomes: { id: string; title: string }[]
  closesAt: number // приём ставок до (не включая)
  expectedAt: number // исход ожидается к
  subjectId: string | null // предмет спора — участник комнаты, если спор о нём
}

export type BetInfo = { id: string; event: string; memberId: string; outcome: string; amount: number; at: number }
export type Clarification = { id: string; at: number; text: string }
export type Cancellation = { at: number; by: string; reason: string | null }

// «приём идёт» / «приём закрыт» (по времени сервера) / «отменено»
export type EventStatus = 'open' | 'closed' | 'cancelled'

// Событие в состоянии комнаты: ставки по порядку журнала, уточнения, статус; отменено —
// refunds: каждому участнику — его сумма
export type EventView = EventInfo & {
  status: EventStatus
  clarifications: Clarification[]
  bets: Omit<BetInfo, 'event'>[]
  cancelled: Cancellation | null
  refunds: { memberId: string; amount: number }[]
}

// POST /rooms/<номер>/events — завести событие. outcomes не задан — «Да» и «Нет»; requestId —
// номер запроса (ULID): повтор с тем же номером — то же событие и тот же ответ
export type CreateEventRequest = {
  v?: number
  condition: string
  check: string
  outcomes?: string[]
  closesAt: number
  expectedAt: number
  subject?: string
  requestId?: string
}
export type CreateEventResponse = { v: number; event: EventInfo }

// POST /rooms/<номер>/events/<событие>/bets — ставка; сумма — целое > 0 в минимальных единицах
export type PlaceBetRequest = { v?: number; outcome: string; amount: number; requestId?: string }
export type PlaceBetResponse = { v: number; bet: BetInfo }

// POST /rooms/<номер>/events/<событие>/clarify — уточнение автора
export type ClarifyEventRequest = { v?: number; text: string }
export type ClarifyEventResponse = { v: number; clarification: Clarification }

// POST /rooms/<номер>/events/<событие>/cancel — отмена; после закрытия приёма — ведущий с причиной
export type CancelEventRequest = { v?: number; reason?: string }
export type CancelEventResponse = { v: number; cancelled: Cancellation }

// Вход по ссылке (Р-03). Токены — в теле запроса, не в адресе: адреса попадают в журналы.
// POST /rooms/<номер>/preview — что за комната по ссылке-приглашению: только название и ведущий
export type PreviewRequest = { v?: number; invite: string }
export type PreviewResponse = { v: number; name: string; hostName: string }

// POST /rooms/<номер>/join — заявка: ключ телефона, который откроет комнату, когда ведущий
// впустит. requestId — номер запроса (ULID): повтор с тем же номером — та же заявка и тот же ключ
export type JoinRoomRequest = { v?: number; invite: string; name: string; requestId?: string }
export type JoinRoomResponse = { v: number; memberId: string; key: string; join: 'waiting' | 'admitted' | 'rejected' }

// GET /rooms/<номер>/requests — ждущие заявки, только ведущему
export type JoinRequestsResponse = { v: number; requests: { id: string; name: string; at: number }[] }

// POST /rooms/<номер>/admit и /reject — решение ведущего по заявке
export type DecideRequest = { v?: number; request: string }
export type AdmitResponse = { v: number; member: { id: string; name: string } }
export type RejectResponse = { v: number; request: string }

// POST /rooms/<номер>/invite — ведущий меняет ссылку-приглашение: старая перестаёт работать
export type InviteResponse = { v: number; invite: string }

// POST /rooms/<номер>/device — ссылка для другого устройства: одноразовая, на сутки.
// member — за кого (по умолчанию — себе; за другого — только ведущий); unlink — после
// использования прежние ключи участника не открывают комнату (потерял телефон)
export type DeviceLinkRequest = { v?: number; member?: string; unlink?: boolean }
export type DeviceLinkResponse = { v: number; token: string; member: string; expiresAt: number }

// POST /rooms/<номер>/device/claim — другое устройство по ссылке получает свой ключ участника
export type ClaimDeviceRequest = { v?: number; token: string }
export type ClaimDeviceResponse = { v: number; memberId: string; key: string }

export function isHealth(x: unknown): x is Health {
  if (typeof x !== 'object' || x === null) return false
  const h = x as Record<string, unknown>
  return h.ok === true && typeof h.v === 'number' && typeof h.time === 'number'
}

function record(x: unknown): Record<string, unknown> | null {
  return typeof x === 'object' && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : null
}

function strings(r: Record<string, unknown>, ...names: string[]): boolean {
  return names.every((n) => typeof r[n] === 'string')
}

// Проверки ответов для сайта: сервер другой версии или чужой адрес — не то, что ждём
export function isErrorResponse(x: unknown): x is ErrorResponse {
  const r = record(x)
  return !!r && typeof r.v === 'number' && typeof r.error === 'string'
}

export function isCreateRoomResponse(x: unknown): x is CreateRoomResponse {
  const r = record(x)
  return !!r && typeof r.v === 'number' && strings(r, 'roomId', 'invite', 'memberId', 'key')
}

// Отметка заявки в отказе GET /rooms/<номер>: ждём ведущего или отклонили; другое — нет отметки
export function joinMark(x: unknown): 'waiting' | 'rejected' | undefined {
  const r = record(x)
  return r?.join === 'waiting' || r?.join === 'rejected' ? r.join : undefined
}

function versioned(x: unknown): Record<string, unknown> | null {
  const r = record(x)
  return r && typeof r.v === 'number' ? r : null
}

export function isPreviewResponse(x: unknown): x is PreviewResponse {
  const r = versioned(x)
  return !!r && strings(r, 'name', 'hostName')
}

export function isJoinRoomResponse(x: unknown): x is JoinRoomResponse {
  const r = versioned(x)
  return !!r && strings(r, 'memberId', 'key') && (r.join === 'waiting' || r.join === 'admitted' || r.join === 'rejected')
}

export function isJoinRequestsResponse(x: unknown): x is JoinRequestsResponse {
  const r = versioned(x)
  if (!r || !Array.isArray(r.requests)) return false
  return r.requests.every((q) => {
    const request = record(q)
    return !!request && strings(request, 'id', 'name') && typeof request.at === 'number'
  })
}

export function isAdmitResponse(x: unknown): x is AdmitResponse {
  const r = versioned(x)
  const member = r && record(r.member)
  return !!member && strings(member, 'id', 'name')
}

export function isRejectResponse(x: unknown): x is RejectResponse {
  const r = versioned(x)
  return !!r && strings(r, 'request')
}

export function isInviteResponse(x: unknown): x is InviteResponse {
  const r = versioned(x)
  return !!r && strings(r, 'invite') && r.invite !== ''
}

export function isDeviceLinkResponse(x: unknown): x is DeviceLinkResponse {
  const r = versioned(x)
  return !!r && strings(r, 'token', 'member') && typeof r.expiresAt === 'number'
}

export function isClaimDeviceResponse(x: unknown): x is ClaimDeviceResponse {
  const r = versioned(x)
  return !!r && strings(r, 'memberId', 'key')
}

export function isRoomStateResponse(x: unknown): x is RoomStateResponse {
  const r = record(x)
  const room = r && record(r.room)
  if (!r || !room || typeof r.v !== 'number' || typeof r.me !== 'string' || !Array.isArray(r.members)) return false
  if (!strings(room, 'id', 'name', 'currency', 'hostId') || typeof room.createdAt !== 'number') return false
  if (typeof r.now !== 'number' || !Array.isArray(r.events) || !r.events.every(isEventView)) return false
  return r.members.every((m) => {
    const member = record(m)
    return !!member && strings(member, 'id', 'name')
  })
}

function numbers(r: Record<string, unknown>, ...names: string[]): boolean {
  return names.every((n) => typeof r[n] === 'number')
}

function list(x: unknown, item: (r: Record<string, unknown>) => boolean): boolean {
  return Array.isArray(x) && x.every((i) => {
    const r = record(i)
    return !!r && item(r)
  })
}

function isEventInfo(r: Record<string, unknown>): boolean {
  return (
    strings(r, 'id', 'authorId', 'condition', 'check') &&
    numbers(r, 'at', 'closesAt', 'expectedAt') &&
    (r.subjectId === null || typeof r.subjectId === 'string') &&
    list(r.outcomes, (o) => strings(o, 'id', 'title')) &&
    (r.outcomes as unknown[]).length >= 2
  )
}

function isClarification(r: Record<string, unknown>): boolean {
  return strings(r, 'id', 'text') && numbers(r, 'at')
}

function isCancellation(r: Record<string, unknown>): boolean {
  return strings(r, 'by') && numbers(r, 'at') && (r.reason === null || typeof r.reason === 'string')
}

function isBet(r: Record<string, unknown>): boolean {
  return strings(r, 'id', 'memberId', 'outcome') && numbers(r, 'amount', 'at')
}

function isEventView(x: unknown): boolean {
  const r = record(x)
  if (!r || !isEventInfo(r)) return false
  if (r.status !== 'open' && r.status !== 'closed' && r.status !== 'cancelled') return false
  const c = record(r.cancelled)
  const cancelled = r.cancelled === null || (!!c && isCancellation(c))
  return (
    cancelled &&
    list(r.clarifications, isClarification) &&
    list(r.bets, isBet) &&
    list(r.refunds, (f) => strings(f, 'memberId') && numbers(f, 'amount'))
  )
}

export function isCreateEventResponse(x: unknown): x is CreateEventResponse {
  const r = versioned(x)
  const event = r && record(r.event)
  return !!event && isEventInfo(event)
}

export function isPlaceBetResponse(x: unknown): x is PlaceBetResponse {
  const r = versioned(x)
  const bet = r && record(r.bet)
  return !!bet && isBet(bet) && strings(bet, 'event')
}

export function isClarifyEventResponse(x: unknown): x is ClarifyEventResponse {
  const r = versioned(x)
  const c = r && record(r.clarification)
  return !!c && isClarification(c)
}

export function isCancelEventResponse(x: unknown): x is CancelEventResponse {
  const r = versioned(x)
  const c = r && record(r.cancelled)
  return !!c && isCancellation(c)
}
