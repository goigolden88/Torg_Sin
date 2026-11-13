// Начало: «ведущий создаёт комнату → друг просится → ведущий впускает…», события, ссылка для
// другого устройства, смена ссылки, нет связи с сервером. У каждого «устройства» своё хранилище
// (отдельный контекст браузера). Комнату ведущий создаёт на общем сервере снимков
import { api, confirmBet, Device, LAPTOP, PASSWORD, pickPoint, SITE, sleep, type Cdp, type RoomsServer, type ServerModule, type Size } from './common.ts'

export async function scenario(cdp: Cdp, size: Size, server: RoomsServer, startServer: ServerModule['startServer']) {
  console.log(`Ширина ${size.width} px`)
  const host = await Device.open(cdp, size, 'ведущий')
  await host.goto(SITE + '#/')
  await host.waitText('Комнат пока нет')
  // Кнопка сворачивания меню — только на компьютере (от 1024 px)
  const toggle = await host.eval<boolean>(`document.querySelector('.nav-toggle').offsetParent !== null`)
  if (toggle !== size.width >= 1024) throw new Error(`Кнопка сворачивания меню ${toggle ? 'видна' : 'не видна'} на ${size.width} px`)
  // Комнату ведущий создаёт на сервере снимков: адрес — в его «Настройках»
  await host.eval(`localStorage.setItem('torgsin.server', ${JSON.stringify(server.url)})`)
  await host.shot('01-moi-komnaty-pusto')

  await host.click('Создать комнату')
  await host.waitText('Новая комната')
  await host.fill('Название', 'Дача 2026')
  await host.fill('Ваше имя в комнате', 'Аня')
  await host.fill('Пароль компании', PASSWORD)
  await host.shot('02-sozdat-komnatu')
  await host.click('Создать')
  await host.waitText('Участники')
  await host.shot('03-komnata-vedushchego')

  await host.click('Пригласить')
  await host.waitText('Отправьте ссылку друзьям')
  const invite = await host.value('input[aria-label="Ссылка-приглашение"]')
  await host.shot('04-priglasit')

  // Друг открывает ссылку, сначала с занятым именем
  const friend = await Device.open(cdp, size, 'друг')
  await friend.goto(invite)
  await friend.waitText('Вход в комнату „Дача 2026“, ведущий — Аня')
  await friend.shot('05-vhod-po-ssylke')
  await friend.fill('Ваше имя в комнате', 'аня')
  await friend.click('Попроситься')
  await friend.waitText('Такое имя уже есть — добавьте букву')
  await friend.shot('06-imya-zanyato')
  await friend.fill('Ваше имя в комнате', 'Боря')
  await friend.click('Попроситься')
  await friend.waitText('Ждём, пока ведущий впустит')
  await friend.shot('07-ozhidanie')

  await host.click('Закрыть')
  await host.waitText('Заявки (1)')
  await host.shot('08-zayavki')
  await host.click('Впустить')
  await friend.waitText('Участники')
  await friend.waitText('Боря')
  await friend.shot('09-drug-v-komnate')
  await friend.goto(SITE + '#/')
  await friend.waitText('Дача 2026')
  await friend.shot('10-moi-komnaty-druga')
  // Сервер комнаты — из ссылки; «Настройки» друга остались по умолчанию
  await friend.goto(SITE + '#/settings')
  await friend.waitText('Сейчас: https://torg-sin.goigolden88.workers.dev')
  await friend.shot('11-nastroyki-druga')

  // Ещё одна заявка — ведущий отклоняет
  const other = await Device.open(cdp, size, 'другой друг')
  await other.goto(invite)
  await other.waitText('Вход в комнату')
  await other.fill('Ваше имя в комнате', 'Вера')
  await other.click('Попроситься')
  await other.waitText('Ждём, пока ведущий впустит')
  await host.waitText('Заявки (1)')
  await host.click('Отклонить')
  await other.waitText('Ведущий отклонил заявку')
  await other.shot('12-otkloneno')

  // «Попроситься снова»: форма с прежним именем, новая заявка; двойное нажатие — одна заявка (Р-13)
  await other.click('Попроситься снова')
  await other.waitText('Вход в комнату „Дача 2026“, ведущий — Аня')
  const again = await other.value('.join input')
  if (again !== 'Вера') throw new Error('В поле не прежнее имя: ' + again)
  await other.shot('12a-poprositsya-snova')
  await other.eval(`(() => {
    const button = document.querySelector('.join button[type="submit"]')
    button.click()
    button.click()
  })()`)
  await other.waitText('Ждём, пока ведущий впустит')
  await other.shot('12b-snova-ozhidanie')
  await host.waitText('Заявки (1)')
  await sleep(6000) // ещё один опрос ведущего: второй заявки не появилось
  const requests = await host.eval<string>('document.body.innerText')
  if (requests.includes('Заявки (2)')) throw new Error('Двойное нажатие дало две заявки')
  await host.shot('12c-snova-zayavka')
  await host.click('Впустить')
  await other.waitText('Участники')
  await other.waitText('Боря')
  await other.shot('12d-snova-v-komnate')

  await events(host, friend, size, server)

  // Ссылка для другого устройства: ведущий выдаёт за Борю и отвязывает его старый телефон
  await host.waitText('Боря')
  await host.click('Ссылка для другого устройства')
  await host.waitText('Для кого')
  await host.click('Боря')
  await host.click('Отвязать старый телефон')
  await host.shot('13-ssylka-ustroystva-vybor')
  await host.click('Получить ссылку')
  await host.waitText('сработает один раз, до')
  const device = await host.value('input[aria-label="Ссылка для другого устройства"]')
  await host.shot('14-ssylka-ustroystva')

  const computer = await Device.open(cdp, size, 'компьютер Бори')
  await computer.goto(device)
  await computer.waitText('Открыть комнату здесь')
  await computer.shot('15-otkryt-na-ustroystve')
  await computer.click('Открыть комнату здесь')
  await computer.waitText('Участники')
  await computer.waitText('Аня')
  await computer.shot('16-komnata-na-drugom-ustroystve')
  // Ссылка одноразовая
  await computer.goto(SITE + '#/')
  await computer.goto(device)
  await computer.waitText('уже есть на этом устройстве')
  // Старый телефон Бори отвязан
  await friend.goto(SITE + '#/')
  await friend.goto(SITE + '#/room/' + device.split('#/device/')[1].split('/')[0])
  await friend.waitText('Нет доступа')
  await friend.shot('17-staryy-telefon-otvyazan')

  // Сменить ссылку — старая не работает
  await host.click('Пригласить')
  await host.click('Сменить ссылку')
  await host.waitText('Сменить ссылку?')
  await host.shot('18-smenit-ssylku')
  await host.click('Да, сменить')
  await host.waitText('Ссылка новая')
  const renewed = await host.value('input[aria-label="Ссылка-приглашение"]')
  if (renewed === invite) throw new Error('Ссылка не сменилась')
  const stranger = await Device.open(cdp, size, 'новый друг')
  await stranger.goto(invite)
  await stranger.waitText('Ссылка недействительна — попросите новую у ведущего')
  await stranger.shot('19-staraya-ssylka')

  // Ссылка на другой сервер; сервер пропал — «Нет связи с сервером», имя не стёрлось
  const spare = await startServer({ file: ':memory:', password: PASSWORD, port: 0 })
  const created = (await (
    await fetch(spare.url + '/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: PASSWORD, name: 'Футбол по средам', currency: 'PTS', hostName: 'Олег' }),
    })
  ).json()) as { roomId: string; invite: string }
  const spareLink = `${SITE}#/join/${created.roomId}/${created.invite}?server=${encodeURIComponent(spare.url)}`
  await stranger.goto(SITE + '#/')
  await stranger.goto(spareLink)
  await stranger.waitText('Вход в комнату „Футбол по средам“, ведущий — Олег')
  await stranger.fill('Ваше имя в комнате', 'Гена')
  await spare.close()
  await stranger.click('Попроситься')
  await stranger.waitText('Нет связи с сервером')
  const kept = await stranger.eval<string>(`document.querySelector('.join input').value`)
  if (kept !== 'Гена') throw new Error('Имя стёрлось: ' + kept)
  await stranger.shot('20-net-svyazi')
}

// События: пусто → новое событие → друг ставит с подтверждением → у ведущего обновилось само →
// ведущий ставит на другой исход → лента и позиция → приём закрыт → отменено ведущим с причиной →
// свои варианты с «Другое» → отменено автором → список событий
async function events(host: Device, friend: Device, size: Size, server: RoomsServer) {
  const roomId = (await host.eval<string>('location.hash')).split('/')[2]
  await host.waitText('Событий пока нет')
  await host.shot('12e-sobytiy-net')

  await host.click('Новое событие')
  await host.waitText('Приём ставок до')
  await host.fill('Условие', 'В субботу на даче будет дождь')
  await host.fill('Как проверяем', 'Кто на даче — в полдень присылает фото неба в общий чат')
  // В комнате трое — суда может не хватить (#63)
  await host.waitText('В маленькой комнате суда может не хватить: судят только не ставившие.')
  await host.shot('12f-novoe-sobytie')
  await host.click('Завести событие')
  await host.waitText('Банк пока пуст')
  const eventHash = await host.eval<string>('location.hash')

  // Друг видит событие в комнате и ставит 300 ₽ на «Да»
  await friend.goto(SITE + '#/room/' + roomId)
  await friend.waitText('В субботу на даче будет дождь')
  await friend.waitText('осталось')
  await friend.click('В субботу на даче будет дождь')
  await friend.waitText('Банк пока пуст')
  await friend.click('Да')
  await friend.fill('Сумма, ₽', '300')
  await friend.click('Поставить')
  await friend.waitText('при нынешних ставках получите')
  await friend.shot('12g-podtverzhdenie-stavki')
  await confirmBet(friend)
  await friend.waitCount('.feed-row', 1)
  // Одна ставка — графика ещё нет
  await friend.waitText('График появится после второй ставки')
  await friend.shot('12g1-grafik-malo-stavok')

  // У ведущего — сам, опросом раз в 5 с; ставит 450 ₽ на «Нет»
  await host.waitCount('.feed-row', 1)
  await host.click('Нет')
  await host.fill('Сумма, ₽', '450')
  await host.click('Поставить')
  await host.waitText('при нынешних ставках получите')
  await confirmBet(host)
  await host.waitCount('.feed-row', 2)
  await host.waitCount('.chart-plot', 1)
  await host.shot('12h-sobytie-s-bankom')
  if (size.width >= 1024) await host.shotAt(LAPTOP, '12h-sobytie-s-bankom')
  // Подпись ставки: на телефоне — нажатием, на компьютере — наведением
  await pickPoint(host, 1, size.width >= 1024)
  await host.waitText('После этой ставки')
  await host.waitText('Аня (вы): 450')
  await host.shot('12h1-grafik-da-net')
  // У друга график появился сам, опросом, без перезагрузки
  await friend.waitCount('.chart-plot', 1)
  await friend.waitCount('.feed-row', 2)
  await sleep(6000) // ещё опрос: двойное нажатие не дало второй ставки
  await friend.waitCount('.feed-row', 2)
  await friend.shot('12i-lenta-i-pozitsiya')

  // График с 4 исходами (3 своих и «Другое») и с 7 (6 своих и «Другое»): ставки — через сервер,
  // с паузой, чтобы точки разошлись по времени
  const hostKey = await host.roomKey(roomId)
  const friendKey = await friend.roomKey(roomId)
  const many = async (condition: string, titles: string[], bets: [string, string, number][], file: string) => {
    const closesAt = Date.now() + 24 * 60 * 60 * 1000
    const { event } = await api<{ event: { id: string } }>(server, `/rooms/${roomId}/events`, hostKey, {
      condition,
      check: 'Фото в общий чат',
      outcomes: titles,
      closesAt,
      expectedAt: closesAt + 60 * 60 * 1000,
    })
    for (const [key, outcome, amount] of bets) {
      await sleep(700)
      await api(server, `/rooms/${roomId}/events/${event.id}/bets`, key, { outcome, amount })
    }
    await host.goto(SITE + `#/room/${roomId}/event/${event.id}`)
    await host.waitCount('.chart-key', titles.length + 1)
    await pickPoint(host, 0.75, size.width >= 1024)
    await host.waitText('После этой ставки')
    await host.shot(file)
  }
  await many(
    'Какую рыбу поймаем первой',
    ['Окунь', 'Щука', 'Лещ'],
    [
      [friendKey, '1', 20000],
      [hostKey, '2', 30000],
      [friendKey, '3', 10000],
      [hostKey, '4', 15000],
      [friendKey, '2', 25000],
      [hostKey, '1', 40000],
    ],
    '12i1-grafik-4-iskhoda',
  )
  await many(
    'Кто приедет на дачу последним',
    ['Аня', 'Боря', 'Вера', 'Гена', 'Дима', 'Женя'],
    [
      [friendKey, '1', 10000],
      [hostKey, '2', 20000],
      [friendKey, '3', 15000],
      [hostKey, '4', 5000],
      [friendKey, '5', 12000],
      [hostKey, '6', 8000],
      [friendKey, '7', 6000],
      [hostKey, '3', 20000],
    ],
    '12i2-grafik-7-iskhodov',
  )

  // Приём закрыт: событие со сроком через 8 секунд — через сервер, минуя экран
  const closesAt = Date.now() + 8000
  const { event } = await api<{ event: { id: string } }>(server, `/rooms/${roomId}/events`, hostKey, {
    condition: 'Электричка в 18:05 придёт без опоздания',
    check: 'Табло на станции и фото в чат',
    closesAt,
    expectedAt: closesAt + 60 * 60 * 1000,
  })
  await api(server, `/rooms/${roomId}/events/${event.id}/bets`, friendKey, { outcome: '1', amount: 20000 })
  await api(server, `/rooms/${roomId}/events/${event.id}/bets`, hostKey, { outcome: '2', amount: 50000 })
  await host.goto(SITE + `#/room/${roomId}/event/${event.id}`)
  await host.waitText('Приём ставок закрыт')
  const betButton = await host.eval<boolean>(`[...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Поставить')`)
  if (betButton) throw new Error('После закрытия приёма кнопка «Поставить» осталась')
  await host.shot('12j-priyom-zakryt')

  // Ведущий отменяет закрытое: причина обязательна
  await host.click('Отменить')
  await host.click('Да, отменить')
  await host.waitText('Нужна причина отмены')
  await host.fill('Причина отмены', 'Электричку отменили — спорить не о чем')
  await host.click('Да, отменить')
  await host.waitText('отменено — ставки возвращены')
  await host.shot('12k-otmeneno-vedushchim')

  // Свои варианты: под ними видно «Другое»; автор отменяет, пока приём идёт
  await friend.goto(SITE + `#/room/${roomId}/event/new`)
  await friend.waitText('Приём ставок до')
  await friend.fill('Условие', 'Кто первым доплывёт до буйка')
  await friend.fill('Как проверяем', 'Смотрим с берега, Вера судит')
  await friend.click('Свои варианты')
  await friend.fill('Вариант 1', 'Аня')
  await friend.fill('Вариант 2', 'Боря')
  await friend.click('Вера')
  await friend.shot('12l-novoe-svoi-varianty')
  await friend.click('Завести событие')
  await friend.waitText('Другое (ничего из перечисленного)')
  await friend.waitText('Банк пока пуст')
  await friend.click('Отменить событие')
  await friend.waitText('Отменить событие?')
  await friend.click('Да, отменить')
  await friend.waitText('отменено — ставки возвращены')
  await friend.shot('12m-otmeneno-avtorom')

  // Список событий: открытые сверху, ниже закрытые и отменённые
  await host.goto(SITE + '#/room/' + roomId)
  await host.waitText('Закрытые и отменённые')
  await host.waitText('Кто первым доплывёт до буйка')
  await host.shot('12n-spisok-sobytiy')
  if (!eventHash.includes('/event/')) throw new Error('После «Завести событие» открылось не событие: ' + eventHash)
}
