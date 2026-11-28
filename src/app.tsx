// Оболочка: шапка телефона, меню и экран (Р-10, Р-50, #167). До 1024 px — шапка (☰, название экрана,
// «+») и меню, выезжающее поверх; от 1024 — меню колонкой слева, шапки нет. Раскладку меняет только CSS
// (styles.css), разметка одна
import { useCallback, useEffect, useState } from 'react'
import { parseDeviceLink, parseInviteLink } from './rules/link'
import type { SavedRoom } from './store/db'
import { ErrorBoundary } from './screens/ErrorBoundary'
import { Menu, type MenuPlace } from './screens/Menu'
import { openRoomId, Rooms, type RoomsView } from './screens/Rooms'
import { Settings } from './screens/Settings'
import { useSavedRooms } from './screens/useSavedRooms'
import { getNavCollapsed, setNavCollapsed } from './settings'

type Route = { tab: 'settings' } | { tab: 'rooms'; view: RoomsView }

const BAD_INVITE = 'Ссылка недействительна — попросите новую у ведущего'
const BAD_DEVICE = 'Ссылка для другого устройства недействительна — попросите новую'

// Хеш-роутинг: GitHub Pages отдаёт один index.html на любой адрес.
// #/ — список, #/new — создать комнату, #/paste — «Вставить ссылку», #/room/<номер> — открытая комната, #/settings;
// #/room/<номер>/event/new — новое событие, #/room/<номер>/event/<номер события> — событие;
// #/room/<номер>/offer/new — предложить пари, #/room/<номер>/offer/<номер пари> — пари;
// #/room/<номер>/lot/new — выставить лот, #/room/<номер>/lot/<номер лота> — лот;
// #/room/<номер>/choice/new — начать выбор, #/room/<номер>/choice/<номер выбора> — выбор;
// #/room/<номер>/settle — «Расчёт»; #/room/<номер>/history — «История»; #/join/<номер>/<токен>[?server=…] — ссылка-приглашение, #/device/<номер>/<токен>[?server=…] —
// ссылка для другого устройства (src/rules/link.ts)
function routeFromHash(): Route {
  const hash = location.hash
  if (hash === '#/settings') return { tab: 'settings' }
  if (hash === '#/new') return { tab: 'rooms', view: { kind: 'new' } }
  if (hash === '#/paste') return { tab: 'rooms', view: { kind: 'paste' } }
  if (hash.startsWith('#/join/')) {
    const link = parseInviteLink(hash)
    return { tab: 'rooms', view: link ? { kind: 'join', link } : { kind: 'bad-link', text: BAD_INVITE } }
  }
  if (hash.startsWith('#/device/')) {
    const link = parseDeviceLink(hash)
    return { tab: 'rooms', view: link ? { kind: 'device', link } : { kind: 'bad-link', text: BAD_DEVICE } }
  }
  const room = /^#\/room\/([^/?]+)$/.exec(hash)
  if (room) return { tab: 'rooms', view: { kind: 'room', id: decodeURIComponent(room[1]) } }
  // #/room/<номер>/settle — «Расчёт» (в комнате на очки — «Таблица очков»)
  const settle = /^#\/room\/([^/?]+)\/settle$/.exec(hash)
  if (settle) return { tab: 'rooms', view: { kind: 'settle', id: decodeURIComponent(settle[1]) } }
  // #/room/<номер>/history — «История»: прошедшие события и пари, итоги участников
  const history = /^#\/room\/([^/?]+)\/history$/.exec(hash)
  if (history) return { tab: 'rooms', view: { kind: 'history', id: decodeURIComponent(history[1]) } }
  // #/room/<номер>/event/new — новое событие, #/room/<номер>/event/<номер события> — событие
  const event = /^#\/room\/([^/?]+)\/event\/([^/?]+)$/.exec(hash)
  if (event) {
    const id = decodeURIComponent(event[1])
    return { tab: 'rooms', view: event[2] === 'new' ? { kind: 'new-event', id } : { kind: 'event', id, event: decodeURIComponent(event[2]) } }
  }
  // #/room/<номер>/offer/new?repeat=<номер пари> — «Повторить» не состоявшийся торг (Р-37): форма с его условиями
  const repeat = /^#\/room\/([^/?]+)\/offer\/new\?repeat=([^/?&]+)$/.exec(hash)
  if (repeat) return { tab: 'rooms', view: { kind: 'new-offer', id: decodeURIComponent(repeat[1]), repeat: decodeURIComponent(repeat[2]) } }
  // #/room/<номер>/offer/new — предложить пари, #/room/<номер>/offer/<номер пари> — пари
  const offer =/^#\/room\/([^/?]+)\/offer\/([^/?]+)$/.exec(hash)
  if (offer) {
    const id = decodeURIComponent(offer[1])
    return { tab: 'rooms', view: offer[2] === 'new' ? { kind: 'new-offer', id } : { kind: 'offer', id, offer: decodeURIComponent(offer[2]) } }
  }
  // #/room/<номер>/lot/new — «Новый лот», #/room/<номер>/lot/<номер лота> — лот (Р-38)
  const lot = /^#\/room\/([^/?]+)\/lot\/([^/?]+)$/.exec(hash)
  if (lot) {
    const id = decodeURIComponent(lot[1])
    return { tab: 'rooms', view: lot[2] === 'new' ? { kind: 'new-lot', id } : { kind: 'lot', id, lot: decodeURIComponent(lot[2]) } }
  }
  // #/room/<номер>/choice/new — «Новый выбор», #/room/<номер>/choice/<номер выбора> — выбор (Р-39)
  const choice = /^#\/room\/([^/?]+)\/choice\/([^/?]+)$/.exec(hash)
  if (choice) {
    const id = decodeURIComponent(choice[1])
    return { tab: 'rooms', view: choice[2] === 'new' ? { kind: 'new-choice', id } : { kind: 'choice', id, choice: decodeURIComponent(choice[2]) } }
  }
  return { tab: 'rooms', view: { kind: 'list' } }
}

// Пункт меню, который выделен на этом адресе
function placeOf(route: Route): MenuPlace {
  if (route.tab === 'settings') return 'settings'
  const { view } = route
  if (view.kind === 'list') return 'summary'
  if (view.kind === 'new') return 'new'
  if (view.kind === 'paste') return 'paste'
  const room = openRoomId(view)
  return room ? { room } : null
}

// Название экрана в шапке телефона: в комнате и её экранах — название комнаты
function titleOf(route: Route, rooms: SavedRoom[] | null): string {
  if (route.tab === 'settings') return 'Настройки'
  const { view } = route
  // Главный экран: «Сводка» над «Моими комнатами» (#168); комнат нет — «Сводки» нет, только список
  if (view.kind === 'list') return rooms && rooms.length > 0 ? 'Сводка' : 'Мои комнаты'
  if (view.kind === 'new') return 'Новая комната'
  if (view.kind === 'paste') return 'Вставить ссылку'
  if (view.kind === 'join' || view.kind === 'device' || view.kind === 'bad-link') return 'Вход в комнату'
  const id = openRoomId(view)
  const name = rooms?.find((r) => r.id === id)?.name
  return typeof name === 'string' && name ? name : 'Комната'
}

export function App() {
  const [route, setRoute] = useState<Route>(routeFromHash)
  // Меню на телефоне: выехало или нет; любой переход его закрывает
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    const onHash = () => {
      setRoute(routeFromHash())
      setMenuOpen(false)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  // Комнаты устройства — одни для меню и «Моих комнат»; перечитываются при смене раздела, как раньше
  // при каждом входе в «Мои комнаты»
  const saved = useSavedRooms(route.tab)

  // Меню слева сворачивается до значков — только на компьютере (кнопку и свёрнутый вид
  // показывает CSS от 1024 px); положение — настройка устройства
  const [collapsed, setCollapsed] = useState(getNavCollapsed)
  const toggleNav = () => {
    setNavCollapsed(!collapsed)
    setCollapsed(!collapsed)
  }

  const title = titleOf(route, saved.rooms)
  return (
    <div className={'app' + (collapsed ? ' nav-collapsed' : '') + (menuOpen ? ' menu-open' : '')}>
      <header className="topbar">
        <button
          className="topbar-button"
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Меню"
          aria-expanded={menuOpen}
          aria-controls="menu"
          title="Меню"
        >
          <span aria-hidden="true">☰</span>
        </button>
        <span className="topbar-title">{title}</span>
        <a className="topbar-button" href="#/new" aria-label="Новая комната" title="Новая комната">
          <span aria-hidden="true">+</span>
        </a>
      </header>
      {/* Затемнение под выехавшим меню: нажатие мимо меню его закрывает */}
      <div className="menu-shade" aria-hidden="true" onClick={closeMenu} />
      <Menu rooms={saved.rooms} place={placeOf(route)} open={menuOpen} collapsed={collapsed} onClose={closeMenu} onToggle={toggleNav} />
      <main className="main">
        {/* Экран упал — меню на месте, вместо экрана «Что-то пошло не так»; другой адрес — снова экран */}
        <ErrorBoundary resetKey={location.hash}>{route.tab === 'rooms' ? <Rooms view={route.view} saved={saved} /> : <Settings />}</ErrorBoundary>
      </main>
    </div>
  )
}
