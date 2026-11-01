import { describe, expect, it } from 'vitest'
import {
  isAdmitResponse,
  isCancelEventResponse,
  isClaimDeviceResponse,
  isClarifyEventResponse,
  isCreateEventResponse,
  isCreateRoomResponse,
  isDecideOutcomeResponse,
  isObjectOutcomeResponse,
  isPlaceBetResponse,
  isProposeOutcomeResponse,
  isVoteOutcomeResponse,
  isDeviceLinkResponse,
  isErrorResponse,
  isHealth,
  isInviteResponse,
  isJoinRequestsResponse,
  isJoinRoomResponse,
  isPreviewResponse,
  isRejectResponse,
  isRoomStateResponse,
  joinMark,
  PROTOCOL_VERSION,
} from './protocol'
import { ulid } from './ulid'

describe('isHealth', () => {
  it('узнаёт ответ сервера', () => {
    expect(isHealth({ v: PROTOCOL_VERSION, ok: true, time: 1 })).toBe(true)
  })
  it('чужое — нет', () => {
    expect(isHealth(null)).toBe(false)
    expect(isHealth('ok')).toBe(false)
    expect(isHealth({ ok: true })).toBe(false)
    expect(isHealth({ v: 1, ok: false, time: 1 })).toBe(false)
  })
})

describe('ответы комнат', () => {
  const created = { v: PROTOCOL_VERSION, roomId: 'R', invite: 'I', memberId: 'M', key: 'K' }
  const state = {
    v: PROTOCOL_VERSION,
    room: { id: 'R', name: 'Дача', currency: 'RUB', hostId: 'M', createdAt: 1 },
    members: [{ id: 'M', name: 'Аня' }],
    me: 'M',
    events: [],
    now: 5,
  }
  const event = {
    id: 'E',
    at: 1,
    authorId: 'M',
    condition: 'Условие',
    check: 'Как проверяем',
    outcomes: [
      { id: '1', title: 'Да' },
      { id: '2', title: 'Нет' },
    ],
    closesAt: 10,
    expectedAt: 20,
    subjectId: null,
  }
  const view = {
    ...event,
    status: 'open',
    clarifications: [{ id: 'C', at: 2, text: 'Уточнение' }],
    bets: [{ id: 'B', memberId: 'M', outcome: '1', amount: 100, at: 3 }],
    cancelled: null,
    refunds: [],
    outcome: null,
  }
  const mark = { id: 'P', at: 5, by: 'M', outcome: '1' }
  const outcome = {
    status: 'approved',
    proposal: mark,
    objectionUntil: 6,
    objections: [{ id: 'O', at: 5, by: 'N', reason: 'Не так' }],
    decision: { ...mark, id: 'D', by: 'H' },
    voters: [],
    votingUntil: null,
    votes: [],
    approved: { outcome: '1', at: 7, how: 'host', by: 'H' },
    finalAt: 8,
    void: false,
    payouts: [{ memberId: 'M', staked: 100, payout: 150, net: 50 }],
  }

  it('узнаёт ответ на создание', () => {
    expect(isCreateRoomResponse(created)).toBe(true)
    expect(isCreateRoomResponse({ ...created, key: undefined })).toBe(false)
    expect(isCreateRoomResponse({ v: PROTOCOL_VERSION, error: 'Неверный пароль компании' })).toBe(false)
  })
  it('узнаёт состояние комнаты', () => {
    expect(isRoomStateResponse(state)).toBe(true)
    expect(isRoomStateResponse({ ...state, members: [{ id: 'M' }] })).toBe(false)
    expect(isRoomStateResponse({ ...state, room: { ...state.room, createdAt: '1' } })).toBe(false)
    expect(isRoomStateResponse({ ...state, me: undefined })).toBe(false)
  })
  it('состояние комнаты: события и время сервера', () => {
    expect(isRoomStateResponse({ ...state, events: [view] })).toBe(true)
    const cancelled = { ...view, status: 'cancelled', cancelled: { at: 4, by: 'M', reason: null }, refunds: [{ memberId: 'M', amount: 100 }] }
    expect(isRoomStateResponse({ ...state, events: [cancelled] })).toBe(true)
    expect(isRoomStateResponse({ ...state, events: [{ ...view, subjectId: 'M' }] })).toBe(true)
    expect(isRoomStateResponse({ ...state, now: undefined })).toBe(false)
    expect(isRoomStateResponse({ ...state, events: undefined })).toBe(false)
    expect(isRoomStateResponse({ ...state, events: [{ ...view, status: 'потом' }] })).toBe(false)
    expect(isRoomStateResponse({ ...state, events: [{ ...view, outcomes: [{ id: '1', title: 'Да' }] }] })).toBe(false)
    expect(isRoomStateResponse({ ...state, events: [{ ...view, bets: [{ id: 'B', memberId: 'M', outcome: '1' }] }] })).toBe(false)
    expect(isRoomStateResponse({ ...state, events: [{ ...view, cancelled: { at: 4 } }] })).toBe(false)
    expect(isRoomStateResponse({ ...state, events: [{ ...view, refunds: undefined }] })).toBe(false)
  })
  it('состояние комнаты: исход события', () => {
    expect(isRoomStateResponse({ ...state, events: [{ ...view, outcome }] })).toBe(true)
    const voting = { ...outcome, status: 'voting', decision: null, voters: ['A', 'B'], votingUntil: 9, votes: [{ ...mark, by: 'A' }], approved: null, finalAt: null, payouts: [] }
    expect(isRoomStateResponse({ ...state, events: [{ ...view, outcome: voting }] })).toBe(true)
    expect(isRoomStateResponse({ ...state, events: [{ ...view, outcome: undefined }] })).toBe(false)
    expect(isRoomStateResponse({ ...state, events: [{ ...view, outcome: { ...outcome, status: 'потом' } }] })).toBe(false)
    expect(isRoomStateResponse({ ...state, events: [{ ...view, outcome: { ...outcome, proposal: null } }] })).toBe(false)
    expect(isRoomStateResponse({ ...state, events: [{ ...view, outcome: { ...outcome, objections: [{ id: 'O', at: 5, by: 'N' }] } }] })).toBe(false)
    expect(isRoomStateResponse({ ...state, events: [{ ...view, outcome: { ...outcome, approved: { ...outcome.approved, how: 'жребий' } } }] })).toBe(false)
    expect(isRoomStateResponse({ ...state, events: [{ ...view, outcome: { ...outcome, payouts: [{ memberId: 'M', payout: 1 }] } }] })).toBe(false)
    expect(isRoomStateResponse({ ...state, events: [{ ...view, outcome: { ...outcome, void: undefined } }] })).toBe(false)
  })
  it('ответы действий с исходом', () => {
    const v = PROTOCOL_VERSION
    expect(isProposeOutcomeResponse({ v, proposal: mark })).toBe(true)
    expect(isProposeOutcomeResponse({ v, proposal: { ...mark, outcome: 1 } })).toBe(false)
    expect(isObjectOutcomeResponse({ v, objection: { id: 'O', at: 5, by: 'N', reason: 'Не так' } })).toBe(true)
    expect(isObjectOutcomeResponse({ v, objection: mark })).toBe(false)
    expect(isDecideOutcomeResponse({ v, decision: mark })).toBe(true)
    expect(isDecideOutcomeResponse({ decision: mark })).toBe(false)
    expect(isVoteOutcomeResponse({ v, vote: mark })).toBe(true)
    expect(isVoteOutcomeResponse({ v, vote: null })).toBe(false)
  })
  it('ответы действий с событиями', () => {
    const v = PROTOCOL_VERSION
    expect(isCreateEventResponse({ v, event })).toBe(true)
    expect(isCreateEventResponse({ v, event: { ...event, closesAt: '10' } })).toBe(false)
    expect(isPlaceBetResponse({ v, bet: { id: 'B', event: 'E', memberId: 'M', outcome: '1', amount: 100, at: 3 } })).toBe(true)
    expect(isPlaceBetResponse({ v, bet: { id: 'B', memberId: 'M', outcome: '1', amount: 100, at: 3 } })).toBe(false)
    expect(isClarifyEventResponse({ v, clarification: { id: 'C', at: 2, text: 'Уточнение' } })).toBe(true)
    expect(isClarifyEventResponse({ v, clarification: 'Уточнение' })).toBe(false)
    expect(isCancelEventResponse({ v, cancelled: { at: 4, by: 'H', reason: 'Ошиблись' } })).toBe(true)
    expect(isCancelEventResponse({ cancelled: { at: 4, by: 'H', reason: null } })).toBe(false)
  })
  it('узнаёт отказ', () => {
    expect(isErrorResponse({ v: PROTOCOL_VERSION, error: 'Нет такой комнаты' })).toBe(true)
    expect(isErrorResponse({ error: 'без версии' })).toBe(false)
    expect(isErrorResponse([])).toBe(false)
  })
  it('отметка заявки в отказе', () => {
    expect(joinMark({ v: PROTOCOL_VERSION, error: 'Ждём, пока ведущий впустит', join: 'waiting' })).toBe('waiting')
    expect(joinMark({ v: PROTOCOL_VERSION, error: 'Ведущий отклонил заявку', join: 'rejected' })).toBe('rejected')
    expect(joinMark({ v: PROTOCOL_VERSION, error: 'Нет доступа' })).toBeUndefined()
    expect(joinMark({ join: 'admitted' })).toBeUndefined()
    expect(joinMark(null)).toBeUndefined()
  })
})

describe('ответы входа по ссылке', () => {
  const v = PROTOCOL_VERSION
  it('что за комната и заявка', () => {
    expect(isPreviewResponse({ v, name: 'Дача', hostName: 'Аня' })).toBe(true)
    expect(isPreviewResponse({ v, name: 'Дача' })).toBe(false)
    expect(isJoinRoomResponse({ v, memberId: 'M', key: 'K', join: 'waiting' })).toBe(true)
    expect(isJoinRoomResponse({ v, memberId: 'M', key: 'K', join: 'потом' })).toBe(false)
  })
  it('заявки и решение ведущего', () => {
    expect(isJoinRequestsResponse({ v, requests: [] })).toBe(true)
    expect(isJoinRequestsResponse({ v, requests: [{ id: 'R', name: 'Боря', at: 1 }] })).toBe(true)
    expect(isJoinRequestsResponse({ v, requests: [{ id: 'R', name: 'Боря' }] })).toBe(false)
    expect(isAdmitResponse({ v, member: { id: 'R', name: 'Боря' } })).toBe(true)
    expect(isAdmitResponse({ v, member: 'R' })).toBe(false)
    expect(isRejectResponse({ v, request: 'R' })).toBe(true)
    expect(isRejectResponse({ request: 'R' })).toBe(false)
  })
  it('новая ссылка и ссылка для другого устройства', () => {
    expect(isInviteResponse({ v, invite: 'I' })).toBe(true)
    expect(isInviteResponse({ v, invite: '' })).toBe(false)
    expect(isDeviceLinkResponse({ v, token: 'T', member: 'M', expiresAt: 1 })).toBe(true)
    expect(isDeviceLinkResponse({ v, token: 'T', member: 'M' })).toBe(false)
    expect(isClaimDeviceResponse({ v, memberId: 'M', key: 'K' })).toBe(true)
    expect(isClaimDeviceResponse({ v, memberId: 'M' })).toBe(false)
  })
})

describe('ulid', () => {
  it('26 знаков, по времени сортируется', () => {
    const a = ulid(1_000)
    const b = ulid(2_000)
    expect(a).toHaveLength(26)
    expect(a < b).toBe(true)
  })
})
