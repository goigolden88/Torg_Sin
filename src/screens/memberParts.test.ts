import { describe, expect, it } from 'vitest'
import type { LogEntry } from '../rules/room'
import { dropAction, iAmDropped, inPlayMember, leftAt, lifeItems, memberMark, returnLine } from './memberParts'

const members = [
  { id: 'MA', name: 'Аня' },
  { id: 'MB', name: 'Боря', left: true, dropped: false },
  { id: 'MV', name: 'Вера', left: false, dropped: true },
  { id: 'MG', name: 'Гоша', left: false, dropped: false },
]

describe('жизнь комнаты на сайте (Р-40, Р-41)', () => {
  it('пометка у имени: вышел, выбыл, нет; старая запись без полей — в комнате', () => {
    expect(members.map(memberMark)).toEqual([null, 'вышел', 'выбыл', null])
    expect(members.filter(inPlayMember).map((m) => m.id)).toEqual(['MA', 'MG'])
  })

  it('я помечен «выбыл» — по своему номеру', () => {
    expect(iAmDropped({ members, memberId: 'MV' })).toBe(true)
    expect(iAmDropped({ members, memberId: 'MG' })).toBe(false)
    expect(iAmDropped({ members, memberId: 'MB' })).toBe(false)
  })

  it('кнопка ведущего: пометить — тому, кто в игре; снять — помеченному; себе, вышедшему и не ведущему — нет', () => {
    const host = { hostId: 'MA', memberId: 'MA' }
    expect(members.map((m) => dropAction(host, m))).toEqual([null, null, 'restore', 'drop'])
    expect(members.map((m) => dropAction({ hostId: 'MA', memberId: 'MG' }, m))).toEqual([null, null, null, null])
  })

  const log: LogEntry[] = [
    { id: '01', at: 1000, memberId: 'MB', type: 'member.left', requestId: 'R1' },
    { id: '02', at: 2000, memberId: 'MA', type: 'member.returned', member: 'MB', request: 'MB2' },
    { id: '03', at: 3000, memberId: 'MA', type: 'member.dropped', member: 'MV', requestId: 'R2' },
    { id: '04', at: 4000, memberId: 'MA', type: 'member.reinstated', member: 'MV', requestId: 'R3' },
    { id: '05', at: 4000, memberId: 'MA', type: 'member.dropped', member: 'MV', requestId: 'R4' },
    { id: '06', at: Date.UTC(2026, 10, 24, 12), memberId: 'MB', type: 'member.left', requestId: 'R5' },
  ]

  it('когда вышел — последний выход по журналу; не выходил — null', () => {
    expect(leftAt(log, 'MB')).toBe(Date.UTC(2026, 10, 24, 12))
    expect(leftAt(log, 'MG')).toBeNull()
    expect(leftAt([], 'MB')).toBeNull()
  })

  it('строка заявки-возврата (Р-46): с датой выхода и без неё', () => {
    expect(returnLine('Боря', Date.UTC(2026, 10, 24, 12), 'UTC')).toBe('Похож на вышедшего „Боря“ (вышел 24.11)')
    expect(returnLine('Боря', null)).toBe('Похож на вышедшего „Боря“')
  })

  it('«История»: вышел, пометил и снял «выбыл», новое сверху; возврат — не строка', () => {
    expect(lifeItems({ members }, log)).toEqual([
      { id: '06', at: Date.UTC(2026, 10, 24, 12), text: 'Боря — вышел' },
      { id: '05', at: 4000, text: 'Ведущий пометил „выбыл“: Вера' },
      { id: '04', at: 4000, text: 'Ведущий снял „выбыл“: Вера' },
      { id: '03', at: 3000, text: 'Ведущий пометил „выбыл“: Вера' },
      { id: '01', at: 1000, text: 'Боря — вышел' },
    ])
    expect(lifeItems({ members }, [])).toEqual([])
  })
})
