// Даты и время — по-русски на любом телефоне: язык браузера не важен (английский дал бы
// «10/31/2026»). Время хранится UTC (мс), показывается местное; timeZone — для тестов
const LOCALE = 'ru-RU'

// «31.10.2026»
export function formatDate(ms: number, timeZone?: string): string {
  return new Date(ms).toLocaleDateString(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone })
}

// «31.10.2026, 14:05»
export function formatDateTime(ms: number, timeZone?: string): string {
  return new Date(ms).toLocaleString(LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  })
}
