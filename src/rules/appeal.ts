// Апелляция и суд (этап 4, Р-05, Р-17, Р-21, Р-24; Архитектура, «Правила апелляции в коде»): кто
// подаёт и присоединяется, кто судит, голос, досрочная замена и свёртка записей AppealRecord (автор,
// время сервера at, порядок — порядок журнала) в дела суда CourtCase. Жребий, места и решение — court.ts;
// учёт решения в исходе — eventOutcome (event.ts) и offerOutcome (offer.ts). Журнала комнаты здесь
// нет: записи appeal.* и court.* в нём — задача сервера. Ни DOM, ни Cloudflare
import { courtState, courtVerdict, type CourtCase } from './court'
import { eventBettors, eventOutcome, MAX_EVENT_TEXT, type EventState } from './event'
import { offerOutcome, type OfferSide, type OfferState } from './offer'
import type { CourtVerdict } from './protocol'

export { COURT_SIZE, SEAT_TIME, courtHash, courtState, courtVerdict, courtView, drawCourt, type CourtCase } from './court'

// Подать
export const NEED_APPEAL = 'Нужна причина апелляции'
export const LONG_APPEAL = `Причина апелляции — не длиннее ${MAX_EVENT_TEXT} знаков`
export const NOT_BETTOR = 'Апелляцию подаёт тот, кто ставил на событие'
export const AGREED_BETTOR = 'Вы согласились с исходом — апелляцию не подаёте'
export const NOT_SIDE = 'Апелляцию подаёт сторона пари'
export const APPEAL_EXISTS = 'Апелляция уже подана — присоединитесь к ней'
export const NOT_APPROVED = 'Исход ещё не утверждён — апелляция после утверждения'
export const AGREED_FINAL = 'Исход утверждён согласием — он окончательный, апелляции нет'
export const FINAL = 'Исход уже окончательный: 7 дней на апелляцию прошли'
export const CANCELLED = 'Событие отменено — апелляции нет'
export const NO_JUDGES = 'В комнате некому судить: все участники заинтересованы'
// Присоединиться
export const NO_APPEAL = 'Апелляции нет — присоединяться не к чему'
export const OWN_APPEAL = 'Апелляцию подали вы — присоединяться не нужно'
export const ALREADY_JOINED = 'Вы уже присоединились к апелляции'
export const COURT_DECIDED = 'Суд уже решил — решение окончательное'
// Суд без апелляции
export const NOT_COURT = 'Суд без апелляции собирается, только когда исход «ждёт суда»'
export const COURT_EXISTS = 'Суд уже собран'
export const BAD_SEED = 'Зерно жребия — шестнадцатеричные цифры'
export const BAD_CANDIDATES = 'Кандидаты в суд — участники комнаты без заинтересованных'
// Голос
export const NOT_JUROR = 'Голосует только член суда на своём месте'
export const SEAT_LAPSED = 'Срок вашего места в суде прошёл'
export const VOTED = 'Вы уже проголосовали — голос не меняется'
export const BAD_VERDICT = 'Голос — «оставить», «изменить на …» или «отменить — вернуть ставки»'
export const NO_KEEP = 'Исход не утверждён — «оставить» нечего'
export const SAME_CHANGE = 'Изменить можно только на другой исход'
// Досрочная замена
export const ONLY_HOST = 'Досрочно заменить члена суда может только ведущий'
export const HOST_INTERESTED = 'Ведущий заинтересован в споре — досрочной замены нет'
export const OWN_SEAT = 'Себя не заменяют'
export const NOT_SEAT = 'Такого члена суда нет'
export const VOTED_NO_REPLACE = 'Член суда уже проголосовал — замена не нужна'
export const ALREADY_REPLACED = 'Место уже меняли — одна замена на место'
export const NEED_REPLACE = 'Нужна причина замены'
export const LONG_REPLACE = `Причина замены — не длиннее ${MAX_EVENT_TEXT} знаков`

type Checked<T> = { ok: true; value: T } | { ok: false; error: string }

// Что обжалуют: событие-пул или пари
export type AppealTarget = { kind: 'event'; event: EventState } | { kind: 'offer'; offer: OfferState }

// Ведущий и участники комнаты с мигом, когда впущены: кандидаты в суд — участники на миг жребия
export type CourtRoom = { hostId: string; members: readonly { id: string; addedAt: number }[] }

// Записи апелляции и суда — как будут в журнале комнаты: memberId — автор записи, at — время сервера,
// target — событие или пари. Зерно — случайные байты сервера (hex); candidates — кандидаты на миг жребия
type Act<T extends string, X = object> = { type: T; id: string; at: number; memberId: string; target: string } & X
export type AppealRecord =
  | Act<'appeal.filed', { reason: string; seed: string; candidates: string[] }> // ставивший или сторона
  | Act<'appeal.joined'>
  | Act<'court.drawn', { seed: string; candidates: string[] }> // суд по «ждёт суда»; автор не проверяется
  | Act<'court.voted', CourtVerdict> // член суда
  | Act<'court.replaced', { member: string; reason: string }> // ведущий

function text(x: unknown, need: string, long: string): Checked<string> {
  const s = typeof x === 'string' ? x.trim() : ''
  if (!s) return { ok: false, error: need }
  if ([...s].length > MAX_EVENT_TEXT) return { ok: false, error: long }
  return { ok: true, value: s }
}

// Причина апелляции: не пустая, ≤ 300 знаков
export function appealReason(x: unknown): Checked<string> {
  return text(x, NEED_APPEAL, LONG_APPEAL)
}

// Причина досрочной замены: не пустая, ≤ 300 знаков
export function replaceReason(x: unknown): Checked<string> {
  return text(x, NEED_REPLACE, LONG_REPLACE)
}

type Stage = 'open' | 'court' | 'approved' | 'agreed' | 'final' | 'cancelled'

// Спор на now без суда: на каком он шаге, что утверждено, варианты «изменить на …», кто заинтересован
// и почему участник не может подать апелляцию (может — null)
type Dispute = {
  stage: Stage
  approved: string | null // исход пула или сторона пари
  choices: string[]
  interested: string[]
  cannotAppeal: (memberId: string) => string | null
}

function dispute(t: AppealTarget, now: number): Dispute {
  if (t.kind === 'event') {
    const e = t.event
    const out = eventOutcome(e, now)
    const a = out?.approved ?? null
    const stage: Stage = !out
      ? 'open'
      : out.status === 'cancelled'
        ? 'cancelled'
        : out.status === 'court'
          ? 'court'
          : !a
            ? 'open'
            : a.how === 'agreed'
              ? 'agreed'
              : out.status === 'final'
                ? 'final'
                : 'approved'
    const bettors = eventBettors(e)
    const agreed = new Set((out?.agreements ?? []).map((x) => x.by))
    const interested = [...bettors, e.authorId]
    if (e.subjectId !== null) interested.push(e.subjectId)
    // Ведущий, решивший возражение, заинтересован, как гарант (Р-24)
    if (e.decision) interested.push(e.decision.by)
    return {
      stage,
      approved: a?.outcome ?? null,
      choices: e.outcomes.map((o) => o.id),
      interested,
      cannotAppeal: (m) => (!bettors.includes(m) ? NOT_BETTOR : agreed.has(m) ? AGREED_BETTOR : null),
    }
  }
  const o = t.offer
  const out = offerOutcome(o, now)
  const a = out?.approved ?? null
  const stage: Stage = !a ? 'open' : a.how === 'agreement' ? 'agreed' : out?.phase === 'final' ? 'final' : 'approved'
  const sides = o.accepted ? [o.authorId, o.accepted.by] : [o.authorId]
  return {
    stage,
    approved: a?.winner ?? null,
    choices: ['author', 'taker'],
    interested: [...sides, o.guarantorId],
    cannotAppeal: (m) => (sides.includes(m) && o.accepted ? null : NOT_SIDE),
  }
}

function targetId(t: AppealTarget): string {
  return t.kind === 'event' ? t.event.id : t.offer.id
}

// Кандидаты в суд на миг at: участники комнаты, впущенные к этому мигу, кроме заинтересованных — у
// пула: ставившие, автор, предмет спора, ведущий, решивший возражение; у пари: стороны и нынешний
// гарант; и кроме also — подавшего и присоединившихся (они и так ставившие или стороны). Голосовавшие
// по возражению (Р-17) — кандидаты. Порядок — участников комнаты
export function courtCandidates(t: AppealTarget, room: CourtRoom, at: number, also: readonly string[] = []): string[] {
  const out = new Set([...dispute(t, at).interested, ...also])
  return [...new Set(room.members.filter((m) => m.addedAt <= at).map((m) => m.id))].filter((m) => !out.has(m))
}

// Подать апелляцию на now: исход утверждён, но не согласием и ещё не окончательный (7 дней с
// утверждения); у пула — ставивший, кроме согласившихся (Р-21), у пари — сторона; одна на событие или
// пари; причина — не пустая, ≤ 300 знаков; есть кому судить. existing — дело суда по цели или null
export function checkAppeal(
  t: AppealTarget,
  existing: CourtCase | null,
  memberId: string,
  reason: unknown,
  room: CourtRoom,
  now: number,
): string | null {
  const d = dispute(t, now)
  const who = d.cannotAppeal(memberId)
  if (who) return who
  if (existing?.appeal) return APPEAL_EXISTS
  if (d.stage === 'cancelled') return CANCELLED
  if (d.stage === 'agreed') return AGREED_FINAL
  if (d.stage === 'final') return FINAL
  // Суд по «ждёт суда» решил — решение окончательное, второй апелляции нет
  if (existing) return courtVerdict(existing, now) ? COURT_DECIDED : NOT_APPROVED
  if (d.stage !== 'approved') return NOT_APPROVED
  const r = appealReason(reason)
  if (!r.ok) return r.error
  if (courtCandidates(t, room, now, [memberId]).length === 0) return NO_JUDGES
  return null
}

// Присоединиться: тот, кто мог бы подать, кроме подавшего; один раз; до решения суда
export function checkJoin(t: AppealTarget, c: CourtCase | null, memberId: string, now: number): string | null {
  if (!c?.appeal) return NO_APPEAL
  const who = dispute(t, now).cannotAppeal(memberId)
  if (who) return who
  if (memberId === c.appeal.by) return OWN_APPEAL
  if (c.appeal.joined.some((j) => j.by === memberId)) return ALREADY_JOINED
  if (courtVerdict(c, now)) return COURT_DECIDED
  return null
}

// Суд без апелляции: исход пула «ждёт суда» (ничья или некому голосовать, Р-17) — суд собирается сам
export function checkCourtDraw(t: AppealTarget, existing: CourtCase | null, now: number): string | null {
  if (existing) return COURT_EXISTS
  if (t.kind !== 'event' || dispute(t, now).stage !== 'court') return NOT_COURT
  return null
}

// Голос суда из запроса: «оставить», «отменить» или «изменить» — у пула с outcome, у пари с winner
export function courtVote(x: unknown, kind: AppealTarget['kind']): Checked<CourtVerdict> {
  const r = typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {}
  if (r.verdict === 'keep' || r.verdict === 'cancel') return { ok: true, value: { verdict: r.verdict } }
  if (r.verdict === 'change' && kind === 'event' && typeof r.outcome === 'string') {
    return { ok: true, value: { verdict: 'change', outcome: r.outcome } }
  }
  if (r.verdict === 'change' && kind === 'offer' && (r.winner === 'author' || r.winner === 'taker')) {
    return { ok: true, value: { verdict: 'change', winner: r.winner as OfferSide } }
  }
  return { ok: false, error: BAD_VERDICT }
}

// Голос: только член суда на своём месте (в его 72 часа), один раз, не меняется; «оставить» — если
// исход утверждён (апелляция); «изменить на …» — другой исход события или другая сторона пари
export function checkCourtVote(t: AppealTarget, c: CourtCase, memberId: string, vote: unknown, now: number): string | null {
  const v = courtVote(vote, t.kind)
  if (!v.ok) return v.error
  if (courtVerdict(c, now)) return COURT_DECIDED
  const seat = courtState(c, now).seats.find((s) => s.member === memberId)
  if (!seat) return NOT_JUROR
  if (seat.vote) return VOTED
  if (now >= seat.until) return SEAT_LAPSED
  const d = dispute(t, now)
  const approved = c.appeal ? d.approved : null
  if (v.value.verdict === 'keep' && approved === null) return NO_KEEP
  if (v.value.verdict === 'change') {
    const choice = 'outcome' in v.value ? v.value.outcome : v.value.winner
    if (!d.choices.includes(choice)) return BAD_VERDICT
    if (choice === approved) return SAME_CHANGE
  }
  return null
}

// Досрочная замена: только ведущий, если он сам не заинтересован (его нет среди кандидатов);
// только не проголосовавшего на своём месте, не себя; одна замена на место; с причиной; до решения
export function checkReplace(c: CourtCase, memberId: string, member: unknown, reason: unknown, now: number): string | null {
  if (memberId !== c.hostId) return ONLY_HOST
  if (!c.candidates.includes(c.hostId)) return HOST_INTERESTED
  if (courtVerdict(c, now)) return COURT_DECIDED
  if (member === memberId) return OWN_SEAT
  const seat = courtState(c, now).seats.find((s) => s.member !== null && s.member === member)
  if (!seat || now >= seat.until) return NOT_SEAT
  if (seat.vote) return VOTED_NO_REPLACE
  if (seat.replaced) return ALREADY_REPLACED
  const r = replaceReason(reason)
  return r.ok ? null : r.error
}

// Жребий в записи appeal.filed / court.drawn: зерно — hex, кандидаты — те же, что courtCandidates на
// миг записи (порядок не важен: его задаёт drawCourt). Ошибки нет — null
export function checkDraw(seed: unknown, candidates: unknown, expected: readonly string[]): string | null {
  if (typeof seed !== 'string' || !/^[0-9a-f]+$/i.test(seed)) return BAD_SEED
  const same =
    Array.isArray(candidates) &&
    candidates.length === expected.length &&
    new Set(candidates).size === candidates.length &&
    candidates.every((m) => expected.includes(m))
  return same ? null : BAD_CANDIDATES
}

function verdictOf(v: CourtVerdict): CourtVerdict {
  if (v.verdict !== 'change') return { verdict: v.verdict }
  return 'outcome' in v ? { verdict: 'change', outcome: v.outcome } : { verdict: 'change', winner: v.winner }
}

// Дела суда комнаты из записей по порядку. Запись действует, если её разрешает та же проверка на её
// время at (как roomOffers): подача — checkAppeal и жребий (checkDraw) на миг подачи; суд по «ждёт
// суда» — checkCourtDraw; присоединение — checkJoin; голос — checkCourtVote; замена — checkReplace.
// Записи о неизвестном событии или пари не действуют. Исход цели — по уже собранному событию или пари
export function roomAppeals(
  records: readonly AppealRecord[],
  targets: { events: readonly EventState[]; offers: readonly OfferState[] },
  room: CourtRoom,
): CourtCase[] {
  const cases = new Map<string, CourtCase>()
  const find = (id: string): AppealTarget | null => {
    const event = targets.events.find((e) => e.id === id)
    if (event) return { kind: 'event', event }
    const offer = targets.offers.find((o) => o.id === id)
    return offer ? { kind: 'offer', offer } : null
  }
  for (const r of records) {
    const t = find(r.target)
    if (!t) continue
    const c = cases.get(targetId(t)) ?? null
    switch (r.type) {
      case 'appeal.filed': {
        if (checkAppeal(t, c, r.memberId, r.reason, room, r.at)) break
        if (checkDraw(r.seed, r.candidates, courtCandidates(t, room, r.at, [r.memberId]))) break
        const reason = appealReason(r.reason) as { ok: true; value: string }
        cases.set(targetId(t), {
          target: targetId(t),
          appeal: { id: r.id, at: r.at, by: r.memberId, reason: reason.value, joined: [] },
          seed: r.seed,
          candidates: [...r.candidates],
          drawnAt: r.at,
          hostId: room.hostId,
          acts: [],
        })
        break
      }
      case 'court.drawn':
        if (checkCourtDraw(t, c, r.at) || checkDraw(r.seed, r.candidates, courtCandidates(t, room, r.at))) break
        cases.set(targetId(t), {
          target: targetId(t),
          appeal: null,
          seed: r.seed,
          candidates: [...r.candidates],
          drawnAt: r.at,
          hostId: room.hostId,
          acts: [],
        })
        break
      case 'appeal.joined':
        if (!c?.appeal || checkJoin(t, c, r.memberId, r.at)) break
        c.appeal.joined.push({ id: r.id, at: r.at, by: r.memberId })
        break
      case 'court.voted':
        if (!c || checkCourtVote(t, c, r.memberId, r, r.at)) break
        c.acts.push({ type: 'vote', id: r.id, at: r.at, by: r.memberId, ...verdictOf(r) })
        break
      case 'court.replaced': {
        if (!c || checkReplace(c, r.memberId, r.member, r.reason, r.at)) break
        const reason = replaceReason(r.reason) as { ok: true; value: string }
        c.acts.push({ type: 'replace', id: r.id, at: r.at, by: r.memberId, member: r.member, reason: reason.value })
        break
      }
    }
  }
  return [...cases.values()]
}

// Дело суда по событию или пари из списка дел (roomAppeals); нет — null
export function caseOf(cases: readonly CourtCase[], target: string): CourtCase | null {
  return cases.find((c) => c.target === target) ?? null
}
