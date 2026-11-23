// Тесты сервера комнат на любом хранилище (Р-02): одни и те же — на Cloudflare-подделке
// (rooms.test.ts) и на SQLite запасной обёртки (server/node/rooms.test.ts)
import { afterEach, describe, expect, it } from 'vitest'
import {
  BAD_AMOUNT,
  BAD_OUTCOMES,
  BAD_SUBJECT,
  CANCEL_COURT,
  CANCEL_FINAL,
  CANCEL_HOST_INVOLVED,
  CANCEL_OTHERS_BETS,
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
  NOT_YET,
  OTHER,
  SAME_OUTCOMES,
  SUBJECT_NO_BETS,
  SUBJECT_YES_ONLY,
} from '../../src/rules/event'
import {
  AUCTION_ACCEPT,
  AUCTION_ADDRESSED,
  AUCTION_COUNTER,
  AUCTION_EXPECTED,
  AUCTION_EXTEND,
  AUCTION_EXTEND_MAX,
  AUCTION_HAS_BIDS,
  AUCTION_LONG,
  AUCTION_OVER,
  AUCTION_SHORT,
  BAD_BID,
  BAD_START,
  BAD_STEP,
  BANK_TOO_BIG,
  BID_LOW,
  BID_STEP,
  GUARANTOR_BIDS,
  NO_BIDS,
  NOT_AUCTION,
  ONLY_AUTHOR_TAKES,
  OWN_BID,
  SUBJECT_BIDS,
} from '../../src/rules/offer'
import {
  isBidOfferResponse,
  isTakeBidResponse,
  type BidOfferResponse,
  type TakeBidResponse,
} from '../../src/rules/protocol'
import {
  ACCEPTED_NO_WITHDRAW,
  AGREED,
  ALREADY_ACCEPTED,
  BAD_ADDRESSEE,
  BAD_GUARANTOR,
  BAD_MARK,
  BAD_ODDS,
  BAD_SIDE,
  BAD_SUBJECT as OFFER_BAD_SUBJECT,
  NEED_GUARANTOR_SUBJECT,
  SUBJECT_ADDRESSEE_NO,
  SUBJECT_AUTHOR_YES,
  SUBJECT_GUARANTOR,
  SUBJECT_TAKES,
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
  IN_COURT,
  NEED_GUARANTOR_TIME,
  NO_GUARANTOR,
  NO_GUARANTOR_CHOSEN,
  NO_GUARANTOR_JUDGES,
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
import * as A from '../../src/rules/appeal'
import * as L from '../../src/rules/lot'
import {
  isBidLotResponse,
  isLotMarkResponse,
  isLotResponse,
  type BidLotResponse,
  type LotMarkResponse,
  type LotResponse,
  type LotView,
} from '../../src/rules/protocol'
import * as C from '../../src/rules/choice'
import {
  isChoiceOptionResponse,
  isChoiceResponse,
  isChoiceStakeResponse,
  type ChoiceOptionResponse,
  type ChoiceResponse,
  type ChoiceStakeResponse,
  type ChoiceView,
} from '../../src/rules/protocol'
import * as T from '../../src/rules/settle'
import * as P from '../../src/rules/pace'
import { NORMAL_TIMES } from '../../src/rules/pace'
import { isPaceResponse, type PaceResponse } from '../../src/rules/protocol'
import {
  isSettlementView,
  isSettleModeResponse,
  isTransferResponse,
  type MemberSettlementView,
  type SettleSumView,
  type SettlementView,
  type SettleModeResponse,
  type TransferResponse,
  type TransferView,
} from '../../src/rules/protocol'
import {
  isAppealResponse,
  isJoinAppealResponse,
  isJudgeResponse,
  isReplaceJurorResponse,
  type AppealResponse,
  type JoinAppealResponse,
  type JudgeResponse,
  type ReplaceJurorResponse,
} from '../../src/rules/protocol'
import { BAD_CURRENCY, LONG_MEMBER_NAME, LONG_ROOM_NAME, NAME_TAKEN, NEED_MEMBER_NAME, NEED_ROOM_NAME } from '../../src/rules/room'
import { ulid } from '../../src/rules/ulid'
import { BAD_REQUEST_ID, CREATION_OFF, NEED_CLOSE, NEED_KEY, NEED_PARTY, WRONG_PASSWORD } from './http'
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
  BETS_CLOSED_PROPOSED,
  BETTORS_ONLY,
  DEVICE_LINK_TTL,
  EVENT_CANCELLED,
  EVENT_TAKEN,
  HOST_INTERESTED,
  HOST_ONLY,
  JOIN_TAKEN,
  NO_EVENT,
  NO_CHOICE,
  NO_COURT,
  NO_LOT,
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
  PROPOSAL_WITHDRAWN,
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
import { START_TIME, type TestServer } from './testing'
import {
  BACKUP_FORMAT,
  BAD_BACKUP,
  BAD_LOG,
  BAD_STORE,
  checkBackup,
  LOG_ORDER,
  NEED_FULL,
  UNKNOWN_FORMAT,
} from '../../src/rules/backup'
import { BACKUP_OFF, OTHER_ROOM } from './http'
import { ROOM_EXISTS } from './room'

const PASSWORD = 'пароль-компании'
const FORM = { v: PROTOCOL_VERSION, password: PASSWORD, name: 'Дача', currency: 'RUB', hostName: 'Аня' }

// peer — сервер другой обёртки: на него грузят копию в «круге» выгрузки и загрузки; нет — та же обёртка
export function roomsSuite(
  storageName: string,
  start: (password: string | undefined) => Promise<TestServer>,
  peer?: (password: string | undefined) => Promise<TestServer>,
): void {
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
          // Темп не выбран — обычный (Р-35)
          room: { id: created.roomId, name: 'Дача', currency: 'RUB', hostId: created.memberId, createdAt: s.clock.now, pace: 'normal', times: NORMAL_TIMES },
          members: [{ id: created.memberId, name: 'Аня' }],
          me: created.memberId,
          events: [],
          offers: [],
          // Лоты (Р-38) и выборы (Р-39): списки и счётчики lots и choices у чисел «Расчёта»
          lots: [],
          choices: [],
          settlement: {
            mode: 'stakes',
            members: [
              {
                memberId: created.memberId,
                total: { amount: 0, events: 0, offers: 0, lots: 0, choices: 0 },
                pending: { amount: 0, events: 0, offers: 0, lots: 0, choices: 0 },
                inPlay: { amount: 0, events: 0, offers: 0, lots: 0, choices: 0 },
                sent: 0,
                received: 0,
                balance: 0,
              },
            ],
            transfers: [],
            suggestions: [],
          },
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
          subjectRule: true,
        })
        // Сроки события (Р-35) — в ответе комнаты и в записи; в обычной комнате — обычный набор
        const expected = { ...event, times: NORMAL_TIMES, status: 'open', clarifications: [], bets: [], cancelled: null, refunds: [], outcome: null }
        for (const key of [room.key, borya.key, vera.key]) expect(await eventsOf(s, room.roomId, key)).toEqual([expected])
        expect(await eventEntries(s, room.roomId)).toEqual(['event.created'])
        expect((await readLog(s.storage(room.roomId))).at(-1)).toMatchObject({ type: 'event.created', times: NORMAL_TIMES })
        // Без предмета спора — null
        const second = await newEvent(s, room.roomId, room.key, eventForm(s))
        expect(second.event.subjectId).toBeNull()
        expect(second.event.subjectRule).toBe(false)
        // Признак правила предмета (Р-26) — в записи только у события с предметом
        const created = (await readLog(s.storage(room.roomId))).filter((e) => e.type === 'event.created')
        expect(created.map((e) => 'subjectRule' in e && e.subjectRule)).toEqual([1, false])
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
        await ok(bet(s, room.roomId, vera.key, event.id, { outcome: '1', amount: 100 }))
        s.clock.now += 1000
        await ok(bet(s, room.roomId, borya.key, event.id, { outcome: '2', amount: 50 }))
        const [view] = await eventsOf(s, room.roomId, room.key)
        expect(view.bets.map((b) => [b.memberId, b.outcome, b.amount, b.at])).toEqual([
          [borya.memberId, '1', 300, s.clock.now - 2000],
          [vera.memberId, '1', 100, s.clock.now - 1000],
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

      it('предмет спора (Р-26): только на «Да»; в событии со своими исходами — не ставит; остальные — как всегда', async () => {
        const s = await server()
        const { room, borya, vera } = await room3(s)
        const { event } = await newEvent(s, room.roomId, borya.key, eventForm(s, { subject: vera.memberId }))
        await refused(bet(s, room.roomId, vera.key, event.id, { outcome: '2', amount: 100 }), 403, SUBJECT_YES_ONLY)
        await ok(bet(s, room.roomId, vera.key, event.id, { outcome: '1', amount: 300 }))
        await ok(bet(s, room.roomId, borya.key, event.id, { outcome: '2', amount: 100 }))
        const own = await newEvent(s, room.roomId, borya.key, eventForm(s, { subject: vera.memberId, outcomes: ['<30', '30–50'] }))
        for (const outcome of ['1', '2', '3']) {
          await refused(bet(s, room.roomId, vera.key, own.event.id, { outcome, amount: 50 }), 403, SUBJECT_NO_BETS)
        }
        await ok(bet(s, room.roomId, room.key, own.event.id, { outcome: '2', amount: 50 }))
        const [a, b] = await eventsOf(s, room.roomId, room.key)
        expect(a.bets.map((x) => [x.memberId, x.outcome])).toEqual([
          [vera.memberId, '1'],
          [borya.memberId, '2'],
        ])
        expect(b.bets.map((x) => x.memberId)).toEqual([room.memberId])
        expect(await eventEntries(s, room.roomId)).toEqual(['event.created', 'bet.placed', 'bet.placed', 'event.created', 'bet.placed'])
      })

      it('старое событие без признака правила (до выкатки) — предмет ставит на любой исход, как раньше', async () => {
        const s = await server()
        const { room, borya, vera } = await room3(s)
        const id = ulid(s.clock.now)
        await append(s.storage(room.roomId), [
          {
            id,
            at: s.clock.now,
            memberId: borya.memberId,
            type: 'event.created',
            condition: CONDITION,
            check: 'Скрин',
            outcomes: [
              { id: '1', title: 'Да' },
              { id: '2', title: 'Нет' },
            ],
            closesAt: s.clock.now + HOUR,
            expectedAt: s.clock.now + 2 * HOUR,
            subject: vera.memberId,
            requestId: ulid(s.clock.now),
          },
        ])
        s.clock.now += 1
        await ok(bet(s, room.roomId, vera.key, id, { outcome: '2', amount: 100 }))
        const [view] = await eventsOf(s, room.roomId, room.key)
        expect(view.subjectRule).toBe(false)
        expect(view.bets.map((x) => [x.memberId, x.outcome, x.amount])).toEqual([[vera.memberId, '2', 100]])
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

      it('чужих ставок нет — автор отменяет без причины: «отменено», ставки возвращаются, новых ставок нет', async () => {
        const s = await server()
        const { room, borya, vera } = await room3(s)
        const { event } = await newEvent(s, room.roomId, borya.key, eventForm(s))
        await ok(bet(s, room.roomId, borya.key, event.id, { outcome: '1', amount: 300 }))
        await ok(bet(s, room.roomId, borya.key, event.id, { outcome: '2', amount: 50 }))
        const cancel = (key: string, body: unknown = {}) => send(s, room.roomId, `events/${event.id}/cancel`, body, key)
        // Для Веры и ведущего ставки Бори — чужие (Р-29)
        await refused(cancel(vera.key, { reason: 'Хочу' }), 403, CANCEL_OTHERS_BETS)
        await refused(cancel(room.key), 400, NEED_REASON)
        expect(await eventEntries(s, room.roomId)).toEqual(['event.created', 'bet.placed', 'bet.placed'])
        s.clock.now += 1000
        // Тело не нужно: POST без тела
        const r = await ok<CancelEventResponse>(
          s.send(`/rooms/${room.roomId}/events/${event.id}/cancel`, { method: 'POST', headers: { Authorization: 'Bearer ' + borya.key } }),
        )
        expect(r).toEqual({ v: PROTOCOL_VERSION, cancelled: { at: s.clock.now, by: borya.memberId, reason: null } })
        const [view] = await eventsOf(s, room.roomId, vera.key)
        expect(view.status).toBe('cancelled')
        expect(view.cancelled).toEqual(r.cancelled)
        expect(view.refunds).toEqual([{ memberId: borya.memberId, amount: 350 }])
        await refused(bet(s, room.roomId, vera.key, event.id, { outcome: '1', amount: 10 }), 409, EVENT_CANCELLED)
        // Повтор отмены — тот же ответ без новой записи
        s.clock.now += 1000
        expect(await ok(cancel(borya.key))).toEqual(r)
        expect(await eventEntries(s, room.roomId)).toEqual(['event.created', 'bet.placed', 'bet.placed', 'event.cancelled'])
      })

      it('есть чужие ставки — автор не отменяет и пока приём идёт; ведущий — только с причиной', async () => {
        const s = await server()
        const { room, borya, vera } = await room3(s)
        const { event } = await newEvent(s, room.roomId, borya.key, eventForm(s))
        await ok(bet(s, room.roomId, vera.key, event.id, { outcome: '1', amount: 100 }))
        const cancel = (key: string, body: unknown = {}) => send(s, room.roomId, `events/${event.id}/cancel`, body, key)
        await refused(cancel(borya.key), 403, CANCEL_OTHERS_BETS)
        s.clock.now = event.closesAt
        await refused(cancel(borya.key, { reason: 'Передумал' }), 403, CANCEL_OTHERS_BETS)
        await refused(cancel(room.key), 400, NEED_REASON)
        await refused(cancel(room.key, { reason: '  ' }), 400, NEED_REASON)
        await refused(cancel(room.key, { reason: 'я'.repeat(301) }), 400, LONG_REASON)
        const r = await ok<CancelEventResponse>(cancel(room.key, { reason: ' Условие поняли по-разному ' }))
        expect(r.cancelled).toEqual({ at: s.clock.now, by: room.memberId, reason: 'Условие поняли по-разному' })
        const [view] = await eventsOf(s, room.roomId, borya.key)
        expect(view).toMatchObject({ status: 'cancelled', refunds: [{ memberId: vera.memberId, amount: 100 }] })
        expect(NEED_REASON).toBe('Нужна причина отмены')
      })

      it('ведущий ставил: при чужих ставках не отменяет и с причиной — отказ без записи', async () => {
        const s = await server()
        const { room, borya, vera } = await room3(s)
        const { event } = await newEvent(s, room.roomId, borya.key, eventForm(s))
        await ok(bet(s, room.roomId, room.key, event.id, { outcome: '1', amount: 50 }))
        await ok(bet(s, room.roomId, vera.key, event.id, { outcome: '2', amount: 100 }))
        await refused(send(s, room.roomId, `events/${event.id}/cancel`, { reason: 'Условие плохое' }, room.key), 403, CANCEL_HOST_INVOLVED)
        expect(await eventEntries(s, room.roomId)).toEqual(['event.created', 'bet.placed', 'bet.placed'])
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
          // До закрытия приёма — досрочно («Исход уже известен», Р-27): тесты ниже; не автор — нельзя и тогда
          await refused(propose(vera.key, '1'), 403, PROPOSER_ONLY)
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

        it('«Исход уже известен» (Р-27): автор предлагает до «приём до» — приём закрыт навсегда; согласие всех — окончательный сразу', async () => {
          const s = await server()
          const { room, borya, vera } = await room3(s)
          const event = await closedEvent(s, room.roomId, borya, vera)
          s.clock.now += 1000
          const proposedAt = s.clock.now
          expect(proposedAt).toBeLessThan(event.closesAt)
          const first = await ok<ProposeOutcomeResponse>(act(s, room.roomId, borya.key, event.id, 'propose', { outcome: '1' }))
          expect(first.proposal).toMatchObject({ at: proposedAt, by: borya.memberId, outcome: '1' })
          // С этого мига ставок нет — и после «приём до»
          await refused(bet(s, room.roomId, vera.key, event.id, { outcome: '2', amount: 50 }), 409, BETS_CLOSED_PROPOSED)
          await refused(bet(s, room.roomId, room.key, event.id, { outcome: '1', amount: 50 }), 409, BETS_CLOSED_PROPOSED)
          const [view] = await eventsOf(s, room.roomId, vera.key)
          expect(view).toMatchObject({ status: 'closed', closedAt: proposedAt, outcome: { status: 'proposed', awaiting: [vera.memberId] } })
          expect(view.bets.length).toBe(2)
          // Автор не отменяет: есть ставка Веры (Р-29)
          await refused(send(s, room.roomId, `events/${event.id}/cancel`, {}, borya.key), 403, CANCEL_OTHERS_BETS)
          await refused(act(s, room.roomId, borya.key, event.id, 'propose', { outcome: '2' }), 409, ALREADY_PROPOSED)
          s.clock.now = event.closesAt + 1000
          await refused(bet(s, room.roomId, vera.key, event.id, { outcome: '2', amount: 50 }), 409, BETS_CLOSED_PROPOSED)
          // Вера согласна — окончательный сразу (Р-21)
          await ok(act(s, room.roomId, vera.key, event.id, 'agree', {}))
          expect(await outcomeOf(s, room.roomId, vera.key, event.id)).toMatchObject({ status: 'final', approved: { outcome: '1', how: 'agreed' } })
          expect(await eventEntries(s, room.roomId)).toEqual(['event.created', 'bet.placed', 'bet.placed', 'outcome.proposed', 'outcome.agreed'])
        })

        it('возражение на досрочный исход — ведущий решает «ещё не известно»: предложение снято, приём закрыт, исход предлагают снова', async () => {
          const s = await server()
          const { room, borya, vera } = await room3(s)
          const gosha = await member(s, room, 'Гоша')
          const event = await closedEvent(s, room.roomId, borya, vera)
          await ok(bet(s, room.roomId, gosha.key, event.id, { outcome: '2', amount: 100 }))
          s.clock.now += 1000
          const proposedAt = s.clock.now
          const requestId = ulid(s.clock.now)
          const first = await ok<ProposeOutcomeResponse>(act(s, room.roomId, borya.key, event.id, 'propose', { outcome: '1', requestId }))
          await ok(act(s, room.roomId, vera.key, event.id, 'object', { reason: 'Ещё не взяли на работу' }))
          await refused(act(s, room.roomId, room.key, event.id, 'decide', { outcome: 'что-то' }), 400, NO_OUTCOME)
          const decided = await ok<DecideOutcomeResponse>(act(s, room.roomId, room.key, event.id, 'decide', { outcome: NOT_YET }))
          expect(decided.decision).toMatchObject({ by: room.memberId, outcome: NOT_YET })
          expect(await outcomeOf(s, room.roomId, vera.key, event.id)).toMatchObject({
            status: 'withdrawn',
            decision: { outcome: NOT_YET },
            approved: null,
            finalAt: null,
            payouts: [],
          })
          // Снято: решать, возражать и ставить нельзя; приём закрыт и после «приём до»
          await refused(act(s, room.roomId, room.key, event.id, 'decide', { outcome: '2' }), 409, ALREADY_DECIDED)
          await refused(act(s, room.roomId, gosha.key, event.id, 'object', { reason: 'И я' }), 409, PROPOSAL_WITHDRAWN)
          await refused(bet(s, room.roomId, gosha.key, event.id, { outcome: '1', amount: 50 }), 409, BETS_CLOSED_PROPOSED)
          s.clock.now = event.closesAt + HOUR
          const [view] = await eventsOf(s, room.roomId, vera.key)
          expect(view).toMatchObject({ status: 'closed', closedAt: proposedAt, outcome: { status: 'withdrawn' } })
          // Повтор первого предложения — тот же ответ; новое предложение — можно
          expect(await ok(act(s, room.roomId, borya.key, event.id, 'propose', { outcome: '1', requestId }))).toEqual(first)
          await refused(act(s, room.roomId, vera.key, event.id, 'propose', { outcome: '2' }), 403, PROPOSER_ONLY)
          const second = await ok<ProposeOutcomeResponse>(act(s, room.roomId, borya.key, event.id, 'propose', { outcome: '2' }))
          expect(second.proposal).toMatchObject({ at: s.clock.now, outcome: '2' })
          await refused(act(s, room.roomId, borya.key, event.id, 'propose', { outcome: '1' }), 409, ALREADY_PROPOSED)
          expect(await outcomeOf(s, room.roomId, vera.key, event.id)).toMatchObject({ status: 'proposed', proposal: second.proposal, objections: [], decision: null })
          // Второе предложение — после «приём до»: «ещё не известно» уже нельзя, решает ведущий как обычно
          await ok(act(s, room.roomId, gosha.key, event.id, 'object', { reason: 'Не так' }))
          await refused(act(s, room.roomId, room.key, event.id, 'decide', { outcome: NOT_YET }), 400, NO_OUTCOME)
          await ok(act(s, room.roomId, room.key, event.id, 'decide', { outcome: '2' }))
          expect(await outcomeOf(s, room.roomId, vera.key, event.id)).toMatchObject({ status: 'approved', approved: { outcome: '2', how: 'host' } })
          expect(await eventEntries(s, room.roomId)).toEqual([
            'event.created',
            'bet.placed',
            'bet.placed',
            'bet.placed',
            'outcome.proposed',
            'outcome.objected',
            'outcome.decided',
            'outcome.proposed',
            'outcome.objected',
            'outcome.decided',
          ])
        })

        it('голосование по досрочному исходу: большинство за «ещё не известно» — предложение снято', async () => {
          const s = await server()
          const { room, borya, vera } = await room3(s)
          const gosha = await member(s, room, 'Гоша')
          const dasha = await member(s, room, 'Даша')
          const event = await closedEvent(s, room.roomId, borya, vera)
          await ok(bet(s, room.roomId, room.key, event.id, { outcome: '1', amount: 100 })) // ведущий ставил — голосуют
          s.clock.now += 1000
          await ok(act(s, room.roomId, borya.key, event.id, 'propose', { outcome: '1' }))
          await ok(act(s, room.roomId, vera.key, event.id, 'object', { reason: 'Рано' }))
          expect(await outcomeOf(s, room.roomId, vera.key, event.id)).toMatchObject({ status: 'voting', voters: [gosha.memberId, dasha.memberId] })
          await ok(act(s, room.roomId, gosha.key, event.id, 'vote', { outcome: NOT_YET }))
          await ok(act(s, room.roomId, dasha.key, event.id, 'vote', { outcome: NOT_YET }))
          expect(await outcomeOf(s, room.roomId, vera.key, event.id)).toMatchObject({ status: 'withdrawn', approved: null })
          await refused(act(s, room.roomId, dasha.key, event.id, 'vote', { outcome: '1' }), 409, ALREADY_VOTED)
          await ok(act(s, room.roomId, borya.key, event.id, 'propose', { outcome: '2' }))
          expect(await outcomeOf(s, room.roomId, vera.key, event.id)).toMatchObject({ status: 'proposed', proposal: { outcome: '2' }, voters: [], votes: [] })
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
          // Ведущий ставил — сейчас не отменит (Р-29); отмена из журнала до Р-29 действует, как была
          await refused(send(s, room.roomId, `events/${voting.id}/cancel`, { reason: 'Спорим зря' }, room.key), 403, CANCEL_HOST_INVOLVED)
          await append(s.storage(room.roomId), [
            { id: ulid(s.clock.now), at: s.clock.now, memberId: room.memberId, type: 'event.cancelled', event: voting.id, reason: 'Спорим зря' },
          ])
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
          subjectId: null,
          guarantorRule: true,
        })
        // Сроки пари (Р-35) — в ответе комнаты; в обычной комнате — обычный набор, и в записи тоже
        const expected = { ...offer, times: NORMAL_TIMES, status: 'open', accepted: null, withdrawnAt: null, closedBy: null, outcome: null }
        for (const key of [room.key, borya.key, vera.key, gosha.key]) expect(await offersOf(s, room.roomId, key)).toEqual([expected])
        const log = await readLog(s.storage(room.roomId))
        expect(log.at(-1)).toMatchObject({ type: 'offer.created', id: offer.id, memberId: borya.memberId, guarantor: room.memberId, counterTo: null, times: NORMAL_TIMES, requestId: expect.any(String) })
        // Правило гаранта (Р-31) — пометкой в записи нового пари
        expect(log.at(-1)).toMatchObject({ guarantorRule: 1 })
        // Ни о ком — поля «о ком спор» в записи нет, как у пари до выкатки (Р-26)
        expect('subject' in (log.at(-1) ?? {})).toBe(false)
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

      it('о ком спор (Р-26): предмет — только на «сбудется», не гарант; принять — только если автор за «не сбудется»', async () => {
        const s = await server()
        const { room, borya, vera, gosha } = await room4(s)
        // Форма: предмет — участник; автор-предмет — только «сбудется»; адресат-предмет — сторона автора «не сбудется»
        const cases: [Record<string, unknown>, string][] = [
          [{ subject: '' }, OFFER_BAD_SUBJECT],
          [{ subject: ulid() }, OFFER_BAD_SUBJECT],
          [{ subject: borya.memberId, side: 'no' }, SUBJECT_AUTHOR_YES],
          [{ subject: vera.memberId, to: vera.memberId, side: 'yes' }, SUBJECT_ADDRESSEE_NO],
          [{ subject: gosha.memberId, guarantor: gosha.memberId }, SUBJECT_GUARANTOR],
          [{ subject: room.memberId }, NEED_GUARANTOR_SUBJECT],
        ]
        for (const [change, error] of cases) await refused(send(s, room.roomId, 'offers', offerForm(s, change), borya.key), 400, error)
        expect(await offerEntries(s, room.roomId)).toEqual([])
        // Предмет — автор, за «сбудется»: можно; в записи и в ответе — о ком спор
        const own = await newOffer(s, room.roomId, borya.key, offerForm(s, { subject: borya.memberId }))
        expect(own.offer.subjectId).toBe(borya.memberId)
        expect((await readLog(s.storage(room.roomId))).at(-1)).toMatchObject({ type: 'offer.created', subject: borya.memberId })
        // Предмет — Вера, автор за «сбудется»: Вера не принимает (403), другие — да
        const yes = await newOffer(s, room.roomId, borya.key, offerForm(s, { subject: vera.memberId }))
        await refused(offerAct(s, room.roomId, vera.key, yes.offer.id, 'accept'), 403, SUBJECT_TAKES)
        await refused(offerAct(s, room.roomId, vera.key, yes.offer.id, 'counter', { closesAt: s.clock.now + HOUR }), 403, SUBJECT_TAKES)
        await ok(offerAct(s, room.roomId, gosha.key, yes.offer.id, 'accept'))
        // Автор за «не сбудется» — Вера принимает и сама — на «сбудется»
        const no = await newOffer(s, room.roomId, borya.key, offerForm(s, { subject: vera.memberId, side: 'no' }))
        await ok(offerAct(s, room.roomId, vera.key, no.offer.id, 'accept'))
        // Встречное к пари о Боре (он — автор, за «сбудется»): о ком спор переходит, Боря его принимает
        const c = await ok<CreateOfferResponse>(offerAct(s, room.roomId, gosha.key, own.offer.id, 'counter', { closesAt: s.clock.now + HOUR }))
        expect(c.offer).toMatchObject({ side: 'no', to: borya.memberId, subjectId: borya.memberId })
        await ok(offerAct(s, room.roomId, borya.key, c.offer.id, 'accept'))
        const views = await offersOf(s, room.roomId, room.key)
        expect(views.map((o) => [o.subjectId, o.status, o.accepted?.by ?? null])).toEqual([
          [borya.memberId, 'countered', null],
          [vera.memberId, 'accepted', gosha.memberId],
          [vera.memberId, 'accepted', vera.memberId],
          [borya.memberId, 'accepted', borya.memberId],
        ])
        // Повтор создания с тем же номером запроса, но другим «о ком спор» — 409
        const requestId = ulid(s.clock.now)
        await newOffer(s, room.roomId, borya.key, offerForm(s, { subject: gosha.memberId, requestId }))
        await refused(send(s, room.roomId, 'offers', offerForm(s, { subject: vera.memberId, requestId }), borya.key), 409, REQUEST_USED)
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

      describe('«Торг до …» (Р-37)', () => {
        const MINUTE = 60 * 1000

        // Боря за «сбудется» ставит 300; старт — 100, шаг — 20; торг — час, гарант — ведущая Аня
        function auctionForm(s: TestServer, change: Record<string, unknown> = {}): Record<string, unknown> {
          return offerForm(s, { odds: undefined, auction: { start: 100, step: 20 }, ...change })
        }

        function bid(s: TestServer, roomId: string, key: string | undefined, offerId: string, amount: unknown, requestId?: string) {
          return offerAct(s, roomId, key, offerId, 'bid', { amount, requestId })
        }

        function take(s: TestServer, roomId: string, key: string | undefined, offerId: string, requestId?: string) {
          return offerAct(s, roomId, key, offerId, 'bid/accept', { requestId })
        }

        async function bidOk(s: TestServer, roomId: string, key: string, offerId: string, amount: number, requestId?: string): Promise<BidOfferResponse> {
          const r = await ok<BidOfferResponse>(bid(s, roomId, key, offerId, amount, requestId))
          expect(isBidOfferResponse(r)).toBe(true)
          return r
        }

        async function viewOf(s: TestServer, roomId: string, key: string, offerId: string): Promise<OfferView | undefined> {
          return (await offersOf(s, roomId, key)).find((o) => o.id === offerId)
        }

        it('пари в торге: старт, шаг, конец; встречные перебивают друг друга, видны всем; повтор встречного — тот же ответ', async () => {
          const s = await server()
          const { room, borya, vera, gosha } = await room4(s)
          const form = auctionForm(s)
          const { offer } = await newOffer(s, room.roomId, borya.key, form)
          const closesAt = form.closesAt as number
          expect(offer).toMatchObject({
            authorId: borya.memberId,
            side: 'yes',
            amount: 300,
            takerAmount: 100,
            odds: { a: 300, b: 100 },
            to: null,
            closesAt,
            guarantorId: room.memberId,
            counterTo: null,
            auction: { start: 100, step: 20, latestEnd: closesAt + AUCTION_EXTEND_MAX },
          })
          // В журнале — условия торга; кэф — стартовый «сумма автора к старту»
          expect((await readLog(s.storage(room.roomId))).at(-1)).toMatchObject({ type: 'offer.created', auction: { start: 100, step: 20 }, odds: { a: 300, b: 100 }, to: null })
          expect(await viewOf(s, room.roomId, gosha.key, offer.id)).toMatchObject({ status: 'open', accepted: null, outcome: null, bidding: { bids: [], best: null, endsAt: closesAt, result: null } })
          // Шаг не задан — 10 % старта
          const plain = await newOffer(s, room.roomId, borya.key, auctionForm(s, { auction: { start: 150 } }))
          expect(plain.offer.auction).toMatchObject({ start: 150, step: 15 })

          // Вера — 100 (старт), Гоша — 120, Вера перебила — 140
          s.clock.now += 1000
          const requestId = ulid(s.clock.now)
          const first = await bidOk(s, room.roomId, vera.key, offer.id, 100, requestId)
          expect(first).toEqual({ v: PROTOCOL_VERSION, bid: { id: expect.any(String), at: s.clock.now, by: vera.memberId, offer: offer.id, amount: 100 }, offer: { ...offer, takerAmount: 100 } })
          expect((await readLog(s.storage(room.roomId))).at(-1)).toMatchObject({ type: 'offer.bid', memberId: vera.memberId, offer: offer.id, amount: 100, requestId })
          s.clock.now += 1000
          const second = await bidOk(s, room.roomId, gosha.key, offer.id, 120)
          s.clock.now += 1000
          const third = await bidOk(s, room.roomId, vera.key, offer.id, 140)
          expect(third.offer).toMatchObject({ takerAmount: 140, odds: { a: 300, b: 140 } })
          const bids = [first.bid, second.bid, third.bid].map(({ id, at, by, amount }) => ({ id, at, by, amount }))
          for (const key of [room.key, borya.key, vera.key, gosha.key]) {
            expect(await viewOf(s, room.roomId, key, offer.id)).toMatchObject({
              status: 'open',
              takerAmount: 140,
              bidding: { bids, best: bids[2], endsAt: closesAt, result: null },
            })
          }
          // Повтор встречного с тем же номером — тот же ответ без записи (условия — нынешние); другая сумма или
          // другой участник — 409
          expect((await ok<BidOfferResponse>(bid(s, room.roomId, vera.key, offer.id, 100, requestId))).bid).toEqual(first.bid)
          await refused(bid(s, room.roomId, vera.key, offer.id, 200, requestId), 409, REQUEST_USED)
          await refused(bid(s, room.roomId, gosha.key, offer.id, 100, requestId), 409, REQUEST_USED)
          expect(await offerEntries(s, room.roomId)).toEqual(['offer.created', 'offer.created', 'offer.bid', 'offer.bid', 'offer.bid'])
        })

        it('продление: встречное на последних 2 минутах — конец через 2 минуты после него, не дальше исходного конца + 30 минут', async () => {
          const s = await server()
          const { room, borya, vera, gosha } = await room4(s)
          const { offer } = await newOffer(s, room.roomId, borya.key, auctionForm(s))
          const closesAt = offer.closesAt
          const latestEnd = closesAt + AUCTION_EXTEND_MAX
          const endsAt = async () => (await viewOf(s, room.roomId, gosha.key, offer.id))?.bidding?.endsAt
          // За 5 минут до конца — без продления
          s.clock.now = closesAt - 5 * MINUTE
          await bidOk(s, room.roomId, vera.key, offer.id, 100)
          expect(await endsAt()).toBe(closesAt)
          // За минуту — конец через 2 минуты после встречного
          s.clock.now = closesAt - MINUTE
          await bidOk(s, room.roomId, gosha.key, offer.id, 120)
          expect(await endsAt()).toBe(closesAt + MINUTE)
          // После исходного конца, но до продлённого — встречное действует и продлевает ещё
          s.clock.now = closesAt + 30 * 1000
          await bidOk(s, room.roomId, vera.key, offer.id, 140)
          expect(await endsAt()).toBe(closesAt + 30 * 1000 + AUCTION_EXTEND)
          // Перебивают за секунду до конца — до предела
          let amount = 140
          let end = (await endsAt()) as number
          const who = [gosha, vera]
          for (let i = 0; end < latestEnd; i++) {
            s.clock.now = end - 1000
            amount += 20
            await bidOk(s, room.roomId, who[i % 2].key, offer.id, amount)
            end = (await endsAt()) as number
            expect(end).toBe(Math.min(latestEnd, s.clock.now + AUCTION_EXTEND))
          }
          expect(end).toBe(latestEnd)
          // На пределе — дальше не продлевается; в миг конца встречное уже не действует
          s.clock.now = latestEnd - 1000
          await bidOk(s, room.roomId, gosha.key, offer.id, amount + 20)
          expect(await endsAt()).toBe(latestEnd)
          s.clock.now = latestEnd
          await refused(bid(s, room.roomId, vera.key, offer.id, amount + 40), 409, AUCTION_OVER)
          expect(await viewOf(s, room.roomId, borya.key, offer.id)).toMatchObject({
            status: 'accepted',
            accepted: { by: gosha.memberId, at: latestEnd },
            takerAmount: amount + 20,
            bidding: { endsAt: latestEnd, best: { by: gosha.memberId, amount: amount + 20 }, result: { how: 'end', at: latestEnd } },
          })
        })

        it('«принять сейчас»: только автор и только при встречных; лучшее принято, торг закончен; повтор — тот же ответ', async () => {
          const s = await server()
          const { room, borya, vera, gosha } = await room4(s)
          const { offer } = await newOffer(s, room.roomId, borya.key, auctionForm(s))
          await refused(take(s, room.roomId, borya.key, offer.id), 409, NO_BIDS)
          s.clock.now += 1000
          await bidOk(s, room.roomId, vera.key, offer.id, 100)
          s.clock.now += 1000
          const best = await bidOk(s, room.roomId, gosha.key, offer.id, 150)
          await refused(take(s, room.roomId, vera.key, offer.id), 403, ONLY_AUTHOR_TAKES)
          await refused(take(s, room.roomId, room.key, offer.id), 403, ONLY_AUTHOR_TAKES)
          s.clock.now += 1000
          const requestId = ulid(s.clock.now)
          const taken = await ok<TakeBidResponse>(take(s, room.roomId, borya.key, offer.id, requestId))
          expect(isTakeBidResponse(taken)).toBe(true)
          const at = s.clock.now
          expect(taken).toEqual({ v: PROTOCOL_VERSION, taken: { id: expect.any(String), at, by: borya.memberId, offer: offer.id, bid: best.bid.id }, offer: { ...offer, takerAmount: 150, odds: { a: 300, b: 150 } } })
          expect((await readLog(s.storage(room.roomId))).at(-1)).toMatchObject({ type: 'offer.bid-accepted', memberId: borya.memberId, offer: offer.id, requestId })
          for (const key of [room.key, vera.key, gosha.key]) {
            expect(await viewOf(s, room.roomId, key, offer.id)).toMatchObject({
              status: 'accepted',
              accepted: { by: gosha.memberId, at },
              takerAmount: 150,
              bidding: { result: { how: 'now', at, bid: best.bid.id } },
              outcome: { phase: 'marking', marks: { author: null, taker: null } },
            })
          }
          // Торг закончен: встречное, второе «принять сейчас», отзыв — отказ
          await refused(bid(s, room.roomId, vera.key, offer.id, 300), 409, AUCTION_OVER)
          await refused(take(s, room.roomId, borya.key, offer.id), 409, AUCTION_OVER)
          await refused(offerAct(s, room.roomId, borya.key, offer.id, 'revoke'), 409, ACCEPTED_NO_WITHDRAW)
          // Повтор — тот же ответ и после конца торга; тот же номер у другого — 409
          s.clock.now = offer.closesAt + HOUR
          expect(await ok(take(s, room.roomId, borya.key, offer.id, requestId))).toEqual(taken)
          await refused(take(s, room.roomId, vera.key, offer.id, requestId), 409, REQUEST_USED)
          await refused(bid(s, room.roomId, vera.key, offer.id, 300, requestId), 409, REQUEST_USED)
          expect(await offerEntries(s, room.roomId)).toEqual(['offer.created', 'offer.bid', 'offer.bid', 'offer.bid-accepted'])
        })

        it('конец без встречных — «не состоялось»: записи нет, торговаться и принимать нечего; без встречных автор отзывает', async () => {
          const s = await server()
          const { room, borya, vera, gosha } = await room4(s)
          const { offer } = await newOffer(s, room.roomId, borya.key, auctionForm(s))
          s.clock.now = offer.closesAt - 1
          expect((await viewOf(s, room.roomId, gosha.key, offer.id))?.status).toBe('open')
          s.clock.now = offer.closesAt
          expect(await viewOf(s, room.roomId, gosha.key, offer.id)).toMatchObject({
            status: 'failed',
            accepted: null,
            outcome: null,
            takerAmount: 100,
            bidding: { bids: [], best: null, endsAt: offer.closesAt, result: { how: 'failed', at: offer.closesAt } },
          })
          await refused(bid(s, room.roomId, vera.key, offer.id, 100), 409, AUCTION_OVER)
          await refused(take(s, room.roomId, borya.key, offer.id), 409, AUCTION_OVER)
          await refused(offerAct(s, room.roomId, vera.key, offer.id, 'mark', { winner: 'author' }), 409, MARK_EARLY)
          // В расчёте торга нет: никто никому не должен
          const state = await ok<RoomStateResponse>(get(s, room.roomId, borya.key))
          expect(state.settlement?.members.every((m) => m.total.amount === 0 && m.inPlay.amount === 0)).toBe(true)
          // Другой торг без встречных автор отзывает
          const other = await newOffer(s, room.roomId, borya.key, auctionForm(s))
          await ok(offerAct(s, room.roomId, borya.key, other.offer.id, 'revoke'))
          expect((await viewOf(s, room.roomId, gosha.key, other.offer.id))?.status).toBe('withdrawn')
          await refused(bid(s, room.roomId, vera.key, other.offer.id, 100), 409, WITHDRAWN)
          expect(await offerEntries(s, room.roomId)).toEqual(['offer.created', 'offer.created', 'offer.revoked'])
        })

        it('конец со встречным — пари принято лучшим без записи; дальше обычное пари: отметки, гарант, расчёт', async () => {
          const s = await server()
          const { room, borya, vera, gosha } = await room4(s)
          const { offer } = await newOffer(s, room.roomId, borya.key, auctionForm(s))
          s.clock.now += 1000
          const best = await bidOk(s, room.roomId, vera.key, offer.id, 100)
          s.clock.now = offer.closesAt
          expect(await viewOf(s, room.roomId, gosha.key, offer.id)).toMatchObject({
            status: 'accepted',
            accepted: { by: vera.memberId, at: offer.closesAt },
            takerAmount: 100,
            bidding: { result: { how: 'end', at: offer.closesAt, bid: best.bid.id } },
            outcome: { phase: 'marking', guarantorId: room.memberId },
          })
          // Конец торга записи не даёт
          expect(await offerEntries(s, room.roomId)).toEqual(['offer.created', 'offer.bid'])
          // Стороны — Боря и Вера; Гоша не сторона, Аня — гарант
          await refused(offerAct(s, room.roomId, gosha.key, offer.id, 'mark', { winner: 'author' }), 403, NOT_SIDE)
          await refused(offerAct(s, room.roomId, room.key, offer.id, 'mark', { winner: 'author' }), 403, GUARANTOR_MARKS)
          await refused(offerAct(s, room.roomId, borya.key, offer.id, 'revoke'), 409, ACCEPTED_NO_WITHDRAW)
          await ok(offerAct(s, room.roomId, borya.key, offer.id, 'mark', { winner: 'author' }))
          await ok(offerAct(s, room.roomId, vera.key, offer.id, 'mark', { winner: 'taker' }))
          // Разошлись — с «исход к» решает гарант: прав соперник; окончательно через 7 дней
          s.clock.now = offer.expectedAt
          await ok(offerAct(s, room.roomId, room.key, offer.id, 'decide', { winner: 'taker' }))
          s.clock.now += FINAL_TIME
          const view = await viewOf(s, room.roomId, borya.key, offer.id)
          expect(view?.outcome).toMatchObject({ phase: 'final', approved: { winner: 'taker', how: 'guarantor', by: room.memberId } })
          // Вера забирает сумму автора: Боря −300, Вера +300
          const state = await ok<RoomStateResponse>(get(s, room.roomId, gosha.key))
          const total = (id: string) => state.settlement?.members.find((m) => m.memberId === id)?.total.amount
          expect([total(borya.memberId), total(vera.memberId), total(gosha.memberId)]).toEqual([-300, 300, 0])
        })

        it('торг без гаранта (Р-36): конец со встречным, стороны молчат — суд собран сам, соперник в нём не сидит', async () => {
          const s = await server()
          const { room, borya, vera, gosha } = await room4(s)
          const { offer } = await newOffer(s, room.roomId, borya.key, auctionForm(s, { noGuarantor: true }))
          expect(offer.guarantorId).toBeNull()
          s.clock.now += 1000
          await bidOk(s, room.roomId, vera.key, offer.id, 100)
          // Ни одной записи после конца торга; стороны молчат — с «исход к» + срок молчания суд пора
          s.clock.now = offer.expectedAt + SIDE_SILENCE
          expect((await viewOf(s, room.roomId, gosha.key, offer.id))?.outcome?.phase).toBe('court')
          const drawn = (await readLog(s.storage(room.roomId))).at(-1)
          expect(drawn).toMatchObject({ type: 'court.drawn', target: offer.id, candidates: [room.memberId, gosha.memberId] })
        })

        it('отказы: форма торга — 400; автор, гарант, предмет — 403; меньше старта и шага — 409; кривая сумма — 400; обычные адреса пари к торгу — 409', async () => {
          const s = await server()
          const { room, borya, vera, gosha } = await room4(s)
          const now = s.clock.now
          const cases: [Record<string, unknown>, string][] = [
            [{ auction: { start: 0 } }, BAD_START],
            [{ auction: { start: 'сто' } }, BAD_START],
            [{ auction: { start: 100, step: 0 } }, BAD_STEP],
            [{ to: vera.memberId }, AUCTION_ADDRESSED],
            [{ closesAt: now + 10 * MINUTE - 1 }, AUCTION_SHORT],
            [{ closesAt: now + 3 * 24 * HOUR + 1, expectedAt: now + 5 * 24 * HOUR }, AUCTION_LONG],
            [{ expectedAt: now + HOUR + AUCTION_EXTEND_MAX - 1 }, AUCTION_EXPECTED],
          ]
          for (const [change, error] of cases) await refused(send(s, room.roomId, 'offers', auctionForm(s, change), borya.key), 400, error)
          expect(await offerEntries(s, room.roomId)).toEqual([])
          // Торг на 10 минут и «исход к» ровно через 30 минут после конца — можно
          await newOffer(s, room.roomId, borya.key, auctionForm(s, { closesAt: now + 10 * MINUTE, expectedAt: now + 40 * MINUTE }))

          const { offer } = await newOffer(s, room.roomId, borya.key, auctionForm(s))
          await refused(bid(s, room.roomId, borya.key, offer.id, 100), 403, OWN_BID)
          await refused(bid(s, room.roomId, room.key, offer.id, 100), 403, GUARANTOR_BIDS)
          for (const amount of [0, -5, 1.5, 'сто', undefined]) await refused(bid(s, room.roomId, vera.key, offer.id, amount), 400, BAD_BID)
          await refused(bid(s, room.roomId, vera.key, offer.id, Number.MAX_SAFE_INTEGER), 400, BANK_TOO_BIG)
          await refused(bid(s, room.roomId, vera.key, offer.id, 99), 409, BID_LOW)
          await bidOk(s, room.roomId, vera.key, offer.id, 100)
          await refused(bid(s, room.roomId, gosha.key, offer.id, 119), 409, BID_STEP)
          // Свою перебить можно
          await bidOk(s, room.roomId, vera.key, offer.id, 120)
          // Обычные адреса пари к торгу — отказ правил торга
          await refused(offerAct(s, room.roomId, gosha.key, offer.id, 'accept'), 409, AUCTION_ACCEPT)
          await refused(offerAct(s, room.roomId, gosha.key, offer.id, 'counter', { closesAt: now + HOUR }), 409, AUCTION_COUNTER)
          await refused(offerAct(s, room.roomId, borya.key, offer.id, 'revoke'), 409, AUCTION_HAS_BIDS)
          // К обычному пари торга нет; нет пари, без ключа, без тела
          const plain = await newOffer(s, room.roomId, borya.key, offerForm(s))
          await refused(bid(s, room.roomId, vera.key, plain.offer.id, 100), 409, NOT_AUCTION)
          await refused(take(s, room.roomId, borya.key, plain.offer.id), 409, NOT_AUCTION)
          await refused(bid(s, room.roomId, vera.key, ulid(), 100), 404, NO_OFFER)
          await refused(take(s, room.roomId, borya.key, ulid()), 404, NO_OFFER)
          await refused(bid(s, room.roomId, undefined, offer.id, 100), 403, NEED_KEY)
          await refused(bid(s, room.roomId, vera.key, offer.id, 140, 'abc'), 400, BAD_REQUEST_ID)
          expect((await s.send(`/rooms/${room.roomId}/offers/${offer.id}/bid/accept`, { method: 'POST', headers: { Authorization: 'Bearer ' + borya.key } })).status).toBe(200)
          // Предмет спора (Р-26) торгуется, только если автор — за «не сбудется»
          const about = await newOffer(s, room.roomId, borya.key, auctionForm(s, { subject: gosha.memberId }))
          await refused(bid(s, room.roomId, gosha.key, about.offer.id, 100), 403, SUBJECT_BIDS)
          const against = await newOffer(s, room.roomId, borya.key, auctionForm(s, { subject: gosha.memberId, side: 'no' }))
          await bidOk(s, room.roomId, gosha.key, against.offer.id, 100)
          expect(await offerEntries(s, room.roomId)).toEqual([
            'offer.created',
            'offer.created',
            'offer.bid',
            'offer.bid',
            'offer.created',
            'offer.bid-accepted',
            'offer.created',
            'offer.created',
            'offer.bid',
          ])
        })
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
              // Отметили раньше «исход к» — отсчёт всё равно с «исход к» (правило гаранта, Р-31)
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

        it('разошлись до «исход к» — гарант решает с «исход к» (Р-31); сторона ещё может поменять отметку; решение — окончательное через 7 дней', async () => {
          const s = await server()
          const { room, borya, vera, gosha, offer } = await acceptedOffer(s)
          await ok(mark(s, room.roomId, borya.key, offer.id, 'author'))
          // Пока не разошлись — рано
          await refused(decide(s, room.roomId, room.key, offer.id, 'author'), 409, NOT_TURN)
          s.clock.now += 1000
          await ok(mark(s, room.roomId, vera.key, offer.id, 'taker'))
          // Разошлись раньше «исход к» — гарант ещё не решает
          const turnAt = offer.expectedAt
          expect(s.clock.now).toBeLessThan(turnAt)
          expect(await outcomeOf(s, room.roomId, gosha.key, offer.id)).toMatchObject({ phase: 'marking', turnAt })
          await refused(decide(s, room.roomId, room.key, offer.id, 'author'), 409, NOT_TURN)
          s.clock.now = turnAt
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
          s.clock.now = offer.expectedAt
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

        it('сторона отметила раньше «исход к», вторая молчит — решает гарант через 3 дня с «исход к» (Р-31); гарант молчит 3 дня — нужен другой', async () => {
          const s = await server()
          const { room, borya, gosha, offer } = await acceptedOffer(s)
          expect(s.clock.now).toBeLessThan(offer.expectedAt)
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
          // Стороны молчат 3 дня после «исход к» — решение у Ани; Аня отказалась
          s.clock.now = offer.expectedAt + SIDE_SILENCE
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
          // Нужен другой гарант, пока стороны не сошлись (их 3 дня до суда ещё идут, Р-31)
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

        it('новый гарант вместо отказавшегося — не предмет спора (Р-26); пари без предмета — как раньше', async () => {
          const s = await server()
          const { room, borya, vera, gosha } = await room4(s)
          // Пари о Гоше: Боря за «сбудется», Вера приняла, гарант — Аня (ведущая)
          const about = await newOffer(s, room.roomId, borya.key, offerForm(s, { subject: gosha.memberId }))
          const plain = await newOffer(s, room.roomId, borya.key, offerForm(s))
          s.clock.now += 1000
          for (const o of [about, plain]) await ok(offerAct(s, room.roomId, vera.key, o.offer.id, 'accept'))
          s.clock.now += 1000
          for (const o of [about, plain]) await ok(offerAct(s, room.roomId, room.key, o.offer.id, 'decline'))
          const nominate = (key: string, offer: string, guarantor: string) => offerAct(s, room.roomId, key, offer, 'nominate', { guarantor })
          await refused(nominate(borya.key, about.offer.id, gosha.memberId), 400, SUBJECT_GUARANTOR)
          await refused(nominate(vera.key, about.offer.id, gosha.memberId), 400, SUBJECT_GUARANTOR)
          // Пари без предмета: Гоша — кандидат, как раньше
          await ok(nominate(borya.key, plain.offer.id, gosha.memberId))
          await ok(nominate(vera.key, plain.offer.id, gosha.memberId))
          const views = await offersOf(s, room.roomId, borya.key)
          expect(views.find((o) => o.id === about.offer.id)?.outcome).toMatchObject({ phase: 'need-guarantor', guarantorId: room.memberId, nominations: {} })
          expect(views.find((o) => o.id === plain.offer.id)?.guarantorId).toBe(gosha.memberId)
          expect(await offerEntries(s, room.roomId)).toEqual([
            'offer.created',
            'offer.created',
            'offer.accepted',
            'offer.accepted',
            'offer.declined',
            'offer.declined',
            'offer.nominated',
            'offer.nominated',
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
          // Решение гаранта (разошлись — с «исход к», Р-31) и его повтор
          s.clock.now = offer.expectedAt
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

    describe('апелляция и суд (Р-25)', () => {
      const HOUR = 60 * 60 * 1000
      const DAY = 24 * HOUR
      const SEED = 'ab'.repeat(16)

      // Комната: Аня — ведущая, Боря, Вера, Гоша, Даша и Женя — участники
      async function room6(s: TestServer) {
        const room = await create(s)
        const borya = await member(s, room, 'Боря')
        const vera = await member(s, room, 'Вера')
        const gosha = await member(s, room, 'Гоша')
        const dasha = await member(s, room, 'Даша')
        const zhenya = await member(s, room, 'Женя')
        return { room, borya, vera, gosha, dasha, zhenya }
      }

      // Ключ участника по номеру
      function keys(...people: { memberId: string; key: string }[]): (memberId: string) => string {
        return (id) => people.find((p) => p.memberId === id)?.key ?? 'нет-ключа'
      }

      async function newEvent(s: TestServer, roomId: string, key: string): Promise<CreateEventResponse['event']> {
        const body = { v: PROTOCOL_VERSION, condition: 'Вася пробежит 10 км', check: 'Скрин из приложения', closesAt: s.clock.now + HOUR, expectedAt: s.clock.now + 2 * HOUR }
        return (await ok<CreateEventResponse>(send(s, roomId, 'events', body, key))).event
      }

      function eventAct(s: TestServer, roomId: string, key: string | undefined, eventId: string, action: string, body: Record<string, unknown> = {}) {
        return send(s, roomId, `events/${eventId}/${action}`, { v: PROTOCOL_VERSION, ...body }, key)
      }

      function offerAct(s: TestServer, roomId: string, key: string | undefined, offerId: string, action: string, body: Record<string, unknown> = {}) {
        return send(s, roomId, `offers/${offerId}/${action}`, { v: PROTOCOL_VERSION, ...body }, key)
      }

      async function stateOf(s: TestServer, roomId: string, key: string): Promise<RoomStateResponse> {
        const state = await ok<RoomStateResponse>(get(s, roomId, key))
        expect(isRoomStateResponse(state)).toBe(true)
        expect(state.now).toBe(s.clock.now)
        return state
      }

      async function eventOutcome(s: TestServer, roomId: string, key: string, eventId: string): Promise<OutcomeView | null> {
        return (await stateOf(s, roomId, key)).events.find((e) => e.id === eventId)?.outcome ?? null
      }

      async function offerOutcome(s: TestServer, roomId: string, key: string, offerId: string) {
        return (await stateOf(s, roomId, key)).offers?.find((o) => o.id === offerId)?.outcome ?? null
      }

      async function courtEntries(s: TestServer, roomId: string): Promise<string[]> {
        return (await readLog(s.storage(roomId))).map((e) => e.type).filter((t) => t.startsWith('appeal.') || t.startsWith('court.'))
      }

      // Событие Бори «Да / Нет»: Боря — 300 на «Да», Вера — 100 на «Нет»; Боря предложил «Да» после
      // закрытия приёма. Утвердится сам через сутки
      async function proposedEvent(s: TestServer, p: Awaited<ReturnType<typeof room6>>) {
        const { room, borya, vera } = p
        const event = await newEvent(s, room.roomId, borya.key)
        await ok(eventAct(s, room.roomId, borya.key, event.id, 'bets', { outcome: '1', amount: 300 }))
        await ok(eventAct(s, room.roomId, vera.key, event.id, 'bets', { outcome: '2', amount: 100 }))
        s.clock.now = event.closesAt
        await ok(eventAct(s, room.roomId, borya.key, event.id, 'propose', { outcome: '1' }))
        return event
      }

      it('апелляция на исход пула: ставивший подаёт, суд собран в этот миг (зерно и кандидаты — в журнал); голоса; «изменить» — окончательный сразу', async () => {
        const s = await server()
        const p = await room6(s)
        const { room, borya, vera, gosha, dasha, zhenya } = p
        const keyOf = keys(room, borya, vera, gosha, dasha, zhenya)
        const event = await proposedEvent(s, p)
        const appeal = (key: string, reason: unknown, requestId?: string) => eventAct(s, room.roomId, key, event.id, 'appeal', { reason, requestId })
        const join = (key: string, requestId?: string) => eventAct(s, room.roomId, key, event.id, 'appeal/join', { requestId })
        const judge = (key: string, body: Record<string, unknown>) => eventAct(s, room.roomId, key, event.id, 'judge', body)
        // Исход ещё не утверждён — рано
        await refused(appeal(vera.key, 'Рано'), 409, A.NOT_APPROVED)
        s.clock.now += DAY
        await refused(appeal(gosha.key, 'Не ставил'), 403, A.NOT_BETTOR)
        await refused(appeal(vera.key, '  '), 400, A.NEED_APPEAL)
        await refused(appeal(vera.key, undefined), 400, A.NEED_APPEAL)
        await refused(appeal(vera.key, 'я'.repeat(301)), 400, A.LONG_APPEAL)
        expect(await courtEntries(s, room.roomId)).toEqual([])
        // Подала Вера: зерно — из источника случайности сервера, кандидаты — не заинтересованные на этот миг
        s.seeds.push(SEED)
        const requestId = ulid(s.clock.now)
        const filed = await ok<AppealResponse>(appeal(vera.key, ' Скрин с чужого телефона ', requestId))
        expect(isAppealResponse(filed)).toBe(true)
        const candidates = [room.memberId, gosha.memberId, dasha.memberId, zhenya.memberId]
        expect(filed).toEqual({
          v: PROTOCOL_VERSION,
          appeal: { id: expect.any(String), at: s.clock.now, by: vera.memberId, target: event.id, reason: 'Скрин с чужого телефона', seed: SEED, candidates },
        })
        const drawnAt = s.clock.now
        expect((await readLog(s.storage(room.roomId))).at(-1)).toEqual({
          id: filed.appeal.id,
          at: drawnAt,
          memberId: vera.memberId,
          type: 'appeal.filed',
          target: event.id,
          reason: 'Скрин с чужого телефона',
          seed: SEED,
          candidates,
          requestId,
        })
        // Повтор — тот же ответ без записи; тот же номер с другой причиной — 409; вторая апелляция — 409
        s.clock.now += 1000
        expect(await ok(appeal(vera.key, 'Скрин с чужого телефона', requestId))).toEqual(filed)
        await refused(appeal(vera.key, 'Другая причина', requestId), 409, REQUEST_USED)
        await refused(appeal(borya.key, 'И я против'), 409, A.APPEAL_EXISTS)
        // Присоединиться: тот, кто мог бы подать, кроме подавшей; один раз
        await refused(join(vera.key), 403, A.OWN_APPEAL)
        await refused(join(gosha.key), 403, A.NOT_BETTOR)
        const joinId = ulid(s.clock.now)
        const joined = await ok<JoinAppealResponse>(join(borya.key, joinId))
        expect(isJoinAppealResponse(joined)).toBe(true)
        expect(joined).toEqual({ v: PROTOCOL_VERSION, joined: { id: expect.any(String), at: s.clock.now, by: borya.memberId, target: event.id } })
        expect(await ok(join(borya.key, joinId))).toEqual(joined)
        await refused(join(borya.key), 409, A.ALREADY_JOINED)
        // В состоянии комнаты у всех: апелляция и суд; исход утверждён, но не окончательный до решения
        const order = A.drawCourt(SEED, candidates, room.memberId)
        expect(order[0]).toBe(room.memberId)
        const [, second, third, reserve] = order
        const seat = (member: string) => ({ member, since: drawnAt, until: drawnAt + A.SEAT_TIME, replaced: null, vote: null })
        for (const key of [room.key, gosha.key, vera.key]) {
          expect(await eventOutcome(s, room.roomId, key, event.id)).toMatchObject({
            status: 'approved',
            approved: { outcome: '1', how: 'unopposed' },
            finalAt: null,
            appeal: {
              id: filed.appeal.id,
              at: drawnAt,
              by: vera.memberId,
              reason: 'Скрин с чужого телефона',
              joined: [{ id: joined.joined.id, at: joined.joined.at, by: borya.memberId }],
            },
            court: { seed: SEED, drawnAt, candidates: order, seats: order.slice(0, 3).map(seat), decision: null },
          })
        }
        // Голоса: только член суда; кривой голос — 400; «изменить» на тот же исход — 400
        await refused(judge(keyOf(reserve), { verdict: 'keep' }), 403, A.NOT_JUROR)
        await refused(judge(vera.key, { verdict: 'keep' }), 403, A.NOT_JUROR)
        for (const body of [{}, { verdict: 'yes' }, { verdict: 'change' }, { verdict: 'change', winner: 'author' }, { verdict: 'change', outcome: '7' }]) {
          await refused(judge(room.key, body), 400, A.BAD_VERDICT)
        }
        await refused(judge(room.key, { verdict: 'change', outcome: '1' }), 400, A.SAME_CHANGE)
        const voteId = ulid(s.clock.now)
        const voted = await ok<JudgeResponse>(judge(room.key, { verdict: 'change', outcome: '2', requestId: voteId }))
        expect(isJudgeResponse(voted)).toBe(true)
        expect(voted).toEqual({
          v: PROTOCOL_VERSION,
          voted: { id: expect.any(String), at: s.clock.now, by: room.memberId, target: event.id, verdict: 'change', outcome: '2' },
        })
        expect(await ok(judge(room.key, { verdict: 'change', outcome: '2', requestId: voteId }))).toEqual(voted)
        await refused(judge(room.key, { verdict: 'cancel', requestId: voteId }), 409, REQUEST_USED)
        await refused(judge(room.key, { verdict: 'cancel' }), 409, A.VOTED)
        s.clock.now += HOUR
        await ok(judge(keyOf(second), { verdict: 'keep' }))
        // Два голоса из трёх — суд ещё не кончился
        expect(await eventOutcome(s, room.roomId, gosha.key, event.id)).toMatchObject({ status: 'approved', finalAt: null, court: { decision: null } })
        s.clock.now += HOUR
        await ok(judge(keyOf(third), { verdict: 'change', outcome: '2' }))
        const at = s.clock.now
        // Суд решил «изменить на „Нет“» — утверждён судом, окончательный сразу, выплаты — по новому исходу
        const decided = await eventOutcome(s, room.roomId, vera.key, event.id)
        expect(decided).toMatchObject({
          status: 'final',
          approved: { outcome: '2', at, how: 'court', by: null },
          finalAt: at,
          court: { decision: { at, majority: true, verdict: 'change', outcome: '2' } },
        })
        expect(decided?.payouts.find((x) => x.memberId === vera.memberId)).toMatchObject({ staked: 100, payout: 400, net: 300 })
        // Решение окончательное
        await refused(judge(keyOf(reserve), { verdict: 'keep' }), 409, A.COURT_DECIDED)
        await refused(eventAct(s, room.roomId, room.key, event.id, 'replace', { member: second, reason: 'Поздно' }), 409, A.COURT_DECIDED)
        s.clock.now += 30 * DAY
        expect((await eventOutcome(s, room.roomId, vera.key, event.id))?.status).toBe('final')
        expect(await courtEntries(s, room.roomId)).toEqual(['appeal.filed', 'appeal.joined', 'court.voted', 'court.voted', 'court.voted'])
      })

      it('отмена события (Р-29): апелляция подана — решает суд; суд решил — окончательный, отмены нет; записи нет', async () => {
        const s = await server()
        const p = await room6(s)
        const { room, vera } = p
        const event = await proposedEvent(s, p)
        s.clock.now += DAY
        s.seeds.push(SEED)
        await ok(eventAct(s, room.roomId, vera.key, event.id, 'appeal', { reason: 'Скрин старый' }))
        const cancel = () => eventAct(s, room.roomId, room.key, event.id, 'cancel', { reason: 'Видео не сохранилось' })
        await refused(cancel(), 409, CANCEL_COURT)
        // Суд промолчал все 72 часа — исход остался, окончательный
        s.clock.now += 30 * DAY
        expect((await eventOutcome(s, room.roomId, vera.key, event.id))?.status).toBe('final')
        await refused(cancel(), 409, CANCEL_FINAL)
        expect((await readLog(s.storage(room.roomId))).some((e) => e.type === 'event.cancelled')).toBe(false)
      })

      it('досрочная замена ведущим: не проголосовавшего, не себя, с причиной, одна на место; «оставить» — окончательный с решения суда', async () => {
        const s = await server()
        const p = await room6(s)
        const { room, borya, vera, gosha, dasha, zhenya } = p
        const keyOf = keys(room, borya, vera, gosha, dasha, zhenya)
        const event = await proposedEvent(s, p)
        s.clock.now += DAY
        s.seeds.push(SEED)
        await ok(eventAct(s, room.roomId, vera.key, event.id, 'appeal', { reason: 'Скрин старый' }))
        const order = A.drawCourt(SEED, [room.memberId, gosha.memberId, dasha.memberId, zhenya.memberId], room.memberId)
        const [, second, third, reserve] = order
        const judge = (key: string, body: Record<string, unknown>) => eventAct(s, room.roomId, key, event.id, 'judge', body)
        const replace = (key: string, member: unknown, reason: unknown, requestId?: string) =>
          eventAct(s, room.roomId, key, event.id, 'replace', { member, reason, requestId })
        s.clock.now += HOUR
        await refused(replace(vera.key, second, 'Уехал'), 403, A.ONLY_HOST)
        await refused(replace(room.key, room.memberId, 'Сама'), 403, A.OWN_SEAT)
        await refused(replace(room.key, reserve, 'Не в суде'), 400, A.NOT_SEAT)
        await refused(replace(room.key, undefined, 'Без кого'), 400, A.NOT_SEAT)
        await refused(replace(room.key, second, ' '), 400, A.NEED_REPLACE)
        await refused(replace(room.key, second, 'я'.repeat(301)), 400, A.LONG_REPLACE)
        await ok(judge(keyOf(third), { verdict: 'keep' }))
        await refused(replace(room.key, third, 'Уже голосовал'), 409, A.VOTED_NO_REPLACE)
        const replaceId = ulid(s.clock.now)
        const replaced = await ok<ReplaceJurorResponse>(replace(room.key, second, ' Уехал в поход без связи ', replaceId))
        expect(isReplaceJurorResponse(replaced)).toBe(true)
        expect(replaced).toEqual({
          v: PROTOCOL_VERSION,
          replaced: { id: expect.any(String), at: s.clock.now, by: room.memberId, target: event.id, member: second, reason: 'Уехал в поход без связи' },
        })
        const replacedAt = s.clock.now
        s.clock.now += 1000
        expect(await ok(replace(room.key, second, 'Уехал в поход без связи', replaceId))).toEqual(replaced)
        await refused(replace(room.key, second, 'Другая причина', replaceId), 409, REQUEST_USED)
        // Место перешло к запасному, у него свои 72 часа; второй замены на место нет
        const out = await eventOutcome(s, room.roomId, gosha.key, event.id)
        expect(out?.court?.seats[1]).toEqual({
          member: reserve,
          since: replacedAt,
          until: replacedAt + A.SEAT_TIME,
          replaced: { member: second, at: replacedAt, by: room.memberId, reason: 'Уехал в поход без связи' },
          vote: null,
        })
        await refused(replace(room.key, reserve, 'Ещё раз'), 409, A.ALREADY_REPLACED)
        await refused(judge(keyOf(second), { verdict: 'keep' }), 403, A.NOT_JUROR)
        await ok(judge(room.key, { verdict: 'keep' }))
        await ok(judge(keyOf(reserve), { verdict: 'cancel' }))
        // «Оставить» большинством — прежний исход, окончательный в миг решения (а не через 7 дней)
        const at = s.clock.now
        expect(await eventOutcome(s, room.roomId, vera.key, event.id)).toMatchObject({
          status: 'final',
          approved: { outcome: '1', how: 'unopposed' },
          finalAt: at,
          court: { decision: { at, majority: true, verdict: 'keep' } },
        })
        expect(await courtEntries(s, room.roomId)).toEqual(['appeal.filed', 'court.voted', 'court.replaced', 'court.voted', 'court.voted'])
      })

      it('«ждёт суда» — суд собирается сам при первом запросе после перехода, один раз; молчащего через 72 часа заменяет запасной', async () => {
        const s = await server()
        const p = await room6(s)
        const { room, borya, vera, gosha, dasha, zhenya } = p
        const zoya = await member(s, room, 'Зоя')
        const keyOf = keys(room, borya, vera, gosha, dasha, zhenya, zoya)
        // Ведущая ставила — возражение решает голосование не ставивших
        const event = await newEvent(s, room.roomId, borya.key)
        await ok(eventAct(s, room.roomId, borya.key, event.id, 'bets', { outcome: '1', amount: 300 }))
        await ok(eventAct(s, room.roomId, vera.key, event.id, 'bets', { outcome: '2', amount: 100 }))
        await ok(eventAct(s, room.roomId, room.key, event.id, 'bets', { outcome: '1', amount: 100 }))
        s.clock.now = event.closesAt
        await ok(eventAct(s, room.roomId, borya.key, event.id, 'propose', { outcome: '1' }))
        await ok(eventAct(s, room.roomId, vera.key, event.id, 'object', { reason: 'Не так' }))
        const until = s.clock.now + 72 * HOUR
        await ok(eventAct(s, room.roomId, gosha.key, event.id, 'vote', { outcome: '1' }))
        await ok(eventAct(s, room.roomId, dasha.key, event.id, 'vote', { outcome: '2' }))
        s.clock.now = until - 1
        expect((await eventOutcome(s, room.roomId, vera.key, event.id))?.status).toBe('voting')
        expect(await courtEntries(s, room.roomId)).toEqual([])
        // Ничья к концу голосования — «ждёт суда»; первый запрос после этого — действие, а не чтение
        s.clock.now = until
        s.seeds.push(SEED)
        await newEvent(s, room.roomId, gosha.key)
        const candidates = [gosha.memberId, dasha.memberId, zhenya.memberId, zoya.memberId]
        const log = await readLog(s.storage(room.roomId))
        expect(log.slice(-2).map((e) => e.type)).toEqual(['court.drawn', 'event.created'])
        expect(log.at(-2)).toEqual({ id: expect.any(String), at: until, memberId: room.memberId, type: 'court.drawn', target: event.id, seed: SEED, candidates })
        // Второй запрос — второй записи нет
        s.clock.now += 1000
        const order = A.drawCourt(SEED, candidates, room.memberId)
        const view = await eventOutcome(s, room.roomId, vera.key, event.id)
        expect(view).toMatchObject({ status: 'court', approved: null, appeal: null, court: { seed: SEED, drawnAt: until, candidates: order, decision: null } })
        expect(view?.court?.seats.map((x) => x.member)).toEqual(order.slice(0, 3))
        await ok(eventAct(s, room.roomId, borya.key, event.id, 'clarify', { text: 'Скрин — из приложения' }))
        expect(await courtEntries(s, room.roomId)).toEqual(['court.drawn'])
        // Апелляции на «ждёт суда» нет; ведущая заинтересована — досрочной замены нет; «оставить» — нечего
        await refused(eventAct(s, room.roomId, vera.key, event.id, 'appeal', { reason: 'Хочу суд' }), 409, A.NOT_APPROVED)
        await refused(eventAct(s, room.roomId, room.key, event.id, 'replace', { member: order[0], reason: 'Молчит' }), 403, A.HOST_INTERESTED)
        const judge = (memberId: string, body: Record<string, unknown>) => eventAct(s, room.roomId, keyOf(memberId), event.id, 'judge', body)
        await refused(judge(order[0], { verdict: 'keep' }), 400, A.NO_KEEP)
        await ok(judge(order[0], { verdict: 'change', outcome: '2' }))
        await ok(judge(order[1], { verdict: 'change', outcome: '2' }))
        // Третий молчит 72 часа — место переходит к запасному
        s.clock.now = until + A.SEAT_TIME - 1
        expect(await eventOutcome(s, room.roomId, vera.key, event.id)).toMatchObject({ status: 'court', court: { decision: null } })
        s.clock.now = until + A.SEAT_TIME
        expect((await eventOutcome(s, room.roomId, vera.key, event.id))?.court?.seats[2]).toEqual({
          member: order[3],
          since: until + A.SEAT_TIME,
          until: until + 2 * A.SEAT_TIME,
          replaced: { member: order[2], at: until + A.SEAT_TIME, by: null, reason: null },
          vote: null,
        })
        await refused(judge(order[2], { verdict: 'cancel' }), 403, A.NOT_JUROR)
        s.clock.now += HOUR
        await ok(judge(order[3], { verdict: 'cancel' }))
        // Суд решил «изменить на „Нет“» — утверждён судом, окончательный; выплаты — по нему
        const at = s.clock.now
        const decided = await eventOutcome(s, room.roomId, vera.key, event.id)
        expect(decided).toMatchObject({ status: 'final', approved: { outcome: '2', at, how: 'court', by: null }, finalAt: at })
        expect(decided?.payouts.find((x) => x.memberId === vera.memberId)).toMatchObject({ payout: 500 })
        expect(await courtEntries(s, room.roomId)).toEqual(['court.drawn', 'court.voted', 'court.voted', 'court.voted'])
      })

      it('«ждёт суда», а судить некому — записи нет, суда нет; голос и замена — 409; выход — отмена ведущим', async () => {
        const s = await server()
        const room = await create(s)
        const borya = await member(s, room, 'Боря')
        const vera = await member(s, room, 'Вера')
        const event = await newEvent(s, room.roomId, borya.key)
        for (const [key, outcome] of [[borya.key, '1'], [vera.key, '2'], [room.key, '1']]) {
          await ok(eventAct(s, room.roomId, key, event.id, 'bets', { outcome, amount: 100 }))
        }
        s.clock.now = event.closesAt
        await ok(eventAct(s, room.roomId, borya.key, event.id, 'propose', { outcome: '1' }))
        await ok(eventAct(s, room.roomId, vera.key, event.id, 'object', { reason: 'Не так' }))
        s.clock.now += 1000
        const out = await eventOutcome(s, room.roomId, vera.key, event.id)
        expect(out).toMatchObject({ status: 'court', voters: [] })
        // Суда нет — полей нет, как до этапа 4
        expect(out && ('appeal' in out || 'court' in out)).toBe(false)
        await refused(eventAct(s, room.roomId, vera.key, event.id, 'judge', { verdict: 'cancel' }), 409, NO_COURT)
        await refused(eventAct(s, room.roomId, room.key, event.id, 'replace', { member: vera.memberId, reason: 'Молчит' }), 409, NO_COURT)
        await refused(eventAct(s, room.roomId, vera.key, event.id, 'appeal/join'), 409, A.NO_APPEAL)
        await ok(send(s, room.roomId, `events/${event.id}/cancel`, { reason: 'Судить некому' }, room.key))
        expect((await eventOutcome(s, room.roomId, vera.key, event.id))?.status).toBe('cancelled')
        expect(await courtEntries(s, room.roomId)).toEqual([])
      })

      it('апелляция на исход пари: сторона после решения гаранта; ведущая-гарант в суде не сидит; «отменить» — без выплат', async () => {
        const s = await server()
        const { room, borya, vera, gosha, dasha, zhenya } = await room6(s)
        const keyOf = keys(room, borya, vera, gosha, dasha, zhenya)
        const form = { v: PROTOCOL_VERSION, condition: 'Вася бросит курить', check: 'Скажет сам', odds: { a: 3, b: 1 }, amount: 300, closesAt: s.clock.now + HOUR, expectedAt: s.clock.now + DAY }
        const { offer } = await ok<CreateOfferResponse>(send(s, room.roomId, 'offers', form, borya.key))
        await ok(offerAct(s, room.roomId, vera.key, offer.id, 'accept'))
        const appeal = (key: string, requestId?: string) => offerAct(s, room.roomId, key, offer.id, 'appeal', { reason: 'Гарант не видел видео', requestId })
        await refused(appeal(vera.key), 409, A.NOT_APPROVED)
        await refused(appeal(gosha.key), 403, A.NOT_SIDE)
        // Разошлись — решила гарант (ведущая)
        await ok(offerAct(s, room.roomId, borya.key, offer.id, 'mark', { winner: 'author' }))
        await ok(offerAct(s, room.roomId, vera.key, offer.id, 'mark', { winner: 'taker' }))
        s.clock.now = offer.expectedAt // разошлись до «исход к» — гарант решает с него (Р-31)
        await ok(offerAct(s, room.roomId, room.key, offer.id, 'decide', { winner: 'author' }))
        s.clock.now += HOUR
        s.seeds.push(SEED)
        const requestId = ulid(s.clock.now)
        const filed = await ok<AppealResponse>(appeal(vera.key, requestId))
        const candidates = [gosha.memberId, dasha.memberId, zhenya.memberId]
        expect(filed.appeal).toMatchObject({ by: vera.memberId, target: offer.id, seed: SEED, candidates })
        expect(await ok(appeal(vera.key, requestId))).toEqual(filed)
        const joined = await ok<JoinAppealResponse>(offerAct(s, room.roomId, borya.key, offer.id, 'appeal/join'))
        const order = A.drawCourt(SEED, candidates, room.memberId)
        expect(await offerOutcome(s, room.roomId, gosha.key, offer.id)).toMatchObject({
          phase: 'approved',
          approved: { winner: 'author', how: 'guarantor', by: room.memberId },
          finalAt: null,
          appeal: { by: vera.memberId, joined: [{ id: joined.joined.id, by: borya.memberId }] },
          court: { seed: SEED, candidates: order, decision: null },
        })
        await refused(offerAct(s, room.roomId, room.key, offer.id, 'replace', { member: order[0], reason: 'Молчит' }), 403, A.HOST_INTERESTED)
        const judge = (memberId: string, body: Record<string, unknown>) => offerAct(s, room.roomId, keyOf(memberId), offer.id, 'judge', body)
        // У пари «изменить» — на другую сторону, не на исход события
        await refused(judge(order[0], { verdict: 'change', outcome: '1' }), 400, A.BAD_VERDICT)
        await refused(judge(order[0], { verdict: 'change', winner: 'author' }), 400, A.SAME_CHANGE)
        const voted = await ok<JudgeResponse>(judge(order[0], { verdict: 'change', winner: 'taker' }))
        expect(voted.voted).toMatchObject({ by: order[0], target: offer.id, verdict: 'change', winner: 'taker' })
        await ok(judge(order[1], { verdict: 'cancel' }))
        await ok(judge(order[2], { verdict: 'cancel' }))
        expect(await offerOutcome(s, room.roomId, vera.key, offer.id)).toMatchObject({
          phase: 'cancelled',
          finalAt: null,
          court: { decision: { majority: true, verdict: 'cancel' } },
        })
        expect(await courtEntries(s, room.roomId)).toEqual(['appeal.filed', 'appeal.joined', 'court.voted', 'court.voted', 'court.voted'])
      })

      it('пари без общего гаранта 3 дня — суд собирается сам (drawDueCourts, Р-31); гаранта уже не назвать; «прав соперник» — окончательно', async () => {
        const s = await server()
        const { room, borya, vera, gosha, dasha, zhenya } = await room6(s)
        const keyOf = keys(room, borya, vera, gosha, dasha, zhenya)
        const form = { v: PROTOCOL_VERSION, condition: 'Вася бросит курить', check: 'Скажет сам', odds: { a: 3, b: 1 }, amount: 300, closesAt: s.clock.now + HOUR, expectedAt: s.clock.now + DAY }
        const { offer } = await ok<CreateOfferResponse>(send(s, room.roomId, 'offers', form, borya.key))
        await ok(offerAct(s, room.roomId, vera.key, offer.id, 'accept'))
        // Гарант (ведущая) отказалась; стороны называют разных
        await ok(offerAct(s, room.roomId, room.key, offer.id, 'decline'))
        const due = s.clock.now + NEED_GUARANTOR_TIME
        await ok(offerAct(s, room.roomId, borya.key, offer.id, 'nominate', { guarantor: gosha.memberId }))
        await ok(offerAct(s, room.roomId, vera.key, offer.id, 'nominate', { guarantor: dasha.memberId }))
        s.clock.now = due - 1
        expect(await offerOutcome(s, room.roomId, gosha.key, offer.id)).toMatchObject({ phase: 'need-guarantor', needSince: due - NEED_GUARANTOR_TIME })
        expect(await courtEntries(s, room.roomId)).toEqual([])
        // 3 дня прошли — первый запрос собирает суд: кандидаты — не стороны и не нынешний гарант
        s.clock.now = due
        s.seeds.push(SEED)
        const candidates = [gosha.memberId, dasha.memberId, zhenya.memberId]
        const order = A.drawCourt(SEED, candidates, room.memberId)
        const view = await offerOutcome(s, room.roomId, vera.key, offer.id)
        expect(view).toMatchObject({ phase: 'court', approved: null, appeal: null, court: { seed: SEED, drawnAt: due, candidates: order, decision: null } })
        const log = await readLog(s.storage(room.roomId))
        expect(log.at(-1)).toEqual({ id: expect.any(String), at: due, memberId: room.memberId, type: 'court.drawn', target: offer.id, seed: SEED, candidates })
        // Второго суда нет; назвать гаранта и отметить исход — нельзя, решает суд
        s.clock.now += 1000
        await refused(offerAct(s, room.roomId, vera.key, offer.id, 'nominate', { guarantor: gosha.memberId }), 409, IN_COURT)
        await refused(offerAct(s, room.roomId, borya.key, offer.id, 'mark', { winner: 'author' }), 409, IN_COURT)
        await refused(offerAct(s, room.roomId, vera.key, offer.id, 'appeal', { reason: 'Хочу суд' }), 409, A.NOT_APPROVED)
        expect(await courtEntries(s, room.roomId)).toEqual(['court.drawn'])
        // Суд: «оставить» нечего; «прав соперник» большинством — окончательно сразу
        const judge = (memberId: string, body: Record<string, unknown>) => offerAct(s, room.roomId, keyOf(memberId), offer.id, 'judge', body)
        await refused(judge(order[0], { verdict: 'keep' }), 400, A.NO_KEEP)
        await ok(judge(order[0], { verdict: 'change', winner: 'taker' }))
        await ok(judge(order[1], { verdict: 'change', winner: 'taker' }))
        await ok(judge(order[2], { verdict: 'cancel' }))
        const at = s.clock.now
        expect(await offerOutcome(s, room.roomId, borya.key, offer.id)).toMatchObject({
          phase: 'final',
          approved: { winner: 'taker', at, how: 'court', by: null },
          finalAt: at,
          court: { decision: { at, majority: true, verdict: 'change', winner: 'taker' } },
        })
        // Решение окончательное — апелляции нет
        await refused(offerAct(s, room.roomId, borya.key, offer.id, 'appeal', { reason: 'Не согласен' }), 409, A.COURT_DECIDED)
        expect(await courtEntries(s, room.roomId)).toEqual(['court.drawn', 'court.voted', 'court.voted', 'court.voted'])
      })

      it('пари без общего гаранта, а судить некому (комната из трёх) — суда нет, гаранта по-прежнему называют', async () => {
        const s = await server()
        const room = await create(s)
        const borya = await member(s, room, 'Боря')
        const vera = await member(s, room, 'Вера')
        const form = { v: PROTOCOL_VERSION, condition: 'Вася бросит курить', check: 'Скажет сам', odds: { a: 1, b: 1 }, amount: 100, closesAt: s.clock.now + HOUR, expectedAt: s.clock.now + DAY }
        const { offer } = await ok<CreateOfferResponse>(send(s, room.roomId, 'offers', form, borya.key))
        await ok(offerAct(s, room.roomId, vera.key, offer.id, 'accept'))
        await ok(offerAct(s, room.roomId, room.key, offer.id, 'decline'))
        s.clock.now += NEED_GUARANTOR_TIME + DAY
        expect(await offerOutcome(s, room.roomId, vera.key, offer.id)).toMatchObject({ phase: 'need-guarantor' })
        expect(await courtEntries(s, room.roomId)).toEqual([])
        // Стороны сошлись на ведущей снова — она гарант
        await ok(offerAct(s, room.roomId, borya.key, offer.id, 'nominate', { guarantor: room.memberId }))
        await ok(offerAct(s, room.roomId, vera.key, offer.id, 'nominate', { guarantor: room.memberId }))
        expect(await offerOutcome(s, room.roomId, vera.key, offer.id)).toMatchObject({ phase: 'guarantor', guarantorId: room.memberId, needSince: null })
        expect(await courtEntries(s, room.roomId)).toEqual([])
      })

      describe('пари без гаранта (Р-36)', () => {
        const offerForm = (s: TestServer, more: Record<string, unknown> = {}) => ({
          v: PROTOCOL_VERSION,
          condition: 'Вася бросит курить',
          check: 'Скажет сам',
          odds: { a: 1, b: 1 },
          amount: 100,
          closesAt: s.clock.now + HOUR,
          expectedAt: s.clock.now + DAY,
          noGuarantor: true,
          ...more,
        })

        it('судить есть кому: в маленькой комнате — отказ (адресное и открытое); есть — пари без гаранта, в записи guarantor null', async () => {
          const s = await server()
          const room = await create(s)
          const borya = await member(s, room, 'Боря')
          const id = room.roomId
          // Двое: адресное Ани Боре — судить некому; открытое Бори — кроме него только Аня
          await refused(send(s, id, 'offers', offerForm(s, { to: borya.memberId }), room.key), 400, NO_GUARANTOR_JUDGES)
          await refused(send(s, id, 'offers', offerForm(s), borya.key), 400, NO_GUARANTOR_JUDGES)
          const vera = await member(s, room, 'Вера')
          // Трое: адресное Бори Вере — судит Аня; открытое Бори — один примет, один судит
          const addressed = await ok<CreateOfferResponse>(send(s, id, 'offers', offerForm(s, { to: vera.memberId }), borya.key))
          expect(isCreateOfferResponse(addressed)).toBe(true)
          expect(addressed.offer).toMatchObject({ to: vera.memberId, guarantorId: null, guarantorRule: true })
          const open = await ok<CreateOfferResponse>(send(s, id, 'offers', offerForm(s), borya.key))
          expect(open.offer.guarantorId).toBeNull()
          // Предмет спора не судья: открытое о Вере — кроме автора и предмета только Аня
          await refused(send(s, id, 'offers', offerForm(s, { subject: vera.memberId }), borya.key), 400, NO_GUARANTOR_JUDGES)
          // «Без гаранта» и гарант вместе — отказ; «без гаранта» не «да/нет» — отказ
          await refused(send(s, id, 'offers', offerForm(s, { guarantor: room.memberId }), borya.key), 400, NO_GUARANTOR_CHOSEN)
          await refused(send(s, id, 'offers', offerForm(s, { noGuarantor: 'да' }), borya.key), 400, BAD_GUARANTOR)
          const created = (await readLog(s.storage(id))).flatMap((e) => (e.type === 'offer.created' ? [e.guarantor] : []))
          expect(created).toEqual([null, null])
          // Повтор того же запроса — то же пари
          const requestId = ulid(s.clock.now)
          const first = await ok<CreateOfferResponse>(send(s, id, 'offers', offerForm(s, { to: vera.memberId, requestId }), borya.key))
          expect(await ok(send(s, id, 'offers', offerForm(s, { to: vera.memberId, requestId }), borya.key))).toEqual(first)
          // В ответе комнаты — пари без гаранта; исхода нет, пока не принято
          const view = (await stateOf(s, id, room.key)).offers?.find((o) => o.id === addressed.offer.id)
          expect(view).toMatchObject({ guarantorId: null, status: 'open', outcome: null })
          // Без гаранта ведущая принимает открытое: она не гарант
          await ok(offerAct(s, id, room.key, open.offer.id, 'accept'))
        })

        it('совпали — окончательно сразу; разошлись — суд сразу, без часов гаранта; «Утвердить» и «Отказаться» — «У пари нет гаранта»', async () => {
          const s = await server()
          const { room, borya, vera, gosha, dasha, zhenya } = await room6(s)
          const keyOf = keys(room, borya, vera, gosha, dasha, zhenya)
          const id = room.roomId
          // Совпали — согласием, окончательно сразу
          const { offer: agreed } = await ok<CreateOfferResponse>(send(s, id, 'offers', offerForm(s), borya.key))
          await ok(offerAct(s, id, vera.key, agreed.id, 'accept'))
          await ok(offerAct(s, id, borya.key, agreed.id, 'mark', { winner: 'author' }))
          await ok(offerAct(s, id, vera.key, agreed.id, 'mark', { winner: 'author' }))
          expect(await offerOutcome(s, id, gosha.key, agreed.id)).toMatchObject({ phase: 'final', guarantorId: null, approved: { how: 'agreement', winner: 'author' } })
          // Разошлись после «исход к» — первый запрос собирает суд: кандидаты — все, кроме сторон (ведущая тоже)
          const { offer } = await ok<CreateOfferResponse>(send(s, id, 'offers', offerForm(s), borya.key))
          await ok(offerAct(s, id, vera.key, offer.id, 'accept'))
          s.clock.now = offer.expectedAt
          await ok(offerAct(s, id, borya.key, offer.id, 'mark', { winner: 'author' }))
          expect(await offerOutcome(s, id, gosha.key, offer.id)).toMatchObject({ phase: 'marking', guarantorId: null, guarantorUntil: null })
          expect(await courtEntries(s, id)).toEqual([])
          s.seeds.push(SEED)
          await ok(offerAct(s, id, vera.key, offer.id, 'mark', { winner: 'taker' }))
          const apartAt = s.clock.now
          const candidates = [room.memberId, gosha.memberId, dasha.memberId, zhenya.memberId]
          const order = A.drawCourt(SEED, candidates, room.memberId)
          expect(await offerOutcome(s, id, gosha.key, offer.id)).toMatchObject({
            phase: 'court',
            guarantorId: null,
            guarantorUntil: null,
            needSince: apartAt,
            approved: null,
            appeal: null,
            court: { seed: SEED, drawnAt: apartAt, candidates: order, decision: null },
          })
          expect(await courtEntries(s, id)).toEqual(['court.drawn'])
          // Гаранта нет — решить и отказаться некому; назвать гаранта и отметить — уже суд
          await refused(offerAct(s, id, room.key, offer.id, 'decide', { winner: 'author' }), 409, NO_GUARANTOR)
          await refused(offerAct(s, id, room.key, offer.id, 'decline'), 409, NO_GUARANTOR)
          await refused(offerAct(s, id, borya.key, offer.id, 'nominate', { guarantor: gosha.memberId }), 409, IN_COURT)
          await refused(offerAct(s, id, vera.key, offer.id, 'mark', { winner: 'author' }), 409, IN_COURT)
          // Суд: «прав соперник» большинством — окончательно сразу
          const judge = (memberId: string, body: Record<string, unknown>) => offerAct(s, id, keyOf(memberId), offer.id, 'judge', body)
          await ok(judge(order[0], { verdict: 'change', winner: 'taker' }))
          await ok(judge(order[1], { verdict: 'change', winner: 'taker' }))
          await ok(judge(order[2], { verdict: 'cancel' }))
          expect(await offerOutcome(s, id, borya.key, offer.id)).toMatchObject({ phase: 'final', approved: { winner: 'taker', how: 'court', by: null }, finalAt: s.clock.now })
          expect(await courtEntries(s, id)).toEqual(['court.drawn', 'court.voted', 'court.voted', 'court.voted'])
        })

        it('вторая сторона молчит — суд через срок молчания темпа комнаты (быстрый — 12 ч)', async () => {
          const s = await server()
          const room = await create(s, { ...FORM, pace: 'fast' })
          const borya = await member(s, room, 'Боря')
          const vera = await member(s, room, 'Вера')
          await member(s, room, 'Гоша')
          const id = room.roomId
          const { offer } = await ok<CreateOfferResponse>(send(s, id, 'offers', offerForm(s), borya.key))
          await ok(offerAct(s, id, vera.key, offer.id, 'accept'))
          s.clock.now = offer.expectedAt
          await ok(offerAct(s, id, borya.key, offer.id, 'mark', { winner: 'author' }))
          const due = offer.expectedAt + P.FAST_TIMES.silence
          s.clock.now = due - 1
          expect(await offerOutcome(s, id, vera.key, offer.id)).toMatchObject({ phase: 'marking', turnAt: due })
          expect(await courtEntries(s, id)).toEqual([])
          s.clock.now = due
          s.seeds.push(SEED)
          expect(await offerOutcome(s, id, vera.key, offer.id)).toMatchObject({ phase: 'court', needSince: due, court: { drawnAt: due } })
          expect(await courtEntries(s, id)).toEqual(['court.drawn'])
        })

        it('встречное: гарант — выбор автора встречного; не выбрал — как у исходного', async () => {
          const s = await server()
          const { room, borya, vera, gosha, dasha } = await room6(s)
          const id = room.roomId
          // Исходное с гарантом (ведущая): встречное без гаранта, с Дашей, без выбора — с ведущей
          const { offer } = await ok<CreateOfferResponse>(send(s, id, 'offers', offerForm(s, { noGuarantor: undefined }), borya.key))
          expect(offer.guarantorId).toBe(room.memberId)
          const counter = (key: string, body: Record<string, unknown>) =>
            ok<CreateOfferResponse>(offerAct(s, id, key, offer.id, 'counter', { closesAt: s.clock.now + HOUR, ...body }))
          expect((await counter(vera.key, { noGuarantor: true })).offer).toMatchObject({ guarantorId: null, to: borya.memberId, counterTo: offer.id })
          expect((await counter(gosha.key, { guarantor: dasha.memberId })).offer.guarantorId).toBe(dasha.memberId)
          expect((await counter(dasha.key, {})).offer.guarantorId).toBe(room.memberId)
          await refused(offerAct(s, id, vera.key, offer.id, 'counter', { closesAt: s.clock.now + HOUR, noGuarantor: true, guarantor: gosha.memberId }), 400, NO_GUARANTOR_CHOSEN)
          await refused(offerAct(s, id, vera.key, offer.id, 'counter', { closesAt: s.clock.now + HOUR, guarantor: vera.memberId }), 400, BAD_GUARANTOR)
          // Исходное без гаранта: встречное без выбора — тоже без
          const { offer: none } = await ok<CreateOfferResponse>(send(s, id, 'offers', offerForm(s), borya.key))
          const c = await ok<CreateOfferResponse>(offerAct(s, id, vera.key, none.id, 'counter', { closesAt: s.clock.now + HOUR }))
          expect(c.offer.guarantorId).toBeNull()
        })
      })

      // Торг кончился сам по сроку со встречным (Р-37): пари принято в миг конца без записи — суд и
      // апелляция по нему видны в ответе комнаты и идут в «Расчёт»
      describe('торг, кончившийся по сроку (Р-37)', () => {
        const auctionForm = (s: TestServer, more: Record<string, unknown> = {}) => ({
          v: PROTOCOL_VERSION,
          condition: 'Вася бросит курить',
          check: 'Скажет сам',
          amount: 300,
          auction: { start: 100, step: 20 },
          closesAt: s.clock.now + HOUR,
          expectedAt: s.clock.now + DAY,
          ...more,
        })
        const totals = async (s: TestServer, roomId: string, key: string, ids: string[]) => {
          const state = await stateOf(s, roomId, key)
          return ids.map((id) => state.settlement?.members.find((m) => m.memberId === id)?.total.amount)
        }

        it('без гаранта: стороны молчат — суд собран сам; места судей в ответе, решение суда — в «Расчёте»', async () => {
          const s = await server()
          const { room, borya, vera, gosha, dasha, zhenya } = await room6(s)
          const keyOf = keys(room, borya, vera, gosha, dasha, zhenya)
          const id = room.roomId
          const { offer } = await ok<CreateOfferResponse>(send(s, id, 'offers', auctionForm(s, { noGuarantor: true }), borya.key))
          s.clock.now += 1000
          await ok(offerAct(s, id, vera.key, offer.id, 'bid', { amount: 100 }))
          // После конца торга — ни одной записи пари; стороны молчат — суд с «исход к» + срок молчания
          const due = offer.expectedAt + SIDE_SILENCE
          s.clock.now = due
          s.seeds.push(SEED)
          const candidates = [room.memberId, gosha.memberId, dasha.memberId, zhenya.memberId]
          const order = A.drawCourt(SEED, candidates, room.memberId)
          const view = await offerOutcome(s, id, gosha.key, offer.id)
          expect(view).toMatchObject({ phase: 'court', approved: null, appeal: null, court: { seed: SEED, drawnAt: due, candidates: order, decision: null } })
          expect(view?.court?.seats.map((x) => x.member)).toEqual(order.slice(0, 3))
          expect(await courtEntries(s, id)).toEqual(['court.drawn'])
          // Судьи голосуют: «прав соперник» большинством — окончательно, Вера забирает сумму Бори
          const judge = (memberId: string, body: Record<string, unknown>) => offerAct(s, id, keyOf(memberId), offer.id, 'judge', body)
          await ok(judge(order[0], { verdict: 'change', winner: 'taker' }))
          await ok(judge(order[1], { verdict: 'change', winner: 'taker' }))
          await ok(judge(order[2], { verdict: 'cancel' }))
          const at = s.clock.now
          expect(await offerOutcome(s, id, borya.key, offer.id)).toMatchObject({
            phase: 'final',
            approved: { winner: 'taker', at, how: 'court', by: null },
            court: { decision: { at, majority: true, verdict: 'change', winner: 'taker' } },
          })
          expect(await totals(s, id, gosha.key, [borya.memberId, vera.memberId, gosha.memberId])).toEqual([-300, 300, 0])
        })

        it('с гарантом: решил гарант — апелляция стороны и суд в ответе, решение суда — в «Расчёте»', async () => {
          const s = await server()
          const { room, borya, vera, gosha, dasha, zhenya } = await room6(s)
          const keyOf = keys(room, borya, vera, gosha, dasha, zhenya)
          const id = room.roomId
          const { offer } = await ok<CreateOfferResponse>(send(s, id, 'offers', auctionForm(s), borya.key))
          s.clock.now += 1000
          await ok(offerAct(s, id, vera.key, offer.id, 'bid', { amount: 100 }))
          // Конец торга без записи; стороны разошлись, гарант (ведущая) решил в пользу Бори
          s.clock.now = offer.closesAt
          await ok(offerAct(s, id, borya.key, offer.id, 'mark', { winner: 'author' }))
          await ok(offerAct(s, id, vera.key, offer.id, 'mark', { winner: 'taker' }))
          s.clock.now = offer.expectedAt
          await ok(offerAct(s, id, room.key, offer.id, 'decide', { winner: 'author' }))
          s.clock.now += HOUR
          s.seeds.push(SEED)
          const filed = await ok<AppealResponse>(offerAct(s, id, vera.key, offer.id, 'appeal', { reason: 'Гарант не видел видео' }))
          const candidates = [gosha.memberId, dasha.memberId, zhenya.memberId]
          expect(filed.appeal).toMatchObject({ by: vera.memberId, target: offer.id, candidates })
          const order = A.drawCourt(SEED, candidates, room.memberId)
          const view = await offerOutcome(s, id, gosha.key, offer.id)
          expect(view).toMatchObject({ phase: 'approved', finalAt: null, appeal: { by: vera.memberId }, court: { seed: SEED, candidates: order, decision: null } })
          expect(view?.court?.seats.map((x) => x.member)).toEqual(order.slice(0, 3))
          // Пока суд не решил — в «Расчёт» не идёт
          expect(await totals(s, id, gosha.key, [borya.memberId, vera.memberId])).toEqual([0, 0])
          const judge = (memberId: string, body: Record<string, unknown>) => offerAct(s, id, keyOf(memberId), offer.id, 'judge', body)
          await ok(judge(order[0], { verdict: 'change', winner: 'taker' }))
          await ok(judge(order[1], { verdict: 'change', winner: 'taker' }))
          await ok(judge(order[2], { verdict: 'keep' }))
          expect(await offerOutcome(s, id, borya.key, offer.id)).toMatchObject({ phase: 'final', approved: { winner: 'taker', how: 'court' } })
          expect(await totals(s, id, gosha.key, [borya.memberId, vera.memberId, gosha.memberId])).toEqual([-300, 300, 0])
          expect(await courtEntries(s, id)).toEqual(['appeal.filed', 'court.voted', 'court.voted', 'court.voted'])
        })
      })

      it('отказы подачи: согласием — окончательный, 7 дней прошли, отменено, некому судить; нет спора — 404, без ключа — 403, кривое тело — 400', async () => {
        const s = await server()
        const room = await create(s)
        const borya = await member(s, room, 'Боря')
        const vera = await member(s, room, 'Вера')
        const [agreed, late, cancelled, everyone] = [
          await newEvent(s, room.roomId, borya.key),
          await newEvent(s, room.roomId, borya.key),
          await newEvent(s, room.roomId, borya.key),
          await newEvent(s, room.roomId, borya.key),
        ]
        for (const e of [agreed, late, cancelled, everyone]) {
          await ok(eventAct(s, room.roomId, borya.key, e.id, 'bets', { outcome: '1', amount: 100 }))
          await ok(eventAct(s, room.roomId, vera.key, e.id, 'bets', { outcome: '2', amount: 100 }))
        }
        await ok(eventAct(s, room.roomId, room.key, everyone.id, 'bets', { outcome: '1', amount: 100 }))
        s.clock.now = agreed.closesAt
        for (const e of [agreed, late, cancelled, everyone]) await ok(eventAct(s, room.roomId, borya.key, e.id, 'propose', { outcome: '1' }))
        await ok(eventAct(s, room.roomId, vera.key, agreed.id, 'agree'))
        s.clock.now += DAY
        await ok(send(s, room.roomId, `events/${cancelled.id}/cancel`, { reason: 'Условие поняли по-разному' }, room.key))
        const appeal = (key: string | undefined, eventId: string, body: Record<string, unknown> = { reason: 'Не так' }) =>
          eventAct(s, room.roomId, key, eventId, 'appeal', body)
        await refused(appeal(vera.key, agreed.id), 403, A.AGREED_BETTOR)
        await refused(appeal(borya.key, agreed.id), 409, A.AGREED_FINAL)
        await refused(appeal(vera.key, cancelled.id), 409, A.CANCELLED)
        // Все в комнате ставили — судить некому
        await refused(appeal(vera.key, everyone.id), 409, A.NO_JUDGES)
        s.clock.now += 7 * DAY
        await refused(appeal(vera.key, late.id), 409, A.FINAL)
        // Нет события или пари, без ключа, кривой номер запроса, другая версия протокола
        for (const action of ['appeal', 'appeal/join', 'judge', 'replace']) {
          const body = { reason: 'а', verdict: 'cancel', member: vera.memberId }
          await refused(eventAct(s, room.roomId, vera.key, ulid(), action, body), 404, NO_EVENT)
          await refused(eventAct(s, room.roomId, vera.key, 'не-номер', action, body), 404, NO_EVENT)
          await refused(offerAct(s, room.roomId, vera.key, ulid(), action, body), 404, NO_OFFER)
          // Номер события по адресу пари — нет такого пари
          await refused(offerAct(s, room.roomId, vera.key, late.id, action, body), 404, NO_OFFER)
          await refused(eventAct(s, room.roomId, undefined, late.id, action, body), 403, NEED_KEY)
          await refused(eventAct(s, room.roomId, vera.key, late.id, action, { ...body, requestId: 'abc' }), 400, BAD_REQUEST_ID)
          expect((await eventAct(s, room.roomId, vera.key, late.id, action, { ...body, v: PROTOCOL_VERSION + 1 })).status).toBe(400)
        }
        await refused(appeal(vera.key, late.id, { reason: 'а', requestId: 'abc' }), 400, BAD_REQUEST_ID)
        expect(await courtEntries(s, room.roomId)).toEqual([])
      })
    })

    describe('расчёт и переводы (Р-32)', () => {
      const HOUR = 60 * 60 * 1000
      const DAY = 24 * HOUR
      const SEED = 'cd'.repeat(16)
      const ZERO = { amount: 0, events: 0, offers: 0 }

      // Комната: Аня — ведущая, Боря, Вера и Гоша — участники
      async function room4(s: TestServer, form: unknown = FORM) {
        const room = await create(s, form)
        const borya = await member(s, room, 'Боря')
        const vera = await member(s, room, 'Вера')
        const gosha = await member(s, room, 'Гоша')
        return { room, borya, vera, gosha }
      }

      function transfer(s: TestServer, roomId: string, key: string | undefined, body: Record<string, unknown>) {
        return send(s, roomId, 'transfers', { v: PROTOCOL_VERSION, ...body }, key)
      }

      function transferAct(s: TestServer, roomId: string, key: string | undefined, id: string, action: string, body: Record<string, unknown> = {}) {
        return send(s, roomId, `transfers/${id}/${action}`, { v: PROTOCOL_VERSION, ...body }, key)
      }

      async function moved(r: Promise<Response>): Promise<TransferView> {
        const body = await ok<TransferResponse>(r)
        expect(isTransferResponse(body)).toBe(true)
        return body.transfer
      }

      function setMode(s: TestServer, roomId: string, key: string, body: Record<string, unknown>) {
        return send(s, roomId, 'settle-mode', { v: PROTOCOL_VERSION, ...body }, key)
      }

      async function settlementOf(s: TestServer, roomId: string, key: string): Promise<SettlementView> {
        const state = await ok<RoomStateResponse>(get(s, roomId, key))
        expect(isRoomStateResponse(state)).toBe(true)
        expect(isSettlementView(state.settlement)).toBe(true)
        return state.settlement as SettlementView
      }

      // Счётчики лотов (Р-38) и выборов (Р-39) у трёх чисел — 0, если не заданы
      function row(memberId: string, change: Partial<MemberSettlementView> = {}): MemberSettlementView {
        const r = { memberId, total: ZERO, pending: ZERO, inPlay: ZERO, sent: 0, received: 0, balance: 0, ...change }
        const sum = (x: SettleSumView): SettleSumView => ({ lots: 0, choices: 0, ...x })
        return { ...r, total: sum(r.total), pending: sum(r.pending), inPlay: sum(r.inPlay) }
      }

      async function settleEntries(s: TestServer, roomId: string): Promise<string[]> {
        return (await readLog(s.storage(roomId))).map((e) => e.type).filter((t) => t.startsWith('transfer.') || t === 'room.settle-mode')
      }

      // Пари «3 к 1», 300 автора и 100 соперника; гарант — ведущая; обе стороны отметили winner —
      // окончательное сразу. Прав автор — автору +100; прав соперник — сопернику +300
      async function finalOffer(s: TestServer, roomId: string, author: JoinRoomResponse, taker: JoinRoomResponse, winner: 'author' | 'taker') {
        const form = { v: PROTOCOL_VERSION, condition: 'Вася бросит курить', check: 'Скажет сам', odds: { a: 3, b: 1 }, amount: 300, closesAt: s.clock.now + HOUR, expectedAt: s.clock.now + DAY }
        const { offer } = await ok<CreateOfferResponse>(send(s, roomId, 'offers', form, author.key))
        await ok(send(s, roomId, `offers/${offer.id}/accept`, { v: PROTOCOL_VERSION }, taker.key))
        for (const side of [author, taker]) await ok(send(s, roomId, `offers/${offer.id}/mark`, { v: PROTOCOL_VERSION, winner }, side.key))
        return offer
      }

      it('«Перевёл» → «Получил»: записи журнала transfer.*, перевод и свод — у всех участников', async () => {
        const s = await server()
        const { room, borya, vera, gosha } = await room4(s)
        await finalOffer(s, room.roomId, borya, vera, 'taker')
        const before = await settlementOf(s, room.roomId, gosha.key)
        expect(before.suggestions).toEqual([{ from: borya.memberId, to: vera.memberId, amount: 300 }])
        // Боря — «Перевёл» Вере 300: ждёт подтверждения, в балансе уже считается
        s.clock.now += 1000
        const sentAt = s.clock.now
        const sent = await moved(transfer(s, room.roomId, borya.key, { to: vera.memberId, amount: 300 }))
        expect(sent).toEqual({ id: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{26}$/), at: sentAt, from: borya.memberId, to: vera.memberId, amount: 300, by: 'sender', status: 'pending', changedAt: sentAt })
        const log = await readLog(s.storage(room.roomId))
        expect(log.at(-1)).toEqual({ id: sent.id, at: sentAt, memberId: borya.memberId, type: 'transfer.sent', to: vera.memberId, amount: 300, requestId: expect.any(String) })
        const settled = {
          mode: 'stakes',
          members: [
            row(room.memberId),
            row(borya.memberId, { total: { amount: -300, events: 0, offers: 1 }, sent: 300 }),
            row(vera.memberId, { total: { amount: 300, events: 0, offers: 1 }, received: 300 }),
            row(gosha.memberId),
          ],
          transfers: [sent],
          suggestions: [],
        }
        for (const key of [room.key, borya.key, vera.key, gosha.key]) expect(await settlementOf(s, room.roomId, key)).toEqual(settled)
        // Вера — «Получил»: перевод получен
        s.clock.now += 1000
        const received = await moved(transferAct(s, room.roomId, vera.key, sent.id, 'receive'))
        expect(received).toEqual({ ...sent, status: 'received', changedAt: s.clock.now })
        expect((await readLog(s.storage(room.roomId))).at(-1)).toEqual({ id: expect.any(String), at: s.clock.now, memberId: vera.memberId, type: 'transfer.received', transfer: sent.id, requestId: expect.any(String) })
        expect(await settlementOf(s, room.roomId, borya.key)).toEqual({ ...settled, transfers: [received] })
        expect(await settleEntries(s, room.roomId)).toEqual(['transfer.sent', 'transfer.received'])
      })

      it('«Не получал», отмена своей отметки и «Получил» сам — новыми записями; из неподходящего состояния — 409', async () => {
        const s = await server()
        const { room, borya, vera } = await room4(s)
        const id = room.roomId
        // «Не получал» — перевод отклонён и в балансе не считается; отменять его нечего
        const t1 = await moved(transfer(s, id, borya.key, { to: vera.memberId, amount: 100 }))
        expect(await moved(transferAct(s, id, vera.key, t1.id, 'reject'))).toMatchObject({ status: 'rejected' })
        await refused(transferAct(s, id, borya.key, t1.id, 'cancel'), 409, T.ALREADY_REJECTED)
        await refused(transferAct(s, id, vera.key, t1.id, 'receive'), 409, T.ALREADY_REJECTED)
        // Должник отменил своё «Перевёл» — перевод отменён
        const t2 = await moved(transfer(s, id, borya.key, { to: vera.memberId, amount: 50 }))
        expect(await moved(transferAct(s, id, borya.key, t2.id, 'cancel'))).toMatchObject({ status: 'cancelled' })
        await refused(transferAct(s, id, borya.key, t2.id, 'cancel'), 409, T.TRANSFER_CANCELLED)
        await refused(transferAct(s, id, vera.key, t2.id, 'receive'), 409, T.TRANSFER_CANCELLED)
        // Получатель подтвердил — должник уже не отменяет; получатель отменил своё «Получил» — снова ждёт
        const t3 = await moved(transfer(s, id, borya.key, { to: vera.memberId, amount: 70 }))
        await refused(transferAct(s, id, vera.key, t3.id, 'cancel'), 409, T.NOTHING_TO_REVOKE)
        await moved(transferAct(s, id, vera.key, t3.id, 'receive'))
        await refused(transferAct(s, id, vera.key, t3.id, 'receive'), 409, T.ALREADY_RECEIVED)
        await refused(transferAct(s, id, borya.key, t3.id, 'cancel'), 409, T.RECEIVED_NO_REVOKE)
        expect(await moved(transferAct(s, id, vera.key, t3.id, 'cancel'))).toMatchObject({ status: 'pending' })
        // «Получил» сам, без «Перевёл»: сразу получен; отмена — отменён
        const t4 = await moved(transfer(s, id, vera.key, { from: borya.memberId, amount: 30 }))
        expect(t4).toMatchObject({ from: borya.memberId, to: vera.memberId, amount: 30, by: 'receiver', status: 'received' })
        expect((await readLog(s.storage(id))).at(-1)).toMatchObject({ type: 'transfer.received', memberId: vera.memberId, from: borya.memberId, amount: 30 })
        expect(await moved(transferAct(s, id, vera.key, t4.id, 'cancel'))).toMatchObject({ status: 'cancelled' })
        // Свод: в балансе — только «ждёт подтверждения» (t3)
        const settlement = await settlementOf(s, id, room.key)
        expect(settlement.transfers.map((t) => [t.id, t.status])).toEqual([
          [t1.id, 'rejected'],
          [t2.id, 'cancelled'],
          [t3.id, 'pending'],
          [t4.id, 'cancelled'],
        ])
        expect(settlement.members.find((m) => m.memberId === borya.memberId)).toMatchObject({ sent: 70, balance: 70 })
        expect(settlement.members.find((m) => m.memberId === vera.memberId)).toMatchObject({ received: 70, balance: -70 })
        expect(await settleEntries(s, id)).toEqual([
          'transfer.sent',
          'transfer.rejected',
          'transfer.sent',
          'transfer.revoked',
          'transfer.sent',
          'transfer.received',
          'transfer.revoked',
          'transfer.received',
          'transfer.revoked',
        ])
      })

      it('отказы: не участник, не своя сторона, сам себе, кривое тело, нет перевода — без записи', async () => {
        const s = await server()
        const { room, borya, vera, gosha } = await room4(s)
        const id = room.roomId
        const t = await moved(transfer(s, id, borya.key, { to: vera.memberId, amount: 100 }))
        const waiting = await join(s, room, 'Даша')
        const before = await logSnapshot(s.storage(id))
        // Не своя сторона: «Получил» и «Не получал» — только получатель; отменить — только своё
        await refused(transferAct(s, id, gosha.key, t.id, 'receive'), 403, T.ONLY_RECEIVER)
        await refused(transferAct(s, id, borya.key, t.id, 'receive'), 403, T.ONLY_RECEIVER)
        await refused(transferAct(s, id, gosha.key, t.id, 'reject'), 403, T.ONLY_RECEIVER)
        await refused(transferAct(s, id, gosha.key, t.id, 'cancel'), 403, T.ONLY_OWN)
        // Сам себе и не участник комнаты
        await refused(transfer(s, id, borya.key, { to: borya.memberId, amount: 100 }), 400, T.SELF_TRANSFER)
        await refused(transfer(s, id, borya.key, { from: borya.memberId, amount: 100 }), 400, T.SELF_TRANSFER)
        await refused(transfer(s, id, borya.key, { to: ulid(s.clock.now), amount: 100 }), 400, T.NOT_MEMBER)
        await refused(transfer(s, id, borya.key, { from: 'кто-то', amount: 100 }), 400, T.NOT_MEMBER)
        await refused(transfer(s, id, borya.key, { to: 5, amount: 100 }), 400, T.NOT_MEMBER)
        // Ключ не участника: заявка, которую не впустили, чужой ключ, без ключа
        await refused(transfer(s, id, waiting.key, { to: vera.memberId, amount: 100 }), 403, WAITING, 'waiting')
        await refused(transfer(s, id, 'not-a-member-key', { to: vera.memberId, amount: 100 }), 403, WRONG_KEY)
        await refused(transferAct(s, id, 'not-a-member-key', t.id, 'receive'), 403, WRONG_KEY)
        await refused(transfer(s, id, undefined, { to: vera.memberId, amount: 100 }), 403, NEED_KEY)
        // Кривое тело: кому и от кого — одно; сумма — целое > 0; номер запроса
        await refused(transfer(s, id, borya.key, { to: vera.memberId, from: gosha.memberId, amount: 100 }), 400, NEED_PARTY)
        await refused(transfer(s, id, borya.key, { amount: 100 }), 400, NEED_PARTY)
        for (const amount of [0, -5, 1.5, '100', undefined]) await refused(transfer(s, id, borya.key, { to: vera.memberId, amount }), 400, BAD_AMOUNT)
        await refused(transfer(s, id, borya.key, { to: vera.memberId, amount: 100, requestId: 'abc' }), 400, BAD_REQUEST_ID)
        await refused(transferAct(s, id, vera.key, t.id, 'receive', { requestId: 'abc' }), 400, BAD_REQUEST_ID)
        expect((await transfer(s, id, borya.key, { to: vera.memberId, amount: 100, v: PROTOCOL_VERSION + 1 })).status).toBe(400)
        // Нет перевода — 404; чужой адрес — 404
        await refused(transferAct(s, id, vera.key, ulid(s.clock.now), 'receive'), 404, T.NO_TRANSFER)
        await refused(transferAct(s, id, vera.key, 'abc', 'receive'), 404, T.NO_TRANSFER)
        expect((await transferAct(s, id, vera.key, t.id, 'delete')).status).toBe(404)
        expect((await s.send(`/rooms/${id}/transfers`, { headers: { Authorization: 'Bearer ' + borya.key } })).status).toBe(404)
        // Без тела ответ на перевод можно — пустой запрос (номер запроса — новый)
        const r = await s.send(`/rooms/${id}/transfers/${t.id}/reject`, { method: 'POST', headers: { Authorization: 'Bearer ' + vera.key } })
        expect(r.status).toBe(200)
        const after = await logSnapshot(s.storage(id))
        expect([...after].slice(0, before.size)).toEqual([...before])
        expect(after.size).toBe(before.size + 1)
      })

      it('повтор с тем же requestId — тот же перевод без второй записи; другое содержимое или действие — 409', async () => {
        const s = await server()
        const { room, borya, vera, gosha } = await room4(s)
        const id = room.roomId
        const requestId = ulid(s.clock.now)
        const first = await moved(transfer(s, id, borya.key, { to: vera.memberId, amount: 100, requestId }))
        s.clock.now += 1000
        expect(await moved(transfer(s, id, borya.key, { to: vera.memberId, amount: 100, requestId }))).toEqual(first)
        await refused(transfer(s, id, borya.key, { to: vera.memberId, amount: 200, requestId }), 409, REQUEST_USED)
        await refused(transfer(s, id, borya.key, { to: gosha.memberId, amount: 100, requestId }), 409, REQUEST_USED)
        await refused(transfer(s, id, vera.key, { from: borya.memberId, amount: 100, requestId }), 409, REQUEST_USED)
        await refused(transferAct(s, id, vera.key, first.id, 'receive', { requestId }), 409, REQUEST_USED)
        // Ответ на перевод: повтор — перевод, каким он сейчас; тот же номер у другого ответа — 409
        const answer = ulid(s.clock.now)
        const received = await moved(transferAct(s, id, vera.key, first.id, 'receive', { requestId: answer }))
        s.clock.now += 1000
        expect(await moved(transferAct(s, id, vera.key, first.id, 'receive', { requestId: answer }))).toEqual(received)
        await refused(transferAct(s, id, vera.key, first.id, 'reject', { requestId: answer }), 409, REQUEST_USED)
        await refused(transferAct(s, id, vera.key, first.id, 'cancel', { requestId: answer }), 409, REQUEST_USED)
        // «Получил» сам — повтор так же
        const direct = ulid(s.clock.now)
        const own = await moved(transfer(s, id, gosha.key, { from: vera.memberId, amount: 40, requestId: direct }))
        expect(await moved(transfer(s, id, gosha.key, { from: vera.memberId, amount: 40, requestId: direct }))).toEqual(own)
        await refused(transfer(s, id, gosha.key, { to: vera.memberId, amount: 40, requestId: direct }), 409, REQUEST_USED)
        // Номер запроса другого действия комнаты (пари) — тоже занят
        const offer = await finalOffer(s, id, borya, vera, 'author')
        const offerRequest = (await readLog(s.storage(id))).find((e) => e.type === 'offer.created' && e.id === offer.id)
        await refused(transfer(s, id, borya.key, { to: vera.memberId, amount: 1, requestId: (offerRequest as { requestId: string }).requestId }), 409, REQUEST_USED)
        expect(await settleEntries(s, id)).toEqual(['transfer.sent', 'transfer.received', 'transfer.received'])
        // Два одинаковых запроса одновременно — одна запись
        const twice = ulid(s.clock.now)
        const [a, b] = await Promise.all([
          transfer(s, id, borya.key, { to: gosha.memberId, amount: 10, requestId: twice }),
          transfer(s, id, borya.key, { to: gosha.memberId, amount: 10, requestId: twice }),
        ])
        expect([a.status, b.status]).toEqual([200, 200])
        expect(await b.json()).toEqual(await a.json())
        expect(await settleEntries(s, id)).toEqual(['transfer.sent', 'transfer.received', 'transfer.received', 'transfer.sent'])
      })

      it('свод: окончательное событие — в итоге, утверждённое — ждёт окончательности, без исхода — в игре; подсказка «по ставкам»', async () => {
        const s = await server()
        const { room, borya, vera, gosha } = await room4(s)
        const id = room.roomId
        const eventForm = { v: PROTOCOL_VERSION, condition: 'Вася пробежит 10 км', check: 'Скрин', closesAt: s.clock.now + HOUR, expectedAt: s.clock.now + 2 * HOUR }
        const e1 = (await ok<CreateEventResponse>(send(s, id, 'events', eventForm, borya.key))).event
        const e2 = (await ok<CreateEventResponse>(send(s, id, 'events', eventForm, gosha.key))).event
        await ok(send(s, id, `events/${e1.id}/bets`, { v: PROTOCOL_VERSION, outcome: '1', amount: 300 }, borya.key))
        await ok(send(s, id, `events/${e1.id}/bets`, { v: PROTOCOL_VERSION, outcome: '2', amount: 100 }, vera.key))
        await ok(send(s, id, `events/${e2.id}/bets`, { v: PROTOCOL_VERSION, outcome: '1', amount: 200 }, gosha.key))
        await ok(send(s, id, `events/${e2.id}/bets`, { v: PROTOCOL_VERSION, outcome: '2', amount: 100 }, vera.key))
        // Ставки без исхода — в игре
        expect((await settlementOf(s, id, room.key)).members).toEqual([
          row(room.memberId),
          row(borya.memberId, { inPlay: { amount: 300, events: 1, offers: 0 } }),
          row(vera.memberId, { inPlay: { amount: 200, events: 2, offers: 0 } }),
          row(gosha.memberId, { inPlay: { amount: 200, events: 1, offers: 0 } }),
        ])
        // Первое — досрочно «Да», Вера согласна: окончательное сразу (Р-21, Р-27); второе — «Да» после
        // «приём до», сутки без возражения: утверждено, окончательное через 7 дней
        await ok(send(s, id, `events/${e1.id}/propose`, { v: PROTOCOL_VERSION, outcome: '1' }, borya.key))
        await ok(send(s, id, `events/${e1.id}/agree`, { v: PROTOCOL_VERSION }, vera.key))
        s.clock.now = e2.closesAt
        await ok(send(s, id, `events/${e2.id}/propose`, { v: PROTOCOL_VERSION, outcome: '1' }, gosha.key))
        s.clock.now += DAY
        const settlement = await settlementOf(s, id, vera.key)
        expect(settlement).toEqual({
          mode: 'stakes',
          members: [
            row(room.memberId),
            row(borya.memberId, { total: { amount: 100, events: 1, offers: 0 }, balance: 100 }),
            row(vera.memberId, { total: { amount: -100, events: 1, offers: 0 }, pending: { amount: -100, events: 1, offers: 0 }, balance: -100 }),
            row(gosha.memberId, { pending: { amount: 100, events: 1, offers: 0 } }),
          ],
          transfers: [],
          suggestions: [{ from: vera.memberId, to: borya.memberId, amount: 100 }],
        })
        // Через 7 дней второе окончательное — в итоге и в подсказке
        s.clock.now += 7 * DAY
        const later = await settlementOf(s, id, vera.key)
        expect(later.members.find((m) => m.memberId === vera.memberId)).toEqual(row(vera.memberId, { total: { amount: -200, events: 2, offers: 0 }, balance: -200 }))
        expect(later.suggestions).toHaveLength(2)
        expect(later.suggestions).toEqual(
          expect.arrayContaining([
            { from: vera.memberId, to: borya.memberId, amount: 100 },
            { from: vera.memberId, to: gosha.memberId, amount: 100 },
          ]),
        )
      })

      it('свод после решения суда по пари: до решения — в игре, «прав соперник» судом — в итоге', async () => {
        const s = await server()
        const { room, borya, vera, gosha } = await room4(s)
        const dasha = await member(s, room, 'Даша')
        const zhenya = await member(s, room, 'Женя')
        const people = [room, borya, vera, gosha, dasha, zhenya]
        const keyOf = (memberId: string) => people.find((p) => p.memberId === memberId)?.key ?? 'no-key'
        const id = room.roomId
        const form = { v: PROTOCOL_VERSION, condition: 'Вася бросит курить', check: 'Скажет сам', odds: { a: 3, b: 1 }, amount: 300, closesAt: s.clock.now + HOUR, expectedAt: s.clock.now + DAY }
        const { offer } = await ok<CreateOfferResponse>(send(s, id, 'offers', form, borya.key))
        const act = (key: string, action: string, body: Record<string, unknown> = {}) => send(s, id, `offers/${offer.id}/${action}`, { v: PROTOCOL_VERSION, ...body }, key)
        await ok(act(vera.key, 'accept'))
        // Гарант отказался, стороны не сошлись на новом 3 дня — суд сам (Р-31)
        await ok(act(room.key, 'decline'))
        const due = s.clock.now + NEED_GUARANTOR_TIME
        await ok(act(borya.key, 'nominate', { guarantor: gosha.memberId }))
        await ok(act(vera.key, 'nominate', { guarantor: dasha.memberId }))
        s.clock.now = due
        s.seeds.push(SEED)
        const inPlay = await settlementOf(s, id, zhenya.key)
        expect(inPlay.members.find((m) => m.memberId === borya.memberId)).toEqual(row(borya.memberId, { inPlay: { amount: 300, events: 0, offers: 1 } }))
        expect(inPlay.members.find((m) => m.memberId === vera.memberId)).toEqual(row(vera.memberId, { inPlay: { amount: 100, events: 0, offers: 1 } }))
        expect(inPlay.suggestions).toEqual([])
        const order = A.drawCourt(SEED, [gosha.memberId, dasha.memberId, zhenya.memberId], room.memberId)
        await ok(act(keyOf(order[0]), 'judge', { verdict: 'change', winner: 'taker' }))
        await ok(act(keyOf(order[1]), 'judge', { verdict: 'change', winner: 'taker' }))
        await ok(act(keyOf(order[2]), 'judge', { verdict: 'cancel' }))
        const decided = await settlementOf(s, id, zhenya.key)
        expect(decided.members.find((m) => m.memberId === borya.memberId)).toEqual(row(borya.memberId, { total: { amount: -300, events: 0, offers: 1 }, balance: -300 }))
        expect(decided.members.find((m) => m.memberId === vera.memberId)).toEqual(row(vera.memberId, { total: { amount: 300, events: 0, offers: 1 }, balance: 300 }))
        expect(decided.suggestions).toEqual([{ from: borya.memberId, to: vera.memberId, amount: 300 }])
      })

      it('режим при создании: с полем — в записи room.created и в своде; без поля — «по ставкам»; кривой — 400', async () => {
        const s = await server()
        const fewest = await create(s, { ...FORM, settleMode: 'fewest' })
        expect((await readLog(s.storage(fewest.roomId)))[0]).toMatchObject({ type: 'room.created', settleMode: 'fewest' })
        expect((await settlementOf(s, fewest.roomId, fewest.key)).mode).toBe('fewest')
        const plain = await create(s)
        expect('settleMode' in (await readLog(s.storage(plain.roomId)))[0]).toBe(false)
        expect((await settlementOf(s, plain.roomId, plain.key)).mode).toBe('stakes')
        const stakes = await create(s, { ...FORM, settleMode: 'stakes' })
        expect((await settlementOf(s, stakes.roomId, stakes.key)).mode).toBe('stakes')
        const rooms = s.roomIds()
        for (const settleMode of ['меньше', null, 1]) {
          const r = await post(s, { ...FORM, settleMode })
          expect(r.status).toBe(400)
          expect(await r.json()).toEqual({ v: PROTOCOL_VERSION, error: T.BAD_MODE })
        }
        expect(s.roomIds()).toEqual(rooms)
        // Повтор создания: тот же режим — та же комната; другой — 409
        const requestId = ulid(s.clock.now)
        const first = await create(s, { ...FORM, requestId, settleMode: 'fewest' })
        expect(await create(s, { ...FORM, requestId, settleMode: 'fewest' })).toEqual(first)
        const other = await post(s, { ...FORM, requestId })
        expect(other.status).toBe(409)
        expect(await other.json()).toEqual({ v: PROTOCOL_VERSION, error: REQUEST_TAKEN })
      })

      it('смена режима: ведущий, пока переводов нет; не ведущий, тот же, кривой — отказ; после перевода — только когда все рассчитались', async () => {
        const s = await server()
        const { room, borya, vera, gosha } = await room4(s)
        const id = room.roomId
        // Боря должен Вере 100, Вера — Гоше 100: «по ставкам» — два перевода, «меньше переводов» — один
        await finalOffer(s, id, vera, borya, 'author')
        await finalOffer(s, id, gosha, vera, 'author')
        const stakes = await settlementOf(s, id, borya.key)
        expect(stakes.mode).toBe('stakes')
        expect(stakes.suggestions).toHaveLength(2)
        expect(stakes.suggestions).toEqual(
          expect.arrayContaining([
            { from: borya.memberId, to: vera.memberId, amount: 100 },
            { from: vera.memberId, to: gosha.memberId, amount: 100 },
          ]),
        )
        await refused(setMode(s, id, borya.key, { mode: 'fewest' }), 403, T.ONLY_HOST_MODE)
        await refused(setMode(s, id, room.key, { mode: 'stakes' }), 409, T.SAME_MODE)
        await refused(setMode(s, id, room.key, { mode: 'меньше' }), 400, T.BAD_MODE)
        await refused(setMode(s, id, room.key, {}), 400, T.BAD_MODE)
        expect(await settleEntries(s, id)).toEqual([])
        // Ведущая сменила — запись room.settle-mode, режим и подсказка — у всех; повтор — без второй записи
        const requestId = ulid(s.clock.now)
        const changed = await ok<SettleModeResponse>(setMode(s, id, room.key, { mode: 'fewest', requestId }))
        expect(isSettleModeResponse(changed)).toBe(true)
        expect(changed.settleMode).toEqual({ id: expect.any(String), at: s.clock.now, by: room.memberId, mode: 'fewest' })
        expect((await readLog(s.storage(id))).at(-1)).toEqual({ id: changed.settleMode.id, at: s.clock.now, memberId: room.memberId, type: 'room.settle-mode', mode: 'fewest', requestId })
        s.clock.now += 1000
        expect(await ok<SettleModeResponse>(setMode(s, id, room.key, { mode: 'fewest', requestId }))).toEqual(changed)
        await refused(setMode(s, id, room.key, { mode: 'stakes', requestId }), 409, REQUEST_USED)
        for (const key of [room.key, borya.key, vera.key, gosha.key]) {
          const fewest = await settlementOf(s, id, key)
          expect(fewest.mode).toBe('fewest')
          expect(fewest.suggestions).toEqual([{ from: borya.memberId, to: gosha.memberId, amount: 100 }])
        }
        // Первый перевод — режим не меняется, пока не все рассчитались и перевод ждёт подтверждения
        const t = await moved(transfer(s, id, borya.key, { to: gosha.memberId, amount: 100 }))
        await refused(setMode(s, id, room.key, { mode: 'stakes' }), 409, T.MODE_LOCKED)
        await moved(transferAct(s, id, gosha.key, t.id, 'receive'))
        const settled = await settlementOf(s, id, room.key)
        expect(settled.members.every((m) => m.balance === 0)).toBe(true)
        expect(settled.suggestions).toEqual([])
        // Все рассчитались — можно; «по ставкам» долги по кругу (Боря → Вера → Гоша → Боря) сокращаются — пусто
        await ok(setMode(s, id, room.key, { mode: 'stakes' }))
        const back = await settlementOf(s, id, vera.key)
        expect(back.mode).toBe('stakes')
        expect(back.suggestions).toEqual([])
        expect(await settleEntries(s, id)).toEqual(['room.settle-mode', 'transfer.sent', 'transfer.received', 'room.settle-mode'])
      })

      it('комната на очки: переводы и смена режима — отказ правил; три числа в своде есть, подсказки нет', async () => {
        const s = await server()
        const { room, borya, vera } = await room4(s, { ...FORM, currency: 'PTS' })
        const id = room.roomId
        await finalOffer(s, id, borya, vera, 'taker')
        await refused(transfer(s, id, borya.key, { to: vera.memberId, amount: 300 }), 409, T.NO_TRANSFERS)
        await refused(transfer(s, id, vera.key, { from: borya.memberId, amount: 300 }), 409, T.NO_TRANSFERS)
        await refused(transferAct(s, id, vera.key, ulid(s.clock.now), 'receive'), 409, T.NO_TRANSFERS)
        await refused(setMode(s, id, room.key, { mode: 'fewest' }), 409, T.NO_TRANSFERS)
        const settlement = await settlementOf(s, id, borya.key)
        expect(settlement.members.find((m) => m.memberId === vera.memberId)).toEqual(row(vera.memberId, { total: { amount: 300, events: 0, offers: 1 }, balance: 300 }))
        expect(settlement.transfers).toEqual([])
        expect(settlement.suggestions).toEqual([])
        expect(await settleEntries(s, id)).toEqual([])
      })
    })

    describe('лот (Р-38)', () => {
      const MINUTE = 60 * 1000
      const HOUR = 60 * MINUTE
      const DAY = 24 * HOUR
      const SILENCE = NORMAL_TIMES.silence
      const SEED = '9a'.repeat(16)
      const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/

      // Комната: Аня — ведущая, Боря, Вера и Гоша — участники
      async function room4(s: TestServer, form: unknown = FORM) {
        const room = await create(s, form)
        const borya = await member(s, room, 'Боря')
        const vera = await member(s, room, 'Вера')
        const gosha = await member(s, room, 'Гоша')
        return { room, borya, vera, gosha }
      }

      // Велосипед: старт 1000, шаг не задан — 100; торг — час
      function lotForm(s: TestServer, change: Record<string, unknown> = {}): Record<string, unknown> {
        return { v: PROTOCOL_VERSION, title: 'Велосипед «Кама»', description: 'Синий, с корзинкой', start: 1000, closesAt: s.clock.now + HOUR, ...change }
      }

      async function newLot(s: TestServer, roomId: string, key: string, body: unknown): Promise<LotView> {
        const r = await ok<LotResponse>(send(s, roomId, 'lots', body, key))
        expect(isLotResponse(r)).toBe(true)
        return r.lot
      }

      function lotAct(s: TestServer, roomId: string, key: string | undefined, lotId: string, action: string, body: Record<string, unknown> = {}) {
        return send(s, roomId, `lots/${lotId}/${action}`, { v: PROTOCOL_VERSION, ...body }, key)
      }

      function bid(s: TestServer, roomId: string, key: string | undefined, lotId: string, amount: unknown, requestId?: string) {
        return lotAct(s, roomId, key, lotId, 'bid', { amount, requestId })
      }

      async function bidOk(s: TestServer, roomId: string, key: string, lotId: string, amount: number, requestId?: string): Promise<BidLotResponse> {
        const r = await ok<BidLotResponse>(bid(s, roomId, key, lotId, amount, requestId))
        expect(isBidLotResponse(r)).toBe(true)
        return r
      }

      async function markOk(s: TestServer, roomId: string, key: string, lotId: string, action: string, requestId?: string): Promise<LotMarkResponse> {
        const r = await ok<LotMarkResponse>(lotAct(s, roomId, key, lotId, action, { requestId }))
        expect(isLotMarkResponse(r)).toBe(true)
        return r
      }

      async function stateOf(s: TestServer, roomId: string, key: string): Promise<RoomStateResponse> {
        const state = await ok<RoomStateResponse>(get(s, roomId, key))
        expect(isRoomStateResponse(state)).toBe(true)
        expect(Array.isArray(state.lots)).toBe(true)
        return state
      }

      async function lotOf(s: TestServer, roomId: string, key: string, lotId: string): Promise<LotView> {
        const found = (await stateOf(s, roomId, key)).lots?.find((l) => l.id === lotId)
        expect(found).toBeDefined()
        return found as LotView
      }

      async function lotEntries(s: TestServer, roomId: string): Promise<string[]> {
        return (await readLog(s.storage(roomId))).map((e) => e.type).filter((t) => t.startsWith('lot.'))
      }

      // Три числа участника в «Расчёте»: сумма и счётчик лотов
      async function sums(s: TestServer, roomId: string, key: string, ...ids: string[]) {
        const settlement = (await stateOf(s, roomId, key)).settlement
        return ids.map((id) => {
          const m = settlement?.members.find((x) => x.memberId === id)
          const short = (x: SettleSumView | undefined) => [x?.amount, x?.lots]
          return { total: short(m?.total), pending: short(m?.pending), inPlay: short(m?.inPlay) }
        })
      }

      it('выставить лот: продавец — автор, шаг — 10 % старта, сроки темпа — в записи; видно всем; повтор — тот же лот', async () => {
        const s = await server()
        const { room, borya, vera, gosha } = await room4(s)
        const requestId = ulid(s.clock.now)
        const form = lotForm(s, { requestId })
        const closesAt = form.closesAt as number
        const lot = await newLot(s, room.roomId, borya.key, form)
        expect(lot).toEqual({
          id: expect.stringMatching(ULID),
          at: s.clock.now,
          sellerId: borya.memberId,
          title: 'Велосипед «Кама»',
          description: 'Синий, с корзинкой',
          start: 1000,
          step: 100,
          closesAt,
          latestEnd: closesAt + AUCTION_EXTEND_MAX,
          endsAt: closesAt,
          times: NORMAL_TIMES,
          status: 'open',
          bids: [],
          best: null,
          winner: null,
          amount: null,
          withdrawnAt: null,
          handedAt: null,
          declinedAt: null,
          disputedAt: null,
          disputeFrom: null,
          silenceUntil: null,
          received: null,
          closedAt: null,
        })
        expect((await readLog(s.storage(room.roomId))).at(-1)).toEqual({
          id: lot.id,
          at: s.clock.now,
          memberId: borya.memberId,
          type: 'lot.created',
          title: 'Велосипед «Кама»',
          description: 'Синий, с корзинкой',
          start: 1000,
          step: 100,
          closesAt,
          times: NORMAL_TIMES,
          requestId,
        })
        for (const key of [room.key, borya.key, vera.key, gosha.key]) expect(await lotOf(s, room.roomId, key, lot.id)).toEqual(lot)
        // Повтор — тот же лот без записи; тот же номер с другим названием или от другого — 409
        expect(await newLot(s, room.roomId, borya.key, form)).toEqual(lot)
        await refused(send(s, room.roomId, 'lots', { ...form, title: 'Самокат' }, borya.key), 409, REQUEST_USED)
        await refused(send(s, room.roomId, 'lots', form, vera.key), 409, REQUEST_USED)
        // Свой шаг; описание не задано — пустое; ведущий тоже продаёт
        const own = await newLot(s, room.roomId, room.key, lotForm(s, { step: 50, description: undefined }))
        expect(own).toMatchObject({ sellerId: room.memberId, step: 50, description: '' })
        expect(await lotEntries(s, room.roomId)).toEqual(['lot.created', 'lot.created'])
      })

      it('ставки: перебивают друг друга, видны всем; лучшая — «в игре» у её автора; повтор ставки — тот же ответ', async () => {
        const s = await server()
        const { room, borya, vera, gosha } = await room4(s)
        const lot = await newLot(s, room.roomId, borya.key, lotForm(s))
        s.clock.now += 1000
        const requestId = ulid(s.clock.now)
        const first = await bidOk(s, room.roomId, vera.key, lot.id, 1000, requestId)
        expect(first.bid).toEqual({ id: expect.stringMatching(ULID), at: s.clock.now, by: vera.memberId, lot: lot.id, amount: 1000 })
        expect(first.lot).toMatchObject({ status: 'open', best: { id: first.bid.id, by: vera.memberId, amount: 1000 } })
        expect((await readLog(s.storage(room.roomId))).at(-1)).toEqual({
          id: first.bid.id,
          at: s.clock.now,
          memberId: vera.memberId,
          type: 'lot.bid',
          lot: lot.id,
          amount: 1000,
          requestId,
        })
        s.clock.now += 1000
        const second = await bidOk(s, room.roomId, gosha.key, lot.id, 1100)
        s.clock.now += 1000
        const third = await bidOk(s, room.roomId, vera.key, lot.id, 1250)
        const bids = [first, second, third].map(({ bid: b }) => ({ id: b.id, at: b.at, by: b.by, amount: b.amount }))
        for (const key of [room.key, borya.key, vera.key, gosha.key]) {
          expect(await lotOf(s, room.roomId, key, lot.id)).toMatchObject({ status: 'open', bids, best: bids[2], winner: null, endsAt: lot.closesAt })
        }
        // Перебитая ставка свободна: «в игре» — только лучшая
        expect(await sums(s, room.roomId, room.key, vera.memberId, gosha.memberId)).toEqual([
          { total: [0, 0], pending: [0, 0], inPlay: [1250, 1] },
          { total: [0, 0], pending: [0, 0], inPlay: [0, 0] },
        ])
        // Повтор — та же ставка без записи; другая сумма или другой участник — 409
        expect((await bidOk(s, room.roomId, vera.key, lot.id, 1000, requestId)).bid).toEqual(first.bid)
        await refused(bid(s, room.roomId, vera.key, lot.id, 2000, requestId), 409, REQUEST_USED)
        await refused(bid(s, room.roomId, gosha.key, lot.id, 1000, requestId), 409, REQUEST_USED)
        expect(await lotEntries(s, room.roomId)).toEqual(['lot.created', 'lot.bid', 'lot.bid', 'lot.bid'])
      })

      it('отказы: форма — 400; продавец не ставит — 403; меньше старта и шага — 409; кривая сумма — 400; снять — продавец и пока ставок нет', async () => {
        const s = await server()
        const { room, borya, vera, gosha } = await room4(s)
        const now = s.clock.now
        const cases: [Record<string, unknown>, string][] = [
          [{ title: ' ' }, L.NEED_LOT_TITLE],
          [{ title: 'я'.repeat(L.MAX_LOT_TITLE + 1) }, L.LONG_LOT_TITLE],
          [{ description: 'я'.repeat(301) }, L.LONG_LOT_DESCRIPTION],
          [{ start: 0 }, L.BAD_LOT_START],
          [{ start: 'сто' }, L.BAD_LOT_START],
          [{ step: 0 }, L.BAD_LOT_STEP],
          [{ closesAt: undefined }, L.NEED_LOT_END],
          [{ closesAt: now + 10 * MINUTE - 1 }, L.LOT_SHORT],
          [{ closesAt: now - HOUR }, L.LOT_SHORT],
          [{ closesAt: now + 3 * DAY + 1 }, L.LOT_LONG],
          [{ requestId: 'abc' }, BAD_REQUEST_ID],
        ]
        for (const [change, error] of cases) await refused(send(s, room.roomId, 'lots', lotForm(s, change), borya.key), 400, error)
        const dima = await join(s, room, 'Дима')
        await refused(send(s, room.roomId, 'lots', lotForm(s)), 403, NEED_KEY)
        await refused(send(s, room.roomId, 'lots', lotForm(s), dima.key), 403, WAITING, 'waiting')
        expect((await send(s, room.roomId, 'lots', lotForm(s, { v: PROTOCOL_VERSION + 1 }), borya.key)).status).toBe(400)
        expect(await lotEntries(s, room.roomId)).toEqual([])
        // Ровно 10 минут и ровно 3 дня — можно
        await newLot(s, room.roomId, borya.key, lotForm(s, { closesAt: now + 10 * MINUTE }))
        const lot = await newLot(s, room.roomId, borya.key, lotForm(s, { closesAt: now + 3 * DAY }))

        await refused(bid(s, room.roomId, borya.key, lot.id, 1000), 403, L.OWN_LOT)
        for (const amount of [0, -5, 1.5, 'сто', undefined]) await refused(bid(s, room.roomId, vera.key, lot.id, amount), 400, L.BAD_LOT_BID)
        await refused(bid(s, room.roomId, vera.key, lot.id, 999), 409, L.LOT_BID_LOW)
        await refused(bid(s, room.roomId, vera.key, lot.id, 1000, 'abc'), 400, BAD_REQUEST_ID)
        await bidOk(s, room.roomId, vera.key, lot.id, 1000)
        await refused(bid(s, room.roomId, gosha.key, lot.id, 1099), 409, L.LOT_BID_STEP)
        // Свою перебить можно
        await bidOk(s, room.roomId, vera.key, lot.id, 1100)
        // Снять со ставками — нельзя; не продавец — 403
        await refused(lotAct(s, room.roomId, borya.key, lot.id, 'withdraw'), 409, L.LOT_HAS_BIDS)
        await refused(lotAct(s, room.roomId, vera.key, lot.id, 'withdraw'), 403, L.ONLY_SELLER)
        // Нет лота, кривой номер, без ключа
        await refused(bid(s, room.roomId, vera.key, ulid(), 1000), 404, NO_LOT)
        await refused(lotAct(s, room.roomId, borya.key, ulid(), 'withdraw'), 404, NO_LOT)
        await refused(bid(s, room.roomId, vera.key, 'не-номер', 1000), 404, NO_LOT)
        await refused(bid(s, room.roomId, undefined, lot.id, 1200), 403, NEED_KEY)
        // Апелляции у лота нет — такого адреса нет
        expect((await lotAct(s, room.roomId, vera.key, lot.id, 'appeal', { reason: 'Хочу' })).status).toBe(404)

        // Без ставок продавец снимает: тело не нужно; повтор — тот же ответ; снятый — ни ставки, ни второго снятия
        const other = await newLot(s, room.roomId, borya.key, lotForm(s))
        s.clock.now += 1000
        const requestId = ulid(s.clock.now)
        const withdrawn = await markOk(s, room.roomId, borya.key, other.id, 'withdraw', requestId)
        expect(withdrawn.marked).toEqual({ id: expect.stringMatching(ULID), at: s.clock.now, by: borya.memberId, lot: other.id, mark: 'withdrawn' })
        expect(withdrawn.lot).toMatchObject({ status: 'withdrawn', withdrawnAt: s.clock.now, closedAt: s.clock.now })
        expect((await readLog(s.storage(room.roomId))).at(-1)).toMatchObject({ type: 'lot.withdrawn', memberId: borya.memberId, lot: other.id, requestId })
        expect(await markOk(s, room.roomId, borya.key, other.id, 'withdraw', requestId)).toEqual(withdrawn)
        await refused(lotAct(s, room.roomId, borya.key, other.id, 'handed', { requestId }), 409, REQUEST_USED)
        await refused(bid(s, room.roomId, vera.key, other.id, 1000), 409, L.LOT_WITHDRAWN)
        await refused(lotAct(s, room.roomId, borya.key, other.id, 'withdraw'), 409, L.LOT_WITHDRAWN)
        const bare = await s.send(`/rooms/${room.roomId}/lots/${lot.id}/handed`, { method: 'POST', headers: { Authorization: 'Bearer ' + borya.key } })
        expect(bare.status).toBe(409)
        expect(await lotEntries(s, room.roomId)).toEqual(['lot.created', 'lot.created', 'lot.bid', 'lot.bid', 'lot.created', 'lot.withdrawn'])
      })

      it('продление: ставка на последних 2 минутах — конец через 2 минуты после неё, не дальше конца + 30 минут; к концу без ставок — «не продан»', async () => {
        const s = await server()
        const { room, borya, vera, gosha } = await room4(s)
        const lot = await newLot(s, room.roomId, borya.key, lotForm(s))
        const unsold = await newLot(s, room.roomId, borya.key, lotForm(s))
        const closesAt = lot.closesAt
        const latestEnd = closesAt + AUCTION_EXTEND_MAX
        const endsAt = async () => (await lotOf(s, room.roomId, gosha.key, lot.id)).endsAt
        s.clock.now = closesAt - 5 * MINUTE
        await bidOk(s, room.roomId, vera.key, lot.id, 1000)
        expect(await endsAt()).toBe(closesAt)
        s.clock.now = closesAt - MINUTE
        await bidOk(s, room.roomId, gosha.key, lot.id, 1100)
        expect(await endsAt()).toBe(closesAt + MINUTE)
        // После исходного конца, но до продлённого — ставка действует и продлевает ещё; второй лот уже не продан
        s.clock.now = closesAt + 30 * 1000
        await bidOk(s, room.roomId, vera.key, lot.id, 1200)
        expect(await endsAt()).toBe(closesAt + 30 * 1000 + AUCTION_EXTEND)
        expect(await lotOf(s, room.roomId, vera.key, unsold.id)).toMatchObject({ status: 'unsold', winner: null, closedAt: closesAt })
        await refused(bid(s, room.roomId, vera.key, unsold.id, 1000), 409, L.LOT_OVER)
        await refused(lotAct(s, room.roomId, borya.key, unsold.id, 'handed'), 409, L.LOT_UNSOLD)
        let amount = 1200
        let end = await endsAt()
        const who = [gosha, vera]
        for (let i = 0; end < latestEnd; i++) {
          s.clock.now = end - 1000
          amount += 100
          await bidOk(s, room.roomId, who[i % 2].key, lot.id, amount)
          end = await endsAt()
          expect(end).toBe(Math.min(latestEnd, s.clock.now + AUCTION_EXTEND))
        }
        s.clock.now = latestEnd - 1000
        await bidOk(s, room.roomId, gosha.key, lot.id, amount + 100)
        expect(await endsAt()).toBe(latestEnd)
        // Пока торг идёт — отметок после торга нет
        await refused(lotAct(s, room.roomId, borya.key, lot.id, 'handed'), 409, L.LOT_NOT_OVER)
        await refused(lotAct(s, room.roomId, gosha.key, lot.id, 'received'), 409, L.LOT_NOT_OVER)
        s.clock.now = latestEnd
        await refused(bid(s, room.roomId, vera.key, lot.id, amount + 200), 409, L.LOT_OVER)
        expect(await lotOf(s, room.roomId, borya.key, lot.id)).toMatchObject({
          status: 'awaiting',
          endsAt: latestEnd,
          winner: gosha.memberId,
          amount: amount + 100,
          disputeFrom: latestEnd + SILENCE,
          closedAt: null,
        })
      })

      it('после торга: «Получил» сразу, «Передал» и молчание победителя, «Не смогу передать»; долг — в «Расчёт», только когда получено', async () => {
        const s = await server()
        const { room, borya, vera, gosha } = await room4(s)
        const a = await newLot(s, room.roomId, borya.key, lotForm(s, { title: 'Велосипед' }))
        const b = await newLot(s, room.roomId, borya.key, lotForm(s, { title: 'Палатка', start: 500 }))
        const c = await newLot(s, room.roomId, borya.key, lotForm(s, { title: 'Гитара', start: 300 }))
        s.clock.now += 1000
        await bidOk(s, room.roomId, vera.key, a.id, 1000)
        await bidOk(s, room.roomId, gosha.key, b.id, 500)
        await bidOk(s, room.roomId, vera.key, c.id, 300)
        expect(await sums(s, room.roomId, room.key, borya.memberId, vera.memberId, gosha.memberId)).toEqual([
          { total: [0, 0], pending: [0, 0], inPlay: [0, 0] },
          { total: [0, 0], pending: [0, 0], inPlay: [1300, 2] },
          { total: [0, 0], pending: [0, 0], inPlay: [500, 1] },
        ])
        // Конец торга: «ждёт передачи» — долг ждёт
        s.clock.now = a.closesAt
        for (const l of [a, b, c]) expect((await lotOf(s, room.roomId, gosha.key, l.id)).status).toBe('awaiting')
        expect(await sums(s, room.roomId, room.key, borya.memberId, vera.memberId, gosha.memberId)).toEqual([
          { total: [0, 0], pending: [1800, 3], inPlay: [0, 0] },
          { total: [0, 0], pending: [-1300, 2], inPlay: [0, 0] },
          { total: [0, 0], pending: [-500, 1], inPlay: [0, 0] },
        ])
        await refused(lotAct(s, room.roomId, gosha.key, a.id, 'received'), 403, L.ONLY_WINNER)
        await refused(lotAct(s, room.roomId, vera.key, a.id, 'handed'), 403, L.ONLY_SELLER)
        await refused(lotAct(s, room.roomId, vera.key, a.id, 'cannot'), 403, L.ONLY_SELLER)

        // Велосипед: Вера «Получил» без «Передал» — получен сразу
        s.clock.now += 1000
        const requestId = ulid(s.clock.now)
        const got = await markOk(s, room.roomId, vera.key, a.id, 'received', requestId)
        expect(got.marked).toEqual({ id: expect.stringMatching(ULID), at: s.clock.now, by: vera.memberId, lot: a.id, mark: 'received' })
        expect(got.lot).toMatchObject({ status: 'received', received: { at: s.clock.now, how: 'mark' }, closedAt: s.clock.now })
        expect((await readLog(s.storage(room.roomId))).at(-1)).toMatchObject({ type: 'lot.received', memberId: vera.memberId, lot: a.id, requestId })
        expect(await markOk(s, room.roomId, vera.key, a.id, 'received', requestId)).toEqual(got)
        await refused(lotAct(s, room.roomId, vera.key, a.id, 'received'), 409, L.LOT_RECEIVED)
        await refused(lotAct(s, room.roomId, borya.key, a.id, 'handed'), 409, L.LOT_RECEIVED)

        // Палатка: Боря «Передал»; Гоша молчит срок молчания — получено без записи
        const handed = await markOk(s, room.roomId, borya.key, b.id, 'handed')
        const handedAt = s.clock.now
        expect(handed.lot).toMatchObject({ status: 'handed', handedAt, silenceUntil: handedAt + SILENCE })
        await refused(lotAct(s, room.roomId, borya.key, b.id, 'handed'), 409, L.LOT_HANDED)
        // Гитара: Боря «Не смогу передать» — не состоялся, никто никому не должен
        const failed = await markOk(s, room.roomId, borya.key, c.id, 'cannot')
        expect(failed.marked.mark).toBe('declined')
        expect(failed.lot).toMatchObject({ status: 'failed', declinedAt: s.clock.now, closedAt: s.clock.now })
        await refused(lotAct(s, room.roomId, vera.key, c.id, 'received'), 409, L.LOT_FAILED)
        await refused(lotAct(s, room.roomId, vera.key, c.id, 'not-received'), 409, L.LOT_FAILED)
        s.clock.now = handedAt + SILENCE - 1
        expect((await lotOf(s, room.roomId, borya.key, b.id)).status).toBe('handed')
        s.clock.now = handedAt + SILENCE
        expect(await lotOf(s, room.roomId, borya.key, b.id)).toMatchObject({ status: 'received', received: { at: handedAt + SILENCE, how: 'silence' } })
        await refused(lotAct(s, room.roomId, gosha.key, b.id, 'not-received'), 409, L.LOT_RECEIVED)
        // Итог: Боре должны 1000 и 500, гитара — не в счёт; «по ставкам» — прямые долги пар
        expect(await sums(s, room.roomId, room.key, borya.memberId, vera.memberId, gosha.memberId)).toEqual([
          { total: [1500, 2], pending: [0, 0], inPlay: [0, 0] },
          { total: [-1000, 1], pending: [0, 0], inPlay: [0, 0] },
          { total: [-500, 1], pending: [0, 0], inPlay: [0, 0] },
        ])
        const { settlement } = await stateOf(s, room.roomId, gosha.key)
        expect(settlement?.suggestions).toHaveLength(2)
        expect(settlement?.suggestions).toEqual(
          expect.arrayContaining([
            { from: vera.memberId, to: borya.memberId, amount: 1000 },
            { from: gosha.memberId, to: borya.memberId, amount: 500 },
          ]),
        )
        expect(await lotEntries(s, room.roomId)).toEqual([
          'lot.created',
          'lot.created',
          'lot.created',
          'lot.bid',
          'lot.bid',
          'lot.bid',
          'lot.received',
          'lot.handed',
          'lot.declined',
        ])
      })

      it('обе стороны молчат — «ждёт передачи»; «Не получил» без «Передал» — после срока молчания; судить некому — «в споре», пока сторона не уступит', async () => {
        const s = await server()
        // Двое: Аня продаёт, Боря покупает — судить некому
        const room = await create(s)
        const borya = await member(s, room, 'Боря')
        const x = await newLot(s, room.roomId, room.key, lotForm(s, { title: 'Лыжи' }))
        const y = await newLot(s, room.roomId, room.key, lotForm(s, { title: 'Санки' }))
        s.clock.now += 1000
        await bidOk(s, room.roomId, borya.key, x.id, 1000)
        await bidOk(s, room.roomId, borya.key, y.id, 1000)
        const disputeFrom = x.closesAt + SILENCE
        s.clock.now = disputeFrom - 1
        expect(await lotOf(s, room.roomId, borya.key, x.id)).toMatchObject({ status: 'awaiting', disputeFrom })
        await refused(lotAct(s, room.roomId, borya.key, x.id, 'not-received'), 409, L.LOT_TOO_EARLY)
        s.clock.now = disputeFrom
        const disputed = await markOk(s, room.roomId, borya.key, x.id, 'not-received')
        expect(disputed.marked.mark).toBe('disputed')
        expect(disputed.lot).toMatchObject({ status: 'dispute', disputedAt: disputeFrom })
        // Суда нет: записи court.drawn нет и после запроса комнаты
        s.clock.now += HOUR
        expect(await lotOf(s, room.roomId, room.key, x.id)).toMatchObject({ status: 'dispute' })
        expect((await readLog(s.storage(room.roomId))).some((e) => e.type === 'court.drawn')).toBe(false)
        await refused(lotAct(s, room.roomId, room.key, x.id, 'handed'), 409, L.LOT_DISPUTED)
        await refused(lotAct(s, room.roomId, borya.key, x.id, 'not-received'), 409, L.LOT_DISPUTED)
        await refused(lotAct(s, room.roomId, room.key, x.id, 'judge', { verdict: 'delivered' }), 409, NO_COURT)
        // Санки — обе стороны молчат: долг ждёт, сколько бы ни прошло
        s.clock.now += 30 * DAY
        expect((await lotOf(s, room.roomId, room.key, y.id)).status).toBe('awaiting')
        expect(await sums(s, room.roomId, room.key, room.memberId, borya.memberId)).toEqual([
          { total: [0, 0], pending: [2000, 2], inPlay: [0, 0] },
          { total: [0, 0], pending: [-2000, 2], inPlay: [0, 0] },
        ])
        // Уступили: в споре о лыжах Боря «Получил»; о санках Аня «Не смогу передать» после «Не получил»
        expect((await markOk(s, room.roomId, borya.key, x.id, 'received')).lot).toMatchObject({ status: 'received', received: { how: 'mark' } })
        await markOk(s, room.roomId, borya.key, y.id, 'not-received')
        expect((await markOk(s, room.roomId, room.key, y.id, 'cannot')).lot.status).toBe('failed')
        expect(await sums(s, room.roomId, room.key, room.memberId, borya.memberId)).toEqual([
          { total: [1000, 1], pending: [0, 0], inPlay: [0, 0] },
          { total: [-1000, 1], pending: [0, 0], inPlay: [0, 0] },
        ])
      })

      it('«Не получил» — суд жребием без продавца и победителя: собран сам; голоса «передано» / «не передано»; решение окончательное', async () => {
        const s = await server()
        const room = await create(s)
        const borya = await member(s, room, 'Боря')
        const vera = await member(s, room, 'Вера')
        const gosha = await member(s, room, 'Гоша')
        const dasha = await member(s, room, 'Даша')
        const zhenya = await member(s, room, 'Женя')
        const people = [room, borya, vera, gosha, dasha, zhenya]
        const keyOf = (id: string | null) => people.find((p) => p.memberId === id)?.key ?? 'нет-ключа'
        const p = await newLot(s, room.roomId, borya.key, lotForm(s, { title: 'Ноутбук' }))
        const q = await newLot(s, room.roomId, borya.key, lotForm(s, { title: 'Телефон', start: 2000 }))
        s.clock.now += 1000
        await bidOk(s, room.roomId, vera.key, p.id, 1000)
        await bidOk(s, room.roomId, vera.key, q.id, 2000)
        // Ноутбук: «Передал» — Вера «Не получил» в срок молчания
        s.clock.now = p.closesAt + 1000
        await markOk(s, room.roomId, borya.key, p.id, 'handed')
        s.clock.now += 1000
        const disputed = await markOk(s, room.roomId, vera.key, p.id, 'not-received')
        expect(disputed.lot).toMatchObject({ status: 'dispute', disputedAt: s.clock.now })
        // Суд собирается при следующем запросе к комнате: зерно сервера, кандидаты — кроме продавца и победителя
        s.seeds.push(SEED)
        s.clock.now += 1000
        const drawnAt = s.clock.now
        const candidates = [room.memberId, gosha.memberId, dasha.memberId, zhenya.memberId]
        const order = A.drawCourt(SEED, candidates, room.memberId)
        const seat = (m: string) => ({ member: m, since: drawnAt, until: drawnAt + p.times.court, replaced: null, vote: null })
        for (const key of [room.key, borya.key, vera.key, gosha.key]) {
          expect(await lotOf(s, room.roomId, key, p.id)).toMatchObject({
            status: 'court',
            court: { seed: SEED, drawnAt, candidates: order, seats: order.slice(0, 3).map(seat), decision: null },
          })
        }
        const log = await readLog(s.storage(room.roomId))
        expect(log.filter((e) => e.type === 'court.drawn')).toEqual([
          { id: expect.any(String), at: drawnAt, memberId: room.memberId, type: 'court.drawn', target: p.id, seed: SEED, candidates },
        ])
        // В суде отметки сторон не действуют
        await refused(lotAct(s, room.roomId, vera.key, p.id, 'received'), 409, L.LOT_IN_COURT)
        await refused(lotAct(s, room.roomId, borya.key, p.id, 'cannot'), 409, L.LOT_IN_COURT)
        // Голос: только «передано» / «не передано» и только член суда
        const judge = (key: string, body: Record<string, unknown>) => lotAct(s, room.roomId, key, p.id, 'judge', body)
        for (const body of [{}, { verdict: 'keep' }, { verdict: 'cancel' }, { verdict: 'change', winner: 'author' }]) {
          await refused(judge(keyOf(order[0]), body), 400, A.BAD_LOT_VERDICT)
        }
        await refused(judge(keyOf(order[3]), { verdict: 'delivered' }), 403, A.NOT_JUROR)
        await refused(judge(vera.key, { verdict: 'undelivered' }), 403, A.NOT_JUROR)
        await refused(judge(borya.key, { verdict: 'delivered' }), 403, A.NOT_JUROR)
        const voteId = ulid(s.clock.now)
        const voted = await ok<JudgeResponse>(judge(keyOf(order[0]), { verdict: 'delivered', requestId: voteId }))
        expect(isJudgeResponse(voted)).toBe(true)
        expect(voted).toEqual({ v: PROTOCOL_VERSION, voted: { id: expect.any(String), at: s.clock.now, by: order[0], target: p.id, verdict: 'delivered' } })
        expect(await ok(judge(keyOf(order[0]), { verdict: 'delivered', requestId: voteId }))).toEqual(voted)
        await refused(judge(keyOf(order[0]), { verdict: 'undelivered' }), 409, A.VOTED)
        s.clock.now += HOUR
        await ok(judge(keyOf(order[1]), { verdict: 'undelivered' }))
        expect((await lotOf(s, room.roomId, gosha.key, p.id)).status).toBe('court')
        s.clock.now += HOUR
        await ok(judge(keyOf(order[2]), { verdict: 'delivered' }))
        // Два из трёх — «передано»: получен судом, долг — в итог сразу
        expect(await lotOf(s, room.roomId, gosha.key, p.id)).toMatchObject({
          status: 'received',
          received: { at: s.clock.now, how: 'court' },
          closedAt: s.clock.now,
          court: { decision: { at: s.clock.now, majority: true, verdict: 'delivered' } },
        })
        await refused(judge(keyOf(order[0]), { verdict: 'delivered' }), 409, A.COURT_DECIDED)
        await refused(lotAct(s, room.roomId, vera.key, p.id, 'not-received'), 409, L.LOT_IN_COURT)

        // Телефон: «Передал» нет — Вера «Не получил» после срока молчания; ведущая заменяет члена суда
        s.clock.now = q.closesAt + SILENCE
        await markOk(s, room.roomId, vera.key, q.id, 'not-received')
        s.seeds.push('5c'.repeat(16))
        s.clock.now += 1000
        const before = await lotOf(s, room.roomId, room.key, q.id)
        expect(before.status).toBe('court')
        const seats = before.court?.seats ?? []
        const target = seats.find((x) => x.member !== room.memberId)?.member as string
        const replaced = await ok<ReplaceJurorResponse>(lotAct(s, room.roomId, room.key, q.id, 'replace', { member: target, reason: 'Уехал без связи' }))
        expect(isReplaceJurorResponse(replaced)).toBe(true)
        expect(replaced.replaced).toMatchObject({ by: room.memberId, target: q.id, member: target, reason: 'Уехал без связи' })
        const now = (await lotOf(s, room.roomId, room.key, q.id)).court?.seats.map((x) => x.member) ?? []
        expect(now).not.toContain(target)
        await ok(lotAct(s, room.roomId, keyOf(now[0]), q.id, 'judge', { verdict: 'undelivered' }))
        await ok(lotAct(s, room.roomId, keyOf(now[1]), q.id, 'judge', { verdict: 'undelivered' }))
        await ok(lotAct(s, room.roomId, keyOf(now[2]), q.id, 'judge', { verdict: 'delivered' }))
        // «Не передано» — лот не передан, долга нет
        expect(await lotOf(s, room.roomId, borya.key, q.id)).toMatchObject({
          status: 'undelivered',
          received: null,
          closedAt: s.clock.now,
          court: { decision: { majority: true, verdict: 'undelivered' } },
        })
        expect(await sums(s, room.roomId, room.key, borya.memberId, vera.memberId)).toEqual([
          { total: [1000, 1], pending: [0, 0], inPlay: [0, 0] },
          { total: [-1000, 1], pending: [0, 0], inPlay: [0, 0] },
        ])
      })

      it('долг по лотам в обоих режимах «кто кому»: «по ставкам» — прямые долги пар, «меньше переводов» — общим счётом', async () => {
        const s = await server()
        const { room, borya, vera, gosha } = await room4(s)
        // Боря продал Вере за 1000, Вера — Гоше за 1000
        const one = await newLot(s, room.roomId, borya.key, lotForm(s))
        const two = await newLot(s, room.roomId, vera.key, lotForm(s, { title: 'Самокат' }))
        s.clock.now += 1000
        await bidOk(s, room.roomId, vera.key, one.id, 1000)
        await bidOk(s, room.roomId, gosha.key, two.id, 1000)
        s.clock.now = one.closesAt
        await markOk(s, room.roomId, vera.key, one.id, 'received')
        await markOk(s, room.roomId, gosha.key, two.id, 'received')
        const stakes = (await stateOf(s, room.roomId, room.key)).settlement
        expect(stakes?.mode).toBe('stakes')
        expect(stakes?.suggestions).toHaveLength(2)
        expect(stakes?.suggestions).toEqual(
          expect.arrayContaining([
            { from: vera.memberId, to: borya.memberId, amount: 1000 },
            { from: gosha.memberId, to: vera.memberId, amount: 1000 },
          ]),
        )
        expect(await sums(s, room.roomId, room.key, borya.memberId, vera.memberId, gosha.memberId)).toEqual([
          { total: [1000, 1], pending: [0, 0], inPlay: [0, 0] },
          { total: [0, 2], pending: [0, 0], inPlay: [0, 0] },
          { total: [-1000, 1], pending: [0, 0], inPlay: [0, 0] },
        ])
        await ok(send(s, room.roomId, 'settle-mode', { v: PROTOCOL_VERSION, mode: 'fewest' }, room.key))
        const fewest = (await stateOf(s, room.roomId, vera.key)).settlement
        expect(fewest?.mode).toBe('fewest')
        expect(fewest?.suggestions).toEqual([{ from: gosha.memberId, to: borya.memberId, amount: 1000 }])
      })

      it('сроки темпа (Р-35): новый лот — с нынешним темпом комнаты; смена темпа старый лот не трогает', async () => {
        const s = await server()
        const { room, borya, vera } = await room4(s, { ...FORM, pace: 'fast' })
        const fast = await newLot(s, room.roomId, borya.key, lotForm(s))
        expect(fast.times).toEqual(P.FAST_TIMES)
        expect((await readLog(s.storage(room.roomId))).at(-1)).toMatchObject({ type: 'lot.created', times: P.FAST_TIMES })
        await ok(send(s, room.roomId, 'pace', { v: PROTOCOL_VERSION, pace: 'normal' }, room.key))
        const normal = await newLot(s, room.roomId, borya.key, lotForm(s))
        expect(normal.times).toEqual(NORMAL_TIMES)
        expect((await lotOf(s, room.roomId, vera.key, fast.id)).times).toEqual(P.FAST_TIMES)
        // Молчание победителя — по сроку лота: у быстрого — быстрый
        s.clock.now += 1000
        await bidOk(s, room.roomId, vera.key, fast.id, 1000)
        await bidOk(s, room.roomId, vera.key, normal.id, 1000)
        s.clock.now = fast.closesAt
        const handedAt = s.clock.now
        await markOk(s, room.roomId, borya.key, fast.id, 'handed')
        await markOk(s, room.roomId, borya.key, normal.id, 'handed')
        s.clock.now = handedAt + P.FAST_TIMES.silence
        expect((await lotOf(s, room.roomId, vera.key, fast.id)).received).toEqual({ at: handedAt + P.FAST_TIMES.silence, how: 'silence' })
        expect((await lotOf(s, room.roomId, vera.key, normal.id)).status).toBe('handed')
      })
    })

    describe('выбор (Р-39)', () => {
      const MINUTE = 60 * 1000
      const HOUR = 60 * MINUTE
      const DAY = 24 * HOUR
      const SEED = '5c'.repeat(16)
      const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/

      // Комната: Аня — ведущая, Боря, Вера и Гоша — участники
      async function room4(s: TestServer) {
        const room = await create(s)
        const borya = await member(s, room, 'Боря')
        const vera = await member(s, room, 'Вера')
        const gosha = await member(s, room, 'Гоша')
        return { room, borya, vera, gosha }
      }

      // «Куда едем в субботу?»: «Дача» и «Озеро»; варианты — час, вклады — ещё час
      function choiceForm(s: TestServer, change: Record<string, unknown> = {}): Record<string, unknown> {
        return {
          v: PROTOCOL_VERSION,
          question: 'Куда едем в субботу?',
          options: ['Дача', 'Озеро'],
          optionsUntil: s.clock.now + HOUR,
          closesAt: s.clock.now + 2 * HOUR,
          ...change,
        }
      }

      async function newChoice(s: TestServer, roomId: string, key: string, body: unknown): Promise<ChoiceView> {
        const r = await ok<ChoiceResponse>(send(s, roomId, 'choices', body, key))
        expect(isChoiceResponse(r)).toBe(true)
        return r.choice
      }

      function option(s: TestServer, roomId: string, key: string | undefined, choiceId: string, title: unknown, requestId?: string) {
        return send(s, roomId, `choices/${choiceId}/option`, { v: PROTOCOL_VERSION, title, requestId }, key)
      }

      async function optionOk(s: TestServer, roomId: string, key: string, choiceId: string, title: string, requestId?: string): Promise<ChoiceOptionResponse> {
        const r = await ok<ChoiceOptionResponse>(option(s, roomId, key, choiceId, title, requestId))
        expect(isChoiceOptionResponse(r)).toBe(true)
        return r
      }

      function stake(s: TestServer, roomId: string, key: string | undefined, choiceId: string, opt: unknown, amount: unknown, requestId?: string) {
        return send(s, roomId, `choices/${choiceId}/stake`, { v: PROTOCOL_VERSION, option: opt, amount, requestId }, key)
      }

      async function stakeOk(s: TestServer, roomId: string, key: string, choiceId: string, opt: string, amount: number, requestId?: string): Promise<ChoiceStakeResponse> {
        const r = await ok<ChoiceStakeResponse>(stake(s, roomId, key, choiceId, opt, amount, requestId))
        expect(isChoiceStakeResponse(r)).toBe(true)
        return r
      }

      async function stateOf(s: TestServer, roomId: string, key: string): Promise<RoomStateResponse> {
        const state = await ok<RoomStateResponse>(get(s, roomId, key))
        expect(isRoomStateResponse(state)).toBe(true)
        expect(Array.isArray(state.choices)).toBe(true)
        return state
      }

      async function choiceOf(s: TestServer, roomId: string, key: string, choiceId: string): Promise<ChoiceView> {
        const found = (await stateOf(s, roomId, key)).choices?.find((c) => c.id === choiceId)
        expect(found).toBeDefined()
        return found as ChoiceView
      }

      async function choiceEntries(s: TestServer, roomId: string): Promise<string[]> {
        return (await readLog(s.storage(roomId))).map((e) => e.type).filter((t) => t.startsWith('choice.'))
      }

      // Три числа участника в «Расчёте»: сумма и счётчик выборов
      async function sums(s: TestServer, roomId: string, key: string, ...ids: string[]) {
        const settlement = (await stateOf(s, roomId, key)).settlement
        return ids.map((id) => {
          const m = settlement?.members.find((x) => x.memberId === id)
          const short = (x: SettleSumView | undefined) => [x?.amount, x?.choices]
          return { total: short(m?.total), pending: short(m?.pending), inPlay: short(m?.inPlay) }
        })
      }

      it('завести выбор: автор — кто прислал, получатель — ведущий; варианты автора — «1», «2»; видно всем; повтор — тот же выбор', async () => {
        const s = await server()
        const { room, borya, vera, gosha } = await room4(s)
        const requestId = ulid(s.clock.now)
        const form = choiceForm(s, { requestId })
        const optionsUntil = form.optionsUntil as number
        const closesAt = form.closesAt as number
        const choice = await newChoice(s, room.roomId, borya.key, form)
        const at = s.clock.now
        expect(choice).toEqual({
          id: expect.stringMatching(ULID),
          at,
          authorId: borya.memberId,
          question: 'Куда едем в субботу?',
          recipientId: room.memberId,
          cashbox: false,
          optionsUntil,
          closesAt,
          latestEnd: closesAt + AUCTION_EXTEND_MAX,
          endsAt: closesAt,
          status: 'options',
          failed: null,
          options: [
            { id: '1', at, by: borya.memberId, title: 'Дача', total: 0 },
            { id: '2', at, by: borya.memberId, title: 'Озеро', total: 0 },
          ],
          stakes: [],
          winner: null,
          how: null,
          draw: null,
          debts: [],
          closedAt: null,
        })
        // Сроки выбора — постоянные решения, не темпа: times в записи нет
        expect((await readLog(s.storage(room.roomId))).at(-1)).toEqual({
          id: choice.id,
          at,
          memberId: borya.memberId,
          type: 'choice.created',
          question: 'Куда едем в субботу?',
          options: ['Дача', 'Озеро'],
          recipient: room.memberId,
          cashbox: false,
          optionsUntil,
          closesAt,
          requestId,
        })
        for (const key of [room.key, borya.key, vera.key, gosha.key]) expect(await choiceOf(s, room.roomId, key, choice.id)).toEqual(choice)
        // Повтор — тот же выбор без записи; тот же номер с другим вопросом или от другого — 409
        s.clock.now += 1000
        expect(await newChoice(s, room.roomId, borya.key, form)).toEqual(choice)
        await refused(send(s, room.roomId, 'choices', { ...form, question: 'Что едим?' }, borya.key), 409, REQUEST_USED)
        await refused(send(s, room.roomId, 'choices', form, vera.key), 409, REQUEST_USED)
        // Свой получатель и подпись «касса»; вариантов автора может не быть
        const own = await newChoice(s, room.roomId, vera.key, choiceForm(s, { options: undefined, recipient: gosha.memberId, cashbox: true }))
        expect(own).toMatchObject({ authorId: vera.memberId, recipientId: gosha.memberId, cashbox: true, options: [] })
        expect(await choiceEntries(s, room.roomId)).toEqual(['choice.created', 'choice.created'])
      })

      it('отказы: форма — 400; вариант во второй фазе, вклад в первой, второй вариант одного участника — 409; нет выбора — 404', async () => {
        const s = await server()
        const { room, borya, vera, gosha } = await room4(s)
        const now = s.clock.now
        const cases: [Record<string, unknown>, string][] = [
          [{ question: ' ' }, C.NEED_QUESTION],
          [{ question: 'я'.repeat(301) }, C.LONG_QUESTION],
          [{ options: 'Дача' }, C.BAD_OPTIONS],
          [{ options: ['Дача', ' дача '] }, C.SAME_OPTION],
          [{ options: ['Дача', ''] }, C.NEED_OPTION],
          [{ options: ['я'.repeat(C.MAX_CHOICE_OPTION + 1)] }, C.LONG_OPTION],
          [{ options: Array.from({ length: C.MAX_CHOICE_OPTIONS + 1 }, (_, i) => `Вариант ${i}`) }, C.TOO_MANY_OPTIONS],
          [{ recipient: 'чужой' }, C.BAD_RECIPIENT],
          [{ optionsUntil: undefined }, C.NEED_CHOICE_TIMES],
          [{ closesAt: 'завтра' }, C.NEED_CHOICE_TIMES],
          [{ optionsUntil: now + 10 * MINUTE - 1 }, C.OPTIONS_SHORT],
          [{ optionsUntil: now + HOUR, closesAt: now + HOUR + 10 * MINUTE - 1 }, C.STAKES_SHORT],
          [{ closesAt: now + 3 * DAY + 1 }, C.CHOICE_LONG],
          [{ requestId: 'abc' }, BAD_REQUEST_ID],
        ]
        for (const [change, error] of cases) await refused(send(s, room.roomId, 'choices', choiceForm(s, change), borya.key), 400, error)
        const dima = await join(s, room, 'Дима')
        await refused(send(s, room.roomId, 'choices', choiceForm(s)), 403, NEED_KEY)
        await refused(send(s, room.roomId, 'choices', choiceForm(s), dima.key), 403, WAITING, 'waiting')
        expect((await send(s, room.roomId, 'choices', choiceForm(s, { v: PROTOCOL_VERSION + 1 }), borya.key)).status).toBe(400)
        expect(await choiceEntries(s, room.roomId)).toEqual([])
        // Ровно 10 минут на каждую фазу и ровно 3 дня — можно
        await newChoice(s, room.roomId, borya.key, choiceForm(s, { optionsUntil: now + 10 * MINUTE, closesAt: now + 20 * MINUTE }))
        await newChoice(s, room.roomId, borya.key, choiceForm(s, { closesAt: now + 3 * DAY }))
        const choice = await newChoice(s, room.roomId, borya.key, choiceForm(s))

        // Фаза вариантов: вклад — 409; вариант — любой участник; повтор, кривое название — отказы
        await refused(stake(s, room.roomId, vera.key, choice.id, '1', 100), 409, C.STAKES_NOT_YET)
        s.clock.now += 1000
        const requestId = ulid(s.clock.now)
        const added = await optionOk(s, room.roomId, vera.key, choice.id, ' Лес ', requestId)
        expect(added.option).toEqual({ id: expect.stringMatching(ULID), at: s.clock.now, by: vera.memberId, choice: choice.id, title: 'Лес' })
        expect(added.choice.options.map((o) => o.title)).toEqual(['Дача', 'Озеро', 'Лес'])
        expect((await readLog(s.storage(room.roomId))).at(-1)).toEqual({
          id: added.option.id,
          at: s.clock.now,
          memberId: vera.memberId,
          type: 'choice.option',
          choice: choice.id,
          title: 'Лес',
          requestId,
        })
        expect(await optionOk(s, room.roomId, vera.key, choice.id, ' Лес ', requestId)).toEqual(added)
        await refused(option(s, room.roomId, vera.key, choice.id, 'Поле', requestId), 409, REQUEST_USED)
        await refused(option(s, room.roomId, gosha.key, choice.id, 'Лес', requestId), 409, REQUEST_USED)
        await refused(option(s, room.roomId, gosha.key, choice.id, 'ЛЕС'), 409, C.SAME_OPTION)
        await refused(option(s, room.roomId, gosha.key, choice.id, ' '), 400, C.NEED_OPTION)
        await refused(option(s, room.roomId, gosha.key, choice.id, 'я'.repeat(C.MAX_CHOICE_OPTION + 1)), 400, C.LONG_OPTION)
        await refused(option(s, room.roomId, gosha.key, choice.id, 'Поле', 'abc'), 400, BAD_REQUEST_ID)
        for (let i = 0; i < C.MAX_CHOICE_OPTIONS - 3; i++) await optionOk(s, room.roomId, gosha.key, choice.id, `Вариант ${i}`)
        await refused(option(s, room.roomId, gosha.key, choice.id, 'Ещё один'), 409, C.TOO_MANY_OPTIONS)

        // Фаза вкладов: вариант — 409; вклад — в один вариант; кривой вариант или сумма — 400
        s.clock.now = choice.optionsUntil
        await refused(option(s, room.roomId, gosha.key, choice.id, 'Поздно'), 409, C.OPTIONS_CLOSED)
        expect((await choiceOf(s, room.roomId, gosha.key, choice.id)).status).toBe('open')
        const stakeId = ulid(s.clock.now)
        const first = await stakeOk(s, room.roomId, vera.key, choice.id, '1', 300, stakeId)
        expect(first.stake).toEqual({ id: expect.stringMatching(ULID), at: s.clock.now, by: vera.memberId, choice: choice.id, option: '1', amount: 300 })
        expect(first.choice.options[0]).toMatchObject({ id: '1', total: 300 })
        expect((await readLog(s.storage(room.roomId))).at(-1)).toEqual({
          id: first.stake.id,
          at: s.clock.now,
          memberId: vera.memberId,
          type: 'choice.stake',
          choice: choice.id,
          option: '1',
          amount: 300,
          requestId: stakeId,
        })
        expect(await stakeOk(s, room.roomId, vera.key, choice.id, '1', 300, stakeId)).toEqual(first)
        await refused(stake(s, room.roomId, vera.key, choice.id, '1', 500, stakeId), 409, REQUEST_USED)
        await refused(stake(s, room.roomId, vera.key, choice.id, '2', 100), 409, C.ONE_OPTION)
        await stakeOk(s, room.roomId, vera.key, choice.id, '1', 200)
        await refused(stake(s, room.roomId, gosha.key, choice.id, 'нет-такого', 100), 400, C.NO_OPTION)
        for (const amount of [0, -5, 1.5, 'сто', undefined]) await refused(stake(s, room.roomId, gosha.key, choice.id, '2', amount), 400, C.BAD_STAKE)
        // Нет выбора, кривой номер, без ключа, чужой ключ
        await refused(stake(s, room.roomId, vera.key, ulid(), '1', 100), 404, NO_CHOICE)
        await refused(option(s, room.roomId, vera.key, ulid(), 'Лес'), 404, NO_CHOICE)
        await refused(stake(s, room.roomId, vera.key, 'не-номер', '1', 100), 404, NO_CHOICE)
        await refused(stake(s, room.roomId, undefined, choice.id, '1', 100), 403, NEED_KEY)
        await refused(stake(s, room.roomId, 'someone-elses-key', choice.id, '1', 100), 403, WRONG_KEY)
        // Жребия адресом нет
        expect((await send(s, room.roomId, `choices/${choice.id}/draw`, { v: PROTOCOL_VERSION }, vera.key)).status).toBe(404)
        // После конца вкладов — 409
        s.clock.now = choice.closesAt
        await refused(stake(s, room.roomId, vera.key, choice.id, '1', 100), 409, C.CHOICE_OVER)
        expect(await choiceEntries(s, room.roomId)).toEqual([
          'choice.created',
          'choice.created',
          'choice.created',
          'choice.option',
          ...Array.from({ length: C.MAX_CHOICE_OPTIONS - 3 }, () => 'choice.option'),
          'choice.stake',
          'choice.stake',
        ])
      })

      it('не состоялся: меньше двух вариантов к «варианты до» — вкладов нет; вкладов к концу нет — не в счёт', async () => {
        const s = await server()
        const { room, borya, vera } = await room4(s)
        const lonely = await newChoice(s, room.roomId, borya.key, choiceForm(s, { options: ['Дача'] }))
        const empty = await newChoice(s, room.roomId, borya.key, choiceForm(s))
        s.clock.now = lonely.optionsUntil
        expect(await choiceOf(s, room.roomId, vera.key, lonely.id)).toMatchObject({ status: 'failed', failed: 'options', closedAt: lonely.optionsUntil })
        await refused(stake(s, room.roomId, vera.key, lonely.id, '1', 100), 409, C.CHOICE_NO_OPTIONS)
        s.clock.now = empty.closesAt
        expect(await choiceOf(s, room.roomId, vera.key, empty.id)).toMatchObject({ status: 'failed', failed: 'stakes', closedAt: empty.closesAt, debts: [] })
        expect(await sums(s, room.roomId, room.key, room.memberId, vera.memberId)).toEqual([
          { total: [0, 0], pending: [0, 0], inPlay: [0, 0] },
          { total: [0, 0], pending: [0, 0], inPlay: [0, 0] },
        ])
        expect(await choiceEntries(s, room.roomId)).toEqual(['choice.created', 'choice.created'])
      })

      it('продление: вклад на последних 2 минутах — конец через 2 минуты после него; к концу — решён большей суммой', async () => {
        const s = await server()
        const { room, borya, vera, gosha } = await room4(s)
        const choice = await newChoice(s, room.roomId, borya.key, choiceForm(s))
        const closesAt = choice.closesAt
        const endsAt = async () => (await choiceOf(s, room.roomId, gosha.key, choice.id)).endsAt
        s.clock.now = closesAt - 5 * MINUTE
        await stakeOk(s, room.roomId, vera.key, choice.id, '1', 100)
        expect(await endsAt()).toBe(closesAt)
        s.clock.now = closesAt - MINUTE
        await stakeOk(s, room.roomId, gosha.key, choice.id, '2', 50)
        expect(await endsAt()).toBe(closesAt + MINUTE)
        // После исходного конца, но до продлённого — вклад действует и продлевает ещё
        s.clock.now = closesAt + 30 * 1000
        await stakeOk(s, room.roomId, borya.key, choice.id, '2', 30)
        expect(await endsAt()).toBe(closesAt + 150 * 1000)
        s.clock.now = closesAt + 150 * 1000 - 1
        expect((await choiceOf(s, room.roomId, gosha.key, choice.id)).status).toBe('open')
        s.clock.now = closesAt + 150 * 1000
        expect(await choiceOf(s, room.roomId, gosha.key, choice.id)).toMatchObject({
          status: 'decided',
          winner: '1',
          how: 'sum',
          draw: null,
          closedAt: closesAt + 150 * 1000,
          options: [{ id: '1', total: 100 }, { id: '2', total: 80 }],
          debts: [{ from: vera.memberId, to: room.memberId, amount: 100 }],
        })
        await refused(stake(s, room.roomId, borya.key, choice.id, '2', 100), 409, C.CHOICE_OVER)
        expect(await choiceEntries(s, room.roomId)).toEqual(['choice.created', 'choice.stake', 'choice.stake', 'choice.stake'])
      })

      it('ничья в конце: продления по 2 минуты до «вклады до» + 30 минут, затем жребий зерном сервера — один раз, первым запросом; повтор победителя не меняет', async () => {
        const s = await server()
        const { room, borya, vera, gosha } = await room4(s)
        const choice = await newChoice(s, room.roomId, borya.key, choiceForm(s))
        const closesAt = choice.closesAt
        const latestEnd = closesAt + AUCTION_EXTEND_MAX
        s.clock.now = choice.optionsUntil
        await stakeOk(s, room.roomId, vera.key, choice.id, '1', 100)
        await stakeOk(s, room.roomId, gosha.key, choice.id, '2', 100)
        // Ничья в конце — ещё 2 минуты, снова и снова; вклады всё ещё идут
        s.clock.now = closesAt
        expect(await choiceOf(s, room.roomId, borya.key, choice.id)).toMatchObject({ status: 'open', endsAt: closesAt + AUCTION_EXTEND })
        s.clock.now = latestEnd - 1
        expect(await choiceOf(s, room.roomId, borya.key, choice.id)).toMatchObject({ status: 'open', endsAt: latestEnd, draw: null })
        expect(await choiceEntries(s, room.roomId)).toEqual(['choice.created', 'choice.stake', 'choice.stake'])
        // Конец продлений: первый запрос бросает жребий — запись choice.drawn (зерно, равные; автор — ведущий)
        s.seeds.push(SEED)
        s.clock.now = latestEnd
        const winner = C.drawChoice(SEED, ['1', '2'])
        const payer = winner === '1' ? vera : gosha
        const decided = await choiceOf(s, room.roomId, borya.key, choice.id)
        expect(decided).toMatchObject({
          status: 'decided',
          winner,
          how: 'draw',
          draw: { at: latestEnd, seed: SEED, options: ['1', '2'] },
          closedAt: latestEnd,
          debts: [{ from: payer.memberId, to: room.memberId, amount: 100 }],
        })
        expect((await readLog(s.storage(room.roomId))).at(-1)).toEqual({
          id: expect.stringMatching(ULID),
          at: latestEnd,
          memberId: room.memberId,
          type: 'choice.drawn',
          choice: choice.id,
          seed: SEED,
          options: ['1', '2'],
        })
        await refused(stake(s, room.roomId, vera.key, choice.id, '1', 100), 409, C.CHOICE_OVER)
        // Повтор: другое зерно в очереди не берётся, второй записи нет, победитель тот же
        s.seeds.push('ff'.repeat(16))
        s.clock.now += DAY
        for (const key of [room.key, borya.key, vera.key, gosha.key]) expect(await choiceOf(s, room.roomId, key, choice.id)).toEqual(decided)
        expect(s.seeds).toEqual(['ff'.repeat(16)])
        expect(await choiceEntries(s, room.roomId)).toEqual(['choice.created', 'choice.stake', 'choice.stake', 'choice.drawn'])
      })

      it('«Расчёт»: идущие вклады — в игре (кроме получателя); решён — долги вложившихся в победивший получателю, в итог сразу', async () => {
        const s = await server()
        const { room, borya, vera, gosha } = await room4(s)
        // Получатель — Гоша («касса»)
        const choice = await newChoice(s, room.roomId, borya.key, choiceForm(s, { recipient: gosha.memberId, cashbox: true }))
        s.clock.now = choice.optionsUntil
        await stakeOk(s, room.roomId, vera.key, choice.id, '1', 300)
        await stakeOk(s, room.roomId, borya.key, choice.id, '1', 200)
        await stakeOk(s, room.roomId, gosha.key, choice.id, '1', 100)
        await stakeOk(s, room.roomId, room.key, choice.id, '2', 250)
        const ids = [room.memberId, borya.memberId, vera.memberId, gosha.memberId]
        expect(await sums(s, room.roomId, room.key, ...ids)).toEqual([
          { total: [0, 0], pending: [0, 0], inPlay: [250, 1] },
          { total: [0, 0], pending: [0, 0], inPlay: [200, 1] },
          { total: [0, 0], pending: [0, 0], inPlay: [300, 1] },
          { total: [0, 0], pending: [0, 0], inPlay: [0, 0] },
        ])
        s.clock.now = choice.closesAt
        expect(await choiceOf(s, room.roomId, vera.key, choice.id)).toMatchObject({
          status: 'decided',
          winner: '1',
          how: 'sum',
          debts: [
            { from: vera.memberId, to: gosha.memberId, amount: 300 },
            { from: borya.memberId, to: gosha.memberId, amount: 200 },
          ],
        })
        // Свой вклад получатель не платит; вложившаяся в проигравший Аня — не должна
        expect(await sums(s, room.roomId, room.key, ...ids)).toEqual([
          { total: [0, 0], pending: [0, 0], inPlay: [0, 0] },
          { total: [-200, 1], pending: [0, 0], inPlay: [0, 0] },
          { total: [-300, 1], pending: [0, 0], inPlay: [0, 0] },
          { total: [500, 1], pending: [0, 0], inPlay: [0, 0] },
        ])
        const { settlement } = await stateOf(s, room.roomId, borya.key)
        expect(settlement?.suggestions).toHaveLength(2)
        expect(settlement?.suggestions).toEqual(
          expect.arrayContaining([
            { from: vera.memberId, to: gosha.memberId, amount: 300 },
            { from: borya.memberId, to: gosha.memberId, amount: 200 },
          ]),
        )
        // Долг по выбору держит режим «кто кому»: Вера рассчиталась, Боря ещё должен — сменить нельзя
        const sent = await ok<TransferResponse>(send(s, room.roomId, 'transfers', { v: PROTOCOL_VERSION, to: gosha.memberId, amount: 300 }, vera.key))
        await ok(send(s, room.roomId, `transfers/${sent.transfer.id}/receive`, { v: PROTOCOL_VERSION }, gosha.key))
        await refused(send(s, room.roomId, 'settle-mode', { v: PROTOCOL_VERSION, mode: 'fewest' }, room.key), 409, T.MODE_LOCKED)
      })
    })

    describe('темп комнаты (Р-35)', () => {
      const HOUR = 60 * 60 * 1000
      const DAY = 24 * HOUR
      const SEED = 'ef'.repeat(16)
      // «Свой» набор — из списков pace.ts, каждый срок не как у обычного и быстрого
      const CUSTOM: P.Times = { objection: 6 * HOUR, appeal: 3 * DAY, silence: 2 * DAY, court: 5 * DAY }

      function setPace(s: TestServer, roomId: string, key: string, body: Record<string, unknown>) {
        return send(s, roomId, 'pace', { v: PROTOCOL_VERSION, ...body }, key)
      }

      async function stateOf(s: TestServer, roomId: string, key: string): Promise<RoomStateResponse> {
        const state = await ok<RoomStateResponse>(get(s, roomId, key))
        expect(isRoomStateResponse(state)).toBe(true)
        return state
      }

      async function paceEntries(s: TestServer, roomId: string): Promise<string[]> {
        return (await readLog(s.storage(roomId))).flatMap((e) => (e.type === 'room.pace' ? [e.pace] : []))
      }

      it('темп при создании: обычный, быстрый, свой — в записи room.created и в ответе комнаты; без поля — обычный, полей в записи нет', async () => {
        const s = await server()
        const cases: [Record<string, unknown>, P.RoomPace][] = [
          [{ pace: 'normal' }, { pace: 'normal', times: NORMAL_TIMES }],
          [{ pace: 'fast' }, { pace: 'fast', times: P.FAST_TIMES }],
          [{ pace: 'custom', times: CUSTOM }, { pace: 'custom', times: CUSTOM }],
        ]
        for (const [change, expected] of cases) {
          const room = await create(s, { ...FORM, ...change })
          const created = (await readLog(s.storage(room.roomId)))[0]
          expect(created).toMatchObject({ type: 'room.created', ...change })
          // Сроки в записи — только у «своего»
          expect('times' in created).toBe(change.pace === 'custom')
          expect((await stateOf(s, room.roomId, room.key)).room).toMatchObject(expected)
        }
        const plain = await create(s)
        const created = (await readLog(s.storage(plain.roomId)))[0]
        expect('pace' in created || 'times' in created).toBe(false)
        expect((await stateOf(s, plain.roomId, plain.key)).room).toMatchObject({ pace: 'normal', times: NORMAL_TIMES })
      })

      it('темп при создании: чужой срок, лишние или неполные сроки, кривой темп — 400, комнаты нет; повтор создания сверяет темп', async () => {
        const s = await server()
        const cases: [Record<string, unknown>, string][] = [
          [{ pace: 'slow' }, P.BAD_PACE],
          [{ pace: null }, P.BAD_PACE],
          [{ times: CUSTOM }, P.BAD_PACE],
          [{ pace: 'custom' }, P.NEED_PACE_TIMES],
          [{ pace: 'custom', times: { ...CUSTOM, silence: undefined } }, P.NEED_PACE_TIMES],
          [{ pace: 'custom', times: { ...CUSTOM, objection: 3 * HOUR } }, P.badTime('objection')],
          [{ pace: 'custom', times: { ...CUSTOM, court: 4 * DAY } }, P.badTime('court')],
          [{ pace: 'fast', times: P.FAST_TIMES }, P.EXTRA_PACE_TIMES],
        ]
        for (const [change, error] of cases) {
          const r = await post(s, { ...FORM, ...change })
          expect(r.status).toBe(400)
          expect(await r.json()).toEqual({ v: PROTOCOL_VERSION, error })
        }
        expect(s.roomIds()).toEqual([])
        // Повтор: тот же темп и сроки — та же комната; другой темп, другие сроки или без темпа — 409
        const requestId = ulid(s.clock.now)
        const first = await create(s, { ...FORM, requestId, pace: 'custom', times: CUSTOM })
        expect(await create(s, { ...FORM, requestId, pace: 'custom', times: CUSTOM })).toEqual(first)
        for (const change of [{}, { pace: 'fast' }, { pace: 'custom', times: { ...CUSTOM, court: 7 * DAY } }]) {
          const r = await post(s, { ...FORM, requestId, ...change })
          expect(r.status).toBe(409)
          expect(await r.json()).toEqual({ v: PROTOCOL_VERSION, error: REQUEST_TAKEN })
        }
        // Обычный явно и без поля — одно и то же
        const plainId = ulid(s.clock.now)
        const plain = await create(s, { ...FORM, requestId: plainId })
        expect(await create(s, { ...FORM, requestId: plainId, pace: 'normal' })).toEqual(plain)
        expect([...s.roomIds()].sort()).toEqual([first.roomId, plain.roomId].sort())
      })

      it('смена темпа: только ведущий, в любой момент; тот же или кривой — отказ правил; запись room.pace; повтор — тот же ответ', async () => {
        const s = await server()
        const room = await create(s)
        const borya = await member(s, room, 'Боря')
        const id = room.roomId
        await refused(setPace(s, id, borya.key, { pace: 'fast' }), 403, P.ONLY_HOST_PACE)
        await refused(setPace(s, id, room.key, { pace: 'normal' }), 409, P.SAME_PACE)
        await refused(setPace(s, id, room.key, { pace: 'custom', times: { ...CUSTOM, appeal: 4 * DAY } }), 400, P.badTime('appeal'))
        await refused(setPace(s, id, room.key, { pace: 'fast', times: P.FAST_TIMES }), 400, P.EXTRA_PACE_TIMES)
        await refused(setPace(s, id, room.key, { pace: 'custom' }), 400, P.NEED_PACE_TIMES)
        await refused(setPace(s, id, room.key, {}), 400, P.BAD_PACE)
        await refused(send(s, id, 'pace', { pace: 'fast' }), 403, NEED_KEY)
        await refused(setPace(s, id, room.key, { pace: 'fast', requestId: 'abc' }), 400, BAD_REQUEST_ID)
        expect(await paceEntries(s, id)).toEqual([])
        // Ведущая сменила на быстрый — запись без сроков, ответ — со сроками; темп виден всем
        const requestId = ulid(s.clock.now)
        const fast = await ok<PaceResponse>(setPace(s, id, room.key, { pace: 'fast', requestId }))
        expect(isPaceResponse(fast)).toBe(true)
        expect(fast.pace).toEqual({ id: expect.any(String), at: s.clock.now, by: room.memberId, pace: 'fast', times: P.FAST_TIMES })
        expect((await readLog(s.storage(id))).at(-1)).toEqual({ id: fast.pace.id, at: s.clock.now, memberId: room.memberId, type: 'room.pace', pace: 'fast', requestId })
        s.clock.now += 1000
        expect(await ok(setPace(s, id, room.key, { pace: 'fast', requestId }))).toEqual(fast)
        await refused(setPace(s, id, room.key, { pace: 'normal', requestId }), 409, REQUEST_USED)
        await refused(setPace(s, id, room.key, { pace: 'fast' }), 409, P.SAME_PACE)
        for (const key of [room.key, borya.key]) expect((await stateOf(s, id, key)).room).toMatchObject({ pace: 'fast', times: P.FAST_TIMES })
        // Свой — сроки в записи; свой с другими сроками — уже не тот же; обратно — обычный
        const custom = await ok<PaceResponse>(setPace(s, id, room.key, { pace: 'custom', times: CUSTOM }))
        expect(custom.pace).toMatchObject({ pace: 'custom', times: CUSTOM })
        expect((await readLog(s.storage(id))).at(-1)).toMatchObject({ type: 'room.pace', pace: 'custom', times: CUSTOM })
        await refused(setPace(s, id, room.key, { pace: 'custom', times: CUSTOM }), 409, P.SAME_PACE)
        await ok(setPace(s, id, room.key, { pace: 'custom', times: { ...CUSTOM, court: 7 * DAY } }))
        await ok(setPace(s, id, room.key, { pace: 'normal' }))
        expect((await stateOf(s, id, borya.key)).room).toMatchObject({ pace: 'normal', times: NORMAL_TIMES })
        expect(await paceEntries(s, id)).toEqual(['fast', 'custom', 'custom', 'normal'])
      })

      it('событие до смены живёт по старым срокам, после — по новым: в быстрой комнате возражение — 2 ч, апелляция — сутки', async () => {
        const s = await server()
        const room = await create(s)
        const borya = await member(s, room, 'Боря')
        const vera = await member(s, room, 'Вера')
        const id = room.roomId
        // Событие Бори «Да / Нет»: Боря — 300 на «Да», Вера — 100 на «Нет»
        const newEvent = async () => {
          const form = { v: PROTOCOL_VERSION, condition: 'Вася пробежит 10 км', check: 'Скрин из приложения', closesAt: s.clock.now + HOUR, expectedAt: s.clock.now + 2 * HOUR }
          const { event } = await ok<CreateEventResponse>(send(s, id, 'events', form, borya.key))
          await ok(send(s, id, `events/${event.id}/bets`, { outcome: '1', amount: 300 }, borya.key))
          await ok(send(s, id, `events/${event.id}/bets`, { outcome: '2', amount: 100 }, vera.key))
          return event
        }
        const events = async () => (await stateOf(s, id, vera.key)).events
        const outcome = async (eventId: string) => (await events()).find((e) => e.id === eventId)?.outcome
        const before = await newEvent()
        await ok(setPace(s, id, room.key, { pace: 'fast' }))
        const after = await newEvent()
        // Сроки — в записи каждого события и в ответе комнаты
        const created = (await readLog(s.storage(id))).flatMap((e) => (e.type === 'event.created' ? [e.times] : []))
        expect(created).toEqual([NORMAL_TIMES, P.FAST_TIMES])
        expect((await events()).map((e) => e.times)).toEqual([NORMAL_TIMES, P.FAST_TIMES])
        // Оба исхода предложены в один миг
        s.clock.now = after.closesAt
        const proposedAt = s.clock.now
        for (const e of [before, after]) await ok(send(s, id, `events/${e.id}/propose`, { outcome: '1' }, borya.key))
        expect(await outcome(before.id)).toMatchObject({ status: 'proposed', objectionUntil: proposedAt + DAY })
        expect(await outcome(after.id)).toMatchObject({ status: 'proposed', objectionUntil: proposedAt + 2 * HOUR })
        // 2 ч прошли: новое утверждено само, возражать поздно; старое ещё на возражении
        s.clock.now = proposedAt + 2 * HOUR
        expect(await outcome(after.id)).toMatchObject({
          status: 'approved',
          approved: { how: 'unopposed', at: proposedAt + 2 * HOUR },
          finalAt: proposedAt + 2 * HOUR + DAY,
        })
        // Отказ называет срок события — «2 ч», а не «сутки» обычного темпа
        await refused(send(s, id, `events/${after.id}/object`, { reason: 'Поздно' }, vera.key), 409, 'Срок возражения — 2 ч — прошёл')
        await refused(send(s, id, `events/${after.id}/agree`, {}, vera.key), 409, 'Срок возражения — 2 ч — прошёл')
        expect(OBJECTION_OVER).toBe('Срок возражения — сутки — прошёл')
        expect((await outcome(before.id))?.status).toBe('proposed')
        // Смена темпа обратно закреплённых сроков не трогает: апелляция нового — сутки, старого — 7 дней
        await ok(setPace(s, id, room.key, { pace: 'normal' }))
        s.clock.now = proposedAt + 2 * HOUR + DAY - 1
        expect((await outcome(after.id))?.status).toBe('approved')
        s.clock.now = proposedAt + 2 * HOUR + DAY
        expect((await outcome(after.id))?.status).toBe('final')
        expect(await outcome(before.id)).toMatchObject({ status: 'approved', finalAt: proposedAt + 8 * DAY })
        expect((await events()).map((e) => e.times)).toEqual([NORMAL_TIMES, P.FAST_TIMES])
      })

      it('пари в «своей» комнате: сроки — в записи, у встречного — нынешнего темпа; молчание стороны — свой срок; место в суде — срок суда', async () => {
        const s = await server()
        const room = await create(s, { ...FORM, pace: 'custom', times: CUSTOM })
        const borya = await member(s, room, 'Боря')
        const vera = await member(s, room, 'Вера')
        const gosha = await member(s, room, 'Гоша')
        await member(s, room, 'Даша')
        await member(s, room, 'Женя')
        const id = room.roomId
        const form = { v: PROTOCOL_VERSION, condition: 'Вася бросит курить', check: 'Скажет сам', odds: { a: 3, b: 1 }, amount: 300, closesAt: s.clock.now + HOUR, expectedAt: s.clock.now + DAY }
        const { offer } = await ok<CreateOfferResponse>(send(s, id, 'offers', form, borya.key))
        const { offer: open } = await ok<CreateOfferResponse>(send(s, id, 'offers', form, borya.key))
        await ok(send(s, id, `offers/${offer.id}/accept`, {}, vera.key))
        const offerOf = async (offerId: string) => (await stateOf(s, id, gosha.key)).offers?.find((o) => o.id === offerId)
        // Встречное после смены темпа — по нынешнему темпу, исходное — по своему
        await ok(setPace(s, id, room.key, { pace: 'fast' }))
        const { offer: counter } = await ok<CreateOfferResponse>(send(s, id, `offers/${open.id}/counter`, { closesAt: s.clock.now + HOUR }, gosha.key))
        expect([(await offerOf(offer.id))?.times, (await offerOf(open.id))?.times, (await offerOf(counter.id))?.times]).toEqual([CUSTOM, CUSTOM, P.FAST_TIMES])
        const created = (await readLog(s.storage(id))).flatMap((e) => (e.type === 'offer.created' ? [e.times] : []))
        expect(created).toEqual([CUSTOM, CUSTOM, P.FAST_TIMES])
        // Боря отметил в «исход к», Вера молчит: гарант (ведущая) решает через 2 дня, а не через 3
        s.clock.now = offer.expectedAt
        await ok(send(s, id, `offers/${offer.id}/mark`, { winner: 'author' }, borya.key))
        expect((await offerOf(offer.id))?.outcome).toMatchObject({ phase: 'marking', turnAt: offer.expectedAt + 2 * DAY })
        s.clock.now = offer.expectedAt + 2 * DAY - 1
        await refused(send(s, id, `offers/${offer.id}/decide`, { winner: 'author' }, room.key), 409, NOT_TURN)
        s.clock.now = offer.expectedAt + 2 * DAY
        expect((await offerOf(offer.id))?.outcome).toMatchObject({ phase: 'guarantor', guarantorUntil: offer.expectedAt + 4 * DAY })
        await ok(send(s, id, `offers/${offer.id}/decide`, { winner: 'author' }, room.key))
        const decidedAt = s.clock.now
        // Окончательный — через свои 3 дня; апелляция Веры — суд, место — на свои 5 дней
        expect((await offerOf(offer.id))?.outcome).toMatchObject({ phase: 'approved', finalAt: decidedAt + 3 * DAY })
        s.clock.now = decidedAt + HOUR
        s.seeds.push(SEED)
        await ok<AppealResponse>(send(s, id, `offers/${offer.id}/appeal`, { reason: 'Гарант не видел видео' }, vera.key))
        const seats = (await offerOf(offer.id))?.outcome?.court?.seats ?? []
        expect(seats).toHaveLength(3)
        for (const seat of seats) expect(seat).toMatchObject({ since: s.clock.now, until: s.clock.now + 5 * DAY })
      })
    })

    describe('копия комнаты: выгрузка и загрузка (этап 6)', () => {
      const HOUR = 60 * 60 * 1000
      const DAY = 24 * HOUR

      // Пароль компании в заголовке: base64 из UTF-8 (кириллицу заголовок как есть не несёт)
      function password(p: string): string {
        return 'Password ' + btoa(String.fromCharCode(...new TextEncoder().encode(p)))
      }

      function exportOne(s: TestServer, roomId: string, authorization?: string): Promise<Response> {
        return s.send(`/rooms/${roomId}/export`, { headers: authorization === undefined ? {} : { Authorization: authorization } })
      }

      function exportAll(s: TestServer, authorization?: string): Promise<Response> {
        return s.send('/export', { headers: authorization === undefined ? {} : { Authorization: authorization } })
      }

      function importOne(s: TestServer, roomId: string, body: unknown, authorization = password(PASSWORD)): Promise<Response> {
        return s.send(`/rooms/${roomId}/import`, { method: 'POST', headers: { Authorization: authorization }, body: JSON.stringify(body) })
      }

      // Полная копия комнаты — как её отдаёт сервер (с v)
      async function fullCopy(s: TestServer, roomId: string): Promise<Record<string, unknown>> {
        return ok<Record<string, unknown>>(exportOne(s, roomId, password(PASSWORD)))
      }

      // Сервер «другой обёртки» (peer): на него загружают; время — то же, что у первого
      async function other(s: TestServer): Promise<TestServer> {
        const t = await (peer ?? start)(PASSWORD)
        started.push(t)
        t.clock.now = s.clock.now
        return t
      }

      it('с паролем компании — полная копия: журнал как в хранилище, служебные записи — как хранятся (хеши), ключей и токенов в открытом виде нет; ничего не пишет', async () => {
        const s = await server()
        const room = await create(s)
        const borya = await member(s, room, 'Боря')
        const device = await ok<DeviceLinkResponse>(send(s, room.roomId, 'device', { v: PROTOCOL_VERSION }, borya.key))
        s.clock.now += 1000
        const puts = s.puts(room.roomId).length
        const r = await exportOne(s, room.roomId, password(PASSWORD))
        expect(r.status).toBe(200)
        expect(r.headers.get('Access-Control-Allow-Origin')).toBe('*')
        const body = (await r.json()) as Record<string, unknown>
        const log = await readLog(s.storage(room.roomId))
        const store = body.store as Record<string, unknown>
        expect(body).toEqual({ v: PROTOCOL_VERSION, format: BACKUP_FORMAT, roomId: room.roomId, exportedAt: s.clock.now, log, store })
        const storage = s.storage(room.roomId)
        const keys = [
          'invite',
          'secret',
          'key:' + (await hashKey(room.key)),
          'key:' + (await hashKey(borya.key)),
          'device:' + (await hashKey(device.token)),
        ]
        expect(Object.keys(store).sort()).toEqual([...keys].sort())
        for (const k of keys) expect(store[k]).toEqual(await storage.get(k))
        expect(store.invite).toEqual({ token: room.invite, at: START_TIME })
        const text = JSON.stringify(body)
        for (const secret of [room.key, borya.key, device.token]) expect(text).not.toContain(secret)
        expect(checkBackup(body, 'full').ok).toBe(true)
        // Выгрузка ничего не пишет
        expect(s.puts(room.roomId).length).toBe(puts)
      })

      it('с ключом участника — копия участника: тот же журнал без служебных записей; заявка, чужой ключ, без ключа — отказы, как у чтения', async () => {
        const s = await server()
        const room = await create(s)
        const borya = await member(s, room, 'Боря')
        const waiting = await join(s, room, 'Вера')
        const copy = await ok<Record<string, unknown>>(exportOne(s, room.roomId, 'Bearer ' + borya.key))
        expect(copy).toEqual({ v: PROTOCOL_VERSION, format: BACKUP_FORMAT, roomId: room.roomId, exportedAt: s.clock.now, log: await readLog(s.storage(room.roomId)) })
        expect(checkBackup(copy).ok).toBe(true)
        await refused(exportOne(s, room.roomId, 'Bearer ' + waiting.key), 403, WAITING, 'waiting')
        await refused(exportOne(s, room.roomId, 'Bearer not-a-member-key'), 403, WRONG_KEY)
        await refused(exportOne(s, room.roomId), 403, NEED_KEY)
        await refused(exportOne(s, 'кривой', 'Bearer ' + borya.key), 404, NO_ROOM)
        await refused(exportOne(s, ulid(s.clock.now), 'Bearer ' + borya.key), 404, NO_ROOM)
        // Полная копия несуществующей комнаты и по кривому номеру — 404
        await refused(exportOne(s, ulid(s.clock.now), password(PASSWORD)), 404, NO_ROOM)
        await refused(exportOne(s, 'кривой', password(PASSWORD)), 404, NO_ROOM)
      })

      it('пароль: неверный, пустой, кривой или ключ участника вместо него — 403; на сервере не задан — 503 (выгрузка и загрузка выключены)', async () => {
        const s = await server()
        const room = await create(s)
        const copy = await fullCopy(s, room.roomId)
        const wrong = [password('не тот'), password(''), 'Password %%%', 'Password', 'Bearer ' + room.key, undefined]
        for (const auth of wrong) {
          await refused(exportAll(s, auth), 403, WRONG_PASSWORD)
          await refused(importOne(s, ulid(s.clock.now), copy, auth ?? ''), 403, WRONG_PASSWORD)
        }
        for (const auth of wrong.slice(0, 4)) await refused(exportOne(s, room.roomId, auth), 403, WRONG_PASSWORD)
        for (const p of [undefined, '']) {
          const off = await server(p)
          await refused(exportAll(off, password(PASSWORD)), 503, BACKUP_OFF)
          await refused(exportOne(off, room.roomId, password(PASSWORD)), 503, BACKUP_OFF)
          await refused(importOne(off, room.roomId, copy), 503, BACKUP_OFF)
          expect(off.roomIds()).toEqual([])
        }
      })

      it('GET /export — полные копии всех комнат одним файлом; комнат нет — пусто', async () => {
        const s = await server()
        expect(await ok(exportAll(s, password(PASSWORD)))).toEqual({ v: PROTOCOL_VERSION, exportedAt: s.clock.now, backups: [] })
        const first = await create(s)
        s.clock.now += 1000
        const second = await create(s, { ...FORM, name: 'Работа' })
        await member(s, second, 'Боря')
        const all = await ok<{ v: number; exportedAt: number; backups: Record<string, unknown>[] }>(exportAll(s, password(PASSWORD)))
        expect(all.v).toBe(PROTOCOL_VERSION)
        expect(all.exportedAt).toBe(s.clock.now)
        const byId = new Map(all.backups.map((b) => [b.roomId, b]))
        expect([...byId.keys()].sort()).toEqual([first.roomId, second.roomId].sort())
        for (const id of [first.roomId, second.roomId]) {
          const one = await fullCopy(s, id)
          delete one.v
          expect(byId.get(id)).toEqual(one)
        }
      })

      it('POST import: битая копия — 400, комната не тронута; копия участника, другой комнаты — 400; в комнату с данными — 409; загруженная — в списке комнат', async () => {
        const s = await server()
        const room = await create(s)
        const borya = await member(s, room, 'Боря')
        const copy = await fullCopy(s, room.roomId)
        const log = copy.log as unknown[]
        const t = await other(s)
        const cases: [unknown, string][] = [
          [null, BAD_BACKUP],
          [{ ...copy, format: BACKUP_FORMAT + 1 }, UNKNOWN_FORMAT],
          [{ ...copy, log: [log[1], log[0], ...log.slice(2)] }, BAD_LOG],
          [{ ...copy, log: [...log, log[1]] }, LOG_ORDER],
          [{ ...copy, store: { ...(copy.store as object), registry: { at: 1 } } }, BAD_STORE],
          [await ok(exportOne(s, room.roomId, 'Bearer ' + borya.key)), NEED_FULL],
        ]
        for (const [body, error] of cases) await refused(importOne(t, room.roomId, body), 400, error)
        expect((await t.send(`/rooms/${room.roomId}/import`, { method: 'POST', headers: { Authorization: password(PASSWORD) }, body: 'не JSON' })).status).toBe(400)
        await refused(importOne(t, ulid(t.clock.now), copy), 400, OTHER_ROOM)
        await refused(importOne(t, 'кривой', copy), 404, NO_ROOM)
        expect(t.roomIds()).toEqual([])
        // Годная — в пустую: журнал как есть, тот же ключ открывает комнату
        expect(await ok(importOne(t, room.roomId, copy))).toEqual({ v: PROTOCOL_VERSION, roomId: room.roomId, entries: log.length })
        expect(await readLog(t.storage(room.roomId))).toEqual(log)
        expect(await members(t, room.roomId, borya.key)).toEqual(['Аня', 'Боря'])
        // Второй раз и в исходную — комната уже есть
        await refused(importOne(t, room.roomId, copy), 409, ROOM_EXISTS)
        await refused(importOne(s, room.roomId, copy), 409, ROOM_EXISTS)
        // Загруженная комната — в выгрузке всех комнат нового сервера
        const all = await ok<{ backups: { roomId: string }[] }>(exportAll(t, password(PASSWORD)))
        expect(all.backups.map((b) => b.roomId)).toEqual([room.roomId])
      })

      it('круг: событие, пари, лот, выбор, суд и переводы — выгрузил на одной обёртке, загрузил в пустую на другой: ответ комнаты тем же ключам тот же', async () => {
        const s = await server()
        const room = await create(s)
        const borya = await member(s, room, 'Боря')
        const vera = await member(s, room, 'Вера')
        const gosha = await member(s, room, 'Гоша')
        const dasha = await member(s, room, 'Даша')
        const id = room.roomId
        // Событие: Боря — 300 на «Да», Вера — 100 на «Нет»
        const eventForm = { v: PROTOCOL_VERSION, condition: 'Вася пробежит 10 км', check: 'Скрин', closesAt: s.clock.now + HOUR, expectedAt: s.clock.now + 2 * HOUR }
        const { event } = await ok<CreateEventResponse>(send(s, id, 'events', eventForm, borya.key))
        await ok(send(s, id, `events/${event.id}/bets`, { v: PROTOCOL_VERSION, outcome: '1', amount: 300 }, borya.key))
        await ok(send(s, id, `events/${event.id}/bets`, { v: PROTOCOL_VERSION, outcome: '2', amount: 100 }, vera.key))
        // Пари Гоши «3 к 1», приняла Вера
        const offerForm = { v: PROTOCOL_VERSION, condition: 'Вася бросит курить', check: 'Скажет сам', odds: { a: 3, b: 1 }, amount: 300, closesAt: s.clock.now + HOUR, expectedAt: s.clock.now + DAY }
        const { offer } = await ok<CreateOfferResponse>(send(s, id, 'offers', offerForm, gosha.key))
        await ok(send(s, id, `offers/${offer.id}/accept`, { v: PROTOCOL_VERSION }, vera.key))
        // Торг Даши (Р-37): Боря — 100, Гоша перебил — 150, к концу принято само; второй торг без встречных
        const auctionForm = { ...offerForm, odds: undefined, auction: { start: 100 }, closesAt: s.clock.now + HOUR, expectedAt: s.clock.now + DAY }
        const auction = await ok<CreateOfferResponse>(send(s, id, 'offers', auctionForm, dasha.key))
        await ok(send(s, id, `offers/${auction.offer.id}/bid`, { v: PROTOCOL_VERSION, amount: 100 }, borya.key))
        await ok(send(s, id, `offers/${auction.offer.id}/bid`, { v: PROTOCOL_VERSION, amount: 150 }, gosha.key))
        await ok(send(s, id, 'offers', auctionForm, dasha.key))
        // Исход: Боря предложил «Да», через сутки утверждён — Вера подала апелляцию, суд собран
        s.clock.now = event.closesAt
        await ok(send(s, id, `events/${event.id}/propose`, { v: PROTOCOL_VERSION, outcome: '1' }, borya.key))
        s.clock.now += DAY
        await ok<AppealResponse>(send(s, id, `events/${event.id}/appeal`, { v: PROTOCOL_VERSION, reason: 'Скрин чужой' }, vera.key))
        // Переводы: Вера перевела Боре 50, Боря получил
        const sent = await ok<TransferResponse>(send(s, id, 'transfers', { v: PROTOCOL_VERSION, to: borya.memberId, amount: 50 }, vera.key))
        await ok(send(s, id, `transfers/${sent.transfer.id}/receive`, { v: PROTOCOL_VERSION }, borya.key))
        // Лот Даши (Р-38): Боря — 500, Гоша перебил — 600; к концу — «ждёт передачи», Даша «Передал»
        const lotForm = { v: PROTOCOL_VERSION, title: 'Палатка', start: 500, closesAt: s.clock.now + HOUR }
        const { lot } = await ok<LotResponse>(send(s, id, 'lots', lotForm, dasha.key))
        await ok(send(s, id, `lots/${lot.id}/bid`, { v: PROTOCOL_VERSION, amount: 500 }, borya.key))
        await ok(send(s, id, `lots/${lot.id}/bid`, { v: PROTOCOL_VERSION, amount: 600 }, gosha.key))
        s.clock.now = lot.closesAt
        await ok(send(s, id, `lots/${lot.id}/handed`, { v: PROTOCOL_VERSION }, dasha.key))
        // Выбор Веры (Р-39): Гоша добавил «Лес»; Боря — 200 на «Дачу», Гоша — 200 на «Лес»: ничья до конца
        // продлений — жребий сервера при первом чтении ниже
        const MINUTE = HOUR / 60
        const choiceForm = { v: PROTOCOL_VERSION, question: 'Куда едем?', options: ['Дача', 'Озеро'], optionsUntil: s.clock.now + 10 * MINUTE, closesAt: s.clock.now + 30 * MINUTE }
        const { choice } = await ok<ChoiceResponse>(send(s, id, 'choices', choiceForm, vera.key))
        await ok(send(s, id, `choices/${choice.id}/option`, { v: PROTOCOL_VERSION, title: 'Лес' }, gosha.key))
        s.clock.now = choice.optionsUntil
        await ok(send(s, id, `choices/${choice.id}/stake`, { v: PROTOCOL_VERSION, option: '1', amount: 200 }, borya.key))
        const forest = (await ok<RoomStateResponse>(get(s, id, gosha.key))).choices?.[0].options[2].id
        await ok(send(s, id, `choices/${choice.id}/stake`, { v: PROTOCOL_VERSION, option: forest, amount: 200 }, gosha.key))
        s.clock.now = choice.latestEnd + HOUR
        const people = [room, borya, vera, gosha]
        const states = async (x: TestServer) => Promise.all(people.map((p) => ok<RoomStateResponse>(get(x, id, p.key))))
        const before = await states(s)
        expect(before[0].events[0].outcome?.appeal).toBeTruthy()
        expect(before[0].offers?.[0].status).toBe('accepted')
        expect(before[0].offers?.map((o) => o.status)).toEqual(['accepted', 'accepted', 'failed'])
        expect(before[0].offers?.[1].bidding).toMatchObject({ result: { how: 'end' }, best: { by: gosha.memberId, amount: 150 } })
        expect(before[0].settlement?.transfers).toHaveLength(1)
        expect(before[0].lots).toHaveLength(1)
        expect(before[0].lots?.[0]).toMatchObject({ status: 'handed', winner: gosha.memberId, amount: 600, bids: [{ by: borya.memberId }, { by: gosha.memberId }] })
        expect(before[0].settlement?.members.find((m) => m.memberId === dasha.memberId)?.pending).toMatchObject({ amount: 600, lots: 1 })
        expect(before[0].choices).toHaveLength(1)
        expect(before[0].choices?.[0]).toMatchObject({ status: 'decided', how: 'draw', draw: { options: ['1', forest] }, stakes: [{ by: borya.memberId }, { by: gosha.memberId }] })
        expect(before[0].settlement?.members.find((m) => m.memberId === room.memberId)?.total).toMatchObject({ amount: 200, choices: 1 })
        const copy = await fullCopy(s, id)
        // Туда: на другой обёртке — тот же ответ тем же ключам, та же копия
        const t = await other(s)
        await ok(importOne(t, id, copy))
        expect(await states(t)).toEqual(before)
        expect(await fullCopy(t, id)).toEqual(copy)
        // И обратно: копия другой обёртки грузится в пустую комнату первой
        const back = await server()
        back.clock.now = s.clock.now
        await ok(importOne(back, id, await fullCopy(t, id)))
        expect(await states(back)).toEqual(before)
        // Действие после загрузки работает: журнал дописывается дальше
        await ok(send(t, id, 'transfers', { v: PROTOCOL_VERSION, to: borya.memberId, amount: 10 }, vera.key))
        expect((await readLog(t.storage(id))).length).toBe((copy.log as unknown[]).length + 1)
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
