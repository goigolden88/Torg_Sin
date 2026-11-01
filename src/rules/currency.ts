// Валюты комнаты (Р-07): одна на комнату, выбирается при создании. Новая валюта — строка
// таблицы. Суммы хранятся целыми в минимальных единицах: digits — знаков после запятой.
// Здесь же — разбор суммы из поля ввода (parseAmount) и показ суммы (formatAmount)
export type Currency = {
  code: string
  digits: number // знаков после запятой: 100 единиц RUB = 1,00 ₽
  sign: string // знак при сумме; пусто — показывается код; без числа («Сумма, очки») — как есть
  title: string // для выбора валюты на экране
  forms?: readonly [string, string, string] // слово при числе вместо знака: «1 очко», «2 очка», «5 очков»
}

export const CURRENCIES = [
  { code: 'RUB', digits: 2, sign: '₽', title: 'рубли' },
  { code: 'USD', digits: 2, sign: '$', title: 'доллары' },
  { code: 'EUR', digits: 2, sign: '€', title: 'евро' },
  { code: 'USDT', digits: 2, sign: '', title: 'USDT' },
  { code: 'BTC', digits: 8, sign: '₿', title: 'биткоины' },
  { code: 'PTS', digits: 0, sign: 'очки', title: 'очки', forms: ['очко', 'очка', 'очков'] },
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

const NBSP = ' '

export type ParsedAmount = { ok: true; units: number } | { ok: false; error: string }

// Сумма из поля ввода → целое в минимальных единицах: «1 200,50», «1200.5», «300».
// Пробелы между разрядами (и неразрывные) допустимы; запятая или точка — дробная часть
export function parseAmount(text: string, code: CurrencyCode): ParsedAmount {
  const { digits } = currency(code)
  const s = text.replace(/[\s  ]/g, '')
  if (s === '') return { ok: false, error: 'Введите сумму' }
  if (/^[-−–]/.test(s)) return { ok: false, error: 'Сумма не может быть меньше нуля' }
  const m = /^(\d+)(?:[.,](\d+))?$/.exec(s)
  if (!m) return { ok: false, error: 'Сумма — число, например 1 200,50' }
  const frac = m[2] ?? ''
  if (frac.length > digits) {
    return {
      ok: false,
      error: digits === 0 ? 'Сумма — целое число, без запятой' : `Не больше ${digits} знаков после запятой`,
    }
  }
  const big = BigInt(m[1] + frac.padEnd(digits, '0'))
  if (big === 0n) return { ok: false, error: 'Сумма должна быть больше нуля' }
  if (big > BigInt(Number.MAX_SAFE_INTEGER)) return { ok: false, error: 'Слишком большая сумма' }
  return { ok: true, units: Number(big) }
}

// Слово при числе по-русски: forms — [«1 очко», «2 очка», «5 очков»]. Решают две последние цифры:
// 11–14 — «очков»; иначе последняя: 1 — «очко», 2–4 — «очка», прочие — «очков». Знак числа не влияет
export function plural(n: bigint, forms: readonly [string, string, string]): string {
  const a = n < 0n ? -n : n
  const two = a % 100n
  const one = a % 10n
  if (two >= 11n && two <= 14n) return forms[2]
  if (one === 1n) return forms[0]
  if (one >= 2n && one <= 4n) return forms[1]
  return forms[2]
}

// Целое в минимальных единицах → «1 200,50 ₽», «0,00012 ₿», «15 очков», «21 очко», «15 USDT» (у USDT
// знака нет — код). У валюты со словом (forms) оно склоняется по числу; дробное — «1,5 очка».
// Пробелы между разрядами и перед знаком — неразрывные. Целая сумма — без дробной части;
// дробная — не меньше 2 знаков, лишние нули справа убираются: «1 200 ₽», «1 200,50 ₽». Минус — «−»
export function formatAmount(units: number, code: CurrencyCode): string {
  const c = currency(code)
  const neg = units < 0
  const raw = BigInt(Math.abs(Math.trunc(units)))
    .toString()
    .padStart(c.digits + 1, '0')
  const whole = raw.slice(0, raw.length - c.digits)
  let frac = raw.slice(raw.length - c.digits).replace(/0+$/, '')
  if (frac !== '' && frac.length < 2) frac = frac.padEnd(Math.min(2, c.digits), '0')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP)
  const num = (neg ? '−' : '') + grouped + (frac ? ',' + frac : '')
  const word = c.forms ? (frac ? c.forms[1] : plural(BigInt(whole), c.forms)) : c.sign || c.code
  return `${num}${NBSP}${word}`
}
