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
import { LONG_CONDITION, NEED_CHECK, NEED_CONDITION, BAD_AMOUNT } from './event'
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
      value: { ...form, condition: 'Вася подтянется', side: 'yes', to: null, guarantor: null },
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
  it('одна сторона молчит 3 дня после «исход к» — гарант', () => {
    const o = accepted([mark('a', 'author', T + 20)])
    expect(offerOutcome(o, EXPECT + SIDE_SILENCE - 1)?.phase).toBe('marking')
    expect(checkDecide(o, 'h', 'author', EXPECT + SIDE_SILENCE - 1)).toBe(NOT_TURN)
    expect(offerOutcome(o, EXPECT + SIDE_SILENCE)?.phase).toBe('guarantor')
    expect(checkDecide(o, 'h', 'author', EXPECT + SIDE_SILENCE)).toBeNull()
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

describe('пари из журнала комнаты (Р-22)', () => {
  const base = { at: T - 10 }
  const roomLog: LogEntry[] = [
    { ...base, id: 'r', memberId: 'h', type: 'room.created', roomId: 'R', name: 'Дача', currency: 'RUB' },
    ...['h', 'a', 'b', 'c'].map((m): LogEntry => ({ ...base, id: 'm' + m, memberId: 'h', type: 'member.added', member: m, name: m })),
  ]
  function entry(over: Partial<OfferCreated> = {}): LogEntry {
    const { type: _type, ...c } = created(over)
    void _type
    return { ...c, type: 'offer.created', requestId: 'q-' + c.id }
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
    })
    expect(offerView(o, T)).toMatchObject({ status: 'open', accepted: null, withdrawnAt: null, closedBy: null })
    expect(offerView(o, CLOSE).status).toBe('expired')
    const [taken] = logOffers([...roomLog, entry(), { id: 'y', at: T + 2, memberId: 'b', type: 'offer.accepted', offer: 'o1', requestId: 'q' }])
    expect(offerView(taken, CLOSE)).toMatchObject({ status: 'accepted', accepted: { by: 'b', at: T + 2 } })
  })
})
