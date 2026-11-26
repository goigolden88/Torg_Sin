// Экран «История» комнаты (Р-11, этап 5): сверху «Итоги» — участники по убыванию итога по окончательным
// событиям и пари (свод расчёта из ответа комнаты; свода нет — блока нет); ниже — прошедшие события, пари,
// лоты и выборы, новое сверху: условие, исход, мой результат, дата. Переключатель «Все / С моим участием».
// Нажатие — тот же экран события, пари, лота или выбора; «Назад» с него ведёт сюда. Что прошедшее — historyParts (с тестами).
// Состояние — с сервера раз в 5 с (useRoom); нет связи — последнее известное. В самом низу — «Участники:
// вышел, «выбыл»» (Life, Р-40, Р-41): строки «вышел», «пометил „выбыл“», «снял „выбыл“» по журналу комнаты
import { useCallback, useEffect, useState } from 'react'
import { fetchBackup } from '../api'
import { formatDate, formatDateTime } from '../rules/date'
import type { LogEntry } from '../rules/room'
import { savedChoices, savedEvents, savedLots, savedOffers, savedSettlement, type SavedRoom } from '../store/db'
import { BackLink, useEscape } from './BackLink'
import { choiceHref } from './choiceParts'
import { eventHref, nameOf } from './eventParts'
import { historyItems, myResultText, onlyMine, type HistoryItem } from './historyParts'
import { lotHref } from './lotParts'
import { lifeItems } from './memberParts'
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

  const all = historyItems(room, savedEvents(room), savedOffers(room), now, savedLots(room), savedChoices(room))
  const shown = onlyMine(all, mine)

  return (
    <div className="card room history">
      <BackLink href={back} />
      <h2 className="room-title">История — {room.name}</h2>
      {sync.state === 'fail' && <p className="error">{sync.text}</p>}
      <Totals room={room} />
      <section className="history-list" aria-label="Прошедшее">
        <h3>Прошедшие события, пари, лоты и выборы</h3>
        {all.length === 0 ? (
          <p className="empty">{sync.state === 'busy' ? 'Загружаю…' : 'Прошедших событий, пари, лотов и выборов пока нет'}</p>
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
      <Life room={room} />
    </div>
  )
}

// «Участники»: кто вышел, кого ведущий пометил «выбыл» и с кого снял (Р-40, Р-41) — по журналу комнаты (копия
// участника, один раз при открытии: в ответе комнаты времени нет). Строк нет или журнал не пришёл — блока нет
function Life({ room }: { room: SavedRoom }) {
  const [log, setLog] = useState<LogEntry[]>([])
  const { server, id, key } = room
  useEffect(() => {
    let live = true
    void fetchBackup(server, id, key).then((res) => {
      if (live && res.ok) setLog(res.value.log)
    })
    return () => {
      live = false
    }
  }, [server, id, key])
  const items = lifeItems(room, log)
  if (items.length === 0) return null
  return (
    <section className="history-list" aria-label="Участники">
      <h3>Участники: вышел, «выбыл»</h3>
      <ul className="members">
        {items.map((x) => (
          <li key={x.id} className="member">
            <span>{x.text}</span>
            <span className="hint">{formatDateTime(x.at)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

const KIND_LABEL: Record<HistoryItem['kind'], string> = { event: 'Событие', offer: 'Пари', lot: 'Лот', choice: 'Выбор' }

// Строка прошедшего: условие, «Событие · Да» / «Пари · не состоялось — отозвано», мой результат, дата
function Row({ room, item }: { room: SavedRoom; item: HistoryItem }) {
  const href =
    item.kind === 'event'
      ? eventHref(room.id, item.id)
      : item.kind === 'lot'
        ? lotHref(room.id, item.id)
        : item.kind === 'choice'
          ? choiceHref(room.id, item.id)
          : offerHref(room.id, item.id)
  const result = myResultText(item.mine, room.currency)
  const tone = item.mine.kind === 'net' && item.mine.amount > 0 ? 'win' : item.mine.kind === 'net' && item.mine.amount < 0 ? 'loss' : 'hint'
  return (
    <li>
      <a className="event-item" href={href}>
        <span className="event-name">{item.condition}</span>
        <span className="history-outcome">
          {KIND_LABEL[item.kind]} · исход: {item.outcome}
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
