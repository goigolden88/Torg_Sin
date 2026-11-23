// Текст экрана «Расчёт» (этап 5, Р-32): числа с основанием, «вы должны / вам должны», состояние и
// кнопки переводов, строка режима «кто кому». Считает сервер (свод в ответе комнаты, settle.ts), права
// на кнопки — те же проверки правил (checkAnswer, checkRevoke, checkSettleMode); здесь — только показ.
// Чистые функции без DOM — с тестами (settleParts.test.ts)
import { currency as currencyOf, formatAmount, isCurrencyCode, plural } from '../rules/currency'
import type { EventView, OfferView, SettlementView, SettleModeView, SettleSumView, TransferStatusView, TransferView } from '../rules/protocol'
import { checkAnswer, checkRevoke, checkSettleMode, MODE_LOCKED } from '../rules/settle'

// Комната на очки — «Таблица очков»: без переводов и подсказки
export const POINTS = 'PTS'

export function isPoints(currency: string): boolean {
  return currency === POINTS
}

// Адрес экрана «Расчёт» комнаты
export function settleHref(roomId: string): string {
  return `#/room/${roomId}/settle`
}

// «1 200 ₽»; валюта не из таблицы (сервер новее сайта) — число и код
export function sumText(units: number, currency: string): string {
  return isCurrencyCode(currency) ? formatAmount(units, currency) : `${units} ${currency}`
}

// Итог со знаком: «+1 200 ₽», «−300 ₽», «0 ₽»
export function signedSum(units: number, currency: string): string {
  return (units > 0 ? '+' : '') + sumText(units, currency)
}

// Из чего сложено число: «по 1 событию», «по 3 событиям», «по 2 пари», «по 5 событиям и пари»; лоты (Р-38) —
// «по 1 лоту», «по 3 событиям и 2 лотам», «по 5 событиям и пари, 1 лоту»; выборы (Р-39) — «по 1 выбору»,
// «по 2 лотам и 1 выбору», «по 3 событиям, 2 лотам и 1 выбору», «по 5 событиям и пари, 2 выборам»; ни из
// чего — ''
export function basisText(sum: SettleSumView): string {
  const { events, offers } = sum
  const lots = sum.lots ?? 0
  const choices = sum.choices ?? 0
  const base =
    events > 0 && offers > 0
      ? `${events + offers} событиям и пари`
      : events > 0
        ? `${events} ${plural(BigInt(events), ['событию', 'событиям', 'событиям'])}`
        : offers > 0
          ? `${offers} пари`
          : ''
  const lot = lots > 0 ? `${lots} ${plural(BigInt(lots), ['лоту', 'лотам', 'лотам'])}` : ''
  const choice = choices > 0 ? `${choices} ${plural(BigInt(choices), ['выбору', 'выборам', 'выборам'])}` : ''
  const parts = [base, lot, choice].filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return `по ${parts[0]}`
  // «и» уже внутри («событиям и пари») — дальше через запятую; иначе последнее — через «и»
  if (base.includes(' и ')) return `по ${parts.join(', ')}`
  return `по ${parts.slice(0, -1).join(', ')} и ${parts[parts.length - 1]}`
}

function withBasis(amount: string, sum: SettleSumView): string {
  const basis = basisText(sum)
  return basis ? `${amount} ${basis}` : amount
}

// Три числа участника: «итог +1 200 ₽ по 5 событиям и пари», «ждёт окончательности +300 ₽ по 2 пари»,
// «в игре 500 ₽ по 3 событиям» (в игре — свои ставки, без знака)
export type MemberNumbers = { total: string; pending: string; inPlay: string }

export function memberNumbers(m: Pick<SettlementView['members'][number], 'total' | 'pending' | 'inPlay'>, currency: string): MemberNumbers {
  return {
    total: withBasis(signedSum(m.total.amount, currency), m.total),
    pending: withBasis(signedSum(m.pending.amount, currency), m.pending),
    inPlay: withBasis(sumText(m.inPlay.amount, currency), m.inPlay),
  }
}

// Строка в блоке комнаты: «Ваш итог: +1 200 ₽ по 5 событиям и пари»
export function myTotalLine(settlement: SettlementView, me: string, currency: string): string {
  const m = settlement.members.find((x) => x.memberId === me)
  return 'Ваш итог: ' + (m ? memberNumbers(m, currency).total : sumText(0, currency))
}

// Считать нечего: ни у кого нет окончательного события, пари, полученного лота или решённого выбора и
// переводов нет
export function nothingFinal(settlement: SettlementView): boolean {
  return (
    settlement.transfers.length === 0 &&
    settlement.members.every((m) => m.total.events === 0 && m.total.offers === 0 && !m.total.lots && !m.total.choices)
  )
}

// Сколько споров ждут окончательности: утверждённые, ещё не окончательные (как «ждёт окончательности»
// свода): событие — исход «утверждён», не «без игры»; пари — исход «утверждён»
export function pendingDisputes(events: readonly EventView[], offers: readonly OfferView[]): number {
  const e = events.filter((x) => !x.cancelled && x.outcome?.status === 'approved' && !x.outcome.void).length
  const o = offers.filter((x) => x.outcome?.phase === 'approved').length
  return e + o
}

// «Вы должны» и «Вам должны» — из подсказки «кто кому»
export type Debt = { other: string; amount: number }

export function myDebts(settlement: SettlementView, me: string): { owe: Debt[]; owed: Debt[] } {
  return {
    owe: settlement.suggestions.filter((s) => s.from === me).map((s) => ({ other: s.to, amount: s.amount })),
    owed: settlement.suggestions.filter((s) => s.to === me).map((s) => ({ other: s.from, amount: s.amount })),
  }
}

// Карточка комнаты в «Моих комнатах»: «вы должны 300 ₽» / «вам должны 900 ₽»; баланс ноль, свода нет,
// комната на очки — ничего
export function balanceNote(settlement: SettlementView | null, me: string, currency: string): string | null {
  if (!settlement || isPoints(currency)) return null
  const m = settlement.members.find((x) => x.memberId === me)
  if (!m || m.balance === 0) return null
  return m.balance < 0 ? `вы должны ${sumText(-m.balance, currency)}` : `вам должны ${sumText(m.balance, currency)}`
}

// Таблица очков: по убыванию итога; при равенстве — по порядку входа
export function byTotal<T extends { total: SettleSumView }>(members: readonly T[]): T[] {
  return members.map((m, i) => ({ m, i })).sort((a, b) => b.m.total.amount - a.m.total.amount || a.i - b.i).map((x) => x.m)
}

export const TRANSFER_STATUS: Record<TransferStatusView, string> = {
  pending: 'ждёт подтверждения',
  received: 'получен',
  rejected: 'отклонён',
  cancelled: 'отменён',
}

// Кнопки перевода для участника me — только те, что разрешают правила: получателю у «ждёт
// подтверждения» — «Получил» и «Не получал»; должнику у своего «Перевёл» — «Отозвать»; получателю у
// «получен» — «Отменить отметку»
export type TransferButton = { act: 'receive' | 'reject' | 'cancel'; label: string }

export function transferButtons(t: TransferView, me: string, room: { currency: string; members: readonly string[] }): TransferButton[] {
  const out: TransferButton[] = []
  if (checkAnswer(room, t, me) === null) out.push({ act: 'receive', label: 'Получил' }, { act: 'reject', label: 'Не получал' })
  if (checkRevoke(room, t, me) === null) out.push({ act: 'cancel', label: me === t.to ? 'Отменить отметку' : 'Отозвать' })
  return out
}

// Режим «кто кому» (Р-32): название и пояснение
export const MODE_TITLE: Record<SettleModeView, string> = {
  stakes: 'По ставкам',
  fewest: 'Меньше переводов',
}
export const MODE_ABOUT: Record<SettleModeView, string> = {
  stakes: 'каждый платит тому, кому проиграл',
  fewest: 'долги сводятся через всех',
}
export const MODES: readonly SettleModeView[] = ['stakes', 'fewest']

// «По ставкам — каждый платит тому, кому проиграл»
export function modeLabel(mode: SettleModeView): string {
  return `${MODE_TITLE[mode]} — ${MODE_ABOUT[mode]}`
}

export const MODE_LOCKED_NOTE = 'Режим меняется, когда все в расчёте'

// Может ли me сменить режим сейчас (checkSettleMode на другой режим): «можно» — кнопка «Изменить»;
// «закрыто переводами» — пояснение; не ведущий или комната на очки — ничего
export function modeChange(
  settlement: SettlementView,
  room: { hostId: string; currency: string },
  me: string,
): 'can' | 'locked' | 'none' {
  const other: SettleModeView = settlement.mode === 'stakes' ? 'fewest' : 'stakes'
  const refusal = checkSettleMode(settlement, room, me, other)
  if (refusal === null) return 'can'
  return refusal === MODE_LOCKED ? 'locked' : 'none'
}

// Сумма в поле: минимальные единицы → «300» или «300,5» (подсказка в окне «Перевёл» / «Получил»)
export function amountText(units: number, currency: string): string {
  if (!isCurrencyCode(currency)) return String(units)
  const digits = currencyOf(currency).digits
  if (digits === 0) return String(units)
  const s = String(units).padStart(digits + 1, '0')
  const frac = s.slice(-digits).replace(/0+$/, '')
  return s.slice(0, -digits) + (frac ? ',' + frac : '')
}
