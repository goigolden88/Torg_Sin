// Темп комнаты (Р-35, уточняет Р-05 и Р-31): сроки исхода, апелляции и суда — не одни на все
// комнаты, а из темпа: «обычный», «быстрый» или «свой» (каждый срок — из списка). Сроки закрепляются
// в событии и пари при создании (поле times записи): смена темпа задним числом ничего не сокращает.
// Нет поля — обычный набор (все старые записи). Ни DOM, ни Cloudflare
import type { LogEntry } from './room'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

export type Pace = 'normal' | 'fast' | 'custom'
export const PACES: readonly Pace[] = ['normal', 'fast', 'custom']
export const DEFAULT_PACE: Pace = 'normal'

// Четыре срока (мс):
//   objection — возражение на исход пула и окно пометки поздних ставок;
//   appeal    — апелляция (до окончательности) у пула и пари;
//   silence   — молчание автора события после «исход ожидается к», молчание второй стороны пари,
//               часы гаранта, «нужен другой гарант» до суда (Р-31);
//   court     — голосование не ставивших и место в суде
export type Times = { objection: number; appeal: number; silence: number; court: number }
export type TimeKey = keyof Times
export const TIME_KEYS: readonly TimeKey[] = ['objection', 'appeal', 'silence', 'court']

// Обычный — как было до темпа; быстрый — для споров «на вечер»
export const NORMAL_TIMES: Times = { objection: DAY, appeal: 7 * DAY, silence: 3 * DAY, court: 72 * HOUR }
export const FAST_TIMES: Times = { objection: 2 * HOUR, appeal: DAY, silence: 12 * HOUR, court: 12 * HOUR }

// «Свой» темп — каждый срок только из списка; оба набора в эти списки входят
const STEPS = [12 * HOUR, DAY, 2 * DAY, 3 * DAY, 5 * DAY, 7 * DAY]
export const TIME_CHOICES: Readonly<Record<TimeKey, readonly number[]>> = {
  objection: [2 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY],
  appeal: [DAY, 2 * DAY, 3 * DAY, 7 * DAY, 14 * DAY],
  silence: STEPS,
  court: STEPS,
}

// Название срока для людей
export const TIME_LABELS: Readonly<Record<TimeKey, string>> = {
  objection: 'возражение',
  appeal: 'апелляция',
  silence: 'молчание',
  court: 'суд',
}

export const PACE_LABELS: Readonly<Record<Pace, string>> = { normal: 'обычный', fast: 'быстрый', custom: 'свой' }

// Длительность для людей: ровно сутки — «сутки», целые дни — «3 дня», иначе — часы: «12 ч»
export function durationText(ms: number): string {
  if (ms === DAY) return 'сутки'
  if (ms % DAY === 0) {
    const n = ms / DAY
    return `${n} ${plural(n, 'день', 'дня', 'дней')}`
  }
  return `${Math.round(ms / HOUR)} ч`
}

function plural(n: number, one: string, few: string, many: string): string {
  const d = n % 10
  const dd = n % 100
  if (d === 1 && dd !== 11) return one
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few
  return many
}

// Подпись сроков для экранов: «возражение — 2 ч, апелляция — сутки, молчание — 12 ч, суд — 12 ч»
export function paceSummary(times: Times): string {
  return TIME_KEYS.map((k) => `${TIME_LABELS[k]} — ${durationText(times[k])}`).join(', ')
}

// Отказы
export const BAD_PACE = 'Темп комнаты — «обычный», «быстрый» или «свой»'
export const NEED_PACE_TIMES = 'Свой темп — нужны все четыре срока: возражение, апелляция, молчание и суд'
export const EXTRA_PACE_TIMES = 'Сроки задаются только у своего темпа — у обычного и быстрого они готовые'
export const ONLY_HOST_PACE = 'Темп комнаты меняет только ведущий'
export const SAME_PACE = 'Этот темп уже выбран'

// Отказ срока «своего» темпа — с допустимыми значениями: «Срок „возражение“ — один из: 2 ч, 6 ч, …»
export function badTime(key: TimeKey): string {
  return `Срок «${TIME_LABELS[key]}» — один из: ${TIME_CHOICES[key].map(durationText).join(', ')}`
}

// Темп, как пишется в записи журнала: у «своего» — сроки, у обычного и быстрого — без них
export type PaceInput = { pace: 'normal' | 'fast' } | { pace: 'custom'; times: Times }
// Темп комнаты с его сроками
export type RoomPace = { pace: Pace; times: Times }

type Checked<T> = { ok: true; value: T } | { ok: false; error: string }

function absent(x: unknown): boolean {
  return x === undefined || x === null
}

// Проверка темпа из запроса: один из трёх; у «своего» — все четыре срока, каждый из списка; у обычного
// и быстрого сроков в запросе нет. Лишние поля сроков отбрасываются
export function checkPace(input: { pace: unknown; times?: unknown }): Checked<PaceInput> {
  const pace = input.pace
  if (pace === 'normal' || pace === 'fast') {
    return absent(input.times) ? { ok: true, value: { pace } } : { ok: false, error: EXTRA_PACE_TIMES }
  }
  if (pace !== 'custom') return { ok: false, error: BAD_PACE }
  const t = input.times
  if (typeof t !== 'object' || t === null || Array.isArray(t)) return { ok: false, error: NEED_PACE_TIMES }
  const r = t as Record<string, unknown>
  if (TIME_KEYS.some((k) => absent(r[k]))) return { ok: false, error: NEED_PACE_TIMES }
  for (const k of TIME_KEYS) if (!TIME_CHOICES[k].includes(r[k] as number)) return { ok: false, error: badTime(k) }
  return { ok: true, value: { pace, times: { objection: r.objection as number, appeal: r.appeal as number, silence: r.silence as number, court: r.court as number } } }
}

// Сроки темпа: обычный и быстрый — готовые наборы, «свой» — его сроки (без них — обычные)
export function paceTimes(p: { pace: Pace; times?: Times }): Times {
  if (p.pace === 'fast') return FAST_TIMES
  if (p.pace === 'custom' && p.times) return p.times
  return NORMAL_TIMES
}

// Сроки из записи события или пари: поле есть и в нём четыре положительных целых — они; нет поля (все
// записи до темпа) или оно битое — обычный набор
export function recordTimes(x: unknown): Times | undefined {
  if (typeof x !== 'object' || x === null) return undefined
  const r = x as Record<string, unknown>
  if (!TIME_KEYS.every((k) => Number.isSafeInteger(r[k]) && (r[k] as number) > 0)) return undefined
  return { objection: r.objection as number, appeal: r.appeal as number, silence: r.silence as number, court: r.court as number }
}

// Сроки события или пари для правил: закреплённые при создании, нет — обычный набор
export function timesOf(x: { times?: Times }): Times {
  return x.times ?? NORMAL_TIMES
}

function sameTimes(a: Times, b: Times): boolean {
  return TIME_KEYS.every((k) => a[k] === b[k])
}

// Смена темпа ведущим (образец — checkSettleMode, settle.ts): только ведущий, темп — checkPace, не тот
// же самый (тот же темп с теми же сроками — SAME_PACE). current — нынешний темп комнаты (logPace).
// Можно — null, иначе отказ
export function checkPaceChange(current: RoomPace, room: { hostId: string }, memberId: string, input: { pace: unknown; times?: unknown }): string | null {
  if (memberId !== room.hostId) return ONLY_HOST_PACE
  const p = checkPace(input)
  if (!p.ok) return p.error
  return p.value.pace === current.pace && sameTimes(paceTimes(p.value), current.times) ? SAME_PACE : null
}

// Темп из записи комнаты: годный — он, нет поля или битый — обычный
function entryPace(x: { pace?: unknown; times?: unknown }): RoomPace {
  const p = checkPace({ pace: x.pace, times: x.times })
  return p.ok ? { pace: p.value.pace, times: paceTimes(p.value) } : { pace: DEFAULT_PACE, times: NORMAL_TIMES }
}

// Нынешний темп комнаты из журнала: при создании (room.created; нет поля — обычный), затем последняя
// смена room.pace, которую разрешает checkPaceChange (автор — ведущий, темп годный): сервер и свёртка
// не расходятся
export function logPace(log: readonly LogEntry[]): RoomPace {
  const created = log.find((e) => e.type === 'room.created')
  if (!created || created.type !== 'room.created') return { pace: DEFAULT_PACE, times: NORMAL_TIMES }
  let current = entryPace(created)
  const room = { hostId: created.memberId }
  for (const e of log) {
    if (e.type !== 'room.pace') continue
    if (!checkPaceChange(current, room, e.memberId, e)) current = entryPace(e)
  }
  return current
}
