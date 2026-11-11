import { describe, expect, it } from 'vitest'
import {
  AUTHOR_SILENCE,
  BAD_AMOUNT,
  BAD_OUTCOMES,
  BAD_SUBJECT,
  checkAmount,
  checkClarification,
  checkEventInput,
  checkEventTimes,
  checkObjection,
  checkOutcomes,
  checkReason,
  CLOSE_PASSED,
  closingAt,
  earlyProposal,
  eventOutcome,
  eventRefunds,
  NOT_YET,
  withdrawnAt,
  eventStatus,
  eventView,
  eventVoters,
  EXPECTED_EARLY,
  FINAL_TIME,
  hostDecides,
  LONG_OBJECTION,
  mayPropose,
  NEED_OBJECTION,
  OBJECTION_TIME,
  VOTING_TIME,
  voteWinner,
  LONG_CHECK,
  LONG_CLARIFICATION,
  LONG_CONDITION,
  LONG_OUTCOME,
  LONG_REASON,
  NEED_CHECK,
  NEED_CLARIFICATION,
  NEED_CONDITION,
  NEED_OUTCOME,
  NEED_TIMES,
  OTHER,
  roomEvents,
  SAME_OUTCOMES,
  sameEvent,
  betOutcomes,
  NO,
  SUBJECT_NO_BETS,
  SUBJECT_YES_ONLY,
  subjectBetError,
  subjectStake,
  YES,
  yesNoOutcomes,
} from './event'
import type { LogEntry } from './room'

const FORM = {
  condition: 'Вася пробежит 10 км до конца месяца',
  check: 'Скрин из приложения с пробежкой',
  outcomes: undefined as unknown,
  closesAt: 2_000,
  expectedAt: 3_000,
  subject: undefined as unknown,
}

describe('исходы события', () => {
  it('не заданы — «Да» и «Нет», без «Другое»', () => {
    for (const x of [undefined, null, []]) {
      expect(checkOutcomes(x)).toEqual({
        ok: true,
        value: [
          { id: '1', title: 'Да' },
          { id: '2', title: 'Нет' },
        ],
      })
    }
  })

  it('свои — со «Другое» последним, пробелы по краям срезаются', () => {
    expect(checkOutcomes([' Вася ', 'Петя'])).toEqual({
      ok: true,
      value: [
        { id: '1', title: 'Вася' },
        { id: '2', title: 'Петя' },
        { id: '3', title: OTHER },
      ],
    })
    expect(OTHER).toBe('Другое (ничего из перечисленного)')
    // «Да / Нет», заданные самим автором, — тоже свои
    expect(checkOutcomes(['Да', 'Нет'])).toMatchObject({ ok: true, value: [{}, {}, { title: OTHER }] })
  })

  it('от 2 до 6 своих, каждый от 1 до 40 знаков', () => {
    expect(checkOutcomes(['один'])).toEqual({ ok: false, error: BAD_OUTCOMES })
    expect(checkOutcomes(['1', '2', '3', '4', '5', '6', '7'])).toEqual({ ok: false, error: BAD_OUTCOMES })
    expect(checkOutcomes(['1', '2', '3', '4', '5', '6'])).toMatchObject({ ok: true })
    expect(checkOutcomes('Да')).toEqual({ ok: false, error: BAD_OUTCOMES })
    expect(checkOutcomes(['а', ' '])).toEqual({ ok: false, error: NEED_OUTCOME })
    expect(checkOutcomes(['а', 5])).toEqual({ ok: false, error: NEED_OUTCOME })
    expect(checkOutcomes(['а', 'я'.repeat(41)])).toEqual({ ok: false, error: LONG_OUTCOME })
    // 40 эмодзи — 40 знаков
    expect(checkOutcomes(['а', '🙂'.repeat(40)])).toMatchObject({ ok: true })
  })

  it('одинаковые варианты (без учёта регистра и пробелов по краям) — отказ', () => {
    expect(checkOutcomes(['Вася', ' вАСЯ '])).toEqual({ ok: false, error: SAME_OUTCOMES })
    expect(checkOutcomes(['Вася', 'другое (ничего из перечисленного)'])).toEqual({ ok: false, error: SAME_OUTCOMES })
  })
})

describe('форма события', () => {
  it('условие и «как проверяем» — не пустые, до 300 знаков', () => {
    expect(checkEventInput(FORM)).toMatchObject({ ok: true, value: { condition: FORM.condition, subject: null } })
    expect(checkEventInput({ ...FORM, condition: '  ' })).toEqual({ ok: false, error: NEED_CONDITION })
    expect(checkEventInput({ ...FORM, condition: 'я'.repeat(301) })).toEqual({ ok: false, error: LONG_CONDITION })
    expect(checkEventInput({ ...FORM, condition: 'я'.repeat(300) })).toMatchObject({ ok: true })
    expect(checkEventInput({ ...FORM, check: undefined })).toEqual({ ok: false, error: NEED_CHECK })
    expect(checkEventInput({ ...FORM, check: 'я'.repeat(301) })).toEqual({ ok: false, error: LONG_CHECK })
  })

  it('сроки — целые числа; предмет — номер участника или ничего', () => {
    expect(checkEventInput({ ...FORM, closesAt: '2000' })).toEqual({ ok: false, error: NEED_TIMES })
    expect(checkEventInput({ ...FORM, expectedAt: 1.5 })).toEqual({ ok: false, error: NEED_TIMES })
    expect(checkEventInput({ ...FORM, subject: 'M1' })).toMatchObject({ ok: true, value: { subject: 'M1' } })
    expect(checkEventInput({ ...FORM, subject: '' })).toEqual({ ok: false, error: BAD_SUBJECT })
    expect(checkEventInput({ ...FORM, subject: 1 })).toEqual({ ok: false, error: BAD_SUBJECT })
  })

  it('«приём до» — впереди по времени сервера, «исход к» — не раньше него', () => {
    expect(checkEventTimes({ closesAt: 2_000, expectedAt: 3_000 }, 1_999)).toBeNull()
    expect(checkEventTimes({ closesAt: 2_000, expectedAt: 2_000 }, 1_000)).toBeNull()
    expect(checkEventTimes({ closesAt: 2_000, expectedAt: 3_000 }, 2_000)).toBe(CLOSE_PASSED)
    expect(checkEventTimes({ closesAt: 2_000, expectedAt: 1_999 }, 1_000)).toBe(EXPECTED_EARLY)
  })

  it('сумма — целое больше нуля, не больше безопасного целого', () => {
    expect(checkAmount(100)).toEqual({ ok: true, value: 100 })
    expect(checkAmount(Number.MAX_SAFE_INTEGER)).toMatchObject({ ok: true })
    for (const x of [0, -1, 1.5, '100', Number.MAX_SAFE_INTEGER + 1, NaN, null]) expect(checkAmount(x)).toEqual({ ok: false, error: BAD_AMOUNT })
  })

  it('уточнение и причина отмены', () => {
    expect(checkClarification(' Считаем и дорожку ')).toEqual({ ok: true, value: 'Считаем и дорожку' })
    expect(checkClarification('')).toEqual({ ok: false, error: NEED_CLARIFICATION })
    expect(checkClarification('я'.repeat(301))).toEqual({ ok: false, error: LONG_CLARIFICATION })
    expect(checkReason(undefined)).toEqual({ ok: true, value: null })
    expect(checkReason('  ')).toEqual({ ok: true, value: null })
    expect(checkReason(' Ошиблись датой ')).toEqual({ ok: true, value: 'Ошиблись датой' })
    expect(checkReason('я'.repeat(301))).toEqual({ ok: false, error: LONG_REASON })
  })
})

describe('события из журнала', () => {
  const base = { at: 1_000, memberId: 'A' }
  const created: LogEntry = {
    ...base,
    id: 'E1',
    type: 'event.created',
    condition: 'Условие',
    check: 'Как проверяем',
    outcomes: [
      { id: '1', title: 'Да' },
      { id: '2', title: 'Нет' },
    ],
    closesAt: 2_000,
    expectedAt: 3_000,
    subject: null,
    requestId: 'Q1',
  }
  const log: LogEntry[] = [
    { ...base, id: 'R', type: 'room.created', roomId: 'R', name: 'Дача', currency: 'RUB' },
    created,
    { id: 'B1', at: 1_100, memberId: 'A', type: 'bet.placed', event: 'E1', outcome: '1', amount: 300, requestId: 'Q2' },
    { id: 'B2', at: 1_200, memberId: 'B', type: 'bet.placed', event: 'E1', outcome: '2', amount: 100, requestId: 'Q3' },
    { id: 'B3', at: 1_300, memberId: 'A', type: 'bet.placed', event: 'E1', outcome: '2', amount: 50, requestId: 'Q4' },
    { id: 'C1', at: 1_400, memberId: 'A', type: 'event.clarified', event: 'E1', text: 'Считаем по Москве' },
    // Запись о неизвестном событии не действует
    { id: 'B4', at: 1_500, memberId: 'A', type: 'bet.placed', event: 'E9', outcome: '1', amount: 5, requestId: 'Q5' },
  ]

  it('ставки и уточнения — по порядку журнала', () => {
    const [e] = roomEvents(log)
    expect(roomEvents(log)).toHaveLength(1)
    expect(e.bets.map((b) => [b.memberId, b.outcome, b.amount, b.at])).toEqual([
      ['A', '1', 300, 1_100],
      ['B', '2', 100, 1_200],
      ['A', '2', 50, 1_300],
    ])
    expect(e.clarifications).toEqual([{ id: 'C1', at: 1_400, text: 'Считаем по Москве' }])
    expect(e.cancelled).toBeNull()
  })

  it('статус — по времени сервера: в срок и после — «приём закрыт»', () => {
    const [e] = roomEvents(log)
    expect(eventStatus(e, 1_999)).toBe('open')
    expect(eventStatus(e, 2_000)).toBe('closed')
    expect(eventStatus(e, 99_999)).toBe('closed')
  })

  it('отменено — статус «отменено», каждому его ставки; отмена — первая', () => {
    const cancelled = [
      ...log,
      { id: 'X1', at: 1_600, memberId: 'A', type: 'event.cancelled', event: 'E1', reason: null },
      { id: 'X2', at: 2_600, memberId: 'H', type: 'event.cancelled', event: 'E1', reason: 'другая' },
    ] satisfies LogEntry[]
    const [e] = roomEvents(cancelled)
    expect(e.cancelled).toEqual({ at: 1_600, by: 'A', reason: null })
    const view = eventView(e, 1_700)
    expect(view.status).toBe('cancelled')
    expect(view.refunds).toEqual([
      { memberId: 'A', amount: 350 },
      { memberId: 'B', amount: 100 },
    ])
  })

  it('вид для сайта — без номеров запросов; не отменено — возвратов нет', () => {
    const view = eventView(roomEvents(log)[0], 1_500)
    expect(view).toMatchObject({ id: 'E1', authorId: 'A', subjectId: null, status: 'open', refunds: [], cancelled: null })
    expect(JSON.stringify(view)).not.toContain('Q1')
    expect(JSON.stringify(view)).not.toContain('Q2')
    expect(view.bets[0]).toEqual({ id: 'B1', memberId: 'A', outcome: '1', amount: 300, at: 1_100 })
  })

  it('повтор создания — тот же автор и та же форма', () => {
    const [e] = roomEvents(log)
    const input = {
      condition: 'Условие',
      check: 'Как проверяем',
      outcomes: created.type === 'event.created' ? created.outcomes : [],
      closesAt: 2_000,
      expectedAt: 3_000,
      subject: null,
    }
    expect(sameEvent(e, 'A', input)).toBe(true)
    expect(sameEvent(e, 'B', input)).toBe(false)
    expect(sameEvent(e, 'A', { ...input, closesAt: 2_001 })).toBe(false)
    expect(sameEvent(e, 'A', { ...input, outcomes: [...input.outcomes, { id: '3', title: OTHER }] })).toBe(false)
  })
})

describe('предмет спора ставит только на «Да» (Р-26)', () => {
  const yesNo = [
    { id: '1', title: YES },
    { id: '2', title: NO },
  ]
  const own = [
    { id: '1', title: '<30' },
    { id: '2', title: '30–50' },
    { id: '3', title: OTHER },
  ]
  function created(id: string, outcomes = yesNo, rule = true): LogEntry {
    return {
      id,
      at: 1_000,
      memberId: 'B',
      type: 'event.created',
      condition: 'Аня найдёт работу до декабря',
      check: 'Скажет сама',
      outcomes,
      closesAt: 2_000,
      expectedAt: 3_000,
      subject: 'A',
      ...(rule && { subjectRule: 1 as const }),
      requestId: 'Q' + id,
    }
  }
  const bet = (id: string, event: string, memberId: string, outcome: string, amount: number): LogEntry => ({
    id,
    at: 1_100,
    memberId,
    type: 'bet.placed',
    event,
    outcome,
    amount,
    requestId: 'Q' + id,
  })

  it('событие «Да / Нет»: предмету — только «Да»; остальным — любой исход', () => {
    const [e] = roomEvents([created('E1')])
    expect(e.subjectRule).toBe(true)
    expect(subjectBetError(e, 'A', '1')).toBeNull()
    expect(subjectBetError(e, 'A', '2')).toBe(SUBJECT_YES_ONLY)
    expect(SUBJECT_YES_ONLY).toBe('Вы — предмет спора: ставить можно только на „Да“')
    expect(subjectBetError(e, 'C', '2')).toBeNull()
    expect(betOutcomes(e, 'A')).toEqual([{ id: '1', title: YES }])
    expect(betOutcomes(e, 'C')).toEqual(yesNo)
  })

  it('событие со своими исходами: предмет не ставит', () => {
    const [e] = roomEvents([created('E1', own)])
    for (const o of own) expect(subjectBetError(e, 'A', o.id)).toBe(SUBJECT_NO_BETS)
    expect(SUBJECT_NO_BETS).toBe('Вы — предмет спора: в событии со своими исходами вы не ставите')
    expect(betOutcomes(e, 'A')).toEqual([])
    expect(betOutcomes(e, 'C')).toEqual(own)
  })

  it('свёртка: ставка предмета против правила не действует; другим — как всегда', () => {
    const [e, f] = roomEvents([
      created('E1'),
      created('E2', own),
      bet('B1', 'E1', 'A', '1', 300),
      bet('B2', 'E1', 'A', '2', 100),
      bet('B3', 'E1', 'C', '2', 200),
      bet('B4', 'E2', 'A', '1', 50),
      bet('B5', 'E2', 'C', '3', 70),
    ])
    expect(e.bets.map((b) => b.id)).toEqual(['B1', 'B3'])
    expect(f.bets.map((b) => b.id)).toEqual(['B5'])
  })

  it('старое событие без признака: ставки предмета — как были, правила нет', () => {
    const [e, f] = roomEvents([
      created('E1', yesNo, false),
      created('E2', own, false),
      bet('B1', 'E1', 'A', '2', 100),
      bet('B2', 'E2', 'A', '1', 50),
    ])
    expect(e.subjectRule).toBe(false)
    expect(e.bets.map((b) => b.id)).toEqual(['B1'])
    expect(f.bets.map((b) => b.id)).toEqual(['B2'])
    expect(subjectBetError(e, 'A', '2')).toBeNull()
    expect(betOutcomes(f, 'A')).toEqual(own)
    expect(eventView(e, 1_500).subjectRule).toBe(false)
  })

  it('вид для сайта несёт признак правила', () => {
    expect(eventView(roomEvents([created('E1')])[0], 1_500)).toMatchObject({ subjectId: 'A', subjectRule: true })
  })

  it('пометка: предмет сам ставит — сколько и на что; старое событие со ставкой на «Нет» — против себя', () => {
    const [e] = roomEvents([created('E1'), bet('B1', 'E1', 'A', '1', 300), bet('B2', 'E1', 'A', '1', 200), bet('B3', 'E1', 'C', '2', 900)])
    expect(subjectStake(e)).toEqual({ stakes: [{ outcome: '1', title: YES, amount: 500 }], against: false })
    const [old] = roomEvents([created('E1', yesNo, false), bet('B1', 'E1', 'A', '2', 300)])
    expect(subjectStake(old)).toEqual({ stakes: [{ outcome: '2', title: NO, amount: 300 }], against: true })
    // Не ставил — пометки нет; предмета нет — тоже
    expect(subjectStake(roomEvents([created('E1'), bet('B3', 'E1', 'C', '2', 900)])[0])).toBeNull()
    expect(subjectStake({ subjectId: null, outcomes: yesNo, bets: [{ memberId: 'A', outcome: '1', amount: 5 }] })).toBeNull()
    // Старое событие со своими исходами — какие исходы, без «против себя»
    const [mine] = roomEvents([created('E1', own, false), bet('B1', 'E1', 'A', '2', 40)])
    expect(subjectStake(mine)).toEqual({ stakes: [{ outcome: '2', title: '30–50', amount: 40 }], against: false })
  })

  it('«Да / Нет» — только исходы по умолчанию; свои «Да», «Нет» со «Другое» — свои', () => {
    expect(yesNoOutcomes(yesNo)).toBe(true)
    expect(yesNoOutcomes([...yesNo, { id: '3', title: OTHER }])).toBe(false)
    expect(yesNoOutcomes(own)).toBe(false)
  })
})

describe('исход события', () => {
  const HOUR = 60 * 60 * 1000
  const DAY = 24 * HOUR
  const P = 10_000 // предложено
  // Ведущий H; участники A (автор), B, C, D; приём до 2 000, исход к 3 000
  const room: LogEntry[] = [
    { id: 'R', at: 0, memberId: 'H', type: 'room.created', roomId: 'R', name: 'Дача', currency: 'RUB' },
    ...['H', 'A', 'B', 'C', 'D'].map((m): LogEntry => ({ id: 'M' + m, at: 0, memberId: 'H', type: 'member.added', member: m, name: m })),
  ]
  function created(subject: string | null = null): LogEntry {
    return {
      id: 'E1',
      at: 1_000,
      memberId: 'A',
      type: 'event.created',
      condition: 'Условие',
      check: 'Как проверяем',
      outcomes: [
        { id: '1', title: 'Да' },
        { id: '2', title: 'Нет' },
      ],
      closesAt: 2_000,
      expectedAt: 3_000,
      subject,
      requestId: 'Q0',
    }
  }
  function bet(who: string, outcome: string, amount: number): LogEntry {
    return { id: 'B' + who + outcome, at: 1_500, memberId: who, type: 'bet.placed', event: 'E1', outcome, amount, requestId: 'QB' + who + outcome }
  }
  const propose = (who: string, outcome: string, at = P): LogEntry => ({ id: 'P' + who, at, memberId: who, type: 'outcome.proposed', event: 'E1', outcome, requestId: 'QP' + who })
  const object = (who: string, at: number): LogEntry => ({ id: 'O' + who + at, at, memberId: who, type: 'outcome.objected', event: 'E1', reason: 'Не так', requestId: 'QO' + who + at })
  const decide = (who: string, outcome: string, at: number): LogEntry => ({ id: 'D' + who + at, at, memberId: who, type: 'outcome.decided', event: 'E1', outcome, requestId: 'QD' + who + at })
  const vote = (who: string, outcome: string, at: number): LogEntry => ({ id: 'V' + who + at, at, memberId: who, type: 'outcome.voted', event: 'E1', outcome, requestId: 'QV' + who + at })
  // A — 300 на «Да», B — 100 на «Нет»: ведущий не ставил
  const base = [...room, created(), bet('A', '1', 300), bet('B', '2', 100)]
  const outcomeAt = (log: LogEntry[], now: number) => eventOutcome(roomEvents(log)[0], now)

  it('не предложен — исхода нет', () => {
    expect(outcomeAt(base, P)).toBeNull()
    expect(eventView(roomEvents(base)[0], P).outcome).toBeNull()
  })

  it('сутки без возражения — утверждён сам, по времени сервера; через 7 дней — окончательный', () => {
    const log = [...base, propose('A', '1')]
    expect(OBJECTION_TIME).toBe(DAY)
    expect(FINAL_TIME).toBe(7 * DAY)
    expect(outcomeAt(log, P + DAY - 1)).toMatchObject({ status: 'proposed', objectionUntil: P + DAY, approved: null, finalAt: null, payouts: [] })
    const approved = outcomeAt(log, P + DAY)
    expect(approved).toMatchObject({
      status: 'approved',
      proposal: { id: 'PA', at: P, by: 'A', outcome: '1' },
      approved: { outcome: '1', at: P + DAY, how: 'unopposed', by: null },
      finalAt: P + DAY + FINAL_TIME,
      void: false,
      payouts: [
        { memberId: 'A', staked: 300, payout: 400, net: 100 },
        { memberId: 'B', staked: 100, payout: 0, net: -100 },
      ],
    })
    expect(outcomeAt(log, P + DAY + FINAL_TIME - 1)?.status).toBe('approved')
    expect(outcomeAt(log, P + DAY + FINAL_TIME)?.status).toBe('final')
    expect(JSON.stringify(approved)).not.toContain('QP')
  })

  it('без игры — каждому его сумма', () => {
    const log = [...room, created(), bet('A', '1', 300), bet('B', '1', 100), propose('A', '1')]
    expect(outcomeAt(log, P + DAY)).toMatchObject({
      void: true,
      payouts: [
        { memberId: 'A', payout: 300, net: 0 },
        { memberId: 'B', payout: 100, net: 0 },
      ],
    })
  })

  it('возражение, ведущий не ставил — ждёт решения ведущего; ведущий решил — утверждён им', () => {
    const log = [...base, propose('A', '1'), object('B', P + HOUR)]
    const roomEvent = roomEvents(log)[0]
    expect(hostDecides(roomEvent)).toBe(true)
    expect(eventVoters(roomEvent)).toEqual([])
    // Сутки прошли — сам не утверждается
    expect(outcomeAt(log, P + 10 * DAY)).toMatchObject({ status: 'disputed', approved: null, voters: [], votingUntil: null })
    const decided = [...log, decide('H', '2', P + 2 * DAY)]
    expect(outcomeAt(decided, P + 2 * DAY)).toMatchObject({
      status: 'approved',
      objections: [{ id: 'OB' + (P + HOUR), at: P + HOUR, by: 'B', reason: 'Не так' }],
      decision: { by: 'H', outcome: '2', at: P + 2 * DAY },
      approved: { outcome: '2', at: P + 2 * DAY, how: 'host', by: 'H' },
      payouts: [
        { memberId: 'A', payout: 0 },
        { memberId: 'B', payout: 400 },
      ],
    })
    expect(outcomeAt(decided, P + 9 * DAY)?.status).toBe('final')
  })

  it('ведущий ставил — голосуют не ставившие и не предмет; все проголосовали — итог сразу', () => {
    const log = [...base, bet('H', '1', 50), propose('A', '1'), object('B', P + HOUR)]
    const e = roomEvents(log)[0]
    expect(hostDecides(e)).toBe(false)
    expect(eventVoters(e)).toEqual(['C', 'D'])
    expect(VOTING_TIME).toBe(72 * HOUR)
    expect(outcomeAt(log, P + 2 * HOUR)).toMatchObject({ status: 'voting', voters: ['C', 'D'], votingUntil: P + HOUR + VOTING_TIME })
    const one = [...log, vote('C', '2', P + 2 * HOUR)]
    expect(outcomeAt(one, P + 3 * HOUR)).toMatchObject({ status: 'voting', votes: [{ by: 'C', outcome: '2' }] })
    const all = [...one, vote('D', '2', P + 3 * HOUR)]
    expect(outcomeAt(all, P + 3 * HOUR)).toMatchObject({ status: 'approved', approved: { outcome: '2', at: P + 3 * HOUR, how: 'vote', by: null } })
  })

  it('голосование: 72 часа — большинство поданных; ничья или никто не голосовал — ждёт суда', () => {
    const log = [...base, bet('H', '1', 50), propose('A', '1'), object('B', P)]
    const until = P + VOTING_TIME
    const one = [...log, vote('C', '2', P + HOUR)]
    expect(outcomeAt(one, until - 1)?.status).toBe('voting')
    expect(outcomeAt(one, until)).toMatchObject({ status: 'approved', approved: { outcome: '2', at: until, how: 'vote' } })
    expect(outcomeAt(log, until)).toMatchObject({ status: 'court', approved: null, payouts: [] })
    const tie = [...log, vote('C', '1', P + HOUR), vote('D', '2', P + HOUR)]
    expect(outcomeAt(tie, P + HOUR)).toMatchObject({ status: 'court', approved: null, finalAt: null })
    expect(outcomeAt(tie, P + 100 * DAY)?.status).toBe('court')
  })

  it('ведущий — предмет спора: голосование; некому голосовать — сразу ждёт суда', () => {
    // Ставили все, кроме ведущего; ведущий — предмет
    const log = [...room, created('H'), bet('A', '1', 1), bet('B', '2', 1), bet('C', '1', 1), bet('D', '2', 1), propose('A', '1'), object('B', P)]
    const e = roomEvents(log)[0]
    expect(hostDecides(e)).toBe(false)
    expect(eventVoters(e)).toEqual([])
    expect(outcomeAt(log, P)).toMatchObject({ status: 'court', voters: [] })
  })

  it('записи не по правилам не действуют: возражение до предложения, второе от того же, решение без возражения, второй голос', () => {
    const early = [...base, object('B', P - 1), decide('H', '2', P - 1), propose('A', '1')]
    expect(outcomeAt(early, P)).toMatchObject({ status: 'proposed', objections: [], decision: null })
    const log = [...base, bet('H', '1', 50), propose('A', '1'), propose('H', '2'), object('B', P), object('B', P + 1)]
    const votes = [...log, vote('C', '1', P + 1), vote('C', '2', P + 2), vote('A', '2', P + 2)]
    const view = outcomeAt(votes, P + 3)
    expect(view?.proposal).toMatchObject({ by: 'A', outcome: '1' })
    expect(view?.objections.length).toBe(1)
    // Голос не голосующего (A ставил) не считается; у C — первый
    expect(view?.votes).toEqual([{ id: 'VC' + (P + 1), at: P + 1, by: 'C', outcome: '1' }])
  })

  it('голосуют участники на миг первого возражения: впущенный позже — нет', () => {
    const later: LogEntry = { id: 'ME', at: P + 1, memberId: 'H', type: 'member.added', member: 'E', name: 'E' }
    const log = [...base, bet('H', '1', 50), propose('A', '1'), object('B', P), later, object('A', P + 2)]
    expect(eventVoters(roomEvents(log)[0])).toEqual(['C', 'D'])
  })

  const cancel = (at: number): LogEntry => ({ id: 'X' + at, at, memberId: 'H', type: 'event.cancelled', event: 'E1', reason: 'Ошиблись' })

  it('отменённое событие — без выплат по исходу (возврат — в refunds)', () => {
    const log = [...base, propose('A', '1'), cancel(P + 1)]
    const view = eventView(roomEvents(log)[0], P + DAY)
    expect(view.outcome).toMatchObject({ status: 'cancelled', payouts: [], void: false, finalAt: null })
    expect(view.refunds.length).toBe(2)
  })

  it('отменено после утверждения — «отменено», без выплат и finalAt, окончательным не станет', () => {
    const log = [...base, propose('A', '1'), cancel(P + 2 * DAY)]
    const view = eventView(roomEvents(log)[0], P + 2 * DAY)
    expect(view.outcome).toMatchObject({ status: 'cancelled', approved: { outcome: '1', how: 'unopposed' }, finalAt: null, void: false, payouts: [] })
    expect(view.refunds).toEqual([
      { memberId: 'A', amount: 300 },
      { memberId: 'B', amount: 100 },
    ])
    expect(outcomeAt(log, P + 100 * DAY)?.status).toBe('cancelled')
    const decided = [...base, propose('A', '1'), object('B', P + HOUR), decide('H', '2', P + 2 * HOUR), cancel(P + 3 * HOUR)]
    expect(outcomeAt(decided, P + 100 * DAY)).toMatchObject({ status: 'cancelled', finalAt: null, payouts: [] })
  })

  it('отменено во время голосования или суда — «отменено»', () => {
    const voting = [...base, bet('H', '1', 50), propose('A', '1'), object('B', P), cancel(P + HOUR)]
    expect(outcomeAt(voting, P + 2 * HOUR)?.status).toBe('cancelled')
    expect(outcomeAt(voting, P + VOTING_TIME + 1)).toMatchObject({ status: 'cancelled', approved: null, finalAt: null })
  })

  it('событие ведущего о себе: предлагает любой участник, кроме ведущего-предмета; голосуют не ставившие', () => {
    const own: LogEntry = { ...created('H'), memberId: 'H' }
    const e = roomEvents([...room, own])[0]
    for (const m of ['A', 'B', 'C', 'D']) expect(mayPropose(e, m, 2_000)).toBe(true)
    expect(mayPropose(e, 'H', 3_000 + AUTHOR_SILENCE)).toBe(false)
    const log = [...room, own, bet('A', '1', 100), bet('B', '2', 100), propose('C', '1'), propose('D', '2'), object('B', P)]
    const view = outcomeAt(log, P)
    expect(view).toMatchObject({ status: 'voting', proposal: { by: 'C', outcome: '1' }, voters: ['C', 'D'] })
  })

  it('кто предлагает: автор; автор — предмет спора — ведущий; автор молчит 3 дня — и ведущий; предмет — никогда', () => {
    const e = roomEvents(base)[0]
    expect(AUTHOR_SILENCE).toBe(3 * DAY)
    expect(mayPropose(e, 'A', 2_000)).toBe(true)
    expect(mayPropose(e, 'H', 3_000 + AUTHOR_SILENCE - 1)).toBe(false)
    expect(mayPropose(e, 'H', 3_000 + AUTHOR_SILENCE)).toBe(true)
    expect(mayPropose(e, 'B', 3_000 + AUTHOR_SILENCE)).toBe(false)
    const own = roomEvents([...room, { ...created('A') }])[0]
    expect(mayPropose(own, 'A', 2_000)).toBe(false)
    expect(mayPropose(own, 'H', 2_000)).toBe(true)
    expect(mayPropose(own, 'B', 3_000 + AUTHOR_SILENCE)).toBe(false)
    const aboutB = roomEvents([...room, created('B')])[0]
    expect(mayPropose(aboutB, 'B', 3_000 + AUTHOR_SILENCE)).toBe(false)
    const aboutHost = roomEvents([...room, created('H')])[0]
    expect(mayPropose(aboutHost, 'H', 3_000 + AUTHOR_SILENCE)).toBe(false)
  })

  it('большинство поданных голосов; ничья и пусто — нет победителя', () => {
    const m = (outcome: string) => ({ id: 'V', at: 0, by: 'X', outcome })
    expect(voteWinner([m('1'), m('2'), m('1')])).toBe('1')
    expect(voteWinner([m('3')])).toBe('3')
    expect(voteWinner([m('1'), m('2')])).toBeNull()
    expect(voteWinner([m('1'), m('1'), m('2'), m('2'), m('3')])).toBeNull()
    expect(voteWinner([])).toBeNull()
  })

  const agree = (who: string, at: number): LogEntry => ({ id: 'G' + who + at, at, memberId: who, type: 'outcome.agreed', event: 'E1', requestId: 'QG' + who + at })

  it('согласны все ставившие — утверждён и окончательный в миг последнего согласия', () => {
    // A (предложивший) — 300 на «Да», B — 100 на «Нет», C — 50 на «Нет»
    const log = [...base, bet('C', '2', 50), propose('A', '1'), agree('B', P + HOUR)]
    expect(outcomeAt(log, P + HOUR)).toMatchObject({
      status: 'proposed',
      agreements: [{ id: 'GB' + (P + HOUR), at: P + HOUR, by: 'B' }],
      awaiting: ['C'],
      approved: null,
      finalAt: null,
    })
    const all = [...log, agree('C', P + 2 * HOUR)]
    const view = outcomeAt(all, P + 2 * HOUR)
    expect(view).toMatchObject({
      status: 'final',
      awaiting: [],
      approved: { outcome: '1', at: P + 2 * HOUR, how: 'agreed', by: null },
      finalAt: P + 2 * HOUR,
      void: false,
      payouts: [
        { memberId: 'A', staked: 300, payout: 450, net: 150 },
        { memberId: 'B', staked: 100, payout: 0, net: -100 },
        { memberId: 'C', staked: 50, payout: 0, net: -50 },
      ],
    })
    expect(view?.agreements.map((a) => a.by)).toEqual(['B', 'C'])
    expect(JSON.stringify(view)).not.toContain('QG')
  })

  it('согласны не все — «на возражении», через сутки утверждён сам, через неделю — окончательный', () => {
    const log = [...base, bet('C', '2', 50), propose('A', '1'), agree('C', P + HOUR)]
    expect(outcomeAt(log, P + DAY - 1)).toMatchObject({ status: 'proposed', awaiting: ['B'], approved: null })
    expect(outcomeAt(log, P + DAY)).toMatchObject({
      status: 'approved',
      awaiting: [],
      approved: { outcome: '1', at: P + DAY, how: 'unopposed' },
      finalAt: P + DAY + FINAL_TIME,
    })
    expect(outcomeAt(log, P + DAY + FINAL_TIME)?.status).toBe('final')
  })

  it('возражение после части согласий — путь возражения; согласие после возражения не действует', () => {
    const log = [...base, bet('C', '2', 50), propose('A', '1'), agree('C', P + HOUR), object('B', P + 2 * HOUR)]
    expect(outcomeAt(log, P + 2 * HOUR)).toMatchObject({ status: 'disputed', approved: null, awaiting: [] })
    // B возразил; согласие C после этого и повторное согласие не считаются
    const late = [...base, bet('C', '2', 50), propose('A', '1'), object('B', P + HOUR), agree('C', P + 2 * HOUR)]
    expect(outcomeAt(late, P + 2 * HOUR)).toMatchObject({ status: 'disputed', agreements: [], approved: null })
    const decided = [...log, decide('H', '2', P + 3 * HOUR)]
    expect(outcomeAt(decided, P + 3 * HOUR)).toMatchObject({ status: 'approved', approved: { how: 'host', outcome: '2' }, finalAt: P + 3 * HOUR + FINAL_TIME })
  })

  it('возражение от согласившегося не действует: все согласны — окончательный', () => {
    const log = [...base, propose('A', '1'), agree('B', P + HOUR), object('B', P + 2 * HOUR)]
    expect(outcomeAt(log, P + 2 * HOUR)).toMatchObject({ status: 'final', objections: [], approved: { how: 'agreed', at: P + HOUR } })
  })

  it('согласия не по правилам не считаются: до предложения, от не ставившего, от предложившего, второе, после суток', () => {
    const log = [...base, agree('B', P - 1), propose('A', '1'), agree('A', P + 1), agree('C', P + 2), agree('H', P + 3)]
    expect(outcomeAt(log, P + 4)).toMatchObject({ status: 'proposed', agreements: [], awaiting: ['B'] })
    const late = [...base, propose('A', '1'), agree('B', P + DAY)]
    expect(outcomeAt(late, P + DAY)).toMatchObject({ status: 'approved', agreements: [], approved: { how: 'unopposed' } })
    const twice = [...base, bet('C', '2', 50), propose('A', '1'), agree('B', P + 1), agree('B', P + 2)]
    expect(outcomeAt(twice, P + 3)?.agreements).toEqual([{ id: 'GB' + (P + 1), at: P + 1, by: 'B' }])
  })

  it('ставил на несколько исходов — одно согласие', () => {
    const log = [...base, bet('B', '1', 20), propose('A', '1'), agree('B', P + HOUR)]
    expect(outcomeAt(log, P + HOUR)).toMatchObject({ status: 'final', approved: { how: 'agreed', at: P + HOUR } })
  })

  it('кроме предложившего, никто не ставил — утверждён и окончательный в миг предложения', () => {
    const alone = [...room, created(), bet('A', '1', 300), propose('A', '1')]
    expect(outcomeAt(alone, P)).toMatchObject({ status: 'final', awaiting: [], approved: { outcome: '1', at: P, how: 'agreed' }, finalAt: P, void: true })
    const nobody = [...room, created(), propose('A', '1')]
    expect(outcomeAt(nobody, P)).toMatchObject({ status: 'final', finalAt: P, payouts: [] })
    // Событие отменено — «отменено», как раньше
    expect(outcomeAt([...alone, cancel(P + 1)], P + 2)).toMatchObject({ status: 'cancelled', finalAt: null, payouts: [] })
  })

  describe('«Исход уже известен» (Р-27)', () => {
    const E = 1_800 // досрочно: ставки в 1 500, «приём до» — 2 000
    const early = (who: string, outcome: string, at = E, n = ''): LogEntry => ({
      id: 'P' + who + n,
      at,
      memberId: who,
      type: 'outcome.proposed',
      event: 'E1',
      outcome,
      requestId: 'QP' + who + n,
    })
    const lateBet = (who: string, at: number): LogEntry => ({ id: 'BL' + who + at, at, memberId: who, type: 'bet.placed', event: 'E1', outcome: '2', amount: 50, requestId: 'QBL' + who + at })

    it('предложить можно и до «приём до»: те же, кто после', () => {
      const e = roomEvents([...base])[0]
      expect(eventStatus(e, E)).toBe('open')
      expect(mayPropose(e, 'A', E)).toBe(true)
      expect(mayPropose(e, 'B', E)).toBe(false)
      expect(mayPropose(e, 'H', E)).toBe(false)
    })

    it('досрочное предложение закрывает приём навсегда: статус «закрыт», ставка после не действует', () => {
      const log = [...base, early('A', '1'), lateBet('C', E + 1), lateBet('B', 2_500)]
      const e = roomEvents(log)[0]
      expect(e.closedAt).toBe(E)
      expect(e.bets.map((b) => b.memberId)).toEqual(['A', 'B'])
      expect(eventStatus(e, E - 1)).toBe('open')
      expect(eventStatus(e, E)).toBe('closed')
      expect(closingAt(e)).toBe(E)
      const view = eventView(e, E + 1)
      expect(view).toMatchObject({ status: 'closed', closedAt: E, outcome: { status: 'proposed', objectionUntil: E + DAY } })
      // Сайт считает статус по ответу так же
      expect(eventStatus(view, E + 1)).toBe('closed')
    })

    it('старое событие — без closedAt в ответе: предложено после «приём до»', () => {
      const e = roomEvents([...base, propose('A', '1')])[0]
      expect(e.closedAt).toBeNull()
      expect('closedAt' in eventView(e, P)).toBe(false)
      expect(closingAt(eventView(e, P))).toBe(2_000)
      expect(earlyProposal(e)).toBe(false)
    })

    it('дальше — как обычно: согласие всех — окончательный сразу; сутки без возражения — утверждён', () => {
      const agreed = [...base, early('A', '1'), agree('B', E + HOUR)]
      expect(outcomeAt(agreed, E + HOUR)).toMatchObject({ status: 'final', approved: { outcome: '1', how: 'agreed', at: E + HOUR } })
      expect(outcomeAt([...base, early('A', '1')], E + DAY)).toMatchObject({ status: 'approved', approved: { how: 'unopposed' } })
    })

    it('возражение, ведущий решает «ещё не известно» — предложение снято, выплат нет, приём закрыт', () => {
      const log = [...base, early('A', '1'), object('B', E + HOUR), decide('H', NOT_YET, E + 2 * HOUR)]
      const e = roomEvents(log)[0]
      expect(withdrawnAt(e, E + 2 * HOUR)).toBe(E + 2 * HOUR)
      expect(outcomeAt(log, E + 2 * HOUR)).toMatchObject({ status: 'withdrawn', decision: { outcome: NOT_YET }, approved: null, finalAt: null, payouts: [] })
      expect(eventStatus(e, E + 3 * HOUR)).toBe('closed')
      expect(eventRefunds(e, eventOutcome(e, E + 3 * HOUR))).toEqual([])
    })

    it('после снятия — новое предложение: свой ход исхода; снятое — в истории; второе до снятия не действует', () => {
      const log = [
        ...base,
        early('A', '1'),
        early('A', '2', E + 10, 'x'), // до снятия — не действует
        object('B', E + HOUR),
        decide('H', NOT_YET, E + 2 * HOUR),
        lateBet('C', E + 3 * HOUR),
        early('A', '2', P, '2'),
      ]
      const e = roomEvents(log)[0]
      expect(e.proposal).toMatchObject({ id: 'PA2', at: P, outcome: '2' })
      expect(e.objections).toEqual([])
      expect(e.decision).toBeNull()
      expect(e.withdrawn.map((r) => r.proposal?.id)).toEqual(['PA'])
      expect(e.withdrawn[0].decision?.outcome).toBe(NOT_YET)
      expect(e.closedAt).toBe(E)
      expect(e.bets.length).toBe(2)
      expect(outcomeAt(log, P)).toMatchObject({ status: 'proposed', proposal: { outcome: '2' }, objections: [], decision: null })
      // Второе — после «приём до»: «ещё не известно» уже не действует, решение ведущего — обычное
      expect(earlyProposal(e)).toBe(false)
      const decided = [...log, object('B', P + HOUR), decide('H', NOT_YET, P + 2 * HOUR), decide('H', '2', P + 3 * HOUR)]
      expect(outcomeAt(decided, P + 3 * HOUR)).toMatchObject({ status: 'approved', approved: { outcome: '2', how: 'host' } })
    })

    it('«ещё не известно» у предложения после «приём до» не действует', () => {
      const log = [...base, propose('A', '1'), object('B', P + HOUR), decide('H', NOT_YET, P + 2 * HOUR)]
      expect(outcomeAt(log, P + 2 * HOUR)).toMatchObject({ status: 'disputed', decision: null })
      expect(withdrawnAt(roomEvents(log)[0], P + 2 * HOUR)).toBeNull()
    })

    it('голосование: большинство за «ещё не известно» — снято; ничья — ждёт суда; за исход — утверждён', () => {
      // Ведущий ставил — голосуют C и D
      const voting = [...base, bet('H', '1', 10), early('A', '1'), object('B', E + HOUR)]
      const withdrawn = [...voting, vote('C', NOT_YET, E + 2 * HOUR), vote('D', NOT_YET, E + 3 * HOUR)]
      expect(outcomeAt(withdrawn, E + 3 * HOUR)).toMatchObject({ status: 'withdrawn', approved: null, votes: [{ outcome: NOT_YET }, { outcome: NOT_YET }] })
      expect(withdrawnAt(roomEvents(withdrawn)[0], E + 3 * HOUR)).toBe(E + 3 * HOUR)
      const tie = [...voting, vote('C', NOT_YET, E + 2 * HOUR), vote('D', '1', E + 3 * HOUR)]
      expect(outcomeAt(tie, E + 3 * HOUR)?.status).toBe('court')
      const one = [...voting, vote('C', NOT_YET, E + 2 * HOUR)]
      expect(outcomeAt(one, E + 2 * HOUR)?.status).toBe('voting')
      // 72 часа: один голос «ещё не известно» — большинство поданных
      expect(outcomeAt(one, E + HOUR + VOTING_TIME)?.status).toBe('withdrawn')
      expect(withdrawnAt(roomEvents(one)[0], E + HOUR + VOTING_TIME)).toBe(E + HOUR + VOTING_TIME)
      const yes = [...voting, vote('C', '1', E + 2 * HOUR), vote('D', '1', E + 3 * HOUR)]
      expect(outcomeAt(yes, E + 3 * HOUR)).toMatchObject({ status: 'approved', approved: { outcome: '1', how: 'vote' } })
    })
  })

  it('причина возражения — не пустая, до 300 знаков', () => {
    expect(checkObjection(' Видео смонтировано ')).toEqual({ ok: true, value: 'Видео смонтировано' })
    expect(checkObjection('  ')).toEqual({ ok: false, error: NEED_OBJECTION })
    expect(checkObjection(undefined)).toEqual({ ok: false, error: NEED_OBJECTION })
    expect(checkObjection('я'.repeat(300))).toMatchObject({ ok: true })
    expect(checkObjection('я'.repeat(301))).toEqual({ ok: false, error: LONG_OBJECTION })
  })
})
