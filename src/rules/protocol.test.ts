import { describe, expect, it } from 'vitest'
import { isHealth, PROTOCOL_VERSION } from './protocol'
import { ulid } from './ulid'

describe('isHealth', () => {
  it('узнаёт ответ сервера', () => {
    expect(isHealth({ v: PROTOCOL_VERSION, ok: true, time: 1 })).toBe(true)
  })
  it('чужое — нет', () => {
    expect(isHealth(null)).toBe(false)
    expect(isHealth('ok')).toBe(false)
    expect(isHealth({ ok: true })).toBe(false)
    expect(isHealth({ v: 1, ok: false, time: 1 })).toBe(false)
  })
})

describe('ulid', () => {
  it('26 знаков, по времени сортируется', () => {
    const a = ulid(1_000)
    const b = ulid(2_000)
    expect(a).toHaveLength(26)
    expect(a < b).toBe(true)
  })
})
