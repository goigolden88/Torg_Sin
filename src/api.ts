// Запросы к серверу комнат. Ответ — проверенный (protocol.ts) или отказ с текстом для человека.
// server — адрес сервера комнаты (у комнаты свой, из ссылки или с создания; «Настройки» — только для новых)
import {
  isAdmitResponse,
  isCancelEventResponse,
  isClaimDeviceResponse,
  isClarifyEventResponse,
  isCreateEventResponse,
  isCreateRoomResponse,
  isPlaceBetResponse,
  isDeviceLinkResponse,
  isErrorResponse,
  isInviteResponse,
  isJoinRequestsResponse,
  isJoinRoomResponse,
  isPreviewResponse,
  isRejectResponse,
  isRoomStateResponse,
  joinMark,
  PROTOCOL_VERSION,
  type AdmitResponse,
  type CancelEventResponse,
  type ClaimDeviceResponse,
  type ClarifyEventResponse,
  type CreateEventRequest,
  type CreateEventResponse,
  type PlaceBetRequest,
  type PlaceBetResponse,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type DeviceLinkRequest,
  type DeviceLinkResponse,
  type InviteResponse,
  type JoinRequestsResponse,
  type JoinRoomRequest,
  type JoinRoomResponse,
  type PreviewResponse,
  type RejectResponse,
  type RoomStateResponse,
} from './rules/protocol'

export const OFFLINE = 'Нет связи с сервером'
export const VERSION_MISMATCH = 'Версия сайта и сервера разная — обновите страницу'
const STRANGE = 'Сервер ответил непонятно. Проверьте адрес сервера в «Настройках»'

// join — отметка заявки в отказе: ждём ведущего или отклонили (экран ожидания)
export type Failure = { ok: false; error: string; offline?: true; status?: number; join?: 'waiting' | 'rejected' }
export type Result<T> = { ok: true; value: T } | Failure

async function call<T>(url: string, init: RequestInit, valid: (x: unknown) => x is T & { v: number }): Promise<Result<T>> {
  let response: Response
  try {
    response = await fetch(url, { ...init, cache: 'no-store' })
  } catch {
    return { ok: false, error: OFFLINE, offline: true }
  }
  const body: unknown = await response.json().catch(() => null)
  if (isErrorResponse(body) && !response.ok) {
    const join = joinMark(body)
    return join ? { ok: false, error: body.error, status: response.status, join } : { ok: false, error: body.error, status: response.status }
  }
  if (body && typeof body === 'object' && 'v' in body && body.v !== PROTOCOL_VERSION) return { ok: false, error: VERSION_MISMATCH }
  if (!response.ok || !valid(body)) return { ok: false, error: STRANGE, status: response.status }
  return { ok: true, value: body }
}

function roomUrl(server: string, roomId: string, action = ''): string {
  return server + '/rooms/' + encodeURIComponent(roomId) + (action ? '/' + action : '')
}

// POST с телом JSON; key — ключ телефона (Authorization: Bearer), если действие по ключу
function post(body: object, key?: string): RequestInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (key) headers.Authorization = 'Bearer ' + key
  return { method: 'POST', headers, body: JSON.stringify({ v: PROTOCOL_VERSION, ...body }) }
}

function bearer(key: string): RequestInit {
  return { headers: { Authorization: 'Bearer ' + key } }
}

// POST /rooms — создать комнату по паролю компании
export function createRoom(server: string, request: CreateRoomRequest): Promise<Result<CreateRoomResponse>> {
  return call(server + '/rooms', post(request), isCreateRoomResponse)
}

// GET /rooms/<номер> — состояние комнаты по ключу телефона. Ключ заявки — отказ с join
export function fetchRoom(server: string, roomId: string, key: string): Promise<Result<RoomStateResponse>> {
  return call(roomUrl(server, roomId), bearer(key), isRoomStateResponse)
}

// POST /rooms/<номер>/preview — что за комната по ссылке-приглашению
export function previewRoom(server: string, roomId: string, invite: string): Promise<Result<PreviewResponse>> {
  return call(roomUrl(server, roomId, 'preview'), post({ invite }), isPreviewResponse)
}

// POST /rooms/<номер>/join — заявка; повтор с тем же requestId — та же заявка и тот же ключ
export function joinRoom(server: string, roomId: string, request: Omit<JoinRoomRequest, 'v'>): Promise<Result<JoinRoomResponse>> {
  return call(roomUrl(server, roomId, 'join'), post(request), isJoinRoomResponse)
}

// GET /rooms/<номер>/requests — ждущие заявки, ведущему
export function fetchRequests(server: string, roomId: string, key: string): Promise<Result<JoinRequestsResponse>> {
  return call(roomUrl(server, roomId, 'requests'), bearer(key), isJoinRequestsResponse)
}

// POST /rooms/<номер>/admit — впустить
export function admitRequest(server: string, roomId: string, key: string, request: string): Promise<Result<AdmitResponse>> {
  return call(roomUrl(server, roomId, 'admit'), post({ request }, key), isAdmitResponse)
}

// POST /rooms/<номер>/reject — отклонить
export function rejectRequest(server: string, roomId: string, key: string, request: string): Promise<Result<RejectResponse>> {
  return call(roomUrl(server, roomId, 'reject'), post({ request }, key), isRejectResponse)
}

// POST /rooms/<номер>/invite — новая ссылка-приглашение; старая перестаёт работать
export function renewInvite(server: string, roomId: string, key: string): Promise<Result<InviteResponse>> {
  return call(roomUrl(server, roomId, 'invite'), post({}, key), isInviteResponse)
}

// POST /rooms/<номер>/device — ссылка для другого устройства (себе или, ведущему, за другого)
export function issueDeviceLink(
  server: string,
  roomId: string,
  key: string,
  request: Omit<DeviceLinkRequest, 'v'>,
): Promise<Result<DeviceLinkResponse>> {
  return call(roomUrl(server, roomId, 'device'), post(request, key), isDeviceLinkResponse)
}

// POST /rooms/<номер>/device/claim — ключ этого устройства по ссылке
export function claimDevice(server: string, roomId: string, token: string): Promise<Result<ClaimDeviceResponse>> {
  return call(roomUrl(server, roomId, 'device/claim'), post({ token }), isClaimDeviceResponse)
}

// …/events/<событие>/<действие>
function eventUrl(server: string, roomId: string, eventId: string, action: string): string {
  return roomUrl(server, roomId, 'events/' + encodeURIComponent(eventId) + '/' + action)
}

// POST /rooms/<номер>/events — завести событие; повтор с тем же requestId — то же событие
export function createEvent(
  server: string,
  roomId: string,
  key: string,
  request: Omit<CreateEventRequest, 'v'>,
): Promise<Result<CreateEventResponse>> {
  return call(roomUrl(server, roomId, 'events'), post(request, key), isCreateEventResponse)
}

// POST …/events/<событие>/bets — ставка; повтор с тем же requestId — та же ставка
export function placeBet(
  server: string,
  roomId: string,
  key: string,
  eventId: string,
  request: Omit<PlaceBetRequest, 'v'>,
): Promise<Result<PlaceBetResponse>> {
  return call(eventUrl(server, roomId, eventId, 'bets'), post(request, key), isPlaceBetResponse)
}

// POST …/events/<событие>/clarify — уточнение автора
export function clarifyEvent(server: string, roomId: string, key: string, eventId: string, text: string): Promise<Result<ClarifyEventResponse>> {
  return call(eventUrl(server, roomId, eventId, 'clarify'), post({ text }, key), isClarifyEventResponse)
}

// POST …/events/<событие>/cancel — отмена; после закрытия приёма — ведущий с причиной
export function cancelEvent(
  server: string,
  roomId: string,
  key: string,
  eventId: string,
  reason: string | null,
): Promise<Result<CancelEventResponse>> {
  return call(eventUrl(server, roomId, eventId, 'cancel'), post(reason ? { reason } : {}, key), isCancelEventResponse)
}
