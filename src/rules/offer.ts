// Пари один на один (Р-04, Р-05, Р-06; Архитектура, «Правила» — «Пари», «Исход пари»): суммы по
// кэфу, принять / отозвать / встречное, исход отметками сторон и гарантом. Здесь — проверка формы и
// состояние пари из записей OfferRecord (автор, время сервера at, порядок — порядок журнала); из
// журнала комнаты их берёт logOffers (Р-22: offer.created, offer.accepted, offer.revoked; Р-23: offer.marked,
// offer.decided, offer.declined, offer.nominated; Р-31: court.drawn — суд по «ждёт суда»; Р-37: торг —
// offer.bid, offer.bid-accepted). Итоги и статусы считаются, не хранятся. Ни DOM, ни Cloudflare
import { auctionLatestEnd, auctionSpan, auctionStep, extendEnd, lastBid, nextBid, type AuctionTerms } from './auction'
import { checkAmount, FINAL_TIME, MAX_EVENT_TEXT, NEED_CHECK, NEED_CONDITION, LONG_CHECK, LONG_CONDITION } from './event'
import { appealView, courtVerdict, courtView, type CourtCase } from './court'
import { NORMAL_TIMES, recordTimes, timesOf, type Times } from './pace'
import type { AppealView, BiddingView, CourtView, OfferInfo, OfferView } from './protocol'
import { applyEntry, foldLog, hostAt, type HostTerm, type LogEntry, type RoomState } from './room'

// Сроки пари — обычного темпа (Р-35): все три — срок молчания (silence), окончательность — срок
// апелляции (FINAL_TIME). Правила берут сроки пари (times — закреплённые при создании, timesOf);
// константы — для экранов, пока они не знают темпа.
// Сторона молчит 3 дня после первой отметки (не отметил никто — после «исход к») — решает гарант (Р-27)
export const SIDE_SILENCE = NORMAL_TIMES.silence
// Гарант молчит 3 дня с мига, как решение перешло к нему, — нужен другой гарант
export const GUARANTOR_SILENCE = NORMAL_TIMES.silence
// Правило гаранта (Р-31): стороны 3 дня не сходятся на новом гаранте — дело уходит в суд само
export const NEED_GUARANTOR_TIME = NORMAL_TIMES.silence
export { FINAL_TIME }

export const MIN_ODDS = 1
export const MAX_ODDS = 100

// Отказы формы
export const BAD_ODDS = `Кэф — целые числа от ${MIN_ODDS} до ${MAX_ODDS}, например «3 к 1»`
export const BAD_SIDE = 'Сторона автора — «сбудется» или «не сбудется»'
export const TAKER_TOO_SMALL = 'Сумма соперника меньше одной единицы — увеличьте сумму или кэф'
export const BANK_TOO_BIG = 'Сумма слишком большая'
export const NEED_TIMES = 'Нужны сроки: «приём до» и «исход к»'
export const CLOSE_PASSED = 'Срок «приём до» уже прошёл — выберите время позже'
export const EXPECTED_EARLY = '«Исход к» не может быть раньше, чем «приём до»'
export const BAD_ADDRESSEE = 'Адресат — другой участник комнаты'
export const BAD_GUARANTOR = 'Гарант — участник комнаты, не автор и не адресат'
export const NEED_GUARANTOR = 'Ведущий — сторона пари: выберите гаранта'
// О ком спор (Р-26): предмет — только на стороне «сбудется», не гарант
export const BAD_SUBJECT = 'О ком спор — участник комнаты'
export const SUBJECT_GUARANTOR = 'Предмет спора не бывает гарантом — выберите другого'
export const NEED_GUARANTOR_SUBJECT = 'Ведущий — предмет спора: выберите гаранта'
export const SUBJECT_AUTHOR_YES = 'Вы — предмет спора: ваша сторона — только «сбудется»'
export const SUBJECT_ADDRESSEE_NO = 'Предмет спора примет пари, только если ваша сторона — «не сбудется»'
export const SUBJECT_TAKES = 'Вы — предмет спора: принять можно, только если автор — за «не сбудется»'
// Принять, отозвать, встречное
export const NO_OFFER = 'Нет такого пари'
export const WITHDRAWN = 'Пари отозвано'
export const ALREADY_ACCEPTED = 'Пари уже принято'
export const COUNTERED = 'Пари закрыто встречным'
export const EXPIRED = 'Срок приёма прошёл — пари истекло'
export const OWN_OFFER = 'Своё пари не принимают'
export const GUARANTOR_TAKES = 'Гарант не принимает пари'
export const NOT_ADDRESSEE = 'Пари предложено другому участнику'
export const NOT_MEMBER = 'Это может только участник комнаты'
export const ONLY_AUTHOR = 'Отозвать может только автор пари'
export const ACCEPTED_NO_WITHDRAW = 'Принятое пари не отзывают'
export const COUNTER_ACCEPTED = 'Пари уже принято — встречное не предложить'
export const COUNTER_WITHDRAWN = 'Пари отозвано — встречное не предложить'
export const OWN_COUNTER = 'Встречное к своему пари не делают'
export const GUARANTOR_COUNTERS = 'Гарант не делает встречных'
// Исход
export const MARK_EARLY = 'Отметить исход можно после того, как пари принято'
export const GUARANTOR_MARKS = 'Гарант не отмечает исход как сторона — он решает, если стороны разошлись'
export const NOT_SIDE = 'Это могут только стороны пари'
export const BAD_MARK = 'Отметка — «прав автор» или «прав соперник»'
export const AGREED = 'Исход уже утверждён согласием сторон'
export const DECIDED = 'Гарант уже решил'
export const ONLY_GUARANTOR = 'Это может только гарант пари'
export const NOT_TURN = 'Стороны ещё отмечают исход — гарант решает, когда они разошлись или одна молчит дольше срока'
export const GUARANTOR_LAPSED = 'Гарант не решил в срок или отказался — стороны выбирают другого'
export const GUARANTOR_PRESENT = 'Гарант на месте — выбирать другого не нужно'
// Правило гаранта (Р-31) и пари без гаранта (Р-36): суд собран по «ждёт суда» — решает только он
export const IN_COURT = 'Пари решает суд — назвать гаранта и отметить исход уже нельзя'
// Без гаранта (Р-36)
export const NO_GUARANTOR_JUDGES = 'Без гаранта судить некому — выберите гаранта'
export const NO_GUARANTOR_CHOSEN = '«Без гаранта» — тогда гаранта не выбирают'
export const NO_GUARANTOR = 'У пари нет гаранта'

// «Торг до …» (Р-37): автор закрепляет сторону и свою сумму, участники до конца торга перебивают друг
// друга, сколько поставят против него (встречное в торге — bid; слово «встречное» в коде — у counterTo).
// Сроки — постоянные решения, не темпа: торг — от 10 минут до 3 дней с создания; встречное за 2 минуты
// до конца переносит конец на 2 минуты после себя, но не дальше исходного конца + 30 минут. Сроки, шаг
// по умолчанию и продление — общие с лотом (auction.ts)
export { AUCTION_EXTEND, AUCTION_EXTEND_MAX, AUCTION_MAX, AUCTION_MIN, auctionLatestEnd, auctionStep, type AuctionTerms } from './auction'
// Отказы торга: форма
export const AUCTION_ADDRESSED = 'Торг — только открытое пари: адресата у него нет'
export const BAD_START = 'Старт — сумма соперника: целое число больше нуля'
export const BAD_STEP = 'Шаг торга — целое число больше нуля'
export const AUCTION_SHORT = 'Торг — не меньше 10 минут'
export const AUCTION_LONG = 'Торг — не дольше 3 дней'
export const AUCTION_EXPECTED = '«Исход к» — не раньше чем через 30 минут после конца торга'
// Встречное в торге, «принять сейчас», отзыв
export const NOT_AUCTION = 'Это пари не в торге'
export const AUCTION_OVER = 'Торг закончен'
export const OWN_BID = 'Против своего пари не торгуются'
export const GUARANTOR_BIDS = 'Гарант не торгуется'
export const SUBJECT_BIDS = 'Вы — предмет спора: торговаться можно, только если автор — за «не сбудется»'
export const BAD_BID = 'Встречное — сумма: целое число больше нуля'
export const BID_LOW = 'Первое встречное — не меньше старта'
export const BID_STEP = 'Встречное — больше лучшего хотя бы на шаг'
export const AUCTION_ACCEPT = 'Пари в торге не принимают — перебейте лучшее встречное'
export const AUCTION_COUNTER = 'К пари в торге встречных пари нет — перебейте лучшее встречное'
export const ONLY_AUTHOR_TAKES = 'Принять лучшее может только автор пари'
export const NO_BIDS = 'Встречных ещё нет — принимать нечего'
export const AUCTION_HAS_BIDS = 'Встречные уже есть — торг не отозвать'

// Пари «на обещание» (Р-44): на кону у каждой стороны — своё обещание текстом (что сделает, если
// проиграет), без кэфа и суммы; длина — как у условия. Только один на один: без торга; встречное — своё
// обещание (к пари на сумму — сумма, к пари на обещание — обещание)
export const NEED_PROMISE = 'Нужно обещание: что сделаете, если проиграете'
export const NEED_TAKER_PROMISE = 'Нужно обещание соперника: что он сделает, если проиграет'
export const LONG_PROMISE = `Обещание — не длиннее ${MAX_EVENT_TEXT} знаков`
export const PROMISE_AUCTION = 'Пари на обещание — без торга'
export const PROMISE_COUNTER = 'К пари на обещание встречное — тоже обещание, без суммы и кэфа'
export const MONEY_COUNTER = 'К пари на сумму встречное — тоже на сумму, без обещания'
// Кэф и сумма пари на обещание в записи и ответе — ради общего вида пари: не показываются и не считаются
export const PROMISE_ODDS: Odds = { a: 1, b: 1 }

type Checked<T> = { ok: true; value: T } | { ok: false; error: string }

// Кэф «a к b»: автор рискует a·k, соперник b·k
export type Odds = { a: number; b: number }
// Сторона автора: «сбудется» или «не сбудется» условие. У встречного — обратная исходной
export type AuthorSide = 'yes' | 'no'
// Сторона пари: автор или соперник (принявший). Отметка и решение гаранта — кто прав
export type OfferSide = 'author' | 'taker'

// Сколько ставит каждая сторона. taker — вниз до целой единицы; exact — делится ли нацело
export type OfferStakes = { author: number; taker: number; bank: number; exact: boolean }

// Суммы по кэфу: соперник ставит сумму автора × b ÷ a, вниз до целой единицы; банк — обе вместе
export function offerStakes(odds: Odds, amount: number): Checked<OfferStakes> {
  const num = BigInt(amount) * BigInt(odds.b)
  const den = BigInt(odds.a)
  const taker = Number(num / den)
  if (taker < 1) return { ok: false, error: TAKER_TOO_SMALL }
  const bank = amount + taker
  if (!Number.isSafeInteger(bank)) return { ok: false, error: BANK_TOO_BIG }
  return { ok: true, value: { author: amount, taker, bank, exact: num % den === 0n } }
}

// Итог каждой стороны, если прав winner: победитель забирает банк
export function offerNets(stakes: OfferStakes, winner: OfferSide): { author: number; taker: number } {
  return winner === 'author'
    ? { author: stakes.taker, taker: -stakes.taker }
    : { author: -stakes.author, taker: stakes.author }
}

// Торг (Р-37): старт — наименьшая сумма соперника, шаг — на сколько новое встречное больше лучшего
// (AuctionTerms — auction.ts). Встречное в торге: кто, когда, сколько ставит против суммы автора
export type AuctionBid = { id: string; at: number; by: string; amount: number }
// Торг в состоянии пари: endsAt — конец с продлениями; bids — действующие встречные по порядку (каждое
// больше прежнего — последнее лучшее); taken — как принято лучшее: «принять сейчас» или конец торга
export type AuctionState = AuctionTerms & { endsAt: number; bids: AuctionBid[]; taken: 'now' | 'end' | null }

export function bestBid(a: AuctionState): AuctionBid | null {
  return lastBid(a)
}

// Пари на now (время сервера): торг кончился по времени, встречное было — лучшее принято в миг конца,
// без записи и будильника (Р-37). Иначе — то же пари
export function offerAt(o: OfferState, now: number): OfferState {
  const a = o.auction
  if (!a || o.accepted || o.withdrawnAt !== null || now < a.endsAt) return o
  const best = bestBid(a)
  if (!best) return o
  return { ...o, accepted: { by: best.by, at: a.endsAt }, auction: { ...a, taken: 'end' } }
}

// Суммы сторон пари: обычное — по кэфу (offerStakes); в торге — сумма автора и лучшего встречного
// (принятого — оно и есть лучшее), без встречных — старт; кэф торга только для показа, предел 1…100 к
// нему не применяется (Р-37)
export function offerAmounts(o: OfferState): Checked<OfferStakes> {
  // На обещание (Р-44) денег на кону нет
  if (o.promise) return { ok: true, value: { author: 0, taker: 0, bank: 0, exact: true } }
  if (!o.auction) return offerStakes(o.odds, o.amount)
  const taker = bestBid(o.auction)?.amount ?? o.auction.start
  return { ok: true, value: { author: o.amount, taker, bank: o.amount + taker, exact: true } }
}

function odd(x: unknown): x is number {
  return Number.isInteger(x) && (x as number) >= MIN_ODDS && (x as number) <= MAX_ODDS
}

function text(x: unknown, need: string, long: string): Checked<string> {
  const s = typeof x === 'string' ? x.trim() : ''
  if (!s) return { ok: false, error: need }
  if ([...s].length > MAX_EVENT_TEXT) return { ok: false, error: long }
  return { ok: true, value: s }
}

// Проверенная форма пари. to — адресат (null — открытое), guarantor — выбранный (null — ведущий),
// noGuarantor — без гаранта (Р-36; guarantor тогда null; нет поля — с гарантом), subject — о ком
// спор (null — ни о ком; Р-26). auction — торг (Р-37; нет поля — обычное пари): closesAt тогда — конец
// торга, odds — стартовый кэф { a: amount, b: start }. promise — пари на обещание (Р-44; нет поля — на
// сумму): обещание автора и соперника; odds тогда — PROMISE_ODDS, amount — 0
export type OfferInput = {
  condition: string
  check: string
  side: AuthorSide
  odds: Odds
  amount: number
  to: string | null
  closesAt: number
  expectedAt: number
  guarantor: string | null
  noGuarantor?: boolean
  subject: string | null
  auction?: AuctionTerms
  promise?: OfferPromise
}

// На кону пари «на обещание» (Р-44): что сделает автор и что соперник, если проиграет
export type OfferPromise = { author: string; taker: string }

// Обещания из формы: своё — не пустое, ≤ 300 знаков; соперника не задано — то же, что своё, задано —
// так же не пустое
function promiseTerms(own: unknown, taker: unknown): Checked<OfferPromise> {
  const author = text(own, NEED_PROMISE, LONG_PROMISE)
  if (!author.ok) return author
  if (taker === undefined || taker === null) return { ok: true, value: { author: author.value, taker: author.value } }
  const other = text(taker, NEED_TAKER_PROMISE, LONG_PROMISE)
  return other.ok ? { ok: true, value: { author: author.value, taker: other.value } } : other
}

// Условия торга из формы: старт — целое > 0, банк (сумма автора + старт) — точное целое; шаг не задан —
// 10 % старта (auctionStep)
function auctionTerms(x: unknown, amount: number): Checked<AuctionTerms> {
  if (typeof x !== 'object' || x === null) return { ok: false, error: BAD_START }
  const t = x as { start?: unknown; step?: unknown }
  if (!Number.isSafeInteger(t.start) || (t.start as number) < 1) return { ok: false, error: BAD_START }
  const start = t.start as number
  if (!Number.isSafeInteger(amount + start)) return { ok: false, error: BANK_TOO_BIG }
  const step = t.step === undefined || t.step === null ? auctionStep(start) : t.step
  if (!Number.isSafeInteger(step) || (step as number) < 1) return { ok: false, error: BAD_STEP }
  return { ok: true, value: { start, step: step as number } }
}

// Проверка формы без времени сервера и участников (их — checkOfferTimes, offerGuarantor,
// checkOfferSubject). Сторона не задана — «сбудется». Торг (Р-37): auction { start, step? } вместо кэфа
// (odds тогда не смотрится), только открытое. На обещание (Р-44): promise — своё обещание, takerPromise —
// соперника (не задано — то же); кэф и сумма тогда не смотрятся, торг — отказ; адресное и открытое — оба
export function checkOfferInput(x: {
  condition: unknown
  check: unknown
  side?: unknown
  odds?: unknown
  amount?: unknown // у пари на обещание (Р-44) не нужна; у пари на сумму нет — отказ BAD_AMOUNT
  to?: unknown
  closesAt: unknown
  expectedAt: unknown
  guarantor?: unknown
  noGuarantor?: unknown
  subject?: unknown
  auction?: unknown
  promise?: unknown
  takerPromise?: unknown
}): Checked<OfferInput> {
  const condition = text(x.condition, NEED_CONDITION, LONG_CONDITION)
  if (!condition.ok) return condition
  const check = text(x.check, NEED_CHECK, LONG_CHECK)
  if (!check.ok) return check
  const side = x.side === undefined || x.side === null ? 'yes' : x.side
  if (side !== 'yes' && side !== 'no') return { ok: false, error: BAD_SIDE }
  const isAuction = x.auction !== undefined && x.auction !== null
  const isPromise = (x.promise !== undefined && x.promise !== null) || (x.takerPromise !== undefined && x.takerPromise !== null)
  let odds: Odds
  let amount: number
  let auction: AuctionTerms | null = null
  let promise: OfferPromise | null = null
  if (isPromise) {
    if (isAuction) return { ok: false, error: PROMISE_AUCTION }
    const terms = promiseTerms(x.promise, x.takerPromise)
    if (!terms.ok) return terms
    promise = terms.value
    odds = { ...PROMISE_ODDS }
    amount = 0
  } else {
    const o = x.odds as { a?: unknown; b?: unknown } | null
    if (!isAuction && (typeof o !== 'object' || o === null || !odd(o.a) || !odd(o.b))) return { ok: false, error: BAD_ODDS }
    const sum = checkAmount(x.amount)
    if (!sum.ok) return sum
    amount = sum.value
    if (isAuction) {
      const terms = auctionTerms(x.auction, amount)
      if (!terms.ok) return terms
      if (x.to !== undefined && x.to !== null) return { ok: false, error: AUCTION_ADDRESSED }
      auction = terms.value
      odds = { a: amount, b: auction.start }
    } else {
      odds = { a: (o as { a: number }).a, b: (o as { b: number }).b }
      const stakes = offerStakes(odds, amount)
      if (!stakes.ok) return stakes
    }
  }
  if (!Number.isSafeInteger(x.closesAt) || !Number.isSafeInteger(x.expectedAt)) return { ok: false, error: NEED_TIMES }
  const member = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v !== '')
  if (!member(x.to)) return { ok: false, error: BAD_ADDRESSEE }
  if (!member(x.guarantor)) return { ok: false, error: BAD_GUARANTOR }
  const none = x.noGuarantor
  if (none !== undefined && none !== null && typeof none !== 'boolean') return { ok: false, error: BAD_GUARANTOR }
  if (none === true && typeof x.guarantor === 'string') return { ok: false, error: NO_GUARANTOR_CHOSEN }
  if (!member(x.subject)) return { ok: false, error: BAD_SUBJECT }
  return {
    ok: true,
    value: {
      condition: condition.value,
      check: check.value,
      side,
      odds,
      amount,
      to: typeof x.to === 'string' ? x.to : null,
      closesAt: x.closesAt as number,
      expectedAt: x.expectedAt as number,
      guarantor: typeof x.guarantor === 'string' ? x.guarantor : null,
      ...(none === true && { noGuarantor: true }),
      subject: typeof x.subject === 'string' ? x.subject : null,
      ...(auction && { auction }),
      ...(promise && { promise }),
    },
  }
}

// Сроки по времени сервера: «приём до» — впереди, «исход к» — не раньше него. Торг (Р-37): конец — не
// раньше чем через 10 минут и не позже чем через 3 дня, «исход к» — не раньше конца + 30 минут (так
// продления не уведут торг за исход). Ошибки нет — null
export function checkOfferTimes(input: { closesAt: number; expectedAt: number; auction?: AuctionTerms | null }, now: number): string | null {
  if (input.auction) {
    const span = auctionSpan(input.closesAt, now)
    if (span) return span === 'short' ? AUCTION_SHORT : AUCTION_LONG
    if (input.expectedAt < auctionLatestEnd(input)) return AUCTION_EXPECTED
    return null
  }
  if (input.closesAt <= now) return CLOSE_PASSED
  if (input.expectedAt < input.closesAt) return EXPECTED_EARLY
  return null
}

// hosts — сроки ведения (Р-42; room.ts): ведущий на миг записи — hostAt; нет — всё время hostId
export type RoomRoles = { hostId: string; members: readonly string[]; hosts?: readonly HostTerm[] }

// Гарант пари: выбран — участник, не автор и не адресат; не выбран — ведущий, а ведущий сам автор
// или адресат — отказ (гаранта надо выбрать). Заодно проверяет адресата: другой участник. Предмет
// спора (Р-26; нет — null) гарантом не бывает: ведущий — предмет — гаранта тоже надо выбрать.
// Без гаранта (Р-36) — null, если судить есть кому: у адресного — хотя бы один участник, кроме
// автора, адресата и предмета спора; у открытого — хотя бы двое, кроме автора и предмета (один примет,
// один судит)
export function offerGuarantor(
  input: { to: string | null; guarantor: string | null; noGuarantor?: boolean; subject?: string | null },
  authorId: string,
  room: RoomRoles,
): Checked<string | null> {
  if (input.to !== null && (input.to === authorId || !room.members.includes(input.to))) {
    return { ok: false, error: BAD_ADDRESSEE }
  }
  const subject = input.subject ?? null
  const g = input.guarantor
  if (input.noGuarantor === true) {
    if (g !== null) return { ok: false, error: NO_GUARANTOR_CHOSEN }
    const judges = new Set(room.members.filter((m) => m !== authorId && m !== input.to && m !== subject))
    return judges.size >= (input.to === null ? 2 : 1) ? { ok: true, value: null } : { ok: false, error: NO_GUARANTOR_JUDGES }
  }
  if (g === null) {
    if (room.hostId === authorId || room.hostId === input.to) return { ok: false, error: NEED_GUARANTOR }
    return room.hostId === subject ? { ok: false, error: NEED_GUARANTOR_SUBJECT } : { ok: true, value: room.hostId }
  }
  if (g === authorId || g === input.to || !room.members.includes(g)) return { ok: false, error: BAD_GUARANTOR }
  if (g === subject) return { ok: false, error: SUBJECT_GUARANTOR }
  return { ok: true, value: g }
}

// О ком спор (Р-26): участник комнаты; предмет — автор — сторона автора только «сбудется»; предмет —
// адресат — сторона автора только «не сбудется» (иначе он не сможет принять). Ни о ком — null
export function checkOfferSubject(input: { subject: string | null; side: AuthorSide; to: string | null }, authorId: string, room: RoomRoles): string | null {
  const s = input.subject
  if (s === null) return null
  if (!room.members.includes(s)) return BAD_SUBJECT
  if (s === authorId && input.side !== 'yes') return SUBJECT_AUTHOR_YES
  if (s === input.to && input.side !== 'no') return SUBJECT_ADDRESSEE_NO
  return null
}

// Пометка для всех (Р-26): предмет спора — сторона пари (автор или принявший); по правилу он всегда
// на «сбудется». Ни о ком или предмет не сторона — false
export function subjectIsSide(o: { subjectId: string | null; authorId: string; accepted: { by: string } | null }): boolean {
  return o.subjectId !== null && (o.subjectId === o.authorId || o.subjectId === o.accepted?.by)
}

// Записи пари — как будут в журнале комнаты: memberId — автор записи, at — время сервера.
// Номер пари — id записи offer.created; guarantor в ней — уже определённый (offerGuarantor); null —
// без гаранта (Р-36)
export type OfferCreated = {
  type: 'offer.created'
  id: string
  at: number
  memberId: string
  condition: string
  check: string
  side: AuthorSide
  odds: Odds
  amount: number
  to: string | null
  closesAt: number
  expectedAt: number
  guarantor: string | null
  counterTo: string | null // встречное к какому пари
  subject: string | null // о ком спор (Р-26); у пари до выкатки — null
  // Правило гаранта (Р-31): часы гаранта — с «исход к», без общего гаранта — суд. Нет (у пари до
  // выкатки) — прежние часы и без суда
  guarantorRule?: boolean
  // Сроки (Р-35), закреплённые при создании; нет (у пари до темпа) — обычный набор
  times?: Times
  // «Торг до …» (Р-37): только открытое и не встречное; closesAt — исходный конец торга, odds — стартовый
  // кэф { a: amount, b: start }. Нет — обычное пари
  auction?: AuctionTerms
  // На обещание (Р-44): что сделает каждая сторона, если проиграет; odds — PROMISE_ODDS, amount — 0, торга
  // нет; встречное к нему — тоже на обещание. Нет — на сумму
  promise?: OfferPromise
}
type OfferAct<T extends string, X = object> = { type: T; id: string; at: number; memberId: string; offer: string } & X
export type OfferRecord =
  | OfferCreated
  | OfferAct<'offer.accepted'>
  | OfferAct<'offer.withdrawn'>
  | OfferAct<'offer.marked', { winner: OfferSide }> // сторона: кто прав
  | OfferAct<'offer.decided', { winner: OfferSide }> // гарант: кто прав
  | OfferAct<'offer.declined'> // гарант отказался
  | OfferAct<'offer.nominated', { guarantor: string }> // сторона называет нового гаранта
  // Суд по «ждёт суда» собран (запись court.drawn журнала, Р-31): дальше решает только суд
  | OfferAct<'court.drawn'>
  // Торг (Р-37): встречное — сколько ставит против суммы автора; «принять сейчас» — автор принимает лучшее
  | OfferAct<'offer.bid', { amount: number }>
  | OfferAct<'offer.bid-accepted'>
  // «Выбыл» (Р-41; записи member.dropped / member.reinstated журнала, автор — ведущий): выбывший гарант —
  // молчание гаранта; запись — обо всех пари, где он гарант
  | { type: 'member.dropped'; id: string; at: number; memberId: string; member: string }
  | { type: 'member.reinstated'; id: string; at: number; memberId: string; member: string }

export type OfferMark = { by: OfferSide; winner: OfferSide; at: number }

// Пари из записей; times — сроки пари (Р-35), нет — обычный набор (timesOf). auction — торг (Р-37), нет —
// обычное пари. Торг, кончившийся по времени, свёртка принимает перед следующей записью о пари, а на now —
// offerAt: пари из свёртки до проверки без now (checkMark, checkWithdraw, sideOf) берут через offerAt
export type OfferState = Omit<OfferCreated, 'type' | 'memberId' | 'guarantor' | 'guarantorRule' | 'auction'> & {
  auction?: AuctionState
  guarantorRule: boolean // правило гаранта (Р-31)
  courtAt: number | null // суд по «ждёт суда» собран (Р-31); нет — null
  authorId: string
  guarantorId: string | null // нынешний гарант; null — без гаранта (Р-36), пока стороны его не назвали
  guarantorSince: number | null // назначен сторонами (null — с создания)
  accepted: { by: string; at: number } | null
  withdrawnAt: number | null
  closedBy: { offer: string; at: number } | null // закрыто встречным
  marks: OfferMark[] // действующие отметки по порядку; повтор той же — не отметка
  disagreedAt: number | null // когда отметки сторон впервые разошлись
  agreed: { winner: OfferSide; at: number } | null // отметки сошлись до решения гаранта
  decision: { winner: OfferSide; at: number; by: string } | null
  declinedAt: number | null // нынешний гарант отказался
  nominations: Partial<Record<OfferSide, string>> // кого называют стороны, пока нужен другой гарант
  // Нынешний гарант помечен «выбыл» (Р-41) — с какого мига; нет — в игре. Считается молчанием гаранта:
  // его срок кончается, как только решение у него (basePhase)
  guarantorAway?: number
}

// failed — торг «не состоялся» (Р-37): к концу ни одного встречного, никто никому не должен
export type OfferStatus = 'open' | 'expired' | 'withdrawn' | 'countered' | 'accepted' | 'failed'

// Статус предложения на now (время сервера): приём закрывается в срок, «приём до» — не включая. Торг
// (Р-37) — по концу с продлениями (endsAt), не по closesAt: идёт — open, кончился со встречным — accepted
// (offerAt), без — failed
export function offerStatus(o: OfferState, now: number): OfferStatus {
  const x = offerAt(o, now)
  if (x.accepted) return 'accepted'
  if (x.withdrawnAt !== null) return 'withdrawn'
  if (x.closedBy) return 'countered'
  if (x.auction) return now >= x.auction.endsAt ? 'failed' : 'open'
  return now >= x.closesAt ? 'expired' : 'open'
}

// Принять: адресное — только адресат; открытое — любой участник, кроме автора и гаранта; до «приём до».
// Предмет спора (Р-26) принимает, только если автор — за «не сбудется»: сам он тогда — за «сбудется».
// Пари в торге (Р-37) так не принимают — иначе его приняли бы по старту
export function checkAccept(o: OfferState, memberId: string, room: RoomRoles, now: number): string | null {
  if (o.auction) return AUCTION_ACCEPT
  const status = offerStatus(o, now)
  if (status === 'withdrawn') return WITHDRAWN
  if (status === 'accepted') return ALREADY_ACCEPTED
  if (status === 'countered') return COUNTERED
  if (status === 'expired') return EXPIRED
  if (memberId === o.authorId) return OWN_OFFER
  if (memberId === o.guarantorId) return GUARANTOR_TAKES
  if (o.to !== null && memberId !== o.to) return NOT_ADDRESSEE
  if (memberId === o.subject && o.side !== 'no') return SUBJECT_TAKES
  if (!room.members.includes(memberId)) return NOT_MEMBER
  return null
}

// Отозвать — автор, пока не принято; торг (Р-37) — только пока нет ни одного встречного
export function checkWithdraw(o: OfferState, memberId: string): string | null {
  if (memberId !== o.authorId) return ONLY_AUTHOR
  if (o.accepted) return ACCEPTED_NO_WITHDRAW
  if (o.withdrawnAt !== null) return WITHDRAWN
  if (o.closedBy) return COUNTERED
  if (o.auction && o.auction.bids.length > 0) return AUCTION_HAS_BIDS
  return null
}

// Встречное в торге (Р-37): amount — сколько ставишь против суммы автора; первое — не меньше старта,
// следующее — больше лучшего хотя бы на шаг; до конца торга (с продлениями). Не ставят автор, гарант и
// предмет спора не на своей стороне (Р-26, как у принятия). Встречное не отзывается; перебитое — свободно
export function checkBid(o: OfferState, memberId: string, amount: unknown, room: RoomRoles, now: number): string | null {
  const a = o.auction
  if (!a) return NOT_AUCTION
  const status = offerStatus(o, now)
  if (status === 'withdrawn') return WITHDRAWN
  if (status !== 'open') return AUCTION_OVER
  if (memberId === o.authorId) return OWN_BID
  if (memberId === o.guarantorId) return GUARANTOR_BIDS
  if (memberId === o.subject && o.side !== 'no') return SUBJECT_BIDS
  if (!room.members.includes(memberId)) return NOT_MEMBER
  if (!Number.isSafeInteger(amount) || (amount as number) < 1) return BAD_BID
  if (!Number.isSafeInteger(o.amount + (amount as number))) return BANK_TOO_BIG
  const next = nextBid(amount as number, bestBid(a)?.amount ?? null, a)
  return next === 'low' ? BID_LOW : next === 'step' ? BID_STEP : null
}

// «Принять сейчас» (Р-37): автор принимает лучшее встречное в любой миг торга — торг закончен
export function checkTakeBid(o: OfferState, memberId: string, now: number): string | null {
  if (!o.auction) return NOT_AUCTION
  if (memberId !== o.authorId) return ONLY_AUTHOR_TAKES
  const status = offerStatus(o, now)
  if (status === 'withdrawn') return WITHDRAWN
  if (status !== 'open') return AUCTION_OVER
  return bestBid(o.auction) ? null : NO_BIDS
}

// Встречное — тот, кто мог бы принять исходное, и пока его можно принять. К пари в торге (Р-37) — нет
export function checkCounter(o: OfferState, memberId: string, room: RoomRoles, now: number): string | null {
  if (o.auction) return AUCTION_COUNTER
  const status = offerStatus(o, now)
  if (status === 'withdrawn') return COUNTER_WITHDRAWN
  if (status === 'accepted') return COUNTER_ACCEPTED
  if (memberId === o.authorId) return OWN_COUNTER
  if (memberId === o.guarantorId) return GUARANTOR_COUNTERS
  return checkAccept(o, memberId, room, now)
}

// Форма встречного: своё — кэф, сумма и «приём до»; условие, «как проверяем», «исход к» — исходного;
// сторона — обратная, адресат — автор исходного; о ком спор — тот же (Р-26): правило предмета то же.
// Гарант — выбор автора встречного (Р-36): guarantor — участник, noGuarantor — без гаранта; не выбрал —
// тот же, что у исходного (он не автор и не принимает пари; у исходного без гаранта — тоже без).
// Проверяет выбор offerGuarantor. К пари на обещание (Р-44) — свои обещания вместо кэфа и суммы
export function counterInput(
  o: OfferState,
  x: {
    odds: Odds
    amount: number
    closesAt: number
    guarantor?: string | null
    noGuarantor?: boolean
    promise?: string | null
    takerPromise?: string | null
  },
): OfferInput {
  const chosen = typeof x.guarantor === 'string' || x.noGuarantor === true
  const guarantor = chosen ? (x.guarantor ?? null) : o.guarantorId
  const noGuarantor = chosen ? x.noGuarantor === true : o.guarantorId === null
  // На обещание (Р-44): своё обещание автора встречного (не задано — что исходное просило от соперника) и
  // обещание автора исходного (не задано — его прежнее); кэф и сумма — PROMISE_ODDS и 0
  const promise = o.promise && { author: x.promise ?? o.promise.taker, taker: x.takerPromise ?? o.promise.author }
  return {
    ...(noGuarantor && { noGuarantor: true }),
    ...(promise && { promise }),
    condition: o.condition,
    check: o.check,
    side: o.side === 'yes' ? 'no' : 'yes',
    odds: promise ? { ...PROMISE_ODDS } : x.odds,
    amount: promise ? 0 : x.amount,
    to: o.authorId,
    closesAt: x.closesAt,
    expectedAt: o.expectedAt,
    guarantor,
    subject: o.subject,
  }
}

// Сторона участника в пари; не сторона — null
export function sideOf(o: OfferState, memberId: string): OfferSide | null {
  if (memberId === o.authorId) return 'author'
  if (o.accepted && memberId === o.accepted.by) return 'taker'
  return null
}

function settledError(o: OfferState): string | null {
  if (!o.accepted) return MARK_EARLY
  if (o.agreed) return AGREED
  if (o.decision) return DECIDED
  if (o.courtAt !== null) return IN_COURT
  return null
}

// Отметка стороны «прав автор» / «прав соперник»: после принятия, пока исход не утверждён; поменять
// можно до решения гаранта. Повтор той же отметки разрешён и ничего не меняет
export function checkMark(o: OfferState, memberId: string, winner: unknown): string | null {
  if (winner !== 'author' && winner !== 'taker') return BAD_MARK
  const settled = settledError(o)
  if (settled) return settled
  if (memberId === o.guarantorId) return GUARANTOR_MARKS
  if (!sideOf(o, memberId)) return NOT_SIDE
  return null
}

// Отметки на сейчас: последняя от каждой стороны
export function currentMarks(o: OfferState): Record<OfferSide, OfferSide | null> {
  const m: Record<OfferSide, OfferSide | null> = { author: null, taker: null }
  for (const x of o.marks) m[x.by] = x.winner
  return m
}

// С какого мига решает гарант. Прежние пари (Р-27): отметки разошлись или одна сторона молчит срок
// молчания после первой отметки — и раньше «исход к»; не отметил никто — срок молчания после «исход
// к». Правило гаранта (Р-31): раньше «исход к» исход утверждают только совпавшие отметки — молчание —
// срок с max(первая отметка, «исход к»), расхождение — с max(миг расхождения, «исход к»); что раньше.
// Срок молчания — пари (Р-35; 3 дня у обычного темпа)
export function guarantorTurn(o: OfferState): number {
  const wait = timesOf(o).silence
  if (!o.guarantorRule) {
    const silence = (o.marks[0]?.at ?? o.expectedAt) + wait
    return o.disagreedAt === null ? silence : Math.min(o.disagreedAt, silence)
  }
  const silence = Math.max(o.marks[0]?.at ?? o.expectedAt, o.expectedAt) + wait
  return o.disagreedAt === null ? silence : Math.min(Math.max(o.disagreedAt, o.expectedAt), silence)
}

// cancelled — суд отменил пари (Р-24), phaseOf его не даёт: только offerOutcome с делом суда.
// court — «ждёт суда» (Р-31): суд по пари собран, решает он
export type OfferPhase = 'marking' | 'guarantor' | 'need-guarantor' | 'court' | 'approved' | 'final' | 'cancelled'

// Ход исхода на now без суда: решение у гаранта — срок молчания с мига, как перешло к нему (назначен
// сторонами позже — с назначения); не решил или отказался — нужен другой гарант. Окончательно — через
// срок апелляции после решения гаранта. Сроки — пари (Р-35). Без гаранта (Р-36) часов гаранта нет:
// с мига его хода (turnAt) дело у суда — до сбора суда «нужен гарант» (needSince = turnAt): суд не
// собрать — стороны называют общего гаранта, дальше — обычный путь с гарантом
function basePhase(o: OfferState, now: number) {
  const times = timesOf(o)
  const turnAt = guarantorTurn(o)
  const until = guarantorUntil(o, turnAt, times.silence)
  let phase: OfferPhase = 'marking'
  let needSince: number | null = null
  if (o.agreed) phase = 'final'
  else if (o.decision) phase = now >= o.decision.at + times.appeal ? 'final' : 'approved'
  else if (until === null) {
    if (now >= turnAt) [phase, needSince] = ['need-guarantor', turnAt]
  } else if (o.declinedAt !== null) [phase, needSince] = ['need-guarantor', o.declinedAt]
  else if (now >= until) [phase, needSince] = ['need-guarantor', until]
  else if (now >= turnAt) phase = 'guarantor'
  return { phase, turnAt, until, needSince }
}

// До какого мига решает нынешний гарант: срок молчания с мига, как решение у него (назначен позже — с
// назначения); без гаранта — null. Гарант «выбыл» (Р-41) — молчание: срок кончается, как только решение у
// него, но не раньше пометки
function guarantorUntil(o: OfferState, turnAt: number, silence: number): number | null {
  if (o.guarantorId === null) return null
  const from = Math.max(turnAt, o.guarantorSince ?? turnAt)
  return o.guarantorAway === undefined ? from + silence : Math.min(from + silence, Math.max(from, o.guarantorAway))
}

// То же с судом по «ждёт суда» (Р-31): суд собран — «ждёт суда». После сбора отметки, решения и
// назначения не действуют (settledError), так что ход до сбора остаётся как был
function phaseOf(o: OfferState, now: number) {
  const base = basePhase(o, now)
  return base.phase === 'need-guarantor' && o.courtAt !== null && now >= o.courtAt ? { ...base, phase: 'court' as const } : base
}

// С какого мига дело уходит в суд (Р-31): срок молчания пари (3 дня у обычного темпа; Р-35) с мига,
// как нужен другой гарант. Без гаранта (Р-36) — сразу с мига хода гаранта (turnAt). Правила нет или
// другой гарант не нужен — null
export function courtFrom(state: OfferState, now: number): number | null {
  const o = offerAt(state, now)
  if (!o.accepted) return null
  const { phase, needSince } = basePhase(o, now)
  if (phase !== 'need-guarantor' || needSince === null) return null
  if (o.guarantorId === null) return needSince
  return o.guarantorRule ? needSince + timesOf(o).silence : null
}

// Пора ли суду по пари (Р-31, как «ждёт суда» у пула): правило есть, общего гаранта срок молчания не
// назвали; без гаранта (Р-36) — стороны разошлись или одна молчит. Собран ли уже суд и есть ли
// кандидаты — appeal.ts (checkCourtDraw, courtCandidates)
export function courtDue(o: OfferState, now: number): boolean {
  const from = courtFrom(o, now)
  return from !== null && now >= from
}

// Решение гаранта: только нынешний гарант, когда решение перешло к нему и его 3 дня не прошли
export function checkDecide(state: OfferState, memberId: string, winner: unknown, now: number): string | null {
  const o = offerAt(state, now)
  if (winner !== 'author' && winner !== 'taker') return BAD_MARK
  if (o.guarantorId === null) return NO_GUARANTOR
  const settled = settledError(o)
  if (settled) return settled
  if (memberId !== o.guarantorId) return ONLY_GUARANTOR
  const { phase } = phaseOf(o, now)
  if (phase === 'need-guarantor') return GUARANTOR_LAPSED
  if (phase === 'marking') return NOT_TURN
  return null
}

// Отказ гаранта: нынешний гарант принятого пари, пока исход не утверждён и его не сменяют. Решить и
// отказаться у пари без гаранта (Р-36) некому — NO_GUARANTOR
export function checkDecline(state: OfferState, memberId: string, now: number): string | null {
  const o = offerAt(state, now)
  if (o.guarantorId === null) return NO_GUARANTOR
  const settled = settledError(o)
  if (settled) return settled
  if (memberId !== o.guarantorId) return ONLY_GUARANTOR
  if (phaseOf(o, now).phase === 'need-guarantor') return GUARANTOR_LAPSED
  return null
}

// Новый гарант: называет сторона, когда нужен другой; кандидат — участник, не сторона и не предмет
// спора (Р-26; у пари до выкатки предмета нет — как раньше)
export function checkNominate(state: OfferState, memberId: string, guarantor: unknown, room: RoomRoles, now: number): string | null {
  const o = offerAt(state, now)
  const settled = settledError(o)
  if (settled) return settled
  if (!sideOf(o, memberId)) return NOT_SIDE
  if (phaseOf(o, now).phase !== 'need-guarantor') return GUARANTOR_PRESENT
  if (typeof guarantor !== 'string' || !room.members.includes(guarantor) || sideOf(o, guarantor)) {
    return BAD_GUARANTOR
  }
  if (o.subject !== null && guarantor === o.subject) return SUBJECT_GUARANTOR
  return null
}

// Торг в записи offer.created (Р-37): открытое, не встречное; старт и шаг — целые > 0; odds — стартовый
// кэф { a: amount, b: start }; банк — точное целое
function auctionRecordOk(r: OfferCreated, a: AuctionTerms): boolean {
  const whole = (x: unknown) => Number.isSafeInteger(x) && (x as number) >= 1
  return (
    r.to === null &&
    r.counterTo === null &&
    whole(a.start) &&
    whole(a.step) &&
    r.odds.a === r.amount &&
    r.odds.b === a.start &&
    Number.isSafeInteger(r.amount + a.start)
  )
}

// Пари на обещание в записи offer.created (Р-44): без торга; кэф — PROMISE_ODDS, сумма — 0; оба обещания —
// не пустые, ≤ 300 знаков, без пробелов по краям
function promiseRecordOk(r: OfferCreated, p: OfferPromise): boolean {
  const ok = (s: unknown) => typeof s === 'string' && s !== '' && s === s.trim() && [...s].length <= MAX_EVENT_TEXT
  return r.auction === undefined && r.odds.a === PROMISE_ODDS.a && r.odds.b === PROMISE_ODDS.b && r.amount === 0 && ok(p.author) && ok(p.taker)
}

// Гарант пари помечен «выбыл» или пометку сняли (Р-41), миг at. Пометка — молчание гаранта (guarantorAway).
// Снятие: решение уже ушло от гаранта из-за пометки (нужен другой) — так и остаётся, как отказ в тот миг
// (declinedAt); не ушло — гарант снова в игре
function guarantorDropped(o: OfferState, dropped: boolean, at: number): void {
  if (dropped) {
    if (o.guarantorAway === undefined) o.guarantorAway = at
    return
  }
  if (o.guarantorAway === undefined) return
  const until = guarantorUntil(o, guarantorTurn(o), timesOf(o).silence)
  if (o.declinedAt === null && until !== null && at >= until) o.declinedAt = until
  delete o.guarantorAway
}

// Пари комнаты из записей по порядку создания. Запись действует, если её разрешают правила выше на
// её время at (так сервер и свёртка не расходятся); записи о неизвестном пари не действуют. Торг,
// кончившийся к at записи о пари, принимается до неё (offerAt): встречное в миг конца уже не действует
export function roomOffers(records: readonly OfferRecord[], room: RoomRoles): OfferState[] {
  const offers = new Map<string, OfferState>()
  for (const r of records) {
    if (r.type === 'offer.created') {
      if (offers.has(r.id)) continue
      if (r.counterTo !== null) {
        const original = offers.get(r.counterTo)
        if (!original || r.to !== original.authorId || checkCounter(original, r.memberId, room, r.at)) continue
        // Встречное — того же вида (Р-44): к пари на обещание — обещание, к пари на сумму — сумма
        if ((original.promise === undefined) !== (r.promise === undefined)) continue
      }
      if (r.auction !== undefined && !auctionRecordOk(r, r.auction)) continue
      if (r.promise !== undefined && !promiseRecordOk(r, r.promise)) continue
      // Гарант по умолчанию — ведущий на миг создания (Р-42): в записи он уже назван и со сменой ведения не меняется
      const roles = { ...room, hostId: hostAt(room, r.at) }
      const g = offerGuarantor({ to: r.to, guarantor: r.guarantor, noGuarantor: r.guarantor === null, subject: r.subject }, r.memberId, roles)
      if (!g.ok || g.value !== r.guarantor || checkOfferTimes(r, r.at) || checkOfferSubject(r, r.memberId, room)) continue
      const times = recordTimes(r.times)
      offers.set(r.id, {
        ...(times && { times }),
        ...(r.auction && { auction: { start: r.auction.start, step: r.auction.step, endsAt: r.closesAt, bids: [], taken: null } }),
        ...(r.promise && { promise: { author: r.promise.author, taker: r.promise.taker } }),
        id: r.id,
        at: r.at,
        authorId: r.memberId,
        condition: r.condition,
        check: r.check,
        side: r.side,
        odds: r.odds,
        amount: r.amount,
        to: r.to,
        closesAt: r.closesAt,
        expectedAt: r.expectedAt,
        counterTo: r.counterTo,
        subject: r.subject,
        guarantorRule: r.guarantorRule === true,
        courtAt: null,
        guarantorId: r.guarantor,
        guarantorSince: null,
        accepted: null,
        withdrawnAt: null,
        closedBy: null,
        marks: [],
        disagreedAt: null,
        agreed: null,
        decision: null,
        declinedAt: null,
        nominations: {},
      })
      continue
    }
    if (r.type === 'member.dropped' || r.type === 'member.reinstated') {
      for (const o of offers.values()) if (o.guarantorId === r.member) guarantorDropped(o, r.type === 'member.dropped', r.at)
      continue
    }
    const o = offers.get(r.offer)
    if (!o) continue
    const settled = offerAt(o, r.at)
    if (settled !== o) [o.accepted, o.auction] = [settled.accepted, settled.auction]
    switch (r.type) {
      case 'offer.bid': {
        if (checkBid(o, r.memberId, r.amount, room, r.at)) break
        const a = o.auction as AuctionState
        a.bids.push({ id: r.id, at: r.at, by: r.memberId, amount: r.amount })
        // Продление: встречное за 2 минуты до конца — конец через 2 минуты после него, не дальше предела
        a.endsAt = extendEnd({ endsAt: a.endsAt, closesAt: o.closesAt }, r.at)
        break
      }
      case 'offer.bid-accepted': {
        if (checkTakeBid(o, r.memberId, r.at)) break
        const a = o.auction as AuctionState
        o.accepted = { by: (bestBid(a) as AuctionBid).by, at: r.at }
        a.taken = 'now'
        break
      }
      case 'offer.accepted': {
        if (checkAccept(o, r.memberId, room, r.at)) break
        o.accepted = { by: r.memberId, at: r.at }
        // Автор принял встречное — исходное закрыто встречным, если его ещё можно было принять
        const original = o.counterTo === null ? undefined : offers.get(o.counterTo)
        if (original && !original.accepted && original.withdrawnAt === null && !original.closedBy) {
          original.closedBy = { offer: o.id, at: r.at }
        }
        break
      }
      case 'offer.withdrawn':
        if (!checkWithdraw(o, r.memberId)) o.withdrawnAt = r.at
        break
      case 'offer.marked': {
        if (checkMark(o, r.memberId, r.winner)) break
        const by = sideOf(o, r.memberId) as OfferSide
        if (currentMarks(o)[by] === r.winner) break
        o.marks.push({ by, winner: r.winner, at: r.at })
        const m = currentMarks(o)
        if (m.author !== null && m.author === m.taker) o.agreed = { winner: m.author, at: r.at }
        else if (m.author !== null && m.taker !== null && o.disagreedAt === null) o.disagreedAt = r.at
        break
      }
      case 'offer.decided':
        if (!checkDecide(o, r.memberId, r.winner, r.at)) o.decision = { winner: r.winner, at: r.at, by: r.memberId }
        break
      case 'offer.declined':
        if (!checkDecline(o, r.memberId, r.at)) o.declinedAt = r.at
        break
      case 'offer.nominated': {
        if (checkNominate(o, r.memberId, r.guarantor, room, r.at)) break
        o.nominations[sideOf(o, r.memberId) as OfferSide] = r.guarantor
        const n = o.nominations
        if (n.author !== undefined && n.author === n.taker) {
          o.guarantorId = n.author
          o.guarantorSince = r.at
          o.declinedAt = null
          o.nominations = {}
          delete o.guarantorAway
        }
        break
      }
      case 'court.drawn':
        // Первый сбор в срок (Р-31); жребий и кандидатов проверяет roomAppeals (appeal.ts) — сервер пишет
        // запись, только когда кандидаты есть
        if (o.courtAt === null && courtDue(o, r.at)) o.courtAt = r.at
        break
    }
  }
  return [...offers.values()]
}

export type OfferOutcome = {
  phase: OfferPhase
  marks: Record<OfferSide, OfferSide | null>
  guarantorId: string | null // без гаранта (Р-36) — null
  turnAt: number // с какого мига решает гарант (если стороны не сойдутся раньше); без гаранта — суд
  guarantorUntil: number | null // до какого мига решает нынешний гарант; утверждено или гаранта нет — null
  needSince: number | null // с какого мига нужен другой гарант; без гаранта — с turnAt (суд или гарант)
  nominations: Partial<Record<OfferSide, string>>
  approved: { winner: OfferSide; at: number; how: 'agreement' | 'guarantor' | 'court'; by: string | null } | null
  finalAt: number | null // согласием — сразу; гарантом — через срок апелляции пари (7 дней у обычного, Р-35); апелляция — с решения суда (Р-24)
  // Суда нет — полей нет: ответ как до этапа 4 (всегда — с подъёмом версии протокола, задача сервера)
  appeal?: AppealView | null
  court?: CourtView | null
}

// Исход пари на now (время сервера), без будильника. Не принято — null. court — дело суда по пари
// (roomAppeals в appeal.ts; Р-24): апелляция подана до окончательности — окончательное с решения суда;
// «оставить» (или большинства нет) — прежний исход; «изменить» — утверждён судом; «отменить» — без выплат.
// Суд по «ждёт суда» (Р-31, без апелляции): «прав автор» / «прав соперник» — утверждён судом,
// окончательно сразу; «отменить» или большинства нет — без выплат
export function offerOutcome(state: OfferState, now: number, court: CourtCase | null = null): OfferOutcome | null {
  const o = offerAt(state, now)
  if (!o.accepted) return null
  const base = phaseOf(o, now)
  const { turnAt, until, needSince } = base
  let phase: OfferPhase = base.phase
  let approved: OfferOutcome['approved'] = o.agreed
    ? { winner: o.agreed.winner, at: o.agreed.at, how: 'agreement' as const, by: null }
    : o.decision
      ? { winner: o.decision.winner, at: o.decision.at, how: 'guarantor' as const, by: o.decision.by }
      : null
  let finalAt = approved ? (approved.how === 'agreement' ? approved.at : approved.at + timesOf(o).appeal) : null
  if (court?.appeal && approved) {
    const decision = courtVerdict(court, now)
    phase = 'approved'
    finalAt = null
    if (decision?.verdict === 'cancel') phase = 'cancelled'
    else if (decision) {
      if (decision.verdict === 'change' && 'winner' in decision) {
        approved = { winner: decision.winner, at: decision.at, how: 'court', by: null }
      }
      phase = 'final'
      finalAt = decision.at
    }
  } else if (court && !court.appeal && phase === 'court') {
    const decision = courtVerdict(court, now)
    if (decision?.verdict === 'change' && 'winner' in decision) {
      approved = { winner: decision.winner, at: decision.at, how: 'court', by: null }
      phase = 'final'
      finalAt = decision.at
    } else if (decision) phase = 'cancelled'
  }
  return {
    phase,
    marks: currentMarks(o),
    guarantorId: o.guarantorId,
    turnAt,
    guarantorUntil: approved ? null : until,
    needSince,
    nominations: { ...o.nominations },
    approved,
    finalAt,
    ...(court && { appeal: appealView(court), court: courtView(court, now) }),
  }
}

// Итог пари для «Расчёта»: только окончательное — плюс или минус каждой стороны; иначе пусто. Суммы —
// offerAmounts: у торга (Р-37) — автора и принятого встречного; «не состоялось» не принято — пусто
export function offerResult(state: OfferState, now: number, court: CourtCase | null = null): { memberId: string; net: number }[] {
  const o = offerAt(state, now)
  // На обещание (Р-44) денег нет: исполнение — в «Расчёте», блок «Обещания» (settle.ts, roomPromises)
  if (o.promise) return []
  const out = offerOutcome(o, now, court)
  if (!o.accepted || !out?.approved || out.phase !== 'final') return []
  const stakes = offerAmounts(o)
  if (!stakes.ok) return []
  const nets = offerNets(stakes.value, out.approved.winner)
  return [
    { memberId: o.authorId, net: nets.author },
    { memberId: o.accepted.by, net: nets.taker },
  ]
}

// Пари в журнале комнаты (Р-22; исход — Р-23). requestId — номер запроса телефона: повтор узнаётся по нему
const OFFER_ENTRIES = [
  'offer.created',
  'offer.accepted',
  'offer.revoked',
  'offer.marked',
  'offer.decided',
  'offer.declined',
  'offer.nominated',
  'offer.bid',
  'offer.bid-accepted',
] as const
export type OfferEntry = Extract<LogEntry, { type: (typeof OFFER_ENTRIES)[number] }>

export function isOfferEntry(e: LogEntry): e is OfferEntry {
  return (OFFER_ENTRIES as readonly string[]).includes(e.type)
}

// Запись журнала → запись правил: offer.revoked журнала — это offer.withdrawn правил
export function offerRecord(e: OfferEntry): OfferRecord {
  const base = { id: e.id, at: e.at, memberId: e.memberId }
  switch (e.type) {
    case 'offer.accepted':
      return { ...base, type: 'offer.accepted', offer: e.offer }
    case 'offer.revoked':
      return { ...base, type: 'offer.withdrawn', offer: e.offer }
    case 'offer.marked':
      return { ...base, type: 'offer.marked', offer: e.offer, winner: e.winner }
    case 'offer.decided':
      return { ...base, type: 'offer.decided', offer: e.offer, winner: e.winner }
    case 'offer.declined':
      return { ...base, type: 'offer.declined', offer: e.offer }
    case 'offer.nominated':
      return { ...base, type: 'offer.nominated', offer: e.offer, guarantor: e.guarantor }
    case 'offer.bid':
      return { ...base, type: 'offer.bid', offer: e.offer, amount: e.amount }
    case 'offer.bid-accepted':
      return { ...base, type: 'offer.bid-accepted', offer: e.offer }
    case 'offer.created':
      return {
        ...base,
        type: 'offer.created',
        condition: e.condition,
        check: e.check,
        side: e.side,
        odds: { a: e.odds.a, b: e.odds.b },
        amount: e.amount,
        to: e.to,
        closesAt: e.closesAt,
        expectedAt: e.expectedAt,
        guarantor: e.guarantor,
        counterTo: e.counterTo,
        subject: e.subject ?? null,
        // Правило гаранта (Р-31): у пари до выкатки поля нет — и в записи правил его нет
        ...(e.guarantorRule === 1 && { guarantorRule: true }),
        // Сроки (Р-35): у пари до темпа поля нет — и в записи правил его нет
        ...(e.times !== undefined && { times: e.times }),
        // Торг (Р-37): у обычного пари поля нет
        ...(e.auction !== undefined && { auction: { start: e.auction.start, step: e.auction.step } }),
        // На обещание (Р-44): у пари на сумму поля нет
        ...(e.promise !== undefined && { promise: { author: e.promise.author, taker: e.promise.taker } }),
      }
  }
}

// Ведущий и участники комнаты — для правил пари
export function roomRoles(state: RoomState): RoomRoles {
  return { hostId: state.hostId, members: state.members.map((m) => m.id), ...(state.hosts && { hosts: state.hosts }) }
}

// Пари комнаты из журнала по порядку создания (roomOffers); комнаты нет — пусто. Суд по «ждёт суда»
// (court.drawn, Р-31) — тоже запись пари: после него решает только суд; записи о событиях не действуют
export function logOffers(log: readonly LogEntry[]): OfferState[] {
  const state = foldLog(log)
  if (!state) return []
  // «Выбыл» (Р-41) — только пометки, которые свёртка комнаты приняла (ведущий, участник в игре)
  const valid = new Set<string>()
  let s = null as RoomState | null
  for (const e of log) {
    const next = applyEntry(s, e)
    if ((e.type === 'member.dropped' || e.type === 'member.reinstated') && next !== s) valid.add(e.id)
    s = next
  }
  const records = log.flatMap((e): OfferRecord[] =>
    isOfferEntry(e)
      ? [offerRecord(e)]
      : e.type === 'court.drawn'
        ? [{ type: 'court.drawn', id: e.id, at: e.at, memberId: e.memberId, offer: e.target }]
        : (e.type === 'member.dropped' || e.type === 'member.reinstated') && valid.has(e.id)
          ? [{ type: e.type, id: e.id, at: e.at, memberId: e.memberId, member: e.member } as OfferRecord]
          : [],
  )
  return roomOffers(records, roomRoles(state))
}

// Условия пари для ответа: сумма соперника — по кэфу (offerStakes); гарант — нынешний. Торг (Р-37):
// сумма соперника — принятое встречное, до конца — лучшее, без встречных — старт (offerAmounts); кэф —
// отношение сумм { a: сумма автора, b: сумма соперника } (только для показа); auction — старт, шаг и
// «торг закончится не позже …». На обещание (Р-44): promise — обещания сторон, суммы — 0, кэф — PROMISE_ODDS
export function offerInfo(o: OfferState): OfferInfo {
  const stakes = offerAmounts(o)
  const taker = stakes.ok ? stakes.value.taker : 0
  return {
    id: o.id,
    at: o.at,
    authorId: o.authorId,
    condition: o.condition,
    check: o.check,
    side: o.side,
    odds: o.auction ? { a: o.amount, b: taker } : { a: o.odds.a, b: o.odds.b },
    amount: o.amount,
    takerAmount: taker,
    to: o.to,
    closesAt: o.closesAt,
    expectedAt: o.expectedAt,
    guarantorId: o.guarantorId,
    counterTo: o.counterTo,
    subjectId: o.subject,
    guarantorRule: o.guarantorRule,
    ...(o.auction && { auction: { start: o.auction.start, step: o.auction.step, latestEnd: auctionLatestEnd(o) } }),
    ...(o.promise && { promise: { author: o.promise.author, taker: o.promise.taker } }),
  }
}

// Торг на now (Р-37): встречные (кто, сколько, когда — видны всем, Р-11), лучшее, конец с продлениями и
// итог: принято («принять сейчас» — now, к концу — end) — каким встречным и когда; «не состоялось» —
// failed в миг конца; торг идёт или отозван — null
export function biddingView(o: OfferState, now: number): BiddingView | null {
  const x = offerAt(o, now)
  const a = x.auction
  if (!a) return null
  const bid = (b: AuctionBid) => ({ id: b.id, at: b.at, by: b.by, amount: b.amount })
  const best = bestBid(a)
  const status = offerStatus(x, now)
  const result: BiddingView['result'] =
    x.accepted && best
      ? { how: a.taken === 'now' ? 'now' : 'end', at: x.accepted.at, bid: best.id }
      : status === 'failed'
        ? { how: 'failed', at: a.endsAt }
        : null
  return { bids: a.bids.map(bid), best: best && bid(best), endsAt: a.endsAt, result }
}

// Пари для ответа GET /rooms/<номер>: статус на now (время сервера), кто принял, отзыв, встречное;
// исход (Р-23) — offerOutcome на now, у непринятого — null; court — дело суда по пари (Р-24); торг
// (Р-37) — на now (offerAt), bidding — его ход (biddingView); у обычного пари поля нет
export function offerView(state: OfferState, now: number, court: CourtCase | null = null): OfferView {
  const o = offerAt(state, now)
  const bidding = biddingView(o, now)
  return {
    ...offerInfo(o),
    status: offerStatus(o, now),
    accepted: o.accepted && { by: o.accepted.by, at: o.accepted.at },
    withdrawnAt: o.withdrawnAt,
    closedBy: o.closedBy && { offer: o.closedBy.offer, at: o.closedBy.at },
    outcome: offerOutcome(o, now, court),
    ...(bidding && { bidding }),
  }
}
