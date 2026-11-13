import { api, confirmTwice, Device, PASSWORD, SITE, type Cdp, type ServerModule, type Size } from './common.ts'

// Пари (#52). Свой запасной сервер; комната «Дача 2026»: Аня — ведущая, Боря, Вера; на устройства —
// ссылкой для другого устройства. Пусто → Аня предлагает Боре «3 к 1, 300 ₽» (ведущая — сторона:
// гарант — Вера), двойное нажатие — одно пари → у Бори в списке с суммами обеих сторон → принимает с
// подтверждением → у Ани «принято» само. Открытое «2 к 1» → Боря делает встречное «1 к 3» → Аня
// видит, что встречное ждёт её ответа, принимает его — исходное «закрыто встречным». Отзыв своего
// до принятия. Список со всеми статусами; старая копия пари на устройстве — с сервера, не падение
export async function offers(cdp: Cdp, size: Size, startServer: ServerModule['startServer']) {
  console.log(`Пари, ${size.width} px`)
  const HOUR = 60 * 60 * 1000
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0 })
  try {
    const room = await api<{ roomId: string; invite: string; key: string; memberId: string }>(server, '/rooms', '', {
      password: PASSWORD,
      name: 'Дача 2026',
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
    const roomHref = `${SITE}#/room/${room.roomId}`
    const offerHref = (id: string) => `${SITE}#/room/${room.roomId}/offer/${id}`
    const LIST = 'section[aria-label="Пари"]'
    // Выбор в форме по номеру участника: подписи «Боря» и «Вера» есть и у «Кому», и у «Гаранта»
    const pick = (device: Device, name: string, value: string) =>
      device.eval(`document.querySelector('input[name="${name}"][value="${value}"]').click()`)
    const buttons = (device: Device) =>
      device.eval<string[]>(`[...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null).map((b) => b.innerText.trim())`)
    const noScroll = async (device: Device, where: string) => {
      const scroll = await device.eval<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
      if (scroll > 0) throw new Error(`${where} на ${size.width} px: прокрутка вбок ${scroll} px`)
    }
    // От 1280 px — пари и список пари комнаты рядом; уже — одно под другим
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

    await host.goto(roomHref)
    await host.waitText('Пари пока нет')
    await host.shot('43-pari-net')

    // Адресное пари: Аня → Боря, «сбудется», 3 к 1, 300 ₽; ведущая — сторона, гарант — Вера
    await host.click('Предложить пари')
    await host.waitText('Ваша сторона')
    await host.fill('Условие', 'Боря подтянется 20 раз до конца месяца')
    await host.fill('Как проверяем', 'Видео в общий чат, считаем вместе')
    await host.fill('Вы рискуете', '3')
    await host.fill('Соперник', '1')
    await host.fill('Ваша сумма, ₽', '300')
    await pick(host, 'offer-to', borya.memberId)
    await host.waitText('Ведущий — сторона пари: выберите гаранта')
    await pick(host, 'offer-guarantor', vera.memberId)
    await host.waitIn('.offer-summary', 'Вы ставите 300 ₽ на „сбудется“, соперник — 100 ₽ на „не сбудется“, банк 400 ₽ (кэф 3 к 1).')
    await noScroll(host, 'Форма пари')
    await host.shot('44-novoe-pari')
    await host.click('Предложить')
    await host.waitText('Предложить пари?')
    await host.waitIn('.modal', 'Вы ставите 300 ₽ на „сбудется“, соперник — 100 ₽ (кэф 3 к 1), банк 400 ₽.')
    await host.waitIn('.modal', 'Кому: Боря · гарант — Вера')
    await host.shot('44a-podtverzhdenie-pari')
    await confirmTwice(host, 'открыто — приём до')
    await host.waitText('Отозвать')
    const own = await buttons(host)
    if (own.includes('Принять') || own.includes('Встречное')) throw new Error('Автору видны «Принять» или «Встречное»: ' + own.join(', '))
    await columns(host, 'Пари')
    await noScroll(host, 'Пари')
    await host.shot('45-pari-otkryto-avtor')

    // Боря видит пари в комнате — с суммами обеих сторон, принимает с подтверждением
    await boryaPhone.goto(roomHref)
    await boryaPhone.waitIn(LIST, 'Аня ставит 300 ₽ на „сбудется“, соперник — 100 ₽ (кэф 3 к 1), банк 400 ₽')
    await boryaPhone.waitIn(LIST, 'кому — Боря (вы)')
    await boryaPhone.waitIn(LIST, 'открыто — приём до')
    await boryaPhone.shot('46-spisok-pari')
    await boryaPhone.click('Боря подтянется 20 раз до конца месяца')
    await boryaPhone.waitText('Принять')
    await boryaPhone.shot('47-pari-adresatu')
    await boryaPhone.click('Принять')
    await boryaPhone.waitIn('.modal', 'Вы ставите 100 ₽ против 300 ₽ — кэф 3 к 1, банк 400 ₽.')
    await boryaPhone.shot('47a-prinyat-podtverzhdenie')
    await confirmTwice(boryaPhone, 'принято — ждём исхода к')
    const left = await buttons(boryaPhone)
    if (left.some((b) => ['Принять', 'Встречное', 'Отозвать'].includes(b))) throw new Error('У принятого пари остались кнопки: ' + left.join(', '))
    await boryaPhone.shot('48-pari-prinyato')
    await host.waitText('принято — ждём исхода к') // у Ани — само, опросом
    await host.waitText('Боря — за „не сбудется“, принято')

    // Открытое пари Ани — Боря делает встречное «1 к 3»: 100 ₽ против 300 ₽
    const closesAt = Date.now() + 24 * HOUR
    const { offer: wide } = await api<{ offer: { id: string } }>(server, `${rooms}/offers`, room.key, {
      condition: 'В субботу на рыбалке поймаем щуку',
      check: 'Фото улова в общий чат',
      odds: { a: 2, b: 1 },
      amount: 20000,
      closesAt,
      expectedAt: closesAt + 48 * HOUR,
      guarantor: vera.memberId,
    })
    await boryaPhone.goto(offerHref(wide.id))
    await boryaPhone.waitText('открытое — любой')
    await boryaPhone.click('Встречное')
    await boryaPhone.waitText('Встречное — новое пари, ответит автор — Аня')
    await boryaPhone.waitIn('.offer-summary', 'Вы ставите 100 ₽, Аня — 200 ₽, банк 300 ₽ (кэф 1 к 2).') // те же условия со своей стороны
    await boryaPhone.fill('Аня', '3')
    await boryaPhone.waitIn('.offer-summary', 'Вы ставите 100 ₽, Аня — 300 ₽, банк 400 ₽ (кэф 1 к 3).')
    await boryaPhone.shot('49-vstrechnoe-forma')
    await boryaPhone.click('Предложить встречное')
    await boryaPhone.waitText('Предложить встречное?')
    await boryaPhone.waitIn('.modal', 'Вы ставите 100 ₽ на „не сбудется“, Аня — 300 ₽ (кэф 1 к 3), банк 400 ₽.')
    await confirmTwice(boryaPhone, 'Встречное ждёт ответа автора — Аня.')
    await boryaPhone.shot('50-vstrechnoe-zhdyot')

    // Аня: у исходного — встречное ждёт её ответа; принимает его — исходное закрыто встречным
    await host.goto(offerHref(wide.id))
    await host.waitText('ждёт вашего ответа')
    await host.shot('51-vstrechnoe-u-avtora')
    await host.click('Боря предлагает встречное')
    await host.waitText('Встречное ждёт вашего ответа.')
    await host.click('Принять')
    await host.waitIn('.modal', 'Вы ставите 300 ₽ против 100 ₽ — кэф 1 к 3, банк 400 ₽.')
    await confirmTwice(host, 'принято — ждём исхода к')
    await host.goto(offerHref(wide.id))
    await host.waitText('закрыто встречным')
    await host.waitText('Закрыто встречным (встречное — Боря): автор принял его')
    await host.shot('52-zakryto-vstrechnym')

    // Отозвать своё до принятия
    const { offer: revoked } = await api<{ offer: { id: string } }>(server, `${rooms}/offers`, room.key, {
      condition: 'Вера приедет на дачу раньше всех',
      check: 'Кто первым напишет «я на месте» в чат',
      side: 'no',
      odds: { a: 1, b: 1 },
      amount: 50000,
      to: borya.memberId,
      closesAt,
      expectedAt: closesAt + 24 * HOUR,
      guarantor: vera.memberId,
    })
    await host.goto(offerHref(revoked.id))
    await host.waitText('Отозвать')
    await host.click('Отозвать')
    await host.waitText('Отозвать пари?')
    await host.shot('53-otozvat-podtverzhdenie')
    await confirmTwice(host, 'Автор отозвал пари')
    await host.shot('53a-otozvano')

    // Список: открытые и принятые сверху, ниже отозванные и закрытые встречным
    await host.goto(roomHref)
    await host.waitIn(LIST, 'Отозванные, истёкшие и закрытые встречным')
    await host.waitIn(LIST, 'отозвано')
    await noScroll(host, 'Комната с пари')
    await host.shot('54-spisok-pari-vse')
    // Двойные нажатия не дали лишних пари: четыре — два через экран, два через сервер, встречное
    const seen = (await (await fetch(server.url + rooms, { headers: { Authorization: 'Bearer ' + room.key } })).json()) as { offers: unknown[] }
    if (seen.offers.length !== 4) throw new Error('Пари на сервере: ' + seen.offers.length + ', а ждали 4')

    // Старая копия на устройстве: пари записаны до исхода (Р-23) — без outcome. Экран не падает,
    // копию не показывает, а пари открывается с сервера
    await boryaPhone.goto(`${SITE}#/`)
    await boryaPhone.waitText('Дача 2026')
    await boryaPhone.editRooms(`(room.offers || []).forEach((o) => { delete o.outcome })`)
    await boryaPhone.reload()
    await boryaPhone.waitText('Дача 2026')
    await boryaPhone.goto(offerHref(wide.id))
    await boryaPhone.waitText('закрыто встречным')
    if (await boryaPhone.eval<boolean>(`document.body.innerText.includes('Что-то пошло не так')`)) throw new Error('Старая копия пари уронила экран')
  } finally {
    await server.close()
  }
}
