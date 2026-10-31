import { describe, expect, it } from 'vitest'
import { CURRENCIES, currency, currencyLabel, isCurrencyCode } from './currency'

describe('валюты', () => {
  it('таблица из Архитектуры: код, знаков после запятой, знак', () => {
    expect(CURRENCIES.map((c) => [c.code, c.digits])).toEqual([
      ['RUB', 2],
      ['USD', 2],
      ['EUR', 2],
      ['USDT', 2],
      ['BTC', 8],
      ['PTS', 0],
    ])
    expect(currency('RUB').sign).toBe('₽')
    expect(currency('PTS').sign).toBe('очки')
  })
  it('подпись для выбора', () => {
    expect(currencyLabel('RUB')).toBe('₽ — рубли')
    expect(currencyLabel('USDT')).toBe('USDT')
    expect(currencyLabel('PTS')).toBe('очки')
    expect(currencyLabel('GBP')).toBe('GBP')
  })
  it('только коды из таблицы', () => {
    expect(isCurrencyCode('BTC')).toBe(true)
    expect(isCurrencyCode('rub')).toBe(false)
    expect(isCurrencyCode('GBP')).toBe(false)
    expect(isCurrencyCode(1)).toBe(false)
  })
})
