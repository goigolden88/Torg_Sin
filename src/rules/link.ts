// Ссылка-приглашение (Р-02, Р-03): <сайт>#/join/<номер комнаты>/<токен>; сервер не по умолчанию —
// параметром ?server=<адрес>: друг по ссылке идёт туда, где комната. Общее для экрана и сервера
import { DEFAULT_SERVER, normalizeServer } from './address'

const ROOM_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/ // ULID, как номер комнаты на сервере
const TOKEN = /^[A-Za-z0-9_-]{1,128}$/ // base64url

export type InviteLink = { roomId: string; invite: string; server: string }

// site — адрес сайта с base сборки, например https://goigolden88.github.io/Torg_Sin/
export function inviteLink(site: string, link: InviteLink): string {
  const base = site.split('#')[0]
  const server = normalizeServer(link.server) ?? DEFAULT_SERVER
  const query = server === DEFAULT_SERVER ? '' : '?server=' + encodeURIComponent(server)
  return `${base}#/join/${link.roomId}/${link.invite}${query}`
}

// Разбор ссылки целиком или только её хеша («#/join/…»); не ссылка-приглашение — null
export function parseInviteLink(text: string): InviteLink | null {
  const at = text.indexOf('#')
  if (at < 0) return null
  const match = /^#\/join\/([^/?]+)\/([^/?]+)(?:\?(.*))?$/.exec(text.slice(at).trim())
  if (!match) return null
  const [, roomId, invite, query] = match
  if (!ROOM_ID.test(roomId) || !TOKEN.test(invite)) return null
  const given = new URLSearchParams(query ?? '').get('server')
  if (given === null) return { roomId, invite, server: DEFAULT_SERVER }
  const server = normalizeServer(given)
  return server ? { roomId, invite, server } : null
}
