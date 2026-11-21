import { describe, expect, it } from 'vitest'
import { checkPace, FAST_TIMES, NORMAL_TIMES, TIME_CHOICES, TIME_KEYS } from '../rules/pace'
import { draftTimes, paceDraft, paceInput, paceLine, roomTimesLine, spanText, statePace, viewTimes } from './paceParts'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const CUSTOM = { objection: 6 * HOUR, appeal: 3 * DAY, silence: 2 * DAY, court: DAY }

describe('spanText — срок словами для фразы', () => {
  it('часы — со склонением, сутки — «сутки», дни — со склонением', () => {
    expect(spanText(HOUR)).toBe('1 час')
    expect(spanText(2 * HOUR)).toBe('2 часа')
    expect(spanText(6 * HOUR)).toBe('6 часов')
    expect(spanText(12 * HOUR)).toBe('12 часов')
    expect(spanText(21 * HOUR)).toBe('21 час')
    expect(spanText(72 * HOUR)).toBe('3 дня')
    expect(spanText(DAY)).toBe('сутки')
    expect(spanText(2 * DAY)).toBe('2 дня')
    expect(spanText(5 * DAY)).toBe('5 дней')
    expect(spanText(7 * DAY)).toBe('7 дней')
    expect(spanText(14 * DAY)).toBe('14 дней')
  })

  it('у каждого допустимого срока — подпись без «ч» и цифр-дробей', () => {
    for (const k of TIME_KEYS) for (const ms of TIME_CHOICES[k]) expect(spanText(ms)).toMatch(/^(сутки|\d+ (час|часа|часов|день|дня|дней))$/)
  })
})

describe('viewTimes — сроки события или пари из ответа', () => {
  it('есть поле — оно, нет (сервер до темпа) — обычный набор', () => {
    expect(viewTimes({ times: FAST_TIMES })).toEqual(FAST_TIMES)
    expect(viewTimes({})).toEqual(NORMAL_TIMES)
  })
})

describe('statePace — темп комнаты из ответа', () => {
  it('сервер без темпа — null', () => {
    expect(statePace({})).toBeNull()
  })

  it('темп со сроками — они; сроков нет — набор темпа', () => {
    expect(statePace({ pace: 'custom', times: CUSTOM })).toEqual({ pace: 'custom', times: CUSTOM })
    expect(statePace({ pace: 'fast' })).toEqual({ pace: 'fast', times: FAST_TIMES })
    expect(statePace({ pace: 'normal', times: NORMAL_TIMES })).toEqual({ pace: 'normal', times: NORMAL_TIMES })
  })
})

describe('строки темпа', () => {
  it('в комнате — название темпа и четыре срока', () => {
    expect(paceLine({ pace: 'fast', times: FAST_TIMES })).toBe('Темп: быстрый — возражение — 2 ч, апелляция — сутки, молчание — 12 ч, суд — 12 ч')
    expect(paceLine({ pace: 'normal', times: NORMAL_TIMES })).toBe('Темп: обычный — возражение — сутки, апелляция — 7 дней, молчание — 3 дня, суд — 3 дня')
  })

  it('на «Новом событии» и «Новом пари» — сроки комнаты', () => {
    expect(roomTimesLine({ pace: 'custom', times: CUSTOM })).toMatch(/^Сроки этой комнаты: возражение — 6 ч, апелляция — 3 дня, молчание — 2 дня, суд — сутки\./)
  })
})

describe('выбор темпа', () => {
  it('на создании — обычный, «свой» — со сроками обычного', () => {
    const d = paceDraft(null)
    expect(d).toEqual({ pace: 'normal', custom: NORMAL_TIMES })
    expect(draftTimes(d)).toEqual(NORMAL_TIMES)
    expect(paceInput(d)).toEqual({ pace: 'normal' })
  })

  it('при смене — нынешний темп; у «своего» — его сроки', () => {
    expect(paceDraft({ pace: 'fast', times: FAST_TIMES })).toEqual({ pace: 'fast', custom: NORMAL_TIMES })
    expect(paceDraft({ pace: 'custom', times: CUSTOM })).toEqual({ pace: 'custom', custom: CUSTOM })
  })

  it('запрос проходит проверку правил: у «своего» — сроки, у обычного и быстрого — без них', () => {
    for (const d of [
      { pace: 'normal' as const, custom: CUSTOM },
      { pace: 'fast' as const, custom: CUSTOM },
      { pace: 'custom' as const, custom: CUSTOM },
    ]) {
      const input = paceInput(d)
      expect(checkPace(input)).toEqual({ ok: true, value: input })
      expect(draftTimes(d)).toEqual(d.pace === 'fast' ? FAST_TIMES : d.pace === 'custom' ? CUSTOM : NORMAL_TIMES)
    }
  })

  it('сроки по умолчанию у «своего» входят в списки', () => {
    expect(checkPace(paceInput({ pace: 'custom', custom: paceDraft(null).custom })).ok).toBe(true)
  })
})
