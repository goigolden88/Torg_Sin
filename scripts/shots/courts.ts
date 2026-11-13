import { api, confirmTwice, Device, PASSWORD, SITE, type Cdp, type ServerModule, type Size } from './common.ts'

// Апелляция и суд (#63). Свой запасной сервер с подставными часами и выдуманным зерном жребия; комната
// «Сплав»: Аня — ведущая, Боря, Вера, Гена, Дима, Женя, Зоя; на устройства — ссылкой для другого
// устройства. Событие: ставили Боря, Вера и Женя, Боря предложил «Да», сутки без возражений — Вера
// подаёт апелляцию (причина, окно подтверждения), Женя присоединяется; суд — Аня и двое по жребию из
// Гены, Димы и Зои. Присяжный видит «вы в суде» в «Моих комнатах» (копию старше 5 минут они спросили у
// сервера) и в комнате, голосует «изменить на „Нет“»; Аня досрочно заменяет второго; решение — новый
// исход и выплаты. Пари: гарант Гена решил в пользу Бори, Вера подаёт апелляцию, суд отменяет пари
export async function courts(cdp: Cdp, size: Size, startServer: ServerModule['startServer']) {
  console.log(`Апелляция и суд, ${size.width} px`)
  const HOUR = 60 * 60 * 1000
  let shift = 0
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0, now: () => Date.now() + shift, seed: () => '5eed0063a1b2c3d4' })
  try {
    const room = await api<{ roomId: string; invite: string; key: string; memberId: string }>(server, '/rooms', '', {
      password: PASSWORD,
      name: 'Сплав',
      currency: 'RUB',
      hostName: 'Аня',
    })
    const rooms = `/rooms/${room.roomId}`
    type Person = { name: string; memberId: string; key: string; device: Device | null }
    const people: Person[] = [{ name: 'Аня', memberId: room.memberId, key: room.key, device: null }]
    for (const name of ['Боря', 'Вера', 'Гена', 'Дима', 'Женя', 'Зоя']) {
      const j = await api<{ memberId: string; key: string }>(server, `${rooms}/join`, '', { invite: room.invite, name })
      await api(server, `${rooms}/admit`, room.key, { request: j.memberId })
      people.push({ name, memberId: j.memberId, key: j.key, device: null })
    }
    const person = (name: string) => people.find((p) => p.name === name) as Person
    const byId = (id: string) => people.find((p) => p.memberId === id) as Person
    const open = async (p: Person) => {
      const { token } = await api<{ token: string }>(server, `${rooms}/device`, p.key, {})
      const device = await Device.open(cdp, size, p.name)
      await device.goto(`${SITE}#/device/${room.roomId}/${token}?server=${encodeURIComponent(server.url)}`)
      await device.waitText('Открыть комнату здесь')
      await device.click('Открыть комнату здесь')
      await device.waitText('Участники')
      p.device = device
      return device
    }
    const deviceOf = (p: Person) => p.device as Device
    const [borya, vera, zhenya] = [person('Боря'), person('Вера'), person('Женя')]
    for (const p of people) if (p.name !== 'Боря') await open(p)
    const host = deviceOf(people[0])
    const COURT = 'section[aria-label="Суд"]'
    const APPEAL = 'section[aria-label="Апелляция"]'
    type Seat = { member: string | null }
    type Court = { seats: Seat[]; candidates: string[] }
    const state = async () =>
      (await (await fetch(server.url + rooms, { headers: { Authorization: 'Bearer ' + room.key } })).json()) as {
        events: { id: string; outcome: { court?: Court } | null }[]
        offers: { id: string; outcome: { court?: Court } | null }[]
      }
    const noScroll = async (device: Device, where: string) => {
      const scroll = await device.eval<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
      if (scroll > 0) throw new Error(`${where} на ${size.width} px: прокрутка вбок ${scroll} px`)
    }
    // Кнопки исхода, апелляции и суда не ниже 44 px; без прокрутки вбок
    const check = async (device: Device, where: string) => {
      await noScroll(device, where)
      const low = await device.eval<number>(
        `[...document.querySelectorAll('section[aria-label="Исход"] button')].filter((b) => b.offsetParent !== null && b.getBoundingClientRect().height < 44).length`,
      )
      if (low > 0) throw new Error(`${where} на ${size.width} px: кнопок ниже 44 px — ${low}`)
    }

    // Событие: приём на 3 секунды по часам сервера, ставки, предложение «Да», сутки без возражений
    const closesAt = Date.now() + shift + 3000
    const { event } = await api<{ event: { id: string } }>(server, `${rooms}/events`, borya.key, {
      condition: 'Пройдём весь маршрут за два дня',
      check: 'Отметки в общем треке похода',
      closesAt,
      expectedAt: closesAt + HOUR,
    })
    await api(server, `${rooms}/events/${event.id}/bets`, borya.key, { outcome: '1', amount: 30000 })
    await api(server, `${rooms}/events/${event.id}/bets`, vera.key, { outcome: '2', amount: 50000 })
    await api(server, `${rooms}/events/${event.id}/bets`, zhenya.key, { outcome: '2', amount: 20000 })
    shift += HOUR
    await api(server, `${rooms}/events/${event.id}/propose`, borya.key, { outcome: '1' })
    shift += 25 * HOUR
    const eventHref = `${SITE}#/room/${room.roomId}/event/${event.id}`
    // Присяжные-кандидаты ждут в «Моих комнатах»: их копия свежая, сервер не спрашивается
    for (const name of ['Гена', 'Дима', 'Зоя']) {
      await deviceOf(person(name)).goto(`${SITE}#/`)
      await deviceOf(person(name)).waitText('Сплав')
    }

    // Вера ставила на «Нет» — подаёт апелляцию: причина обязательна, окно с составом суда
    const v = deviceOf(vera)
    await v.goto(eventHref)
    await v.waitText('Утверждён „Да“ — без возражений')
    await v.waitText(', если до неё нет апелляции.')
    await v.waitIn(APPEAL, 'Подать апелляцию')
    await check(v, 'Событие: можно подать апелляцию')
    await v.shot('80-apellyatsiya-mozhno-podat')
    await v.press('Подать апелляцию')
    await v.click('Подать апелляцию')
    await v.waitText('Нужна причина апелляции')
    await v.fill('Причина апелляции', 'Боря срезал через протоку — по треку видно')
    await v.click('Подать апелляцию')
    await v.waitIn('.modal', 'Апелляция одна на событие. Суд: ведущий и 2 присяжных по жребию, 72 часа, решение окончательное.')
    await v.shot('80a-apellyatsiya-podtverzhdenie')
    await confirmTwice(v, 'Апелляция: Вера (вы)')
    await v.waitIn(COURT, 'ещё не голосовал(а)')
    await v.waitIn(COURT, 'проверить может любой')
    await v.waitText('Подана апелляция — окончательно, когда решит суд.')
    await check(v, 'Событие: суд идёт')
    await v.shot('81-sud-idyot')

    // Суд: Аня (ведущая не ставила — первая) и двое по жребию; третий кандидат — запасной
    const pool = (await state()).events.find((e) => e.id === event.id)?.outcome?.court
    if (!pool || pool.seats.length !== 3 || pool.seats[0].member !== room.memberId) throw new Error('Суд по событию: ' + JSON.stringify(pool))
    const [juror, silent] = [byId(pool.seats[1].member as string), byId(pool.seats[2].member as string)]
    const reserve = byId(pool.candidates[3])

    // Женя тоже ставил на «Нет» — присоединяется с подтверждением
    const z = deviceOf(zhenya)
    await z.goto(eventHref)
    await z.waitIn(APPEAL, 'Апелляция: Вера')
    await z.press('Присоединиться')
    await z.waitText('Присоединиться к апелляции?')
    await confirmTwice(z, 'Присоединились: Женя (вы)')
    await z.shot('82-prisoedinilsya')

    // Присяжный: копия комнаты на устройстве — «старше 5 минут»; «Мои комнаты» спрашивают сервер сами
    const j = deviceOf(juror)
    await j.editRooms('room.syncedAt = Date.now() - 6 * 60 * 1000')
    await j.reload()
    await j.waitIn('.room-list', 'вы в суде')
    await j.shot('83-moi-komnaty-vy-v-sude')
    await j.click('Сплав')
    await j.waitIn('section[aria-label="События"]', 'вы в суде')
    await j.shot('84-komnata-vy-v-sude')
    await j.goto(eventHref)
    await j.waitText('Вы в суде: голос до')
    await check(j, 'Событие: член суда')
    await j.shot('85-chlen-suda-golosuet')
    await j.press('Изменить на „Нет“')
    await j.waitIn('.modal', 'Голос не изменить.')
    await j.shot('85a-golos-podtverzhdenie')
    await confirmTwice(j, 'голос: изменить на „Нет“')

    // Ведущая не заинтересована — досрочно заменяет молчащего: причина, окно, следующий по жребию
    await host.goto(eventHref)
    await host.waitIn(COURT, 'Заменить')
    await host.press('Заменить')
    await host.fill('Причина замены', 'В походе без связи — не ответит до конца недели')
    await host.click('Заменить')
    await host.waitIn('.modal', 'Место перейдёт следующему по жребию; одна замена на место.')
    await host.waitIn('.modal', `Следующий по жребию — ${reserve.name}`)
    await host.shot('86-zamena-podtverzhdenie')
    await confirmTwice(host, `вместо ${silent.name}: заменён(а) ведущим`)
    await check(host, 'Событие: замена')
    await host.shot('86a-zamena')

    // Аня и запасной голосуют через сервер: 2 — «изменить на „Нет“», 1 — «оставить» → новый исход
    await api(server, `${rooms}/events/${event.id}/judge`, room.key, { verdict: 'change', outcome: '2' })
    await api(server, `${rooms}/events/${event.id}/judge`, reserve.key, { verdict: 'keep' })
    await v.waitText('Решение суда: изменить на „Нет“')
    await v.waitText('Утверждён „Нет“ — судом')
    await v.waitIn('section[aria-label="Ваша позиция"]', 'Утверждён „Нет“: вы поставили 500 ₽, получили')
    await check(v, 'Событие: решение суда')
    await v.shot('87-reshenie-suda')

    // Пари: Боря — «прав автор», Вера — «прав соперник»; гарант Гена решил «прав автор»
    const offerAt = Date.now() + shift + HOUR
    const { offer } = await api<{ offer: { id: string } }>(server, `${rooms}/offers`, borya.key, {
      condition: 'На второй день ветер будет попутным',
      check: 'Прогноз и флажок на корме',
      odds: { a: 1, b: 1 },
      amount: 40000,
      to: vera.memberId,
      guarantor: person('Гена').memberId,
      closesAt: offerAt,
      expectedAt: offerAt + HOUR,
    })
    await api(server, `${rooms}/offers/${offer.id}/accept`, vera.key, {})
    shift += 3 * HOUR
    await api(server, `${rooms}/offers/${offer.id}/mark`, borya.key, { winner: 'author' })
    await api(server, `${rooms}/offers/${offer.id}/mark`, vera.key, { winner: 'taker' })
    await api(server, `${rooms}/offers/${offer.id}/decide`, person('Гена').key, { winner: 'author' })
    const offerHref = `${SITE}#/room/${room.roomId}/offer/${offer.id}`
    await v.goto(offerHref)
    await v.waitText(', если до неё нет апелляции.')
    await v.press('Подать апелляцию')
    await v.fill('Причина апелляции', 'Ветер был боковой — видно на видео')
    await v.click('Подать апелляцию')
    await v.waitIn('.modal', 'Апелляция одна на пари.')
    await confirmTwice(v, 'Апелляция: Вера (вы)')
    await v.waitIn(COURT, 'ещё не голосовал(а)')
    await check(v, 'Пари: суд идёт')
    await v.shot('88-pari-sud-idyot')

    // Член суда по пари голосует «отменить»; Аня — тоже, третий — «оставить»: пари отменено судом
    const bet = (await state()).offers.find((o) => o.id === offer.id)?.outcome?.court
    if (!bet || bet.seats.length !== 3) throw new Error('Суд по пари: ' + JSON.stringify(bet))
    const [offerJuror, offerThird] = [byId(bet.seats[1].member as string), byId(bet.seats[2].member as string)]
    const oj = deviceOf(offerJuror)
    await oj.goto(offerHref)
    await oj.waitText('Вы в суде: голос до')
    await oj.waitIn(COURT, 'Изменить на „прав соперник“')
    await check(oj, 'Пари: член суда')
    await oj.shot('89-pari-chlen-suda')
    await oj.press('Отменить — вернуть ставки')
    await oj.waitIn('.modal', 'Голос не изменить.')
    await confirmTwice(oj, 'голос: отменить — вернуть ставки')
    await api(server, `${rooms}/offers/${offer.id}/judge`, room.key, { verdict: 'cancel' })
    await api(server, `${rooms}/offers/${offer.id}/judge`, offerThird.key, { verdict: 'keep' })
    await v.waitText('Пари отменено судом — ставки возвращены')
    await v.waitText('Решение суда: отменить — вернуть ставки')
    if (await v.eval<boolean>(`!!document.querySelector('section[aria-label="Итог пари"]')`)) throw new Error('У отменённого судом пари остался итог')
    await check(v, 'Пари: отменено судом')
    await v.shot('90-pari-otmeneno-sudom')
  } finally {
    await server.close()
  }
}
