// Оболочка: разделы и раскладка (Р-10). Телефон — вкладки снизу, компьютер — меню слева;
// раскладку меняет только CSS (styles.css), разметка одна
import { useEffect, useState } from 'react'
import { Rooms } from './screens/Rooms'
import { Settings } from './screens/Settings'

type Tab = 'rooms' | 'settings'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'rooms', label: 'Мои комнаты', icon: '🏠' },
  { id: 'settings', label: 'Настройки', icon: '⚙️' },
]

// Хеш-роутинг: GitHub Pages отдаёт один index.html на любой адрес
function tabFromHash(): Tab {
  return location.hash === '#/settings' ? 'settings' : 'rooms'
}

export function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash)
  useEffect(() => {
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="app">
      <nav className="nav" aria-label="Разделы">
        <div className="brand">ТоргСин</div>
        {TABS.map((t) => (
          <a key={t.id} href={t.id === 'rooms' ? '#/' : '#/' + t.id} className="nav-item" aria-current={tab === t.id ? 'page' : undefined}>
            <span className="nav-icon" aria-hidden="true">
              {t.icon}
            </span>
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
      <main className="main">{tab === 'rooms' ? <Rooms /> : <Settings />}</main>
    </div>
  )
}
