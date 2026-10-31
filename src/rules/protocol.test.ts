import { describe, expect, it } from 'vitest'
import {
  isAdmitResponse,
  isClaimDeviceResponse,
  isCreateRoomResponse,
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
