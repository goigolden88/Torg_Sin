import { describe, expect, it } from 'vitest'
import {
  BACKUP_FORMAT,
  BAD_BACKUP,
  BAD_LOG,
  BAD_STORE,
  checkBackup,
  LOG_ORDER,
  NEED_FULL,
  ROOM_MISMATCH,
  UNKNOWN_FORMAT,
  type Backup,
} from './backup'
import type { LogEntry } from './room'

const created: LogEntry = { id: 'E1', at: 100, memberId: 'M1', type: 'room.created', roomId: 'R1', name: 'Дача', currency: 'RUB' }
const host: LogEntry = { id: 'E2', at: 100, memberId: 'M1', type: 'member.added', member: 'M1', name: 'Аня' }
const bet: LogEntry = { id: 'E3', at: 300, memberId: 'M1', type: 'bet.placed', event: 'EV', outcome: '1', amount: 500, requestId: 'Q1' }

const store = {
  invite: { token: 'приглашение', at: 100 },
  secret: { secret: 'секрет', at: 200 },
  'key:хеш1': { memberId: 'M1', at: 100 },
  'key:хеш2': { memberId: 'M1', at: 150, unlinkedAt: 250 },
  'device:хеш3': { member: 'M1', unlink: true, expiresAt: 9000, at: 150, usedAt: 250 },
}

const full: Backup = { format: BACKUP_FORMAT, roomId: 'R1', exportedAt: 1000, log: [created, host, bet], store }
const member: Backup = { format: BACKUP_FORMAT, roomId: 'R1', exportedAt: 1000, log: [created, host, bet] }

function error(x: unknown, need?: 'full'): string | null {
  const r = checkBackup(x, need)
  return r.ok ? null : r.error
}

describe('checkBackup', () => {
  it('полная копия и копия участника — годные, как есть', () => {
    expect(checkBackup(full)).toEqual({ ok: true, backup: full })
    expect(checkBackup(full, 'full')).toEqual({ ok: true, backup: full })
    expect(checkBackup(member)).toEqual({ ok: true, backup: member })
  })

  it('темп комнаты (Р-35): поле room.created и запись room.pace — годные', () => {
    const paced: LogEntry = { ...created, pace: 'fast' } as LogEntry
    const change: LogEntry = { id: 'E4', at: 400, memberId: 'M1', type: 'room.pace', pace: 'normal', requestId: 'Q2' }
    const log = [paced, host, bet, change]
    expect(checkBackup({ ...member, log })).toEqual({ ok: true, backup: { ...member, log } })
  })

  it('лишние поля сверху (версия протокола ответа) в копию не попадают', () => {
    expect(checkBackup({ v: 6, ...full })).toEqual({ ok: true, backup: full })
  })

  it('не копия — отказ', () => {
    for (const x of [null, 'копия', [full], { ...full, format: undefined }]) expect(error(x)).toBe(BAD_BACKUP)
    expect(error({ ...full, roomId: '' })).toBe(BAD_BACKUP)
    expect(error({ ...full, exportedAt: -1 })).toBe(BAD_BACKUP)
    expect(error({ ...full, log: 'журнал' })).toBe(BAD_BACKUP)
  })

  it('версия формата незнакома — отказ', () => {
    expect(error({ ...full, format: BACKUP_FORMAT + 1 })).toBe(UNKNOWN_FORMAT)
    expect(error({ ...full, format: '1' })).toBe(UNKNOWN_FORMAT)
  })

  it('журнал не сворачивается — отказ: пустой, без создания комнаты в начале, запись чужого вида или без полей', () => {
    expect(error({ ...full, log: [] })).toBe(BAD_LOG)
    expect(error({ ...full, log: [host, created] })).toBe(BAD_LOG)
    expect(error({ ...full, log: [created, { ...host, type: 'member.removed' }] })).toBe(BAD_LOG)
    expect(error({ ...full, log: [created, { ...host, at: 'вчера' }] })).toBe(BAD_LOG)
    expect(error({ ...full, log: [created, { ...host, id: undefined }] })).toBe(BAD_LOG)
    expect(error({ ...full, log: [created, null] })).toBe(BAD_LOG)
  })

  it('номер комнаты не сходится с room.created — отказ', () => {
    expect(error({ ...full, roomId: 'R2' })).toBe(ROOM_MISMATCH)
  })

  it('записи по порядку: время не убывает, номера не повторяются; одного мига — в любом порядке номеров', () => {
    expect(error({ ...full, log: [created, bet, host] })).toBe(LOG_ORDER)
    expect(error({ ...full, log: [created, host, { ...bet, id: 'E2' }] })).toBe(LOG_ORDER)
    // E0 «меньше» E1, но запись того же мига — годится
    expect(error({ ...full, log: [created, { ...host, id: 'E0' }, bet] })).toBeNull()
  })

  it('для загрузки нужна полная копия: копия участника — отказ', () => {
    expect(error(member, 'full')).toBe(NEED_FULL)
  })

  it('служебные записи: только известные ключи своего вида, приглашение — обязательно', () => {
    const without = (key: string) => Object.fromEntries(Object.entries(store).filter(([k]) => k !== key))
    const noInvite = without('invite')
    const cases: unknown[] = [
      'записи',
      noInvite,
      { ...store, 'log:00000001': created },
      { ...store, registry: { at: 1 } },
      { ...store, 'key:': { memberId: 'M1', at: 1 } },
      { ...store, invite: { token: '', at: 1 } },
      { ...store, secret: { at: 1 } },
      { ...store, 'key:хеш1': { memberId: 'M1' } },
      { ...store, 'key:хеш1': { memberId: 'M1', at: 1, unlinkedAt: 'нет' } },
      { ...store, 'device:хеш3': { member: 'M1', unlink: 'да', expiresAt: 1, at: 1 } },
      { ...store, 'device:хеш3': { member: 'M1', unlink: false, at: 1 } },
    ]
    for (const s of cases) expect(error({ ...full, store: s })).toBe(BAD_STORE)
    // Секрета ещё нет (заявок не было) — годится
    expect(error({ ...full, store: without('secret') }, 'full')).toBeNull()
  })
})
