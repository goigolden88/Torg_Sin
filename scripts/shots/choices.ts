import { api, confirmTwice, Device, PASSWORD, SITE, type Cdp, type ServerModule, type Size } from './common.ts'

// «Выбор» (#123, Р-39). Свой запасной сервер с подставными часами: фазы — сдвигом часов. Комната «Дача»:
// Аня — ведущая, Боря, Вера, Гена (выдуманные); на устройства Ани, Веры и Гены — ссылкой для другого
// устройства. Выбор 1 «Куда едем на майские?» — из формы у Ани: варианты Ладога и Карелия, получатель —
// ведущая (по умолчанию); Вера в фазе вариантов добавляет Выборг. Фаза вкладов — сдвигом часов: Вера 500 ₽
// в Ладогу (из формы), Гена 300 ₽ в Ладогу и Боря 400 ₽ в Карелию — через сервер. Конец — победила Ладога:
// Вера и Гена должны Ане, Боря не платит. Выбор 2 «Что заказываем?» — через сервер у Бори: Вера и Гена
// вкладывают поровну — ничья, продления, жребий сервера. «Расчёт» — долги по выбору, «История» — итоги
export async function choices(cdp: Cdp, size: Size, startServer: ServerModule['startServer']) {
  console.log(`Выбор, ${size.width} px`)
  const MINUTE = 60 * 1000
  let shift = 0
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0, now: () => Date.now() + shift })
  try {
    const room = await api<{ roomId: string; invite: string; key: string; memberId: string }>(server, '/rooms', '', {
      password: PASSWORD,
      name: 'Дача',
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
      await device.press('Открыть комнату здесь')
      await device.waitText('Участники')
      return device
    }
    const anyaPhone = await open('Аня', room.key)
    const veraPhone = await open('Вера', vera.key)
    const roomHref = `${SITE}#/room/${room.roomId}`
    const choiceHref = (id: string) => `${SITE}#/room/${room.roomId}/choice/${id}`
    const LIST = 'section[aria-label="Выбор"]'
    const OPTIONS = 'section[aria-label="Варианты"]'
    const RESULT = 'section[aria-label="Итог выбора"]'
    const HOW = '.offer-summary[aria-label="Как это работает"]'
    const STAKE_FORM = 'form[aria-label="Ваш вклад"]'
    const OPTION_FORM = 'form[aria-label="Добавить вариант"]'
    const MODAL = '.modal'
    const visible = (device: Device) =>
      device.eval<string[]>(`[...document.querySelectorAll('button, a.button')].filter((b) => b.offsetParent !== null && !b.disabled).map((b) => b.innerText.trim())`)
    const has = (device: Device, selector: string) => device.eval<boolean>(`!!document.querySelector(${JSON.stringify(selector)})`)
    const noScroll = async (device: Device, where: string) => {
      const scroll = await device.eval<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
      if (scroll > 0) throw new Error(`${where} на ${size.width} px: прокрутка вбок ${scroll} px`)
    }
    const serverChoices = async () =>
      ((await (await fetch(server.url + rooms, { headers: { Authorization: 'Bearer ' + room.key } })).json()) as {
        choices?: { id: string; question: string; status: string; how: string | null; options: { id: string; title: string }[] }[]
      }).choices ?? []
    // Поле datetime-local — местное время, до минуты (часы сценария и Chrome — одни)
    const localInput = (ms: number) => {
      const d = new Date(ms)
      const p = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
    }
    const minuteUp = (ms: number) => Math.ceil(ms / MINUTE) * MINUTE

    // Пусто: блок «Выбор» под «Лотами» с кнопкой
    await anyaPhone.goto(roomHref)
    await anyaPhone.waitIn(LIST, 'Выборов пока нет')

    // Выбор 1 — из формы: вопрос, два варианта, получатель — ведущая, сроки; «как это работает»
    await anyaPhone.press('Начать выбор')
    await anyaPhone.waitText('Новый выбор')
    await anyaPhone.fill('Вопрос', 'Куда едем на майские?')
    await anyaPhone.fill('Вариант 1', 'Ладога')
    await anyaPhone.fill('Вариант 2', 'Карелия')
    await anyaPhone.fill('Варианты до', localInput(minuteUp(Date.now() + 15 * MINUTE)))
    await anyaPhone.fill('Вклады до', localInput(minuteUp(Date.now() + 40 * MINUTE)))
    await anyaPhone.waitText('Вклады закончатся не позже')
    await anyaPhone.waitIn(HOW, 'Побеждает вариант с большей суммой')
    await anyaPhone.waitIn(HOW, 'Платят только вложившиеся в победивший вариант — получателю (Аня).')
    await anyaPhone.waitIn(HOW, 'Проигравшие не платят')
    await noScroll(anyaPhone, '«Новый выбор»')
    await anyaPhone.shot('170-vybor-novyi')
    await anyaPhone.press('Начать')
    await anyaPhone.waitIn(MODAL, 'Начать выбор?')
    await anyaPhone.waitIn(MODAL, 'Варианты: „Ладога“, „Карелия“.')
    await confirmTwice(anyaPhone, 'Добавить вариант')
    const created = await serverChoices()
    if (created.length !== 1) throw new Error('Выбор на сервере: ' + JSON.stringify(created))
    const trip = created[0].id

    // Фаза вариантов: Вера добавляет Выборг; вкладывать ещё нельзя
    await veraPhone.goto(choiceHref(trip))
    await veraPhone.waitIn('.event-main', 'варианты до')
    if (await has(veraPhone, STAKE_FORM)) throw new Error('В фазе вариантов есть «Ваш вклад»')
    await veraPhone.waitIn(OPTION_FORM, 'Ваш вариант')
    await veraPhone.fill('Ваш вариант', 'Выборг')
    await veraPhone.press('Добавить вариант')
    await veraPhone.waitIn(MODAL, 'Добавить вариант?')
    await veraPhone.waitIn(MODAL, 'Вариант не удалить')
    await confirmTwice(veraPhone, 'предложил(а) Вера (вы)')
    await veraPhone.waitIn(OPTIONS, '„Выборг“')
    await noScroll(veraPhone, 'Выбор: фаза вариантов')
    await veraPhone.shot('171-vybor-varianty')

    // Комната: идущий выбор
    await veraPhone.goto(roomHref)
    await veraPhone.waitIn(LIST, 'Предлагают варианты')
    await veraPhone.waitIn(LIST, 'Куда едем на майские?')
    await veraPhone.waitIn(LIST, '3 варианта')
    await noScroll(veraPhone, 'Комната с выбором')
    await veraPhone.shot('172-komnata-vybor')

    // Фаза вкладов — сдвигом часов: Вера вкладывает из формы с основанием
    shift += 17 * MINUTE
    await veraPhone.goto(choiceHref(trip))
    await veraPhone.waitIn(STAKE_FORM, 'Вкладывают только в один вариант')
    if (await has(veraPhone, OPTION_FORM)) throw new Error('В фазе вкладов есть «Добавить вариант»')
    await veraPhone.press('„Ладога“')
    await veraPhone.fill('Вклад, ₽', '500')
    await veraPhone.waitIn(STAKE_FORM, 'Вы вкладываете 500 ₽ в „Ладога“ — если он победит, заплатите получателю — Аня — 500 ₽')
    await veraPhone.press('Вложить')
    await veraPhone.waitIn(MODAL, 'Вложить?')
    await veraPhone.waitIn(MODAL, 'Вклад не отзывается')
    await confirmTwice(veraPhone, 'Докладывать — только в свой вариант')
    await veraPhone.waitIn(STAKE_FORM, 'Введите сумму вклада.') // свой вариант уже выбран — нужна только сумма
    await api(server, `${rooms}/choices/${trip}/stake`, gena.key, { option: '1', amount: 30000 })
    await api(server, `${rooms}/choices/${trip}/stake`, borya.key, { option: '2', amount: 40000 })
    await veraPhone.waitIn(OPTIONS, 'вклады: Вера (вы) — 500 ₽, Гена — 300 ₽')
    await veraPhone.waitIn(OPTIONS, 'вклады: Боря — 400 ₽')
    await veraPhone.waitIn('.event-main', 'вклады до')
    await noScroll(veraPhone, 'Выбор: фаза вкладов')
    await veraPhone.shot('173-vybor-vklady')

    // Итог: победила Ладога, долги получателю — у Ани
    shift += 45 * MINUTE
    await anyaPhone.goto(choiceHref(trip))
    await anyaPhone.waitIn(RESULT, 'Победил „Ладога“ — 800 ₽')
    await anyaPhone.waitIn(RESULT, 'Вера → Аня (вы): 500 ₽')
    await anyaPhone.waitIn(RESULT, 'Гена → Аня (вы): 300 ₽')
    const result = await anyaPhone.waitIn(RESULT, 'Вложившиеся в другие варианты не платят')
    if (result.includes('Боря →')) throw new Error('Проигравший платит: ' + result)
    const acts = await visible(anyaPhone)
    if (acts.includes('Вложить') || acts.includes('Добавить вариант')) throw new Error('После итога есть действия: ' + acts.join(', '))
    await noScroll(anyaPhone, 'Выбор: итог')
    await anyaPhone.shot('174-vybor-itog')

    // Выбор 2 — ничья: поровну, продления до +30 минут, жребий сервера
    const now = () => Date.now() + shift
    const { choice: food } = await api<{ choice: { id: string } }>(server, `${rooms}/choices`, borya.key, {
      question: 'Что заказываем?',
      options: ['Пицца', 'Суши'],
      optionsUntil: now() + 11 * MINUTE,
      closesAt: now() + 22 * MINUTE,
    })
    shift += 12 * MINUTE
    await api(server, `${rooms}/choices/${food.id}/stake`, vera.key, { option: '1', amount: 20000 })
    await api(server, `${rooms}/choices/${food.id}/stake`, gena.key, { option: '2', amount: 20000 })
    shift += 45 * MINUTE
    await veraPhone.goto(choiceHref(food.id))
    await veraPhone.waitIn(RESULT, 'ничья, решил жребий')
    await veraPhone.waitIn(RESULT, 'решил жребий сервера')
    await noScroll(veraPhone, 'Выбор: ничья и жребий')
    await veraPhone.shot('175-vybor-zhrebiy')

    // «Расчёт»: долг по выбору с основанием
    await veraPhone.goto(`${SITE}#/room/${room.roomId}/settle`)
    await veraPhone.waitIn('section[aria-label="Долги по выборам"]', 'Вера (вы) → Аня: 500 ₽ — выбор „Куда едем на майские?“')
    await veraPhone.waitText('по 1 выбору')
    await noScroll(veraPhone, '«Расчёт» с выбором')
    await veraPhone.shot('176-vybor-raschet')

    // «История»: оба выбора — итогом
    await anyaPhone.goto(`${SITE}#/room/${room.roomId}/history`)
    await anyaPhone.waitIn('section[aria-label="Прошедшее"]', 'Выбор · исход: „Ладога“ — 800 ₽')
    await anyaPhone.waitIn('section[aria-label="Прошедшее"]', 'ничья, решил жребий')
    await anyaPhone.waitIn('section[aria-label="Прошедшее"]', '+800 ₽')
    await noScroll(anyaPhone, '«История» с выбором')
    await anyaPhone.shot('177-vybor-istoriya')

    const final = await serverChoices()
    const of = (id: string) => final.find((c) => c.id === id)
    if (of(trip)?.status !== 'decided' || of(food.id)?.status !== 'decided' || of(food.id)?.how !== 'draw') {
      throw new Error('Выборы на сервере: ' + JSON.stringify(final))
    }
  } finally {
    await server.close()
  }
}
