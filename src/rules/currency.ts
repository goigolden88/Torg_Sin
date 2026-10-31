// Валюты комнаты (Р-07): одна на комнату, выбирается при создании. Новая валюта — строка
// таблицы. Суммы хранятся целыми в минимальных единицах: digits — знаков после запятой.
// Форматирование сумм — этап 5; здесь только таблица
export type Currency = {
  code: string
  digits: number // знаков после запятой: 100 единиц RUB = 1,00 ₽
  sign: string // знак при сумме; пусто — показывается код
  title: string // для выбора валюты на экране
}

export const CURRENCIES = [
  { code: 'RUB', digits: 2, sign: '₽', title: 'рубли' },
  { code: 'USD', digits: 2, sign: '$', title: 'доллары' },
  { code: 'EUR', digits: 2, sign: '€', title: 'евро' },
  { code: 'USDT', digits: 2, sign: '', title: 'USDT' },
  { code: 'BTC', digits: 8, sign: '₿', title: 'биткоины' },
  { code: 'PTS', digits: 0, sign: 'очки', title: 'очки' },
] as const satisfies readonly Currency[]

// «₽ — рубли», «USDT», «очки»; неизвестный код — как есть
export function currencyLabel(code: string): string {
  const c: Currency | undefined = CURRENCIES.find((x) => x.code === code)
  if (!c) return code
  if (!c.sign || c.sign === c.title) return c.title
  return `${c.sign} — ${c.title}`
}

export type CurrencyCode = (typeof CURRENCIES)[number]['code']

export function isCurrencyCode(x: unknown): x is CurrencyCode {
  return typeof x === 'string' && CURRENCIES.some((c) => c.code === x)
}

export function currency(code: CurrencyCode): Currency {
  return CURRENCIES.find((c) => c.code === code) as Currency
}
