import { describe, expect, it } from 'vitest'
import { NORMAL_TIMES } from '../rules/pace'
import type { ChoiceView, CourtView, EventView, LotView, OfferOutcomeView, OfferView, OutcomeView, SettlementView } from '../rules/protocol'
import type { SavedRoom } from '../store/db'
import { balanceTotals, closingSoon, copyNote, deadlineText, freshLine, roomTasks, summaryTasks, type Task } from './summaryParts'

const N = ' ' // неразрывный пробел: между разрядами и перед знаком валюты
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
// «Сейчас» — 28.11.2026 12:00 UTC
const NOW = Date.UTC(2026, 10, 28, 12, 0)
const TZ = 'UTC'

// Комната «Дача»: Аня (A) — ведущая, Боря (B), Вера (V), Гена (G); на устройстве — Аня
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
    { id: 'G', name: 'Гена' },
  ],
  savedAt: 0,
  syncedAt: NOW - 10 * MINUTE,
}

const as = (memberId: string, extra: Partial<SavedRoom> = {}): SavedRoom => ({ ...room, memberId, ...extra })

function outcome(extra: Partial<OutcomeView> = {}): OutcomeView {
  return {
    status: 'proposed',
    proposal: { id: 'P1', at: NOW - HOUR, by: 'A', outcome: 'yes' },
    objectionUntil: NOW + 5 * HOUR,
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

// Событие Ани «В субботу будет дождь»: ставили Аня (Да) и Боря (Нет); приём закрыт, исход ожидался час назад
function event(extra: Partial<EventView> = {}): EventView {
  return {
    id: 'E1',
    at: 0,
    authorId: 'A',
    condition: 'В субботу будет дождь',
    check: 'Смотрим в окно',
    outcomes: [
      { id: 'yes', title: 'Да' },
      { id: 'no', title: 'Нет' },
    ],
    closesAt: NOW - 2 * HOUR,
    expectedAt: NOW - HOUR,
    subjectId: null,
    subjectRule: true,
    status: 'closed',
    clarifications: [],
    bets: [
      { id: 'b1', memberId: 'A', outcome: 'yes', amount: 30000, at: 10 },
      { id: 'b2', memberId: 'B', outcome: 'no', amount: 10000, at: 20 },
    ],
    cancelled: null,
    refunds: [],
    outcome: null,
    ...extra,
  }
}

// Пари Бори Ане «Гена не опоздает на электричку»: Боря 300 ₽ на «сбудется» против 100 ₽, гарант — Вера
function offer(extra: Partial<OfferView> = {}): OfferView {
  return {
    id: 'O1',
    at: 0,
    authorId: 'B',
    condition: 'Гена не опоздает на электричку',
    check: 'Фото на перроне',
    side: 'yes',
    odds: { a: 3, b: 1 },
    amount: 30000,
    takerAmount: 10000,
    to: 'A',
    closesAt: NOW + 3 * HOUR,
    expectedAt: NOW + DAY,
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

function offerOutcome(extra: Partial<OfferOutcomeView> = {}): OfferOutcomeView {
  return {
    phase: 'marking',
    marks: { author: null, taker: null },
    guarantorId: 'V',
    turnAt: NOW + 2 * DAY,
    guarantorUntil: NOW + 5 * DAY,
    needSince: null,
    nominations: {},
    approved: null,
    finalAt: null,
    ...extra,
  }
}

// Принятое пари: Аня приняла, «исход к» прошёл
const accepted = (extra: Partial<OfferView> = {}) =>
  offer({ status: 'accepted', accepted: { by: 'A', at: 10 }, expectedAt: NOW - HOUR, closesAt: NOW - 2 * HOUR, outcome: offerOutcome(), ...extra })

// Лот Бори «Велосипед»: торг кончился, победила Аня за 1 500 ₽
function lot(extra: Partial<LotView> = {}): LotView {
  const bids = extra.bids ?? [{ id: 'l1', at: 10, by: 'A', amount: 150000 }]
  return {
    id: 'L1',
    at: 0,
    sellerId: 'B',
    title: 'Велосипед',
    description: '',
    start: 100000,
    step: 10000,
    closesAt: NOW - HOUR,
    latestEnd: NOW - HOUR,
    endsAt: NOW - HOUR,
    times: { ...NORMAL_TIMES },
    status: 'awaiting',
    bids,
    best: bids[bids.length - 1] ?? null,
    winner: 'A',
    amount: 150000,
    withdrawnAt: null,
    handedAt: null,
    declinedAt: null,
    disputedAt: null,
    disputeFrom: NOW + 3 * DAY,
    silenceUntil: null,
    received: null,
    closedAt: null,
    ...extra,
  }
}

function choice(extra: Partial<ChoiceView> = {}): ChoiceView {
  return {
    id: 'C1',
    at: 0,
    authorId: 'V',
    question: 'Куда едем?',
    recipientId: 'V',
    cashbox: false,
    optionsUntil: NOW - HOUR,
    closesAt: NOW + 2 * HOUR,
    latestEnd: NOW + 3 * HOUR,
    endsAt: NOW + 2 * HOUR,
    status: 'open',
    failed: null,
    options: [
      { id: '1', at: 0, by: 'V', title: 'Ладога', total: 50000 },
      { id: '2', at: 0, by: 'V', title: 'Карелия', total: 0 },
    ],
    stakes: [{ id: 's1', at: 10, by: 'A', option: '1', amount: 50000 }],
    winner: null,
    how: null,
    draw: null,
    debts: [],
    closedAt: null,
    ...extra,
  }
}

const sum0 = { amount: 0, events: 0, offers: 0 }
function settlement(extra: Partial<SettlementView> = {}, balances: Record<string, number> = {}): SettlementView {
  return {
    mode: 'stakes',
    members: room.members.map((m) => ({ memberId: m.id, total: sum0, pending: sum0, inPlay: sum0, sent: 0, received: 0, balance: balances[m.id] ?? 0 })),
    transfers: [],
    suggestions: [],
    ...extra,
  }
}

// Суд: Аня на месте до NOW + 2 дня, ещё не голосовала
function court(extra: Partial<CourtView> = {}): CourtView {
  return {
    seed: 's',
    drawnAt: NOW - DAY,
    candidates: ['A', 'G', 'V'],
    seats: [
      { member: 'A', since: NOW - DAY, until: NOW + 2 * DAY, replaced: null, vote: null },
      { member: 'G', since: NOW - DAY, until: NOW + 2 * DAY, replaced: null, vote: null },
    ],
    decision: null,
    ...extra,
  }
}

const kinds = (tasks: Task[]) => tasks.map((t) => [t.kind, t.id, t.action])

describe('дела: пусто и закрытое', () => {
  it('комнат нет, в комнате ничего нет — дел нет', () => {
    expect(summaryTasks([], NOW)).toEqual([])
    expect(roomTasks(room, NOW)).toEqual([])
  })

  it('старая копия без полей — дел нет', () => {
    expect(roomTasks({ ...room, events: undefined, offers: undefined, settlement: undefined }, NOW)).toEqual([])
  })

  it('решённое и отменённое — не дело: суд решил, голос подан, событие отменено, пари окончательно, лот получен', () => {
    const decided = court({ decision: { at: NOW - HOUR, majority: true, verdict: 'keep' } })
    const voted = court({ seats: [{ member: 'A', since: 0, until: NOW + DAY, replaced: null, vote: { id: 'v', at: 1, by: 'A', verdict: 'keep' } }] })
    const r = {
      ...room,
      events: [
        event({ outcome: outcome({ status: 'approved', court: decided }) }),
        event({ id: 'E2', outcome: outcome({ status: 'approved', court: voted }) }),
        event({ id: 'E3', status: 'cancelled', cancelled: { at: 1, by: 'A', reason: null } }),
      ],
      offers: [accepted({ outcome: offerOutcome({ phase: 'final', approved: { winner: 'author', at: 1, how: 'agreement', by: null } }) })],
      lots: [lot({ status: 'received', received: { at: 1, how: 'mark' }, closedAt: 1 })],
    }
    expect(roomTasks(r, NOW)).toEqual([])
  })
})

describe('голос в суде', () => {
  it('событие, пари и лот — «Голосовать», срок — до конца места', () => {
    const r = {
      ...room,
      events: [event({ outcome: outcome({ status: 'approved', court: court() }) })],
      offers: [accepted({ authorId: 'B', accepted: { by: 'G', at: 1 }, outcome: offerOutcome({ phase: 'court', court: court() }) })],
      lots: [lot({ sellerId: 'B', winner: 'G', status: 'court', court: court() })],
    }
    const tasks = roomTasks(r, NOW)
    expect(kinds(tasks)).toEqual([
      ['court', 'E1', 'Голосовать'],
      ['court', 'O1', 'Голосовать'],
      ['court', 'L1', 'Голосовать'],
    ])
    expect(tasks[0]).toMatchObject({ roomId: 'R1', roomName: 'Дача', title: 'В субботу будет дождь', href: '#/room/R1/event/E1', deadline: NOW + 2 * DAY, overdue: false })
    expect(tasks[1].href).toBe('#/room/R1/offer/O1')
    expect(tasks[2].href).toBe('#/room/R1/lot/L1')
  })

  it('срок места по копии прошёл — дело приглушено, не пропало', () => {
    const r = { ...room, events: [event({ outcome: outcome({ status: 'approved', court: court() }) })] }
    const [t] = roomTasks(r, NOW + 3 * DAY)
    expect(t).toMatchObject({ kind: 'court', overdue: true })
  })
})

describe('«Перевёл» вам', () => {
  const t = { id: 'T1', at: NOW - HOUR, from: 'B', to: 'A', amount: 40000, by: 'sender' as const, status: 'pending' as const, changedAt: NOW - HOUR }

  it('получателю — «Получил / Не получал» в «Расчёте»', () => {
    const [task] = roomTasks({ ...room, settlement: settlement({ transfers: [t] }) }, NOW)
    expect(task).toEqual({
      roomId: 'R1',
      roomName: 'Дача',
      kind: 'transfer',
      id: 'T1',
      title: `Боря → вы, 400${N}₽`,
      text: `Боря отметил(а) «Перевёл» 400${N}₽ — «Получил» или «Не получал»`,
      action: 'Открыть расчёт',
      href: '#/room/R1/settle',
      deadline: null,
      overdue: false,
    })
  })

  it('должнику, подтверждённый, своё «Получил» — не дело', () => {
    expect(roomTasks(as('B', { settlement: settlement({ transfers: [t] }) }), NOW)).toEqual([])
    expect(roomTasks({ ...room, settlement: settlement({ transfers: [{ ...t, status: 'received' }] }) }, NOW)).toEqual([])
    expect(roomTasks({ ...room, settlement: settlement({ transfers: [{ ...t, by: 'receiver' }] }) }, NOW)).toEqual([])
  })
})

describe('пари вам', () => {
  it('адресное, открыто — «Ответить»: принять или встречное, с суммами; срок — приём до', () => {
    const [t] = roomTasks({ ...room, offers: [offer()] }, NOW)
    expect(t).toMatchObject({ kind: 'offer', id: 'O1', action: 'Ответить', deadline: NOW + 3 * HOUR, href: '#/room/R1/offer/O1' })
    expect(t.text).toBe(`Боря предлагает вам пари: Боря ставит 300${N}₽ на „сбудется“, соперник — 100${N}₽ (кэф 3 к 1), банк 400${N}₽ — принять или встречное`)
  })

  it('встречное к вашему пари; торг — «дайте встречное» до конца торга', () => {
    expect(roomTasks({ ...room, offers: [offer({ counterTo: 'O0' })] }, NOW)[0].text).toMatch(/^Боря — встречное к вашему пари: /)
    const auction = offer({
      auction: { start: 10000, step: 1000, latestEnd: NOW + 4 * HOUR },
      bidding: { bids: [], best: null, endsAt: NOW + 3 * HOUR + 10 * MINUTE, result: null },
    })
    const [t] = roomTasks({ ...room, offers: [auction] }, NOW)
    expect(t.text).toMatch(/дайте встречное$/)
    expect(t.deadline).toBe(NOW + 3 * HOUR + 10 * MINUTE)
  })

  it('не вам, открытое всем, принято, истекло, вы гарант, выбыли, комната закрыта — не дело', () => {
    expect(roomTasks(as('G', { offers: [offer()] }), NOW)).toEqual([])
    expect(roomTasks({ ...room, offers: [offer({ to: null })] }, NOW)).toEqual([])
    expect(roomTasks({ ...room, offers: [offer({ status: 'expired' })] }, NOW)).toEqual([])
    expect(roomTasks({ ...room, offers: [offer({ status: 'accepted', accepted: { by: 'A', at: 1 } })] }, NOW)).toEqual([])
    expect(roomTasks({ ...room, offers: [offer({ guarantorId: 'A' })] }, NOW)).toEqual([])
    const dropped = room.members.map((m) => (m.id === 'A' ? { ...m, dropped: true } : m))
    expect(roomTasks({ ...room, members: dropped, offers: [offer()] }, NOW)).toEqual([])
    expect(roomTasks({ ...room, closedAt: NOW - HOUR, offers: [offer()] }, NOW)).toEqual([])
  })

  it('срок приёма по копии прошёл — приглушено', () => {
    expect(roomTasks({ ...room, offers: [offer()] }, NOW + 4 * HOUR)[0].overdue).toBe(true)
  })
})

describe('отметить исход', () => {
  it('пари: сторона без отметки после «исход к» — «Отметить исход» до хода гаранта', () => {
    const [t] = roomTasks({ ...room, offers: [accepted()] }, NOW)
    expect(t).toMatchObject({ kind: 'outcome', id: 'O1', action: 'Отметить исход', deadline: NOW + 2 * DAY })
    // автор — тоже сторона
    expect(roomTasks(as('B', { offers: [accepted()] }), NOW)[0]).toMatchObject({ kind: 'outcome', action: 'Отметить исход' })
  })

  it('пари: «исход к» не наступил, своя отметка есть, не сторона — не дело', () => {
    expect(roomTasks({ ...room, offers: [accepted({ expectedAt: NOW + HOUR })] }, NOW)).toEqual([])
    expect(roomTasks({ ...room, offers: [accepted({ outcome: offerOutcome({ marks: { author: null, taker: 'taker' } }) })] }, NOW)).toEqual([])
    expect(roomTasks(as('G', { offers: [accepted()] }), NOW)).toEqual([])
  })

  it('пари: гарант, ход у него — «Решить» до конца его срока', () => {
    const o = accepted({ outcome: offerOutcome({ phase: 'guarantor', marks: { author: 'author', taker: 'taker' } }) })
    expect(kinds(roomTasks(as('V', { offers: [o] }), NOW))).toEqual([['outcome', 'O1', 'Решить']])
    expect(roomTasks(as('V', { offers: [o] }), NOW)[0].deadline).toBe(NOW + 5 * DAY)
    // ход ещё не у гаранта
    expect(roomTasks(as('V', { offers: [accepted()] }), NOW)).toEqual([])
  })

  it('событие: автор после «исход к» — «Предложить исход», срок — до хода ведущего', () => {
    const e = event({ authorId: 'B' })
    const [t] = roomTasks(as('B', { events: [e] }), NOW)
    expect(t).toMatchObject({ kind: 'outcome', action: 'Предложить исход', deadline: NOW - HOUR + NORMAL_TIMES.silence })
    // до «исход к» — не дело; ведущий, пока автор не молчал срок, — не дело
    expect(roomTasks(as('B', { events: [event({ authorId: 'B', expectedAt: NOW + HOUR })] }), NOW)).toEqual([])
    expect(roomTasks({ ...room, events: [e] }, NOW)).toEqual([])
    // автор молчит срок молчания — предлагает ведущий
    expect(kinds(roomTasks({ ...room, events: [e] }, NOW + NORMAL_TIMES.silence))).toEqual([['outcome', 'E1', 'Предложить исход']])
  })

  it('событие: возражение решает ведущий, который не ставил', () => {
    const e = event({ authorId: 'B', bets: [{ id: 'b', memberId: 'B', outcome: 'yes', amount: 100, at: 1 }, { id: 'c', memberId: 'V', outcome: 'no', amount: 100, at: 2 }], outcome: outcome({ status: 'disputed', proposal: { id: 'P', at: 1, by: 'B', outcome: 'yes' } }) })
    expect(kinds(roomTasks({ ...room, events: [e] }, NOW))).toEqual([['outcome', 'E1', 'Решить']])
    // ведущий ставил — решает голосование, не он
    expect(roomTasks({ ...room, events: [{ ...e, bets: [...e.bets, { id: 'd', memberId: 'A', outcome: 'no', amount: 1, at: 3 }] }] }, NOW)).toEqual([])
  })

  it('событие: голосование по возражению — голосующему без голоса', () => {
    const e = event({ outcome: outcome({ status: 'voting', voters: ['G', 'V'], votingUntil: NOW + DAY, votes: [{ id: 'v', at: 1, by: 'V', outcome: 'no' }] }) })
    expect(roomTasks(as('G', { events: [e] }), NOW)[0]).toMatchObject({ kind: 'vote', action: 'Голосовать', deadline: NOW + DAY })
    expect(roomTasks(as('V', { events: [e] }), NOW)).toEqual([])
  })
})

describe('возражение в свой срок', () => {
  it('ставивший, чьего согласия ждут, — «Ответить» до конца срока возражения', () => {
    const e = event({ outcome: outcome({ awaiting: ['B'] }) })
    const [t] = roomTasks(as('B', { events: [e] }), NOW)
    expect(t).toMatchObject({ kind: 'objection', action: 'Ответить', deadline: NOW + 5 * HOUR, text: 'предложен исход «Да» — согласитесь или возразите' })
    // предложивший и уже согласившийся — не дело
    expect(roomTasks({ ...room, events: [e] }, NOW)).toEqual([])
    expect(roomTasks(as('B', { events: [event({ outcome: outcome({ awaiting: [] }) })] }), NOW)).toEqual([])
  })
})

describe('лот', () => {
  it('продавцу — «Передал» до срока «Не получил»; победителю, когда передано, — «Получил»', () => {
    const [seller] = roomTasks(as('B', { lots: [lot()] }), NOW)
    expect(seller).toMatchObject({ kind: 'lot', action: 'Открыть лот', deadline: NOW + 3 * DAY, href: '#/room/R1/lot/L1' })
    expect(seller.text).toBe(`победитель — Аня, 1${N}500${N}₽: отметьте «Передал» или «Не смогу передать»`)
    expect(roomTasks({ ...room, lots: [lot()] }, NOW)).toEqual([])
    const handed = lot({ status: 'handed', handedAt: NOW - HOUR, silenceUntil: NOW + 2 * DAY })
    const [winner] = roomTasks({ ...room, lots: [handed] }, NOW)
    expect(winner).toMatchObject({ kind: 'lot', deadline: NOW + 2 * DAY })
    expect(winner.text).toBe(`Боря отметил(а) «Передал», 1${N}500${N}₽ — «Получил» или «Не получил»`)
    expect(roomTasks(as('B', { lots: [handed] }), NOW)).toEqual([])
  })
})

describe('обещание', () => {
  const p = { offer: 'O1', at: NOW - DAY, from: 'A', to: 'B', text: 'везёт шашлык', status: 'waiting' as const, changedAt: NOW - DAY }
  const promised = accepted({ promise: { author: 'моет машину', taker: 'везёт шашлык' }, outcome: offerOutcome({ phase: 'final' }) })

  it('проигравшему — «Исполнил»; выигравшему на «Исполнил» — «Получил»; название — условие пари', () => {
    const [loser] = roomTasks({ ...room, offers: [promised], settlement: settlement({ promises: [p] }) }, NOW)
    expect(loser).toMatchObject({ kind: 'promise', title: 'Гена не опоздает на электричку', text: 'вы обещали Боря: везёт шашлык — отметьте «Исполнил»', href: '#/room/R1/settle' })
    expect(roomTasks(as('B', { offers: [promised], settlement: settlement({ promises: [p] }) }), NOW)).toEqual([])
    const kept = { ...p, status: 'kept' as const }
    expect(roomTasks(as('B', { offers: [promised], settlement: settlement({ promises: [kept] }) }), NOW)[0].text).toBe(
      'Аня отметил(а) «Исполнил»: везёт шашлык — «Получил» или «Не получил»',
    )
    expect(roomTasks({ ...room, offers: [promised], settlement: settlement({ promises: [kept] }) }, NOW)).toEqual([])
  })

  it('получено — не дело', () => {
    const done = { ...p, status: 'received' as const }
    expect(roomTasks({ ...room, settlement: settlement({ promises: [done] }) }, NOW)).toEqual([])
    expect(roomTasks(as('B', { settlement: settlement({ promises: [done] }) }), NOW)).toEqual([])
  })
})

describe('порядок', () => {
  it('по сроку во всех комнатах, без срока — ниже', () => {
    const t = { id: 'T1', at: 1, from: 'B', to: 'A', amount: 100, by: 'sender' as const, status: 'pending' as const, changedAt: 1 }
    const one = { ...room, settlement: settlement({ transfers: [t] }), events: [event({ outcome: outcome({ status: 'approved', court: court() }) })] }
    const two = { ...room, id: 'R2', name: 'Работа', offers: [offer()] }
    expect(summaryTasks([one, two], NOW).map((x) => [x.roomId, x.kind])).toEqual([
      ['R2', 'offer'],
      ['R1', 'court'],
      ['R1', 'transfer'],
    ])
  })
})

describe('скоро закроется', () => {
  it('свои ставки с приёмом меньше суток — по сроку; чужие и дальние — нет', () => {
    const r = {
      ...room,
      events: [
        event({ status: 'open', closesAt: NOW + 5 * HOUR, expectedAt: NOW + DAY }),
        event({ id: 'E2', status: 'open', closesAt: NOW + 2 * DAY, expectedAt: NOW + 3 * DAY }),
        event({ id: 'E3', status: 'open', closesAt: NOW + HOUR, bets: [{ id: 'x', memberId: 'B', outcome: 'no', amount: 1, at: 1 }] }),
      ],
      offers: [offer({ authorId: 'A', to: 'B' })],
      lots: [lot({ status: 'open', endsAt: NOW + 4 * HOUR, winner: null, amount: null, disputeFrom: null, bids: [{ id: 'l1', at: 1, by: 'A', amount: 100000 }, { id: 'l2', at: 2, by: 'V', amount: 120000 }] })],
      choices: [choice()],
    }
    const soon = closingSoon([r], NOW)
    expect(soon.map((s) => [s.kind, s.id, s.closesAt])).toEqual([
      ['choice', 'C1', NOW + 2 * HOUR],
      ['offer', 'O1', NOW + 3 * HOUR],
      ['lot', 'L1', NOW + 4 * HOUR],
      ['event', 'E1', NOW + 5 * HOUR],
    ])
    expect(soon.map((s) => s.mine)).toEqual([
      `вы вложили 500${N}₽ в „Ладога“`,
      `ваше пари: 300${N}₽ — ждёт ответа`,
      `ваша ставка 1${N}000${N}₽ — лучшая у Вера, 1${N}200${N}₽`,
      `вы: 300${N}₽ на «Да»`,
    ])
  })

  it('приём закрыт или срок по копии прошёл — нет', () => {
    const r = { ...room, events: [event({ status: 'open', closesAt: NOW - MINUTE })], choices: [choice({ status: 'decided' })] }
    expect(closingSoon([r], NOW)).toEqual([])
  })
})

describe('баланс', () => {
  it('сумма по комнатам в одной валюте; разные валюты — строкой на валюту; очки и без свода — не в счёт', () => {
    const rooms: SavedRoom[] = [
      { ...room, settlement: settlement({}, { A: 50000 }) },
      { ...room, id: 'R2', name: 'Работа', settlement: settlement({}, { A: -30000 }) },
      { ...room, id: 'R3', name: 'Поход', currency: 'EUR', settlement: settlement({}, { A: -1500 }) },
      { ...room, id: 'R4', name: 'Очки', currency: 'PTS', settlement: settlement({}, { A: 700 }) },
      { ...room, id: 'R5', name: 'Новая' },
    ]
    const totals = balanceTotals(rooms)
    expect(totals.map((t) => [t.currency, t.amount, t.text, t.basis])).toEqual([
      ['RUB', 20000, `вам должны 200${N}₽`, 'по 2 комнатам'],
      ['EUR', -1500, `вы должны 15${N}€`, 'по 1 комнате'],
    ])
    expect(totals[0].rooms.map((r) => r.text)).toEqual([`Дача: +500${N}₽`, `Работа: −300${N}₽`])
  })

  it('ноль — «никто никому не должен»; комнат нет — пусто', () => {
    expect(balanceTotals([{ ...room, settlement: settlement() }])[0].text).toBe('никто никому не должен')
    expect(balanceTotals([])).toEqual([])
  })
})

describe('свежесть', () => {
  it('время копии: сегодня — часы, раньше — с датой; старше недели или нет ответа — подсвечено', () => {
    expect(copyNote({ syncedAt: NOW - 20 * MINUTE }, NOW, TZ)).toEqual({ text: '11:40', stale: false })
    expect(copyNote({ syncedAt: NOW - DAY }, NOW, TZ)).toEqual({ text: '27.11 12:00', stale: false })
    expect(copyNote({ syncedAt: NOW - 10 * DAY }, NOW, TZ)).toEqual({ text: 'данные от 18.11 — откройте, чтобы обновить', stale: true })
    expect(copyNote({ syncedAt: null }, NOW, TZ).stale).toBe(true)
  })

  it('сверху — самая свежая копия', () => {
    expect(freshLine([{ syncedAt: NOW - 10 * DAY }, { syncedAt: NOW - 20 * MINUTE }, { syncedAt: null }], NOW, TZ)).toBe('по копиям комнат · 11:40')
    expect(freshLine([{ syncedAt: null }], NOW, TZ)).toBe('по копиям комнат')
  })

  it('срок: сегодня — часы, дальше — дата; прошёл — «откройте комнату»; нет — ничего', () => {
    expect(deadlineText(NOW + 3 * HOUR, NOW, TZ)).toBe('до 15:00 · 3 ч')
    expect(deadlineText(NOW + 3 * DAY, NOW, TZ)).toBe('до 01.12 · 3 дн')
    expect(deadlineText(NOW + 5 * MINUTE, NOW, TZ)).toBe('до 12:05 · 5 мин')
    expect(deadlineText(NOW, NOW, TZ)).toBe('срок прошёл — откройте комнату')
    expect(deadlineText(null, NOW, TZ)).toBeNull()
  })
})
