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

// GET /rooms/<номер> с ключом телефона: состояние комнаты; me — номер владельца ключа
export type RoomStateResponse = {
  v: number
  room: { id: string; name: string; currency: string; hostId: string; createdAt: number }
  members: { id: string; name: string }[]
  me: string
}

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
  return r.members.every((m) => {
    const member = record(m)
    return !!member && strings(member, 'id', 'name')
  })
}
