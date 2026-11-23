// Общее для экранов «Выбора» (этап 7, Р-09, Р-39): вид с сервера → состояние для правил choice.ts (чтобы
// кнопки решали те же проверки, что у сервера, — checkChoiceOption, checkChoiceStake — на часах сервера),
// итог между опросами (choiceOutcome), строка статуса, подписи формы, вклада и итога, прошедшее для
// «Истории», долги для «Расчёта». Считают правила, здесь — только показ. Чистые функции без DOM — с тестами
// (choiceParts.test.ts)
import { auctionLatestEnd } from '../rules/auction'
import { choiceDebts, choiceOutcome, type ChoiceOutcome, type ChoiceRoom, type ChoiceState } from '../rules/choice'
import { formatCountdown, formatDateTime } from '../rules/date'
import type { ChoiceView } from '../rules/protocol'
import type { SavedRoom } from '../store/db'
import { money, nameOf } from './eventParts'
import { who } from './offerParts'

// Адрес экрана выбора и «Нового выбора»
export function choiceHref(roomId: string, choiceId: string): string {
  return `#/room/${roomId}/choice/${choiceId}`
}

export function newChoiceHref(roomId: string): string {
  return `#/room/${roomId}/choice/new`
}

// Выбор с сервера → состояние для правил: условия, варианты, вклады, конец вкладов с продлениями (у сервера
// — на его now; дальше правила продлят сами), жребий (номер записи сайту не нужен)
export function choiceState(v: ChoiceView): ChoiceState {
  return {
    id: v.id,
    at: v.at,
    authorId: v.authorId,
    question: v.question,
    recipientId: v.recipientId,
    cashbox: v.cashbox,
    optionsUntil: v.optionsUntil,
    closesAt: v.closesAt,
    endsAt: v.endsAt,
    options: v.options.map((o) => ({ id: o.id, at: o.at, by: o.by, title: o.title })),
    stakes: v.stakes.map((s) => ({ id: s.id, at: s.at, by: s.by, option: s.option, amount: s.amount })),
    draw: v.draw && { id: '', at: v.draw.at, seed: v.draw.seed, options: [...v.draw.options] },
  }
}

// Ведущий и участники комнаты — для правил выбора
export function choiceRoomOf(room: Pick<SavedRoom, 'hostId' | 'members'>): ChoiceRoom {
  return { hostId: room.hostId, members: room.members.map((m) => m.id) }
}

// Итог выбора на часах сервера (choiceOutcome, как у сервера)
export function choiceOutcomeOf(v: ChoiceView, now: number): ChoiceOutcome {
  return choiceOutcome(choiceState(v), now)
}

// Миг, когда выбор стал прошедшим (решён или не состоялся), или null — ещё идёт или ждёт жребия
export function choicePastAt(out: Pick<ChoiceOutcome, 'status' | 'closedAt'>): number | null {
  return out.status === 'decided' || out.status === 'failed' ? out.closedAt : null
}

export function choicePastNow(v: ChoiceView, now: number): number | null {
  return choicePastAt(choiceOutcomeOf(v, now))
}

// Название варианта: „Ладога“; нет такого — „?“
export function optionTitle(v: Pick<ChoiceView, 'options'>, id: string | null): string {
  return `„${v.options.find((o) => o.id === id)?.title ?? '?'}“`
}

// Получатель словами: «Аня (вы)», с подписью — «Аня (вы) — касса»
export function recipientLine(room: SavedRoom, v: Pick<ChoiceView, 'recipientId' | 'cashbox'>): string {
  return who(room, v.recipientId) + (v.cashbox ? ' — касса' : '')
}

// Фаза словами — для строки статуса и экрана
const PHASE: Record<ChoiceOutcome['status'], string> = {
  options: 'варианты',
  open: 'вклады',
  draw: 'ждёт жребия',
  decided: 'решён',
  failed: 'не состоялся',
}

export function phaseText(status: ChoiceOutcome['status']): string {
  return PHASE[status]
}

// Строка статуса на часах сервера: фаза и сколько осталось, итог; tone — класс строки статуса (как у пари)
export type ChoiceStatusText = { text: string; tone: 'open' | 'closed' | 'cancelled' | 'final' }

export function choiceStatusText(v: ChoiceView, now: number): ChoiceStatusText {
  const out = choiceOutcomeOf(v, now)
  switch (out.status) {
    case 'options':
      return { text: `варианты до ${formatDateTime(v.optionsUntil)}, осталось ${formatCountdown(v.optionsUntil - now)}`, tone: 'open' }
    case 'open':
      return { text: `вклады до ${formatDateTime(out.endsAt)}, осталось ${formatCountdown(out.endsAt - now)}`, tone: 'open' }
    case 'draw':
      return { text: 'ничья — ждёт жребия сервера', tone: 'open' }
    case 'decided':
      return { text: `решён — ${optionTitle(v, out.winner)}${out.how === 'draw' ? ' (ничья — решил жребий)' : ''}`, tone: 'final' }
    case 'failed':
      return { text: out.failed === 'options' ? 'не состоялся — меньше двух вариантов' : 'не состоялся — вкладов не было', tone: 'cancelled' }
  }
}

// Как это работает — три строки под формой «Нового выбора» и на экране выбора
export function choiceHowLines(recipient: string): string[] {
  return [
    'Побеждает вариант с большей суммой; ничья в конце — продление на 2 минуты, дальше — жребий.',
    `Платят только вложившиеся в победивший вариант — получателю (${recipient}).`,
    'Проигравшие не платят; вклад не отзывается.',
  ]
}

// «Вклады закончатся не позже …» — «вклады до» + 30 минут продлений (auctionLatestEnd)
export function choiceLatestLine(closesAt: number): string {
  return `Вклады закончатся не позже ${formatDateTime(auctionLatestEnd({ closesAt }))}: вклад за 2 минуты до конца или ничья продлевают их на 2 минуты, всего — не больше чем на 30 минут.`
}

// Мой вариант: в какой я уже вложил (вкладывают только в один); не вкладывал — null
export function myOption(v: Pick<ChoiceView, 'stakes'>, me: string): string | null {
  return v.stakes.find((s) => s.by === me)?.option ?? null
}

// Мой вклад — сумма всех моих вкладов
export function myStake(v: Pick<ChoiceView, 'stakes'>, me: string): number {
  return v.stakes.filter((s) => s.by === me).reduce((s, x) => s + x.amount, 0)
}

// Вкладчики варианта — по участнику, по порядку первого вклада: «Вера (вы) — 500 ₽»
export function optionStakers(room: SavedRoom, v: Pick<ChoiceView, 'stakes'>, optionId: string): string[] {
  const sums = new Map<string, number>()
  for (const s of v.stakes) if (s.option === optionId) sums.set(s.by, (sums.get(s.by) ?? 0) + s.amount)
  return [...sums].map(([by, amount]) => `${who(room, by)} — ${money(amount, room.currency)}`)
}

// Окно вклада (основание числа, Р-10): «Вы вкладываете 500 ₽ в „Ладога“ — если он победит, заплатите
// получателю — Аня — 500 ₽»; уже вкладывал — вместе с прежним; сам получатель — свой вклад не платит
export function stakeAskText(room: SavedRoom, v: ChoiceView, optionId: string, amount: number): string {
  const me = room.memberId
  const sum = (n: number) => money(n, room.currency)
  const head = `Вы вкладываете ${sum(amount)} в ${optionTitle(v, optionId)}`
  if (me === v.recipientId) return `${head} — вы получатель: свой вклад вы не платите. Вклад не отзывается.`
  const before = myStake(v, me)
  const total = before + amount
  const withBefore = before > 0 ? ` (с прежним вкладом ${sum(before)})` : ''
  return `${head} — если он победит, заплатите получателю — ${nameOf(room, v.recipientId)} — ${sum(total)}${withBefore}. Вклад не отзывается.`
}

// Победитель словами: «„Ладога“ — 800 ₽» / «… — ничья, решил жребий»; не решён — null
function winnerWords(room: SavedRoom, v: ChoiceView, out: Pick<ChoiceOutcome, 'status' | 'winner' | 'how'>): string | null {
  if (out.status !== 'decided' || out.winner === null) return null
  const total = v.stakes.filter((s) => s.option === out.winner).reduce((s, x) => s + x.amount, 0)
  const how = out.how === 'draw' ? ' — ничья, решил жребий' : ''
  return `${optionTitle(v, out.winner)} — ${money(total, room.currency)}${how}`
}

// Итог выбора строкой: «Победил „Ладога“ — 800 ₽» (ничья — «…, решил жребий»); не решён — null
export function winnerLine(room: SavedRoom, v: ChoiceView, out: Pick<ChoiceOutcome, 'status' | 'winner' | 'how'>): string | null {
  const words = winnerWords(room, v, out)
  return words && `Победил ${words}`
}

// Долг по выбору для «Расчёта» и итога: вложившийся в победивший — получателю свою сумму, основание —
// «выбор „…“»; у решённого на now (choiceDebts)
export type ChoiceDebt = { choice: string; question: string; from: string; to: string; amount: number; at: number }

export function choiceDebtsOf(choices: readonly ChoiceView[], now: number): ChoiceDebt[] {
  return choices.flatMap((v) => {
    const out = choiceOutcomeOf(v, now)
    return choiceDebts(choiceState(v), now).map((d) => ({ choice: v.id, question: v.question, ...d, at: out.closedAt ?? out.endsAt }))
  })
}

// Строка долга: «Вера (вы) → Аня: 500 ₽ — выбор „Куда едем?“»
export function choiceDebtLine(room: SavedRoom, d: ChoiceDebt): string {
  return `${who(room, d.from)} → ${who(room, d.to)}: ${money(d.amount, room.currency)} — выбор „${d.question}“`
}

// Строка долга на экране выбора: «Вера (вы) → Аня: 500 ₽»
export function debtLine(room: SavedRoom, d: { from: string; to: string; amount: number }): string {
  return `${who(room, d.from)} → ${who(room, d.to)}: ${money(d.amount, room.currency)}`
}

// Исход выбора для «Истории»: «„Ладога“ — 800 ₽» / «„Ладога“ — ничья, решил жребий» / «не состоялся — …»
export function choiceOutcomeWords(room: SavedRoom, v: ChoiceView, out: Pick<ChoiceOutcome, 'status' | 'winner' | 'how' | 'failed'>): string {
  if (out.status === 'failed') return out.failed === 'options' ? 'не состоялся — меньше двух вариантов' : 'не состоялся — вкладов не было'
  return winnerWords(room, v, out) ?? `„${v.question}“ ещё не решён`
}

// Мой итог по прошедшему выбору: получатель — плюс сумма долгов, вложивший в победивший — минус свой
// долг, вложивший в другой и у не состоявшегося — ноль; не получатель и не вкладывал — null
export function choiceMine(v: ChoiceView, me: string, now: number): number | null {
  const debts = choiceDebts(choiceState(v), now)
  if (me === v.recipientId) return debts.reduce((s, d) => s + d.amount, 0)
  if (!v.stakes.some((s) => s.by === me)) return null
  return -debts.filter((d) => d.from === me).reduce((s, d) => s + d.amount, 0)
}
