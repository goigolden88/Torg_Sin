// «Выбор» (этап 7, Р-09, Р-39; Архитектура, «Правила выбора в коде»): голосование деньгами внутри обычной
// комнаты. Компания выбирает один из вариантов; две фазы со сроками при создании: сначала любой участник
// добавляет варианты, затем все вкладывают — каждый только в один вариант. Побеждает вариант с большей
// суммой; ничья в конце — продление, дальше — жребий сервера среди равных. Платят только вложившиеся в
// победивший — получателю (участник комнаты; «касса» — только подпись); свой вклад получатель не платит;
// итог окончательный сразу — спора и суда нет. Здесь — форма, проверки и состояние выбора из записей
// ChoiceRecord (автор, время сервера at, порядок — журнала); из журнала их берёт logChoices. Статусы, итоги
// и долги считаются, не хранятся. Ни DOM, ни Cloudflare
import { AUCTION_EXTEND, AUCTION_MAX, AUCTION_MIN, auctionLatestEnd, extendEnd } from './auction'
import { courtHash } from './court'
import { MAX_EVENT_TEXT } from './event'
import type { ChoiceStake, ChoiceStatus, ChoiceView } from './protocol'
import { foldLog, type LogEntry } from './room'

export type { ChoiceStake, ChoiceStatus }

export const MAX_CHOICE_OPTION = 40
export const MAX_CHOICE_OPTIONS = 10

// Отказы формы
export const NEED_QUESTION = 'Нужен вопрос'
export const LONG_QUESTION = `Вопрос — не длиннее ${MAX_EVENT_TEXT} знаков`
export const NEED_OPTION = 'Вариант не может быть пустым'
export const LONG_OPTION = `Вариант — не длиннее ${MAX_CHOICE_OPTION} знаков`
export const SAME_OPTION = 'Такой вариант уже есть'
export const TOO_MANY_OPTIONS = `Вариантов — не больше ${MAX_CHOICE_OPTIONS}`
export const BAD_OPTIONS = 'Варианты — списком названий'
export const BAD_RECIPIENT = 'Получатель — участник комнаты'
export const NEED_CHOICE_TIMES = 'Нужны сроки: «варианты до» и «вклады до»'
export const OPTIONS_SHORT = 'Варианты — не меньше 10 минут'
export const STAKES_SHORT = 'Вклады — не меньше 10 минут после «варианты до»'
export const CHOICE_LONG = 'Выбор — не дольше 3 дней'
// Вариант и вклад
export const NOT_MEMBER = 'Это может только участник комнаты'
export const OPTIONS_CLOSED = 'Варианты больше не добавить — идут вклады'
export const STAKES_NOT_YET = 'Вклады — после «варианты до»'
export const CHOICE_NO_OPTIONS = 'Меньше двух вариантов — выбор не состоялся'
export const CHOICE_OVER = 'Вклады закончены'
export const NO_OPTION = 'Такого варианта нет'
export const ONE_OPTION = 'Вы уже вложили в другой вариант — вкладывают только в один'
export const BAD_STAKE = 'Вклад — целое число больше нуля'
// Жребий при ничьей
export const NO_DRAW = 'Жребий не нужен: ничьей в конце нет'
export const DRAW_DONE = 'Жребий уже брошен'
export const BAD_DRAW_SEED = 'Зерно жребия — шестнадцатеричные цифры'
export const BAD_DRAW_OPTIONS = 'Жребий — среди вариантов, равных по сумме в конце'

type Checked<T> = { ok: true; value: T } | { ok: false; error: string }

// Комната для правил выбора: ведущий (получатель по умолчанию) и участники
export type ChoiceRoom = { hostId: string; members: readonly string[] }

// Проверенная форма выбора: варианты автора — названия по порядку (можно ни одного)
export type ChoiceInput = {
  question: string
  options: string[]
  recipient: string
  cashbox: boolean
  optionsUntil: number
  closesAt: number
}

// Длина — в знаках, а не в единицах UTF-16: эмодзи — один знак
function length(s: string): number {
  return [...s].length
}

// Для сравнения вариантов: без учёта регистра и пробелов по краям
function optionKey(title: string): string {
  return title.trim().toLowerCase()
}

// Название варианта: не пустое, ≤ 40 знаков; пробелы по краям срезаются
export function checkOptionTitle(x: unknown): Checked<string> {
  const s = typeof x === 'string' ? x.trim() : ''
  if (!s) return { ok: false, error: NEED_OPTION }
  if (length(s) > MAX_CHOICE_OPTION) return { ok: false, error: LONG_OPTION }
  return { ok: true, value: s }
}

// Проверка формы без времени сервера (его — checkChoiceTimes): вопрос — не пустой, ≤ 300 знаков; варианты
// — не заданы или список: каждый — checkOptionTitle, не больше 10, без повторов (без учёта регистра);
// получатель — не задан — ведущий, иначе участник комнаты; «касса» — только true; сроки — числа
export function checkChoiceInput(
  x: { question: unknown; options?: unknown; recipient?: unknown; cashbox?: unknown; optionsUntil: unknown; closesAt: unknown },
  room: ChoiceRoom,
): Checked<ChoiceInput> {
  const question = typeof x.question === 'string' ? x.question.trim() : ''
  if (!question) return { ok: false, error: NEED_QUESTION }
  if (length(question) > MAX_EVENT_TEXT) return { ok: false, error: LONG_QUESTION }
  const raw = x.options === undefined || x.options === null ? [] : x.options
  if (!Array.isArray(raw)) return { ok: false, error: BAD_OPTIONS }
  if (raw.length > MAX_CHOICE_OPTIONS) return { ok: false, error: TOO_MANY_OPTIONS }
  const options: string[] = []
  for (const o of raw) {
    const title = checkOptionTitle(o)
    if (!title.ok) return title
    if (options.some((t) => optionKey(t) === optionKey(title.value))) return { ok: false, error: SAME_OPTION }
    options.push(title.value)
  }
  const recipient = x.recipient === undefined || x.recipient === null ? room.hostId : x.recipient
  if (typeof recipient !== 'string' || !room.members.includes(recipient)) return { ok: false, error: BAD_RECIPIENT }
  if (!Number.isSafeInteger(x.optionsUntil) || !Number.isSafeInteger(x.closesAt)) return { ok: false, error: NEED_CHOICE_TIMES }
  return {
    ok: true,
    value: {
      question,
      options,
      recipient,
      cashbox: x.cashbox === true,
      optionsUntil: x.optionsUntil as number,
      closesAt: x.closesAt as number,
    },
  }
}

// Сроки по времени сервера (постоянные решения, не темпа): «варианты до» — не раньше чем через 10 минут;
// «вклады до» — не раньше чем через 10 минут после «варианты до» и не позже чем через 3 дня с создания.
// Годные — null
export function checkChoiceTimes(input: { optionsUntil: number; closesAt: number }, now: number): string | null {
  if (input.optionsUntil < now + AUCTION_MIN) return OPTIONS_SHORT
  if (input.closesAt < input.optionsUntil + AUCTION_MIN) return STAKES_SHORT
  if (input.closesAt > now + AUCTION_MAX) return CHOICE_LONG
  return null
}

// Записи выбора — как будут в журнале комнаты: memberId — автор записи, at — время сервера. Номер выбора —
// id записи choice.created; номер варианта автора — '1', '2', … по порядку, добавленного — id записи
// choice.option
export type ChoiceCreated = {
  type: 'choice.created'
  id: string
  at: number
  memberId: string
  question: string
  options: string[]
  recipient: string
  cashbox: boolean
  optionsUntil: number
  closesAt: number
}
type ChoiceAct<T extends string, X = object> = { type: T; id: string; at: number; memberId: string; choice: string } & X
export type ChoiceRecord =
  | ChoiceCreated
  | ChoiceAct<'choice.option', { title: string }> // участник: вариант
  | ChoiceAct<'choice.stake', { option: string; amount: number }> // участник: в какой вариант, сколько
  | ChoiceAct<'choice.drawn', { seed: string; options: string[] }> // сервер: жребий при ничьей

// Вариант: кто и когда предложил (у вариантов автора — автор и миг создания)
export type ChoiceOption = { id: string; at: number; by: string; title: string }

// Выбор из записей. endsAt — конец вкладов с продлениями вкладами (ничью в конце добавляет choiceEnd);
// stakes — действующие вклады по порядку; draw — жребий сервера при ничьей
export type ChoiceState = {
  id: string
  at: number
  authorId: string
  question: string
  recipientId: string
  cashbox: boolean
  optionsUntil: number
  closesAt: number
  endsAt: number
  options: ChoiceOption[]
  stakes: ChoiceStake[]
  draw: { id: string; at: number; seed: string; options: string[] } | null
}

// Суммы вариантов по вкладам раньше мига before (не задан — все), в порядке вариантов
export function optionTotals(c: ChoiceState, before = Infinity): Map<string, number> {
  const totals = new Map(c.options.map((o) => [o.id, 0]))
  for (const s of c.stakes) if (s.at < before) totals.set(s.option, (totals.get(s.option) ?? 0) + s.amount)
  return totals
}

// Равные по наибольшей сумме варианты по вкладам раньше мига at: ничьей нет (лидер один или вкладов нет)
// — пусто
export function choiceTie(c: ChoiceState, at: number): string[] {
  const totals = [...optionTotals(c, at)]
  const top = Math.max(0, ...totals.map(([, sum]) => sum))
  const tied = totals.filter(([, sum]) => sum === top && top > 0).map(([id]) => id)
  return tied.length > 1 ? tied : []
}

// Конец вкладов на now: endsAt; ничья в этот миг — ещё 2 минуты, снова и снова, не дальше «вклады до» +
// 30 минут (latestEnd). Смотрит только прошедшие мгновения (≤ now): будущий конец ещё может сдвинуться
export function choiceEnd(c: ChoiceState, now: number): number {
  const latest = auctionLatestEnd(c)
  let end = c.endsAt
  while (end <= now && end < latest && choiceTie(c, end).length > 0) end = Math.min(latest, end + AUCTION_EXTEND)
  return end
}

// Вариант при ничьей по жребию: наименьший courtHash(зерно + ':' + номер варианта), равные — по номеру
// (тот же хеш, что у жребия суда, Р-25)
export function drawChoice(seed: string, options: readonly string[]): string | null {
  const key = (o: string) => courtHash(`${seed}:${o}`)
  return [...new Set(options)].sort((a, b) => key(a) - key(b) || (a < b ? -1 : a > b ? 1 : 0))[0] ?? null
}

// Вариант: участник, в фазе вариантов (now < «варианты до»), не больше 10 вариантов, без повторов (без
// учёта регистра). Можно — null
export function checkChoiceOption(c: ChoiceState, memberId: string, title: unknown, room: Pick<ChoiceRoom, 'members'>, now: number): string | null {
  if (!room.members.includes(memberId)) return NOT_MEMBER
  if (now >= c.optionsUntil) return OPTIONS_CLOSED
  const t = checkOptionTitle(title)
  if (!t.ok) return t.error
  if (c.options.length >= MAX_CHOICE_OPTIONS) return TOO_MANY_OPTIONS
  if (c.options.some((o) => optionKey(o.title) === optionKey(t.value))) return SAME_OPTION
  return null
}

// Вклад: участник, в фазе вкладов (с «варианты до» до конца с продлениями), вариантов хотя бы два; в
// существующий вариант; первый вклад участника выбирает вариант — дальше только в него; сумма — целое > 0.
// Вклад не отзывается. Можно — null
export function checkChoiceStake(
  c: ChoiceState,
  memberId: string,
  option: unknown,
  amount: unknown,
  room: Pick<ChoiceRoom, 'members'>,
  now: number,
): string | null {
  if (!room.members.includes(memberId)) return NOT_MEMBER
  if (now < c.optionsUntil) return STAKES_NOT_YET
  if (c.options.length < 2) return CHOICE_NO_OPTIONS
  if (now >= choiceEnd(c, now)) return CHOICE_OVER
  if (!c.options.some((o) => o.id === option)) return NO_OPTION
  const mine = c.stakes.find((s) => s.by === memberId)
  if (mine && mine.option !== option) return ONE_OPTION
  if (!Number.isSafeInteger(amount) || (amount as number) < 1) return BAD_STAKE
  return null
}

// Нужен ли жребий на now: вклады кончились (с продлениями), в конце — ничья (значит, продления исчерпаны)
export function choiceDrawDue(c: ChoiceState, now: number): boolean {
  if (c.options.length < 2 || now < c.optionsUntil) return false
  const end = choiceEnd(c, now)
  return end <= now && choiceTie(c, end).length > 0
}

// Равные варианты, среди которых бросают жребий на now (жребий нужен, ещё не брошен); иначе пусто — по
// ним сервер пишет запись choice.drawn
export function choiceDrawOptions(c: ChoiceState, now: number): string[] {
  return c.draw === null && choiceDrawDue(c, now) ? choiceTie(c, choiceEnd(c, now)) : []
}

// Жребий в записи choice.drawn: нужен на now, ещё не брошен; зерно — hex; варианты — ровно равные в конце
// (порядок не важен). Можно — null
export function checkChoiceDraw(c: ChoiceState, seed: unknown, options: unknown, now: number): string | null {
  if (c.draw !== null) return DRAW_DONE
  if (!choiceDrawDue(c, now)) return NO_DRAW
  if (typeof seed !== 'string' || !/^[0-9a-f]+$/i.test(seed)) return BAD_DRAW_SEED
  const tied = choiceTie(c, choiceEnd(c, now))
  const same =
    Array.isArray(options) &&
    options.length === tied.length &&
    new Set(options).size === options.length &&
    options.every((o) => tied.includes(o))
  return same ? null : BAD_DRAW_OPTIONS
}

// Запись choice.created: форма и сроки — те же проверки на её время; автор — участник
function createdOk(r: ChoiceCreated, room: ChoiceRoom): boolean {
  const input = checkChoiceInput(r, room)
  return (
    input.ok &&
    input.value.question === r.question &&
    input.value.options.length === r.options.length &&
    input.value.options.every((t, i) => t === r.options[i]) &&
    input.value.cashbox === r.cashbox &&
    checkChoiceTimes(r, r.at) === null &&
    room.members.includes(r.memberId)
  )
}

// Выборы комнаты из записей по порядку создания. Запись действует, если её разрешают правила выше на её
// время at (так сервер и свёртка не расходятся); записи о неизвестном выборе не действуют
export function roomChoices(records: readonly ChoiceRecord[], room: ChoiceRoom): ChoiceState[] {
  const choices = new Map<string, ChoiceState>()
  for (const r of records) {
    if (r.type === 'choice.created') {
      if (choices.has(r.id) || !createdOk(r, room)) continue
      choices.set(r.id, {
        id: r.id,
        at: r.at,
        authorId: r.memberId,
        question: r.question,
        recipientId: r.recipient,
        cashbox: r.cashbox,
        optionsUntil: r.optionsUntil,
        closesAt: r.closesAt,
        endsAt: r.closesAt,
        options: r.options.map((title, i) => ({ id: String(i + 1), at: r.at, by: r.memberId, title })),
        stakes: [],
        draw: null,
      })
      continue
    }
    const c = choices.get(r.choice)
    if (!c) continue
    switch (r.type) {
      case 'choice.option':
        if (checkChoiceOption(c, r.memberId, r.title, room, r.at)) break
        c.options.push({ id: r.id, at: r.at, by: r.memberId, title: (checkOptionTitle(r.title) as { ok: true; value: string }).value })
        break
      case 'choice.stake': {
        if (checkChoiceStake(c, r.memberId, r.option, r.amount, room, r.at)) break
        // Продление: вклад за 2 минуты до конца (с продлениями ничьей) — конец через 2 минуты после него,
        // не дальше «вклады до» + 30 минут
        const end = choiceEnd(c, r.at)
        c.stakes.push({ id: r.id, at: r.at, by: r.memberId, option: r.option, amount: r.amount })
        c.endsAt = extendEnd({ endsAt: end, closesAt: c.closesAt }, r.at)
        break
      }
      case 'choice.drawn':
        if (checkChoiceDraw(c, r.seed, r.options, r.at)) break
        c.draw = { id: r.id, at: r.at, seed: r.seed, options: [...r.options] }
        break
    }
  }
  return [...choices.values()]
}

export type ChoiceOutcome = {
  status: ChoiceStatus
  failed: 'options' | 'stakes' | null
  endsAt: number // конец вкладов с продлениями на now
  winner: string | null
  how: 'sum' | 'draw' | null
  closedAt: number | null
}

// Выбор на now (время сервера), без будильника: фаза вариантов → меньше двух вариантов — «не состоялся»
// (миг — «варианты до») → вклады идут → вкладов нет — «не состоялся» (миг — конец) → лидер один —
// «решён» суммой → ничья после всех продлений: жребий брошен — «решён» жребием (миг — жребия), нет —
// «ждёт жребия»
export function choiceOutcome(c: ChoiceState, now: number): ChoiceOutcome {
  const endsAt = choiceEnd(c, now)
  const out = (status: ChoiceStatus, rest: Partial<Omit<ChoiceOutcome, 'status' | 'endsAt'>> = {}): ChoiceOutcome => ({
    status,
    failed: null,
    endsAt,
    winner: null,
    how: null,
    closedAt: null,
    ...rest,
  })
  if (now < c.optionsUntil) return out('options')
  if (c.options.length < 2) return out('failed', { failed: 'options', closedAt: c.optionsUntil })
  if (now < endsAt) return out('open')
  if (c.stakes.length === 0) return out('failed', { failed: 'stakes', closedAt: endsAt })
  if (choiceTie(c, endsAt).length > 0) {
    if (!c.draw) return out('draw')
    return out('decided', { winner: drawChoice(c.draw.seed, c.draw.options), how: 'draw', closedAt: c.draw.at })
  }
  const totals = [...optionTotals(c, endsAt)]
  const top = Math.max(...totals.map(([, sum]) => sum))
  const winner = totals.find(([, sum]) => sum === top)?.[0] ?? null
  return out('decided', { winner, how: 'sum', closedAt: endsAt })
}

// Кто сколько должен получателю на now: только у решённого — каждый вложившийся в победивший вариант, его
// сумма; вклад самого получателя — не долг. Порядок — первого вклада
export function choiceDebts(c: ChoiceState, now: number): { from: string; to: string; amount: number }[] {
  const out = choiceOutcome(c, now)
  if (out.status !== 'decided') return []
  const owed = new Map<string, number>()
  for (const s of c.stakes) {
    if (s.option !== out.winner || s.by === c.recipientId) continue
    owed.set(s.by, (owed.get(s.by) ?? 0) + s.amount)
  }
  return [...owed].map(([from, amount]) => ({ from, to: c.recipientId, amount }))
}

// Итог выбора для «Расчёта»: решён и есть кому платить — получатель +сумма долгов, каждый должник −свою;
// иначе пусто
export function choiceResult(c: ChoiceState, now: number): { memberId: string; net: number }[] {
  const debts = choiceDebts(c, now)
  if (debts.length === 0) return []
  return [{ memberId: c.recipientId, net: debts.reduce((s, d) => s + d.amount, 0) }, ...debts.map((d) => ({ memberId: d.from, net: -d.amount }))]
}

// Сколько у участников «в игре» на now: вклады идут или ждут жребия — сумма вкладов каждого, кроме
// получателя (свой вклад он не платит); иначе пусто. Порядок — первого вклада
export function choiceInPlay(c: ChoiceState, now: number): { memberId: string; amount: number }[] {
  const status = choiceOutcome(c, now).status
  if (status !== 'open' && status !== 'draw') return []
  const sums = new Map<string, number>()
  for (const s of c.stakes) if (s.by !== c.recipientId) sums.set(s.by, (sums.get(s.by) ?? 0) + s.amount)
  return [...sums].map(([memberId, amount]) => ({ memberId, amount }))
}

// Выбор для ответа на now: условия, варианты с суммами, вклады (видны всем, Р-11), итог и долги
export function choiceView(c: ChoiceState, now: number): ChoiceView {
  const out = choiceOutcome(c, now)
  const totals = optionTotals(c)
  return {
    id: c.id,
    at: c.at,
    authorId: c.authorId,
    question: c.question,
    recipientId: c.recipientId,
    cashbox: c.cashbox,
    optionsUntil: c.optionsUntil,
    closesAt: c.closesAt,
    latestEnd: auctionLatestEnd(c),
    endsAt: out.endsAt,
    status: out.status,
    failed: out.failed,
    options: c.options.map((o) => ({ id: o.id, at: o.at, by: o.by, title: o.title, total: totals.get(o.id) ?? 0 })),
    stakes: c.stakes.map((s) => ({ id: s.id, at: s.at, by: s.by, option: s.option, amount: s.amount })),
    winner: out.winner,
    how: out.how,
    draw: c.draw && { at: c.draw.at, seed: c.draw.seed, options: [...c.draw.options] },
    debts: choiceDebts(c, now),
    closedAt: out.closedAt,
  }
}

// Выбор в журнале комнаты (Р-39). requestId — номер запроса телефона: повтор узнаётся по нему
const CHOICE_ENTRIES = ['choice.created', 'choice.option', 'choice.stake', 'choice.drawn'] as const
export type ChoiceEntry = Extract<LogEntry, { type: (typeof CHOICE_ENTRIES)[number] }>

export function isChoiceEntry(e: LogEntry): e is ChoiceEntry {
  return (CHOICE_ENTRIES as readonly string[]).includes(e.type)
}

// Запись журнала → запись правил: те же поля без номера запроса
export function choiceRecord(e: ChoiceEntry): ChoiceRecord {
  const base = { id: e.id, at: e.at, memberId: e.memberId }
  switch (e.type) {
    case 'choice.created':
      return {
        ...base,
        type: 'choice.created',
        question: e.question,
        options: e.options,
        recipient: e.recipient,
        cashbox: e.cashbox,
        optionsUntil: e.optionsUntil,
        closesAt: e.closesAt,
      }
    case 'choice.option':
      return { ...base, type: 'choice.option', choice: e.choice, title: e.title }
    case 'choice.stake':
      return { ...base, type: 'choice.stake', choice: e.choice, option: e.option, amount: e.amount }
    case 'choice.drawn':
      return { ...base, type: 'choice.drawn', choice: e.choice, seed: e.seed, options: e.options }
  }
}

// Выборы комнаты из журнала по порядку создания (roomChoices) с ведущим и участниками из журнала; комнаты
// нет — пусто
export function logChoices(log: readonly LogEntry[]): ChoiceState[] {
  const state = foldLog(log)
  if (!state) return []
  return roomChoices(log.filter(isChoiceEntry).map(choiceRecord), { hostId: state.hostId, members: state.members.map((m) => m.id) })
}
