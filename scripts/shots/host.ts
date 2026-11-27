import { api, PASSWORD, SITE, type Cdp, type ServerModule, type Size } from './common.ts'
import { absent, memberRow, openAs, pressAt, waitRow } from './members.ts'

// Передать и взять ведение (Р-42; #146). Свой запасной сервер со сдвигом времени: ведущая Лена, Костя и Вера.
// Снимки: список участников до — у ведущей («Передать ведение» у каждого, «заходил» под ней, ссылка вместо
// «Выйти») и у участника; подтверждение передачи; после — у прежней ведущей (кнопок ведущего нет, «Выйти» есть)
// и у нового ведущего Кости (кнопки ведущего появились без перезагрузки); Костя не заходит 2 дня — у Веры
// подпись «Взять ведение можно с …»; 8 дней — кнопка «Взять ведение», подтверждение, Вера — ведущая;
// «История» — «передал ведение» и «взял ведение»
const DAY = 24 * 60 * 60 * 1000
const LEAVE_LINK = 'Чтобы выйти, сначала передайте ведение'

export async function host(cdp: Cdp, size: Size, startServer: ServerModule['startServer']) {
  console.log(`Ведение, ${size.width} px`)
  let shift = 0
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0, now: () => Date.now() + shift })
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

    // До: у ведущей — «Передать ведение» у каждого, под ней — «заходил», вместо «Выйти» — ссылка к участникам
    const lena = await openAs(cdp, size, server, room.roomId, room.key, '', 'Лена')
    await waitRow(lena, 'Лена', 'заходил ')
    await waitRow(lena, 'Костя', 'Передать ведение')
    await waitRow(lena, 'Вера', 'Передать ведение')
    await lena.waitText(LEAVE_LINK)
    await lena.shot('191-vedenie-do-u-veduschey')

    // До: у участника — «ведущий» и «заходил» у Лены, кнопок ведения нет
    const k = await openAs(cdp, size, server, room.roomId, room.key, kostya.memberId, 'Костя')
    const v = await openAs(cdp, size, server, room.roomId, room.key, vera.memberId, 'Вера')
    await waitRow(k, 'Лена', 'заходил ')
    await absent(k, 'Передать ведение')
    await absent(k, 'Взять ведение')
    await k.shot('192-vedenie-do-u-uchastnika')

    // Лена передаёт ведение Косте — с подтверждением
    await pressAt(lena, 'Костя', 'Передать ведение')
    await lena.waitText('Вы станете обычным участником')
    await lena.shot('193-peredat-podtverzhdenie')
    await lena.press('Да, передать')

    // После: у Лены кнопок ведущего нет, «Выйти из комнаты» есть; у Кости — появились при опросе
    await waitRow(lena, 'Костя', 'ведущий')
    await lena.waitText('Выйти из комнаты')
    await absent(lena, 'Передать ведение')
    await absent(lena, 'Пометить „выбыл“')
    await absent(lena, LEAVE_LINK)
    await lena.shot('194-vedenie-posle-u-prezhney')
    await waitRow(k, 'Костя', 'ведущий')
    await waitRow(k, 'Лена', 'Передать ведение')
    await waitRow(k, 'Вера', 'Пометить „выбыл“')
    await k.waitText(LEAVE_LINK)
    await k.shot('195-vedenie-posle-u-novogo')

    // Костя пропал: 2 дня не заходит — у Веры подпись «Взять ведение можно с …», кнопки ещё нет
    await k.goto('about:blank')
    shift += 2 * DAY
    await waitRow(v, 'Костя', 'Взять ведение можно с ')
    const early = await memberRow(v, 'Костя')
    if (early.split('\n').some((line) => line.trim() === 'Взять ведение')) throw new Error('кнопка «Взять ведение» раньше 7 дней: ' + early)
    await v.shot('196-vzyat-mozhno-s')

    // 8 дней — кнопка «Взять ведение», подтверждение; Вера — ведущая
    shift += 6 * DAY
    await v.press('Взять ведение')
    await v.waitText('Вы станете ведущим')
    await v.shot('197-vzyat-podtverzhdenie')
    await v.press('Да, взять')
    await waitRow(v, 'Вера', 'ведущий')
    await waitRow(v, 'Лена', 'Передать ведение')
    await waitRow(v, 'Костя', 'Передать ведение')
    await v.shot('198-vzyala-vedenie')

    // «История» — передал и взял ведение
    await v.goto(`${SITE}#/room/${room.roomId}/history`)
    await v.waitText('Участники: вышел, «выбыл», ведение')
    await v.waitText('Ведущий Лена передал ведение: Костя')
    await v.waitText('Участник Вера взял ведение: ведущий не заходил с ')
    await v.shot('199-istoriya-vedenie')
  } finally {
    await server.close()
  }
}
