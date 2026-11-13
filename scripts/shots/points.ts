import { api, Device, PASSWORD, SITE, SIZES, sleep, type Cdp, type ServerModule } from './common.ts'

// Комната в очках (#31): «Да» 300, «Нет» 500 — «Банк 800 очков», вероятности 38 % и 62 % (в сумме
// 100), в позиции «получите 800 очков» и «0 очков»; на телефоне и компьютере
export async function points(cdp: Cdp, startServer: ServerModule['startServer']) {
  console.log('Комната в очках')
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0 })
  try {
    const room = await api<{ roomId: string; invite: string; key: string }>(server, '/rooms', '', {
      password: PASSWORD,
      name: 'Футбол по средам',
      currency: 'PTS',
      hostName: 'Олег',
    })
    const rooms = `/rooms/${room.roomId}`
    const j = await api<{ memberId: string; key: string }>(server, `${rooms}/join`, '', { invite: room.invite, name: 'Гена' })
    await api(server, `${rooms}/admit`, room.key, { request: j.memberId })
    const closesAt = Date.now() + 24 * 60 * 60 * 1000
    const { event } = await api<{ event: { id: string } }>(server, `${rooms}/events`, room.key, {
      condition: 'В среду придёт хотя бы десять человек',
      check: 'Считаем на поле в 20:00',
      closesAt,
      expectedAt: closesAt + 60 * 60 * 1000,
    })
    await api(server, `${rooms}/events/${event.id}/bets`, j.key, { outcome: '1', amount: 300 })
    await sleep(700) // точки графика — порознь по времени
    await api(server, `${rooms}/events/${event.id}/bets`, room.key, { outcome: '2', amount: 500 })

    const { token } = await api<{ token: string }>(server, `${rooms}/device`, room.key, {})
    const host = await Device.open(cdp, SIZES[0], 'Олег')
    await host.goto(`${SITE}#/device/${room.roomId}/${token}?server=${encodeURIComponent(server.url)}`)
    await host.waitText('Открыть комнату здесь')
    await host.click('Открыть комнату здесь')
    await host.waitText('Участники')
    const N = ' ' // неразрывный пробел между числом и словом
    for (const size of SIZES) {
      await host.resize(size)
      await host.goto(`${SITE}#/room/${room.roomId}/event/${event.id}`)
      for (const text of [`Банк 800${N}очков`, `38${N}%`, `62${N}%`, `получите 800${N}очков`, `получите 0${N}очков`]) await host.waitText(text)
      const wrong = await host.eval<boolean>(`document.body.innerText.includes('63\\u00a0%') || /\\d\\u00a0очки/.test(document.body.innerText)`)
      if (wrong) throw new Error('Комната в очках: «63 %» или «… очки» при числе')
      await host.shot('36-ochki')
    }
  } finally {
    await server.close()
  }
}
