import { describe, expect, it } from 'vitest'
import { courtCandidates, drawCourt, roomAppeals, type AppealRecord, type AppealTarget, type CourtRoom } from './appeal'
import { BAD_AMOUNT, FINAL_TIME, NOT_YET, OBJECTION_TIME, VOTING_TIME, roomEvents, type EventState } from './event'
import { NEED_GUARANTOR_TIME, roomOffers, type OfferCreated, type OfferRecord, type OfferSide, type OfferState } from './offer'
import type { CourtVerdict } from './protocol'
import type { LogEntry } from './room'
import {
  ALREADY_RECEIVED,
  ALREADY_REJECTED,
  BAD_MODE,
  DEFAULT_SETTLE_MODE,
  MODE_LOCKED,
  NO_TRANSFER,
  NO_TRANSFERS,
  NOT_MEMBER,
  NOTHING_TO_REVOKE,
  ONLY_HOST_MODE,
  ONLY_OWN,
  ONLY_RECEIVER,
  RECEIVED_NO_REVOKE,
  SAME_MODE,
  SELF_TRANSFER,
  TRANSFER_CANCELLED,
  checkAnswer,
  checkReceive,
  checkRevoke,
  checkSend,
  checkSettleMode,
  fewestTransfers,
  resultDebts,
  roomSettlement,
  roomTransfers,
  type MemberSettlement,
  type RoomSettlement,
  type SettleMode,
  type Transfer,
  type TransferRecord,
} from './settle'

const HOUR = 60 * 60 * 1000
const SEED = '9f3c51a07be2'
// Ход исхода: предложен в P, утверждён сам через сутки, окончательный — через 7 дней после
const P = 10_000
const APPROVED = P + OBJECTION_TIME
const MID = APPROVED + HOUR // утверждён, ещё не окончательный
const LATER = APPROVED + FINAL_TIME + HOUR // окончательный

// Ведущий H, участники A…G
const MEMBERS = ['H', 'A', 'B', 'C', 'D', 'E', 'F', 'G']
const ROOM_LOG: LogEntry[] = [
  { id: 'R', at: 0, memberId: 'H', type: 'room.created', roomId: 'R', name: 'Дача', currency: 'RUB' },
  ...MEMBERS.map((m): LogEntry => ({ id: 'M' + m, at: 0, memberId: 'H', type: 'member.added', member: m, name: m })),
]
const COURT_ROOM: CourtRoom = { hostId: 'H', members: MEMBERS.map((m) => ({ id: m, addedAt: 0 })) }
const ROLES = { hostId: 'H', members: MEMBERS }

let seq = 0
const nid = (p: string) => `${p}${++seq}`

// Событие «Да» (1) / «Нет» (2): приём до 2 000, исход к 3 000; ставки [кто, исход, сумма] по порядку;
// outcome — предложенный автором в at (null — не предложен)
type BetSpec = [string, string, number]
function pool(ev: string, author: string, bets: BetSpec[], outcome: string | null = null, at = P): LogEntry[] {
  return [
    {
      id: ev,
      at: 1_000,
      memberId: author,
      type: 'event.created',
      condition: 'Условие ' + ev,
      check: 'Скрин',
      outcomes: [
        { id: '1', title: 'Да' },
        { id: '2', title: 'Нет' },
      ],
      closesAt: 2_000,
      expectedAt: 3_000,
      subject: null,
      requestId: 'q' + ev,
    },
    ...bets.map(([who, o, amount], i): LogEntry => ({
      id: `${ev}b${i}`,
      at: 1_500 + i,
      memberId: who,
      type: 'bet.placed',
      event: ev,
      outcome: o,
      amount,
      requestId: `${ev}qb${i}`,
    })),
    ...(outcome === null ? [] : [{ id: ev + 'p', at, memberId: author, type: 'outcome.proposed', event: ev, outcome, requestId: ev + 'qp' } as LogEntry]),
  ]
}
const objectEv = (ev: string, who: string, at: number): LogEntry => ({ id: nid('O'), at, memberId: who, type: 'outcome.objected', event: ev, reason: 'Не так', requestId: nid('QO') })
const decideEv = (ev: string, outcome: string, at: number): LogEntry => ({ id: nid('D'), at, memberId: 'H', type: 'outcome.decided', event: ev, outcome, requestId: nid('QD') })
const cancelEv = (ev: string, at: number): LogEntry => ({ id: nid('X'), at, memberId: 'H', type: 'event.cancelled', event: ev, reason: 'Ошибка' })

// Пари author против taker, «a к b», сумма автора; how — чем кончилось
type OfferHow =
  | { agree: OfferSide } // отметки совпали — окончательно сразу
  | { decide: OfferSide } // разошлись, решил гарант H — окончательно через 7 дней
  | 'open' // не принято
  | 'marking' // принято, отметок нет
  | 'apart' // разошлись — решает гарант
  | 'declined' // гарант отказался — нужен другой
  | 'court' // 3 дня без общего гаранта, суд собран (Р-31)
function offer(id: string, author: string, taker: string, amount: number, how: OfferHow, odds = { a: 1, b: 1 }): OfferRecord[] {
  const created: OfferCreated = {
    type: 'offer.created',
    id,
    at: 1_000,
    memberId: author,
    condition: 'Пари ' + id,
    check: 'Видео',
    side: 'yes',
    odds,
    amount,
    to: taker,
    closesAt: 2_000,
    expectedAt: 3_000,
    guarantor: 'H',
    counterTo: null,
    subject: null,
    ...(how === 'court' && { guarantorRule: true }),
  }
  if (how === 'open') return [created]
  const act = <T extends OfferRecord['type']>(type: T, memberId: string, at: number, more: object = {}) =>
    ({ type, id: nid('r'), at, memberId, offer: id, ...more }) as OfferRecord
  const recs = [created, act('offer.accepted', taker, 1_100)]
  if (how === 'marking') return recs
  if (how === 'declined') return [...recs, act('offer.declined', 'H', P)]
  if (how === 'court') return [...recs, act('offer.declined', 'H', P), act('court.drawn', 'H', P + NEED_GUARANTOR_TIME)]
  if (how === 'apart') return [...recs, act('offer.marked', author, P, { winner: 'author' }), act('offer.marked', taker, P + 1, { winner: 'taker' })]
  if ('agree' in how) {
    return [...recs, act('offer.marked', author, P, { winner: how.agree }), act('offer.marked', taker, P + 1, { winner: how.agree })]
  }
  return [
    ...recs,
    act('offer.marked', author, P, { winner: 'author' }),
    act('offer.marked', taker, P + 1, { winner: 'taker' }),
    act('offer.decided', 'H', P + 2, { winner: how.decide }),
  ]
}

type Room = { log?: LogEntry[]; offers?: OfferRecord[]; appeals?: (events: EventState[], offers: OfferState[]) => AppealRecord[]; transfers?: TransferRecord[]; currency?: string; members?: string[] }
function settle(r: Room, now: number, mode?: SettleMode): RoomSettlement {
  const events = roomEvents([...ROOM_LOG, ...(r.log ?? [])])
  const offers = roomOffers(r.offers ?? [], ROLES)
  const cases = roomAppeals(r.appeals?.(events, offers) ?? [], { events, offers }, COURT_ROOM)
  return roomSettlement(
    { currency: r.currency ?? 'RUB', members: r.members ?? MEMBERS, events, offers, cases, transfers: r.transfers ?? [] },
    now,
    mode,
  )
}
const member = (s: RoomSettlement, id: string): MemberSettlement => s.members.find((m) => m.memberId === id) as MemberSettlement
const sum = (amount: number, events = 0, offers = 0) => ({ amount, events, offers })
const balances = (s: RoomSettlement) => Object.fromEntries(s.members.filter((m) => m.balance !== 0).map((m) => [m.memberId, m.balance]))

// Апелляция by в at, затем голоса суда (по одному, через миг) — дело по target
function appeal(target: string, by: string, at: number, verdicts: CourtVerdict[]) {
  return (events: EventState[], offers: OfferState[]): AppealRecord[] => {
    const event = events.find((e) => e.id === target)
    const t: AppealTarget = event ? { kind: 'event', event } : { kind: 'offer', offer: offers.find((o) => o.id === target) as OfferState }
    const candidates = courtCandidates(t, COURT_ROOM, at, [by])
    const seats = drawCourt(SEED, candidates, 'H').slice(0, 3)
    return [
      { type: 'appeal.filed', id: nid('F'), at, memberId: by, target, reason: 'Скрин смонтирован', seed: SEED, candidates },
      ...verdicts.map((v, i): AppealRecord => ({ type: 'court.voted', id: nid('V'), at: at + 1 + i, memberId: seats[i], target, ...v })),
    ]
  }
}

const sent = (id: string, from: string, to: string, amount: number, at = LATER): TransferRecord => ({ type: 'transfer.sent', id, at, memberId: from, to, amount })
const got = (id: string, to: string, transfer: string, at = LATER): TransferRecord => ({ type: 'transfer.received', id, at, memberId: to, transfer })
const gotDirect = (id: string, to: string, from: string, amount: number, at = LATER): TransferRecord => ({ type: 'transfer.received', id, at, memberId: to, from, amount })
const rejected = (id: string, to: string, transfer: string, at = LATER): TransferRecord => ({ type: 'transfer.rejected', id, at, memberId: to, transfer })
const revoked = (id: string, by: string, transfer: string, at = LATER): TransferRecord => ({ type: 'transfer.revoked', id, at, memberId: by, transfer })

// A — 300 на «Да», B и C — по 100 на «Нет»; предложено «Да»: A +200, B −100, C −100
const E1 = pool('E1', 'A', [['A', '1', 300], ['B', '2', 100], ['C', '2', 100]], '1')

describe('три числа у участника', () => {
  it('окончательное событие — в итог, с числом событий; утверждённое — ждёт окончательности', () => {
    const late = settle({ log: E1 }, LATER)
    expect(member(late, 'A')).toMatchObject({ total: sum(200, 1), pending: sum(0), inPlay: sum(0), balance: 200 })
    expect(member(late, 'B')).toMatchObject({ total: sum(-100, 1), balance: -100 })
    expect(member(late, 'H')).toMatchObject({ total: sum(0), pending: sum(0), inPlay: sum(0), balance: 0 })
    const mid = settle({ log: E1 }, MID)
    expect(member(mid, 'A')).toMatchObject({ total: sum(0), pending: sum(200, 1), inPlay: sum(0), balance: 0 })
    expect(member(mid, 'C')).toMatchObject({ pending: sum(-100, 1), balance: 0 })
    // Неокончательное в «кто кому» не попадает
    expect(mid.suggestions).toEqual([])
  })

  it('без утверждённого исхода — свои ставки «в игре»; ставки участника складываются', () => {
    const log = pool('E2', 'A', [['A', '1', 300], ['B', '2', 100], ['A', '1', 50]])
    const s = settle({ log }, LATER)
    expect(member(s, 'A')).toMatchObject({ total: sum(0), pending: sum(0), inPlay: sum(350, 1) })
    expect(member(s, 'B').inPlay).toEqual(sum(100, 1))
    // Предложен, сутки на возражение не прошли
    expect(member(settle({ log: E1 }, P + 1), 'A').inPlay).toEqual(sum(300, 1))
  })

  it('отменённое и «без игры» — ноль и не в счёт событий', () => {
    const cancelled = settle({ log: [...E1, cancelEv('E1', MID)] }, LATER)
    expect(member(cancelled, 'A')).toMatchObject({ total: sum(0), pending: sum(0), inPlay: sum(0) })
    const open = settle({ log: [...pool('E2', 'A', [['A', '1', 300], ['B', '2', 100]]), cancelEv('E2', 1_800)] }, LATER)
    expect(member(open, 'A').inPlay).toEqual(sum(0))
    // Все ставки на один исход — «без игры»
    const voidEv = settle({ log: pool('E3', 'A', [['A', '1', 300], ['B', '1', 100]], '1') }, LATER)
    expect(member(voidEv, 'A')).toMatchObject({ total: sum(0), pending: sum(0), inPlay: sum(0) })
    expect(member(settle({ log: pool('E3', 'A', [['A', '1', 300], ['B', '1', 100]], '1') }, MID), 'B').pending).toEqual(sum(0))
  })

  it('пари: окончательное — в итог, решение гаранта — ждёт 7 дней, принятое без исхода — своя сумма в игре', () => {
    // «3 к 1»: автор 300, соперник 100
    const odds = { a: 3, b: 1 }
    const offers = [...offer('O1', 'A', 'B', 300, { agree: 'author' }, odds), ...offer('O2', 'C', 'D', 300, { decide: 'taker' }, odds), ...offer('O3', 'E', 'F', 300, 'marking', odds), ...offer('O4', 'G', 'H', 300, 'open', odds)]
    const mid = settle({ offers }, MID)
    expect(member(mid, 'A')).toMatchObject({ total: sum(100, 0, 1), balance: 100 })
    expect(member(mid, 'B')).toMatchObject({ total: sum(-100, 0, 1), balance: -100 })
    expect(member(mid, 'C')).toMatchObject({ total: sum(0), pending: sum(-300, 0, 1) })
    expect(member(mid, 'D').pending).toEqual(sum(300, 0, 1))
    expect(member(mid, 'E').inPlay).toEqual(sum(300, 0, 1))
    expect(member(mid, 'F').inPlay).toEqual(sum(100, 0, 1))
    // Не принятое — не в игре
    expect(member(mid, 'G').inPlay).toEqual(sum(0))
    const late = settle({ offers }, LATER)
    expect(member(late, 'C')).toMatchObject({ total: sum(-300, 0, 1), pending: sum(0) })
    expect(member(late, 'D').total).toEqual(sum(300, 0, 1))
  })

  it('состояния этапа 4 — «в игре»: «возражение», «голосование», «снято», «ждёт суда»; у пари — гарант, нужен гарант, суд', () => {
    // Возражение, ведущий ещё не решил
    const disputed = settle({ log: [...E1, objectEv('E1', 'B', P + HOUR)] }, LATER)
    expect(member(disputed, 'A').inPlay).toEqual(sum(300, 1))
    // Ведущий ставил — голосование не ставивших; без голосов через 72 часа — «ждёт суда»
    const hostBet = pool('E2', 'A', [['A', '1', 300], ['H', '2', 100]], '1')
    const voting = [...hostBet, objectEv('E2', 'H', P + HOUR)]
    expect(member(settle({ log: voting }, P + 2 * HOUR), 'H').inPlay).toEqual(sum(100, 1))
    const court = settle({ log: voting }, P + HOUR + VOTING_TIME + 1)
    expect(member(court, 'A').inPlay).toEqual(sum(300, 1))
    expect(member(court, 'H').inPlay).toEqual(sum(100, 1))
    // Досрочное предложение снято «ещё не известно»
    const early = [...pool('E3', 'A', [['A', '1', 300], ['B', '2', 100]], '1', 1_800), objectEv('E3', 'B', 1_900), decideEv('E3', NOT_YET, 1_950)]
    expect(member(settle({ log: early }, LATER), 'B').inPlay).toEqual(sum(100, 1))
    const offers = [...offer('O1', 'A', 'B', 100, 'apart'), ...offer('O2', 'C', 'D', 100, 'declined'), ...offer('O3', 'E', 'F', 100, 'court')]
    const s = settle({ offers }, P + NEED_GUARANTOR_TIME + 1)
    for (const m of ['A', 'B', 'C', 'D', 'E', 'F']) expect(member(s, m)).toMatchObject({ total: sum(0), inPlay: sum(100, 0, 1) })
  })

  it('апелляция: до решения суда — ждёт окончательности и после 7 дней; «изменить», «оставить», «отменить»', () => {
    const filed = APPROVED + FINAL_TIME - HOUR
    const waiting = settle({ log: E1, appeals: appeal('E1', 'B', filed, []) }, APPROVED + FINAL_TIME + HOUR)
    expect(member(waiting, 'A')).toMatchObject({ total: sum(0), pending: sum(200, 1) })
    expect(waiting.suggestions).toEqual([])
    const change: CourtVerdict = { verdict: 'change', outcome: '2' }
    // «Изменить на „Нет“» — B и C делят 500: по +150, A −300; окончательно сразу
    const changed = settle({ log: E1, appeals: appeal('E1', 'B', MID, [change, change, { verdict: 'keep' }]) }, MID + 10)
    expect(member(changed, 'A').total).toEqual(sum(-300, 1))
    expect(member(changed, 'B').total).toEqual(sum(150, 1))
    expect(member(changed, 'C').total).toEqual(sum(150, 1))
    const keep: CourtVerdict = { verdict: 'keep' }
    const kept = settle({ log: E1, appeals: appeal('E1', 'B', MID, [keep, keep, change]) }, MID + 10)
    expect(member(kept, 'A').total).toEqual(sum(200, 1))
    const cancel: CourtVerdict = { verdict: 'cancel' }
    const cancelled = settle({ log: E1, appeals: appeal('E1', 'B', MID, [cancel, cancel, keep]) }, MID + 10)
    expect(member(cancelled, 'A')).toMatchObject({ total: sum(0), pending: sum(0), inPlay: sum(0) })
    // Пари: решение гаранта отменено судом — ноль
    const offers = offer('O1', 'A', 'B', 100, { decide: 'author' })
    const off = settle({ offers, appeals: appeal('O1', 'B', MID, [cancel, cancel, cancel]) }, MID + 10)
    expect(member(off, 'A')).toMatchObject({ total: sum(0), pending: sum(0), inPlay: sum(0) })
    // Пари: суд сменил сторону
    const turned = settle({ offers, appeals: appeal('O1', 'B', MID, [{ verdict: 'change', winner: 'taker' }, { verdict: 'change', winner: 'taker' }, keep]) }, MID + 10)
    expect(member(turned, 'B').total).toEqual(sum(100, 0, 1))
  })

  it('пул с остатком единиц: сумма итогов и балансов комнаты — ноль', () => {
    // Банк 103 на троих по 1: 35, 34, 34
    const log = pool('E1', 'A', [['A', '1', 1], ['B', '1', 1], ['C', '1', 1], ['D', '2', 50], ['E', '2', 50]], '1')
    const s = settle({ log, transfers: [sent('t1', 'D', 'A', 7)] }, LATER)
    expect(['A', 'B', 'C', 'D', 'E'].map((m) => member(s, m).total.amount)).toEqual([34, 33, 33, -50, -50])
    expect(s.members.reduce((x, m) => x + m.total.amount, 0)).toBe(0)
    expect(s.members.reduce((x, m) => x + m.balance, 0)).toBe(0)
  })
})

describe('переводы', () => {
  const ROOM = { currency: 'RUB', members: MEMBERS }
  const one = (records: TransferRecord[]): Transfer => roomTransfers(records, ROOM)[0]

  it('проверки «Перевёл» и прямого «Получил»', () => {
    expect(checkSend(ROOM, 'B', 'A', 100)).toBeNull()
    expect(checkReceive(ROOM, 'A', 'B', 100)).toBeNull()
    expect(checkSend(ROOM, 'B', 'Z', 100)).toBe(NOT_MEMBER)
    expect(checkSend(ROOM, 'Z', 'A', 100)).toBe(NOT_MEMBER)
    expect(checkSend(ROOM, 'B', undefined, 100)).toBe(NOT_MEMBER)
    expect(checkReceive(ROOM, 'A', 'Z', 100)).toBe(NOT_MEMBER)
    expect(checkSend(ROOM, 'B', 'B', 100)).toBe(SELF_TRANSFER)
    expect(checkReceive(ROOM, 'A', 'A', 100)).toBe(SELF_TRANSFER)
    for (const bad of [0, -5, 1.5, '100', null, Number.MAX_SAFE_INTEGER + 1]) expect(checkSend(ROOM, 'B', 'A', bad)).toBe(BAD_AMOUNT)
    // Комната на очки
    const pts = { currency: 'PTS', members: MEMBERS }
    expect(checkSend(pts, 'B', 'A', 100)).toBe(NO_TRANSFERS)
    expect(checkReceive(pts, 'A', 'B', 100)).toBe(NO_TRANSFERS)
    expect(checkAnswer(pts, null, 'A')).toBe(NO_TRANSFERS)
    expect(checkRevoke(pts, null, 'A')).toBe(NO_TRANSFERS)
    expect(roomTransfers([sent('t1', 'B', 'A', 100)], pts)).toEqual([])
  })

  it('все состояния: ждёт, получен, отклонён, отменён', () => {
    expect(one([sent('t1', 'B', 'A', 100, 5)])).toEqual({ id: 't1', at: 5, from: 'B', to: 'A', amount: 100, by: 'sender', status: 'pending', changedAt: 5 })
    expect(one([sent('t1', 'B', 'A', 100, 5), got('g', 'A', 't1', 6)])).toMatchObject({ status: 'received', changedAt: 6 })
    expect(one([sent('t1', 'B', 'A', 100), rejected('n', 'A', 't1')]).status).toBe('rejected')
    expect(one([sent('t1', 'B', 'A', 100), revoked('x', 'B', 't1')]).status).toBe('cancelled')
    expect(one([gotDirect('t1', 'A', 'B', 100)])).toMatchObject({ from: 'B', to: 'A', by: 'receiver', status: 'received' })
  })

  it('отмена своей отметки: получатель отзывает «Получил» — «Перевёл» снова ждёт, прямое — отменено', () => {
    const t = [sent('t1', 'B', 'A', 100), got('g', 'A', 't1'), revoked('x', 'A', 't1')]
    expect(one(t).status).toBe('pending')
    // Снова ждёт — можно «Не получал»
    expect(one([...t, rejected('n', 'A', 't1')]).status).toBe('rejected')
    expect(one([gotDirect('t1', 'A', 'B', 100), revoked('x', 'A', 't1')]).status).toBe('cancelled')
  })

  it('действие — только своей стороны и из подходящего состояния; запись не по правилу не действует', () => {
    const pending = one([sent('t1', 'B', 'A', 100)])
    const received = one([sent('t1', 'B', 'A', 100), got('g', 'A', 't1')])
    const refused = one([sent('t1', 'B', 'A', 100), rejected('n', 'A', 't1')])
    const cancelled = one([sent('t1', 'B', 'A', 100), revoked('x', 'B', 't1')])
    const direct = one([gotDirect('t1', 'A', 'B', 100)])
    expect(checkAnswer(ROOM, null, 'A')).toBe(NO_TRANSFER)
    expect(checkAnswer(ROOM, pending, 'A')).toBeNull()
    expect(checkAnswer(ROOM, pending, 'B')).toBe(ONLY_RECEIVER)
    expect(checkAnswer(ROOM, pending, 'C')).toBe(ONLY_RECEIVER)
    expect(checkAnswer(ROOM, received, 'A')).toBe(ALREADY_RECEIVED)
    expect(checkAnswer(ROOM, refused, 'A')).toBe(ALREADY_REJECTED)
    expect(checkAnswer(ROOM, cancelled, 'A')).toBe(TRANSFER_CANCELLED)
    expect(checkAnswer(ROOM, direct, 'A')).toBe(ALREADY_RECEIVED)
    expect(checkRevoke(ROOM, null, 'B')).toBe(NO_TRANSFER)
    expect(checkRevoke(ROOM, pending, 'B')).toBeNull()
    expect(checkRevoke(ROOM, received, 'B')).toBe(RECEIVED_NO_REVOKE)
    expect(checkRevoke(ROOM, refused, 'B')).toBe(ALREADY_REJECTED)
    expect(checkRevoke(ROOM, cancelled, 'B')).toBe(TRANSFER_CANCELLED)
    expect(checkRevoke(ROOM, pending, 'A')).toBe(NOTHING_TO_REVOKE)
    expect(checkRevoke(ROOM, received, 'A')).toBeNull()
    expect(checkRevoke(ROOM, refused, 'A')).toBe(ALREADY_REJECTED)
    expect(checkRevoke(ROOM, pending, 'C')).toBe(ONLY_OWN)
    // Прямое «Получил» — отметка получателя: должник его не отменяет
    expect(checkRevoke(ROOM, direct, 'B')).toBe(ONLY_OWN)
    expect(checkRevoke(ROOM, direct, 'A')).toBeNull()
    // Свёртка теми же проверками
    expect(one([sent('t1', 'B', 'A', 100), got('g', 'B', 't1')]).status).toBe('pending')
    expect(one([sent('t1', 'B', 'A', 100), got('g', 'A', 't1'), revoked('x', 'B', 't1')]).status).toBe('received')
    expect(one([sent('t1', 'B', 'A', 100), rejected('n', 'A', 't1'), got('g', 'A', 't1')]).status).toBe('rejected')
    expect(one([gotDirect('t1', 'A', 'B', 100), revoked('x', 'B', 't1')]).status).toBe('received')
    expect(roomTransfers([sent('t1', 'B', 'B', 100), sent('t2', 'B', 'A', 0), got('g', 'A', 'нет')], ROOM)).toEqual([])
    // Повтор номера записи — не второй перевод
    expect(roomTransfers([sent('t1', 'B', 'A', 100), sent('t1', 'B', 'A', 100)], ROOM)).toHaveLength(1)
  })

  it('баланс = итог + отдал − получил: считаются «ждёт» и «получен»; частичный перевод; переплата меняет знак', () => {
    // «3 к 1»: A прав, B должен A 100
    const offers = offer('O1', 'A', 'B', 300, { agree: 'author' }, { a: 3, b: 1 })
    const part = settle({ offers, transfers: [sent('t1', 'B', 'A', 40)] }, LATER)
    expect(member(part, 'A')).toMatchObject({ total: sum(100, 0, 1), sent: 0, received: 40, balance: 60 })
    expect(member(part, 'B')).toMatchObject({ sent: 40, received: 0, balance: -60 })
    expect(part.suggestions).toEqual([{ from: 'B', to: 'A', amount: 60 }])
    expect(part.transfers.map((t) => t.status)).toEqual(['pending'])
    // Отклонённые и отменённые не считаются
    const off = settle({ offers, transfers: [sent('t1', 'B', 'A', 40), rejected('n', 'A', 't1'), sent('t2', 'B', 'A', 30), revoked('x', 'B', 't2')] }, LATER)
    expect(member(off, 'B')).toMatchObject({ sent: 0, balance: -100 })
    expect(off.suggestions).toEqual([{ from: 'B', to: 'A', amount: 100 }])
    // Переплата: 40 + 80 — A должен вернуть 20; сумма перевода долгом не ограничена
    const over = settle({ offers, transfers: [sent('t1', 'B', 'A', 40), got('g', 'A', 't1'), gotDirect('t2', 'A', 'B', 80)] }, LATER)
    expect(balances(over)).toEqual({ A: -20, B: 20 })
    for (const mode of ['stakes', 'fewest'] as const) expect(settle({ offers, transfers: [sent('t1', 'B', 'A', 40), gotDirect('t2', 'A', 'B', 80)] }, LATER, mode).suggestions).toEqual([{ from: 'A', to: 'B', amount: 20 }])
    // Рассчитались — пусто
    const done = settle({ offers, transfers: [sent('t1', 'B', 'A', 100), got('g', 'A', 't1')] }, LATER)
    expect(balances(done)).toEqual({})
    expect(done.suggestions).toEqual([])
    expect(settle({ offers, transfers: [sent('t1', 'B', 'A', 100)] }, LATER, 'fewest').suggestions).toEqual([])
  })
})

describe('«кто кому»', () => {
  it('по умолчанию — «по ставкам»; все балансы ноль — пусто', () => {
    expect(DEFAULT_SETTLE_MODE).toBe('stakes')
    expect(settle({ log: E1 }, LATER).mode).toBe('stakes')
    expect(settle({}, LATER).suggestions).toEqual([])
    expect(settle({}, LATER, 'fewest').suggestions).toEqual([])
  })

  it('2 участника: пари — проигравший выигравшему; встречные пари пары сворачиваются', () => {
    const one = offer('O1', 'A', 'B', 300, { agree: 'author' }, { a: 3, b: 1 })
    expect(settle({ offers: one }, LATER).suggestions).toEqual([{ from: 'B', to: 'A', amount: 100 }])
    const both = [...one, ...offer('O2', 'B', 'A', 30, { agree: 'author' })]
    for (const mode of ['stakes', 'fewest'] as const) expect(settle({ offers: both }, LATER, mode).suggestions).toEqual([{ from: 'B', to: 'A', amount: 70 }])
    // Встречные равны — пусто
    expect(settle({ offers: [...one, ...offer('O2', 'B', 'A', 100, { agree: 'author' })] }, LATER).suggestions).toEqual([])
  })

  it('3 участника, цепочка A → B → C: «по ставкам» — два перевода, «меньше переводов» — один', () => {
    const log = [...pool('E1', 'A', [['A', '2', 100], ['B', '1', 100]], '1'), ...pool('E2', 'B', [['B', '2', 100], ['C', '1', 100]], '1')]
    const stakes = settle({ log }, LATER, 'stakes')
    expect(stakes.suggestions).toEqual([
      { from: 'A', to: 'B', amount: 100 },
      { from: 'B', to: 'C', amount: 100 },
    ])
    expect(balances(stakes)).toEqual({ A: -100, C: 100 })
    expect(member(stakes, 'B').total).toEqual(sum(0, 2))
    const fewest = settle({ log }, LATER, 'fewest')
    expect(fewest.mode).toBe('fewest')
    expect(fewest.suggestions).toEqual([{ from: 'A', to: 'C', amount: 100 }])
  })

  it('пул с остатком — суммы пар точные, остаток — по порядку первой ставки', () => {
    // A, B, C — по 1 на «Да»: +34, +33, +33; D и E — по 50 на «Нет»
    const result = [
      { memberId: 'A', net: 34 },
      { memberId: 'B', net: 33 },
      { memberId: 'C', net: 33 },
      { memberId: 'D', net: -50 },
      { memberId: 'E', net: -50 },
    ]
    expect(resultDebts(result)).toEqual([
      { from: 'D', to: 'A', amount: 17 },
      { from: 'D', to: 'B', amount: 17 },
      { from: 'D', to: 'C', amount: 16 },
      { from: 'E', to: 'A', amount: 17 },
      { from: 'E', to: 'B', amount: 16 },
      { from: 'E', to: 'C', amount: 17 },
    ])
    const log = pool('E1', 'A', [['A', '1', 1], ['B', '1', 1], ['C', '1', 1], ['D', '2', 50], ['E', '2', 50]], '1')
    const s = settle({ log }, LATER)
    expect(s.suggestions).toEqual([
      { from: 'D', to: 'A', amount: 17 },
      { from: 'E', to: 'A', amount: 17 },
      { from: 'D', to: 'B', amount: 17 },
      { from: 'E', to: 'B', amount: 16 },
      { from: 'D', to: 'C', amount: 16 },
      { from: 'E', to: 'C', amount: 17 },
    ])
    // Сумма подсказок участника — его баланс
    for (const m of s.members) {
      const net = s.suggestions.reduce((x, t) => x + (t.to === m.memberId ? t.amount : 0) - (t.from === m.memberId ? t.amount : 0), 0)
      expect(net).toBe(m.balance)
    }
  })

  it('точные суммы на любом пуле: каждый выигравший получает свой net, проигравший отдаёт свой', () => {
    const cases = [
      [7, 5, 3, -4, -11],
      [1, 1, 1, 1, -2, -2],
      [100, -33, -33, -34],
      [13, 29, -7, -7, -7, -7, -7, -7],
    ]
    for (const nets of cases) {
      const result = nets.map((net, i) => ({ memberId: 'm' + i, net }))
      const debts = resultDebts(result)
      for (const r of result) {
        const got = debts.reduce((x, d) => x + (d.to === r.memberId ? d.amount : 0) - (d.from === r.memberId ? d.amount : 0), 0)
        expect(got).toBe(r.net)
      }
      expect(debts.every((d) => d.amount > 0 && Number.isInteger(d.amount))).toBe(true)
    }
  })

  it('6 участников в обоих режимах; подсказка не зависит от порядка участников', () => {
    // Банк 500, на «Да» 200: A и D по +150; B −100, C −200. Пари: E прав против F (50), B прав против A (30)
    const log = pool('E1', 'A', [['A', '1', 100], ['B', '2', 100], ['C', '2', 200], ['D', '1', 100]], '1')
    const offers = [...offer('O1', 'E', 'F', 50, { agree: 'author' }), ...offer('O2', 'A', 'B', 30, { agree: 'taker' })]
    const six = ['A', 'B', 'C', 'D', 'E', 'F']
    const stakes = settle({ log, offers, members: six }, LATER)
    expect(balances(stakes)).toEqual({ A: 120, B: -70, C: -200, D: 150, E: 50, F: -50 })
    expect(stakes.suggestions).toEqual([
      { from: 'B', to: 'A', amount: 20 },
      { from: 'C', to: 'A', amount: 100 },
      { from: 'B', to: 'D', amount: 50 },
      { from: 'C', to: 'D', amount: 100 },
      { from: 'F', to: 'E', amount: 50 },
    ])
    const fewest = settle({ log, offers, members: six }, LATER, 'fewest')
    expect(fewest.suggestions).toEqual([
      { from: 'C', to: 'D', amount: 150 },
      { from: 'B', to: 'A', amount: 70 },
      { from: 'C', to: 'A', amount: 50 },
      { from: 'F', to: 'E', amount: 50 },
    ])
    const reversed = [...six].reverse()
    expect(settle({ log, offers, members: reversed }, LATER).suggestions).toEqual(stakes.suggestions)
    expect(settle({ log, offers, members: reversed }, LATER, 'fewest').suggestions).toEqual(fewest.suggestions)
  })

  it('«меньше переводов»: от большего долга к большему выигрышу, при равенстве — по номеру участника', () => {
    expect(fewestTransfers([
      { memberId: 'c', balance: 10 },
      { memberId: 'b', balance: 10 },
      { memberId: 'z', balance: -10 },
      { memberId: 'y', balance: -10 },
    ])).toEqual([
      { from: 'y', to: 'b', amount: 10 },
      { from: 'z', to: 'c', amount: 10 },
    ])
    expect(fewestTransfers([{ memberId: 'a', balance: 0 }])).toEqual([])
  })

  it('комната на очки: три числа есть, переводов и подсказки нет', () => {
    const s = settle({ log: E1, currency: 'PTS', transfers: [sent('t1', 'B', 'A', 100)] }, LATER)
    expect(member(s, 'A')).toMatchObject({ total: sum(200, 1), received: 0, balance: 200 })
    expect(s.transfers).toEqual([])
    expect(s.suggestions).toEqual([])
    expect(settle({ log: E1, currency: 'PTS' }, LATER, 'fewest').suggestions).toEqual([])
  })
})

describe('смена режима (checkSettleMode)', () => {
  const ROOM = { hostId: 'H', currency: 'RUB' }
  const offers = offer('O1', 'A', 'B', 100, { agree: 'author' })
  const at = (transfers: TransferRecord[] = [], mode: SettleMode = 'stakes') => settle({ offers, transfers }, LATER, mode)

  it('только ведущий, известный режим, не тот же; на очки — отказ', () => {
    expect(checkSettleMode(at(), ROOM, 'H', 'fewest')).toBeNull()
    expect(checkSettleMode(at([], 'fewest'), ROOM, 'H', 'stakes')).toBeNull()
    expect(checkSettleMode(at(), ROOM, 'A', 'fewest')).toBe(ONLY_HOST_MODE)
    expect(checkSettleMode(at(), ROOM, 'H', 'many')).toBe(BAD_MODE)
    expect(checkSettleMode(at(), ROOM, 'H', undefined)).toBe(BAD_MODE)
    expect(checkSettleMode(at(), ROOM, 'H', 'stakes')).toBe(SAME_MODE)
    expect(checkSettleMode(at(), { hostId: 'H', currency: 'PTS' }, 'H', 'fewest')).toBe(NO_TRANSFERS)
  })

  it('пока нет переводов «ждёт» или «получен» — можно; отклонённые и отменённые не мешают', () => {
    expect(checkSettleMode(at([sent('t1', 'B', 'A', 50), rejected('n', 'A', 't1'), sent('t2', 'B', 'A', 10), revoked('x', 'B', 't2')]), ROOM, 'H', 'fewest')).toBeNull()
  })

  it('после переводов — только когда все балансы ноль и ни один перевод не ждёт подтверждения', () => {
    expect(checkSettleMode(at([sent('t1', 'B', 'A', 50)]), ROOM, 'H', 'fewest')).toBe(MODE_LOCKED)
    expect(checkSettleMode(at([sent('t1', 'B', 'A', 50), got('g', 'A', 't1')]), ROOM, 'H', 'fewest')).toBe(MODE_LOCKED)
    // Балансы ноль, но перевод ждёт подтверждения
    expect(checkSettleMode(at([sent('t1', 'B', 'A', 100)]), ROOM, 'H', 'fewest')).toBe(MODE_LOCKED)
    expect(checkSettleMode(at([sent('t1', 'B', 'A', 100), got('g', 'A', 't1')]), ROOM, 'H', 'fewest')).toBeNull()
  })
})
