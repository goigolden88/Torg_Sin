import { api, PASSWORD, SITE, type Cdp, type ServerModule, type Size } from './common.ts'
import { absent, memberRow, openAs } from './members.ts'

// Закрыть комнату и открыть снова (Р-43; #147). Свой запасной сервер: ведущая Лена, Костя и Вера; у Кости
// идёт событие. Снимки: у ведущей — «Закрыть комнату» и подтверждение; отказ сервера — что открыто; событие
// отменено — закрыта: у ведущей подпись и «Открыть снова»; у участника — подпись, кнопок нового нет;
// «Мои комнаты» — пометка «закрыта»; «История» — «закрыл комнату»; открыта снова — кнопки нового вернулись
const HOUR = 60 * 60 * 1000
const CONDITION = 'Шашлык будет готов к шести'
const CLOSED = 'Комната закрыта '
const NEW_BUTTONS = ['Новое событие', 'Предложить пари', 'Выставить лот', 'Начать выбор', 'Пригласить']

export async function close(cdp: Cdp, size: Size, startServer: ServerModule['startServer']) {
  console.log(`Закрыть комнату, ${size.width} px`)
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
    const closesAt = Date.now() + 2 * HOUR
    const { event } = await api<{ event: { id: string } }>(server, `${rooms}/events`, kostya.key, {
      condition: CONDITION,
      check: 'Фото мангала в общий чат',
      closesAt,
      expectedAt: closesAt + HOUR,
    })

    // Устройства — до закрытия: ссылка для другого устройства в закрытой не работает (новая запись журнала)
    const lena = await openAs(cdp, size, server, room.roomId, room.key, '', 'Лена')
    const v = await openAs(cdp, size, server, room.roomId, room.key, vera.memberId, 'Вера')
    await v.waitText(CONDITION)

    // У ведущей — «Закрыть комнату» и подсказка, когда можно; подтверждение
    await lena.waitText(CONDITION)
    await lena.waitText('Закрыть можно, когда всё доиграно')
    await lena.press('Закрыть комнату')
    await lena.waitText('Закрыть комнату? Новых событий')
    await lena.shot('200-zakryt-podtverzhdenie')

    // Событие идёт — отказ сервера называет его
    await lena.press('Да, закрыть')
    await lena.waitText('Есть незавершённое событие: ' + CONDITION)
    await lena.shot('201-zakryt-otkaz')

    // Костя отменил событие — всё доиграно; закрыть
    await api(server, `${rooms}/events/${event.id}/cancel`, kostya.key, {})
    await lena.press('Не надо')
    await lena.press('Закрыть комнату')
    await lena.press('Да, закрыть')
    await lena.waitText(CLOSED)
    await lena.waitText('Открыть снова')
    for (const text of NEW_BUTTONS) await absent(lena, text)
    await absent(lena, 'Изменить темп')
    await lena.shot('202-zakryta-u-veduschey')

    // У участника (при опросе) — подпись, кнопок нового и «Выйти» нет, «Открыть снова» тоже
    await v.waitText(CLOSED)
    for (const text of [...NEW_BUTTONS, 'Выйти из комнаты', 'Открыть снова', 'Закрыть комнату']) await absent(v, text)
    if ((await memberRow(v, 'Лена')).includes('Взять ведение')) throw new Error('в закрытой комнате — «Взять ведение»')
    await v.shot('203-zakryta-u-uchastnika')

    // «Мои комнаты» — пометка «закрыта»
    await v.goto(`${SITE}#/`)
    await v.waitText('закрыта')
    await v.shot('204-moi-komnaty-zakryta')

    // «История» — «закрыл комнату»
    await v.goto(`${SITE}#/room/${room.roomId}/history`)
    await v.waitText('Ведущий Лена закрыл комнату')
    await v.shot('205-istoriya-zakryta')

    // Открыть снова — с подтверждением; кнопки нового вернулись
    await lena.press('Открыть снова')
    await lena.waitText('Открыть комнату снова?')
    await lena.press('Да, открыть')
    await lena.waitText('Новое событие')
    await lena.waitText('Закрыть комнату')
    await absent(lena, CLOSED)
    await lena.shot('206-otkryta-snova')
  } finally {
    await server.close()
  }
}
