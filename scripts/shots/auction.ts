import { api, confirmTwice, Device, PASSWORD, SITE, type Cdp, type ServerModule, type Size } from './common.ts'

// Пари «Торг до …» (#117, Р-37). Свой запасной сервер с подставными часами: конец торга — сдвигом часов.
// Комната «Регата»: Аня — ведущая (гарант по умолчанию), Боря, Вера, Гена; на устройства — ссылкой для
// другого устройства. Торг 1 — из формы: Боря ставит 300 ₽, старт 1 000 ₽ (шаг подставлен — 100 ₽);
// Вера даёт старт, Гена (через сервер) — 4 000 ₽, Веру перебили; Вера — 10 000 ₽: вдвое больше лучшего —
// второе подтверждение; Гену перебили; Боря «Принять сейчас» — торг закончен. Торг 2 — через сервер,
// без встречных: конец прошёл — «Не состоялось», «Повторить», в «Истории»
export async function auction(cdp: Cdp, size: Size, startServer: ServerModule['startServer']) {
  console.log(`Торг, ${size.width} px`)
  const MINUTE = 60 * 1000
  const HOUR = 60 * MINUTE
  let shift = 0
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0, now: () => Date.now() + shift })
  try {
    const room = await api<{ roomId: string; invite: string; key: string; memberId: string }>(server, '/rooms', '', {
      password: PASSWORD,
      name: 'Регата',
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
    const offerHref = (id: string) => `${SITE}#/room/${room.roomId}/offer/${id}`
    const LIST = 'section[aria-label="Пари"]'
    const FACTS = 'ul[aria-label="Условия пари"]'
    const BIDDING = 'section[aria-label="Торг"]'
    const BID_FORM = 'form[aria-label="Ваше встречное"]'
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
    const serverOffers = async () =>
      ((await (await fetch(server.url + rooms, { headers: { Authorization: 'Bearer ' + room.key } })).json()) as { offers: { id: string; status: string; auction?: unknown; to: string | null }[] }).offers

    // Торг 1: Боря заводит торг из формы — режим, старт, шаг подставлен, «торг закончится не позже …»
    await boryaPhone.goto(roomHref)
    await boryaPhone.click('Предложить пари')
    await boryaPhone.waitText('Как примут')
    await boryaPhone.fill('Условие', 'Наша лодка первой обогнёт буёк')
    await boryaPhone.fill('Как проверяем', 'Фото с финиша у буйка')
    await boryaPhone.click('Торг до …')
    await boryaPhone.waitText('Старт, ₽')
    await boryaPhone.fill('Ваша сумма, ₽', '300')
    await boryaPhone.fill('Старт, ₽', '1000')
    await boryaPhone.waitText('Подставлено 10 % старта')
    const step = await fieldValue(boryaPhone, 'Шаг, ₽')
    if (step !== '100') throw new Error(`Шаг торга не подставлен: «${step}»`)
    await boryaPhone.waitText('Торг закончится не позже')
    await boryaPhone.waitText('Конец торга')
    const form = await boryaPhone.waitIn('.offer-summary', 'соперник — не меньше 1 000 ₽ на „не сбудется“ (старт, кэф 1 к 3,3)')
    if (form.includes('банк')) throw new Error('В сводке торга банк до встречных: ' + form)
    if (await boryaPhone.eval<boolean>(`!!document.querySelector('input[name="offer-to"]')`)) throw new Error('У торга есть выбор адресата')
    await noScroll(boryaPhone, 'Форма торга')
    await boryaPhone.shot('142-torg-forma')
    await boryaPhone.click('Предложить')
    await boryaPhone.waitIn(MODAL, 'Начать торг?')
    await boryaPhone.waitIn(MODAL, 'Лучшее встречное к концу торга примется само')
    await boryaPhone.shot('142a-torg-podtverzhdenie')
    await confirmTwice(boryaPhone, 'Встречные в торге')
    const created = (await serverOffers()).filter((o) => o.auction)
    if (created.length !== 1 || created[0].to !== null) throw new Error('Торг на сервере: ' + JSON.stringify(created))
    const first = created[0].id
    await boryaPhone.waitIn(FACTS, 'Конец торга')
    await boryaPhone.waitIn(FACTS, 'старт — 1 000 ₽, шаг — 100 ₽')
    await boryaPhone.waitIn(BIDDING, 'Встречных пока нет')
    if (!(await visible(boryaPhone)).includes('Отозвать')) throw new Error('Автору торга без встречных нет «Отозвать»')
    await noScroll(boryaPhone, 'Торг без встречных')
    await boryaPhone.shot('143-torg-bez-vstrechnyh')

    // Вера даёт старт из поля: подставлен старт, окно — с кэфом
    await veraPhone.goto(offerHref(first))
    await veraPhone.waitIn(BID_FORM, 'Не меньше старта — 1 000 ₽')
    const suggested = await fieldValue(veraPhone, 'Ваше встречное, ₽')
    if (suggested !== '1000') throw new Error(`Встречное не подставлено: «${suggested}»`)
    await veraPhone.press('Отправить встречное')
    await veraPhone.waitIn(MODAL, 'Вы ставите 1 000 ₽ против 300 ₽ автора (Боря) — кэф 1 к 3,3, банк 1 300 ₽.')
    await confirmTwice(veraPhone, 'лучшее')
    await veraPhone.waitIn(BIDDING, 'Лучшее встречное — Вера (вы): 1 000 ₽')

    // Гена — 4 000 ₽ через сервер: Веру перебили, поле — лучшее + шаг
    await api(server, `${rooms}/offers/${first}/bid`, gena.key, { amount: 400000 })
    await veraPhone.waitIn(BIDDING, 'Вас перебили: лучшее встречное — Гена, 4 000 ₽')
    await veraPhone.waitIn(BID_FORM, 'Не меньше 4 100 ₽: лучшее 4 000 ₽ + шаг 100 ₽')
    await noScroll(veraPhone, 'Торг: вас перебили')
    await veraPhone.shot('144-torg-vas-perebili')

    // Вера — 10 000 ₽: вдвое больше лучшего — второе подтверждение
    await veraPhone.fill('Ваше встречное, ₽', '10000')
    await veraPhone.waitIn(BID_FORM, 'Вы ставите 10 000 ₽ против 300 ₽ автора (Боря) — кэф 1 к 33')
    await veraPhone.click('Отправить встречное')
    await veraPhone.waitIn(MODAL, 'Отправить встречное?')
    await veraPhone.eval(`document.querySelector('.modal .button').click()`)
    await veraPhone.waitIn(MODAL, 'Точно столько?')
    await veraPhone.waitIn(MODAL, '10 000 ₽ — вдвое больше лучшего встречного (4 000 ₽)')
    await veraPhone.shot('145-torg-vdvoe-bolshe')
    await veraPhone.click('Да, отправить встречное')
    await veraPhone.waitIn(BIDDING, 'Лучшее встречное — Вера (вы): 10 000 ₽')

    // Гена — участник: перебили, все встречные; в списке комнаты — значок
    await genaPhone.goto(offerHref(first))
    await genaPhone.waitIn(BIDDING, 'Вас перебили: лучшее встречное — Вера, 10 000 ₽')
    await genaPhone.waitCount('.bid-list .bid', 3)
    await noScroll(genaPhone, 'Торг у участника')
    await genaPhone.shot('146-torg-uchastnik')
    await genaPhone.goto(roomHref)
    await genaPhone.waitIn(LIST, 'вас перебили')
    await genaPhone.waitIn(LIST, 'лучшее встречное — Вера, 10 000 ₽ (кэф 1 к 33)')
    await noScroll(genaPhone, 'Список пари с торгом')
    await genaPhone.shot('147-torg-spisok')

    // Боря — автор: лучшее, «Принять сейчас», «Отозвать» уже нет
    await boryaPhone.goto(offerHref(first))
    await boryaPhone.waitIn(BIDDING, 'Лучшее встречное — Вера: 10 000 ₽ против 300 ₽ автора, кэф 1 к 33.')
    await boryaPhone.press('Принять сейчас')
    await boryaPhone.click('Отмена')
    const acts = await visible(boryaPhone)
    if (acts.includes('Отозвать')) throw new Error('Автору торга со встречными есть «Отозвать»')
    if (await boryaPhone.eval<boolean>(`!!document.querySelector(${JSON.stringify(BID_FORM)})`)) throw new Error('Автору торга есть поле встречного')
    await noScroll(boryaPhone, 'Торг у автора')
    await boryaPhone.shot('148-torg-avtor')
    await boryaPhone.click('Принять сейчас')
    await boryaPhone.waitIn(MODAL, 'Вера ставит 10 000 ₽ против ваших 300 ₽ — кэф 1 к 33, банк 10 300 ₽.')
    await boryaPhone.shot('148a-prinyat-seychas')
    await confirmTwice(boryaPhone, 'Торг закончен (автор принял сейчас) — соперник Вера')
    await boryaPhone.waitIn(FACTS, 'Вера — за „не сбудется“, торг закончен')
    await boryaPhone.waitText('принято — ждём исхода к')
    await noScroll(boryaPhone, 'Торг закончен')
    await boryaPhone.shot('149-torg-zakonchen')

    // Торг 2 — через сервер, без встречных: конец прошёл — «Не состоялось» и «Повторить»
    const closesAt = Date.now() + shift + 11 * MINUTE
    const { offer: lonely } = await api<{ offer: { id: string } }>(server, `${rooms}/offers`, borya.key, {
      condition: 'Ветер к вечеру стихнет',
      check: 'Флюгер на пирсе',
      auction: { start: 50000 },
      amount: 20000,
      closesAt,
      expectedAt: closesAt + HOUR,
    })
    shift += 12 * MINUTE
    await boryaPhone.goto(offerHref(lonely.id))
    await boryaPhone.waitText('Не состоялось — никто не дал старт')
    await boryaPhone.waitText('Встречных не было.')
    await boryaPhone.waitIn('.status', 'не состоялось — никто не дал старт')
    if ((await visible(boryaPhone)).includes('Отозвать')) throw new Error('У несостоявшегося торга есть «Отозвать»')
    await noScroll(boryaPhone, 'Торг не состоялся')
    await boryaPhone.shot('150-torg-ne-sostoyalsya')
    await boryaPhone.click('Повторить')
    await boryaPhone.waitText('Повтор торга, который не состоялся')
    const again = [await fieldValue(boryaPhone, 'Ваша сумма, ₽'), await fieldValue(boryaPhone, 'Старт, ₽'), await fieldValue(boryaPhone, 'Шаг, ₽')]
    if (again.join(' ') !== '200 500 50') throw new Error('«Повторить»: не те суммы — ' + again.join(' '))
    await noScroll(boryaPhone, 'Повторить торг')
    await boryaPhone.shot('151-torg-povtorit')

    // «История»: несостоявшийся торг
    await boryaPhone.goto(`${SITE}#/room/${room.roomId}/history`)
    await boryaPhone.waitIn('section[aria-label="Прошедшее"]', 'Пари · исход: не состоялось — никто не дал старт')
    await noScroll(boryaPhone, '«История» с торгом')
    await boryaPhone.shot('152-torg-istoriya')
  } finally {
    await server.close()
  }
}
