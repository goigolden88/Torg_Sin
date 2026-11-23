// Общее для экранов пари: вид с сервера → состояние для правил (с ходом исхода), суммы сторон по кэфу,
// итог сторон по исходу, строка статуса с отсчётом и фазой исхода по времени сервера, поле кэфа, окно
// подтверждения. Считают правила (offer.ts), здесь — только показ
import type { Result } from '../api'
import type { CourtCase } from '../rules/appeal'
import { currency as currencyOf, type CurrencyCode } from '../rules/currency'
import { formatCountdown, formatDateTime } from '../rules/date'
import {
  auctionLatestEnd,
  bestBid,
  MAX_ODDS,
  MIN_ODDS,
  offerAmounts,
  offerAt,
  offerNets,
  offerOutcome,
  offerStakes,
  offerStatus,
  subjectIsSide,
  type AuctionState,
  type OfferOutcome,
  type OfferSide,
  type OfferState,
  type OfferStakes,
  type RoomRoles,
} from '../rules/offer'
import type { OfferView } from '../rules/protocol'
import type { SavedRoom } from '../store/db'
import { courtCaseOf } from './courtParts'
import { money, nameOf } from './eventParts'
import { spanText, viewTimes } from './paceParts'

export function offerHref(roomId: string, offerId: string): string {
  return `#/room/${roomId}/offer/${offerId}`
}

// «Повторить» не состоявшийся торг (Р-37): «Предложить пари» с условиями пари offerId
export function repeatHref(roomId: string, offerId: string): string {
  return `#/room/${roomId}/offer/new?repeat=${encodeURIComponent(offerId)}`
}

// Форма «Повторить»: те же условие, «как проверяем», сторона, сумма, старт, шаг, о ком спор и гарант;
// сроки — та же длительность торга от нового «сейчас» (вверх до минуты: поле — до минуты) и тот же
// промежуток до «исход к». Человек может поправить до отправки
export type RepeatForm = {
  condition: string
  check: string
  side: 'yes' | 'no'
  amount: number
  start: number
  step: number
  subject: string // '' — ни о ком
  guarantor: string // '' — ведущий
  none: boolean // без гаранта
  closesAt: number
  expectedAt: number
}
export function repeatForm(o: OfferView, hostId: string, now: number): RepeatForm | null {
  if (!o.auction) return null
  const MINUTE = 60 * 1000
  const closesAt = Math.ceil((now + Math.max(0, o.closesAt - o.at)) / MINUTE) * MINUTE
  return {
    condition: o.condition,
    check: o.check,
    side: o.side,
    amount: o.amount,
    start: o.auction.start,
    step: o.auction.step,
    subject: o.subjectId ?? '',
    guarantor: o.guarantorId === null || o.guarantorId === hostId ? '' : o.guarantorId,
    none: o.guarantorId === null,
    closesAt,
    expectedAt: closesAt + Math.max(0, o.expectedAt - o.closesAt),
  }
}

// Окно подтверждения действия с пари: что спрашиваем, основание, кнопка и запрос
export type OfferAsk = {
  question: string
  body: string[]
  button: string
  busyLabel: string
  form: string // номер запроса — по пари, действию и содержимому
  run: (requestId: string) => Promise<Result<{ v: number; offer?: { id: string } }>> // встречное — новое пари в offer
  twice?: string // второе подтверждение (встречное в торге вдвое больше лучшего, Р-37): что спросить
}

// Ход исхода из ответа (outcome) → поля состояния для правил так, чтобы offerOutcome, checkMark,
// checkDecide, checkDecline и checkNominate на часах сервера дали то же, что сервер: с какого мига решает
// гарант (turnAt — как миг расхождения; отметки — не раньше, чем turnAt минус срок молчания пари), до какого
// он решает (guarantorUntil — срок молчания с guarantorSince; сроки — пари, Р-35), отказ или пропуск срока (needSince), утверждено
// согласием или гарантом; суд по «ждёт суда» (Р-31: суд без апелляции — courtAt с мига сбора, а другой
// гарант нужен с needSince). Сами записи журнала сайту не приходят; между опросами фаза идёт по часам
function outcomeState(
  o: OfferView,
): Pick<OfferState, 'guarantorSince' | 'marks' | 'disagreedAt' | 'agreed' | 'decision' | 'declinedAt' | 'nominations' | 'courtAt'> {
  const out = o.outcome
  if (!out) return { guarantorSince: null, marks: [], disagreedAt: null, agreed: null, decision: null, declinedAt: null, nominations: {}, courtAt: null }
  const silence = viewTimes(o).silence // сроки пари (Р-35); у пари до темпа — обычные
  const markAt = Math.max(o.expectedAt, out.turnAt - silence)
  const sides: OfferSide[] = ['author', 'taker']
  const courtAt = out.court && !out.appeal ? out.court.drawnAt : null
  // Суд изменил решение гаранта (Р-24): в ответе — новый исход, а правилам нужно решение гаранта, на
  // которое подана апелляция (согласие не обжалуется): прав был другой, решено не позже подачи. Суд по
  // «ждёт суда» решал без утверждённого исхода — до него не было ничего
  const a =
    courtAt !== null
      ? null
      : out.approved?.how === 'court'
        ? { winner: other(out.approved.winner), at: out.appeal?.at ?? out.court?.drawnAt ?? out.approved.at, how: 'guarantor' as const, by: out.guarantorId }
        : out.approved
  return {
    guarantorSince: out.guarantorUntil === null ? null : out.guarantorUntil - silence,
    marks: sides.flatMap((by) => {
      const winner = out.marks[by]
      return winner ? [{ by, winner, at: markAt }] : []
    }),
    disagreedAt: out.turnAt,
    agreed: a?.how === 'agreement' ? { winner: a.winner, at: a.at } : null,
    // Решение гаранта бывает, только когда гарант есть
    decision: a?.how === 'guarantor' ? { winner: a.winner, at: a.at, by: a.by ?? out.guarantorId ?? '' } : null,
    declinedAt: out.phase === 'need-guarantor' || courtAt !== null ? out.needSince : null,
    nominations: { ...out.nominations },
    courtAt,
  }
}

// Торг из ответа (Р-37) → состояние торга для правил (checkBid, checkTakeBid, checkWithdraw,
// offerStatus): старт, шаг, конец с продлениями, встречные и как принято лучшее. Конец торга между
// опросами — offerAt на часах сервера: лучшее принимается само, без встречных — «не состоялось»
// Хода торга в ответе нет — встречных нет, конец — исходный
function auctionState(o: OfferView): AuctionState | null {
  if (!o.auction) return null
  const how = o.bidding?.result?.how
  return {
    start: o.auction.start,
    step: o.auction.step,
    endsAt: o.bidding?.endsAt ?? o.closesAt,
    bids: (o.bidding?.bids ?? []).map((b) => ({ id: b.id, at: b.at, by: b.by, amount: b.amount })),
    taken: how === 'now' || how === 'end' ? how : null,
  }
}

// Пари с сервера → состояние для правил (checkAccept, checkWithdraw, checkCounter, offerStatus, sideOf;
// исход — offerOutcome, checkMark, checkDecide, checkDecline, checkNominate; торг — checkBid,
// checkTakeBid): условия, адресат, гарант, кто принял, отзыв, «закрыто встречным», торг (auctionState)
// и ход исхода (outcomeState)
export function offerState(o: OfferView): OfferState {
  const auction = auctionState(o)
  return {
    id: o.id,
    at: o.at,
    authorId: o.authorId,
    condition: o.condition,
    check: o.check,
    side: o.side,
    odds: o.odds,
    amount: o.amount,
    to: o.to,
    closesAt: o.closesAt,
    expectedAt: o.expectedAt,
    counterTo: o.counterTo,
    subject: o.subjectId,
    guarantorRule: o.guarantorRule,
    guarantorId: o.guarantorId,
    accepted: o.accepted,
    withdrawnAt: o.withdrawnAt,
    closedBy: o.closedBy,
    ...(o.times && { times: o.times }),
    ...(auction && { auction }),
    ...outcomeState(o),
  }
}

// Другая сторона пари
export function other(side: OfferSide): OfferSide {
  return side === 'author' ? 'taker' : 'author'
}

// Дело суда по пари из ответа (courtCaseOf) — для offerOutcome и проверок апелляции; суда нет — null
export function offerCourt(room: SavedRoom, o: OfferView): CourtCase | null {
  return courtCaseOf(o.id, o.outcome, room.hostId, o.times)
}

// Исход пари на часах сервера с учётом суда (offerOutcome с делом суда, как у сервера)
export function offerOutcomeOf(room: SavedRoom, o: OfferView, now: number): OfferOutcome | null {
  return offerOutcome(offerState(o), now, offerCourt(room, o))
}

// Номер участника стороны: автор или принявший
export function sideMember(o: OfferView, side: OfferSide): string {
  return side === 'author' ? o.authorId : (o.accepted?.by ?? '')
}

// «прав автор» / «прав соперник»
export function winnerLabel(winner: OfferSide): string {
  return winner === 'author' ? 'прав автор' : 'прав соперник'
}

// Итог по исходу (offerNets): кто забирает банк и плюс / минус каждой стороны — «Аня получает банк
// 400 ₽: Аня +100 ₽, Боря −100 ₽». Сумм нет (кэф с сервера не тот) — только кто прав
export function netsOf(room: SavedRoom, o: OfferView, winner: OfferSide) {
  const s = stakesOf(o)
  if (!s) return null
  const nets = offerNets(s, winner)
  const sum = (n: number) => money(n, room.currency)
  const signed = (n: number) => (n > 0 ? '+' : '') + sum(n)
  return {
    bank: sum(s.bank),
    winner: nameOf(room, sideMember(o, winner)),
    lines: (['author', 'taker'] as const).map((side) => ({ side, name: nameOf(room, sideMember(o, side)), net: nets[side], text: signed(nets[side]) })),
  }
}

// Строка исхода у принятого (offerOutcome на часах сервера): до «исход к» без отметок — «ждём исхода
// к …»; дальше — фаза; окончательно — плюс выигравшего
function acceptedLine(room: SavedRoom, offer: OfferView, now: number) {
  const out = offerOutcomeOf(room, offer, now)
  if (!out || (out.phase === 'marking' && now < offer.expectedAt && !out.marks.author && !out.marks.taker)) {
    return <span className="status open">принято — ждём исхода к {formatDateTime(offer.expectedAt)}</span>
  }
  if (out.phase === 'marking') return <span className="status open">принято — ждём отметок сторон</span>
  if (out.phase === 'guarantor') return <span className="status open">решает гарант — {who(room, out.guarantorId)}</span>
  // Без гаранта (Р-36): «нужен гарант» — суд не собрать (или ещё не собран), в суде — почему
  if (out.phase === 'need-guarantor') return <span className="status cancelled">{out.guarantorId === null ? 'нужен гарант' : 'нужен новый гарант'}</span>
  if (out.phase === 'court') {
    const why = out.guarantorId === null ? courtWhy(room, offer, out.marks) : `${spanText(viewTimes(offer).silence)} без общего гаранта`
    return <span className="status open">ждёт суда — {why}</span>
  }
  if (out.phase === 'cancelled') return <span className="status cancelled">отменено судом — ставки возвращены</span>
  const winner = out.approved?.winner ?? 'author'
  const nets = netsOf(room, offer, winner)
  const plus = nets ? `${nets.lines.find((l) => l.side === winner)?.text} ${nets.winner}` : winnerLabel(winner)
  if (out.phase === 'approved' && out.finalAt === null) return <span className="status open">апелляция — решает суд</span>
  if (out.phase === 'approved') {
    return (
      <span className="status open">
        утверждено гарантом: {plus}, окончательно {out.finalAt === null ? '' : formatDateTime(out.finalAt)}
      </span>
    )
  }
  return <span className="status final">окончательно: {plus}</span>
}

// Ведущий и участники комнаты — для правил пари
export function roomRolesOf(room: SavedRoom): RoomRoles {
  return { hostId: room.hostId, members: room.members.map((m) => m.id) }
}

// Суммы обеих сторон и банк — по кэфу (offerStakes); у торга (Р-37) — из сумм (offerAmounts: принятое
// встречное, до конца — лучшее, без встречных — старт); сервер прислал другое — нет сумм
export function stakesOf(o: OfferView): OfferStakes | null {
  if (o.auction) {
    const ok = (x: number) => Number.isSafeInteger(x) && x >= 1
    if (!ok(o.amount) || !ok(o.auction.start)) return null
    const s = offerAmounts(offerState(o))
    return s.ok && ok(s.value.taker) && Number.isSafeInteger(s.value.bank) ? s.value : null
  }
  if (!validOdds(o.odds) || !Number.isSafeInteger(o.amount)) return null
  const s = offerStakes(o.odds, o.amount)
  return s.ok ? s.value : null
}

// «сбудется» / «не сбудется» — сторона автора; у соперника — обратная
export function sideLabel(side: 'yes' | 'no'): string {
  return side === 'yes' ? 'сбудется' : 'не сбудется'
}

export function oddsLabel(odds: { a: number; b: number }): string {
  return `${odds.a} к ${odds.b}`
}

// «Аня (вы)» — для себя, иначе имя
export function who(room: SavedRoom, memberId: string | null): string {
  // Гаранта нет (пари без гаранта, Р-36)
  if (memberId === null) return 'без гаранта'
  return nameOf(room, memberId) + (memberId === room.memberId ? ' (вы)' : '')
}

// Гарант в условиях пари: имя или, у пари без гаранта (Р-36), «нет — спор решит суд»
export function guarantorLabel(room: SavedRoom, o: { guarantorId: string | null }): string {
  return o.guarantorId === null ? NO_GUARANTOR_LABEL : who(room, o.guarantorId)
}
export const NO_GUARANTOR_LABEL = 'нет — спор решит суд'

// Почему пари без гаранта (Р-36) ушло в суд — по отметкам сторон: «стороны разошлись» / «Вера
// промолчал(а) 3 дня» / «обе стороны промолчали 3 дня после «исход к»». Срок — пари (Р-35)
export function courtWhy(room: SavedRoom, o: OfferView, marks: Record<OfferSide, OfferSide | null>): string {
  const silence = spanText(viewTimes(o).silence)
  if (marks.author !== null && marks.taker !== null) return 'стороны разошлись'
  if (marks.author === null && marks.taker === null) return `обе стороны промолчали ${silence} после «исход к»`
  const silent: OfferSide = marks.author === null ? 'author' : 'taker'
  return `${nameOf(room, sideMember(o, silent))} промолчал(а) ${silence}`
}

// Основание чисел (Р-10): «Аня ставит 300 ₽ на „сбудется“, соперник — 100 ₽ (кэф 3 к 1), банк 400 ₽»
// Торг (Р-37), now — часы сервера: до конца — «лучшее встречное — Вера, 10 000 ₽ (кэф 1 к 33)» или
// «старт — 1 000 ₽ (кэф 1 к 3,3), встречных нет»; принято — как у обычного пари, с именем соперника
export function stakesLine(room: SavedRoom, o: OfferView, now?: number): string {
  const s = stakesOf(o)
  if (!s) return o.auction ? `старт — ${money(o.auction.start, room.currency)}` : `кэф ${oddsLabel(o.odds)}`
  const sum = (n: number) => money(n, room.currency)
  const author = o.authorId === room.memberId ? 'вы ставите' : `${nameOf(room, o.authorId)} ставит`
  const mine = `${author} ${sum(s.author)} на „${sideLabel(o.side)}“`
  const who = (id: string) => (id === room.memberId ? 'вы' : nameOf(room, id))
  if (o.auction) {
    const odds = `кэф ${amountsOddsLabel(s.author, s.taker)}`
    const state = now === undefined ? offerState(o) : offerAt(offerState(o), now)
    if (state.accepted) return `${mine}, ${who(state.accepted.by)} — ${sum(s.taker)} (${odds}), банк ${sum(s.bank)}`
    const best = state.auction ? bestBid(state.auction) : null
    if (best) return `${mine}, лучшее встречное — ${who(best.by)}, ${sum(s.taker)} (${odds}), банк ${sum(s.bank)}`
    return `${mine}, старт — ${sum(s.taker)} (${odds}), встречных нет`
  }
  const taker = o.accepted ? who(o.accepted.by) : 'соперник'
  return `${mine}, ${taker} — ${sum(s.taker)} (кэф ${oddsLabel(o.odds)}), банк ${sum(s.bank)}`
}

// Кэф торга из сумм (Р-37; только для показа): меньшая сторона — 1, большая — во сколько раз больше:
// до 10 — с одним знаком после запятой («1 к 1,5»), дальше — целым («1 к 33»); ровно — без дроби
export function amountsOddsLabel(author: number, taker: number): string {
  const ratio = (big: number, small: number) => {
    const r = big / small
    if (Number.isInteger(r)) return String(r)
    if (r >= 10) return String(Math.round(r))
    const one = Math.round(r * 10) / 10
    return String(one).replace('.', ',')
  }
  return author >= taker ? `${ratio(author, taker)} к 1` : `1 к ${ratio(taker, author)}`
}

// Сколько подставить в «Ваше встречное»: лучшее + шаг, без встречных — старт
export function nextBid(o: OfferView): number | null {
  if (!o.auction) return null
  const best = o.bidding?.best
  return best ? best.amount + o.auction.step : o.auction.start
}

// Встречное вдвое больше лучшего (без встречных — старта) — второе подтверждение: не лишний ли ноль
export function bidIsLarge(o: OfferView, amount: number): boolean {
  if (!o.auction) return false
  const base = o.bidding?.best?.amount ?? o.auction.start
  return amount >= 2 * base
}

// Вас перебили: торг идёт, у меня есть встречное, а лучшее — чужое
export function outbid(o: OfferView, me: string, now: number): boolean {
  const state = offerState(o)
  if (!state.auction || offerStatus(state, now) !== 'open') return false
  const best = bestBid(state.auction)
  return !!best && best.by !== me && state.auction.bids.some((b) => b.by === me)
}

// Окно встречного (основание чисел, Р-10): «Вы ставите 10 000 ₽ против 300 ₽ автора — кэф 1 к 33, банк
// 10 300 ₽»; вдвое больше лучшего — текст второго подтверждения
export function bidAskText(room: SavedRoom, o: OfferView, amount: number): { body: string; twice: string | null } {
  const sum = (n: number) => money(n, room.currency)
  const body = `Вы ставите ${sum(amount)} против ${sum(o.amount)} автора (${nameOf(room, o.authorId)}) — кэф ${amountsOddsLabel(o.amount, amount)}, банк ${sum(o.amount + amount)}.`
  if (!bidIsLarge(o, amount) || !o.auction) return { body, twice: null }
  const best = o.bidding?.best
  const base = best ? `лучшего встречного (${sum(best.amount)})` : `старта (${sum(o.auction.start)})`
  return { body, twice: `${sum(amount)} — вдвое больше ${base}. Проверьте, нет ли лишнего нуля: встречное не отзывается.` }
}

// Итог торга одной строкой (Р-37) на часах сервера: «Торг закончен — соперник Вера, 10 000 ₽» (автор
// принял сейчас — «автор принял сейчас»), «Не состоялось — никто не дал старт»; торг идёт или его не
// было — null
export function auctionResultText(room: SavedRoom, o: OfferView, now: number): string | null {
  const state = offerState(o)
  if (!state.auction) return null
  const status = offerStatus(state, now)
  if (status === 'failed') return 'Не состоялось — никто не дал старт'
  if (status !== 'accepted') return null
  const x = offerAt(state, now)
  const best = x.auction ? bestBid(x.auction) : null
  if (!best) return null
  const how = x.auction?.taken === 'now' ? ' (автор принял сейчас)' : ''
  return `Торг закончен${how} — соперник ${who(room, best.by)}, ${money(best.amount, room.currency)}`
}

// «Торг закончится не позже …» — исходный конец + 30 минут продлений (auctionLatestEnd)
export function latestEndLine(closesAt: number): string {
  return `Торг закончится не позже ${formatDateTime(auctionLatestEnd({ closesAt }))}: встречное за 2 минуты до конца продлевает торг на 2 минуты, всего — не больше чем на 30 минут.`
}

// Сумма в поле: минимальные единицы → «100» или «100,5» (подсказка во встречном, старт и шаг торга)
export function unitsText(units: number, code: CurrencyCode): string {
  const digits = currencyOf(code).digits
  if (digits === 0) return String(units)
  const s = String(units).padStart(digits + 1, '0')
  const frac = s.slice(-digits).replace(/0+$/, '')
  return s.slice(0, -digits) + (frac ? ',' + frac : '')
}

// Под формой торга по ходу ввода (Р-37): «Вы ставите 300 ₽ на „сбудется“; соперник — не меньше 1 000 ₽
// на „не сбудется“ (старт, кэф 1 к 3,3), каждое следующее встречное — больше лучшего хотя бы на 100 ₽.
// Кто даст больше всех к концу торга — тот соперник». Чего не хватает — что ввести
export function auctionSummary(x: { side: 'yes' | 'no'; amount: number | null; start: number | null; step: number | null; currency: string }): string {
  if (x.amount === null) return 'Введите свою сумму — здесь появится, сколько ставит каждый.'
  if (x.start === null) return 'Введите старт — наименьшую сумму соперника.'
  const sum = (n: number) => money(n, x.currency)
  const other = sideLabel(x.side === 'yes' ? 'no' : 'yes')
  const step = x.step === null ? '' : `, каждое следующее встречное — больше лучшего хотя бы на ${sum(x.step)}`
  return `Вы ставите ${sum(x.amount)} на „${sideLabel(x.side)}“; соперник — не меньше ${sum(x.start)} на „${other}“ (старт, кэф ${amountsOddsLabel(x.amount, x.start)})${step}. Кто даст больше всех к концу торга — тот соперник; принять лучшее можно и раньше.`
}

// Пометка-предупреждение (Р-26): предмет спора — сторона пари, всегда на «сбудется»; иначе ничего
export function OfferSubjectFlag({ room, offer }: { room: SavedRoom; offer: OfferView }) {
  if (!subjectIsSide(offer) || offer.subjectId === null) return null
  return <span className="subject-flag">⚑ {who(room, offer.subjectId)} — предмет спора — на стороне „{sideLabel('yes')}“</span>
}

// Кому: адресат или «открытое — любой»
export function toLabel(room: SavedRoom, o: OfferView): string {
  return o.to === null ? 'открытое — любой' : who(room, o.to)
}

// Статус на время сервера now (offerStatus): приём закрывается в срок и между опросами; у принятого —
// фаза исхода одной строкой
export function OfferStatusLine({ room, offer, now }: { room: SavedRoom; offer: OfferView; now: number }) {
  const state = offerState(offer)
  const status = offerStatus(state, now)
  if (status === 'accepted') return acceptedLine(room, offer, now)
  if (status === 'withdrawn') return <span className="status cancelled">отозвано</span>
  if (status === 'countered') return <span className="status closed">закрыто встречным</span>
  if (status === 'expired') return <span className="status closed">истекло — приём закрыт {formatDateTime(offer.closesAt)}</span>
  if (status === 'failed') return <span className="status closed">не состоялось — никто не дал старт</span>
  if (state.auction) return <span className="status open">{auctionOpenText(state.auction.endsAt, now)}</span>
  return (
    <span className="status open">
      открыто — приём до {formatDateTime(offer.closesAt)}, осталось {formatCountdown(offer.closesAt - now)}
    </span>
  )
}

// Торг идёт (Р-37): «торг до 23.11.2026, 18:15, осталось 12 мин 5 с» — конец с продлениями
export function auctionOpenText(endsAt: number, now: number): string {
  return `торг до ${formatDateTime(endsAt)}, осталось ${formatCountdown(endsAt - now)}`
}

// Кэф «a к b» — два поля: автор рискует a частей, соперник b
export function OddsField({
  a,
  b,
  onA,
  onB,
  mine,
  theirs,
}: {
  a: string
  b: string
  onA: (v: string) => void
  onB: (v: string) => void
  mine: string
  theirs: string
}) {
  return (
    <fieldset className="field">
      <legend>Кэф «a к b»</legend>
      <div className="odds-edit">
        <label className="field">
          <span>{mine}</span>
          <input className="input" inputMode="numeric" value={a} onChange={(e) => onA(e.target.value)} autoComplete="off" />
        </label>
        <span className="odds-k" aria-hidden="true">
          к
        </span>
        <label className="field">
          <span>{theirs}</span>
          <input className="input" inputMode="numeric" value={b} onChange={(e) => onB(e.target.value)} autoComplete="off" />
        </label>
      </div>
      <span className="hint">
        Целые от {MIN_ODDS} до {MAX_ODDS}. «3 к 1»: вы рискуете 3 части, соперник — 1; выигравший забирает обе.
      </span>
    </fieldset>
  )
}

// Число из поля кэфа: не целое — NaN, правила откажут своим текстом
export function oddsNumber(text: string): number {
  const t = text.trim()
  return /^\d+$/.test(t) ? Number(t) : NaN
}

// Кэф годится для прикидки сумм (offerStakes делит на a — ноль не пускаем); отказ формы — правила
export function validOdds(odds: { a: number; b: number }): boolean {
  const ok = (x: number) => Number.isInteger(x) && x >= MIN_ODDS && x <= MAX_ODDS
  return ok(odds.a) && ok(odds.b)
}
