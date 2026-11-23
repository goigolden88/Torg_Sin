import { api, confirmTwice, Device, PASSWORD, SITE, type Cdp, type ServerModule, type Size } from './common.ts'

// «Лот» (#120, Р-38). Свой запасной сервер с подставными часами: конец торга — сдвигом часов. Комната
// «Чердак»: Аня — ведущая, Боря, Вера, Гена, Дима; на устройства Бори, Веры и Гены — ссылкой для другого
// устройства. Лот 1 «Велосипед» — из формы у Бори: старт 1 000 ₽, шаг подставлен (100 ₽); Вера даёт старт,
// Гена (через сервер) — 1 500 ₽, Веру перебили. Лот 2 «Палатка» — через сервер, Гена — 2 000 ₽. Лот 3
// «Лыжи» у Веры — без ставок. Конец торга — сдвигом часов: Боря «Передал» лот 1, Гена «Получил» — долг в
// «Расчёте»; лот 2 Боря «Передал» (через сервер), Гена «Не получил» — суд, Вера голосует; лот 3 — «не
// продан» в «Истории»
export async function lots(cdp: Cdp, size: Size, startServer: ServerModule['startServer']) {
  console.log(`Лоты, ${size.width} px`)
  const MINUTE = 60 * 1000
  let shift = 0
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0, now: () => Date.now() + shift })
  try {
    const room = await api<{ roomId: string; invite: string; key: string; memberId: string }>(server, '/rooms', '', {
      password: PASSWORD,
      name: 'Чердак',
      currency: 'RUB',
      hostName: 'Аня',
    })
    const rooms = `/rooms/${room.roomId}`
    const join = async (name: string) => {
      const j = await api<{ memberId: string; key: string }>(server, `${rooms}/join`, '', { invite: room.invite, name })
      await api(server, `${rooms}/admit`, room.key, { request: j.memberId })
      return j
    }
    const borya = await join('Боря')
    const vera = await join('Вера')
    const gena = await join('Гена')
    await join('Дима')
    const open = async (name: string, key: string) => {
      const { token } = await api<{ token: string }>(server, `${rooms}/device`, key, {})
      const device = await Device.open(cdp, size, name)
      await device.goto(`${SITE}#/device/${room.roomId}/${token}?server=${encodeURIComponent(server.url)}`)
      await device.waitText('Открыть комнату здесь')
      await device.click('Открыть комнату здесь')
      await device.waitText('Участники')
      return device
    }
    const boryaPhone = await open('Боря', borya.key)
    const veraPhone = await open('Вера', vera.key)
    const genaPhone = await open('Гена', gena.key)
    const roomHref = `${SITE}#/room/${room.roomId}`
    const lotHref = (id: string) => `${SITE}#/room/${room.roomId}/lot/${id}`
    const LIST = 'section[aria-label="Лоты"]'
    const FACTS = 'ul[aria-label="Условия лота"]'
    const BIDS = 'section[aria-label="Ставки"]'
    const BID_FORM = 'form[aria-label="Ваша ставка"]'
    const COURT = 'section[aria-label="Суд по лоту"]'
    const MODAL = '.modal'
    const visible = (device: Device) =>
      device.eval<string[]>(`[...document.querySelectorAll('button, a.button')].filter((b) => b.offsetParent !== null && !b.disabled).map((b) => b.innerText.trim())`)
    const noScroll = async (device: Device, where: string) => {
      const scroll = await device.eval<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
      if (scroll > 0) throw new Error(`${where} на ${size.width} px: прокрутка вбок ${scroll} px`)
    }
    const fieldValue = (device: Device, label: string) =>
      device.eval<string>(
        `[...document.querySelectorAll('label')].find((l) => l.querySelector('span')?.textContent.trim() === ${JSON.stringify(label)})?.querySelector('input')?.value ?? ''`,
      )
    const serverLots = async () =>
      ((await (await fetch(server.url + rooms, { headers: { Authorization: 'Bearer ' + room.key } })).json()) as { lots?: { id: string; title: string; status: string }[] }).lots ?? []
    // Поле datetime-local — местное время, до минуты (часы сценария и Chrome — одни)
    const localInput = (ms: number) => {
      const d = new Date(ms)
      const p = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
    }

    // Пусто: блок «Лоты» под «Пари» с кнопкой
    await boryaPhone.goto(roomHref)
    await boryaPhone.waitIn(LIST, 'Лотов пока нет')

    // Лот 1 — из формы: шаг подставлен, «торг закончится не позже …»
    await boryaPhone.click('Выставить лот')
    await boryaPhone.waitText('Новый лот')
    await boryaPhone.fill('Название', 'Велосипед «Кама»')
    await boryaPhone.fill('Описание', 'Синий, 2015 год, звонок в подарок. Забрать на даче')
    await boryaPhone.fill('Старт, ₽', '1000')
    await boryaPhone.waitText('Подставлено 10 % старта')
    const step = await fieldValue(boryaPhone, 'Шаг, ₽')
    if (step !== '100') throw new Error(`Шаг лота не подставлен: «${step}»`)
    await boryaPhone.fill('Конец торга', localInput(Math.ceil((Date.now() + 20 * MINUTE) / MINUTE) * MINUTE))
    await boryaPhone.waitText('Торг закончится не позже')
    await boryaPhone.waitIn('.offer-summary', 'Старт — 1 000 ₽, шаг — 100 ₽')
    await noScroll(boryaPhone, '«Новый лот»')
    await boryaPhone.shot('160-lot-novyi')
    await boryaPhone.click('Выставить')
    await boryaPhone.waitIn(MODAL, 'Выставить лот?')
    await boryaPhone.waitIn(MODAL, 'Снять лот можно, пока ставок нет')
    await boryaPhone.shot('160a-lot-podtverzhdenie')
    await confirmTwice(boryaPhone, 'Ставок пока нет')
    const created = await serverLots()
    if (created.length !== 1) throw new Error('Лот на сервере: ' + JSON.stringify(created))
    const bike = created[0].id
    await boryaPhone.waitIn(FACTS, 'старт — 1 000 ₽, шаг — 100 ₽')
    if (!(await visible(boryaPhone)).includes('Снять лот')) throw new Error('Продавцу без ставок нет «Снять лот»')
    if (await boryaPhone.eval<boolean>(`!!document.querySelector(${JSON.stringify(BID_FORM)})`)) throw new Error('Продавцу есть поле ставки')

    // Вера даёт старт: подставлен старт, окно с основанием
    await veraPhone.goto(lotHref(bike))
    await veraPhone.waitIn(BID_FORM, 'Не меньше старта — 1 000 ₽')
    const suggested = await fieldValue(veraPhone, 'Ваша ставка, ₽')
    if (suggested !== '1000') throw new Error(`Ставка не подставлена: «${suggested}»`)
    await veraPhone.press('Сделать ставку')
    await veraPhone.waitIn(MODAL, 'Вы ставите 1 000 ₽ за „Велосипед «Кама»“ — продавец Боря.')
    await confirmTwice(veraPhone, 'Лучшая ставка — Вера (вы)')
    await veraPhone.waitIn(BIDS, 'Лучшая ставка — Вера (вы): 1 000 ₽')

    // Гена — 1 500 ₽ через сервер: Веру перебили, поле — лучшая + шаг
    await api(server, `${rooms}/lots/${bike}/bid`, gena.key, { amount: 150000 })
    await veraPhone.waitIn(BIDS, 'Вас перебили: лучшая ставка — Гена, 1 500 ₽')
    await veraPhone.waitIn(BID_FORM, 'Не меньше 1 600 ₽: лучшая 1 500 ₽ + шаг 100 ₽')
    await veraPhone.waitCount('.bid-list .bid', 2)
    await noScroll(veraPhone, 'Торг лота')
    await veraPhone.shot('161-lot-torg')

    // Лоты 2 и 3 — через сервер; конец — через 11 минут
    const closesAt = Date.now() + shift + 11 * MINUTE
    const { lot: tent } = await api<{ lot: { id: string } }>(server, `${rooms}/lots`, borya.key, { title: 'Палатка на двоих', start: 150000, closesAt })
    await api(server, `${rooms}/lots/${tent.id}/bid`, gena.key, { amount: 200000 })
    const { lot: skis } = await api<{ lot: { id: string } }>(server, `${rooms}/lots`, vera.key, { title: 'Лыжи с палками', start: 300000, closesAt })

    // Комната: идущие лоты, «вас перебили» у Веры
    await veraPhone.goto(roomHref)
    await veraPhone.waitIn(LIST, 'Торг идёт')
    await veraPhone.waitIn(LIST, 'вас перебили')
    await veraPhone.waitIn(LIST, 'Лыжи с палками')
    await noScroll(veraPhone, 'Комната с лотами')
    await veraPhone.shot('162-komnata-loty')

    // Конец торга у всех трёх
    shift += 25 * MINUTE

    // Боря — продавец лота 1 после торга: «Передал» / «Не смогу передать»
    await boryaPhone.goto(lotHref(bike))
    await boryaPhone.waitIn('.event-main', 'торг закончен — ждёт передачи: Гена, 1 500 ₽')
    await boryaPhone.waitText('Торг закончен: передайте лот победителю — Гена — и отметьте «Передал».')
    const sellerActs = await visible(boryaPhone)
    if (!sellerActs.includes('Передал') || !sellerActs.includes('Не смогу передать')) throw new Error('Продавцу после торга нет отметок: ' + sellerActs.join(', '))
    if (sellerActs.includes('Снять лот')) throw new Error('После торга со ставками есть «Снять лот»')
    await noScroll(boryaPhone, 'Лот у продавца после торга')
    await boryaPhone.shot('163-lot-prodavec')
    await boryaPhone.press('Передал')
    await boryaPhone.waitIn(MODAL, 'Вы передали лот?')
    await confirmTwice(boryaPhone, 'Ждём «Получил» от Гена')

    // Гена — победитель лота 1: срок молчания, «Получил» / «Не получил»
    await genaPhone.goto(lotHref(bike))
    await genaPhone.waitText('считается получено')
    const winnerActs = await visible(genaPhone)
    if (!winnerActs.includes('Получил') || !winnerActs.includes('Не получил')) throw new Error('Победителю нет отметок: ' + winnerActs.join(', '))
    await noScroll(genaPhone, 'Лот у победителя')
    await genaPhone.shot('164-lot-pobeditel')
    await genaPhone.press('Получил')
    await genaPhone.waitIn(MODAL, 'Лот получен: вы должны продавцу — Боря — 1 500 ₽')
    await confirmTwice(genaPhone, 'получен — долг Гена → Боря')
    await genaPhone.waitIn('.event-main', 'получен — долг Гена → Боря: 1 500 ₽')
    await noScroll(genaPhone, 'Лот получен')
    await genaPhone.shot('164a-lot-poluchen')

    // Лот 2: Боря «Передал» через сервер, Гена «Не получил» — суд
    await api(server, `${rooms}/lots/${tent.id}/handed`, borya.key, {})
    await genaPhone.goto(lotHref(tent.id))
    await genaPhone.press('Не получил')
    await genaPhone.waitIn(MODAL, 'Вы не получили лот?')
    await confirmTwice(genaPhone, 'ждёт суда — победитель отметил «Не получил»')

    // Вера — в суде по лоту: голос «передано» / «не передано»
    await veraPhone.goto(lotHref(tent.id))
    await veraPhone.waitIn(COURT, 'Победитель отметил «Не получил» — решает суд')
    await veraPhone.waitIn(COURT, 'Вы в суде')
    const votes = await visible(veraPhone)
    if (!votes.includes('Передано') || !votes.includes('Не передано')) throw new Error('В суде по лоту нет голосов: ' + votes.join(', '))
    if (votes.some((v) => v.startsWith('Оставить') || v.startsWith('Отменить') || v === 'Подать апелляцию')) throw new Error('У лота голоса чужого спора: ' + votes.join(', '))
    await noScroll(veraPhone, 'Суд по лоту')
    await veraPhone.shot('165-lot-sud')
    await veraPhone.click('Передано')
    await veraPhone.waitIn(MODAL, 'лот получен, победитель должен продавцу свою ставку')
    await confirmTwice(veraPhone, 'голос: передано')
    await veraPhone.goto(roomHref)
    await veraPhone.waitIn(LIST, 'Ждут передачи')
    await veraPhone.waitIn(LIST, 'Палатка на двоих')
    await noScroll(veraPhone, 'Комната: лот ждёт суда')
    await veraPhone.shot('165a-komnata-lot-v-sude')

    // «Расчёт»: долг по лоту с основанием
    await genaPhone.goto(`${SITE}#/room/${room.roomId}/settle`)
    await genaPhone.waitIn('section[aria-label="Долги по лотам"]', 'Гена (вы) → Боря: 1 500 ₽ — лот „Велосипед «Кама»“')
    await genaPhone.waitText('по 1 лоту')
    await noScroll(genaPhone, '«Расчёт» с лотом')
    await genaPhone.shot('166-lot-raschet')

    // «История»: проданный и не проданный
    await boryaPhone.goto(`${SITE}#/room/${room.roomId}/history`)
    await boryaPhone.waitIn('section[aria-label="Прошедшее"]', 'Лот · исход: продан — Гена, 1 500 ₽')
    await boryaPhone.waitIn('section[aria-label="Прошедшее"]', 'Лот · исход: не продан — ставок не было')
    await noScroll(boryaPhone, '«История» с лотами')
    await boryaPhone.shot('167-lot-istoriya')
    const final = await serverLots()
    const statusOf = (id: string) => final.find((l) => l.id === id)?.status
    if (statusOf(bike) !== 'received' || statusOf(tent.id) !== 'court' || statusOf(skis.id) !== 'unsold') {
      throw new Error('Лоты на сервере: ' + JSON.stringify(final))
    }
  } finally {
    await server.close()
  }
}
