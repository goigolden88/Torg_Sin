import { api, confirmTwice, Device, PASSWORD, SITE, type Cdp, type ServerModule, type Size } from './common.ts'

// Темп комнаты (#112, Р-35). Свой запасной сервер с подставными часами. Аня создаёт комнату «Вечер
// споров» с экрана: темп «Свой», апелляция — 3 дня (остальное — как у обычного); в комнате — строка темпа
// и у ведущей «Изменить темп». Событие «Дождь» заведено до смены — со своими сроками. Аня меняет темп на
// «Быстрый» (окно с подтверждением); событие «Пицца» — уже со сроками быстрого. Боря видит темп, но без
// кнопки смены; на «Новом событии» и «Новом пари» — сроки комнаты. Исход: у «Дождя» на возражение —
// сутки (прежние сроки), у «Пиццы» — 2 часа
export async function pace(cdp: Cdp, size: Size, startServer: ServerModule['startServer']) {
  console.log(`Темп комнаты, ${size.width} px`)
  const HOUR = 60 * 60 * 1000
  const DAY = 24 * HOUR
  let shift = 0
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0, now: () => Date.now() + shift })
  try {
    const noScroll = async (device: Device, where: string) => {
      const scroll = await device.eval<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
      if (scroll > 0) throw new Error(`${where} на ${size.width} px: прокрутка вбок ${scroll} px`)
    }
    // Поля и кнопки блока не ниже 44 px
    const tall = async (device: Device, scope: string, where: string) => {
      const low = await device.eval<number>(
        `[...document.querySelectorAll('${scope} button, ${scope} select')].filter((b) => b.offsetParent !== null && b.getBoundingClientRect().height < 44).length`,
      )
      if (low > 0) throw new Error(`${where} на ${size.width} px: кнопок и списков ниже 44 px — ${low}`)
    }
    // Выбрать срок «своего» темпа в списке с подписью label — как человек: React узнаёт по событию change
    const pick = async (device: Device, label: string, ms: number) => {
      const done = await device.eval<boolean>(`(() => {
        const label = [...document.querySelectorAll('label')].find((l) => l.querySelector('span')?.textContent.trim() === ${JSON.stringify(label)})
        const select = label?.querySelector('select')
        if (!select) return false
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select, ${JSON.stringify(String(ms))})
        select.dispatchEvent(new Event('change', { bubbles: true }))
        return true
      })()`)
      if (!done) throw new Error(`Нет списка «${label}»`)
    }

    // Создание комнаты: «Обычный» выбран; «Свой» — четыре списка со сроками обычного и пояснения
    const host = await Device.open(cdp, size, 'Аня')
    await host.goto(SITE)
    await host.eval(`localStorage.setItem('torgsin.server', ${JSON.stringify(server.url)})`)
    await host.goto(`${SITE}#/new`)
    await host.waitText('Темп споров')
    const chosen = await host.eval<string>(`document.querySelector('input[name="pace"]:checked')?.value ?? ''`)
    if (chosen !== 'normal') throw new Error('Создание комнаты: выбран темп ' + chosen)
    await host.waitIn('.pace-picker', 'возражение — 2 ч, апелляция — сутки, молчание — 12 ч, суд — 12 ч')
    await host.fill('Название', 'Вечер споров')
    await host.fill('Ваше имя в комнате', 'Аня')
    await host.fill('Пароль компании', PASSWORD)
    await host.press('Свой')
    await host.waitIn('.pace-custom', 'Сколько у каждого судьи на голос.')
    const lists = await host.eval<number>(`document.querySelectorAll('.pace-custom select').length`)
    if (lists !== 4) throw new Error('«Свой» темп: списков ' + lists)
    await pick(host, 'Апелляция', 3 * DAY)
    await host.waitIn('.pace-picker', 'возражение — сутки, апелляция — 3 дня, молчание — 3 дня, суд — 3 дня')
    await noScroll(host, 'Создание комнаты, «Свой» темп')
    await tall(host, '.pace-picker', 'Создание комнаты, «Свой» темп')
    await host.shot('127-sozdanie-temp-svoy')
    await host.press('Создать')
    await host.waitText('Участники')
    await host.waitIn('.pace-line', 'Темп: свой — возражение — сутки, апелляция — 3 дня, молчание — 3 дня, суд — 3 дня')
    await host.waitIn('.pace-line', 'Изменить темп')

    // Номер комнаты, ключ и приглашение — с устройства Ани; Боря входит по приглашению
    const roomId = await host.eval<string>(`location.hash.split('/')[2]`)
    const hostKey = await host.roomKey(roomId)
    const invite = await host.eval<string>(`new Promise((resolve, reject) => {
      const open = indexedDB.open('torgsin')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const get = open.result.transaction('rooms').objectStore('rooms').get(${JSON.stringify(roomId)})
        get.onsuccess = () => { open.result.close(); resolve(get.result.invite) }
        get.onerror = () => reject(get.error)
      }
    })`)
    const rooms = `/rooms/${roomId}`
    const j = await api<{ memberId: string; key: string }>(server, `${rooms}/join`, '', { invite, name: 'Боря' })
    await api(server, `${rooms}/admit`, hostKey, { request: j.memberId })
    const boryaKey = j.key
    const event = async (condition: string, check: string) => {
      const closesAt = Date.now() + shift + 3000
      const { event } = await api<{ event: { id: string } }>(server, `${rooms}/events`, hostKey, { condition, check, closesAt, expectedAt: closesAt + HOUR })
      await api(server, `${rooms}/events/${event.id}/bets`, hostKey, { outcome: '1', amount: 20000 })
      await api(server, `${rooms}/events/${event.id}/bets`, boryaKey, { outcome: '2', amount: 30000 })
      return `${SITE}#/room/${roomId}/event/${event.id}`
    }
    // До смены темпа — событие со своими сроками комнаты
    const rain = await event('В субботу будет дождь', 'Прогноз и окно в субботу в 12:00')
    await host.waitIn('.pace-line', 'Темп: свой')
    await host.waitText('Боря')
    await noScroll(host, 'Комната с темпом')
    await host.shot('128-komnata-temp')

    // Смена темпа ведущей: тот же выбор, «(сейчас)» у нынешнего, подтверждение про уже созданные
    await host.press('Изменить темп')
    await host.waitIn('.modal', 'Новые сроки — для новых событий и пари; у уже созданных остаются прежние.')
    await host.waitIn('.modal', 'Свой (сейчас)')
    await host.press('Быстрый')
    await host.waitIn('.modal', 'Новый темп: быстрый — возражение — 2 ч, апелляция — сутки, молчание — 12 ч, суд — 12 ч.')
    await noScroll(host, 'Окно смены темпа')
    await tall(host, '.modal', 'Окно смены темпа')
    await host.shot('129-smena-tempa')
    await host.press('Сменить темп')
    await host.waitIn('.pace-line', 'Темп: быстрый — возражение — 2 ч, апелляция — сутки, молчание — 12 ч, суд — 12 ч')
    const modal = await host.eval<boolean>(`!!document.querySelector('.modal')`)
    if (modal) throw new Error('Окно смены темпа не закрылось')

    // Боря видит темп, кнопки смены у него нет; на «Новом событии» и «Новом пари» — сроки комнаты
    const { token } = await api<{ token: string }>(server, `${rooms}/device`, boryaKey, {})
    const borya = await Device.open(cdp, size, 'Боря')
    await borya.goto(`${SITE}#/device/${roomId}/${token}?server=${encodeURIComponent(server.url)}`)
    await borya.waitText('Открыть комнату здесь')
    await borya.press('Открыть комнату здесь')
    await borya.waitIn('.pace-line', 'Темп: быстрый — возражение — 2 ч')
    const change = await borya.eval<boolean>(`[...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Изменить темп')`)
    if (change) throw new Error('У участника — «Изменить темп»')
    await borya.goto(`${SITE}#/room/${roomId}/event/new`)
    await borya.waitText('Сроки этой комнаты: возражение — 2 ч, апелляция — сутки, молчание — 12 ч, суд — 12 ч.')
    await noScroll(borya, '«Новое событие» со сроками комнаты')
    await borya.shot('130-novoe-sobytie-sroki')
    await borya.goto(`${SITE}#/room/${roomId}/offer/new`)
    await borya.waitText('Сроки этой комнаты: возражение — 2 ч')
    await borya.waitText('кто-то промолчит 12 часов')

    // После смены — событие уже со сроками быстрого
    const pizza = await event('Пиццу привезут быстрее часа', 'Время заказа и звонок курьера')
    shift += 10_000 // приём закрыт у обоих

    // «Дождь» — заведён до смены: на возражение — сутки, как было
    await host.goto(rain)
    await host.waitText('Исход ещё не предложен')
    await host.press('Да')
    await host.press('Предложить исход')
    await host.waitIn('.modal', 'На согласие или возражение у ставивших — сутки.')
    await host.press('Отмена')

    // «Пицца» — заведена после смены: на возражение — 2 часа; ставки за 2 часа до досрочного — так же
    await host.goto(pizza)
    await host.waitText('Исход ещё не предложен')
    await host.press('Да')
    await host.press('Предложить исход')
    await host.waitIn('.modal', 'На согласие или возражение у ставивших — 2 часа.')
    await confirmTwice(host, 'возразить до')
    await noScroll(host, 'Исход события в быстрой комнате')
    await host.shot('131-iskhod-bystryy')
    shift += 2 * HOUR + 60_000 // срок возражения прошёл — исход утверждён без возражений
    await host.reload()
    await host.waitText('Утверждён „Да“ — без возражений')
    await host.waitText('если до неё нет апелляции')
    await noScroll(host, 'Исход события в быстрой комнате, утверждён')
    await host.shot('132-iskhod-bystryy-utverzhden')
  } finally {
    await server.close()
  }
}
