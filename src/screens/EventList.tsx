// «События» в комнате: сначала открытые (ближний срок сверху, с отсчётом до закрытия приёма),
// ниже закрытые и отменённые (новые сверху); пусто — «Событий пока нет». События — последнее
// известное с сервера (у комнаты на устройстве), отсчёт — по времени сервера
import { eventStatus } from '../rules/event'
import { poolOdds } from '../rules/pool'
import type { EventView } from '../rules/protocol'
import { savedEvents, type SavedRoom } from '../store/db'
import { eventHref, money, StatusLine } from './eventParts'
import { useServerNow, type Clock } from './useRoom'

export function EventList({ room, clock }: { room: SavedRoom; clock: Clock | null }) {
  const events = savedEvents(room)
  const now = useServerNow(clock, events.length > 0)
  const open = events.filter((e) => eventStatus(e, now) === 'open').sort((a, b) => a.closesAt - b.closesAt)
  const past = events.filter((e) => eventStatus(e, now) !== 'open').sort((a, b) => b.at - a.at)

  return (
    <section className="events" aria-label="События">
      <div className="events-head">
        <h3>События</h3>
        <a className="button" href={`#/room/${room.id}/event/new`}>
          Новое событие
        </a>
      </div>
      {events.length === 0 ? (
        <p className="empty">Событий пока нет</p>
      ) : (
        <>
          {open.length > 0 && <Group title="Приём идёт" room={room} events={open} now={now} />}
          {past.length > 0 && <Group title="Закрытые и отменённые" room={room} events={past} now={now} />}
        </>
      )}
    </section>
  )
}

function Group({ title, room, events, now }: { title: string; room: SavedRoom; events: EventView[]; now: number }) {
  return (
    <>
      <h4 className="events-group">{title}</h4>
      <ul className="event-list">
        {events.map((e) => {
          const { bank } = poolOdds(
            e.outcomes.map((o) => o.id),
            e.bets,
          )
          return (
            <li key={e.id}>
              <a className="event-item" href={eventHref(room.id, e.id)}>
                <span className="event-name">{e.condition}</span>
                <StatusLine event={e} now={now} />
                <span className="hint">{bank > 0 ? `банк ${money(bank, room.currency)}, ставок: ${e.bets.length}` : 'ставок нет'}</span>
              </a>
            </li>
          )
        })}
      </ul>
    </>
  )
}
