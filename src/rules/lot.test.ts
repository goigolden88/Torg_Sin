import { describe, expect, it } from 'vitest'
import {
  BAD_LOT_VERDICT,
  BAD_VERDICT,
  COURT_EXISTS,
  LOT_NO_APPEAL,
  NOT_COURT,
  caseOf,
  checkAppeal,
  checkCourtDraw,
  checkCourtVote,
  checkJoin,
  courtCandidates,
  courtRoom,
  courtState,
  courtVote,
  drawCourt,
  logAppeals,
  NO_APPEAL,
} from './appeal'
import { AUCTION_EXTEND, AUCTION_EXTEND_MAX, AUCTION_MAX, AUCTION_MIN } from './auction'
import { checkBackup } from './backup'
import { BAD_LOT_BID, BAD_LOT_START, BAD_LOT_STEP, LONG_LOT_DESCRIPTION, LONG_LOT_TITLE, LOT_BID_LOW, LOT_BID_STEP } from './lot'
import {
  LOT_DISPUTED,
  LOT_FAILED,
  LOT_HANDED,
  LOT_HAS_BIDS,
  LOT_IN_COURT,
  LOT_LONG,
  LOT_NOT_OVER,
  LOT_OVER,
  LOT_RECEIVED,
  LOT_SHORT,
  LOT_TOO_EARLY,
  LOT_UNSOLD,
  LOT_WITHDRAWN,
  MAX_LOT_TITLE,
  NEED_LOT_END,
  NEED_LOT_TITLE,
  NOT_MEMBER,
  ONLY_SELLER,
  ONLY_WINNER,
  OWN_LOT,
  checkDeclined,
  checkDisputed,
  checkHanded,
  checkLotBid,
  checkLotInput,
  checkLotTimes,
  checkLotWithdraw,
  checkReceived,
  isLotEntry,
  logLots,
  lotOutcome,
  lotResult,
  lotView,
  lotWinner,
  type LotState,
} from './lot'
import { FAST_TIMES, NORMAL_TIMES, timesOf } from './pace'
import { isLotView, type CourtVerdict } from './protocol'
import { foldLog, type LogEntry } from './room'
import { roomSettlement, type SettleMode } from './settle'

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const T = 1_000_000_000
const END = T + HOUR // исходный конец торга
const SEED = '5be0c4d1a2f9'
const SILENCE = NORMAL_TIMES.silence // 3 дня у обычного темпа

let seq = 0
const id = (p: string) => `${p}${++seq}`

// Комната: ведущий H; продавец S; участники A, B, C
function roomLog(members: string[] = ['H', 'S', 'A', 'B', 'C'], host = 'H'): LogEntry[] {
  return [
    { id: 'R', at: 0, memberId: host, type: 'room.created', roomId: 'R', name: 'Барахолка', currency: 'RUB' },
    ...members.map((m): LogEntry => ({ id: 'M' + m, at: 0, memberId: host, type: 'member.added', member: m, name: m })),
  ]
}

type Created = Extract<LogEntry, { type: 'lot.created' }>
// Лот продавца S: велосипед, старт 1000, шаг 100, конец через час
function created(over: Partial<Created> = {}): LogEntry {
  return {
    id: 'L1',
    at: T,
    memberId: 'S',
    type: 'lot.created',
    title: 'Велосипед',
    description: 'Синий, 21 скорость',
    start: 1000,
    step: 100,
    closesAt: END,
    requestId: 'QL1',
    ...over,
  }
}
const bid = (memberId: string, amount: number, at: number, lot = 'L1'): LogEntry => ({ id: id('B'), at, memberId, type: 'lot.bid', lot, amount, requestId: id('Q') })
type Act = 'lot.withdrawn' | 'lot.handed' | 'lot.declined' | 'lot.received' | 'lot.disputed'
const act = (type: Act, memberId: string, at: number, lot = 'L1'): LogEntry => ({ id: id('X'), at, memberId, type, lot, requestId: id('Q') })
const drawn = (at: number, candidates: string[], target = 'L1'): LogEntry => ({ id: id('D'), at, memberId: 'H', type: 'court.drawn', target, seed: SEED, candidates })
const vote = (memberId: string, verdict: 'delivered' | 'undelivered', at: number, target = 'L1'): LogEntry => ({
  id: id('V'),
  at,
  memberId,
  type: 'court.voted',
  target,
  verdict,
  requestId: id('Q'),
})

function one(log: LogEntry[]): LotState {
  const lots = logLots(log)
  expect(lots).toHaveLength(1)
  return lots[0]
}
// Продан: A 1000, B 1100 — победитель B
const sold = (more: LogEntry[] = [], over: Partial<Created> = {}) => [...roomLog(), created(over), bid('A', 1000, T + 10), bid('B', 1100, T + 20), ...more]
const ROOM = { members: ['H', 'S', 'A', 'B', 'C'] }
const statusOf = (log: LogEntry[], now: number) => lotOutcome(one(log), now, caseOf(logAppeals(log), 'L1')).status

describe('лот: форма', () => {
  const form = { title: '  Велосипед ', description: ' Синий ', start: 1000, step: 100, closesAt: END }

  it('название, описание, старт, шаг, конец; пробелы по краям срезаются', () => {
    expect(checkLotInput(form)).toEqual({ ok: true, value: { title: 'Велосипед', description: 'Синий', start: 1000, step: 100, closesAt: END } })
    // Описание не задано — пустое
    expect(checkLotInput({ ...form, description: undefined })).toMatchObject({ ok: true, value: { description: '' } })
  })

  it('шаг по умолчанию — 10 % старта, не меньше одной единицы', () => {
    expect(checkLotInput({ ...form, step: undefined })).toMatchObject({ ok: true, value: { step: 100 } })
    expect(checkLotInput({ ...form, start: 1005, step: null })).toMatchObject({ ok: true, value: { step: 100 } })
    expect(checkLotInput({ ...form, start: 5, step: undefined })).toMatchObject({ ok: true, value: { step: 1 } })
  })

  it('отказы формы', () => {
    expect(checkLotInput({ ...form, title: '   ' })).toEqual({ ok: false, error: NEED_LOT_TITLE })
    expect(checkLotInput({ ...form, title: 'я'.repeat(MAX_LOT_TITLE + 1) })).toEqual({ ok: false, error: LONG_LOT_TITLE })
    expect(checkLotInput({ ...form, title: 'я'.repeat(MAX_LOT_TITLE) }).ok).toBe(true)
    expect(checkLotInput({ ...form, description: 'я'.repeat(301) })).toEqual({ ok: false, error: LONG_LOT_DESCRIPTION })
    for (const start of [0, -5, 1.5, '1000', undefined]) expect(checkLotInput({ ...form, start })).toEqual({ ok: false, error: BAD_LOT_START })
    for (const step of [0, 2.5, 'шаг']) expect(checkLotInput({ ...form, step })).toEqual({ ok: false, error: BAD_LOT_STEP })
    expect(checkLotInput({ ...form, closesAt: 'завтра' })).toEqual({ ok: false, error: NEED_LOT_END })
  })

  it('конец торга — от 10 минут до 3 дней с создания', () => {
    expect(checkLotTimes({ closesAt: T + AUCTION_MIN }, T)).toBeNull()
    expect(checkLotTimes({ closesAt: T + AUCTION_MIN - 1 }, T)).toBe(LOT_SHORT)
    expect(checkLotTimes({ closesAt: T + AUCTION_MAX }, T)).toBeNull()
    expect(checkLotTimes({ closesAt: T + AUCTION_MAX + 1 }, T)).toBe(LOT_LONG)
  })

  it('свёртка берёт запись, только если её пропускают те же проверки на её время', () => {
    expect(logLots([...roomLog(), created()]).map((l) => l.id)).toEqual(['L1'])
    expect(logLots([...roomLog(), created({ closesAt: T + AUCTION_MIN - 1 })])).toEqual([])
    expect(logLots([...roomLog(), created({ title: ' Велосипед' })])).toEqual([])
    expect(logLots([...roomLog(), created({ step: 0 })])).toEqual([])
    expect(logLots([...roomLog(), created({ memberId: 'Чужой' })])).toEqual([])
    // Повтор номера — тот же лот
    expect(logLots([...roomLog(), created(), created({ title: 'Другое' })]).map((l) => l.title)).toEqual(['Велосипед'])
    // Комнаты нет — лотов нет
    expect(logLots([created()])).toEqual([])
  })

  it('сроки темпа закрепляются при создании: молчание и суд — из записи, нет поля — обычные', () => {
    expect(timesOf(one([...roomLog(), created()]))).toEqual(NORMAL_TIMES)
    expect(timesOf(one([...roomLog(), created({ times: FAST_TIMES })]))).toEqual(FAST_TIMES)
  })
})

describe('лот: ставки', () => {
  it('первая — не меньше старта, следующая — больше лучшей хотя бы на шаг; свою перебить можно', () => {
    const l0 = one([...roomLog(), created()])
    expect(checkLotBid(l0, 'A', 999, ROOM, T + 10)).toBe(LOT_BID_LOW)
    expect(checkLotBid(l0, 'A', 1000, ROOM, T + 10)).toBeNull()
    const l1 = one([...roomLog(), created(), bid('A', 1000, T + 10)])
    expect(checkLotBid(l1, 'B', 1099, ROOM, T + 20)).toBe(LOT_BID_STEP)
    expect(checkLotBid(l1, 'B', 1100, ROOM, T + 20)).toBeNull()
    expect(checkLotBid(l1, 'A', 1100, ROOM, T + 20)).toBeNull()
  })

  it('продавец не ставит; не участник — нет; сумма — целое > 0; после конца — торг закончен', () => {
    const l = one([...roomLog(), created()])
    expect(checkLotBid(l, 'S', 5000, ROOM, T + 10)).toBe(OWN_LOT)
    expect(checkLotBid(l, 'Чужой', 5000, ROOM, T + 10)).toBe(NOT_MEMBER)
    for (const amount of [0, -1, 1.5, '1000']) expect(checkLotBid(l, 'A', amount, ROOM, T + 10)).toBe(BAD_LOT_BID)
    expect(checkLotBid(l, 'A', 1000, ROOM, END)).toBe(LOT_OVER)
  })

  it('ставки не отзываются и видны всем: отказанные в свёртке не действуют', () => {
    const log = [...roomLog(), created(), bid('A', 1000, T + 10), bid('S', 5000, T + 15), bid('B', 1050, T + 20), bid('B', 1100, T + 30), bid('C', 2000, END)]
    const view = lotView(one(log), T + 40)
    expect(view.bids.map((b) => [b.by, b.amount])).toEqual([
      ['A', 1000],
      ['B', 1100],
    ])
    expect(view.best).toMatchObject({ by: 'B', amount: 1100 })
    expect(view.status).toBe('open')
    expect(view.winner).toBeNull()
    expect(isLotView(view)).toBe(true)
  })

  it('продление: ставка за 2 минуты до конца — +2 минуты после неё, не дальше конца + 30 минут', () => {
    // Раньше 2 минут до конца — конец прежний
    expect(one([...roomLog(), created(), bid('A', 1000, END - 3 * MIN)]).endsAt).toBe(END)
    // За минуту до конца — конец через 2 минуты после ставки
    const l = one([...roomLog(), created(), bid('A', 1000, END - MIN)])
    expect(l.endsAt).toBe(END + MIN)
    expect(lotWinner(l, END)).toBeNull()
    expect(lotWinner(l, END + MIN)).toMatchObject({ by: 'A' })
    // Цепочка продлений упирается в предел
    const log = [...roomLog(), created()]
    let at = END - MIN
    for (let i = 0; i < 40; i++) {
      log.push(bid(i % 2 ? 'A' : 'B', 1000 + i * 100, at))
      at += AUCTION_EXTEND - 1
    }
    const capped = one(log)
    expect(capped.endsAt).toBe(END + AUCTION_EXTEND_MAX)
    expect(lotView(capped, T).latestEnd).toBe(END + AUCTION_EXTEND_MAX)
    // Ставка в миг конца уже не действует
    const late = one([...roomLog(), created(), bid('A', 1000, END - MIN), bid('B', 1100, END + MIN)])
    expect(late.bids).toHaveLength(1)
  })
})

describe('лот: снять и не продан', () => {
  it('снять — продавец, пока ставок нет', () => {
    const l = one([...roomLog(), created()])
    expect(checkLotWithdraw(l, 'A', T + 10)).toBe(ONLY_SELLER)
    expect(checkLotWithdraw(l, 'S', T + 10)).toBeNull()
    expect(checkLotWithdraw(l, 'S', END)).toBe(LOT_OVER)
    expect(checkLotWithdraw(one([...roomLog(), created(), bid('A', 1000, T + 10)]), 'S', T + 20)).toBe(LOT_HAS_BIDS)
    const off = one([...roomLog(), created(), act('lot.withdrawn', 'S', T + 10), bid('A', 1000, T + 20)])
    expect(off.bids).toEqual([])
    expect(lotOutcome(off, END + DAY)).toMatchObject({ status: 'withdrawn', closedAt: T + 10, winner: null })
    expect(checkLotBid(off, 'A', 1000, ROOM, T + 30)).toBe(LOT_WITHDRAWN)
    expect(checkLotWithdraw(off, 'S', T + 30)).toBe(LOT_WITHDRAWN)
  })

  it('ставок к концу нет — «не продан»; отметки после торга — отказ', () => {
    const l = one([...roomLog(), created()])
    expect(lotOutcome(l, END)).toMatchObject({ status: 'unsold', closedAt: END, winner: null })
    expect(checkHanded(l, 'S', END)).toBe(LOT_UNSOLD)
    expect(checkReceived(l, 'A', END)).toBe(LOT_UNSOLD)
    expect(lotResult(l, END)).toEqual([])
  })
})

describe('лот: после торга', () => {
  it('до конца торга отметок нет; отмечают только продавец и победитель', () => {
    const l = one(sold())
    expect(checkHanded(l, 'S', END - 1)).toBe(LOT_NOT_OVER)
    expect(checkReceived(l, 'B', END - 1)).toBe(LOT_NOT_OVER)
    expect(checkHanded(l, 'B', END)).toBe(ONLY_SELLER)
    expect(checkDeclined(l, 'A', END)).toBe(ONLY_SELLER)
    expect(checkReceived(l, 'A', END)).toBe(ONLY_WINNER)
    expect(checkDisputed(l, 'S', END + SILENCE)).toBe(ONLY_WINNER)
    expect(lotOutcome(l, END)).toMatchObject({ status: 'awaiting', winner: { by: 'B', amount: 1100 } })
  })

  it('обе стороны молчат — «ждёт передачи» без срока, долга нет', () => {
    const log = sold()
    expect(statusOf(log, END + 100 * DAY)).toBe('awaiting')
    expect(lotResult(one(log), END + 100 * DAY)).toEqual([])
  })

  it('«Получил» — в любой момент после конца, и без «Передал»', () => {
    const log = sold([act('lot.received', 'B', END + 5)])
    expect(lotOutcome(one(log), END + 5)).toMatchObject({ status: 'received', received: { at: END + 5, how: 'mark' }, closedAt: END + 5 })
    expect(lotResult(one(log), END + 5)).toEqual([
      { memberId: 'S', net: 1100 },
      { memberId: 'B', net: -1100 },
    ])
    expect(checkReceived(one(log), 'B', END + 6)).toBe(LOT_RECEIVED)
    expect(checkDeclined(one(log), 'S', END + 6)).toBe(LOT_RECEIVED)
  })

  it('«Передал», победитель молчит срок молчания — «получил» (обычный темп — 3 дня)', () => {
    const handed = END + HOUR
    const log = sold([act('lot.handed', 'S', handed)])
    const l = one(log)
    expect(checkHanded(l, 'S', handed + 1)).toBe(LOT_HANDED)
    expect(lotOutcome(l, handed + SILENCE - 1).status).toBe('handed')
    expect(lotOutcome(l, handed + SILENCE)).toMatchObject({ status: 'received', received: { at: handed + SILENCE, how: 'silence' } })
    expect(lotView(l, handed).silenceUntil).toBe(handed + SILENCE)
    // После молчания «Не получил» уже нельзя
    expect(checkDisputed(l, 'B', handed + SILENCE)).toBe(LOT_RECEIVED)
    expect(one([...log, act('lot.disputed', 'B', handed + SILENCE)]).disputedAt).toBeNull()
  })

  it('молчание — по сроку темпа, закреплённому при создании (быстрый — 12 ч)', () => {
    const handed = END + HOUR
    const l = one(sold([act('lot.handed', 'S', handed)], { times: FAST_TIMES }))
    expect(lotOutcome(l, handed + FAST_TIMES.silence - 1).status).toBe('handed')
    expect(lotOutcome(l, handed + FAST_TIMES.silence)).toMatchObject({ status: 'received', received: { how: 'silence' } })
    // «Не получил» без «Передал» — тоже через срок молчания лота
    const quiet = one(sold([], { times: FAST_TIMES }))
    expect(checkDisputed(quiet, 'B', END + FAST_TIMES.silence - 1)).toBe(LOT_TOO_EARLY)
    expect(checkDisputed(quiet, 'B', END + FAST_TIMES.silence)).toBeNull()
  })

  it('«Не получил»: после «Передал» — сразу; без «Передал» — когда со дня конца прошёл срок молчания', () => {
    const l = one(sold())
    expect(checkDisputed(l, 'B', END + SILENCE - 1)).toBe(LOT_TOO_EARLY)
    expect(checkDisputed(l, 'B', END + SILENCE)).toBeNull()
    expect(lotView(l, END).disputeFrom).toBe(END + SILENCE)
    const h = one(sold([act('lot.handed', 'S', END + 10)]))
    expect(checkDisputed(h, 'B', END + 11)).toBeNull()
    // Второй раз и «Передал» после «Не получил» — нет
    const d = one(sold([act('lot.handed', 'S', END + 10), act('lot.disputed', 'B', END + 20)]))
    expect(checkDisputed(d, 'B', END + 30)).toBe(LOT_DISPUTED)
    const d2 = one(sold([act('lot.disputed', 'B', END + SILENCE)]))
    expect(checkHanded(d2, 'S', END + SILENCE + 1)).toBe(LOT_DISPUTED)
  })

  it('«Не смогу передать» — «не состоялся», никто никому не должен; и после «Передал»', () => {
    for (const more of [[act('lot.declined', 'S', END + 10)], [act('lot.handed', 'S', END + 5), act('lot.declined', 'S', END + 10)]]) {
      const l = one(sold(more))
      expect(lotOutcome(l, END + 100 * DAY)).toMatchObject({ status: 'failed', closedAt: END + 10 })
      expect(lotResult(l, END + 100 * DAY)).toEqual([])
      expect(checkReceived(l, 'B', END + 11)).toBe(LOT_FAILED)
      expect(checkDeclined(l, 'S', END + 11)).toBe(LOT_FAILED)
      expect(checkDisputed(l, 'B', END + SILENCE)).toBe(LOT_FAILED)
    }
  })

  it('суд не собрать (судить некому) — «в споре», пока одна сторона не уступит', () => {
    // Комната из двоих: продавец S — ведущий, победитель A
    const base = [...roomLog(['S', 'A'], 'S'), created(), bid('A', 1000, T + 10), act('lot.disputed', 'A', END + SILENCE)]
    const disputed = one(base)
    expect(courtCandidates({ kind: 'lot', lot: disputed }, courtRoom(foldLog(base)!), END + SILENCE)).toEqual([])
    expect(statusOf(base, END + 100 * DAY)).toBe('dispute')
    expect(lotResult(disputed, END + 100 * DAY)).toEqual([])
    // Победитель уступает — «Получил»: получен, долг есть
    const got = [...base, act('lot.received', 'A', END + SILENCE + 5)]
    expect(lotOutcome(one(got), END + SILENCE + 5)).toMatchObject({ status: 'received', received: { how: 'mark' } })
    // Продавец уступает — «Не смогу передать»: не состоялся
    expect(statusOf([...base, act('lot.declined', 'S', END + SILENCE + 5)], END + SILENCE + 5)).toBe('failed')
  })
})

describe('лот: суд по «Не получил»', () => {
  const disputedAt = END + 10
  const base = sold([act('lot.handed', 'S', END + 5), act('lot.disputed', 'B', disputedAt)])
  const at = disputedAt + 1
  const candidates = ['H', 'A', 'C'] // все, кроме продавца S и победителя B
  const order = drawCourt(SEED, candidates, 'H').slice(0, 3)
  const withCourt = (more: LogEntry[] = []) => [...base, drawn(at, candidates), ...more]
  const decide = (verdicts: ('delivered' | 'undelivered')[]) => withCourt(verdicts.map((v, i) => vote(order[i], v, at + 10 + i)))

  it('кандидаты — все, кроме продавца и победителя; суд собирается сам после «Не получил»', () => {
    const state = foldLog(base)!
    const l = one(base)
    expect(courtCandidates({ kind: 'lot', lot: l }, courtRoom(state), at).sort()).toEqual([...candidates].sort())
    expect(checkCourtDraw({ kind: 'lot', lot: l }, null, at)).toBeNull()
    expect(checkCourtDraw({ kind: 'lot', lot: one(sold()) }, null, at)).toBe(NOT_COURT)
    const cases = logAppeals(withCourt())
    expect(caseOf(cases, 'L1')).toMatchObject({ target: 'L1', appeal: null, drawnAt: at })
    expect(checkCourtDraw({ kind: 'lot', lot: one(withCourt()) }, caseOf(cases, 'L1'), at + 1)).toBe(COURT_EXISTS)
    expect(statusOf(withCourt(), at + 1)).toBe('court')
    // Неверные кандидаты — суда нет
    expect(caseOf(logAppeals([...base, drawn(at, ['H', 'A', 'C', 'B'])]), 'L1')).toBeNull()
  })

  it('после сбора суда отметки сторон не действуют', () => {
    const l = one(withCourt())
    expect(l.courtAt).toBe(at)
    expect(checkReceived(l, 'B', at + 1)).toBe(LOT_IN_COURT)
    expect(checkDeclined(l, 'S', at + 1)).toBe(LOT_IN_COURT)
    const ignored = one(withCourt([act('lot.received', 'B', at + 2), act('lot.declined', 'S', at + 3)]))
    expect([ignored.receivedAt, ignored.declinedAt]).toEqual([null, null])
  })

  it('голоса — только «передано» / «не передано»; апелляции нет', () => {
    const l = one(withCourt())
    const c = caseOf(logAppeals(withCourt()), 'L1')!
    const t = { kind: 'lot' as const, lot: l }
    expect(courtVote({ verdict: 'delivered' }, 'lot')).toEqual({ ok: true, value: { verdict: 'delivered' } })
    for (const v of [{ verdict: 'keep' }, { verdict: 'cancel' }, { verdict: 'change', winner: 'author' }, null]) {
      expect(courtVote(v, 'lot')).toEqual({ ok: false, error: BAD_LOT_VERDICT })
    }
    // У события и пари голосов лота нет
    expect(courtVote({ verdict: 'delivered' }, 'offer')).toEqual({ ok: false, error: BAD_VERDICT })
    expect(courtVote({ verdict: 'undelivered' }, 'event')).toEqual({ ok: false, error: BAD_VERDICT })
    expect(checkCourtVote(t, c, order[0], { verdict: 'undelivered' }, at + 5)).toBeNull()
    expect(checkCourtVote(t, c, order[0], { verdict: 'keep' }, at + 5)).toBe(BAD_LOT_VERDICT)
    expect(checkAppeal(t, c, 'B', 'Не тот велосипед', courtRoom(foldLog(base)!), at + 5)).toBe(LOT_NO_APPEAL)
    expect(checkJoin(t, c, 'B', at + 5)).toBe(NO_APPEAL)
  })

  it('суд «передано» — получен, долг победителя продавцу', () => {
    const log = decide(['delivered', 'delivered', 'undelivered'])
    const decidedAt = at + 12
    const out = lotOutcome(one(log), decidedAt, caseOf(logAppeals(log), 'L1'))
    expect(out).toMatchObject({ status: 'received', received: { at: decidedAt, how: 'court' }, closedAt: decidedAt })
    expect(lotResult(one(log), decidedAt, caseOf(logAppeals(log), 'L1'))).toEqual([
      { memberId: 'S', net: 1100 },
      { memberId: 'B', net: -1100 },
    ])
    // До решения — ждёт суда
    expect(statusOf(log, at + 11)).toBe('court')
  })

  it('суд «не передано» — «не передан», долга нет; окончательно', () => {
    const log = decide(['undelivered', 'delivered', 'undelivered'])
    const out = lotOutcome(one(log), at + 12, caseOf(logAppeals(log), 'L1'))
    expect(out).toMatchObject({ status: 'undelivered', received: null, closedAt: at + 12 })
    expect(lotResult(one(log), at + 12, caseOf(logAppeals(log), 'L1'))).toEqual([])
  })

  it('суд без большинства — «не передано», долга нет', () => {
    // Двое разошлись, третий молчит срок суда, запасных нет — место пустое, большинства нет
    const log = withCourt([vote(order[0], 'delivered', at + 10), vote(order[1], 'undelivered', at + 11)])
    const c = caseOf(logAppeals(log), 'L1')!
    const end = at + NORMAL_TIMES.court
    expect(courtState(c, end).decidedAt).toBe(end)
    expect(lotOutcome(one(log), end, c)).toMatchObject({ status: 'undelivered', closedAt: end })
    expect(lotOutcome(one(log), end - 1, c).status).toBe('court')
  })

  it('место в суде — срок суда темпа лота (быстрый — 12 ч)', () => {
    const fast = sold([act('lot.handed', 'S', END + 5), act('lot.disputed', 'B', disputedAt), drawn(at, candidates)], { times: FAST_TIMES })
    const c = caseOf(logAppeals(fast), 'L1')!
    expect(c.seatTime).toBe(FAST_TIMES.court)
    expect(courtState(c, at).seats[0].until).toBe(at + FAST_TIMES.court)
  })

  it('ответ: лот с судом проходит проверку протокола', () => {
    const log = decide(['delivered', 'delivered', 'delivered'])
    const view = lotView(one(log), at + 20, caseOf(logAppeals(log), 'L1'))
    expect(view.court?.decision).toMatchObject({ majority: true, verdict: 'delivered' })
    expect(isLotView(view)).toBe(true)
    expect(isLotView({ ...view, status: 'sold' })).toBe(false)
    expect(isLotView({ ...view, court: { ...view.court, decision: { at: 1, majority: true, verdict: 'maybe' } as unknown as CourtVerdict } })).toBe(false)
  })
})

describe('лот в «Расчёте»', () => {
  const MEMBERS = ['H', 'S', 'A', 'B', 'C']
  const settle = (log: LogEntry[], now: number, mode: SettleMode = 'stakes', currency = 'RUB') =>
    roomSettlement({ currency, members: MEMBERS, events: [], offers: [], lots: logLots(log), cases: logAppeals(log), transfers: [] }, now, mode)
  const rowOf = (s: ReturnType<typeof settle>, m: string) => s.members.find((x) => x.memberId === m)!
  const ZERO = { amount: 0, events: 0, offers: 0, lots: 0 }

  it('торг идёт — лучшая ставка «в игре», перебитая — свободна', () => {
    const s = settle(sold(), T + 30)
    expect(rowOf(s, 'B').inPlay).toEqual({ ...ZERO, amount: 1100, lots: 1 })
    expect(rowOf(s, 'A').inPlay).toEqual(ZERO)
    expect(rowOf(s, 'S').inPlay).toEqual(ZERO)
    expect(s.suggestions).toEqual([])
  })

  it('после конца до «получено» — «ждёт»: долга ещё нет', () => {
    const s = settle(sold([act('lot.handed', 'S', END + 5)]), END + 10)
    expect(rowOf(s, 'B').pending).toEqual({ ...ZERO, amount: -1100, lots: 1 })
    expect(rowOf(s, 'S').pending).toEqual({ ...ZERO, amount: 1100, lots: 1 })
    expect(rowOf(s, 'B').total).toEqual(ZERO)
    expect(s.suggestions).toEqual([])
  })

  it('получено — итог: прямой долг победителя продавцу «по ставкам» и «меньше переводов»', () => {
    const log = sold([act('lot.received', 'B', END + 5)])
    for (const mode of ['stakes', 'fewest'] as const) {
      const s = settle(log, END + 5, mode)
      expect(rowOf(s, 'B')).toMatchObject({ total: { ...ZERO, amount: -1100, lots: 1 }, balance: -1100 })
      expect(rowOf(s, 'S')).toMatchObject({ total: { ...ZERO, amount: 1100, lots: 1 }, balance: 1100 })
      expect(s.suggestions).toEqual([{ from: 'B', to: 'S', amount: 1100 }])
    }
  })

  it('два лота: «по ставкам» — долг каждой пары, «меньше переводов» — общим счётом', () => {
    // L1: S продаёт B за 1100; L2: A продаёт S за 500
    const log = [
      ...sold([act('lot.received', 'B', END + 5)]),
      created({ id: 'L2', memberId: 'A', title: 'Гитара', start: 500, step: 50, requestId: 'QL2' }),
      bid('S', 500, T + 40, 'L2'),
      act('lot.received', 'S', END + 6, 'L2'),
    ]
    expect(settle(log, END + 10, 'stakes').suggestions).toEqual([
      { from: 'S', to: 'A', amount: 500 },
      { from: 'B', to: 'S', amount: 1100 },
    ])
    expect(settle(log, END + 10, 'fewest').suggestions).toEqual([
      { from: 'B', to: 'S', amount: 600 },
      { from: 'B', to: 'A', amount: 500 },
    ])
    expect(rowOf(settle(log, END + 10), 'S').total).toEqual({ ...ZERO, amount: 600, lots: 2 })
  })

  it('молчание и суд «передано» — тоже итог; снят, не продан, не состоялся, не передан — не в счёт', () => {
    const handed = END + 5
    expect(rowOf(settle(sold([act('lot.handed', 'S', handed)]), handed + SILENCE), 'B').total.amount).toBe(-1100)
    const none = [
      [...roomLog(), created()], // не продан
      [...roomLog(), created(), act('lot.withdrawn', 'S', T + 1)], // снят
      sold([act('lot.declined', 'S', END + 5)]), // не состоялся
    ]
    for (const log of none) {
      const s = settle(log, END + 100 * DAY)
      expect(s.members.every((m) => m.total.amount === 0 && m.pending.amount === 0 && m.inPlay.amount === 0)).toBe(true)
      expect(s.suggestions).toEqual([])
    }
  })

  it('комната на очки — итог в таблице, подсказок переводов нет', () => {
    const s = settle(sold([act('lot.received', 'B', END + 5)]), END + 5, 'stakes', 'PTS')
    expect(rowOf(s, 'S').total.amount).toBe(1100)
    expect(s.suggestions).toEqual([])
  })

  it('своду не дали лоты — счётчика лотов в числах нет (как до лотов)', () => {
    const s = roomSettlement({ currency: 'RUB', members: MEMBERS, events: [], offers: [], cases: [], transfers: [] }, END)
    expect(rowOf(s, 'S').total).toEqual({ amount: 0, events: 0, offers: 0 })
  })
})

describe('лот в журнале комнаты', () => {
  it('записи лота состояние комнаты не меняют и проходят проверку копии', () => {
    const log = sold([act('lot.handed', 'S', END + 5), act('lot.disputed', 'B', END + 10), act('lot.received', 'B', END + 11)])
    expect(foldLog(log)).toEqual(foldLog(roomLog()))
    expect(log.filter(isLotEntry)).toHaveLength(6)
    const backup = checkBackup({ format: 1, roomId: 'R', exportedAt: END + 20, log })
    expect(backup.ok).toBe(true)
  })

  it('записи о неизвестном лоте и суд по чужой цели не действуют', () => {
    const log = sold([bid('C', 5000, T + 30, 'L9'), act('lot.handed', 'S', END + 5, 'L9'), drawn(END + 6, ['H', 'A', 'C'])])
    const l = one(log)
    expect(l.bids).toHaveLength(2)
    expect([l.handedAt, l.courtAt]).toEqual([null, null])
  })
})
