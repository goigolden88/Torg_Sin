// Общее для экранов пари: вид с сервера → состояние для правил, суммы сторон по кэфу, строка
// статуса с отсчётом по времени сервера, поле кэфа. Считают правила (offer.ts), здесь — только показ
import { formatCountdown, formatDateTime } from '../rules/date'
import { MAX_ODDS, MIN_ODDS, offerStakes, offerStatus, type OfferState, type OfferStakes, type RoomRoles } from '../rules/offer'
import type { OfferView } from '../rules/protocol'
import type { SavedRoom } from '../store/db'
import { money, nameOf } from './eventParts'

export function offerHref(roomId: string, offerId: string): string {
  return `#/room/${roomId}/offer/${offerId}`
}

// Пари с сервера → состояние для правил (checkAccept, checkWithdraw, checkCounter, offerStatus, sideOf).
// Им нужны только условия, адресат, гарант, кто принял, отзыв и «закрыто встречным» — они в ответе
// есть; ход исхода (отметки, решение гаранта) экранам этой задачи не нужен — пустой
export function offerState(o: OfferView): OfferState {
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
    guarantorId: o.guarantorId,
    guarantorSince: null,
    accepted: o.accepted,
    withdrawnAt: o.withdrawnAt,
    closedBy: o.closedBy,
    marks: [],
    disagreedAt: null,
    agreed: null,
    decision: null,
    declinedAt: null,
    nominations: {},
  }
}

// Ведущий и участники комнаты — для правил пари
export function roomRolesOf(room: SavedRoom): RoomRoles {
  return { hostId: room.hostId, members: room.members.map((m) => m.id) }
}

// Суммы обеих сторон и банк — по кэфу (offerStakes); сервер прислал другое — нет сумм
export function stakesOf(o: OfferView): OfferStakes | null {
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
export function who(room: SavedRoom, memberId: string): string {
  return nameOf(room, memberId) + (memberId === room.memberId ? ' (вы)' : '')
}

// Основание чисел (Р-10): «Аня ставит 300 ₽ на „сбудется“, соперник — 100 ₽ (кэф 3 к 1), банк 400 ₽»
export function stakesLine(room: SavedRoom, o: OfferView): string {
  const s = stakesOf(o)
  if (!s) return `кэф ${oddsLabel(o.odds)}`
  const sum = (n: number) => money(n, room.currency)
  const author = o.authorId === room.memberId ? 'вы ставите' : `${nameOf(room, o.authorId)} ставит`
  const taker = o.accepted ? (o.accepted.by === room.memberId ? 'вы' : nameOf(room, o.accepted.by)) : 'соперник'
  return `${author} ${sum(s.author)} на „${sideLabel(o.side)}“, ${taker} — ${sum(s.taker)} (кэф ${oddsLabel(o.odds)}), банк ${sum(s.bank)}`
}

// Кому: адресат или «открытое — любой»
export function toLabel(room: SavedRoom, o: OfferView): string {
  return o.to === null ? 'открытое — любой' : who(room, o.to)
}

// Статус на время сервера now (offerStatus): приём закрывается в срок и между опросами
export function OfferStatusLine({ offer, now }: { offer: OfferView; now: number }) {
  const status = offerStatus(offerState(offer), now)
  if (status === 'accepted') return <span className="status open">принято — ждём исхода к {formatDateTime(offer.expectedAt)}</span>
  if (status === 'withdrawn') return <span className="status cancelled">отозвано</span>
  if (status === 'countered') return <span className="status closed">закрыто встречным</span>
  if (status === 'expired') return <span className="status closed">истекло — приём закрыт {formatDateTime(offer.closesAt)}</span>
  return (
    <span className="status open">
      открыто — приём до {formatDateTime(offer.closesAt)}, осталось {formatCountdown(offer.closesAt - now)}
    </span>
  )
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
