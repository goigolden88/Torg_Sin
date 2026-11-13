import { api, confirmTwice, Device, PASSWORD, SITE, sleep, type Cdp, type ServerModule, type Size } from './common.ts'

// Исход пари (#53). Свой запасной сервер с подставными часами: «исход к», 3 дня молчания и 7 дней до
// «окончательно» — сдвигом часов. Комната «Байдарки»: Аня — ведущая, Боря, Вера, Гена; на устройства —
// ссылкой для другого устройства. Пари 1 (Аня — Боря, гарант Вера): отметки совпали — окончательно
// сразу; Гена видит всё без кнопок. Пари 2 (Боря — Вера, гарант — ведущая Аня): отметки разошлись —
// решает гарант. Пари 3 (Аня — Вера, гарант Боря): Вера молчит 3 дня, Боря отказывается — стороны
// называют Гену. Двойные нажатия — по одной записи. Список с фазами исхода одной строкой
export async function offerOutcomes(cdp: Cdp, size: Size, startServer: ServerModule['startServer']) {
  console.log(`Исход пари, ${size.width} px`)
  const HOUR = 60 * 60 * 1000
  const DAY = 24 * HOUR
  let shift = 0
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0, now: () => Date.now() + shift })
  try {
    const room = await api<{ roomId: string; invite: string; key: string; memberId: string }>(server, '/rooms', '', {
      password: PASSWORD,
      name: 'Байдарки',
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
      await device.click('Открыть комнату здесь')
      await device.waitText('Участники')
      return device
    }
    const host = await open('Аня', room.key)
    const boryaPhone = await open('Боря', borya.key)
    const veraPhone = await open('Вера', vera.key)
    const genaPhone = await open('Гена', gena.key)
    const offerHref = (id: string) => `${SITE}#/room/${room.roomId}/offer/${id}`
    const OUTCOME = 'section[aria-label="Исход"]'
    const LIST = 'section[aria-label="Пари"]'
    const ACTIONS = ['Прав автор', 'Прав соперник', 'Отказаться', 'Назвать гарантом']
    const actions = (device: Device) =>
      device.eval<string[]>(
        `[...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null && !b.disabled).map((b) => b.innerText.trim()).filter((t) => ${JSON.stringify(ACTIONS)}.includes(t))`,
      )
    const noScroll = async (device: Device, where: string) => {
      const scroll = await device.eval<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
      if (scroll > 0) throw new Error(`${where} на ${size.width} px: прокрутка вбок ${scroll} px`)
    }
    // Кнопки исхода не ниже 44 px
    const tall = async (device: Device, where: string) => {
      const low = await device.eval<number>(
        `[...document.querySelectorAll('${OUTCOME} button')].filter((b) => b.offsetParent !== null && b.getBoundingClientRect().height < 44).length`,
      )
      if (low > 0) throw new Error(`${where} на ${size.width} px: кнопок исхода ниже 44 px — ${low}`)
    }
    // От 1280 px — пари и список пари рядом; уже — одно под другим
    const columns = async (device: Device, where: string) => {
      const c = await device.eval<{ main: { right: number; bottom: number }; side: { left: number; top: number } }>(`(() => {
        const r = (el) => {
          const b = el.getBoundingClientRect()
          return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }
        }
        return { main: r(document.querySelector('.offer .event-main')), side: r(document.querySelector('.offer .event-side')) }
      })()`)
      const beside = c.side.left >= c.main.right - 1
      if (size.width >= 1280 ? !beside : c.side.top < c.main.bottom - 1) throw new Error(`${where} на ${size.width} px: колонки ${JSON.stringify(c)}`)
    }
    const check = async (device: Device, where: string) => {
      await noScroll(device, where)
      await tall(device, where)
      await columns(device, where)
    }
    // Пари через сервер: принять сразу; «исход к» — через час после «приём до»
    const offer = async (key: string, takerKey: string, body: object) => {
      const closesAt = Date.now() + shift + HOUR
      const { offer } = await api<{ offer: { id: string } }>(server, `${rooms}/offers`, key, { closesAt, expectedAt: closesAt + HOUR, ...body })
      await api(server, `${rooms}/offers/${offer.id}/accept`, takerKey, {})
      return offer.id
    }
    const agree = await offer(room.key, borya.key, {
      condition: 'Пройдём порог без переворота',
      check: 'Видео с берега, смотрим вместе',
      odds: { a: 3, b: 1 },
      amount: 30000,
      to: borya.memberId,
      guarantor: vera.memberId,
    })
    const split = await offer(borya.key, vera.key, {
      condition: 'Дойдём до стоянки к шести вечера',
      check: 'Время по телефону Бори у костра',
      odds: { a: 1, b: 1 },
      amount: 50000,
      to: vera.memberId,
    })
    const lapse = await offer(room.key, vera.key, {
      condition: 'Дождя за весь сплав не будет',
      check: 'Кто промок — пишет в чат',
      odds: { a: 1, b: 2 },
      amount: 20000,
      to: vera.memberId,
      guarantor: borya.memberId,
    })

    // До «исход к» — кнопок отметки нет (стороне — только «Исход уже известен?», Р-27)
    await host.goto(offerHref(agree))
    await host.waitText('принято — ждём исхода к')
    if ((await actions(host)).length > 0) throw new Error('Кнопки исхода до «исход к»: ' + (await actions(host)).join(', '))
    shift += 3 * HOUR // «исход к» настал у всех трёх

    // Пари 1. Аня отмечает «прав автор» — с подтверждением и итогом
    await host.waitText('Ждём отметок сторон')
    await host.click('Прав автор')
    await host.waitIn('.modal', 'Вы отмечаете: прав автор — Аня получает банк 400 ₽: Аня +100 ₽, Боря −100 ₽.')
    await host.waitIn('.modal', 'Если соперник отметит так же, исход окончательный сразу и не обжалуется.')
    await host.shot('55-otmetka-podtverzhdenie')
    await confirmTwice(host, 'Ваша отметка: прав автор')
    await host.waitIn(OUTCOME, 'Боря, соперник: ещё не отметил(а)')
    await check(host, 'Пари: ждём отметок')
    await host.shot('56-pari-zhdyom-otmetok')

    // Гена — не сторона и не гарант: видит всё без кнопок
    await genaPhone.goto(offerHref(agree))
    await genaPhone.waitIn(OUTCOME, 'Аня, автор: прав автор')
    if ((await actions(genaPhone)).length > 0) throw new Error('У не-стороны кнопки исхода: ' + (await actions(genaPhone)).join(', '))
    await genaPhone.shot('57-pari-nablyudatel')

    // Боря отмечает так же — утверждено согласием, окончательно сразу
    await boryaPhone.goto(offerHref(agree))
    await boryaPhone.waitIn(OUTCOME, 'Аня, автор: прав автор')
    await boryaPhone.click('Прав автор')
    await boryaPhone.waitIn('.modal', 'Автор уже отметил так же — исход станет окончательным сразу и не обжалуется.')
    await confirmTwice(boryaPhone, 'Утверждено согласием сторон, окончательно')
    await boryaPhone.waitIn('section[aria-label="Итог пари"]', 'Боря (вы) — −100 ₽')
    await boryaPhone.waitIn('section[aria-label="Итог пари"]', 'Аня — +100 ₽')
    if ((await actions(boryaPhone)).length > 0) throw new Error('После согласия остались кнопки: ' + (await actions(boryaPhone)).join(', '))
    await check(boryaPhone, 'Пари: окончательно')
    await boryaPhone.shot('58-soglasie-okonchatelno')
    await genaPhone.waitText('Утверждено согласием сторон, окончательно') // у Гены — само, опросом

    // Пари 2. Боря — «прав автор», Вера — «прав соперник»: решает гарант — ведущая Аня
    await api(server, `${rooms}/offers/${split}/mark`, borya.key, { winner: 'author' })
    await api(server, `${rooms}/offers/${split}/mark`, vera.key, { winner: 'taker' })
    await host.goto(offerHref(split))
    await host.waitText('Решает гарант Аня (вы) до')
    await host.waitText('Отметки сторон разошлись')
    await check(host, 'Пари: решает гарант')
    await host.shot('59-reshaet-garant')
    await veraPhone.goto(offerHref(split))
    await veraPhone.waitText('Решает гарант Аня до')
    await veraPhone.waitText('Ваша отметка: прав соперник. Поменять можно, пока гарант не решил.')
    await veraPhone.shot('59a-reshaet-garant-storona')
    await host.click('Прав соперник')
    await host.waitIn('.modal', 'Утвердить: прав соперник — Вера получает банк 1 000 ₽: Боря −500 ₽, Вера +500 ₽.')
    await host.shot('59b-reshenie-podtverzhdenie')
    await confirmTwice(host, 'Утверждено гарантом Аня (вы), окончательно')
    await host.waitText(', если до неё нет апелляции.')
    await host.shot('60-utverzhdeno-garantom')
    await veraPhone.waitText('Утверждено гарантом Аня, окончательно')
    await veraPhone.waitIn('section[aria-label="Итог пари"]', 'Вера (вы) — +500 ₽')
    if ((await actions(veraPhone)).length > 0) throw new Error('После решения гаранта у стороны кнопки: ' + (await actions(veraPhone)).join(', '))

    // Пари 3. Аня отметила, Вера молчит 3 дня — решает гарант Боря; он отказывается
    await api(server, `${rooms}/offers/${lapse}/mark`, room.key, { winner: 'author' })
    shift += 3 * DAY + HOUR
    await boryaPhone.goto(offerHref(lapse))
    await boryaPhone.waitText('Решает гарант Боря (вы) до')
    await boryaPhone.waitText('Одна сторона не отметила исход за 3 дня')
    await boryaPhone.click('Отказаться')
    await boryaPhone.waitText('Отказаться быть гарантом?')
    await confirmTwice(boryaPhone, 'Нужен новый гарант')
    await boryaPhone.waitText('Гарант Боря (вы) отказался')
    if ((await actions(boryaPhone)).length > 0) throw new Error('У отказавшегося гаранта кнопки: ' + (await actions(boryaPhone)).join(', '))

    // Аня называет Гену; Вера видит, кого назвала Аня, и называет того же — Гена гарант
    await host.goto(offerHref(lapse))
    await host.waitText('Назовите нового гаранта')
    await host.click('Гена')
    await host.click('Назвать гарантом')
    await host.waitText('Назвать гарантом: Гена?')
    await confirmTwice(host, 'Аня (вы) — называет: Гена')
    await host.waitIn(OUTCOME, 'Вера — ещё не назвал(а)')
    await check(host, 'Пари: нужен гарант')
    await host.shot('61-nuzhen-garant')
    await veraPhone.goto(offerHref(lapse))
    await veraPhone.waitText('Аня — называет: Гена')
    await veraPhone.click('Назвать гарантом') // выбран тот, кого назвала Аня
    await veraPhone.waitText('Аня назвал(а) того же — Гена сразу станет гарантом, на решение — 3 дня.')
    await confirmTwice(veraPhone, 'Решает гарант Гена до')
    await veraPhone.shot('61a-novyi-garant')
    await genaPhone.goto(offerHref(lapse))
    await genaPhone.waitText('Вы — гарант: ваше решение до')
    await genaPhone.shot('61b-novyi-garant-reshaet')

    // Через 7 дней решение гаранта — окончательно. Пари 4 — только что принято, «исход к» через
    // 2 секунды: в списке «ждём отметок»; у остальных — своя фаза одной строкой
    shift += 7 * DAY
    const fresh = Date.now() + shift + 2000
    const { offer: wait } = await api<{ offer: { id: string } }>(server, `${rooms}/offers`, room.key, {
      condition: 'Палатку соберём за пять минут',
      check: 'Секундомер у Веры',
      odds: { a: 1, b: 1 },
      amount: 10000,
      to: gena.memberId,
      guarantor: vera.memberId,
      closesAt: fresh,
      expectedAt: fresh,
    })
    await api(server, `${rooms}/offers/${wait.id}/accept`, gena.key, {})
    await sleep(2500)
    await host.goto(`${SITE}#/room/${room.roomId}`)
    await host.waitIn(LIST, 'окончательно: +100 ₽ Аня')
    await host.waitIn(LIST, 'окончательно: +500 ₽ Вера')
    await host.waitIn(LIST, 'нужен новый гарант') // Гена не решил за 3 дня
    await host.waitIn(LIST, 'принято — ждём отметок сторон')
    await noScroll(host, 'Список пари с исходами')
    await host.shot('62-spisok-iskhody')
    await host.goto(offerHref(split))
    await host.waitText('Утверждено гарантом Аня (вы), окончательно')
    await host.waitText('Окончательно.')
    await host.shot('63-okonchatelno-garantom')

    // Действия исхода не завели лишних пари: на сервере — четыре
    const seen = (await (await fetch(server.url + rooms, { headers: { Authorization: 'Bearer ' + room.key } })).json()) as { offers: unknown[] }
    if (seen.offers.length !== 4) throw new Error('Пари на сервере: ' + seen.offers.length + ', а ждали 4')
  } finally {
    await server.close()
  }
}
