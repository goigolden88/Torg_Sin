import { describe, expect, it } from 'vitest'
import { isHealth, PROTOCOL_VERSION } from '../../src/rules/protocol'
import { notFound, route } from './http'

describe('route', () => {
  it('GET /health — жив, протокол и время сервера', async () => {
    const r = route('GET', '/health', 1234)!
    expect(r.status).toBe(200)
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('*')
    const body: unknown = await r.json()
    expect(isHealth(body)).toBe(true)
    expect(body).toEqual({ v: PROTOCOL_VERSION, ok: true, time: 1234 })
  })
  it('GET / — текст для человека', async () => {
    const r = route('GET', '/', 0)!
    expect(await r.text()).toContain('ТоргСина')
  })
  it('OPTIONS — разрешение браузеру', () => {
    expect(route('OPTIONS', '/rooms', 0)!.status).toBe(204)
  })
  it('чужой адрес — не наш', () => {
    expect(route('GET', '/nope', 0)).toBeNull()
    expect(route('POST', '/health', 0)).toBeNull()
    expect(notFound().status).toBe(404)
  })
})
