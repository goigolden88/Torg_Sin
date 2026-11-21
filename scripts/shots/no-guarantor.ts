import { api, confirmTwice, Device, PASSWORD, SITE, type Cdp, type ServerModule, type Size } from './common.ts'

// Пари без гаранта (#114, Р-36). Свой запасной сервер с подставными часами: «исход к» — сдвигом часов.
// Комната «Сплав»: Аня — ведущая, Боря, Вера, Гена; на устройства — ссылкой для другого устройства.
// Пари 1 — из формы: Боря → Вера «без гаранта»; Вера принимает; отметки совпали — окончательно сразу.
// Пари 2 — через сервер: Боря и Вера отметили по-разному — сразу суд (Аня и Гена); у Гены — «вы в
// суде». Комната «Двое»: «без гаранта» недоступно — судить некому
export async function noGuarantor(cdp: Cdp, size: Size, startServer: ServerModule['startServer']) {
  console.log(`Пари без гаранта, ${size.width} px`)
  const HOUR = 60 * 60 * 1000
  const DAY = 24 * HOUR
  let shift = 0
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0, now: () => Date.now() + shift })
  try {
    const makeRoom = (name: string, hostName: string) =>
      api<{ roomId: string; invite: string; key: string; memberId: string }>(server, '/rooms', '', { password: PASSWORD, name, currency: 'RUB', hostName })
    const room = await makeRoom('Сплав', 'Аня')
    const rooms = `/rooms/${room.roomId}`
    const join = async (r: { roomId: string; invite: string; key: string }, name: string) => {
      const j = await api<{ memberId: string; key: string }>(server, `/rooms/${r.roomId}/join`, '', { invite: r.invite, name })
      await api(server, `/rooms/${r.roomId}/admit`, r.key, { request: j.memberId })
      return j
    }
    const borya = await join(room, 'Боря')
    const vera = await join(room, 'Вера')
    const gena = await join(room, 'Гена')
    const open = async (roomId: string, name: string, key: string) => {
      const { token } = await api<{ token: string }>(server, `/rooms/${roomId}/device`, key, {})
      const device = await Device.open(cdp, size, name)
      await device.goto(`${SITE}#/device/${roomId}/${token}?server=${encodeURIComponent(server.url)}`)
      await device.waitText('Открыть комнату здесь')
      await device.click('Открыть комнату здесь')
      await device.waitText('Участники')
      return device
    }
    const boryaPhone = await open(room.roomId, 'Боря', borya.key)
    const veraPhone = await open(room.roomId, 'Вера', vera.key)
    const genaPhone = await open(room.roomId, 'Гена', gena.key)
    const roomHref = `${SITE}#/room/${room.roomId}`
    const offerHref = (id: string) => `${SITE}#/room/${room.roomId}/offer/${id}`
    const OUTCOME = 'section[aria-label="Исход"]'
    const LIST = 'section[aria-label="Пари"]'
    const FACTS = 'ul[aria-label="Условия пари"]'
    // Выбор в форме по значению: подписи «Боря» и «Вера» есть и у «Кому», и у «Гаранта»
    const pick = (device: Device, name: string, value: string) =>
      device.eval(`document.querySelector('input[name="${name}"][value="${value}"]').click()`)
    const GUARANTOR_ACTS = ['Отказаться', 'Назвать гарантом']
    const visible = (device: Device) =>
      device.eval<string[]>(`[...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null && !b.disabled).map((b) => b.innerText.trim())`)
    const noScroll = async (device: Device, where: string) => {
      const scroll = await device.eval<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
      if (scroll > 0) throw new Error(`${where} на ${size.width} px: прокрутка вбок ${scroll} px`)
    }
    const noGuarantorBlock = async (device: Device, where: string) => {
      const block = await device.eval<boolean>(`!!document.querySelector('[aria-label="Решение гаранта"]')`)
      const acts = (await visible(device)).filter((b) => GUARANTOR_ACTS.includes(b))
      if (block || acts.length > 0) throw new Error(`${where}: у пари без гаранта блок гаранта — ${acts.join(', ')}`)
    }

    // Пари 1: Боря предлагает Вере «без гаранта» из формы — с пояснением и подтверждением
    await boryaPhone.goto(roomHref)
    await boryaPhone.click('Предложить пари')
    await boryaPhone.waitText('Ваша сторона')
    await boryaPhone.fill('Условие', 'Пройдём порог без переворота')
    await boryaPhone.fill('Как проверяем', 'Видео с берега, смотрим вместе')
    await boryaPhone.fill('Ваша сумма, ₽', '500')
    await pick(boryaPhone, 'offer-to', vera.memberId)
    await boryaPhone.waitText('Без гаранта — разойдётесь, решит суд')
    await pick(boryaPhone, 'offer-guarantor', 'none')
    await boryaPhone.waitText('Отметите одинаково — исход окончательный сразу. Разойдётесь или соперник промолчит 3 дня — суд жребием из участников.')
    await noScroll(boryaPhone, 'Форма пари без гаранта')
    await boryaPhone.shot('133-novoe-pari-bez-garanta')
    await boryaPhone.click('Предложить')
    await boryaPhone.waitIn('.modal', 'Кому: Вера · без гаранта: разойдётесь — решит суд')
    await boryaPhone.shot('133a-podtverzhdenie-bez-garanta')
    await confirmTwice(boryaPhone, 'нет — спор решит суд')
    await boryaPhone.waitIn(FACTS, 'Гарант')
    await boryaPhone.waitIn(FACTS, 'нет — спор решит суд')
    await noScroll(boryaPhone, 'Пари без гаранта')
    await boryaPhone.shot('134-pari-bez-garanta')
    const first = (await (await fetch(server.url + rooms, { headers: { Authorization: 'Bearer ' + room.key } })).json()) as { offers: { id: string; guarantorId: string | null }[] }
    if (first.offers.length !== 1 || first.offers[0].guarantorId !== null) throw new Error('Пари без гаранта на сервере: ' + JSON.stringify(first.offers))
    const agree = first.offers[0].id

    // Вера видит в списке «Гарант: нет — спор решит суд» и принимает с подтверждением
    await veraPhone.goto(roomHref)
    await veraPhone.waitIn(LIST, 'Гарант: нет — спор решит суд')
    await veraPhone.goto(offerHref(agree))
    await veraPhone.press('Принять')
    await veraPhone.waitIn('.modal', 'Гаранта нет: отметите одинаково — окончательно сразу, разойдётесь — решит суд.')
    await veraPhone.shot('134a-prinyat-bez-garanta')
    await confirmTwice(veraPhone, 'принято — ждём исхода к')

    // Пари 2 — через сервер: Боря → Вера, без гаранта, «исход к» — через два часа
    const closesAt = Date.now() + shift + HOUR
    const { offer: created } = await api<{ offer: { id: string } }>(server, `${rooms}/offers`, borya.key, {
      condition: 'Дойдём до стоянки к шести вечера',
      check: 'Время по телефону Бори у костра',
      odds: { a: 1, b: 1 },
      amount: 30000,
      to: vera.memberId,
      noGuarantor: true,
      closesAt,
      expectedAt: closesAt + HOUR,
    })
    const split = created.id
    await api(server, `${rooms}/offers/${split}/accept`, vera.key, {})
    shift += 3 * DAY // «исход к» настал у обоих, срок молчания — ещё нет

    // Пари 1: Боря отмечает — в окне, что будет без гаранта; блока гаранта нет
    await boryaPhone.goto(offerHref(agree))
    await boryaPhone.waitIn(OUTCOME, 'Ждём отметок сторон')
    await boryaPhone.waitIn(OUTCOME, 'Разойдутся — суд соберётся сразу; одна сторона промолчит до')
    await boryaPhone.press('Прав автор')
    await boryaPhone.waitIn('.modal', 'Если соперник отметит так же, исход окончательный сразу и не обжалуется. Отметит иначе — сразу суд; промолчит до')
    await confirmTwice(boryaPhone, 'Ваша отметка: прав автор. Поменять можно, пока не собрался суд.')
    await noGuarantorBlock(boryaPhone, 'Пари 1: отметки')
    await noScroll(boryaPhone, 'Пари без гаранта: отметки')
    await boryaPhone.shot('135-otmetki-bez-garanta')

    // Вера отмечает так же — окончательно сразу
    await veraPhone.goto(offerHref(agree))
    await veraPhone.waitIn(OUTCOME, 'Боря, автор: прав автор')
    await veraPhone.press('Прав автор')
    await veraPhone.waitIn('.modal', 'Автор уже отметил так же — исход станет окончательным сразу и не обжалуется.')
    await confirmTwice(veraPhone, 'Утверждено согласием сторон, окончательно')
    await veraPhone.waitIn('section[aria-label="Итог пари"]', 'Вера (вы) — −500 ₽')
    await veraPhone.shot('136-bez-garanta-okonchatelno')

    // Пари 2: Боря — «прав автор», Вера — «прав соперник»: гаранта нет — сразу суд
    await api(server, `${rooms}/offers/${split}/mark`, borya.key, { winner: 'author' })
    await veraPhone.goto(offerHref(split))
    await veraPhone.waitIn(OUTCOME, 'Боря, автор: прав автор')
    await veraPhone.press('Прав соперник')
    await veraPhone.waitIn('.modal', 'Автор отметил иначе — гаранта нет, решит суд жребием из участников')
    await veraPhone.shot('137-razoshlis-podtverzhdenie')
    await confirmTwice(veraPhone, 'Ждёт суда')
    await veraPhone.waitIn(OUTCOME, 'Гаранта нет, стороны разошлись — решает суд')
    await veraPhone.waitIn('section[aria-label="Суд"]', 'Стороны разошлись — решает суд, собран')
    await noGuarantorBlock(veraPhone, 'Пари 2: суд')
    if ((await visible(veraPhone)).some((b) => b === 'Прав автор' || b === 'Прав соперник')) throw new Error('В суде у стороны кнопки отметки')
    await noScroll(veraPhone, 'Пари без гаранта: суд')
    await veraPhone.shot('138-bez-garanta-sud')

    // Гена — в суде: в списке «вы в суде» и почему суд, на пари — голос
    await genaPhone.goto(roomHref)
    await genaPhone.waitIn(LIST, 'ждёт суда — стороны разошлись')
    await genaPhone.waitIn(LIST, 'вы в суде')
    await noScroll(genaPhone, 'Список пари: суд без гаранта')
    await genaPhone.shot('139-spisok-vy-v-sude')
    await genaPhone.goto(offerHref(split))
    await genaPhone.waitIn('section[aria-label="Суд"]', 'Вы в суде')
    await genaPhone.shot('140-bez-garanta-golos')

    // Комната из двоих: «без гаранта» не выбрать — судить некому, объяснение под выбором
    const small = await makeRoom('Двое', 'Лёша')
    await join(small, 'Маша')
    const lyosha = await open(small.roomId, 'Лёша', small.key)
    await lyosha.goto(`${SITE}#/room/${small.roomId}/offer/new`)
    await lyosha.waitText('«Без гаранта» недоступно: судить некому.')
    const disabled = await lyosha.eval<boolean>(`document.querySelector('input[name="offer-guarantor"][value="none"]').disabled`)
    if (!disabled) throw new Error('В комнате из двоих «без гаранта» доступно')
    await noScroll(lyosha, 'Форма пари: без гаранта недоступно')
    await lyosha.shot('141-bez-garanta-nedostupno')
  } finally {
    await server.close()
  }
}
