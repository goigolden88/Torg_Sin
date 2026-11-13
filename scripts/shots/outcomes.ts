import { api, confirmTwice, Device, EVENT_WIDTHS, PASSWORD, SITE, type Cdp, type ServerModule, type Size } from './common.ts'

// Исход события. Свой запасной сервер с подставными часами: сдвигаем их вперёд — приём закрыт,
// сутки на возражение прошли, 7 дней до «окончательно» — без ожидания; отсчёт на сайте — от now
// сервера. Комната «Рыбалка»: Аня — ведущая, Боря, Вера; на устройства — ссылкой для другого
// устройства. Три события: ведущая не ставила — решает она; ставила — голосует Вера; все на один
// исход — «без игры»
export async function outcomes(cdp: Cdp, size: Size, startServer: ServerModule['startServer']) {
  console.log(`Исход события, ${size.width} px`)
  const HOUR = 60 * 60 * 1000
  let shift = 0
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0, now: () => Date.now() + shift })
  try {
    const room = await api<{ roomId: string; invite: string; key: string }>(server, '/rooms', '', {
      password: PASSWORD,
      name: 'Рыбалка',
      currency: 'RUB',
      hostName: 'Аня',
    })
    const rooms = `/rooms/${room.roomId}`
    const join = async (name: string) => {
      const j = await api<{ memberId: string; key: string }>(server, `${rooms}/join`, '', { invite: room.invite, name })
      await api(server, `${rooms}/admit`, room.key, { request: j.memberId })
      return j.key
    }
    const hostKey = room.key
    const boryaKey = await join('Боря')
    const veraKey = await join('Вера')
    const open = async (name: string, key: string) => {
      const { token } = await api<{ token: string }>(server, `${rooms}/device`, key, {})
      const device = await Device.open(cdp, size, name)
      await device.goto(`${SITE}#/device/${room.roomId}/${token}?server=${encodeURIComponent(server.url)}`)
      await device.waitText('Открыть комнату здесь')
      await device.click('Открыть комнату здесь')
      await device.waitText('Участники')
      return device
    }
    const host = await open('Аня', hostKey)
    const borya = await open('Боря', boryaKey)
    const vera = await open('Вера', veraKey)

    // «Ваша позиция» после утверждения (#39): итог из строки выплат, без прикидки «если выиграет».
    // Снимки позиции на компьютере — ещё и на 1440 px
    const POSITION = 'section[aria-label="Ваша позиция"]'
    const position = async (device: Device, text: string) => {
      const seen = await device.waitIn(POSITION, text)
      if (seen.includes('если выиграет')) throw new Error(`После утверждения в «Вашей позиции» осталась прикидка:\n${seen}`)
    }
    const shotWide = async (device: Device, file: string) => {
      await device.shot(file)
      if (size.width >= 1024) await device.shotAt(EVENT_WIDTHS[2], file)
    }

    // Событие с приёмом на 3 секунды по часам сервера и ставками
    const event = async (key: string, condition: string, check: string, bets: [string, string, number][]) => {
      const closesAt = Date.now() + shift + 3000
      const { event } = await api<{ event: { id: string } }>(server, `${rooms}/events`, key, { condition, check, closesAt, expectedAt: closesAt + HOUR })
      for (const [k, outcome, amount] of bets) await api(server, `${rooms}/events/${event.id}/bets`, k, { outcome, amount })
      return { id: event.id, href: `${SITE}#/room/${room.roomId}/event/${event.id}` }
    }
    const pike = await event(boryaKey, 'Боря поймает щуку больше двух килограммов', 'Весы на причале, фото в общий чат', [
      [boryaKey, '1', 30000],
      [veraKey, '2', 50000],
    ])
    // Аня ставит на оба исхода — в позиции общая сумма и ставки по исходам
    const ten = await event(hostKey, 'К обеду клюнет хотя бы десять рыб', 'Считаем улов в ведре в 14:00', [
      [hostKey, '1', 40000],
      [boryaKey, '2', 60000],
      [hostKey, '2', 10000],
    ])
    const boat = await event(hostKey, 'Лодку на базе дадут без очереди', 'Кто первым придёт на базу — пишет в чат', [
      [boryaKey, '1', 20000],
      [veraKey, '1', 30000],
    ])
    shift += HOUR // приём закрыт у всех трёх

    // Автор (Боря) предлагает «Да» — выбор, подтверждение
    await borya.goto(pike.href)
    await borya.waitText('Исход ещё не предложен')
    await borya.click('Да')
    await borya.click('Предложить исход')
    await borya.waitText('Ставившие смогут согласиться или возразить в течение суток')
    await borya.shot('24-predlozhit-iskhod')
    await confirmTwice(borya, 'возразить до')
    await borya.waitIn(POSITION, 'если выиграет — получите') // не утверждён — прикидка, как прежде
    await borya.shot('25-iskhod-predlozhen')

    // Вера ставила на «Нет» — возражает с причиной; у Бори появляется само (опрос раз в 5 с)
    await vera.goto(pike.href)
    await vera.waitText('возразить до')
    await vera.click('Возразить')
    await vera.click('Возразить')
    await vera.waitText('Нужна причина возражения')
    await vera.fill('Причина возражения', 'Взвешивали вместе с садком')
    await vera.click('Возразить')
    await vera.waitText('Возразить против „Да“?')
    await confirmTwice(vera, 'Возражение: Вера (вы), Взвешивали вместе с садком')
    await vera.shot('26-vozrazhenie')
    await borya.waitText('Возражение: Вера, Взвешивали вместе с садком')

    // Ведущая не ставила — решает она
    await host.goto(pike.href)
    await host.waitText('решает ведущий')
    await host.click('Нет')
    await host.shot('27-reshenie-vedushchego')
    await host.click('Решить')
    await host.waitText('Утвердить „Нет“ решением ведущего?')
    await confirmTwice(host, 'Утверждён „Нет“ — ведущим')
    await position(host, 'Вы не ставили.')
    // Боря ставил 300 ₽ на «Да» — проиграл; Вера 500 ₽ на «Нет» — забрала банк
    await borya.waitText('Утверждён „Нет“ — ведущим')
    await position(borya, 'Утверждён „Нет“: вы поставили 300 ₽, получите 0 ₽ — итог −300 ₽')
    // Апелляции (#63): окончательно через 7 дней, если её не подадут; в «Рыбалке» судить некому —
    // ставили Боря и Вера, ведущая решила возражение
    await borya.waitText(', если до неё нет апелляции.')
    await borya.waitText('Апелляции нет: все участники заинтересованы.')
    await shotWide(borya, '28-utverzhden-vyplaty')
    await vera.waitText('Утверждён „Нет“ — ведущим')
    await position(vera, 'Утверждён „Нет“: вы поставили 500 ₽, получите 800 ₽ — итог +300 ₽')
    await shotWide(vera, '28a-pozitsiya-vyigral')
    const objections = await borya.eval<number>(`[...document.querySelectorAll('.outcome-log > li')].filter((li) => li.innerText.startsWith('Возражение')).length`)
    if (objections !== 1) throw new Error('Двойное нажатие дало возражений: ' + objections)

    // Ведущая ставила — после возражения Бори голосует не ставившая Вера
    await api(server, `${rooms}/events/${ten.id}/propose`, hostKey, { outcome: '1' })
    await api(server, `${rooms}/events/${ten.id}/object`, boryaKey, { reason: 'Мальков не считаем' })
    await vera.goto(ten.href)
    await vera.waitText('голосуют не ставившие')
    await vera.waitText('проголосовали 0 из 1')
    await vera.click('Да')
    await vera.shot('29-golosovanie')
    await vera.click('Голосовать')
    await vera.waitText('Голосовать за „Да“?')
    await confirmTwice(vera, 'Утверждён „Да“ — голосованием')
    await vera.shot('30-utverzhden-golosovaniem')
    // Аня: 400 ₽ на «Да» и 100 ₽ на «Нет» — банк 1 100 ₽ целиком её
    await host.goto(ten.href)
    await host.waitText('Утверждён „Да“ — голосованием')
    await position(host, 'Утверждён „Да“: вы поставили 500 ₽, получите 1 100 ₽ — итог +600 ₽')
    await position(host, 'ваши ставки: „Да“ 400 ₽, „Нет“ 100 ₽')
    await shotWide(host, '30a-pozitsiya-neskolko-iskhodov')

    // Все ставили на «Да», «Да» и утверждён — сутки без возражений: без игры
    await api(server, `${rooms}/events/${boat.id}/propose`, hostKey, { outcome: '1' })
    shift += 25 * HOUR
    await vera.goto(boat.href)
    await vera.waitText('Утверждён „Да“ — без возражений')
    await vera.waitText('Без игры: ставки возвращены')
    await position(vera, 'Без игры — вам вернётся 300 ₽.')
    await shotWide(vera, '31-bez-igry')

    // Через 7 дней после утверждения — «Окончательно»: «получили», «вернулось»
    shift += 7 * 24 * HOUR
    await borya.waitText('Окончательно.')
    await position(borya, 'Утверждён „Нет“: вы поставили 300 ₽, получили 0 ₽ — итог −300 ₽')
    await shotWide(borya, '32-okonchatelno')
    await position(vera, 'Без игры — вам вернулось 300 ₽.')

    // Согласие с исходом (Р-21). «Костёр»: ставили Боря и Вера, Боря предложил — у Веры «Согласны
    // 1 из 2» и кнопка; согласилась — все согласны, окончательно сразу. «Палатка»: ставили трое,
    // Аня предложила, Боря согласился, Вера молчит — у Бори «Вы согласны с исходом»
    const fire = await event(boryaKey, 'Костёр разведём с одной спички', 'Смотрим все вместе у мангала', [
      [boryaKey, '1', 20000],
      [veraKey, '2', 10000],
    ])
    const tent = await event(hostKey, 'Палатку поставим за десять минут', 'Засекаем на телефоне Ани', [
      [hostKey, '1', 10000],
      [boryaKey, '1', 10000],
      [veraKey, '2', 20000],
    ])
    shift += HOUR // приём закрыт у обоих
    await api(server, `${rooms}/events/${fire.id}/propose`, boryaKey, { outcome: '1' })
    await vera.goto(fire.href)
    await vera.waitText('Согласны 1 из 2 ставивших: Боря')
    await vera.shot('38-soglasny-1-iz-2')
    await vera.click('Согласен с исходом')
    await vera.waitText('Согласие не отозвать. Когда согласятся все ставившие, исход утвердится сразу и станет окончательным.')
    await vera.waitIn('.modal', 'Соглашаясь, вы отказываетесь возразить и подать апелляцию.')
    await vera.shot('38a-soglasie-podtverzhdenie')
    await confirmTwice(vera, 'Все ставившие согласны — утверждён')
    await vera.waitText('Утверждён „Да“ — все ставившие согласны')
    await vera.waitText('Окончательно.')
    await position(vera, 'Утверждён „Да“: вы поставили 100 ₽, получили 0 ₽ — итог −100 ₽')
    await shotWide(vera, '39-vse-soglasny-okonchatelno')
    const agreements = await vera.eval<number>(`[...document.querySelectorAll('.outcome-log > li')].filter((li) => li.innerText.startsWith('Согласие')).length`)
    if (agreements !== 1) throw new Error('Двойное нажатие дало согласий: ' + agreements)

    await api(server, `${rooms}/events/${tent.id}/propose`, hostKey, { outcome: '1' })
    await api(server, `${rooms}/events/${tent.id}/agree`, boryaKey, {})
    await borya.goto(tent.href)
    await borya.waitText('Вы согласны с исходом.')
    await borya.waitText('Согласны 2 из 3 ставивших: Аня, Боря (вы)')
    if (await borya.eval<boolean>(`[...document.querySelectorAll('button')].some((b) => /Согласен|Возразить/.test(b.innerText))`)) {
      throw new Error('У согласившегося остались кнопки «Согласен» или «Возразить»')
    }
    await borya.shot('40-vy-soglasny')

    // Старая копия на устройстве (#49): события записаны до согласий — у исхода нет agreements.
    // Экран события не падает: копию не показывает, ждёт сервер — и открывает событие с сервера.
    // Комната закрыта на время правки: опрос не перепишет копию раньше, чем откроется событие
    await borya.goto(`${SITE}#/`)
    await borya.waitText('Рыбалка')
    await borya.editRooms(`(room.events || []).forEach((e) => { if (e.outcome) delete e.outcome.agreements })`)
    await borya.reload()
    await borya.waitText('Рыбалка')
    await borya.goto(tent.href)
    await borya.waitText('Вы согласны с исходом.')
    await borya.waitText('Согласны 2 из 3 ставивших: Аня, Боря (вы)')
    if (await borya.eval<boolean>(`document.body.innerText.includes('Что-то пошло не так')`)) throw new Error('Старая копия события уронила экран')
    await borya.shot('41-staraya-kopiya-sobytiya')
  } finally {
    await server.close()
  }
}
