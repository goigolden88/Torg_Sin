// «История» комнаты (Р-11, этап 5): что считается прошедшим, когда оно им стало, исход и мой результат
// одной строкой. Прошедшее уходит из «Событий» и «Пари» комнаты сюда. Событие — исход окончательный или
// событие отменено (и судом); пари — исход окончательный или отменён судом, либо пари не состоялось
// (истекло, отозвано, закрыто встречным; торг — никто не дал старт, Р-37). Суммы торга — из сумм (stakesOf). Остальное — не прошедшее, в том числе «голосование», «снято»
// (Р-27), «ждёт суда», утверждён и идёт неделя апелляции; у пари — фазы гаранта (Р-31), суд, «утверждено».
// Чистые функции без DOM — с тестами (historyParts.test.ts); статус и фазу считают правила (event.ts,
// offer.ts), здесь — только выбор
import { offerNets, offerStatus, type OfferOutcome, type OfferSide } from '../rules/offer'
import type { EventView, OfferStatus, OfferView, OutcomeView } from '../rules/protocol'
import type { SavedRoom } from '../store/db'
import { offerOutcomeOf, offerState, stakesOf } from './offerParts'
import { signedSum, sumText } from './settleParts'

// Адрес экрана «История» комнаты
export function historyHref(roomId: string): string {
  return `#/room/${roomId}/history`
}

// Исход события на now: сервер прислал «утверждён», а неделя уже прошла между опросами — «окончательный»
// (как eventOutcome: окончательный с finalAt)
function eventPhase(o: OutcomeView, now: number): OutcomeView['status'] {
  return o.status === 'approved' && o.finalAt !== null && now >= o.finalAt ? 'final' : o.status
}

// Миг, когда событие стало прошедшим (на время сервера now); не прошедшее — null. Отменено — миг отмены;
// отменено судом — миг решения суда; окончательный — с какого мига
export function eventPastAt(e: Pick<EventView, 'cancelled' | 'outcome'>, now: number): number | null {
  if (e.cancelled) return e.cancelled.at
  const o = e.outcome
  if (!o) return null
  const status = eventPhase(o, now)
  if (status === 'cancelled') return o.court?.decision?.at ?? o.approved?.at ?? o.proposal.at
  if (status === 'final') return o.finalAt ?? o.approved?.at ?? o.proposal.at
  return null
}

// Исход пари — то, что нужно для «Истории» (offerOutcome на часах сервера)
export type OfferPhaseNow = Pick<OfferOutcome, 'phase' | 'finalAt' | 'approved' | 'court'>

// Миг, когда пари стало прошедшим; не прошедшее — null. status — offerStatus на now, out — исход на now
// (offerOutcomeOf; не принято — null). Отозвано — миг отзыва; закрыто встречным — миг принятия встречного;
// истекло — «приём до»; торг не состоялся (Р-37) — конец торга с продлениями; окончательно — с какого
// мига; отменено судом — миг решения суда
export function offerPastAt(
  o: Pick<OfferView, 'closesAt' | 'withdrawnAt' | 'closedBy' | 'bidding'>,
  status: OfferStatus,
  out: OfferPhaseNow | null,
): number | null {
  if (status === 'withdrawn') return o.withdrawnAt ?? o.closesAt
  if (status === 'countered') return o.closedBy?.at ?? o.closesAt
  if (status === 'expired') return o.closesAt
  if (status === 'failed') return o.bidding?.result?.at ?? o.bidding?.endsAt ?? o.closesAt
  if (status !== 'accepted' || !out) return null
  if (out.phase === 'final') return out.finalAt ?? out.approved?.at ?? o.closesAt
  if (out.phase === 'cancelled') return out.court?.decision?.at ?? o.closesAt
  return null
}

// Пари на экране: статус и исход на часах сервера → миг прошедшего
export function offerPastNow(room: SavedRoom, o: OfferView, now: number): number | null {
  return offerPastAt(o, offerStatus(offerState(o), now), offerOutcomeOf(room, o, now))
}

// Мой результат: участвовал — итог со знаком (у отменённого и не состоявшегося — ноль; refund — сколько
// вернулось); не участвовал — none
export type MyResult = { kind: 'none' } | { kind: 'net'; amount: number; refund: number }

// Строка «Истории»: событие или пари, что и когда, исход словами, мой результат
export type HistoryItem = {
  kind: 'event' | 'offer'
  id: string
  condition: string
  at: number // когда стало прошедшим
  outcome: string // «Да», «отменено», «не состоялось — отозвано»
  mine: MyResult
}

// Строка события: исход — название утверждённого («Да»; «без игры» — пометкой), «отменено» / «отменено
// судом»; мой результат — net из выплат исхода, у отменённого — возврат моих ставок. Участник — кто ставил
export function eventItem(e: EventView, me: string, now: number): HistoryItem | null {
  const at = eventPastAt(e, now)
  if (at === null) return null
  const staked = e.bets.filter((b) => b.memberId === me).reduce((s, b) => s + b.amount, 0)
  const bet = e.bets.some((b) => b.memberId === me)
  const base = { kind: 'event' as const, id: e.id, condition: e.condition, at }
  const o = e.outcome
  if (e.cancelled || !o || eventPhase(o, now) === 'cancelled') {
    return { ...base, outcome: e.cancelled ? 'отменено' : 'отменено судом', mine: bet ? { kind: 'net', amount: 0, refund: staked } : { kind: 'none' } }
  }
  const title = e.outcomes.find((x) => x.id === o.approved?.outcome)?.title ?? 'исход'
  const net = o.payouts.find((p) => p.memberId === me)?.net ?? 0
  return { ...base, outcome: o.void ? `${title} — без игры` : title, mine: bet ? { kind: 'net', amount: net, refund: 0 } : { kind: 'none' } }
}

// Сторона пари участника: автор, принявший или никто
function sideOf(o: OfferView, me: string): OfferSide | null {
  if (o.authorId === me) return 'author'
  if (o.accepted?.by === me) return 'taker'
  return null
}

// «сбылось» / «не сбылось» по стороне автора и тому, кто прав
function offerVerdict(o: OfferView, winner: OfferSide): string {
  const yes = (o.side === 'yes') === (winner === 'author')
  return yes ? 'Сбылось' : 'Не сбылось'
}

const NOT_HAPPENED: Partial<Record<OfferStatus, string>> = {
  expired: 'не состоялось — истекло',
  withdrawn: 'не состоялось — отозвано',
  countered: 'не состоялось — закрыто встречным',
  failed: 'не состоялось — никто не дал старт', // торг без встречных (Р-37)
}

// Строка пари: исход — «Сбылось» / «Не сбылось», «отменено судом», «не состоялось — …»; мой результат —
// итог моей стороны (offerNets), у отменённого судом — возврат моей ставки, у не состоявшегося — ноль.
// Участник — автор или принявший. status и out — как у offerPastAt
export function offerItem(o: OfferView, me: string, status: OfferStatus, out: OfferPhaseNow | null): HistoryItem | null {
  const at = offerPastAt(o, status, out)
  if (at === null) return null
  const side = sideOf(o, me)
  const base = { kind: 'offer' as const, id: o.id, condition: o.condition, at }
  const none = { kind: 'none' } as const
  const notHappened = NOT_HAPPENED[status]
  if (notHappened) return { ...base, outcome: notHappened, mine: side ? { kind: 'net', amount: 0, refund: 0 } : none }
  const stakes = stakesOf(o)
  if (out?.phase === 'cancelled') {
    const refund = side && stakes ? stakes[side] : 0
    return { ...base, outcome: 'отменено судом', mine: side ? { kind: 'net', amount: 0, refund } : none }
  }
  const winner = out?.approved?.winner ?? 'author'
  const net = side && stakes ? offerNets(stakes, winner)[side] : 0
  return { ...base, outcome: offerVerdict(o, winner), mine: side ? { kind: 'net', amount: net, refund: 0 } : none }
}

// Всё прошедшее комнаты, новое сверху (по мигу, когда стало прошедшим; равные — по номеру, новый выше)
export function historyItems(room: SavedRoom, events: readonly EventView[], offers: readonly OfferView[], now: number): HistoryItem[] {
  const me = room.memberId
  const items = [
    ...events.map((e) => eventItem(e, me, now)),
    ...offers.map((o) => offerItem(o, me, offerStatus(offerState(o), now), offerOutcomeOf(room, o, now))),
  ].filter((x): x is HistoryItem => x !== null)
  return items.sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
}

// Переключатель «Все / С моим участием»
export function onlyMine(items: readonly HistoryItem[], mine: boolean): HistoryItem[] {
  return mine ? items.filter((x) => x.mine.kind !== 'none') : [...items]
}

// Мой результат словами: «+300 ₽», «−100 ₽», «0 ₽ — вернулось 300 ₽», «вы не участвовали» (без рода)
export function myResultText(mine: MyResult, currency: string): string {
  if (mine.kind === 'none') return 'вы не участвовали'
  const text = signedSum(mine.amount, currency)
  return mine.refund > 0 ? `${text} — вернулось ${sumText(mine.refund, currency)}` : text
}

// Строка в комнате под «Пари»: «История · 12»; ноль — строки нет
export function historyLine(count: number): string | null {
  return count > 0 ? `История · ${count}` : null
}
