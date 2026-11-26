// Жизнь комнаты (Р-40, Р-41; Архитектура, «Крайние случаи» — «Участник пропал с долгом»): выйти из
// комнаты, «выбыл» и что можно выбывшему. Состав «вышел / выбыл» считает свёртка комнаты (applyEntry в
// room.ts: member.left, member.returned, member.dropped, member.reinstated); здесь — проверки действий на
// время сервера. Итоги и статусы считаются, не хранятся. Ни DOM, ни Cloudflare
import { caseOf, courtState, courtVerdict, type CourtCase } from './appeal'
import { choiceOutcome, type ChoiceState } from './choice'
import { eventOutcome, type EventState } from './event'
import { bestLotBid, lotOutcome, type LotState } from './lot'
import { checkWithdraw, offerAt, offerOutcome, offerStatus, sideOf, type OfferState } from './offer'
import { inPlay, inRoom, type Member, type RoomState } from './room'
import { roomSettlement, roomTransfers, type TransferRecord } from './settle'

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
// не ноль или перевод с ним ждёт подтверждения
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
