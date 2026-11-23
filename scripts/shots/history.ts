import { api, Device, PASSWORD, SITE, type Cdp, type ServerModule, type Size } from './common.ts'

// «История» (#72). Свой запасной сервер с подставными часами: «исход к» — сдвигом часов. Комната «Поход
// на Ладогу»: Аня — ведущая, Боря, Вера, Гена (выдуманные). Сначала пусто: строки «История» в комнате
// нет, экран — «Прошедших событий, пари, лотов и выборов пока нет». Потом: пари 1 Аня — Боря, прав Боря (Аня −300 ₽);
// пари 2 Вера — Аня, права Аня (+900 ₽) — окончательно сразу; пари 3 Вера → Боря отозвано (Аня не
// участвовала); событие Бори отменено им самим; событие Веры с её ставкой — идёт; пари 4 Аня — Гена —
// решает гарант (не прошедшее). В комнате — «История · 4», прошедшего в «Событиях» и «Пари» нет;
// «История» — итоги и список, «С моим участием»; из «Истории» — пари, «Назад» — снова «История»
export async function history(cdp: Cdp, size: Size, startServer: ServerModule['startServer']) {
  console.log(`История, ${size.width} px`)
  const HOUR = 60 * 60 * 1000
  let shift = 0
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0, now: () => Date.now() + shift })
  try {
    const room = await api<{ roomId: string; invite: string; key: string; memberId: string }>(server, '/rooms', '', {
      password: PASSWORD,
      name: 'Поход на Ладогу',
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
    const roomHref = `${SITE}#/room/${room.roomId}`
    const historyHref = `${roomHref}/history`
    const MAIN = '.detail'
    const EVENTS = 'section[aria-label="События"]'
    const OFFERS = 'section[aria-label="Пари"]'
    const noScroll = async (where: string) => {
      const scroll = await host.eval<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
      if (scroll > 0) throw new Error(`${where} на ${size.width} px: прокрутка вбок ${scroll} px`)
    }
    // Нажимаемое на экране — не ниже 44 px
    const tall = async (where: string) => {
      const low = await host.eval<number>(
        `[...document.querySelectorAll('.history a, .history label, .history-link')].filter((b) => b.offsetParent !== null && b.getBoundingClientRect().height < 44).length`,
      )
      if (low > 0) throw new Error(`${where} на ${size.width} px: нажимаемого ниже 44 px — ${low}`)
    }
    const absent = async (selector: string, text: string, where: string) => {
      const seen = await host.eval<boolean>(`(document.querySelector(${JSON.stringify(selector)})?.innerText ?? '').includes(${JSON.stringify(text)})`)
      if (seen) throw new Error(`${where} на ${size.width} px: «${text}» осталось`)
    }

    // На устройство Ани — ссылкой для другого устройства
    const host = await Device.open(cdp, size, 'Аня')
    const { token } = await api<{ token: string }>(server, `${rooms}/device`, room.key, {})
    await host.goto(`${SITE}#/device/${room.roomId}/${token}?server=${encodeURIComponent(server.url)}`)
    await host.waitText('Открыть комнату здесь')
    await host.click('Открыть комнату здесь')
    await host.waitText('Участники')

    // Пусто: строки «История» нет, экран — «пока нет»
    await host.waitText('Пари пока нет')
    await absent(MAIN, 'История ·', 'Комната без прошедшего')
    await host.goto(historyHref)
    await host.waitIn(MAIN, 'Прошедших событий, пари, лотов и выборов пока нет')
    await noScroll('История: пусто')
    await host.shot('120-istoriya-pusto')

    // Споры через сервер: пари — принять сразу, «исход к» — через час после «приём до»
    const offer = async (key: string, takerKey: string | null, body: object) => {
      const closesAt = Date.now() + shift + HOUR
      const { offer } = await api<{ offer: { id: string } }>(server, `${rooms}/offers`, key, { closesAt, expectedAt: closesAt + HOUR, odds: { a: 1, b: 1 }, ...body })
      if (takerKey) await api(server, `${rooms}/offers/${offer.id}/accept`, takerKey, {})
      return offer.id
    }
    const mark = (id: string, key: string, winner: 'author' | 'taker') => api(server, `${rooms}/offers/${id}/mark`, key, { winner })
    const lost = await offer(room.key, borya.key, { condition: 'Дойдём до маяка за день', check: 'Время по трекеру', amount: 30000, to: borya.memberId, guarantor: gena.memberId })
    const won = await offer(vera.key, room.key, { condition: 'На озере будет шторм', check: 'Прогноз и вид с берега', amount: 90000, to: room.memberId, guarantor: gena.memberId })
    const guarded = await offer(room.key, gena.key, { condition: 'Уха будет готова к восьми', check: 'Часы у костра', amount: 20000, to: gena.memberId, guarantor: borya.memberId })
    const revoked = await offer(vera.key, null, { condition: 'Боря первым увидит нерпу', check: 'Фото в общий чат', amount: 10000, to: borya.memberId, guarantor: gena.memberId })
    await api(server, `${rooms}/offers/${revoked}/revoke`, vera.key, {})
    const closesAt = Date.now() + 24 * HOUR
    const { event: cancelled } = await api<{ event: { id: string } }>(server, `${rooms}/events`, borya.key, {
      condition: 'Палатки поставим до темноты',
      check: 'Фото лагеря в чат',
      closesAt,
      expectedAt: closesAt + HOUR,
    })
    await api(server, `${rooms}/events/${cancelled.id}/bets`, borya.key, { outcome: '1', amount: 20000 })
    await api(server, `${rooms}/events/${cancelled.id}/cancel`, borya.key, {})
    const { event: live } = await api<{ event: { id: string } }>(server, `${rooms}/events`, vera.key, {
      condition: 'Комары не дадут уснуть',
      check: 'Голосуем утром',
      closesAt,
      expectedAt: closesAt + HOUR,
    })
    await api(server, `${rooms}/events/${live.id}/bets`, room.key, { outcome: '1', amount: 50000 })
    shift += 3 * HOUR // «исход к» настал у всех пари
    await mark(lost, room.key, 'taker')
    await mark(lost, borya.key, 'taker')
    await mark(won, vera.key, 'taker')
    await mark(won, room.key, 'taker')
    await mark(guarded, room.key, 'author')
    await mark(guarded, gena.key, 'taker') // разошлись — решает гарант Боря

    // Комната: «История · 4», прошедшего в списках нет, идущее — на месте
    await host.goto(roomHref)
    await host.waitText('История · 4')
    await host.waitIn(EVENTS, 'Комары не дадут уснуть')
    await host.waitIn(OFFERS, 'Уха будет готова к восьми')
    for (const [selector, text] of [
      [EVENTS, 'Палатки поставим до темноты'],
      [OFFERS, 'Дойдём до маяка за день'],
      [OFFERS, 'На озере будет шторм'],
      [OFFERS, 'Боря первым увидит нерпу'],
    ])
      await absent(selector, text, 'Комната с прошедшим')
    await noScroll('Комната со строкой «История»')
    await tall('Комната со строкой «История»')
    await host.shot('121-komnata-istoriya')

    // «История»: итоги по убыванию, прошедшее новое сверху с исходом и моим результатом
    await host.click('История · 4')
    await host.waitIn(MAIN, 'Итоги')
    for (const text of [
      'Аня',
      '+600 ₽ по 2 пари',
      'Дойдём до маяка за день',
      'Пари · исход: Не сбылось',
      '−300 ₽',
      'На озере будет шторм',
      '+900 ₽',
      'Пари · исход: не состоялось — отозвано',
      'вы не участвовали',
      'Событие · исход: отменено',
      'Все · 4',
      'С моим участием · 2',
    ])
      await host.waitIn(MAIN, text)
    await absent(MAIN, 'Комары не дадут уснуть', 'История')
    await absent(MAIN, 'Уха будет готова к восьми', 'История')
    const first = await host.eval<string>(`document.querySelector('.history-totals .member span').innerText`)
    if (!first.startsWith('Аня')) throw new Error('Итоги: первым — ' + first)
    await noScroll('История')
    await tall('История')
    await host.shot('122-istoriya')

    // «С моим участием» — только свои
    await host.click('С моим участием')
    await host.waitCount('.history-list .event-item', 2)
    await absent(MAIN, 'Боря первым увидит нерпу', 'История: с моим участием')
    await absent(MAIN, 'Палатки поставим до темноты', 'История: с моим участием')
    await noScroll('История: с моим участием')
    await host.shot('123-istoriya-moi')

    // Из «Истории» — тот же экран пари; «Назад» — снова «История»
    await host.click('Дойдём до маяка за день')
    await host.waitText('Утверждено согласием сторон, окончательно')
    await host.click('← Назад')
    await host.waitIn(MAIN, 'Прошедшие события, пари, лоты и выборы')
    const hash = await host.eval<string>('location.hash')
    if (!hash.endsWith('/history')) throw new Error('«Назад» с прошедшего пари привёл не в «Историю»: ' + hash)

    // Прямая ссылка на прошедшее событие — открывается как раньше
    await host.goto(`${roomHref}/event/${cancelled.id}`)
    await host.waitText('отменено — ставки возвращены')
  } finally {
    await server.close()
  }
}
