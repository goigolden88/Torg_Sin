// «Сводка» (Р-50, #168): что ждёт вас во всех комнатах и что скоро закроется — по копиям комнат на
// устройстве (SavedRoom), без запроса к серверу. Копия — последний ответ комнаты (syncedAt): статусы в ней
// — на миг ответа, сроки сверяются с «сейчас» устройства; срок по копии прошёл — дело приглушено
// («откройте комнату»), оно могло уже решиться. Права на дела — те же проверки правил, что у кнопок на
// экранах (mayPropose, hostMayDecide, checkAnswer, checkKept, checkPromiseAnswer). Чистые функции без DOM —
// с тестами (summaryParts.test.ts)
import { plural } from '../rules/currency'
import { betOn, closingAt, hostMayDecide, mayPropose } from '../rules/event'
import type { CourtView, EventView, LotView, OfferSide, OfferView } from '../rules/protocol'
import { checkAnswer, checkKept, checkPromiseAnswer } from '../rules/settle'
import { savedChoices, savedEvents, savedLots, savedOffers, savedSettlement, type SavedRoom } from '../store/db'
import { choiceHref, optionTitle } from './choiceParts'
import { awaitsMyVote } from './courtParts'
import { eventHref, money, nameOf } from './eventParts'
import { lotHref } from './lotParts'
import { roomClosed } from './memberParts'
import { offerHref, stakesLine } from './offerParts'
import { isPoints, settleHref, sumText } from './settleParts'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// «Скоро закроется» — приём кончается в ближайшие сутки
export const SOON = DAY
// Копия старше недели — комната подсвечена: «данные от … — откройте, чтобы обновить»
export const STALE_COPY = 7 * DAY

// Вид дела: голос в суде; голос по возражению в событии; «Перевёл» вам; пари вам; исход (отметить, решить
// гарантом или ведущим, предложить); согласие или возражение на предложенный исход; лот (передать,
// получить); обещание (исполнить, получить)
export type TaskKind = 'court' | 'vote' | 'transfer' | 'offer' | 'outcome' | 'objection' | 'lot' | 'promise'

export const KIND_LABEL: Record<TaskKind, string> = {
  court: 'суд',
  vote: 'голосование',
  transfer: 'перевод',
  offer: 'пари вам',
  outcome: 'исход',
  objection: 'исход предложен',
  lot: 'лот',
  promise: 'обещание',
}

// Дело: комната, вид, о чём (title), что ждёт (text), подпись кнопки и куда она ведёт — экран спора или
// «Расчёт»; действия прямо с карточки нет. deadline — срок по копии (нет срока — null); overdue — срок
// по копии уже прошёл
export type Task = {
  roomId: string
  roomName: string
  kind: TaskKind
  id: string // номер спора, перевода или пари обещания — ключ карточки вместе с комнатой и видом
  title: string
  text: string
  action: string
  href: string
  deadline: number | null
  overdue: boolean
}

type Draft = Omit<Task, 'roomId' | 'roomName' | 'overdue'>

// Место участника в суде, где он ещё не голосовал: до какого мига голосует (суда нет, решён, голос подан —
// null). Без «сейчас» — по копии как есть: срок прошёл — дело приглушено, а не пропало
function mySeatUntil(court: CourtView | null | undefined, me: string): number | null {
  if (!court || court.decision) return null
  return court.seats.find((s) => s.member === me && !s.vote)?.until ?? null
}

function courtTask(court: CourtView | null | undefined, me: string, id: string, title: string, href: string): Draft | null {
  if (!awaitsMyVote({ court }, me)) return null
  return { kind: 'court', id, title, text: 'вы в суде — ваш голос', action: 'Голосовать', href, deadline: mySeatUntil(court, me) }
}

function eventTasks(room: SavedRoom, e: EventView, now: number): Draft[] {
  if (e.cancelled || e.status === 'cancelled') return []
  const me = room.memberId
  const href = eventHref(room.id, e.id)
  const base = { id: e.id, title: e.condition, href }
  const o = e.outcome
  const out: Draft[] = []
  const court = courtTask(o?.court, me, e.id, e.condition, href)
  if (court) out.push(court)
  const host = e.hostId ?? room.hostId
  // Предложить исход: «исход к» наступил, предложения нет (или снято «ещё не известно», Р-27) — автор, а
  // если автор — предмет спора или молчит срок молчания, — ведущий. Срок автора — до хода ведущего
  if ((o === null || o.status === 'withdrawn') && now >= e.expectedAt && mayPropose({ ...e, hostId: host }, me, now, room.hostId)) {
    const silence = (e.times?.silence ?? 3 * DAY) + e.expectedAt
    const deadline = me === e.authorId && e.authorId !== e.subjectId && me !== room.hostId ? silence : null
    out.push({ ...base, kind: 'outcome', text: 'пора предложить исход', action: 'Предложить исход', deadline })
  }
  if (!o) return out
  // Согласиться или возразить: ставивший, чьего согласия ждём, пока исход «на возражении»
  if (o.status === 'proposed' && o.awaiting.includes(me)) {
    const title = e.outcomes.find((x) => x.id === o.proposal.outcome)?.title ?? o.proposal.outcome
    out.push({ ...base, kind: 'objection', text: `предложен исход «${title}» — согласитесь или возразите`, action: 'Ответить', deadline: o.objectionUntil })
  }
  // Возражение решает ведущий (сам не ставил и не предмет спора)
  if (o.status === 'disputed' && me === room.hostId && hostMayDecide({ bets: e.bets, hostId: host, subjectId: e.subjectId }, me)) {
    out.push({ ...base, kind: 'outcome', text: 'есть возражение — решите исход как ведущий', action: 'Решить', deadline: null })
  }
  // Голосование по возражению: голосующий, ещё не голосовал
  if (o.status === 'voting' && o.voters.includes(me) && !o.votes.some((v) => v.by === me)) {
    out.push({ ...base, kind: 'vote', text: 'голосование по возражению — ваш голос', action: 'Голосовать', deadline: o.votingUntil })
  }
  return out
}

function mySide(o: OfferView, me: string): OfferSide | null {
  if (o.authorId === me) return 'author'
  if (o.accepted?.by === me) return 'taker'
  return null
}

function offerTasks(room: SavedRoom, o: OfferView, now: number): Draft[] {
  const me = room.memberId
  const href = offerHref(room.id, o.id)
  const base = { id: o.id, title: o.condition, href }
  const out: Draft[] = []
  // Пари вам: адресное, открыто — принять или встречное (торг — встречное); не гаранту и не предмету спора
  // не на своей стороне (Р-26); закрытая комната и «выбыл» — без этого (Р-41, Р-43)
  const dropped = room.members.some((m) => m.id === me && m.dropped)
  if (o.status === 'open' && o.to === me && me !== o.guarantorId && !(o.subjectId === me && o.side !== 'no') && !dropped && !roomClosed(room)) {
    const who = nameOf(room, o.authorId)
    const what = o.counterTo !== null ? `${who} — встречное к вашему пари` : `${who} предлагает вам пари`
    const answer = o.auction ? 'дайте встречное' : 'принять или встречное'
    const deadline = o.auction ? (o.bidding?.endsAt ?? o.closesAt) : o.closesAt
    out.push({ ...base, kind: 'offer', text: `${what}: ${stakesLine(room, o)} — ${answer}`, action: 'Ответить', deadline })
  }
  const x = o.outcome
  if (!x) return out
  const court = courtTask(x.court, me, o.id, o.condition, href)
  if (court) out.push(court)
  // Отметить исход: сторона, «исход к» наступил, своей отметки нет, гарант ещё не решает — до его хода
  const side = mySide(o, me)
  if (side && x.phase === 'marking' && x.marks[side] === null && now >= o.expectedAt) {
    out.push({ ...base, kind: 'outcome', text: 'отметьте, кто прав', action: 'Отметить исход', deadline: x.turnAt })
  }
  // Гарант решает: ход у него — до конца его срока
  if (x.phase === 'guarantor' && x.guarantorId === me) {
    out.push({ ...base, kind: 'outcome', text: 'вы гарант — решите, кто прав', action: 'Решить', deadline: x.guarantorUntil })
  }
  return out
}

function lotTasks(room: SavedRoom, l: LotView): Draft[] {
  const me = room.memberId
  const href = lotHref(room.id, l.id)
  const base = { id: l.id, title: l.title, href }
  const out: Draft[] = []
  const court = courtTask(l.court, me, l.id, l.title, href)
  if (court) out.push(court)
  const sum = l.amount === null ? '' : `, ${money(l.amount, room.currency)}`
  // Продавец: торг кончился со ставкой — «Передал» или «Не смогу передать»; срок — пока победитель не
  // может отметить «Не получил»
  if (l.status === 'awaiting' && l.sellerId === me) {
    out.push({ ...base, kind: 'lot', text: `победитель — ${nameOf(room, l.winner)}${sum}: отметьте «Передал» или «Не смогу передать»`, action: 'Открыть лот', deadline: l.disputeFrom })
  }
  // Победитель: продавец отметил «Передал» — «Получил» или «Не получил»; молчание до срока — «получил»
  if (l.status === 'handed' && l.winner === me) {
    out.push({ ...base, kind: 'lot', text: `${nameOf(room, l.sellerId)} отметил(а) «Передал»${sum} — «Получил» или «Не получил»`, action: 'Открыть лот', deadline: l.silenceUntil })
  }
  return out
}

// Расчёт: «Перевёл» вам — «Получил» / «Не получал»; обещания (Р-44): проигравшему — «Исполнил», выигравшему
// на «Исполнил» — «Получил» / «Не получил». Сроков нет
function settleTasks(room: SavedRoom, offers: readonly OfferView[]): Draft[] {
  const s = savedSettlement(room)
  if (!s) return []
  const me = room.memberId
  const href = settleHref(room.id)
  const members = room.members.map((m) => m.id)
  const out: Draft[] = []
  for (const t of s.transfers) {
    if (t.by !== 'sender' || checkAnswer({ currency: room.currency, members }, t, me) !== null) continue
    const sum = sumText(t.amount, room.currency)
    out.push({
      kind: 'transfer',
      id: t.id,
      title: `${nameOf(room, t.from)} → вы, ${sum}`,
      text: `${nameOf(room, t.from)} отметил(а) «Перевёл» ${sum} — «Получил» или «Не получал»`,
      action: 'Открыть расчёт',
      href,
      deadline: null,
    })
  }
  for (const p of s.promises ?? []) {
    const title = offers.find((o) => o.id === p.offer)?.condition ?? 'пари на обещание'
    if (checkKept(p, me) === null) {
      out.push({ kind: 'promise', id: p.offer, title, text: `вы обещали ${nameOf(room, p.to)}: ${p.text} — отметьте «Исполнил»`, action: 'Открыть расчёт', href, deadline: null })
    } else if (p.status === 'kept' && checkPromiseAnswer(p, me, 'received') === null) {
      out.push({ kind: 'promise', id: p.offer, title, text: `${nameOf(room, p.from)} отметил(а) «Исполнил»: ${p.text} — «Получил» или «Не получил»`, action: 'Открыть расчёт', href, deadline: null })
    }
  }
  return out
}

// По сроку: раньше — выше; без срока — ниже всех; при равенстве — как были (комнаты по порядку, внутри —
// суд, исход, пари, лоты, расчёт)
function bySoonest<T extends { deadline: number | null }>(list: readonly T[]): T[] {
  const key = (x: T) => (x.deadline === null ? Infinity : x.deadline)
  return list.map((x, i) => ({ x, i })).sort((a, b) => key(a.x) - key(b.x) || a.i - b.i).map((p) => p.x)
}

// Дела одной комнаты, по сроку
export function roomTasks(room: SavedRoom, now: number): Task[] {
  const offers = savedOffers(room)
  const drafts = [
    ...savedEvents(room).flatMap((e) => eventTasks(room, e, now)),
    ...offers.flatMap((o) => offerTasks(room, o, now)),
    ...savedLots(room).flatMap((l) => lotTasks(room, l)),
    ...settleTasks(room, offers),
  ]
  const name = String(room.name ?? '')
  return bySoonest(drafts.map((d) => ({ ...d, roomId: room.id, roomName: name, overdue: d.deadline !== null && now >= d.deadline })))
}

// Дела всех комнат устройства, по сроку
export function summaryTasks(rooms: readonly SavedRoom[], now: number): Task[] {
  return bySoonest(rooms.flatMap((r) => roomTasks(r, now)))
}

// «Скоро закроется»: споры с вашей ставкой, приём до которых — в ближайшие сутки (и ещё не прошёл): событие
// с вашей ставкой, ваше пари или ваше встречное в торге, лот с вашей ставкой, выбор с вашим вкладом
export type SoonKind = 'event' | 'offer' | 'lot' | 'choice'

export const SOON_LABEL: Record<SoonKind, string> = { event: 'пул', offer: 'пари', lot: 'лот', choice: 'выбор' }

export type Soon = {
  roomId: string
  roomName: string
  kind: SoonKind
  id: string
  title: string
  mine: string // ваше в споре: «вы: 300 ₽ на «Да»», «ваша ставка 1 200 ₽ — лучшая»
  closesAt: number
  href: string
}

function soonIn(closesAt: number, now: number): boolean {
  return closesAt > now && closesAt - now <= SOON
}

function roomSoon(room: SavedRoom, now: number): Soon[] {
  const me = room.memberId
  const sum = (n: number) => money(n, room.currency)
  const base = { roomId: room.id, roomName: String(room.name ?? '') }
  const out: Soon[] = []
  for (const e of savedEvents(room)) {
    const at = closingAt(e)
    if (e.status !== 'open' || e.cancelled || !betOn(e, me) || !soonIn(at, now)) continue
    const mine = e.outcomes
      .map((x) => ({ title: x.title, amount: e.bets.filter((b) => b.memberId === me && b.outcome === x.id).reduce((s, b) => s + b.amount, 0) }))
      .filter((x) => x.amount > 0)
      .map((x) => `${sum(x.amount)} на «${x.title}»`)
    out.push({ ...base, kind: 'event', id: e.id, title: e.condition, mine: 'вы: ' + mine.join(', '), closesAt: at, href: eventHref(room.id, e.id) })
  }
  for (const o of savedOffers(room)) {
    if (o.status !== 'open') continue
    const at = o.auction ? (o.bidding?.endsAt ?? o.closesAt) : o.closesAt
    const myBids = (o.bidding?.bids ?? []).filter((b) => b.by === me)
    if (!soonIn(at, now)) continue
    if (o.authorId === me) {
      const mine = o.promise ? 'ваше пари на обещание — ждёт ответа' : `ваше пари: ${sum(o.amount)} — ждёт ответа`
      out.push({ ...base, kind: 'offer', id: o.id, title: o.condition, mine, closesAt: at, href: offerHref(room.id, o.id) })
    } else if (myBids.length > 0) {
      const top = Math.max(...myBids.map((b) => b.amount))
      const best = o.bidding?.best?.by === me ? ' — лучшее' : ' — вас перебили'
      out.push({ ...base, kind: 'offer', id: o.id, title: o.condition, mine: `ваше встречное ${sum(top)}${best}`, closesAt: at, href: offerHref(room.id, o.id) })
    }
  }
  for (const l of savedLots(room)) {
    const myBids = l.bids.filter((b) => b.by === me)
    if (l.status !== 'open' || myBids.length === 0 || !soonIn(l.endsAt, now)) continue
    const top = Math.max(...myBids.map((b) => b.amount))
    const best = l.best?.by === me ? ' — лучшая' : l.best ? ` — лучшая у ${nameOf(room, l.best.by)}, ${sum(l.best.amount)}` : ''
    out.push({ ...base, kind: 'lot', id: l.id, title: l.title, mine: `ваша ставка ${sum(top)}${best}`, closesAt: l.endsAt, href: lotHref(room.id, l.id) })
  }
  for (const c of savedChoices(room)) {
    const mine = c.stakes.filter((s) => s.by === me)
    if (c.status !== 'open' || mine.length === 0 || !soonIn(c.endsAt, now)) continue
    const byOption = [...new Set(mine.map((s) => s.option))].map(
      (id) => `${sum(mine.filter((s) => s.option === id).reduce((n, s) => n + s.amount, 0))} в ${optionTitle(c, id)}`,
    )
    out.push({ ...base, kind: 'choice', id: c.id, title: c.question, mine: 'вы вложили ' + byOption.join(', '), closesAt: c.endsAt, href: choiceHref(room.id, c.id) })
  }
  return out
}

export function closingSoon(rooms: readonly SavedRoom[], now: number): Soon[] {
  return rooms
    .flatMap((r) => roomSoon(r, now))
    .map((x, i) => ({ x, i }))
    .sort((a, b) => a.x.closesAt - b.x.closesAt || a.i - b.i)
    .map((p) => p.x)
}

// Баланс по всем комнатам — строкой на валюту: сумма «вы должны / вам должны» комнат в этой валюте, по
// своду из копии. Комнаты на очки и без свода — не в счёт. rooms — из чего сложено (основание числа)
export type BalanceTotal = {
  currency: string
  amount: number // плюс — вам должны
  text: string // «вам должны 200 ₽» / «вы должны 300 ₽» / «никто никому не должен»
  basis: string // «по 2 комнатам»
  rooms: { id: string; name: string; amount: number; text: string }[] // «Шашлыки: +200 ₽»
}

export function balanceTotals(rooms: readonly SavedRoom[]): BalanceTotal[] {
  const by = new Map<string, BalanceTotal['rooms']>()
  for (const r of rooms) {
    const s = savedSettlement(r)
    if (!s || isPoints(r.currency)) continue
    const amount = s.members.find((m) => m.memberId === r.memberId)?.balance ?? 0
    const name = String(r.name ?? '')
    const text = `${name}: ${(amount > 0 ? '+' : '') + sumText(amount, r.currency)}`
    by.set(r.currency, [...(by.get(r.currency) ?? []), { id: r.id, name, amount, text }])
  }
  return [...by].map(([currency, list]) => {
    const amount = list.reduce((s, x) => s + x.amount, 0)
    const text = amount > 0 ? `вам должны ${sumText(amount, currency)}` : amount < 0 ? `вы должны ${sumText(-amount, currency)}` : 'никто никому не должен'
    const n = list.length
    return { currency, amount, text, basis: `по ${n} ${plural(BigInt(n), ['комнате', 'комнатам', 'комнатам'])}`, rooms: list }
  })
}

// Время и дата местные; timeZone — для тестов
function hhmm(ms: number, timeZone?: string): string {
  return new Date(ms).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone })
}

function ddmm(ms: number, timeZone?: string): string {
  return new Date(ms).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', timeZone })
}

function sameDay(a: number, b: number, timeZone?: string): boolean {
  return new Date(a).toLocaleDateString('ru-RU', { timeZone }) === new Date(b).toLocaleDateString('ru-RU', { timeZone })
}

// Миг одним словом: сегодня — «21:40», иначе — «18.11 21:40»
function momentText(ms: number, now: number, timeZone?: string): string {
  return sameDay(ms, now, timeZone) ? hhmm(ms, timeZone) : `${ddmm(ms, timeZone)} ${hhmm(ms, timeZone)}`
}

// Свежесть копии комнаты: время копии («21:40», «27.11 21:40»); копия старше недели (или ответа сервера ещё
// не было) — stale: «данные от 18.11 — откройте, чтобы обновить»
export type CopyNote = { text: string; stale: boolean }

export function copyNote(room: Pick<SavedRoom, 'syncedAt'>, now: number, timeZone?: string): CopyNote {
  const at = room.syncedAt
  if (at === null) return { text: 'данных с сервера ещё нет — откройте, чтобы обновить', stale: true }
  if (now - at > STALE_COPY) return { text: `данные от ${ddmm(at, timeZone)} — откройте, чтобы обновить`, stale: true }
  return { text: momentText(at, now, timeZone), stale: false }
}

// Сверху «Сводки»: «по копиям комнат · 21:40» — время самой свежей копии; копий с ответом сервера нет — без
// времени
export function freshLine(rooms: readonly Pick<SavedRoom, 'syncedAt'>[], now: number, timeZone?: string): string {
  const times = rooms.map((r) => r.syncedAt).filter((t): t is number => t !== null)
  if (times.length === 0) return 'по копиям комнат'
  return `по копиям комнат · ${momentText(Math.max(...times), now, timeZone)}`
}

// Срок дела или приёма: «до 21:40 · 3 ч», «до 01.12 · 3 дн»; прошёл — «срок прошёл — откройте комнату»; нет — null
export function deadlineText(deadline: number | null, now: number, timeZone?: string): string | null {
  if (deadline === null) return null
  if (now >= deadline) return 'срок прошёл — откройте комнату'
  const left = deadline - now
  const span = left >= DAY ? `${Math.floor(left / DAY)} дн` : left >= HOUR ? `${Math.floor(left / HOUR)} ч` : `${Math.max(1, Math.ceil(left / MINUTE))} мин`
  const at = sameDay(deadline, now, timeZone) ? hhmm(deadline, timeZone) : ddmm(deadline, timeZone)
  return `до ${at} · ${span}`
}

// «Ждут вас: 3» — для подписи; ноль — «ничего не ждёт»
export function tasksCountText(n: number): string {
  return n === 0 ? 'Сейчас ничего не ждёт вас' : `Ждут вас: ${n}`
}
