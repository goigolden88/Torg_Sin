import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime } from './date'

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
