import { ANDROID_UA, api, Device, HOME_NOTE, IPHONE_UA, PASSWORD, SITE, sleep, type Cdp, type ServerModule, type Size } from './common.ts'

// «Вставить ссылку» и заметка про экран «Домой» (#56). Свой запасной сервер — ссылки с ?server=.
// Приложение с экрана «Домой» на iPhone: пустые «Мои комнаты» с полем; не ссылка — текст;
// приглашение (сообщением целиком) — подсказка про второго участника и экран входа с сервером
// из ссылки. iPhone в Safari: в комнате заметка, кнопка — ссылка для другого устройства; её
// вставляют в приложении — та же комната тем же участником, заметки там нет. Закрыли — нет и
// после перезагрузки; на Android заметки нет
export async function pasteLink(cdp: Cdp, size: Size, startServer: ServerModule['startServer']) {
  console.log(`Вставить ссылку, ${size.width} px`)
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0 })
  try {
    const room = await api<{ roomId: string; invite: string; key: string }>(server, '/rooms', '', {
      password: PASSWORD,
      name: 'Баня по пятницам',
      currency: 'RUB',
      hostName: 'Дима',
    })
    const rooms = `/rooms/${room.roomId}`
    const j = await api<{ memberId: string; key: string }>(server, `${rooms}/join`, '', { invite: room.invite, name: 'Женя' })
    await api(server, `${rooms}/admit`, room.key, { request: j.memberId })
    const query = '?server=' + encodeURIComponent(server.url)
    const deviceHref = async () => {
      const { token } = await api<{ token: string }>(server, `${rooms}/device`, j.key, {})
      return `${SITE}#/device/${room.roomId}/${token}${query}`
    }
    const has = (device: Device, text: string) => device.eval<boolean>(`document.body.innerText.includes(${JSON.stringify(text)})`)

    // Приложение с экрана «Домой»: адресной строки нет — ссылку вставляют в «Мои комнаты»
    const app = await Device.open(cdp, size, 'приложение на iPhone', { userAgent: IPHONE_UA, standalone: true })
    await app.goto(SITE + '#/')
    await app.waitText('Комнат пока нет')
    await app.waitText('вставьте в „Вставить ссылку“ ниже')
    await app.fill('Вставить ссылку', 'https://example.com/#/room/1')
    await app.click('Открыть')
    await app.waitText('Это не ссылка ТоргСина: нужна ссылка-приглашение или ссылка для другого устройства')
    await app.shot('64-vstavit-ssylku-ne-ta')
    await app.fill('Вставить ссылку', `Заходи в комнату «Баня по пятницам» в ТоргСине ${SITE}#/join/${room.roomId}/${room.invite}${query}`)
    await app.waitText('Уже вошли в эту комнату в браузере? Тогда нужна не эта ссылка, а „Ссылка для другого устройства“')
    await app.shot('65-vstavit-priglashenie')
    await app.click('Открыть')
    await app.waitText('Вход в комнату „Баня по пятницам“, ведущий — Дима')
    const joinHash = await app.eval<string>('location.hash')
    if (joinHash !== `#/join/${room.roomId}/${room.invite}${query}`) throw new Error('Приглашение открыло не тот адрес: ' + joinHash)

    // iPhone в Safari: вошёл — в комнате заметка; кнопка создаёт ссылку для другого устройства
    const safari = await Device.open(cdp, size, 'Safari на iPhone', { userAgent: IPHONE_UA, clipboard: true })
    await safari.goto(await deviceHref())
    await safari.waitText('Открыть комнату здесь')
    await safari.click('Открыть комнату здесь')
    await safari.waitText('Участники')
    await safari.waitText(HOME_NOTE)
    await safari.shot('66-zametka-iphone')
    await safari.click('Скопировать ссылку для приложения')
    await safari.waitText('сработает один раз, до')
    const appLink = await safari.value('input[aria-label="Ссылка для приложения"]')
    if (!appLink.includes(`#/device/${room.roomId}/`)) throw new Error('Кнопка заметки дала не ссылку для другого устройства: ' + appLink)
    await safari.shot('67-zametka-ssylka')

    // Приложение: вставили ссылку из заметки — та же комната, тот же участник; заметки нет
    await app.goto(SITE + '#/')
    await app.waitText('Комнат пока нет')
    await app.fill('Вставить ссылку', appLink)
    if (await has(app, 'Уже вошли в эту комнату')) throw new Error('Подсказка про второго участника — у ссылки для другого устройства')
    await app.click('Открыть')
    await app.waitText('Открыть комнату здесь')
    await app.click('Открыть комнату здесь')
    await app.waitText('Участники')
    await app.waitText('Женя')
    if (await has(app, HOME_NOTE)) throw new Error('Заметка про экран «Домой» — в приложении с экрана «Домой»')
    const members = await app.eval<number>(`document.querySelectorAll('.members > li').length`)
    if (members !== 2) throw new Error('В комнате приложения участников: ' + members)
    await app.goto(SITE + '#/')
    await app.waitText('Баня по пятницам')
    await app.waitText('Вставить ссылку')
    await app.shot('68-moi-komnaty-s-polem')

    // Заметку закрыли — нет и после перезагрузки
    await safari.click('Закрыть')
    if (await has(safari, HOME_NOTE)) throw new Error('Заметка не закрылась')
    await safari.reload()
    await safari.waitText('Участники')
    await sleep(500)
    if (await has(safari, HOME_NOTE)) throw new Error('Закрытая заметка вернулась после перезагрузки')

    // Android — заметки нет, поле есть
    const android = await Device.open(cdp, size, 'Android', { userAgent: ANDROID_UA })
    await android.goto(await deviceHref())
    await android.waitText('Открыть комнату здесь')
    await android.click('Открыть комнату здесь')
    await android.waitText('Участники')
    await sleep(500)
    if (await has(android, HOME_NOTE)) throw new Error('Заметка про экран «Домой» — на Android')
    await android.goto(SITE + '#/')
    await android.waitText('Вставить ссылку')
  } finally {
    await server.close()
  }
}
