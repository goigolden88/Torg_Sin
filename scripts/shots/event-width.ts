import { api, CONTENT_MAX, Device, EVENT_WIDTHS, PASSWORD, PLACEMENT, SITE, SIZES, sleep, type Cdp, type Placement, type ServerModule } from './common.ts'

// Событие и «Новое событие» на компьютере (#30, #38): на 1024–2560 px, меню развёрнуто и свёрнуто,
// карточка — во всю ширину области справа от меню (не шире --content-max), область — по центру;
// списка комнат нет, «Назад» есть; график и выплаты — внутри карточки, таблицей. От 1280 px —
// две колонки: правая (график и лента; у формы — исходы и сроки) — справа от левой, её верх —
// не ниже середины левой; ≈ 55 / 45 у события. Уже — одна под другой.
// Событие с графиком и утверждённым исходом с выплатами — на своём сервере с подставными часами
export async function eventWidth(cdp: Cdp, startServer: ServerModule['startServer']) {
  console.log('Ширина события на компьютере')
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
    const j = await api<{ memberId: string; key: string }>(server, `${rooms}/join`, '', { invite: room.invite, name: 'Боря' })
    await api(server, `${rooms}/admit`, room.key, { request: j.memberId })
    const closesAt = Date.now() + 3000
    const { event } = await api<{ event: { id: string } }>(server, `${rooms}/events`, room.key, {
      condition: 'К обеду клюнет хотя бы десять рыб',
      check: 'Считаем улов в ведре в 14:00',
      closesAt,
      expectedAt: closesAt + HOUR,
    })
    await api(server, `${rooms}/events/${event.id}/bets`, room.key, { outcome: '1', amount: 40000 })
    await sleep(700) // точки графика — порознь по времени
    await api(server, `${rooms}/events/${event.id}/bets`, j.key, { outcome: '2', amount: 60000 })
    shift += HOUR // приём закрыт
    await api(server, `${rooms}/events/${event.id}/propose`, room.key, { outcome: '1' })
    shift += 25 * HOUR // сутки без возражений — утверждён, выплаты

    const { token } = await api<{ token: string }>(server, `${rooms}/device`, room.key, {})
    const host = await Device.open(cdp, SIZES[0], 'Аня')
    await host.goto(`${SITE}#/device/${room.roomId}/${token}?server=${encodeURIComponent(server.url)}`)
    await host.waitText('Открыть комнату здесь')
    await host.press('Открыть комнату здесь')
    await host.waitText('Участники')
    const eventHref = `${SITE}#/room/${room.roomId}/event/${event.id}`
    const newHref = `${SITE}#/room/${room.roomId}/event/new`
    await host.goto(eventHref)
    await host.waitText('Утверждён „Да“ — без возражений')
    await host.waitCount('.payouts', 1)
    await host.waitCount('.chart-plot', 1)
    // Телефон — как было
    const phone = await host.eval<Placement>(PLACEMENT)
    if (phone.scroll > 0) throw new Error('Событие на 390 px: прокрутка вбок ' + JSON.stringify(phone))
    await host.shot('33-sobytie-shirina')

    const problems: string[] = []
    const check = async (where: string, width: number, event: boolean) => {
      const p = await host.eval<Placement>(PLACEMENT)
      console.log(`  ${where}: ${JSON.stringify(p)}`)
      if (Math.abs(p.card - p.room) > 1) problems.push(`${where}: ширина ${p.card}, а область ${p.room}`)
      if (p.room > CONTENT_MAX + 1) problems.push(`${where}: область ${p.room} шире ${CONTENT_MAX}`)
      if (Math.abs(p.gapLeft - p.gapRight) > 2) problems.push(`${where}: не по центру — слева ${p.gapLeft}, справа ${p.gapRight}`)
      if (p.list) problems.push(`${where}: виден список комнат`)
      if (!p.back) problems.push(`${where}: нет «Назад»`)
      if (p.scroll > 0) problems.push(`${where}: прокрутка вбок ${p.scroll} px`)
      if (!p.inside) problems.push(`${where}: условие, колонки, график или выплаты вылезают из карточки`)
      if (!p.table) problems.push(`${where}: выплаты не таблицей`)
      const { left, right, position } = p
      if (!left || !right || (event && !position)) return void problems.push(`${where}: нет колонок или «Вашей позиции»`)
      if (width >= 1280) {
        const edge = event && position ? Math.max(left.right, position.right) : left.right
        if (right.left < edge) problems.push(`${where}: правая колонка (${right.left}) не справа от левой (${edge})`)
        if (right.top > (left.top + left.bottom) / 2) problems.push(`${where}: правая колонка начинается ниже середины левой`)
        const share = left.width / (left.width + right.width)
        if (event && Math.abs(share - 0.55) > 0.02) problems.push(`${where}: левая колонка — ${Math.round(share * 100)} %, а нужно ≈ 55 %`)
      } else if (right.top < left.bottom) problems.push(`${where}: до 1280 px колонки должны идти одна под другой`)
    }
    const nav = (collapsed: boolean) =>
      host.eval(`(() => {
        if (document.querySelector('.app').classList.contains('nav-collapsed') !== ${collapsed}) document.querySelector('.nav-toggle').click()
      })()`)
    const open = async (href: string, text: string) => {
      await host.goto(href)
      await host.waitText(text)
    }

    for (const size of EVENT_WIDTHS) {
      await host.resize(size)
      for (const collapsed of [false, true]) {
        await nav(collapsed)
        await sleep(200)
        const menu = collapsed ? 'меню свёрнуто' : 'меню развёрнуто'
        await open(eventHref, 'Утверждён „Да“ — без возражений')
        await host.waitCount('.chart-plot', 1)
        await check(`событие, ${size.width} px, ${menu}`, size.width, true)
        if (!collapsed && size.width !== 1536) await host.shot('33-sobytie-shirina')
        if (collapsed && size.width === 1440) await host.shot('34-sobytie-shirina-menu-svernuto')
        await open(newHref, 'Приём ставок до')
        await check(`новое событие, ${size.width} px, ${menu}`, size.width, false)
        if (!collapsed && size.width === 1440) await host.shot('35-novoe-sobytie-shirina')
      }
      await nav(false)
    }
    // Комната — во всю область (#167): списка комнат рядом нет, комнаты — в меню слева
    for (const size of [SIZES[1], EVENT_WIDTHS[2], EVENT_WIDTHS[5]]) {
      await host.resize(size)
      await open(`${SITE}#/room/${room.roomId}`, 'Участники')
      const split = await host.eval<{ list: boolean; menu: boolean; detail: number; room: number; scroll: number }>(`(() => {
        const detail = document.querySelector('.rooms .detail')
        const main = document.querySelector('.main')
        const style = getComputedStyle(main)
        return {
          list: document.querySelector('.rooms .list').offsetParent !== null,
          menu: [...document.querySelectorAll('.nav-rooms a')].some((a) => a.offsetParent !== null && a.getAttribute('aria-current') === 'page'),
          detail: Math.round(detail.getBoundingClientRect().width),
          room: Math.round(main.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)),
          scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }
      })()`)
      console.log(`  комната, ${size.width} px: ${JSON.stringify(split)}`)
      if (split.list) problems.push(`комната, ${size.width} px: рядом с комнатой — список комнат`)
      if (!split.menu) problems.push(`комната, ${size.width} px: открытой комнаты нет в меню`)
      if (Math.abs(split.detail - split.room) > 1) problems.push(`комната, ${size.width} px: открытое ${split.detail}, а область ${split.room}`)
      if (split.room > CONTENT_MAX + 1) problems.push(`комната, ${size.width} px: область ${split.room} шире ${CONTENT_MAX}`)
      if (split.scroll > 0) problems.push(`комната, ${size.width} px: прокрутка вбок ${split.scroll} px`)
      if (size.width === 1440) await host.shot('37-komnata-shirina')
    }
    if (problems.length) throw new Error('Раскладка события:\n' + problems.join('\n'))
  } finally {
    await server.close()
  }
}
