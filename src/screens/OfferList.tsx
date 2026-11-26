// «Пари» в комнате — под «Событиями»: открытые (ближний срок «приём до» сверху, с отсчётом) и принятые
// (ближний «исход к» сверху); прошедшее — окончательные, отменённые судом, отозванные, истёкшие и закрытые
// встречным — в «Истории» (historyParts), не здесь; пусто — «Пари пока нет», всё прошло — «Идущих пари
// нет». У каждого — условие, кто автор и на какую сторону, кэф, суммы
// обеих сторон, кому, статус (у принятого — фаза исхода: «ждём отметок», «решает гарант»,
// «окончательно: +100 ₽ Аня»). Пари — последнее известное с сервера (у комнаты на устройстве),
// статус и отсчёт — по времени сервера. На экране пари — тот же список рядом, открытое отмечено.
// Участник — член суда по пари и ещё не голосовал — значок «вы в суде» (Р-24). Предмет спора —
// сторона пари — пометка (Р-26). Пари без гаранта (Р-36) — строка «Гарант: нет — спор решит суд».
// Торг (Р-37) — «торг · автор — …», лучшее встречное или старт, «торг до …, осталось …»; моё встречное
// перебили — значок «вас перебили». Помеченному «выбыл» (Р-41) «Предложить пари» нет
import { offerStatus } from '../rules/offer'
import type { OfferView } from '../rules/protocol'
import { savedOffers, type SavedRoom } from '../store/db'
import { awaitsMyVote } from './courtParts'
import { offerPastNow } from './historyParts'
import { iAmDropped } from './memberParts'
import { NO_GUARANTOR_LABEL, offerHref, offerState, OfferStatusLine, OfferSubjectFlag, outbid, stakesLine, toLabel, who } from './offerParts'
import { useServerNow, type Clock } from './useRoom'

export function OfferList({ room, clock, current }: { room: SavedRoom; clock: Clock | null; current?: string }) {
  const offers = savedOffers(room)
  const now = useServerNow(clock, offers.length > 0)
  const status = (o: OfferView) => offerStatus(offerState(o), now)
  const going = offers.filter((o) => offerPastNow(room, o, now) === null)
  // Торг (Р-37) — по концу с продлениями
  const ends = (o: OfferView) => o.bidding?.endsAt ?? o.closesAt
  const open = going.filter((o) => status(o) === 'open').sort((a, b) => ends(a) - ends(b))
  const accepted = going.filter((o) => status(o) === 'accepted').sort((a, b) => a.expectedAt - b.expectedAt)
  const live = [...open, ...accepted]

  return (
    <section className="events offers" aria-label="Пари">
      <div className="events-head">
        <h3>Пари</h3>
        {!iAmDropped(room) && (
          <a className="button" href={`#/room/${room.id}/offer/new`}>
            Предложить пари
          </a>
        )}
      </div>
      {live.length === 0 ? (
        <p className="empty">{offers.length === 0 ? 'Пари пока нет' : 'Идущих пари нет'}</p>
      ) : (
        <Group title="Открытые и принятые" room={room} offers={live} all={offers} now={now} current={current} />
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
                <span className="event-name">
                  {o.condition}
                  {awaitsMyVote(o.outcome, room.memberId, now) && <span className="badge court-badge">вы в суде</span>}
                </span>
                <span className="hint">
                  {o.auction ? `торг · автор — ${who(room, o.authorId)}` : `${o.counterTo !== null ? 'встречное · ' : ''}автор — ${who(room, o.authorId)}, кому — ${toLabel(room, o)}`}
                </span>
                <span className="hint">{stakesLine(room, o, now)}</span>
                {o.guarantorId === null && <span className="hint">Гарант: {NO_GUARANTOR_LABEL}</span>}
                <OfferStatusLine room={room} offer={o} now={now} />
                {outbid(o, room.memberId, now) && <span className="badge outbid-badge">вас перебили</span>}
                <OfferSubjectFlag room={room} offer={o} />
                {waiting && <span className="hint">встречное ждёт ответа автора</span>}
              </a>
            </li>
          )
        })}
      </ul>
    </>
  )
}
