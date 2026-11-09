// Общее для экранов пари: вид с сервера → состояние для правил (с ходом исхода), суммы сторон по кэфу,
// итог сторон по исходу, строка статуса с отсчётом и фазой исхода по времени сервера, поле кэфа, окно
// подтверждения. Считают правила (offer.ts), здесь — только показ
import type { Result } from '../api'
import type { CourtCase } from '../rules/appeal'
import { formatCountdown, formatDateTime } from '../rules/date'
import {
  GUARANTOR_SILENCE,
  MAX_ODDS,
  MIN_ODDS,
  offerNets,
  offerOutcome,
  offerStakes,
  offerStatus,
  SIDE_SILENCE,
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

export function offerHref(roomId: string, offerId: string): string {
  return `#/room/${roomId}/offer/${offerId}`
}

// Окно подтверждения действия с пари: что спрашиваем, основание, кнопка и запрос
export type OfferAsk = {
  question: string
  body: string[]
  button: string
  busyLabel: string
  form: string // номер запроса — по пари, действию и содержимому
  run: (requestId: string) => Promise<Result<{ v: number; offer?: { id: string } }>> // встречное — новое пари в offer
}

// Ход исхода из ответа (outcome) → поля состояния для правил так, чтобы offerOutcome, checkMark,
// checkDecide, checkDecline и checkNominate на часах сервера дали то же, что сервер: с какого мига решает
// гарант (turnAt — как миг расхождения; отметки — не раньше, чем turnAt минус 3 дня), до какого он
// решает (guarantorUntil — 3 дня с guarantorSince), отказ или пропуск срока (needSince), утверждено
// согласием или гарантом. Сами записи журнала сайту не приходят; между опросами фаза идёт по часам
function outcomeState(o: OfferView): Pick<OfferState, 'guarantorSince' | 'marks' | 'disagreedAt' | 'agreed' | 'decision' | 'declinedAt' | 'nominations'> {
  const out = o.outcome
  if (!out) return { guarantorSince: null, marks: [], disagreedAt: null, agreed: null, decision: null, declinedAt: null, nominations: {} }
  const markAt = Math.max(o.expectedAt, out.turnAt - SIDE_SILENCE)
  const sides: OfferSide[] = ['author', 'taker']
  // Суд изменил решение гаранта (Р-24): в ответе — новый исход, а правилам нужно решение гаранта, на
  // которое подана апелляция (согласие не обжалуется): прав был другой, решено не позже подачи
  const a =
    out.approved?.how === 'court'
      ? { winner: other(out.approved.winner), at: out.appeal?.at ?? out.court?.drawnAt ?? out.approved.at, how: 'guarantor' as const, by: out.guarantorId }
      : out.approved
  return {
    guarantorSince: out.guarantorUntil === null ? null : out.guarantorUntil - GUARANTOR_SILENCE,
    marks: sides.flatMap((by) => {
      const winner = out.marks[by]
      return winner ? [{ by, winner, at: markAt }] : []
    }),
    disagreedAt: out.turnAt,
    agreed: a?.how === 'agreement' ? { winner: a.winner, at: a.at } : null,
    decision: a?.how === 'guarantor' ? { winner: a.winner, at: a.at, by: a.by ?? out.guarantorId } : null,
    declinedAt: out.phase === 'need-guarantor' ? out.needSince : null,
    nominations: { ...out.nominations },
  }
}

// Пари с сервера → состояние для правил (checkAccept, checkWithdraw, checkCounter, offerStatus, sideOf;
// исход — offerOutcome, checkMark, checkDecide, checkDecline, checkNominate): условия, адресат, гарант,
// кто принял, отзыв, «закрыто встречным» и ход исхода (outcomeState)
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
    accepted: o.accepted,
    withdrawnAt: o.withdrawnAt,
    closedBy: o.closedBy,
    ...outcomeState(o),
  }
}

// Другая сторона пари
export function other(side: OfferSide): OfferSide {
  return side === 'author' ? 'taker' : 'author'
}

// Дело суда по пари из ответа (courtCaseOf) — для offerOutcome и проверок апелляции; суда нет — null
export function offerCourt(room: SavedRoom, o: OfferView): CourtCase | null {
  return courtCaseOf(o.id, o.outcome, room.hostId)
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
  if (out.phase === 'need-guarantor') return <span className="status cancelled">нужен новый гарант</span>
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

// Статус на время сервера now (offerStatus): приём закрывается в срок и между опросами; у принятого —
// фаза исхода одной строкой
export function OfferStatusLine({ room, offer, now }: { room: SavedRoom; offer: OfferView; now: number }) {
  const status = offerStatus(offerState(offer), now)
  if (status === 'accepted') return acceptedLine(room, offer, now)
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
