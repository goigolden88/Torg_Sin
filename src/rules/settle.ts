// Расчёт комнаты (этап 5, Р-07, Р-11, Р-32; Архитектура, «Правила расчёта в коде»): три числа у каждого
// участника — итог, ждёт окончательности, в игре; переводы «Перевёл» / «Получил» / «Не получал» из
// записей TransferRecord (автор — memberId, время сервера — at, порядок — журнала); баланс и подсказка
// «кто кому» в режиме комнаты. Итоги, балансы и подсказка считаются, не хранятся. Исход события и пари —
// eventOutcome (event.ts) и offerOutcome (offer.ts) с делом суда (appeal.ts). Ни DOM, ни Cloudflare
import { caseOf } from './appeal'
import { choiceInPlay, choiceResult, type ChoiceState } from './choice'
import type { CourtCase } from './court'
import { checkAmount, eventOutcome, type EventState } from './event'
import { bestLotBid, lotOutcome, type LotState } from './lot'
import { offerAmounts, offerAt, offerNets, offerOutcome, type OfferState } from './offer'

// Режим «кто кому» (Р-32): «по ставкам» — долги пар по каждому окончательному событию и пари (по
// умолчанию); «меньше переводов» — из балансов, жадно. Хранит сервер (запись комнаты)
export type SettleMode = 'stakes' | 'fewest'
export const DEFAULT_SETTLE_MODE: SettleMode = 'stakes'
export const SETTLE_MODES: readonly SettleMode[] = ['stakes', 'fewest']

// Отказы переводов и смены режима
export const NO_TRANSFERS = 'В комнате на очки переводов нет'
export const NOT_MEMBER = 'Перевод — только между участниками комнаты'
export const SELF_TRANSFER = 'Себе не переводят'
export const NO_TRANSFER = 'Такого перевода нет'
export const ONLY_RECEIVER = 'Отметить «Получил» или «Не получал» может только получатель'
export const ONLY_OWN = 'Отменить можно только свою отметку'
export const ALREADY_RECEIVED = 'Перевод уже подтверждён'
export const ALREADY_REJECTED = 'Получатель уже отметил «Не получал»'
export const TRANSFER_CANCELLED = 'Перевод отменён'
export const RECEIVED_NO_REVOKE = 'Получатель уже подтвердил перевод — отменить может только он'
export const NOTHING_TO_REVOKE = 'Вы ещё не отметили «Получил» — отменять нечего'
export const ONLY_HOST_MODE = 'Режим «кто кому» меняет только ведущий'
export const BAD_MODE = 'Режим — «по ставкам» или «меньше переводов»'
export const SAME_MODE = 'Этот режим уже выбран'
export const MODE_LOCKED = 'Переводы уже отмечены: режим меняется, только когда все рассчитались и ни один перевод не ждёт подтверждения'

// Комната на очки — «Таблица очков», без переводов (Р-32)
const POINTS = 'PTS'

// Записи о переводах — как будут в журнале комнаты (задача сервера): memberId — автор, at — время
// сервера. «Перевёл» (должник: кому, сколько); «Получил» — подтверждение «Перевёл» (transfer) или сам,
// без него (от кого, сколько); «Не получал» — на «Перевёл»; отзыв своей отметки (transfer)
type Act<T extends string, X = object> = { type: T; id: string; at: number; memberId: string } & X
export type TransferRecord =
  | Act<'transfer.sent', { to: string; amount: number }>
  | Act<'transfer.received', { transfer: string } | { from: string; amount: number }>
  | Act<'transfer.rejected', { transfer: string }>
  | Act<'transfer.revoked', { transfer: string }>

// Состояние перевода — считается: «ждёт подтверждения» / «получен» / «отклонён» («Не получал») /
// «отменён» (отозван своей стороной)
export type TransferStatus = 'pending' | 'received' | 'rejected' | 'cancelled'

// Перевод: номер — id записи, которой заведён («Перевёл» должника или прямое «Получил» получателя);
// by — кто завёл; changedAt — миг последней смены состояния
export type Transfer = {
  id: string
  at: number
  from: string
  to: string
  amount: number
  by: 'sender' | 'receiver'
  status: TransferStatus
  changedAt: number
}

// Комната для переводов: валюта и участники
export type TransferRoom = { currency: string; members: readonly string[] }

// Считается ли перевод в балансе: «ждёт подтверждения» и «получен»; отклонённые и отменённые — нет
export function countedTransfer(t: Pick<Transfer, 'status'>): boolean {
  return t.status === 'pending' || t.status === 'received'
}

function checkPair(room: TransferRoom, a: string, b: unknown, amount: unknown): string | null {
  if (room.currency === POINTS) return NO_TRANSFERS
  if (!room.members.includes(a) || typeof b !== 'string' || !room.members.includes(b)) return NOT_MEMBER
  if (a === b) return SELF_TRANSFER
  const sum = checkAmount(amount)
  return sum.ok ? null : sum.error
}

// «Перевёл»: должник memberId — участнику to, сумма — целое > 0 (долгом не ограничена). Можно — null
export function checkSend(room: TransferRoom, memberId: string, to: unknown, amount: unknown): string | null {
  return checkPair(room, memberId, to, amount)
}

// «Получил» сам, без «Перевёл»: получатель memberId — от участника from, сумма — целое > 0
export function checkReceive(room: TransferRoom, memberId: string, from: unknown, amount: unknown): string | null {
  return checkPair(room, memberId, from, amount)
}

function stateError(t: Transfer): string | null {
  if (t.status === 'received') return ALREADY_RECEIVED
  if (t.status === 'rejected') return ALREADY_REJECTED
  if (t.status === 'cancelled') return TRANSFER_CANCELLED
  return null
}

// «Получил» на «Перевёл» и «Не получал»: только получатель и только пока перевод ждёт подтверждения
export function checkAnswer(room: TransferRoom, t: Transfer | null, memberId: string): string | null {
  if (room.currency === POINTS) return NO_TRANSFERS
  if (!t) return NO_TRANSFER
  if (memberId !== t.to) return ONLY_RECEIVER
  return stateError(t)
}

// Отмена своей отметки (Р-11 — новой записью): должник отзывает «Перевёл», пока не подтверждён;
// получатель — своё «Получил» (подтверждённый «Перевёл» снова ждёт, прямое «Получил» — отменено)
export function checkRevoke(room: TransferRoom, t: Transfer | null, memberId: string): string | null {
  if (room.currency === POINTS) return NO_TRANSFERS
  if (!t) return NO_TRANSFER
  if (memberId === t.from && t.by === 'sender') {
    return t.status === 'received' ? RECEIVED_NO_REVOKE : stateError(t)
  }
  if (memberId === t.to) {
    if (t.status === 'received') return null
    if (t.status === 'pending') return NOTHING_TO_REVOKE
    return stateError(t)
  }
  return ONLY_OWN
}

// Переводы комнаты из записей по порядку заведения. Запись действует, если её разрешает та же проверка
// на её место в журнале (как roomOffers): сервер и свёртка не расходятся; о неизвестном переводе — нет
export function roomTransfers(records: readonly TransferRecord[], room: TransferRoom): Transfer[] {
  const transfers = new Map<string, Transfer>()
  for (const r of records) {
    if (transfers.has(r.id)) continue
    const base = { id: r.id, at: r.at, changedAt: r.at }
    if (r.type === 'transfer.sent') {
      if (checkSend(room, r.memberId, r.to, r.amount)) continue
      transfers.set(r.id, { ...base, from: r.memberId, to: r.to, amount: r.amount, by: 'sender', status: 'pending' })
      continue
    }
    if (r.type === 'transfer.received' && 'from' in r) {
      if (checkReceive(room, r.memberId, r.from, r.amount)) continue
      transfers.set(r.id, { ...base, from: r.from, to: r.memberId, amount: r.amount, by: 'receiver', status: 'received' })
      continue
    }
    const t = transfers.get(r.transfer) ?? null
    if (!t) continue
    let status: TransferStatus
    if (r.type === 'transfer.revoked') {
      if (checkRevoke(room, t, r.memberId)) continue
      status = r.memberId === t.to && t.by === 'sender' ? 'pending' : 'cancelled'
    } else {
      if (checkAnswer(room, t, r.memberId)) continue
      status = r.type === 'transfer.received' ? 'received' : 'rejected'
    }
    transfers.set(t.id, { ...t, status, changedAt: r.at })
  }
  return [...transfers.values()]
}

// Число с основанием: сумма и из скольких событий и пари она сложена; lots — из скольких лотов (Р-38):
// поле есть, только когда своду дали лоты (SettleInput.lots); choices — из скольких выборов (Р-39): так же,
// только когда дали выборы (SettleInput.choices)
export type SettleSum = { amount: number; events: number; offers: number; lots?: number; choices?: number }

// Участник в своде: итог — по окончательным; ждёт окончательности — по утверждённым, ещё не
// окончательным; в игре — свои ставки без утверждённого исхода; отдал / получил — по переводам «ждёт
// подтверждения» и «получен»; баланс = итог + отдал − получил (плюс — ему должны, минус — он должен)
export type MemberSettlement = {
  memberId: string
  total: SettleSum
  pending: SettleSum
  inPlay: SettleSum
  sent: number
  received: number
  balance: number
}

// Подсказка «кто кому»: from переводит to сумму amount
export type Suggestion = { from: string; to: string; amount: number }

export type RoomSettlement = {
  mode: SettleMode
  members: MemberSettlement[]
  transfers: Transfer[]
  suggestions: Suggestion[]
}

// Вход свода: валюта, участники по порядку входа, события и пари комнаты (roomEvents, logOffers), дела
// суда (logAppeals) и записи о переводах; lots — лоты комнаты (Р-38, logLots; нет — лотов нет и счётчика
// lots в числах тоже); choices — выборы комнаты (Р-39, logChoices; нет — выборов нет и счётчика choices)
export type SettleInput = {
  currency: string
  members: readonly string[]
  events: readonly EventState[]
  offers: readonly OfferState[]
  lots?: readonly LotState[]
  choices?: readonly ChoiceState[]
  cases: readonly CourtCase[]
  transfers: readonly TransferRecord[]
}

// Окончательный результат спора: net каждого (≠ 0) по порядку первой ставки; у пари — автор, соперник; у
// лота — продавец, победитель
type Result = { memberId: string; net: number }[]

// Долги пар по одному окончательному спору (режим «по ставкам»): каждый проигравший — выигравшим
// пропорционально их выигрышу, целыми единицами (BigInt); неделимый остаток проигравшего — по одной
// единице выигравшим по порядку первой ставки, пока у выигравшего недобор. Суммы точные: каждый
// выигравший получает ровно свой net, каждый проигравший отдаёт ровно свой
export function resultDebts(result: Result): Suggestion[] {
  const losers = result.filter((r) => r.net < 0)
  const winners = result.filter((r) => r.net > 0)
  const won = winners.reduce((s, w) => s + BigInt(w.net), 0n)
  const cell = losers.map((l) => winners.map((w) => Number((BigInt(-l.net) * BigInt(w.net)) / won)))
  const short = winners.map((w, j) => w.net - cell.reduce((s, row) => s + row[j], 0))
  losers.forEach((l, i) => {
    let rest = -l.net - cell[i].reduce((s, x) => s + x, 0)
    while (rest > 0) {
      for (let j = 0; j < winners.length && rest > 0; j++) {
        if (short[j] > 0) {
          cell[i][j] += 1
          short[j] -= 1
          rest -= 1
        }
      }
    }
  })
  return losers.flatMap((l, i) =>
    winners.flatMap((w, j) => (cell[i][j] > 0 ? [{ from: l.memberId, to: w.memberId, amount: cell[i][j] }] : [])),
  )
}

// «Меньше переводов»: из балансов, жадно — больший долг платит большему выигрышу; при равенстве — по
// номеру участника. Все балансы ноль — пусто
export function fewestTransfers(balances: readonly { memberId: string; balance: number }[]): Suggestion[] {
  const order = (a: { id: string; left: number }, b: { id: string; left: number }) =>
    b.left - a.left || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const debtors = balances.filter((b) => b.balance < 0).map((b) => ({ id: b.memberId, left: -b.balance }))
  const creditors = balances.filter((b) => b.balance > 0).map((b) => ({ id: b.memberId, left: b.balance }))
  const out: Suggestion[] = []
  for (;;) {
    debtors.sort(order)
    creditors.sort(order)
    const d = debtors[0]
    const c = creditors[0]
    if (!d || !c || d.left === 0 || c.left === 0) break
    const amount = Math.min(d.left, c.left)
    out.push({ from: d.id, to: c.id, amount })
    d.left -= amount
    c.left -= amount
  }
  return out
}

// Первый круг долгов (A → B → C → A) обходом в глубину: от участников и к получателям по номерам.
// Круг — его пары по ходу; нет круга — null
function findCycle(debts: readonly Suggestion[]): Suggestion[] | null {
  const out = new Map<string, Suggestion[]>()
  for (const d of debts) out.set(d.from, [...(out.get(d.from) ?? []), d])
  for (const list of out.values()) list.sort((x, y) => (x.to < y.to ? -1 : x.to > y.to ? 1 : 0))
  const state = new Map<string, 'open' | 'done'>()
  const path: Suggestion[] = []
  const visit = (node: string): Suggestion[] | null => {
    state.set(node, 'open')
    for (const d of out.get(node) ?? []) {
      const seen = state.get(d.to)
      if (seen === 'open') return [...path.slice(path.findIndex((p) => p.from === d.to)), d]
      if (seen === 'done') continue
      path.push(d)
      const found = visit(d.to)
      if (found) return found
      path.pop()
    }
    state.set(node, 'done')
    return null
  }
  for (const node of [...out.keys()].sort()) {
    if (state.has(node)) continue
    const found = visit(node)
    if (found) return found
  }
  return null
}

// Круги долгов сокращаются: на каждом шаге из каждой пары первого круга вычитается наименьший долг круга
// (хоть одна пара уходит в ноль), пока кругов нет. Сумма долгов каждого участника не меняется; все
// балансы ноль — пусто. Порядок пар — прежний
export function cancelCycles(debts: readonly Suggestion[]): Suggestion[] {
  const left = debts.filter((d) => d.amount > 0).map((d) => ({ ...d }))
  for (;;) {
    const cycle = findCycle(left.filter((d) => d.amount > 0))
    if (!cycle) return left.filter((d) => d.amount > 0)
    const least = Math.min(...cycle.map((d) => d.amount))
    for (const d of cycle) d.amount -= least
  }
}

// «По ставкам»: долги пар по каждому окончательному спору; встречные долги пары сворачиваются в один;
// переводы пары (counted) вычитаются из её долга, переплата — долг меняет сторону; круги долгов
// сокращаются (cancelCycles). Порядок — по номерам пары
function stakeTransfers(results: readonly Result[], transfers: readonly Transfer[]): Suggestion[] {
  const owed = new Map<string, { a: string; b: string; amount: number }>() // a должен b (минус — b должен a)
  const add = (from: string, to: string, amount: number) => {
    const [a, b] = from < to ? [from, to] : [to, from]
    const key = JSON.stringify([a, b])
    const pair = owed.get(key) ?? { a, b, amount: 0 }
    pair.amount += from === a ? amount : -amount
    owed.set(key, pair)
  }
  for (const r of results) for (const d of resultDebts(r)) add(d.from, d.to, d.amount)
  for (const t of transfers) if (countedTransfer(t)) add(t.from, t.to, -t.amount)
  return cancelCycles(
    [...owed.values()]
      .filter((p) => p.amount !== 0)
      .sort((x, y) => (x.a === y.a ? (x.b < y.b ? -1 : 1) : x.a < y.a ? -1 : 1))
      .map((p) => (p.amount > 0 ? { from: p.a, to: p.b, amount: p.amount } : { from: p.b, to: p.a, amount: -p.amount })),
  )
}

// Свод комнаты на now (время сервера) в режиме mode. Событие: отменено (и судом) или «без игры» — не в
// счёт; окончательное — в итог (net из payouts); утверждено, ещё не окончательное (неделя апелляции,
// суд по апелляции) — в «ждёт окончательности»; без утверждённого исхода (не предложен, «предложен»,
// «возражение», «голосование», «снято», «ждёт суда») — свои ставки «в игре». Пари — только принятые:
// «отменено судом» — не в счёт; final — в итог; утверждено — ждёт; marking, guarantor, need-guarantor,
// court — своя сумма «в игре». Лот (Р-38): торг идёт — лучшая ставка «в игре» у её автора; после конца —
// победитель должен продавцу свою ставку: получено (отметкой, молчанием, судом) — в итог, сразу
// окончательно (апелляции нет); до того («ждёт передачи», «передан», «в споре», «ждёт суда») — ждёт; снят,
// не продан, не состоялся, не передан — не в счёт. Выбор (Р-39): вклады идут или ждут жребия — свои вклады
// «в игре» (у получателя — нет: свой вклад он не платит); решён — вложившиеся в победивший должны
// получателю свои суммы, в итог сразу (спора нет); не состоялся, фаза вариантов — не в счёт. В комнате на
// очки переводов и подсказки нет
export function roomSettlement(input: SettleInput, now: number, mode: SettleMode = DEFAULT_SETTLE_MODE): RoomSettlement {
  const withLots = input.lots !== undefined
  const withChoices = input.choices !== undefined
  const zero = (): SettleSum => ({ amount: 0, events: 0, offers: 0, ...(withLots && { lots: 0 }), ...(withChoices && { choices: 0 }) })
  const rows = new Map<string, MemberSettlement>()
  const row = (memberId: string): MemberSettlement => {
    let r = rows.get(memberId)
    if (!r) {
      r = { memberId, total: zero(), pending: zero(), inPlay: zero(), sent: 0, received: 0, balance: 0 }
      rows.set(memberId, r)
    }
    return r
  }
  for (const m of input.members) row(m)
  const count = (sum: SettleSum, amount: number, kind: 'events' | 'offers' | 'lots' | 'choices') => {
    sum.amount += amount
    sum[kind] = (sum[kind] ?? 0) + 1
  }
  const results: Result[] = []

  for (const e of input.events) {
    if (e.cancelled || e.bets.length === 0) continue
    const out = eventOutcome(e, now, caseOf(input.cases, e.id))
    if (out?.status === 'cancelled') continue
    if (out?.approved) {
      if (out.void) continue
      const result = out.payouts.filter((p) => p.net !== 0).map((p) => ({ memberId: p.memberId, net: p.net }))
      const final = out.status === 'final'
      for (const p of result) count(final ? row(p.memberId).total : row(p.memberId).pending, p.net, 'events')
      if (final) results.push(result)
      continue
    }
    const stake = new Map<string, number>()
    for (const b of e.bets) stake.set(b.memberId, (stake.get(b.memberId) ?? 0) + b.amount)
    for (const [m, amount] of stake) count(row(m).inPlay, amount, 'events')
  }

  // Пари — только принятые: торг (Р-37) — на now (offerAt), до конца лучшее встречное не в счёт, «не
  // состоялось» — нет; суммы — offerAmounts (у торга — автора и принятого встречного)
  for (const raw of input.offers) {
    const o = offerAt(raw, now)
    if (!o.accepted) continue
    const out = offerOutcome(o, now, caseOf(input.cases, o.id))
    const stakes = offerAmounts(o)
    if (!out || !stakes.ok || out.phase === 'cancelled') continue
    const taker = o.accepted.by
    if (out.approved) {
      const nets = offerNets(stakes.value, out.approved.winner)
      const result = [
        { memberId: o.authorId, net: nets.author },
        { memberId: taker, net: nets.taker },
      ]
      const final = out.phase === 'final'
      for (const p of result) count(final ? row(p.memberId).total : row(p.memberId).pending, p.net, 'offers')
      if (final) results.push(result)
      continue
    }
    count(row(o.authorId).inPlay, stakes.value.author, 'offers')
    count(row(taker).inPlay, stakes.value.taker, 'offers')
  }

  // Лоты (Р-38): идущая лучшая ставка — в игре; после конца — долг победителя продавцу
  for (const l of input.lots ?? []) {
    const out = lotOutcome(l, now, caseOf(input.cases, l.id))
    if (out.status === 'open') {
      const best = bestLotBid(l)
      if (best) count(row(best.by).inPlay, best.amount, 'lots')
      continue
    }
    const w = out.winner
    if (!w || out.status === 'failed' || out.status === 'undelivered') continue
    const result = [
      { memberId: l.sellerId, net: w.amount },
      { memberId: w.by, net: -w.amount },
    ]
    const final = out.status === 'received'
    for (const p of result) count(final ? row(p.memberId).total : row(p.memberId).pending, p.net, 'lots')
    if (final) results.push(result)
  }

  // Выборы (Р-39): идущие вклады — в игре; решён — долги получателю, окончательно сразу
  for (const c of input.choices ?? []) {
    for (const p of choiceInPlay(c, now)) count(row(p.memberId).inPlay, p.amount, 'choices')
    const result = choiceResult(c, now)
    if (result.length === 0) continue
    for (const p of result) count(row(p.memberId).total, p.net, 'choices')
    results.push(result)
  }

  const room: TransferRoom = { currency: input.currency, members: [...rows.keys()] }
  const transfers = roomTransfers(input.transfers, room)
  for (const t of transfers) {
    if (!countedTransfer(t)) continue
    row(t.from).sent += t.amount
    row(t.to).received += t.amount
  }
  const members = [...rows.values()]
  for (const m of members) m.balance = m.total.amount + m.sent - m.received

  const suggestions =
    input.currency === POINTS
      ? []
      : mode === 'fewest'
        ? fewestTransfers(members)
        : stakeTransfers(results, transfers)
  return { mode, members, transfers, suggestions }
}

// Смена режима «кто кому» (Р-32) ведущим: можно, пока в комнате нет ни одного перевода «ждёт
// подтверждения» или «получен»; после — только когда все балансы ноль и ни один перевод не ждёт
// подтверждения. settlement — свод комнаты в нынешнем режиме. Можно — null, иначе отказ
export function checkSettleMode(
  settlement: Pick<RoomSettlement, 'mode' | 'members' | 'transfers'>,
  room: { hostId: string; currency: string },
  memberId: string,
  mode: unknown,
): string | null {
  if (room.currency === POINTS) return NO_TRANSFERS
  if (memberId !== room.hostId) return ONLY_HOST_MODE
  if (!SETTLE_MODES.includes(mode as SettleMode)) return BAD_MODE
  if (mode === settlement.mode) return SAME_MODE
  if (!settlement.transfers.some(countedTransfer)) return null
  const settled = settlement.members.every((m) => m.balance === 0) && !settlement.transfers.some((t) => t.status === 'pending')
  return settled ? null : MODE_LOCKED
}
