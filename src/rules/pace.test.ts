import { describe, expect, it } from 'vitest'
import {
  BAD_PACE,
  badTime,
  checkPace,
  checkPaceChange,
  DEFAULT_PACE,
  durationText,
  EXTRA_PACE_TIMES,
  FAST_TIMES,
  logPace,
  NEED_PACE_TIMES,
  NORMAL_TIMES,
  ONLY_HOST_PACE,
  paceSummary,
  paceTimes,
  recordTimes,
  SAME_PACE,
  TIME_CHOICES,
  TIME_KEYS,
  timesOf,
  type Times,
} from './pace'
import type { LogEntry } from './room'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const CUSTOM: Times = { objection: 6 * HOUR, appeal: 3 * DAY, silence: 2 * DAY, court: 5 * DAY }

describe('наборы сроков', () => {
  it('обычный — как было: 24 ч / 7 дней / 3 дня / 72 ч; быстрый — 2 ч / 24 ч / 12 ч / 12 ч', () => {
    expect(NORMAL_TIMES).toEqual({ objection: 24 * HOUR, appeal: 7 * DAY, silence: 3 * DAY, court: 72 * HOUR })
    expect(FAST_TIMES).toEqual({ objection: 2 * HOUR, appeal: 24 * HOUR, silence: 12 * HOUR, court: 12 * HOUR })
    expect(DEFAULT_PACE).toBe('normal')
  })

  it('списки «своего»: возражение 2–48 ч, апелляция 1–14 дней, молчание и суд 12 ч – 7 дней', () => {
    expect(TIME_CHOICES.objection).toEqual([2, 6, 12, 24, 48].map((h) => h * HOUR))
    expect(TIME_CHOICES.appeal).toEqual([1, 2, 3, 7, 14].map((d) => d * DAY))
    for (const k of ['silence', 'court'] as const) expect(TIME_CHOICES[k]).toEqual([12 * HOUR, DAY, 2 * DAY, 3 * DAY, 5 * DAY, 7 * DAY])
  })

  it('оба набора входят в списки «своего»', () => {
    for (const set of [NORMAL_TIMES, FAST_TIMES]) {
      for (const k of TIME_KEYS) expect(TIME_CHOICES[k]).toContain(set[k])
      expect(checkPace({ pace: 'custom', times: set })).toEqual({ ok: true, value: { pace: 'custom', times: set } })
    }
  })

  it('paceTimes: обычный и быстрый — готовые наборы, «свой» — его сроки', () => {
    expect(paceTimes({ pace: 'normal' })).toEqual(NORMAL_TIMES)
    expect(paceTimes({ pace: 'fast' })).toEqual(FAST_TIMES)
    expect(paceTimes({ pace: 'custom', times: CUSTOM })).toEqual(CUSTOM)
    // Сроки у обычного и быстрого не действуют
    expect(paceTimes({ pace: 'fast', times: CUSTOM })).toEqual(FAST_TIMES)
  })
})

describe('checkPace', () => {
  it('обычный и быстрый — без сроков', () => {
    expect(checkPace({ pace: 'normal' })).toEqual({ ok: true, value: { pace: 'normal' } })
    expect(checkPace({ pace: 'fast', times: null })).toEqual({ ok: true, value: { pace: 'fast' } })
  })

  it('у обычного и быстрого сроки в запросе — отказ', () => {
    expect(checkPace({ pace: 'normal', times: NORMAL_TIMES })).toEqual({ ok: false, error: EXTRA_PACE_TIMES })
    expect(checkPace({ pace: 'fast', times: {} })).toEqual({ ok: false, error: EXTRA_PACE_TIMES })
  })

  it('темп не из трёх — отказ', () => {
    for (const pace of [undefined, null, '', 'slow', 'Быстрый', 1, {}]) expect(checkPace({ pace })).toEqual({ ok: false, error: BAD_PACE })
    expect(BAD_PACE).toContain('«обычный», «быстрый» или «свой»')
  })

  it('«свой» — все четыре срока; нет сроков или одного — отказ', () => {
    expect(checkPace({ pace: 'custom', times: CUSTOM })).toEqual({ ok: true, value: { pace: 'custom', times: CUSTOM } })
    for (const times of [undefined, null, 'сутки', [], 5]) expect(checkPace({ pace: 'custom', times })).toEqual({ ok: false, error: NEED_PACE_TIMES })
    for (const k of TIME_KEYS) {
      const rest: Record<string, number> = { ...CUSTOM }
      delete rest[k]
      expect(checkPace({ pace: 'custom', times: rest })).toEqual({ ok: false, error: NEED_PACE_TIMES })
    }
  })

  it('«свой» — каждый срок только из списка; отказ — с допустимыми значениями', () => {
    for (const k of TIME_KEYS) {
      for (const bad of [0, -DAY, 1, HOUR, 4 * HOUR, 30 * DAY, '2 ч', 365 * DAY]) {
        expect(checkPace({ pace: 'custom', times: { ...CUSTOM, [k]: bad } })).toEqual({ ok: false, error: badTime(k) })
      }
    }
    expect(badTime('objection')).toBe('Срок «возражение» — один из: 2 ч, 6 ч, 12 ч, сутки, 2 дня')
    expect(badTime('appeal')).toBe('Срок «апелляция» — один из: сутки, 2 дня, 3 дня, 7 дней, 14 дней')
    expect(badTime('silence')).toBe('Срок «молчание» — один из: 12 ч, сутки, 2 дня, 3 дня, 5 дней, 7 дней')
    expect(badTime('court')).toBe('Срок «суд» — один из: 12 ч, сутки, 2 дня, 3 дня, 5 дней, 7 дней')
  })

  it('лишние поля сроков отбрасываются', () => {
    expect(checkPace({ pace: 'custom', times: { ...CUSTOM, extra: 1 } })).toEqual({ ok: true, value: { pace: 'custom', times: CUSTOM } })
  })
})

describe('подпись сроков', () => {
  it('paceSummary — как на экране', () => {
    expect(paceSummary(FAST_TIMES)).toBe('возражение — 2 ч, апелляция — сутки, молчание — 12 ч, суд — 12 ч')
    expect(paceSummary(NORMAL_TIMES)).toBe('возражение — сутки, апелляция — 7 дней, молчание — 3 дня, суд — 3 дня')
    expect(paceSummary(CUSTOM)).toBe('возражение — 6 ч, апелляция — 3 дня, молчание — 2 дня, суд — 5 дней')
  })

  it('durationText: часы, сутки, дни с окончанием', () => {
    expect(durationText(2 * HOUR)).toBe('2 ч')
    expect(durationText(DAY)).toBe('сутки')
    expect(durationText(2 * DAY)).toBe('2 дня')
    expect(durationText(5 * DAY)).toBe('5 дней')
    expect(durationText(14 * DAY)).toBe('14 дней')
    expect(durationText(21 * DAY)).toBe('21 день')
    expect(durationText(36 * HOUR)).toBe('36 ч')
  })
})

describe('сроки в записи события и пари', () => {
  it('recordTimes: четыре положительных целых — они; нет поля или битое — нет', () => {
    expect(recordTimes(CUSTOM)).toEqual(CUSTOM)
    expect(recordTimes({ ...CUSTOM, extra: 1 })).toEqual(CUSTOM)
    expect(recordTimes(undefined)).toBeUndefined()
    expect(recordTimes({ ...CUSTOM, court: 0 })).toBeUndefined()
    expect(recordTimes({ objection: HOUR })).toBeUndefined()
  })

  it('timesOf: нет поля — обычный набор', () => {
    expect(timesOf({})).toEqual(NORMAL_TIMES)
    expect(timesOf({ times: FAST_TIMES })).toEqual(FAST_TIMES)
  })
})

describe('темп комнаты из журнала', () => {
  const created = (extra: object = {}): LogEntry => ({ id: 'R', at: 0, memberId: 'H', type: 'room.created', roomId: 'R', name: 'Дача', currency: 'RUB', ...extra }) as LogEntry
  const change = (id: string, memberId: string, extra: object): LogEntry => ({ id, at: 1, memberId, type: 'room.pace', requestId: 'Q' + id, ...extra }) as LogEntry

  it('нет поля — обычный; задан при создании — он', () => {
    expect(logPace([])).toEqual({ pace: 'normal', times: NORMAL_TIMES })
    expect(logPace([created()])).toEqual({ pace: 'normal', times: NORMAL_TIMES })
    expect(logPace([created({ pace: 'fast' })])).toEqual({ pace: 'fast', times: FAST_TIMES })
    expect(logPace([created({ pace: 'custom', times: CUSTOM })])).toEqual({ pace: 'custom', times: CUSTOM })
    // Битое поле — обычный
    expect(logPace([created({ pace: 'custom' })])).toEqual({ pace: 'normal', times: NORMAL_TIMES })
  })

  it('после смены — последняя room.pace', () => {
    const log = [created(), change('1', 'H', { pace: 'fast' })]
    expect(logPace(log)).toEqual({ pace: 'fast', times: FAST_TIMES })
    const custom = [...log, change('2', 'H', { pace: 'custom', times: CUSTOM })]
    expect(logPace(custom)).toEqual({ pace: 'custom', times: CUSTOM })
    expect(logPace([...custom, change('3', 'H', { pace: 'normal' })])).toEqual({ pace: 'normal', times: NORMAL_TIMES })
  })

  it('смена не от ведущего или битая — не действует', () => {
    const log = [created({ pace: 'fast' }), change('1', 'A', { pace: 'normal' }), change('2', 'H', { pace: 'custom', times: { ...CUSTOM, appeal: HOUR } })]
    expect(logPace(log)).toEqual({ pace: 'fast', times: FAST_TIMES })
  })
})

describe('checkPaceChange', () => {
  const room = { hostId: 'H' }
  const normal = { pace: 'normal' as const, times: NORMAL_TIMES }

  it('только ведущий', () => {
    expect(checkPaceChange(normal, room, 'A', { pace: 'fast' })).toBe(ONLY_HOST_PACE)
    expect(checkPaceChange(normal, room, 'H', { pace: 'fast' })).toBeNull()
  })

  it('темп проверяет checkPace', () => {
    expect(checkPaceChange(normal, room, 'H', { pace: 'slow' })).toBe(BAD_PACE)
    expect(checkPaceChange(normal, room, 'H', { pace: 'custom' })).toBe(NEED_PACE_TIMES)
    expect(checkPaceChange(normal, room, 'H', { pace: 'fast', times: FAST_TIMES })).toBe(EXTRA_PACE_TIMES)
    expect(checkPaceChange(normal, room, 'H', { pace: 'custom', times: { ...CUSTOM, court: HOUR } })).toBe(badTime('court'))
  })

  it('тот же темп с теми же сроками — отказ; «свой» с другими сроками — можно', () => {
    expect(checkPaceChange(normal, room, 'H', { pace: 'normal' })).toBe(SAME_PACE)
    const custom = { pace: 'custom' as const, times: CUSTOM }
    expect(checkPaceChange(custom, room, 'H', { pace: 'custom', times: CUSTOM })).toBe(SAME_PACE)
    expect(checkPaceChange(custom, room, 'H', { pace: 'custom', times: { ...CUSTOM, court: DAY } })).toBeNull()
    // «Свой» со сроками обычного — другой темп: можно
    expect(checkPaceChange(normal, room, 'H', { pace: 'custom', times: NORMAL_TIMES })).toBeNull()
  })
})
