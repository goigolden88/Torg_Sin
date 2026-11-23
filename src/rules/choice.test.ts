import { describe, expect, it } from 'vitest'
import { AUCTION_EXTEND, AUCTION_EXTEND_MAX, AUCTION_MAX, AUCTION_MIN } from './auction'
import { BACKUP_FORMAT, checkBackup } from './backup'
import {
  BAD_DRAW_OPTIONS,
  BAD_DRAW_SEED,
  BAD_OPTIONS,
  BAD_RECIPIENT,
  BAD_STAKE,
  CHOICE_LONG,
  CHOICE_NO_OPTIONS,
  CHOICE_OVER,
  DRAW_DONE,
  LONG_OPTION,
  LONG_QUESTION,
  MAX_CHOICE_OPTION,
  MAX_CHOICE_OPTIONS,
  NEED_CHOICE_TIMES,
  NEED_OPTION,
  NEED_QUESTION,
  NO_DRAW,
  NO_OPTION,
  NOT_MEMBER,
  ONE_OPTION,
  OPTIONS_CLOSED,
  OPTIONS_SHORT,
  SAME_OPTION,
  STAKES_NOT_YET,
  STAKES_SHORT,
  TOO_MANY_OPTIONS,
  checkChoiceDraw,
  checkChoiceInput,
  checkChoiceOption,
  checkChoiceStake,
  checkChoiceTimes,
  choiceDebts,
  choiceDrawOptions,
  choiceOutcome,
  choiceView,
  drawChoice,
  isChoiceEntry,
  logChoices,
  type ChoiceState,
} from './choice'
import { courtHash } from './court'
import { isChoiceView } from './protocol'
import { foldLog, type LogEntry } from './room'
import { roomSettlement, type SettleMode } from './settle'

const MIN = 60 * 1000
const HOUR = 60 * MIN
const T = 1_000_000_000
const OPT = T + HOUR // «варианты до»
const END = T + 2 * HOUR // «вклады до»
const LATEST = END + AUCTION_EXTEND_MAX
const SEED = '5be0c4d1a2f9'

let seq = 0
const id = (p: string) => `${p}${++seq}`

// Комната: ведущий H; участники A, B, C, D
const MEMBERS = ['H', 'A', 'B', 'C', 'D']
const ROOM = { hostId: 'H', members: MEMBERS }
function roomLog(currency = 'RUB'): LogEntry[] {
  return [
    { id: 'R', at: 0, memberId: 'H', type: 'room.created', roomId: 'R', name: 'Поездка', currency: currency as 'RUB' },
    ...MEMBERS.map((m): LogEntry => ({ id: 'M' + m, at: 0, memberId: 'H', type: 'member.added', member: m, name: m })),
  ]
}

type Created = Extract<LogEntry, { type: 'choice.created' }>
// Выбор участника A: куда едем; варианты «Море» ('1') и «Горы» ('2'); получатель — ведущий H
function created(over: Partial<Created> = {}): LogEntry {
  return {
    id: 'C1',
    at: T,
    memberId: 'A',
    type: 'choice.created',
    question: 'Куда едем летом?',
    options: ['Море', 'Горы'],
    recipient: 'H',
    cashbox: false,
    optionsUntil: OPT,
    closesAt: END,
    requestId: 'QC1',
    ...over,
  }
}
const option = (memberId: string, title: string, at: number, choice = 'C1'): LogEntry => ({ id: id('O'), at, memberId, type: 'choice.option', choice, title, requestId: id('Q') })
const stake = (memberId: string, opt: string, amount: number, at: number, choice = 'C1'): LogEntry => ({
  id: id('S'),
  at,
  memberId,
  type: 'choice.stake',
  choice,
  option: opt,
  amount,
  requestId: id('Q'),
})
const drawn = (at: number, options: string[], seed = SEED, choice = 'C1'): LogEntry => ({ id: id('D'), at, memberId: 'H', type: 'choice.drawn', choice, seed, options })

function one(log: LogEntry[]): ChoiceState {
  const choices = logChoices(log)
  expect(choices).toHaveLength(1)
  return choices[0]
}
const at = (log: LogEntry[], now: number) => choiceOutcome(one(log), now)

describe('выбор: форма', () => {
  const form = { question: '  Куда едем летом? ', options: [' Море ', 'Горы'], optionsUntil: OPT, closesAt: END }

  it('вопрос и варианты срезаются; получатель по умолчанию — ведущий, «касса» — по желанию', () => {
    expect(checkChoiceInput(form, ROOM)).toEqual({
      ok: true,
      value: { question: 'Куда едем летом?', options: ['Море', 'Горы'], recipient: 'H', cashbox: false, optionsUntil: OPT, closesAt: END },
    })
    expect(checkChoiceInput({ ...form, recipient: 'B', cashbox: true }, ROOM)).toMatchObject({ ok: true, value: { recipient: 'B', cashbox: true } })
    // Вариантов можно не задавать
    expect(checkChoiceInput({ ...form, options: undefined }, ROOM)).toMatchObject({ ok: true, value: { options: [] } })
    expect(checkChoiceInput({ ...form, options: [] }, ROOM)).toMatchObject({ ok: true, value: { options: [] } })
  })

  it('отказы формы', () => {
    expect(checkChoiceInput({ ...form, question: '  ' }, ROOM)).toEqual({ ok: false, error: NEED_QUESTION })
    expect(checkChoiceInput({ ...form, question: 'я'.repeat(301) }, ROOM)).toEqual({ ok: false, error: LONG_QUESTION })
    expect(checkChoiceInput({ ...form, options: ['Море', ' '] }, ROOM)).toEqual({ ok: false, error: NEED_OPTION })
    expect(checkChoiceInput({ ...form, options: ['я'.repeat(MAX_CHOICE_OPTION + 1)] }, ROOM)).toEqual({ ok: false, error: LONG_OPTION })
    expect(checkChoiceInput({ ...form, options: ['я'.repeat(MAX_CHOICE_OPTION)] }, ROOM).ok).toBe(true)
    // Одинаковые — без учёта регистра и пробелов
    expect(checkChoiceInput({ ...form, options: ['Море', ' море'] }, ROOM)).toEqual({ ok: false, error: SAME_OPTION })
    const ten = Array.from({ length: MAX_CHOICE_OPTIONS }, (_, i) => `Вариант ${i + 1}`)
    expect(checkChoiceInput({ ...form, options: ten }, ROOM).ok).toBe(true)
    expect(checkChoiceInput({ ...form, options: [...ten, 'Ещё'] }, ROOM)).toEqual({ ok: false, error: TOO_MANY_OPTIONS })
    expect(checkChoiceInput({ ...form, options: 'Море' }, ROOM)).toEqual({ ok: false, error: BAD_OPTIONS })
    expect(checkChoiceInput({ ...form, recipient: 'Чужой' }, ROOM)).toEqual({ ok: false, error: BAD_RECIPIENT })
    expect(checkChoiceInput({ ...form, optionsUntil: 'завтра' }, ROOM)).toEqual({ ok: false, error: NEED_CHOICE_TIMES })
    expect(checkChoiceInput({ ...form, closesAt: undefined }, ROOM)).toEqual({ ok: false, error: NEED_CHOICE_TIMES })
  })

  it('сроки: каждая фаза — не меньше 10 минут, весь выбор — не дольше 3 дней с создания', () => {
    expect(checkChoiceTimes({ optionsUntil: T + AUCTION_MIN, closesAt: T + 2 * AUCTION_MIN }, T)).toBeNull()
    expect(checkChoiceTimes({ optionsUntil: T + AUCTION_MIN - 1, closesAt: END }, T)).toBe(OPTIONS_SHORT)
    expect(checkChoiceTimes({ optionsUntil: OPT, closesAt: OPT + AUCTION_MIN - 1 }, T)).toBe(STAKES_SHORT)
    expect(checkChoiceTimes({ optionsUntil: OPT, closesAt: T + AUCTION_MAX }, T)).toBeNull()
    expect(checkChoiceTimes({ optionsUntil: OPT, closesAt: T + AUCTION_MAX + 1 }, T)).toBe(CHOICE_LONG)
  })

  it('свёртка берёт запись, только если её пропускают те же проверки на её время', () => {
    const c = one([...roomLog(), created()])
    expect(c).toMatchObject({ authorId: 'A', recipientId: 'H', endsAt: END })
    expect(c.options).toEqual([
      { id: '1', at: T, by: 'A', title: 'Море' },
      { id: '2', at: T, by: 'A', title: 'Горы' },
    ])
    expect(logChoices([...roomLog(), created({ optionsUntil: T + AUCTION_MIN - 1 })])).toEqual([])
    expect(logChoices([...roomLog(), created({ question: ' Куда?' })])).toEqual([])
    expect(logChoices([...roomLog(), created({ options: ['Море', 'море'] })])).toEqual([])
    expect(logChoices([...roomLog(), created({ recipient: 'Чужой' })])).toEqual([])
    expect(logChoices([...roomLog(), created({ memberId: 'Чужой' })])).toEqual([])
    // Повтор номера — тот же выбор; комнаты нет — выборов нет
    expect(logChoices([...roomLog(), created(), created({ question: 'Другое' })]).map((x) => x.question)).toEqual(['Куда едем летом?'])
    expect(logChoices([created()])).toEqual([])
  })
})

describe('выбор: фаза вариантов', () => {
  it('любой участник добавляет вариант до «варианты до»; вкладов нет', () => {
    const log = [...roomLog(), created({ options: [] }), option('B', ' Дача ', T + 10), option('C', 'Город', OPT - 1)]
    const c = one(log)
    expect(c.options.map((o) => [o.by, o.title])).toEqual([
      ['B', 'Дача'],
      ['C', 'Город'],
    ])
    expect(at(log, T + 20).status).toBe('options')
    expect(checkChoiceStake(c, 'A', c.options[0].id, 100, ROOM, OPT - 1)).toBe(STAKES_NOT_YET)
  })

  it('отказы: не участник, после «варианты до», повтор, больше 10', () => {
    const c = one([...roomLog(), created()])
    expect(checkChoiceOption(c, 'Чужой', 'Дача', ROOM, T + 10)).toBe(NOT_MEMBER)
    expect(checkChoiceOption(c, 'B', 'Дача', ROOM, OPT)).toBe(OPTIONS_CLOSED)
    expect(checkChoiceOption(c, 'B', 'Дача', ROOM, OPT - 1)).toBeNull()
    expect(checkChoiceOption(c, 'B', ' МОРЕ', ROOM, T + 10)).toBe(SAME_OPTION)
    expect(checkChoiceOption(c, 'B', '', ROOM, T + 10)).toBe(NEED_OPTION)
    const nine = Array.from({ length: MAX_CHOICE_OPTIONS - 1 }, (_, i) => `Вариант ${i + 1}`)
    const log = [...roomLog(), created({ options: nine }), option('B', 'Десятый', T + 10), option('C', 'Одиннадцатый', T + 20)]
    expect(one(log).options).toHaveLength(MAX_CHOICE_OPTIONS)
    expect(checkChoiceOption(one(log), 'D', 'Ещё', ROOM, T + 30)).toBe(TOO_MANY_OPTIONS)
    // Отказанные записи в свёртке не действуют: поздний вариант не появился
    expect(one([...roomLog(), created(), option('B', 'Дача', OPT)]).options).toHaveLength(2)
  })

  it('к концу фазы меньше двух вариантов — «не состоялось», вкладов нет', () => {
    for (const options of [[], ['Море']]) {
      const log = [...roomLog(), created({ options }), stake('B', '1', 100, OPT + 10)]
      const c = one(log)
      expect(c.stakes).toEqual([])
      expect(checkChoiceStake(c, 'B', '1', 100, ROOM, OPT + 10)).toBe(CHOICE_NO_OPTIONS)
      expect(choiceOutcome(c, OPT)).toMatchObject({ status: 'failed', failed: 'options', closedAt: OPT, winner: null })
      expect(choiceOutcome(c, OPT - 1).status).toBe('options')
    }
    // Вариант участника доводит до двух — состоялось
    expect(at([...roomLog(), created({ options: ['Море'] }), option('B', 'Горы', T + 10)], OPT).status).toBe('open')
  })
})

describe('выбор: фаза вкладов', () => {
  it('с «варианты до»: вклад в один вариант, докладывать можно в него же; вклады видны всем', () => {
    const log = [...roomLog(), created(), stake('B', '1', 100, OPT), stake('B', '1', 50, OPT + 10), stake('B', '2', 70, OPT + 20), stake('C', '2', 120, OPT + 30)]
    const c = one(log)
    expect(c.stakes.map((s) => [s.by, s.option, s.amount])).toEqual([
      ['B', '1', 100],
      ['B', '1', 50],
      ['C', '2', 120],
    ])
    expect(checkChoiceStake(c, 'B', '2', 10, ROOM, OPT + 40)).toBe(ONE_OPTION)
    const view = choiceView(c, OPT + 40)
    expect(view.status).toBe('open')
    expect(view.options.map((o) => o.total)).toEqual([150, 120])
    expect(view.stakes).toHaveLength(3)
    expect(isChoiceView(view)).toBe(true)
    expect(isChoiceView({ ...view, status: 'sold' })).toBe(false)
  })

  it('отказы вклада: не участник, нет варианта, сумма, после конца', () => {
    const c = one([...roomLog(), created()])
    expect(checkChoiceStake(c, 'Чужой', '1', 100, ROOM, OPT)).toBe(NOT_MEMBER)
    expect(checkChoiceStake(c, 'B', '3', 100, ROOM, OPT)).toBe(NO_OPTION)
    for (const amount of [0, -1, 1.5, '100']) expect(checkChoiceStake(c, 'B', '1', amount, ROOM, OPT)).toBe(BAD_STAKE)
    expect(checkChoiceStake(c, 'B', '1', 100, ROOM, END - 1)).toBeNull()
    expect(checkChoiceStake(c, 'B', '1', 100, ROOM, END)).toBe(CHOICE_OVER)
    // Новых вариантов в фазе вкладов нет
    expect(checkChoiceOption(c, 'B', 'Дача', ROOM, OPT)).toBe(OPTIONS_CLOSED)
  })

  it('автор и получатель тоже вкладывают', () => {
    const c = one([...roomLog(), created(), stake('A', '1', 100, OPT), stake('H', '2', 100, OPT + 1)])
    expect(c.stakes).toHaveLength(2)
  })

  it('продление: вклад за 2 минуты до конца — +2 минуты после него, не дальше «вклады до» + 30 минут', () => {
    expect(one([...roomLog(), created(), stake('B', '1', 100, END - AUCTION_EXTEND - 1)]).endsAt).toBe(END)
    expect(one([...roomLog(), created(), stake('B', '1', 100, END - AUCTION_EXTEND)]).endsAt).toBe(END)
    expect(one([...roomLog(), created(), stake('B', '1', 100, END - MIN)]).endsAt).toBe(END + MIN)
    // Цепочка вкладов у предела: конец не дальше LATEST
    const chain: LogEntry[] = []
    for (let t = END - MIN, i = 0; t < LATEST; t += MIN, i++) chain.push(stake(i % 2 ? 'B' : 'C', i % 2 ? '1' : '2', 100 + i * 10, t))
    const c = one([...roomLog(), created(), ...chain])
    expect(c.endsAt).toBe(LATEST)
    expect(checkChoiceStake(c, 'D', '1', 100, ROOM, LATEST)).toBe(CHOICE_OVER)
    expect(choiceView(c, LATEST).latestEnd).toBe(LATEST)
  })
})

describe('выбор: итог', () => {
  it('побеждает вариант с большей суммой; долги — только вложившимся в него', () => {
    const log = [...roomLog(), created(), stake('B', '1', 300, OPT), stake('C', '1', 200, OPT + 1), stake('D', '2', 400, OPT + 2)]
    expect(at(log, END - 1).status).toBe('open')
    expect(at(log, END)).toEqual({ status: 'decided', failed: null, endsAt: END, winner: '1', how: 'sum', closedAt: END })
    expect(choiceDebts(one(log), END)).toEqual([
      { from: 'B', to: 'H', amount: 300 },
      { from: 'C', to: 'H', amount: 200 },
    ])
    expect(choiceDebts(one(log), END - 1)).toEqual([])
  })

  it('вкладов нет — «не состоялось»', () => {
    const log = [...roomLog(), created()]
    expect(at(log, END)).toMatchObject({ status: 'failed', failed: 'stakes', closedAt: END })
    expect(at(log, END - 1).status).toBe('open')
  })

  it('ничья в конце — продление на 2 минуты, снова и снова; вклад в продлении решает', () => {
    const tie = [...roomLog(), created(), stake('B', '1', 100, OPT), stake('C', '2', 100, OPT + 1)]
    expect(at(tie, END)).toMatchObject({ status: 'open', endsAt: END + AUCTION_EXTEND })
    expect(at(tie, END + AUCTION_EXTEND)).toMatchObject({ status: 'open', endsAt: END + 2 * AUCTION_EXTEND })
    expect(at(tie, LATEST - 1)).toMatchObject({ status: 'open', endsAt: LATEST })
    // Вклад в продлении — принят, конец через 2 минуты после него, ничьей нет — решено
    const broken = [...tie, stake('D', '1', 50, END + MIN)]
    expect(one(broken).stakes).toHaveLength(3)
    expect(at(broken, END + MIN + AUCTION_EXTEND - 1).status).toBe('open')
    expect(at(broken, END + MIN + AUCTION_EXTEND)).toMatchObject({ status: 'decided', winner: '1', how: 'sum', closedAt: END + MIN + AUCTION_EXTEND })
    // Ничья при нуле у остальных вариантов: равны только лидеры
    const three = [...roomLog(), created({ options: ['Море', 'Горы', 'Дача'] }), stake('B', '1', 100, OPT), stake('C', '3', 100, OPT + 1)]
    expect(at(three, END).status).toBe('open')
  })

  it('ничья и после +30 минут — жребий сервера среди равных', () => {
    const tie = [...roomLog(), created({ options: ['Море', 'Горы', 'Дача'] }), stake('B', '1', 100, OPT), stake('C', '2', 100, OPT + 1), stake('D', '3', 50, OPT + 2)]
    const c = one(tie)
    expect(choiceOutcome(c, LATEST)).toMatchObject({ status: 'draw', endsAt: LATEST, winner: null, closedAt: null })
    expect(choiceDrawOptions(c, LATEST)).toEqual(['1', '2'])
    expect(choiceDrawOptions(c, LATEST - 1)).toEqual([])
    expect(checkChoiceStake(c, 'H', '1', 10, ROOM, LATEST)).toBe(CHOICE_OVER)
    // Проверка записи жребия
    expect(checkChoiceDraw(c, SEED, ['2', '1'], LATEST)).toBeNull()
    expect(checkChoiceDraw(c, SEED, ['1', '2'], LATEST - 1)).toBe(NO_DRAW)
    expect(checkChoiceDraw(c, 'zz', ['1', '2'], LATEST)).toBe(BAD_DRAW_SEED)
    expect(checkChoiceDraw(c, '', ['1', '2'], LATEST)).toBe(BAD_DRAW_SEED)
    expect(checkChoiceDraw(c, SEED, ['1', '3'], LATEST)).toBe(BAD_DRAW_OPTIONS)
    expect(checkChoiceDraw(c, SEED, ['1', '1'], LATEST)).toBe(BAD_DRAW_OPTIONS)
    expect(checkChoiceDraw(c, SEED, ['1', '2', '3'], LATEST)).toBe(BAD_DRAW_OPTIONS)
    // Решено жребием: наименьший хеш зерна и номера варианта
    const expected = courtHash(`${SEED}:1`) < courtHash(`${SEED}:2`) ? '1' : '2'
    expect(drawChoice(SEED, ['2', '1'])).toBe(expected)
    const log = [...tie, drawn(LATEST + 5, ['1', '2'])]
    expect(at(log, LATEST + 5)).toMatchObject({ status: 'decided', winner: expected, how: 'draw', closedAt: LATEST + 5 })
    expect(choiceDebts(one(log), LATEST + 5)).toEqual([{ from: expected === '1' ? 'B' : 'C', to: 'H', amount: 100 }])
    expect(checkChoiceDraw(one(log), SEED, ['1', '2'], LATEST + 6)).toBe(DRAW_DONE)
    const view = choiceView(one(log), LATEST + 5)
    expect(view.draw).toEqual({ at: LATEST + 5, seed: SEED, options: ['1', '2'] })
    expect(isChoiceView(view)).toBe(true)
    // Запись жребия до срока или с чужими вариантами не действует; второй жребий — тоже
    expect(at([...tie, drawn(LATEST - 1, ['1', '2'])], LATEST).status).toBe('draw')
    expect(at([...tie, drawn(LATEST, ['1', '3'])], LATEST).status).toBe('draw')
    const second = [...log, drawn(LATEST + 6, ['1', '2'], 'ff00')]
    expect(one(second).draw?.seed).toBe(SEED)
  })

  it('жребий не нужен без ничьей', () => {
    const c = one([...roomLog(), created(), stake('B', '1', 100, OPT)])
    expect(checkChoiceDraw(c, SEED, ['1'], END)).toBe(NO_DRAW)
    expect(choiceDrawOptions(c, END)).toEqual([])
  })
})

describe('выбор: «Расчёт»', () => {
  // B 300 и C 200 — «Море», получатель H тоже 100 в «Море», D 400 — «Горы»: побеждает «Море»
  const decided = (currency = 'RUB') => [
    ...roomLog(currency),
    created(),
    stake('B', '1', 300, OPT),
    stake('C', '1', 200, OPT + 1),
    stake('H', '1', 100, OPT + 2),
    stake('D', '2', 400, OPT + 3),
  ]
  const settle = (log: LogEntry[], now: number, mode?: SettleMode) =>
    roomSettlement(
      { currency: foldLog(log)!.currency, members: MEMBERS, events: [], offers: [], choices: logChoices(log), cases: [], transfers: [] },
      now,
      mode,
    )
  const row = (s: ReturnType<typeof settle>, m: string) => s.members.find((r) => r.memberId === m)!

  it('вклады идут — «в игре» у вложивших, кроме получателя', () => {
    const s = settle(decided(), END - 1)
    expect(row(s, 'B').inPlay).toEqual({ amount: 300, events: 0, offers: 0, choices: 1 })
    expect(row(s, 'D').inPlay).toEqual({ amount: 400, events: 0, offers: 0, choices: 1 })
    expect(row(s, 'H').inPlay.amount).toBe(0)
    expect(s.members.every((m) => m.total.amount === 0)).toBe(true)
    expect(s.suggestions).toEqual([])
  })

  for (const mode of ['stakes', 'fewest'] as const) {
    it(`решён — вложившиеся в победивший должны получателю, окончательно сразу (${mode})`, () => {
      const s = settle(decided(), END, mode)
      expect(row(s, 'H').total).toEqual({ amount: 500, events: 0, offers: 0, choices: 1 })
      expect(row(s, 'B').total).toEqual({ amount: -300, events: 0, offers: 0, choices: 1 })
      expect(row(s, 'C').total.amount).toBe(-200)
      // Проигравшие — ничего; вклад получателя — не долг
      expect(row(s, 'D').total).toEqual({ amount: 0, events: 0, offers: 0, choices: 0 })
      expect(s.members.every((m) => m.pending.amount === 0 && m.inPlay.amount === 0)).toBe(true)
      expect(s.suggestions).toEqual([
        { from: 'B', to: 'H', amount: 300 },
        { from: 'C', to: 'H', amount: 200 },
      ])
    })
  }

  it('получатель — единственный вкладчик победившего: никто никому не должен', () => {
    const log = [...roomLog(), created(), stake('H', '1', 500, OPT), stake('D', '2', 100, OPT + 1)]
    const s = settle(log, END)
    expect(s.members.every((m) => m.total.amount === 0)).toBe(true)
    expect(s.suggestions).toEqual([])
  })

  it('получатель — не ведущий: долг ему', () => {
    const log = [...roomLog(), created({ recipient: 'D', cashbox: true }), stake('B', '1', 300, OPT), stake('C', '2', 100, OPT + 1)]
    expect(settle(log, END).suggestions).toEqual([{ from: 'B', to: 'D', amount: 300 }])
  })

  it('не состоялось — ни в одном числе; комната на очки — итог в таблице очков, без подсказки', () => {
    const failed = settle([...roomLog(), created({ options: [] })], END)
    expect(failed.members.every((m) => m.total.amount === 0 && m.inPlay.amount === 0)).toBe(true)
    const points = settle(decided('PTS'), END)
    expect(row(points, 'H').total.amount).toBe(500)
    expect(row(points, 'B').total.amount).toBe(-300)
    expect(points.suggestions).toEqual([])
  })

  it('без выборов в своде счётчика choices нет', () => {
    const s = roomSettlement({ currency: 'RUB', members: MEMBERS, events: [], offers: [], cases: [], transfers: [] }, END)
    expect(s.members[0].total).toEqual({ amount: 0, events: 0, offers: 0 })
  })
})

describe('выбор: журнал', () => {
  it('записи выбора — в журнале комнаты и в копии; состояние комнаты не меняют', () => {
    const log = [...roomLog(), created(), option('B', 'Дача', T + 10), stake('B', '1', 100, OPT), stake('C', '2', 100, OPT + 1), drawn(LATEST, ['1', '2'])]
    expect(log.filter(isChoiceEntry)).toHaveLength(5)
    expect(foldLog(log)).toEqual(foldLog(roomLog()))
    expect(checkBackup({ format: BACKUP_FORMAT, roomId: 'R', exportedAt: LATEST, log }).ok).toBe(true)
  })
})
