// «Лоты» в комнате — под «Пари» (этап 7, Р-38): идущие (ближний конец торга сверху, с отсчётом) и ждущие
// передачи (торг закончен, итога ещё нет: ждёт передачи, передан, в споре, ждёт суда); прошедшее — снятые,
// не проданные, полученные, не состоявшиеся — в «Истории» (historyParts), не здесь; пусто — «Лотов пока
// нет», всё прошло — «Идущих лотов нет». У каждого — название, продавец, лучшая ставка или старт, статус;
// член суда по лоту, который ещё не голосовал, — «вы в суде»; мою ставку перебили — «вас перебили». Лоты —
// последнее известное с сервера, статус и отсчёт — по времени сервера (lotOutcome). На экране лота — тот
// же список рядом, открытый отмечен. Помеченному «выбыл» (Р-41) «Выставить лот» нет
import type { LotView } from '../rules/protocol'
import { savedLots, type SavedRoom } from '../store/db'
import { awaitsMyVote } from './courtParts'
import { bestLine, lotHref, lotOutbid, lotOutcomeOf, lotPastNow, lotState, lotStatusText, newLotHref } from './lotParts'
import { iAmDropped } from './memberParts'
import { who } from './offerParts'
import { useServerNow, type Clock } from './useRoom'

export function LotList({ room, clock, current }: { room: SavedRoom; clock: Clock | null; current?: string }) {
  const lots = savedLots(room)
  const now = useServerNow(clock, lots.length > 0)
  const going = lots.filter((l) => lotPastNow(room, l, now) === null)
  const open = going.filter((l) => lotOutcomeOf(room, l, now).status === 'open').sort((a, b) => lotState(a).endsAt - lotState(b).endsAt)
  const after = going.filter((l) => lotOutcomeOf(room, l, now).status !== 'open').sort((a, b) => a.endsAt - b.endsAt)

  return (
    <section className="events lots" aria-label="Лоты">
      <div className="events-head">
        <h3>Лоты</h3>
        {!iAmDropped(room) && (
          <a className="button" href={newLotHref(room.id)}>
            Выставить лот
          </a>
        )}
      </div>
      {open.length + after.length === 0 ? (
        <p className="empty">{lots.length === 0 ? 'Лотов пока нет' : 'Идущих лотов нет'}</p>
      ) : (
        <>
          {open.length > 0 && <Group title="Торг идёт" room={room} lots={open} now={now} current={current} />}
          {after.length > 0 && <Group title="Ждут передачи" room={room} lots={after} now={now} current={current} />}
        </>
      )}
    </section>
  )
}

function Group({ title, room, lots, now, current }: { title: string; room: SavedRoom; lots: LotView[]; now: number; current?: string }) {
  return (
    <>
      <h4 className="events-group">{title}</h4>
      <ul className="event-list">
        {lots.map((l) => (
          <li key={l.id}>
            <a className="event-item" href={lotHref(room.id, l.id)} aria-current={l.id === current ? 'page' : undefined}>
              <span className="event-name">
                {l.title}
                {awaitsMyVote(l, room.memberId, now) && <span className="badge court-badge">вы в суде</span>}
              </span>
              <span className="hint">продавец — {who(room, l.sellerId)}</span>
              <span className="hint">{bestLine(room, l)}</span>
              <LotStatusLine room={room} lot={l} now={now} />
              {lotOutbid(room, l, now) && <span className="badge outbid-badge">вас перебили</span>}
            </a>
          </li>
        ))}
      </ul>
    </>
  )
}

// Строка статуса лота на время сервера (lotStatusText): торг закрывается в срок и между опросами
export function LotStatusLine({ room, lot, now }: { room: SavedRoom; lot: LotView; now: number }) {
  const s = lotStatusText(room, lot, now)
  return <span className={'status ' + s.tone}>{s.text}</span>
}
