// Общее для экранов лота (этап 7, Р-09, Р-38): вид с сервера → состояние для правил lot.ts (чтобы кнопки
// решали те же проверки, что у сервера, — checkLotBid, checkLotWithdraw, checkHanded, checkDeclined,
// checkReceived, checkDisputed — на часах сервера), итог лота между опросами (lotOutcome с делом суда),
// строка статуса, подписи ставки и после торга, прошедшее для «Истории», долги для «Расчёта». Считают
// правила, здесь — только показ. Чистые функции без DOM — с тестами (lotParts.test.ts)
import type { CourtCase } from '../rules/appeal'
import { formatDateTime } from '../rules/date'
import { lotOutcome, type LotOutcome, type LotRoom, type LotState } from '../rules/lot'
import type { CourtVerdict, LotStatus, LotView } from '../rules/protocol'
import type { SavedRoom } from '../store/db'
import { courtCaseOf } from './courtParts'
import { money, nameOf } from './eventParts'
import { auctionOpenText, who } from './offerParts'

// Адрес экрана лота и «Нового лота»
export function lotHref(roomId: string, lotId: string): string {
  return `#/room/${roomId}/lot/${lotId}`
}

export function newLotHref(roomId: string): string {
  return `#/room/${roomId}/lot/new`
}

// Лот с сервера → состояние для правил: условия, конец с продлениями, ставки, отметки сторон. «Получил»
// отметкой — receivedAt; молчанием правила досчитают сами (handedAt + срок молчания), судом — по делу
// суда; суд собран — courtAt с мига сбора. Сроки — закреплённые при создании (times)
export function lotState(v: LotView): LotState {
  return {
    id: v.id,
    at: v.at,
    sellerId: v.sellerId,
    title: v.title,
    description: v.description,
    start: v.start,
    step: v.step,
    closesAt: v.closesAt,
    times: { ...v.times },
    endsAt: v.endsAt,
    bids: v.bids.map((b) => ({ id: b.id, at: b.at, by: b.by, amount: b.amount })),
    withdrawnAt: v.withdrawnAt,
    handedAt: v.handedAt,
    declinedAt: v.declinedAt,
    receivedAt: v.received?.how === 'mark' ? v.received.at : null,
    disputedAt: v.disputedAt,
    courtAt: v.court ? v.court.drawnAt : null,
  }
}

// Участники комнаты — для правил лота
export function lotRoomOf(room: SavedRoom): LotRoom {
  return { members: room.members.map((m) => m.id) }
}

// Дело суда по лоту из ответа (courtCaseOf) — для lotOutcome и проверок суда; суда нет — null
export function lotCourt(room: SavedRoom, v: LotView): CourtCase | null {
  return courtCaseOf(v.id, v, room.hostId, v.times)
}

// Итог лота на часах сервера (lotOutcome с делом суда, как у сервера)
export function lotOutcomeOf(room: SavedRoom, v: LotView, now: number): LotOutcome {
  return lotOutcome(lotState(v), now, lotCourt(room, v))
}

// Прошедший лот — итог есть: снят, не продан, получен, не состоялся, не передан
const PAST: readonly LotStatus[] = ['withdrawn', 'unsold', 'received', 'failed', 'undelivered']

// Миг, когда лот стал прошедшим (итог на now), или null — лот ещё идёт или ждёт передачи
export function lotPastAt(out: Pick<LotOutcome, 'status' | 'closedAt'>): number | null {
  return PAST.includes(out.status) ? out.closedAt : null
}

export function lotPastNow(room: SavedRoom, v: LotView, now: number): number | null {
  return lotPastAt(lotOutcomeOf(room, v, now))
}

// Лучшая ставка — словами: «Вера (вы) — 1 500 ₽»; ставок нет — «ставок нет, старт — 1 000 ₽»
export function bestLine(room: SavedRoom, v: LotView): string {
  const best = v.bids[v.bids.length - 1]
  return best ? `лучшая ставка — ${who(room, best.by)}, ${money(best.amount, room.currency)}` : `ставок нет, старт — ${money(v.start, room.currency)}`
}

// Строка статуса на часах сервера: что с лотом и чей ход; tone — класс строки статуса (как у пари)
export type LotStatusText = { text: string; tone: 'open' | 'closed' | 'cancelled' | 'final' }

export function lotStatusText(room: SavedRoom, v: LotView, now: number): LotStatusText {
  const out = lotOutcomeOf(room, v, now)
  const w = out.winner
  const sum = (n: number) => money(n, room.currency)
  switch (out.status) {
    case 'open':
      return { text: auctionOpenText(lotState(v).endsAt, now), tone: 'open' }
    case 'withdrawn':
      return { text: 'снят продавцом', tone: 'cancelled' }
    case 'unsold':
      return { text: 'не продан — ставок не было', tone: 'closed' }
    case 'failed':
      return { text: 'не состоялся — продавец не сможет передать, никто никому не должен', tone: 'cancelled' }
    case 'undelivered':
      return { text: 'не передан — решил суд, никто никому не должен', tone: 'cancelled' }
    case 'received':
      return { text: w ? `получен — долг ${nameOf(room, w.by)} → ${nameOf(room, v.sellerId)}: ${sum(w.amount)}` : 'получен', tone: 'final' }
    case 'awaiting':
      return { text: w ? `торг закончен — ждёт передачи: ${who(room, w.by)}, ${sum(w.amount)}` : 'ждёт передачи', tone: 'open' }
    case 'handed':
      return { text: w ? `продавец передал — ждём «Получил» от ${nameOf(room, w.by)}` : 'продавец передал', tone: 'open' }
    case 'dispute':
      return { text: 'в споре — победитель не получил, судить некому', tone: 'cancelled' }
    case 'court':
      return { text: 'ждёт суда — победитель отметил «Не получил»', tone: 'open' }
  }
}

// Сколько подставить в «Вашу ставку»: лучшая + шаг, ставок нет — старт
export function nextLotBid(v: LotView): number {
  const best = v.bids[v.bids.length - 1]
  return best ? best.amount + v.step : v.start
}

// Подсказка под полем ставки: «Не меньше 1 600 ₽: лучшая 1 500 ₽ + шаг 100 ₽» / «Не меньше старта — 1 000 ₽»
export function lotBidHint(v: LotView, currency: string): string {
  const best = v.bids[v.bids.length - 1]
  const sum = (n: number) => money(n, currency)
  return best ? `Не меньше ${sum(best.amount + v.step)}: лучшая ${sum(best.amount)} + шаг ${sum(v.step)}.` : `Не меньше старта — ${sum(v.start)}.`
}

// Окно ставки (основание числа, Р-10): «Вы ставите 1 600 ₽ за „Велосипед“ — продавец Боря»; вдвое больше
// лучшей (ставок нет — старта) — текст второго подтверждения: не лишний ли ноль
export function lotBidAskText(room: SavedRoom, v: LotView, amount: number): { body: string; twice: string | null } {
  const sum = (n: number) => money(n, room.currency)
  const best = v.bids[v.bids.length - 1]
  const body = `Вы ставите ${sum(amount)} за „${v.title}“ — продавец ${nameOf(room, v.sellerId)}${best ? `, лучшая сейчас — ${sum(best.amount)}` : ''}.`
  const base = best ? best.amount : v.start
  if (amount < 2 * base) return { body, twice: null }
  const what = best ? `лучшей ставки (${sum(best.amount)})` : `старта (${sum(v.start)})`
  return { body, twice: `${sum(amount)} — вдвое больше ${what}. Проверьте, нет ли лишнего нуля: ставка не отзывается.` }
}

// Вас перебили: торг идёт, у меня есть ставка, а лучшая — чужая
export function lotOutbid(room: SavedRoom, v: LotView, now: number): boolean {
  const me = room.memberId
  const best = v.bids[v.bids.length - 1]
  return lotOutcomeOf(room, v, now).status === 'open' && !!best && best.by !== me && v.bids.some((b) => b.by === me)
}

// Под формой «Нового лота» по ходу ввода: «Старт — 1 000 ₽, шаг — 100 ₽: первая ставка — не меньше старта,
// каждая следующая — больше лучшей хотя бы на шаг. Кто даст больше всех к концу торга — тот покупает».
// Чего не хватает — что ввести
export function lotSummary(x: { start: number | null; step: number | null; currency: string }): string {
  if (x.start === null) return 'Введите старт — наименьшую первую ставку.'
  const sum = (n: number) => money(n, x.currency)
  const step = x.step === null ? '' : `, шаг — ${sum(x.step)}`
  return `Старт — ${sum(x.start)}${step}: первая ставка — не меньше старта, каждая следующая — больше лучшей хотя бы на шаг. Кто даст больше всех к концу торга — тот покупает; передача — вне приложения.`
}

// Ход после торга — подсказка стороне: победителю после «Передал» — «если промолчите до …, считается
// получено»; победителю до «Передал» — с какого мига можно «Не получил»; продавцу — что ждём. Иначе null
export function afterLine(room: SavedRoom, v: LotView, now: number): string | null {
  const out = lotOutcomeOf(room, v, now)
  const me = room.memberId
  const winner = out.winner?.by
  if (out.status === 'handed' && me === winner && v.silenceUntil !== null) {
    return `Продавец отметил «Передал» ${formatDateTime(v.handedAt ?? 0)}. Если промолчите до ${formatDateTime(v.silenceUntil)}, считается получено.`
  }
  if (out.status === 'awaiting' && me === winner && v.disputeFrom !== null) {
    return now < v.disputeFrom
      ? `Вы выиграли торг. «Не получил» — после «Передал» продавца или с ${formatDateTime(v.disputeFrom)}, если он промолчит.`
      : 'Вы выиграли торг. Продавец не отметил «Передал» — можно «Не получил».'
  }
  if (out.status === 'awaiting' && me === v.sellerId) return `Торг закончен: передайте лот победителю — ${nameOf(room, winner ?? null)} — и отметьте «Передал».`
  if (out.status === 'handed' && me === v.sellerId && v.silenceUntil !== null) {
    return `Ждём «Получил» от ${nameOf(room, winner ?? null)}. Промолчит до ${formatDateTime(v.silenceUntil)} — считается получено.`
  }
  return null
}

// Как получено: «отметкой победителя», «молчанием победителя», «судом»
export function receivedHow(how: 'mark' | 'silence' | 'court'): string {
  return how === 'mark' ? 'отметкой победителя' : how === 'silence' ? 'молчанием победителя' : 'судом'
}

// Голос суда по лоту (Р-38): «передано» / «не передано»
export const LOT_VERDICTS: CourtVerdict[] = [{ verdict: 'delivered' }, { verdict: 'undelivered' }]

export function lotVerdictLabel(v: CourtVerdict): string {
  return v.verdict === 'delivered' ? 'передано' : v.verdict === 'undelivered' ? 'не передано' : v.verdict
}

// Почему лот у суда — для блока суда
export const LOT_COURT_WHY = 'победитель отметил «Не получил»'

// Долг по лоту для «Расчёта»: получен — победитель должен продавцу свою ставку, основание — «лот „…“»
export type LotDebt = { lot: string; title: string; from: string; to: string; amount: number; at: number }

export function lotDebts(room: SavedRoom, lots: readonly LotView[], now: number): LotDebt[] {
  return lots.flatMap((v) => {
    const out = lotOutcomeOf(room, v, now)
    if (out.status !== 'received' || !out.winner) return []
    return [{ lot: v.id, title: v.title, from: out.winner.by, to: v.sellerId, amount: out.winner.amount, at: out.closedAt ?? v.endsAt }]
  })
}

// Строка долга: «Вера (вы) → Боря: 1 500 ₽ — лот „Велосипед“»
export function lotDebtLine(room: SavedRoom, d: LotDebt): string {
  return `${who(room, d.from)} → ${who(room, d.to)}: ${money(d.amount, room.currency)} — лот „${d.title}“`
}

// Исход лота словами для «Истории»: «продан — Вера, 1 500 ₽» / «не продан — ставок не было» / «не
// состоялся — продавец не смог передать» / «не передан — решил суд» / «снят продавцом»
export function lotOutcomeWords(room: SavedRoom, v: LotView, out: Pick<LotOutcome, 'status' | 'winner'>): string {
  if (out.status === 'received' && out.winner) return `продан — ${nameOf(room, out.winner.by)}, ${money(out.winner.amount, room.currency)}`
  if (out.status === 'unsold') return 'не продан — ставок не было'
  if (out.status === 'failed') return 'не состоялся — продавец не смог передать'
  if (out.status === 'undelivered') return 'не состоялся — не передан, решил суд'
  if (out.status === 'withdrawn') return 'снят продавцом'
  return `„${v.title}“ ещё не закончен`
}

// Мой итог по прошедшему лоту: продавец получил — плюс ставка, победитель — минус; ставил, но не выиграл,
// или лот не состоялся — ноль; не продавал и не ставил — null
export function lotMine(v: LotView, me: string, out: Pick<LotOutcome, 'status' | 'winner'>): number | null {
  const sold = out.status === 'received' && out.winner ? out.winner : null
  if (me === v.sellerId) return sold ? sold.amount : 0
  if (!v.bids.some((b) => b.by === me)) return null
  return sold && sold.by === me ? -sold.amount : 0
}
