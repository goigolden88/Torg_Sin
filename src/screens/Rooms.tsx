// «Мои комнаты»: список своих комнат и открытое — создание или комната.
// Раскладка «список + открытое» (.split): на компьютере — рядом; на телефоне открытое —
// отдельным экраном с «Назад» (класс .open у .rooms), разметка одна
import { useCallback, useEffect, useState } from 'react'
import { currencyLabel } from '../rules/currency'
import { store, type SavedRoom } from '../store/db'
import { BackLink } from './BackLink'
import { CreateRoom } from './CreateRoom'
import { RoomView } from './RoomView'

export type RoomsView = { kind: 'list' } | { kind: 'new' } | { kind: 'room'; id: string }

const STORE_FAILED = 'Не открылось хранилище на этом устройстве — комнаты не сохранятся. Частный режим браузера?'

export function Rooms({ view }: { view: RoomsView }) {
  const [rooms, setRooms] = useState<SavedRoom[] | null>(null)
  const [storeError, setStoreError] = useState('')

  useEffect(() => {
    store()
      .listRooms()
      .then(setRooms, () => {
        setRooms([])
        setStoreError(STORE_FAILED)
      })
  }, [])

  // Новая комната — сверху, обновлённая — на своём месте
  const upsert = useCallback((room: SavedRoom) => {
    setRooms((prev) => {
      const list = prev ?? []
      return list.some((r) => r.id === room.id) ? list.map((r) => (r.id === room.id ? room : r)) : [room, ...list]
    })
  }, [])

  const openId = view.kind === 'room' ? view.id : null
  const open = rooms?.find((r) => r.id === openId)

  return (
    <div className={'screen rooms' + (view.kind === 'list' ? '' : ' open')}>
      <div className="split">
        <section className="list">
          <h1>Мои комнаты</h1>
          {storeError && <p className="error">{storeError}</p>}
          <a className="button" href="#/new" aria-current={view.kind === 'new' ? 'page' : undefined}>
            Создать комнату
          </a>
          {rooms === null ? (
            <p className="hint">Загружаю…</p>
          ) : rooms.length === 0 ? (
            <div className="card">
              <p className="empty">Комнат пока нет.</p>
              <p className="hint">Войти в комнату — по ссылке от ведущего. Создать свою — кнопкой выше: нужен пароль компании.</p>
            </div>
          ) : (
            <ul className="room-list">
              {rooms.map((r) => (
                <li key={r.id}>
                  <a className="room-item" href={'#/room/' + r.id} aria-current={r.id === openId ? 'page' : undefined}>
                    <span className="room-name">{r.name}</span>
                    <span className="hint">
                      {currencyLabel(r.currency)} · {participants(r.members.length)}
                      {r.hostId === r.memberId ? ' · вы ведущий' : ''}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="detail">
          {view.kind === 'new' ? (
            <CreateRoom onCreated={upsert} />
          ) : view.kind === 'room' ? (
            open ? (
              <RoomView key={open.id} room={open} onUpdate={upsert} />
            ) : (
              <div className="card">
                <BackLink />
                <p className="hint">{rooms === null ? 'Загружаю…' : 'Этой комнаты на устройстве нет.'}</p>
              </div>
            )
          ) : (
            <div className="card">
              <p className="hint">Выберите комнату слева или создайте новую.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function participants(n: number): string {
  const tens = n % 100
  const ones = n % 10
  const word = tens >= 11 && tens <= 14 ? 'участников' : ones === 1 ? 'участник' : ones >= 2 && ones <= 4 ? 'участника' : 'участников'
  return `${n} ${word}`
}
