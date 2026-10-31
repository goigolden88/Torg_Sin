// Ключи и номера сервера: Web Crypto есть и в Cloudflare, и в Node — привязки нет.
//
// Повтор создания комнаты (двойное нажатие) должен дать тот же ответ, а ключ телефона в
// открытом виде не хранится. Поэтому номер комнаты и ключ ведущего не случайны, а выводятся
// из номера запроса телефона (ULID) и пароля компании (HMAC): тот же запрос — те же номер и
// ключ; на сервере — только хеш ключа, номера запроса нет нигде
const encoder = new TextEncoder()
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/

// Хеш ключа телефона — то, что лежит в хранилище
export async function hashKey(key: string): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(key))))
}

// Номер комнаты (ULID: время из номера запроса + 16 знаков HMAC) и ключ ведущего
export async function deriveCreation(requestId: string, secret: string): Promise<{ roomId: string; key: string }> {
  const room = await hmac(secret, 'room:' + requestId)
  let random = ''
  for (let i = 0; i < 16; i++) random += CROCKFORD[room[i] % 32]
  return { roomId: requestId.slice(0, 10) + random, key: base64url(await hmac(secret, 'key:' + requestId)) }
}

// Случайный токен (приглашение): 16 байт, base64url
export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(16)))
}

async function hmac(secret: string, text: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(text)))
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
