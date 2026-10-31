// Запросы к серверу комнат. Ответ — проверенный (protocol.ts) или отказ с текстом для человека
import {
  isCreateRoomResponse,
  isErrorResponse,
  isRoomStateResponse,
  PROTOCOL_VERSION,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type RoomStateResponse,
} from './rules/protocol'

export const OFFLINE = 'Нет связи с сервером'
export const VERSION_MISMATCH = 'Версия сайта и сервера разная — обновите страницу'
const STRANGE = 'Сервер ответил непонятно. Проверьте адрес сервера в «Настройках»'

export type Result<T> = { ok: true; value: T } | { ok: false; error: string; offline?: true; status?: number }

async function call<T>(url: string, init: RequestInit, valid: (x: unknown) => x is T & { v: number }): Promise<Result<T>> {
  let response: Response
  try {
    response = await fetch(url, { ...init, cache: 'no-store' })
  } catch {
    return { ok: false, error: OFFLINE, offline: true }
  }
  const body: unknown = await response.json().catch(() => null)
  if (isErrorResponse(body) && !response.ok) return { ok: false, error: body.error, status: response.status }
  if (body && typeof body === 'object' && 'v' in body && body.v !== PROTOCOL_VERSION) return { ok: false, error: VERSION_MISMATCH }
  if (!response.ok || !valid(body)) return { ok: false, error: STRANGE, status: response.status }
  return { ok: true, value: body }
}

// POST /rooms — создать комнату по паролю компании
export function createRoom(server: string, request: CreateRoomRequest): Promise<Result<CreateRoomResponse>> {
  return call(
    server + '/rooms',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ v: PROTOCOL_VERSION, ...request }) },
    isCreateRoomResponse,
  )
}

// GET /rooms/<номер> — состояние комнаты по ключу телефона
export function fetchRoom(server: string, roomId: string, key: string): Promise<Result<RoomStateResponse>> {
  return call(server + '/rooms/' + encodeURIComponent(roomId), { headers: { Authorization: 'Bearer ' + key } }, isRoomStateResponse)
}
