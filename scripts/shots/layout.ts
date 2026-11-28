import { Device, PASSWORD, SITE, sleep, type Cdp, type RoomsServer, type Size } from './common.ts'

// Меню (Р-50, #167): две комнаты, в открытой — два участника. Комнаты — на общем сервере снимков.
// Телефон (до 1024 px): шапка — ☰, название экрана, «+»; ☰ — меню выехало поверх с затемнением, в нём
// комнаты; закрывается ✕, Esc и нажатием мимо; нажал комнату — открылась, меню уехало.
// Компьютер: меню слева с комнатами, рядом с открытой комнатой списка нет; ««» — значки, положение
// помнится после перезагрузки; «»» — обратно; комнату открывают из меню
export async function layout(cdp: Cdp, size: Size, server: RoomsServer) {
  const desk = size.width >= 1024
  console.log(`Меню, ${size.width} px`)
  const host = await Device.open(cdp, size, 'ведущий')
  await host.goto(SITE + '#/')
  await host.waitText('Комнат пока нет')
  await host.eval(`localStorage.setItem('torgsin.server', ${JSON.stringify(server.url)})`)
  for (const name of ['Футбол по средам', 'Дача 2026']) {
    await host.goto(SITE + '#/new')
    await host.waitText('Новая комната')
    await host.fill('Название', name)
    await host.fill('Ваше имя в комнате', 'Аня')
    await host.fill('Пароль компании', PASSWORD)
    await host.press('Создать')
    await host.waitText('Участники')
  }
  await host.press('Пригласить')
  await host.waitText('Отправьте ссылку друзьям')
  const invite = await host.value('input[aria-label="Ссылка-приглашение"]')
  await host.press('Закрыть')
  const friend = await Device.open(cdp, size, 'друг')
  await friend.goto(invite)
  await friend.waitText('Вход в комнату')
  await friend.fill('Ваше имя в комнате', 'Боря')
  await friend.press('Попроситься')
  await friend.waitText('Ждём, пока ведущий впустит')
  await host.waitText('Заявки (1)')
  await host.press('Впустить')
  await friend.waitText('Участники')
  await host.reload()
  await host.waitText('Боря')
  const roomHash = await host.eval<string>('location.hash')

  // Что видно: меню, его комнаты (порядок, открытая), шапка, список комнат рядом
  const seen = () =>
    host.eval<{ menu: boolean; shade: boolean; rooms: string[]; current: string | null; top: string[]; list: boolean; scroll: number }>(`(() => {
      const visible = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0
      const top = document.querySelector('.topbar')
      return {
        menu: visible(document.querySelector('.nav')),
        shade: visible(document.querySelector('.menu-shade')),
        rooms: [...document.querySelectorAll('.nav-rooms .nav-room-name')].map((el) => el.textContent),
        current: document.querySelector('.nav-rooms [aria-current="page"] .nav-room-name')?.textContent ?? null,
        top: visible(top) ? [...top.children].map((el) => el.getAttribute('aria-label') || el.textContent.trim()) : [],
        list: visible(document.querySelector('.rooms .list')),
        scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })()`)
  const expectRooms = (s: Awaited<ReturnType<typeof seen>>, where: string) => {
    // Новая — сверху, как в «Моих комнатах»; открытая — выделена
    if (s.rooms.join(' | ') !== 'Дача 2026 | Футбол по средам') throw new Error(`${where}: комнаты в меню — ${JSON.stringify(s.rooms)}`)
    if (s.current !== 'Дача 2026') throw new Error(`${where}: открытая комната в меню не выделена — ${s.current}`)
    if (s.scroll > 0) throw new Error(`${where}: прокрутка вбок ${s.scroll} px`)
  }

  if (!desk) {
    // Телефон: шапка, меню спрятано
    const closed = await seen()
    if (closed.menu || closed.shade) throw new Error('Телефон: меню видно до ☰ ' + JSON.stringify(closed))
    if (closed.top.join(' | ') !== 'Меню | Дача 2026 | Новая комната') throw new Error('Телефон: шапка — ' + JSON.stringify(closed.top))
    await host.shot('21-komnata-shapka')
    const open = async () => {
      await host.press('☰')
      await sleep(200)
      const s = await seen()
      if (!s.menu || !s.shade) throw new Error('Телефон: ☰ не открыл меню ' + JSON.stringify(s))
      expectRooms(s, 'Телефон, меню')
    }
    const shut = async (how: string) => {
      await sleep(200)
      const s = await seen()
      if (s.menu || s.shade) throw new Error(`Телефон: меню не закрылось (${how})`)
    }
    await open()
    await host.shot('22-menu-vyehalo')
    await host.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
    await shut('Esc')
    await open()
    // Нажатие мимо меню — по затемнению справа
    await host.eval(`(() => {
      const r = document.querySelector('.nav').getBoundingClientRect()
      document.elementFromPoint(r.right + (innerWidth - r.right) / 2, innerHeight / 2).click()
    })()`)
    await shut('нажатие мимо')
    await open()
    await host.press('✕')
    await shut('✕')
    // Из меню — в другую комнату: открылась, меню уехало
    await open()
    await host.eval(`[...document.querySelectorAll('.nav-rooms a')].find((a) => a.innerText.includes('Футбол по средам')).click()`)
    await host.waitText('Участники')
    await shut('переход в комнату')
    const other = await host.eval<string>('location.hash')
    if (other === roomHash) throw new Error('Телефон: из меню не открылась другая комната')
    const s = await seen()
    if (s.top[1] !== 'Футбол по средам') throw new Error('Телефон: в шапке не название комнаты — ' + JSON.stringify(s.top))
    // «Мои комнаты» — главный экран со списком
    await host.goto(SITE + '#/')
    await host.waitText('Дача 2026')
    const home = await seen()
    if (!home.list || home.top[1] !== 'Мои комнаты') throw new Error('Телефон: «Мои комнаты» — ' + JSON.stringify(home))
    await host.shot('23-moi-komnaty')
    return
  }

  // Компьютер: меню слева с комнатами, шапки нет, списка рядом с открытой комнатой нет
  const wide = await seen()
  if (!wide.menu || wide.shade || wide.top.length) throw new Error('Компьютер: меню, затемнение, шапка — ' + JSON.stringify(wide))
  if (wide.list) throw new Error('Компьютер: рядом с открытой комнатой — список комнат')
  expectRooms(wide, 'Компьютер, меню развёрнуто')
  await host.shot('21-komnata-menu-razvernuto')

  // Свернуть меню: подписи скрыты, у значков — всплывающая подпись; положение помнится после перезагрузки
  await host.press('«')
  await sleep(200)
  const collapsed = await host.eval<{ app: boolean; labels: boolean; titles: string[]; letters: string[]; toggle: string | null }>(`({
    app: document.querySelector('.app').classList.contains('nav-collapsed'),
    labels: [...document.querySelectorAll('.nav-label')].some((el) => el.offsetParent !== null),
    titles: [...document.querySelectorAll('.nav-item')].map((el) => el.title),
    letters: [...document.querySelectorAll('.nav-rooms .nav-letter')].map((el) => el.textContent),
    toggle: document.querySelector('.nav-toggle').getAttribute('aria-label'),
  })`)
  if (!collapsed.app || collapsed.labels || collapsed.titles.some((t) => !t) || collapsed.toggle !== 'Развернуть меню' || collapsed.letters.join('') !== 'ДФ')
    throw new Error('Меню не свернулось: ' + JSON.stringify(collapsed))
  await host.shot('22-komnata-menu-svernuto')
  await host.reload()
  await host.waitText('Боря')
  if (!(await host.eval<boolean>(`document.querySelector('.app').classList.contains('nav-collapsed')`)))
    throw new Error('После перезагрузки меню развернулось')
  await host.goto(SITE + '#/')
  await host.waitText('Футбол по средам')
  if (!(await seen()).list) throw new Error('Компьютер: «Мои комнаты» без списка')
  await host.shot('23-moi-komnaty-menu-svernuto')
  // Развернуть обратно
  await host.press('»')
  await sleep(200)
  if (await host.eval<boolean>(`document.querySelector('.app').classList.contains('nav-collapsed')`)) throw new Error('Меню не развернулось')
  if (await host.eval<string | null>(`localStorage.getItem('torgsin.navCollapsed')`)) throw new Error('Развёрнутое меню не запомнилось')
  // Комнату — из меню
  await host.eval(`[...document.querySelectorAll('.nav-rooms a')].find((a) => a.innerText.includes('Дача 2026')).click()`)
  await host.waitText('Боря')
  if ((await host.eval<string>('location.hash')) !== roomHash) throw new Error('Компьютер: из меню открылась не та комната')
}
