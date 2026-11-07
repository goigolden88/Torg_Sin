// «Пари» в комнате — под «Событиями»: сначала открытые (ближний срок «приём до» сверху, с отсчётом)
// и принятые (ближний «исход к» сверху), ниже отозванные, истёкшие и закрытые встречным (новые
// сверху); пусто — «Пари пока нет». У каждого — условие, кто автор и на какую сторону, кэф, суммы
// обеих сторон, кому, статус. Пари — последнее известное с сервера (у комнаты на устройстве),
// статус и отсчёт — по времени сервера. На экране пари — тот же список рядом, открытое отмечено
import { offerStatus } from '../rules/offer'
import type { OfferView } from '../rules/protocol'
import { savedOffers, type SavedRoom } from '../store/db'
import { offerHref, offerState, OfferStatusLine, stakesLine, toLabel, who } from './offerParts'
import { useServerNow, type Clock } from './useRoom'

export function OfferList({ room, clock, current }: { room: SavedRoom; clock: Clock | null; current?: string }) {
  const offers = savedOffers(room)
  const now = useServerNow(clock, offers.length > 0)
  const status = (o: OfferView) => offerStatus(offerState(o), now)
  const open = offers.filter((o) => status(o) === 'open').sort((a, b) => a.closesAt - b.closesAt)
  const accepted = offers.filter((o) => status(o) === 'accepted').sort((a, b) => a.expectedAt - b.expectedAt)
  const past = offers.filter((o) => status(o) !== 'open' && status(o) !== 'accepted').sort((a, b) => b.at - a.at)
  const live = [...open, ...accepted]

  return (
    <section className="events offers" aria-label="Пари">
      <div className="events-head">
        <h3>Пари</h3>
        <a className="button" href={`#/room/${room.id}/offer/new`}>
          Предложить пари
        </a>
      </div>
      {offers.length === 0 ? (
        <p className="empty">Пари пока нет</p>
      ) : (
        <>
          {live.length > 0 && <Group title="Открытые и принятые" room={room} offers={live} all={offers} now={now} current={current} />}
          {past.length > 0 && <Group title="Отозванные, истёкшие и закрытые встречным" room={room} offers={past} all={offers} now={now} current={current} />}
        </>
      )}
    </section>
  )
}

function Group({
  title,
  room,
  offers,
  all,
  now,
  current,
}: {
  title: string
  room: SavedRoom
  offers: OfferView[]
  all: OfferView[]
  now: number
  current?: string
}) {
  return (
    <>
      <h4 className="events-group">{title}</h4>
      <ul className="event-list">
        {offers.map((o) => {
          // Встречное к этому пари ждёт ответа автора
          const waiting = all.some((c) => c.counterTo === o.id && offerStatus(offerState(c), now) === 'open')
          return (
            <li key={o.id}>
              <a className="event-item" href={offerHref(room.id, o.id)} aria-current={o.id === current ? 'page' : undefined}>
                <span className="event-name">{o.condition}</span>
                <span className="hint">
                  {o.counterTo !== null ? 'встречное · ' : ''}автор — {who(room, o.authorId)}, кому — {toLabel(room, o)}
                </span>
                <span className="hint">{stakesLine(room, o)}</span>
                <OfferStatusLine offer={o} now={now} />
                {waiting && <span className="hint">встречное ждёт ответа автора</span>}
              </a>
            </li>
          )
        })}
      </ul>
    </>
  )
}
