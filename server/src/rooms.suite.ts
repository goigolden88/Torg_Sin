// Тесты сервера комнат на любом хранилище (Р-02): одни и те же — на Cloudflare-подделке
// (rooms.test.ts) и на SQLite запасной обёртки (server/node/rooms.test.ts)
import { afterEach, describe, expect, it } from 'vitest'
import {
  isHealth,
  PROTOCOL_VERSION,
  type ClaimDeviceResponse,
  type CreateRoomResponse,
  type DeviceLinkResponse,
  type InviteResponse,
  type JoinRequestsResponse,
  type JoinRoomResponse,
  type RoomStateResponse,
} from '../../src/rules/protocol'
import { BAD_CURRENCY, LONG_MEMBER_NAME, LONG_ROOM_NAME, NAME_TAKEN, NEED_MEMBER_NAME, NEED_ROOM_NAME } from '../../src/rules/room'
import { ulid } from '../../src/rules/ulid'
import { BAD_REQUEST_ID, CREATION_OFF, NEED_KEY, WRONG_PASSWORD } from './http'
import { hashKey } from './keys'
import {
  ALREADY_ADMITTED,
  ALREADY_REJECTED,
  append,
  APPEND_ONLY,
  BAD_DEVICE_LINK,
  BAD_LINK,
  DEVICE_LINK_TTL,
  HOST_ONLY,
  JOIN_TAKEN,
  NO_MEMBER,
  NO_REQUEST,
  NO_ROOM,
  readLog,
  REJECTED,
  REQUEST_TAKEN,
  WAITING,
  WRONG_KEY,
  type RoomStorage,
} from './room'
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

    describe('вход по ссылке (Р-03)', () => {
      // Действие комнаты: POST с телом (или GET без него) и ключом телефона, если он есть
      function send(s: TestServer, roomId: string, action: string, body?: unknown, key?: string): Promise<Response> {
        const headers: Record<string, string> = key === undefined ? {} : { Authorization: 'Bearer ' + key }
        const init: RequestInit = body === undefined ? { headers } : { method: 'POST', headers, body: JSON.stringify(body) }
        return s.send(`/rooms/${roomId}/${action}`, init)
      }

      async function ok<T>(r: Promise<Response>): Promise<T> {
        const res = await r
        const body: unknown = await res.json()
        expect({ status: res.status, body }).toMatchObject({ status: 200 })
        return body as T
      }

      async function refused(r: Promise<Response>, status: number, error: string, join?: string): Promise<void> {
        const res = await r
        expect(res.status).toBe(status)
        expect(await res.json()).toEqual(join ? { v: PROTOCOL_VERSION, error, join } : { v: PROTOCOL_VERSION, error })
      }

      function join(s: TestServer, room: CreateRoomResponse, name: string, requestId?: string): Promise<JoinRoomResponse> {
        return ok<JoinRoomResponse>(send(s, room.roomId, 'join', { v: PROTOCOL_VERSION, invite: room.invite, name, requestId }))
      }

      // Подал заявку и впущен ведущим
      async function member(s: TestServer, room: CreateRoomResponse, name: string): Promise<JoinRoomResponse> {
        const j = await join(s, room, name)
        await ok(send(s, room.roomId, 'admit', { request: j.memberId }, room.key))
        return j
      }

      async function members(s: TestServer, roomId: string, key: string): Promise<string[]> {
        return (await ok<RoomStateResponse>(get(s, roomId, key))).members.map((m) => m.name)
      }

      it('по ссылке видно только название комнаты и имя ведущего', async () => {
        const s = await server()
        const room = await create(s)
        expect(await ok(send(s, room.roomId, 'preview', { invite: room.invite }))).toEqual({
          v: PROTOCOL_VERSION,
          name: 'Дача',
          hostName: 'Аня',
        })
      })

      it('неверная ссылка — 403 «Ссылка недействительна»', async () => {
        const s = await server()
        const room = await create(s)
        for (const body of [{ invite: 'не-тот' }, { invite: '' }, {}]) {
          await refused(send(s, room.roomId, 'preview', body), 403, BAD_LINK)
          await refused(send(s, room.roomId, 'join', { ...body, name: 'Боря' }), 403, BAD_LINK)
        }
        // Чужая комната, нет комнаты, кривой номер
        const other = await create(s)
        for (const roomId of [other.roomId, ulid(), 'не-номер']) {
          await refused(send(s, roomId, 'preview', { invite: room.invite }), 403, BAD_LINK)
        }
        expect(BAD_LINK).toBe('Ссылка недействительна — попросите новую у ведущего')
      })

      it('заявка — ключ, который пока не открывает комнату: «ждём, пока ведущий впустит»', async () => {
        const s = await server()
        const room = await create(s)
        const j = await join(s, room, ' Боря ')
        expect(j).toEqual({ v: PROTOCOL_VERSION, memberId: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{26}$/), key: expect.any(String), join: 'waiting' })
        expect(j.key.length).toBeGreaterThanOrEqual(40)
        await refused(get(s, room.roomId, j.key), 403, WAITING, 'waiting')
        expect(WAITING).toBe('Ждём, пока ведущий впустит')
        // Ни в списке участников, ни ведущему не мешает
        expect(await members(s, room.roomId, room.key)).toEqual(['Аня'])
      })

      it('форма заявки с ошибкой — 400', async () => {
        const s = await server()
        const room = await create(s)
        const cases: [Record<string, unknown>, string][] = [
          [{ name: '' }, NEED_MEMBER_NAME],
          [{ name: 'я'.repeat(31) }, LONG_MEMBER_NAME],
          [{ name: 'Боря', requestId: 'abc' }, BAD_REQUEST_ID],
        ]
        for (const [change, error] of cases) await refused(send(s, room.roomId, 'join', { invite: room.invite, ...change }), 400, error)
        expect((await send(s, room.roomId, 'join', { invite: room.invite, name: 'Боря', v: PROTOCOL_VERSION + 1 })).status).toBe(400)
      })

      it('ведущий впустил — ключ открывает комнату, участник в списке', async () => {
        const s = await server()
        const room = await create(s)
        const j = await join(s, room, 'Боря')
        expect(await ok(send(s, room.roomId, 'admit', { request: j.memberId }, room.key))).toEqual({
          v: PROTOCOL_VERSION,
          member: { id: j.memberId, name: 'Боря' },
        })
        const state = await ok<RoomStateResponse>(get(s, room.roomId, j.key))
        expect(state.me).toBe(j.memberId)
        expect(state.members).toEqual([
          { id: room.memberId, name: 'Аня' },
          { id: j.memberId, name: 'Боря' },
        ])
        // Повтор — тот же ответ, без новой записи; отклонить впущенного нельзя
        const log = await readLog(s.storage(room.roomId))
        await ok(send(s, room.roomId, 'admit', { request: j.memberId }, room.key))
        expect(await readLog(s.storage(room.roomId))).toEqual(log)
        await refused(send(s, room.roomId, 'reject', { request: j.memberId }, room.key), 409, ALREADY_ADMITTED)
      })

      it('ведущий отклонил — ключ отвечает «Ведущий отклонил заявку»', async () => {
        const s = await server()
        const room = await create(s)
        const j = await join(s, room, 'Боря')
        expect(await ok(send(s, room.roomId, 'reject', { request: j.memberId }, room.key))).toEqual({ v: PROTOCOL_VERSION, request: j.memberId })
        await refused(get(s, room.roomId, j.key), 403, REJECTED, 'rejected')
        expect(REJECTED).toBe('Ведущий отклонил заявку')
        await refused(send(s, room.roomId, 'admit', { request: j.memberId }, room.key), 409, ALREADY_REJECTED)
        await refused(send(s, room.roomId, 'admit', { request: ulid() }, room.key), 404, NO_REQUEST)
        expect(await members(s, room.roomId, room.key)).toEqual(['Аня'])
        // Отклонённое имя свободно: новая заявка — с новым номером
        const again = await join(s, room, 'Боря')
        expect(again.memberId).not.toBe(j.memberId)
      })

      it('заявки видит только ведущий', async () => {
        const s = await server()
        const room = await create(s)
        const borya = await member(s, room, 'Боря')
        const vera = await join(s, room, 'Вера')
        s.clock.now += 1000
        const gosha = await join(s, room, 'Гоша')
        expect(await ok<JoinRequestsResponse>(send(s, room.roomId, 'requests', undefined, room.key))).toEqual({
          v: PROTOCOL_VERSION,
          requests: [
            { id: vera.memberId, name: 'Вера', at: s.clock.now - 1000 },
            { id: gosha.memberId, name: 'Гоша', at: s.clock.now },
          ],
        })
        await refused(send(s, room.roomId, 'requests', undefined, borya.key), 403, HOST_ONLY)
        await refused(send(s, room.roomId, 'requests', undefined, vera.key), 403, WAITING, 'waiting')
        await refused(send(s, room.roomId, 'requests', undefined), 403, NEED_KEY)
        await refused(send(s, room.roomId, 'requests', undefined, 'someone-elses-key'), 403, WRONG_KEY)
        // Состояние комнаты заявок не показывает
        expect(JSON.stringify(await ok(get(s, room.roomId, borya.key)))).not.toContain('Вера')
      })

      it('ведущий сменил ссылку — старая не работает, новая работает, впущенные не страдают', async () => {
        const s = await server()
        const room = await create(s)
        const borya = await member(s, room, 'Боря')
        const vera = await join(s, room, 'Вера')
        // Тело не нужно: POST без тела
        const renewed = await ok<InviteResponse>(
          s.send(`/rooms/${room.roomId}/invite`, { method: 'POST', headers: { Authorization: 'Bearer ' + room.key } }),
        )
        expect(renewed.invite).not.toBe(room.invite)
        expect(renewed.invite.length).toBeGreaterThanOrEqual(20)
        await refused(send(s, room.roomId, 'preview', { invite: room.invite }), 403, BAD_LINK)
        await refused(send(s, room.roomId, 'join', { invite: room.invite, name: 'Гоша' }), 403, BAD_LINK)
        expect(await ok(send(s, room.roomId, 'preview', { invite: renewed.invite }))).toEqual({ v: PROTOCOL_VERSION, name: 'Дача', hostName: 'Аня' })
        await join(s, { ...room, invite: renewed.invite }, 'Гоша')
        // Впущенный — в комнате; поданная до смены заявка — ждёт решения
        expect(await members(s, room.roomId, borya.key)).toEqual(['Аня', 'Боря'])
        await ok(send(s, room.roomId, 'admit', { request: vera.memberId }, room.key))
        expect(await members(s, room.roomId, vera.key)).toEqual(['Аня', 'Боря', 'Вера'])
      })

      it('ссылка для другого устройства: одноразовая, на 24 часа, ключ того же участника', async () => {
        const s = await server()
        const room = await create(s)
        const borya = await member(s, room, 'Боря')
        const link = await ok<DeviceLinkResponse>(send(s, room.roomId, 'device', {}, borya.key))
        expect(link).toEqual({ v: PROTOCOL_VERSION, token: expect.any(String), member: borya.memberId, expiresAt: s.clock.now + DEVICE_LINK_TTL })
        expect(DEVICE_LINK_TTL).toBe(24 * 60 * 60 * 1000)
        s.clock.now += DEVICE_LINK_TTL - 1
        const claimed = await ok<ClaimDeviceResponse>(send(s, room.roomId, 'device/claim', { token: link.token }))
        expect(claimed).toEqual({ v: PROTOCOL_VERSION, memberId: borya.memberId, key: expect.any(String) })
        expect(claimed.key).not.toBe(borya.key)
        // Новый ключ — тот же участник; старый тоже работает
        expect((await ok<RoomStateResponse>(get(s, room.roomId, claimed.key))).me).toBe(borya.memberId)
        expect((await ok<RoomStateResponse>(get(s, room.roomId, borya.key))).me).toBe(borya.memberId)
        // Второй раз — нет
        await refused(send(s, room.roomId, 'device/claim', { token: link.token }), 403, BAD_DEVICE_LINK)
        // Через 24 часа — нет
        const late = await ok<DeviceLinkResponse>(send(s, room.roomId, 'device', {}, borya.key))
        s.clock.now += DEVICE_LINK_TTL
        await refused(send(s, room.roomId, 'device/claim', { token: late.token }), 403, BAD_DEVICE_LINK)
        // Чужой токен, другая комната, кривой номер
        await refused(send(s, room.roomId, 'device/claim', { token: 'не-тот' }), 403, BAD_DEVICE_LINK)
        await refused(send(s, room.roomId, 'device/claim', {}), 403, BAD_DEVICE_LINK)
        await refused(send(s, 'не-номер', 'device/claim', { token: link.token }), 403, BAD_DEVICE_LINK)
      })

      it('ведущий выдал ссылку за участника с «отвязать прежние» — старые ключи больше не открывают', async () => {
        const s = await server()
        const room = await create(s)
        const borya = await member(s, room, 'Боря')
        const second = await ok<ClaimDeviceResponse>(
          send(s, room.roomId, 'device/claim', { token: (await ok<DeviceLinkResponse>(send(s, room.roomId, 'device', {}, borya.key))).token }),
        )
        // Неиспользованная ссылка со старого телефона — тоже погаснет
        const stale = await ok<DeviceLinkResponse>(send(s, room.roomId, 'device', {}, borya.key))
        const link = await ok<DeviceLinkResponse>(send(s, room.roomId, 'device', { member: borya.memberId, unlink: true }, room.key))
        expect(link.member).toBe(borya.memberId)
        // Пока ссылкой не воспользовались — старые ключи работают
        expect((await get(s, room.roomId, borya.key)).status).toBe(200)
        const fresh = await ok<ClaimDeviceResponse>(send(s, room.roomId, 'device/claim', { token: link.token }))
        expect(fresh.memberId).toBe(borya.memberId)
        await refused(get(s, room.roomId, borya.key), 403, WRONG_KEY)
        await refused(get(s, room.roomId, second.key), 403, WRONG_KEY)
        await refused(send(s, room.roomId, 'device/claim', { token: stale.token }), 403, BAD_DEVICE_LINK)
        expect((await ok<RoomStateResponse>(get(s, room.roomId, fresh.key))).me).toBe(borya.memberId)
        // Другие участники не страдают
        expect(await members(s, room.roomId, room.key)).toEqual(['Аня', 'Боря'])
        await refused(send(s, room.roomId, 'device', { member: ulid() }, room.key), 404, NO_MEMBER)
      })

      it('не ведущий не впускает, не отклоняет, не меняет ссылку и не выдаёт ссылку за другого — 403', async () => {
        const s = await server()
        const room = await create(s)
        const borya = await member(s, room, 'Боря')
        const vera = await join(s, room, 'Вера')
        const log = await readLog(s.storage(room.roomId))
        await refused(send(s, room.roomId, 'admit', { request: vera.memberId }, borya.key), 403, HOST_ONLY)
        await refused(send(s, room.roomId, 'reject', { request: vera.memberId }, borya.key), 403, HOST_ONLY)
        await refused(send(s, room.roomId, 'invite', {}, borya.key), 403, HOST_ONLY)
        await refused(send(s, room.roomId, 'device', { member: room.memberId }, borya.key), 403, HOST_ONLY)
        await refused(send(s, room.roomId, 'device', { member: room.memberId, unlink: true }, borya.key), 403, HOST_ONLY)
        // Ждущая заявка — тем более
        await refused(send(s, room.roomId, 'admit', { request: vera.memberId }, vera.key), 403, WAITING, 'waiting')
        await refused(send(s, room.roomId, 'invite', {}), 403, NEED_KEY)
        expect(await readLog(s.storage(room.roomId))).toEqual(log)
        expect(HOST_ONLY).toBe('Это может только ведущий')
      })

      it('имя уже есть (без учёта регистра) — 409; повтор той же заявки — одна заявка', async () => {
        const s = await server()
        const room = await create(s)
        await refused(send(s, room.roomId, 'join', { invite: room.invite, name: 'аНЯ' }), 409, NAME_TAKEN)
        expect(NAME_TAKEN).toBe('Такое имя уже есть — добавьте букву')
        const requestId = ulid(s.clock.now)
        const first = await join(s, room, 'Боря', requestId)
        // Имя ждущей заявки тоже занято
        await refused(send(s, room.roomId, 'join', { invite: room.invite, name: 'БОРЯ' }), 409, NAME_TAKEN)
        s.clock.now += 1500
        expect(await join(s, room, 'Боря', requestId)).toEqual(first)
        // Одновременно — тоже одна
        const [a, b] = await Promise.all([join(s, room, 'Боря', requestId), join(s, room, 'Боря', requestId)])
        expect([a, b]).toEqual([first, first])
        // Тот же номер, другое имя — отказ
        await refused(send(s, room.roomId, 'join', { invite: room.invite, name: 'Вера', requestId }), 409, JOIN_TAKEN)
        const requests = (await readLog(s.storage(room.roomId))).filter((e) => e.type === 'join.requested')
        expect(requests.length).toBe(1)
        expect((await ok<JoinRequestsResponse>(send(s, room.roomId, 'requests', undefined, room.key))).requests.length).toBe(1)
        // Впустили — повтор заявки говорит «впущен», ключ тот же
        await ok(send(s, room.roomId, 'admit', { request: first.memberId }, room.key))
        expect(await join(s, room, 'Боря', requestId)).toEqual({ ...first, join: 'admitted' })
      })

      it('каждое действие — запись журнала; ключей и токенов в хранилище нет в открытом виде', async () => {
        const s = await server()
        const room = await create(s)
        const borya = await member(s, room, 'Боря')
        const vera = await join(s, room, 'Вера')
        await ok(send(s, room.roomId, 'reject', { request: vera.memberId }, room.key))
        const renewed = await ok<InviteResponse>(send(s, room.roomId, 'invite', {}, room.key))
        const link = await ok<DeviceLinkResponse>(send(s, room.roomId, 'device', { member: borya.memberId, unlink: true }, room.key))
        const claimed = await ok<ClaimDeviceResponse>(send(s, room.roomId, 'device/claim', { token: link.token }))
        // Чтение журнал не трогает
        await ok(send(s, room.roomId, 'preview', { invite: renewed.invite }))
        await ok(send(s, room.roomId, 'requests', undefined, room.key))

        const log = await readLog(s.storage(room.roomId))
        expect(log.map((e) => [e.type, e.memberId])).toEqual([
          ['room.created', room.memberId],
          ['member.added', room.memberId],
          ['join.requested', borya.memberId],
          ['member.added', room.memberId],
          ['join.requested', vera.memberId],
          ['join.rejected', room.memberId],
          ['invite.changed', room.memberId],
          ['device.issued', room.memberId],
          ['device.linked', borya.memberId],
        ])
        expect(log.at(-1)).toMatchObject({ type: 'device.linked', member: borya.memberId, unlink: true })
        // Журнал писался только в новые номера
        const logPuts = s.puts(room.roomId).filter((k) => k.startsWith('log:'))
        expect(new Set(logPuts).size).toBe(logPuts.length)
        expect(logPuts.length).toBe(log.length)

        const everything = JSON.stringify([...(await s.storage(room.roomId).list({ prefix: '' }))])
        for (const secret of [borya.key, vera.key, claimed.key, link.token, room.invite]) expect(everything).not.toContain(secret)
        expect(JSON.stringify(log)).not.toContain(renewed.invite)
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
