import { describe, expect, it } from 'vitest'
import { formatCountdown, formatDate, formatDateTime, fromLocalInput, toLocalInput } from './date'

const AT = Date.UTC(2026, 9, 31, 11, 5) // 31.10.2026, 11:05 UTC

describe('даты по-русски', () => {
  it('дата — день, месяц, год через точку', () => {
    expect(formatDate(AT, 'UTC')).toBe('31.10.2026')
  })
  it('местное время: в Москве (UTC+3) — 14:05', () => {
    expect(formatDateTime(AT, 'Europe/Moscow')).toBe('31.10.2026, 14:05')
  })
  it('около полуночи UTC в Москве уже следующий день', () => {
    expect(formatDate(Date.UTC(2026, 9, 31, 22, 0), 'Europe/Moscow')).toBe('01.11.2026')
  })
})

describe('отсчёт до срока', () => {
  const s = 1000
  const min = 60 * s
  const h = 60 * min
  it('дни и часы, часы и минуты, минуты и секунды', () => {
    expect(formatCountdown(2 * 24 * h + 5 * h + 30 * min)).toBe('2 дн 5 ч')
    expect(formatCountdown(5 * h + 12 * min + 3 * s)).toBe('5 ч 12 мин')
    expect(formatCountdown(9 * min + 58 * s)).toBe('9 мин 58 с')
    expect(formatCountdown(7 * s)).toBe('7 с')
  })
  it('ровные — без нулевой части', () => {
    expect(formatCountdown(24 * h)).toBe('1 дн')
    expect(formatCountdown(3 * h)).toBe('3 ч')
    expect(formatCountdown(10 * min)).toBe('10 мин')
  })
  it('неполная секунда — ещё секунда; прошло — «0 с»', () => {
    expect(formatCountdown(400)).toBe('1 с')
    expect(formatCountdown(10 * min - 400)).toBe('10 мин')
    expect(formatCountdown(0)).toBe('0 с')
    expect(formatCountdown(-5 * s)).toBe('0 с')
  })
})

describe('поле «дата и время»', () => {
  it('туда и обратно — то же время (местное телефона)', () => {
    const at = new Date(2026, 10, 1, 9, 5).getTime()
    expect(toLocalInput(at)).toBe('2026-11-01T09:05')
    expect(fromLocalInput('2026-11-01T09:05')).toBe(at)
  })
  it('секунды в поле допустимы', () => {
    expect(fromLocalInput('2026-11-01T09:05:30')).toBe(new Date(2026, 10, 1, 9, 5, 30).getTime())
  })
  it('пусто, не дата, несуществующий день — null', () => {
    expect(fromLocalInput('')).toBeNull()
    expect(fromLocalInput('завтра')).toBeNull()
    expect(fromLocalInput('2026-02-31T10:00')).toBeNull()
  })
})
