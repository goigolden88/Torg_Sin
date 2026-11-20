import { describe, expect, it } from 'vitest'
import type { EventView, OfferStatus, OfferView, OutcomeView } from '../rules/protocol'
import type { SavedRoom } from '../store/db'
import {
  eventItem,
  eventPastAt,
  historyHref,
  historyItems,
  historyLine,
  myResultText,
  offerItem,
  offerPastAt,
  onlyMine,
  type OfferPhaseNow,
} from './historyParts'

const N = ' ' // неразрывный пробел перед знаком валюты
const DAY = 24 * 60 * 60 * 1000

// Аня (A) — ведущая, Боря (B), Вера (V)
const room: SavedRoom = {
  id: 'R1',
  server: 'https://example.test',
  memberId: 'A',
  key: 'k',
  invite: null,
  name: 'Дача',
  currency: 'RUB',
  hostId: 'A',
  createdAt: 0,
  members: [
    { id: 'A', name: 'Аня' },
    { id: 'B', name: 'Боря' },
    { id: 'V', name: 'Вера' },
  ],
  savedAt: 0,
  syncedAt: 0,
}

function outcome(extra: Partial<OutcomeView> = {}): OutcomeView {
  return {
    status: 'proposed',
    proposal: { id: 'P1', at: 100, by: 'A', outcome: 'yes' },
    objectionUntil: 100 + DAY,
    objections: [],
    agreements: [],
    awaiting: [],
    decision: null,
    voters: [],
    votingUntil: null,
    votes: [],
    approved: null,
    finalAt: null,
    void: false,
    payouts: [],
    ...extra,
  }
}

function event(extra: Partial<EventView> = {}): EventView {
  return {
    id: 'E1',
    at: 10,
    authorId: 'A',
    condition: 'В субботу будет дождь',
    check: 'Смотрим в окно',
    outcomes: [
      { id: 'yes', title: 'Да' },
      { id: 'no', title: 'Нет' },
    ],
    closesAt: 50,
    expectedAt: 60,
    subjectId: null,
    subjectRule: false,
    status: 'closed',
    clarifications: [],
    bets: [
      { id: 'b1', memberId: 'A', outcome: 'yes', amount: 30000, at: 20 },
      { id: 'b2', memberId: 'B', outcome: 'no', amount: 10000, at: 21 },
    ],
    cancelled: null,
    refunds: [],
    outcome: null,
    ...extra,
  }
}

const approvedYes = { outcome: 'yes', at: 200, how: 'unopposed' as const, by: null }
const payouts = [
  { memberId: 'A', staked: 30000, payout: 40000, net: 10000 },
  { memberId: 'B', staked: 10000, payout: 0, net: -10000 },
]
const decided = (at: number) => ({ seed: 's', drawnAt: 150, candidates: [], seats: [], decision: { at, majority: true, verdict: 'cancel' as const } })

describe('прошедшее событие', () => {
  it('приём идёт, закрыт без исхода, предложен — не прошедшее', () => {
    expect(eventPastAt(event({ status: 'open' }), 0)).toBeNull()
    expect(eventPastAt(event(), 1000)).toBeNull()
    expect(eventPastAt(event({ outcome: outcome() }), 1000)).toBeNull()
  })

  it('возражение, голосование, «снято», «ждёт суда» — не прошедшее', () => {
    for (const status of ['disputed', 'voting', 'withdrawn', 'court'] as const) {
      expect(eventPastAt(event({ outcome: outcome({ status }) }), 10 * DAY)).toBeNull()
    }
  })

  it('утверждён, идёт неделя апелляции — не прошедшее; неделя прошла между опросами — прошедшее', () => {
    const e = event({ outcome: outcome({ status: 'approved', approved: approvedYes, finalAt: 200 + 7 * DAY, payouts }) })
    expect(eventPastAt(e, 200 + 7 * DAY - 1)).toBeNull()
    expect(eventPastAt(e, 200 + 7 * DAY)).toBe(200 + 7 * DAY)
  })

  it('утверждён, апелляция — суд решает (finalAt нет) — не прошедшее', () => {
    expect(eventPastAt(event({ outcome: outcome({ status: 'approved', approved: approvedYes, finalAt: null }) }), 100 * DAY)).toBeNull()
  })

  it('окончательный — с мига окончательности', () => {
    expect(eventPastAt(event({ outcome: outcome({ status: 'final', approved: approvedYes, finalAt: 900, payouts }) }), 1000)).toBe(900)
  })

  it('отменено — с мига отмены, и до исхода, и после', () => {
    const cancelled = { at: 70, by: 'A', reason: null }
    expect(eventPastAt(event({ status: 'cancelled', cancelled }), 1000)).toBe(70)
    expect(eventPastAt(event({ status: 'cancelled', cancelled, outcome: outcome({ status: 'cancelled' }) }), 1000)).toBe(70)
  })

  it('отменено судом — с мига решения суда', () => {
    expect(eventPastAt(event({ outcome: outcome({ status: 'cancelled', court: decided(600) }) }), 1000)).toBe(600)
  })
})

describe('строка события', () => {
  it('окончательный: исход и мой итог; не ставивший — не участвовал', () => {
    const e = event({ outcome: outcome({ status: 'final', approved: approvedYes, finalAt: 900, payouts }) })
    expect(eventItem(e, 'A', 1000)).toEqual({ kind: 'event', id: 'E1', condition: 'В субботу будет дождь', at: 900, outcome: 'Да', mine: { kind: 'net', amount: 10000, refund: 0 } })
    expect(eventItem(e, 'B', 1000)?.mine).toEqual({ kind: 'net', amount: -10000, refund: 0 })
    expect(eventItem(e, 'V', 1000)?.mine).toEqual({ kind: 'none' })
  })

  it('«без игры» — пометкой у исхода', () => {
    const e = event({ outcome: outcome({ status: 'final', approved: approvedYes, finalAt: 900, void: true }) })
    expect(eventItem(e, 'A', 1000)?.outcome).toBe('Да — без игры')
  })

  it('отменено и отменено судом — возврат моей ставки', () => {
    const cancelled = event({ status: 'cancelled', cancelled: { at: 70, by: 'A', reason: 'дождя не будет' } })
    expect(eventItem(cancelled, 'A', 1000)).toMatchObject({ outcome: 'отменено', mine: { kind: 'net', amount: 0, refund: 30000 } })
    const court = event({ outcome: outcome({ status: 'cancelled', court: decided(600) }) })
    expect(eventItem(court, 'B', 1000)).toMatchObject({ outcome: 'отменено судом', mine: { kind: 'net', amount: 0, refund: 10000 } })
  })

  it('не прошедшее — строки нет', () => {
    expect(eventItem(event({ outcome: outcome({ status: 'voting' }) }), 'A', 1000)).toBeNull()
  })
})

function offer(extra: Partial<OfferView> = {}): OfferView {
  return {
    id: 'O1',
    at: 10,
    authorId: 'A',
    condition: 'Боря подтянется 20 раз',
    check: 'Видео в чат',
    side: 'yes',
    odds: { a: 3, b: 1 },
    amount: 30000,
    takerAmount: 10000,
    to: 'B',
    closesAt: 50,
    expectedAt: 60,
    guarantorId: 'V',
    counterTo: null,
    subjectId: null,
    guarantorRule: true,
    status: 'open',
    accepted: null,
    withdrawnAt: null,
    closedBy: null,
    outcome: null,
    ...extra,
  }
}

const phase = (p: OfferPhaseNow['phase'], extra: Partial<OfferPhaseNow> = {}): OfferPhaseNow => ({ phase: p, finalAt: null, approved: null, ...extra })
const accepted = offer({ status: 'accepted', accepted: { by: 'B', at: 30 } })

describe('прошедшее пари', () => {
  it('открыто — не прошедшее', () => {
    expect(offerPastAt(offer(), 'open', null)).toBeNull()
  })

  it('не состоялось: истекло, отозвано, закрыто встречным', () => {
    expect(offerPastAt(offer(), 'expired', null)).toBe(50)
    expect(offerPastAt(offer({ withdrawnAt: 40 }), 'withdrawn', null)).toBe(40)
    expect(offerPastAt(offer({ closedBy: { offer: 'O2', at: 45 } }), 'countered', null)).toBe(45)
  })

  it('принято: отметки, гарант, нужен гарант, ждёт суда, утверждено — не прошедшее', () => {
    for (const p of ['marking', 'guarantor', 'need-guarantor', 'court', 'approved'] as const) {
      expect(offerPastAt(accepted, 'accepted', phase(p))).toBeNull()
    }
  })

  it('принято, исход ещё не считался — не прошедшее', () => {
    expect(offerPastAt(accepted, 'accepted', null)).toBeNull()
  })

  it('окончательно — с мига окончательности; отменено судом — с решения суда', () => {
    expect(offerPastAt(accepted, 'accepted', phase('final', { finalAt: 700, approved: { winner: 'author', at: 700, how: 'agreement', by: null } }))).toBe(700)
    expect(offerPastAt(accepted, 'accepted', phase('cancelled', { court: decided(800) }))).toBe(800)
  })
})

describe('строка пари', () => {
  const final = (winner: 'author' | 'taker') => phase('final', { finalAt: 700, approved: { winner, at: 700, how: 'agreement', by: null } })

  it('окончательно: «Сбылось» / «Не сбылось» и итог моей стороны', () => {
    expect(offerItem(accepted, 'A', 'accepted', final('author'))).toMatchObject({ outcome: 'Сбылось', mine: { kind: 'net', amount: 10000 } })
    expect(offerItem(accepted, 'B', 'accepted', final('author'))).toMatchObject({ outcome: 'Сбылось', mine: { kind: 'net', amount: -10000 } })
    expect(offerItem(accepted, 'A', 'accepted', final('taker'))).toMatchObject({ outcome: 'Не сбылось', mine: { kind: 'net', amount: -30000 } })
    // Автор — за «не сбудется»: прав автор — не сбылось
    expect(offerItem({ ...accepted, side: 'no' }, 'B', 'accepted', final('author'))?.outcome).toBe('Не сбылось')
    expect(offerItem(accepted, 'V', 'accepted', final('author'))?.mine).toEqual({ kind: 'none' })
  })

  it('отменено судом — возврат моей ставки', () => {
    expect(offerItem(accepted, 'B', 'accepted', phase('cancelled', { court: decided(800) }))).toMatchObject({
      outcome: 'отменено судом',
      mine: { kind: 'net', amount: 0, refund: 10000 },
    })
  })

  it('не состоялось: автору — ноль, остальным — не участвовал', () => {
    const cases: [OfferStatus, Partial<OfferView>, string][] = [
      ['expired', {}, 'не состоялось — истекло'],
      ['withdrawn', { withdrawnAt: 40 }, 'не состоялось — отозвано'],
      ['countered', { closedBy: { offer: 'O2', at: 45 } }, 'не состоялось — закрыто встречным'],
    ]
    for (const [status, extra, text] of cases) {
      expect(offerItem(offer(extra), 'A', status, null)).toMatchObject({ outcome: text, mine: { kind: 'net', amount: 0, refund: 0 } })
      expect(offerItem(offer(extra), 'B', status, null)?.mine).toEqual({ kind: 'none' })
    }
  })

  it('не прошедшее — строки нет', () => {
    expect(offerItem(accepted, 'A', 'accepted', phase('guarantor'))).toBeNull()
    expect(offerItem(offer(), 'A', 'open', null)).toBeNull()
  })
})

describe('«История» комнаты', () => {
  const finalEvent = event({ id: 'E1', outcome: outcome({ status: 'final', approved: approvedYes, finalAt: 900, payouts }) })
  const cancelledEvent = event({ id: 'E2', status: 'cancelled', cancelled: { at: 300, by: 'A', reason: null }, bets: [] })
  const liveEvent = event({ id: 'E3', status: 'open', closesAt: 10 * DAY })
  const withdrawn = offer({ id: 'O1', status: 'withdrawn', withdrawnAt: 500, to: null, authorId: 'B' })
  const open = offer({ id: 'O2', closesAt: 10 * DAY })

  it('только прошедшее, новое сверху', () => {
    const items = historyItems(room, [finalEvent, cancelledEvent, liveEvent], [withdrawn, open], 1000)
    expect(items.map((x) => [x.id, x.at])).toEqual([
      ['E1', 900],
      ['O1', 500],
      ['E2', 300],
    ])
  })

  it('«С моим участием» — только где я ставил или сторона', () => {
    const items = historyItems(room, [finalEvent, cancelledEvent], [withdrawn], 1000)
    expect(onlyMine(items, true).map((x) => x.id)).toEqual(['E1'])
    expect(onlyMine(items, false)).toHaveLength(3)
  })

  it('мой результат словами', () => {
    expect(myResultText({ kind: 'net', amount: 30000, refund: 0 }, 'RUB')).toBe(`+300${N}₽`)
    expect(myResultText({ kind: 'net', amount: -10000, refund: 0 }, 'RUB')).toBe(`−100${N}₽`)
    expect(myResultText({ kind: 'net', amount: 0, refund: 30000 }, 'RUB')).toBe(`0${N}₽ — вернулось 300${N}₽`)
    expect(myResultText({ kind: 'none' }, 'RUB')).toBe('вы не участвовали')
  })

  it('строка в комнате и адрес', () => {
    expect(historyLine(12)).toBe('История · 12')
    expect(historyLine(0)).toBeNull()
    expect(historyHref('R1')).toBe('#/room/R1/history')
  })
})
