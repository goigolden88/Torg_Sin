import { describe, expect, it } from 'vitest'
import { chatMessage, screenLink, type ChatNews } from './chat'

const SITE = 'https://goigolden88.github.io/Torg_Sin/'
const ROOM = '01JBXK7Z9M3Q4R5S6T7V8W9XYZ'
const LINK = `${SITE}#/room/${ROOM}/offer/OF1`
const _ = ' ' // неразрывный пробел перед знаком валюты (formatAmount)

const msg = (news: ChatNews, currency = 'RUB') => chatMessage(news, currency, LINK)

describe('screenLink', () => {
  it('пари, событие, лот, выбор — адрес экрана с номером', () => {
    expect(screenLink(SITE, ROOM, { kind: 'offer', id: 'OF1' })).toBe(`${SITE}#/room/${ROOM}/offer/OF1`)
    expect(screenLink(SITE, ROOM, { kind: 'event', id: 'EV1' })).toBe(`${SITE}#/room/${ROOM}/event/EV1`)
    expect(screenLink(SITE, ROOM, { kind: 'lot', id: 'LT1' })).toBe(`${SITE}#/room/${ROOM}/lot/LT1`)
    expect(screenLink(SITE, ROOM, { kind: 'choice', id: 'CH1' })).toBe(`${SITE}#/room/${ROOM}/choice/CH1`)
  })
  it('«Расчёт» — без номера; хеш открытого экрана в адресе сайта не мешает', () => {
    expect(screenLink(SITE + '#/room/X/history', ROOM, { kind: 'settle' })).toBe(`${SITE}#/room/${ROOM}/settle`)
  })
})

describe('chatMessage: пари на обещание (Р-44)', () => {
  const offer = {
    kind: 'offer',
    author: 'Аня',
    condition: 'Боря подтянется 20 раз',
    odds: { a: 1, b: 1 },
    amount: 0,
    promise: { author: 'везу шашлык', taker: 'моет машину' },
  } as const
  it('открытое — обещания сторон без суммы и кэфа', () => {
    expect(msg({ ...offer, state: 'open' })).toBe(
      `Аня предлагает пари на обещание: „Боря подтянется 20 раз“ — проиграет Аня: везу шашлык; проиграет соперник: моет машину. Принять или встречное: ${LINK}`,
    )
  })
  it('принятое — кто против кого, без банка', () => {
    expect(msg({ ...offer, state: 'accepted', taker: 'Боря' })).toBe(`Пари на обещание „Боря подтянется 20 раз“ принято: Аня — Боря. Исход — по ссылке: ${LINK}`)
  })
  it('прочее — без суммы', () => {
    expect(msg({ ...offer, state: 'other' })).toBe(`Пари на обещание „Боря подтянется 20 раз“ (Аня). Посмотрите: ${LINK}`)
  })
})

describe('chatMessage: пари', () => {
  const offer = { kind: 'offer', author: 'Аня', condition: 'Боря подтянется 20 раз', odds: { a: 3, b: 1 }, amount: 30000 } as const
  it('открытое — кэф, сумма автора, «принять или встречное», ссылка в конце', () => {
    expect(msg({ ...offer, state: 'open' })).toBe(`Аня предлагает пари: „Боря подтянется 20 раз“ — 3 к 1, 300${_}₽. Принять или встречное: ${LINK}`)
  })
  it('торг — сумма автора и лучшее встречное; встречных нет — старт', () => {
    expect(msg({ ...offer, state: 'open', auction: { start: 5000, best: 12000 } })).toBe(
      `Аня предлагает пари: „Боря подтянется 20 раз“ — торг, ставит 300${_}₽, лучшее встречное — 120${_}₽. Дайте больше: ${LINK}`,
    )
    expect(msg({ ...offer, state: 'open', auction: { start: 5000, best: null } })).toBe(
      `Аня предлагает пари: „Боря подтянется 20 раз“ — торг, ставит 300${_}₽, встречные — от 50${_}₽. Дайте больше: ${LINK}`,
    )
  })
  it('принятое — кто против кого и банк', () => {
    expect(msg({ ...offer, state: 'accepted', taker: 'Боря', bank: 40000 })).toBe(`Пари „Боря подтянется 20 раз“ принято: Аня — Боря, банк 400${_}₽. Исход — по ссылке: ${LINK}`)
  })
  it('прочее — условие, автор и сумма', () => {
    expect(msg({ ...offer, state: 'other' })).toBe(`Пари „Боря подтянется 20 раз“ (Аня, 300${_}₽). Посмотрите: ${LINK}`)
  })
  it('комната на очки — очки', () => {
    expect(msg({ ...offer, amount: 30, state: 'open' }, 'PTS')).toBe(`Аня предлагает пари: „Боря подтянется 20 раз“ — 3 к 1, 30${_}очков. Принять или встречное: ${LINK}`)
  })
})

describe('chatMessage: событие', () => {
  const event = { kind: 'event', condition: 'Комары не дадут сидеть у костра', bank: 120000 } as const
  it('приём идёт — банк и «ставьте»; ставок нет — так и пишем', () => {
    expect(msg({ ...event, state: 'open' })).toBe(`Событие „Комары не дадут сидеть у костра“: банк 1${_}200${_}₽. Ставьте: ${LINK}`)
    expect(msg({ ...event, bank: 0, state: 'open' })).toBe(`Событие „Комары не дадут сидеть у костра“: ставок пока нет. Ставьте: ${LINK}`)
  })
  it('приём закрыт — исход по ссылке; отменено', () => {
    expect(msg({ ...event, state: 'closed' })).toBe(`Событие „Комары не дадут сидеть у костра“: банк 1${_}200${_}₽, приём закрыт. Исход — по ссылке: ${LINK}`)
    expect(msg({ ...event, state: 'cancelled' })).toBe(`Событие „Комары не дадут сидеть у костра“ отменено. Посмотрите: ${LINK}`)
  })
})

describe('chatMessage: лот', () => {
  const lot = { kind: 'lot', seller: 'Вера', title: 'Палатка на четверых', start: 100000 } as const
  it('торг идёт — старт или лучшая ставка', () => {
    expect(msg({ ...lot, state: 'open', best: null })).toBe(`Вера продаёт лот „Палатка на четверых“: старт 1${_}000${_}₽. Ставьте: ${LINK}`)
    expect(msg({ ...lot, state: 'open', best: 150000 })).toBe(`Вера продаёт лот „Палатка на четверых“: лучшая ставка 1${_}500${_}₽. Перебейте: ${LINK}`)
  })
  it('продан — за сколько; иначе — торг закончен', () => {
    expect(msg({ ...lot, state: 'sold', best: 150000 })).toBe(`Лот „Палатка на четверых“ (Вера) продан за 1${_}500${_}₽. Посмотрите: ${LINK}`)
    expect(msg({ ...lot, state: 'other', best: null })).toBe(`Лот „Палатка на четверых“ (Вера): торг закончен. Посмотрите: ${LINK}`)
  })
})

describe('chatMessage: выбор', () => {
  const choice = { kind: 'choice', question: 'Куда едем в субботу', total: 90000 } as const
  it('варианты — «предлагайте»; вклады — сколько и кто впереди', () => {
    expect(msg({ ...choice, total: 0, lead: null, state: 'options' })).toBe(`Выбор „Куда едем в субботу“: предлагайте варианты: ${LINK}`)
    expect(msg({ ...choice, state: 'open', lead: { title: 'Озеро', total: 50000 } })).toBe(
      `Выбор „Куда едем в субботу“: вложено 900${_}₽, впереди „Озеро“ — 500${_}₽. Вкладывайте: ${LINK}`,
    )
    expect(msg({ ...choice, total: 0, state: 'open', lead: null })).toBe(`Выбор „Куда едем в субботу“: вкладов пока нет. Вкладывайте: ${LINK}`)
  })
  it('жребий, решён, не состоялся', () => {
    expect(msg({ ...choice, state: 'draw', lead: null })).toBe(`Выбор „Куда едем в субботу“: ничья, вложено 900${_}₽ — решит жребий. Посмотрите: ${LINK}`)
    expect(msg({ ...choice, state: 'decided', lead: { title: 'Озеро', total: 50000 } })).toBe(
      `Выбор „Куда едем в субботу“: победил „Озеро“ — 500${_}₽ из 900${_}₽. Посмотрите: ${LINK}`,
    )
    expect(msg({ ...choice, state: 'failed', lead: null })).toBe(`Выбор „Куда едем в субботу“ не состоялся. Посмотрите: ${LINK}`)
  })
})

describe('chatMessage: суд', () => {
  it('по пари, событию, лоту — без имён: сообщение в общий чат', () => {
    expect(msg({ kind: 'court', target: 'offer', title: 'Боря подтянется 20 раз' })).toBe(`Нужен суд по пари „Боря подтянется 20 раз“ — вы в составе: ${LINK}`)
    expect(msg({ kind: 'court', target: 'event', title: 'Дождь до обеда' })).toBe(`Нужен суд по событию „Дождь до обеда“ — вы в составе: ${LINK}`)
    expect(msg({ kind: 'court', target: 'lot', title: 'Палатка' })).toBe(`Нужен суд по лоту „Палатка“ — вы в составе: ${LINK}`)
  })
})

describe('chatMessage: расчёт', () => {
  it('«кто кому» с суммами и «отметьте переводы»', () => {
    const news: ChatNews = {
      kind: 'settle',
      room: 'Шашлыки на даче',
      transfers: [
        { from: 'Боря', to: 'Аня', amount: 50000 },
        { from: 'Вера', to: 'Аня', amount: 20000 },
      ],
    }
    expect(msg(news)).toBe(`Расчёт комнаты „Шашлыки на даче“: Боря → Аня 500${_}₽, Вера → Аня 200${_}₽. Отметьте переводы: ${LINK}`)
  })
  it('переводить нечего', () => {
    expect(msg({ kind: 'settle', room: 'Дача', transfers: [] })).toBe(`Расчёт комнаты „Дача“: все в расчёте, переводить нечего. Посмотрите: ${LINK}`)
  })
  it('комната на очки — итоги со знаком', () => {
    const news: ChatNews = {
      kind: 'points',
      room: 'Шахматы',
      totals: [
        { name: 'Аня', amount: 30 },
        { name: 'Вера', amount: 0 },
        { name: 'Боря', amount: -30 },
      ],
    }
    expect(msg(news, 'PTS')).toBe(`Таблица очков комнаты „Шахматы“: Аня +30${_}очков, Вера 0${_}очков, Боря −30${_}очков. Посмотрите: ${LINK}`)
  })
})
