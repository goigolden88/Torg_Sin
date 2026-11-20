import { describe, expect, it } from 'vitest'
import type { EventView, OfferView, SettlementView, TransferView } from '../rules/protocol'
import {
  amountText,
  balanceNote,
  basisText,
  byTotal,
  memberNumbers,
  modeChange,
  modeLabel,
  myDebts,
  myTotalLine,
  nothingFinal,
  pendingDisputes,
  signedSum,
  transferButtons,
} from './settleParts'

const N = ' ' // неразрывный пробел: между разрядами и перед знаком валюты
const zero = { amount: 0, events: 0, offers: 0 }

function member(memberId: string, extra: Partial<SettlementView['members'][number]> = {}): SettlementView['members'][number] {
  return { memberId, total: zero, pending: zero, inPlay: zero, sent: 0, received: 0, balance: 0, ...extra }
}

function transfer(extra: Partial<TransferView> = {}): TransferView {
  return { id: 'T1', at: 10, from: 'A', to: 'B', amount: 30000, by: 'sender', status: 'pending', changedAt: 10, ...extra }
}

// Аня должна Пете 300 ₽, Вера должна Ане 900 ₽
const settlement: SettlementView = {
  mode: 'stakes',
  members: [
    member('A', { total: { amount: 60000, events: 3, offers: 2 }, balance: 60000 }),
    member('P', { total: { amount: 30000, events: 0, offers: 1 }, balance: 30000 }),
    member('V', { total: { amount: -90000, events: 1, offers: 0 }, balance: -90000 }),
  ],
  transfers: [],
  suggestions: [
    { from: 'A', to: 'P', amount: 30000 },
    { from: 'V', to: 'A', amount: 90000 },
  ],
}
const room = { currency: 'RUB', members: ['A', 'P', 'V'] }

describe('числа с основанием', () => {
  it('итог со знаком', () => {
    expect(signedSum(120000, 'RUB')).toBe(`+1${N}200${N}₽`)
    expect(signedSum(-30000, 'RUB')).toBe(`−300${N}₽`)
    expect(signedSum(0, 'RUB')).toBe(`0${N}₽`)
    expect(signedSum(21, 'PTS')).toBe(`+21${N}очко`)
  })

  it('из чего сложено: события, пари, вместе', () => {
    expect(basisText({ amount: 1, events: 1, offers: 0 })).toBe('по 1 событию')
    expect(basisText({ amount: 1, events: 3, offers: 0 })).toBe('по 3 событиям')
    expect(basisText({ amount: 1, events: 21, offers: 0 })).toBe('по 21 событию')
    expect(basisText({ amount: 1, events: 0, offers: 2 })).toBe('по 2 пари')
    expect(basisText({ amount: 1, events: 3, offers: 2 })).toBe('по 5 событиям и пари')
    expect(basisText(zero)).toBe('')
  })

  it('три числа участника и строка в комнате', () => {
    const m = member('A', {
      total: { amount: 120000, events: 3, offers: 2 },
      pending: { amount: 30000, events: 0, offers: 2 },
      inPlay: { amount: 50000, events: 3, offers: 0 },
    })
    expect(memberNumbers(m, 'RUB')).toEqual({
      total: `+1${N}200${N}₽ по 5 событиям и пари`,
      pending: `+300${N}₽ по 2 пари`,
      inPlay: `500${N}₽ по 3 событиям`,
    })
    expect(memberNumbers(member('B'), 'RUB')).toEqual({ total: `0${N}₽`, pending: `0${N}₽`, inPlay: `0${N}₽` })
    expect(myTotalLine(settlement, 'A', 'RUB')).toBe(`Ваш итог: +600${N}₽ по 5 событиям и пари`)
    expect(myTotalLine(settlement, 'чужой', 'RUB')).toBe(`Ваш итог: 0${N}₽`)
  })
})

describe('долги и карточка комнаты', () => {
  it('вы должны / вам должны — из подсказки', () => {
    expect(myDebts(settlement, 'A')).toEqual({ owe: [{ other: 'P', amount: 30000 }], owed: [{ other: 'V', amount: 90000 }] })
    expect(myDebts(settlement, 'P')).toEqual({ owe: [], owed: [{ other: 'A', amount: 30000 }] })
  })

  it('карточка: по балансу; ноль, нет свода, очки — ничего', () => {
    expect(balanceNote(settlement, 'V', 'RUB')).toBe(`вы должны 900${N}₽`)
    expect(balanceNote(settlement, 'P', 'RUB')).toBe(`вам должны 300${N}₽`)
    expect(balanceNote({ ...settlement, members: [member('A')] }, 'A', 'RUB')).toBeNull()
    expect(balanceNote(null, 'A', 'RUB')).toBeNull()
    expect(balanceNote(settlement, 'V', 'PTS')).toBeNull()
  })

  it('считать нечего: нет окончательных и переводов', () => {
    expect(nothingFinal(settlement)).toBe(false)
    const empty = { ...settlement, members: [member('A', { pending: { amount: 100, events: 1, offers: 0 } })], suggestions: [] }
    expect(nothingFinal(empty)).toBe(true)
    expect(nothingFinal({ ...empty, transfers: [transfer()] })).toBe(false)
  })

  it('ждут окончательности: утверждённые события (не «без игры») и пари', () => {
    const ev = (status: string, extra: object = {}) => ({ cancelled: null, outcome: { status, void: false }, ...extra }) as unknown as EventView
    const of = (phase: string) => ({ outcome: { phase } }) as unknown as OfferView
    const events = [ev('approved'), ev('final'), ev('approved', { outcome: { status: 'approved', void: true } }), ev('proposed'), { cancelled: null, outcome: null } as unknown as EventView]
    expect(pendingDisputes(events, [of('approved'), of('final'), of('marking'), { outcome: null } as unknown as OfferView])).toBe(2)
  })

  it('таблица очков — по убыванию итога, равные — по порядку входа', () => {
    const list = [member('A', { total: { amount: 5, events: 1, offers: 0 } }), member('B', { total: { amount: 9, events: 1, offers: 0 } }), member('C', { total: { amount: 5, events: 1, offers: 0 } })]
    expect(byTotal(list).map((m) => m.memberId)).toEqual(['B', 'A', 'C'])
  })
})

describe('кнопки перевода — по правилам', () => {
  it('ждёт подтверждения: получателю «Получил» и «Не получал», должнику «Отозвать», прочим — ничего', () => {
    const t = transfer()
    expect(transferButtons(t, 'B', room).map((b) => b.label)).toEqual(['Получил', 'Не получал'])
    expect(transferButtons(t, 'A', room).map((b) => b.label)).toEqual(['Отозвать'])
    expect(transferButtons(t, 'V', room)).toEqual([])
  })

  it('получен: получателю «Отменить отметку»; отклонён и отменён — ничего', () => {
    expect(transferButtons(transfer({ status: 'received' }), 'B', room)).toEqual([{ act: 'cancel', label: 'Отменить отметку' }])
    expect(transferButtons(transfer({ status: 'received' }), 'A', room)).toEqual([])
    expect(transferButtons(transfer({ status: 'received', by: 'receiver' }), 'B', room)).toEqual([{ act: 'cancel', label: 'Отменить отметку' }])
    expect(transferButtons(transfer({ status: 'rejected' }), 'B', room)).toEqual([])
    expect(transferButtons(transfer({ status: 'cancelled' }), 'A', room)).toEqual([])
  })
})

describe('режим «кто кому»', () => {
  const host = { hostId: 'A', currency: 'RUB' }

  it('строка режима', () => {
    expect(modeLabel('stakes')).toBe('По ставкам — каждый платит тому, кому проиграл')
    expect(modeLabel('fewest')).toBe('Меньше переводов — долги сводятся через всех')
  })

  it('ведущему без переводов — можно; после перевода — закрыто, пока не все в расчёте; прочим и в очках — ничего', () => {
    expect(modeChange(settlement, host, 'A')).toBe('can')
    expect(modeChange(settlement, host, 'P')).toBe('none')
    expect(modeChange(settlement, { hostId: 'A', currency: 'PTS' }, 'A')).toBe('none')
    const sent = { ...settlement, transfers: [transfer({ from: 'V', to: 'A', amount: 10000 })] }
    expect(modeChange(sent, host, 'A')).toBe('locked')
    const settled = { ...sent, members: settlement.members.map((m) => ({ ...m, balance: 0 })), transfers: [transfer({ status: 'received' })] }
    expect(modeChange(settled, host, 'A')).toBe('can')
  })
})

describe('сумма в поле', () => {
  it('единицы → текст поля', () => {
    expect(amountText(30000, 'RUB')).toBe('300')
    expect(amountText(30050, 'RUB')).toBe('300,5')
    expect(amountText(5, 'RUB')).toBe('0,05')
    expect(amountText(15, 'PTS')).toBe('15')
    expect(amountText(15, 'XXX')).toBe('15')
  })
})
