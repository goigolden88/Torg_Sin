// Оболочка: разделы и раскладка (Р-10). Телефон — вкладки снизу, компьютер — меню слева;
// раскладку меняет только CSS (styles.css), разметка одна
import { useEffect, useState } from 'react'
import { parseDeviceLink, parseInviteLink } from './rules/link'
import { Rooms, type RoomsView } from './screens/Rooms'
import { Settings } from './screens/Settings'

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

  return (
    <div className="app">
      <nav className="nav" aria-label="Разделы">
        <div className="brand">ТоргСин</div>
        {TABS.map((t) => (
          <a key={t.id} href={t.id === 'rooms' ? '#/' : '#/' + t.id} className="nav-item" aria-current={route.tab === t.id ? 'page' : undefined}>
            <span className="nav-icon" aria-hidden="true">
              {t.icon}
            </span>
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
      <main className="main">{route.tab === 'rooms' ? <Rooms view={route.view} /> : <Settings />}</main>
    </div>
  )
}
