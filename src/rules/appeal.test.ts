import { describe, expect, it } from 'vitest'
import {
  AGREED_BETTOR,
  AGREED_FINAL,
  ALREADY_JOINED,
  ALREADY_REPLACED,
  APPEAL_EXISTS,
  BAD_CANDIDATES,
  BAD_SEED,
  BAD_VERDICT,
  CANCELLED,
  COURT_DECIDED,
  COURT_EXISTS,
  FINAL,
  HOST_INTERESTED,
  LONG_APPEAL,
  LONG_REPLACE,
  NEED_APPEAL,
  NEED_REPLACE,
  NO_APPEAL,
  NO_JUDGES,
  NO_KEEP,
  NOT_APPROVED,
  NOT_BETTOR,
  NOT_COURT,
  NOT_JUROR,
  NOT_SEAT,
  NOT_SIDE,
  ONLY_HOST,
  OWN_APPEAL,
  OWN_SEAT,
  SAME_CHANGE,
  SEAT_TIME,
  VOTED,
  VOTED_NO_REPLACE,
  caseOf,
  checkAppeal,
  checkCourtDraw,
  checkCourtVote,
  checkDraw,
  checkJoin,
  checkReplace,
  courtCandidates,
  courtHash,
  courtState,
  courtVerdict,
  drawCourt,
  appealRecord,
  courtRoom as courtRoomOf,
  isAppealEntry,
  logAppeals,
  roomAppeals,
  type AppealRecord,
  type AppealTarget,
  type CourtCase,
  type CourtRoom,
} from './appeal'
import { eventOutcome, eventView, FINAL_TIME, OBJECTION_TIME, roomEvents, VOTING_TIME, type EventState } from './event'
import { offerOutcome, offerResult, offerView, roomOffers, type OfferRecord, type OfferState } from './offer'
import { isEventView, isOfferView, type CourtVerdict } from './protocol'
import { foldLog, type LogEntry, type RoomState } from './room'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const SEED = '9f3c51a07be2'

let seq = 0
const id = (p: string) => `${p}${++seq}`

// Пул: ведущий H; участники A (автор), B, C, D, E, F; приём до 2 000, исход к 3 000
function roomLog(members: string[]): LogEntry[] {
  return [
    { id: 'R', at: 0, memberId: 'H', type: 'room.created', roomId: 'R', name: 'Дача', currency: 'RUB' },
    ...members.map((m): LogEntry => ({ id: 'M' + m, at: 0, memberId: 'H', type: 'member.added', member: m, name: m })),
  ]
}
const MEMBERS = ['H', 'A', 'B', 'C', 'D', 'E', 'F']
const courtRoom = (members: string[], late: Record<string, number> = {}): CourtRoom => ({
  hostId: 'H',
  members: members.map((m) => ({ id: m, addedAt: late[m] ?? 0 })),
})
const ROOM = courtRoom(MEMBERS)

function created(subject: string | null = null): LogEntry {
  return {
    id: 'E1',
    at: 1_000,
    memberId: 'A',
    type: 'event.created',
    condition: 'Вася пробежит 10 км',
    check: 'Скрин из приложения',
    outcomes: [
      { id: '1', title: 'Да' },
      { id: '2', title: 'Нет' },
    ],
    closesAt: 2_000,
    expectedAt: 3_000,
    subject,
    requestId: 'Q0',
  }
}
const bet = (who: string, outcome: string, amount: number): LogEntry => ({
  id: 'B' + who + outcome,
  at: 1_500,
  memberId: who,
  type: 'bet.placed',
  event: 'E1',
  outcome,
  amount,
  requestId: 'QB' + who + outcome,
})
const P = 10_000
const propose = (who: string, outcome: string): LogEntry => ({ id: 'P' + who, at: P, memberId: who, type: 'outcome.proposed', event: 'E1', outcome, requestId: 'QP' })
const object = (who: string, at: number): LogEntry => ({ id: id('O'), at, memberId: who, type: 'outcome.objected', event: 'E1', reason: 'Не так', requestId: id('QO') })
const agree = (who: string, at: number): LogEntry => ({ id: id('G'), at, memberId: who, type: 'outcome.agreed', event: 'E1', requestId: id('QG') })
const decideEv = (who: string, outcome: string, at: number): LogEntry => ({ id: id('D'), at, memberId: who, type: 'outcome.decided', event: 'E1', outcome, requestId: id('QD') })
const voteEv = (who: string, outcome: string, at: number): LogEntry => ({ id: id('V'), at, memberId: who, type: 'outcome.voted', event: 'E1', outcome, requestId: id('QV') })
const cancelEv = (at: number): LogEntry => ({ id: id('X'), at, memberId: 'H', type: 'event.cancelled', event: 'E1', reason: 'Ошибка' })

// A — 300 на «Да», B и C — по 100 на «Нет»; предложено «Да», утверждено само через сутки
const POOL = [...roomLog(MEMBERS), created(), bet('A', '1', 300), bet('B', '2', 100), bet('C', '2', 100), propose('A', '1')]
const APPROVED = P + OBJECTION_TIME
const FILED = APPROVED + HOUR
const eventOf = (log: LogEntry[]): EventState => roomEvents(log)[0]
const ev = (log: LogEntry[] = POOL): AppealTarget => ({ kind: 'event', event: eventOf(log) })

const filed = (by: string, at: number, over: Partial<Extract<AppealRecord, { type: 'appeal.filed' }>> = {}): AppealRecord => ({
  type: 'appeal.filed',
  id: id('F'),
  at,
  memberId: by,
  target: 'E1',
  reason: 'Скрин смонтирован',
  seed: SEED,
  candidates: ['H', 'D', 'E', 'F'],
  ...over,
})
const joined = (by: string, at: number, target = 'E1'): AppealRecord => ({ type: 'appeal.joined', id: id('J'), at, memberId: by, target })
const voted = (by: string, at: number, verdict: CourtVerdict, target = 'E1'): AppealRecord => ({
  type: 'court.voted',
  id: id('V'),
  at,
  memberId: by,
  target,
  ...verdict,
})
const replaced = (by: string, member: string, at: number, reason = 'Уехал без связи', target = 'E1'): AppealRecord => ({
  type: 'court.replaced',
  id: id('Z'),
  at,
  memberId: by,
  target,
  member,
  reason,
})
const drawn = (at: number, candidates: string[], target = 'E1'): AppealRecord => ({
  type: 'court.drawn',
  id: id('C'),
  at,
  memberId: 'H',
  target,
  seed: SEED,
  candidates,
})

function poolCase(records: AppealRecord[], log: LogEntry[] = POOL, room: CourtRoom = ROOM): CourtCase | null {
  return caseOf(roomAppeals(records, { events: roomEvents(log), offers: [] }, room), 'E1')
}

// Порядок жребия по пулу: ведущий не ставил — он первый; дальше D, E, F по зерну
const ORDER = drawCourt(SEED, ['H', 'D', 'E', 'F'], 'H')
const [, J1, J2, SPARE] = ORDER

describe('жребий (drawCourt)', () => {
  it('одно зерно и список — один и тот же порядок; порядок списка не важен', () => {
    const list = ['D', 'E', 'F', 'G', 'K', 'L']
    expect(drawCourt(SEED, list, 'H')).toEqual(drawCourt(SEED, list, 'H'))
    expect(drawCourt(SEED, [...list].reverse(), 'H')).toEqual(drawCourt(SEED, list, 'H'))
  })

  it('другое зерно — другой порядок', () => {
    const list = ['D', 'E', 'F', 'G', 'K', 'L']
    expect(drawCourt('00ff', list, 'H')).not.toEqual(drawCourt(SEED, list, 'H'))
    expect([...drawCourt('00ff', list, 'H')].sort()).toEqual([...list].sort())
  })

  it('порядок пересчитывается вручную: по возрастанию courtHash(зерно:номер); ведущий-кандидат — первым', () => {
    const list = ['D', 'E', 'F', 'G']
    const byHash = [...list].sort((a, b) => courtHash(`${SEED}:${a}`) - courtHash(`${SEED}:${b}`))
    expect(drawCourt(SEED, list, 'H')).toEqual(byHash)
    expect(drawCourt(SEED, ['H', ...list], 'H')).toEqual(['H', ...byHash])
    expect(courtHash('')).toBe(courtHash(''))
    expect(courtHash('a')).not.toBe(courtHash('b'))
  })

  it('состав: ведущий + 2 первых, если ведущий — кандидат; иначе — 3 первых', () => {
    const withHost = courtState({ ...bareCase(['H', 'D', 'E', 'F']) }, 0)
    expect(withHost.seats.map((s) => s.member)).toEqual(ORDER.slice(0, 3))
    expect(withHost.seats[0].member).toBe('H')
    const noHost = courtState(bareCase(['D', 'E', 'F', 'G']), 0)
    expect(noHost.seats.map((s) => s.member)).toEqual(drawCourt(SEED, ['D', 'E', 'F', 'G'], 'H').slice(0, 3))
    expect(noHost.seats.map((s) => s.member)).not.toContain('H')
  })
})

// Дело суда напрямую — для механики мест и решения
function bareCase(candidates: string[], acts: CourtCase['acts'] = [], appeal = true): CourtCase {
  return {
    target: 'E1',
    appeal: appeal ? { id: 'F0', at: 0, by: 'B', reason: 'Не так', joined: [] } : null,
    seed: SEED,
    candidates,
    drawnAt: 0,
    hostId: 'H',
    acts,
  }
}
const vote = (by: string, at: number, v: CourtVerdict): CourtCase['acts'][number] => ({ type: 'vote', id: id('v'), at, by, ...v })

describe('подать апелляцию (checkAppeal)', () => {
  const REASON = 'Скрин смонтирован'

  it('исход утверждён и не окончательный — ставивший подаёт с причиной', () => {
    expect(checkAppeal(ev(), null, 'B', REASON, ROOM, FILED)).toBeNull()
    expect(checkAppeal(ev(), null, 'A', REASON, ROOM, FINAL_TIME + APPROVED - 1)).toBeNull()
  })

  it('не утверждён — нельзя; 7 дней с утверждения прошли — окончательный', () => {
    expect(checkAppeal(ev(), null, 'B', REASON, ROOM, P + HOUR)).toBe(NOT_APPROVED)
    expect(checkAppeal(ev([...roomLog(MEMBERS), created(), bet('B', '2', 100)]), null, 'B', REASON, ROOM, FILED)).toBe(NOT_APPROVED)
    expect(checkAppeal(ev(), null, 'B', REASON, ROOM, APPROVED + FINAL_TIME)).toBe(FINAL)
  })

  it('подаёт только ставивший, кроме согласившихся с исходом (Р-21)', () => {
    expect(checkAppeal(ev(), null, 'D', REASON, ROOM, FILED)).toBe(NOT_BETTOR)
    const log = [...POOL, agree('C', P + HOUR)]
    expect(checkAppeal(ev(log), null, 'C', REASON, ROOM, FILED)).toBe(AGREED_BETTOR)
    expect(checkAppeal(ev(log), null, 'B', REASON, ROOM, FILED)).toBeNull()
  })

  it('утверждён согласием всех ставивших — апелляции нет: окончательный сразу', () => {
    const log = [...POOL, agree('B', P + HOUR), agree('C', P + 2 * HOUR)]
    expect(eventOutcome(eventOf(log), P + 2 * HOUR)?.status).toBe('final')
    // Предложивший не «соглашался» записью, но исход окончательный сразу
    expect(checkAppeal(ev(log), null, 'A', REASON, ROOM, P + 3 * HOUR)).toBe(AGREED_FINAL)
  })

  it('причина — не пустая, ≤ 300 знаков', () => {
    expect(checkAppeal(ev(), null, 'B', '  ', ROOM, FILED)).toBe(NEED_APPEAL)
    expect(checkAppeal(ev(), null, 'B', undefined, ROOM, FILED)).toBe(NEED_APPEAL)
    expect(checkAppeal(ev(), null, 'B', 'я'.repeat(301), ROOM, FILED)).toBe(LONG_APPEAL)
    expect(checkAppeal(ev(), null, 'B', '🙂'.repeat(300), ROOM, FILED)).toBeNull()
  })

  it('апелляция одна на событие — вторая отклоняется с подсказкой «присоединиться»', () => {
    const c = poolCase([filed('B', FILED)])
    expect(c?.appeal?.by).toBe('B')
    expect(checkAppeal(ev(), c, 'C', REASON, ROOM, FILED + 1)).toBe(APPEAL_EXISTS)
    expect(APPEAL_EXISTS).toContain('присоединитесь')
  })

  it('событие отменено — апелляции нет', () => {
    expect(checkAppeal(ev([...POOL, cancelEv(APPROVED + 1)]), null, 'B', REASON, ROOM, FILED)).toBe(CANCELLED)
  })

  it('некому судить (кандидатов 0) — отказ', () => {
    const members = ['H', 'A', 'B']
    const log = [...roomLog(members), created(), bet('A', '1', 300), bet('B', '2', 100), bet('H', '2', 100), propose('A', '1')]
    expect(courtCandidates(ev(log), courtRoom(members), FILED)).toEqual([])
    expect(checkAppeal(ev(log), null, 'B', REASON, courtRoom(members), FILED)).toBe(NO_JUDGES)
    expect(NO_JUDGES).toBe('В комнате некому судить: все участники заинтересованы')
  })
})

describe('кандидаты в суд (courtCandidates)', () => {
  it('пул: без ставивших и автора; ведущий, не решавший возражения, — кандидат', () => {
    expect(courtCandidates(ev(), ROOM, FILED)).toEqual(['H', 'D', 'E', 'F'])
  })

  it('без предмета спора и ведущего, решившего возражение', () => {
    const log = [...roomLog(MEMBERS), created('D'), bet('A', '1', 300), bet('B', '2', 100), propose('A', '1'), object('B', P + HOUR), decideEv('H', '1', P + 2 * HOUR)]
    expect(eventOutcome(eventOf(log), P + 2 * HOUR)?.approved?.how).toBe('host')
    expect(courtCandidates(ev(log), ROOM, P + 3 * HOUR)).toEqual(['C', 'E', 'F'])
  })

  it('голосовавшие по возражению (Р-17) — не исключаются', () => {
    const log = [...roomLog(MEMBERS), created(), bet('A', '1', 300), bet('H', '2', 100), propose('A', '1'), object('H', P + HOUR)]
    const voters = ['B', 'C', 'D', 'E', 'F']
    const votes = voters.map((m, i) => voteEv(m, '1', P + 2 * HOUR + i))
    const after = P + 2 * HOUR + voters.length
    expect(eventOutcome(eventOf([...log, ...votes]), after)?.approved?.how).toBe('vote')
    expect(courtCandidates(ev([...log, ...votes]), ROOM, after)).toEqual(voters)
  })

  it('участники на миг жребия: впущенный позже — не кандидат; подавший и присоединившиеся — нет', () => {
    const room = courtRoom(MEMBERS, { F: FILED + 1 })
    expect(courtCandidates(ev(), room, FILED)).toEqual(['H', 'D', 'E'])
    expect(courtCandidates(ev(), room, FILED + 1)).toEqual(['H', 'D', 'E', 'F'])
    expect(courtCandidates(ev(), ROOM, FILED, ['D'])).toEqual(['H', 'E', 'F'])
  })

  it('пари: без сторон и нынешнего гаранта', () => {
    expect(courtCandidates(of(), OFFER_ROOM, DECIDED + 1)).toEqual(['c', 'g', 'n'])
  })
})

describe('присоединиться (checkJoin)', () => {
  it('тот, кто мог бы подать, кроме подавшего; один раз; до решения суда', () => {
    const c = poolCase([filed('B', FILED)])
    expect(checkJoin(ev(), c, 'C', FILED + 1)).toBeNull()
    expect(checkJoin(ev(), c, 'A', FILED + 1)).toBeNull()
    expect(checkJoin(ev(), c, 'B', FILED + 1)).toBe(OWN_APPEAL)
    expect(checkJoin(ev(), c, 'D', FILED + 1)).toBe(NOT_BETTOR)
    expect(checkJoin(ev(), null, 'C', FILED + 1)).toBe(NO_APPEAL)
    const twice = poolCase([filed('B', FILED), joined('C', FILED + 1)])
    expect(twice?.appeal?.joined.map((j) => j.by)).toEqual(['C'])
    expect(checkJoin(ev(), twice, 'C', FILED + 2)).toBe(ALREADY_JOINED)
    // Согласившийся не присоединяется
    const log = [...POOL, agree('C', P + HOUR)]
    expect(checkJoin(ev(log), poolCase([filed('B', FILED)], log), 'C', FILED + 1)).toBe(AGREED_BETTOR)
  })

  it('суд решил — поздно; 7 дней прошли, а суд не решил — ещё можно', () => {
    // Подана в последний час 7 дней: суд ещё идёт после них
    const c = poolCase([filed('B', APPROVED + FINAL_TIME - HOUR)])
    expect(checkJoin(ev(), c, 'C', APPROVED + FINAL_TIME + HOUR)).toBeNull()
    const done = poolCase([
      filed('B', FILED),
      voted('H', FILED + 1, { verdict: 'keep' }),
      voted(J1, FILED + 2, { verdict: 'keep' }),
      voted(J2, FILED + 3, { verdict: 'keep' }),
    ])
    expect(checkJoin(ev(), done, 'C', FILED + 4)).toBe(COURT_DECIDED)
  })
})

describe('голос суда (checkCourtVote)', () => {
  const c = () => poolCase([filed('B', FILED)]) as CourtCase

  it('только член суда на своём месте; один раз, не меняется', () => {
    expect(checkCourtVote(ev(), c(), 'H', { verdict: 'keep' }, FILED + 1)).toBeNull()
    expect(checkCourtVote(ev(), c(), SPARE, { verdict: 'keep' }, FILED + 1)).toBe(NOT_JUROR)
    expect(checkCourtVote(ev(), c(), 'B', { verdict: 'keep' }, FILED + 1)).toBe(NOT_JUROR)
    const once = poolCase([filed('B', FILED), voted(J1, FILED + 1, { verdict: 'cancel' }), voted(J1, FILED + 2, { verdict: 'keep' })])
    expect(courtState(once as CourtCase, FILED + 3).seats[1].vote).toMatchObject({ by: J1, verdict: 'cancel' })
    expect(checkCourtVote(ev(), once as CourtCase, J1, { verdict: 'keep' }, FILED + 3)).toBe(VOTED)
  })

  it('варианты: «оставить», «изменить» на другой исход, «отменить»', () => {
    expect(checkCourtVote(ev(), c(), J1, { verdict: 'change', outcome: '2' }, FILED + 1)).toBeNull()
    expect(checkCourtVote(ev(), c(), J1, { verdict: 'cancel' }, FILED + 1)).toBeNull()
    expect(checkCourtVote(ev(), c(), J1, { verdict: 'change', outcome: '1' }, FILED + 1)).toBe(SAME_CHANGE)
    expect(checkCourtVote(ev(), c(), J1, { verdict: 'change', outcome: '9' }, FILED + 1)).toBe(BAD_VERDICT)
    expect(checkCourtVote(ev(), c(), J1, { verdict: 'change', winner: 'taker' }, FILED + 1)).toBe(BAD_VERDICT)
    expect(checkCourtVote(ev(), c(), J1, { verdict: 'maybe' }, FILED + 1)).toBe(BAD_VERDICT)
    expect(checkCourtVote(ev(), c(), J1, null, FILED + 1)).toBe(BAD_VERDICT)
  })

  it('голоса видны сразу — в месте суда, до решения', () => {
    const one = poolCase([filed('B', FILED), voted('H', FILED + 1, { verdict: 'change', outcome: '2' })]) as CourtCase
    expect(courtVerdict(one, FILED + 2)).toBeNull()
    expect(eventOutcome(eventOf(POOL), FILED + 2, one)?.court?.seats[0].vote).toMatchObject({ by: 'H', verdict: 'change', outcome: '2' })
  })
})

describe('сроки и замена', () => {
  it('молчит 72 часа — место переходит к следующему по порядку, у него свои 72 часа', () => {
    const c = bareCase(['H', 'D', 'E', 'F'], [vote('H', 1, { verdict: 'keep' }), vote(ORDER[1], 2, { verdict: 'keep' })])
    const before = courtState(c, SEAT_TIME - 1)
    expect(before.seats[2]).toMatchObject({ member: ORDER[2], since: 0, until: SEAT_TIME, replaced: null })
    expect(before.decidedAt).toBeNull()
    const after = courtState(c, SEAT_TIME)
    expect(after.seats[2]).toMatchObject({
      member: ORDER[3],
      since: SEAT_TIME,
      until: 2 * SEAT_TIME,
      replaced: { member: ORDER[2], at: SEAT_TIME, by: null, reason: null },
    })
    expect(after.decidedAt).toBeNull()
    // Заменивший тоже молчит — второй замены нет: срок прошёл, суд кончился
    const end = courtState(c, 2 * SEAT_TIME)
    expect(end.seats[2].member).toBe(ORDER[3])
    expect(end.decidedAt).toBe(2 * SEAT_TIME)
    expect(courtVerdict(c, 2 * SEAT_TIME)).toEqual({ at: 2 * SEAT_TIME, majority: true, verdict: 'keep' })
  })

  it('ведущий молчит — его место тоже переходит к следующему', () => {
    const c = bareCase(['H', 'D', 'E', 'F'], [vote(ORDER[1], 1, { verdict: 'keep' }), vote(ORDER[2], 2, { verdict: 'keep' })])
    expect(courtState(c, SEAT_TIME).seats[0]).toMatchObject({ member: ORDER[3], replaced: { member: 'H', by: null } })
  })

  it('запасные кончились — место пустое; решают проголосовавшие', () => {
    const order = drawCourt(SEED, ['D', 'E', 'F'], 'H')
    const c = bareCase(['D', 'E', 'F'], [vote(order[0], 5, { verdict: 'change', outcome: '2' })])
    const s = courtState(c, SEAT_TIME)
    expect(s.seats.slice(1).map((x) => x.member)).toEqual([null, null])
    expect(s.decidedAt).toBe(SEAT_TIME)
    expect(courtVerdict(c, SEAT_TIME)).toEqual({ at: SEAT_TIME, majority: true, verdict: 'change', outcome: '2' })
  })

  it('замены по сроку — по порядку мест; голос после своего срока не действует', () => {
    const order = drawCourt(SEED, ['D', 'E', 'F', 'G', 'K'], 'H')
    // Голос в миг конца срока — уже поздно; все трое молчат — двое запасных по порядку мест, третье пустое
    const bare = bareCase(['D', 'E', 'F', 'G', 'K'], [vote(order[0], SEAT_TIME, { verdict: 'keep' })])
    const s = courtState(bare, SEAT_TIME)
    expect(s.seats.map((x) => x.member)).toEqual([order[3], order[4], null])
    expect(s.seats[0].vote).toBeNull()
  })

  it('досрочная замена ведущим: не проголосовавшего, не себя, с причиной, одна на место', () => {
    const c = poolCase([filed('B', FILED)]) as CourtCase
    expect(checkReplace(c, 'H', J1, 'Уехал без связи', FILED + 1)).toBeNull()
    expect(checkReplace(c, 'D', J1, 'Уехал', FILED + 1)).toBe(ONLY_HOST)
    expect(checkReplace(c, 'H', 'H', 'Устал', FILED + 1)).toBe(OWN_SEAT)
    expect(checkReplace(c, 'H', SPARE, 'Уехал', FILED + 1)).toBe(NOT_SEAT)
    expect(checkReplace(c, 'H', J1, ' ', FILED + 1)).toBe(NEED_REPLACE)
    expect(checkReplace(c, 'H', J1, 'я'.repeat(301), FILED + 1)).toBe(LONG_REPLACE)
    const votedJ1 = poolCase([filed('B', FILED), voted(J1, FILED + 1, { verdict: 'keep' })]) as CourtCase
    expect(checkReplace(votedJ1, 'H', J1, 'Уехал', FILED + 2)).toBe(VOTED_NO_REPLACE)
    const swapped = poolCase([filed('B', FILED), replaced('H', J1, FILED + HOUR)]) as CourtCase
    const seat = courtState(swapped, FILED + HOUR).seats[1]
    expect(seat).toMatchObject({
      member: SPARE,
      since: FILED + HOUR,
      until: FILED + HOUR + SEAT_TIME,
      replaced: { member: J1, at: FILED + HOUR, by: 'H', reason: 'Уехал без связи' },
    })
    expect(checkReplace(swapped, 'H', SPARE, 'И этот уехал', FILED + 2 * HOUR)).toBe(ALREADY_REPLACED)
  })

  it('кандидаты кончились при досрочной замене — место пустое', () => {
    const swapped = poolCase([filed('B', FILED), replaced('H', J1, FILED + 1), replaced('H', J2, FILED + 2)]) as CourtCase
    const s = courtState(swapped, FILED + 2)
    expect(s.seats[1].member).toBe(SPARE)
    expect(s.seats[2]).toMatchObject({ member: null, since: FILED + 2, until: FILED + 2, replaced: { member: J2, by: 'H' } })
  })

  it('ведущий заинтересован — досрочной замены нет', () => {
    // Пари, где ведущий — автор: он не кандидат
    expect(checkReplace(hostSideCase(), 'h', drawCourt(SEED, ['a', 'c', 'n'], 'h')[0], 'Уехал', DECIDED + 2)).toBe(HOST_INTERESTED)
  })
})

describe('решение суда (courtVerdict)', () => {
  it('кончается, когда проголосовали все места: строгое большинство поданных — 2 из 3', () => {
    const c = bareCase(['H', 'D', 'E', 'F'], [
      vote('H', 1, { verdict: 'change', outcome: '2' }),
      vote(ORDER[1], 2, { verdict: 'keep' }),
      vote(ORDER[2], 3, { verdict: 'change', outcome: '2' }),
    ])
    expect(courtVerdict(c, 2)).toBeNull()
    expect(courtVerdict(c, 3)).toEqual({ at: 3, majority: true, verdict: 'change', outcome: '2' })
  })

  it('большинства нет — у апелляции исход остаётся, у «ждёт суда» — отмена', () => {
    const acts = [vote('H', 1, { verdict: 'change', outcome: '2' }), vote(ORDER[1], 2, { verdict: 'keep' }), vote(ORDER[2], 3, { verdict: 'cancel' })]
    expect(courtVerdict(bareCase(['H', 'D', 'E', 'F'], acts), 3)).toEqual({ at: 3, majority: false, verdict: 'keep' })
    const noAppeal = bareCase(['H', 'D', 'E', 'F'], [vote('H', 1, { verdict: 'change', outcome: '2' }), vote(ORDER[1], 2, { verdict: 'change', outcome: '1' }), vote(ORDER[2], 3, { verdict: 'cancel' })], false)
    expect(courtVerdict(noAppeal, 3)).toEqual({ at: 3, majority: false, verdict: 'cancel' })
  })

  it('малая комната: 1 кандидат — решает он; 2 кандидата — 1 к 1 большинства нет', () => {
    const one = bareCase(['D'], [vote('D', 7, { verdict: 'cancel' })])
    expect(courtState(one, 7).seats).toHaveLength(1)
    expect(courtVerdict(one, 7)).toEqual({ at: 7, majority: true, verdict: 'cancel' })
    const [x, y] = drawCourt(SEED, ['D', 'E'], 'H')
    const two = bareCase(['D', 'E'], [vote(x, 1, { verdict: 'keep' }), vote(y, 2, { verdict: 'cancel' })])
    expect(courtState(two, 2).seats).toHaveLength(2)
    expect(courtVerdict(two, 2)).toEqual({ at: 2, majority: false, verdict: 'keep' })
    // Второй молчит, запасных нет — решает проголосовавший
    const silent = bareCase(['D', 'E'], [vote(x, 1, { verdict: 'cancel' })])
    expect(courtVerdict(silent, SEAT_TIME)).toEqual({ at: SEAT_TIME, majority: true, verdict: 'cancel' })
  })

  it('никто не голосовал — большинства нет', () => {
    expect(courtVerdict(bareCase(['D', 'E', 'F']), SEAT_TIME)).toEqual({ at: SEAT_TIME, majority: false, verdict: 'keep' })
  })

  it('решение окончательное: после него ни голоса, ни замены, ни второй апелляции', () => {
    const records = [filed('B', FILED), voted('H', FILED + 1, { verdict: 'keep' }), voted(J1, FILED + 2, { verdict: 'keep' }), voted(J2, FILED + 3, { verdict: 'keep' })]
    const c = poolCase(records) as CourtCase
    expect(checkCourtVote(ev(), c, J1, { verdict: 'cancel' }, FILED + 4)).toBe(COURT_DECIDED)
    expect(checkReplace(c, 'H', J1, 'Уехал', FILED + 4)).toBe(COURT_DECIDED)
    expect(checkAppeal(ev(), c, 'C', 'Ещё раз', ROOM, FILED + 4)).toBe(APPEAL_EXISTS)
  })
})

describe('окончательность исхода пула с апелляцией (eventOutcome)', () => {
  const at = (records: AppealRecord[], now: number, log = POOL) => eventOutcome(eventOf(log), now, poolCase(records, log))

  it('без апелляции — как прежде: окончательный через 7 дней; суда в ответе нет', () => {
    const out = eventOutcome(eventOf(POOL), APPROVED + FINAL_TIME)
    expect(out).toMatchObject({ status: 'final', finalAt: APPROVED + FINAL_TIME })
    expect(out).not.toHaveProperty('court')
  })

  it('подана до конца 7 дней — не окончательный, пока суд не решил', () => {
    const last = APPROVED + FINAL_TIME - HOUR // последний час 7 дней
    const out = at([filed('B', last)], APPROVED + FINAL_TIME + HOUR)
    expect(out).toMatchObject({ status: 'approved', finalAt: null, approved: { outcome: '1', how: 'unopposed' } })
    expect(out?.payouts).toHaveLength(3)
    expect(out?.appeal).toMatchObject({ by: 'B', at: last, reason: 'Скрин смонтирован', joined: [] })
    expect(out?.court).toMatchObject({ seed: SEED, drawnAt: last, candidates: ORDER, decision: null })
    expect(out?.court?.seats.map((s) => s.member)).toEqual(ORDER.slice(0, 3))
    // Суд молчит: места переходят запасным, сроки кончаются — исход остаётся, окончательный с решения
    const silent = at([filed('B', last)], last + 2 * SEAT_TIME)
    expect(silent).toMatchObject({ status: 'final', finalAt: last + 2 * SEAT_TIME, court: { decision: { majority: false, verdict: 'keep' } } })
  })

  it('«оставить» — окончательный в миг решения с прежним исходом', () => {
    const out = at([filed('B', FILED), voted('H', FILED + 1, { verdict: 'keep' }), voted(J1, FILED + 2, { verdict: 'keep' }), voted(J2, FILED + 3, { verdict: 'cancel' })], FILED + 3)
    expect(out).toMatchObject({ status: 'final', finalAt: FILED + 3, approved: { outcome: '1', how: 'unopposed' } })
    expect(out?.court?.decision).toEqual({ at: FILED + 3, majority: true, verdict: 'keep' })
  })

  it('«изменить» — утверждён судом и окончательный сразу, выплаты — по новому исходу', () => {
    const out = at([filed('B', FILED), voted('H', FILED + 1, { verdict: 'change', outcome: '2' }), voted(J1, FILED + 2, { verdict: 'change', outcome: '2' }), voted(J2, FILED + 3, { verdict: 'keep' })], FILED + 3)
    expect(out).toMatchObject({ status: 'final', finalAt: FILED + 3, approved: { outcome: '2', at: FILED + 3, how: 'court', by: null } })
    expect(out?.payouts).toEqual([
      { memberId: 'A', staked: 300, payout: 0, net: -300 },
      { memberId: 'B', staked: 100, payout: 250, net: 150 },
      { memberId: 'C', staked: 100, payout: 250, net: 150 },
    ])
  })

  it('«отменить» — статус «отменено», ставки возвращаются', () => {
    const records = [filed('B', FILED), voted('H', FILED + 1, { verdict: 'cancel' }), voted(J1, FILED + 2, { verdict: 'cancel' }), voted(J2, FILED + 3, { verdict: 'keep' })]
    const view = eventView(eventOf(POOL), FILED + 3, poolCase(records))
    expect(view.outcome).toMatchObject({ status: 'cancelled', finalAt: null, payouts: [] })
    expect(view.refunds).toEqual([
      { memberId: 'A', amount: 300 },
      { memberId: 'B', amount: 100 },
      { memberId: 'C', amount: 100 },
    ])
    expect(isEventView(view)).toBe(true)
    // Без суда — возвратов нет
    expect(eventView(eventOf(POOL), FILED + 3).refunds).toEqual([])
  })

  it('апелляция после 7 дней не действует', () => {
    expect(poolCase([filed('B', APPROVED + FINAL_TIME)])).toBeNull()
  })
})

describe('суд без апелляции: «ждёт суда» (Р-17)', () => {
  // Ведущий ставил — голосуют не ставившие; 1 к 1 — ничья, «ждёт суда»
  const log = [
    ...roomLog(MEMBERS),
    created(),
    bet('A', '1', 300),
    bet('H', '2', 100),
    propose('A', '1'),
    object('H', P + HOUR),
    voteEv('B', '1', P + 2 * HOUR),
    voteEv('C', '2', P + 3 * HOUR),
  ]
  const END = P + HOUR + VOTING_TIME
  const CANDIDATES = ['B', 'C', 'D', 'E', 'F']
  const order = drawCourt(SEED, CANDIDATES, 'H')
  const t: AppealTarget = { kind: 'event', event: eventOf(log) }
  const cs = (records: AppealRecord[]) => poolCase(records, log)

  it('суд собирается сам, тем же жребием; ведущий ставил — три присяжных', () => {
    expect(eventOutcome(eventOf(log), END)?.status).toBe('court')
    expect(courtCandidates(t, ROOM, END)).toEqual(CANDIDATES)
    expect(checkCourtDraw(t, null, END - 1)).toBe(NOT_COURT)
    expect(checkCourtDraw(t, null, END)).toBeNull()
    const c = cs([drawn(END, CANDIDATES)]) as CourtCase
    expect(c.appeal).toBeNull()
    expect(checkCourtDraw(t, c, END + 1)).toBe(COURT_EXISTS)
    const out = eventOutcome(eventOf(log), END + 1, c)
    expect(out).toMatchObject({ status: 'court', appeal: null, court: { candidates: order, drawnAt: END } })
    expect(out?.court?.seats.map((s) => s.member)).toEqual(order.slice(0, 3))
    // Апелляции на «ждёт суда» нет
    expect(checkAppeal(t, c, 'A', 'Не так', ROOM, END + 1)).toBe(NOT_APPROVED)
  })

  it('голоса — «изменить на …» или «отменить»; «оставить» нечего', () => {
    const c = cs([drawn(END, CANDIDATES)]) as CourtCase
    expect(checkCourtVote(t, c, order[0], { verdict: 'keep' }, END + 1)).toBe(NO_KEEP)
    expect(checkCourtVote(t, c, order[0], { verdict: 'change', outcome: '1' }, END + 1)).toBeNull()
  })

  it('большинство «изменить» — утверждён судом, окончательный', () => {
    const c = cs([drawn(END, CANDIDATES), voted(order[0], END + 1, { verdict: 'change', outcome: '2' }), voted(order[1], END + 2, { verdict: 'change', outcome: '2' }), voted(order[2], END + 3, { verdict: 'cancel' })])
    const out = eventOutcome(eventOf(log), END + 3, c)
    expect(out).toMatchObject({ status: 'final', finalAt: END + 3, approved: { outcome: '2', how: 'court' } })
    // Решение окончательное — второй апелляции нет
    expect(checkAppeal(t, c, 'A', 'Не так', ROOM, END + 4)).toBe(COURT_DECIDED)
  })

  it('без большинства — событие отменено, ставки возвращаются', () => {
    const c = cs([drawn(END, CANDIDATES), voted(order[0], END + 1, { verdict: 'change', outcome: '2' }), voted(order[1], END + 2, { verdict: 'change', outcome: '1' }), voted(order[2], END + 3, { verdict: 'cancel' })])
    const view = eventView(eventOf(log), END + 3, c)
    expect(view.outcome).toMatchObject({ status: 'cancelled', finalAt: null, court: { decision: { majority: false, verdict: 'cancel' } } })
    expect(view.refunds).toEqual([
      { memberId: 'A', amount: 300 },
      { memberId: 'H', amount: 100 },
    ])
  })

  it('ведущий ставил — досрочной замены нет', () => {
    const c = cs([drawn(END, CANDIDATES)]) as CourtCase
    expect(checkReplace(c, 'H', order[0], 'Уехал', END + 1)).toBe(HOST_INTERESTED)
  })
})

// Пари: автор a, соперник b, гарант — ведущий h; стороны разошлись, гарант решил «прав автор»
const T = 1_000_000_000
const CLOSE = T + DAY
const EXPECT = T + 2 * DAY
const DECIDED = T + 40
const OFFER_ROOM: CourtRoom = { hostId: 'h', members: ['h', 'a', 'b', 'c', 'g', 'n'].map((m) => ({ id: m, addedAt: 0 })) }
const ROLES = { hostId: 'h', members: ['h', 'a', 'b', 'c', 'g', 'n'] }
function offerRecords(author = 'a', guarantor = 'h'): OfferRecord[] {
  return [
    {
      type: 'offer.created',
      id: 'o1',
      at: T,
      memberId: author,
      condition: 'Вася подтянется 20 раз',
      check: 'Видео в чате',
      side: 'yes',
      odds: { a: 3, b: 1 },
      amount: 300,
      to: null,
      closesAt: CLOSE,
      expectedAt: EXPECT,
      guarantor,
      counterTo: null,
      subject: null,
    },
    { type: 'offer.accepted', id: 'r1', at: T + 10, memberId: 'b', offer: 'o1' },
    { type: 'offer.marked', id: 'r2', at: T + 20, memberId: author, offer: 'o1', winner: 'author' },
    { type: 'offer.marked', id: 'r3', at: T + 30, memberId: 'b', offer: 'o1', winner: 'taker' },
    { type: 'offer.decided', id: 'r4', at: DECIDED, memberId: guarantor, offer: 'o1', winner: 'author' },
  ]
}
const offerOf = (records = offerRecords()): OfferState => roomOffers(records, ROLES)[0]
const of = (o = offerOf()): AppealTarget => ({ kind: 'offer', offer: o })
const OFFER_CANDIDATES = ['c', 'g', 'n']
const OFFER_ORDER = drawCourt(SEED, OFFER_CANDIDATES, 'h')
const offerFiled = (by: string, at: number, candidates = OFFER_CANDIDATES): AppealRecord => ({
  type: 'appeal.filed',
  id: id('F'),
  at,
  memberId: by,
  target: 'o1',
  reason: 'Гарант не смотрел видео',
  seed: SEED,
  candidates,
})
function offerCase(records: AppealRecord[], o = offerOf(), room = OFFER_ROOM): CourtCase | null {
  return caseOf(roomAppeals(records, { events: [], offers: [o] }, room), 'o1')
}
function hostSideCase(): CourtCase {
  const o = offerOf(offerRecords('h', 'g'))
  return offerCase([offerFiled('b', DECIDED + 1, ['a', 'c', 'n'])], o) as CourtCase
}

describe('апелляция по пари', () => {
  it('подаёт сторона, пока решение гаранта не окончательное; согласие сторон — апелляции нет', () => {
    expect(checkAppeal(of(), null, 'b', 'Не так', OFFER_ROOM, DECIDED + 1)).toBeNull()
    expect(checkAppeal(of(), null, 'a', 'Не так', OFFER_ROOM, DECIDED + 1)).toBeNull()
    expect(checkAppeal(of(), null, 'c', 'Не так', OFFER_ROOM, DECIDED + 1)).toBe(NOT_SIDE)
    expect(checkAppeal(of(), null, 'h', 'Не так', OFFER_ROOM, DECIDED + 1)).toBe(NOT_SIDE)
    expect(checkAppeal(of(), null, 'b', 'Не так', OFFER_ROOM, DECIDED + FINAL_TIME)).toBe(FINAL)
    expect(checkAppeal(of(offerOf(offerRecords().slice(0, 3))), null, 'b', 'Не так', OFFER_ROOM, T + 25)).toBe(NOT_APPROVED)
    const agreed = offerOf([...offerRecords().slice(0, 3), { type: 'offer.marked', id: 'r9', at: T + 30, memberId: 'b', offer: 'o1', winner: 'author' }])
    expect(checkAppeal(of(agreed), null, 'b', 'Не так', OFFER_ROOM, T + 31)).toBe(AGREED_FINAL)
  })

  it('присоединиться — другая сторона', () => {
    const c = offerCase([offerFiled('b', DECIDED + 1)])
    expect(checkJoin(of(), c, 'a', DECIDED + 2)).toBeNull()
    expect(checkJoin(of(), c, 'c', DECIDED + 2)).toBe(NOT_SIDE)
  })

  it('пока суд не решил — не окончательное и в «Расчёт» не идёт', () => {
    const c = offerCase([offerFiled('b', DECIDED + FINAL_TIME - 1)])
    const out = offerOutcome(offerOf(), DECIDED + FINAL_TIME + 1, c)
    expect(out).toMatchObject({ phase: 'approved', finalAt: null, appeal: { by: 'b' }, court: { candidates: OFFER_ORDER } })
    expect(offerResult(offerOf(), DECIDED + FINAL_TIME + 1, c)).toEqual([])
    // Без апелляции — как прежде
    expect(offerResult(offerOf(), DECIDED + FINAL_TIME)).toHaveLength(2)
  })

  it('голос «изменить» — у пари другая сторона', () => {
    const c = offerCase([offerFiled('b', DECIDED + 1)]) as CourtCase
    expect(checkCourtVote(of(), c, OFFER_ORDER[0], { verdict: 'change', winner: 'taker' }, DECIDED + 2)).toBeNull()
    expect(checkCourtVote(of(), c, OFFER_ORDER[0], { verdict: 'change', winner: 'author' }, DECIDED + 2)).toBe(SAME_CHANGE)
    expect(checkCourtVote(of(), c, OFFER_ORDER[0], { verdict: 'change', outcome: '1' }, DECIDED + 2)).toBe(BAD_VERDICT)
  })

  const decide = (v: CourtVerdict[]) =>
    offerCase([offerFiled('b', DECIDED + 1), ...v.map((x, i) => voted(OFFER_ORDER[i], DECIDED + 2 + i, x, 'o1'))]) as CourtCase
  const END = DECIDED + 4

  it('«оставить» — окончательное с решения суда, прежний исход', () => {
    const c = decide([{ verdict: 'keep' }, { verdict: 'keep' }, { verdict: 'cancel' }])
    expect(offerOutcome(offerOf(), END, c)).toMatchObject({ phase: 'final', finalAt: END, approved: { winner: 'author', how: 'guarantor' } })
    expect(offerResult(offerOf(), END, c)).toEqual([
      { memberId: 'a', net: 100 },
      { memberId: 'b', net: -100 },
    ])
  })

  it('«изменить» — утверждено судом, окончательное сразу, итог — по новому исходу', () => {
    const c = decide([{ verdict: 'change', winner: 'taker' }, { verdict: 'keep' }, { verdict: 'change', winner: 'taker' }])
    expect(offerOutcome(offerOf(), END, c)).toMatchObject({ phase: 'final', finalAt: END, approved: { winner: 'taker', at: END, how: 'court', by: null } })
    expect(offerResult(offerOf(), END, c)).toEqual([
      { memberId: 'a', net: -300 },
      { memberId: 'b', net: 300 },
    ])
    expect(isOfferView(offerView(offerOf(), END, c))).toBe(true)
  })

  it('«отменить» — без выплат', () => {
    const c = decide([{ verdict: 'cancel' }, { verdict: 'cancel' }, { verdict: 'keep' }])
    expect(offerOutcome(offerOf(), END, c)).toMatchObject({ phase: 'cancelled', finalAt: null })
    expect(offerResult(offerOf(), END + FINAL_TIME, c)).toEqual([])
  })

  it('ведущий — сторона пари: в суде не сидит, три присяжных жребием', () => {
    const c = hostSideCase()
    expect(courtCandidates(of(offerOf(offerRecords('h', 'g'))), OFFER_ROOM, DECIDED + 1)).toEqual(['a', 'c', 'n'])
    expect(courtState(c, DECIDED + 1).seats.map((s) => s.member)).toEqual(drawCourt(SEED, ['a', 'c', 'n'], 'h'))
    expect(c.candidates).not.toContain('h')
  })
})

describe('свёртка записей (roomAppeals)', () => {
  it('записи не по правилам не действуют', () => {
    // Чужие кандидаты, плохое зерно, неизвестная цель, присоединение без апелляции
    expect(poolCase([filed('B', FILED, { candidates: ['H', 'D'] })])).toBeNull()
    expect(poolCase([filed('B', FILED, { seed: 'не hex' })])).toBeNull()
    expect(poolCase([filed('B', FILED, { target: 'E9' })])).toBeNull()
    expect(poolCase([joined('C', FILED)])).toBeNull()
    expect(poolCase([filed('D', FILED)])).toBeNull()
    // Вторая апелляция, голос не члена суда и повторный голос
    const c = poolCase([
      filed('B', FILED),
      filed('C', FILED + 1),
      voted('B', FILED + 2, { verdict: 'cancel' }),
      voted(J1, FILED + 3, { verdict: 'keep' }),
      voted(J1, FILED + 4, { verdict: 'cancel' }),
    ]) as CourtCase
    expect(c.appeal?.by).toBe('B')
    expect(c.acts.map((a) => a.type === 'vote' && [a.by, a.verdict])).toEqual([[J1, 'keep']])
  })

  it('зерно и кандидаты проверяются (checkDraw)', () => {
    expect(checkDraw('', ['D'], ['D'])).toBe(BAD_SEED)
    expect(checkDraw('zz', ['D'], ['D'])).toBe(BAD_SEED)
    expect(checkDraw('ab', ['D', 'D'], ['D', 'E'])).toBe(BAD_CANDIDATES)
    expect(checkDraw('ab', ['E', 'D'], ['D', 'E'])).toBeNull()
  })

  it('голос после срока места не действует; место переходит к запасному, его голос — действует', () => {
    const late = FILED + SEAT_TIME
    const c = poolCase([filed('B', FILED), voted(J1, late, { verdict: 'keep' }), voted(SPARE, late + 1, { verdict: 'cancel' })]) as CourtCase
    expect(c.acts.map((a) => a.type === 'vote' && a.by)).toEqual([SPARE])
    const s = courtState(c, late + 1)
    expect(s.seats.find((x) => x.member === SPARE)?.replaced).toMatchObject({ by: null, at: late })
  })

  it('причина апелляции и замены — без пробелов по краям', () => {
    const c = poolCase([filed('B', FILED, { reason: '  Не так  ' }), replaced('H', J1, FILED + 1, '  Уехал  ')]) as CourtCase
    expect(c.appeal?.reason).toBe('Не так')
    expect(c.acts[0]).toMatchObject({ type: 'replace', reason: 'Уехал', member: J1, by: 'H' })
  })

  it('вид для ответа проходит проверку протокола', () => {
    const c = poolCase([filed('B', FILED), joined('C', FILED + 1), replaced('H', J1, FILED + 2), voted('H', FILED + 3, { verdict: 'change', outcome: '2' })])
    const view = eventView(eventOf(POOL), FILED + 4, c)
    expect(isEventView(view)).toBe(true)
    expect(view.outcome?.appeal?.joined.map((j) => j.by)).toEqual(['C'])
    expect(isEventView({ ...view, outcome: { ...view.outcome, court: { ...view.outcome?.court, seats: 'нет' } } })).toBe(false)
    expect(isEventView({ ...view, outcome: { ...view.outcome, appeal: { by: 'B' } } })).toBe(false)
  })
})

describe('журнал комнаты (logAppeals, Р-25)', () => {
  // Записи журнала — те же, что записи правил, плюс номер запроса; у court.drawn номера нет
  const toLog = (r: AppealRecord, requestId: string): LogEntry => (r.type === 'court.drawn' ? r : { ...r, requestId }) as LogEntry

  it('записи appeal.* и court.* журнала — те же дела суда, что у записей правил', () => {
    const records = [
      filed('B', FILED),
      joined('C', FILED + 1),
      replaced('H', J1, FILED + 2),
      voted('H', FILED + 3, { verdict: 'change', outcome: '2' }),
      voted(J2, FILED + 4, { verdict: 'keep' }),
    ]
    const log = [...POOL, ...records.map((r, i) => toLog(r, 'QA' + i))]
    const cases = logAppeals(log)
    expect(cases).toEqual(roomAppeals(records, { events: roomEvents(log), offers: [] }, ROOM))
    expect(caseOf(cases, 'E1')?.acts.map((a) => a.type)).toEqual(['replace', 'vote', 'vote'])
    // Номер запроса в запись правил не идёт; прочие записи журнала — не апелляция
    expect(log.filter(isAppealEntry).map(appealRecord)).toEqual(records)
    expect(POOL.some(isAppealEntry)).toBe(false)
  })

  it('суд по «ждёт суда» из журнала; комнаты нет — дел нет', () => {
    const log = [...POOL, object('B', P + HOUR), toLog(drawn(P + VOTING_TIME + HOUR, ['D', 'E', 'F']), '')]
    // Ведущий не ставил — решал бы он; без его решения «ждёт суда» не наступает: записи нет в деле
    expect(logAppeals(log)).toEqual([])
    const tie = [...roomLog(MEMBERS), created('H'), bet('A', '1', 300), bet('B', '2', 100), propose('A', '1'), object('B', P + HOUR)]
    // Ведущий — предмет спора: голосуют C, D, E, F; никто не голосовал — «ждёт суда» через 72 часа
    const at = P + HOUR + VOTING_TIME
    const withCourt = [...tie, toLog(drawn(at, ['C', 'D', 'E', 'F']), '')]
    expect(caseOf(logAppeals(withCourt), 'E1')).toMatchObject({ appeal: null, drawnAt: at, candidates: ['C', 'D', 'E', 'F'] })
    expect(logAppeals(withCourt.slice(1))).toEqual([])
    expect(courtRoomOf(foldLog(withCourt) as RoomState)).toEqual(courtRoom(MEMBERS))
  })
})
