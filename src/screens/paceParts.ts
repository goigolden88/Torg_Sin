// Темп комнаты на экранах (Р-35; правила — rules/pace.ts): подписи сроков словами для фраз («2 часа на
// возражение», «за 12 часов никто не проголосовал»), строка темпа комнаты, выбор темпа → запрос, темп из
// ответа сервера. Считают правила, здесь — только показ. Без разметки: её — PacePicker
import {
  NORMAL_TIMES,
  PACE_LABELS,
  paceSummary,
  paceTimes,
  recordTimes,
  timesOf,
  type Pace,
  type PaceInput,
  type RoomPace,
  type TimeKey,
  type Times,
} from '../rules/pace'
import type { PaceView, TimesView } from '../rules/protocol'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

function plural(n: number, one: string, few: string, many: string): string {
  const d = n % 10
  const dd = n % 100
  if (d === 1 && dd !== 11) return one
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few
  return many
}

// Срок словами для фразы: ровно сутки — «сутки», целые дни — «3 дня», иначе — часы: «2 часа», «12 часов».
// Читается и после «на», «за», «через»: «за 3 дня», «через сутки», «12 часов на голос»
export function spanText(ms: number): string {
  if (ms === DAY) return 'сутки'
  if (ms % DAY === 0) {
    const n = ms / DAY
    return `${n} ${plural(n, 'день', 'дня', 'дней')}`
  }
  const h = Math.round(ms / HOUR)
  return `${h} ${plural(h, 'час', 'часа', 'часов')}`
}

// С заглавной — для начала фразы: «Сутки без общего гаранта», «12 часов на возражение»
export function capital(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

// Сроки события или пари из ответа: закреплённые при создании; сервер до темпа поля не шлёт — обычный набор
export function viewTimes(x: { times?: TimesView }): Times {
  return timesOf(x)
}

// Темп комнаты из ответа сервера (room.pace, room.times); сервер до темпа полей не шлёт — null
export function statePace(room: { pace?: PaceView; times?: TimesView }): RoomPace | null {
  if (room.pace === undefined) return null
  return { pace: room.pace, times: recordTimes(room.times) ?? paceTimes({ pace: room.pace }) }
}

// «Темп: быстрый — возражение — 2 ч, апелляция — сутки, молчание — 12 ч, суд — 12 ч»
export function paceLine(p: RoomPace): string {
  return `Темп: ${PACE_LABELS[p.pace]} — ${paceSummary(p.times)}`
}

// «Сроки этой комнаты: возражение — 2 ч, …» — на «Новом событии» и «Новом пари»
export function roomTimesLine(p: RoomPace): string {
  return `Сроки этой комнаты: ${paceSummary(p.times)}. Закрепятся при создании — смена темпа их не изменит.`
}

// Выбор на экране: темп и сроки «своего» (у обычного и быстрого «свои» сроки просто лежат до выбора)
export type PaceDraft = { pace: Pace; custom: Times }

// Выбор по умолчанию: на создании — обычный, «свой» — со сроками обычного; при смене — нынешний темп
export function paceDraft(current: RoomPace | null): PaceDraft {
  if (!current) return { pace: 'normal', custom: { ...NORMAL_TIMES } }
  return { pace: current.pace, custom: { ...(current.pace === 'custom' ? current.times : NORMAL_TIMES) } }
}

// Сроки выбранного темпа — для строки под вариантом и окна подтверждения
export function draftTimes(d: PaceDraft): Times {
  return paceTimes({ pace: d.pace, times: d.custom })
}

// Выбор → поля запроса (создание комнаты, смена темпа): у «своего» — сроки, у обычного и быстрого — без них
export function paceInput(d: PaceDraft): PaceInput {
  return d.pace === 'custom' ? { pace: 'custom', times: { ...d.custom } } : { pace: d.pace }
}

export const PACE_TITLE: Readonly<Record<Pace, string>> = { normal: 'Обычный', fast: 'Быстрый', custom: 'Свой' }

// Пояснение каждого срока под списками «своего» темпа
export const TIME_ABOUT: Readonly<Record<TimeKey, string>> = {
  objection: 'сколько ждать возражений на предложенный исход события',
  appeal: 'сколько можно подать апелляцию на утверждённый исход, пока он не окончательный',
  silence: 'сколько ждать автора события или вторую сторону пари после «исход к» и сколько решает гарант',
  court: 'сколько у каждого судьи на голос',
}

export const PACE_CHANGE_NOTE = 'Новые сроки — для новых событий и пари; у уже созданных остаются прежние.'
