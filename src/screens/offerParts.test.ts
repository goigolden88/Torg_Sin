import { describe, expect, it } from 'vitest'
import type { BiddingView, OfferView } from '../rules/protocol'
import type { SavedRoom } from '../store/db'
import {
  amountsOddsLabel,
  auctionOpenText,
  auctionResultText,
  auctionSummary,
  bidAskText,
  bidIsLarge,
  latestEndLine,
  nextBid,
  offerState,
  outbid,
  promiseLine,
  promiseOf,
  promiseResultText,
  promiseSummary,
  repeatForm,
  repeatHref,
  stakesLine,
  stakesOf,
  unitsText,
} from './offerParts'
import { offerStatus } from '../rules/offer'

// Тысячи и знак валюты отделены неразрывным пробелом — сравниваем как обычные
const plain = (s: string | null | undefined) => s?.replace(/ /g, ' ') ?? s
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

// Боря (B) — автор торга, Аня (A) — ведущая, Вера (V) и Гена (G) торгуются
const room = (memberId: string): SavedRoom => ({
  id: 'R1',
  server: 'https://example.test',
  memberId,
  key: 'k',
  invite: null,
  name: 'Регата',
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
})

const T0 = 1_000_000
const END = T0 + 15 * MINUTE

// Торг: Боря ставит 300 ₽ на «сбудется», старт 1 000 ₽, шаг 100 ₽, конец через 15 минут
function auction(bidding: Partial<BiddingView> = {}, extra: Partial<OfferView> = {}): OfferView {
  const bids = bidding.bids ?? []
  const best = bids[bids.length - 1] ?? null
  return {
    id: 'O1',
    at: T0,
    authorId: 'B',
    condition: 'Придём первыми к буйку',
    check: 'Фото с финиша',
    side: 'yes',
    odds: { a: 30000, b: best?.amount ?? 100000 },
    amount: 30000,
    takerAmount: best?.amount ?? 100000,
    to: null,
    closesAt: END,
    expectedAt: END + HOUR,
    guarantorId: 'A',
    counterTo: null,
    subjectId: null,
    guarantorRule: true,
    auction: { start: 100000, step: 10000, latestEnd: END + 30 * MINUTE },
    bidding: { bids, best, endsAt: END, result: null, ...bidding },
    status: 'open',
    accepted: null,
    withdrawnAt: null,
    closedBy: null,
    outcome: null,
    ...extra,
  }
}

const bid = (id: string, by: string, amount: number, at = T0 + MINUTE) => ({ id, at, by, amount })

describe('кэф торга из сумм', () => {
  it('меньшая сторона — 1; до 10 — с одним знаком, дальше — целым; ровно — без дроби', () => {
    expect(amountsOddsLabel(30000, 1000000)).toBe('1 к 33')
    expect(amountsOddsLabel(30000, 100000)).toBe('1 к 3,3')
    expect(amountsOddsLabel(30000, 45000)).toBe('1 к 1,5')
    expect(amountsOddsLabel(30000, 30000)).toBe('1 к 1')
    expect(amountsOddsLabel(30000, 10000)).toBe('3 к 1')
    expect(amountsOddsLabel(30000, 60000)).toBe('1 к 2')
  })
})

describe('суммы торга', () => {
  it('без встречных — старт; со встречными — лучшее', () => {
    expect(stakesOf(auction())).toEqual({ author: 30000, taker: 100000, bank: 130000, exact: true })
    const o = auction({ bids: [bid('b1', 'V', 100000), bid('b2', 'G', 400000)] })
    expect(stakesOf(o)).toEqual({ author: 30000, taker: 400000, bank: 430000, exact: true })
  })

  it('строка сумм: старт, лучшее встречное, принято', () => {
    expect(plain(stakesLine(room('A'), auction(), T0))).toBe('Боря ставит 300 ₽ на „сбудется“, старт — 1 000 ₽ (кэф 1 к 3,3), встречных нет')
    const o = auction({ bids: [bid('b1', 'V', 1000000)] })
    expect(plain(stakesLine(room('V'), o, T0))).toBe('Боря ставит 300 ₽ на „сбудется“, лучшее встречное — вы, 10 000 ₽ (кэф 1 к 33), банк 10 300 ₽')
    // Конец торга между опросами: лучшее принято само
    expect(plain(stakesLine(room('B'), o, END))).toBe('вы ставите 300 ₽ на „сбудется“, Вера — 10 000 ₽ (кэф 1 к 33), банк 10 300 ₽')
  })
})

describe('встречное в торге', () => {
  it('подставить: без встречных — старт, дальше — лучшее + шаг', () => {
    expect(nextBid(auction())).toBe(100000)
    expect(nextBid(auction({ bids: [bid('b1', 'V', 400000)] }))).toBe(410000)
  })

  it('вдвое больше лучшего (без встречных — старта) — второе подтверждение', () => {
    const o = auction({ bids: [bid('b1', 'G', 400000)] })
    expect(bidIsLarge(o, 799999)).toBe(false)
    expect(bidIsLarge(o, 800000)).toBe(true)
    expect(bidIsLarge(auction(), 200000)).toBe(true)
    expect(bidIsLarge(auction(), 150000)).toBe(false)
  })

  it('окно: «вы ставите … против … автора — кэф», большое — текст второго подтверждения', () => {
    const o = auction({ bids: [bid('b1', 'G', 400000)] })
    const t = bidAskText(room('V'), o, 1000000)
    expect(plain(t.body)).toBe('Вы ставите 10 000 ₽ против 300 ₽ автора (Боря) — кэф 1 к 33, банк 10 300 ₽.')
    expect(plain(t.twice)).toBe('10 000 ₽ — вдвое больше лучшего встречного (4 000 ₽). Проверьте, нет ли лишнего нуля: встречное не отзывается.')
    expect(bidAskText(room('V'), o, 410000).twice).toBeNull()
    expect(plain(bidAskText(room('V'), auction(), 300000).twice)).toBe('3 000 ₽ — вдвое больше старта (1 000 ₽). Проверьте, нет ли лишнего нуля: встречное не отзывается.')
  })

  it('«вас перебили» — только тому, чьё встречное перебито, пока торг идёт', () => {
    const o = auction({ bids: [bid('b1', 'V', 100000), bid('b2', 'G', 400000)] })
    expect(outbid(o, 'V', T0 + 2 * MINUTE)).toBe(true)
    expect(outbid(o, 'G', T0 + 2 * MINUTE)).toBe(false)
    expect(outbid(o, 'A', T0 + 2 * MINUTE)).toBe(false)
    expect(outbid(o, 'V', END)).toBe(false)
  })
})

describe('ход и конец торга', () => {
  it('состояние для правил: встречные, конец с продлениями, как принято', () => {
    const o = auction({ bids: [bid('b1', 'V', 100000)], endsAt: END + 2 * MINUTE })
    expect(offerState(o).auction).toEqual({ start: 100000, step: 10000, endsAt: END + 2 * MINUTE, bids: [bid('b1', 'V', 100000)], taken: null })
    expect(offerStatus(offerState(o), END + MINUTE)).toBe('open')
    expect(offerStatus(offerState(o), END + 2 * MINUTE)).toBe('accepted')
    expect(offerStatus(offerState(auction()), END)).toBe('failed')
  })

  it('строка «торг до …, осталось …»', () => {
    expect(auctionOpenText(END, END - 5 * MINUTE)).toMatch(/^торг до .+, осталось 5 мин$/)
  })

  it('итог: торг закончен — соперник и сумма; не состоялось; идёт — ничего', () => {
    const o = auction({ bids: [bid('b1', 'V', 1000000)] })
    expect(auctionResultText(room('B'), o, T0 + 2 * MINUTE)).toBeNull()
    expect(plain(auctionResultText(room('B'), o, END))).toBe('Торг закончен — соперник Вера, 10 000 ₽')
    expect(plain(auctionResultText(room('V'), o, END))).toBe('Торг закончен — соперник Вера (вы), 10 000 ₽')
    const now = auction(
      { bids: [bid('b1', 'V', 1000000)], result: { how: 'now', at: T0 + 3 * MINUTE, bid: 'b1' } },
      { status: 'accepted', accepted: { by: 'V', at: T0 + 3 * MINUTE } },
    )
    expect(plain(auctionResultText(room('B'), now, T0 + 4 * MINUTE))).toBe('Торг закончен (автор принял сейчас) — соперник Вера, 10 000 ₽')
    expect(auctionResultText(room('B'), auction(), END)).toBe('Не состоялось — никто не дал старт')
  })

  it('«Торг закончится не позже …» — конец + 30 минут', () => {
    expect(latestEndLine(END)).toContain('Торг закончится не позже ')
    expect(latestEndLine(END)).toContain('не больше чем на 30 минут')
  })
})

describe('форма торга', () => {
  it('сумма в поле из минимальных единиц', () => {
    expect(unitsText(100000, 'RUB')).toBe('1000')
    expect(unitsText(10050, 'RUB')).toBe('100,5')
    expect(unitsText(5, 'RUB')).toBe('0,05')
  })

  it('под формой: суммы, старт с кэфом, шаг; чего не хватает', () => {
    expect(plain(auctionSummary({ side: 'yes', amount: 30000, start: 100000, step: 10000, currency: 'RUB' }))).toBe(
      'Вы ставите 300 ₽ на „сбудется“; соперник — не меньше 1 000 ₽ на „не сбудется“ (старт, кэф 1 к 3,3), каждое следующее встречное — больше лучшего хотя бы на 100 ₽. Кто даст больше всех к концу торга — тот соперник; принять лучшее можно и раньше.',
    )
    expect(auctionSummary({ side: 'yes', amount: null, start: 100000, step: 10000, currency: 'RUB' })).toBe('Введите свою сумму — здесь появится, сколько ставит каждый.')
    expect(auctionSummary({ side: 'no', amount: 30000, start: null, step: null, currency: 'RUB' })).toBe('Введите старт — наименьшую сумму соперника.')
  })

  it('«Повторить»: те же условия, та же длительность торга от нового «сейчас» (вверх до минуты)', () => {
    const later = T0 + 20 * HOUR + 30 * 1000
    const f = repeatForm(auction(), 'A', later)
    expect(f).toMatchObject({ condition: 'Придём первыми к буйку', check: 'Фото с финиша', side: 'yes', amount: 30000, start: 100000, step: 10000, subject: '', guarantor: '', none: false })
    expect(f!.closesAt).toBe(Math.ceil((later + 15 * MINUTE) / MINUTE) * MINUTE)
    expect(f!.closesAt - later).toBeGreaterThanOrEqual(15 * MINUTE)
    expect(f!.expectedAt - f!.closesAt).toBe(HOUR)
    // Гарант не ведущий — он же; без гаранта — без гаранта
    expect(repeatForm(auction({}, { guarantorId: 'G' }), 'A', later)?.guarantor).toBe('G')
    expect(repeatForm(auction({}, { guarantorId: null }), 'A', later)).toMatchObject({ guarantor: '', none: true })
    expect(repeatForm({ ...auction(), auction: undefined }, 'A', later)).toBeNull()
    expect(repeatHref('R1', 'O1')).toBe('#/room/R1/offer/new?repeat=O1')
  })
})

// Пари на обещание (Р-44): Боря — автор на «сбудется», Вера приняла
function promised(extra: Partial<OfferView> = {}): OfferView {
  return {
    ...auction(),
    auction: undefined,
    bidding: undefined,
    odds: { a: 1, b: 1 },
    amount: 0,
    takerAmount: 0,
    promise: { author: 'везёт шашлык', taker: 'моет машину' },
    ...extra,
  }
}

describe('пари на обещание', () => {
  it('вместо суммы — «на обещание: автора / соперника»; одно и то же — «у обоих»; сумм нет', () => {
    expect(stakesOf(promised())).toBeNull()
    expect(stakesLine(room('V'), promised(), T0)).toBe('на обещание: везёт шашлык / моет машину')
    expect(stakesLine(room('V'), promised({ promise: { author: 'везёт шашлык', taker: 'везёт шашлык' } }))).toBe('на обещание: везёт шашлык (у обоих)')
    expect(promiseLine({ author: 'a', taker: 'b' })).toBe('на обещание: a / b')
  })

  it('состояние для правил — с обещаниями (встречное и исход их видят)', () => {
    expect(offerState(promised()).promise).toEqual({ author: 'везёт шашлык', taker: 'моет машину' })
    expect(offerState(auction()).promise).toBeUndefined()
  })

  it('обещание стороны и итог — проигравший и его обещание', () => {
    const o = promised({ accepted: { by: 'V', at: T0 + MINUTE } })
    expect(promiseOf(o, 'author')).toBe('везёт шашлык')
    expect(promiseOf(o, 'taker')).toBe('моет машину')
    expect(promiseOf(auction(), 'author')).toBeNull()
    expect(promiseResultText(room('V'), o, 'author')).toBe('Вера проиграл(а): моет машину')
    expect(promiseResultText(room('V'), o, 'taker')).toBe('Боря проиграл(а): везёт шашлык')
  })

  it('под формой: кто что сделает; чего не хватает — что ввести', () => {
    expect(promiseSummary('везу шашлык', 'моет машину')).toBe(
      'Проиграете — вы: везу шашлык. Проиграет соперник — он: моет машину. Денег на кону нет: итог и «кто кому» не меняются.',
    )
    expect(promiseSummary('  ', 'моет машину')).toBe('Введите своё обещание — здесь появится, кто что сделает, если проиграет.')
    expect(promiseSummary('везу шашлык', ' ')).toBe('Введите обещание соперника: что он сделает, если проиграет.')
  })
})
