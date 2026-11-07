// Протокол сайта и сервера (Р-01): версия — в каждом ответе и сообщении. Чистые
// функции и типы — ими пользуются и экран, и сервер; ни DOM, ни Cloudflare здесь нет
export const PROTOCOL_VERSION = 2

// Ответ GET /health: сервер жив, его протокол и время (UTC, мс) — по нему закрываются сроки
export type Health = { v: number; ok: true; time: number }

// Отказ: понятный человеку текст. join — у ключа заявки, которую ещё не впустили
// («waiting») или отклонили («rejected»): экран ожидания различает их без разбора текста
export type ErrorResponse = { v: number; error: string; join?: 'waiting' | 'rejected' }

// POST /rooms: создать комнату по паролю компании (Р-03). requestId — номер запроса (ULID)
// от телефона: повтор с тем же номером даёт ту же комнату и тот же ответ
export type CreateRoomRequest = {
  v?: number
  password: string
  name: string
  currency: string
  hostName: string
  requestId?: string
}

// Ответ на создание: номер комнаты, токен приглашения, номер участника-ведущего и ключ его
// телефона — ключ дальше идёт в заголовке Authorization: Bearer <ключ>
export type CreateRoomResponse = { v: number; roomId: string; invite: string; memberId: string; key: string }

// GET /rooms/<номер> с ключом телефона: состояние комнаты; me — номер владельца ключа;
// events — события-пул по порядку создания; offers — пари по порядку создания (Р-22; все пари
// комнаты, адресные тоже — тайных нет; сервер до этапа 3 поля не шлёт); now — время сервера
// (UTC, мс): по нему сайт считает отсчёт до закрытия приёма, а не по часам телефона
export type RoomStateResponse = {
  v: number
  room: { id: string; name: string; currency: string; hostId: string; createdAt: number }
  members: { id: string; name: string }[]
  me: string
  events: EventView[]
  offers?: OfferView[]
  now: number
}

// Пари один на один (этап 3, Р-04, Р-22; правила — offer.ts). Условия пари; сумма соперника —
// сумма автора × b ÷ a вниз до целой единицы (считается, не хранится); guarantorId — гарант
// (выбранный или ведущий); counterTo — встречное к какому пари
export type OfferInfo = {
  id: string
  at: number // предложено
  authorId: string
  condition: string
  check: string // как проверяем
  side: 'yes' | 'no' // сторона автора: «сбудется» / «не сбудется»
  odds: { a: number; b: number } // кэф «a к b»: автор рискует a·k, соперник b·k
  amount: number // сумма автора
  takerAmount: number // сумма соперника
  to: string | null // адресат; null — открытое
  closesAt: number // приём до (не включая)
  expectedAt: number // исход к
  guarantorId: string
  counterTo: string | null
}

// «открыто» / «истекло» (приём до прошёл, по времени сервера) / «отозвано» / «закрыто встречным» /
// «принято»
export type OfferStatus = 'open' | 'expired' | 'withdrawn' | 'countered' | 'accepted'

// Действие с пари: кто (by), когда, с каким пари
export type OfferAct = { id: string; at: number; by: string; offer: string }

// Сторона пари: автор или соперник (принявший). Отметка и решение гаранта — кто прав
export type OfferSide = 'author' | 'taker'

// Ход исхода пари (Р-23) на now: «стороны отмечают» / «решает гарант» / «нужен другой гарант» /
// «утверждён» / «окончательный»
export type OfferPhase = 'marking' | 'guarantor' | 'need-guarantor' | 'approved' | 'final'

// Исход принятого пари (offerOutcome в offer.ts): marks — последняя отметка каждой стороны (null — не
// отмечала); guarantorId — нынешний гарант; turnAt — с какого мига решает гарант; guarantorUntil — до
// какого мига он решает (утверждено — null); needSince — с какого мига нужен другой гарант;
// nominations — кого называют стороны; approved — что, когда, как и кем утверждено; finalAt — с какого
// мига окончательный (согласием — сразу, гарантом — через 7 дней)
export type OfferOutcomeView = {
  phase: OfferPhase
  marks: Record<OfferSide, OfferSide | null>
  guarantorId: string
  turnAt: number
  guarantorUntil: number | null
  needSince: number | null
  nominations: Partial<Record<OfferSide, string>>
  approved: { winner: OfferSide; at: number; how: 'agreement' | 'guarantor'; by: string | null } | null
  finalAt: number | null
}

// Пари в состоянии комнаты: статус на now; accepted — кто принял и когда; withdrawnAt — когда
// отозвано; closedBy — каким встречным закрыто; outcome — исход (Р-23; не принято — null)
export type OfferView = OfferInfo & {
  status: OfferStatus
  accepted: { by: string; at: number } | null
  withdrawnAt: number | null
  closedBy: { offer: string; at: number } | null
  outcome: OfferOutcomeView | null
}

// POST /rooms/<номер>/offers — предложить пари. side не задана — «сбудется»; to не задан — открытое;
// guarantor не задан — ведущий. requestId — номер запроса (ULID): повтор — то же пари и тот же ответ
export type CreateOfferRequest = {
  v?: number
  condition: string
  check: string
  side?: 'yes' | 'no'
  odds: { a: number; b: number }
  amount: number
  to?: string
  closesAt: number
  expectedAt: number
  guarantor?: string
  requestId?: string
}
export type CreateOfferResponse = { v: number; offer: OfferInfo }
// POST …/offers/<пари>/counter — встречное: свои кэф и/или сумма (не заданы — исходного) и «приём до»;
// остальное — исходного, сторона — обратная, адресат — автор исходного. Ответ — новое пари
export type CounterOfferRequest = { v?: number; odds?: { a: number; b: number }; amount?: number; closesAt: number; requestId?: string }
// POST …/offers/<пари>/accept и /revoke — принять и отозвать
export type OfferActRequest = { v?: number; requestId?: string }
export type AcceptOfferResponse = { v: number; accepted: OfferAct; offer: OfferInfo }
export type RevokeOfferResponse = { v: number; revoked: OfferAct }
// Исход пари (Р-23). POST …/offers/<пари>/mark { winner } — сторона принятого пари: кто прав;
// повтор той же отметки — прежняя запись. …/decide { winner } — гарант, когда решение перешло к нему.
// …/decline {} — гарант отказывается. …/nominate { guarantor } — сторона называет нового гаранта
export type OfferWinnerRequest = { v?: number; winner: OfferSide; requestId?: string }
export type NominateRequest = { v?: number; guarantor: string; requestId?: string }
export type OfferWinnerAct = OfferAct & { winner: OfferSide }
export type MarkOfferResponse = { v: number; marked: OfferWinnerAct }
export type DecideOfferResponse = { v: number; decided: OfferWinnerAct }
export type DeclineOfferResponse = { v: number; declined: OfferAct }
export type NominateResponse = { v: number; nominated: OfferAct & { guarantor: string } }

// Событие-пул: что не меняется никогда. Исход — номер и текст; свои исходы кончаются «Другое»
export type EventInfo = {
  id: string
  at: number // заведено
  authorId: string
  condition: string
  check: string // как проверяем
  outcomes: { id: string; title: string }[]
  closesAt: number // приём ставок до (не включая)
  expectedAt: number // исход ожидается к
  subjectId: string | null // предмет спора — участник комнаты, если спор о нём
}

export type BetInfo = { id: string; event: string; memberId: string; outcome: string; amount: number; at: number }
export type Clarification = { id: string; at: number; text: string }
export type Cancellation = { at: number; by: string; reason: string | null }

// «приём идёт» / «приём закрыт» (по времени сервера) / «отменено»
export type EventStatus = 'open' | 'closed' | 'cancelled'

// Исход события: предложение, решение ведущего, голос — кто (by), когда, какой исход
export type OutcomeMark = { id: string; at: number; by: string; outcome: string }
// Возражение ставившего против предложенного исхода
export type Objection = { id: string; at: number; by: string; reason: string }
// Согласие ставившего с предложенным исходом (Р-21): не отзывается
export type Agreement = { id: string; at: number; by: string }

// «сутки на возражение» / «ждёт решения ведущего» / «голосование» / «ждёт суда» (этап 4) /
// «утверждён» / «окончательный» (7 дней после утверждения без апелляции) — на время сервера /
// «отменено» — событие отменено на любом шаге исхода: без выплат, окончательным не станет (Р-19)
export type OutcomeStatus = 'proposed' | 'disputed' | 'voting' | 'court' | 'approved' | 'final' | 'cancelled'

// Как утверждён: сам — сутки без возражения (by — null); ведущим (by — ведущий);
// голосованием (by — null); согласием всех ставивших — сразу окончательный (by — null; Р-21)
export type Approval = { outcome: string; at: number; how: 'unopposed' | 'host' | 'vote' | 'agreed'; by: string | null }

// Строка выплат по утверждённому исходу (pool.ts, settlePool)
export type Payout = { memberId: string; staked: number; payout: number; net: number }

export type OutcomeView = {
  status: OutcomeStatus
  proposal: OutcomeMark
  objectionUntil: number // возразить можно до (не включая)
  objections: Objection[]
  agreements: Agreement[] // согласия ставивших (кроме предложившего) в срок на возражение
  awaiting: string[] // чьего согласия ещё ждём, пока исход «на возражении»; иначе — пусто
  decision: OutcomeMark | null
  voters: string[] // кто голосует (не ставили и не предмет спора); голосования нет — пусто
  votingUntil: number | null // голосование до (не включая)
  votes: OutcomeMark[]
  approved: Approval | null // что утверждено; событие отменено после утверждения — остаётся для истории
  finalAt: number | null // станет окончательным (не утверждён или событие отменено — null)
  void: boolean // «без игры»: каждому — его сумма
  payouts: Payout[] // по утверждённому исходу; не утверждён или событие отменено — пусто
}

// Событие в состоянии комнаты: ставки по порядку журнала, уточнения, статус; отменено —
// refunds: каждому участнику — его сумма; outcome — исход (не предложен — null)
export type EventView = EventInfo & {
  status: EventStatus
  clarifications: Clarification[]
  bets: Omit<BetInfo, 'event'>[]
  cancelled: Cancellation | null
  refunds: { memberId: string; amount: number }[]
  outcome: OutcomeView | null
}

// POST /rooms/<номер>/events — завести событие. outcomes не задан — «Да» и «Нет»; requestId —
// номер запроса (ULID): повтор с тем же номером — то же событие и тот же ответ
export type CreateEventRequest = {
  v?: number
  condition: string
  check: string
  outcomes?: string[]
  closesAt: number
  expectedAt: number
  subject?: string
  requestId?: string
}
export type CreateEventResponse = { v: number; event: EventInfo }

// POST /rooms/<номер>/events/<событие>/bets — ставка; сумма — целое > 0 в минимальных единицах
export type PlaceBetRequest = { v?: number; outcome: string; amount: number; requestId?: string }
export type PlaceBetResponse = { v: number; bet: BetInfo }

// POST /rooms/<номер>/events/<событие>/clarify — уточнение автора
export type ClarifyEventRequest = { v?: number; text: string }
export type ClarifyEventResponse = { v: number; clarification: Clarification }

// POST /rooms/<номер>/events/<событие>/cancel — отмена; после закрытия приёма — ведущий с причиной
export type CancelEventRequest = { v?: number; reason?: string }
export type CancelEventResponse = { v: number; cancelled: Cancellation }

// Исход события. requestId — номер запроса (ULID): повтор с тем же номером — тот же ответ.
// POST …/events/<событие>/propose — автор события (предмет спора — нет: тогда ведущий;
// автор молчит 3 дня после «исход ожидается к» — и ведущий), после закрытия приёма
export type ProposeOutcomeRequest = { v?: number; outcome: string; requestId?: string }
export type ProposeOutcomeResponse = { v: number; proposal: OutcomeMark }
// POST …/events/<событие>/object — ставивший, кроме предложившего, сутки после предложения
export type ObjectOutcomeRequest = { v?: number; reason: string; requestId?: string }
export type ObjectOutcomeResponse = { v: number; objection: Objection }
// POST …/events/<событие>/agree — ставивший, кроме предложившего, сутки после предложения, пока нет
// возражений (Р-21)
export type AgreeOutcomeRequest = { v?: number; requestId?: string }
export type AgreeOutcomeResponse = { v: number; agreement: Agreement }
// POST …/events/<событие>/decide — ведущий после возражения, если не ставил и не предмет спора
export type DecideOutcomeRequest = { v?: number; outcome: string; requestId?: string }
export type DecideOutcomeResponse = { v: number; decision: OutcomeMark }
// POST …/events/<событие>/vote — не ставивший и не предмет, если ведущий ставил или он предмет
export type VoteOutcomeRequest = { v?: number; outcome: string; requestId?: string }
export type VoteOutcomeResponse = { v: number; vote: OutcomeMark }

// Вход по ссылке (Р-03). Токены — в теле запроса, не в адресе: адреса попадают в журналы.
// POST /rooms/<номер>/preview — что за комната по ссылке-приглашению: только название и ведущий
export type PreviewRequest = { v?: number; invite: string }
export type PreviewResponse = { v: number; name: string; hostName: string }

// POST /rooms/<номер>/join — заявка: ключ телефона, который откроет комнату, когда ведущий
// впустит. requestId — номер запроса (ULID): повтор с тем же номером — та же заявка и тот же ключ
export type JoinRoomRequest = { v?: number; invite: string; name: string; requestId?: string }
export type JoinRoomResponse = { v: number; memberId: string; key: string; join: 'waiting' | 'admitted' | 'rejected' }

// GET /rooms/<номер>/requests — ждущие заявки, только ведущему
export type JoinRequestsResponse = { v: number; requests: { id: string; name: string; at: number }[] }

// POST /rooms/<номер>/admit и /reject — решение ведущего по заявке
export type DecideRequest = { v?: number; request: string }
export type AdmitResponse = { v: number; member: { id: string; name: string } }
export type RejectResponse = { v: number; request: string }

// POST /rooms/<номер>/invite — ведущий меняет ссылку-приглашение: старая перестаёт работать
export type InviteResponse = { v: number; invite: string }

// POST /rooms/<номер>/device — ссылка для другого устройства: одноразовая, на сутки.
// member — за кого (по умолчанию — себе; за другого — только ведущий); unlink — после
// использования прежние ключи участника не открывают комнату (потерял телефон)
export type DeviceLinkRequest = { v?: number; member?: string; unlink?: boolean }
export type DeviceLinkResponse = { v: number; token: string; member: string; expiresAt: number }

// POST /rooms/<номер>/device/claim — другое устройство по ссылке получает свой ключ участника
export type ClaimDeviceRequest = { v?: number; token: string }
export type ClaimDeviceResponse = { v: number; memberId: string; key: string }

export function isHealth(x: unknown): x is Health {
  if (typeof x !== 'object' || x === null) return false
  const h = x as Record<string, unknown>
  return h.ok === true && typeof h.v === 'number' && typeof h.time === 'number'
}

function record(x: unknown): Record<string, unknown> | null {
  return typeof x === 'object' && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : null
}

function strings(r: Record<string, unknown>, ...names: string[]): boolean {
  return names.every((n) => typeof r[n] === 'string')
}

// Проверки ответов для сайта: сервер другой версии или чужой адрес — не то, что ждём
export function isErrorResponse(x: unknown): x is ErrorResponse {
  const r = record(x)
  return !!r && typeof r.v === 'number' && typeof r.error === 'string'
}

export function isCreateRoomResponse(x: unknown): x is CreateRoomResponse {
  const r = record(x)
  return !!r && typeof r.v === 'number' && strings(r, 'roomId', 'invite', 'memberId', 'key')
}

// Отметка заявки в отказе GET /rooms/<номер>: ждём ведущего или отклонили; другое — нет отметки
export function joinMark(x: unknown): 'waiting' | 'rejected' | undefined {
  const r = record(x)
  return r?.join === 'waiting' || r?.join === 'rejected' ? r.join : undefined
}

function versioned(x: unknown): Record<string, unknown> | null {
  const r = record(x)
  return r && typeof r.v === 'number' ? r : null
}

export function isPreviewResponse(x: unknown): x is PreviewResponse {
  const r = versioned(x)
  return !!r && strings(r, 'name', 'hostName')
}

export function isJoinRoomResponse(x: unknown): x is JoinRoomResponse {
  const r = versioned(x)
  return !!r && strings(r, 'memberId', 'key') && (r.join === 'waiting' || r.join === 'admitted' || r.join === 'rejected')
}

export function isJoinRequestsResponse(x: unknown): x is JoinRequestsResponse {
  const r = versioned(x)
  if (!r || !Array.isArray(r.requests)) return false
  return r.requests.every((q) => {
    const request = record(q)
    return !!request && strings(request, 'id', 'name') && typeof request.at === 'number'
  })
}

export function isAdmitResponse(x: unknown): x is AdmitResponse {
  const r = versioned(x)
  const member = r && record(r.member)
  return !!member && strings(member, 'id', 'name')
}

export function isRejectResponse(x: unknown): x is RejectResponse {
  const r = versioned(x)
  return !!r && strings(r, 'request')
}

export function isInviteResponse(x: unknown): x is InviteResponse {
  const r = versioned(x)
  return !!r && strings(r, 'invite') && r.invite !== ''
}

export function isDeviceLinkResponse(x: unknown): x is DeviceLinkResponse {
  const r = versioned(x)
  return !!r && strings(r, 'token', 'member') && typeof r.expiresAt === 'number'
}

export function isClaimDeviceResponse(x: unknown): x is ClaimDeviceResponse {
  const r = versioned(x)
  return !!r && strings(r, 'memberId', 'key')
}

export function isRoomStateResponse(x: unknown): x is RoomStateResponse {
  const r = record(x)
  const room = r && record(r.room)
  if (!r || !room || typeof r.v !== 'number' || typeof r.me !== 'string' || !Array.isArray(r.members)) return false
  if (!strings(room, 'id', 'name', 'currency', 'hostId') || typeof room.createdAt !== 'number') return false
  if (typeof r.now !== 'number' || !Array.isArray(r.events) || !r.events.every(isEventView)) return false
  // Пари — с этапа 3: сервер без них (до выкатки) не ломает сайт
  if (r.offers !== undefined && !list(r.offers, isOfferView)) return false
  return r.members.every((m) => {
    const member = record(m)
    return !!member && strings(member, 'id', 'name')
  })
}

function numbers(r: Record<string, unknown>, ...names: string[]): boolean {
  return names.every((n) => typeof r[n] === 'number')
}

function list(x: unknown, item: (r: Record<string, unknown>) => boolean): boolean {
  return Array.isArray(x) && x.every((i) => {
    const r = record(i)
    return !!r && item(r)
  })
}

function isEventInfo(r: Record<string, unknown>): boolean {
  return (
    strings(r, 'id', 'authorId', 'condition', 'check') &&
    numbers(r, 'at', 'closesAt', 'expectedAt') &&
    (r.subjectId === null || typeof r.subjectId === 'string') &&
    list(r.outcomes, (o) => strings(o, 'id', 'title')) &&
    (r.outcomes as unknown[]).length >= 2
  )
}

function isClarification(r: Record<string, unknown>): boolean {
  return strings(r, 'id', 'text') && numbers(r, 'at')
}

function isCancellation(r: Record<string, unknown>): boolean {
  return strings(r, 'by') && numbers(r, 'at') && (r.reason === null || typeof r.reason === 'string')
}

function isBet(r: Record<string, unknown>): boolean {
  return strings(r, 'id', 'memberId', 'outcome') && numbers(r, 'amount', 'at')
}

function isOutcomeMark(r: Record<string, unknown>): boolean {
  return strings(r, 'id', 'by', 'outcome') && numbers(r, 'at')
}

function isObjection(r: Record<string, unknown>): boolean {
  return strings(r, 'id', 'by', 'reason') && numbers(r, 'at')
}

const OUTCOME_STATUSES: readonly unknown[] = ['proposed', 'disputed', 'voting', 'court', 'approved', 'final', 'cancelled']
const APPROVALS: readonly unknown[] = ['unopposed', 'host', 'vote', 'agreed']

function isAgreement(r: Record<string, unknown>): boolean {
  return strings(r, 'id', 'by') && numbers(r, 'at')
}

function isApproval(r: Record<string, unknown>): boolean {
  return strings(r, 'outcome') && numbers(r, 'at') && APPROVALS.includes(r.how) && (r.by === null || typeof r.by === 'string')
}

function nullable(x: unknown, item: (r: Record<string, unknown>) => boolean): boolean {
  const r = record(x)
  return x === null || (!!r && item(r))
}

function isOutcomeView(r: Record<string, unknown>): boolean {
  const proposal = record(r.proposal)
  return (
    OUTCOME_STATUSES.includes(r.status) &&
    !!proposal &&
    isOutcomeMark(proposal) &&
    numbers(r, 'objectionUntil') &&
    list(r.objections, isObjection) &&
    list(r.agreements, isAgreement) &&
    Array.isArray(r.awaiting) &&
    r.awaiting.every((m) => typeof m === 'string') &&
    nullable(r.decision, isOutcomeMark) &&
    Array.isArray(r.voters) &&
    r.voters.every((v) => typeof v === 'string') &&
    (r.votingUntil === null || typeof r.votingUntil === 'number') &&
    list(r.votes, isOutcomeMark) &&
    nullable(r.approved, isApproval) &&
    (r.finalAt === null || typeof r.finalAt === 'number') &&
    typeof r.void === 'boolean' &&
    list(r.payouts, (p) => strings(p, 'memberId') && numbers(p, 'staked', 'payout', 'net'))
  )
}

// Событие с сервера — и копия на устройстве (src/store/db.ts): запись до нового поля протокола
// проверку не проходит
export function isEventView(x: unknown): x is EventView {
  const r = record(x)
  if (!r || !isEventInfo(r)) return false
  if (r.status !== 'open' && r.status !== 'closed' && r.status !== 'cancelled') return false
  return (
    nullable(r.cancelled, isCancellation) &&
    list(r.clarifications, isClarification) &&
    list(r.bets, isBet) &&
    list(r.refunds, (f) => strings(f, 'memberId') && numbers(f, 'amount')) &&
    nullable(r.outcome, isOutcomeView)
  )
}

export function isCreateEventResponse(x: unknown): x is CreateEventResponse {
  const r = versioned(x)
  const event = r && record(r.event)
  return !!event && isEventInfo(event)
}

export function isPlaceBetResponse(x: unknown): x is PlaceBetResponse {
  const r = versioned(x)
  const bet = r && record(r.bet)
  return !!bet && isBet(bet) && strings(bet, 'event')
}

export function isClarifyEventResponse(x: unknown): x is ClarifyEventResponse {
  const r = versioned(x)
  const c = r && record(r.clarification)
  return !!c && isClarification(c)
}

export function isCancelEventResponse(x: unknown): x is CancelEventResponse {
  const r = versioned(x)
  const c = r && record(r.cancelled)
  return !!c && isCancellation(c)
}

function markIn(x: unknown, field: string): boolean {
  const r = versioned(x)
  const m = r && record(r[field])
  return !!m && isOutcomeMark(m)
}

export function isProposeOutcomeResponse(x: unknown): x is ProposeOutcomeResponse {
  return markIn(x, 'proposal')
}

export function isObjectOutcomeResponse(x: unknown): x is ObjectOutcomeResponse {
  const r = versioned(x)
  const o = r && record(r.objection)
  return !!o && isObjection(o)
}

export function isAgreeOutcomeResponse(x: unknown): x is AgreeOutcomeResponse {
  const r = versioned(x)
  const a = r && record(r.agreement)
  return !!a && isAgreement(a)
}

export function isDecideOutcomeResponse(x: unknown): x is DecideOutcomeResponse {
  return markIn(x, 'decision')
}

export function isVoteOutcomeResponse(x: unknown): x is VoteOutcomeResponse {
  return markIn(x, 'vote')
}

const OFFER_STATUSES: readonly unknown[] = ['open', 'expired', 'withdrawn', 'countered', 'accepted']

function orNull(x: unknown, type: 'string' | 'number'): boolean {
  return x === null || typeof x === type
}

function isOfferInfo(r: Record<string, unknown>): boolean {
  const odds = record(r.odds)
  return (
    strings(r, 'id', 'authorId', 'condition', 'check', 'guarantorId') &&
    numbers(r, 'at', 'amount', 'takerAmount', 'closesAt', 'expectedAt') &&
    (r.side === 'yes' || r.side === 'no') &&
    !!odds &&
    numbers(odds, 'a', 'b') &&
    orNull(r.to, 'string') &&
    orNull(r.counterTo, 'string')
  )
}

const OFFER_PHASES: readonly unknown[] = ['marking', 'guarantor', 'need-guarantor', 'approved', 'final']
const OFFER_SIDES: readonly unknown[] = ['author', 'taker']

function isSide(x: unknown): boolean {
  return OFFER_SIDES.includes(x)
}

function isOfferOutcome(r: Record<string, unknown>): boolean {
  const marks = record(r.marks)
  const nominations = record(r.nominations)
  return (
    OFFER_PHASES.includes(r.phase) &&
    !!marks &&
    (marks.author === null || isSide(marks.author)) &&
    (marks.taker === null || isSide(marks.taker)) &&
    strings(r, 'guarantorId') &&
    numbers(r, 'turnAt') &&
    orNull(r.guarantorUntil, 'number') &&
    orNull(r.needSince, 'number') &&
    !!nominations &&
    Object.entries(nominations).every(([k, v]) => isSide(k) && typeof v === 'string') &&
    nullable(
      r.approved,
      (a) => isSide(a.winner) && numbers(a, 'at') && (a.how === 'agreement' || a.how === 'guarantor') && orNull(a.by, 'string'),
    ) &&
    orNull(r.finalAt, 'number')
  )
}

// Пари с сервера; outcome (Р-23) — обязателен: у непринятого — null
function isOfferView(r: Record<string, unknown>): boolean {
  return (
    isOfferInfo(r) &&
    OFFER_STATUSES.includes(r.status) &&
    nullable(r.accepted, (a) => strings(a, 'by') && numbers(a, 'at')) &&
    orNull(r.withdrawnAt, 'number') &&
    nullable(r.closedBy, (c) => strings(c, 'offer') && numbers(c, 'at')) &&
    nullable(r.outcome, isOfferOutcome)
  )
}

function isOfferAct(r: Record<string, unknown>): boolean {
  return strings(r, 'id', 'by', 'offer') && numbers(r, 'at')
}

function isWinnerAct(r: Record<string, unknown>): boolean {
  return isOfferAct(r) && isSide(r.winner)
}

function recordIn(x: unknown, field: string, item: (r: Record<string, unknown>) => boolean): boolean {
  const r = versioned(x)
  const m = r && record(r[field])
  return !!m && item(m)
}

export function isCreateOfferResponse(x: unknown): x is CreateOfferResponse {
  return recordIn(x, 'offer', isOfferInfo)
}

export function isAcceptOfferResponse(x: unknown): x is AcceptOfferResponse {
  return recordIn(x, 'accepted', isOfferAct) && recordIn(x, 'offer', isOfferInfo)
}

export function isRevokeOfferResponse(x: unknown): x is RevokeOfferResponse {
  return recordIn(x, 'revoked', isOfferAct)
}

export function isMarkOfferResponse(x: unknown): x is MarkOfferResponse {
  return recordIn(x, 'marked', isWinnerAct)
}

export function isDecideOfferResponse(x: unknown): x is DecideOfferResponse {
  return recordIn(x, 'decided', isWinnerAct)
}

export function isDeclineOfferResponse(x: unknown): x is DeclineOfferResponse {
  return recordIn(x, 'declined', isOfferAct)
}

export function isNominateResponse(x: unknown): x is NominateResponse {
  return recordIn(x, 'nominated', (r) => isOfferAct(r) && strings(r, 'guarantor'))
}
