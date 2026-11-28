// Меню (Р-50, #167): одна разметка, раскладку меняет CSS (Р-10). До 1024 px — выезжает слева поверх
// экрана по ☰ в шапке, с затемнением; закрывается ✕, Esc, нажатием мимо и переходом по пункту. От
// 1024 px — колонка слева, ««» сворачивает её в значки (положение — настройка устройства).
// Пункты: «Сводка» (пока ведёт на «Мои комнаты» — экран «Сводки» своей задачей), комнаты устройства
// (значок-буква, название, баланс одной строкой, счётчик «ждут вас» — пока только суды без вашего голоса),
// «Новая комната», «Вставить ссылку»; внизу — «Настройки» («Справка» и «Что нового» — своей задачей)
import { useEffect, useRef } from 'react'
import { savedEvents, savedLots, savedOffers, savedSettlement, type SavedRoom } from '../store/db'
import { useEscape } from './BackLink'
import { myVotesAwaited } from './courtParts'
import { closedLast, roomClosed, roomLetter } from './memberParts'
import { balanceNote } from './settleParts'

// Где пользователь сейчас: пункт меню выделен (aria-current)
export type MenuPlace = 'summary' | 'new' | 'paste' | 'settings' | { room: string } | null

type Props = {
  rooms: SavedRoom[] | null
  place: MenuPlace
  open: boolean // выехало на телефоне
  collapsed: boolean // свёрнуто в значки на компьютере
  onClose: () => void
  onToggle: () => void
}

export function Menu({ rooms, place, open, collapsed, onClose, onToggle }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEscape(onClose, open)
  // Выехало — фокус на ✕: с клавиатуры и чтецу экрана видно, что открыто окно меню
  useEffect(() => {
    if (open) closeRef.current?.focus()
  }, [open])

  const toggleLabel = collapsed ? 'Развернуть меню' : 'Свернуть меню'
  const openRoom = typeof place === 'object' && place ? place.room : null
  const item = (href: string, label: string, icon: string, current: boolean) => (
    <a className="nav-item" href={href} aria-current={current ? 'page' : undefined} aria-label={label} title={collapsed ? label : undefined}>
      <span className="nav-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="nav-label">{label}</span>
    </a>
  )

  return (
    <nav
      id="menu"
      className="nav"
      aria-label="Меню"
      // Нажали пункт — меню на телефоне уезжает; и на тот же адрес, где перехода нет
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a')) onClose()
      }}
    >
      <div className="nav-head">
        <span className="brand">ТоргСин</span>
        <button className="nav-toggle" type="button" onClick={onToggle} aria-expanded={!collapsed} aria-label={toggleLabel} title={toggleLabel}>
          <span aria-hidden="true">{collapsed ? '»' : '«'}</span>
        </button>
        <button ref={closeRef} className="nav-close" type="button" onClick={onClose} aria-label="Закрыть меню" title="Закрыть меню">
          <span aria-hidden="true">✕</span>
        </button>
      </div>
      {item('#/', 'Сводка', '⚑', place === 'summary')}
      <div className="nav-section">Комнаты</div>
      {rooms && rooms.length > 0 && (
        <ul className="nav-rooms">
          {closedLast(rooms).map((r) => (
            <li key={r.id}>
              <MenuRoom room={r} current={r.id === openRoom} collapsed={collapsed} />
            </li>
          ))}
        </ul>
      )}
      {item('#/new', 'Новая комната', '+', place === 'new')}
      {item('#/paste', 'Вставить ссылку', '⇲', place === 'paste')}
      <div className="nav-foot">{item('#/settings', 'Настройки', '⚙', place === 'settings')}</div>
    </nav>
  )
}

// Комната в меню: буква, название, под ним баланс (или «закрыта»), справа — счётчик «ждут вас»
function MenuRoom({ room, current, collapsed }: { room: SavedRoom; current: boolean; collapsed: boolean }) {
  const name = String(room.name ?? '')
  const closed = roomClosed(room)
  const note = balanceNote(savedSettlement(room), room.memberId, room.currency)
  const sub = closed ? 'закрыта' : note
  const waiting = myVotesAwaited(room, savedEvents(room), savedOffers(room), savedLots(room))
  const label = [name, sub, waiting ? `ждут вас: ${waiting}` : ''].filter(Boolean).join(', ')
  return (
    <a
      className={'nav-item nav-room' + (closed ? ' closed' : '')}
      href={'#/room/' + room.id}
      aria-current={current ? 'page' : undefined}
      aria-label={label}
      title={collapsed ? label : undefined}
    >
      <span className="nav-icon nav-letter" aria-hidden="true">
        {roomLetter(name)}
      </span>
      <span className="nav-label">
        <span className="nav-room-name">{name}</span>
        {sub && <span className={'nav-room-sub' + (note && !closed ? (note.startsWith('вы должны') ? ' loss' : ' win') : '')}>{sub}</span>}
      </span>
      {waiting > 0 && (
        <span className="nav-count" aria-hidden="true" title="ждут вас">
          {waiting}
        </span>
      )}
    </a>
  )
}
