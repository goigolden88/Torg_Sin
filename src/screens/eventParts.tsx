// Общее для экранов событий: сумма в валюте комнаты, имя участника, строка «приём идёт / закрыт /
// отменено» с отсчётом по времени сервера, пометка «предмет спора ставит на себя». Считают правила (pool.ts, event.ts), здесь — только показ
import { formatAmount, isCurrencyCode } from '../rules/currency'
import { formatCountdown, formatDateTime } from '../rules/date'
import { closingAt, eventStatus, subjectStake } from '../rules/event'
import type { EventView } from '../rules/protocol'
import type { SavedRoom } from '../store/db'

// «1 200,50 ₽»; валюта не из таблицы (сервер новее сайта) — число и код
export function money(units: number, currency: string): string {
  return isCurrencyCode(currency) ? formatAmount(units, currency) : `${units} ${currency}`
}

export function nameOf(room: SavedRoom, memberId: string | null): string {
  if (memberId === null) return 'никто'
  return room.members.find((m) => m.id === memberId)?.name ?? 'участник'
}

// Комната меньше 4 участников: незаинтересованных в споре может не остаться — суду некого собрать
// (Архитектура, «Крайние случаи»: экран предупреждает при создании события и пари)
export const SMALL_ROOM = 4
export const SMALL_ROOM_NOTE = 'В маленькой комнате суда может не хватить: судят только не ставившие.'

export function eventHref(roomId: string, eventId: string): string {
  return `#/room/${roomId}/event/${eventId}`
}

// Пометка-предупреждение (Р-26): у предмета спора есть ставка — «⚑ Аня — предмет спора — ставит на себя:
// 300 ₽ на „Да“»; у старого события ставка на «Нет» — «ставка против себя: 300 ₽ на „Нет“». Ставки нет — ничего
export function SubjectFlag({ room, event }: { room: SavedRoom; event: EventView }) {
  const s = subjectStake(event)
  if (!s || event.subjectId === null) return null
  const name = nameOf(room, event.subjectId) + (event.subjectId === room.memberId ? ' (вы)' : '')
  // Без рода: участница видит про себя то же, что участник
  const list = s.stakes.map((x) => `${money(x.amount, room.currency)} на „${x.title}“`).join(', ')
  const text = (s.against ? 'ставка против себя: ' : 'ставит на себя: ') + list
  return (
    <span className="subject-flag">
      ⚑ {name} — предмет спора — {text}
    </span>
  )
}

// Статус — на время сервера now (eventStatus): приём закрывается в срок и между опросами, а
// досрочным предложением исхода — раньше срока (closingAt, Р-27)
export function StatusLine({ event, now }: { event: EventView; now: number }) {
  const status = eventStatus(event, now)
  if (status === 'cancelled') return <span className="status cancelled">отменено — ставки возвращены</span>
  if (status === 'closed') {
    const at = closingAt(event)
    return (
      <span className="status closed">
        Приём ставок закрыт {formatDateTime(at)}
        {at < event.closesAt ? ' — исход предложен досрочно' : ''}
      </span>
    )
  }
  return (
    <span className="status open">
      Приём ставок до {formatDateTime(event.closesAt)} — осталось {formatCountdown(event.closesAt - now)}
    </span>
  )
}
