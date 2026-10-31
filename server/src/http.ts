// Ответы Worker'а без привязки к Cloudflare: их же отдаст запасная обёртка на Node (Р-02)
import { PROTOCOL_VERSION, type Health } from '../../src/rules/protocol'

// Сайт живёт на другом адресе (GitHub Pages) — браузеру нужно разрешение
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export const STATUS_TEXT = 'Сервер комнат ТоргСина работает. Протокол ' + PROTOCOL_VERSION + '.'

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
