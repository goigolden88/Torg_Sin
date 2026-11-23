// Лот (этап 7, Р-09, Р-38; Архитектура, «Правила лота в коде»): торг за вещь, цифровой товар или услугу
// внутри обычной комнаты. Продавец (автор) задаёт старт, шаг и конец торга; высшая ставка побеждает;
// передача — вне приложения: продавец «Передал» / «Не смогу передать», победитель «Получил» / «Не
// получил»; молчание победителя срок молчания после «Передал» — «получил»; «Не получил» — суд жребием
// (appeal.ts, court.ts), окончательно. Долг победителя продавцу — в «Расчёт» (settle.ts), только когда
// получено. Здесь — форма, проверки и состояние лота из записей LotRecord (автор, время сервера at,
// порядок — журнала); из журнала их берёт logLots. Статусы и итоги считаются, не хранятся. Торг — общий
// с «Торгом до …» пари (auction.ts). Ни DOM, ни Cloudflare
import { auctionLatestEnd, auctionSpan, auctionStep, extendEnd, lastBid, nextBid, type AuctionTerms } from './auction'
import { courtVerdict, courtView, type CourtCase } from './court'
import { checkAmount, MAX_EVENT_TEXT } from './event'
import { recordTimes, timesOf, type Times } from './pace'
import type { LotBid, LotStatus, LotView } from './protocol'
import { foldLog, type LogEntry } from './room'

export type { LotBid, LotStatus }

export const MAX_LOT_TITLE = 100

// Отказы формы
export const NEED_LOT_TITLE = 'Нужно название лота'
export const LONG_LOT_TITLE = `Название лота — не длиннее ${MAX_LOT_TITLE} знаков`
export const LONG_LOT_DESCRIPTION = `Описание лота — не длиннее ${MAX_EVENT_TEXT} знаков`
export const BAD_LOT_START = 'Старт — целое число больше нуля'
export const BAD_LOT_STEP = 'Шаг — целое число больше нуля'
export const NEED_LOT_END = 'Нужен конец торга'
export const LOT_SHORT = 'Торг — не меньше 10 минут'
export const LOT_LONG = 'Торг — не дольше 3 дней'
// Ставка и «Снять лот»
export const LOT_WITHDRAWN = 'Лот снят'
export const LOT_OVER = 'Торг закончен'
export const OWN_LOT = 'Продавец на свой лот не ставит'
export const NOT_MEMBER = 'Это может только участник комнаты'
export const BAD_LOT_BID = 'Ставка — целое число больше нуля'
export const LOT_BID_LOW = 'Первая ставка — не меньше старта'
export const LOT_BID_STEP = 'Ставка — больше лучшей хотя бы на шаг'
export const ONLY_SELLER = 'Это может только продавец'
export const LOT_HAS_BIDS = 'Ставки уже есть — лот не снять'
// После торга
export const LOT_NOT_OVER = 'Торг ещё идёт'
export const LOT_UNSOLD = 'Ставок не было — лот не продан'
export const ONLY_WINNER = 'Это может только победитель торга'
export const LOT_HANDED = '«Передал» уже отмечено'
export const LOT_RECEIVED = 'Лот уже получен'
export const LOT_FAILED = 'Продавец не сможет передать — лот не состоялся'
export const LOT_DISPUTED = 'Победитель отметил «Не получил» — лот в споре'
export const LOT_IN_COURT = 'Лот решает суд — отметки сторон уже не действуют'
export const LOT_TOO_EARLY = '«Не получил» — после «Передал» или когда после конца торга прошёл срок молчания без «Передал»'

type Checked<T> = { ok: true; value: T } | { ok: false; error: string }

// Проверенная форма лота: описание — может быть пустым; шаг не задан — 10 % старта (auctionStep)
export type LotInput = { title: string; description: string; start: number; step: number; closesAt: number }

function text(x: unknown, max: number, need: string | null, long: string): Checked<string> {
  const s = typeof x === 'string' ? x.trim() : ''
  if (!s && need !== null) return { ok: false, error: need }
  if ([...s].length > max) return { ok: false, error: long }
  return { ok: true, value: s }
}

// Проверка формы без времени сервера (его — checkLotTimes): название — не пустое, ≤ 100 знаков; описание —
// ≤ 300 знаков (не задано — пустое); старт — целое > 0; шаг — целое > 0 или 10 % старта; конец — число
export function checkLotInput(x: { title: unknown; description?: unknown; start: unknown; step?: unknown; closesAt: unknown }): Checked<LotInput> {
  const title = text(x.title, MAX_LOT_TITLE, NEED_LOT_TITLE, LONG_LOT_TITLE)
  if (!title.ok) return title
  const description = text(x.description, MAX_EVENT_TEXT, null, LONG_LOT_DESCRIPTION)
  if (!description.ok) return description
  const start = checkAmount(x.start)
  if (!start.ok) return { ok: false, error: BAD_LOT_START }
  const step = x.step === undefined || x.step === null ? auctionStep(start.value) : x.step
  if (!Number.isSafeInteger(step) || (step as number) < 1) return { ok: false, error: BAD_LOT_STEP }
  if (!Number.isSafeInteger(x.closesAt)) return { ok: false, error: NEED_LOT_END }
  return { ok: true, value: { title: title.value, description: description.value, start: start.value, step: step as number, closesAt: x.closesAt as number } }
}

// Конец торга по времени сервера: от 10 минут до 3 дней с создания (сроки решения, не темпа). Годный — null
export function checkLotTimes(input: { closesAt: number }, now: number): string | null {
  const span = auctionSpan(input.closesAt, now)
  return span === 'short' ? LOT_SHORT : span === 'long' ? LOT_LONG : null
}

// Записи лота — как будут в журнале комнаты: memberId — автор записи, at — время сервера. Номер лота —
// id записи lot.created; автор — продавец; times — сроки темпа на миг создания (нет — обычный набор)
export type LotCreated = {
  type: 'lot.created'
  id: string
  at: number
  memberId: string
  title: string
  description: string
  start: number
  step: number
  closesAt: number
  times?: Times
}
type LotAct<T extends string, X = object> = { type: T; id: string; at: number; memberId: string; lot: string } & X
export type LotRecord =
  | LotCreated
  | LotAct<'lot.bid', { amount: number }> // участник: сколько
  | LotAct<'lot.withdrawn'> // продавец: «Снять лот»
  | LotAct<'lot.handed'> // продавец: «Передал»
  | LotAct<'lot.declined'> // продавец: «Не смогу передать»
  | LotAct<'lot.received'> // победитель: «Получил»
  | LotAct<'lot.disputed'> // победитель: «Не получил»
  // Суд по «Не получил» собран (запись court.drawn журнала): дальше решает только суд
  | LotAct<'court.drawn'>

// Лот из записей. endsAt — конец с продлениями; bids — действующие ставки по порядку (каждая больше
// прежней — последняя лучшая); отметки сторон — миг первой действующей; courtAt — суд собран
export type LotState = AuctionTerms & {
  id: string
  at: number
  sellerId: string
  title: string
  description: string
  closesAt: number
  times?: Times
  endsAt: number
  bids: LotBid[]
  withdrawnAt: number | null
  handedAt: number | null
  declinedAt: number | null
  receivedAt: number | null
  disputedAt: number | null
  courtAt: number | null
}

// Участники комнаты — для правил лота
export type LotRoom = { members: readonly string[] }

export function bestLotBid(l: LotState): LotBid | null {
  return lastBid(l)
}

// Победитель на now: торг кончился (now ≥ endsAt), лот не снят, ставка была — лучшая ставка; иначе null
export function lotWinner(l: LotState, now: number): LotBid | null {
  if (l.withdrawnAt !== null || now < l.endsAt) return null
  return bestLotBid(l)
}

// «Получено» на now без суда: отметкой «Получил» или молчанием победителя срок молчания лота (Р-35,
// закреплён при создании) после «Передал» — если до этого не было «Не получил» и «Не смогу передать»
function receipt(l: LotState, now: number): { at: number; how: 'mark' | 'silence' } | null {
  if (l.receivedAt !== null) return { at: l.receivedAt, how: 'mark' }
  if (l.handedAt === null || l.disputedAt !== null || l.declinedAt !== null) return null
  const at = l.handedAt + timesOf(l).silence
  return now >= at ? { at, how: 'silence' } : null
}

// Общее для отметок после торга: торг кончился, победитель есть
function afterEnd(l: LotState, now: number): string | null {
  if (l.withdrawnAt !== null) return LOT_WITHDRAWN
  if (now < l.endsAt) return LOT_NOT_OVER
  if (l.bids.length === 0) return LOT_UNSOLD
  return null
}

// Итог уже есть или решает суд — отметки сторон не действуют
function closedError(l: LotState, now: number): string | null {
  if (l.declinedAt !== null) return LOT_FAILED
  if (receipt(l, now)) return LOT_RECEIVED
  if (l.courtAt !== null) return LOT_IN_COURT
  return null
}

// Ставка: до конца торга (с продлениями), не продавец, участник; первая — не меньше старта, следующая —
// больше лучшей хотя бы на шаг; свою перебить можно. Ставка не отзывается; перебитая — свободна
export function checkLotBid(l: LotState, memberId: string, amount: unknown, room: LotRoom, now: number): string | null {
  if (l.withdrawnAt !== null) return LOT_WITHDRAWN
  if (now >= l.endsAt) return LOT_OVER
  if (memberId === l.sellerId) return OWN_LOT
  if (!room.members.includes(memberId)) return NOT_MEMBER
  if (!Number.isSafeInteger(amount) || (amount as number) < 1) return BAD_LOT_BID
  const next = nextBid(amount as number, bestLotBid(l)?.amount ?? null, l)
  return next === 'low' ? LOT_BID_LOW : next === 'step' ? LOT_BID_STEP : null
}

// «Снять лот»: продавец, пока ставок нет и торг идёт
export function checkLotWithdraw(l: LotState, memberId: string, now: number): string | null {
  if (memberId !== l.sellerId) return ONLY_SELLER
  if (l.withdrawnAt !== null) return LOT_WITHDRAWN
  if (l.bids.length > 0) return LOT_HAS_BIDS
  if (now >= l.endsAt) return LOT_OVER
  return null
}

// «Передал»: продавец, после торга с победителем, один раз; не после «Не получил», итога и суда
export function checkHanded(l: LotState, memberId: string, now: number): string | null {
  if (memberId !== l.sellerId) return ONLY_SELLER
  const error = afterEnd(l, now) ?? closedError(l, now)
  if (error) return error
  if (l.disputedAt !== null) return LOT_DISPUTED
  return l.handedAt !== null ? LOT_HANDED : null
}

// «Не смогу передать» — лот не состоялся, никто никому не должен: продавец, после торга с победителем, пока
// не получено и суд не собран (и после «Передал», и в споре без суда — продавец уступает)
export function checkDeclined(l: LotState, memberId: string, now: number): string | null {
  if (memberId !== l.sellerId) return ONLY_SELLER
  return afterEnd(l, now) ?? closedError(l, now)
}

// «Получил»: победитель, в любой момент после конца торга, пока не получено, не «не состоялся» и суд не
// собран (в споре без суда — победитель уступает)
export function checkReceived(l: LotState, memberId: string, now: number): string | null {
  const error = afterEnd(l, now)
  if (error) return error
  if (memberId !== bestLotBid(l)?.by) return ONLY_WINNER
  return closedError(l, now)
}

// С какого мига победитель может «Не получил» без «Передал»: конец торга + срок молчания лота
export function disputeFrom(l: LotState): number {
  return l.endsAt + timesOf(l).silence
}

// «Не получил»: победитель, один раз, пока не получено (после «Передал» — в срок молчания) и не «не
// состоялся»; без «Передал» — когда после конца торга прошёл срок молчания
export function checkDisputed(l: LotState, memberId: string, now: number): string | null {
  const error = afterEnd(l, now)
  if (error) return error
  if (memberId !== bestLotBid(l)?.by) return ONLY_WINNER
  const closed = closedError(l, now)
  if (closed) return closed
  if (l.disputedAt !== null) return LOT_DISPUTED
  if (l.handedAt === null && now < disputeFrom(l)) return LOT_TOO_EARLY
  return null
}

// Пора ли суду по лоту: «Не получил» действует, суд не собран, стороны не уступили. Собран ли уже суд и
// есть ли кандидаты — appeal.ts (checkCourtDraw, courtCandidates). Судить некому — лот «в споре»
export function lotCourtDue(l: LotState, now: number): boolean {
  return l.disputedAt !== null && now >= l.disputedAt && l.courtAt === null && l.declinedAt === null && l.receivedAt === null
}

// Запись lot.created: форма и сроки — те же проверки на её время; продавец — участник
function createdOk(r: LotCreated, room: LotRoom): boolean {
  const input = checkLotInput(r)
  return (
    input.ok &&
    input.value.title === r.title &&
    input.value.description === r.description &&
    input.value.step === r.step &&
    checkLotTimes(r, r.at) === null &&
    room.members.includes(r.memberId)
  )
}

// Лоты комнаты из записей по порядку создания. Запись действует, если её разрешают правила выше на её
// время at (так сервер и свёртка не расходятся); записи о неизвестном лоте не действуют
export function roomLots(records: readonly LotRecord[], room: LotRoom): LotState[] {
  const lots = new Map<string, LotState>()
  for (const r of records) {
    if (r.type === 'lot.created') {
      if (lots.has(r.id) || !createdOk(r, room)) continue
      const times = recordTimes(r.times)
      lots.set(r.id, {
        ...(times && { times }),
        id: r.id,
        at: r.at,
        sellerId: r.memberId,
        title: r.title,
        description: r.description,
        start: r.start,
        step: r.step,
        closesAt: r.closesAt,
        endsAt: r.closesAt,
        bids: [],
        withdrawnAt: null,
        handedAt: null,
        declinedAt: null,
        receivedAt: null,
        disputedAt: null,
        courtAt: null,
      })
      continue
    }
    const l = lots.get(r.lot)
    if (!l) continue
    switch (r.type) {
      case 'lot.bid':
        if (checkLotBid(l, r.memberId, r.amount, room, r.at)) break
        l.bids.push({ id: r.id, at: r.at, by: r.memberId, amount: r.amount })
        // Продление: ставка за 2 минуты до конца — конец через 2 минуты после неё, не дальше предела
        l.endsAt = extendEnd(l, r.at)
        break
      case 'lot.withdrawn':
        if (!checkLotWithdraw(l, r.memberId, r.at)) l.withdrawnAt = r.at
        break
      case 'lot.handed':
        if (!checkHanded(l, r.memberId, r.at)) l.handedAt = r.at
        break
      case 'lot.declined':
        if (!checkDeclined(l, r.memberId, r.at)) l.declinedAt = r.at
        break
      case 'lot.received':
        if (!checkReceived(l, r.memberId, r.at)) l.receivedAt = r.at
        break
      case 'lot.disputed':
        if (!checkDisputed(l, r.memberId, r.at)) l.disputedAt = r.at
        break
      case 'court.drawn':
        // Первый сбор в срок; жребий и кандидатов проверяет roomAppeals (appeal.ts) — сервер пишет запись,
        // только когда кандидаты есть
        if (lotCourtDue(l, r.at)) l.courtAt = r.at
        break
    }
  }
  return [...lots.values()]
}

export type LotOutcome = {
  status: LotStatus
  winner: LotBid | null // после конца со ставками
  received: { at: number; how: 'mark' | 'silence' | 'court' } | null
  closedAt: number | null // миг итога: снят, не продан, получен, не состоялся, не передан
}

// Лот на now (время сервера), без будильника. court — дело суда по лоту (roomAppeals): «передано» —
// получен судом; «не передано» или большинства нет (у суда без апелляции — «отменить», court.ts) — не
// передан, долга нет. Суд собран, а дела не дали — «ждёт суда»
export function lotOutcome(l: LotState, now: number, court: CourtCase | null = null): LotOutcome {
  const winner = lotWinner(l, now)
  const out = (status: LotStatus, closedAt: number | null = null, received: LotOutcome['received'] = null): LotOutcome => ({
    status,
    winner,
    received,
    closedAt,
  })
  if (l.withdrawnAt !== null) return out('withdrawn', l.withdrawnAt)
  if (now < l.endsAt) return out('open')
  if (!winner) return out('unsold', l.endsAt)
  if (l.declinedAt !== null) return out('failed', l.declinedAt)
  const got = receipt(l, now)
  if (got) return out('received', got.at, got)
  if (l.disputedAt !== null) {
    if (l.courtAt === null) return out('dispute')
    const decision = court ? courtVerdict(court, now) : null
    if (!decision) return out('court')
    return decision.verdict === 'delivered'
      ? out('received', decision.at, { at: decision.at, how: 'court' })
      : out('undelivered', decision.at)
  }
  return out(l.handedAt !== null ? 'handed' : 'awaiting')
}

// Итог лота для «Расчёта»: получен — победитель должен продавцу свою ставку; иначе пусто
export function lotResult(l: LotState, now: number, court: CourtCase | null = null): { memberId: string; net: number }[] {
  const out = lotOutcome(l, now, court)
  if (out.status !== 'received' || !out.winner) return []
  return [
    { memberId: l.sellerId, net: out.winner.amount },
    { memberId: out.winner.by, net: -out.winner.amount },
  ]
}

// Лот для ответа на now: условия, ставки (видны всем, Р-11), итог; court — дело суда по лоту
export function lotView(l: LotState, now: number, court: CourtCase | null = null): LotView {
  const out = lotOutcome(l, now, court)
  const bid = (b: LotBid): LotBid => ({ id: b.id, at: b.at, by: b.by, amount: b.amount })
  const best = bestLotBid(l)
  const silence = timesOf(l).silence
  return {
    id: l.id,
    at: l.at,
    sellerId: l.sellerId,
    title: l.title,
    description: l.description,
    start: l.start,
    step: l.step,
    closesAt: l.closesAt,
    latestEnd: auctionLatestEnd(l),
    endsAt: l.endsAt,
    times: { ...timesOf(l) },
    status: out.status,
    bids: l.bids.map(bid),
    best: best && bid(best),
    winner: out.winner?.by ?? null,
    amount: out.winner?.amount ?? null,
    withdrawnAt: l.withdrawnAt,
    handedAt: l.handedAt,
    declinedAt: l.declinedAt,
    disputedAt: l.disputedAt,
    disputeFrom: out.winner ? disputeFrom(l) : null,
    silenceUntil: l.handedAt === null ? null : l.handedAt + silence,
    received: out.received && { at: out.received.at, how: out.received.how },
    closedAt: out.closedAt,
    ...(court && { court: courtView(court, now) }),
  }
}

// Лот в журнале комнаты (Р-38). requestId — номер запроса телефона: повтор узнаётся по нему
const LOT_ENTRIES = ['lot.created', 'lot.bid', 'lot.withdrawn', 'lot.handed', 'lot.declined', 'lot.received', 'lot.disputed'] as const
export type LotEntry = Extract<LogEntry, { type: (typeof LOT_ENTRIES)[number] }>

export function isLotEntry(e: LogEntry): e is LotEntry {
  return (LOT_ENTRIES as readonly string[]).includes(e.type)
}

// Запись журнала → запись правил: те же поля без номера запроса
export function lotRecord(e: LotEntry): LotRecord {
  const base = { id: e.id, at: e.at, memberId: e.memberId }
  switch (e.type) {
    case 'lot.created':
      return {
        ...base,
        type: 'lot.created',
        title: e.title,
        description: e.description,
        start: e.start,
        step: e.step,
        closesAt: e.closesAt,
        // Сроки (Р-35): нет поля — и в записи правил его нет
        ...(e.times !== undefined && { times: e.times }),
      }
    case 'lot.bid':
      return { ...base, type: 'lot.bid', lot: e.lot, amount: e.amount }
    default:
      return { ...base, type: e.type, lot: e.lot }
  }
}

// Лоты комнаты из журнала по порядку создания (roomLots); комнаты нет — пусто. Суд по «Не получил»
// (court.drawn) — тоже запись лота: после него решает только суд; записи о событиях и пари не действуют
export function logLots(log: readonly LogEntry[]): LotState[] {
  const state = foldLog(log)
  if (!state) return []
  const records = log.flatMap((e): LotRecord[] =>
    isLotEntry(e)
      ? [lotRecord(e)]
      : e.type === 'court.drawn'
        ? [{ type: 'court.drawn', id: e.id, at: e.at, memberId: e.memberId, lot: e.target }]
        : [],
  )
  return roomLots(records, { members: state.members.map((m) => m.id) })
}
