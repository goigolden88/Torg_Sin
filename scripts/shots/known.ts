import { api, confirmTwice, Device, PASSWORD, SITE, type Cdp, type ServerModule, type Size } from './common.ts'

// «Исход уже известен» (#65, Р-27). Комната «Работа»: Аня — ведущая (не ставит — решает она), Боря,
// Вера, Гена. Событие Бори «Вера найдёт работу до декабря», приём — ещё месяц: Боря предлагает «Да»
// досрочно — приём закрыт, ставка Гены — отказ; Гена возражает, Аня решает «ещё не известно» —
// предложение снято. Пари Бори и Веры, «исход к» — через месяц: Боря отмечает раньше срока, Вера —
// так же, исход окончательный сразу; Гене (не сторона) до отметок блока исхода нет
export async function known(cdp: Cdp, size: Size, startServer: ServerModule['startServer']) {
  console.log(`Исход уже известен, ${size.width} px`)
  const HOUR = 60 * 60 * 1000
  const DAY = 24 * HOUR
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0 })
  try {
    const room = await api<{ roomId: string; invite: string; key: string; memberId: string }>(server, '/rooms', '', {
      password: PASSWORD,
      name: 'Работа',
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
    const noScroll = async (device: Device, where: string) => {
      const scroll = await device.eval<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
      if (scroll > 0) throw new Error(`${where} на ${size.width} px: прокрутка вбок ${scroll} px`)
    }
    const OUTCOME = 'section[aria-label="Исход"]'
    // Кнопки исхода не ниже 44 px
    const tall = async (device: Device, where: string) => {
      const low = await device.eval<number>(
        `[...document.querySelectorAll('${OUTCOME} button')].filter((b) => b.offsetParent !== null && b.getBoundingClientRect().height < 44).length`,
      )
      if (low > 0) throw new Error(`${where} на ${size.width} px: кнопок исхода ниже 44 px — ${low}`)
    }
    const check = async (device: Device, where: string) => {
      await noScroll(device, where)
      await tall(device, where)
    }
    // Выбрать вариант в форме исхода (подпись — внутри формы, не в форме ставки)
    const choose = async (device: Device, form: string, title: string) => {
      const done = await device.eval<boolean>(`(() => {
        const label = [...document.querySelectorAll('form[aria-label=${JSON.stringify(form)}] label')].find((l) => l.innerText.trim() === ${JSON.stringify(title)})
        if (!label) return false
        label.click()
        return true
      })()`)
      if (!done) throw new Error(`Нет варианта «${title}» в форме «${form}»`)
    }
    const visibleButtons = (device: Device) =>
      device.eval<string[]>(`[...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null).map((b) => b.innerText.trim())`)

    const closesAt = Date.now() + 30 * DAY
    const { event } = await api<{ event: { id: string } }>(server, `${rooms}/events`, borya.key, {
      condition: 'Вера найдёт работу до декабря',
      check: 'Вера покажет приказ о приёме',
      closesAt,
      expectedAt: closesAt + DAY,
    })
    await api(server, `${rooms}/events/${event.id}/bets`, borya.key, { outcome: '1', amount: 30000 })
    await api(server, `${rooms}/events/${event.id}/bets`, gena.key, { outcome: '2', amount: 20000 })
    const eventHref = `${SITE}#/room/${room.roomId}/event/${event.id}`

    // Автор (Боря): приём идёт — «Исход уже известен»
    const boryaPhone = await open('Боря', borya.key)
    await boryaPhone.goto(eventHref)
    await boryaPhone.waitIn(OUTCOME, 'Стал известен раньше — предложите его сейчас')
    await check(boryaPhone, 'Событие: «Исход уже известен»')
    await boryaPhone.shot('99-iskhod-uzhe-izvesten')
    await boryaPhone.click('Исход уже известен')
    await boryaPhone.waitText('Какой исход наступил')
    await choose(boryaPhone, 'Предложить исход', 'Да')
    await boryaPhone.click('Предложить исход')
    await boryaPhone.waitIn('.modal', 'Приём ставок закроется сейчас — дальше как обычно: сутки на возражение.')
    await boryaPhone.shot('100-dosrochno-podtverzhdenie')
    await confirmTwice(boryaPhone, 'возразить до')
    await boryaPhone.waitText('исход предложен досрочно')
    if ((await visibleButtons(boryaPhone)).includes('Поставить')) throw new Error('После досрочного предложения видна «Поставить»')
    await check(boryaPhone, 'Событие: исход предложен досрочно')
    await boryaPhone.shot('101-dosrochno-predlozhen')

    // Ставка после предложения — отказ сервера
    const late = await api(server, `${rooms}/events/${event.id}/bets`, gena.key, { outcome: '2', amount: 100 }).then(
      () => '',
      (e: unknown) => (e instanceof Error ? e.message : String(e)),
    )
    if (!late.includes('Приём закрыт: исход уже предложен')) throw new Error('Поздняя ставка не отклонена: ' + (late || 'принята'))

    // Гена возражает; ведущая не ставила — решает она: «Ещё не известно»
    await api(server, `${rooms}/events/${event.id}/object`, gena.key, { reason: 'Приказа ещё нет — только собеседование' })
    const host = await open('Аня', room.key)
    await host.goto(eventHref)
    await host.waitText('решает ведущий')
    await host.waitIn('form[aria-label="Решить"]', 'Ещё не известно')
    await choose(host, 'Решить', 'Ещё не известно')
    await host.click('Решить')
    await host.waitIn('.modal', 'Решить: исход ещё не известен?')
    await host.shot('102-eshchyo-ne-izvestno-podtverzhdenie')
    await confirmTwice(host, 'Предложение снято: исход ещё не известен')
    await host.waitIn(OUTCOME, 'Решение ведущего: „Ещё не известно“')
    await check(host, 'Событие: предложение снято')
    await host.shot('103-predlozhenie-snyato')
    // Автору — снова «Предложить исход», ставок по-прежнему нет
    await boryaPhone.waitText('Предложение снято: исход ещё не известен')
    await boryaPhone.waitIn(OUTCOME, 'Предложить исход')
    if ((await visibleButtons(boryaPhone)).includes('Поставить')) throw new Error('После снятия предложения видна «Поставить»')

    // Пари: «исход к» — через месяц
    const offerCloses = Date.now() + DAY
    const { offer } = await api<{ offer: { id: string } }>(server, `${rooms}/offers`, borya.key, {
      condition: 'Вера выйдет на новую работу до Нового года',
      check: 'Фото пропуска в общий чат',
      odds: { a: 1, b: 1 },
      amount: 50000,
      to: vera.memberId,
      closesAt: offerCloses,
      expectedAt: offerCloses + 30 * DAY,
    })
    await api(server, `${rooms}/offers/${offer.id}/accept`, vera.key, {})
    const offerHref = `${SITE}#/room/${room.roomId}/offer/${offer.id}`

    // Гена — не сторона: до «исход к» блока исхода нет
    const genaPhone = await open('Гена', gena.key)
    await genaPhone.goto(offerHref)
    await genaPhone.waitText('принято — ждём исхода к')
    if (await genaPhone.eval<boolean>(`!!document.querySelector('${OUTCOME}')`)) throw new Error('Не стороне до «исход к» виден блок исхода')

    // Боря — сторона: «Исход уже известен?» → отметка раньше срока
    await boryaPhone.goto(offerHref)
    await boryaPhone.waitIn(OUTCOME, 'Стал известен раньше — отметьте его сейчас')
    await check(boryaPhone, 'Пари: «Исход уже известен?»')
    await boryaPhone.shot('104-pari-iskhod-uzhe-izvesten')
    await boryaPhone.press('Исход уже известен?')
    await boryaPhone.waitText('Ждём отметок сторон')
    await boryaPhone.press('Прав автор')
    await boryaPhone.waitIn('.modal', 'Отмечаете раньше срока «исход к»')
    await boryaPhone.waitIn('.modal', 'решит гарант Аня')
    await boryaPhone.shot('105-pari-dosrochnaya-otmetka')
    await confirmTwice(boryaPhone, 'Ваша отметка: прав автор')

    // Вера отмечает так же — окончательно сразу
    const veraPhone = await open('Вера', vera.key)
    await veraPhone.goto(offerHref)
    await veraPhone.waitIn(OUTCOME, 'Боря, автор: прав автор')
    await veraPhone.press('Прав автор')
    await veraPhone.waitIn('.modal', 'Автор уже отметил так же — исход станет окончательным сразу и не обжалуется.')
    await confirmTwice(veraPhone, 'Утверждено согласием сторон, окончательно')
    await check(veraPhone, 'Пари: окончательно до «исход к»')
    await veraPhone.shot('106-pari-dosrochno-okonchatelno')
  } finally {
    await server.close()
  }
}
