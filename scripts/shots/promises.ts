import { api, chatCall, confirmTwice, Device, PASSWORD, SITE, type Cdp, type ServerModule, type Size } from './common.ts'

// Пари «на обещание» (Р-44, #153). Свой запасной сервер с подставными часами: «исход к» — сдвигом часов.
// Комната «Шашлыки на даче»: Аня — ведущая, Боря, Вера (выдуманные). «До» — те же экраны на сумму: форма
// с «Сумма», пари на сумму, «Расчёт» без обещаний. «После»: Аня выбирает «Обещание» («Если проиграю, я…» и
// «Если проиграет он…» — по умолчанию то же), кэфа, суммы и «Как примут» нет → окно → пари «на обещание:
// … / …» и «Позвать в чат» → у Бори в списке комнаты → встречное (панель обещаний) → «Принять» с его
// обещанием → обе стороны отметили «прав автор» — окончательно: Боря проиграл → «Расчёт» Бори: «Вы
// обещали» с «Исполнил» → «Расчёт» Ани: «Вам обещали» с «Получил» / «Не получил» → «Получил» → «История»
export async function promises(cdp: Cdp, size: Size, startServer: ServerModule['startServer']) {
  console.log(`Пари на обещание, ${size.width} px`)
  const HOUR = 60 * 60 * 1000
  let shift = 0
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0, now: () => Date.now() + shift })
  try {
    const room = await api<{ roomId: string; invite: string; key: string; memberId: string }>(server, '/rooms', '', {
      password: PASSWORD,
      name: 'Шашлыки на даче',
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
      const device = await Device.open(cdp, size, name, { clipboard: true })
      await device.goto(`${SITE}#/device/${room.roomId}/${token}?server=${encodeURIComponent(server.url)}`)
      await device.waitText('Открыть комнату здесь')
      await device.press('Открыть комнату здесь')
      await device.waitText('Участники')
      return device
    }
    const host = await open('Аня', room.key)
    const boryaPhone = await open('Боря', borya.key)
    const roomHref = `${SITE}#/room/${room.roomId}`
    const offerHref = (id: string) => `${roomHref}/offer/${id}`
    const settleHref = `${roomHref}/settle`
    const MAIN = '.detail'
    const LIST = 'section[aria-label="Пари"]'
    const CONDITION = 'Доедем до озера за два часа'
    // Выбор в форме по номеру участника: подписи «Боря» и «Вера» есть и у «Кому», и у «Гаранта»
    const pick = (device: Device, name: string, value: string) =>
      device.eval(`document.querySelector('input[name="${name}"][value="${value}"]').click()`)
    const noScroll = async (device: Device, where: string) => {
      const scroll = await device.eval<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
      if (scroll > 0) throw new Error(`${where} на ${size.width} px: прокрутка вбок ${scroll} px`)
    }
    // Кнопки и поля не ниже 44 px (Р-10)
    const tall = async (device: Device, where: string) => {
      const low = await device.eval<string[]>(
        `[...document.querySelectorAll('.detail button, .detail .input, .modal button')].filter((b) => b.offsetParent !== null && b.getBoundingClientRect().height < 44).map((b) => b.innerText || b.tagName)`,
      )
      if (low.length > 0) throw new Error(`${where} на ${size.width} px: ниже 44 px — ${low.join(', ')}`)
    }
    const check = async (device: Device, where: string) => {
      await noScroll(device, where)
      await tall(device, where)
    }
    const visible = (device: Device, text: string) =>
      device.eval<boolean>(`[...document.querySelectorAll('.detail legend, .detail label > span')].some((el) => el.offsetParent !== null && el.textContent.trim().startsWith(${JSON.stringify(text)}))`)

    // «До»: пари на сумму Ани — Вере, как было
    const closesAt = Date.now() + 24 * HOUR
    const { offer: money } = await api<{ offer: { id: string } }>(server, `${rooms}/offers`, room.key, {
      condition: 'Шашлык будет готов к семи',
      check: 'Часы у мангала',
      odds: { a: 1, b: 1 },
      amount: 30000,
      to: vera.memberId,
      closesAt,
      expectedAt: closesAt + HOUR,
      guarantor: borya.memberId,
    })
    await host.goto(offerHref(money.id))
    await host.waitIn(MAIN, 'вы ставите 300 ₽ на „сбудется“, соперник — 300 ₽ (кэф 1 к 1), банк 600 ₽')
    await host.shot('210-pari-na-summu-do')

    // Форма: «На кону — Сумма» (как было) → «Обещание»: кэфа, суммы и «Как примут» нет
    await host.goto(roomHref)
    await host.press('Предложить пари')
    await host.waitText('На кону')
    await host.waitText('Ваша сумма, ₽')
    await host.shot('211-forma-summa-do')
    await host.press('Обещание')
    await host.waitText('Если проиграю, я…')
    for (const gone of ['Кэф «a к b»', 'Ваша сумма', 'Как примут'])
      if (await visible(host, gone)) throw new Error(`Форма на обещание: видно «${gone}»`)
    if (await host.eval<boolean>(`document.body.innerText.includes('Торг до …')`)) throw new Error('Форма на обещание: видно «Торг до …»')
    await host.fill('Условие', CONDITION)
    await host.fill('Как проверяем', 'Время по навигатору')
    await host.fill('Если проиграю, я…', 'мою машину')
    // «Если проиграет он…» по умолчанию — то же
    const same = await host.eval<string>(`[...document.querySelectorAll('label')].find((l) => l.querySelector('span')?.textContent.trim() === 'Если проиграет он…').querySelector('textarea').value`)
    if (same !== 'мою машину') throw new Error('«Если проиграет он…» по умолчанию — ' + same)
    await host.fill('Если проиграет он…', 'везёт шашлык')
    await pick(host, 'offer-to', borya.memberId)
    await pick(host, 'offer-guarantor', vera.memberId)
    await host.waitIn('.offer-summary', 'Проиграете — вы: мою машину. Проиграет соперник — он: везёт шашлык. Денег на кону нет')
    await check(host, 'Форма на обещание')
    await host.shot('212-forma-obeshchanie')
    await host.press('Предложить')
    await host.waitIn('.modal', 'Предложить пари?')
    await host.waitIn('.modal', 'Проиграете — вы: мою машину. Проиграет соперник — он: везёт шашлык.')
    await host.waitIn('.modal', 'Кому: Боря · гарант — Вера')
    await host.shot('213-okno-obeshchanie')
    await confirmTwice(host, 'открыто — приём до')

    // Пари: «На кону — на обещание: … / …», «Если проиграет»; «Позвать в чат» — текст про обещания
    await host.waitIn(MAIN, 'на обещание: мою машину / везёт шашлык')
    await host.waitIn(MAIN, 'Аня (вы) — мою машину; соперник — везёт шашлык')
    const id = await host.eval<string>(`location.hash.split('/').pop()`)
    await chatCall(
      host,
      `Аня предлагает пари на обещание: „${CONDITION}“ — проиграет Аня: мою машину; проиграет соперник: везёт шашлык. Принять или встречное: ${offerHref(id)}`,
    )
    await check(host, 'Пари на обещание')
    await host.shot('214-pari-obeshchanie')

    // Боря: в списке комнаты — вместо суммы обещания
    await boryaPhone.goto(roomHref)
    await boryaPhone.waitIn(LIST, 'на обещание: мою машину / везёт шашлык')
    await noScroll(boryaPhone, 'Комната с пари на обещание')
    await boryaPhone.shot('215-spisok-obeshchanie')

    // Встречное — свои обещания (сначала — те же со своей стороны)
    await boryaPhone.goto(offerHref(id))
    await boryaPhone.press('Встречное')
    await boryaPhone.waitText('Если проиграет Аня…')
    await boryaPhone.waitIn('form[aria-label="Встречное"]', 'Проиграете — вы: везёт шашлык. Проиграет соперник — он: мою машину.')
    await check(boryaPhone, 'Встречное на обещание')
    await boryaPhone.shot('216-vstrechnoe-obeshchanie')
    await boryaPhone.press('Закрыть')

    // «Принять» — с подтверждением своего обещания
    await boryaPhone.press('Принять')
    await boryaPhone.waitIn('.modal', 'Принять пари и обещать: «везёт шашлык»?')
    await boryaPhone.waitIn('.modal', 'Проиграете — вы: везёт шашлык. Проиграет Аня — мою машину. Денег на кону нет.')
    await tall(boryaPhone, 'Окно «Принять»')
    await boryaPhone.shot('217-okno-prinyat-obeshchanie')
    await confirmTwice(boryaPhone, 'принято — ждём исхода к')

    // «Расчёт» до исхода — обещаний нет, блока нет
    await host.goto(settleHref)
    await host.waitIn(MAIN, 'Пока считать нечего')
    if (await host.eval<boolean>(`document.querySelector('[aria-label="Обещания"]') !== null`)) throw new Error('«Расчёт» до исхода: блок «Обещания»')
    await host.shot('218-raschyot-do')

    // Исход: «исход к» формы — до двух суток вперёд; обе стороны — «прав автор», окончательно сразу; Боря проиграл
    shift += 50 * HOUR
    await api(server, `${rooms}/offers/${id}/mark`, room.key, { winner: 'author' })
    await api(server, `${rooms}/offers/${id}/mark`, borya.key, { winner: 'author' })

    // «Расчёт» Бори: «Вы обещали — Аня: везёт шашлык» с «Исполнил»
    await boryaPhone.goto(settleHref)
    await boryaPhone.waitIn('[aria-label="Обещания"]', 'Вы обещали:')
    await boryaPhone.waitIn('[aria-label="Обещания"]', 'Аня: везёт шашлык')
    await boryaPhone.waitIn('[aria-label="Обещания"]', 'ждёт исполнения')
    await boryaPhone.waitIn(MAIN, 'Пока считать нечего') // суммы не поменялись: денег у пари на обещание нет
    await check(boryaPhone, '«Расчёт»: вы обещали')
    await boryaPhone.shot('219-raschyot-vy-obeshchali')
    await boryaPhone.press('Исполнил')
    await boryaPhone.waitIn('.modal', 'Вы исполнили обещание?')
    await confirmTwice(boryaPhone, '«Исполнил» — ждёт ответа')

    // «Расчёт» Ани: «Вам обещали — Боря: везёт шашлык», «Получил» / «Не получил»
    await host.goto(settleHref)
    await host.waitIn('[aria-label="Обещания"]', 'Вам обещали:')
    await host.waitIn('[aria-label="Обещания"]', 'Боря: везёт шашлык')
    await host.waitIn('[aria-label="Обещания"]', 'Не получил')
    await check(host, '«Расчёт»: вам обещали')
    await host.shot('220-raschyot-vam-obeshchali')
    await host.press('Получил')
    await host.waitIn('.modal', 'Вы получили обещанное?')
    await confirmTwice(host, 'Боря: везёт шашлык')
    await host.waitCount('.modal', 0) // в окне тоже есть «получено» — ждём, пока закроется
    await host.waitIn('[aria-label="Обещания"]', 'получено')
    await host.waitIn(MAIN, 'Пока считать нечего')

    // «История»: строка с итогом и исполнением
    await host.goto(`${roomHref}/history`)
    await host.waitIn(MAIN, 'Сбылось. Боря проиграл(а): везёт шашлык — получено')
    await host.waitIn(MAIN, 'выиграли — обещание вам')
    await noScroll(host, '«История» с пари на обещание')
    await host.shot('221-istoriya-obeshchanie')
  } finally {
    await server.close()
  }
}
