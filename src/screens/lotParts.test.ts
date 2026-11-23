import { describe, expect, it } from 'vitest'
import { checkDisputed, checkHanded, checkLotBid, checkReceived, LOT_BID_STEP, LOT_TOO_EARLY } from '../rules/lot'
import { NORMAL_TIMES } from '../rules/pace'
import type { CourtView, LotView } from '../rules/protocol'
import type { SavedRoom } from '../store/db'
import { lotItem, historyItems } from './historyParts'
import {
  afterLine,
  bestLine,
  lotBidAskText,
  lotBidHint,
  lotDebtLine,
  lotDebts,
  lotHref,
  lotMine,
  lotOutbid,
  lotOutcomeOf,
  lotOutcomeWords,
  lotPastNow,
  lotRoomOf,
  lotState,
  lotStatusText,
  lotSummary,
  lotVerdictLabel,
  newLotHref,
  nextLotBid,
} from './lotParts'
import { basisText } from './settleParts'

const N = ' ' // суммы сравниваются после plain: неразрывные пробелы — обычные
const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x).replace(/[  ]/g, ' ')) as T
const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE
const SILENCE = NORMAL_TIMES.silence

// Аня (A) — ведущая, Боря (B) — продавец, Вера (V), Гена (G); смотрит Вера
const room: SavedRoom = {
  id: 'R1',
  server: 'https://example.test',
  memberId: 'V',
  key: 'k',
  invite: null,
  name: 'Чердак',
  currency: 'RUB',
  hostId: 'A',
  createdAt: 0,
  members: [
    { id: 'A', name: 'Аня' },
    { id: 'B', name: 'Боря' },
    { id: 'V', name: 'Вера' },
    { id: 'G', name: 'Гена' },
  ],
  savedAt: 0,
  syncedAt: 0,
}

const as = (memberId: string): SavedRoom => ({ ...room, memberId })

const END = 1000 * MINUTE

// Лот Бори: старт 1 000 ₽, шаг 100 ₽, торг до END; ставки — Вера 1 000 ₽, Гена 1 500 ₽
function lot(extra: Partial<LotView> = {}): LotView {
  const bids = extra.bids ?? [
    { id: 'b1', at: 10, by: 'V', amount: 100000 },
    { id: 'b2', at: 20, by: 'G', amount: 150000 },
  ]
  return {
    id: 'L1',
    at: 0,
    sellerId: 'B',
    title: 'Велосипед',
    description: 'синий',
    start: 100000,
    step: 10000,
    closesAt: END,
    latestEnd: END + 30 * MINUTE,
    endsAt: END,
    times: { ...NORMAL_TIMES },
    status: 'open',
    bids,
    best: bids[bids.length - 1] ?? null,
    winner: null,
    amount: null,
    withdrawnAt: null,
    handedAt: null,
    declinedAt: null,
    disputedAt: null,
    disputeFrom: null,
    silenceUntil: null,
    received: null,
    closedAt: null,
    ...extra,
  }
}

describe('lotParts: адреса и состояние', () => {
  it('адреса лота и «Нового лота»', () => {
    expect(lotHref('R1', 'L1')).toBe('#/room/R1/lot/L1')
    expect(newLotHref('R1')).toBe('#/room/R1/lot/new')
  })

  it('состояние для правил: те же проверки, что у сервера, на часах сервера', () => {
    const s = lotState(lot())
    expect(checkLotBid(s, 'V', 160000, lotRoomOf(room), END - 1)).toBeNull()
    expect(checkLotBid(s, 'V', 155000, lotRoomOf(room), END - 1)).toBe(LOT_BID_STEP)
    // После конца — Гена победитель: «Не получил» без «Передал» — только после срока молчания
    expect(checkDisputed(s, 'G', END + 1)).toBe(LOT_TOO_EARLY)
    expect(checkDisputed(s, 'G', END + SILENCE)).toBeNull()
    expect(checkHanded(s, 'B', END)).toBeNull()
    // «Получил» отметкой → receivedAt; молчанием — правила досчитают сами
    const got = lotState(lot({ received: { at: END + 5, how: 'mark' } }))
    expect(got.receivedAt).toBe(END + 5)
    expect(checkReceived(got, 'G', END + 6)).not.toBeNull()
    expect(lotState(lot({ received: { at: END + 5, how: 'silence' }, handedAt: END + 5 - SILENCE })).receivedAt).toBeNull()
  })

  it('итог между опросами: конец торга прошёл — ждёт передачи; молчание после «Передал» — получен', () => {
    expect(lotOutcomeOf(room, lot(), END - 1).status).toBe('open')
    expect(lotOutcomeOf(room, lot(), END).status).toBe('awaiting')
    const handed = lot({ handedAt: END + MINUTE, silenceUntil: END + MINUTE + SILENCE })
    expect(lotOutcomeOf(room, handed, END + 2 * MINUTE).status).toBe('handed')
    const out = lotOutcomeOf(room, handed, END + MINUTE + SILENCE)
    expect(out.status).toBe('received')
    expect(out.received?.how).toBe('silence')
    expect(lotOutcomeOf(room, lot({ bids: [] }), END).status).toBe('unsold')
  })
})

describe('lotParts: ставка', () => {
  it('подставлено лучшая + шаг, без ставок — старт; подсказка с основанием', () => {
    expect(nextLotBid(lot())).toBe(160000)
    expect(nextLotBid(lot({ bids: [] }))).toBe(100000)
    expect(plain(lotBidHint(lot(), 'RUB'))).toBe(`Не меньше 1${N}600${N}₽: лучшая 1${N}500${N}₽ + шаг 100${N}₽.`)
    expect(plain(lotBidHint(lot({ bids: [] }), 'RUB'))).toBe(`Не меньше старта — 1${N}000${N}₽.`)
  })

  it('окно ставки: основание; вдвое больше лучшей — второе подтверждение', () => {
    const small = plain(lotBidAskText(room, lot(), 160000))
    expect(small.body).toBe(`Вы ставите 1${N}600${N}₽ за „Велосипед“ — продавец Боря, лучшая сейчас — 1${N}500${N}₽.`)
    expect(small.twice).toBeNull()
    const big = plain(lotBidAskText(room, lot(), 300000))
    expect(big.twice).toBe(`3${N}000${N}₽ — вдвое больше лучшей ставки (1${N}500${N}₽). Проверьте, нет ли лишнего нуля: ставка не отзывается.`)
    expect(plain(lotBidAskText(room, lot({ bids: [] }), 200000)).twice).toContain('вдвое больше старта (1')
  })

  it('«вас перебили» — пока торг идёт, моя ставка есть, а лучшая чужая', () => {
    expect(lotOutbid(room, lot(), END - 1)).toBe(true)
    expect(lotOutbid(room, lot(), END)).toBe(false)
    expect(lotOutbid(as('G'), lot(), END - 1)).toBe(false)
    expect(lotOutbid(as('A'), lot(), END - 1)).toBe(false)
  })

  it('лучшая ставка словами', () => {
    expect(plain(bestLine(room, lot()))).toBe(`лучшая ставка — Гена, 1${N}500${N}₽`)
    expect(plain(bestLine(as('G'), lot()))).toBe(`лучшая ставка — Гена (вы), 1${N}500${N}₽`)
    expect(plain(bestLine(room, lot({ bids: [] })))).toBe(`ставок нет, старт — 1${N}000${N}₽`)
  })

  it('сводка «Нового лота» — по ходу ввода', () => {
    expect(lotSummary({ start: null, step: null, currency: 'RUB' })).toBe('Введите старт — наименьшую первую ставку.')
    expect(plain(lotSummary({ start: 100000, step: 10000, currency: 'RUB' }))).toMatch(new RegExp(`^Старт — 1${N}000${N}₽, шаг — 100${N}₽: первая ставка — не меньше старта`))
  })
})

describe('lotParts: статус и ход после торга', () => {
  it('строка статуса по итогу', () => {
    expect(lotStatusText(room, lot(), END - 60 * 1000).text).toMatch(/^торг до .*, осталось 1 мин/)
    expect(plain(lotStatusText(room, lot(), END))).toEqual({ text: `торг закончен — ждёт передачи: Гена, 1${N}500${N}₽`, tone: 'open' })
    expect(lotStatusText(room, lot({ bids: [] }), END).text).toBe('не продан — ставок не было')
    expect(lotStatusText(room, lot({ bids: [], withdrawnAt: 5 }), 6).text).toBe('снят продавцом')
    expect(lotStatusText(room, lot({ declinedAt: END + 1 }), END + 2).text).toBe('не состоялся — продавец не сможет передать, никто никому не должен')
    expect(plain(lotStatusText(room, lot({ received: { at: END + 1, how: 'mark' } }), END + 2))).toEqual({ text: `получен — долг Гена → Боря: 1${N}500${N}₽`, tone: 'final' })
    expect(lotStatusText(room, lot({ handedAt: END + 1, silenceUntil: END + 1 + SILENCE }), END + 2).text).toBe('продавец передал — ждём «Получил» от Гена')
    expect(lotStatusText(room, lot({ disputedAt: END + SILENCE }), END + SILENCE + 1).text).toBe('в споре — победитель не получил, судить некому')
  })

  it('победителю после «Передал» — «если промолчите до …, считается получено»', () => {
    const handed = lot({ handedAt: END + 1, silenceUntil: END + 1 + SILENCE })
    expect(afterLine(as('G'), handed, END + 2)).toMatch(/Если промолчите до .*, считается получено\.$/)
    expect(afterLine(as('B'), handed, END + 2)).toMatch(/^Ждём «Получил» от Гена\. Промолчит до .* — считается получено\.$/)
    expect(afterLine(room, handed, END + 2)).toBeNull()
  })

  it('победителю до «Передал» — с какого мига «Не получил»; продавцу — передать и отметить', () => {
    const ended = lot({ disputeFrom: END + SILENCE })
    expect(afterLine(as('G'), ended, END + 1)).toMatch(/^Вы выиграли торг\. «Не получил» — после «Передал» продавца или с /)
    expect(afterLine(as('G'), ended, END + SILENCE)).toBe('Вы выиграли торг. Продавец не отметил «Передал» — можно «Не получил».')
    expect(afterLine(as('B'), ended, END + 1)).toBe('Торг закончен: передайте лот победителю — Гена — и отметьте «Передал».')
  })

  it('голоса суда по лоту — «передано» / «не передано»', () => {
    expect(lotVerdictLabel({ verdict: 'delivered' })).toBe('передано')
    expect(lotVerdictLabel({ verdict: 'undelivered' })).toBe('не передано')
  })

  it('суд собран, решения нет — «ждёт суда»; решил «передано» — получен судом', () => {
    const drawnAt = END + SILENCE + 1
    const court: CourtView = {
      seed: 'ab',
      drawnAt,
      candidates: ['A', 'V'],
      seats: [],
      decision: null,
    }
    const disputed = lot({ disputedAt: END + SILENCE, court })
    expect(lotStatusText(room, disputed, drawnAt + 1).text).toBe('ждёт суда — победитель отметил «Не получил»')
    const voted: CourtView = {
      ...court,
      seats: [
        { member: 'A', since: drawnAt, until: drawnAt + DAY, replaced: null, vote: { id: 'v1', at: drawnAt + 1, by: 'A', verdict: 'delivered' } },
        { member: 'V', since: drawnAt, until: drawnAt + DAY, replaced: null, vote: { id: 'v2', at: drawnAt + 2, by: 'V', verdict: 'delivered' } },
      ],
    }
    const out = lotOutcomeOf(room, lot({ disputedAt: END + SILENCE, court: voted }), drawnAt + 3)
    expect(out.status).toBe('received')
    expect(out.received?.how).toBe('court')
  })
})

describe('lotParts: «Расчёт» и «История»', () => {
  const got = lot({ received: { at: END + 5, how: 'mark' } })

  it('долг по полученному лоту — с основанием «лот „…“»', () => {
    const debts = lotDebts(room, [got, lot({ bids: [] })], END + 6)
    expect(debts).toEqual([{ lot: 'L1', title: 'Велосипед', from: 'G', to: 'B', amount: 150000, at: END + 5 }])
    expect(plain(lotDebtLine(as('G'), debts[0]))).toBe(`Гена (вы) → Боря: 1${N}500${N}₽ — лот „Велосипед“`)
    expect(lotDebts(room, [lot()], END + 6)).toEqual([])
  })

  it('основание чисел расчёта — «по N лотам»', () => {
    expect(basisText({ amount: 1, events: 0, offers: 0, lots: 1 })).toBe('по 1 лоту')
    expect(basisText({ amount: 1, events: 0, offers: 0, lots: 3 })).toBe('по 3 лотам')
    expect(basisText({ amount: 1, events: 3, offers: 0, lots: 2 })).toBe('по 3 событиям и 2 лотам')
    expect(basisText({ amount: 1, events: 0, offers: 2, lots: 1 })).toBe('по 2 пари и 1 лоту')
    expect(basisText({ amount: 1, events: 3, offers: 2, lots: 1 })).toBe('по 5 событиям и пари, 1 лоту')
    expect(basisText({ amount: 1, events: 3, offers: 2 })).toBe('по 5 событиям и пари')
    expect(basisText({ amount: 0, events: 0, offers: 0, lots: 0 })).toBe('')
  })

  it('прошедший — итог есть; ждущий передачи и идущий — нет', () => {
    expect(lotPastNow(room, got, END + 6)).toBe(END + 5)
    expect(lotPastNow(room, lot({ bids: [] }), END)).toBe(END)
    expect(lotPastNow(room, lot(), END)).toBeNull()
    expect(lotPastNow(room, lot(), END - 1)).toBeNull()
  })

  it('исход словами и мой итог: продавцу плюс, победителю минус, ставившему ноль', () => {
    const out = lotOutcomeOf(room, got, END + 6)
    expect(plain(lotOutcomeWords(room, got, out))).toBe(`продан — Гена, 1${N}500${N}₽`)
    expect(lotMine(got, 'B', out)).toBe(150000)
    expect(lotMine(got, 'G', out)).toBe(-150000)
    expect(lotMine(got, 'V', out)).toBe(0)
    expect(lotMine(got, 'A', out)).toBeNull()
    const failed = lot({ declinedAt: END + 1 })
    const f = lotOutcomeOf(room, failed, END + 2)
    expect(lotOutcomeWords(room, failed, f)).toBe('не состоялся — продавец не смог передать')
    expect(lotMine(failed, 'B', f)).toBe(0)
    expect(lotOutcomeWords(room, lot({ bids: [] }), lotOutcomeOf(room, lot({ bids: [] }), END))).toBe('не продан — ставок не было')
  })

  it('строка «Истории» и общий список: лот — среди прошедшего', () => {
    const item = lotItem(as('G'), got, lotOutcomeOf(room, got, END + 6))
    expect(plain(item)).toEqual({ kind: 'lot', id: 'L1', condition: 'Велосипед', at: END + 5, outcome: `продан — Гена, 1${N}500${N}₽`, mine: { kind: 'net', amount: -150000, refund: 0 } })
    expect(lotItem(room, lot(), lotOutcomeOf(room, lot(), END))).toBeNull()
    const unsold = lot({ id: 'L2', bids: [] })
    const items = historyItems(room, [], [], END + 6, [got, unsold, lot({ id: 'L3', closesAt: END + DAY, endsAt: END + DAY })])
    expect(items.map((x) => x.id)).toEqual(['L1', 'L2'])
    expect(items[1].mine).toEqual({ kind: 'none' })
  })
})
