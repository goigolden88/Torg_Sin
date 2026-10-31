import { describe, expect, it } from 'vitest'
import {
  BAD_CURRENCY,
  checkMemberName,
  checkRoomInput,
  foldLog,
  joinRequests,
  LONG_MEMBER_NAME,
  LONG_ROOM_NAME,
  nameTaken,
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

describe('заявки на вход', () => {
  const ask = (id: string, name: string, at: number): LogEntry => ({ id: 'J' + id, at, memberId: id, type: 'join.requested', request: id, name })
  const admit = (id: string, name: string, at: number): LogEntry => ({ id: 'A' + id, at, memberId: 'M1', type: 'member.added', member: id, name })
  const reject = (id: string, at: number): LogEntry => ({ id: 'R' + id, at, memberId: 'M1', type: 'join.rejected', request: id })
  const log = [created, host, ask('Q1', 'Боря', 300), ask('Q2', 'Вера', 310), ask('Q3', 'Гоша', 320), admit('Q1', 'Боря', 400), reject('Q2', 410)]

  it('ждёт, впущена, отклонена — по журналу; решение — первое', () => {
    expect(joinRequests([...log, reject('Q1', 500), admit('Q2', 'Вера', 510), ask('Q3', 'Другое', 520)])).toEqual([
      { id: 'Q1', name: 'Боря', at: 300, status: 'admitted' },
      { id: 'Q2', name: 'Вера', at: 310, status: 'rejected' },
      { id: 'Q3', name: 'Гоша', at: 320, status: 'waiting' },
    ])
  })

  it('заявка не меняет состояние комнаты: в списке — только впущенные', () => {
    expect(foldLog(log)?.members.map((m) => m.name)).toEqual(['Аня', 'Боря'])
    const extra: LogEntry[] = [
      { id: 'I1', at: 600, memberId: 'M1', type: 'invite.changed' },
      { id: 'D1', at: 610, memberId: 'M1', type: 'device.issued', member: 'Q1', unlink: true, expiresAt: 999 },
      { id: 'D2', at: 620, memberId: 'Q1', type: 'device.linked', member: 'Q1', unlink: true },
    ]
    expect(foldLog([...log, ...extra])).toEqual(foldLog(log))
  })

  it('имя занято участником или ждущей заявкой — без учёта регистра; отклонённая имя не держит', () => {
    const state = foldLog(log)!
    const requests = joinRequests(log)
    expect(nameTaken(state, requests, 'аня')).toBe(true)
    expect(nameTaken(state, requests, ' БОРЯ ')).toBe(true)
    expect(nameTaken(state, requests, 'гОША')).toBe(true)
    expect(nameTaken(state, requests, 'Вера')).toBe(false)
    expect(nameTaken(state, requests, 'Аня2')).toBe(false)
  })

  it('имя участника: пробелы срезаются; пусто или длиннее 30 — отказ', () => {
    expect(checkMemberName('  Боря ')).toEqual({ ok: true, name: 'Боря' })
    expect(checkMemberName(' ')).toEqual({ ok: false, error: NEED_MEMBER_NAME })
    expect(checkMemberName(42)).toEqual({ ok: false, error: NEED_MEMBER_NAME })
    expect(checkMemberName('я'.repeat(31))).toEqual({ ok: false, error: LONG_MEMBER_NAME })
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
