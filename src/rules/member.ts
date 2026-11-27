// Жизнь комнаты (Р-40, Р-41; Архитектура, «Крайние случаи» — «Участник пропал с долгом»): выйти из
// комнаты, «выбыл» и что можно выбывшему; ведение (Р-42); закрыть комнату (Р-43). Состав «вышел / выбыл» считает свёртка комнаты (applyEntry в
// room.ts: member.left, member.returned, member.dropped, member.reinstated); здесь — проверки действий на
// время сервера. Итоги и статусы считаются, не хранятся. Ни DOM, ни Cloudflare
import { caseOf, courtState, courtVerdict, type CourtCase } from './appeal'
import { choiceOutcome, type ChoiceState } from './choice'
import { eventOutcome, type EventState } from './event'
import { bestLotBid, lotOutcome, type LotState } from './lot'
import { checkWithdraw, offerAt, offerOutcome, offerStatus, sideOf, type OfferState } from './offer'
import { formatCountdown } from './date'
import { hostSince, inPlay, inRoom, type LogEntry, type Member, type RoomState } from './room'
import { roomPromises, roomSettlement, roomTransfers, type PromiseRecord, type TransferRecord } from './settle'

// Выйти (Р-40): отказ называет, что мешает, — первое по порядку
export const HOST_LEAVES = 'Сначала передайте ведение'
export const openBet = (event: string) => `Есть открытая ставка: ${event}`
export const openOffer = (offer: string) => `Есть принятое пари: ${offer}`
export const ownBid = (offer: string) => `Есть ваше встречное в идущем торге: ${offer}`
export const ownAuction = (offer: string) => `Идёт торг по вашему пари со встречными: ${offer}`
export const openLot = (lot: string) => `Есть незавершённый лот: ${lot}`
export const openChoice = (choice: string) => `Есть вклад в идущий «Выбор»: ${choice}`
export const guarantorIn = (offer: string) => `Вы гарант незавершённого пари: ${offer}`
export const jurorIn = (dispute: string) => `Вы в суде, решение ещё не собрано: ${dispute}`
export const UNSETTLED = 'Не все ваши переводы «Расчёта» отмечены'
// Обещание (Р-44) не получено — как неотмеченный перевод
export const UNKEPT_PROMISE = 'Не все ваши обещания «Расчёта» отмечены «Получил»'
// Вышедший: ключи его устройств больше не пускают; вернуться — по ссылке комнаты, впускает ведущий
export const LEFT = 'Вы вышли из комнаты — вернуться можно по ссылке-приглашению, впустит ведущий'

// «Выбыл» (Р-41): ставит и снимает ведущий
export const ONLY_HOST_DROP = 'Пометить «выбыл» и снять пометку может только ведущий'
export const HOST_NOT_DROPPED = 'Ведущего «выбыл» не помечают'
export const NO_MEMBER = 'Нет такого участника'
export const MEMBER_LEFT = 'Участник вышел из комнаты'
export const ALREADY_DROPPED = 'Участник уже помечен «выбыл»'
export const NOT_DROPPED = 'Участник не помечен «выбыл»'
// Выбывший не начинает нового; своё доигрывает и отмечает переводы
export const DROPPED = 'Вы помечены «выбыл»: новых ставок, пари, встречных, вкладов, событий и апелляций нельзя — можно доигрывать своё и отмечать переводы'

// Ведение (Р-42): передаёт ведущий участнику в игре; берёт участник в игре, если ведущий 7 дней не делал
// запросов ни с одного устройства — срок один при любом темпе (Р-35)
export const HOST_AWAY = 7 * 24 * 60 * 60 * 1000
export const ONLY_HOST_PASS = 'Передать ведение может только ведущий'
export const PASS_SELF = 'Вы уже ведущий — выберите другого участника'
export const PASS_LEFT = 'Участник вышел из комнаты — ведение ему не передать'
export const PASS_DROPPED = 'Участник помечен «выбыл» — ведение ему не передать'
export const ALREADY_HOST = 'Вы уже ведущий'
export const TAKE_DROPPED = 'Вы помечены «выбыл» — ведение не взять'
export const hostTakenBy = (name: string) => `Ведение уже взял ${name}`
export const hostPassedTo = (name: string) => `Ведение уже передано: ведущий — ${name}`
export const hostSeen = (ago: string, wait: string) => `Ведущий заходил ${ago} назад: взять ведение можно через ${wait}`

// Закрыть комнату (Р-43): закрывает и открывает снова ведущий; закрыть — только когда всё доиграно; в закрытой
// — только чтение и отметки переводов «Расчёта»
export const ONLY_HOST_CLOSE = 'Закрыть комнату и открыть снова может только ведущий'
export const ALREADY_CLOSED = 'Комната уже закрыта'
export const NOT_CLOSED = 'Комната не закрыта'
export const ROOM_CLOSED = 'Комната закрыта'
export const openEvent = (event: string) => `Есть незавершённое событие: ${event}`
export const openOfferIn = (offer: string) => `Есть незавершённое пари: ${offer}`
export const openAuction = (offer: string) => `Идёт торг: ${offer}`
export const openLotIn = (lot: string) => `Есть незавершённый лот: ${lot}`
export const openChoiceIn = (choice: string) => `Идёт «Выбор»: ${choice}`
export const openCourt = (dispute: string) => `Идёт суд: ${dispute}`

// Комната на очки — переводов нет (Р-32): «все переводы отмечены» там не проверяется
const POINTS = 'PTS'

// Всё о комнате на миг выхода: участники и ведущий, валюта, события, пари, лоты, выборы, дела суда и
// записи о переводах — как у свода «Расчёта»
export type LeaveRoom = {
  state: RoomState
  events: readonly EventState[]
  offers: readonly OfferState[]
  lots: readonly LotState[]
  choices: readonly ChoiceState[]
  cases: readonly CourtCase[]
  transfers: readonly TransferRecord[]
  promises?: readonly PromiseRecord[] // отметки обещаний (Р-44); нет — отметок нет
}

// Участник по номеру; нет — null
function memberOf(state: RoomState, id: string): Member | null {
  return state.members.find((m) => m.id === id) ?? null
}

// Пари завершено на now: не принято и уже не принять (истекло, отозвано, закрыто встречным, торг не
// состоялся) или исход окончательный либо отменён судом
function offerDone(o: OfferState, now: number, court: CourtCase | null): boolean {
  const status = offerStatus(o, now)
  if (status === 'open') return false
  if (status !== 'accepted') return true
  const phase = offerOutcome(o, now, court)?.phase
  return phase === 'final' || phase === 'cancelled'
}

// Свои непринятые пари и торги без встречных — их выход отзывает сам (Р-40): автор может отозвать, и
// пари ещё можно принять
export function leaveRevocations(offers: readonly OfferState[], memberId: string, now: number): OfferState[] {
  return offers.filter((raw) => {
    const o = offerAt(raw, now)
    return o.authorId === memberId && offerStatus(o, now) === 'open' && checkWithdraw(o, memberId) === null
  })
}

// Что мешает выйти на now (Р-40), первое по порядку; можно — null. Отзываемые сами (leaveRevocations) не
// мешают. Ведущий — сначала передать ведение; незавершённое: ставка в событии, принятое пари стороной,
// своё встречное в идущем торге, свой торг со встречными, лот продавцом или лучшей ставкой (после торга —
// победителем), вклад в «Выбор», гарант пари, место в суде без голоса, пока решения нет; переводы — баланс
// не ноль или перевод с ним ждёт подтверждения; обещание (Р-44) с ним, ещё не «получено»
export function checkLeave(room: LeaveRoom, memberId: string, now: number): string | null {
  const { state } = room
  const me = memberOf(state, memberId)
  if (!me || !inRoom(me)) return NO_MEMBER
  if (memberId === state.hostId) return HOST_LEAVES
  for (const e of room.events) {
    if (e.cancelled || !e.bets.some((b) => b.memberId === memberId)) continue
    const status = eventOutcome(e, now, caseOf(room.cases, e.id))?.status
    if (status !== 'final' && status !== 'cancelled') return openBet(e.condition)
  }
  const offers = room.offers.map((o) => offerAt(o, now))
  for (const o of offers) {
    if (o.accepted && sideOf(o, memberId) && !offerDone(o, now, caseOf(room.cases, o.id))) return openOffer(o.condition)
  }
  for (const o of offers) {
    if (o.auction && offerStatus(o, now) === 'open' && o.auction.bids.some((b) => b.by === memberId)) return ownBid(o.condition)
  }
  for (const o of offers) {
    if (o.auction && o.authorId === memberId && offerStatus(o, now) === 'open' && o.auction.bids.length > 0) return ownAuction(o.condition)
  }
  for (const l of room.lots) {
    const out = lotOutcome(l, now, caseOf(room.cases, l.id))
    if (out.status !== 'open' && out.status !== 'awaiting' && out.status !== 'handed' && out.status !== 'dispute' && out.status !== 'court') continue
    const lead = out.status === 'open' ? bestLotBid(l)?.by : out.winner?.by
    if (l.sellerId === memberId || lead === memberId) return openLot(l.title)
  }
  for (const c of room.choices) {
    const status = choiceOutcome(c, now).status
    if (status !== 'decided' && status !== 'failed' && c.stakes.some((s) => s.by === memberId)) return openChoice(c.question)
  }
  for (const o of offers) {
    if (o.guarantorId === memberId && !offerDone(o, now, caseOf(room.cases, o.id))) return guarantorIn(o.condition)
  }
  for (const c of room.cases) {
    if (courtVerdict(c, now)) continue
    if (!courtState(c, now).seats.some((s) => s.member === memberId && !s.vote)) continue
    return jurorIn(disputeTitle(room, c.target))
  }
  if (state.currency !== POINTS) {
    const members = state.members.map((m) => m.id)
    const settlement = roomSettlement(
      { currency: state.currency, members, events: room.events, offers: room.offers, lots: room.lots, choices: room.choices, cases: room.cases, transfers: room.transfers },
      now,
    )
    const balance = settlement.members.find((m) => m.memberId === memberId)?.balance ?? 0
    const pending = roomTransfers(room.transfers, { currency: state.currency, members }).some(
      (t) => (t.from === memberId || t.to === memberId) && t.status === 'pending',
    )
    if (balance !== 0 || pending) return UNSETTLED
  }
  // Обещания (Р-44) — в любой комнате: своё или тебе, ещё не «получено»
  const unkept = roomPromises(room.offers, room.cases, room.promises ?? [], now).some(
    (p) => (p.from === memberId || p.to === memberId) && p.status !== 'received',
  )
  if (unkept) return UNKEPT_PROMISE
  return null
}

// Название спора для отказа: условие события или пари, название лота
function disputeTitle(room: LeaveRoom, target: string): string {
  return (
    room.events.find((e) => e.id === target)?.condition ??
    room.offers.find((o) => o.id === target)?.condition ??
    room.lots.find((l) => l.id === target)?.title ??
    ''
  )
}

// Пометить «выбыл» (dropped — true) или снять пометку (false): только ведущий; участник в комнате, не
// ведущий; уже помечен / не помечен — отказ. Можно — null
export function checkDrop(state: RoomState, memberId: string, member: unknown, dropped: boolean): string | null {
  if (memberId !== state.hostId) return ONLY_HOST_DROP
  const m = typeof member === 'string' ? memberOf(state, member) : null
  if (!m) return NO_MEMBER
  if (m.id === state.hostId) return HOST_NOT_DROPPED
  if (!inRoom(m)) return MEMBER_LEFT
  if (dropped) return m.droppedAt === undefined ? null : ALREADY_DROPPED
  return m.droppedAt === undefined ? NOT_DROPPED : null
}

// Передать ведение (Р-42): только ведущий; кому — участник в комнате, не «выбыл», не сам ведущий. Можно — null
export function checkPassHost(state: RoomState, memberId: string, to: unknown): string | null {
  if (memberId !== state.hostId) return ONLY_HOST_PASS
  const m = typeof to === 'string' ? memberOf(state, to) : null
  if (!m) return NO_MEMBER
  if (m.id === state.hostId) return PASS_SELF
  if (!inRoom(m)) return PASS_LEFT
  return m.droppedAt === undefined ? null : PASS_DROPPED
}

// Когда ведущий заходил (Р-42): seen — время его последнего запроса, которое помнит сервер (обновляется
// не чаще раза в час; нет — не помнит); не раньше, чем он стал ведущим, и не раньше его последней записи в
// журнале (у старых комнат и после восстановления из копии сервер его запросов не помнит). Жребий суда и
// выбора дописывает сам сервер от имени ведущего — не его запрос
export function hostSeenAt(log: readonly LogEntry[], state: RoomState, seen: number | undefined): number {
  let at = Math.max(seen ?? 0, hostSince(state) ?? state.createdAt)
  for (const e of log) {
    if (e.memberId === state.hostId && e.type !== 'court.drawn' && e.type !== 'choice.drawn' && e.at > at) at = e.at
  }
  return at
}

// С какого мига можно взять ведение: через 7 дней после того, как ведущий заходил
export function takeHostFrom(seenAt: number): number {
  return seenAt + HOST_AWAY
}

// Взять ведение (Р-42) на now: участник в комнате, не «выбыл», не сам ведущий; ведущий не заходил 7 дней
// (seenAt — hostSeenAt). Ведущий сменился за эти 7 дней — «уже взял» / «уже передано» с именем нового (взял
// первый успевший), иначе — «заходил … назад: можно через …». Можно — null
export function checkTakeHost(state: RoomState, memberId: string, seenAt: number, now: number): string | null {
  const me = memberOf(state, memberId)
  if (!me || !inRoom(me)) return NO_MEMBER
  if (memberId === state.hostId) return ALREADY_HOST
  if (me.droppedAt !== undefined) return TAKE_DROPPED
  const from = takeHostFrom(seenAt)
  if (now >= from) return null
  const last = state.hosts?.at(-1)
  const name = memberOf(state, state.hostId)?.name ?? ''
  if (last && last.how !== 'created' && now < last.from + HOST_AWAY) return last.how === 'taken' ? hostTakenBy(name) : hostPassedTo(name)
  return hostSeen(formatCountdown(now - seenAt), formatCountdown(from - now))
}

// Лот не завершён на now: торг идёт или после торга передача, спор, суд
const LOT_OPEN: readonly string[] = ['open', 'awaiting', 'handed', 'dispute', 'court']

// Что мешает закрыть комнату на now (Р-43), первое по порядку; можно — null. Закрывает только ведущий, не
// закрытую. Незавершённое: событие (не отменено и исход не окончательный — в том числе без ставок и без
// предложенного исхода), пари (ещё можно принять или принято, а исход не окончательный и не отменён), торг
// (идёт), лот (торг или передача не закончены), «Выбор» (нет итога), суд (решение не собрано). Переводы не
// мешают — их отмечают и в закрытой
export function checkClose(room: LeaveRoom, memberId: string, now: number): string | null {
  const { state } = room
  if (memberId !== state.hostId) return ONLY_HOST_CLOSE
  if (state.closed) return ALREADY_CLOSED
  for (const e of room.events) {
    if (e.cancelled) continue
    const status = eventOutcome(e, now, caseOf(room.cases, e.id))?.status
    if (status !== 'final' && status !== 'cancelled') return openEvent(e.condition)
  }
  const offers = room.offers.map((o) => offerAt(o, now))
  for (const o of offers) {
    if (!o.auction && !offerDone(o, now, caseOf(room.cases, o.id))) return openOfferIn(o.condition)
  }
  for (const o of offers) {
    if (!o.auction || offerDone(o, now, caseOf(room.cases, o.id))) continue
    return offerStatus(o, now) === 'open' ? openAuction(o.condition) : openOfferIn(o.condition)
  }
  for (const l of room.lots) {
    if (LOT_OPEN.includes(lotOutcome(l, now, caseOf(room.cases, l.id)).status)) return openLotIn(l.title)
  }
  for (const c of room.choices) {
    const status = choiceOutcome(c, now).status
    if (status !== 'decided' && status !== 'failed') return openChoiceIn(c.question)
  }
  for (const c of room.cases) {
    if (!courtVerdict(c, now)) return openCourt(disputeTitle(room, c.target))
  }
  return null
}

// Открыть закрытую снова (Р-43): только ведущий; не закрыта — отказ. Можно — null
export function checkReopen(state: RoomState, memberId: string): string | null {
  if (memberId !== state.hostId) return ONLY_HOST_CLOSE
  return state.closed ? null : NOT_CLOSED
}

// Новая запись в закрытой комнате (Р-43) — отказ «Комната закрыта»; можно — null. Отметки переводов и
// «открыть снова» этой проверки не проходят: их можно и в закрытой
export function checkOpen(state: RoomState): string | null {
  return state.closed ? ROOM_CLOSED : null
}

// Новое действие (ставка, пари, встречное, вклад, событие, лот, выбор, апелляция): выбывшему — отказ (Р-41)
export function checkActive(state: RoomState, memberId: string): string | null {
  const m = memberOf(state, memberId)
  return m && m.droppedAt !== undefined ? DROPPED : null
}

// Участники в игре (не вышли и не выбыли) — их можно назвать гарантом, адресатом, получателем; ими судят
export function playingMembers(state: RoomState): string[] {
  return state.members.filter(inPlay).map((m) => m.id)
}

// Участники в комнате (не вышли)
export function roomMembers(state: RoomState): string[] {
  return state.members.filter(inRoom).map((m) => m.id)
}
