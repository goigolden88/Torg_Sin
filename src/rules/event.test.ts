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
  eventOutcome,
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

  it('причина возражения — не пустая, до 300 знаков', () => {
    expect(checkObjection(' Видео смонтировано ')).toEqual({ ok: true, value: 'Видео смонтировано' })
    expect(checkObjection('  ')).toEqual({ ok: false, error: NEED_OBJECTION })
    expect(checkObjection(undefined)).toEqual({ ok: false, error: NEED_OBJECTION })
    expect(checkObjection('я'.repeat(300))).toMatchObject({ ok: true })
    expect(checkObjection('я'.repeat(301))).toEqual({ ok: false, error: LONG_OBJECTION })
  })
})
