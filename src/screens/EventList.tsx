// «События» в комнате: сначала открытые (ближний срок сверху, с отсчётом до закрытия приёма),
// ниже с закрытым приёмом, исход ещё не окончательный (новые сверху); прошедшее — окончательные и
// отменённые — в «Истории» (historyParts), не здесь; пусто — «Событий пока нет», всё прошло — «Идущих
// событий нет». События — последнее известное с сервера (у комнаты на устройстве), отсчёт — по времени
// сервера. Участник — член суда по событию и ещё не голосовал — значок «вы в суде» (Р-24). У предмета
// спора есть ставка — пометка (Р-26). Помеченному «выбыл» (Р-41) и в закрытой комнате (Р-43) «Нового события» нет
import { eventStatus } from '../rules/event'
import { poolOdds } from '../rules/pool'
import type { EventView } from '../rules/protocol'
import { savedEvents, type SavedRoom } from '../store/db'
import { awaitsMyVote } from './courtParts'
import { eventHref, money, StatusLine, SubjectFlag } from './eventParts'
import { eventPastAt } from './historyParts'
import { mayStartNew } from './memberParts'
import { useServerNow, type Clock } from './useRoom'

export function EventList({ room, clock }: { room: SavedRoom; clock: Clock | null }) {
  const all = savedEvents(room)
  const now = useServerNow(clock, all.length > 0)
  const events = all.filter((e) => eventPastAt(e, now) === null)
  const open = events.filter((e) => eventStatus(e, now) === 'open').sort((a, b) => a.closesAt - b.closesAt)
  const closed = events.filter((e) => eventStatus(e, now) !== 'open').sort((a, b) => b.at - a.at)

  return (
    <section className="events" aria-label="События">
      <div className="events-head">
        <h3>События</h3>
        {mayStartNew(room) && (
          <a className="button" href={`#/room/${room.id}/event/new`}>
            Новое событие
          </a>
        )}
      </div>
      {events.length === 0 ? (
        <p className="empty">{all.length === 0 ? 'Событий пока нет' : 'Идущих событий нет'}</p>
      ) : (
        <>
          {open.length > 0 && <Group title="Приём идёт" room={room} events={open} now={now} />}
          {closed.length > 0 && <Group title="Приём закрыт — ждём исхода" room={room} events={closed} now={now} />}
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
                <span className="event-name">
                  {e.condition}
                  {awaitsMyVote(e.outcome, room.memberId, now) && <span className="badge court-badge">вы в суде</span>}
                </span>
                <StatusLine event={e} now={now} />
                <SubjectFlag room={room} event={e} />
                <span className="hint">{bank > 0 ? `банк ${money(bank, room.currency)}, ставок: ${e.bets.length}` : 'ставок нет'}</span>
              </a>
            </li>
          )
        })}
      </ul>
    </>
  )
}
