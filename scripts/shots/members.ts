import { api, Device, PASSWORD, SITE, type Cdp, type RoomsServer, type ServerModule, type Size } from './common.ts'

// Выйти из комнаты и «выбыл» (Р-40, Р-41, Р-46; #144). Свой запасной сервер: ведущая Лена, Костя (ставка на
// событии — выйти не даст), Вера и Гоша. Снимки: список участников у ведущего до и после (кнопки «Пометить
// „выбыл“», подтверждение, пометки «выбыл» и «вышел»); комната Веры до пометки и после (строка вверху, нет
// «Нового события» и «Предложить пари», нет формы ставки); «Выйти из комнаты» у Кости — подтверждение и отказ
// сервера; Гоша вышел — комнаты у него нет; Гоша просится снова тем же именем — у ведущей «Похож на вышедшего»
// и «Вернуть его» / «Отклонить — это другой человек»; «История» — строки «вышел», «пометил „выбыл“»
const DROPPED = 'Ведущий пометил вас „выбыл“: доигрывайте своё и отмечайте переводы'

// Открыть комнату на новом устройстве по «ссылке для другого устройства» за участника member
async function openAs(cdp: Cdp, size: Size, server: RoomsServer, roomId: string, hostKey: string, member: string, name: string): Promise<Device> {
  const { token } = await api<{ token: string }>(server, `/rooms/${roomId}/device`, hostKey, member ? { member } : {})
  const device = await Device.open(cdp, size, name)
  await device.goto(`${SITE}#/device/${roomId}/${token}?server=${encodeURIComponent(server.url)}`)
  await device.press('Открыть комнату здесь')
  await device.waitText('Участники')
  return device
}

// Нажать кнопку text в строке участника name (у ведущего кнопки «Пометить „выбыл“» у всех — нужна своя)
async function pressAt(device: Device, name: string, text: string): Promise<void> {
  const done = await device.eval<boolean>(`(() => {
    const li = [...document.querySelectorAll('.members .member')].find((el) => el.firstElementChild?.textContent === ${JSON.stringify(name)})
    const button = li && [...li.querySelectorAll('button')].find((b) => b.innerText.trim().startsWith(${JSON.stringify(text)}))
    if (!button) return false
    button.click()
    return true
  })()`)
  if (!done) throw new Error(`нет кнопки «${text}» у «${name}»`)
}

// Текст строки участника name — для проверки пометки
async function memberRow(device: Device, name: string): Promise<string> {
  return device.eval<string>(`(() => {
    const li = [...document.querySelectorAll('.members .member')].find((el) => el.firstElementChild?.textContent === ${JSON.stringify(name)})
    return li ? li.innerText : ''
  })()`)
}

async function waitRow(device: Device, name: string, text: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if ((await memberRow(device, name)).includes(text)) return
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`у «${name}» не дождался «${text}»: ${await memberRow(device, name)}`)
}

async function absent(device: Device, text: string): Promise<void> {
  const shown = await device.eval<boolean>(`document.body.innerText.includes(${JSON.stringify(text)})`)
  if (shown) throw new Error(`на экране не должно быть «${text}»`)
}

export async function members(cdp: Cdp, size: Size, startServer: ServerModule['startServer']) {
  console.log(`Выйти и «выбыл», ${size.width} px`)
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0 })
  try {
    const room = await api<{ roomId: string; invite: string; key: string }>(server, '/rooms', '', {
      password: PASSWORD,
      name: 'Дача: лето 2026',
      currency: 'RUB',
      hostName: 'Лена',
    })
    const rooms = `/rooms/${room.roomId}`
    const join = async (name: string) => {
      const j = await api<{ memberId: string; key: string }>(server, `${rooms}/join`, '', { invite: room.invite, name })
      await api(server, `${rooms}/admit`, room.key, { request: j.memberId })
      return j
    }
    const kostya = await join('Костя')
    const vera = await join('Вера')
    const gosha = await join('Гоша')
    const closesAt = Date.now() + 24 * 60 * 60 * 1000
    const { event } = await api<{ event: { id: string } }>(server, `${rooms}/events`, room.key, {
      condition: 'Шашлык будет готов к шести',
      check: 'Фото мангала в общий чат',
      closesAt,
      expectedAt: closesAt + 60 * 60 * 1000,
    })
    await api(server, `${rooms}/events/${event.id}/bets`, kostya.key, { outcome: '1', amount: 50000 })

    // До: у ведущей — кнопки «Пометить „выбыл“» у каждого, у себя — подпись вместо «Выйти»
    const host = await openAs(cdp, size, server, room.roomId, room.key, '', 'ведущая')
    await host.waitText('Пометить „выбыл“')
    await host.waitText('Сначала передайте ведение')
    await absent(host, 'Выйти из комнаты')
    await host.shot('180-uchastniki-do')

    // До: комната Веры — всё как у всех
    const v = await openAs(cdp, size, server, room.roomId, room.key, vera.memberId, 'Вера')
    await v.waitText('Новое событие')
    await v.waitText('Предложить пари')
    await absent(v, DROPPED)
    await v.shot('181-komnata-do-vybyl')

    // Ведущая помечает Веру «выбыл» — с подтверждением
    await pressAt(host, 'Вера', 'Пометить „выбыл“')
    await host.waitText('Пометить «Вера» „выбыл“?')
    await host.shot('182-vybyl-podtverzhdenie')
    await host.press('Да, пометить')
    await waitRow(host, 'Вера', 'выбыл')
    await waitRow(host, 'Вера', 'Снять „выбыл“')

    // После: у Веры строка вверху, кнопок нового нет; на событии — строка вместо формы ставки
    await v.waitText(DROPPED)
    await absent(v, 'Новое событие')
    await absent(v, 'Предложить пари')
    await absent(v, 'Выставить лот')
    await absent(v, 'Начать выбор')
    await v.shot('183-komnata-vybyl')
    await v.press('Шашлык будет готов к шести')
    await v.waitText(DROPPED)
    await absent(v, 'Поставить')
    await v.shot('184-sobytie-vybyl')

    // Костя хочет выйти — подтверждение; у него ставка на открытом событии — отказ сервера как есть
    const k = await openAs(cdp, size, server, room.roomId, room.key, kostya.memberId, 'Костя')
    await k.press('Выйти из комнаты')
    await k.waitText('Ваши непринятые пари будут отозваны')
    await k.shot('185-vyjti-podtverzhdenie')
    await k.press('Да, выйти')
    await k.waitText('Есть открытая ставка')
    await k.waitText('Участники')
    await k.shot('186-vyjti-otkaz')

    // Гоша выходит — комнаты у него больше нет
    const g = await openAs(cdp, size, server, room.roomId, room.key, gosha.memberId, 'Гоша')
    await g.press('Выйти из комнаты')
    await g.press('Да, выйти')
    await g.waitText('Комнат пока нет')
    await g.shot('187-vyshel-komnat-net')

    // После: у ведущей — «вышел» у Гоши, «выбыл» и «Снять „выбыл“» у Веры
    await waitRow(host, 'Гоша', 'вышел')
    const goshaRow = await memberRow(host, 'Гоша')
    if (goshaRow.includes('Пометить')) throw new Error('у вышедшего — кнопка «Пометить»: ' + goshaRow)
    await host.shot('188-uchastniki-posle')

    // Гоша просится снова тем же именем — у ведущей «Похож на вышедшего» и два выбора вместо «Впустить»
    await api(server, `${rooms}/join`, '', { invite: room.invite, name: 'Гоша' })
    await host.waitText('Похож на вышедшего „Гоша“ (вышел ')
    await host.waitText('Вернуть его')
    await host.waitText('Отклонить — это другой человек')
    await absent(host, 'Впустить')
    await host.shot('189-vozvrat-zayavka')

    // «История» — строки «вышел» и «пометил „выбыл“»
    await host.goto(`${SITE}#/room/${room.roomId}/history`)
    await host.waitText('Участники: вышел, «выбыл»')
    await host.waitText('Гоша — вышел')
    await host.waitText('Ведущий пометил „выбыл“: Вера')
    await host.shot('190-istoriya-uchastniki')
  } finally {
    await server.close()
  }
}
