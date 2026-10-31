import { describe, expect, it } from 'vitest'
import { DEFAULT_SERVER, healthUrl, normalizeServer } from './address'

describe('normalizeServer', () => {
  it('оставляет адрес по умолчанию как есть', () => {
    expect(normalizeServer(DEFAULT_SERVER)).toBe(DEFAULT_SERVER)
  })
  it('убирает пробелы и слэш в конце, дописывает https', () => {
    expect(normalizeServer('  torg.example.com/ ')).toBe('https://torg.example.com')
    expect(normalizeServer('https://torg.example.com/api//')).toBe('https://torg.example.com/api')
  })
  it('http — только для своего компьютера', () => {
    expect(normalizeServer('http://localhost:8787')).toBe('http://localhost:8787')
    expect(normalizeServer('http://torg.example.com')).toBeNull()
  })
  it('не адрес — null', () => {
    expect(normalizeServer('')).toBeNull()
    expect(normalizeServer('просто слово')).toBeNull()
    expect(normalizeServer('ftp://torg.example.com')).toBeNull()
    expect(normalizeServer('https://torg.example.com/?x=1')).toBeNull()
  })
  it('адрес проверки связи', () => {
    expect(healthUrl('https://torg.example.com')).toBe('https://torg.example.com/health')
  })
})
