// Экран «История» комнаты (Р-11, этап 5): сверху «Итоги» — участники по убыванию итога по окончательным
// событиям и пари (свод расчёта из ответа комнаты; свода нет — блока нет); ниже — прошедшие события и пари,
// новое сверху: условие, исход, мой результат, дата. Переключатель «Все / С моим участием». Нажатие — тот
// же экран события или пари; «Назад» с него ведёт сюда. Что прошедшее — historyParts (с тестами).
// Состояние — с сервера раз в 5 с (useRoom); нет связи — последнее известное
import { useCallback, useState } from 'react'
import { formatDate } from '../rules/date'
import { savedEvents, savedLots, savedOffers, savedSettlement, type SavedRoom } from '../store/db'
import { BackLink, useEscape } from './BackLink'
import { eventHref, nameOf } from './eventParts'
import { historyItems, myResultText, onlyMine, type HistoryItem } from './historyParts'
import { lotHref } from './lotParts'
import { offerHref } from './offerParts'
import { byTotal, memberNumbers } from './settleParts'
import { useRoom, useServerNow } from './useRoom'

export function HistoryScreen({ room, onUpdate }: { room: SavedRoom; onUpdate: (room: SavedRoom) => void }) {
  const { sync, clock } = useRoom(room, onUpdate)
  const now = useServerNow(clock)
  const [mine, setMine] = useState(false)
  const back = '#/room/' + room.id

  useEscape(
    useCallback(() => {
      location.hash = back
    }, [back]),
  )

  const all = historyItems(room, savedEvents(room), savedOffers(room), now, savedLots(room))
  const shown = onlyMine(all, mine)

  return (
    <div className="card room history">
      <BackLink href={back} />
      <h2 className="room-title">История — {room.name}</h2>
      {sync.state === 'fail' && <p className="error">{sync.text}</p>}
      <Totals room={room} />
      <section className="history-list" aria-label="Прошедшее">
        <h3>Прошедшие события, пари и лоты</h3>
        {all.length === 0 ? (
          <p className="empty">{sync.state === 'busy' ? 'Загружаю…' : 'Прошедших событий, пари и лотов пока нет'}</p>
        ) : (
          <>
            <div className="chips history-filter" role="radiogroup" aria-label="Показать">
              <label className="chip">
                <input type="radio" name="history-filter" checked={!mine} onChange={() => setMine(false)} />
                <span>Все · {all.length}</span>
              </label>
              <label className="chip">
                <input type="radio" name="history-filter" checked={mine} onChange={() => setMine(true)} />
                <span>С моим участием · {onlyMine(all, true).length}</span>
              </label>
            </div>
            {shown.length === 0 ? (
              <p className="empty">С вашим участием прошедших пока нет</p>
            ) : (
              <ul className="event-list">
                {shown.map((x) => (
                  <Row key={x.kind + x.id} room={room} item={x} />
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  )
}

// Строка прошедшего: условие, «Событие · Да» / «Пари · не состоялось — отозвано», мой результат, дата
function Row({ room, item }: { room: SavedRoom; item: HistoryItem }) {
  const href = item.kind === 'event' ? eventHref(room.id, item.id) : item.kind === 'lot' ? lotHref(room.id, item.id) : offerHref(room.id, item.id)
  const result = myResultText(item.mine, room.currency)
  const tone = item.mine.kind === 'net' && item.mine.amount > 0 ? 'win' : item.mine.kind === 'net' && item.mine.amount < 0 ? 'loss' : 'hint'
  return (
    <li>
      <a className="event-item" href={href}>
        <span className="event-name">{item.condition}</span>
        <span className="history-outcome">
          {item.kind === 'event' ? 'Событие' : item.kind === 'lot' ? 'Лот' : 'Пари'} · исход: {item.outcome}
        </span>
        <span className="history-result">
          <span className="hint">Ваш результат: </span>
          <span className={tone}>{result}</span>
        </span>
        <span className="hint">{formatDate(item.at)}</span>
      </a>
    </li>
  )
}

// «Итоги»: участники по убыванию итога (как «Таблица очков»), свой — пометкой; свода нет — блока нет
function Totals({ room }: { room: SavedRoom }) {
  const settlement = savedSettlement(room)
  if (!settlement) return null
  return (
    <section className="history-totals" aria-label="Итоги">
      <h3>Итоги</h3>
      <p className="hint">По окончательным событиям и пари</p>
      <ul className="members">
        {byTotal(settlement.members).map((m) => (
          <li key={m.memberId} className="member">
            <span>{nameOf(room, m.memberId)}</span>
            {m.memberId === room.memberId && <span className="badge muted">вы</span>}
            <span className={'history-total ' + (m.total.amount > 0 ? 'win' : m.total.amount < 0 ? 'loss' : '')}>
              {memberNumbers(m, room.currency).total}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
