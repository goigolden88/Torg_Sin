import { describe, expect, it } from 'vitest'
import { CURRENCIES, currency, currencyLabel, formatAmount, isCurrencyCode, parseAmount } from './currency'

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

const ok = (units: number) => ({ ok: true, units })
const fail = (error: string) => ({ ok: false, error })

describe('разбор суммы', () => {
  it('целое в минимальных единицах валюты', () => {
    expect(parseAmount('1 200,50', 'RUB')).toEqual(ok(120050))
    expect(parseAmount('1 200,5', 'RUB')).toEqual(ok(120050))
    expect(parseAmount('1200.5', 'RUB')).toEqual(ok(120050))
    expect(parseAmount('300', 'RUB')).toEqual(ok(30000))
    expect(parseAmount(' 0,01 ', 'USD')).toEqual(ok(1))
    expect(parseAmount('0,00012', 'BTC')).toEqual(ok(12000))
    expect(parseAmount('15', 'PTS')).toEqual(ok(15))
  })
  it('понятный отказ по-русски', () => {
    expect(parseAmount('', 'RUB')).toEqual(fail('Введите сумму'))
    expect(parseAmount('1,005', 'RUB')).toEqual(fail('Не больше 2 знаков после запятой'))
    expect(parseAmount('1,5', 'PTS')).toEqual(fail('Сумма — целое число, без запятой'))
    expect(parseAmount('0', 'RUB')).toEqual(fail('Сумма должна быть больше нуля'))
    expect(parseAmount('0,00', 'RUB')).toEqual(fail('Сумма должна быть больше нуля'))
    expect(parseAmount('-5', 'RUB')).toEqual(fail('Сумма не может быть меньше нуля'))
    expect(parseAmount('сто', 'RUB')).toEqual(fail('Сумма — число, например 1 200,50'))
    expect(parseAmount('1,2,3', 'RUB')).toEqual(fail('Сумма — число, например 1 200,50'))
    expect(parseAmount('1e5', 'RUB')).toEqual(fail('Сумма — число, например 1 200,50'))
    expect(parseAmount(String(Number.MAX_SAFE_INTEGER), 'PTS')).toEqual(ok(Number.MAX_SAFE_INTEGER))
    expect(parseAmount('9007199254740992', 'PTS')).toEqual(fail('Слишком большая сумма'))
    expect(parseAmount('90071992547410', 'RUB')).toEqual(fail('Слишком большая сумма'))
  })
})

describe('показ суммы', () => {
  const N = ' '
  it('разряды и знак через неразрывный пробел', () => {
    expect(formatAmount(120050, 'RUB')).toBe(`1${N}200,50${N}₽`)
    expect(formatAmount(120000, 'RUB')).toBe(`1${N}200${N}₽`)
    expect(formatAmount(120010, 'RUB')).toBe(`1${N}200,10${N}₽`)
    expect(formatAmount(5, 'USD')).toBe(`0,05${N}$`)
    expect(formatAmount(12000, 'BTC')).toBe(`0,00012${N}₿`)
    expect(formatAmount(50000000, 'BTC')).toBe(`0,50${N}₿`)
    expect(formatAmount(15, 'PTS')).toBe(`15${N}очки`)
    expect(formatAmount(1500, 'USDT')).toBe(`15${N}USDT`)
    expect(formatAmount(123456789, 'PTS')).toBe(`123${N}456${N}789${N}очки`)
    expect(formatAmount(0, 'RUB')).toBe(`0${N}₽`)
    expect(formatAmount(-30000, 'RUB')).toBe(`−300${N}₽`)
  })
  it('туда и обратно', () => {
    for (const units of [1, 99, 100, 120050, 9876543210]) {
      expect(parseAmount(formatAmount(units, 'RUB').replace(/\s?₽$/, ''), 'RUB')).toEqual(ok(units))
    }
  })
})
