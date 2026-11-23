import { describe, expect, it } from 'vitest'
import { BAD_LOT_VERDICT } from '../../src/rules/appeal'
import { BAD_LOT_BID, BAD_LOT_START } from '../../src/rules/lot'
import { BAD_BID, BAD_START } from '../../src/rules/offer'
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

describe('торг (Р-37): POST …/offers/<пари>/bid и …/bid/accept', () => {
  const roomId = ulid(0)
  const offerId = ulid(1)
  const request = (action: string, body?: unknown) =>
    new Request(`https://x/rooms/${roomId}/offers/${offerId}/${action}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer phone-key' },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })

  it('встречное: кривая сумма — 400 до комнаты; годная — действие bidOffer', async () => {
    const { deps, actions } = fakeRooms()
    for (const amount of [0, -1, 2.5, '100', null]) {
      const r = await handle(request('bid', { v: PROTOCOL_VERSION, amount }), deps)
      expect(r.status).toBe(400)
      expect(await r.json()).toEqual({ v: PROTOCOL_VERSION, error: BAD_BID })
    }
    expect(actions).toEqual([])
    await handle(request('bid', { v: PROTOCOL_VERSION, amount: 150 }), deps)
    expect(actions).toEqual([{ type: 'bidOffer', keyHash: expect.any(String), offer: offerId, amount: 150, requestId: expect.any(String) }])
  })

  it('«принять сейчас»: тело не нужно — действие takeBid', async () => {
    const { deps, actions } = fakeRooms()
    await handle(request('bid/accept'), deps)
    expect(actions).toEqual([{ type: 'takeBid', keyHash: expect.any(String), offer: offerId, requestId: expect.any(String) }])
  })

  it('пари в торге: auction доходит до проверки формы — кривой старт 400 до комнаты', async () => {
    const { deps, actions } = fakeRooms()
    const body = { v: PROTOCOL_VERSION, condition: 'Вася бросит курить', check: 'Скажет сам', amount: 300, closesAt: 10 ** 6, expectedAt: 10 ** 7, auction: { start: 0 } }
    const r = await handle(new Request(`https://x/rooms/${roomId}/offers`, { method: 'POST', headers: { Authorization: 'Bearer phone-key' }, body: JSON.stringify(body) }), deps)
    expect(r.status).toBe(400)
    expect(await r.json()).toEqual({ v: PROTOCOL_VERSION, error: BAD_START })
    expect(actions).toEqual([])
  })
})

describe('лот (Р-38): POST …/lots и …/lots/<лот>/<действие>', () => {
  const roomId = ulid(0)
  const lotId = ulid(1)
  const request = (path: string, body?: unknown) =>
    new Request(`https://x/rooms/${roomId}/${path}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer phone-key' },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })

  it('форма лота — до комнаты: кривой старт 400 с текстом правил; годная — createLot, шаг — 10 % старта', async () => {
    const { deps, actions } = fakeRooms()
    const r = await handle(request('lots', { v: PROTOCOL_VERSION, title: 'Велосипед', start: 0, closesAt: 10 ** 7 }), deps)
    expect(r.status).toBe(400)
    expect(await r.json()).toEqual({ v: PROTOCOL_VERSION, error: BAD_LOT_START })
    expect(actions).toEqual([])
    await handle(request('lots', { v: PROTOCOL_VERSION, title: ' Велосипед ', start: 1000, closesAt: 10 ** 7 }), deps)
    expect(actions).toEqual([
      { type: 'createLot', keyHash: expect.any(String), input: { title: 'Велосипед', description: '', start: 1000, step: 100, closesAt: 10 ** 7 }, requestId: expect.any(String) },
    ])
  })

  it('ставка: кривая сумма — 400 до комнаты; годная — bidLot', async () => {
    const { deps, actions } = fakeRooms()
    for (const amount of [0, -1, 2.5, '100', null]) {
      const r = await handle(request(`lots/${lotId}/bid`, { v: PROTOCOL_VERSION, amount }), deps)
      expect(r.status).toBe(400)
      expect(await r.json()).toEqual({ v: PROTOCOL_VERSION, error: BAD_LOT_BID })
    }
    expect(actions).toEqual([])
    await handle(request(`lots/${lotId}/bid`, { v: PROTOCOL_VERSION, amount: 1500 }), deps)
    expect(actions).toEqual([{ type: 'bidLot', keyHash: expect.any(String), lot: lotId, amount: 1500, requestId: expect.any(String) }])
  })

  it('отметки — без тела: адрес → отметка; суд — judge с голосом лота; апелляции у лота нет', async () => {
    const { deps, actions } = fakeRooms()
    for (const path of ['withdraw', 'handed', 'cannot', 'received', 'not-received']) await handle(request(`lots/${lotId}/${path}`), deps)
    expect(actions.map((a) => (a.type === 'markLot' ? a.mark : a.type))).toEqual(['withdrawn', 'handed', 'declined', 'received', 'disputed'])
    const bad = await handle(request(`lots/${lotId}/judge`, { v: PROTOCOL_VERSION, verdict: 'keep' }), deps)
    expect(bad.status).toBe(400)
    expect(await bad.json()).toEqual({ v: PROTOCOL_VERSION, error: BAD_LOT_VERDICT })
    await handle(request(`lots/${lotId}/judge`, { v: PROTOCOL_VERSION, verdict: 'delivered' }), deps)
    expect(actions.at(-1)).toEqual({ type: 'judgeCourt', keyHash: expect.any(String), kind: 'lot', target: lotId, vote: { verdict: 'delivered' }, requestId: expect.any(String) })
    expect((await handle(request(`lots/${lotId}/appeal`, { v: PROTOCOL_VERSION, reason: 'Хочу' }), deps)).status).toBe(404)
    expect(actions).toHaveLength(6)
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
