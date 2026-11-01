import { describe, expect, it } from 'vitest'
import {
  BAD_AMOUNT,
  BAD_OUTCOMES,
  BAD_SUBJECT,
  checkAmount,
  checkClarification,
  checkEventInput,
  checkEventTimes,
  checkOutcomes,
  checkReason,
  CLOSE_PASSED,
  eventStatus,
  eventView,
  EXPECTED_EARLY,
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
