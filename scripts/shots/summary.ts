import { Device, SITE, type Cdp, type Size } from './common.ts'

// «Сводка» (Р-50, #168): по копиям комнат на устройстве, без сервера. Копии — выдуманные, пишутся в
// хранилище устройства в обход сайта (как у части crash); адрес сервера у комнат — несуществующий: разовая
// проверка копий старше 5 минут не проходит, остаются копии. Три состояния:
// 1) с делами — «Шашлыки на даче» (суд, «Перевёл» вам, пари вам; «Скоро закроется» — событие и лот),
//    «Поездка в Ригу» (евро: баланс второй строкой); счётчик у «Сводки» и у комнаты в меню;
// 2) пустая — комната без дел: «Сейчас ничего не ждёт вас»;
// 3) со старой комнатой — «Работа», копия 10 дней назад: подсвечена, срок дела по копии прошёл — приглушено
const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const NOWHERE = 'http://127.0.0.1:9'
const TIMES = { objection: DAY, appeal: 7 * DAY, silence: 3 * DAY, court: 72 * HOUR }

const members = [
  { id: 'A', name: 'Аня' },
  { id: 'B', name: 'Боря' },
  { id: 'V', name: 'Вера' },
  { id: 'G', name: 'Гена' },
]
const sum0 = { amount: 0, events: 0, offers: 0 }
const settlement = (balances: Record<string, number>, transfers: object[] = []) => ({
  mode: 'stakes',
  members: members.map((m) => ({ memberId: m.id, total: sum0, pending: sum0, inPlay: sum0, sent: 0, received: 0, balance: balances[m.id] ?? 0 })),
  transfers,
  suggestions: [],
})
const outcome = (now: number, extra: object) => ({
  status: 'proposed',
  proposal: { id: 'p1', at: now - 3 * DAY, by: 'B', outcome: '1' },
  objectionUntil: now - 2 * DAY,
  objections: [],
  agreements: [],
  awaiting: [],
  decision: null,
  voters: [],
  votingUntil: null,
  votes: [],
  approved: null,
  finalAt: null,
  void: false,
  payouts: [],
  ...extra,
})
const event = (now: number, extra: object) => ({
  id: 'E1',
  at: now - 5 * DAY,
  authorId: 'B',
  condition: 'Пройдём весь маршрут за два дня',
  check: 'Отметки в общем треке похода',
  outcomes: [
    { id: '1', title: 'Да' },
    { id: '2', title: 'Нет' },
  ],
  closesAt: now - 4 * DAY,
  expectedAt: now - 3 * DAY,
  subjectId: null,
  subjectRule: true,
  times: TIMES,
  status: 'closed',
  clarifications: [],
  bets: [
    { id: 'b1', memberId: 'B', outcome: '1', amount: 30000, at: now - 5 * DAY },
    { id: 'b2', memberId: 'V', outcome: '2', amount: 50000, at: now - 5 * DAY },
  ],
  cancelled: null,
  refunds: [],
  outcome: null,
  ...extra,
})
const room = (now: number, extra: object) => ({
  server: NOWHERE,
  memberId: 'A',
  key: 'k',
  invite: null,
  currency: 'RUB',
  hostId: 'B',
  createdAt: now - 30 * DAY,
  members,
  savedAt: now - 30 * DAY,
  syncedAt: now - 2 * MINUTE,
  events: [],
  offers: [],
  lots: [],
  choices: [],
  ...extra,
})

// Комната с делами: суд (вы в составе), «Перевёл» вам от Веры, пари вам от Веры; ваша ставка на событии и
// на лоте — приём кончается сегодня
function busy(now: number) {
  const court = {
    seed: '5eed',
    drawnAt: now - DAY,
    candidates: ['A', 'G'],
    seats: [
      { member: 'A', since: now - DAY, until: now + 2 * DAY + 3 * HOUR, replaced: null, vote: null },
      { member: 'G', since: now - DAY, until: now + 2 * DAY + 3 * HOUR, replaced: null, vote: null },
    ],
    decision: null,
  }
  const appealed = event(now, {
    outcome: outcome(now, {
      status: 'approved',
      approved: { outcome: '1', at: now - 2 * DAY, how: 'unopposed', by: null },
      appeal: { id: 'a1', at: now - DAY, by: 'V', reason: 'Трек обрывается на второй день', joined: [] },
      court,
    }),
  })
  const open = event(now, {
    id: 'E2',
    at: now - DAY,
    authorId: 'V',
    condition: 'В субботу на даче будет дождь',
    check: 'Смотрим в окно в 12:00',
    closesAt: now + 5 * HOUR,
    expectedAt: now + 2 * DAY,
    status: 'open',
    bets: [
      { id: 'b3', memberId: 'A', outcome: '1', amount: 30000, at: now - HOUR },
      { id: 'b4', memberId: 'G', outcome: '2', amount: 45000, at: now - HOUR },
    ],
  })
  const offer = {
    id: 'O1',
    at: now - 2 * HOUR,
    authorId: 'V',
    condition: 'Гена не опоздает на электричку',
    check: 'Фото на перроне в 8:10',
    side: 'yes',
    odds: { a: 1, b: 1 },
    amount: 20000,
    takerAmount: 20000,
    to: 'A',
    closesAt: now + 20 * HOUR,
    expectedAt: now + 3 * DAY,
    guarantorId: 'B',
    counterTo: null,
    subjectId: null,
    guarantorRule: true,
    times: TIMES,
    status: 'open',
    accepted: null,
    withdrawnAt: null,
    closedBy: null,
    outcome: null,
  }
  const bids = [
    { id: 'l1', at: now - 3 * HOUR, by: 'A', amount: 120000 },
    { id: 'l2', at: now - 2 * HOUR, by: 'V', amount: 150000 },
  ]
  const lot = {
    id: 'L1',
    at: now - DAY,
    sellerId: 'B',
    title: 'Велосипед «Кама»',
    description: 'Синий, после сезона',
    start: 100000,
    step: 10000,
    closesAt: now + 3 * HOUR,
    latestEnd: now + 3 * HOUR + 30 * MINUTE,
    endsAt: now + 3 * HOUR,
    times: TIMES,
    status: 'open',
    bids,
    best: bids[1],
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
  }
  const transfer = { id: 'T1', at: now - HOUR, from: 'V', to: 'A', amount: 40000, by: 'sender', status: 'pending', changedAt: now - HOUR }
  return room(now, {
    id: 'R1',
    name: 'Шашлыки на даче',
    savedAt: now - 20 * DAY,
    events: [appealed, open],
    offers: [offer],
    lots: [lot],
    settlement: settlement({ A: 20000, V: -20000 }, [transfer]),
  })
}

// Вторая валюта — баланс отдельной строкой; дел нет
function riga(now: number) {
  return room(now, { id: 'R3', name: 'Поездка в Ригу', currency: 'EUR', savedAt: now - 25 * DAY, syncedAt: now - 3 * HOUR, settlement: settlement({ A: -1500, G: 1500 }) })
}

// Комната без дел
function quiet(now: number) {
  return room(now, { id: 'R4', name: 'Футбол по средам', settlement: settlement({}) })
}

// Копия 10 дней назад: тогда предложили исход, ждали вашего согласия сутки — по копии срок прошёл
function stale(now: number) {
  const synced = now - 10 * DAY
  const e = event(synced, {
    id: 'E3',
    condition: 'Квартальный план сдадим к пятнице',
    check: 'Письмо директора',
    bets: [
      { id: 'b5', memberId: 'B', outcome: '1', amount: 50000, at: synced - 5 * DAY },
      { id: 'b6', memberId: 'A', outcome: '2', amount: 50000, at: synced - 5 * DAY },
    ],
    outcome: outcome(synced, { proposal: { id: 'p3', at: synced - HOUR, by: 'B', outcome: '1' }, objectionUntil: synced + DAY - HOUR, awaiting: ['A'] }),
  })
  return room(now, { id: 'R2', name: 'Работа', savedAt: now - 40 * DAY, syncedAt: synced, events: [e], settlement: settlement({}) })
}

async function withRooms(cdp: Cdp, size: Size, name: string, rooms: (now: number) => object[]): Promise<Device> {
  const device = await Device.open(cdp, size, name)
  await device.goto(SITE + '#/')
  await device.waitText('Комнат пока нет')
  const list = JSON.stringify(rooms(Date.now()))
  await device.eval(`new Promise((resolve, reject) => {
    const open = indexedDB.open('torgsin')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const tx = open.result.transaction('rooms', 'readwrite')
      for (const room of ${list}) tx.objectStore('rooms').put(room)
      tx.oncomplete = () => {
        open.result.close()
        resolve(true)
      }
      tx.onerror = () => reject(tx.error)
    }
  })`)
  await device.reload()
  return device
}

export async function summary(cdp: Cdp, size: Size) {
  console.log(`Сводка, ${size.width} px`)
  const desk = size.width >= 1024
  // Без прокрутки вбок, кнопки дел не ниже 44 px
  const check = async (device: Device, where: string) => {
    const seen = await device.eval<{ scroll: number; low: number }>(`({
      scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      low: [...document.querySelectorAll('.summary a.button')].filter((b) => b.getBoundingClientRect().height < 44).length,
    })`)
    if (seen.scroll > 0) throw new Error(`${where} на ${size.width} px: прокрутка вбок ${seen.scroll} px`)
    if (seen.low > 0) throw new Error(`${where} на ${size.width} px: кнопок ниже 44 px — ${seen.low}`)
  }

  // 1. С делами: три дела по сроку (пари вам — до завтра, суд — 2 дня, перевод — без срока), «Скоро закроется»
  // — лот и событие, баланс в рублях и евро; счётчик у «Сводки» — 3, у комнаты — 3
  const a = await withRooms(cdp, size, 'с делами', (now) => [busy(now), riga(now)])
  const box = await a.waitIn('.summary', 'Ждут вас: 3')
  for (const text of [
    'по копиям комнат · ',
    'вам должны 200 ₽',
    'вы должны 15 €',
    'по 1 комнате: Шашлыки на даче: +200 ₽',
    'Вера предлагает вам пари: Вера ставит 200 ₽ на „сбудется“, соперник — 200 ₽ (кэф 1 к 1), банк 400 ₽ — принять или встречное',
    'вы в суде — ваш голос',
    'Вера отметил(а) «Перевёл» 400 ₽ — «Получил» или «Не получал»',
    'Скоро закроется',
    'ваша ставка 1 200 ₽ — лучшая у Вера, 1 500 ₽',
    'вы: 300 ₽ на «Да»',
  ])
    if (!box.includes(text)) throw new Error(`Сводка: нет «${text}». В блоке:\n${box}`)
  const cards = await a.eval<{ kinds: string[]; hrefs: string[] }>(`({
    kinds: [...document.querySelectorAll('.summary-task .summary-meta > span:first-child')].map((el) => el.textContent),
    hrefs: [...document.querySelectorAll('.summary-task a.button')].map((el) => el.getAttribute('href')),
  })`)
  if (cards.kinds.join(' | ') !== 'Шашлыки на даче · пари вам | Шашлыки на даче · суд | Шашлыки на даче · перевод')
    throw new Error('Сводка: порядок дел — ' + JSON.stringify(cards.kinds))
  if (cards.hrefs.join(' | ') !== '#/room/R1/offer/O1 | #/room/R1/event/E1 | #/room/R1/settle') throw new Error('Сводка: куда ведут кнопки — ' + JSON.stringify(cards.hrefs))
  const counters = await a.eval<{ summary: string | null; room: string | null }>(`({
    summary: document.querySelector('.nav > .nav-item[href="#/"] .nav-count')?.textContent ?? null,
    room: document.querySelector('.nav-rooms a[href="#/room/R1"] .nav-count')?.textContent ?? null,
  })`)
  if (counters.summary !== '3' || counters.room !== '3') throw new Error('Меню: счётчики «ждут вас» — ' + JSON.stringify(counters))
  // У комнаты в списке — время копии
  await a.waitIn('.room-list', 'Шашлыки на даче')
  await check(a, 'Сводка с делами')
  await a.shot('S1-svodka')
  if (!desk) {
    await a.press('☰')
    await a.waitIn('.nav', 'Сводка')
    await a.shot('S1a-svodka-menu')
    await a.press('✕')
  }
  // Кнопка дела — на экран спора
  await a.press('Ответить')
  await a.waitText('Гена не опоздает на электричку')
  if ((await a.eval<string>('location.hash')) !== '#/room/R1/offer/O1') throw new Error('«Ответить» открыл не пари')

  // 2. Пустая: комната есть, дел нет
  const b = await withRooms(cdp, size, 'пустая', (now) => [quiet(now)])
  await b.waitIn('.summary', 'Сейчас ничего не ждёт вас')
  const empty = await b.eval<{ tasks: number; soon: boolean; count: boolean }>(`({
    tasks: document.querySelectorAll('.summary-task').length,
    soon: document.querySelector('.summary').innerText.includes('Скоро закроется'),
    count: !!document.querySelector('.nav .nav-count'),
  })`)
  if (empty.tasks || empty.soon || empty.count) throw new Error('Пустая сводка: ' + JSON.stringify(empty))
  await check(b, 'Пустая сводка')
  await b.shot('S2-svodka-pusto')

  // 3. Старая комната: подсвечена в списке, дело по копии — «срок прошёл — откройте комнату»
  const c = await withRooms(cdp, size, 'старая комната', (now) => [stale(now), quiet(now)])
  const old = await c.waitIn('.room-list', 'откройте, чтобы обновить')
  if (!/данные от \d\d\.\d\d — откройте, чтобы обновить/.test(old)) throw new Error('Старая комната: ' + old)
  if (!(await c.eval<boolean>(`!!document.querySelector('.room-item.stale')`))) throw new Error('Старая комната не подсвечена')
  const late = await c.waitIn('.summary', 'срок прошёл — откройте комнату')
  if (!late.includes('предложен исход «Да» — согласитесь или возразите')) throw new Error('Старая комната: дело — ' + late)
  if (!(await c.eval<boolean>(`!!document.querySelector('.summary-task.overdue')`))) throw new Error('Дело со сроком по копии не приглушено')
  await check(c, 'Сводка со старой комнатой')
  await c.shot('S3-svodka-staraya-komnata')
}
