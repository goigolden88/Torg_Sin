// Общее для экранов событий: сумма в валюте комнаты, имя участника, строка «приём идёт / закрыт /
// отменено» с отсчётом по времени сервера. Считают правила (pool.ts, event.ts), здесь — только показ
import { formatAmount, isCurrencyCode } from '../rules/currency'
import { formatCountdown, formatDateTime } from '../rules/date'
import { eventStatus } from '../rules/event'
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

export function eventHref(roomId: string, eventId: string): string {
  return `#/room/${roomId}/event/${eventId}`
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
