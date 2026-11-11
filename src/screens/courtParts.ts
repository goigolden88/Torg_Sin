// Апелляция и суд на сайте (этап 4, Р-05, Р-24, Р-25): вид с сервера → состояние для правил appeal.ts,
// чтобы кнопки решали те же проверки, что у сервера (checkAppeal, checkJoin, checkCourtVote,
// checkReplace), на часах сервера; и «вы в суде» — член суда, который ещё не голосовал. Считают
// правила, здесь — только перенос полей ответа. Без разметки: её — CourtBlock
import type { CourtCase, CourtRoom } from '../rules/appeal'
import type { EventState } from '../rules/event'
import type { AppealView, CourtView, EventView, OfferView } from '../rules/protocol'
import type { SavedRoom } from '../store/db'

type WithCourt = { appeal?: AppealView | null; court?: CourtView | null } | null

// Событие с сервера → состояние для правил: предложение, возражения, согласия, решение ведущего и голоса
// — из исхода; номера запросов сайту не приходят (пусто). Участники на миг первого возражения — это
// голосующие из ответа: eventVoters из них отберёт их же. Тогда eventOutcome на часах сервера даёт то же
// утверждение, что сервер, — от него checkAppeal узнаёт, можно ли подать
export function eventState(e: EventView, hostId: string): EventState {
  const o = e.outcome
  const req = <T>(x: T) => ({ ...x, requestId: '' })
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
    subjectRule: e.subjectRule,
    requestId: '',
    clarifications: e.clarifications,
    bets: e.bets.map((b) => ({ ...b, event: e.id, requestId: '' })),
    cancelled: e.cancelled,
    hostId,
    closedAt: e.closedAt ?? null,
    withdrawn: [], // снятые «ещё не известно» (Р-27) правилам апелляции не нужны
    proposal: o ? req(o.proposal) : null,
    objections: o ? o.objections.map(req) : [],
    agreements: o ? o.agreements.map(req) : [],
    decision: o?.decision ? req(o.decision) : null,
    votes: o ? o.votes.map(req) : [],
    members: o ? [...o.voters] : [],
  }
}

// Дело суда из ответа (appeal и court у исхода) → CourtCase для правил: зерно, кандидаты (порядок
// жребия — drawCourt даёт его же), миг жребия, ведущий; принятые записи — голоса мест и досрочные
// замены ведущим (замены по сроку courtState считает сам), по времени. Суда нет — null
export function courtCaseOf(target: string, out: WithCourt, hostId: string): CourtCase | null {
  const c = out?.court
  if (!c) return null
  const acts: CourtCase['acts'] = []
  for (const s of c.seats) {
    const r = s.replaced
    if (r && r.by !== null) acts.push({ type: 'replace', id: 'replace:' + r.member, at: r.at, by: r.by, member: r.member, reason: r.reason ?? '' })
    if (s.vote) acts.push({ type: 'vote', ...s.vote })
  }
  // По времени; в один миг замена — раньше голоса заменившего
  acts.sort((a, b) => a.at - b.at || (a.type === b.type ? 0 : a.type === 'replace' ? -1 : 1))
  const a = out?.appeal ?? null
  return {
    target,
    appeal: a && { id: a.id, at: a.at, by: a.by, reason: a.reason, joined: a.joined.map((j) => ({ id: j.id, at: j.at, by: j.by })) },
    seed: c.seed,
    candidates: [...c.candidates],
    drawnAt: c.drawnAt,
    hostId,
    acts,
  }
}

// Ведущий и участники комнаты для кандидатов в суд. Мига входа сайту не приходит: на «сейчас» впущены
// все нынешние участники — кандидатов на now (checkAppeal) это не меняет
export function courtRoomOf(room: SavedRoom): CourtRoom {
  return { hostId: room.hostId, members: room.members.map((m) => ({ id: m.id, addedAt: 0 })) }
}

// Участник — член суда, который ещё не голосовал, а суд не решил: «вы в суде». now — часы сервера
// (в комнате: срок места прошёл — уже не ждём); без now — по последнему ответу как есть («Мои комнаты»)
export function awaitsMyVote(out: WithCourt, me: string, now?: number): boolean {
  const c = out?.court
  if (!c || c.decision) return false
  return c.seats.some((s) => s.member === me && !s.vote && (now === undefined || now < s.until))
}

// В комнате на устройстве есть суд, где участник ещё не голосовал (события и пари последнего ответа)
export function roomAwaitsMyVote(room: SavedRoom, events: readonly EventView[], offers: readonly OfferView[]): boolean {
  return events.some((e) => awaitsMyVote(e.outcome, room.memberId)) || offers.some((o) => awaitsMyVote(o.outcome, room.memberId))
}
