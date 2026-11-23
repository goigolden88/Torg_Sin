import { describe, expect, it } from 'vitest'
import { checkChoiceOption, checkChoiceStake, drawChoice, NEED_OPTION, ONE_OPTION, OPTIONS_CLOSED, STAKES_NOT_YET } from '../rules/choice'
import type { ChoiceView } from '../rules/protocol'
import type { SavedRoom } from '../store/db'
import {
  choiceDebtLine,
  choiceDebtsOf,
  choiceHowLines,
  choiceHref,
  choiceLatestLine,
  choiceMine,
  choiceOutcomeOf,
  choiceOutcomeWords,
  choicePastNow,
  choiceRoomOf,
  choiceState,
  choiceStatusText,
  debtLine,
  myOption,
  myStake,
  newChoiceHref,
  optionStakers,
  optionTitle,
  phaseText,
  recipientLine,
  stakeAskText,
  winnerLine,
} from './choiceParts'
import { choiceItem, historyItems } from './historyParts'
import { basisText, nothingFinal } from './settleParts'

// Суммы сравниваются после plain: неразрывные пробелы — обычные
const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x).replace(/[  ]/g, ' ')) as T
const MINUTE = 60 * 1000
const OPTIONS_UNTIL = 60 * MINUTE
const END = 1000 * MINUTE

// Аня (A) — ведущая и получатель, Боря (B), Вера (V), Гена (G), Дима (D); смотрит Вера
const room: SavedRoom = {
  id: 'R1',
  server: 'https://example.test',
  memberId: 'V',
  key: 'k',
  invite: null,
  name: 'Поход',
  currency: 'RUB',
  hostId: 'A',
  createdAt: 0,
  members: [
    { id: 'A', name: 'Аня' },
    { id: 'B', name: 'Боря' },
    { id: 'V', name: 'Вера' },
    { id: 'G', name: 'Гена' },
    { id: 'D', name: 'Дима' },
  ],
  savedAt: 0,
  syncedAt: 0,
}

const as = (memberId: string): SavedRoom => ({ ...room, memberId })

// Выбор Ани «Куда едем?»: варианты Ладога и Карелия (автора), Выборг (Веры); вклады — Вера 500 ₽ и Гена
// 300 ₽ в Ладогу, Боря 400 ₽ в Карелию
function choice(extra: Partial<ChoiceView> = {}): ChoiceView {
  const stakes = extra.stakes ?? [
    { id: 's1', at: 100 * MINUTE, by: 'V', option: '1', amount: 50000 },
    { id: 's2', at: 110 * MINUTE, by: 'G', option: '1', amount: 30000 },
    { id: 's3', at: 120 * MINUTE, by: 'B', option: '2', amount: 40000 },
  ]
  const options = (extra.options ?? [
    { id: '1', at: 0, by: 'A', title: 'Ладога', total: 0 },
    { id: '2', at: 0, by: 'A', title: 'Карелия', total: 0 },
    { id: 'o3', at: 10 * MINUTE, by: 'V', title: 'Выборг', total: 0 },
  ]).map((o) => ({ ...o, total: stakes.filter((s) => s.option === o.id).reduce((n, s) => n + s.amount, 0) }))
  return {
    id: 'C1',
    at: 0,
    authorId: 'A',
    question: 'Куда едем?',
    recipientId: 'A',
    cashbox: false,
    optionsUntil: OPTIONS_UNTIL,
    closesAt: END,
    latestEnd: END + 30 * MINUTE,
    endsAt: END,
    status: 'open',
    failed: null,
    winner: null,
    how: null,
    draw: null,
    debts: [],
    closedAt: null,
    ...extra,
    options,
    stakes,
  }
}

describe('choiceParts: адреса и состояние', () => {
  it('адреса выбора и «Нового выбора»', () => {
    expect(choiceHref('R1', 'C1')).toBe('#/room/R1/choice/C1')
    expect(newChoiceHref('R1')).toBe('#/room/R1/choice/new')
  })

  it('состояние для правил: те же проверки, что у сервера, на часах сервера', () => {
    const s = choiceState(choice({ stakes: [] }))
    const r = choiceRoomOf(room)
    expect(r).toEqual({ hostId: 'A', members: ['A', 'B', 'V', 'G', 'D'] })
    // Фаза вариантов: вариант можно (пустое название — отказ названия), вклад — нельзя
    expect(checkChoiceOption(s, 'D', null, r, 0)).toBe(NEED_OPTION)
    expect(checkChoiceOption(s, 'D', 'Псков', r, 0)).toBeNull()
    expect(checkChoiceStake(s, 'D', '1', 100, r, 0)).toBe(STAKES_NOT_YET)
    // Фаза вкладов: вариант нельзя, вклад — можно
    expect(checkChoiceOption(s, 'D', 'Псков', r, OPTIONS_UNTIL)).toBe(OPTIONS_CLOSED)
    expect(checkChoiceStake(s, 'D', '1', 100, r, OPTIONS_UNTIL)).toBeNull()
    // Вложил в Ладогу — докладывать только в неё
    const v = choiceState(choice())
    expect(checkChoiceStake(v, 'V', '2', 100, r, END - 10 * MINUTE)).toBe(ONE_OPTION)
    expect(checkChoiceStake(v, 'V', '1', 100, r, END - 10 * MINUTE)).toBeNull()
  })

  it('фаза и итог между опросами: сервер прислал «вклады», конец прошёл — решён', () => {
    const c = choice()
    expect(choiceOutcomeOf(c, 0).status).toBe('options')
    expect(choiceOutcomeOf(c, END - 1).status).toBe('open')
    const out = choiceOutcomeOf(c, END)
    expect(out.status).toBe('decided')
    expect(out.winner).toBe('1')
    expect(out.how).toBe('sum')
    expect(choicePastNow(c, END - 1)).toBeNull()
    expect(choicePastNow(c, END)).toBe(END)
  })
})

describe('choiceParts: подписи', () => {
  it('строка статуса: фаза и сколько осталось, итог', () => {
    const c = choice()
    const options = choiceStatusText(choice({ stakes: [] }), 0)
    expect(options.tone).toBe('open')
    expect(options.text).toMatch(/^варианты до .+, осталось /)
    expect(choiceStatusText(c, OPTIONS_UNTIL).text).toMatch(/^вклады до .+, осталось /)
    expect(choiceStatusText(c, END)).toEqual({ text: 'решён — „Ладога“', tone: 'final' })
    expect(choiceStatusText(choice({ options: [{ id: '1', at: 0, by: 'A', title: 'Ладога', total: 0 }], stakes: [] }), OPTIONS_UNTIL)).toEqual({
      text: 'не состоялся — меньше двух вариантов',
      tone: 'cancelled',
    })
    expect(choiceStatusText(choice({ stakes: [] }), END).text).toBe('не состоялся — вкладов не было')
    expect(phaseText('options')).toBe('варианты')
    expect(phaseText('open')).toBe('вклады')
  })

  it('получатель, «как это работает», «не позже …»', () => {
    expect(recipientLine(room, choice())).toBe('Аня')
    expect(recipientLine(as('A'), choice({ cashbox: true }))).toBe('Аня (вы) — касса')
    const how = choiceHowLines('Аня')
    expect(how).toHaveLength(3)
    expect(how[0]).toContain('Побеждает вариант с большей суммой')
    expect(how[1]).toBe('Платят только вложившиеся в победивший вариант — получателю (Аня).')
    expect(how[2]).toContain('Проигравшие не платят')
    expect(choiceLatestLine(END)).toMatch(/^Вклады закончатся не позже .+: вклад за 2 минуты до конца или ничья продлевают их на 2 минуты/)
  })

  it('мой вариант, мой вклад, вкладчики варианта', () => {
    const c = choice({ stakes: [...choice().stakes, { id: 's4', at: 130 * MINUTE, by: 'V', option: '1', amount: 20000 }] })
    expect(myOption(c, 'V')).toBe('1')
    expect(myOption(c, 'D')).toBeNull()
    expect(myStake(c, 'V')).toBe(70000)
    expect(plain(optionStakers(room, c, '1'))).toEqual(['Вера (вы) — 700 ₽', 'Гена — 300 ₽'])
    expect(optionStakers(room, c, 'o3')).toEqual([])
    expect(optionTitle(c, 'o3')).toBe('„Выборг“')
  })

  it('окно вклада: сумма, вариант, кому и сколько заплатит; с прежним; получатель не платит', () => {
    const empty = choice({ stakes: [] })
    expect(plain(stakeAskText(room, empty, '1', 50000))).toBe(
      'Вы вкладываете 500 ₽ в „Ладога“ — если он победит, заплатите получателю — Аня — 500 ₽. Вклад не отзывается.',
    )
    expect(plain(stakeAskText(room, choice(), '1', 20000))).toBe(
      'Вы вкладываете 200 ₽ в „Ладога“ — если он победит, заплатите получателю — Аня — 700 ₽ (с прежним вкладом 500 ₽). Вклад не отзывается.',
    )
    expect(plain(stakeAskText(as('A'), empty, '2', 10000))).toBe('Вы вкладываете 100 ₽ в „Карелия“ — вы получатель: свой вклад вы не платите. Вклад не отзывается.')
  })
})

describe('choiceParts: итог, «Расчёт», «История»', () => {
  it('итог суммой: победитель и долги получателю', () => {
    const c = choice()
    const out = choiceOutcomeOf(c, END)
    expect(plain(winnerLine(room, c, out))).toBe('Победил „Ладога“ — 800 ₽')
    expect(winnerLine(room, c, choiceOutcomeOf(c, END - 1))).toBeNull()
    const debts = choiceDebtsOf([c], END)
    expect(debts).toEqual([
      { choice: 'C1', question: 'Куда едем?', from: 'V', to: 'A', amount: 50000, at: END },
      { choice: 'C1', question: 'Куда едем?', from: 'G', to: 'A', amount: 30000, at: END },
    ])
    expect(plain(choiceDebtLine(room, debts[0]))).toBe('Вера (вы) → Аня: 500 ₽ — выбор „Куда едем?“')
    expect(plain(debtLine(room, debts[1]))).toBe('Гена → Аня: 300 ₽')
    // До конца долгов нет
    expect(choiceDebtsOf([c], END - 1)).toEqual([])
  })

  it('получатель вложил в победивший — свой вклад не платит', () => {
    const c = choice({ stakes: [{ id: 's1', at: 100 * MINUTE, by: 'A', option: '1', amount: 50000 }, { id: 's2', at: 110 * MINUTE, by: 'V', option: '1', amount: 10000 }] })
    expect(choiceDebtsOf([c], END).map((d) => [d.from, d.amount])).toEqual([['V', 10000]])
    expect(choiceMine(c, 'A', END)).toBe(10000)
  })

  it('ничья: продление, «ждёт жребия», решил жребий', () => {
    const tie = [
      { id: 's1', at: 100 * MINUTE, by: 'V', option: '1', amount: 50000 },
      { id: 's2', at: 110 * MINUTE, by: 'B', option: '2', amount: 50000 },
    ]
    const c = choice({ stakes: tie })
    // В конце ничья — продление по 2 минуты, всего не дольше +30 минут
    expect(choiceOutcomeOf(c, END).status).toBe('open')
    expect(choiceOutcomeOf(c, END + 30 * MINUTE).status).toBe('draw')
    expect(choiceStatusText(c, END + 30 * MINUTE).text).toBe('ничья — ждёт жребия сервера')
    const drawn = choice({ stakes: tie, draw: { at: END + 30 * MINUTE + 1, seed: 'ab', options: ['1', '2'] } })
    const out = choiceOutcomeOf(drawn, END + 31 * MINUTE)
    expect(out.status).toBe('decided')
    expect(out.how).toBe('draw')
    expect(out.winner).toBe(drawChoice('ab', ['1', '2']))
    expect(plain(winnerLine(room, drawn, out))).toBe(`Победил ${optionTitle(drawn, out.winner)} — 500 ₽ — ничья, решил жребий`)
    expect(choiceStatusText(drawn, END + 31 * MINUTE).text).toBe(`решён — ${optionTitle(drawn, out.winner)} (ничья — решил жребий)`)
    expect(choicePastNow(drawn, END + 31 * MINUTE)).toBe(END + 30 * MINUTE + 1)
  })

  it('«История»: решённый и не состоявшийся; мой результат', () => {
    const c = choice()
    expect(choiceItem(room, c, END - 1)).toBeNull()
    expect(plain(choiceItem(room, c, END))).toEqual({
      kind: 'choice',
      id: 'C1',
      condition: 'Куда едем?',
      at: END,
      outcome: '„Ладога“ — 800 ₽',
      mine: { kind: 'net', amount: -50000, refund: 0 },
    })
    expect(choiceMine(c, 'A', END)).toBe(80000)
    expect(choiceMine(c, 'B', END)).toBe(0) // вложил в проигравший — не платит
    expect(choiceMine(c, 'D', END)).toBeNull()
    expect(choiceItem(as('D'), c, END)?.mine).toEqual({ kind: 'none' })

    const failed = choice({ id: 'C2', options: [{ id: '1', at: 0, by: 'A', title: 'Ладога', total: 0 }], stakes: [] })
    const f = choiceItem(as('A'), failed, OPTIONS_UNTIL)
    expect(f?.at).toBe(OPTIONS_UNTIL)
    expect(f?.outcome).toBe('не состоялся — меньше двух вариантов')
    expect(f?.mine).toEqual({ kind: 'net', amount: 0, refund: 0 }) // получатель — участник
    const noStakes = choice({ id: 'C3', stakes: [] })
    expect(choiceOutcomeWords(room, noStakes, choiceOutcomeOf(noStakes, END))).toBe('не состоялся — вкладов не было')
    // В общем списке — новое сверху
    expect(historyItems(room, [], [], END, [], [failed, c]).map((x) => x.id)).toEqual(['C1', 'C2'])
    expect(historyItems(room, [], [], OPTIONS_UNTIL, [], [failed, c]).map((x) => x.id)).toEqual(['C2'])
  })

  it('основание чисел «Расчёта» — с выборами; считать нечего — и без решённых выборов', () => {
    expect(basisText({ amount: 1, events: 0, offers: 0, choices: 1 })).toBe('по 1 выбору')
    expect(basisText({ amount: 1, events: 0, offers: 0, choices: 5 })).toBe('по 5 выборам')
    expect(basisText({ amount: 1, events: 3, offers: 0, choices: 2 })).toBe('по 3 событиям и 2 выборам')
    expect(basisText({ amount: 1, events: 0, offers: 0, lots: 2, choices: 1 })).toBe('по 2 лотам и 1 выбору')
    expect(basisText({ amount: 1, events: 3, offers: 0, lots: 2, choices: 1 })).toBe('по 3 событиям, 2 лотам и 1 выбору')
    expect(basisText({ amount: 1, events: 3, offers: 2, choices: 2 })).toBe('по 5 событиям и пари, 2 выборам')
    expect(basisText({ amount: 1, events: 3, offers: 2, lots: 1, choices: 2 })).toBe('по 5 событиям и пари, 1 лоту, 2 выборам')
    expect(basisText({ amount: 0, events: 0, offers: 0, lots: 0, choices: 0 })).toBe('')
    const zero = { amount: 0, events: 0, offers: 0 }
    const member = (total: object) => ({ memberId: 'A', total: { ...zero, ...total }, pending: zero, inPlay: zero, sent: 0, received: 0, balance: 0 })
    expect(nothingFinal({ mode: 'stakes', members: [member({ choices: 0 })], transfers: [], suggestions: [] })).toBe(true)
    expect(nothingFinal({ mode: 'stakes', members: [member({ amount: 500, choices: 1 })], transfers: [], suggestions: [] })).toBe(false)
  })
})
