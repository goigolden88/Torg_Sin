// Общее для экранов событий: сумма в валюте комнаты, имя участника, строка «приём идёт / закрыт /
// отменено» с отсчётом по времени сервера, пометка «предмет спора сам ставит». Считают правила (pool.ts, event.ts), здесь — только показ
import { formatAmount, isCurrencyCode } from '../rules/currency'
import { formatCountdown, formatDateTime } from '../rules/date'
import { eventStatus, subjectStake } from '../rules/event'
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

// Пометка-предупреждение (Р-26): предмет спора сам поставил — «⚑ Аня — предмет спора — сам ставит:
// 300 ₽ на „Да“»; у старого события его ставка на «Нет» — «поставил против себя». Не ставил — ничего
export function SubjectFlag({ room, event }: { room: SavedRoom; event: EventView }) {
  const s = subjectStake(event)
  if (!s || event.subjectId === null) return null
  const name = nameOf(room, event.subjectId) + (event.subjectId === room.memberId ? ' (вы)' : '')
  const text = s.against
    ? 'поставил против себя'
    : 'сам ставит: ' + s.stakes.map((x) => `${money(x.amount, room.currency)} на „${x.title}“`).join(', ')
  return (
    <span className="subject-flag">
      ⚑ {name} — предмет спора — {text}
    </span>
  )
}

// Статус — на время сервера now (eventStatus): приём закрывается в срок и между опросами
export function StatusLine({ event, now }: { event: EventView; now: number }) {
  const status = eventStatus(event, now)
  if (status === 'cancelled') return <span className="status cancelled">отменено — ставки возвращены</span>
  if (status === 'closed') return <span className="status closed">Приём ставок закрыт {formatDateTime(event.closesAt)}</span>
  return (
    <span className="status open">
      Приём ставок до {formatDateTime(event.closesAt)} — осталось {formatCountdown(event.closesAt - now)}
    </span>
  )
}
