// Торг со ставками — общее у «Торга до …» пари (Р-37, offer.ts) и лота (Р-38, lot.ts): постоянные сроки
// решений (не темпа), шаг по умолчанию, предел и правило продления, проверка следующей ставки. Тексты
// отказов — у каждого модуля свои. Ни DOM, ни Cloudflare
const MINUTE = 60 * 1000

// Торг — от 10 минут до 3 дней с создания; ставка за 2 минуты до конца переносит конец на 2 минуты после
// себя, но не дальше исходного конца + 30 минут
export const AUCTION_MIN = 10 * MINUTE
export const AUCTION_MAX = 3 * 24 * 60 * MINUTE
export const AUCTION_EXTEND = 2 * MINUTE
export const AUCTION_EXTEND_MAX = 30 * MINUTE

// Условия торга: старт — наименьшая первая ставка, шаг — на сколько следующая больше лучшей
export type AuctionTerms = { start: number; step: number }

// Шаг по умолчанию — 10 % старта вниз до целой единицы, не меньше одной
export function auctionStep(start: number): number {
  return Math.max(1, Math.floor(start / 10))
}

// Позже этого торг не закончится: исходный конец (closesAt) + 30 минут продлений
export function auctionLatestEnd(o: { closesAt: number }): number {
  return o.closesAt + AUCTION_EXTEND_MAX
}

// Лучшая ставка — последняя действующая (каждая больше прежней); ставок нет — null
export function lastBid<B>(a: { bids: readonly B[] }): B | null {
  return a.bids[a.bids.length - 1] ?? null
}

// Конец торга после ставки в миг at: за 2 минуты до конца — через 2 минуты после ставки, не дальше предела
export function extendEnd(a: { endsAt: number; closesAt: number }, at: number): number {
  return Math.min(auctionLatestEnd(a), Math.max(a.endsAt, at + AUCTION_EXTEND))
}

// Исходный конец торга по времени сервера now: 'short' — раньше чем через 10 минут, 'long' — позже чем
// через 3 дня; годный — null
export function auctionSpan(closesAt: number, now: number): 'short' | 'long' | null {
  if (closesAt < now + AUCTION_MIN) return 'short'
  if (closesAt > now + AUCTION_MAX) return 'long'
  return null
}

// Следующая ставка amount (целое > 0 проверяет вызывающий): 'low' — первая меньше старта, 'step' — меньше
// лучшей (best; нет — null) + шаг; годная — null
export function nextBid(amount: number, best: number | null, terms: AuctionTerms): 'low' | 'step' | null {
  if (best === null) return amount < terms.start ? 'low' : null
  return amount < best + terms.step ? 'step' : null
}
