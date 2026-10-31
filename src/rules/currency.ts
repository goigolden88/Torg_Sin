// Валюты комнаты (Р-07): одна на комнату, выбирается при создании. Новая валюта — строка
// таблицы. Суммы хранятся целыми в минимальных единицах: digits — знаков после запятой.
// Форматирование сумм — этап 5; здесь только таблица
export type Currency = {
  code: string
  digits: number // знаков после запятой: 100 единиц RUB = 1,00 ₽
  sign: string // знак при сумме; пусто — показывается код
}

export const CURRENCIES = [
  { code: 'RUB', digits: 2, sign: '₽' },
  { code: 'USD', digits: 2, sign: '$' },
  { code: 'EUR', digits: 2, sign: '€' },
  { code: 'USDT', digits: 2, sign: '' },
  { code: 'BTC', digits: 8, sign: '₿' },
  { code: 'PTS', digits: 0, sign: 'очки' },
] as const satisfies readonly Currency[]

export type CurrencyCode = (typeof CURRENCIES)[number]['code']

export function isCurrencyCode(x: unknown): x is CurrencyCode {
  return typeof x === 'string' && CURRENCIES.some((c) => c.code === x)
}

export function currency(code: CurrencyCode): Currency {
  return CURRENCIES.find((c) => c.code === code) as Currency
}
