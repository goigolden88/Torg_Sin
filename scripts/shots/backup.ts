import { api, Device, PASSWORD, SITE, sleep, type Cdp, type ServerModule, type Size } from './common.ts'

// «Скачать копию комнаты» (#100). Свой запасной сервер: комната с событием и ставкой, у ведущего
// внизу — кнопка и строка про копию; нажал — файл «ТоргСин — <название> — ДД.ММ.ГГГГ.json» (знаки,
// недопустимые в имени, заменены), в нём журнал без служебных записей и ключей. Загрузку браузера
// сценарий перехватывает: имя и текст файла — в окне страницы. Сервер пропал — строка отказа, комната
// на месте
const NOTE = 'Копия — на случай, если сервер пропадёт: в ней всё, что было в комнате. Ключей входа в ней нет'

export async function backup(cdp: Cdp, size: Size, startServer: ServerModule['startServer']) {
  console.log(`Копия комнаты, ${size.width} px`)
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0 })
  let closed = false
  try {
    const room = await api<{ roomId: string; invite: string; key: string }>(server, '/rooms', '', {
      password: PASSWORD,
      name: 'Дача: лето 2026',
      currency: 'RUB',
      hostName: 'Лена',
    })
    const rooms = `/rooms/${room.roomId}`
    const j = await api<{ memberId: string; key: string }>(server, `${rooms}/join`, '', { invite: room.invite, name: 'Костя' })
    await api(server, `${rooms}/admit`, room.key, { request: j.memberId })
    const closesAt = Date.now() + 24 * 60 * 60 * 1000
    const { event } = await api<{ event: { id: string } }>(server, `${rooms}/events`, room.key, {
      condition: 'Шашлык будет готов к шести',
      check: 'Фото мангала в общий чат',
      closesAt,
      expectedAt: closesAt + 60 * 60 * 1000,
    })
    await api(server, `${rooms}/events/${event.id}/bets`, j.key, { outcome: '1', amount: 50000 })
    const { token } = await api<{ token: string }>(server, `${rooms}/device`, room.key, {})

    const host = await Device.open(cdp, size, 'ведущий')
    await host.goto(`${SITE}#/device/${room.roomId}/${token}?server=${encodeURIComponent(server.url)}`)
    await host.waitText('Открыть комнату здесь')
    await host.press('Открыть комнату здесь')
    await host.waitText('Участники')
    await host.waitText('Шашлык будет готов к шести')
    await host.waitText('Скачать копию комнаты')
    await host.waitText(NOTE)
    await host.shot('124-kopiya-knopka')

    // Загрузку перехватываем: имя и текст файла — в window.__saved, браузер ничего не сохраняет
    await host.eval(`(() => {
      window.__saved = null
      const click = HTMLAnchorElement.prototype.click
      HTMLAnchorElement.prototype.click = function () {
        if (!this.download) return click.call(this)
        const name = this.download
        fetch(this.href).then((r) => r.text()).then((text) => { window.__saved = { name, text } })
      }
    })()`)
    await host.press('Скачать копию комнаты')
    await host.waitText('Копия готова: «ТоргСин — Дача- лето 2026 — ')
    let saved: { name: string; text: string } | null = null
    for (let i = 0; i < 50 && !saved; i++) {
      saved = await host.eval<{ name: string; text: string } | null>('window.__saved')
      if (!saved) await sleep(100)
    }
    if (!saved) throw new Error('Файл копии не отдан загрузкой')
    if (!/^ТоргСин — Дача- лето 2026 — \d{2}\.\d{2}\.\d{4}\.json$/.test(saved.name)) throw new Error('Имя файла копии: ' + saved.name)
    const copy = JSON.parse(saved.text) as { format: number; roomId: string; log: { type: string }[]; store?: unknown; v?: number }
    if (copy.roomId !== room.roomId) throw new Error('В копии другая комната: ' + copy.roomId)
    if ('store' in copy || 'v' in copy) throw new Error('В копии лишнее: ' + Object.keys(copy).join(', '))
    const types = copy.log.map((e) => e.type)
    for (const type of ['room.created', 'member.added', 'event.created', 'bet.placed']) {
      if (!types.includes(type)) throw new Error(`В журнале копии нет «${type}»: ${types.join(', ')}`)
    }
    if (!saved.text.includes('Шашлык будет готов к шести')) throw new Error('В копии нет события')
    for (const key of [room.key, j.key, token]) if (saved.text.includes(key)) throw new Error('В копии — ключ входа')
    await host.shot('125-kopiya-gotova')

    // Сервер пропал — копии нет, строка отказа; комната на месте
    await server.close()
    closed = true
    await host.press('Скачать копию комнаты')
    await host.waitText('Сервер не отдал копию — попробуйте позже')
    await host.waitText('Шашлык будет готов к шести')
    await host.shot('126-kopiya-net-servera')
  } finally {
    if (!closed) await server.close()
  }
}
