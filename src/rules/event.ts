// События-пул (Р-04): шаблон «Условие / Как проверяем / Срок», исходы, ставки, уточнения,
// отмена. Записи — в журнале комнаты (room.ts, LogEntry); здесь — проверка формы и состояние
// событий из журнала. Деньги пула (возврат при отмене) — pool.ts. Ни DOM, ни Cloudflare
import { settlePool, type PoolBet } from './pool'
import type {
  Approval,
  BetInfo,
  Cancellation,
  Clarification,
  EventInfo,
  EventStatus,
  EventView,
  Objection,
  OutcomeMark,
  OutcomeView,
} from './protocol'
import type { LogEntry } from './room'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
// Сроки исхода (Архитектура, «Правила» — «Исход пула», «Окончательность»; Р-17)
export const OBJECTION_TIME = DAY // на возражение после предложения
export const AUTHOR_SILENCE = 3 * DAY // после «исход ожидается к» — предложить может ведущий
export const VOTING_TIME = 72 * HOUR // голосование не ставивших
export const FINAL_TIME = 7 * DAY // после утверждения без апелляции — окончательный

export const MAX_EVENT_TEXT = 300 // условие, «как проверяем», уточнение, причина отмены и возражения
export const MAX_OUTCOME = 40
export const MIN_OUTCOMES = 2
export const MAX_OUTCOMES = 6 // своих; «Другое» сверху

export const YES = 'Да'
export const NO = 'Нет'
// К своим исходам сервер добавляет последним (Р-16): список исходов полон всегда
export const OTHER = 'Другое (ничего из перечисленного)'

export const NEED_CONDITION = 'Нужно условие'
export const LONG_CONDITION = `Условие — не длиннее ${MAX_EVENT_TEXT} знаков`
export const NEED_CHECK = 'Нужно «Как проверяем»'
export const LONG_CHECK = `«Как проверяем» — не длиннее ${MAX_EVENT_TEXT} знаков`
export const BAD_OUTCOMES = `Своих исходов — от ${MIN_OUTCOMES} до ${MAX_OUTCOMES}`
export const NEED_OUTCOME = 'Исход не может быть пустым'
export const LONG_OUTCOME = `Исход — не длиннее ${MAX_OUTCOME} знаков`
export const SAME_OUTCOMES = 'Исходы повторяются — сделайте их разными'
export const NEED_TIMES = 'Нужны сроки: «приём ставок до» и «исход ожидается к»'
export const CLOSE_PASSED = 'Срок «приём ставок до» уже прошёл — выберите время позже'
export const EXPECTED_EARLY = '«Исход ожидается к» не может быть раньше, чем «приём ставок до»'
export const BAD_SUBJECT = 'Предмет спора — участник комнаты'
export const BAD_AMOUNT = 'Сумма — целое число больше нуля'
export const NEED_CLARIFICATION = 'Нужен текст уточнения'
export const LONG_CLARIFICATION = `Уточнение — не длиннее ${MAX_EVENT_TEXT} знаков`
export const NEED_REASON = 'Нужна причина отмены'
export const LONG_REASON = `Причина — не длиннее ${MAX_EVENT_TEXT} знаков`
export const NEED_OBJECTION = 'Нужна причина возражения'
export const LONG_OBJECTION = `Причина возражения — не длиннее ${MAX_EVENT_TEXT} знаков`

export type EventOutcome = EventInfo['outcomes'][number]

// Проверенная форма события: исходы — уже полным списком с номерами
export type EventInput = {
  condition: string
  check: string
  outcomes: EventOutcome[]
  closesAt: number
  expectedAt: number
  subject: string | null
}

type Checked<T> = { ok: true; value: T } | { ok: false; error: string }

// Длина — в знаках, а не в единицах UTF-16: эмодзи — один знак
function length(s: string): number {
  return [...s].length
}

// Для сравнения исходов: без учёта регистра и пробелов по краям
function outcomeKey(title: string): string {
  return title.trim().toLowerCase()
}

function text(x: unknown, need: string, long: string): Checked<string> {
  const s = typeof x === 'string' ? x.trim() : ''
  if (!s) return { ok: false, error: need }
  if (length(s) > MAX_EVENT_TEXT) return { ok: false, error: long }
  return { ok: true, value: s }
}

// Исходы: не заданы (нет или пустой список) — «Да» и «Нет»; свои — 2–6, каждый ≤ 40 знаков,
// без повторов, и последним — «Другое»
export function checkOutcomes(x: unknown): Checked<EventOutcome[]> {
  const titles = x === undefined || x === null || (Array.isArray(x) && x.length === 0) ? null : x
  const numbered = (list: string[]) => list.map((title, i) => ({ id: String(i + 1), title }))
  if (titles === null) return { ok: true, value: numbered([YES, NO]) }
  if (!Array.isArray(titles) || titles.length < MIN_OUTCOMES || titles.length > MAX_OUTCOMES) {
    return { ok: false, error: BAD_OUTCOMES }
  }
  const own: string[] = []
  for (const t of titles) {
    const title = typeof t === 'string' ? t.trim() : ''
    if (!title) return { ok: false, error: NEED_OUTCOME }
    if (length(title) > MAX_OUTCOME) return { ok: false, error: LONG_OUTCOME }
    own.push(title)
  }
  const all = [...own, OTHER]
  if (new Set(all.map(outcomeKey)).size !== all.length) return { ok: false, error: SAME_OUTCOMES }
  return { ok: true, value: numbered(all) }
}

// Проверка формы события без времени сервера (его проверяет checkEventTimes)
export function checkEventInput(x: {
  condition: unknown
  check: unknown
  outcomes: unknown
  closesAt: unknown
  expectedAt: unknown
  subject: unknown
}): Checked<EventInput> {
  const condition = text(x.condition, NEED_CONDITION, LONG_CONDITION)
  if (!condition.ok) return condition
  const check = text(x.check, NEED_CHECK, LONG_CHECK)
  if (!check.ok) return check
  const outcomes = checkOutcomes(x.outcomes)
  if (!outcomes.ok) return outcomes
  if (!Number.isSafeInteger(x.closesAt) || !Number.isSafeInteger(x.expectedAt)) return { ok: false, error: NEED_TIMES }
  if (x.subject !== undefined && x.subject !== null && (typeof x.subject !== 'string' || !x.subject)) {
    return { ok: false, error: BAD_SUBJECT }
  }
  return {
    ok: true,
    value: {
      condition: condition.value,
      check: check.value,
      outcomes: outcomes.value,
      closesAt: x.closesAt as number,
      expectedAt: x.expectedAt as number,
      subject: typeof x.subject === 'string' ? x.subject : null,
    },
  }
}

// Сроки по времени сервера: «приём до» — ещё впереди, «исход к» — не раньше него. Ошибки нет — null
export function checkEventTimes(input: { closesAt: number; expectedAt: number }, now: number): string | null {
  if (input.closesAt <= now) return CLOSE_PASSED
  if (input.expectedAt < input.closesAt) return EXPECTED_EARLY
  return null
}

// Сумма ставки: целое > 0 в минимальных единицах, не больше безопасного целого
export function checkAmount(x: unknown): Checked<number> {
  return Number.isSafeInteger(x) && (x as number) > 0 ? { ok: true, value: x as number } : { ok: false, error: BAD_AMOUNT }
}

export function checkClarification(x: unknown): Checked<string> {
  return text(x, NEED_CLARIFICATION, LONG_CLARIFICATION)
}

// Причина отмены: не задана — null; задана — не длиннее 300 знаков
export function checkReason(x: unknown): Checked<string | null> {
  if (x === undefined || x === null || (typeof x === 'string' && !x.trim())) return { ok: true, value: null }
  if (typeof x !== 'string') return { ok: false, error: NEED_REASON }
  return text(x, NEED_REASON, LONG_REASON)
}

// Причина возражения: не пустая, не длиннее 300 знаков
export function checkObjection(x: unknown): Checked<string> {
  return text(x, NEED_OBJECTION, LONG_OBJECTION)
}

type CreatedEntry = Extract<LogEntry, { type: 'event.created' }>

type Requested<T> = T & { requestId: string }

// Событие из журнала. requestId — только для сервера (узнать повтор), наружу не идёт.
// hostId — ведущий комнаты; members — участники комнаты на миг первого возражения (из них —
// голосующие), до возражения — пусто
export type EventState = EventInfo & {
  requestId: string
  clarifications: Clarification[]
  bets: Requested<BetInfo>[]
  cancelled: Cancellation | null
  hostId: string
  proposal: Requested<OutcomeMark> | null
  objections: Requested<Objection>[]
  decision: Requested<OutcomeMark> | null
  votes: Requested<OutcomeMark>[]
  members: string[]
}

type OutcomeEntry = Extract<LogEntry, { type: 'outcome.proposed' | 'outcome.decided' | 'outcome.voted' }>

function markOf(e: OutcomeEntry): Requested<OutcomeMark> {
  return { id: e.id, at: e.at, by: e.memberId, outcome: e.outcome, requestId: e.requestId }
}

// События комнаты из журнала по порядку создания. Записи о неизвестном событии не действуют;
// отмена, предложение исхода, решение ведущего — первые; возражение и голос — первые от участника;
// возражение — только после предложения, решение и голос — только после возражения
export function roomEvents(log: readonly LogEntry[]): EventState[] {
  const events = new Map<string, EventState>()
  const members: string[] = []
  let hostId = ''
  for (const e of log) {
    if (e.type === 'room.created' && !hostId) hostId = e.memberId
    if (e.type === 'member.added' && !members.includes(e.member)) members.push(e.member)
    if (e.type === 'event.created') {
      if (!events.has(e.id)) {
        events.set(e.id, {
          ...eventInfo(e),
          requestId: e.requestId,
          clarifications: [],
          bets: [],
          cancelled: null,
          hostId: '',
          proposal: null,
          objections: [],
          decision: null,
          votes: [],
          members: [],
        })
      }
      continue
    }
    if (!('event' in e)) continue
    const ev = events.get(e.event)
    if (!ev) continue
    switch (e.type) {
      case 'bet.placed':
        ev.bets.push({ ...betOf(e), requestId: e.requestId })
        break
      case 'event.clarified':
        ev.clarifications.push({ id: e.id, at: e.at, text: e.text })
        break
      case 'event.cancelled':
        if (!ev.cancelled) ev.cancelled = { at: e.at, by: e.memberId, reason: e.reason }
        break
      case 'outcome.proposed':
        if (!ev.proposal) ev.proposal = markOf(e)
        break
      case 'outcome.objected':
        if (!ev.proposal || ev.objections.some((o) => o.by === e.memberId)) break
        if (ev.objections.length === 0) ev.members = [...members]
        ev.objections.push({ id: e.id, at: e.at, by: e.memberId, reason: e.reason, requestId: e.requestId })
        break
      case 'outcome.decided':
        if (ev.objections.length > 0 && !ev.decision) ev.decision = markOf(e)
        break
      case 'outcome.voted':
        if (ev.objections.length > 0 && !ev.votes.some((v) => v.by === e.memberId)) ev.votes.push(markOf(e))
        break
    }
  }
  for (const ev of events.values()) ev.hostId = hostId
  return [...events.values()]
}

export function eventInfo(e: CreatedEntry): EventInfo {
  return {
    id: e.id,
    at: e.at,
    authorId: e.memberId,
    condition: e.condition,
    check: e.check,
    outcomes: e.outcomes,
    closesAt: e.closesAt,
    expectedAt: e.expectedAt,
    subjectId: e.subject,
  }
}

// Статус по времени сервера: приём закрывается в срок, даже если сервер в этот миг лежал
export function eventStatus(e: { closesAt: number; cancelled: Cancellation | null }, now: number): EventStatus {
  if (e.cancelled) return 'cancelled'
  return now >= e.closesAt ? 'closed' : 'open'
}

export function poolBets(e: EventState): PoolBet[] {
  return e.bets.map((b) => ({ memberId: b.memberId, outcome: b.outcome, amount: b.amount, at: b.at }))
}

// Банк события — сумма ставок
export function eventBank(e: EventState): number {
  return e.bets.reduce((s, b) => s + b.amount, 0)
}

// Возврат при отмене — расчёт пула «без игры» (pool.ts): каждому его сумма
export function eventRefunds(e: EventState): { memberId: string; amount: number }[] {
  if (!e.cancelled) return []
  return settlePool(poolBets(e), null).payouts.map((p) => ({ memberId: p.memberId, amount: p.payout }))
}

// Ставил ли участник на событие
export function betOn(e: EventState, memberId: string): boolean {
  return e.bets.some((b) => b.memberId === memberId)
}

// Возражение решает ведущий, если сам не ставил и не предмет спора; иначе — голосование (Р-17)
export function hostDecides(e: EventState): boolean {
  return !betOn(e, e.hostId) && e.subjectId !== e.hostId
}

// Голосующие: участники на миг первого возражения, кто не ставил и не предмет спора.
// Возражения нет или решает ведущий — никого
export function eventVoters(e: EventState): string[] {
  if (e.objections.length === 0 || hostDecides(e)) return []
  return e.members.filter((m) => !betOn(e, m) && m !== e.subjectId)
}

// Может ли участник предложить исход на now (приём уже закрыт — проверяет вызывающий):
// автор, если он не предмет спора; ведущий — если автор предмет спора или молчит 3 дня после
// «исход ожидается к»; предмет спора — никогда
export function mayPropose(e: EventState, memberId: string, now: number): boolean {
  if (memberId === e.subjectId) return false
  if (memberId === e.authorId) return true
  return memberId === e.hostId && (e.authorId === e.subjectId || now >= e.expectedAt + AUTHOR_SILENCE)
}

export function markOut(m: OutcomeMark): OutcomeMark {
  return { id: m.id, at: m.at, by: m.by, outcome: m.outcome }
}

export function objectionOut(o: Objection): Objection {
  return { id: o.id, at: o.at, by: o.by, reason: o.reason }
}

// Победитель голосования — исход с большинством поданных голосов; ничья или голосов нет — null
export function voteWinner(votes: readonly OutcomeMark[]): string | null {
  const count = new Map<string, number>()
  for (const v of votes) count.set(v.outcome, (count.get(v.outcome) ?? 0) + 1)
  const top = Math.max(0, ...count.values())
  const leaders = [...count].filter(([, n]) => n === top)
  return top > 0 && leaders.length === 1 ? leaders[0][0] : null
}

// Исход события на now (время сервера) — из журнала, без будильника: «утверждён сам» через сутки
// без возражения, голосование кончается через 72 часа или когда проголосовали все, «окончательный» —
// через 7 дней после утверждения. Не предложен — null. Отменённое событие — без выплат (возврат —
// eventRefunds)
export function eventOutcome(e: EventState, now: number): OutcomeView | null {
  const p = e.proposal
  if (!p) return null
  const objectionUntil = p.at + OBJECTION_TIME
  const voters = eventVoters(e)
  let status: OutcomeView['status'] = 'proposed'
  let approved: Approval | null = null
  let votingUntil: number | null = null
  let votes: OutcomeMark[] = []
  if (e.objections.length === 0) {
    if (now >= objectionUntil) approved = { outcome: p.outcome, at: objectionUntil, how: 'unopposed', by: null }
  } else if (hostDecides(e)) {
    status = 'disputed'
    if (e.decision) approved = { outcome: e.decision.outcome, at: e.decision.at, how: 'host', by: e.decision.by }
  } else {
    const start = e.objections[0].at
    const until = start + VOTING_TIME
    votingUntil = until
    votes = e.votes.filter((v) => voters.includes(v.by) && v.at < until).map(markOut)
    // Конец голосования: проголосовали все (или некому голосовать) — сразу; иначе — через 72 часа
    const end = votes.length === voters.length ? (votes.at(-1)?.at ?? start) : now >= until ? until : null
    status = 'voting'
    if (end !== null) {
      const winner = voteWinner(votes)
      if (winner === null) status = 'court'
      else approved = { outcome: winner, at: end, how: 'vote', by: null }
    }
  }
  let settled: ReturnType<typeof settlePool> | null = null
  if (approved) {
    status = now >= approved.at + FINAL_TIME ? 'final' : 'approved'
    if (!e.cancelled) settled = settlePool(poolBets(e), approved.outcome)
  }
  return {
    status,
    proposal: markOut(p),
    objectionUntil,
    objections: e.objections.map(objectionOut),
    decision: e.decision ? markOut(e.decision) : null,
    voters,
    votingUntil,
    votes,
    approved,
    finalAt: approved ? approved.at + FINAL_TIME : null,
    void: settled?.void ?? false,
    payouts: settled?.payouts ?? [],
  }
}

// Неизменная часть события — без ставок, уточнений и номера запроса
export function infoOf(e: EventInfo): EventInfo {
  return {
    id: e.id,
    at: e.at,
    authorId: e.authorId,
    condition: e.condition,
    check: e.check,
    outcomes: e.outcomes,
    closesAt: e.closesAt,
    expectedAt: e.expectedAt,
    subjectId: e.subjectId,
  }
}

// Ставка без номера запроса
export function betOf(b: BetInfo): BetInfo {
  return { id: b.id, event: b.event, memberId: b.memberId, outcome: b.outcome, amount: b.amount, at: b.at }
}

// Событие для ответа GET /rooms/<номер>: без номеров запросов, со статусом на now
export function eventView(e: EventState, now: number): EventView {
  return {
    ...infoOf(e),
    status: eventStatus(e, now),
    clarifications: e.clarifications,
    bets: e.bets.map((b) => ({ id: b.id, memberId: b.memberId, outcome: b.outcome, amount: b.amount, at: b.at })),
    cancelled: e.cancelled,
    refunds: eventRefunds(e),
    outcome: eventOutcome(e, now),
  }
}

// Повтор создания: тот же автор и та же форма
export function sameEvent(e: EventState, memberId: string, input: EventInput): boolean {
  return (
    e.authorId === memberId &&
    e.condition === input.condition &&
    e.check === input.check &&
    e.closesAt === input.closesAt &&
    e.expectedAt === input.expectedAt &&
    e.subjectId === input.subject &&
    JSON.stringify(e.outcomes) === JSON.stringify(input.outcomes)
  )
}
