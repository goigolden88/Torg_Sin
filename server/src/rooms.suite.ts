// Тесты сервера комнат на любом хранилище (Р-02): одни и те же — на Cloudflare-подделке
// (rooms.test.ts) и на SQLite запасной обёртки (server/node/rooms.test.ts)
import { afterEach, describe, expect, it } from 'vitest'
import {
  BAD_AMOUNT,
  BAD_OUTCOMES,
  BAD_SUBJECT,
  CLOSE_PASSED,
  EXPECTED_EARLY,
  LONG_CHECK,
  LONG_CLARIFICATION,
  LONG_CONDITION,
  LONG_OBJECTION,
  LONG_OUTCOME,
  LONG_REASON,
  NEED_CHECK,
  NEED_CLARIFICATION,
  NEED_CONDITION,
  NEED_OBJECTION,
  NEED_OUTCOME,
  NEED_REASON,
  NEED_TIMES,
  OTHER,
  SAME_OUTCOMES,
} from '../../src/rules/event'
import {
  ACCEPTED_NO_WITHDRAW,
  AGREED,
  ALREADY_ACCEPTED,
  BAD_ADDRESSEE,
  BAD_GUARANTOR,
  BAD_MARK,
  BAD_ODDS,
  BAD_SIDE,
  CLOSE_PASSED as OFFER_CLOSE_PASSED,
  COUNTER_ACCEPTED,
  COUNTERED,
  DECIDED,
  EXPECTED_EARLY as OFFER_EXPECTED_EARLY,
  FINAL_TIME,
  GUARANTOR_COUNTERS,
  GUARANTOR_LAPSED,
  GUARANTOR_MARKS,
  GUARANTOR_PRESENT,
  GUARANTOR_SILENCE,
  GUARANTOR_TAKES,
  MARK_EARLY,
  NEED_GUARANTOR,
  NEED_TIMES as OFFER_NEED_TIMES,
  NOT_ADDRESSEE,
  NOT_SIDE,
  NOT_TURN,
  ONLY_AUTHOR,
  ONLY_GUARANTOR,
  OWN_COUNTER,
  OWN_OFFER,
  SIDE_SILENCE,
  TAKER_TOO_SMALL,
  WITHDRAWN,
} from '../../src/rules/offer'
import {
  isAcceptOfferResponse,
  isCreateOfferResponse,
  isDecideOfferResponse,
  isDeclineOfferResponse,
  isMarkOfferResponse,
  isNominateResponse,
  isRevokeOfferResponse,
  type DecideOfferResponse,
  type DeclineOfferResponse,
  type MarkOfferResponse,
  type NominateResponse,
  isAgreeOutcomeResponse,
  isDecideOutcomeResponse,
  isHealth,
  isObjectOutcomeResponse,
  isProposeOutcomeResponse,
  isRoomStateResponse,
  isVoteOutcomeResponse,
  PROTOCOL_VERSION,
  type AcceptOfferResponse,
  type CreateOfferResponse,
  type OfferView,
  type RevokeOfferResponse,
  type AgreeOutcomeResponse,
  type CancelEventResponse,
  type ClaimDeviceResponse,
  type ClarifyEventResponse,
  type CreateEventResponse,
  type CreateRoomResponse,
  type DecideOutcomeResponse,
  type DeviceLinkResponse,
  type EventView,
  type InviteResponse,
  type JoinRequestsResponse,
  type JoinRoomResponse,
  type ObjectOutcomeResponse,
  type OutcomeView,
  type PlaceBetResponse,
  type ProposeOutcomeResponse,
  type RoomStateResponse,
  type VoteOutcomeResponse,
} from '../../src/rules/protocol'
import { BAD_CURRENCY, LONG_MEMBER_NAME, LONG_ROOM_NAME, NAME_TAKEN, NEED_MEMBER_NAME, NEED_ROOM_NAME } from '../../src/rules/room'
import { ulid } from '../../src/rules/ulid'
import { BAD_REQUEST_ID, CREATION_OFF, NEED_CLOSE, NEED_KEY, WRONG_PASSWORD } from './http'
import { hashKey } from './keys'
import {
  AGREE_BETTORS_ONLY,
  AGREEMENT_CLOSED,
  ALREADY_ADMITTED,
  ALREADY_AGREED,
  ALREADY_APPROVED,
  ALREADY_DECIDED,
  ALREADY_OBJECTED,
  ALREADY_PROPOSED,
  ALREADY_REJECTED,
  ALREADY_VOTED,
  append,
  APPEND_ONLY,
  AUTHOR_ONLY,
  BAD_DEVICE_LINK,
  BAD_LINK,
  BANK_FULL,
  BET_TAKEN,
  BETS_CLOSED,
  BETS_OPEN,
  BETTORS_ONLY,
  DEVICE_LINK_TTL,
  EVENT_CANCELLED,
  EVENT_TAKEN,
  HOST_INTERESTED,
  HOST_ONLY,
  JOIN_TAKEN,
  NO_EVENT,
  NO_MEMBER,
  NO_OBJECTION,
  NO_OFFER,
  OFFER_CLOSED,
  NO_OUTCOME,
  NO_REQUEST,
  NO_ROOM,
  NO_VOTING,
  NOT_PROPOSED,
  OBJECTION_OVER,
  OWN_AGREEMENT,
  OWN_PROPOSAL,
  PROPOSER_ONLY,
  readLog,
  REJECTED,
  REQUEST_TAKEN,
  REQUEST_USED,
  SUBJECT_SILENT,
  VOTERS_ONLY,
  VOTING_OVER,
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
          events: [],
          offers: [],
          now: s.clock.now,
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

    describe('вход по ссылке (Р-03)', () => {
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

    describe('события-пул и ставки', () => {
      const HOUR = 60 * 60 * 1000
      const CONDITION = 'Вася пробежит 10 км до конца месяца'

      function eventForm(s: TestServer, change: Record<string, unknown> = {}): Record<string, unknown> {
        return {
          v: PROTOCOL_VERSION,
          condition: CONDITION,
          check: 'Скрин из приложения с пробежкой',
          closesAt: s.clock.now + HOUR,
          expectedAt: s.clock.now + 2 * HOUR,
          ...change,
        }
      }

      // Комната: Аня — ведущая, Боря и Вера — участники
      async function room3(s: TestServer) {
        const room = await create(s)
        const borya = await member(s, room, 'Боря')
        const vera = await member(s, room, 'Вера')
        return { room, borya, vera }
      }

      function newEvent(s: TestServer, roomId: string, key: string, body: unknown): Promise<CreateEventResponse> {
        return ok<CreateEventResponse>(send(s, roomId, 'events', body, key))
      }

      function bet(s: TestServer, roomId: string, key: string, eventId: string, body: unknown): Promise<Response> {
        return send(s, roomId, `events/${eventId}/bets`, { v: PROTOCOL_VERSION, ...(body as object) }, key)
      }

      async function eventsOf(s: TestServer, roomId: string, key: string): Promise<EventView[]> {
        const state = await ok<RoomStateResponse>(get(s, roomId, key))
        expect(isRoomStateResponse(state)).toBe(true)
        expect(state.now).toBe(s.clock.now)
        return state.events
      }

      async function eventEntries(s: TestServer, roomId: string): Promise<string[]> {
        return (await readLog(s.storage(roomId)))
          .map((e) => e.type)
          .filter((t) => t.startsWith('event.') || t.startsWith('bet.') || t.startsWith('outcome.'))
      }

      it('участник заводит событие — оно в состоянии комнаты у всех; исходы по умолчанию «Да» и «Нет»', async () => {
        const s = await server()
        const { room, borya, vera } = await room3(s)
        const form = eventForm(s, { subject: vera.memberId })
        const { event } = await newEvent(s, room.roomId, borya.key, form)
        expect(event).toEqual({
          id: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{26}$/),
          at: s.clock.now,
          authorId: borya.memberId,
          condition: CONDITION,
          check: 'Скрин из приложения с пробежкой',
          outcomes: [
            { id: '1', title: 'Да' },
            { id: '2', title: 'Нет' },
          ],
          closesAt: form.closesAt,
          expectedAt: form.expectedAt,
          subjectId: vera.memberId,
        })
        const expected = { ...event, status: 'open', clarifications: [], bets: [], cancelled: null, refunds: [], outcome: null }
        for (const key of [room.key, borya.key, vera.key]) expect(await eventsOf(s, room.roomId, key)).toEqual([expected])
        expect(await eventEntries(s, room.roomId)).toEqual(['event.created'])
        // Без предмета спора — null
        const second = await newEvent(s, room.roomId, room.key, eventForm(s))
        expect(second.event.subjectId).toBeNull()
        expect((await eventsOf(s, room.roomId, vera.key)).map((e) => e.id)).toEqual([event.id, second.event.id])
      })

      it('свои исходы — сервер добавляет «Другое» последним; повторы и лишние — 400', async () => {
        const s = await server()
        const { room } = await room3(s)
        const { event } = await newEvent(s, room.roomId, room.key, eventForm(s, { outcomes: [' Вася ', 'Петя', 'Гоша'] }))
        expect(event.outcomes).toEqual([
          { id: '1', title: 'Вася' },
          { id: '2', title: 'Петя' },
          { id: '3', title: 'Гоша' },
          { id: '4', title: OTHER },
        ])
        const cases: [unknown, string][] = [
          [['Вася', ' вАСЯ '], SAME_OUTCOMES],
          [['Вася', 'Другое (ничего из перечисленного)'], SAME_OUTCOMES],
          [['один'], BAD_OUTCOMES],
          [['1', '2', '3', '4', '5', '6', '7'], BAD_OUTCOMES],
          [['Вася', 'я'.repeat(41)], LONG_OUTCOME],
          [['Вася', ''], NEED_OUTCOME],
        ]
        for (const [outcomes, error] of cases) await refused(send(s, room.roomId, 'events', eventForm(s, { outcomes }), room.key), 400, error)
        expect(await eventEntries(s, room.roomId)).toEqual(['event.created'])
      })

      it('форма с ошибкой или прошедший срок — 400 с понятным текстом, событие не заводится', async () => {
        const s = await server()
        const { room, borya } = await room3(s)
        const now = s.clock.now
        const cases: [Record<string, unknown>, string][] = [
          [{ closesAt: now }, CLOSE_PASSED],
          [{ closesAt: now - HOUR, expectedAt: now }, CLOSE_PASSED],
          [{ expectedAt: now + HOUR - 1 }, EXPECTED_EARLY],
          [{ closesAt: undefined }, NEED_TIMES],
          [{ condition: '  ' }, NEED_CONDITION],
          [{ condition: 'я'.repeat(301) }, LONG_CONDITION],
          [{ check: '' }, NEED_CHECK],
          [{ check: 'я'.repeat(301) }, LONG_CHECK],
          [{ subject: ulid() }, BAD_SUBJECT],
          [{ requestId: 'abc' }, BAD_REQUEST_ID],
        ]
        for (const [change, error] of cases) await refused(send(s, room.roomId, 'events', eventForm(s, change), borya.key), 400, error)
        expect(CLOSE_PASSED).toBe('Срок «приём ставок до» уже прошёл — выберите время позже')
        // 300 знаков — можно; «исход к» ровно в «приём до» — можно
        await newEvent(s, room.roomId, borya.key, eventForm(s, { condition: 'я'.repeat(300), expectedAt: now + HOUR }))
        // Без ключа, с ключом заявки, другая версия
        const gosha = await join(s, room, 'Гоша')
        await refused(send(s, room.roomId, 'events', eventForm(s)), 403, NEED_KEY)
        await refused(send(s, room.roomId, 'events', eventForm(s), gosha.key), 403, WAITING, 'waiting')
        expect((await send(s, room.roomId, 'events', eventForm(s, { v: PROTOCOL_VERSION + 1 }), borya.key)).status).toBe(400)
        expect(await eventEntries(s, room.roomId)).toEqual(['event.created'])
      })

      it('ставки: кто, на что, сколько, когда — несколько раз и на разные исходы; автор и предмет тоже ставят', async () => {
        const s = await server()
        const { room, borya, vera } = await room3(s)
        const { event } = await newEvent(s, room.roomId, borya.key, eventForm(s, { subject: vera.memberId }))
        const first = await ok<PlaceBetResponse>(bet(s, room.roomId, borya.key, event.id, { outcome: '1', amount: 300 }))
        expect(first).toEqual({
          v: PROTOCOL_VERSION,
          bet: { id: expect.any(String), event: event.id, memberId: borya.memberId, outcome: '1', amount: 300, at: s.clock.now },
        })
        s.clock.now += 1000
        await ok(bet(s, room.roomId, vera.key, event.id, { outcome: '2', amount: 100 }))
        s.clock.now += 1000
        await ok(bet(s, room.roomId, borya.key, event.id, { outcome: '2', amount: 50 }))
        const [view] = await eventsOf(s, room.roomId, room.key)
        expect(view.bets.map((b) => [b.memberId, b.outcome, b.amount, b.at])).toEqual([
          [borya.memberId, '1', 300, s.clock.now - 2000],
          [vera.memberId, '2', 100, s.clock.now - 1000],
          [borya.memberId, '2', 50, s.clock.now],
        ])
        expect(await eventEntries(s, room.roomId)).toEqual(['event.created', 'bet.placed', 'bet.placed', 'bet.placed'])
        // Сумма — целое > 0; исход и событие — существующие
        for (const amount of [0, -5, 1.5, '100', undefined, Number.MAX_SAFE_INTEGER + 1]) {
          await refused(bet(s, room.roomId, vera.key, event.id, { outcome: '1', amount }), 400, BAD_AMOUNT)
        }
        await refused(bet(s, room.roomId, vera.key, event.id, { outcome: '3', amount: 10 }), 400, NO_OUTCOME)
        await refused(bet(s, room.roomId, vera.key, ulid(), { outcome: '1', amount: 10 }), 404, NO_EVENT)
        await refused(bet(s, room.roomId, vera.key, 'не-номер', { outcome: '1', amount: 10 }), 404, NO_EVENT)
        await refused(bet(s, room.roomId, 'someone-elses-key', event.id, { outcome: '1', amount: 10 }), 403, WRONG_KEY)
        // Банк не выходит за безопасное целое
        await refused(bet(s, room.roomId, vera.key, event.id, { outcome: '1', amount: Number.MAX_SAFE_INTEGER - 400 }), 400, BANK_FULL)
        expect((await eventsOf(s, room.roomId, room.key))[0].bets.length).toBe(3)
      })

      it('ставка в момент или после «приём до» по времени сервера — «Приём ставок закрыт», даже если сервер лежал', async () => {
        const s = await server()
        const { room, borya, vera } = await room3(s)
        const { event } = await newEvent(s, room.roomId, borya.key, eventForm(s))
        s.clock.now = event.closesAt - 1
        await ok(bet(s, room.roomId, vera.key, event.id, { outcome: '1', amount: 100 }))
        expect((await eventsOf(s, room.roomId, vera.key))[0].status).toBe('open')
        s.clock.now = event.closesAt
        await refused(bet(s, room.roomId, vera.key, event.id, { outcome: '2', amount: 100 }), 409, BETS_CLOSED)
        expect(BETS_CLOSED).toBe('Приём ставок закрыт')
        expect((await eventsOf(s, room.roomId, vera.key))[0].status).toBe('closed')
        // Сервер лежал неделю: в срок никто не закрывал — закрыто по времени запроса
        s.clock.now += 7 * 24 * HOUR
        await refused(bet(s, room.roomId, borya.key, event.id, { outcome: '2', amount: 100 }), 409, BETS_CLOSED)
        expect(await eventEntries(s, room.roomId)).toEqual(['event.created', 'bet.placed'])
      })

      it('двойное «Поставить» (тот же номер запроса) — одна ставка и тот же ответ; другой суммой или исходом — 409', async () => {
        const s = await server()
        const { room, borya, vera } = await room3(s)
        const { event } = await newEvent(s, room.roomId, borya.key, eventForm(s))
        const requestId = ulid(s.clock.now)
        const body = { outcome: '1', amount: 100, requestId }
        const first = await ok<PlaceBetResponse>(bet(s, room.roomId, vera.key, event.id, body))
        s.clock.now += 1500
        expect(await ok(bet(s, room.roomId, vera.key, event.id, body))).toEqual(first)
        const [a, b] = await Promise.all([bet(s, room.roomId, vera.key, event.id, body), bet(s, room.roomId, vera.key, event.id, body)])
        expect([await a.json(), await b.json()]).toEqual([first, first])
        await refused(bet(s, room.roomId, vera.key, event.id, { ...body, amount: 200 }), 409, BET_TAKEN)
        await refused(bet(s, room.roomId, vera.key, event.id, { ...body, outcome: '2' }), 409, BET_TAKEN)
        await refused(bet(s, room.roomId, borya.key, event.id, body), 409, BET_TAKEN)
        // Ответ потерялся, повтор пришёл после срока — та же ставка, не отказ
        s.clock.now = event.closesAt + 1
        expect(await ok(bet(s, room.roomId, vera.key, event.id, body))).toEqual(first)
        expect((await eventsOf(s, room.roomId, vera.key))[0].bets.length).toBe(1)
      })

      it('двойное создание события (тот же номер запроса) — одно событие и тот же ответ; другая форма — 409', async () => {
        const s = await server()
        const { room, borya, vera } = await room3(s)
        const form = eventForm(s, { requestId: ulid(s.clock.now), outcomes: ['Вася', 'Петя'] })
        const first = await newEvent(s, room.roomId, borya.key, form)
        s.clock.now += 1500
        expect(await newEvent(s, room.roomId, borya.key, form)).toEqual(first)
        const [a, b] = await Promise.all([newEvent(s, room.roomId, borya.key, form), newEvent(s, room.roomId, borya.key, form)])
        expect([a, b]).toEqual([first, first])
        await refused(send(s, room.roomId, 'events', { ...form, condition: 'Другое условие' }, borya.key), 409, EVENT_TAKEN)
        await refused(send(s, room.roomId, 'events', form, vera.key), 409, EVENT_TAKEN)
        // Повтор после «приём до» — то же событие, не отказ
        s.clock.now = first.event.closesAt + 1
        expect(await newEvent(s, room.roomId, borya.key, form)).toEqual(first)
        expect(await eventEntries(s, room.roomId)).toEqual(['event.created'])
      })

      it('уточнение — только автор; видно всем под условием со временем; условие и исходы не меняются', async () => {
        const s = await server()
        const { room, borya, vera } = await room3(s)
        const { event } = await newEvent(s, room.roomId, borya.key, eventForm(s))
        s.clock.now += 1000
        const clarify = (key: string, text: unknown) => send(s, room.roomId, `events/${event.id}/clarify`, { text }, key)
        const r = await ok<ClarifyEventResponse>(clarify(borya.key, ' Дорожка в зале тоже считается '))
        expect(r).toEqual({ v: PROTOCOL_VERSION, clarification: { id: expect.any(String), at: s.clock.now, text: 'Дорожка в зале тоже считается' } })
        await refused(clarify(vera.key, 'Моё уточнение'), 403, AUTHOR_ONLY)
        await refused(clarify(room.key, 'Уточнение ведущего'), 403, AUTHOR_ONLY)
        await refused(clarify(borya.key, ' '), 400, NEED_CLARIFICATION)
        await refused(clarify(borya.key, 'я'.repeat(301)), 400, LONG_CLARIFICATION)
        await refused(send(s, room.roomId, `events/${ulid()}/clarify`, { text: 'а' }, borya.key), 404, NO_EVENT)
        const [view] = await eventsOf(s, room.roomId, vera.key)
        expect(view.clarifications).toEqual([r.clarification])
        expect(view).toMatchObject({ condition: event.condition, check: event.check, outcomes: event.outcomes })
        expect(AUTHOR_ONLY).toBe('Это может только автор события')
      })

      it('автор отменяет до закрытия приёма — «отменено», ставки возвращаются, новых ставок нет', async () => {
        const s = await server()
        const { room, borya, vera } = await room3(s)
        const { event } = await newEvent(s, room.roomId, borya.key, eventForm(s))
        await ok(bet(s, room.roomId, borya.key, event.id, { outcome: '1', amount: 300 }))
        await ok(bet(s, room.roomId, vera.key, event.id, { outcome: '2', amount: 100 }))
        await ok(bet(s, room.roomId, borya.key, event.id, { outcome: '2', amount: 50 }))
        const cancel = (key: string, body: unknown = {}) => send(s, room.roomId, `events/${event.id}/cancel`, body, key)
        await refused(cancel(vera.key), 403, AUTHOR_ONLY)
        await refused(cancel(room.key), 403, AUTHOR_ONLY)
        s.clock.now += 1000
        // Тело не нужно: POST без тела
        const r = await ok<CancelEventResponse>(
          s.send(`/rooms/${room.roomId}/events/${event.id}/cancel`, { method: 'POST', headers: { Authorization: 'Bearer ' + borya.key } }),
        )
        expect(r).toEqual({ v: PROTOCOL_VERSION, cancelled: { at: s.clock.now, by: borya.memberId, reason: null } })
        const [view] = await eventsOf(s, room.roomId, vera.key)
        expect(view.status).toBe('cancelled')
        expect(view.cancelled).toEqual(r.cancelled)
        expect(view.refunds).toEqual([
          { memberId: borya.memberId, amount: 350 },
          { memberId: vera.memberId, amount: 100 },
        ])
        await refused(bet(s, room.roomId, vera.key, event.id, { outcome: '1', amount: 10 }), 409, EVENT_CANCELLED)
        // Повтор отмены — тот же ответ без новой записи
        s.clock.now += 1000
        expect(await ok(cancel(borya.key))).toEqual(r)
        expect(await eventEntries(s, room.roomId)).toEqual(['event.created', 'bet.placed', 'bet.placed', 'bet.placed', 'event.cancelled'])
      })

      it('после закрытия приёма отменяет только ведущий и только с причиной', async () => {
        const s = await server()
        const { room, borya, vera } = await room3(s)
        const { event } = await newEvent(s, room.roomId, borya.key, eventForm(s))
        await ok(bet(s, room.roomId, vera.key, event.id, { outcome: '1', amount: 100 }))
        s.clock.now = event.closesAt
        const cancel = (key: string, body: unknown = {}) => send(s, room.roomId, `events/${event.id}/cancel`, body, key)
        await refused(cancel(borya.key, { reason: 'Передумал' }), 403, HOST_ONLY)
        await refused(cancel(room.key), 400, NEED_REASON)
        await refused(cancel(room.key, { reason: '  ' }), 400, NEED_REASON)
        await refused(cancel(room.key, { reason: 'я'.repeat(301) }), 400, LONG_REASON)
        const r = await ok<CancelEventResponse>(cancel(room.key, { reason: ' Условие поняли по-разному ' }))
        expect(r.cancelled).toEqual({ at: s.clock.now, by: room.memberId, reason: 'Условие поняли по-разному' })
        const [view] = await eventsOf(s, room.roomId, borya.key)
        expect(view).toMatchObject({ status: 'cancelled', refunds: [{ memberId: vera.memberId, amount: 100 }] })
        expect(NEED_REASON).toBe('Нужна причина отмены')
      })

      it('чужой метод и адрес событий — 404; ставка в журнале не хранит лишнего', async () => {
        const s = await server()
        const { room, borya } = await room3(s)
        expect((await s.send(`/rooms/${room.roomId}/events`, { headers: { Authorization: 'Bearer ' + borya.key } })).status).toBe(404)
        const { event } = await newEvent(s, room.roomId, borya.key, eventForm(s))
        expect((await send(s, room.roomId, `events/${event.id}/nope`, {}, borya.key)).status).toBe(404)
        await ok(bet(s, room.roomId, borya.key, event.id, { outcome: '1', amount: 100 }))
        const log = await readLog(s.storage(room.roomId))
        expect(log.at(-1)).toEqual({
          id: expect.any(String),
          at: s.clock.now,
          memberId: borya.memberId,
          type: 'bet.placed',
          event: event.id,
          outcome: '1',
          amount: 100,
          requestId: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{26}$/),
        })
        // Номера запросов — только в журнале сервера, не в ответе сайту
        const state = JSON.stringify(await ok(get(s, room.roomId, borya.key)))
        expect(state).not.toContain('requestId')
      })

      describe('исход события', () => {
        const DAY = 24 * HOUR

        // Действие с исходом: propose | object | decide | vote
        function act(s: TestServer, roomId: string, key: string, eventId: string, action: string, body: Record<string, unknown>): Promise<Response> {
          return send(s, roomId, `events/${eventId}/${action}`, { v: PROTOCOL_VERSION, ...body }, key)
        }

        async function outcomeOf(s: TestServer, roomId: string, key: string, eventId: string): Promise<OutcomeView | null> {
          const event = (await eventsOf(s, roomId, key)).find((e) => e.id === eventId)
          expect(event).toBeDefined()
          return event?.outcome ?? null
        }

        // Событие Бори «Да / Нет», ставки: Боря — 300 на «Да», Вера — 100 на «Нет»; время — на закрытие приёма
        async function closedEvent(s: TestServer, roomId: string, borya: JoinRoomResponse, vera: JoinRoomResponse, change: Record<string, unknown> = {}) {
          const { event } = await newEvent(s, roomId, borya.key, eventForm(s, change))
          await ok(bet(s, roomId, borya.key, event.id, { outcome: '1', amount: 300 }))
          await ok(bet(s, roomId, vera.key, event.id, { outcome: '2', amount: 100 }))
          return event
        }

        it('автор предлагает исход после закрытия приёма; сутки без возражения — утверждён сам; через 7 дней — окончательный', async () => {
          const s = await server()
          const { room, borya, vera } = await room3(s)
          const event = await closedEvent(s, room.roomId, borya, vera)
          const propose = (key: string, outcome: string, requestId?: string) => act(s, room.roomId, key, event.id, 'propose', { outcome, requestId })
          await refused(propose(borya.key, '1'), 409, BETS_OPEN)
          s.clock.now = event.closesAt
          await refused(propose(vera.key, '1'), 403, PROPOSER_ONLY)
          await refused(propose(room.key, '1'), 403, PROPOSER_ONLY)
          await refused(propose(borya.key, '3'), 400, NO_OUTCOME)
          await refused(propose(borya.key, ''), 400, NO_OUTCOME)
          const requestId = ulid(s.clock.now)
          const first = await ok<ProposeOutcomeResponse>(propose(borya.key, '1', requestId))
          expect(isProposeOutcomeResponse(first)).toBe(true)
          expect(first).toEqual({ v: PROTOCOL_VERSION, proposal: { id: expect.any(String), at: s.clock.now, by: borya.memberId, outcome: '1' } })
          const proposedAt = s.clock.now
          // Повтор — тот же ответ без записи; тот же номер с другим исходом — 409; второе предложение — 409
          s.clock.now += 1000
          expect(await ok(propose(borya.key, '1', requestId))).toEqual(first)
          await refused(propose(borya.key, '2', requestId), 409, REQUEST_USED)
          await refused(propose(borya.key, '2'), 409, ALREADY_PROPOSED)
          expect(await outcomeOf(s, room.roomId, vera.key, event.id)).toMatchObject({
            status: 'proposed',
            proposal: first.proposal,
            objectionUntil: proposedAt + DAY,
            approved: null,
            payouts: [],
          })
          // Сутки без возражения — утверждён сам, по времени сервера в момент запроса
          s.clock.now = proposedAt + DAY - 1
          expect((await outcomeOf(s, room.roomId, vera.key, event.id))?.status).toBe('proposed')
          s.clock.now = proposedAt + DAY
          const approved = await outcomeOf(s, room.roomId, vera.key, event.id)
          expect(approved).toMatchObject({
            status: 'approved',
            approved: { outcome: '1', at: proposedAt + DAY, how: 'unopposed', by: null },
            finalAt: proposedAt + 8 * DAY,
            void: false,
            payouts: [
              { memberId: borya.memberId, staked: 300, payout: 400, net: 100 },
              { memberId: vera.memberId, staked: 100, payout: 0, net: -100 },
            ],
          })
          await refused(act(s, room.roomId, vera.key, event.id, 'object', { reason: 'Поздно' }), 409, OBJECTION_OVER)
          // 7 дней без апелляции — окончательный
          s.clock.now = proposedAt + 8 * DAY - 1
          expect((await outcomeOf(s, room.roomId, vera.key, event.id))?.status).toBe('approved')
          s.clock.now = proposedAt + 8 * DAY
          expect((await outcomeOf(s, room.roomId, vera.key, event.id))?.status).toBe('final')
          expect(await eventEntries(s, room.roomId)).toEqual(['event.created', 'bet.placed', 'bet.placed', 'outcome.proposed'])
        })

        it('предмет спора исход не предлагает: автор — предмет — предлагает ведущий; автор молчит 3 дня после «исход к» — и ведущий', async () => {
          const s = await server()
          const { room, borya, vera } = await room3(s)
          // Вера завела спор о себе
          const { event: own } = await newEvent(s, room.roomId, vera.key, eventForm(s, { subject: vera.memberId }))
          // Боря завёл спор о Вере
          const { event: about } = await newEvent(s, room.roomId, borya.key, eventForm(s, { subject: vera.memberId }))
          // Боря завёл и молчит
          const { event: silent } = await newEvent(s, room.roomId, borya.key, eventForm(s))
          s.clock.now = own.closesAt
          await refused(act(s, room.roomId, vera.key, own.id, 'propose', { outcome: '1' }), 403, SUBJECT_SILENT)
          await refused(act(s, room.roomId, vera.key, about.id, 'propose', { outcome: '1' }), 403, SUBJECT_SILENT)
          expect(await ok<ProposeOutcomeResponse>(act(s, room.roomId, room.key, own.id, 'propose', { outcome: '2' }))).toMatchObject({
            proposal: { by: room.memberId, outcome: '2' },
          })
          s.clock.now = silent.expectedAt + 3 * DAY - 1
          await refused(act(s, room.roomId, room.key, silent.id, 'propose', { outcome: '1' }), 403, PROPOSER_ONLY)
          s.clock.now = silent.expectedAt + 3 * DAY
          await refused(act(s, room.roomId, vera.key, silent.id, 'propose', { outcome: '1' }), 403, PROPOSER_ONLY)
          expect(await ok<ProposeOutcomeResponse>(act(s, room.roomId, room.key, silent.id, 'propose', { outcome: '1' }))).toMatchObject({
            proposal: { by: room.memberId, at: s.clock.now },
          })
          // Автор потом — уже 409
          await refused(act(s, room.roomId, borya.key, silent.id, 'propose', { outcome: '2' }), 409, ALREADY_PROPOSED)
        })

        it('возражение: ставившие, кроме предложившего, с причиной, сутки; ведущий не ставил — решает он', async () => {
          const s = await server()
          const { room, borya, vera } = await room3(s)
          const gosha = await member(s, room, 'Гоша')
          const event = await closedEvent(s, room.roomId, borya, vera)
          s.clock.now = event.closesAt
          await refused(act(s, room.roomId, vera.key, event.id, 'object', { reason: 'Рано' }), 409, NOT_PROPOSED)
          await ok(act(s, room.roomId, borya.key, event.id, 'propose', { outcome: '1' }))
          const object = (key: string, reason: unknown, requestId?: string) => act(s, room.roomId, key, event.id, 'object', { reason, requestId })
          const decide = (key: string, outcome: string, requestId?: string) => act(s, room.roomId, key, event.id, 'decide', { outcome, requestId })
          await refused(decide(room.key, '2'), 409, NO_OBJECTION)
          await refused(act(s, room.roomId, gosha.key, event.id, 'vote', { outcome: '2' }), 409, NO_OBJECTION)
          await refused(object(gosha.key, 'Не ставил, но против'), 403, BETTORS_ONLY)
          await refused(object(borya.key, 'Сам с собой'), 403, OWN_PROPOSAL)
          await refused(object(vera.key, '  '), 400, NEED_OBJECTION)
          await refused(object(vera.key, undefined), 400, NEED_OBJECTION)
          await refused(object(vera.key, 'я'.repeat(301)), 400, LONG_OBJECTION)
          s.clock.now += DAY - 1
          const requestId = ulid(s.clock.now)
          const objection = await ok<ObjectOutcomeResponse>(object(vera.key, ' Скрин старый, с прошлого года ', requestId))
          expect(isObjectOutcomeResponse(objection)).toBe(true)
          expect(objection).toEqual({
            v: PROTOCOL_VERSION,
            objection: { id: expect.any(String), at: s.clock.now, by: vera.memberId, reason: 'Скрин старый, с прошлого года' },
          })
          // Повтор — тот же ответ; второе возражение — 409
          expect(await ok(object(vera.key, 'Скрин старый, с прошлого года', requestId))).toEqual(objection)
          await refused(object(vera.key, 'Ещё одно'), 409, ALREADY_OBJECTED)
          // Сутки прошли — сам не утверждается: ждёт ведущего
          s.clock.now += 2 * DAY
          expect(await outcomeOf(s, room.roomId, borya.key, event.id)).toMatchObject({
            status: 'disputed',
            objections: [objection.objection],
            approved: null,
            voters: [],
            votingUntil: null,
          })
          await refused(decide(borya.key, '1'), 403, HOST_ONLY)
          await refused(act(s, room.roomId, gosha.key, event.id, 'vote', { outcome: '2' }), 409, NO_VOTING)
          await refused(decide(room.key, '5'), 400, NO_OUTCOME)
          const decisionId = ulid(s.clock.now)
          const decision = await ok<DecideOutcomeResponse>(decide(room.key, '2', decisionId))
          expect(isDecideOutcomeResponse(decision)).toBe(true)
          expect(decision).toEqual({ v: PROTOCOL_VERSION, decision: { id: expect.any(String), at: s.clock.now, by: room.memberId, outcome: '2' } })
          const decidedAt = s.clock.now
          s.clock.now += 1000
          expect(await ok(decide(room.key, '2', decisionId))).toEqual(decision)
          await refused(decide(room.key, '1', decisionId), 409, REQUEST_USED)
          await refused(decide(room.key, '1'), 409, ALREADY_DECIDED)
          expect(await outcomeOf(s, room.roomId, gosha.key, event.id)).toMatchObject({
            status: 'approved',
            decision: decision.decision,
            approved: { outcome: '2', at: decidedAt, how: 'host', by: room.memberId },
            finalAt: decidedAt + 7 * DAY,
            payouts: [
              { memberId: borya.memberId, payout: 0, net: -300 },
              { memberId: vera.memberId, payout: 400, net: 300 },
            ],
          })
          s.clock.now = decidedAt + 7 * DAY
          expect((await outcomeOf(s, room.roomId, gosha.key, event.id))?.status).toBe('final')
          expect(await eventEntries(s, room.roomId)).toEqual(['event.created', 'bet.placed', 'bet.placed', 'outcome.proposed', 'outcome.objected', 'outcome.decided'])
        })

        it('ведущий ставил — голосуют не ставившие и не предмет; все проголосовали — итог сразу', async () => {
          const s = await server()
          const { room, borya, vera } = await room3(s)
          const gosha = await member(s, room, 'Гоша')
          const dasha = await member(s, room, 'Даша')
          const event = await closedEvent(s, room.roomId, borya, vera)
          await ok(bet(s, room.roomId, room.key, event.id, { outcome: '1', amount: 100 }))
          s.clock.now = event.closesAt
          await ok(act(s, room.roomId, borya.key, event.id, 'propose', { outcome: '1' }))
          await ok(act(s, room.roomId, vera.key, event.id, 'object', { reason: 'Бежал не он' }))
          const objectedAt = s.clock.now
          // Впущенный после возражения не голосует
          const zhenya = await member(s, room, 'Женя')
          const vote = (key: string, outcome: string, requestId?: string) => act(s, room.roomId, key, event.id, 'vote', { outcome, requestId })
          await refused(act(s, room.roomId, room.key, event.id, 'decide', { outcome: '2' }), 403, HOST_INTERESTED)
          for (const key of [room.key, borya.key, vera.key, zhenya.key]) await refused(vote(key, '2'), 403, VOTERS_ONLY)
          expect(await outcomeOf(s, room.roomId, vera.key, event.id)).toMatchObject({
            status: 'voting',
            voters: [gosha.memberId, dasha.memberId],
            votingUntil: objectedAt + 72 * HOUR,
            votes: [],
          })
          await refused(vote(gosha.key, '7'), 400, NO_OUTCOME)
          s.clock.now += HOUR
          const requestId = ulid(s.clock.now)
          const first = await ok<VoteOutcomeResponse>(vote(gosha.key, '2', requestId))
          expect(isVoteOutcomeResponse(first)).toBe(true)
          expect(first).toEqual({ v: PROTOCOL_VERSION, vote: { id: expect.any(String), at: s.clock.now, by: gosha.memberId, outcome: '2' } })
          expect(await ok(vote(gosha.key, '2', requestId))).toEqual(first)
          await refused(vote(gosha.key, '1', requestId), 409, REQUEST_USED)
          await refused(vote(gosha.key, '1'), 409, ALREADY_VOTED)
          expect((await outcomeOf(s, room.roomId, vera.key, event.id))?.status).toBe('voting')
          s.clock.now += HOUR
          await ok(vote(dasha.key, '2'))
          expect(await outcomeOf(s, room.roomId, vera.key, event.id)).toMatchObject({
            status: 'approved',
            votes: [first.vote, { by: dasha.memberId, outcome: '2' }],
            approved: { outcome: '2', at: s.clock.now, how: 'vote', by: null },
            payouts: [
              { memberId: borya.memberId, payout: 0 },
              { memberId: vera.memberId, payout: 500 },
              { memberId: room.memberId, payout: 0 },
            ],
          })
        })

        it('голосование: 72 часа — большинство поданных; ничья — «ждёт суда»; ведущий — предмет спора — тоже голосование', async () => {
          const s = await server()
          const { room, borya, vera } = await room3(s)
          const gosha = await member(s, room, 'Гоша')
          const dasha = await member(s, room, 'Даша')
          // Ведущий — предмет спора, сам не ставил
          const about = await closedEvent(s, room.roomId, borya, vera, { subject: room.memberId })
          // Ведущий ставил
          const tie = await closedEvent(s, room.roomId, borya, vera)
          await ok(bet(s, room.roomId, room.key, tie.id, { outcome: '1', amount: 100 }))
          s.clock.now = about.closesAt
          for (const e of [about, tie]) {
            await ok(act(s, room.roomId, borya.key, e.id, 'propose', { outcome: '1' }))
            await ok(act(s, room.roomId, vera.key, e.id, 'object', { reason: 'Не согласна' }))
          }
          const until = s.clock.now + 72 * HOUR
          await refused(act(s, room.roomId, room.key, about.id, 'decide', { outcome: '1' }), 403, HOST_INTERESTED)
          expect((await outcomeOf(s, room.roomId, vera.key, about.id))?.voters).toEqual([gosha.memberId, dasha.memberId])
          await ok(act(s, room.roomId, gosha.key, about.id, 'vote', { outcome: '1' }))
          await ok(act(s, room.roomId, gosha.key, tie.id, 'vote', { outcome: '1' }))
          await ok(act(s, room.roomId, dasha.key, tie.id, 'vote', { outcome: '2' }))
          // Ничья — «ждёт суда» сразу, как проголосовали все; исход не утверждён
          expect(await outcomeOf(s, room.roomId, vera.key, tie.id)).toMatchObject({ status: 'court', approved: null, finalAt: null, payouts: [] })
          // Один голос из двух — ждём 72 часа
          s.clock.now = until - 1
          expect((await outcomeOf(s, room.roomId, vera.key, about.id))?.status).toBe('voting')
          s.clock.now = until
          expect(await outcomeOf(s, room.roomId, vera.key, about.id)).toMatchObject({
            status: 'approved',
            approved: { outcome: '1', at: until, how: 'vote', by: null },
          })
          await refused(act(s, room.roomId, dasha.key, about.id, 'vote', { outcome: '2' }), 409, VOTING_OVER)
          s.clock.now = until + 30 * DAY
          // Суд по «ждёт суда» собрался сам (Р-25), его 72 часа прошли без голосов — отмена с возвратом
          expect(await outcomeOf(s, room.roomId, vera.key, tie.id)).toMatchObject({ status: 'cancelled', appeal: null, court: { decision: { majority: false, verdict: 'cancel' } } })
          expect((await outcomeOf(s, room.roomId, vera.key, about.id))?.status).toBe('final')
        })

        it('ведущий решил в первые сутки — другой ставивший уже не возражает', async () => {
          const s = await server()
          const { room, borya, vera } = await room3(s)
          const gosha = await member(s, room, 'Гоша')
          const event = await closedEvent(s, room.roomId, borya, vera)
          await ok(bet(s, room.roomId, gosha.key, event.id, { outcome: '2', amount: 100 }))
          s.clock.now = event.closesAt
          await ok(act(s, room.roomId, borya.key, event.id, 'propose', { outcome: '1' }))
          await ok(act(s, room.roomId, vera.key, event.id, 'object', { reason: 'Не так' }))
          await ok(act(s, room.roomId, room.key, event.id, 'decide', { outcome: '1' }))
          await refused(act(s, room.roomId, gosha.key, event.id, 'object', { reason: 'И я против' }), 409, ALREADY_APPROVED)
        })

        it('некому голосовать — сразу «ждёт суда»', async () => {
          const s = await server()
          const { room, borya, vera } = await room3(s)
          const event = await closedEvent(s, room.roomId, borya, vera)
          await ok(bet(s, room.roomId, room.key, event.id, { outcome: '2', amount: 100 }))
          s.clock.now = event.closesAt
          await ok(act(s, room.roomId, borya.key, event.id, 'propose', { outcome: '1' }))
          await ok(act(s, room.roomId, vera.key, event.id, 'object', { reason: 'Не так' }))
          expect(await outcomeOf(s, room.roomId, vera.key, event.id)).toMatchObject({ status: 'court', voters: [], approved: null })
        })

        it('отменённое событие — 409; нет события — 404; без ключа — 403; номера запросов — не в ответе', async () => {
          const s = await server()
          const { room, borya, vera } = await room3(s)
          const event = await closedEvent(s, room.roomId, borya, vera)
          s.clock.now = event.closesAt
          await ok(act(s, room.roomId, borya.key, event.id, 'propose', { outcome: '1' }))
          expect(JSON.stringify(await ok(get(s, room.roomId, vera.key)))).not.toContain('requestId')
          await ok(send(s, room.roomId, `events/${event.id}/cancel`, { reason: 'Условие поняли по-разному' }, room.key))
          await refused(act(s, room.roomId, vera.key, event.id, 'object', { reason: 'Не так' }), 409, EVENT_CANCELLED)
          await refused(act(s, room.roomId, room.key, event.id, 'decide', { outcome: '1' }), 409, EVENT_CANCELLED)
          const [view] = await eventsOf(s, room.roomId, vera.key)
          expect(view.outcome).toMatchObject({ payouts: [] })
          expect(view.refunds.length).toBe(2)
          for (const action of ['propose', 'decide', 'vote']) {
            await refused(act(s, room.roomId, borya.key, ulid(), action, { outcome: '1' }), 404, NO_EVENT)
            await refused(send(s, room.roomId, `events/${event.id}/${action}`, { outcome: '1' }), 403, NEED_KEY)
            await refused(act(s, room.roomId, borya.key, event.id, action, { outcome: '1', requestId: 'abc' }), 400, BAD_REQUEST_ID)
          }
          await refused(act(s, room.roomId, borya.key, ulid(), 'object', { reason: 'а' }), 404, NO_EVENT)
          await refused(act(s, room.roomId, 'someone-elses-key', event.id, 'propose', { outcome: '1' }), 403, WRONG_KEY)
        })

        it('событие ведущего о себе: предлагает любой, кроме ведущего, — первый; голосуют не ставившие и не предмет', async () => {
          const s = await server()
          const { room, borya, vera } = await room3(s)
          const gosha = await member(s, room, 'Гоша')
          const dasha = await member(s, room, 'Даша')
          // Ведущий: «подтянусь 50 раз»
          const { event } = await newEvent(s, room.roomId, room.key, eventForm(s, { subject: room.memberId }))
          await ok(bet(s, room.roomId, borya.key, event.id, { outcome: '1', amount: 300 }))
          await ok(bet(s, room.roomId, vera.key, event.id, { outcome: '2', amount: 100 }))
          await refused(act(s, room.roomId, gosha.key, event.id, 'propose', { outcome: '1' }), 409, BETS_OPEN)
          s.clock.now = event.closesAt
          await refused(act(s, room.roomId, room.key, event.id, 'propose', { outcome: '1' }), 403, SUBJECT_SILENT)
          expect(await ok<ProposeOutcomeResponse>(act(s, room.roomId, gosha.key, event.id, 'propose', { outcome: '1' }))).toMatchObject({
            proposal: { by: gosha.memberId, outcome: '1', at: s.clock.now },
          })
          await refused(act(s, room.roomId, borya.key, event.id, 'propose', { outcome: '1' }), 409, ALREADY_PROPOSED)
          await refused(act(s, room.roomId, dasha.key, event.id, 'propose', { outcome: '2' }), 409, ALREADY_PROPOSED)
          await ok(act(s, room.roomId, vera.key, event.id, 'object', { reason: 'Было 40' }))
          await refused(act(s, room.roomId, room.key, event.id, 'decide', { outcome: '2' }), 403, HOST_INTERESTED)
          expect(await outcomeOf(s, room.roomId, vera.key, event.id)).toMatchObject({ status: 'voting', voters: [gosha.memberId, dasha.memberId] })
          await ok(act(s, room.roomId, gosha.key, event.id, 'vote', { outcome: '2' }))
          await ok(act(s, room.roomId, dasha.key, event.id, 'vote', { outcome: '2' }))
          expect(await outcomeOf(s, room.roomId, vera.key, event.id)).toMatchObject({ status: 'approved', approved: { outcome: '2', how: 'vote' } })
        })

        it('отменено после утверждения — «отменено»: без выплат и finalAt, окончательным не станет; только возврат', async () => {
          const s = await server()
          const { room, borya, vera } = await room3(s)
          const event = await closedEvent(s, room.roomId, borya, vera)
          s.clock.now = event.closesAt
          await ok(act(s, room.roomId, borya.key, event.id, 'propose', { outcome: '1' }))
          s.clock.now += DAY
          expect((await outcomeOf(s, room.roomId, vera.key, event.id))?.status).toBe('approved')
          await refused(send(s, room.roomId, `events/${event.id}/cancel`, {}, room.key), 400, NEED_REASON)
          await ok(send(s, room.roomId, `events/${event.id}/cancel`, { reason: 'Видео не сохранилось' }, room.key))
          const [view] = await eventsOf(s, room.roomId, vera.key)
          expect(view.outcome).toMatchObject({ status: 'cancelled', approved: { outcome: '1' }, finalAt: null, void: false, payouts: [] })
          expect(view.refunds).toEqual([
            { memberId: borya.memberId, amount: 300 },
            { memberId: vera.memberId, amount: 100 },
          ])
          s.clock.now += 30 * DAY
          expect((await outcomeOf(s, room.roomId, vera.key, event.id))?.status).toBe('cancelled')
        })

        it('отменено до предложения или во время голосования — предложить, возразить, решить, проголосовать — 409', async () => {
          const s = await server()
          const { room, borya, vera } = await room3(s)
          const gosha = await member(s, room, 'Гоша')
          const early = await closedEvent(s, room.roomId, borya, vera)
          const voting = await closedEvent(s, room.roomId, borya, vera)
          await ok(bet(s, room.roomId, room.key, voting.id, { outcome: '1', amount: 100 }))
          s.clock.now = early.closesAt
          await ok(send(s, room.roomId, `events/${early.id}/cancel`, { reason: 'Передумали' }, room.key))
          await refused(act(s, room.roomId, borya.key, early.id, 'propose', { outcome: '1' }), 409, EVENT_CANCELLED)
          await ok(act(s, room.roomId, borya.key, voting.id, 'propose', { outcome: '1' }))
          await ok(act(s, room.roomId, vera.key, voting.id, 'object', { reason: 'Не так' }))
          await ok(send(s, room.roomId, `events/${voting.id}/cancel`, { reason: 'Спорим зря' }, room.key))
          await refused(act(s, room.roomId, gosha.key, voting.id, 'vote', { outcome: '1' }), 409, EVENT_CANCELLED)
          await refused(act(s, room.roomId, room.key, voting.id, 'object', { reason: 'И я' }), 409, EVENT_CANCELLED)
          await refused(act(s, room.roomId, room.key, voting.id, 'decide', { outcome: '1' }), 409, EVENT_CANCELLED)
          expect(await outcomeOf(s, room.roomId, vera.key, voting.id)).toMatchObject({ status: 'cancelled', approved: null, finalAt: null })
          expect(await outcomeOf(s, room.roomId, vera.key, early.id)).toBeNull()
        })

        describe('согласие с исходом (Р-21)', () => {
          const agree = (s: TestServer, roomId: string, key: string, eventId: string, requestId?: string) => act(s, roomId, key, eventId, 'agree', { requestId })

          it('согласились все ставившие — утверждён и окончательный сразу; повтор — тот же ответ', async () => {
            const s = await server()
            const { room, borya, vera } = await room3(s)
            const gosha = await member(s, room, 'Гоша')
            const event = await closedEvent(s, room.roomId, borya, vera)
            await ok(bet(s, room.roomId, gosha.key, event.id, { outcome: '2', amount: 100 }))
            s.clock.now = event.closesAt
            await refused(agree(s, room.roomId, vera.key, event.id), 409, NOT_PROPOSED)
            await ok(act(s, room.roomId, borya.key, event.id, 'propose', { outcome: '1' }))
            await refused(agree(s, room.roomId, borya.key, event.id), 403, OWN_AGREEMENT)
            await refused(agree(s, room.roomId, room.key, event.id), 403, AGREE_BETTORS_ONLY)
            await refused(agree(s, room.roomId, vera.key, event.id, 'abc'), 400, BAD_REQUEST_ID)
            s.clock.now += HOUR
            const requestId = ulid(s.clock.now)
            const first = await ok<AgreeOutcomeResponse>(agree(s, room.roomId, vera.key, event.id, requestId))
            expect(isAgreeOutcomeResponse(first)).toBe(true)
            expect(first).toEqual({ v: PROTOCOL_VERSION, agreement: { id: expect.any(String), at: s.clock.now, by: vera.memberId } })
            // Повтор — тот же ответ без записи; второе согласие — 409; возражение согласившегося — 409
            s.clock.now += 1000
            expect(await ok(agree(s, room.roomId, vera.key, event.id, requestId))).toEqual(first)
            await refused(agree(s, room.roomId, vera.key, event.id), 409, ALREADY_AGREED)
            await refused(act(s, room.roomId, vera.key, event.id, 'object', { reason: 'Передумала' }), 409, ALREADY_AGREED)
            expect(await outcomeOf(s, room.roomId, gosha.key, event.id)).toMatchObject({
              status: 'proposed',
              agreements: [first.agreement],
              awaiting: [gosha.memberId],
              approved: null,
            })
            await ok(agree(s, room.roomId, gosha.key, event.id))
            const agreedAt = s.clock.now
            expect(await outcomeOf(s, room.roomId, vera.key, event.id)).toMatchObject({
              status: 'final',
              awaiting: [],
              approved: { outcome: '1', at: agreedAt, how: 'agreed', by: null },
              finalAt: agreedAt,
              payouts: [
                { memberId: borya.memberId, staked: 300, payout: 500, net: 200 },
                { memberId: vera.memberId, staked: 100, payout: 0, net: -100 },
                { memberId: gosha.memberId, staked: 100, payout: 0, net: -100 },
              ],
            })
            await refused(agree(s, room.roomId, gosha.key, event.id), 409, ALREADY_AGREED)
            expect(await eventEntries(s, room.roomId)).toEqual(['event.created', 'bet.placed', 'bet.placed', 'bet.placed', 'outcome.proposed', 'outcome.agreed', 'outcome.agreed'])
          })

          it('согласились не все — через сутки утверждён сам; после суток согласие — 409', async () => {
            const s = await server()
            const { room, borya, vera } = await room3(s)
            const gosha = await member(s, room, 'Гоша')
            const event = await closedEvent(s, room.roomId, borya, vera)
            await ok(bet(s, room.roomId, gosha.key, event.id, { outcome: '2', amount: 100 }))
            s.clock.now = event.closesAt
            await ok(act(s, room.roomId, borya.key, event.id, 'propose', { outcome: '1' }))
            const proposedAt = s.clock.now
            await ok(agree(s, room.roomId, vera.key, event.id))
            s.clock.now = proposedAt + DAY
            await refused(agree(s, room.roomId, gosha.key, event.id), 409, OBJECTION_OVER)
            expect(await outcomeOf(s, room.roomId, vera.key, event.id)).toMatchObject({
              status: 'approved',
              approved: { at: proposedAt + DAY, how: 'unopposed' },
              finalAt: proposedAt + 8 * DAY,
            })
          })

          it('после возражения согласия не принимаются; возразивший не соглашается', async () => {
            const s = await server()
            const { room, borya, vera } = await room3(s)
            const gosha = await member(s, room, 'Гоша')
            const event = await closedEvent(s, room.roomId, borya, vera)
            await ok(bet(s, room.roomId, gosha.key, event.id, { outcome: '2', amount: 100 }))
            s.clock.now = event.closesAt
            await ok(act(s, room.roomId, borya.key, event.id, 'propose', { outcome: '1' }))
            await ok(act(s, room.roomId, vera.key, event.id, 'object', { reason: 'Не так' }))
            await refused(agree(s, room.roomId, vera.key, event.id), 409, ALREADY_OBJECTED)
            await refused(agree(s, room.roomId, gosha.key, event.id), 409, AGREEMENT_CLOSED)
            expect(await outcomeOf(s, room.roomId, vera.key, event.id)).toMatchObject({ status: 'disputed', agreements: [], approved: null })
          })

          it('кроме предложившего, никто не ставил — окончательный в миг предложения; отменено — 409', async () => {
            const s = await server()
            const { room, borya, vera } = await room3(s)
            const { event: alone } = await newEvent(s, room.roomId, borya.key, eventForm(s))
            await ok(bet(s, room.roomId, borya.key, alone.id, { outcome: '1', amount: 300 }))
            const cancelled = await closedEvent(s, room.roomId, borya, vera)
            s.clock.now = alone.closesAt
            await ok(act(s, room.roomId, borya.key, alone.id, 'propose', { outcome: '1' }))
            expect(await outcomeOf(s, room.roomId, vera.key, alone.id)).toMatchObject({
              status: 'final',
              approved: { outcome: '1', at: s.clock.now, how: 'agreed' },
              finalAt: s.clock.now,
              void: true,
            })
            await refused(agree(s, room.roomId, vera.key, alone.id), 403, AGREE_BETTORS_ONLY)
            await ok(act(s, room.roomId, borya.key, cancelled.id, 'propose', { outcome: '1' }))
            await ok(send(s, room.roomId, `events/${cancelled.id}/cancel`, { reason: 'Передумали' }, room.key))
            await refused(agree(s, room.roomId, vera.key, cancelled.id), 409, EVENT_CANCELLED)
            await refused(agree(s, room.roomId, vera.key, ulid()), 404, NO_EVENT)
            await refused(send(s, room.roomId, `events/${alone.id}/agree`, {}), 403, NEED_KEY)
          })
        })
      })
    })

    describe('пари (Р-22)', () => {
      const HOUR = 60 * 60 * 1000
      const CONDITION = 'Вася бросит курить до Нового года'

      // Комната: Аня — ведущая, Боря, Вера и Гоша — участники
      async function room4(s: TestServer) {
        const room = await create(s)
        const borya = await member(s, room, 'Боря')
        const vera = await member(s, room, 'Вера')
        const gosha = await member(s, room, 'Гоша')
        return { room, borya, vera, gosha }
      }

      function offerForm(s: TestServer, change: Record<string, unknown> = {}): Record<string, unknown> {
        return {
          v: PROTOCOL_VERSION,
          condition: CONDITION,
          check: 'Вася сам скажет при всех',
          odds: { a: 3, b: 1 },
          amount: 300,
          closesAt: s.clock.now + HOUR,
          expectedAt: s.clock.now + 24 * HOUR,
          ...change,
        }
      }

      async function newOffer(s: TestServer, roomId: string, key: string, body: unknown): Promise<CreateOfferResponse> {
        const r = await ok<CreateOfferResponse>(send(s, roomId, 'offers', body, key))
        expect(isCreateOfferResponse(r)).toBe(true)
        return r
      }

      function offerAct(s: TestServer, roomId: string, key: string | undefined, offerId: string, action: string, body: Record<string, unknown> = {}) {
        return send(s, roomId, `offers/${offerId}/${action}`, { v: PROTOCOL_VERSION, ...body }, key)
      }

      async function offersOf(s: TestServer, roomId: string, key: string): Promise<OfferView[]> {
        const state = await ok<RoomStateResponse>(get(s, roomId, key))
        expect(isRoomStateResponse(state)).toBe(true)
        expect(Array.isArray(state.offers)).toBe(true)
        return state.offers ?? []
      }

      async function offerEntries(s: TestServer, roomId: string): Promise<string[]> {
        return (await readLog(s.storage(roomId))).map((e) => e.type).filter((t) => t.startsWith('offer.'))
      }

      it('участник предлагает открытое пари — номер, сумма соперника по кэфу, гарант — ведущий; видно всем', async () => {
        const s = await server()
        const { room, borya, vera, gosha } = await room4(s)
        const form = offerForm(s)
        const { offer } = await newOffer(s, room.roomId, borya.key, form)
        expect(offer).toEqual({
          id: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{26}$/),
          at: s.clock.now,
          authorId: borya.memberId,
          condition: CONDITION,
          check: 'Вася сам скажет при всех',
          side: 'yes',
          odds: { a: 3, b: 1 },
          amount: 300,
          takerAmount: 100,
          to: null,
          closesAt: form.closesAt,
          expectedAt: form.expectedAt,
          guarantorId: room.memberId,
          counterTo: null,
        })
        const expected = { ...offer, status: 'open', accepted: null, withdrawnAt: null, closedBy: null, outcome: null }
        for (const key of [room.key, borya.key, vera.key, gosha.key]) expect(await offersOf(s, room.roomId, key)).toEqual([expected])
        const log = await readLog(s.storage(room.roomId))
        expect(log.at(-1)).toMatchObject({ type: 'offer.created', id: offer.id, memberId: borya.memberId, guarantor: room.memberId, counterTo: null, requestId: expect.any(String) })
        // Адресное, сторона «не сбудется», свой гарант; «100 очков на 3 к 1» — соперник 33
        const second = await newOffer(s, room.roomId, borya.key, offerForm(s, { to: vera.memberId, side: 'no', guarantor: gosha.memberId, odds: { a: 3, b: 1 }, amount: 100 }))
        expect(second.offer).toMatchObject({ to: vera.memberId, side: 'no', guarantorId: gosha.memberId, amount: 100, takerAmount: 33 })
        // Адресное видят все, тайных пари нет
        expect((await offersOf(s, room.roomId, gosha.key)).map((o) => o.id)).toEqual([offer.id, second.offer.id])
        expect(await offerEntries(s, room.roomId)).toEqual(['offer.created', 'offer.created'])
      })

      it('форма с ошибкой — 400, прошедший «приём до» — 409; пари не заводится', async () => {
        const s = await server()
        const { room, borya, vera } = await room4(s)
        const now = s.clock.now
        const cases: [Record<string, unknown>, string][] = [
          [{ odds: { a: 0, b: 1 } }, BAD_ODDS],
          [{ odds: { a: 3, b: 101 } }, BAD_ODDS],
          [{ odds: { a: 1.5, b: 1 } }, BAD_ODDS],
          [{ odds: undefined }, BAD_ODDS],
          [{ odds: { a: 100, b: 1 }, amount: 99 }, TAKER_TOO_SMALL],
          [{ amount: 0 }, BAD_AMOUNT],
          [{ side: 'может быть' }, BAD_SIDE],
          [{ condition: ' ' }, NEED_CONDITION],
          [{ check: 'я'.repeat(301) }, LONG_CHECK],
          [{ closesAt: undefined }, OFFER_NEED_TIMES],
          [{ expectedAt: now + HOUR - 1 }, OFFER_EXPECTED_EARLY],
          [{ to: borya.memberId }, BAD_ADDRESSEE],
          [{ to: ulid() }, BAD_ADDRESSEE],
          [{ guarantor: borya.memberId }, BAD_GUARANTOR],
          [{ to: vera.memberId, guarantor: vera.memberId }, BAD_GUARANTOR],
          [{ guarantor: ulid() }, BAD_GUARANTOR],
          [{ requestId: 'abc' }, BAD_REQUEST_ID],
        ]
        for (const [change, error] of cases) await refused(send(s, room.roomId, 'offers', offerForm(s, change), borya.key), 400, error)
        // Ведущий — сторона пари без своего гаранта: автор или адресат
        await refused(send(s, room.roomId, 'offers', offerForm(s), room.key), 400, NEED_GUARANTOR)
        await refused(send(s, room.roomId, 'offers', offerForm(s, { to: room.memberId }), borya.key), 400, NEED_GUARANTOR)
        // Сроки — по времени сервера
        await refused(send(s, room.roomId, 'offers', offerForm(s, { closesAt: now }), borya.key), 409, OFFER_CLOSE_PASSED)
        await refused(send(s, room.roomId, 'offers', offerForm(s, { closesAt: now - HOUR, expectedAt: now }), borya.key), 409, OFFER_CLOSE_PASSED)
        // Без ключа, с ключом заявки, другая версия
        const dima = await join(s, room, 'Дима')
        await refused(send(s, room.roomId, 'offers', offerForm(s)), 403, NEED_KEY)
        await refused(send(s, room.roomId, 'offers', offerForm(s), dima.key), 403, WAITING, 'waiting')
        expect((await send(s, room.roomId, 'offers', offerForm(s, { v: PROTOCOL_VERSION + 1 }), borya.key)).status).toBe(400)
        expect(await offerEntries(s, room.roomId)).toEqual([])
        // Ведущий с гарантом — можно; «исход к» ровно в «приём до» — можно
        await newOffer(s, room.roomId, room.key, offerForm(s, { guarantor: vera.memberId, expectedAt: now + HOUR }))
        expect(await offerEntries(s, room.roomId)).toEqual(['offer.created'])
      })

      it('принять открытое: любой, кроме автора и гаранта; второй — 409 «Пари уже принято»', async () => {
        const s = await server()
        const { room, borya, vera, gosha } = await room4(s)
        const { offer } = await newOffer(s, room.roomId, borya.key, offerForm(s))
        await refused(offerAct(s, room.roomId, borya.key, offer.id, 'accept'), 403, OWN_OFFER)
        await refused(offerAct(s, room.roomId, room.key, offer.id, 'accept'), 403, GUARANTOR_TAKES)
        s.clock.now += 1000
        const accepted = await ok<AcceptOfferResponse>(offerAct(s, room.roomId, vera.key, offer.id, 'accept'))
        expect(isAcceptOfferResponse(accepted)).toBe(true)
        // У обеих сторон — суммы: автор 300, соперник 100
        expect(accepted).toEqual({ v: PROTOCOL_VERSION, accepted: { id: expect.any(String), at: s.clock.now, by: vera.memberId, offer: offer.id }, offer })
        await refused(offerAct(s, room.roomId, gosha.key, offer.id, 'accept'), 409, ALREADY_ACCEPTED)
        const [view] = await offersOf(s, room.roomId, gosha.key)
        expect(view).toMatchObject({ status: 'accepted', accepted: { by: vera.memberId, at: s.clock.now }, amount: 300, takerAmount: 100 })
        expect(await offerEntries(s, room.roomId)).toEqual(['offer.created', 'offer.accepted'])
        // Нет пари, кривой номер, без ключа
        await refused(offerAct(s, room.roomId, gosha.key, ulid(), 'accept'), 404, NO_OFFER)
        await refused(offerAct(s, room.roomId, gosha.key, 'не-номер', 'accept'), 404, NO_OFFER)
        await refused(offerAct(s, room.roomId, undefined, offer.id, 'accept'), 403, NEED_KEY)
      })

      it('адресное принимает только адресат; после «приём до» — 409 «Приём закрыт», статус «истекло»', async () => {
        const s = await server()
        const { room, borya, vera, gosha } = await room4(s)
        const { offer } = await newOffer(s, room.roomId, borya.key, offerForm(s, { to: vera.memberId }))
        await refused(offerAct(s, room.roomId, gosha.key, offer.id, 'accept'), 403, NOT_ADDRESSEE)
        await ok(offerAct(s, room.roomId, vera.key, offer.id, 'accept'))
        // Открытое, срок прошёл ровно в «приём до» — не включая
        const late = await newOffer(s, room.roomId, borya.key, offerForm(s))
        s.clock.now = late.offer.closesAt
        await refused(offerAct(s, room.roomId, gosha.key, late.offer.id, 'accept'), 409, OFFER_CLOSED)
        expect(OFFER_CLOSED).toContain('Приём закрыт')
        const views = await offersOf(s, room.roomId, room.key)
        expect(views.map((o) => o.status)).toEqual(['accepted', 'expired'])
        expect(await offerEntries(s, room.roomId)).toEqual(['offer.created', 'offer.accepted', 'offer.created'])
      })

      it('отозвать — только автор, пока не принято; отозванное не принять', async () => {
        const s = await server()
        const { room, borya, vera, gosha } = await room4(s)
        const { offer } = await newOffer(s, room.roomId, borya.key, offerForm(s))
        await refused(offerAct(s, room.roomId, vera.key, offer.id, 'revoke'), 403, ONLY_AUTHOR)
        s.clock.now += 1000
        const revoked = await ok<RevokeOfferResponse>(offerAct(s, room.roomId, borya.key, offer.id, 'revoke'))
        expect(isRevokeOfferResponse(revoked)).toBe(true)
        expect(revoked).toEqual({ v: PROTOCOL_VERSION, revoked: { id: expect.any(String), at: s.clock.now, by: borya.memberId, offer: offer.id } })
        await refused(offerAct(s, room.roomId, vera.key, offer.id, 'accept'), 409, WITHDRAWN)
        await refused(offerAct(s, room.roomId, borya.key, offer.id, 'revoke'), 409, WITHDRAWN)
        const [view] = await offersOf(s, room.roomId, vera.key)
        expect(view).toMatchObject({ status: 'withdrawn', withdrawnAt: s.clock.now, accepted: null })
        // Принятое не отзывают
        const second = await newOffer(s, room.roomId, borya.key, offerForm(s))
        await ok(offerAct(s, room.roomId, gosha.key, second.offer.id, 'accept'))
        await refused(offerAct(s, room.roomId, borya.key, second.offer.id, 'revoke'), 409, ACCEPTED_NO_WITHDRAW)
        await refused(offerAct(s, room.roomId, borya.key, ulid(), 'revoke'), 404, NO_OFFER)
        expect(await offerEntries(s, room.roomId)).toEqual(['offer.created', 'offer.revoked', 'offer.created', 'offer.accepted'])
      })

      it('встречное — новое пари автору исходного; автор принял встречное — исходное закрыто встречным', async () => {
        const s = await server()
        const { room, borya, vera, gosha } = await room4(s)
        const { offer } = await newOffer(s, room.roomId, borya.key, offerForm(s))
        s.clock.now += 1000
        const closesAt = s.clock.now + 2 * HOUR
        const c =await ok<CreateOfferResponse>(offerAct(s, room.roomId, vera.key, offer.id, 'counter', { amount: 600, closesAt }))
        expect(isCreateOfferResponse(c)).toBe(true)
        // Кэф не задан — исходного; сторона — обратная; адресат — автор исходного; гарант — тот же
        expect(c.offer).toEqual({
          ...offer,
          id: expect.any(String),
          at: s.clock.now,
          authorId: vera.memberId,
          side: 'no',
          amount: 600,
          takerAmount: 200,
          to: borya.memberId,
          closesAt,
          counterTo: offer.id,
        })
        expect((await readLog(s.storage(room.roomId))).at(-1)).toMatchObject({ type: 'offer.created', counterTo: offer.id })
        // Встречное принимает только автор исходного
        await refused(offerAct(s, room.roomId, gosha.key, c.offer.id, 'accept'), 403, NOT_ADDRESSEE)
        s.clock.now += 1000
        await ok(offerAct(s, room.roomId, borya.key, c.offer.id, 'accept'))
        const [original, countered] = await offersOf(s, room.roomId, gosha.key)
        expect(original).toMatchObject({ status: 'countered', closedBy: { offer: c.offer.id, at: s.clock.now }, accepted: null })
        expect(countered).toMatchObject({ status: 'accepted', accepted: { by: borya.memberId, at: s.clock.now } })
        await refused(offerAct(s, room.roomId, gosha.key, offer.id, 'accept'), 409, COUNTERED)
        expect(await offerEntries(s, room.roomId)).toEqual(['offer.created', 'offer.created', 'offer.accepted'])
      })

      it('встречное: свой кэф; к своему, гаранту, принятому — отказ; форма и сроки — 400 и 409', async () => {
        const s = await server()
        const { room, borya, vera, gosha } = await room4(s)
        const { offer } = await newOffer(s, room.roomId, borya.key, offerForm(s, { to: vera.memberId }))
        const closesAt = s.clock.now + HOUR
        await refused(offerAct(s, room.roomId, borya.key, offer.id, 'counter', { closesAt }), 403, OWN_COUNTER)
        await refused(offerAct(s, room.roomId, room.key, offer.id, 'counter', { closesAt }), 403, GUARANTOR_COUNTERS)
        await refused(offerAct(s, room.roomId, gosha.key, offer.id, 'counter', { closesAt }), 403, NOT_ADDRESSEE)
        const cases: [Record<string, unknown>, string][] = [
          [{ odds: { a: 0, b: 1 }, closesAt }, BAD_ODDS],
          [{ amount: -5, closesAt }, BAD_AMOUNT],
          [{ odds: { a: 100, b: 1 }, amount: 50, closesAt }, TAKER_TOO_SMALL],
          [{}, NEED_CLOSE],
          [{ closesAt: offer.expectedAt + 1 }, OFFER_EXPECTED_EARLY],
          [{ closesAt, requestId: 'abc' }, BAD_REQUEST_ID],
        ]
        for (const [body, error] of cases) await refused(offerAct(s, room.roomId, vera.key, offer.id, 'counter', body), 400, error)
        await refused(offerAct(s, room.roomId, vera.key, offer.id, 'counter', { closesAt: s.clock.now }), 409, OFFER_CLOSE_PASSED)
        await refused(offerAct(s, room.roomId, vera.key, ulid(), 'counter', { closesAt }), 404, NO_OFFER)
        // Свой кэф «2 к 1», сумма исходного 300 → соперник 150
        const c = await ok<CreateOfferResponse>(offerAct(s, room.roomId, vera.key, offer.id, 'counter', { odds: { a: 2, b: 1 }, closesAt }))
        expect(c.offer).toMatchObject({ odds: { a: 2, b: 1 }, amount: 300, takerAmount: 150, to: borya.memberId, side: 'no', guarantorId: room.memberId })
        // Исходное принято — встречного нет; после срока — «Приём закрыт»
        await ok(offerAct(s, room.roomId, vera.key, offer.id, 'accept'))
        await refused(offerAct(s, room.roomId, vera.key, offer.id, 'counter', { closesAt }), 409, COUNTER_ACCEPTED)
        const open = await newOffer(s, room.roomId, borya.key, offerForm(s))
        s.clock.now = open.offer.closesAt
        await refused(offerAct(s, room.roomId, gosha.key, open.offer.id, 'counter', { closesAt: s.clock.now + HOUR }), 409, OFFER_CLOSED)
        expect(await offerEntries(s, room.roomId)).toEqual(['offer.created', 'offer.created', 'offer.accepted', 'offer.created'])
      })

      it('повтор с тем же requestId — тот же ответ без второй записи (и после срока); чужое содержимое — 409', async () => {
        const s = await server()
        const { room, borya, vera, gosha } = await room4(s)
        const requestId = ulid(s.clock.now)
        const form = offerForm(s, { requestId })
        const first = await newOffer(s, room.roomId, borya.key, form)
        expect(await newOffer(s, room.roomId, borya.key, form)).toEqual(first)
        await refused(send(s, room.roomId, 'offers', { ...form, amount: 600 }, borya.key), 409, REQUEST_USED)
        await refused(send(s, room.roomId, 'offers', form, vera.key), 409, REQUEST_USED)
        const offerId = first.offer.id

        const counterId = ulid(s.clock.now)
        const counterBody = { amount: 600, closesAt: s.clock.now + HOUR, requestId: counterId }
        const counter = await ok<CreateOfferResponse>(offerAct(s, room.roomId, vera.key, offerId, 'counter', counterBody))
        expect(await ok(offerAct(s, room.roomId, vera.key, offerId, 'counter', counterBody))).toEqual(counter)
        await refused(offerAct(s, room.roomId, vera.key, offerId, 'counter', { ...counterBody, amount: 900 }), 409, REQUEST_USED)

        const acceptId = ulid(s.clock.now)
        const accepted = await ok(offerAct(s, room.roomId, gosha.key, offerId, 'accept', { requestId: acceptId }))
        s.clock.now = first.offer.closesAt + HOUR
        expect(await ok(offerAct(s, room.roomId, gosha.key, offerId, 'accept', { requestId: acceptId }))).toEqual(accepted)
        await refused(offerAct(s, room.roomId, vera.key, offerId, 'accept', { requestId: acceptId }), 409, REQUEST_USED)
        // Номер чужого действия: создание — для принятия, принятие — для отзыва
        await refused(offerAct(s, room.roomId, gosha.key, offerId, 'accept', { requestId }), 409, REQUEST_USED)
        await refused(offerAct(s, room.roomId, borya.key, offerId, 'revoke', { requestId: acceptId }), 409, REQUEST_USED)

        const second = await newOffer(s, room.roomId, borya.key, offerForm(s))
        const revokeId = ulid(s.clock.now)
        const revoked = await ok(offerAct(s, room.roomId, borya.key, second.offer.id, 'revoke', { requestId: revokeId }))
        expect(await ok(offerAct(s, room.roomId, borya.key, second.offer.id, 'revoke', { requestId: revokeId }))).toEqual(revoked)

        expect(await offerEntries(s, room.roomId)).toEqual(['offer.created', 'offer.created', 'offer.accepted', 'offer.created', 'offer.revoked'])
        // Повтор создания — и после срока «приём до»
        expect(await newOffer(s, room.roomId, borya.key, form)).toEqual(first)
      })

      describe('исход пари (Р-23)', () => {
        const DAY = 24 * HOUR

        // Боря предложил (гарант — ведущая Аня), Вера приняла; Гоша — не сторона
        async function acceptedOffer(s: TestServer) {
          const people = await room4(s)
          const { room, borya, vera } = people
          const { offer } = await newOffer(s, room.roomId, borya.key, offerForm(s))
          s.clock.now += 1000
          await ok(offerAct(s, room.roomId, vera.key, offer.id, 'accept'))
          s.clock.now += 1000
          return { ...people, offer }
        }

        async function outcomeOf(s: TestServer, roomId: string, key: string, offerId: string) {
          const view = (await offersOf(s, roomId, key)).find((o) => o.id === offerId)
          return view?.outcome
        }

        function mark(s: TestServer, roomId: string, key: string | undefined, offerId: string, winner: unknown, requestId?: string) {
          return offerAct(s, roomId, key, offerId, 'mark', { winner, requestId })
        }

        function decide(s: TestServer, roomId: string, key: string, offerId: string, winner: unknown, requestId?: string) {
          return offerAct(s, roomId, key, offerId, 'decide', { winner, requestId })
        }

        it('отметки сторон: поменять можно, повтор той же — без записи; совпали — утверждён согласием и окончательный сразу', async () => {
          const s = await server()
          const { room, borya, vera, gosha, offer } = await acceptedOffer(s)
          const before = await outcomeOf(s, room.roomId, gosha.key, offer.id)
          expect(before).toEqual({
            phase: 'marking',
            marks: { author: null, taker: null },
            guarantorId: room.memberId,
            turnAt: offer.expectedAt + SIDE_SILENCE,
            guarantorUntil: offer.expectedAt + SIDE_SILENCE + GUARANTOR_SILENCE,
            needSince: null,
            nominations: {},
            approved: null,
            finalAt: null,
          })
          // Боря: «прав автор»
          const first = await ok<MarkOfferResponse>(mark(s, room.roomId, borya.key, offer.id, 'author'))
          expect(isMarkOfferResponse(first)).toBe(true)
          expect(first).toEqual({ v: PROTOCOL_VERSION, marked: { id: expect.any(String), at: s.clock.now, by: borya.memberId, offer: offer.id, winner: 'author' } })
          expect((await readLog(s.storage(room.roomId))).at(-1)).toMatchObject({ type: 'offer.marked', memberId: borya.memberId, offer: offer.id, winner: 'author', requestId: expect.any(String) })
          // Та же отметка с новым номером запроса — прежняя запись, новой нет
          s.clock.now += 1000
          expect(await ok(mark(s, room.roomId, borya.key, offer.id, 'author'))).toEqual(first)
          expect(await offerEntries(s, room.roomId)).toEqual(['offer.created', 'offer.accepted', 'offer.marked'])
          expect(await outcomeOf(s, room.roomId, vera.key, offer.id)).toMatchObject({ phase: 'marking', marks: { author: 'author', taker: null } })
          // Передумал: «прав соперник»
          await ok(mark(s, room.roomId, borya.key, offer.id, 'taker'))
          s.clock.now += 1000
          // Вера согласна — утверждён согласием, окончательный сразу
          const agreed = await ok<MarkOfferResponse>(mark(s, room.roomId, vera.key, offer.id, 'taker'))
          expect(agreed.marked).toMatchObject({ by: vera.memberId, winner: 'taker' })
          const at = s.clock.now
          for (const key of [room.key, borya.key, vera.key, gosha.key]) {
            expect(await outcomeOf(s, room.roomId, key, offer.id)).toEqual({
              ...before,
              phase: 'final',
              marks: { author: 'taker', taker: 'taker' },
              guarantorUntil: null,
              approved: { winner: 'taker', at, how: 'agreement', by: null },
              finalAt: at,
            })
          }
          // После утверждения — отказ и сторонам, и гаранту
          await refused(mark(s, room.roomId, borya.key, offer.id, 'author'), 409, AGREED)
          await refused(decide(s, room.roomId, room.key, offer.id, 'author'), 409, AGREED)
          await refused(offerAct(s, room.roomId, room.key, offer.id, 'decline'), 409, AGREED)
          expect(await offerEntries(s, room.roomId)).toEqual(['offer.created', 'offer.accepted', 'offer.marked', 'offer.marked', 'offer.marked'])
        })

        it('отметка: до принятия — 409, гарант и не сторона — 403, кривое тело — 400, нет пари — 404', async () => {
          const s = await server()
          const { room, borya, gosha, offer } = await acceptedOffer(s)
          const open = await newOffer(s, room.roomId, borya.key, offerForm(s))
          expect(await outcomeOf(s, room.roomId, gosha.key, open.offer.id)).toBeNull()
          await refused(mark(s, room.roomId, borya.key, open.offer.id, 'author'), 409, MARK_EARLY)
          await refused(mark(s, room.roomId, room.key, offer.id, 'author'), 403, GUARANTOR_MARKS)
          await refused(mark(s, room.roomId, gosha.key, offer.id, 'author'), 403, NOT_SIDE)
          for (const winner of [undefined, 'yes', '', 1]) await refused(mark(s, room.roomId, borya.key, offer.id, winner), 400, BAD_MARK)
          await refused(mark(s, room.roomId, borya.key, offer.id, 'author', 'abc'), 400, BAD_REQUEST_ID)
          await refused(mark(s, room.roomId, borya.key, ulid(), 'author'), 404, NO_OFFER)
          await refused(mark(s, room.roomId, borya.key, 'не-номер', 'author'), 404, NO_OFFER)
          await refused(mark(s, room.roomId, undefined, offer.id, 'author'), 403, NEED_KEY)
          await ok(mark(s, room.roomId, borya.key, offer.id, 'author'))
          expect((await offerAct(s, room.roomId, borya.key, offer.id, 'mark', { winner: 'author', v: PROTOCOL_VERSION + 1 })).status).toBe(400)
          expect(await offerEntries(s, room.roomId)).toEqual(['offer.created', 'offer.accepted', 'offer.created', 'offer.marked'])
        })

        it('разошлись — решает гарант сразу; сторона ещё может поменять отметку; решение — окончательное через 7 дней', async () => {
          const s = await server()
          const { room, borya, vera, gosha, offer } = await acceptedOffer(s)
          await ok(mark(s, room.roomId, borya.key, offer.id, 'author'))
          // Пока не разошлись — рано
          await refused(decide(s, room.roomId, room.key, offer.id, 'author'), 409, NOT_TURN)
          s.clock.now += 1000
          await ok(mark(s, room.roomId, vera.key, offer.id, 'taker'))
          const turnAt = s.clock.now
          expect(await outcomeOf(s, room.roomId, gosha.key, offer.id)).toMatchObject({
            phase: 'guarantor',
            marks: { author: 'author', taker: 'taker' },
            turnAt,
            guarantorUntil: turnAt + GUARANTOR_SILENCE,
            approved: null,
          })
          // Не гарант — 403
          await refused(decide(s, room.roomId, gosha.key, offer.id, 'author'), 403, ONLY_GUARANTOR)
          await refused(decide(s, room.roomId, borya.key, offer.id, 'author'), 403, ONLY_GUARANTOR)
          await refused(decide(s, room.roomId, room.key, offer.id, 'maybe'), 400, BAD_MARK)
          // Та же отметка Веры ещё раз — без записи; разошлись по-прежнему
          await ok(mark(s, room.roomId, vera.key, offer.id, 'taker'))
          s.clock.now += HOUR
          const decided = await ok<DecideOfferResponse>(decide(s, room.roomId, room.key, offer.id, 'author'))
          expect(isDecideOfferResponse(decided)).toBe(true)
          expect(decided).toEqual({ v: PROTOCOL_VERSION, decided: { id: expect.any(String), at: s.clock.now, by: room.memberId, offer: offer.id, winner: 'author' } })
          const at = s.clock.now
          expect(await outcomeOf(s, room.roomId, borya.key, offer.id)).toMatchObject({
            phase: 'approved',
            guarantorUntil: null,
            approved: { winner: 'author', at, how: 'guarantor', by: room.memberId },
            finalAt: at + FINAL_TIME,
          })
          await refused(decide(s, room.roomId, room.key, offer.id, 'taker'), 409, DECIDED)
          await refused(mark(s, room.roomId, vera.key, offer.id, 'author'), 409, DECIDED)
          // Через 7 дней — окончательный (по времени запроса, будильника нет)
          s.clock.now = at + FINAL_TIME - 1
          expect((await outcomeOf(s, room.roomId, vera.key, offer.id))?.phase).toBe('approved')
          s.clock.now = at + FINAL_TIME
          expect((await outcomeOf(s, room.roomId, vera.key, offer.id))?.phase).toBe('final')
          expect(await offerEntries(s, room.roomId)).toEqual(['offer.created', 'offer.accepted', 'offer.marked', 'offer.marked', 'offer.decided'])
        })

        it('разошлись, а до решения гаранта сторона поменяла отметку и сошлись — утверждён согласием', async () => {
          const s = await server()
          const { room, borya, vera, offer } = await acceptedOffer(s)
          await ok(mark(s, room.roomId, borya.key, offer.id, 'author'))
          await ok(mark(s, room.roomId, vera.key, offer.id, 'taker'))
          expect((await outcomeOf(s, room.roomId, room.key, offer.id))?.phase).toBe('guarantor')
          s.clock.now += HOUR
          await ok(mark(s, room.roomId, borya.key, offer.id, 'taker'))
          expect(await outcomeOf(s, room.roomId, room.key, offer.id)).toMatchObject({
            phase: 'final',
            approved: { winner: 'taker', at: s.clock.now, how: 'agreement', by: null },
            finalAt: s.clock.now,
          })
          await refused(decide(s, room.roomId, room.key, offer.id, 'author'), 409, AGREED)
        })

        it('сторона молчит 3 дня после «исход к» — решает гарант; гарант молчит 3 дня — нужен другой', async () => {
          const s = await server()
          const { room, borya, gosha, offer } = await acceptedOffer(s)
          await ok(mark(s, room.roomId, borya.key, offer.id, 'author'))
          const turnAt = offer.expectedAt + SIDE_SILENCE
          s.clock.now = turnAt - 1
          await refused(decide(s, room.roomId, room.key, offer.id, 'author'), 409, NOT_TURN)
          expect((await outcomeOf(s, room.roomId, gosha.key, offer.id))?.phase).toBe('marking')
          s.clock.now = turnAt
          expect(await outcomeOf(s, room.roomId, gosha.key, offer.id)).toMatchObject({ phase: 'guarantor', turnAt, guarantorUntil: turnAt + GUARANTOR_SILENCE })
          // Гарант не решил за 3 дня
          s.clock.now = turnAt + GUARANTOR_SILENCE
          expect(await outcomeOf(s, room.roomId, gosha.key, offer.id)).toMatchObject({ phase: 'need-guarantor', needSince: turnAt + GUARANTOR_SILENCE, guarantorId: room.memberId })
          await refused(decide(s, room.roomId, room.key, offer.id, 'author'), 409, GUARANTOR_LAPSED)
          await refused(offerAct(s, room.roomId, room.key, offer.id, 'decline'), 409, GUARANTOR_LAPSED)
          expect(await offerEntries(s, room.roomId)).toEqual(['offer.created', 'offer.accepted', 'offer.marked'])
        })

        it('гарант отказался — стороны называют нового; назвали одного — он гарант, его 3 дня — с назначения', async () => {
          const s = await server()
          const { room, borya, vera, gosha, offer } = await acceptedOffer(s)
          // До принятия — 409; не гарант — 403; гарант на месте — называть рано
          const open = await newOffer(s, room.roomId, borya.key, offerForm(s))
          await refused(offerAct(s, room.roomId, room.key, open.offer.id, 'decline'), 409, MARK_EARLY)
          await refused(offerAct(s, room.roomId, gosha.key, offer.id, 'decline'), 403, ONLY_GUARANTOR)
          const nominate = (key: string, guarantor: unknown, requestId?: string) => offerAct(s, room.roomId, key, offer.id, 'nominate', { guarantor, requestId })
          await refused(nominate(borya.key, gosha.memberId), 409, GUARANTOR_PRESENT)
          // Аня отказалась
          s.clock.now += 1000
          const declined = await ok<DeclineOfferResponse>(offerAct(s, room.roomId, room.key, offer.id, 'decline'))
          expect(isDeclineOfferResponse(declined)).toBe(true)
          expect(declined).toEqual({ v: PROTOCOL_VERSION, declined: { id: expect.any(String), at: s.clock.now, by: room.memberId, offer: offer.id } })
          const declinedAt = s.clock.now
          expect(await outcomeOf(s, room.roomId, gosha.key, offer.id)).toMatchObject({ phase: 'need-guarantor', needSince: declinedAt, guarantorId: room.memberId })
          await refused(decide(s, room.roomId, room.key, offer.id, 'author'), 409, GUARANTOR_LAPSED)
          await refused(offerAct(s, room.roomId, room.key, offer.id, 'decline'), 409, GUARANTOR_LAPSED)
          // Называют только стороны и только участника не из сторон
          await refused(nominate(gosha.key, gosha.memberId), 403, NOT_SIDE)
          await refused(nominate(room.key, gosha.memberId), 403, NOT_SIDE)
          for (const bad of [borya.memberId, vera.memberId, ulid(), '', undefined, 5]) await refused(nominate(borya.key, bad), 400, BAD_GUARANTOR)
          // Боря — Гошу, Вера — Аню: не сошлись
          const named = await ok<NominateResponse>(nominate(borya.key, gosha.memberId))
          expect(isNominateResponse(named)).toBe(true)
          expect(named).toEqual({ v: PROTOCOL_VERSION, nominated: { id: expect.any(String), at: s.clock.now, by: borya.memberId, offer: offer.id, guarantor: gosha.memberId } })
          await ok(nominate(vera.key, room.memberId))
          expect(await outcomeOf(s, room.roomId, gosha.key, offer.id)).toMatchObject({
            phase: 'need-guarantor',
            nominations: { author: gosha.memberId, taker: room.memberId },
          })
          // Нужен другой гарант, пока стороны не сошлись, — и через сутки после того, как решение перешло
          // бы к гаранту (стороны молчат 3 дня после «исход к»)
          s.clock.now = offer.expectedAt + SIDE_SILENCE + DAY
          expect((await outcomeOf(s, room.roomId, gosha.key, offer.id))?.phase).toBe('need-guarantor')
          // Вера соглашается на Гошу — он гарант; решение у него сразу, его 3 дня — с назначения
          await ok(nominate(vera.key, gosha.memberId))
          const since = s.clock.now
          const [view] = (await offersOf(s, room.roomId, borya.key)).filter((o) => o.id === offer.id)
          expect(view.guarantorId).toBe(gosha.memberId)
          expect(view.outcome).toMatchObject({
            phase: 'guarantor',
            guarantorId: gosha.memberId,
            nominations: {},
            needSince: null,
            turnAt: offer.expectedAt + SIDE_SILENCE,
            guarantorUntil: since + GUARANTOR_SILENCE,
          })
          // Нашли гаранта — больше не называют; прежний гарант не решает
          await refused(nominate(borya.key, room.memberId), 409, GUARANTOR_PRESENT)
          await refused(decide(s, room.roomId, room.key, offer.id, 'author'), 403, ONLY_GUARANTOR)
          s.clock.now = since + GUARANTOR_SILENCE - 1
          expect((await outcomeOf(s, room.roomId, borya.key, offer.id))?.phase).toBe('guarantor')
          await ok(decide(s, room.roomId, gosha.key, offer.id, 'taker'))
          expect(await outcomeOf(s, room.roomId, borya.key, offer.id)).toMatchObject({ phase: 'approved', approved: { winner: 'taker', how: 'guarantor', by: gosha.memberId } })
          expect(await offerEntries(s, room.roomId)).toEqual([
            'offer.created',
            'offer.accepted',
            'offer.created',
            'offer.declined',
            'offer.nominated',
            'offer.nominated',
            'offer.nominated',
            'offer.decided',
          ])
        })

        it('повтор с тем же requestId — тот же ответ без второй записи (и после утверждения); чужое — 409', async () => {
          const s = await server()
          const { room, borya, vera, gosha, offer } = await acceptedOffer(s)
          const markId = ulid(s.clock.now)
          const marked = await ok(mark(s, room.roomId, borya.key, offer.id, 'author', markId))
          await refused(mark(s, room.roomId, borya.key, offer.id, 'taker', markId), 409, REQUEST_USED)
          await refused(mark(s, room.roomId, vera.key, offer.id, 'author', markId), 409, REQUEST_USED)
          await refused(decide(s, room.roomId, room.key, offer.id, 'author', markId), 409, REQUEST_USED)
          await ok(mark(s, room.roomId, vera.key, offer.id, 'taker'))
          // Решение гаранта и его повтор
          const decideId = ulid(s.clock.now)
          const decided = await ok(decide(s, room.roomId, room.key, offer.id, 'author', decideId))
          s.clock.now += FINAL_TIME
          expect(await ok(decide(s, room.roomId, room.key, offer.id, 'author', decideId))).toEqual(decided)
          await refused(decide(s, room.roomId, room.key, offer.id, 'taker', decideId), 409, REQUEST_USED)
          // Повтор отметки — и после утверждения
          expect(await ok(mark(s, room.roomId, borya.key, offer.id, 'author', markId))).toEqual(marked)

          // Отказ гаранта и называние нового — на втором пари
          const second = await newOffer(s, room.roomId, borya.key, offerForm(s))
          await ok(offerAct(s, room.roomId, vera.key, second.offer.id, 'accept'))
          const declineId = ulid(s.clock.now)
          const declined = await ok(offerAct(s, room.roomId, room.key, second.offer.id, 'decline', { requestId: declineId }))
          expect(await ok(offerAct(s, room.roomId, room.key, second.offer.id, 'decline', { requestId: declineId }))).toEqual(declined)
          await refused(offerAct(s, room.roomId, room.key, offer.id, 'decline', { requestId: declineId }), 409, REQUEST_USED)
          const nominateId = ulid(s.clock.now)
          const body = { guarantor: gosha.memberId, requestId: nominateId }
          const named = await ok(offerAct(s, room.roomId, borya.key, second.offer.id, 'nominate', body))
          expect(await ok(offerAct(s, room.roomId, borya.key, second.offer.id, 'nominate', body))).toEqual(named)
          await refused(offerAct(s, room.roomId, borya.key, second.offer.id, 'nominate', { ...body, guarantor: room.memberId }), 409, REQUEST_USED)
          await refused(offerAct(s, room.roomId, vera.key, second.offer.id, 'nominate', body), 409, REQUEST_USED)
          // Номер действия с исходом не годится для принятия
          await refused(offerAct(s, room.roomId, gosha.key, second.offer.id, 'accept', { requestId: nominateId }), 409, REQUEST_USED)
          expect(await offerEntries(s, room.roomId)).toEqual([
            'offer.created',
            'offer.accepted',
            'offer.marked',
            'offer.marked',
            'offer.decided',
            'offer.created',
            'offer.accepted',
            'offer.declined',
            'offer.nominated',
          ])
        })
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
