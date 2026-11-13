import { api, confirmBet, confirmTwice, Device, PASSWORD, SITE, type Cdp, type ServerModule, type Size } from './common.ts'

// Предмет спора (#64, Р-26). Комната «Работа и спорт»: Аня — ведущая, Боря, Вера. Событие «Аня найдёт
// работу до декабря» о ней: Ане — только «Да», ставит — у всех пометка; событие о ней со своими
// исходами — Аня не ставит. Пари: «О ком спор» в форме — предмет Боря сам, сторона только «сбудется»;
// пари о Ане, автор за «сбудется», — Ане «Принять» нет
export async function subjects(cdp: Cdp, size: Size, startServer: ServerModule['startServer']) {
  console.log(`Предмет спора, ${size.width} px`)
  const HOUR = 60 * 60 * 1000
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0 })
  try {
    const room = await api<{ roomId: string; invite: string; key: string; memberId: string }>(server, '/rooms', '', {
      password: PASSWORD,
      name: 'Работа и спорт',
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
    const text = (device: Device, selector: string) =>
      device.eval<string>(`(document.querySelector(${JSON.stringify(selector)})?.innerText ?? '').replace(/\\u00a0/g, ' ')`)
    const closesAt = Date.now() + 24 * HOUR
    const job = await api<{ event: { id: string } }>(server, `${rooms}/events`, borya.key, {
      condition: 'Аня найдёт работу до декабря',
      check: 'Аня покажет приказ о приёме',
      closesAt,
      expectedAt: closesAt + 30 * 24 * HOUR,
      subject: room.memberId,
    })
    await api(server, `${rooms}/events/${job.event.id}/bets`, vera.key, { outcome: '2', amount: 50000 })
    const pullups = await api<{ event: { id: string } }>(server, `${rooms}/events`, borya.key, {
      condition: 'Сколько раз Аня подтянется в субботу',
      check: 'Видео в общий чат',
      outcomes: ['меньше 10', '10–20', 'больше 20'],
      closesAt,
      expectedAt: closesAt + 48 * HOUR,
      subject: room.memberId,
    })
    const eventHref = (id: string) => `${SITE}#/room/${room.roomId}/event/${id}`
    const offerHref = (id: string) => `${SITE}#/room/${room.roomId}/offer/${id}`

    // Аня — предмет спора: в форме ставки только «Да», с подсказкой; ставит 300 ₽
    const anya = await open('Аня', room.key)
    await anya.goto(eventHref(job.event.id))
    await anya.waitText('Вы — предмет спора: ставить можно только на „Да“')
    const form = await text(anya, 'form[aria-label="Ставка"]')
    if (form.includes('Нет')) throw new Error('Предмету спора в форме ставки виден «Нет»: ' + form)
    await noScroll(anya, 'Событие о себе')
    await anya.shot('91-predmet-stavka-tolko-da')
    await anya.fill('Сумма, ₽', '300')
    await anya.click('Поставить')
    await anya.waitIn('.modal', 'Поставить 300 ₽ на „Да“?')
    await confirmBet(anya)
    await anya.waitIn('.subject-flag', '⚑ Аня (вы) — предмет спора — сам ставит: 300 ₽ на „Да“')

    // Событие о ней со своими исходами — формы ставки нет
    await anya.goto(eventHref(pullups.event.id))
    await anya.waitText('Вы — предмет спора: в событии со своими исходами вы не ставите.')
    if (await anya.eval<boolean>(`!!document.querySelector('form[aria-label="Ставка"]')`)) throw new Error('Предмету спора в событии со своими исходами видна форма ставки')
    await anya.shot('92-predmet-svoi-ishody')

    // Боря видит пометку у события — на экране события и в списке
    const boryaPhone = await open('Боря', borya.key)
    await boryaPhone.goto(eventHref(job.event.id))
    await boryaPhone.waitIn('.subject-flag', '⚑ Аня — предмет спора — сам ставит: 300 ₽ на „Да“')
    await noScroll(boryaPhone, 'Событие с пометкой')
    await boryaPhone.shot('93-pometka-sobytie')

    // «Предложить пари»: о ком спор — Боря сам; сторона — только «сбудется»
    await boryaPhone.goto(`${SITE}#/room/${room.roomId}/offer/new`)
    await boryaPhone.waitText('О ком спор')
    await boryaPhone.fill('Условие', 'Боря пробежит полумарафон до весны')
    await boryaPhone.fill('Как проверяем', 'Скрин из приложения с забегом')
    await boryaPhone.fill('Ваша сумма, ₽', '500')
    await boryaPhone.eval(`document.querySelector('input[name="offer-subject"][value="${borya.memberId}"]').click()`)
    await boryaPhone.waitText('Спор о вас: предмет спора — только на стороне «сбудется».')
    const sides = await text(boryaPhone, 'form')
    if (sides.includes('Не сбудется')) throw new Error('Предмету спора в форме пари видно «Не сбудется»')
    await noScroll(boryaPhone, 'Форма пари с «О ком спор»')
    await boryaPhone.shot('94-o-kom-spor-forma')
    await boryaPhone.click('Предложить')
    await boryaPhone.waitIn('.modal', 'о ком спор — Боря')
    await confirmTwice(boryaPhone, 'открыто — приём до')
    await boryaPhone.waitIn('.subject-flag', '⚑ Боря (вы) — предмет спора — сам на стороне „сбудется“')
    await boryaPhone.waitText('только на стороне „сбудется“')
    await noScroll(boryaPhone, 'Пари с пометкой')
    await boryaPhone.shot('95-pometka-pari')

    // Пари о Ане, автор (Вера) — за «сбудется»: Ане «Принять» нет
    const aboutAnya = await api<{ offer: { id: string } }>(server, `${rooms}/offers`, vera.key, {
      condition: 'Аня выучит испанский до лета',
      check: 'Поговорит с Верой пять минут без словаря',
      odds: { a: 1, b: 1 },
      amount: 20000,
      closesAt,
      expectedAt: closesAt + 90 * 24 * HOUR,
      guarantor: borya.memberId,
      subject: room.memberId,
    })
    await anya.goto(offerHref(aboutAnya.offer.id))
    await anya.waitText('Вы — предмет спора: принять можно, только если автор — за «не сбудется».')
    const visible = await anya.eval<string[]>(`[...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null).map((b) => b.innerText.trim())`)
    if (visible.includes('Принять') || visible.includes('Встречное')) throw new Error('Предмету спора видны «Принять» или «Встречное»: ' + visible.join(', '))
    await anya.shot('96-predmet-ne-prinimaet')

    // Пари о Ане: Вера за «сбудется», Боря принял, гарант Гена отказался — Ани среди кандидатов нет
    const gena = await join('Гена')
    const aboutAnya2 = await api<{ offer: { id: string } }>(server, `${rooms}/offers`, vera.key, {
      condition: 'Аня пробежит 10 км быстрее часа',
      check: 'Трек из приложения',
      odds: { a: 1, b: 1 },
      amount: 10000,
      closesAt,
      expectedAt: closesAt + 30 * 24 * HOUR,
      guarantor: gena.memberId,
      subject: room.memberId,
    })
    await api(server, `${rooms}/offers/${aboutAnya2.offer.id}/accept`, borya.key, {})
    await api(server, `${rooms}/offers/${aboutAnya2.offer.id}/decline`, gena.key, {})
    await boryaPhone.goto(offerHref(aboutAnya2.offer.id))
    await boryaPhone.waitText('Назовите нового гаранта')
    const nominees = await boryaPhone.eval<string[]>(`[...document.querySelectorAll('input[name="offer-nominee"]')].map((i) => i.value)`)
    if (nominees.includes(room.memberId)) throw new Error('Предмет спора — среди кандидатов в новые гаранты')
    if (!nominees.includes(gena.memberId)) throw new Error('Нет кандидата Гены в новые гаранты: ' + nominees.join(', '))
    await noScroll(boryaPhone, 'Новый гарант в пари о ком-то')
    await boryaPhone.shot('98-predmet-ne-novyi-garant')

    // Комната у Бори: пометки в списках событий и пари
    await boryaPhone.goto(`${SITE}#/room/${room.roomId}`)
    await boryaPhone.waitIn('section[aria-label="События"]', '⚑ Аня — предмет спора — сам ставит: 300 ₽ на „Да“')
    await boryaPhone.waitIn('section[aria-label="Пари"]', '⚑ Боря (вы) — предмет спора — сам на стороне „сбудется“')
    await noScroll(boryaPhone, 'Комната с пометками')
    await boryaPhone.shot('97-pometki-v-spiskah')
  } finally {
    await server.close()
  }
}
