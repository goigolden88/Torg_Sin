// Пари один на один (Р-04, Р-05, Р-06; Архитектура, «Правила» — «Пари», «Исход пари»): суммы по
// кэфу, принять / отозвать / встречное, исход отметками сторон и гарантом. Здесь — проверка формы и
// состояние пари из записей OfferRecord (автор, время сервера at, порядок — порядок журнала); из
// журнала комнаты их берёт logOffers (Р-22: offer.created, offer.accepted, offer.revoked; Р-23: offer.marked,
// offer.decided, offer.declined, offer.nominated). Итоги и
// статусы считаются, не хранятся. Ни DOM, ни Cloudflare
import { checkAmount, FINAL_TIME, MAX_EVENT_TEXT, NEED_CHECK, NEED_CONDITION, LONG_CHECK, LONG_CONDITION } from './event'
import { appealView, courtVerdict, courtView, type CourtCase } from './court'
import type { AppealView, CourtView, OfferInfo, OfferView } from './protocol'
import { foldLog, type LogEntry, type RoomState } from './room'

const DAY = 24 * 60 * 60 * 1000
// Сторона молчит 3 дня после «исход к» или первой отметки (что позже) — решает гарант
export const SIDE_SILENCE = 3 * DAY
// Гарант молчит 3 дня с мига, как решение перешло к нему, — нужен другой гарант
export const GUARANTOR_SILENCE = 3 * DAY
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
export const NOT_TURN = 'Стороны ещё отмечают исход — гарант решает, когда они разошлись или одна молчит 3 дня'
export const GUARANTOR_LAPSED = 'Гарант не решил за 3 дня или отказался — стороны выбирают другого'
export const GUARANTOR_PRESENT = 'Гарант на месте — выбирать другого не нужно'

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
// subject — о ком спор (null — ни о ком; Р-26)
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
  subject: string | null
}

// Проверка формы без времени сервера и участников (их — checkOfferTimes, offerGuarantor,
// checkOfferSubject). Сторона не задана — «сбудется»
export function checkOfferInput(x: {
  condition: unknown
  check: unknown
  side?: unknown
  odds: unknown
  amount: unknown
  to?: unknown
  closesAt: unknown
  expectedAt: unknown
  guarantor?: unknown
  subject?: unknown
}): Checked<OfferInput> {
  const condition = text(x.condition, NEED_CONDITION, LONG_CONDITION)
  if (!condition.ok) return condition
  const check = text(x.check, NEED_CHECK, LONG_CHECK)
  if (!check.ok) return check
  const side = x.side === undefined || x.side === null ? 'yes' : x.side
  if (side !== 'yes' && side !== 'no') return { ok: false, error: BAD_SIDE }
  const o = x.odds as { a?: unknown; b?: unknown } | null
  if (typeof o !== 'object' || o === null || !odd(o.a) || !odd(o.b)) return { ok: false, error: BAD_ODDS }
  const odds = { a: o.a as number, b: o.b as number }
  const amount = checkAmount(x.amount)
  if (!amount.ok) return amount
  const stakes = offerStakes(odds, amount.value)
  if (!stakes.ok) return stakes
  if (!Number.isSafeInteger(x.closesAt) || !Number.isSafeInteger(x.expectedAt)) return { ok: false, error: NEED_TIMES }
  const member = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v !== '')
  if (!member(x.to)) return { ok: false, error: BAD_ADDRESSEE }
  if (!member(x.guarantor)) return { ok: false, error: BAD_GUARANTOR }
  if (!member(x.subject)) return { ok: false, error: BAD_SUBJECT }
  return {
    ok: true,
    value: {
      condition: condition.value,
      check: check.value,
      side,
      odds,
      amount: amount.value,
      to: typeof x.to === 'string' ? x.to : null,
      closesAt: x.closesAt as number,
      expectedAt: x.expectedAt as number,
      guarantor: typeof x.guarantor === 'string' ? x.guarantor : null,
      subject: typeof x.subject === 'string' ? x.subject : null,
    },
  }
}

// Сроки по времени сервера: «приём до» — впереди, «исход к» — не раньше него. Ошибки нет — null
export function checkOfferTimes(input: { closesAt: number; expectedAt: number }, now: number): string | null {
  if (input.closesAt <= now) return CLOSE_PASSED
  if (input.expectedAt < input.closesAt) return EXPECTED_EARLY
  return null
}

export type RoomRoles = { hostId: string; members: readonly string[] }

// Гарант пари: выбран — участник, не автор и не адресат; не выбран — ведущий, а ведущий сам автор
// или адресат — отказ (гаранта надо выбрать). Заодно проверяет адресата: другой участник. Предмет
// спора (Р-26; нет — null) гарантом не бывает: ведущий — предмет — гаранта тоже надо выбрать
export function offerGuarantor(
  input: { to: string | null; guarantor: string | null; subject?: string | null },
  authorId: string,
  room: RoomRoles,
): Checked<string> {
  if (input.to !== null && (input.to === authorId || !room.members.includes(input.to))) {
    return { ok: false, error: BAD_ADDRESSEE }
  }
  const subject = input.subject ?? null
  const g = input.guarantor
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
// Номер пари — id записи offer.created; guarantor в ней — уже определённый (offerGuarantor)
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
  guarantor: string
  counterTo: string | null // встречное к какому пари
  subject: string | null // о ком спор (Р-26); у пари до выкатки — null
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

export type OfferMark = { by: OfferSide; winner: OfferSide; at: number }

// Пари из записей
export type OfferState = Omit<OfferCreated, 'type' | 'memberId' | 'guarantor'> & {
  authorId: string
  guarantorId: string
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
}

export type OfferStatus = 'open' | 'expired' | 'withdrawn' | 'countered' | 'accepted'

// Статус предложения на now (время сервера): приём закрывается в срок, «приём до» — не включая
export function offerStatus(o: OfferState, now: number): OfferStatus {
  if (o.accepted) return 'accepted'
  if (o.withdrawnAt !== null) return 'withdrawn'
  if (o.closedBy) return 'countered'
  return now >= o.closesAt ? 'expired' : 'open'
}

// Принять: адресное — только адресат; открытое — любой участник, кроме автора и гаранта; до «приём до».
// Предмет спора (Р-26) принимает, только если автор — за «не сбудется»: сам он тогда — за «сбудется»
export function checkAccept(o: OfferState, memberId: string, room: RoomRoles, now: number): string | null {
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

// Отозвать — автор, пока не принято
export function checkWithdraw(o: OfferState, memberId: string): string | null {
  if (memberId !== o.authorId) return ONLY_AUTHOR
  if (o.accepted) return ACCEPTED_NO_WITHDRAW
  if (o.withdrawnAt !== null) return WITHDRAWN
  if (o.closedBy) return COUNTERED
  return null
}

// Встречное — тот, кто мог бы принять исходное, и пока его можно принять
export function checkCounter(o: OfferState, memberId: string, room: RoomRoles, now: number): string | null {
  const status = offerStatus(o, now)
  if (status === 'withdrawn') return COUNTER_WITHDRAWN
  if (status === 'accepted') return COUNTER_ACCEPTED
  if (memberId === o.authorId) return OWN_COUNTER
  if (memberId === o.guarantorId) return GUARANTOR_COUNTERS
  return checkAccept(o, memberId, room, now)
}

// Форма встречного: своё — кэф, сумма и «приём до»; условие, «как проверяем», «исход к» — исходного;
// сторона — обратная, адресат — автор исходного, гарант — тот же (он не автор и не принимает пари);
// о ком спор — тот же (Р-26): правило предмета то же
export function counterInput(o: OfferState, x: { odds: Odds; amount: number; closesAt: number }): OfferInput {
  return {
    condition: o.condition,
    check: o.check,
    side: o.side === 'yes' ? 'no' : 'yes',
    odds: x.odds,
    amount: x.amount,
    to: o.authorId,
    closesAt: x.closesAt,
    expectedAt: o.expectedAt,
    guarantor: o.guarantorId,
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

// С какого мига решает гарант: отметки разошлись или одна сторона молчит 3 дня после «исход к»
// (или после первой отметки, что позже; не отметил никто — после «исход к»)
export function guarantorTurn(o: OfferState): number {
  const silence = Math.max(o.expectedAt, o.marks[0]?.at ?? o.expectedAt) + SIDE_SILENCE
  return o.disagreedAt === null ? silence : Math.min(o.disagreedAt, silence)
}

// cancelled — суд отменил пари (Р-24), phaseOf его не даёт: только offerOutcome с делом суда
export type OfferPhase = 'marking' | 'guarantor' | 'need-guarantor' | 'approved' | 'final' | 'cancelled'

// Ход исхода на now: решение у гаранта — 3 дня с мига, как перешло к нему (назначен сторонами позже —
// с назначения); не решил или отказался — нужен другой гарант
function phaseOf(o: OfferState, now: number) {
  const turnAt = guarantorTurn(o)
  const until = Math.max(turnAt, o.guarantorSince ?? turnAt) + GUARANTOR_SILENCE
  let phase: OfferPhase = 'marking'
  let needSince: number | null = null
  if (o.agreed) phase = 'final'
  else if (o.decision) phase = now >= o.decision.at + FINAL_TIME ? 'final' : 'approved'
  else if (o.declinedAt !== null) [phase, needSince] = ['need-guarantor', o.declinedAt]
  else if (now >= until) [phase, needSince] = ['need-guarantor', until]
  else if (now >= turnAt) phase = 'guarantor'
  return { phase, turnAt, until, needSince }
}

// Решение гаранта: только нынешний гарант, когда решение перешло к нему и его 3 дня не прошли
export function checkDecide(o: OfferState, memberId: string, winner: unknown, now: number): string | null {
  if (winner !== 'author' && winner !== 'taker') return BAD_MARK
  const settled = settledError(o)
  if (settled) return settled
  if (memberId !== o.guarantorId) return ONLY_GUARANTOR
  const { phase } = phaseOf(o, now)
  if (phase === 'need-guarantor') return GUARANTOR_LAPSED
  if (phase === 'marking') return NOT_TURN
  return null
}

// Отказ гаранта: нынешний гарант принятого пари, пока исход не утверждён и его не сменяют
export function checkDecline(o: OfferState, memberId: string, now: number): string | null {
  const settled = settledError(o)
  if (settled) return settled
  if (memberId !== o.guarantorId) return ONLY_GUARANTOR
  if (phaseOf(o, now).phase === 'need-guarantor') return GUARANTOR_LAPSED
  return null
}

// Новый гарант: называет сторона, когда нужен другой; кандидат — участник, не сторона
export function checkNominate(o: OfferState, memberId: string, guarantor: unknown, room: RoomRoles, now: number): string | null {
  const settled = settledError(o)
  if (settled) return settled
  if (!sideOf(o, memberId)) return NOT_SIDE
  if (phaseOf(o, now).phase !== 'need-guarantor') return GUARANTOR_PRESENT
  if (typeof guarantor !== 'string' || !room.members.includes(guarantor) || sideOf(o, guarantor)) {
    return BAD_GUARANTOR
  }
  return null
}

// Пари комнаты из записей по порядку создания. Запись действует, если её разрешают правила выше на
// её время at (так сервер и свёртка не расходятся); записи о неизвестном пари не действуют
export function roomOffers(records: readonly OfferRecord[], room: RoomRoles): OfferState[] {
  const offers = new Map<string, OfferState>()
  for (const r of records) {
    if (r.type === 'offer.created') {
      if (offers.has(r.id)) continue
      if (r.counterTo !== null) {
        const original = offers.get(r.counterTo)
        if (!original || r.to !== original.authorId || checkCounter(original, r.memberId, room, r.at)) continue
      }
      const g = offerGuarantor({ to: r.to, guarantor: r.guarantor, subject: r.subject }, r.memberId, room)
      if (!g.ok || g.value !== r.guarantor || checkOfferTimes(r, r.at) || checkOfferSubject(r, r.memberId, room)) continue
      offers.set(r.id, {
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
    const o = offers.get(r.offer)
    if (!o) continue
    switch (r.type) {
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
        }
        break
      }
    }
  }
  return [...offers.values()]
}

export type OfferOutcome = {
  phase: OfferPhase
  marks: Record<OfferSide, OfferSide | null>
  guarantorId: string
  turnAt: number // с какого мига решает гарант (если стороны не сойдутся раньше)
  guarantorUntil: number | null // до какого мига решает нынешний гарант; утверждено — null
  needSince: number | null // с какого мига нужен другой гарант
  nominations: Partial<Record<OfferSide, string>>
  approved: { winner: OfferSide; at: number; how: 'agreement' | 'guarantor' | 'court'; by: string | null } | null
  finalAt: number | null // согласием — сразу; гарантом — через 7 дней; апелляция — с решения суда (Р-24)
  // Суда нет — полей нет: ответ как до этапа 4 (всегда — с подъёмом версии протокола, задача сервера)
  appeal?: AppealView | null
  court?: CourtView | null
}

// Исход пари на now (время сервера), без будильника. Не принято — null. court — дело суда по пари
// (roomAppeals в appeal.ts; Р-24): апелляция подана до окончательности — окончательное с решения суда;
// «оставить» (или большинства нет) — прежний исход; «изменить» — утверждён судом; «отменить» — без выплат
export function offerOutcome(o: OfferState, now: number, court: CourtCase | null = null): OfferOutcome | null {
  if (!o.accepted) return null
  const base = phaseOf(o, now)
  const { turnAt, until, needSince } = base
  let phase: OfferPhase = base.phase
  let approved: OfferOutcome['approved'] = o.agreed
    ? { winner: o.agreed.winner, at: o.agreed.at, how: 'agreement' as const, by: null }
    : o.decision
      ? { winner: o.decision.winner, at: o.decision.at, how: 'guarantor' as const, by: o.decision.by }
      : null
  let finalAt = approved ? (approved.how === 'agreement' ? approved.at : approved.at + FINAL_TIME) : null
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

// Итог пари для «Расчёта»: только окончательное — плюс или минус каждой стороны; иначе пусто
export function offerResult(o: OfferState, now: number, court: CourtCase | null = null): { memberId: string; net: number }[] {
  const out = offerOutcome(o, now, court)
  if (!o.accepted || !out?.approved || out.phase !== 'final') return []
  const stakes = offerStakes(o.odds, o.amount)
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
      }
  }
}

// Ведущий и участники комнаты — для правил пари
export function roomRoles(state: RoomState): RoomRoles {
  return { hostId: state.hostId, members: state.members.map((m) => m.id) }
}

// Пари комнаты из журнала по порядку создания (roomOffers); комнаты нет — пусто
export function logOffers(log: readonly LogEntry[]): OfferState[] {
  const state = foldLog(log)
  return state ? roomOffers(log.filter(isOfferEntry).map(offerRecord), roomRoles(state)) : []
}

// Условия пари для ответа: сумма соперника — по кэфу (offerStakes); гарант — нынешний
export function offerInfo(o: OfferState): OfferInfo {
  const stakes = offerStakes(o.odds, o.amount)
  return {
    id: o.id,
    at: o.at,
    authorId: o.authorId,
    condition: o.condition,
    check: o.check,
    side: o.side,
    odds: { a: o.odds.a, b: o.odds.b },
    amount: o.amount,
    takerAmount: stakes.ok ? stakes.value.taker : 0,
    to: o.to,
    closesAt: o.closesAt,
    expectedAt: o.expectedAt,
    guarantorId: o.guarantorId,
    counterTo: o.counterTo,
    subjectId: o.subject,
  }
}

// Пари для ответа GET /rooms/<номер>: статус на now (время сервера), кто принял, отзыв, встречное;
// исход (Р-23) — offerOutcome на now, у непринятого — null; court — дело суда по пари (Р-24)
export function offerView(o: OfferState, now: number, court: CourtCase | null = null): OfferView {
  return {
    ...offerInfo(o),
    status: offerStatus(o, now),
    accepted: o.accepted && { by: o.accepted.by, at: o.accepted.at },
    withdrawnAt: o.withdrawnAt,
    closedBy: o.closedBy && { offer: o.closedBy.offer, at: o.closedBy.at },
    outcome: offerOutcome(o, now, court),
  }
}
