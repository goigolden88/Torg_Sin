// Деньги события-пула (Архитектура, «Правила» — «Пул», «Крайние случаи» — без игры).
// Банк — все ставки; победители делят его пропорционально своим ставкам на исход, остаток
// единиц — по одной победителям по порядку ставок. Коэффициенты и итоги считаются, не хранятся.
// Суммы — целые в минимальных единицах валюты комнаты; деление выплат — только целыми

// Ставка — как будет в журнале: участник, исход (строковый номер исхода события), сумма (целое > 0),
// время сервера. Порядок массива — порядок журнала
export type PoolBet = { memberId: string; outcome: string; amount: number; at: number }

export type OutcomeOdds = {
  outcome: string
  stake: number // поставлено на исход
  odds: number | null // банк ÷ ставки на исход; на исход без ставок — нет
  chance: number | null // «вероятность по ставкам» 0…1: ставки на исход ÷ банк; банк пуст — нет
}

export type PoolOdds = { bank: number; outcomes: OutcomeOdds[] }

// Банк, коэффициент и вероятность по ставкам каждого исхода (в порядке outcomes)
export function poolOdds(outcomes: readonly string[], bets: readonly PoolBet[]): PoolOdds {
  const stakes = new Map<string, number>(outcomes.map((o) => [o, 0]))
  let bank = 0
  for (const b of bets) {
    bank += b.amount
    stakes.set(b.outcome, (stakes.get(b.outcome) ?? 0) + b.amount)
  }
  return {
    bank,
    outcomes: outcomes.map((outcome) => {
      const stake = stakes.get(outcome) ?? 0
      return {
        outcome,
        stake,
        odds: stake > 0 ? bank / stake : null,
        chance: bank > 0 ? stake / bank : null,
      }
    }),
  }
}

// Строка расчёта на участника: все его ставки вместе
export type PoolPayout = {
  memberId: string
  staked: number // поставил всего
  payout: number // получает
  net: number // payout − staked
}

export type PoolSettlement = {
  bank: number
  void: boolean // «без игры»: каждому — ровно его сумма
  payouts: PoolPayout[] // по порядку первой ставки участника
}

// Расчёт пула. winner — утверждённый исход; null — событие отменено.
// Без игры: отменено, на выигравший исход никто не ставил или все ставки — на один исход
export function settlePool(bets: readonly PoolBet[], winner: string | null): PoolSettlement {
  const bank = bets.reduce((s, b) => s + b.amount, 0)
  const winStake = bets.reduce((s, b) => (b.outcome === winner ? s + b.amount : s), 0)
  const isVoid = winner === null || winStake === 0 || new Set(bets.map((b) => b.outcome)).size < 2

  // Выплата по каждой ставке
  const perBet: number[] = bets.map((b) => {
    if (isVoid) return b.amount
    if (b.outcome !== winner) return 0
    return Number((BigInt(bank) * BigInt(b.amount)) / BigInt(winStake))
  })
  if (!isVoid) {
    let rest = bank - perBet.reduce((s, x) => s + x, 0)
    // Остаток меньше числа выигравших ставок: по одной единице по порядку ставок
    for (let i = 0; i < bets.length && rest > 0; i++) {
      if (bets[i].outcome === winner) {
        perBet[i] += 1
        rest -= 1
      }
    }
  }

  const rows = new Map<string, PoolPayout>()
  bets.forEach((b, i) => {
    const row = rows.get(b.memberId) ?? { memberId: b.memberId, staked: 0, payout: 0, net: 0 }
    row.staked += b.amount
    row.payout += perBet[i]
    row.net = row.payout - row.staked
    rows.set(b.memberId, row)
  })
  return { bank, void: isVoid, payouts: [...rows.values()] }
}

// «Если поставлю amount на outcome и он выиграет — сколько получу»: по ставкам на сейчас с новой
// ставкой (честная прикидка: следующие ставки её сдвинут). Только по этой новой ставке
export function payoutIfWins(bets: readonly PoolBet[], outcome: string, amount: number): number {
  const me = '\u0000new' // номер, которого нет у участников
  const next: PoolBet[] = [...bets, { memberId: me, outcome, amount, at: 0 }]
  return settlePool(next, outcome).payouts.find((p) => p.memberId === me)?.payout ?? 0
}

export type ChancePoint = { at: number; chances: Record<string, number> } // исход → 0…1

// История вероятностей по ставкам: точка после каждой ставки — основа для графика
export function chanceHistory(outcomes: readonly string[], bets: readonly PoolBet[]): ChancePoint[] {
  const stakes = new Map<string, number>(outcomes.map((o) => [o, 0]))
  let bank = 0
  return bets.map((b) => {
    bank += b.amount
    stakes.set(b.outcome, (stakes.get(b.outcome) ?? 0) + b.amount)
    const chances: Record<string, number> = {}
    for (const o of outcomes) chances[o] = (stakes.get(o) ?? 0) / bank
    return { at: b.at, chances }
  })
}

// Коэффициент для экрана: «1,33», «4»; нет — «—»
export function formatOdds(odds: number | null): string {
  if (odds === null) return '—'
  return String(Math.round(odds * 100) / 100).replace('.', ',')
}

// Вероятность для экрана: «75 %» (неразрывный пробел); больше нуля, но меньше 1 % — «< 1 %»
export function formatChance(chance: number | null): string {
  if (chance === null) return '—'
  const p = Math.round(chance * 100)
  if (p === 0 && chance > 0) return '< 1 %'
  return `${p} %`
}
