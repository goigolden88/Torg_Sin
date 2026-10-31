import { describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION, type CreateRoomResponse, type RoomStateResponse } from '../../src/rules/protocol'
import { BAD_CURRENCY, LONG_MEMBER_NAME, LONG_ROOM_NAME, NEED_MEMBER_NAME, NEED_ROOM_NAME } from '../../src/rules/room'
import { ulid } from '../../src/rules/ulid'
import { BAD_REQUEST_ID, CREATION_OFF, handle, NEED_KEY, WRONG_PASSWORD, type RoomsDeps } from './http'
import { hashKey } from './keys'
import { append, APPEND_ONLY, NO_ROOM, readLog, REQUEST_TAKEN, WRONG_KEY } from './room'
import { FakeStorage, fakeServer } from './testing'

const PASSWORD = 'пароль-компании'
const FORM = { v: PROTOCOL_VERSION, password: PASSWORD, name: 'Дача', currency: 'RUB', hostName: 'Аня' }

function post(deps: RoomsDeps, body: unknown): Promise<Response> {
  return handle(new Request('https://x/rooms', { method: 'POST', body: JSON.stringify(body) }), deps)
}

function get(deps: RoomsDeps, roomId: string, key?: string): Promise<Response> {
  const headers: Record<string, string> = key === undefined ? {} : { Authorization: 'Bearer ' + key }
  return handle(new Request('https://x/rooms/' + roomId, { headers }), deps)
}

async function create(deps: RoomsDeps, body: unknown = FORM): Promise<CreateRoomResponse> {
  const r = await post(deps, body)
  expect(r.status).toBe(200)
  return (await r.json()) as CreateRoomResponse
}

describe('POST /rooms', () => {
  it('верный пароль — комната: номер, приглашение, номер ведущего, ключ', async () => {
    const { deps, rooms } = fakeServer(PASSWORD)
    const r = await post(deps, FORM)
    expect(r.status).toBe(200)
    expect(r.headers.get('Access-Control-Allow-Origin')).toBe('*')
    const body = (await r.json()) as CreateRoomResponse
    expect(body.v).toBe(PROTOCOL_VERSION)
    expect(body.roomId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(body.invite.length).toBeGreaterThanOrEqual(20)
    expect(body.memberId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(body.key.length).toBeGreaterThanOrEqual(40)
    expect([...rooms.keys()]).toEqual([body.roomId])
  })

  it('неверный или пустой пароль — 403, комната не создаётся', async () => {
    const { deps, rooms } = fakeServer(PASSWORD)
    for (const password of ['не тот', '', undefined]) {
      const r = await post(deps, { ...FORM, password })
      expect(r.status).toBe(403)
      expect(await r.json()).toEqual({ v: PROTOCOL_VERSION, error: WRONG_PASSWORD })
    }
    expect(rooms.size).toBe(0)
  })

  it('пароль на сервере не задан — 503, комната не создаётся', async () => {
    for (const password of [undefined, '']) {
      const { deps, rooms } = fakeServer(password)
      const r = await post(deps, { ...FORM, password: '' })
      expect(r.status).toBe(503)
      expect(await r.json()).toEqual({ v: PROTOCOL_VERSION, error: CREATION_OFF })
      expect(rooms.size).toBe(0)
    }
  })

  it('форма с ошибкой — 400 с понятным текстом, комната не создаётся', async () => {
    const { deps, rooms } = fakeServer(PASSWORD)
    const cases: [Record<string, unknown>, string][] = [
      [{ currency: 'GBP' }, BAD_CURRENCY],
      [{ currency: undefined }, BAD_CURRENCY],
      [{ name: ' ' }, NEED_ROOM_NAME],
      [{ name: 'а'.repeat(61) }, LONG_ROOM_NAME],
      [{ hostName: '' }, NEED_MEMBER_NAME],
      [{ hostName: 'а'.repeat(31) }, LONG_MEMBER_NAME],
      [{ requestId: 'abc' }, BAD_REQUEST_ID],
    ]
    for (const [change, error] of cases) {
      const r = await post(deps, { ...FORM, ...change })
      expect(r.status).toBe(400)
      expect(await r.json()).toEqual({ v: PROTOCOL_VERSION, error })
    }
    expect((await post(deps, null)).status).toBe(400)
    expect((await post(deps, { ...FORM, v: PROTOCOL_VERSION + 1 })).status).toBe(400)
    expect(rooms.size).toBe(0)
  })

  it('тот же запрос дважды (тот же номер запроса) — одна комната, тот же ответ', async () => {
    const { deps, rooms, clock } = fakeServer(PASSWORD)
    const form = { ...FORM, requestId: ulid(clock.now) }
    const first = await create(deps, form)
    const log = await readLog(rooms.get(first.roomId)!)
    clock.now += 1500
    const second = await create(deps, form)
    expect(second).toEqual(first)
    expect(rooms.size).toBe(1)
    expect(await readLog(rooms.get(first.roomId)!)).toEqual(log)
    // Ключ из повтора — рабочий
    expect((await get(deps, first.roomId, second.key)).status).toBe(200)
  })

  it('тот же номер запроса с другой формой — отказ, комната прежняя', async () => {
    const { deps, rooms, clock } = fakeServer(PASSWORD)
    const requestId = ulid(clock.now)
    const first = await create(deps, { ...FORM, requestId })
    const r = await post(deps, { ...FORM, requestId, name: 'Другая' })
    expect(r.status).toBe(409)
    expect(await r.json()).toEqual({ v: PROTOCOL_VERSION, error: REQUEST_TAKEN })
    const state = (await (await get(deps, first.roomId, first.key)).json()) as RoomStateResponse
    expect(state.room.name).toBe('Дача')
    expect(rooms.size).toBe(1)
  })

  it('разные запросы — разные комнаты и ключи', async () => {
    const { deps } = fakeServer(PASSWORD)
    const a = await create(deps)
    const b = await create(deps)
    expect(a.roomId).not.toBe(b.roomId)
    expect(a.key).not.toBe(b.key)
    expect((await get(deps, b.roomId, a.key)).status).toBe(403)
  })

  it('ключ телефона в хранилище — только хешем', async () => {
    const { deps, rooms } = fakeServer(PASSWORD)
    const form = { ...FORM, requestId: ulid() }
    const { roomId, key } = await create(deps, form)
    const storage = rooms.get(roomId)!
    const everything = [...storage.data].flat().join('\n')
    expect(everything).not.toContain(key)
    expect(everything).not.toContain(form.requestId)
    expect(everything).toContain(await hashKey(key))
  })
})

describe('GET /rooms/<номер>', () => {
  it('с ключом участника — состояние комнаты', async () => {
    const { deps, clock } = fakeServer(PASSWORD)
    const created = await create(deps)
    const r = await get(deps, created.roomId, created.key)
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({
      v: PROTOCOL_VERSION,
      room: { id: created.roomId, name: 'Дача', currency: 'RUB', hostId: created.memberId, createdAt: clock.now },
      members: [{ id: created.memberId, name: 'Аня' }],
      me: created.memberId,
    })
  })

  it('без ключа или с чужим ключом — 403', async () => {
    const { deps } = fakeServer(PASSWORD)
    const { roomId } = await create(deps)
    const none = await get(deps, roomId)
    expect(none.status).toBe(403)
    expect(await none.json()).toEqual({ v: PROTOCOL_VERSION, error: NEED_KEY })
    const wrong = await get(deps, roomId, 'someone-elses-key')
    expect(wrong.status).toBe(403)
    expect(await wrong.json()).toEqual({ v: PROTOCOL_VERSION, error: WRONG_KEY })
  })

  it('нет такой комнаты — 404', async () => {
    const { deps } = fakeServer(PASSWORD)
    const { key } = await create(deps)
    for (const roomId of [ulid(), 'не-номер']) {
      const r = await get(deps, roomId, key)
      expect(r.status).toBe(404)
      expect(await r.json()).toEqual({ v: PROTOCOL_VERSION, error: NO_ROOM })
    }
  })
})

describe('журнал комнаты только дописывается', () => {
  it('после нескольких действий прежние записи на месте и не изменились', async () => {
    const { deps, rooms, clock } = fakeServer(PASSWORD)
    const form = { ...FORM, requestId: ulid(clock.now) }
    const { roomId, memberId } = await create(deps, form)
    const storage = rooms.get(roomId)!
    const snapshot = () => new Map([...storage.data].filter(([k]) => k.startsWith('log:')))
    const before = snapshot()
    expect(before.size).toBe(2)

    // Действия: повтор создания, вход двух участников, чтение состояния
    await create(deps, form)
    clock.now += 1000
    await append(storage, [{ id: ulid(clock.now), at: clock.now, memberId, type: 'member.added', member: 'M2', name: 'Боря' }])
    clock.now += 1000
    await append(storage, [{ id: ulid(clock.now), at: clock.now, memberId, type: 'member.added', member: 'M3', name: 'Вера' }])
    await get(deps, roomId, (await create(deps, form)).key)

    const after = snapshot()
    expect(after.size).toBe(4)
    for (const [k, v] of before) expect(after.get(k)).toBe(v)
    // Ни одна запись журнала не писалась дважды
    const logPuts = storage.puts.filter((k) => k.startsWith('log:'))
    expect(new Set(logPuts).size).toBe(logPuts.length)
    const state = (await (await get(deps, roomId, (await create(deps, form)).key)).json()) as RoomStateResponse
    expect(state.members.map((m) => m.name)).toEqual(['Аня', 'Боря', 'Вера'])
  })

  it('занятый номер записи не перезаписывается', async () => {
    const storage = new FakeStorage()
    const old = { id: 'E1', at: 1, memberId: 'M1', type: 'member.added', member: 'M1', name: 'Аня' } as const
    await storage.put('log:00000002', old)
    await expect(append(storage, [{ ...old, id: 'E2', name: 'Чужая' }])).rejects.toThrow(APPEND_ONLY)
    expect(await storage.get('log:00000002')).toEqual(old)
  })
})
