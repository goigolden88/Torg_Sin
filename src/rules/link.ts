// Ссылка-приглашение (Р-02, Р-03): <сайт>#/join/<номер комнаты>/<токен>; сервер не по умолчанию —
// параметром ?server=<адрес>: друг по ссылке идёт туда, где комната. Общее для экрана и сервера
import { DEFAULT_SERVER, normalizeServer } from './address'

const ROOM_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/ // ULID, как номер комнаты на сервере
const TOKEN = /^[A-Za-z0-9_-]{1,128}$/ // base64url

export type InviteLink = { roomId: string; invite: string; server: string }

// site — адрес сайта с base сборки, например https://goigolden88.github.io/Torg_Sin/
export function inviteLink(site: string, link: InviteLink): string {
  return roomLink(site, 'join', link.roomId, link.invite, link.server)
}

// Разбор ссылки целиком или только её хеша («#/join/…»); не ссылка-приглашение — null
export function parseInviteLink(text: string): InviteLink | null {
  const parsed = parseLink('join', text)
  return parsed && { roomId: parsed.roomId, invite: parsed.token, server: parsed.server }
}

// Ссылка для другого устройства: <сайт>#/device/<номер комнаты>/<токен>, сервер — как у
// приглашения. Одноразовая, на сутки (решает сервер); по ней тот же участник открывает комнату
// на другом устройстве
export type DeviceLink = { roomId: string; token: string; server: string }

export function deviceLink(site: string, link: DeviceLink): string {
  return roomLink(site, 'device', link.roomId, link.token, link.server)
}

// Разбор ссылки для другого устройства; не она — null
export function parseDeviceLink(text: string): DeviceLink | null {
  return parseLink('device', text)
}

function roomLink(site: string, kind: string, roomId: string, token: string, server: string): string {
  const base = site.split('#')[0]
  const normalized = normalizeServer(server) ?? DEFAULT_SERVER
  const query = normalized === DEFAULT_SERVER ? '' : '?server=' + encodeURIComponent(normalized)
  return `${base}#/${kind}/${roomId}/${token}${query}`
}

function parseLink(kind: string, text: string): { roomId: string; token: string; server: string } | null {
  const at = text.indexOf('#')
  if (at < 0) return null
  const match = new RegExp(`^#/${kind}/([^/?]+)/([^/?]+)(?:\\?(.*))?$`).exec(text.slice(at).trim())
  if (!match) return null
  const [, roomId, token, query] = match
  if (!ROOM_ID.test(roomId) || !TOKEN.test(token)) return null
  const given = new URLSearchParams(query ?? '').get('server')
  if (given === null) return { roomId, token, server: DEFAULT_SERVER }
  const server = normalizeServer(given)
  return server ? { roomId, token, server } : null
}
