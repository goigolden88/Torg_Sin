// Протокол сайта и сервера (Р-01): версия — в каждом ответе и сообщении. Чистые
// функции и типы — ими пользуются и экран, и сервер; ни DOM, ни Cloudflare здесь нет
// 4 — предмет спора (Р-26): subjectRule у события, subjectId у пари, subject в «Предложить пари»
// 5 — «Исход уже известен» (Р-27): closedAt у события, статус исхода «снято», «ещё не известно» в
// решении ведущего и голосе
export const PROTOCOL_VERSION = 5

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
  subjectId: string | null // о ком спор (Р-26): только на стороне «сбудется», не гарант; null — ни о ком
}

// «открыто» / «истекло» (приём до прошёл, по времени сервера) / «отозвано» / «закрыто встречным» /
// «принято»
export type OfferStatus = 'open' | 'expired' | 'withdrawn' | 'countered' | 'accepted'

// Действие с пари: кто (by), когда, с каким пари
export type OfferAct = { id: string; at: number; by: string; offer: string }

// Сторона пари: автор или соперник (принявший). Отметка и решение гаранта — кто прав
export type OfferSide = 'author' | 'taker'

// Ход исхода пари (Р-23) на now: «стороны отмечают» / «решает гарант» / «нужен другой гарант» /
// «утверждён» / «окончательный» / «отменено судом» (Р-24: без выплат)
export type OfferPhase = 'marking' | 'guarantor' | 'need-guarantor' | 'approved' | 'final' | 'cancelled'

// Апелляция и суд (этап 4, Р-05, Р-24; правила — appeal.ts, court.ts). Голос суда: «оставить» (если
// исход утверждён) / «отменить — вернуть ставки» / «изменить на …» — у пула исход события, у пари —
// сторона, которая права. Голоса видны всем сразу (Р-11)
export type CourtVerdict =
  | { verdict: 'keep' }
  | { verdict: 'cancel' }
  | { verdict: 'change'; outcome: string }
  | { verdict: 'change'; winner: OfferSide }
export type CourtVote = { id: string; at: number; by: string } & CourtVerdict
// Место суда: кто сейчас (null — место пустое: запасные кончились), с какого мига и до какого (не
// включая) голосует; replaced — кого заменили, когда, кто (ведущий; по сроку — null) и почему
export type CourtSeat = {
  member: string | null
  since: number
  until: number
  replaced: { member: string; at: number; by: string | null; reason: string | null } | null
  vote: CourtVote | null
}
// Суд: зерно жребия, когда собран, кандидаты по порядку жребия (первые три — суд, дальше — запасные),
// места, решение и когда (majority: false — большинства нет: у апелляции исход остаётся, у «ждёт
// суда» — отмена)
export type CourtView = {
  seed: string
  drawnAt: number
  candidates: string[]
  seats: CourtSeat[]
  decision: ({ at: number; majority: boolean } & CourtVerdict) | null
}
// Апелляция: кто подал, когда, причина, кто присоединился
export type AppealView = { id: string; at: number; by: string; reason: string; joined: { id: string; at: number; by: string }[] }

// Апелляция и суд на сервере (Р-25). Адреса — POST …/events/<событие>/ и …/offers/<пари>/ + appeal |
// appeal/join | judge | replace; requestId — номер запроса (ULID): повтор — тот же ответ без второй
// записи. target — событие или пари. Действие с апелляцией или судом: кто, когда, по какому спору
export type CourtAct = { id: string; at: number; by: string; target: string }
// …/appeal { reason } — ставивший (не согласившийся) или сторона пари; суд собран в этот миг: зерно
// жребия и кандидаты — в ответе (порядок жребия и места — в состоянии комнаты, court)
export type AppealRequest = { v?: number; reason: string; requestId?: string }
export type AppealResponse = { v: number; appeal: CourtAct & { reason: string; seed: string; candidates: string[] } }
// …/appeal/join {} — тот, кто мог бы подать
export type JoinAppealRequest = { v?: number; requestId?: string }
export type JoinAppealResponse = { v: number; joined: CourtAct }
// …/judge { verdict, outcome? | winner? } — член суда на своём месте
export type JudgeRequest = { v?: number; verdict: CourtVerdict['verdict']; outcome?: string; winner?: OfferSide; requestId?: string }
export type JudgeResponse = { v: number; voted: CourtAct & CourtVerdict }
// …/replace { member, reason } — ведущий досрочно заменяет не проголосовавшего члена суда
export type ReplaceJurorRequest = { v?: number; member: string; reason: string; requestId?: string }
export type ReplaceJurorResponse = { v: number; replaced: CourtAct & { member: string; reason: string } }

// Исход принятого пари (offerOutcome в offer.ts): marks — последняя отметка каждой стороны (null — не
// отмечала); guarantorId — нынешний гарант; turnAt — с какого мига решает гарант; guarantorUntil — до
// какого мига он решает (утверждено — null); needSince — с какого мига нужен другой гарант;
// nominations — кого называют стороны; approved — что, когда, как и кем утверждено (судом — by null);
// finalAt — с какого мига окончательный (согласием — сразу, гарантом — через 7 дней; апелляция подана —
// с решения суда, до него — null); appeal и court — апелляция и суд (Р-24; суд без апелляции — appeal
// null; суда нет — полей нет, как у сервера до этапа 4)
export type OfferOutcomeView = {
  phase: OfferPhase
  marks: Record<OfferSide, OfferSide | null>
  guarantorId: string
  turnAt: number
  guarantorUntil: number | null
  needSince: number | null
  nominations: Partial<Record<OfferSide, string>>
  approved: { winner: OfferSide; at: number; how: 'agreement' | 'guarantor' | 'court'; by: string | null } | null
  finalAt: number | null
  appeal?: AppealView | null
  court?: CourtView | null
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
  subject?: string // о ком спор (Р-26); не задан — ни о ком
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
  // Правило предмета (Р-26): предмет ставит только на «Да», в событии со своими исходами — не ставит.
  // Есть у событий с предметом, заведённых после выкатки; у старых — false: ставки как были
  subjectRule: boolean
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
// «отменено» — событие отменено на любом шаге исхода: без выплат, окончательным не станет (Р-19) /
// «снято» — досрочное предложение снято «ещё не известно»: приём закрыт, исход предложат снова (Р-27)
export type OutcomeStatus = 'proposed' | 'disputed' | 'voting' | 'court' | 'approved' | 'final' | 'cancelled' | 'withdrawn'

// Как утверждён: сам — сутки без возражения (by — null); ведущим (by — ведущий);
// голосованием (by — null); согласием всех ставивших — сразу окончательный (by — null; Р-21);
// судом — сразу окончательный (by — null; Р-24)
export type Approval = { outcome: string; at: number; how: 'unopposed' | 'host' | 'vote' | 'agreed' | 'court'; by: string | null }

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
  finalAt: number | null // станет окончательным (не утверждён, событие отменено или ждёт суда по апелляции — null)
  void: boolean // «без игры»: каждому — его сумма
  payouts: Payout[] // по утверждённому исходу; не утверждён или событие отменено — пусто
  appeal?: AppealView | null // апелляция (Р-24); суд без апелляции — null; суда нет — поля нет
  court?: CourtView | null // суд — по апелляции или по «ждёт суда»; суда нет — поля нет
}

// Событие в состоянии комнаты: ставки по порядку журнала, уточнения, статус; отменено —
// refunds: каждому участнику — его сумма; outcome — исход (не предложен — null). closedAt — миг,
// когда приём закрылся досрочно предложением исхода (Р-27); закрыт в срок или ещё идёт — поля нет
export type EventView = EventInfo & {
  closedAt?: number
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
// автор молчит 3 дня после «исход ожидается к» — и ведущий); до «приём до» — досрочно, приём
// закрывается в миг предложения (Р-27); снова — после снятия «ещё не известно»
export type ProposeOutcomeRequest = { v?: number; outcome: string; requestId?: string }
export type ProposeOutcomeResponse = { v: number; proposal: OutcomeMark }
// POST …/events/<событие>/object — ставивший, кроме предложившего, сутки после предложения
export type ObjectOutcomeRequest = { v?: number; reason: string; requestId?: string }
export type ObjectOutcomeResponse = { v: number; objection: Objection }
// POST …/events/<событие>/agree — ставивший, кроме предложившего, сутки после предложения, пока нет
// возражений (Р-21)
export type AgreeOutcomeRequest = { v?: number; requestId?: string }
export type AgreeOutcomeResponse = { v: number; agreement: Agreement }
// POST …/events/<событие>/decide — ведущий после возражения, если не ставил и не предмет спора.
// У решения и голоса по досрочному предложению outcome может быть NOT_YET — «ещё не известно» (Р-27)
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
    typeof r.subjectRule === 'boolean' &&
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

const OUTCOME_STATUSES: readonly unknown[] = ['proposed', 'disputed', 'voting', 'court', 'approved', 'final', 'cancelled', 'withdrawn']
const APPROVALS: readonly unknown[] = ['unopposed', 'host', 'vote', 'agreed', 'court']

function isVerdict(r: Record<string, unknown>): boolean {
  if (r.verdict === 'keep' || r.verdict === 'cancel') return true
  return r.verdict === 'change' && (typeof r.outcome === 'string' || r.winner === 'author' || r.winner === 'taker')
}

function isCourtSeat(r: Record<string, unknown>): boolean {
  return (
    (r.member === null || typeof r.member === 'string') &&
    numbers(r, 'since', 'until') &&
    nullable(
      r.replaced,
      (p) => strings(p, 'member') && numbers(p, 'at') && (p.by === null || typeof p.by === 'string') && (p.reason === null || typeof p.reason === 'string'),
    ) &&
    nullable(r.vote, (v) => strings(v, 'id', 'by') && numbers(v, 'at') && isVerdict(v))
  )
}

function isCourtView(r: Record<string, unknown>): boolean {
  return (
    strings(r, 'seed') &&
    numbers(r, 'drawnAt') &&
    Array.isArray(r.candidates) &&
    r.candidates.every((m) => typeof m === 'string') &&
    list(r.seats, isCourtSeat) &&
    nullable(r.decision, (d) => numbers(d, 'at') && typeof d.majority === 'boolean' && isVerdict(d))
  )
}

function isAppealView(r: Record<string, unknown>): boolean {
  return strings(r, 'id', 'by', 'reason') && numbers(r, 'at') && list(r.joined, (j) => strings(j, 'id', 'by') && numbers(j, 'at'))
}

// Апелляция и суд в исходе (Р-24): нет поля (сервер до этапа 4), null или как положено
function appealAndCourt(r: Record<string, unknown>): boolean {
  return (r.appeal === undefined || nullable(r.appeal, isAppealView)) && (r.court === undefined || nullable(r.court, isCourtView))
}

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
    list(r.payouts, (p) => strings(p, 'memberId') && numbers(p, 'staked', 'payout', 'net')) &&
    appealAndCourt(r)
  )
}

// Событие с сервера — и копия на устройстве (src/store/db.ts): запись до нового поля протокола
// проверку не проходит
export function isEventView(x: unknown): x is EventView {
  const r = record(x)
  if (!r || !isEventInfo(r)) return false
  if (r.status !== 'open' && r.status !== 'closed' && r.status !== 'cancelled') return false
  if (r.closedAt !== undefined && typeof r.closedAt !== 'number') return false
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
    orNull(r.counterTo, 'string') &&
    orNull(r.subjectId, 'string')
  )
}

const OFFER_PHASES: readonly unknown[] = ['marking', 'guarantor', 'need-guarantor', 'approved', 'final', 'cancelled']
const OFFER_APPROVALS: readonly unknown[] = ['agreement', 'guarantor', 'court']
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
      (a) => isSide(a.winner) && numbers(a, 'at') && OFFER_APPROVALS.includes(a.how) && orNull(a.by, 'string'),
    ) &&
    orNull(r.finalAt, 'number') &&
    appealAndCourt(r)
  )
}

// Пари с сервера — и копия на устройстве (src/store/db.ts); outcome (Р-23) — обязателен: у
// непринятого — null. Запись до нового поля протокола проверку не проходит
export function isOfferView(x: unknown): x is OfferView {
  const r = record(x)
  return (
    !!r &&
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

function isCourtAct(r: Record<string, unknown>): boolean {
  return strings(r, 'id', 'by', 'target') && numbers(r, 'at')
}

export function isAppealResponse(x: unknown): x is AppealResponse {
  return recordIn(
    x,
    'appeal',
    (r) => isCourtAct(r) && strings(r, 'reason', 'seed') && Array.isArray(r.candidates) && r.candidates.every((m) => typeof m === 'string'),
  )
}

export function isJoinAppealResponse(x: unknown): x is JoinAppealResponse {
  return recordIn(x, 'joined', isCourtAct)
}

export function isJudgeResponse(x: unknown): x is JudgeResponse {
  return recordIn(x, 'voted', (r) => isCourtAct(r) && isVerdict(r))
}

export function isReplaceJurorResponse(x: unknown): x is ReplaceJurorResponse {
  return recordIn(x, 'replaced', (r) => isCourtAct(r) && strings(r, 'member', 'reason'))
}
