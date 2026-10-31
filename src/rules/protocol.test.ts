import { describe, expect, it } from 'vitest'
import { isCreateRoomResponse, isErrorResponse, isHealth, isRoomStateResponse, PROTOCOL_VERSION } from './protocol'
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
})

describe('ulid', () => {
  it('26 знаков, по времени сортируется', () => {
    const a = ulid(1_000)
    const b = ulid(2_000)
    expect(a).toHaveLength(26)
    expect(a < b).toBe(true)
  })
})
