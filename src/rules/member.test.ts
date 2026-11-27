import { describe, expect, it } from 'vitest'
import { checkReplace, courtCandidates, courtRoom, logAppeals, ONLY_HOST } from './appeal'
import { logChoices } from './choice'
import { formatCountdown } from './date'
import { eventOutcome, hostDecides, hostMayDecide, mayPropose, roomEvents } from './event'
import { logLots } from './lot'
import {
  ALREADY_CLOSED,
  ALREADY_DROPPED,
  ALREADY_HOST,
  checkActive,
  checkClose,
  checkDrop,
  checkLeave,
  checkOpen,
  checkReopen,
  NOT_CLOSED,
  ONLY_HOST_CLOSE,
  openAuction,
  openChoiceIn,
  openCourt,
  openEvent,
  openLotIn,
  openOfferIn,
  ROOM_CLOSED,
  checkPassHost,
  checkTakeHost,
  DROPPED,
  guarantorIn,
  HOST_AWAY,
  HOST_LEAVES,
  HOST_NOT_DROPPED,
  hostPassedTo,
  hostSeen,
  hostSeenAt,
  hostTakenBy,
  leaveRevocations,
  MEMBER_LEFT,
  NO_MEMBER,
  NOT_DROPPED,
  ONLY_HOST_DROP,
  ONLY_HOST_PASS,
  openBet,
  openOffer,
  PASS_DROPPED,
  PASS_LEFT,
  PASS_SELF,
  playingMembers,
  roomMembers,
  TAKE_DROPPED,
  takeHostFrom,
  UNKEPT_PROMISE,
  UNSETTLED,
  type LeaveRoom,
} from './member'
import { logOffers, offerOutcome, roomRoles, SIDE_SILENCE } from './offer'
import { logPace } from './pace'
import { absentAt, foldLog, hostAt, hostSince, isClosed, joinRequests, keyMember, nameTaken, returningMember, type LogEntry } from './room'
import type { PromiseRecord, TransferRecord } from './settle'

// Записи о переводах из журнала — как у сервера
const logTransfers = (log: readonly LogEntry[]): TransferRecord[] => log.filter((e): e is TransferRecord & LogEntry => e.type.startsWith('transfer.'))

const base: LogEntry[] = [
  { id: 'E1', at: 100, memberId: 'M1', type: 'room.created', roomId: 'R1', name: 'Дача', currency: 'RUB' },
  { id: 'E2', at: 100, memberId: 'M1', type: 'member.added', member: 'M1', name: 'Аня' },
  { id: 'E3', at: 200, memberId: 'M1', type: 'member.added', member: 'M2', name: 'Боря' },
  { id: 'E4', at: 300, memberId: 'M1', type: 'member.added', member: 'M3', name: 'Вера' },
  { id: 'E5', at: 400, memberId: 'M1', type: 'member.added', member: 'M4', name: 'Гоша' },
]

const left = (who: string, at: number, id = 'L' + who + at): LogEntry => ({ id, at, memberId: who, type: 'member.left', requestId: id })
const drop = (who: string, at: number, by = 'M1'): LogEntry => ({ id: 'D' + who + at, at, memberId: by, type: 'member.dropped', member: who, requestId: 'D' + who + at })
const restore = (who: string, at: number, by = 'M1'): LogEntry => ({ id: 'U' + who + at, at, memberId: by, type: 'member.reinstated', member: who, requestId: 'U' + who + at })

describe('свёртка: вышел, вернулся, «выбыл»', () => {
  it('старая комната без новых записей — все в комнате и в игре', () => {
    const state = foldLog(base)!
    expect(state.members.every((m) => m.leftAt === undefined && m.droppedAt === undefined && m.absent === undefined)).toBe(true)
    expect(playingMembers(state)).toEqual(['M1', 'M2', 'M3', 'M4'])
  })

  it('вышел и вернулся — тот же участник; «выбыл» ставит и снимает ведущий; промежутки вне игры', () => {
    const log: LogEntry[] = [
      ...base,
      left('M2', 1000),
      { id: 'J1', at: 1500, memberId: 'Q1', type: 'join.requested', request: 'Q1', name: 'боря' },
      { id: 'B1', at: 2000, memberId: 'M1', type: 'member.returned', member: 'M2', request: 'Q1' },
      drop('M3', 3000),
      restore('M3', 4000),
    ]
    const state = foldLog(log)!
    expect(state.members.map((m) => m.id)).toEqual(['M1', 'M2', 'M3', 'M4'])
    const borya = state.members[1]
    expect(borya).toMatchObject({ id: 'M2', name: 'Боря', addedAt: 200, absent: [{ why: 'left', from: 1000, to: 2000 }] })
    expect(borya.leftAt).toBeUndefined()
    expect(state.members[2]).toMatchObject({ absent: [{ why: 'dropped', from: 3000, to: 4000 }] })
    expect(state.members[2].droppedAt).toBeUndefined()
    // Заявка-возврат — впущена; ключ заявки — того участника
    const requests = joinRequests(log)
    expect(requests).toEqual([{ id: 'Q1', name: 'боря', at: 1500, status: 'admitted', member: 'M2' }])
    expect(keyMember(requests, 'Q1')).toBe('M2')
    expect(keyMember(requests, 'M3')).toBe('M3')
  })

  it('ведущий не выходит и не «выбыл»; не ведущий не ставит пометку; вышедшего не пометить', () => {
    const state = foldLog([...base, left('M1', 1000), drop('M1', 1100), drop('M3', 1200, 'M2'), left('M4', 1300), drop('M4', 1400)])!
    expect(state.members.map((m) => [m.leftAt, m.droppedAt])).toEqual([
      [undefined, undefined],
      [undefined, undefined],
      [undefined, undefined],
      [1300, undefined],
    ])
    expect(roomMembers(state)).toEqual(['M1', 'M2', 'M3'])
  })

  it('имя вышедшего не занято — заявка с ним — возврат; имя участника в комнате — занято', () => {
    const state = foldLog([...base, left('M2', 1000)])!
    expect(nameTaken(state, [], 'БОРЯ')).toBe(false)
    expect(returningMember(state, ' боря ')?.id).toBe('M2')
    expect(nameTaken(state, [], 'Вера')).toBe(true)
    expect(returningMember(state, 'Вера')).toBeNull()
  })

  it('вне игры на миг: from < at ≤ to — суд в миг пометки ещё с участником, в миг снятия — ещё без', () => {
    const m = { absent: [{ why: 'dropped' as const, from: 1000, to: 2000 }, { why: 'left' as const, from: 3000, to: null }] }
    expect([999, 1000, 1001, 2000, 2001, 3000, 3001, 1e12].map((t) => absentAt(m, t))).toEqual([false, false, true, true, false, false, true, true])
  })
})

// Событие Бори: приём до 10 000, исход к 20 000
const event: LogEntry = {
  id: 'V1',
  at: 500,
  memberId: 'M2',
  type: 'event.created',
  condition: 'Вася пробежит 10 км',
  check: 'Скрин',
  outcomes: [
    { id: '1', title: 'Да' },
    { id: '2', title: 'Нет' },
  ],
  closesAt: 10_000,
  expectedAt: 20_000,
  subject: null,
  requestId: 'V1',
}

describe('жребий суда без выбывших и вышедших', () => {
  it('кандидаты — участники в игре на миг жребия', () => {
    const log = [...base, event, drop('M3', 1000), left('M4', 1000)]
    const target = { kind: 'event' as const, event: roomEvents(log)[0] }
    const room = courtRoom(foldLog(log)!)
    // Автор события Боря заинтересован; Вера выбыла, Гоша вышел — с 1000
    expect(courtCandidates(target, room, 1000)).toEqual(['M1', 'M3', 'M4'])
    expect(courtCandidates(target, room, 1001)).toEqual(['M1'])
    const back = courtRoom(foldLog([...log, restore('M3', 5000)])!)
    expect(courtCandidates(target, back, 5000)).toEqual(['M1'])
    expect(courtCandidates(target, back, 5001)).toEqual(['M1', 'M3'])
  })
})

describe('«выбыл»: пометка и запреты', () => {
  const state = foldLog([...base, drop('M3', 1000), left('M4', 1000)])!

  it('ставит и снимает только ведущий; ведущего и вышедшего не помечают; дважды — отказ', () => {
    expect(checkDrop(state, 'M2', 'M3', false)).toBe(ONLY_HOST_DROP)
    expect(checkDrop(state, 'M1', 'M1', true)).toBe(HOST_NOT_DROPPED)
    expect(checkDrop(state, 'M1', 'M4', true)).toBe(MEMBER_LEFT)
    expect(checkDrop(state, 'M1', 'M9', true)).toBe(NO_MEMBER)
    expect(checkDrop(state, 'M1', 42, true)).toBe(NO_MEMBER)
    expect(checkDrop(state, 'M1', 'M3', true)).toBe(ALREADY_DROPPED)
    expect(checkDrop(state, 'M1', 'M2', false)).toBe(NOT_DROPPED)
    expect(checkDrop(state, 'M1', 'M2', true)).toBeNull()
    expect(checkDrop(state, 'M1', 'M3', false)).toBeNull()
  })

  it('выбывшему нового нельзя; остальным — можно; в игре — не выбывшие и не вышедшие', () => {
    expect(checkActive(state, 'M3')).toBe(DROPPED)
    expect(checkActive(state, 'M2')).toBeNull()
    expect(playingMembers(state)).toEqual(['M1', 'M2'])
    expect(roomMembers(state)).toEqual(['M1', 'M2', 'M3'])
  })
})

// Пари Бори Вере, гарант — Гоша (правило гаранта): приём до 10 000, исход к 20 000
const offer = (change: Partial<Extract<LogEntry, { type: 'offer.created' }>> = {}): LogEntry => ({
  id: 'P1',
  at: 1000,
  memberId: 'M2',
  type: 'offer.created',
  condition: 'Вася бросит курить',
  check: 'Скажет сам',
  side: 'yes',
  odds: { a: 1, b: 1 },
  amount: 100,
  to: 'M3',
  closesAt: 10_000,
  expectedAt: 20_000,
  guarantor: 'M4',
  counterTo: null,
  guarantorRule: 1,
  requestId: 'P1',
  ...change,
})
const accepted: LogEntry = { id: 'P2', at: 2000, memberId: 'M3', type: 'offer.accepted', offer: 'P1', requestId: 'P2' }
const marks: LogEntry[] = [
  { id: 'P3', at: 20_000, memberId: 'M2', type: 'offer.marked', offer: 'P1', winner: 'author', requestId: 'P3' },
  { id: 'P4', at: 20_000, memberId: 'M3', type: 'offer.marked', offer: 'P1', winner: 'taker', requestId: 'P4' },
]

describe('выбывший гарант — молчание гаранта', () => {
  const outcome = (log: LogEntry[], now: number) => offerOutcome(logOffers(log)[0], now)

  it('без пометки — решает гарант срок молчания', () => {
    expect(outcome([...base, offer(), accepted, ...marks], 30_000)).toMatchObject({ phase: 'guarantor', guarantorUntil: 20_000 + SIDE_SILENCE })
  })

  it('помечен, когда решение у него, — сразу «нужен другой гарант»', () => {
    const log = [...base, offer(), accepted, ...marks, drop('M4', 25_000)]
    expect(outcome(log, 25_000)).toMatchObject({ phase: 'need-guarantor', needSince: 25_000, guarantorUntil: 25_000 })
  })

  it('помечен заранее — «нужен другой гарант», как только решение перешло бы к нему', () => {
    const log = [...base, offer(), accepted, drop('M4', 5000), ...marks]
    expect(outcome(log, 20_000)).toMatchObject({ phase: 'need-guarantor', needSince: 20_000 })
    expect(outcome(log, 19_999)).toMatchObject({ phase: 'marking' })
  })

  it('пометку сняли до хода гаранта — гарант снова решает; после — так и нужен другой', () => {
    const early = [...base, offer(), accepted, drop('M4', 5000), restore('M4', 6000), ...marks]
    expect(outcome(early, 30_000)).toMatchObject({ phase: 'guarantor', guarantorUntil: 20_000 + SIDE_SILENCE })
    const late = [...base, offer(), accepted, ...marks, drop('M4', 25_000), restore('M4', 26_000)]
    expect(outcome(late, 30_000)).toMatchObject({ phase: 'need-guarantor', needSince: 25_000 })
  })

  it('пометку не от ведущего свёртка не берёт', () => {
    const log = [...base, offer(), accepted, ...marks, drop('M4', 25_000, 'M2')]
    expect(outcome(log, 25_000)).toMatchObject({ phase: 'guarantor' })
  })
})

describe('выйти: что мешает', () => {
  const room = (log: LogEntry[]): LeaveRoom => {
    const events = roomEvents(log)
    const offers = logOffers(log)
    const promises = log.filter((e): e is PromiseRecord & LogEntry => e.type.startsWith('promise.'))
    return { state: foldLog(log)!, events, offers, lots: [], choices: [], cases: [], transfers: logTransfers(log), promises }
  }

  it('ведущему — передать ведение; без открытого и с отмеченными переводами — можно', () => {
    expect(checkLeave(room(base), 'M1', 1000)).toBe(HOST_LEAVES)
    expect(checkLeave(room(base), 'M2', 1000)).toBeNull()
    expect(checkLeave(room([...base, left('M2', 900)]), 'M2', 1000)).toBe(NO_MEMBER)
  })

  it('ставка в незавершённом событии; принятое пари; гарант; переводы — первое по порядку', () => {
    const bet: LogEntry = { id: 'B1', at: 600, memberId: 'M2', type: 'bet.placed', event: 'V1', outcome: '1', amount: 100, requestId: 'B1' }
    expect(checkLeave(room([...base, event, bet]), 'M2', 1000)).toBe(openBet('Вася пробежит 10 км'))
    const log = [...base, offer(), accepted]
    expect(checkLeave(room(log), 'M2', 3000)).toBe(openOffer('Вася бросит курить'))
    expect(checkLeave(room(log), 'M3', 3000)).toBe(openOffer('Вася бросит курить'))
    expect(checkLeave(room(log), 'M4', 3000)).toBe(guarantorIn('Вася бросит курить'))
    // Гарант непринятого чужого пари — тоже мешает
    expect(checkLeave(room([...base, offer()]), 'M4', 3000)).toBe(guarantorIn('Вася бросит курить'))
    const sent: LogEntry = { id: 'T1', at: 700, memberId: 'M2', type: 'transfer.sent', to: 'M3', amount: 50, requestId: 'T1' }
    expect(checkLeave(room([...base, sent]), 'M2', 1000)).toBe(UNSETTLED)
    expect(checkLeave(room([...base, sent]), 'M3', 1000)).toBe(UNSETTLED)
    // Подтверждён — у обоих баланс не ноль (долга нет, а перевод был): тоже «не отмечены»
    const got: LogEntry = { id: 'T2', at: 800, memberId: 'M3', type: 'transfer.received', transfer: 'T1', requestId: 'T2' }
    expect(checkLeave(room([...base, sent, got]), 'M2', 1000)).toBe(UNSETTLED)
    // Ставка раньше перевода — называется ставка
    expect(checkLeave(room([...base, event, bet, sent]), 'M2', 1000)).toBe(openBet('Вася пробежит 10 км'))
  })

  it('свои непринятые пари отзываются сами: открытое — да; принятое и истёкшее — нет', () => {
    const open = offer({ guarantor: 'M1' })
    const expired = offer({ id: 'P9', requestId: 'P9', guarantor: 'M1', closesAt: 1500, expectedAt: 20_000 })
    const offers = logOffers([...base, open, expired])
    expect(leaveRevocations(offers, 'M2', 3000).map((o) => o.id)).toEqual(['P1'])
    expect(leaveRevocations(offers, 'M3', 3000)).toEqual([])
    expect(leaveRevocations(logOffers([...base, open, accepted]), 'M2', 3000)).toEqual([])
    // Отзываемое не мешает выйти
    expect(checkLeave(room([...base, open, expired]), 'M2', 3000)).toBeNull()
  })

  it('обещание (Р-44) не «получено» — как неотмеченный перевод: мешает обеим сторонам, и в комнате на очки', () => {
    const promise = offer({ odds: { a: 1, b: 1 }, amount: 0, promise: { author: 'Везу шашлык', taker: 'Везу шашлык' } })
    const agreed: LogEntry[] = [
      { id: 'P3', at: 20_000, memberId: 'M2', type: 'offer.marked', offer: 'P1', winner: 'taker', requestId: 'P3' },
      { id: 'P4', at: 20_000, memberId: 'M3', type: 'offer.marked', offer: 'P1', winner: 'taker', requestId: 'P4' },
    ]
    const kept: LogEntry = { id: 'K1', at: 21_000, memberId: 'M2', type: 'promise.kept', offer: 'P1', requestId: 'K1' }
    const got: LogEntry = { id: 'K2', at: 22_000, memberId: 'M3', type: 'promise.received', offer: 'P1', requestId: 'K2' }
    const log = [...base, promise, accepted, ...agreed]
    expect(checkLeave(room(log), 'M2', 30_000)).toBe(UNKEPT_PROMISE)
    expect(checkLeave(room(log), 'M3', 30_000)).toBe(UNKEPT_PROMISE)
    expect(checkLeave(room(log), 'M4', 30_000)).toBeNull()
    expect(checkLeave(room([...log, kept]), 'M3', 30_000)).toBe(UNKEPT_PROMISE)
    expect(checkLeave(room([...log, kept, got]), 'M2', 30_000)).toBeNull()
    expect(checkLeave(room([...log, kept, got]), 'M3', 30_000)).toBeNull()
    const points = [{ ...base[0], currency: 'PTS' } as LogEntry, ...log.slice(1)]
    expect(checkLeave(room(points), 'M2', 30_000)).toBe(UNKEPT_PROMISE)
    // Без записей обещаний (вход до выкатки) — отметок нет: обещание ждёт
    expect(checkLeave({ ...room([...log, kept, got]), promises: undefined }, 'M2', 30_000)).toBe(UNKEPT_PROMISE)
  })
})

// Ведение (Р-42)
const pass = (to: string, at: number, by = 'M1'): LogEntry => ({ id: 'H' + to + at, at, memberId: by, type: 'host.passed', member: to, requestId: 'H' + to + at })
const take = (who: string, at: number, from = 'M1', seenAt = 0): LogEntry => ({ id: 'T' + who + at, at, memberId: who, type: 'host.taken', from, seenAt, requestId: 'T' + who + at })

describe('ведение: свёртка и ведущий на миг записи', () => {
  it('старая комната без новых записей — ведущий создатель всё время', () => {
    const state = foldLog(base)!
    expect(state.hostId).toBe('M1')
    expect(state.hosts).toEqual([{ member: 'M1', from: 100, how: 'created', by: 'M1', id: 'E1' }])
    expect([0, 100, 10_000].map((at) => hostAt(state, at))).toEqual(['M1', 'M1', 'M1'])
    // Состояние не из журнала (без сроков) — ведущий hostId
    expect(hostAt({ hostId: 'M9' }, 5)).toBe('M9')
  })

  it('передал и взяли — нынешний ведущий; сроки ведения по порядку; смена действует с её мига', () => {
    const state = foldLog([...base, pass('M2', 1000), take('M3', 9000, 'M2', 1000)])!
    expect(state.hostId).toBe('M3')
    expect(state.hosts?.map((h) => [h.member, h.from, h.how, h.by])).toEqual([
      ['M1', 100, 'created', 'M1'],
      ['M2', 1000, 'passed', 'M1'],
      ['M3', 9000, 'taken', 'M3'],
    ])
    expect([999, 1000, 8999, 9000].map((at) => hostAt(state, at))).toEqual(['M1', 'M2', 'M2', 'M3'])
    expect(hostSince(state)).toBe(9000)
  })

  it('свёртка держит порядок: передаёт только ведущий, кому — участник в игре; берут у нынешнего', () => {
    const log: LogEntry[] = [
      ...base,
      left('M4', 500),
      drop('M3', 600),
      pass('M2', 1000, 'M2'), // не ведущий
      pass('M1', 1100), // себе
      pass('M4', 1200), // вышедшему
      pass('M3', 1300), // выбывшему
      pass('M9', 1400), // не участнику
      take('M3', 1500), // выбывший берёт
      take('M2', 1600, 'M3'), // берут не у нынешнего
    ]
    const state = foldLog(log)!
    expect(state.hostId).toBe('M1')
    expect(state.hosts).toHaveLength(1)
  })

  it('прежний ведущий — обычный участник: выходит и «выбыл», не помечает; новый — помечает', () => {
    const log = [...base, pass('M2', 1000)]
    const state = foldLog(log)!
    expect(checkDrop(state, 'M1', 'M3', true)).toBe(ONLY_HOST_DROP)
    expect(checkDrop(state, 'M2', 'M1', true)).toBeNull()
    expect(checkLeave({ state, events: [], offers: [], lots: [], choices: [], cases: [], transfers: [] }, 'M1', 2000)).toBeNull()
    expect(checkLeave({ state, events: [], offers: [], lots: [], choices: [], cases: [], transfers: [] }, 'M2', 2000)).toBe(HOST_LEAVES)
    // Свёртка: прежний вышел, новый пометил
    const after = foldLog([...log, left('M1', 2000), drop('M3', 2100, 'M2')])!
    expect(after.members.map((m) => [m.leftAt, m.droppedAt])).toEqual([
      [2000, undefined],
      [undefined, undefined],
      [undefined, 2100],
      [undefined, undefined],
    ])
  })
})

describe('передать ведение', () => {
  it('только ведущий; кому — участник в комнате, не «выбыл», не сам', () => {
    const state = foldLog([...base, left('M4', 500), drop('M3', 600)])!
    expect(checkPassHost(state, 'M2', 'M3')).toBe(ONLY_HOST_PASS)
    expect(checkPassHost(state, 'M1', 'M1')).toBe(PASS_SELF)
    expect(checkPassHost(state, 'M1', 'M4')).toBe(PASS_LEFT)
    expect(checkPassHost(state, 'M1', 'M3')).toBe(PASS_DROPPED)
    expect(checkPassHost(state, 'M1', 'M9')).toBe(NO_MEMBER)
    expect(checkPassHost(state, 'M1', 7)).toBe(NO_MEMBER)
    expect(checkPassHost(state, 'M1', 'M2')).toBeNull()
  })
})

describe('взять ведение', () => {
  const DAY = 24 * 60 * 60 * 1000
  const HOUR = 60 * 60 * 1000
  const SEEN = 10_000

  it('когда ведущий заходил: запись сервера, его записи в журнале (кроме жребия сервера), не раньше, чем стал ведущим', () => {
    const state = foldLog(base)!
    expect(hostSeenAt(base, state, undefined)).toBe(400)
    expect(hostSeenAt(base, state, SEEN)).toBe(SEEN)
    const drawn: LogEntry = { id: 'C1', at: 50_000, memberId: 'M1', type: 'court.drawn', target: 'V1', seed: 'ab', candidates: ['M2'] }
    const own: LogEntry = { id: 'I1', at: 40_000, memberId: 'M1', type: 'invite.changed' }
    expect(hostSeenAt([...base, own, drawn], state, SEEN)).toBe(40_000)
    // Ведение передано — считается с мига передачи, хоть новый ещё и не заходил
    const log = [...base, pass('M2', 30_000)]
    expect(hostSeenAt(log, foldLog(log)!, SEEN)).toBe(30_000)
    expect(takeHostFrom(SEEN)).toBe(SEEN + 7 * DAY)
    expect(HOST_AWAY).toBe(7 * DAY)
  })

  it('рано, рано на час — отказ с основанием; вовремя — можно; срок один при любом темпе', () => {
    const fast: LogEntry = { ...base[0], pace: 'fast' } as LogEntry
    for (const log of [base, [fast, ...base.slice(1)]]) {
      const state = foldLog(log)!
      expect(checkTakeHost(state, 'M2', SEEN, SEEN + DAY)).toBe(hostSeen(formatCountdown(DAY), formatCountdown(6 * DAY)))
      expect(checkTakeHost(state, 'M2', SEEN, SEEN + 7 * DAY - HOUR)).toBe(hostSeen(formatCountdown(7 * DAY - HOUR), formatCountdown(HOUR)))
      expect(checkTakeHost(state, 'M2', SEEN, SEEN + 7 * DAY)).toBeNull()
    }
  })

  it('кто берёт: участник в комнате, не «выбыл», не сам ведущий', () => {
    const state = foldLog([...base, left('M4', 500), drop('M3', 600)])!
    const late = SEEN + 8 * DAY
    expect(checkTakeHost(state, 'M1', SEEN, late)).toBe(ALREADY_HOST)
    expect(checkTakeHost(state, 'M3', SEEN, late)).toBe(TAKE_DROPPED)
    expect(checkTakeHost(state, 'M4', SEEN, late)).toBe(NO_MEMBER)
    expect(checkTakeHost(state, 'M9', SEEN, late)).toBe(NO_MEMBER)
    expect(checkTakeHost(state, 'M2', SEEN, late)).toBeNull()
  })

  it('двое подряд: взял первый — второму «Ведение уже взял …»; передано недавно — «уже передано»', () => {
    const at = SEEN + 7 * DAY
    const log = [...base, take('M2', at, 'M1', SEEN)]
    const state = foldLog(log)!
    expect(state.hostId).toBe('M2')
    expect(checkTakeHost(state, 'M3', hostSeenAt(log, state, undefined), at)).toBe(hostTakenBy('Боря'))
    const passed = [...base, pass('M3', at)]
    expect(checkTakeHost(foldLog(passed)!, 'M2', at, at + HOUR)).toBe(hostPassedTo('Вера'))
    // Через 7 дней без запросов нового ведущего — берут и у него
    expect(checkTakeHost(state, 'M3', at, at + 7 * DAY)).toBeNull()
  })
})

describe('ведущий на миг записи в событиях, пари, суде и темпе', () => {
  const created = (id: string, at: number, by: string): LogEntry => ({
    id,
    at,
    memberId: by,
    type: 'event.created',
    condition: 'Вася пробежит 10 км',
    check: 'Скрин',
    outcomes: [
      { id: '1', title: 'Да' },
      { id: '2', title: 'Нет' },
    ],
    closesAt: 50_000,
    expectedAt: 60_000,
    subject: null,
    requestId: id,
  })
  const bet = (event: string, who: string, at: number): LogEntry => ({ id: 'B' + event + who, at, memberId: who, type: 'bet.placed', event, outcome: '1', amount: 100, requestId: 'B' + event + who })

  it('событие: способ спора — по ведущему на миг создания; решает нынешний, если сам не ставил', () => {
    const log = [...base, created('V1', 500, 'M2'), bet('V1', 'M3', 600), pass('M3', 1000), created('V2', 1100, 'M2'), bet('V2', 'M1', 1200)]
    const [v1, v2] = roomEvents(log)
    expect([v1.hostId, v2.hostId]).toEqual(['M1', 'M3'])
    // V1: при Ане решает ведущий; нынешняя Вера ставила — не решает, Аня — уже не ведущая
    expect(hostDecides(v1)).toBe(true)
    expect(hostMayDecide(v1, 'M3')).toBe(false)
    expect(hostMayDecide(v1, 'M4')).toBe(true)
    // V2: при Вере, она не ставила — решает ведущий; ставившая Аня ведущей не была
    expect(hostDecides(v2)).toBe(true)
    expect(hostMayDecide(v2, 'M3')).toBe(true)
  })

  it('событие: за молчащего автора предлагает нынешний ведущий; «ведущий о себе» — ведущий на миг создания', () => {
    const silent = { ...roomEvents([...base, created('V1', 500, 'M2')])[0] }
    const later = 60_000 + 3 * 24 * 60 * 60 * 1000
    expect(mayPropose(silent, 'M3', later, 'M3')).toBe(true)
    expect(mayPropose(silent, 'M1', later, 'M3')).toBe(false)
    // Без нынешнего ведущего — ведущий события, как раньше
    expect(mayPropose(silent, 'M1', later)).toBe(true)
  })

  it('пари: гарант закреплён в записи — после смены ведения тот же; гарант по умолчанию — ведущий на миг создания', () => {
    const own = offer({ guarantor: 'M1', to: 'M3' })
    const log = [...base, own, pass('M4', 1500)]
    expect(logOffers(log)[0].guarantorId).toBe('M1')
    expect(roomRoles(foldLog(log)!).hosts).toHaveLength(2)
  })

  it('суд: досрочно заменяет нынешний ведущий; по умолчанию — ведущий на миг жребия', () => {
    const c = { target: 'V1', appeal: null, seed: 'ab', candidates: ['M2', 'M3', 'M4'], drawnAt: 0, hostId: 'M1', acts: [] }
    expect(checkReplace(c, 'M2', 'M3', 'Не отвечает', 1)).toBe(ONLY_HOST)
    expect(checkReplace(c, 'M2', 'M3', 'Не отвечает', 1, 'M2')).toBeNull()
    expect(checkReplace(c, 'M1', 'M3', 'Не отвечает', 1, 'M2')).toBe(ONLY_HOST)
    expect(courtRoom(foldLog([...base, pass('M2', 1000)])!).hosts).toHaveLength(2)
  })

  it('темп: меняет нынешний ведущий; прежний после передачи — нет', () => {
    const paced = (by: string, at: number): LogEntry => ({ id: 'S' + by + at, at, memberId: by, type: 'room.pace', pace: 'fast', requestId: 'S' + by + at })
    expect(logPace([...base, pass('M2', 1000), paced('M1', 2000)]).pace).toBe('normal')
    expect(logPace([...base, pass('M2', 1000), paced('M2', 2000)]).pace).toBe('fast')
    expect(logPace([...base, paced('M1', 900), pass('M2', 1000)]).pace).toBe('fast')
  })
})

// Закрыть комнату (Р-43)
const close = (at: number, by = 'M1'): LogEntry => ({ id: 'C' + at, at, memberId: by, type: 'room.closed', requestId: 'C' + at })
const reopen = (at: number, by = 'M1'): LogEntry => ({ id: 'O' + at, at, memberId: by, type: 'room.reopened', requestId: 'O' + at })

describe('закрыть комнату: свёртка', () => {
  it('старая комната — открыта; закрыл ведущий — закрыта, открыл — снова открыта', () => {
    expect(isClosed(foldLog(base)!)).toBe(false)
    const closed = foldLog([...base, close(1000)])!
    expect(closed.closed).toEqual({ id: 'C1000', at: 1000, by: 'M1' })
    expect(isClosed(closed)).toBe(true)
    expect(checkOpen(closed)).toBe(ROOM_CLOSED)
    const again = foldLog([...base, close(1000), reopen(2000)])!
    expect(again.closed).toBeUndefined()
    expect(checkOpen(again)).toBeNull()
    expect(foldLog([...base, close(1000), reopen(2000), close(3000)])!.closed?.at).toBe(3000)
  })

  it('свёртка держит порядок: закрывает и открывает нынешний ведущий; закрытую второй раз не закрыть', () => {
    expect(foldLog([...base, close(1000, 'M2')])!.closed).toBeUndefined()
    expect(foldLog([...base, close(1000), reopen(2000, 'M2')])!.closed?.at).toBe(1000)
    expect(foldLog([...base, close(1000), close(2000)])!.closed?.at).toBe(1000)
    expect(foldLog([...base, reopen(1000)])!.closed).toBeUndefined()
    // После передачи ведения — новый ведущий, прежний — нет
    expect(foldLog([...base, pass('M2', 500), close(1000)])!.closed).toBeUndefined()
    expect(foldLog([...base, pass('M2', 500), close(1000, 'M2')])!.closed?.by).toBe('M2')
  })
})

describe('закрыть комнату: что мешает', () => {
  const room = (log: LogEntry[], cases: LeaveRoom['cases'] = []): LeaveRoom => {
    const events = roomEvents(log)
    const offers = logOffers(log)
    const lots = logLots(log)
    return { state: foldLog(log)!, events, offers, lots, choices: logChoices(log), cases: cases.length > 0 ? cases : logAppeals(log, { events, offers, lots }), transfers: logTransfers(log) }
  }
  const bet: LogEntry = { id: 'B1', at: 600, memberId: 'M2', type: 'bet.placed', event: 'V1', outcome: '1', amount: 100, requestId: 'B1' }
  // Автор Боря — единственный ставивший: его исход окончательный сразу (Р-21)
  const proposed: LogEntry = { id: 'X1', at: 10_500, memberId: 'M2', type: 'outcome.proposed', event: 'V1', outcome: '1', requestId: 'X1' }
  const lotLog: LogEntry = { id: 'L1', at: 1000, memberId: 'M2', type: 'lot.created', title: 'Велосипед', description: '', start: 100, step: 10, closesAt: 1000 + 60 * 60 * 1000, requestId: 'L1' }
  const choiceLog: LogEntry = {
    id: 'K1',
    at: 1000,
    memberId: 'M2',
    type: 'choice.created',
    question: 'Куда едем',
    options: [],
    recipient: 'M1',
    cashbox: false,
    optionsUntil: 1000 + 60 * 60 * 1000,
    closesAt: 1000 + 2 * 60 * 60 * 1000,
    requestId: 'K1',
  }

  it('только ведущий; закрытую — «уже закрыта»; пустая комната — можно', () => {
    expect(checkClose(room(base), 'M2', 1000)).toBe(ONLY_HOST_CLOSE)
    expect(checkClose(room(base), 'M1', 1000)).toBeNull()
    expect(checkClose(room([...base, close(900)]), 'M1', 1000)).toBe(ALREADY_CLOSED)
    // Переводы не мешают
    const sent: LogEntry = { id: 'T1', at: 700, memberId: 'M2', type: 'transfer.sent', to: 'M3', amount: 50, requestId: 'T1' }
    expect(checkClose(room([...base, sent]), 'M1', 1000)).toBeNull()
  })

  it('событие: идёт приём (и без ставок) — отказ; окончательное и отменённое — нет', () => {
    expect(checkClose(room([...base, event]), 'M1', 1000)).toBe(openEvent('Вася пробежит 10 км'))
    expect(checkClose(room([...base, event, bet]), 'M1', 15_000)).toBe(openEvent('Вася пробежит 10 км'))
    const done = [...base, event, bet, proposed]
    expect(eventOutcome(roomEvents(done)[0], 10_500)?.status).toBe('final')
    expect(checkClose(room(done), 'M1', 10_500)).toBeNull()
    const cancelled: LogEntry = { id: 'X2', at: 700, memberId: 'M2', type: 'event.cancelled', event: 'V1', reason: null }
    expect(checkClose(room([...base, event, bet, cancelled]), 'M1', 1000)).toBeNull()
  })

  it('пари: открытое и принятое без окончательного исхода — отказ; истёкшее и отозванное — нет', () => {
    expect(checkClose(room([...base, offer()]), 'M1', 3000)).toBe(openOfferIn('Вася бросит курить'))
    expect(checkClose(room([...base, offer(), accepted]), 'M1', 3000)).toBe(openOfferIn('Вася бросит курить'))
    expect(checkClose(room([...base, offer()]), 'M1', 10_000)).toBeNull()
    const revoked: LogEntry = { id: 'P5', at: 1500, memberId: 'M2', type: 'offer.revoked', offer: 'P1', requestId: 'P5' }
    expect(checkClose(room([...base, offer(), revoked]), 'M1', 3000)).toBeNull()
  })

  it('торг идёт — «Идёт торг»; кончился без встречных — нет', () => {
    const end = 1000 + 60 * 60 * 1000
    const auction = offer({ to: null, guarantor: 'M1', auction: { start: 50, step: 10 }, odds: { a: 100, b: 50 }, closesAt: end, expectedAt: end + 7 * 24 * 60 * 60 * 1000 })
    expect(logOffers([...base, auction])).toHaveLength(1)
    expect(checkClose(room([...base, auction]), 'M1', 3000)).toBe(openAuction('Вася бросит курить'))
    expect(checkClose(room([...base, auction]), 'M1', end)).toBeNull()
  })

  it('лот, «Выбор», суд — по порядку после событий и пари', () => {
    expect(checkClose(room([...base, lotLog]), 'M1', 2000)).toBe(openLotIn('Велосипед'))
    // Торг лота кончился без ставок — не продан, не мешает
    expect(checkClose(room([...base, lotLog]), 'M1', 1000 + 60 * 60 * 1000)).toBeNull()
    expect(checkClose(room([...base, choiceLog]), 'M1', 2000)).toBe(openChoiceIn('Куда едем'))
    // Меньше двух вариантов к «варианты до» — не состоялся
    expect(checkClose(room([...base, choiceLog]), 'M1', 1000 + 60 * 60 * 1000)).toBeNull()
    // Событие раньше лота
    expect(checkClose(room([...base, event, lotLog]), 'M1', 2000)).toBe(openEvent('Вася пробежит 10 км'))
    // Суд без решения — отказ с названием спора
    const done = [...base, event, bet, proposed]
    const court = { target: 'V1', appeal: null, seed: 'ab', candidates: ['M3', 'M4'], drawnAt: 10_500, hostId: 'M1', acts: [] }
    expect(checkClose({ ...room(done), events: [], cases: [court] }, 'M1', 10_600)).toBe(openCourt(''))
    expect(checkClose(room(done, [court]), 'M1', 10_600)).not.toBeNull()
  })

  it('открыть снова: только ведущий и только закрытую', () => {
    const closed = foldLog([...base, close(1000)])!
    expect(checkReopen(closed, 'M2')).toBe(ONLY_HOST_CLOSE)
    expect(checkReopen(closed, 'M1')).toBeNull()
    expect(checkReopen(foldLog(base)!, 'M1')).toBe(NOT_CLOSED)
  })
})
