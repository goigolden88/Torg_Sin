import { describe, expect, it } from 'vitest'
import { formatDate } from '../rules/date'
import type { LogEntry } from '../rules/room'
import {
  closedNote,
  dropAction,
  mayStartNew,
  roomClosed,
  hostTimes,
  iAmDropped,
  inPlayMember,
  leftAt,
  lifeItems,
  memberMark,
  passAction,
  passQuestion,
  returnLine,
  seenLine,
  takeLine,
  takeQuestion,
  takeRefusal,
  takeState,
} from './memberParts'

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

  it('закрытая комната (Р-43): нового не начать никому; открытая — всем, кроме «выбыл»; подпись — с датой', () => {
    const closedAt = Date.UTC(2026, 10, 27, 9)
    expect(roomClosed({})).toBe(false)
    expect(roomClosed({ closedAt })).toBe(true)
    expect(mayStartNew({ members, memberId: 'MG' })).toBe(true)
    expect(mayStartNew({ members, memberId: 'MV' })).toBe(false)
    expect(mayStartNew({ members, memberId: 'MG', closedAt })).toBe(false)
    expect(mayStartNew({ members, memberId: 'MA', closedAt })).toBe(false)
    expect(closedNote(closedAt)).toBe(`Комната закрыта ${formatDate(closedAt)}: только чтение и переводы`)
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

describe('ведение на сайте (Р-42)', () => {
  const DAY = 24 * 60 * 60 * 1000
  const seenAt = Date.UTC(2026, 10, 20, 9)
  const host = { seenAt, takeFrom: seenAt + 7 * DAY }

  it('времена ведущего — из ответа комнаты; сервер без них — null', () => {
    expect(hostTimes({ hostSeenAt: seenAt, hostTakeFrom: seenAt + 7 * DAY })).toEqual(host)
    expect(hostTimes({})).toBeNull()
    expect(hostTimes({ hostSeenAt: seenAt })).toBeNull()
  })

  it('«Передать ведение» — ведущему у тех, кто в игре, не у себя; не ведущему — ни у кого', () => {
    expect(members.map((m) => passAction({ hostId: 'MA', memberId: 'MA' }, m))).toEqual([false, false, false, true])
    expect(members.map((m) => passAction({ hostId: 'MA', memberId: 'MG' }, m))).toEqual([false, false, false, false])
  })

  it('подтверждение передачи: «Вы станете обычным участником»', () => {
    expect(passQuestion('Гоша')).toContain('Передать ведение «Гоша»? Вы станете обычным участником')
  })

  it('«заходил» и «можно с» — местным временем', () => {
    expect(seenLine(seenAt, 'UTC')).toBe('заходил 20.11.2026, 09:00')
    expect(seenLine(seenAt, 'Europe/Moscow')).toBe('заходил 20.11.2026, 12:00')
    expect(takeLine(seenAt + 7 * DAY, 'UTC')).toBe('Взять ведение можно с 27.11.2026, 09:00')
  })

  it('«Взять ведение»: 7 дней — кнопка, больше суток — подпись, раньше — ничего', () => {
    const room = { hostId: 'MA', memberId: 'MG', members }
    expect(takeState(room, host, seenAt + DAY)).toBeNull()
    expect(takeState(room, host, seenAt + DAY + 1)).toEqual({ kind: 'wait', from: seenAt + 7 * DAY })
    expect(takeState(room, host, seenAt + 7 * DAY - 1)).toEqual({ kind: 'wait', from: seenAt + 7 * DAY })
    expect(takeState(room, host, seenAt + 7 * DAY)).toEqual({ kind: 'take' })
  })

  it('«Взять ведение» — не ведущему, не «выбыл» и не без времён с сервера', () => {
    const late = seenAt + 8 * DAY
    expect(takeState({ hostId: 'MA', memberId: 'MA', members }, host, late)).toBeNull()
    expect(takeState({ hostId: 'MA', memberId: 'MV', members }, host, late)).toBeNull()
    expect(takeState({ hostId: 'MA', memberId: 'MG', members }, null, late)).toBeNull()
    expect(takeState({ hostId: 'MA', memberId: 'MX', members }, host, late)).toBeNull()
  })

  it('отказ сервера на «Взять ведение» — как есть; срок не настал — дата «можно с»', () => {
    const refusal = 'Ведущий заходил 1 дн назад: взять ведение можно через 6 дн'
    expect(takeRefusal(refusal, host, seenAt + DAY, 'UTC')).toBe(refusal + ' — можно с 27.11.2026, 09:00')
    expect(takeRefusal('Ведение уже взял Гоша', host, seenAt + 8 * DAY, 'UTC')).toBe('Ведение уже взял Гоша')
    expect(takeRefusal(refusal, null, seenAt, 'UTC')).toBe(refusal)
  })

  it('подтверждение «Взять ведение»: кто и с какого мига не заходил', () => {
    expect(takeQuestion('Аня', seenAt, 'UTC')).toContain('Взять ведение? Ведущий «Аня» не заходил с 20.11.2026, 09:00')
  })

  it('«История»: передал и взял ведение, новое сверху', () => {
    const log: LogEntry[] = [
      { id: '07', at: seenAt - DAY, memberId: 'MA', type: 'host.passed', member: 'MG', requestId: 'R6' },
      { id: '08', at: seenAt + 8 * DAY, memberId: 'MA', type: 'host.taken', from: 'MG', seenAt, requestId: 'R7' },
    ]
    expect(lifeItems({ members }, log, 'UTC')).toEqual([
      { id: '08', at: seenAt + 8 * DAY, text: 'Участник Аня взял ведение: ведущий не заходил с 20.11.2026, 09:00' },
      { id: '07', at: seenAt - DAY, text: 'Ведущий Аня передал ведение: Гоша' },
    ])
  })

  it('«История»: закрыл и открыл комнату снова (Р-43), новое сверху', () => {
    const log: LogEntry[] = [
      { id: '09', at: seenAt, memberId: 'MA', type: 'room.closed', requestId: 'R8' },
      { id: '10', at: seenAt + DAY, memberId: 'MA', type: 'room.reopened', requestId: 'R9' },
    ]
    expect(lifeItems({ members }, log)).toEqual([
      { id: '10', at: seenAt + DAY, text: 'Ведущий Аня открыл комнату снова' },
      { id: '09', at: seenAt, text: 'Ведущий Аня закрыл комнату' },
    ])
  })
})
