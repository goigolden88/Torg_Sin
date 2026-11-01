// Оболочка: разделы и раскладка (Р-10). Телефон — вкладки снизу, компьютер — меню слева;
// раскладку меняет только CSS (styles.css), разметка одна
import { useEffect, useState } from 'react'
import { parseDeviceLink, parseInviteLink } from './rules/link'
import { Rooms, type RoomsView } from './screens/Rooms'
import { Settings } from './screens/Settings'
import { getNavCollapsed, setNavCollapsed } from './settings'

type Tab = 'rooms' | 'settings'
type Route = { tab: 'settings' } | { tab: 'rooms'; view: RoomsView }

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'rooms', label: 'Мои комнаты', icon: '🏠' },
  { id: 'settings', label: 'Настройки', icon: '⚙️' },
]

const BAD_INVITE = 'Ссылка недействительна — попросите новую у ведущего'
const BAD_DEVICE = 'Ссылка для другого устройства недействительна — попросите новую'

// Хеш-роутинг: GitHub Pages отдаёт один index.html на любой адрес.
// #/ — список, #/new — создать комнату, #/room/<номер> — открытая комната, #/settings;
// #/join/<номер>/<токен>[?server=…] — ссылка-приглашение, #/device/<номер>/<токен>[?server=…] —
// ссылка для другого устройства (src/rules/link.ts)
function routeFromHash(): Route {
  const hash = location.hash
  if (hash === '#/settings') return { tab: 'settings' }
  if (hash === '#/new') return { tab: 'rooms', view: { kind: 'new' } }
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
  return { tab: 'rooms', view: { kind: 'list' } }
}

export function App() {
  const [route, setRoute] = useState<Route>(routeFromHash)
  useEffect(() => {
    const onHash = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Меню слева сворачивается до значков — только на компьютере (кнопку и свёрнутый вид
  // показывает CSS от 1024 px); положение — настройка устройства
  const [collapsed, setCollapsed] = useState(getNavCollapsed)
  const toggleNav = () => {
    setNavCollapsed(!collapsed)
    setCollapsed(!collapsed)
  }
  const toggleLabel = collapsed ? 'Развернуть меню' : 'Свернуть меню'

  return (
    <div className={'app' + (collapsed ? ' nav-collapsed' : '')}>
      <nav className="nav" aria-label="Разделы">
        <div className="nav-head">
          <span className="brand">ТоргСин</span>
          <button className="nav-toggle" type="button" onClick={toggleNav} aria-expanded={!collapsed} aria-label={toggleLabel} title={toggleLabel}>
            <span aria-hidden="true">{collapsed ? '»' : '«'}</span>
          </button>
        </div>
        {TABS.map((t) => (
          <a
            key={t.id}
            href={t.id === 'rooms' ? '#/' : '#/' + t.id}
            className="nav-item"
            aria-current={route.tab === t.id ? 'page' : undefined}
            aria-label={t.label}
            title={collapsed ? t.label : undefined}
          >
            <span className="nav-icon" aria-hidden="true">
              {t.icon}
            </span>
            <span className="nav-label">{t.label}</span>
          </a>
        ))}
      </nav>
      <main className="main">{route.tab === 'rooms' ? <Rooms view={route.view} /> : <Settings />}</main>
    </div>
  )
}
