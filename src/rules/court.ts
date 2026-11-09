// Суд (этап 4, Р-05, Р-24; Архитектура, «Правила апелляции в коде»): жребий по зерну сервера, места
// суда со сроками и заменой, голоса и решение — на время now, без будильника. Здесь — только сам суд:
// кто кому подаёт и кого судят — appeal.ts; учёт решения в исходе — eventOutcome (event.ts) и
// offerOutcome (offer.ts). Отдельным модулем, чтобы event.ts и offer.ts не зависели от appeal.ts.
// Ни DOM, ни Cloudflare
import type { AppealView, CourtSeat, CourtVerdict, CourtView, CourtVote } from './protocol'

const HOUR = 60 * 60 * 1000
// У места — 72 часа с жребия (у заменившего — с замены)
export const SEAT_TIME = 72 * HOUR
// Мест в суде: ведущий + 2 присяжных или 3 присяжных
export const COURT_SIZE = 3

export type { CourtSeat, CourtVerdict, CourtView, CourtVote }

// Досрочная замена ведущим: кто, когда, кого и почему
export type CourtReplace = { id: string; at: number; by: string; member: string; reason: string }

// Дело суда: апелляция (null — суд по «ждёт суда» без апелляции, Р-17) и жребий; acts — принятые
// голоса и досрочные замены по порядку журнала. Собирает roomAppeals (appeal.ts)
export type CourtCase = {
  target: string // событие или пари
  appeal: {
    id: string
    at: number
    by: string
    reason: string
    joined: { id: string; at: number; by: string }[]
  } | null
  seed: string
  candidates: string[] // как в записи
  drawnAt: number
  hostId: string
  acts: ({ type: 'vote' } & CourtVote | { type: 'replace' } & CourtReplace)[]
}

// 32 бита: FNV-1a по кодам знаков строки, затем перемешивание fmix32 (как в MurmurHash3)
export function courtHash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

function byId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// Порядок жребия: кандидаты (без повторов) по возрастанию courtHash(зерно + ':' + номер), равные — по
// номеру; ведущий-кандидат — первым. Суд — первые COURT_SIZE, дальше — запасные по порядку
export function drawCourt(seed: string, candidates: readonly string[], hostId: string): string[] {
  const unique = [...new Set(candidates)]
  const rest = unique.filter((m) => m !== hostId)
  const key = new Map(rest.map((m) => [m, courtHash(`${seed}:${m}`)]))
  rest.sort((a, b) => (key.get(a) as number) - (key.get(b) as number) || byId(a, b))
  return unique.includes(hostId) ? [hostId, ...rest] : rest
}

export type CourtState = {
  order: string[]
  seats: CourtSeat[]
  decidedAt: number | null // все места проголосовали или их сроки прошли
}

// Когда место отработало: голос, место пустое или срок заменившего прошёл. Срок первого прошёл, а
// замены ещё не было — не отработало: место ждёт замены
function seatDone(s: CourtSeat, now: number): number | null {
  if (s.vote) return s.vote.at
  if (s.member === null) return s.replaced?.at ?? s.since
  return s.replaced && now >= s.until ? s.until : null
}

// Места суда на now. Член суда молчит 72 часа — место переходит к следующему по порядку запасному
// (одна замена на место; досрочная ведущим — тоже замена), у него свои 72 часа; запасные кончились —
// место пустое. Замены по срокам — по времени, равные — по номеру места; запись (голос, досрочная
// замена) применяется после замен по срокам на её время
export function courtState(c: CourtCase, now: number): CourtState {
  const order = drawCourt(c.seed, c.candidates, c.hostId)
  const seats: CourtSeat[] = order.slice(0, COURT_SIZE).map((member) => ({
    member,
    since: c.drawnAt,
    until: c.drawnAt + SEAT_TIME,
    replaced: null,
    vote: null,
  }))
  let next = seats.length
  const replace = (s: CourtSeat, at: number, by: string | null, reason: string | null) => {
    const member = next < order.length ? order[next++] : null
    s.replaced = { member: s.member as string, at, by, reason }
    s.member = member
    s.since = at
    s.until = member === null ? at : at + SEAT_TIME
  }
  const decided = (t: number) => seats.every((s) => seatDone(s, t) !== null)
  const advance = (t: number) => {
    for (;;) {
      if (decided(t)) return
      const due = seats
        .filter((s) => s.member !== null && !s.vote && !s.replaced && s.until <= t)
        .sort((a, b) => a.until - b.until)[0]
      if (!due) return
      replace(due, due.until, null, null)
    }
  }
  for (const a of c.acts) {
    if (a.at > now) break
    advance(a.at)
    const s = seats.find((x) => x.member === (a.type === 'vote' ? a.by : a.member))
    if (!s) continue
    if (a.type === 'vote') s.vote = voteOut(a)
    else replace(s, a.at, a.by, a.reason)
  }
  advance(now)
  const done = seats.map((s) => seatDone(s, now))
  const decidedAt = done.every((t) => t !== null) ? Math.max(c.drawnAt, ...(done as number[])) : null
  return { order, seats, decidedAt }
}

function voteOut(v: CourtVote): CourtVote {
  const base = { id: v.id, at: v.at, by: v.by }
  if (v.verdict !== 'change') return { ...base, verdict: v.verdict }
  return 'outcome' in v ? { ...base, verdict: 'change', outcome: v.outcome } : { ...base, verdict: 'change', winner: v.winner }
}

function verdictKey(v: CourtVerdict): string {
  if (v.verdict !== 'change') return v.verdict
  return 'outcome' in v ? `outcome:${v.outcome}` : `winner:${v.winner}`
}

function verdictOf(v: CourtVerdict): CourtVerdict {
  if (v.verdict !== 'change') return { verdict: v.verdict }
  return 'outcome' in v ? { verdict: 'change', outcome: v.outcome } : { verdict: 'change', winner: v.winner }
}

export type CourtDecision = NonNullable<CourtView['decision']>

// Решение суда на now: суд кончился (courtState) — вариант строгого большинства поданных голосов;
// большинства нет — у апелляции исход остаётся («оставить»), у «ждёт суда» — отмена. Не кончился — null
export function courtVerdict(c: CourtCase, now: number): CourtDecision | null {
  const { seats, decidedAt } = courtState(c, now)
  if (decidedAt === null) return null
  const votes = seats.flatMap((s) => (s.vote ? [s.vote] : []))
  const count = new Map<string, { n: number; v: CourtVerdict }>()
  for (const v of votes) {
    const k = verdictKey(v)
    count.set(k, { n: (count.get(k)?.n ?? 0) + 1, v })
  }
  const top = [...count.values()].find((x) => x.n * 2 > votes.length)
  if (top) return { at: decidedAt, majority: true, ...verdictOf(top.v) }
  return { at: decidedAt, majority: false, verdict: c.appeal ? 'keep' : 'cancel' }
}

// Суд для ответа: зерно, порядок жребия, места на now, решение
export function courtView(c: CourtCase, now: number): CourtView {
  const { order, seats } = courtState(c, now)
  return { seed: c.seed, drawnAt: c.drawnAt, candidates: order, seats, decision: courtVerdict(c, now) }
}

// Апелляция для ответа
export function appealView(c: CourtCase): AppealView | null {
  const a = c.appeal
  return a && { id: a.id, at: a.at, by: a.by, reason: a.reason, joined: a.joined.map((j) => ({ id: j.id, at: j.at, by: j.by })) }
}
