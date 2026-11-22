import { describe, expect, it } from 'vitest'
import {
  AGREED,
  ALREADY_ACCEPTED,
  BAD_ADDRESSEE,
  BAD_GUARANTOR,
  BAD_ODDS,
  CLOSE_PASSED,
  COUNTER_ACCEPTED,
  COUNTER_WITHDRAWN,
  COUNTERED,
  DECIDED,
  EXPECTED_EARLY,
  EXPIRED,
  FINAL_TIME,
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
  courtDue,
  courtFrom,
  MARK_EARLY,
  NEED_GUARANTOR,
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
  ACCEPTED_NO_WITHDRAW,
  BAD_SUBJECT,
  NEED_GUARANTOR_SUBJECT,
  SUBJECT_ADDRESSEE_NO,
  SUBJECT_AUTHOR_YES,
  SUBJECT_GUARANTOR,
  SUBJECT_TAKES,
  checkOfferSubject,
  subjectIsSide,
  checkAccept,
  checkCounter,
  checkDecide,
  checkDecline,
  checkMark,
  checkNominate,
  checkOfferInput,
  checkOfferTimes,
  checkWithdraw,
  counterInput,
  offerGuarantor,
  offerNets,
  offerOutcome,
  offerResult,
  offerStakes,
  offerStatus,
  roomOffers,
  isOfferEntry,
  logOffers,
  offerInfo,
  offerRecord,
  offerView,
  roomRoles,
  type OfferCreated,
  type OfferRecord,
  type OfferSide,
  type OfferState,
} from './offer'
import {
  AUCTION_ACCEPT,
  AUCTION_ADDRESSED,
  AUCTION_COUNTER,
  AUCTION_EXPECTED,
  AUCTION_EXTEND,
  AUCTION_EXTEND_MAX,
  AUCTION_HAS_BIDS,
  AUCTION_LONG,
  AUCTION_MAX,
  AUCTION_MIN,
  AUCTION_OVER,
  AUCTION_SHORT,
  BAD_BID,
  BAD_START,
  BAD_STEP,
  BID_LOW,
  BID_STEP,
  GUARANTOR_BIDS,
  NO_BIDS,
  NOT_AUCTION,
  NOT_MEMBER,
  ONLY_AUTHOR_TAKES,
  OWN_BID,
  SUBJECT_BIDS,
  auctionStep,
  biddingView,
  checkBid,
  checkTakeBid,
  offerAmounts,
  offerAt,
} from './offer'
import { isOfferView } from './protocol'
import { LONG_CONDITION, NEED_CHECK, NEED_CONDITION, BAD_AMOUNT } from './event'
import { FAST_TIMES, NORMAL_TIMES, type Times } from './pace'
import type { LogEntry } from './room'

const DAY = 24 * 60 * 60 * 1000
const room = { hostId: 'h', members: ['h', 'a', 'b', 'c', 'g', 'n'] }
const T = 1_000_000_000
const CLOSE = T + DAY
const EXPECT = T + 2 * DAY

let seq = 0
function created(over: Partial<OfferCreated> = {}): OfferCreated {
  return {
    type: 'offer.created',
    id: 'o1',
    at: T,
    memberId: 'a',
    condition: 'Вася подтянется 20 раз',
    check: 'Видео в чате',
    side: 'yes',
    odds: { a: 3, b: 1 },
    amount: 300,
    to: null,
    closesAt: CLOSE,
    expectedAt: EXPECT,
    guarantor: 'h',
    counterTo: null,
    subject: null,
    ...over,
  }
}
function act(type: 'offer.accepted' | 'offer.withdrawn' | 'offer.declined', memberId: string, at: number, offer = 'o1'): OfferRecord {
  return { type, id: `r${++seq}`, at, memberId, offer }
}
function mark(memberId: string, winner: OfferSide, at: number, offer = 'o1'): OfferRecord {
  return { type: 'offer.marked', id: `r${++seq}`, at, memberId, offer, winner }
}
function decide(memberId: string, winner: OfferSide, at: number): OfferRecord {
  return { type: 'offer.decided', id: `r${++seq}`, at, memberId, offer: 'o1', winner }
}
function nominate(memberId: string, guarantor: string, at: number): OfferRecord {
  return { type: 'offer.nominated', id: `r${++seq}`, at, memberId, offer: 'o1', guarantor }
}
function one(records: OfferRecord[]): OfferState {
  return roomOffers(records, room).find((o) => o.id === 'o1') as OfferState
}
const accepted = (more: OfferRecord[] = []) => one([created(), act('offer.accepted', 'b', T + 10), ...more])

describe('суммы по кэфу', () => {
  it('3 к 1, сумма автора 300 — соперник 100, банк 400, итоги ±', () => {
    const s = offerStakes({ a: 3, b: 1 }, 300)
    expect(s).toEqual({ ok: true, value: { author: 300, taker: 100, bank: 400, exact: true } })
    if (!s.ok) return
    expect(offerNets(s.value, 'author')).toEqual({ author: 100, taker: -100 })
    expect(offerNets(s.value, 'taker')).toEqual({ author: -300, taker: 300 })
  })
  it('1 к 2, сумма автора 150 — соперник 300', () => {
    expect(offerStakes({ a: 1, b: 2 }, 150)).toEqual({ ok: true, value: { author: 150, taker: 300, bank: 450, exact: true } })
  })
  it('не делится нацело — вниз до целой единицы', () => {
    expect(offerStakes({ a: 3, b: 1 }, 100)).toEqual({ ok: true, value: { author: 100, taker: 33, bank: 133, exact: false } })
  })
  it('меньше одной единицы — отказ', () => {
    expect(offerStakes({ a: 3, b: 1 }, 2)).toEqual({ ok: false, error: TAKER_TOO_SMALL })
  })
})

describe('форма пари', () => {
  const form = {
    condition: ' Вася подтянется ',
    check: 'Видео',
    odds: { a: 3, b: 1 },
    amount: 300,
    closesAt: CLOSE,
    expectedAt: EXPECT,
  }
  it('годная форма — по умолчанию «сбудется», открытое, гарант не выбран', () => {
    expect(checkOfferInput(form)).toEqual({
      ok: true,
      value: { ...form, condition: 'Вася подтянется', side: 'yes', to: null, guarantor: null, subject: null },
    })
  })
  it('кэф — целые 1…100', () => {
    for (const odds of [{ a: 0, b: 1 }, { a: 101, b: 1 }, { a: 1.5, b: 1 }, { a: 1 }, null, '3:1']) {
      expect(checkOfferInput({ ...form, odds })).toEqual({ ok: false, error: BAD_ODDS })
    }
    expect(checkOfferInput({ ...form, odds: { a: 100, b: 1 }, amount: 100 }).ok).toBe(true)
  })
  it('сумма — целое > 0; соперник меньше единицы — отказ', () => {
    expect(checkOfferInput({ ...form, amount: 0 })).toEqual({ ok: false, error: BAD_AMOUNT })
    expect(checkOfferInput({ ...form, amount: 1.5 })).toEqual({ ok: false, error: BAD_AMOUNT })
    expect(checkOfferInput({ ...form, amount: 2 })).toEqual({ ok: false, error: TAKER_TOO_SMALL })
  })
  it('условие и «как проверяем» — не пустые, ≤ 300 знаков', () => {
    expect(checkOfferInput({ ...form, condition: '  ' })).toEqual({ ok: false, error: NEED_CONDITION })
    expect(checkOfferInput({ ...form, check: '' })).toEqual({ ok: false, error: NEED_CHECK })
    expect(checkOfferInput({ ...form, condition: 'я'.repeat(301) })).toEqual({ ok: false, error: LONG_CONDITION })
    expect(checkOfferInput({ ...form, condition: '😀'.repeat(300) }).ok).toBe(true)
  })
  it('сроки — по времени сервера', () => {
    expect(checkOfferTimes({ closesAt: CLOSE, expectedAt: EXPECT }, T)).toBeNull()
    expect(checkOfferTimes({ closesAt: CLOSE, expectedAt: CLOSE }, T)).toBeNull()
    expect(checkOfferTimes({ closesAt: T, expectedAt: EXPECT }, T)).toBe(CLOSE_PASSED)
    expect(checkOfferTimes({ closesAt: CLOSE, expectedAt: CLOSE - 1 }, T)).toBe(EXPECTED_EARLY)
  })
})

describe('гарант при создании', () => {
  it('не выбран — ведущий', () => {
    expect(offerGuarantor({ to: 'b', guarantor: null }, 'a', room)).toEqual({ ok: true, value: 'h' })
  })
  it('ведущий — автор или адресат: гаранта надо выбрать', () => {
    expect(offerGuarantor({ to: null, guarantor: null }, 'h', room)).toEqual({ ok: false, error: NEED_GUARANTOR })
    expect(offerGuarantor({ to: 'h', guarantor: null }, 'a', room)).toEqual({ ok: false, error: NEED_GUARANTOR })
    expect(offerGuarantor({ to: 'h', guarantor: 'g' }, 'a', room)).toEqual({ ok: true, value: 'g' })
  })
  it('выбранный — участник, не автор и не адресат', () => {
    expect(offerGuarantor({ to: 'b', guarantor: 'a' }, 'a', room)).toEqual({ ok: false, error: BAD_GUARANTOR })
    expect(offerGuarantor({ to: 'b', guarantor: 'b' }, 'a', room)).toEqual({ ok: false, error: BAD_GUARANTOR })
    expect(offerGuarantor({ to: 'b', guarantor: 'x' }, 'a', room)).toEqual({ ok: false, error: BAD_GUARANTOR })
  })
  it('адресат — другой участник', () => {
    expect(offerGuarantor({ to: 'a', guarantor: null }, 'a', room)).toEqual({ ok: false, error: BAD_ADDRESSEE })
    expect(offerGuarantor({ to: 'x', guarantor: null }, 'a', room)).toEqual({ ok: false, error: BAD_ADDRESSEE })
  })
  it('запись без годного гаранта или со сроком в прошлом не действует', () => {
    expect(roomOffers([created({ memberId: 'h' })], room)).toEqual([])
    expect(roomOffers([created({ at: CLOSE })], room)).toEqual([])
  })
})

describe('принять и отозвать', () => {
  it('открытое — любой участник, кроме автора и гаранта', () => {
    const o = one([created()])
    expect(checkAccept(o, 'b', room, T)).toBeNull()
    expect(checkAccept(o, 'a', room, T)).toBe(OWN_OFFER)
    expect(checkAccept(o, 'h', room, T)).toBe(GUARANTOR_TAKES)
    expect(checkAccept(o, 'x', room, T)).not.toBeNull()
  })
  it('адресное — только адресат', () => {
    const o = one([created({ to: 'b' })])
    expect(checkAccept(o, 'b', room, T)).toBeNull()
    expect(checkAccept(o, 'c', room, T)).toBe(NOT_ADDRESSEE)
  })
  it('в ту же миллисекунду, что «приём до», — истекло', () => {
    const o = one([created()])
    expect(checkAccept(o, 'b', room, CLOSE - 1)).toBeNull()
    expect(checkAccept(o, 'b', room, CLOSE)).toBe(EXPIRED)
    expect(offerStatus(o, CLOSE)).toBe('expired')
    expect(one([created(), act('offer.accepted', 'b', CLOSE)]).accepted).toBeNull()
  })
  it('принятое второй раз не принимается', () => {
    const o = accepted()
    expect(o.accepted).toEqual({ by: 'b', at: T + 10 })
    expect(offerStatus(o, T + 20)).toBe('accepted')
    expect(checkAccept(o, 'c', room, T + 20)).toBe(ALREADY_ACCEPTED)
    expect(accepted([act('offer.accepted', 'c', T + 20)]).accepted?.by).toBe('b')
  })
  it('отзывает автор, пока не принято; отозванное не принимается', () => {
    const o = one([created()])
    expect(checkWithdraw(o, 'b')).toBe(ONLY_AUTHOR)
    expect(checkWithdraw(o, 'a')).toBeNull()
    const w = one([created(), act('offer.withdrawn', 'a', T + 5)])
    expect(offerStatus(w, T + 6)).toBe('withdrawn')
    expect(checkAccept(w, 'b', room, T + 6)).toBe(WITHDRAWN)
    expect(checkWithdraw(accepted(), 'a')).toBe(ACCEPTED_NO_WITHDRAW)
    expect(accepted([act('offer.withdrawn', 'a', T + 20)]).withdrawnAt).toBeNull()
  })
})

describe('встречное', () => {
  const counter = (over: Partial<OfferCreated> = {}) =>
    created({
      id: 'o2',
      at: T + 5,
      memberId: 'b',
      side: 'no',
      odds: { a: 1, b: 2 },
      amount: 100,
      to: 'a',
      counterTo: 'o1',
      ...over,
    })
  it('форма — кэф и сумма свои, адресат — автор исходного, сторона обратная', () => {
    const o = one([created()])
    expect(counterInput(o, { odds: { a: 1, b: 2 }, amount: 100, closesAt: CLOSE })).toEqual({
      condition: o.condition,
      check: o.check,
      side: 'no',
      odds: { a: 1, b: 2 },
      amount: 100,
      to: 'a',
      closesAt: CLOSE,
      expectedAt: EXPECT,
      guarantor: 'h',
      subject: null,
    })
  })
  it('принять может только автор исходного; принял — исходное закрыто встречным', () => {
    const list = roomOffers([created(), counter()], room)
    const c = list[1]
    expect(c.counterTo).toBe('o1')
    expect(checkAccept(c, 'c', room, T + 6)).toBe(NOT_ADDRESSEE)
    expect(checkAccept(c, 'a', room, T + 6)).toBeNull()
    const [orig, taken] = roomOffers([created(), counter(), act('offer.accepted', 'a', T + 7, 'o2')], room)
    expect(taken.accepted).toEqual({ by: 'a', at: T + 7 })
    expect(orig.closedBy).toEqual({ offer: 'o2', at: T + 7 })
    expect(offerStatus(orig, T + 8)).toBe('countered')
    expect(checkAccept(orig, 'c', room, T + 8)).toBe(COUNTERED)
  })
  it('исходное уже принято другим — остаётся принятым', () => {
    const [orig] = roomOffers(
      [created(), counter(), act('offer.accepted', 'c', T + 6), act('offer.accepted', 'a', T + 7, 'o2')],
      room,
    )
    expect(orig.accepted?.by).toBe('c')
    expect(orig.closedBy).toBeNull()
  })
  it('к принятому, отозванному или своему — отказ', () => {
    expect(checkCounter(accepted(), 'c', room, T + 20)).toBe(COUNTER_ACCEPTED)
    expect(checkCounter(one([created(), act('offer.withdrawn', 'a', T + 1)]), 'b', room, T + 2)).toBe(COUNTER_WITHDRAWN)
    expect(checkCounter(one([created()]), 'a', room, T + 2)).toBe(OWN_COUNTER)
    expect(roomOffers([created(), act('offer.accepted', 'c', T + 1), counter()], room)).toHaveLength(1)
  })
})

describe('исход пари', () => {
  it('отметка до принятия — отказ', () => {
    const o = one([created()])
    expect(checkMark(o, 'a', 'author')).toBe(MARK_EARLY)
    expect(offerOutcome(o, T)).toBeNull()
  })
  it('гарант и посторонний не отмечают как сторона', () => {
    const o = accepted()
    expect(checkMark(o, 'h', 'author')).toBe(GUARANTOR_MARKS)
    expect(checkMark(o, 'c', 'author')).toBe(NOT_SIDE)
    expect(accepted([mark('h', 'author', T + 20)]).marks).toEqual([])
  })
  it('совпали — утверждён согласием и окончательный сразу', () => {
    const o = accepted([mark('a', 'author', T + 20), mark('b', 'author', T + 30)])
    const out = offerOutcome(o, T + 30)
    expect(out?.phase).toBe('final')
    expect(out?.approved).toEqual({ winner: 'author', at: T + 30, how: 'agreement', by: null })
    expect(out?.finalAt).toBe(T + 30)
    expect(offerResult(o, T + 30)).toEqual([
      { memberId: 'a', net: 100 },
      { memberId: 'b', net: -100 },
    ])
    expect(checkMark(o, 'a', 'taker')).toBe(AGREED)
  })
  it('повтор той же отметки ничего не меняет', () => {
    const once = accepted([mark('a', 'author', T + 20)])
    const twice = accepted([mark('a', 'author', T + 20), mark('a', 'author', EXPECT + DAY)])
    expect(checkMark(once, 'a', 'author')).toBeNull()
    expect(twice.marks).toEqual(once.marks)
    expect(offerOutcome(twice, EXPECT)).toEqual(offerOutcome(once, EXPECT))
  })
  it('разошлись — решает гарант; гарант решил — окончательный через 7 дней', () => {
    const recs = [mark('a', 'author', T + 20), mark('b', 'taker', T + 30)]
    const o = accepted(recs)
    expect(offerOutcome(o, T + 30)?.phase).toBe('guarantor')
    expect(checkDecide(o, 'c', 'taker', T + 40)).toBe(ONLY_GUARANTOR)
    expect(checkDecide(o, 'h', 'taker', T + 40)).toBeNull()
    const d = accepted([...recs, decide('h', 'taker', T + 40)])
    const out = offerOutcome(d, T + 40)
    expect(out?.phase).toBe('approved')
    expect(out?.approved).toEqual({ winner: 'taker', at: T + 40, how: 'guarantor', by: 'h' })
    expect(out?.finalAt).toBe(T + 40 + FINAL_TIME)
    expect(offerResult(d, T + 40 + FINAL_TIME - 1)).toEqual([])
    expect(offerOutcome(d, T + 40 + FINAL_TIME)?.phase).toBe('final')
    expect(offerResult(d, T + 40 + FINAL_TIME)).toEqual([
      { memberId: 'a', net: -300 },
      { memberId: 'b', net: 300 },
    ])
    expect(checkMark(d, 'a', 'taker')).toBe(DECIDED)
    expect(checkDecide(d, 'h', 'author', T + 50)).toBe(DECIDED)
  })
  it('пока гарант не решил, сторона меняет отметку; сошлись — согласие', () => {
    const o = accepted([mark('a', 'author', T + 20), mark('b', 'taker', T + 30), mark('a', 'taker', T + 40)])
    const out = offerOutcome(o, T + 40)
    expect(out?.phase).toBe('final')
    expect(out?.approved?.how).toBe('agreement')
    expect(out?.approved?.winner).toBe('taker')
  })
  it('отметка раньше «исход к» (Р-27): вторая сторона молчит 3 дня с первой отметки — гарант, не дожидаясь «исход к»', () => {
    const first = T + 20
    expect(first).toBeLessThan(EXPECT)
    const o = accepted([mark('a', 'author', first)])
    expect(offerOutcome(o, first + SIDE_SILENCE - 1)?.phase).toBe('marking')
    expect(checkDecide(o, 'h', 'author', first + SIDE_SILENCE - 1)).toBe(NOT_TURN)
    expect(offerOutcome(o, first + SIDE_SILENCE)).toMatchObject({ phase: 'guarantor', turnAt: first + SIDE_SILENCE })
    expect(checkDecide(o, 'h', 'author', first + SIDE_SILENCE)).toBeNull()
  })
  it('никто не отметил — гарант через 3 дня после «исход к»', () => {
    const o = accepted([])
    expect(offerOutcome(o, EXPECT + SIDE_SILENCE - 1)?.phase).toBe('marking')
    expect(offerOutcome(o, EXPECT + SIDE_SILENCE)).toMatchObject({ phase: 'guarantor', turnAt: EXPECT + SIDE_SILENCE })
  })
  it('отметки сошлись раньше «исход к» — окончательный сразу (Р-06, Р-27)', () => {
    const o = accepted([mark('a', 'author', T + 20), mark('b', 'author', T + 21)])
    expect(T + 21).toBeLessThan(EXPECT)
    expect(offerOutcome(o, T + 21)).toMatchObject({ phase: 'final', approved: { winner: 'author', how: 'agreement', at: T + 21 }, finalAt: T + 21 })
  })
  it('первая отметка позже «исход к» — 3 дня от неё', () => {
    const first = EXPECT + DAY
    const o = accepted([mark('a', 'author', first)])
    expect(offerOutcome(o, first + SIDE_SILENCE - 1)?.phase).toBe('marking')
    expect(offerOutcome(o, first + SIDE_SILENCE)?.turnAt).toBe(first + SIDE_SILENCE)
  })
  it('гарант молчит 3 дня — нужен другой; стороны назвали одного — он гарант, отсчёт заново', () => {
    const turn = T + 30
    const recs = [mark('a', 'author', T + 20), mark('b', 'taker', turn)]
    const lapse = turn + GUARANTOR_SILENCE
    const o = accepted(recs)
    expect(checkNominate(o, 'a', 'g', room, lapse - 1)).toBe(GUARANTOR_PRESENT)
    const out = offerOutcome(o, lapse)
    expect(out?.phase).toBe('need-guarantor')
    expect(out?.needSince).toBe(lapse)
    expect(checkDecide(o, 'h', 'author', lapse)).toBe(GUARANTOR_LAPSED)
    expect(checkNominate(o, 'a', 'b', room, lapse)).toBe(BAD_GUARANTOR)
    expect(checkNominate(o, 'h', 'g', room, lapse)).toBe(NOT_SIDE)
    const half = accepted([...recs, nominate('a', 'g', lapse + 1), nominate('b', 'n', lapse + 2)])
    expect(half.guarantorId).toBe('h')
    expect(offerOutcome(half, lapse + 3)?.nominations).toEqual({ author: 'g', taker: 'n' })
    const set = lapse + 3
    const g = accepted([...recs, nominate('a', 'g', lapse + 1), nominate('b', 'n', lapse + 2), nominate('b', 'g', set)])
    expect(g.guarantorId).toBe('g')
    const after = offerOutcome(g, set)
    expect(after?.phase).toBe('guarantor')
    expect(after?.guarantorUntil).toBe(set + GUARANTOR_SILENCE)
    expect(checkDecide(g, 'h', 'author', set)).toBe(ONLY_GUARANTOR)
    expect(checkDecide(g, 'g', 'author', set + GUARANTOR_SILENCE - 1)).toBeNull()
    expect(offerOutcome(g, set + GUARANTOR_SILENCE)?.phase).toBe('need-guarantor')
  })
  it('гарант отказался — нужен другой сразу', () => {
    const o = accepted([mark('a', 'author', T + 20), mark('b', 'taker', T + 30), act('offer.declined', 'h', T + 40)])
    expect(offerOutcome(o, T + 40)?.phase).toBe('need-guarantor')
    expect(offerOutcome(o, T + 40)?.needSince).toBe(T + 40)
    expect(checkDecline(o, 'h', T + 41)).toBe(GUARANTOR_LAPSED)
    expect(checkDecline(accepted(), 'c', T + 41)).toBe(ONLY_GUARANTOR)
    const n = accepted([
      mark('a', 'author', T + 20),
      mark('b', 'taker', T + 30),
      act('offer.declined', 'h', T + 40),
      nominate('a', 'c', T + 50),
      nominate('b', 'c', T + 60),
    ])
    expect(n.guarantorId).toBe('c')
    expect(n.declinedAt).toBeNull()
    expect(offerOutcome(n, T + 60)?.phase).toBe('guarantor')
  })
  it('итог для «Расчёта» — только окончательное', () => {
    expect(offerResult(accepted([mark('a', 'author', T + 20)]), EXPECT)).toEqual([])
    expect(offerResult(one([created()]), EXPECT)).toEqual([])
  })
})

describe('правило гаранта (Р-31): часы гаранта с «исход к», без общего гаранта — суд', () => {
  const ruled = (more: OfferRecord[] = [], over: Partial<OfferCreated> = {}) =>
    one([created({ guarantorRule: true, ...over }), act('offer.accepted', 'b', T + 10), ...more])
  const drawn = (at: number): OfferRecord => ({ type: 'court.drawn', id: `r${++seq}`, at, memberId: 'h', offer: 'o1' })
  const DECLINED = T + 20
  const DUE = DECLINED + NEED_GUARANTOR_TIME

  it('разошлись до «исход к» — гарант не решает до «исход к», решает с него', () => {
    const apart = [mark('a', 'author', T + 20), mark('b', 'taker', T + 30)]
    const o = ruled(apart)
    expect(o.guarantorRule).toBe(true)
    expect(o.disagreedAt).toBe(T + 30)
    expect(offerOutcome(o, EXPECT - 1)).toMatchObject({ phase: 'marking', turnAt: EXPECT })
    expect(checkDecide(o, 'h', 'author', EXPECT - 1)).toBe(NOT_TURN)
    expect(offerOutcome(o, EXPECT)).toMatchObject({ phase: 'guarantor', turnAt: EXPECT, guarantorUntil: EXPECT + GUARANTOR_SILENCE })
    expect(checkDecide(o, 'h', 'author', EXPECT)).toBeNull()
    // Свёртка: решение гаранта раньше «исход к» не действует, с «исход к» — действует
    expect(ruled([...apart, decide('h', 'author', EXPECT - 1)]).decision).toBeNull()
    expect(ruled([...apart, decide('h', 'author', EXPECT)]).decision).toMatchObject({ winner: 'author', at: EXPECT })
  })

  it('разошлись после «исход к» — решает гарант сразу, как раньше', () => {
    const o = ruled([mark('a', 'author', EXPECT + 20), mark('b', 'taker', EXPECT + 30)])
    expect(offerOutcome(o, EXPECT + 30)).toMatchObject({ phase: 'guarantor', turnAt: EXPECT + 30 })
  })

  it('одна сторона отметила за неделю до срока — гарант с «исход к» + 3 дня', () => {
    const far = T + 8 * DAY
    const first = T + DAY
    const o = ruled([mark('a', 'author', first)], { expectedAt: far })
    expect(far - first).toBe(7 * DAY)
    expect(checkDecide(o, 'h', 'author', first + SIDE_SILENCE)).toBe(NOT_TURN)
    expect(offerOutcome(o, far + SIDE_SILENCE - 1)).toMatchObject({ phase: 'marking', turnAt: far + SIDE_SILENCE })
    expect(offerOutcome(o, far + SIDE_SILENCE)?.phase).toBe('guarantor')
    expect(checkDecide(o, 'h', 'author', far + SIDE_SILENCE)).toBeNull()
  })

  it('отметки совпали до срока — окончательно сразу', () => {
    const o = ruled([mark('a', 'author', T + 20), mark('b', 'author', T + 21)])
    expect(offerOutcome(o, T + 21)).toMatchObject({ phase: 'final', approved: { winner: 'author', how: 'agreement', at: T + 21 }, finalAt: T + 21 })
  })

  it('прежнее пари без пометки — прежние часы и без суда', () => {
    const apart = [mark('a', 'author', T + 20), mark('b', 'taker', T + 30)]
    expect(accepted(apart).guarantorRule).toBe(false)
    expect(offerOutcome(accepted(apart), T + 30)).toMatchObject({ phase: 'guarantor', turnAt: T + 30 })
    expect(offerOutcome(accepted([mark('a', 'author', T + 20)]), T + 20 + SIDE_SILENCE)?.phase).toBe('guarantor')
    const lapsed = accepted([...apart, act('offer.declined', 'h', DECLINED)])
    expect(courtFrom(lapsed, DUE + DAY)).toBeNull()
    expect(courtDue(lapsed, DUE + DAY)).toBe(false)
    // Запись о суде у прежнего пари не действует
    expect(accepted([...apart, act('offer.declined', 'h', DECLINED), drawn(DUE + DAY)]).courtAt).toBeNull()
  })

  it('«нужен гарант» 3 дня — пора суду; суда не собрали (судить некому) — гаранта по-прежнему называют', () => {
    const o = ruled([act('offer.declined', 'h', DECLINED)])
    expect(offerOutcome(o, DECLINED)).toMatchObject({ phase: 'need-guarantor', needSince: DECLINED })
    expect(courtFrom(o, DECLINED)).toBe(DUE)
    expect(courtDue(o, DUE - 1)).toBe(false)
    expect(courtDue(o, DUE)).toBe(true)
    expect(offerOutcome(o, DUE + DAY)?.phase).toBe('need-guarantor')
    expect(checkNominate(o, 'a', 'g', room, DUE + DAY)).toBeNull()
    // Сошлись на гаранте до срока — суду не пора
    const named = ruled([act('offer.declined', 'h', DECLINED), nominate('a', 'g', T + 30), nominate('b', 'g', T + 40)])
    expect(named.guarantorId).toBe('g')
    expect(courtFrom(named, DUE + DAY)).toBeNull()
    // Гарант промолчал 3 дня — нужен другой с этого мига, суд — через 3 дня после
    const silent = ruled([mark('a', 'author', EXPECT), mark('b', 'taker', EXPECT + 1)])
    expect(courtFrom(silent, EXPECT + 1 + GUARANTOR_SILENCE)).toBe(EXPECT + 1 + GUARANTOR_SILENCE + NEED_GUARANTOR_TIME)
    // Не принятое пари суда не ждёт
    expect(courtFrom(one([created({ guarantorRule: true })]), DUE + 100 * DAY)).toBeNull()
  })

  it('суд собран — «ждёт суда»: назвать гаранта, отметить, решить и отказаться — нельзя', () => {
    const recs = [act('offer.declined', 'h', DECLINED), nominate('a', 'g', T + 30), drawn(DUE)]
    const o = ruled(recs)
    expect(o.courtAt).toBe(DUE)
    expect(offerOutcome(o, DUE)).toMatchObject({ phase: 'court', approved: null, finalAt: null, needSince: DECLINED })
    expect(checkNominate(o, 'b', 'g', room, DUE + 1)).toBe(IN_COURT)
    expect(checkMark(o, 'a', 'author')).toBe(IN_COURT)
    expect(checkDecide(o, 'h', 'author', DUE + 1)).toBe(IN_COURT)
    expect(checkDecline(o, 'h', DUE + 1)).toBe(IN_COURT)
    // Свёртка: после сбора назначение и отметки не действуют; вторая запись о суде — тоже
    const late = ruled([...recs, nominate('b', 'g', DUE + 1), mark('a', 'author', DUE + 2), mark('b', 'author', DUE + 3), drawn(DUE + 4)])
    expect(late.guarantorId).toBe('h')
    expect(late.agreed).toBeNull()
    expect(late.courtAt).toBe(DUE)
    // Запись о суде раньше срока не действует
    expect(ruled([act('offer.declined', 'h', DECLINED), drawn(DUE - 1)]).courtAt).toBeNull()
  })
})

describe('пари без гаранта (Р-36): разошлись или молчат — сразу суд', () => {
  const none = (more: OfferRecord[] = [], over: Partial<OfferCreated> = {}) =>
    one([created({ guarantor: null, guarantorRule: true, ...over }), act('offer.accepted', 'b', T + 10), ...more])
  const drawn = (at: number): OfferRecord => ({ type: 'court.drawn', id: `r${++seq}`, at, memberId: 'h', offer: 'o1' })
  const apart = [mark('a', 'author', EXPECT + 20), mark('b', 'taker', EXPECT + 30)]

  it('ввод: «без гаранта» — признак формы; вместе с гарантом или не «да/нет» — отказ', () => {
    const form = { condition: 'Вася подтянется', check: 'Видео', odds: { a: 1, b: 1 }, amount: 100, closesAt: CLOSE, expectedAt: EXPECT }
    const ok = checkOfferInput({ ...form, noGuarantor: true })
    expect(ok.ok && ok.value).toMatchObject({ guarantor: null, noGuarantor: true })
    const plain = checkOfferInput(form)
    expect(plain.ok && 'noGuarantor' in plain.value).toBe(false)
    expect(checkOfferInput({ ...form, noGuarantor: false })).toMatchObject({ ok: true })
    expect(checkOfferInput({ ...form, noGuarantor: true, guarantor: 'g' })).toEqual({ ok: false, error: NO_GUARANTOR_CHOSEN })
    expect(checkOfferInput({ ...form, noGuarantor: 'да' })).toEqual({ ok: false, error: BAD_GUARANTOR })
  })

  it('судить есть кому: адресное — хотя бы один, кроме автора, адресата и предмета; открытое — хотя бы двое', () => {
    const small = { hostId: 'h', members: ['h', 'a', 'b'] }
    // Адресное: h не сторона — судья есть; в комнате из двоих — нет
    expect(offerGuarantor({ to: 'b', guarantor: null, noGuarantor: true }, 'a', small)).toEqual({ ok: true, value: null })
    expect(offerGuarantor({ to: 'b', guarantor: null, noGuarantor: true }, 'a', { hostId: 'a', members: ['a', 'b'] })).toEqual({
      ok: false,
      error: NO_GUARANTOR_JUDGES,
    })
    // Предмет спора не судья: адресное о h в комнате из троих — некому
    expect(offerGuarantor({ to: 'b', guarantor: null, noGuarantor: true, subject: 'h' }, 'a', small)).toEqual({ ok: false, error: NO_GUARANTOR_JUDGES })
    // Открытое: кроме автора — двое (один примет, один судит)
    expect(offerGuarantor({ to: null, guarantor: null, noGuarantor: true }, 'a', small)).toEqual({ ok: true, value: null })
    expect(offerGuarantor({ to: null, guarantor: null, noGuarantor: true, subject: 'h' }, 'a', small)).toEqual({ ok: false, error: NO_GUARANTOR_JUDGES })
    expect(offerGuarantor({ to: null, guarantor: null, noGuarantor: true }, 'a', { hostId: 'a', members: ['a', 'b'] })).toEqual({
      ok: false,
      error: NO_GUARANTOR_JUDGES,
    })
    // Без гаранта ведущий — сторона не мешает: гарант не нужен
    expect(offerGuarantor({ to: 'b', guarantor: null, noGuarantor: true }, 'h', small)).toEqual({ ok: true, value: null })
    expect(offerGuarantor({ to: 'b', guarantor: 'g', noGuarantor: true }, 'a', room)).toEqual({ ok: false, error: NO_GUARANTOR_CHOSEN })
    // Свёртка: запись без гаранта в маленькой комнате не действует
    expect(roomOffers([created({ guarantor: null, to: 'b', subject: 'h', side: 'no' })], small)).toEqual([])
    expect(roomOffers([created({ guarantor: null, to: 'b' })], small)).toHaveLength(1)
  })

  it('пари без гаранта: гаранта нет, принять может любой, кроме автора', () => {
    const o = one([created({ guarantor: null, guarantorRule: true })])
    expect(o.guarantorId).toBeNull()
    expect(checkAccept(o, 'h', room, T + 1)).toBeNull()
    expect(offerInfo(o).guarantorId).toBeNull()
  })

  it('совпали — утверждено согласием и окончательно сразу (Р-06)', () => {
    const o = none([mark('a', 'author', T + 20), mark('b', 'author', T + 21)])
    expect(offerOutcome(o, T + 21)).toMatchObject({
      phase: 'final',
      guarantorId: null,
      approved: { winner: 'author', how: 'agreement', at: T + 21 },
      finalAt: T + 21,
    })
    expect(courtDue(o, T + 100 * DAY)).toBe(false)
  })

  it('разошлись — с мига хода гаранта «ждёт суда»: суд сразу, без часов гаранта', () => {
    const o = none(apart)
    const turn = EXPECT + 30
    expect(offerOutcome(o, turn - 1)).toMatchObject({ phase: 'marking', turnAt: turn, guarantorUntil: null })
    expect(courtDue(o, turn - 1)).toBe(false)
    expect(courtFrom(o, turn)).toBe(turn)
    expect(courtDue(o, turn)).toBe(true)
    // До сбора — «нужен гарант» с мига хода; суд собран — «ждёт суда»
    expect(offerOutcome(o, turn)).toMatchObject({ phase: 'need-guarantor', needSince: turn, guarantorUntil: null })
    const c = none([...apart, drawn(turn)])
    expect(c.courtAt).toBe(turn)
    expect(offerOutcome(c, turn)).toMatchObject({ phase: 'court', guarantorId: null, approved: null, finalAt: null })
    // Решить и отказаться некому; назвать гаранта и отметить — уже нельзя
    expect(checkDecide(c, 'h', 'author', turn)).toBe(NO_GUARANTOR)
    expect(checkDecline(c, 'h', turn)).toBe(NO_GUARANTOR)
    expect(checkNominate(c, 'a', 'g', room, turn + 1)).toBe(IN_COURT)
    expect(checkMark(c, 'a', 'taker')).toBe(IN_COURT)
  })

  it('разошлись до «исход к» — суд с «исход к» (как ход гаранта у правила Р-31)', () => {
    const early = [mark('a', 'author', T + 20), mark('b', 'taker', T + 30)]
    expect(courtFrom(none(early), EXPECT - 1)).toBeNull()
    expect(courtFrom(none(early), EXPECT)).toBe(EXPECT)
  })

  it('вторая сторона молчит — суд через срок молчания пари (обычный — 3 дня, быстрый — 12 ч)', () => {
    const first = EXPECT + DAY
    const o = none([mark('a', 'author', first)])
    expect(courtDue(o, first + SIDE_SILENCE - 1)).toBe(false)
    expect(courtDue(o, first + SIDE_SILENCE)).toBe(true)
    const fast = none([mark('a', 'author', first)], { times: FAST_TIMES })
    expect(courtDue(fast, first + FAST_TIMES.silence - 1)).toBe(false)
    expect(courtFrom(fast, first + FAST_TIMES.silence)).toBe(first + FAST_TIMES.silence)
    // Никто не отметил — срок молчания после «исход к»
    expect(courtFrom(none(), EXPECT + SIDE_SILENCE)).toBe(EXPECT + SIDE_SILENCE)
  })

  it('«Утвердить» и «Отказаться» до хода суда — «У пари нет гаранта»', () => {
    const o = none(apart)
    expect(checkDecide(o, 'h', 'author', EXPECT + 30)).toBe(NO_GUARANTOR)
    expect(checkDecline(o, 'h', EXPECT + 30)).toBe(NO_GUARANTOR)
    // Свёртка: такие записи не действуют
    const d = none([...apart, decide('h', 'author', EXPECT + 40), act('offer.declined', 'h', EXPECT + 41)])
    expect(d.decision).toBeNull()
    expect(d.declinedAt).toBeNull()
  })

  it('суд не собрать — «нужен гарант»: стороны назвали одного — обычный путь с гарантом', () => {
    const turn = EXPECT + 30
    const o = none(apart)
    // Суда нет (судить некому) — гаранта называют; раньше хода — нельзя
    expect(checkNominate(o, 'a', 'g', room, turn - 1)).toBe(GUARANTOR_PRESENT)
    expect(checkNominate(o, 'a', 'g', room, turn + DAY)).toBeNull()
    const set = turn + DAY + 1
    const g = none([...apart, nominate('a', 'g', turn + DAY), nominate('b', 'g', set)])
    expect(g.guarantorId).toBe('g')
    expect(g.guarantorSince).toBe(set)
    expect(offerOutcome(g, set)).toMatchObject({ phase: 'guarantor', guarantorId: 'g', guarantorUntil: set + GUARANTOR_SILENCE, needSince: null })
    // Суду больше не пора; гарант решает — окончательно через срок апелляции
    expect(courtDue(g, set)).toBe(false)
    expect(checkDecide(g, 'g', 'taker', set)).toBeNull()
    const d = none([...apart, nominate('a', 'g', turn + DAY), nominate('b', 'g', set), decide('g', 'taker', set + 1)])
    expect(offerOutcome(d, set + 1 + FINAL_TIME)).toMatchObject({ phase: 'final', approved: { winner: 'taker', how: 'guarantor', by: 'g' } })
    // Названный гарант промолчал — дальше как у правила Р-31: нужен другой, потом суд
    expect(offerOutcome(g, set + GUARANTOR_SILENCE)).toMatchObject({ phase: 'need-guarantor', needSince: set + GUARANTOR_SILENCE })
    expect(courtFrom(g, set + GUARANTOR_SILENCE)).toBe(set + GUARANTOR_SILENCE + NEED_GUARANTOR_TIME)
  })

  it('встречное: гарант — выбор автора встречного; не выбрал — как у исходного', () => {
    const plain = one([created()])
    const no = one([created({ guarantor: null })])
    const terms = { odds: { a: 1, b: 1 }, amount: 100, closesAt: CLOSE }
    expect(counterInput(plain, terms)).toMatchObject({ guarantor: 'h' })
    expect('noGuarantor' in counterInput(plain, terms)).toBe(false)
    expect(counterInput(no, terms)).toMatchObject({ guarantor: null, noGuarantor: true })
    expect(counterInput(plain, { ...terms, noGuarantor: true })).toMatchObject({ guarantor: null, noGuarantor: true })
    expect(counterInput(no, { ...terms, guarantor: 'g' })).toMatchObject({ guarantor: 'g' })
    expect('noGuarantor' in counterInput(no, { ...terms, guarantor: 'g' })).toBe(false)
    // Свёртка: встречное без гаранта к пари с гарантом — действует, если судить есть кому
    const c = roomOffers([created(), created({ id: 'o2', memberId: 'b', to: 'a', side: 'no', counterTo: 'o1', guarantor: null })], room)
    expect(c.find((x) => x.id === 'o2')?.guarantorId).toBeNull()
  })

  it('пари с гарантом — как было: «Утвердить» у гаранта, суд только по Р-31', () => {
    const o = accepted(apart)
    expect(o.guarantorId).toBe('h')
    expect(checkDecide(o, 'h', 'author', EXPECT + 30)).toBeNull()
    expect(courtDue(o, EXPECT + 100 * DAY)).toBe(false)
  })
})

describe('пари из журнала комнаты (Р-22)', () => {
  const base = { at: T - 10 }
  const roomLog: LogEntry[] = [
    { ...base, id: 'r', memberId: 'h', type: 'room.created', roomId: 'R', name: 'Дача', currency: 'RUB' },
    ...['h', 'a', 'b', 'c'].map((m): LogEntry => ({ ...base, id: 'm' + m, memberId: 'h', type: 'member.added', member: m, name: m })),
  ]
  function entry(over: Partial<OfferCreated> = {}): LogEntry {
    const { type: _type, subject, guarantorRule, ...c } = created(over)
    void _type
    // Ни о ком — поля в записи нет, как у пари до выкатки (Р-26); правила гаранта нет — тоже (Р-31)
    return { ...c, ...(subject !== null && { subject }), ...(guarantorRule && { guarantorRule: 1 as const }), type: 'offer.created', requestId: 'q-' + c.id }
  }

  it('записи журнала — записи правил: offer.revoked — это offer.withdrawn', () => {
    const e = entry()
    expect(isOfferEntry(e) && offerRecord(e)).toEqual(created())
    const revoked: LogEntry = { id: 'x', at: T + 5, memberId: 'a', type: 'offer.revoked', offer: 'o1', requestId: 'q' }
    expect(isOfferEntry(revoked) && offerRecord(revoked)).toEqual({ id: 'x', at: T + 5, memberId: 'a', type: 'offer.withdrawn', offer: 'o1' })
    expect(isOfferEntry(roomLog[0])).toBe(false)
  })

  it('logOffers: ведущий и участники — из журнала; отозванное, принятое и закрытое встречным', () => {
    const log: LogEntry[] = [
      ...roomLog,
      entry(),
      entry({ id: 'o2', memberId: 'b', at: T + 1, side: 'no', to: 'a', amount: 600, counterTo: 'o1' }),
      { id: 'y', at: T + 2, memberId: 'a', type: 'offer.accepted', offer: 'o2', requestId: 'q2' },
      entry({ id: 'o3', at: T + 3 }),
      { id: 'z', at: T + 4, memberId: 'a', type: 'offer.revoked', offer: 'o3', requestId: 'q3' },
      // Не участник комнаты — запись не действует
      { id: 'w', at: T + 5, memberId: 'чужой', type: 'offer.accepted', offer: 'o1', requestId: 'q4' },
    ]
    const offers = logOffers(log)
    expect(offers.map((o) => [o.id, offerStatus(o, T + 10)])).toEqual([
      ['o1', 'countered'],
      ['o2', 'accepted'],
      ['o3', 'withdrawn'],
    ])
    expect(logOffers([])).toEqual([])
    expect(roomRoles({ id: 'R', name: 'Дача', currency: 'RUB', hostId: 'h', createdAt: 0, members: [] })).toEqual({ hostId: 'h', members: [] })
  })

  it('вид для ответа: сумма соперника по кэфу, статус на now, кто принял', () => {
    const [o] = logOffers([...roomLog, entry({ odds: { a: 3, b: 1 }, amount: 100 })])
    expect(offerInfo(o)).toEqual({
      id: 'o1',
      at: T,
      authorId: 'a',
      condition: 'Вася подтянется 20 раз',
      check: 'Видео в чате',
      side: 'yes',
      odds: { a: 3, b: 1 },
      amount: 100,
      takerAmount: 33,
      to: null,
      closesAt: CLOSE,
      expectedAt: EXPECT,
      guarantorId: 'h',
      counterTo: null,
      subjectId: null,
      guarantorRule: false,
    })
    expect(offerView(o, T)).toMatchObject({ status: 'open', accepted: null, withdrawnAt: null, closedBy: null, outcome: null })
    expect(offerView(o, CLOSE).status).toBe('expired')
    const [taken] = logOffers([...roomLog, entry(), { id: 'y', at: T + 2, memberId: 'b', type: 'offer.accepted', offer: 'o1', requestId: 'q' }])
    expect(offerView(taken, CLOSE)).toMatchObject({ status: 'accepted', accepted: { by: 'b', at: T + 2 } })
    expect(offerView(taken, CLOSE).outcome).toEqual(offerOutcome(taken, CLOSE))
  })

  it('исход из журнала (Р-23): отметки, отказ гаранта, новый гарант, решение', () => {
    const act = (id: string, at: number, memberId: string) => ({ id, at, memberId, offer: 'o1', requestId: 'q-' + id })
    const records: LogEntry[] = [
      { ...act('m1', T + 20, 'a'), type: 'offer.marked', winner: 'author' },
      { ...act('m2', T + 21, 'b'), type: 'offer.marked', winner: 'taker' },
      { ...act('d0', T + 22, 'h'), type: 'offer.declined' },
      { ...act('n1', T + 23, 'a'), type: 'offer.nominated', guarantor: 'c' },
      { ...act('n2', T + 24, 'b'), type: 'offer.nominated', guarantor: 'c' },
      { ...act('d1', T + 25, 'c'), type: 'offer.decided', winner: 'taker' },
    ]
    expect(records.every(isOfferEntry)).toBe(true)
    expect(records.map((e) => isOfferEntry(e) && offerRecord(e))).toEqual([
      { id: 'm1', at: T + 20, memberId: 'a', offer: 'o1', type: 'offer.marked', winner: 'author' },
      { id: 'm2', at: T + 21, memberId: 'b', offer: 'o1', type: 'offer.marked', winner: 'taker' },
      { id: 'd0', at: T + 22, memberId: 'h', offer: 'o1', type: 'offer.declined' },
      { id: 'n1', at: T + 23, memberId: 'a', offer: 'o1', type: 'offer.nominated', guarantor: 'c' },
      { id: 'n2', at: T + 24, memberId: 'b', offer: 'o1', type: 'offer.nominated', guarantor: 'c' },
      { id: 'd1', at: T + 25, memberId: 'c', offer: 'o1', type: 'offer.decided', winner: 'taker' },
    ])
    const [o] = logOffers([...roomLog, entry(), { id: 'y', at: T + 2, memberId: 'b', type: 'offer.accepted', offer: 'o1', requestId: 'q' }, ...records])
    expect(o.guarantorId).toBe('c')
    expect(offerView(o, T + 30).outcome).toMatchObject({
      phase: 'approved',
      marks: { author: 'author', taker: 'taker' },
      guarantorId: 'c',
      approved: { winner: 'taker', at: T + 25, how: 'guarantor', by: 'c' },
    })
  })

  it('о ком спор (Р-26): поле в записи — в правилах и в ответе; пари без поля — ни о ком', () => {
    const e = entry({ subject: 'a' })
    expect(e).toMatchObject({ subject: 'a' })
    expect(isOfferEntry(e) && offerRecord(e)).toEqual(created({ subject: 'a' }))
    expect('subject' in entry()).toBe(false)
    const [o] = logOffers([...roomLog, e])
    expect(offerInfo(o).subjectId).toBe('a')
    const [old] = logOffers([...roomLog, entry()])
    expect(offerInfo(old).subjectId).toBeNull()
  })

  it('правило гаранта (Р-31): пометка в записи — в правилах и в ответе; суд по «ждёт суда» — запись пари', () => {
    const e = entry({ guarantorRule: true })
    expect(e).toMatchObject({ guarantorRule: 1 })
    expect(isOfferEntry(e) && offerRecord(e)).toEqual(created({ guarantorRule: true }))
    expect('guarantorRule' in entry()).toBe(false)
    const accept: LogEntry = { id: 'y', at: T + 2, memberId: 'b', type: 'offer.accepted', offer: 'o1', requestId: 'q' }
    const declined: LogEntry = { id: 'd', at: T + 3, memberId: 'h', type: 'offer.declined', offer: 'o1', requestId: 'qd' }
    const due = T + 3 + NEED_GUARANTOR_TIME
    const court: LogEntry = { id: 'k', at: due, memberId: 'h', type: 'court.drawn', target: 'o1', seed: 'ab', candidates: ['c'] }
    const [o] = logOffers([...roomLog, e, accept, declined, court])
    expect(offerInfo(o).guarantorRule).toBe(true)
    expect(o.courtAt).toBe(due)
    expect(offerOutcome(o, due)?.phase).toBe('court')
    // Прежнее пари: без пометки, суд по нему не действует
    const [old] = logOffers([...roomLog, entry(), accept, declined, court])
    expect(offerInfo(old).guarantorRule).toBe(false)
    expect(old.courtAt).toBeNull()
  })
})

describe('о ком спор у пари (Р-26)', () => {
  const form = { condition: 'Аня найдёт работу', check: 'Скажет сама', odds: { a: 1, b: 1 }, amount: 100, closesAt: CLOSE, expectedAt: EXPECT }

  it('форма: о ком спор — номер участника или ничего', () => {
    expect(checkOfferInput({ ...form, subject: 'a' })).toMatchObject({ ok: true, value: { subject: 'a' } })
    expect(checkOfferInput({ ...form, subject: null })).toMatchObject({ ok: true, value: { subject: null } })
    for (const subject of ['', 5, {}]) expect(checkOfferInput({ ...form, subject })).toEqual({ ok: false, error: BAD_SUBJECT })
  })

  it('предмет — участник; автор-предмет — только «сбудется»; адресат-предмет — сторона автора только «не сбудется»', () => {
    expect(checkOfferSubject({ subject: null, side: 'no', to: null }, 'a', room)).toBeNull()
    expect(checkOfferSubject({ subject: 'x', side: 'yes', to: null }, 'a', room)).toBe(BAD_SUBJECT)
    expect(checkOfferSubject({ subject: 'a', side: 'yes', to: null }, 'a', room)).toBeNull()
    expect(checkOfferSubject({ subject: 'a', side: 'no', to: null }, 'a', room)).toBe(SUBJECT_AUTHOR_YES)
    expect(checkOfferSubject({ subject: 'b', side: 'no', to: 'b' }, 'a', room)).toBeNull()
    expect(checkOfferSubject({ subject: 'b', side: 'yes', to: 'b' }, 'a', room)).toBe(SUBJECT_ADDRESSEE_NO)
    // Предмет — не сторона и не адресат: сторона автора любая
    expect(checkOfferSubject({ subject: 'c', side: 'no', to: 'b' }, 'a', room)).toBeNull()
    expect(checkOfferSubject({ subject: 'c', side: 'yes', to: null }, 'a', room)).toBeNull()
  })

  it('предмет не гарант: выбран — отказ; ведущий — предмет — гаранта надо выбрать', () => {
    expect(offerGuarantor({ to: null, guarantor: 'c', subject: 'c' }, 'a', room)).toEqual({ ok: false, error: SUBJECT_GUARANTOR })
    expect(offerGuarantor({ to: null, guarantor: null, subject: 'h' }, 'a', room)).toEqual({ ok: false, error: NEED_GUARANTOR_SUBJECT })
    expect(offerGuarantor({ to: null, guarantor: 'g', subject: 'h' }, 'a', room)).toEqual({ ok: true, value: 'g' })
    expect(offerGuarantor({ to: null, guarantor: null, subject: 'c' }, 'a', room)).toEqual({ ok: true, value: 'h' })
  })

  it('новый гарант вместо отказавшегося — не предмет; пари без предмета — как раньше', () => {
    const recs = (subject: string | null) => [
      created({ subject }),
      act('offer.accepted', 'b', T + 10),
      mark('a', 'author', T + 20),
      mark('b', 'taker', T + 30),
      act('offer.declined', 'h', T + 40),
    ]
    const o = one(recs('c'))
    expect(checkNominate(o, 'a', 'c', room, T + 41)).toBe(SUBJECT_GUARANTOR)
    expect(checkNominate(o, 'a', 'g', room, T + 41)).toBeNull()
    // Свёртка: обе стороны назвали предмет — гарант не меняется
    const both = one([...recs('c'), nominate('a', 'c', T + 41), nominate('b', 'c', T + 42)])
    expect(both.guarantorId).toBe('h')
    expect(both.nominations).toEqual({})
    expect(offerOutcome(both, T + 42)?.phase).toBe('need-guarantor')
    // Старое пари без предмета: c — по-прежнему кандидат
    const old = one([...recs(null), nominate('a', 'c', T + 41), nominate('b', 'c', T + 42)])
    expect(old.guarantorId).toBe('c')
  })

  it('принять: предмет — только если автор за «не сбудется»; остальные — как раньше', () => {
    const yes = one([created({ subject: 'b' })])
    expect(checkAccept(yes, 'b', room, T)).toBe(SUBJECT_TAKES)
    expect(checkAccept(yes, 'c', room, T)).toBeNull()
    const no = one([created({ side: 'no', subject: 'b' })])
    expect(checkAccept(no, 'b', room, T)).toBeNull()
    // Свёртка: запись «принял» от предмета при стороне автора «сбудется» не действует
    expect(one([created({ subject: 'b' }), act('offer.accepted', 'b', T + 1)]).accepted).toBeNull()
    expect(one([created({ side: 'no', subject: 'b' }), act('offer.accepted', 'b', T + 1)]).accepted).toEqual({ by: 'b', at: T + 1 })
  })

  it('свёртка: запись пари против правила предмета не действует; пари без предмета — как раньше', () => {
    expect(roomOffers([created({ subject: 'a', side: 'no' })], room)).toEqual([])
    expect(roomOffers([created({ subject: 'h' })], room)).toEqual([]) // гарант — ведущий, он же предмет
    expect(roomOffers([created({ subject: 'b', to: 'b', side: 'yes' })], room)).toEqual([])
    expect(one([created({ subject: 'a' })]).subject).toBe('a')
    expect(one([created(), act('offer.accepted', 'b', T + 1)]).accepted?.by).toBe('b')
  })

  it('встречное — то же правило: о ком спор переходит, предмет — за «сбудется»', () => {
    // Автор — предмет, за «сбудется»; встречное от b — за «не сбудется», адресат — предмет: можно
    const o = one([created({ subject: 'a' })])
    const x = counterInput(o, { odds: { a: 1, b: 1 }, amount: 100, closesAt: CLOSE })
    expect(x).toMatchObject({ side: 'no', to: 'a', subject: 'a' })
    expect(checkOfferSubject(x, 'b', room)).toBeNull()
    const counter = created({ id: 'o2', at: T + 5, memberId: 'b', side: 'no', to: 'a', counterTo: 'o1', subject: 'a' })
    const both = roomOffers([created({ subject: 'a' }), counter, act('offer.accepted', 'a', T + 6, 'o2')], room)
    expect(both.find((y) => y.id === 'o2')?.accepted).toEqual({ by: 'a', at: T + 6 })
    // Предмет — b, автор за «сбудется»: встречное b было бы против себя — отказ
    expect(checkCounter(one([created({ subject: 'b' })]), 'b', room, T)).toBe(SUBJECT_TAKES)
    expect(checkCounter(one([created({ side: 'no', subject: 'b' })]), 'b', room, T)).toBeNull()
  })

  it('пометка: предмет — сторона пари (автор или принявший)', () => {
    const view = (subjectId: string | null, accepted: { by: string } | null = null) => ({ subjectId, authorId: 'a', accepted })
    expect(subjectIsSide(view(null))).toBe(false)
    expect(subjectIsSide(view('a'))).toBe(true)
    expect(subjectIsSide(view('b'))).toBe(false)
    expect(subjectIsSide(view('b', { by: 'b' }))).toBe(true)
    expect(subjectIsSide(view('c', { by: 'b' }))).toBe(false)
  })
})

describe('сроки пари — из записи (темп комнаты, Р-35)', () => {
  const HOUR = 60 * 60 * 1000
  const CUSTOM: Times = { objection: 6 * HOUR, appeal: 3 * DAY, silence: 2 * DAY, court: 5 * DAY }
  const SETS: [string, Times][] = [
    ['быстрый', FAST_TIMES],
    ['свой', CUSTOM],
  ]

  it('запись без times — обычный набор', () => {
    const o = accepted([mark('a', 'author', T + 20), mark('b', 'taker', T + 30), decide('h', 'taker', T + 40)])
    expect(o.times).toBeUndefined()
    expect(offerOutcome(o, T + 40)?.finalAt).toBe(T + 40 + NORMAL_TIMES.appeal)
    expect(offerOutcome(accepted(), EXPECT)?.turnAt).toBe(EXPECT + NORMAL_TIMES.silence)
  })

  it('сроки — поле записи журнала: в правилах есть, в ответе — нет', () => {
    const { type: _type, subject: _subject, guarantorRule: _rule, ...c } = created({ times: FAST_TIMES })
    void _type
    void _subject
    void _rule
    const e: LogEntry = { ...c, type: 'offer.created', requestId: 'q' }
    expect(isOfferEntry(e) && offerRecord(e)).toEqual(created({ times: FAST_TIMES }))
    const roomLog: LogEntry[] = [
      { id: 'r', at: 0, memberId: 'h', type: 'room.created', roomId: 'R', name: 'Дача', currency: 'RUB' },
      ...['h', 'a', 'b'].map((m): LogEntry => ({ id: 'm' + m, at: 0, memberId: 'h', type: 'member.added', member: m, name: m })),
    ]
    const [o] = logOffers([...roomLog, e])
    expect(o.times).toEqual(FAST_TIMES)
    expect('times' in offerInfo(o)).toBe(false)
  })

  for (const [name, t] of SETS) {
    describe(name, () => {
      const timed = (more: OfferRecord[] = [], over: Partial<OfferCreated> = {}) =>
        one([created({ times: t, ...over }), act('offer.accepted', 'b', T + 10), ...more])

      it('сроки закреплены в пари', () => {
        expect(timed().times).toEqual(t)
      })

      it('молчание второй стороны — срок молчания с первой отметки', () => {
        const first = T + 20
        const o = timed([mark('a', 'author', first)])
        expect(offerOutcome(o, first + t.silence - 1)?.phase).toBe('marking')
        expect(checkDecide(o, 'h', 'author', first + t.silence - 1)).toBe(NOT_TURN)
        expect(offerOutcome(o, first + t.silence)).toMatchObject({ phase: 'guarantor', turnAt: first + t.silence })
        // Никто не отметил — срок молчания после «исход к»
        expect(offerOutcome(timed(), EXPECT + t.silence - 1)?.phase).toBe('marking')
        expect(offerOutcome(timed(), EXPECT + t.silence)?.phase).toBe('guarantor')
      })

      it('правило гаранта: молчание — с max(первая отметка, «исход к»)', () => {
        const o = timed([mark('a', 'author', T + 20)], { guarantorRule: true })
        expect(offerOutcome(o, EXPECT + t.silence - 1)).toMatchObject({ phase: 'marking', turnAt: EXPECT + t.silence })
        expect(offerOutcome(o, EXPECT + t.silence)?.phase).toBe('guarantor')
      })

      it('часы гаранта — срок молчания; не решил — нужен другой', () => {
        const turn = T + 30
        const o = timed([mark('a', 'author', T + 20), mark('b', 'taker', turn)])
        expect(offerOutcome(o, turn)).toMatchObject({ phase: 'guarantor', guarantorUntil: turn + t.silence })
        expect(checkDecide(o, 'h', 'author', turn + t.silence - 1)).toBeNull()
        expect(offerOutcome(o, turn + t.silence)).toMatchObject({ phase: 'need-guarantor', needSince: turn + t.silence })
        expect(checkDecide(o, 'h', 'author', turn + t.silence)).toBe(GUARANTOR_LAPSED)
      })

      it('«нужен другой гарант» — срок молчания до суда', () => {
        const declined = T + 20
        const o = timed([act('offer.declined', 'h', declined)], { guarantorRule: true })
        expect(courtFrom(o, declined)).toBe(declined + t.silence)
        expect(courtDue(o, declined + t.silence - 1)).toBe(false)
        expect(courtDue(o, declined + t.silence)).toBe(true)
      })

      it('решение гаранта окончательно через срок апелляции', () => {
        const d = timed([mark('a', 'author', T + 20), mark('b', 'taker', T + 30), decide('h', 'taker', T + 40)])
        expect(offerOutcome(d, T + 40)).toMatchObject({ phase: 'approved', finalAt: T + 40 + t.appeal })
        expect(offerOutcome(d, T + 40 + t.appeal - 1)?.phase).toBe('approved')
        expect(offerResult(d, T + 40 + t.appeal - 1)).toEqual([])
        expect(offerOutcome(d, T + 40 + t.appeal)?.phase).toBe('final')
        expect(offerResult(d, T + 40 + t.appeal)).toHaveLength(2)
      })
    })
  }
})

describe('«Торг до …» (Р-37)', () => {
  const MIN = 60 * 1000
  const END = T + 60 * MIN // исходный конец торга
  const CAP = END + AUCTION_EXTEND_MAX
  // Торг автора a: 300 на «сбудется», старт 1000, шаг 100, гарант — ведущий
  const auc = (over: Partial<OfferCreated> = {}) =>
    created({ auction: { start: 1000, step: 100 }, odds: { a: 300, b: 1000 }, closesAt: END, ...over })
  const bid = (memberId: string, amount: number, at: number, offer = 'o1'): OfferRecord => ({ type: 'offer.bid', id: `r${++seq}`, at, memberId, offer, amount })
  const take = (memberId: string, at: number): OfferRecord => ({ type: 'offer.bid-accepted', id: `r${++seq}`, at, memberId, offer: 'o1' })
  const form = {
    condition: 'Вася подтянется 20 раз',
    check: 'Видео в чате',
    amount: 300,
    closesAt: END,
    expectedAt: EXPECT,
    auction: { start: 1000, step: 100 },
  }

  describe('создание', () => {
    it('форма торга: сторона, сумма автора, старт и шаг; кэф не задают', () => {
      expect(checkOfferInput(form)).toMatchObject({
        ok: true,
        value: { side: 'yes', amount: 300, odds: { a: 300, b: 1000 }, to: null, auction: { start: 1000, step: 100 } },
      })
      // Шаг не задан — 10 % старта, не меньше одной единицы
      expect(checkOfferInput({ ...form, auction: { start: 1005 } })).toMatchObject({ ok: true, value: { auction: { start: 1005, step: 100 } } })
      expect(checkOfferInput({ ...form, auction: { start: 5, step: null } })).toMatchObject({ ok: true, value: { auction: { step: 1 } } })
      expect(auctionStep(1000)).toBe(100)
      expect(auctionStep(9)).toBe(1)
      // Обычное пари — без поля торга и с кэфом, как раньше
      const { auction: _a, ...plain } = form
      void _a
      expect(checkOfferInput(plain)).toEqual({ ok: false, error: BAD_ODDS })
      expect('auction' in (checkOfferInput({ ...plain, odds: { a: 3, b: 1 } }) as { value: object }).value).toBe(false)
    })

    it('отказы формы торга', () => {
      expect(checkOfferInput({ ...form, to: 'b' })).toEqual({ ok: false, error: AUCTION_ADDRESSED })
      for (const start of [0, -1, 1.5, '1000', undefined]) {
        expect(checkOfferInput({ ...form, auction: { start, step: 100 } })).toEqual({ ok: false, error: BAD_START })
      }
      expect(checkOfferInput({ ...form, auction: 5 })).toEqual({ ok: false, error: BAD_START })
      for (const step of [0, 2.5, 'шаг']) {
        expect(checkOfferInput({ ...form, auction: { start: 1000, step } })).toEqual({ ok: false, error: BAD_STEP })
      }
      expect(checkOfferInput({ ...form, amount: 0 })).toEqual({ ok: false, error: BAD_AMOUNT })
    })

    it('конец торга — от 10 минут до 3 дней с создания, «исход к» — не раньше конца + 30 минут', () => {
      const terms = { start: 1000, step: 100 }
      const at = (closesAt: number, expectedAt = closesAt + AUCTION_EXTEND_MAX) => checkOfferTimes({ closesAt, expectedAt, auction: terms }, T)
      expect(at(T + AUCTION_MIN)).toBeNull()
      expect(at(T + AUCTION_MIN - 1)).toBe(AUCTION_SHORT)
      expect(at(T + AUCTION_MAX)).toBeNull()
      expect(at(T + AUCTION_MAX + 1)).toBe(AUCTION_LONG)
      expect(at(END, END + AUCTION_EXTEND_MAX - 1)).toBe(AUCTION_EXPECTED)
      // Свёртка проверяет те же сроки на время записи
      expect(roomOffers([auc({ closesAt: T + AUCTION_MIN - 1 })], room)).toEqual([])
      expect(roomOffers([auc({ expectedAt: CAP - 1 })], room)).toEqual([])
    })

    it('запись торга: только открытое, не встречное, кэф — стартовый', () => {
      expect(one([auc()])?.auction).toEqual({ start: 1000, step: 100, endsAt: END, bids: [], taken: null })
      expect(roomOffers([auc({ to: 'b' })], room)).toEqual([])
      expect(roomOffers([auc({ odds: { a: 3, b: 1 } })], room)).toEqual([])
      expect(roomOffers([auc({ auction: { start: 1000, step: 0 } })], room)).toEqual([])
      const counter = auc({ id: 'o2', at: T + 5, memberId: 'b', side: 'no', counterTo: 'o1' })
      expect(roomOffers([created(), counter], room).map((o) => o.id)).toEqual(['o1'])
    })

    it('гарант — как у обычного: выбранный, ведущий или «без гаранта»', () => {
      expect(one([auc({ guarantor: 'g' })]).guarantorId).toBe('g')
      expect(one([auc()]).guarantorId).toBe('h')
      expect(one([auc({ guarantor: null })]).guarantorId).toBeNull()
    })
  })

  describe('встречные', () => {
    it('первое — не меньше старта, следующее — больше лучшего хотя бы на шаг', () => {
      const o0 = one([auc()])
      expect(checkBid(o0, 'b', 999, room, T + 10)).toBe(BID_LOW)
      expect(checkBid(o0, 'b', 1000, room, T + 10)).toBeNull()
      const o1 = one([auc(), bid('b', 1000, T + 10)])
      expect(checkBid(o1, 'c', 1099, room, T + 20)).toBe(BID_STEP)
      expect(checkBid(o1, 'c', 1100, room, T + 20)).toBeNull()
      // Свою перебить можно: перебитое — свободно
      expect(checkBid(o1, 'b', 1100, room, T + 20)).toBeNull()
    })

    it('не ставят автор, гарант, предмет спора не на своей стороне, не участник; сумма — целое > 0', () => {
      const o = one([auc()])
      expect(checkBid(o, 'a', 1000, room, T + 10)).toBe(OWN_BID)
      expect(checkBid(o, 'h', 1000, room, T + 10)).toBe(GUARANTOR_BIDS)
      expect(checkBid(o, 'x', 1000, room, T + 10)).toBe(NOT_MEMBER)
      for (const amount of [0, 1.5, '1000', null]) expect(checkBid(o, 'b', amount, room, T + 10)).toBe(BAD_BID)
      // Предмет спора — b: автор за «сбудется» — b не торгуется; автор за «не сбудется» — можно
      expect(checkBid(one([auc({ subject: 'b' })]), 'b', 1000, room, T + 10)).toBe(SUBJECT_BIDS)
      expect(checkBid(one([auc({ side: 'no', subject: 'b' })]), 'b', 1000, room, T + 10)).toBeNull()
      // Без гаранта ведущий торгуется, как любой участник
      expect(checkBid(one([auc({ guarantor: null })]), 'h', 1000, room, T + 10)).toBeNull()
      // У обычного пари встречных в торге нет
      expect(checkBid(one([created()]), 'b', 1000, room, T + 10)).toBe(NOT_AUCTION)
    })

    it('свёртка: действует только разрешённое встречное, лучшее — последнее', () => {
      const o = one([auc(), bid('b', 900, T + 10), bid('b', 1000, T + 11), bid('c', 1050, T + 12), bid('c', 1200, T + 13), bid('a', 5000, T + 14)])
      expect(o.auction?.bids.map((b) => [b.by, b.amount])).toEqual([
        ['b', 1000],
        ['c', 1200],
      ])
      expect(biddingView(o, T + 20)).toMatchObject({ best: { by: 'c', amount: 1200, at: T + 13 }, endsAt: END, result: null })
      expect(offerInfo(o)).toMatchObject({ takerAmount: 1200, odds: { a: 300, b: 1200 }, auction: { start: 1000, step: 100, latestEnd: CAP } })
      expect(offerStatus(o, T + 20)).toBe('open')
    })

    it('обычные «принять» и «встречное пари» к торгу — отказ, записи не действуют', () => {
      const o = one([auc()])
      expect(checkAccept(o, 'b', room, T + 10)).toBe(AUCTION_ACCEPT)
      expect(checkCounter(o, 'b', room, T + 10)).toBe(AUCTION_COUNTER)
      expect(one([auc(), act('offer.accepted', 'b', T + 10)]).accepted).toBeNull()
    })
  })

  describe('продление', () => {
    it('встречное за 2 минуты до конца переносит конец на 2 минуты после него', () => {
      expect(one([auc(), bid('b', 1000, END - AUCTION_EXTEND - 1)]).auction?.endsAt).toBe(END)
      expect(one([auc(), bid('b', 1000, END - AUCTION_EXTEND)]).auction?.endsAt).toBe(END)
      expect(one([auc(), bid('b', 1000, END - MIN)]).auction?.endsAt).toBe(END + MIN)
      const late = one([auc(), bid('b', 1000, END - 1)])
      expect(late.auction?.endsAt).toBe(END - 1 + AUCTION_EXTEND)
      // Продлённый торг идёт после исходного конца
      expect(offerStatus(late, END + MIN)).toBe('open')
      expect(checkBid(late, 'c', 1100, room, END + MIN)).toBeNull()
      expect(offerStatus(late, END - 1 + AUCTION_EXTEND)).toBe('accepted')
    })

    it('не дальше исходного конца + 30 минут', () => {
      const recs: OfferRecord[] = [auc()]
      let at = END - 1000
      for (let i = 0; i < 20; i++) {
        recs.push(bid(i % 2 ? 'c' : 'b', 1000 + i * 100, at))
        at = (one(recs).auction?.endsAt as number) - 1000
      }
      const o = one(recs)
      expect(o.auction?.bids).toHaveLength(20)
      expect(o.auction?.endsAt).toBe(CAP)
      expect(offerStatus(o, CAP - 1)).toBe('open')
      expect(checkBid(o, 'b', 5000, room, CAP)).toBe(AUCTION_OVER)
      expect(one([...recs, bid('b', 5000, CAP)]).auction?.bids).toHaveLength(20)
      expect(offerView(o, CAP).bidding?.result).toEqual({ how: 'end', at: CAP, bid: o.auction?.bids[19].id })
    })
  })

  describe('«принять сейчас»', () => {
    it('автор принимает лучшее в любой миг торга — торг закончен, лучший — соперник', () => {
      const recs = [auc(), bid('b', 1000, T + 10), bid('c', 1500, T + 20)]
      const o = one(recs)
      expect(checkTakeBid(o, 'b', T + 30)).toBe(ONLY_AUTHOR_TAKES)
      expect(checkTakeBid(o, 'a', T + 30)).toBeNull()
      const taken = one([...recs, take('a', T + 30)])
      expect(taken.accepted).toEqual({ by: 'c', at: T + 30 })
      expect(taken.auction?.taken).toBe('now')
      expect(offerStatus(taken, T + 31)).toBe('accepted')
      expect(offerView(taken, T + 31).bidding?.result).toEqual({ how: 'now', at: T + 30, bid: taken.auction?.bids[1].id })
      // После — ни встречного, ни второго «принять сейчас»
      expect(checkBid(taken, 'b', 2000, room, T + 40)).toBe(AUCTION_OVER)
      expect(checkTakeBid(taken, 'a', T + 40)).toBe(AUCTION_OVER)
      expect(one([...recs, take('a', T + 30), bid('b', 2000, T + 40)]).auction?.bids).toHaveLength(2)
    })

    it('без встречных принимать нечего; после конца — поздно', () => {
      expect(checkTakeBid(one([auc()]), 'a', T + 10)).toBe(NO_BIDS)
      expect(checkTakeBid(one([auc()]), 'a', END)).toBe(AUCTION_OVER)
      expect(checkTakeBid(one([auc(), bid('b', 1000, T + 10)]), 'a', END)).toBe(AUCTION_OVER)
      expect(checkTakeBid(one([created()]), 'a', T + 10)).toBe(NOT_AUCTION)
      expect(one([auc(), take('a', T + 10)]).accepted).toBeNull()
    })
  })

  describe('конец торга', () => {
    it('со встречным: лучшее принято в миг конца, без записи', () => {
      const o = one([auc(), bid('b', 1000, T + 10), bid('c', 1200, T + 20)])
      expect(o.accepted).toBeNull()
      expect(offerAt(o, END - 1)).toBe(o)
      expect(offerAt(o, END).accepted).toEqual({ by: 'c', at: END })
      expect(offerStatus(o, END)).toBe('accepted')
      const view = offerView(o, END)
      expect(view).toMatchObject({ status: 'accepted', accepted: { by: 'c', at: END }, takerAmount: 1200 })
      expect(view.bidding?.result).toEqual({ how: 'end', at: END, bid: o.auction?.bids[1].id })
      expect(view.outcome?.phase).toBe('marking')
      expect(isOfferView(view)).toBe(true)
      // Встречное в миг конца уже не действует
      expect(checkBid(o, 'b', 1300, room, END)).toBe(AUCTION_OVER)
      expect(one([auc(), bid('b', 1000, T + 10), bid('c', 1200, END)]).auction?.bids).toHaveLength(1)
    })

    it('дальше — обычное пари: отметки сторон, гарант, итог', () => {
      const recs = [auc(), bid('c', 1200, T + 20), mark('a', 'author', END + 10), mark('c', 'taker', END + 20)]
      const o = one(recs)
      // Свёртка приняла торг перед первой записью после конца
      expect(o.accepted).toEqual({ by: 'c', at: END })
      // Отметки разошлись — решает гарант
      expect(offerOutcome(o, END + 20)?.phase).toBe('guarantor')
      const decided = one([...recs, decide('h', 'taker', END + 30)])
      expect(offerOutcome(decided, END + 30)?.approved).toMatchObject({ winner: 'taker', how: 'guarantor' })
      expect(offerResult(decided, END + 30 + FINAL_TIME)).toEqual([
        { memberId: 'a', net: -300 },
        { memberId: 'c', net: 300 },
      ])
      // До конца торга сторона — только автор; отметка не действует
      expect(checkMark(one([auc(), bid('c', 1200, T + 20)]), 'c', 'taker')).toBe(MARK_EARLY)
      expect(one([auc(), bid('c', 1200, T + 20), mark('c', 'taker', T + 30)]).marks).toEqual([])
    })

    it('без встречных — «не состоялось»: никто никому не должен', () => {
      const o = one([auc()])
      expect(offerStatus(o, END - 1)).toBe('open')
      expect(offerStatus(o, END)).toBe('failed')
      const view = offerView(o, END)
      expect(view).toMatchObject({ status: 'failed', accepted: null, outcome: null, takerAmount: 1000 })
      expect(view.bidding).toEqual({ bids: [], best: null, endsAt: END, result: { how: 'failed', at: END } })
      expect(isOfferView(view)).toBe(true)
      expect(offerResult(o, END + DAY)).toEqual([])
      expect(checkBid(o, 'b', 1000, room, END)).toBe(AUCTION_OVER)
    })

    it('торг с «без гаранта»: разошлись — сразу суд', () => {
      const o = one([
        auc({ guarantor: null, guarantorRule: true }),
        bid('h', 1000, T + 10),
        mark('a', 'author', EXPECT + 10),
        mark('h', 'taker', EXPECT + 20),
      ])
      expect(o.accepted).toEqual({ by: 'h', at: END })
      expect(offerOutcome(o, EXPECT + 20)).toMatchObject({ phase: 'need-guarantor', guarantorId: null, turnAt: EXPECT + 20 })
      expect(courtDue(o, EXPECT + 20)).toBe(true)
      // Совпали — окончательно сразу
      const agreed = one([auc({ guarantor: null }), bid('h', 1000, T + 10), mark('a', 'taker', END + 1), mark('h', 'taker', END + 2)])
      expect(offerResult(agreed, END + 2)).toEqual([
        { memberId: 'a', net: -300 },
        { memberId: 'h', net: 300 },
      ])
    })
  })

  describe('отзыв', () => {
    it('автор — только пока нет ни одного встречного', () => {
      expect(checkWithdraw(one([auc()]), 'a')).toBeNull()
      expect(checkWithdraw(one([auc()]), 'b')).toBe(ONLY_AUTHOR)
      expect(checkWithdraw(one([auc(), bid('b', 1000, T + 10)]), 'a')).toBe(AUCTION_HAS_BIDS)
      const withdrawn = one([auc(), act('offer.withdrawn', 'a', T + 5), bid('b', 1000, T + 10)])
      expect(withdrawn.withdrawnAt).toBe(T + 5)
      expect(withdrawn.auction?.bids).toEqual([])
      expect(checkBid(withdrawn, 'b', 1000, room, T + 10)).toBe(WITHDRAWN)
      expect(offerStatus(withdrawn, END)).toBe('withdrawn')
      expect(offerView(withdrawn, END).bidding?.result).toBeNull()
      expect(one([auc(), bid('b', 1000, T + 10), act('offer.withdrawn', 'a', T + 20)]).withdrawnAt).toBeNull()
    })
  })

  describe('суммы — не кэф', () => {
    it('40 000 против 300: суммы автора и принятого встречного, предел кэфа не действует', () => {
      const o = one([auc(), bid('b', 40_000, T + 10), mark('a', 'author', END + 1), mark('b', 'author', END + 2)])
      expect(offerAmounts(o)).toEqual({ ok: true, value: { author: 300, taker: 40_000, bank: 40_300, exact: true } })
      expect(offerInfo(o)).toMatchObject({ amount: 300, takerAmount: 40_000, odds: { a: 300, b: 40_000 } })
      expect(offerResult(o, END + 2)).toEqual([
        { memberId: 'a', net: 40_000 },
        { memberId: 'b', net: -40_000 },
      ])
      // Без встречных — старт
      expect(offerAmounts(one([auc()]))).toMatchObject({ ok: true, value: { taker: 1000, bank: 1300 } })
    })
  })

  describe('журнал комнаты', () => {
    it('offer.bid и offer.bid-accepted — записи пари; торг — поле offer.created', () => {
      const roomLog: LogEntry[] = [
        { id: 'r', at: 0, memberId: 'h', type: 'room.created', roomId: 'R', name: 'Дача', currency: 'RUB' },
        ...['h', 'a', 'b', 'c'].map((m): LogEntry => ({ id: 'm' + m, at: 0, memberId: 'h', type: 'member.added', member: m, name: m })),
      ]
      const { type: _t, subject: _s, guarantorRule: _g, ...c } = auc()
      void _t
      void _s
      void _g
      const e: LogEntry = { ...c, type: 'offer.created', requestId: 'q' }
      expect(isOfferEntry(e) && offerRecord(e)).toEqual(auc())
      const b1: LogEntry = { id: 'b1', at: T + 10, memberId: 'b', type: 'offer.bid', offer: 'o1', amount: 1000, requestId: 'q1' }
      const b2: LogEntry = { id: 'b2', at: T + 20, memberId: 'c', type: 'offer.bid', offer: 'o1', amount: 1100, requestId: 'q2' }
      const t: LogEntry = { id: 't', at: T + 30, memberId: 'a', type: 'offer.bid-accepted', offer: 'o1', requestId: 'q3' }
      expect([b1, b2, t].every(isOfferEntry)).toBe(true)
      expect(offerRecord(b1 as Extract<LogEntry, { type: 'offer.bid' }>)).toEqual({ type: 'offer.bid', id: 'b1', at: T + 10, memberId: 'b', offer: 'o1', amount: 1000 })
      const [o] = logOffers([...roomLog, e, b1, b2, t])
      expect(o.accepted).toEqual({ by: 'c', at: T + 30 })
      expect(o.auction?.bids.map((x) => x.id)).toEqual(['b1', 'b2'])
      // У обычного пари поля торга нет ни в правилах, ни в ответе
      expect('auction' in one([created()])).toBe(false)
      expect('auction' in offerInfo(one([created()]))).toBe(false)
      expect('bidding' in offerView(one([created()]), T)).toBe(false)
    })

    it('ответ торга проходит проверку протокола; кривой — нет', () => {
      const view = offerView(one([auc(), bid('b', 1000, T + 10)]), T + 20)
      expect(isOfferView(view)).toBe(true)
      expect(isOfferView({ ...view, bidding: { ...view.bidding, endsAt: '1' } })).toBe(false)
      expect(isOfferView({ ...view, bidding: { ...view.bidding, result: { how: 'now', at: 1 } } })).toBe(false)
      expect(isOfferView({ ...view, auction: { start: 1000, step: 100 } })).toBe(false)
    })
  })
})
