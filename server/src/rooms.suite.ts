// Тесты сервера комнат на любом хранилище (Р-02): одни и те же — на Cloudflare-подделке
// (rooms.test.ts) и на SQLite запасной обёртки (server/node/rooms.test.ts)
import { afterEach, describe, expect, it } from 'vitest'
import { isHealth, PROTOCOL_VERSION, type CreateRoomResponse, type RoomStateResponse } from '../../src/rules/protocol'
import { BAD_CURRENCY, LONG_MEMBER_NAME, LONG_ROOM_NAME, NEED_MEMBER_NAME, NEED_ROOM_NAME } from '../../src/rules/room'
import { ulid } from '../../src/rules/ulid'
import { BAD_REQUEST_ID, CREATION_OFF, NEED_KEY, WRONG_PASSWORD } from './http'
import { hashKey } from './keys'
import { append, APPEND_ONLY, NO_ROOM, readLog, REQUEST_TAKEN, WRONG_KEY, type RoomStorage } from './room'
import type { TestServer } from './testing'

const PASSWORD = 'пароль-компании'
const FORM = { v: PROTOCOL_VERSION, password: PASSWORD, name: 'Дача', currency: 'RUB', hostName: 'Аня' }

export function roomsSuite(storageName: string, start: (password: string | undefined) => Promise<TestServer>): void {
  describe(`сервер комнат, хранилище «${storageName}»`, () => {
    const started: TestServer[] = []
    afterEach(async () => {
      for (const s of started.splice(0)) await s.close()
    })

    // Без аргумента — пароль компании задан; server(undefined) — не задан
    async function server(...password: [string | undefined] | []): Promise<TestServer> {
      const s = await start(password.length ? password[0] : PASSWORD)
      started.push(s)
      return s
    }

    function post(s: TestServer, body: unknown): Promise<Response> {
      return s.send('/rooms', { method: 'POST', body: JSON.stringify(body) })
    }

    function get(s: TestServer, roomId: string, key?: string): Promise<Response> {
      const headers: Record<string, string> = key === undefined ? {} : { Authorization: 'Bearer ' + key }
      return s.send('/rooms/' + roomId, { headers })
    }

    async function create(s: TestServer, body: unknown = FORM): Promise<CreateRoomResponse> {
      const r = await post(s, body)
      expect(r.status).toBe(200)
      return (await r.json()) as CreateRoomResponse
    }

    // Записи журнала: ключ → значение JSON-строкой (сравнить «до» и «после»)
    async function logSnapshot(storage: RoomStorage): Promise<Map<string, string>> {
      const log = await storage.list({ prefix: 'log:' })
      return new Map([...log].map(([k, v]) => [k, JSON.stringify(v)]))
    }

    describe('общие адреса', () => {
      it('GET /health — жив, протокол и время сервера', async () => {
        const s = await server()
        const r = await s.send('/health')
        expect(r.status).toBe(200)
        expect(r.headers.get('Access-Control-Allow-Origin')).toBe('*')
        const body: unknown = await r.json()
        expect(isHealth(body)).toBe(true)
        expect(body).toEqual({ v: PROTOCOL_VERSION, ok: true, time: s.clock.now })
      })

      it('GET / — текст для человека; OPTIONS — разрешение браузеру', async () => {
        const s = await server()
        expect(await (await s.send('/')).text()).toContain('ТоргСина')
        const options = await s.send('/rooms', { method: 'OPTIONS' })
        expect(options.status).toBe(204)
        expect(options.headers.get('Access-Control-Allow-Methods')).toContain('POST')
      })

      it('чужой адрес — 404 с версией протокола', async () => {
        const s = await server()
        for (const r of [await s.send('/nope'), await s.send('/health', { method: 'POST' })]) {
          expect(r.status).toBe(404)
          expect(((await r.json()) as { v: number }).v).toBe(PROTOCOL_VERSION)
        }
      })
    })

    describe('POST /rooms', () => {
      it('верный пароль — комната: номер, приглашение, номер ведущего, ключ', async () => {
        const s = await server()
        const r = await post(s, FORM)
        expect(r.status).toBe(200)
        expect(r.headers.get('Access-Control-Allow-Origin')).toBe('*')
        const body = (await r.json()) as CreateRoomResponse
        expect(body.v).toBe(PROTOCOL_VERSION)
        expect(body.roomId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
        expect(body.invite.length).toBeGreaterThanOrEqual(20)
        expect(body.memberId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
        expect(body.key.length).toBeGreaterThanOrEqual(40)
        expect(s.roomIds()).toEqual([body.roomId])
      })

      it('неверный или пустой пароль — 403, комната не создаётся', async () => {
        const s = await server()
        for (const password of ['не тот', '', undefined]) {
          const r = await post(s, { ...FORM, password })
          expect(r.status).toBe(403)
          expect(await r.json()).toEqual({ v: PROTOCOL_VERSION, error: WRONG_PASSWORD })
        }
        expect(s.roomIds()).toEqual([])
      })

      it('пароль на сервере не задан — 503, комната не создаётся', async () => {
        for (const password of [undefined, '']) {
          const s = await server(password)
          const r = await post(s, { ...FORM, password: '' })
          expect(r.status).toBe(503)
          expect(await r.json()).toEqual({ v: PROTOCOL_VERSION, error: CREATION_OFF })
          expect(s.roomIds()).toEqual([])
        }
      })

      it('форма с ошибкой — 400 с понятным текстом, комната не создаётся', async () => {
        const s = await server()
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
          const r = await post(s, { ...FORM, ...change })
          expect(r.status).toBe(400)
          expect(await r.json()).toEqual({ v: PROTOCOL_VERSION, error })
        }
        expect((await post(s, null)).status).toBe(400)
        expect((await s.send('/rooms', { method: 'POST', body: 'не JSON' })).status).toBe(400)
        expect((await post(s, { ...FORM, v: PROTOCOL_VERSION + 1 })).status).toBe(400)
        expect(s.roomIds()).toEqual([])
      })

      it('тот же запрос дважды (тот же номер запроса) — одна комната, тот же ответ', async () => {
        const s = await server()
        const form = { ...FORM, requestId: ulid(s.clock.now) }
        const first = await create(s, form)
        const log = await readLog(s.storage(first.roomId))
        s.clock.now += 1500
        const second = await create(s, form)
        expect(second).toEqual(first)
        expect(s.roomIds()).toEqual([first.roomId])
        expect(await readLog(s.storage(first.roomId))).toEqual(log)
        // Ключ из повтора — рабочий
        expect((await get(s, first.roomId, second.key)).status).toBe(200)
      })

      it('два одинаковых запроса одновременно — одна комната, один журнал', async () => {
        const s = await server()
        const form = { ...FORM, requestId: ulid(s.clock.now) }
        const [a, b] = await Promise.all([post(s, form), post(s, form)])
        expect([a.status, b.status]).toEqual([200, 200])
        const first = (await a.json()) as CreateRoomResponse
        expect(await b.json()).toEqual(first)
        expect(s.roomIds()).toEqual([first.roomId])
        expect((await readLog(s.storage(first.roomId))).map((e) => e.type)).toEqual(['room.created', 'member.added'])
      })

      it('тот же номер запроса с другой формой — отказ, комната прежняя', async () => {
        const s = await server()
        const requestId = ulid(s.clock.now)
        const first = await create(s, { ...FORM, requestId })
        const r = await post(s, { ...FORM, requestId, name: 'Другая' })
        expect(r.status).toBe(409)
        expect(await r.json()).toEqual({ v: PROTOCOL_VERSION, error: REQUEST_TAKEN })
        const state = (await (await get(s, first.roomId, first.key)).json()) as RoomStateResponse
        expect(state.room.name).toBe('Дача')
        expect(s.roomIds()).toEqual([first.roomId])
      })

      it('разные запросы — разные комнаты и ключи', async () => {
        const s = await server()
        const a = await create(s)
        const b = await create(s)
        expect(a.roomId).not.toBe(b.roomId)
        expect(a.key).not.toBe(b.key)
        expect((await get(s, b.roomId, a.key)).status).toBe(403)
      })

      it('ключ телефона в хранилище — только хешем', async () => {
        const s = await server()
        const form = { ...FORM, requestId: ulid() }
        const { roomId, key } = await create(s, form)
        const everything = JSON.stringify([...(await s.storage(roomId).list({ prefix: '' }))])
        expect(everything).not.toContain(key)
        expect(everything).not.toContain(form.requestId)
        expect(everything).toContain(await hashKey(key))
      })
    })

    describe('GET /rooms/<номер>', () => {
      it('с ключом участника — состояние комнаты', async () => {
        const s = await server()
        const created = await create(s)
        const r = await get(s, created.roomId, created.key)
        expect(r.status).toBe(200)
        expect(await r.json()).toEqual({
          v: PROTOCOL_VERSION,
          room: { id: created.roomId, name: 'Дача', currency: 'RUB', hostId: created.memberId, createdAt: s.clock.now },
          members: [{ id: created.memberId, name: 'Аня' }],
          me: created.memberId,
        })
      })

      it('без ключа или с чужим ключом — 403', async () => {
        const s = await server()
        const { roomId } = await create(s)
        const none = await get(s, roomId)
        expect(none.status).toBe(403)
        expect(await none.json()).toEqual({ v: PROTOCOL_VERSION, error: NEED_KEY })
        const wrong = await get(s, roomId, 'someone-elses-key')
        expect(wrong.status).toBe(403)
        expect(await wrong.json()).toEqual({ v: PROTOCOL_VERSION, error: WRONG_KEY })
      })

      it('нет такой комнаты — 404', async () => {
        const s = await server()
        const { key } = await create(s)
        for (const roomId of [ulid(), 'не-номер']) {
          const r = await get(s, roomId, key)
          expect(r.status).toBe(404)
          expect(await r.json()).toEqual({ v: PROTOCOL_VERSION, error: NO_ROOM })
        }
      })
    })

    describe('журнал комнаты только дописывается', () => {
      it('после нескольких действий прежние записи на месте и не изменились', async () => {
        const s = await server()
        const form = { ...FORM, requestId: ulid(s.clock.now) }
        const { roomId, memberId } = await create(s, form)
        const storage = s.storage(roomId)
        const before = await logSnapshot(storage)
        expect(before.size).toBe(2)

        // Действия: повтор создания, вход двух участников, чтение состояния
        await create(s, form)
        s.clock.now += 1000
        await append(storage, [{ id: ulid(s.clock.now), at: s.clock.now, memberId, type: 'member.added', member: 'M2', name: 'Боря' }])
        s.clock.now += 1000
        await append(storage, [{ id: ulid(s.clock.now), at: s.clock.now, memberId, type: 'member.added', member: 'M3', name: 'Вера' }])
        await get(s, roomId, (await create(s, form)).key)

        const after = await logSnapshot(storage)
        expect(after.size).toBe(4)
        for (const [k, v] of before) expect(after.get(k)).toBe(v)
        // Ни одна запись журнала не писалась дважды
        const logPuts = s.puts(roomId).filter((k) => k.startsWith('log:'))
        expect(logPuts.length).toBe(4)
        expect(new Set(logPuts).size).toBe(logPuts.length)
        const state = (await (await get(s, roomId, (await create(s, form)).key)).json()) as RoomStateResponse
        expect(state.members.map((m) => m.name)).toEqual(['Аня', 'Боря', 'Вера'])
      })

      it('занятый номер записи не перезаписывается', async () => {
        const s = await server()
        const storage = s.storage(ulid(s.clock.now))
        const old = { id: 'E1', at: 1, memberId: 'M1', type: 'member.added', member: 'M1', name: 'Аня' } as const
        await storage.put('log:00000002', old)
        await expect(append(storage, [{ ...old, id: 'E2', name: 'Чужая' }])).rejects.toThrow(APPEND_ONLY)
        expect(await storage.get('log:00000002')).toEqual(old)
      })
    })
  })
}
