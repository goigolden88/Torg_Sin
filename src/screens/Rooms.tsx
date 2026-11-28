// «Мои комнаты»: список своих комнат и открытое — создание или комната. Над списком — «Сводка» (Р-50,
// #168): что ждёт вас во всех комнатах, по копиям на устройстве. У комнаты, где участник —
// член суда и ещё не голосовал, — значок «вы в суде» (по последнему ответу комнаты; копии старше
// 5 минут при открытии спрашиваются у сервера один раз — useSavedRooms); время копии, копия старше недели —
// подсвечена «данные от … — откройте, чтобы обновить». Закрытая комната (Р-43) — с пометкой «закрыта»,
// внизу списка.
// Список или открытое — на любой ширине одно из двух (класс .open у .rooms): комнаты на компьютере —
// в меню слева (#167, Р-50), рядом с открытым списка нет. Под списком — «Вставить ссылку» (PasteLink):
// у приложения с экрана «Домой» адресной строки нет; она же — своим экраном #/paste из меню
import { currencyLabel } from '../rules/currency'
import type { DeviceLink, InviteLink } from '../rules/link'
import { savedEvents, savedLots, savedOffers, savedSettlement, type SavedRoom } from '../store/db'
import { BackLink } from './BackLink'
import { ChoiceScreen } from './ChoiceScreen'
import { ClaimDevice } from './ClaimDevice'
import { roomAwaitsMyVote } from './courtParts'
import { CreateRoom } from './CreateRoom'
import { EventScreen } from './EventScreen'
import { HistoryScreen } from './HistoryScreen'
import { JoinRoom } from './JoinRoom'
import { LotScreen } from './LotScreen'
import { closedLast, roomClosed } from './memberParts'
import { NewChoice } from './NewChoice'
import { NewEvent } from './NewEvent'
import { NewLot } from './NewLot'
import { NewOffer } from './NewOffer'
import { OfferScreen } from './OfferScreen'
import { PasteLink } from './PasteLink'
import { RoomView } from './RoomView'
import { balanceNote } from './settleParts'
import { SettleScreen } from './SettleScreen'
import { Summary } from './Summary'
import { copyNote } from './summaryParts'
import type { SavedRooms } from './useSavedRooms'

export type RoomsView =
  | { kind: 'list' }
  | { kind: 'new' }
  | { kind: 'paste' } // «Вставить ссылку» из меню (#167)
  | { kind: 'room'; id: string }
  | { kind: 'new-event'; id: string } // новое событие в комнате id
  | { kind: 'event'; id: string; event: string } // событие комнаты id
  | { kind: 'new-offer'; id: string; repeat?: string } // предложить пари в комнате id; repeat — «Повторить» торг (Р-37)
  | { kind: 'offer'; id: string; offer: string } // пари комнаты id
  | { kind: 'new-lot'; id: string } // выставить лот в комнате id (Р-38)
  | { kind: 'lot'; id: string; lot: string } // лот комнаты id
  | { kind: 'new-choice'; id: string } // начать выбор в комнате id (Р-39)
  | { kind: 'choice'; id: string; choice: string } // выбор комнаты id
  | { kind: 'settle'; id: string } // «Расчёт» комнаты id
  | { kind: 'history'; id: string } // «История» комнаты id
  | { kind: 'join'; link: InviteLink } // по ссылке-приглашению
  | { kind: 'device'; link: DeviceLink } // по ссылке для другого устройства
  | { kind: 'bad-link'; text: string } // ссылка не разобралась

// Открытая комната адреса (комната, её событие, пари, «Расчёт»…) — для меню и шапки; не в комнате — null
export function openRoomId(view: RoomsView): string | null {
  return 'id' in view ? view.id : null
}

export function Rooms({ view, saved }: { view: RoomsView; saved: SavedRooms }) {
  const { rooms, storeError, upsert, remove } = saved

  const wide =
    view.kind === 'event' ||
    view.kind === 'new-event' ||
    view.kind === 'offer' ||
    view.kind === 'new-offer' ||
    view.kind === 'lot' ||
    view.kind === 'new-lot' ||
    view.kind === 'choice' ||
    view.kind === 'new-choice' ||
    view.kind === 'settle' ||
    view.kind === 'history'
  const inRoom = view.kind === 'room' || wide
  const openId = openRoomId(view)
  const open = rooms?.find((r) => r.id === openId)
  // Событие, пари, лот, выбор, их формы, «Расчёт» и «История» (.wide) — «Назад» ведёт в комнату и виден и на
  // компьютере; у самой комнаты и форм входа на компьютере «Назад» не нужен — комнаты в меню слева

  // «Сейчас» устройства для «Сводки» и свежести копий: экран перерисовывается при каждом обновлении
  // комнат, отдельного опроса нет (Р-50)
  const now = Date.now()

  return (
    <div className={'screen rooms' + (view.kind === 'list' ? '' : ' open') + (wide ? ' wide' : '')}>
      {view.kind === 'list' && rooms && rooms.length > 0 && <Summary rooms={rooms} now={now} />}
      <div className="split">
        <section className="list">
          <h2 className="list-head">Мои комнаты</h2>
          {storeError && <p className="error">{storeError}</p>}
          <a className="button" href="#/new" aria-current={view.kind === 'new' ? 'page' : undefined}>
            Создать комнату
          </a>
          {rooms === null ? (
            <p className="hint">Загружаю…</p>
          ) : rooms.length === 0 ? (
            <div className="card">
              <p className="empty">Комнат пока нет.</p>
              <p className="hint">
                Войти в комнату — по ссылке от ведущего: откройте её или вставьте в „Вставить ссылку“ ниже. Комната уже есть в другом
                браузере — вставьте её „Ссылку для другого устройства“. Создать свою — кнопкой выше: нужен пароль компании.
              </p>
            </div>
          ) : (
            <ul className="room-list">
              {closedLast(rooms).map((r) => {
                const copy = copyNote(r, now)
                return (
                  <li key={r.id}>
                    <a className={'room-item' + (copy.stale ? ' stale' : '')} href={'#/room/' + r.id} aria-current={r.id === openId ? 'page' : undefined}>
                      <span className="room-name">
                        {r.name}
                        {roomAwaitsMyVote(r, savedEvents(r), savedOffers(r), savedLots(r)) && <span className="badge court-badge">вы в суде</span>}
                        {roomClosed(r) && <span className="badge muted">закрыта</span>}
                      </span>
                      <span className="hint">
                        {currencyLabel(r.currency)} · {participants(r.members.length)}
                        {r.hostId === r.memberId ? ' · вы ведущий' : ''}
                        {copy.stale ? '' : ' · ' + copy.text}
                      </span>
                      <RoomBalance room={r} />
                      {copy.stale && <span className="room-stale">{copy.text}</span>}
                    </a>
                  </li>
                )
              })}
            </ul>
          )}
          {view.kind === 'list' && <PasteLink roomIds={rooms?.map((r) => r.id) ?? []} />}
        </section>
        <section className="detail">
          {view.kind === 'new' ? (
            <CreateRoom onCreated={upsert} />
          ) : view.kind === 'paste' ? (
            <>
              <BackLink />
              <PasteLink roomIds={rooms?.map((r) => r.id) ?? []} autoFocus />
            </>
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
              <NewOffer key={open.id + '/' + (view.repeat ?? '')} room={open} repeat={view.repeat} onUpdate={upsert} />
            ) : view.kind === 'lot' ? (
              <LotScreen key={open.id + '/' + view.lot} room={open} lotId={view.lot} onUpdate={upsert} />
            ) : view.kind === 'new-lot' ? (
              <NewLot key={open.id} room={open} onUpdate={upsert} />
            ) : view.kind === 'choice' ? (
              <ChoiceScreen key={open.id + '/' + view.choice} room={open} choiceId={view.choice} onUpdate={upsert} />
            ) : view.kind === 'new-choice' ? (
              <NewChoice key={open.id} room={open} onUpdate={upsert} />
            ) : view.kind === 'settle' ? (
              <SettleScreen key={open.id} room={open} onUpdate={upsert} />
            ) : view.kind === 'history' ? (
              <HistoryScreen key={open.id} room={open} onUpdate={upsert} />
            ) : (
              <RoomView key={open.id} room={open} onUpdate={upsert} onLeft={remove} />
            )
          ) : null}
        </section>
      </div>
    </div>
  )
}

// «вы должны 300 ₽» / «вам должны 900 ₽» — по своду из последнего ответа комнаты; баланс ноль — ничего
function RoomBalance({ room }: { room: SavedRoom }) {
  const note = balanceNote(savedSettlement(room), room.memberId, room.currency)
  if (!note) return null
  return <span className={'room-balance ' + (note.startsWith('вы должны') ? 'loss' : 'win')}>{note}</span>
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
