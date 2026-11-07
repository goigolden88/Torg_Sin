// «Мои комнаты»: список своих комнат и открытое — создание или комната.
// Раскладка «список + открытое» (.split): на компьютере — рядом; на телефоне открытое —
// отдельным экраном с «Назад» (класс .open у .rooms), разметка одна
import { useCallback, useEffect, useState } from 'react'
import { currencyLabel } from '../rules/currency'
import type { DeviceLink, InviteLink } from '../rules/link'
import { store, type SavedRoom } from '../store/db'
import { BackLink } from './BackLink'
import { ClaimDevice } from './ClaimDevice'
import { CreateRoom } from './CreateRoom'
import { EventScreen } from './EventScreen'
import { JoinRoom } from './JoinRoom'
import { NewEvent } from './NewEvent'
import { NewOffer } from './NewOffer'
import { OfferScreen } from './OfferScreen'
import { RoomView } from './RoomView'

export type RoomsView =
  | { kind: 'list' }
  | { kind: 'new' }
  | { kind: 'room'; id: string }
  | { kind: 'new-event'; id: string } // новое событие в комнате id
  | { kind: 'event'; id: string; event: string } // событие комнаты id
  | { kind: 'new-offer'; id: string } // предложить пари в комнате id
  | { kind: 'offer'; id: string; offer: string } // пари комнаты id
  | { kind: 'join'; link: InviteLink } // по ссылке-приглашению
  | { kind: 'device'; link: DeviceLink } // по ссылке для другого устройства
  | { kind: 'bad-link'; text: string } // ссылка не разобралась

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

  const inRoom = view.kind === 'room' || view.kind === 'event' || view.kind === 'new-event' || view.kind === 'offer' || view.kind === 'new-offer'
  const openId = inRoom ? view.id : null
  const open = rooms?.find((r) => r.id === openId)
  // Событие, пари и их формы — во всю ширину содержимого и на компьютере: список комнат прячется,
  // «Назад» ведёт в комнату (экрану события нужно ≥ 640 px, рядом со списком на 1024–1279 его нет;
  // пари — как событие, Р-20: открытое пари и список пари комнаты рядом)
  const wide = view.kind === 'event' || view.kind === 'new-event' || view.kind === 'offer' || view.kind === 'new-offer'

  return (
    <div className={'screen rooms' + (view.kind === 'list' ? '' : ' open') + (wide ? ' wide' : '')}>
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
          ) : view.kind === 'join' ? (
            <JoinRoom key={hashOf(view.link)} link={view.link} onJoined={upsert} />
          ) : view.kind === 'device' ? (
            <ClaimDevice key={hashOf(view.link)} link={view.link} onClaimed={upsert} />
          ) : view.kind === 'bad-link' ? (
            <div className="card">
              <BackLink />
              <p className="error">{view.text}</p>
            </div>
          ) : inRoom ? (
            !open ? (
              <div className="card">
                <BackLink />
                <p className="hint">{rooms === null ? 'Загружаю…' : 'Этой комнаты на устройстве нет.'}</p>
              </div>
            ) : view.kind === 'event' ? (
              <EventScreen key={open.id + '/' + view.event} room={open} eventId={view.event} onUpdate={upsert} />
            ) : view.kind === 'new-event' ? (
              <NewEvent key={open.id} room={open} onUpdate={upsert} />
            ) : view.kind === 'offer' ? (
              <OfferScreen key={open.id + '/' + view.offer} room={open} offerId={view.offer} onUpdate={upsert} />
            ) : view.kind === 'new-offer' ? (
              <NewOffer key={open.id} room={open} onUpdate={upsert} />
            ) : (
              <RoomView key={open.id} room={open} onUpdate={upsert} />
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

// Другая ссылка — экран заново, со своим состоянием
function hashOf(link: InviteLink | DeviceLink): string {
  return JSON.stringify(link)
}

function participants(n: number): string {
  const tens = n % 100
  const ones = n % 10
  const word = tens >= 11 && tens <= 14 ? 'участников' : ones === 1 ? 'участник' : ones >= 2 && ones <= 4 ? 'участника' : 'участников'
  return `${n} ${word}`
}
