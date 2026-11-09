import { describe, expect, it } from 'vitest'
import {
  isAppealResponse,
  isJoinAppealResponse,
  isJudgeResponse,
  isReplaceJurorResponse,
  isAcceptOfferResponse,
  isCreateOfferResponse,
  isDecideOfferResponse,
  isDeclineOfferResponse,
  isMarkOfferResponse,
  isNominateResponse,
  isRevokeOfferResponse,
  isAdmitResponse,
  isAgreeOutcomeResponse,
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
    agreements: [],
    awaiting: [],
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
    const cancelled = { ...outcome, status: 'cancelled', finalAt: null, payouts: [] }
    expect(isRoomStateResponse({ ...state, events: [{ ...view, outcome: cancelled }] })).toBe(true)
    expect(isRoomStateResponse({ ...state, events: [{ ...view, outcome: undefined }] })).toBe(false)
    expect(isRoomStateResponse({ ...state, events: [{ ...view, outcome: { ...outcome, status: 'потом' } }] })).toBe(false)
    expect(isRoomStateResponse({ ...state, events: [{ ...view, outcome: { ...outcome, proposal: null } }] })).toBe(false)
    expect(isRoomStateResponse({ ...state, events: [{ ...view, outcome: { ...outcome, objections: [{ id: 'O', at: 5, by: 'N' }] } }] })).toBe(false)
    expect(isRoomStateResponse({ ...state, events: [{ ...view, outcome: { ...outcome, approved: { ...outcome.approved, how: 'жребий' } } }] })).toBe(false)
    expect(isRoomStateResponse({ ...state, events: [{ ...view, outcome: { ...outcome, payouts: [{ memberId: 'M', payout: 1 }] } }] })).toBe(false)
    expect(isRoomStateResponse({ ...state, events: [{ ...view, outcome: { ...outcome, void: undefined } }] })).toBe(false)
  })
  it('состояние комнаты: согласия с исходом (Р-21)', () => {
    const agreed = { ...outcome, objections: [], decision: null, agreements: [{ id: 'G', at: 6, by: 'N' }], approved: { outcome: '1', at: 6, how: 'agreed', by: null }, status: 'final', finalAt: 6 }
    expect(isRoomStateResponse({ ...state, events: [{ ...view, outcome: agreed }] })).toBe(true)
    const waiting = { ...outcome, status: 'proposed', objections: [], decision: null, agreements: [{ id: 'G', at: 6, by: 'N' }], awaiting: ['K'], approved: null, finalAt: null, payouts: [] }
    expect(isRoomStateResponse({ ...state, events: [{ ...view, outcome: waiting }] })).toBe(true)
    // Старый сервер — без согласий: не то, что ждём
    expect(isRoomStateResponse({ ...state, events: [{ ...view, outcome: { ...outcome, agreements: undefined } }] })).toBe(false)
    expect(isRoomStateResponse({ ...state, events: [{ ...view, outcome: { ...outcome, awaiting: [1] } }] })).toBe(false)
    expect(isRoomStateResponse({ ...state, events: [{ ...view, outcome: { ...outcome, agreements: [{ id: 'G', by: 'N' }] } }] })).toBe(false)
  })
  it('ответы действий с исходом', () => {
    const v = PROTOCOL_VERSION
    expect(isProposeOutcomeResponse({ v, proposal: mark })).toBe(true)
    expect(isProposeOutcomeResponse({ v, proposal: { ...mark, outcome: 1 } })).toBe(false)
    expect(isObjectOutcomeResponse({ v, objection: { id: 'O', at: 5, by: 'N', reason: 'Не так' } })).toBe(true)
    expect(isObjectOutcomeResponse({ v, objection: mark })).toBe(false)
    expect(isAgreeOutcomeResponse({ v, agreement: { id: 'G', at: 6, by: 'N' } })).toBe(true)
    expect(isAgreeOutcomeResponse({ v, agreement: { id: 'G', by: 'N' } })).toBe(false)
    expect(isAgreeOutcomeResponse({ agreement: { id: 'G', at: 6, by: 'N' } })).toBe(false)
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

describe('пари (Р-22)', () => {
  const v = PROTOCOL_VERSION
  const state = {
    v,
    room: { id: 'R', name: 'Дача', currency: 'RUB', hostId: 'M', createdAt: 1 },
    members: [{ id: 'M', name: 'Аня' }],
    me: 'M',
    events: [],
    now: 5,
  }
  const offer = {
    id: 'O',
    at: 1,
    authorId: 'A',
    condition: 'Условие',
    check: 'Как проверяем',
    side: 'yes',
    odds: { a: 3, b: 1 },
    amount: 300,
    takerAmount: 100,
    to: null,
    closesAt: 10,
    expectedAt: 20,
    guarantorId: 'M',
    counterTo: null,
  }
  const outcome = {
    phase: 'guarantor',
    marks: { author: 'author', taker: 'taker' },
    guarantorId: 'M',
    turnAt: 30,
    guarantorUntil: 40,
    needSince: null,
    nominations: {},
    approved: null,
    finalAt: null,
  }
  const view = { ...offer, status: 'accepted', accepted: { by: 'B', at: 3 }, withdrawnAt: null, closedBy: null, outcome }
  const act = { id: 'X', at: 3, by: 'B', offer: 'O' }

  it('состояние комнаты — с пари; сервер без пари (до выкатки) — тоже ответ', () => {
    expect(isRoomStateResponse({ ...state, offers: [view] })).toBe(true)
    expect(isRoomStateResponse({ ...state, offers: [] })).toBe(true)
    expect(isRoomStateResponse(state)).toBe(true)
    expect(isRoomStateResponse({ ...state, offers: [{ ...view, closedBy: { offer: 'C', at: 4 }, status: 'countered', accepted: null, outcome: null }] })).toBe(true)
    for (const bad of [
      // Исход (Р-23): поле обязательно — копия до него проверку не проходит
      { ...view, outcome: undefined },
      { ...view, outcome: { ...outcome, phase: 'court' } },
      { ...view, outcome: { ...outcome, marks: { author: 'yes', taker: null } } },
      { ...view, outcome: { ...outcome, marks: null } },
      { ...view, outcome: { ...outcome, turnAt: null } },
      { ...view, outcome: { ...outcome, nominations: { judge: 'C' } } },
      { ...view, outcome: { ...outcome, nominations: { author: 5 } } },
      { ...view, outcome: { ...outcome, approved: { winner: 'author', at: 5, how: 'vote', by: null } } },
      { ...view, status: 'revoked' },
      { ...view, side: 'maybe' },
      { ...view, odds: null },
      { ...view, takerAmount: '100' },
      { ...view, accepted: { by: 'B' } },
      { ...view, withdrawnAt: undefined },
      { ...view, to: 5 },
    ]) {
      expect(isRoomStateResponse({ ...state, offers: [bad] })).toBe(false)
    }
    expect(isRoomStateResponse({ ...state, offers: {} })).toBe(false)
    // Утверждён согласием и окончательный; назвали нового гаранта
    const final = { ...outcome, phase: 'final', guarantorUntil: null, approved: { winner: 'taker', at: 5, how: 'agreement', by: null }, finalAt: 5 }
    expect(isRoomStateResponse({ ...state, offers: [{ ...view, outcome: final }] })).toBe(true)
    const need = { ...outcome, phase: 'need-guarantor', needSince: 41, nominations: { author: 'C' } }
    expect(isRoomStateResponse({ ...state, offers: [{ ...view, outcome: need }] })).toBe(true)
  })

  it('ответы на действия с исходом пари (Р-23)', () => {
    expect(isMarkOfferResponse({ v, marked: { ...act, winner: 'author' } })).toBe(true)
    expect(isMarkOfferResponse({ v, marked: { ...act, winner: 'yes' } })).toBe(false)
    expect(isMarkOfferResponse({ v, marked: act })).toBe(false)
    expect(isDecideOfferResponse({ v, decided: { ...act, winner: 'taker' } })).toBe(true)
    expect(isDecideOfferResponse({ decided: { ...act, winner: 'taker' } })).toBe(false)
    expect(isDeclineOfferResponse({ v, declined: act })).toBe(true)
    expect(isDeclineOfferResponse({ v, error: 'Это может только гарант пари' })).toBe(false)
    expect(isNominateResponse({ v, nominated: { ...act, guarantor: 'C' } })).toBe(true)
    expect(isNominateResponse({ v, nominated: act })).toBe(false)
  })

  it('ответы на действия с пари', () => {
    expect(isCreateOfferResponse({ v, offer })).toBe(true)
    expect(isCreateOfferResponse({ v, offer: { ...offer, counterTo: 'O0', to: 'A0', side: 'no' } })).toBe(true)
    expect(isCreateOfferResponse({ v, offer: { ...offer, guarantorId: null } })).toBe(false)
    expect(isCreateOfferResponse({ offer })).toBe(false)
    expect(isAcceptOfferResponse({ v, accepted: act, offer })).toBe(true)
    expect(isAcceptOfferResponse({ v, accepted: act })).toBe(false)
    expect(isAcceptOfferResponse({ v, accepted: { ...act, offer: undefined }, offer })).toBe(false)
    expect(isRevokeOfferResponse({ v, revoked: act })).toBe(true)
    expect(isRevokeOfferResponse({ v, revoked: { ...act, at: 'вчера' } })).toBe(false)
    expect(isRevokeOfferResponse({ v, error: 'Нет такого пари' })).toBe(false)
  })
})

describe('апелляция и суд (Р-25)', () => {
  const v = PROTOCOL_VERSION
  const act = { id: 'X1', at: 5, by: 'B', target: 'E1' }

  it('ответы на подачу, присоединение, голос и замену', () => {
    expect(isAppealResponse({ v, appeal: { ...act, reason: 'Не так', seed: 'ab', candidates: ['C', 'D'] } })).toBe(true)
    expect(isAppealResponse({ v, appeal: { ...act, reason: 'Не так', seed: 'ab', candidates: [1] } })).toBe(false)
    expect(isAppealResponse({ v, appeal: { ...act, reason: 'Не так' } })).toBe(false)
    expect(isJoinAppealResponse({ v, joined: act })).toBe(true)
    expect(isJoinAppealResponse({ v, joined: { ...act, target: undefined } })).toBe(false)
    expect(isJudgeResponse({ v, voted: { ...act, verdict: 'keep' } })).toBe(true)
    expect(isJudgeResponse({ v, voted: { ...act, verdict: 'change', outcome: '2' } })).toBe(true)
    expect(isJudgeResponse({ v, voted: { ...act, verdict: 'change', winner: 'taker' } })).toBe(true)
    expect(isJudgeResponse({ v, voted: { ...act, verdict: 'change' } })).toBe(false)
    expect(isReplaceJurorResponse({ v, replaced: { ...act, member: 'C', reason: 'Уехал' } })).toBe(true)
    expect(isReplaceJurorResponse({ v, replaced: act })).toBe(false)
    expect(isReplaceJurorResponse({ v, error: 'Досрочно заменить члена суда может только ведущий' })).toBe(false)
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
