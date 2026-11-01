import { describe, expect, it } from 'vitest'
import {
  chanceHistory,
  chancePercents,
  formatChance,
  formatOdds,
  payoutIfWins,
  poolOdds,
  settlePool,
  type PoolBet,
} from './pool'

const bet = (memberId: string, outcome: string, amount: number, at = 0): PoolBet => ({ memberId, outcome, amount, at })

describe('банк, коэффициент, вероятность', () => {
  it('900 на «да», 300 на «нет»: коэффициенты 1,33 и 4, вероятности 75 % и 25 %', () => {
    const p = poolOdds(['yes', 'no', 'draw'], [bet('a', 'yes', 900), bet('b', 'no', 300)])
    expect(p.bank).toBe(1200)
    const [yes, no, draw] = p.outcomes
    expect(yes.stake).toBe(900)
    expect(formatOdds(yes.odds)).toBe('1,33')
    expect(formatOdds(no.odds)).toBe('4')
    expect(yes.chance).toBe(0.75)
    expect(formatChance(yes.chance)).toBe('75 %')
    expect(formatChance(no.chance)).toBe('25 %')
    // на исход без ставок коэффициента нет — не бесконечность и не 0
    expect(draw.odds).toBeNull()
    expect(formatOdds(draw.odds)).toBe('—')
    expect(draw.chance).toBe(0)
  })
  it('банк пуст — ни коэффициентов, ни вероятностей', () => {
    const p = poolOdds(['yes', 'no'], [])
    expect(p.bank).toBe(0)
    expect(p.outcomes.every((o) => o.odds === null && o.chance === null)).toBe(true)
  })
  it('крошечная доля — «< 1 %», а не «0 %»', () => {
    expect(formatChance(0.001)).toBe('< 1 %')
    expect(formatChance(0)).toBe('0 %')
  })
})

describe('проценты события — в сумме ровно 100', () => {
  const N = ' '
  const sum = (xs: (number | null)[]) => xs.reduce<number>((s, x) => s + (x ?? 0), 0)
  const percentsOf = (stakes: number[]) => {
    const ids = stakes.map((_, i) => String(i))
    const bets = stakes.flatMap((s, i) => (s > 0 ? [bet('a', String(i), s)] : []))
    return chancePercents(poolOdds(ids, bets).outcomes.map((o) => o.chance))
  }
  it('банк 800: 300 и 500 — 38 % и 62 %, а не 38 и 63', () => {
    expect(percentsOf([300, 500])).toEqual([38, 62])
  })
  it('три равные доли — 34, 33, 33: лишняя единица исходу выше в списке', () => {
    expect(percentsOf([100, 100, 100])).toEqual([34, 33, 33])
    expect(chancePercents([1 / 3, 1 / 3, 1 / 3])).toEqual([34, 33, 33])
  })
  it('две равные доли — 50 и 50', () => {
    expect(percentsOf([7, 7])).toEqual([50, 50])
  })
  it('наибольший остаток получает единицу', () => {
    // 16,67 · 33,33 · 50 → 17 · 33 · 50
    expect(percentsOf([1, 2, 3])).toEqual([17, 33, 50])
  })
  it('доля меньше 0,5 % — 0, на экране «< 1 %»; остальные добирают до 100', () => {
    // 33,3 · 33,3 · 33 · 0,4: остаток крошечной доли больше, но единицу она не получает
    const p = chancePercents([0.333, 0.333, 0.33, 0.004])
    expect(p).toEqual([34, 33, 33, 0])
    expect(formatChance(0.004, p[3])).toBe(`<${N}1${N}%`)
    expect(formatChance(0.333, p[0])).toBe(`34${N}%`)
    expect(percentsOf([999, 1])).toEqual([100, 0])
  })
  it('исход без ставок — 0, банк пуст — нет процентов', () => {
    expect(percentsOf([300, 0, 100])).toEqual([75, 0, 25])
    expect(chancePercents([null, null])).toEqual([null, null])
  })
  it('сумма всегда 100', () => {
    const sets = [
      [1, 1, 1, 1, 1, 1, 1],
      [3, 3, 3, 1],
      [29, 71],
      [1, 1000, 1000, 1000],
      [13, 17, 19, 23, 29],
      [300, 500],
      [1, 1, 1],
    ]
    for (const s of sets) expect(sum(percentsOf(s))).toBe(100)
    for (const p of chanceHistory(['a', 'b', 'c'], [bet('x', 'a', 1), bet('x', 'b', 2), bet('x', 'c', 4)])) {
      expect(sum(chancePercents(['a', 'b', 'c'].map((o) => p.chances[o])))).toBe(100)
    }
  })
})

describe('выплаты', () => {
  it('победители делят весь банк пропорционально ставкам', () => {
    const s = settlePool([bet('a', 'yes', 600), bet('b', 'yes', 300), bet('c', 'no', 300)], 'yes')
    expect(s.void).toBe(false)
    expect(s.payouts).toEqual([
      { memberId: 'a', staked: 600, payout: 800, net: 200 },
      { memberId: 'b', staked: 300, payout: 400, net: 100 },
      { memberId: 'c', staked: 300, payout: 0, net: -300 },
    ])
  })
  it('остаток единиц — по одной победителям по порядку ставок', () => {
    // банк 10, на «да» 3 ставки по 1: по 3, остаток 1 — первому
    const s = settlePool(
      [bet('a', 'yes', 1), bet('b', 'yes', 1), bet('c', 'yes', 1), bet('d', 'no', 7)],
      'yes',
    )
    expect(s.payouts.map((p) => p.payout)).toEqual([4, 3, 3, 0])
  })
  it('сумма выплат ровно равна банку на сотнях случайных наборов', () => {
    let seed = 42
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed % n
    }
    const outcomes = ['a', 'b', 'c']
    for (let k = 0; k < 500; k++) {
      const bets: PoolBet[] = []
      const n = 1 + rnd(20)
      for (let i = 0; i < n; i++) {
        const big = rnd(10) === 0
        bets.push(bet('m' + rnd(6), outcomes[rnd(3)], 1 + (big ? rnd(2 ** 30) * 1000 : rnd(1000)), i))
      }
      const winner = outcomes[rnd(3)]
      const s = settlePool(bets, winner)
      expect(s.payouts.reduce((x, p) => x + p.payout, 0)).toBe(s.bank)
      expect(s.payouts.reduce((x, p) => x + p.net, 0)).toBe(0)
      for (const p of s.payouts) expect(Number.isInteger(p.payout)).toBe(true)
    }
  })
  it('огромные суммы — без потери точности', () => {
    const big = Number.MAX_SAFE_INTEGER - 10
    const s = settlePool([bet('a', 'yes', big), bet('b', 'yes', 3), bet('c', 'no', 7)], 'yes')
    expect(s.payouts.reduce((x, p) => x + p.payout, 0)).toBe(big + 10)
  })
  it('на выигравший исход никто не ставил — без игры, каждому его сумма', () => {
    const s = settlePool([bet('a', 'yes', 500), bet('b', 'no', 300)], 'draw')
    expect(s.void).toBe(true)
    expect(s.payouts.map((p) => [p.payout, p.net])).toEqual([
      [500, 0],
      [300, 0],
    ])
  })
  it('все ставки на один исход — без игры, даже если он выиграл', () => {
    const s = settlePool([bet('a', 'yes', 500), bet('b', 'yes', 301)], 'yes')
    expect(s.void).toBe(true)
    expect(s.payouts.map((p) => p.payout)).toEqual([500, 301])
  })
  it('отменённое событие — без игры', () => {
    const s = settlePool([bet('a', 'yes', 500), bet('b', 'no', 300), bet('a', 'no', 7)], null)
    expect(s.void).toBe(true)
    expect(s.payouts).toEqual([
      { memberId: 'a', staked: 507, payout: 507, net: 0 },
      { memberId: 'b', staked: 300, payout: 300, net: 0 },
    ])
  })
  it('несколько ставок одного участника, на разные исходы — одна строка', () => {
    const s = settlePool([bet('a', 'yes', 300), bet('b', 'no', 600), bet('a', 'no', 300)], 'no')
    // банк 1200, на «нет» 900: a — 300 × 1200/900 = 400, b — 800
    expect(s.payouts).toEqual([
      { memberId: 'a', staked: 600, payout: 400, net: -200 },
      { memberId: 'b', staked: 600, payout: 800, net: 200 },
    ])
  })
  it('без ставок — пусто', () => {
    expect(settlePool([], 'yes')).toEqual({ bank: 0, void: true, payouts: [] })
  })
})

describe('прикидка «сколько получу»', () => {
  it('по ставкам на сейчас с новой ставкой', () => {
    const bets = [bet('a', 'yes', 900), bet('b', 'no', 300)]
    // банк 1300, на «нет» 400: 100 × 1300 / 400 = 325
    expect(payoutIfWins(bets, 'no', 100)).toBe(325)
    // банк 1500, на «да» 1200: 300 × 1500 / 1200 = 375 — только по новой ставке
    expect(payoutIfWins(bets, 'yes', 300)).toBe(375)
  })
  it('ставка сделает событие «без игры» — вернётся своя сумма', () => {
    expect(payoutIfWins([], 'yes', 100)).toBe(100)
    expect(payoutIfWins([bet('a', 'yes', 50)], 'yes', 100)).toBe(100)
  })
})

describe('история вероятностей', () => {
  it('точка после каждой ставки', () => {
    const h = chanceHistory(['yes', 'no'], [bet('a', 'yes', 100, 1000), bet('b', 'no', 300, 2000)])
    expect(h).toEqual([
      { at: 1000, chances: { yes: 1, no: 0 } },
      { at: 2000, chances: { yes: 0.25, no: 0.75 } },
    ])
  })
})
