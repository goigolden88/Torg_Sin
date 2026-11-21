import { describe, expect, it } from 'vitest'
import { BAD_PACE, FAST_TIMES } from '../../src/rules/pace'
import { isHealth, PROTOCOL_VERSION } from '../../src/rules/protocol'
import { ulid } from '../../src/rules/ulid'
import { handle, notFound, route, type RoomsDeps } from './http'
import type { RoomAction } from './room'

// Комнаты-подделка: запоминает действия, отвечает сменой темпа
function fakeRooms(): { deps: RoomsDeps; actions: RoomAction[] } {
  const actions: RoomAction[] = []
  const unused = () => Promise.reject(new Error('не нужно'))
  const deps: RoomsDeps = {
    password: 'пароль',
    now: () => 1000,
    create: unused,
    state: unused,
    backup: unused,
    restore: unused,
    roomIds: unused,
    act: (async (_roomId: string, action: RoomAction) => {
      actions.push(action)
      return { ok: true, value: { pace: { id: 'E1', at: 1000, by: 'M1', pace: 'fast', times: FAST_TIMES } } }
    }) as RoomsDeps['act'],
  }
  return { deps, actions }
}

describe('POST /rooms/<номер>/pace (Р-35)', () => {
  const roomId = ulid(0)
  const request = (body: unknown, method = 'POST') =>
    new Request(`https://x/rooms/${roomId}/pace`, { method, headers: { Authorization: 'Bearer phone-key' }, ...(method === 'POST' && { body: JSON.stringify(body) }) })

  it('форма темпа — до комнаты: кривой темп — 400 с текстом правил, комната не трогается', async () => {
    const { deps, actions } = fakeRooms()
    const r = await handle(request({ v: PROTOCOL_VERSION, pace: 'slow' }), deps)
    expect(r.status).toBe(400)
    expect(await r.json()).toEqual({ v: PROTOCOL_VERSION, error: BAD_PACE })
    expect(actions).toEqual([])
  })

  it('годный темп — действие комнаты setPace с проверенной формой; GET — нет такого адреса', async () => {
    const { deps, actions } = fakeRooms()
    const r = await handle(request({ v: PROTOCOL_VERSION, pace: 'fast', times: null }), deps)
    expect(r.status).toBe(200)
    expect(actions).toEqual([{ type: 'setPace', keyHash: expect.any(String), pace: { pace: 'fast' }, requestId: expect.any(String) }])
    expect((await handle(request(undefined, 'GET'), deps)).status).toBe(404)
  })
})

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
