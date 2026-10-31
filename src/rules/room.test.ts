import { describe, expect, it } from 'vitest'
import {
  BAD_CURRENCY,
  checkRoomInput,
  foldLog,
  LONG_MEMBER_NAME,
  LONG_ROOM_NAME,
  NEED_MEMBER_NAME,
  NEED_ROOM_NAME,
  type LogEntry,
} from './room'

const created: LogEntry = { id: 'E1', at: 100, memberId: 'M1', type: 'room.created', roomId: 'R1', name: 'Дача', currency: 'RUB' }
const host: LogEntry = { id: 'E2', at: 100, memberId: 'M1', type: 'member.added', member: 'M1', name: 'Аня' }
const guest: LogEntry = { id: 'E3', at: 200, memberId: 'M1', type: 'member.added', member: 'M2', name: 'Боря' }

describe('foldLog', () => {
  it('пустой журнал — комнаты нет', () => {
    expect(foldLog([])).toBeNull()
  })
  it('состояние из журнала по порядку', () => {
    expect(foldLog([created, host, guest])).toEqual({
      id: 'R1',
      name: 'Дача',
      currency: 'RUB',
      hostId: 'M1',
      createdAt: 100,
      members: [
        { id: 'M1', name: 'Аня', addedBy: 'M1', addedAt: 100 },
        { id: 'M2', name: 'Боря', addedBy: 'M1', addedAt: 200 },
      ],
    })
  })
  it('повторное создание и повторный вход ничего не меняют; участник до комнаты — не в счёт', () => {
    const again: LogEntry = { ...created, id: 'E9', name: 'Другая' }
    const state = foldLog([guest, created, host, again, { ...host, id: 'E10', name: 'Аня 2' }])
    expect(state?.name).toBe('Дача')
    expect(state?.members.map((m) => m.name)).toEqual(['Аня'])
  })
})

describe('checkRoomInput', () => {
  const ok = { name: '  Дача  ', currency: 'RUB', hostName: ' Аня ' }
  it('пробелы по краям срезаются', () => {
    expect(checkRoomInput(ok)).toEqual({ ok: true, input: { name: 'Дача', currency: 'RUB', hostName: 'Аня' } })
  })
  it('название: пусто или длиннее 60 знаков — отказ; ровно 60 — можно', () => {
    expect(checkRoomInput({ ...ok, name: '   ' })).toEqual({ ok: false, error: NEED_ROOM_NAME })
    expect(checkRoomInput({ ...ok, name: undefined })).toEqual({ ok: false, error: NEED_ROOM_NAME })
    expect(checkRoomInput({ ...ok, name: 'я'.repeat(61) })).toEqual({ ok: false, error: LONG_ROOM_NAME })
    expect(checkRoomInput({ ...ok, name: '🎲'.repeat(60) }).ok).toBe(true)
  })
  it('имя: пусто или длиннее 30 знаков — отказ', () => {
    expect(checkRoomInput({ ...ok, hostName: '' })).toEqual({ ok: false, error: NEED_MEMBER_NAME })
    expect(checkRoomInput({ ...ok, hostName: 'я'.repeat(31) })).toEqual({ ok: false, error: LONG_MEMBER_NAME })
    expect(checkRoomInput({ ...ok, hostName: 'я'.repeat(30) }).ok).toBe(true)
  })
  it('валюта — только из таблицы', () => {
    expect(checkRoomInput({ ...ok, currency: 'GBP' })).toEqual({ ok: false, error: BAD_CURRENCY })
    expect(BAD_CURRENCY).toContain('USDT')
  })
})
