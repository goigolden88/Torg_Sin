// Оболочка: разделы и раскладка (Р-10). Телефон — вкладки снизу, компьютер — меню слева;
// раскладку меняет только CSS (styles.css), разметка одна
import { useEffect, useState } from 'react'
import { Rooms, type RoomsView } from './screens/Rooms'
import { Settings } from './screens/Settings'

type Tab = 'rooms' | 'settings'
type Route = { tab: 'settings' } | { tab: 'rooms'; view: RoomsView }

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'rooms', label: 'Мои комнаты', icon: '🏠' },
  { id: 'settings', label: 'Настройки', icon: '⚙️' },
]

// Хеш-роутинг: GitHub Pages отдаёт один index.html на любой адрес.
// #/ — список, #/new — создать комнату, #/room/<номер> — открытая комната, #/settings
function routeFromHash(): Route {
  const hash = location.hash
  if (hash === '#/settings') return { tab: 'settings' }
  if (hash === '#/new') return { tab: 'rooms', view: { kind: 'new' } }
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
