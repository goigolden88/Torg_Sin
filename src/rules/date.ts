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

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

// Сколько осталось: «2 дн 5 ч», «5 ч 12 мин», «9 мин 58 с», «7 с»; прошло — «0 с».
// Неполная секунда считается целой: «0,4 с» — ещё «1 с», а не «0 с»
export function formatCountdown(ms: number): string {
  if (ms <= 0) return '0 с'
  const total = Math.ceil(ms / SECOND) * SECOND
  const d = Math.floor(total / DAY)
  const h = Math.floor((total % DAY) / HOUR)
  const m = Math.floor((total % HOUR) / MINUTE)
  const s = Math.floor((total % MINUTE) / SECOND)
  if (d > 0) return h > 0 ? `${d} дн ${h} ч` : `${d} дн`
  if (h > 0) return m > 0 ? `${h} ч ${m} мин` : `${h} ч`
  if (m > 0) return s > 0 ? `${m} мин ${s} с` : `${m} мин`
  return `${s} с`
}

const pad = (n: number) => String(n).padStart(2, '0')

// Для поля «дата и время» (input type="datetime-local"): местное время телефона — «2026-10-31T14:05»
export function toLocalInput(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Из поля «дата и время» (местное время телефона) — в UTC, мс; пусто или не дата — null
export function fromLocalInput(text: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text.trim())
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m.map(Number)
  const date = new Date(y, mo - 1, d, h, mi, Number.isNaN(s) ? 0 : s)
  // 31.02 и подобное Date «переносит» на март — такой даты нет
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null
  return date.getTime()
}
