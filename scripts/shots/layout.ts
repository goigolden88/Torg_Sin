import { Device, PASSWORD, SITE, sleep, type Cdp, type RoomsServer, type Size } from './common.ts'

// Раскладка компьютера: две комнаты, в открытой — два участника; меню развёрнуто и свёрнуто.
// Комнаты — на общем сервере снимков
export async function layout(cdp: Cdp, size: Size, server: RoomsServer) {
  console.log(`Раскладка компьютера, ${size.width} px`)
  const host = await Device.open(cdp, size, 'ведущий')
  await host.goto(SITE + '#/')
  await host.waitText('Комнат пока нет')
  await host.eval(`localStorage.setItem('torgsin.server', ${JSON.stringify(server.url)})`)
  for (const name of ['Футбол по средам', 'Дача 2026']) {
    await host.click('Создать комнату')
    await host.waitText('Новая комната')
    await host.fill('Название', name)
    await host.fill('Ваше имя в комнате', 'Аня')
    await host.fill('Пароль компании', PASSWORD)
    await host.click('Создать')
    await host.waitText('Участники')
  }
  await host.click('Пригласить')
  await host.waitText('Отправьте ссылку друзьям')
  const invite = await host.value('input[aria-label="Ссылка-приглашение"]')
  await host.click('Закрыть')
  const friend = await Device.open(cdp, size, 'друг')
  await friend.goto(invite)
  await friend.waitText('Вход в комнату')
  await friend.fill('Ваше имя в комнате', 'Боря')
  await friend.click('Попроситься')
  await friend.waitText('Ждём, пока ведущий впустит')
  await host.waitText('Заявки (1)')
  await host.click('Впустить')
  await friend.waitText('Участники')
  await host.reload()
  await host.waitText('Боря')
  await host.shot('21-komnata-menu-razvernuto')

  // Свернуть меню: подписи скрыты, у значков — всплывающая подпись; положение помнится после перезагрузки
  await host.click('«')
  await sleep(200)
  const collapsed = await host.eval<{ app: boolean; labels: boolean; titles: string[]; toggle: string | null }>(`({
    app: document.querySelector('.app').classList.contains('nav-collapsed'),
    labels: [...document.querySelectorAll('.nav-label')].some((el) => el.offsetParent !== null),
    titles: [...document.querySelectorAll('.nav-item')].map((el) => el.title),
    toggle: document.querySelector('.nav-toggle').getAttribute('aria-label'),
  })`)
  if (!collapsed.app || collapsed.labels || collapsed.titles.some((t) => !t) || collapsed.toggle !== 'Развернуть меню')
    throw new Error('Меню не свернулось: ' + JSON.stringify(collapsed))
  await host.shot('22-komnata-menu-svernuto')
  await host.reload()
  await host.waitText('Боря')
  if (!(await host.eval<boolean>(`document.querySelector('.app').classList.contains('nav-collapsed')`)))
    throw new Error('После перезагрузки меню развернулось')
  await host.goto(SITE + '#/')
  await host.waitText('Выберите комнату слева')
  await host.shot('23-moi-komnaty-menu-svernuto')
  // Развернуть обратно
  await host.click('»')
  await sleep(200)
  if (await host.eval<boolean>(`document.querySelector('.app').classList.contains('nav-collapsed')`)) throw new Error('Меню не развернулось')
  if (await host.eval<string | null>(`localStorage.getItem('torgsin.navCollapsed')`)) throw new Error('Развёрнутое меню не запомнилось')
}
