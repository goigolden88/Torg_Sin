import { api, confirmTwice, Device, PASSWORD, SITE, type Cdp, type ServerModule, type Size } from './common.ts'

// «Расчёт» (#71). Свой запасной сервер с подставными часами: «исход к» — сдвигом часов. Ведущая Аня,
// Боря, Вера, Гена (выдуманные). Пари 1: Аня — Боря, прав Боря (Аня −300 ₽); пари 2: Вера — Аня, права Аня
// (+900 ₽) — обе стороны отметили одинаково, окончательно сразу; пари 3: Аня — Гена, отметки разошлись,
// гарант Боря решил за Аню (+200 ₽, ждёт окончательности); событие с её ставкой 500 ₽ — «в игре».
// Вера перевела Ане 400 ₽ — «ждёт подтверждения». Комната «по ставкам»: сначала пусто («ждут
// окончательности — 1»), блок в комнате, «Расчёт» с долгом, окно «Перевёл» (частями — 100 ₽); комната
// «меньше переводов» (выбрана при создании): окно смены режима до переводов, «Расчёт» после перевода;
// форма создания с выбором режима; комната на очки — «Таблица очков» без кнопок; карточки комнат
export async function settle(cdp: Cdp, size: Size, startServer: ServerModule['startServer']) {
  console.log(`Расчёт, ${size.width} px`)
  const HOUR = 60 * 60 * 1000
  let shift = 0
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0, now: () => Date.now() + shift })
  try {
    type Room = { roomId: string; invite: string; key: string; memberId: string }
    type Member = { memberId: string; key: string }
    const createRoom = async (name: string, currency: string, settleMode?: string) => {
      const room = await api<Room>(server, '/rooms', '', { password: PASSWORD, name, currency, hostName: 'Аня', ...(settleMode ? { settleMode } : {}) })
      const rooms = `/rooms/${room.roomId}`
      const join = async (member: string) => {
        const j = await api<Member>(server, `${rooms}/join`, '', { invite: room.invite, name: member })
        await api(server, `${rooms}/admit`, room.key, { request: j.memberId })
        return j
      }
      return { room, rooms, join }
    }
    // Пари через сервер: принять сразу; «исход к» — через час после «приём до»
    const offer = async (rooms: string, key: string, takerKey: string, body: object) => {
      const closesAt = Date.now() + shift + HOUR
      const { offer } = await api<{ offer: { id: string } }>(server, `${rooms}/offers`, key, { closesAt, expectedAt: closesAt + HOUR, odds: { a: 1, b: 1 }, ...body })
      await api(server, `${rooms}/offers/${offer.id}/accept`, takerKey, {})
      return offer.id
    }
    const mark = (rooms: string, id: string, key: string, winner: 'author' | 'taker') => api(server, `${rooms}/offers/${id}/mark`, key, { winner })

    // Комната с выдуманными спорами: до сдвига часов — только принятые пари
    const setup = async (name: string, settleMode?: string) => {
      const { room, rooms, join } = await createRoom(name, 'RUB', settleMode)
      const borya = await join('Боря')
      const vera = await join('Вера')
      const gena = await join('Гена')
      const lost = await offer(rooms, room.key, borya.key, { condition: 'Доедем до озера за два часа', check: 'Время по навигатору', amount: 30000, to: borya.memberId, guarantor: gena.memberId })
      const won = await offer(rooms, vera.key, room.key, { condition: 'Дождь начнётся до обеда', check: 'Смотрим в окно в 13:00', amount: 90000, to: room.memberId, guarantor: gena.memberId })
      const decided = await offer(rooms, room.key, gena.key, { condition: 'Шашлык будет готов к семи', check: 'Часы у мангала', amount: 20000, to: gena.memberId, guarantor: borya.memberId })
      return { room, rooms, borya, vera, gena, lost, won, decided }
    }
    const stakes = await setup('Шашлыки на даче')
    const fewest = await setup('Дача: меньше переводов', 'fewest')
    shift += 3 * HOUR // «исход к» настал у всех пари

    // Пари 3: отметки разошлись — решает гарант Боря: права Аня, ждёт окончательности (7 дней)
    const disputed = async (x: typeof stakes) => {
      await mark(x.rooms, x.decided, x.room.key, 'author')
      await mark(x.rooms, x.decided, x.gena.key, 'taker')
      await api(server, `${x.rooms}/offers/${x.decided}/decide`, x.borya.key, { winner: 'author' })
    }
    // Пари 1 и 2: стороны отметили одинаково — окончательно сразу; событие со ставкой Ани — в игре
    const finals = async (x: typeof stakes) => {
      await mark(x.rooms, x.lost, x.room.key, 'taker')
      await mark(x.rooms, x.lost, x.borya.key, 'taker')
      await mark(x.rooms, x.won, x.vera.key, 'taker')
      await mark(x.rooms, x.won, x.room.key, 'taker')
      const closesAt = Date.now() + shift + 24 * HOUR
      const { event } = await api<{ event: { id: string } }>(server, `${x.rooms}/events`, x.vera.key, {
        condition: 'Комары не дадут сидеть у костра',
        check: 'Голосуем у костра',
        closesAt,
        expectedAt: closesAt + HOUR,
      })
      await api(server, `${x.rooms}/events/${event.id}/bets`, x.room.key, { outcome: '1', amount: 50000 })
    }
    const veraSends = (x: typeof stakes) => api(server, `${x.rooms}/transfers`, x.vera.key, { to: x.room.memberId, amount: 40000 })
    await disputed(stakes)
    await disputed(fewest)

    // На устройство Ани — ссылкой для другого устройства; комнаты — в одном хранилище
    const host = await Device.open(cdp, size, 'Аня')
    const claim = async (roomId: string, key: string) => {
      const { token } = await api<{ token: string }>(server, `/rooms/${roomId}/device`, key, {})
      await host.goto(`${SITE}#/device/${roomId}/${token}?server=${encodeURIComponent(server.url)}`)
      await host.waitText('Открыть комнату здесь')
      await host.click('Открыть комнату здесь')
      await host.waitText('Участники')
    }
    const settleHref = (roomId: string) => `${SITE}#/room/${roomId}/settle`
    const MAIN = '.detail'
    const noScroll = async (where: string) => {
      const scroll = await host.eval<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
      if (scroll > 0) throw new Error(`${where} на ${size.width} px: прокрутка вбок ${scroll} px`)
    }
    // Кнопки расчёта не ниже 44 px
    const tall = async (where: string) => {
      const low = await host.eval<number>(
        `[...document.querySelectorAll('.settle button, .modal button')].filter((b) => b.offsetParent !== null && b.getBoundingClientRect().height < 44).length`,
      )
      if (low > 0) throw new Error(`${where} на ${size.width} px: кнопок ниже 44 px — ${low}`)
    }
    // Все участники: на телефоне — карточками, от 600 px — таблицей
    const table = async (where: string) => {
      const display = await host.eval<string>(`getComputedStyle(document.querySelector('.settle-table tr')).display`)
      if ((size.width >= 600) !== (display === 'table-row')) throw new Error(`${where} на ${size.width} px: строка таблицы — ${display}`)
    }
    const check = async (where: string) => {
      await noScroll(where)
      await tall(where)
    }
    const escape = () => host.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)

    // Пусто: окончательных нет, одно пари ждёт окончательности
    await claim(stakes.room.roomId, stakes.room.key)
    await host.goto(settleHref(stakes.room.roomId))
    await host.waitIn(MAIN, 'Пока считать нечего: окончательных событий и пари нет')
    await host.waitIn(MAIN, 'Ждут окончательности — 1')
    await check('Расчёт: пусто')
    await host.shot('110-raschyot-pusto')

    // Комната «по ставкам»: пари окончательны, Вера перевела 400 ₽
    await finals(stakes)
    await veraSends(stakes)
    await host.goto(`${SITE}#/room/${stakes.room.roomId}`)
    await host.waitIn('section[aria-label="Расчёт"]', 'Ваш итог: +600 ₽ по 2 пари')
    await host.waitIn('section[aria-label="Расчёт"]', 'Вам должны 200 ₽')
    await noScroll('Комната с расчётом')
    await host.shot('111-komnata-blok-raschyot')

    await host.click('Ваш итог')
    await host.waitIn(MAIN, 'Вы должны:')
    for (const text of [
      'Итог',
      '+600 ₽ по 2 пари',
      '+200 ₽ по 1 пари',
      '500 ₽ по 1 событию',
      'Боря — 300 ₽',
      'Вера — 500 ₽',
      'Вера → Аня (вы): 400 ₽',
      'ждёт подтверждения',
      'Кто кому: По ставкам — каждый платит тому, кому проиграл',
      'Режим меняется, когда все в расчёте',
    ])
      await host.waitIn(MAIN, text)
    await host.waitIn('.transfer.pending', 'Не получал')
    await check('Расчёт по ставкам')
    await table('Расчёт по ставкам')
    await host.shot('112-raschyot-po-stavkam')

    // «Перевёл» — окно с суммой из подсказки; частями — 100 ₽; двойное нажатие — один перевод
    await host.press('Перевёл')
    await host.waitIn('.modal', 'Вы перевели 300 ₽?')
    await host.waitIn('.modal', 'Кому: Боря')
    await host.fill('Сумма', '100')
    await host.waitIn('.modal', 'Вы перевели 100 ₽?')
    await tall('Окно «Перевёл»')
    await host.shot('113-okno-perevyol')
    await confirmTwice(host, 'Аня (вы) → Боря: 100')
    await host.waitIn(MAIN, 'Боря — 200 ₽')
    await host.waitCount('.transfer', 2)
    await host.waitIn('.transfer.pending', 'Отозвать')

    // Комната «меньше переводов»: до переводов ведущей — «Изменить», окно с двумя вариантами
    await claim(fewest.room.roomId, fewest.room.key)
    await finals(fewest)
    await host.goto(settleHref(fewest.room.roomId))
    await host.waitIn(MAIN, 'Кто кому: Меньше переводов — долги сводятся через всех')
    await host.press('Изменить')
    await host.waitIn('.modal', 'Кто кому переводит?')
    await host.waitIn('.modal', 'По ставкам — каждый платит тому, кому проиграл')
    await tall('Окно смены режима')
    await host.shot('114-okno-smena-rezhima')
    await escape()
    await veraSends(fewest)
    await host.waitIn(MAIN, 'ждёт подтверждения')
    for (const text of ['Вера — 200 ₽', 'Режим меняется, когда все в расчёте']) await host.waitIn(MAIN, text)
    const owe = await host.eval<boolean>(`document.querySelector('[aria-label="Вы должны"]') !== null`)
    if (owe) throw new Error('Меньше переводов: у Ани «Вы должны», а должна только Вера')
    await check('Расчёт: меньше переводов')
    await host.shot('115-raschyot-menshe-perevodov')

    // Карточки комнат: «вам должны»
    await host.goto(`${SITE}#/`)
    await host.waitIn('.room-list', 'вам должны 300 ₽')
    await host.waitIn('.room-list', 'вам должны 200 ₽')
    await noScroll('Мои комнаты')
    await host.shot('116-kartochki-dolg')

    // Создание комнаты: «Кто кому переводит» — «По ставкам» выбрано; на очках выбора нет
    await host.goto(`${SITE}#/new`)
    await host.waitText('Кто кому переводит')
    const chosen = await host.eval<string>(`document.querySelector('input[name="settle-mode"]:checked')?.value ?? ''`)
    if (chosen !== 'stakes') throw new Error('Создание комнаты: выбран режим ' + chosen)
    await noScroll('Создание комнаты')
    await host.shot('117-sozdanie-rezhim')
    await host.click('очки')
    const modes = await host.eval<number>(`document.querySelectorAll('input[name="settle-mode"]').length`)
    if (modes > 0) throw new Error('Создание комнаты на очки: выбор режима остался')

    // Комната на очки — «Таблица очков»: по убыванию итога, без переводов и кнопок
    const pts = await createRoom('Шахматы по пятницам', 'PTS')
    const borya = await pts.join('Боря')
    const vera = await pts.join('Вера')
    const game = await offer(pts.rooms, pts.room.key, borya.key, { condition: 'Выиграю у Бори белыми', check: 'Партия в пятницу', amount: 30, to: borya.memberId, guarantor: vera.memberId })
    shift += 3 * HOUR
    await mark(pts.rooms, game, pts.room.key, 'author')
    await mark(pts.rooms, game, borya.key, 'author')
    await claim(pts.room.roomId, pts.room.key)
    await host.waitIn('section[aria-label="Таблица очков"]', 'Ваш итог: +30 очков по 1 пари')
    await host.click('Ваш итог')
    await host.waitIn(MAIN, 'Таблица очков')
    await host.waitIn(MAIN, 'Все участники')
    const first = await host.eval<string>(`document.querySelector('.settle-table tbody th').innerText`)
    if (!first.startsWith('Аня')) throw new Error('Таблица очков: первым — ' + first)
    const extra = await host.eval<string[]>(
      `[...document.querySelectorAll('.settle button')].map((b) => b.innerText.trim()).concat(document.querySelector('[aria-label="Переводы"]') ? ['Переводы'] : [])`,
    )
    if (extra.length > 0) throw new Error('Таблица очков: лишнее — ' + extra.join(', '))
    await noScroll('Таблица очков')
    await table('Таблица очков')
    await host.shot('118-tablica-ochkov')
  } finally {
    await server.close()
  }
}
