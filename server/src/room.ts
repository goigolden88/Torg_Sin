// Комната на сервере без привязки к Cloudflare (Р-02): хранилище — только через RoomStorage;
// Cloudflare даёт его объекту Room (index.ts), запасная обёртка — SQLite в Node.
//
// Что лежит в хранилище комнаты:
//   log:00000001…  — журнал комнаты (Р-11), только дописывается: запись по ключу не меняется
//   key:<хеш>      — ключ телефона → номер участника (или заявки); ключа в открытом виде нет;
//                    отвязанный ключ помечен unlinkedAt и комнату не открывает
//   invite         — токен ссылки-приглашения (меняется — не журнал)
//   secret         — секрет комнаты: из него и номера запроса выводится ключ по заявке
//   device:<хеш>   — ссылка для другого устройства: чья, до когда, отвязать ли прежние,
//                    использована ли; токена в открытом виде нет
import {
  foldLog,
  joinRequests,
  nameTaken,
  NAME_TAKEN,
  type JoinRequest,
  type LogEntry,
  type RoomInput,
  type RoomState,
} from '../../src/rules/room'
import {
  agreementOut,
  BAD_SUBJECT,
  betOf,
  betOn,
  checkEventTimes,
  eventBank,
  eventOutcome,
  eventStatus,
  eventVoters,
  hostDecides,
  infoOf,
  markOut,
  mayPropose,
  NEED_REASON,
  objectionOut,
  roomEvents,
  sameEvent,
  type EventInput,
  type EventState,
} from '../../src/rules/event'
import {
  BAD_GUARANTOR,
  BAD_MARK,
  checkAccept,
  checkCounter,
  checkDecide,
  checkDecline,
  checkMark,
  checkNominate,
  checkOfferInput,
  checkOfferTimes,
  checkWithdraw,
  CLOSE_PASSED,
  counterInput,
  currentMarks,
  EXPIRED,
  GUARANTOR_COUNTERS,
  GUARANTOR_MARKS,
  GUARANTOR_TAKES,
  isOfferEntry,
  logOffers,
  NO_OFFER,
  NOT_ADDRESSEE,
  NOT_MEMBER,
  NOT_SIDE,
  offerGuarantor,
  offerInfo,
  ONLY_AUTHOR,
  ONLY_GUARANTOR,
  OWN_COUNTER,
  OWN_OFFER,
  roomRoles,
  sideOf,
  type OfferEntry,
  type OfferInput,
  type OfferSide,
  type OfferState,
  type Odds,
  type RoomRoles,
} from '../../src/rules/offer'
import * as appeal from '../../src/rules/appeal'
import type { CourtCase } from '../../src/rules/court'
import type {
  Agreement,
  AppealResponse,
  BetInfo,
  Cancellation,
  Clarification,
  CourtAct,
  CourtVerdict,
  EventInfo,
  JoinAppealResponse,
  JudgeResponse,
  Objection,
  OfferAct,
  OfferInfo,
  OfferWinnerAct,
  OutcomeMark,
  ReplaceJurorResponse,
} from '../../src/rules/protocol'
import { ulid } from '../../src/rules/ulid'
import { deriveJoinKey, hashKey, randomSeed, randomToken, sameText } from './keys'

export type RoomStorage = {
  get<T>(key: string): Promise<T | undefined>
  put<T>(key: string, value: T): Promise<void>
  list<T>(options: { prefix: string }): Promise<Map<string, T>> // по возрастанию ключа
  setAlarm(time: number): Promise<void>
}

export const NO_ROOM = 'Нет такой комнаты'
export const WRONG_KEY = 'Нет доступа: этот телефон не участник комнаты'
export const REQUEST_TAKEN = 'Этот номер запроса уже занят другой комнатой'
export const APPEND_ONLY = 'Журнал комнаты только дописывается'
export const BAD_LINK = 'Ссылка недействительна — попросите новую у ведущего'
export const WAITING = 'Ждём, пока ведущий впустит'
export const REJECTED = 'Ведущий отклонил заявку'
export const HOST_ONLY = 'Это может только ведущий'
export const JOIN_TAKEN = 'Этот номер запроса уже занят другой заявкой'
export const NO_REQUEST = 'Нет такой заявки'
export const ALREADY_REJECTED = 'Заявка уже отклонена'
export const ALREADY_ADMITTED = 'Участник уже впущен'
export const NO_MEMBER = 'Нет такого участника'
export const BAD_DEVICE_LINK = 'Ссылка для другого устройства недействительна — попросите новую'
export const NO_EVENT = 'Нет такого события'
export const NO_OUTCOME = 'Нет такого исхода'
export const BETS_CLOSED = 'Приём ставок закрыт'
export const EVENT_CANCELLED = 'Событие отменено'
export const AUTHOR_ONLY = 'Это может только автор события'
export const EVENT_TAKEN = 'Этот номер запроса уже занят другим событием'
export const BET_TAKEN = 'Этот номер запроса уже занят другой ставкой'
export const BANK_FULL = 'Банк события слишком велик для такой ставки'
// Исход события
export const BETS_OPEN = 'Приём ставок ещё идёт — исход предлагают после закрытия'
export const PROPOSER_ONLY = 'Исход предлагает автор события, а если он молчит 3 дня после «исход ожидается к» — ведущий'
export const SUBJECT_SILENT = 'Предмет спора не объявляет исход'
export const ALREADY_PROPOSED = 'Исход уже предложен'
export const NOT_PROPOSED = 'Исход ещё не предложен'
export const OWN_PROPOSAL = 'Свой исход не оспаривают'
export const BETTORS_ONLY = 'Возразить может только тот, кто ставил'
export const ALREADY_OBJECTED = 'Вы уже возразили'
// Согласие с исходом (Р-21)
export const OWN_AGREEMENT = 'Своё предложение не подтверждают'
export const AGREE_BETTORS_ONLY = 'Согласиться может только тот, кто ставил'
export const ALREADY_AGREED = 'Вы уже согласились'
export const AGREEMENT_CLOSED = 'Есть возражение — согласия больше не принимаются'
export const OBJECTION_OVER = 'Сутки на возражение прошли'
export const ALREADY_APPROVED = 'Исход уже утверждён'
export const NO_OBJECTION = 'Возражений нет — решать нечего'
export const HOST_INTERESTED = 'Ведущий ставил или он предмет спора — исход решает голосование'
export const ALREADY_DECIDED = 'Ведущий уже решил'
export const NO_VOTING = 'Голосования нет: возражение решает ведущий'
export const VOTERS_ONLY = 'Голосуют только те, кто не ставил и не предмет спора'
export const ALREADY_VOTED = 'Вы уже проголосовали'
export const VOTING_OVER = 'Голосование закончено'
export const REQUEST_USED = 'Этот номер запроса уже занят другим действием'
// Пари (Р-22): прочие отказы — тексты правил offer.ts
export const OFFER_CLOSED = 'Приём закрыт — срок «приём до» прошёл'
export { NO_OFFER }
// Апелляция и суд (Р-25): прочие отказы — тексты правил appeal.ts
export const NO_COURT = 'Суда по этому спору нет'

// Ссылка для другого устройства живёт сутки
export const DEVICE_LINK_TTL = 24 * 60 * 60 * 1000

const LOG = 'log:'
const KEY = 'key:'
const INVITE = 'invite'
const SECRET = 'secret'
const DEVICE = 'device:'

type KeyRecord = { memberId: string; at: number; unlinkedAt?: number }
type InviteRecord = { token: string; at: number }
type SecretRecord = { secret: string; at: number }
type DeviceRecord = {
  member: string
  unlink: boolean
  expiresAt: number
  at: number
  usedAt?: number // использована — второй раз не сработает
  revokedAt?: number // прежние ключи участника отвязаны — неиспользованные ссылки тоже гаснут
}

// Номер записи — по порядку: 8 цифр, ключи сортируются как числа
function logKey(n: number): string {
  return LOG + String(n).padStart(8, '0')
}

export async function readLog(storage: RoomStorage): Promise<LogEntry[]> {
  return [...(await storage.list<LogEntry>({ prefix: LOG })).values()]
}

// Дописать записи в конец журнала. Занятый ключ не перезаписывается — ошибка
export async function append(storage: RoomStorage, entries: readonly LogEntry[]): Promise<void> {
  let n = (await storage.list({ prefix: LOG })).size
  for (const e of entries) {
    const key = logKey(++n)
    if ((await storage.get(key)) !== undefined) throw new Error(APPEND_ONLY)
    await storage.put(key, e)
  }
}

// Что Worker передаёт комнате при создании: номер, проверенная форма, хеш ключа ведущего, приглашение
export type CreateInput = RoomInput & { roomId: string; keyHash: string; invite: string }

export type CreateResult =
  | { ok: true; roomId: string; memberId: string; invite: string }
  | { ok: false; status: 409; error: string }

// Создать комнату. Комната уже есть (повтор того же запроса) — тот же ответ, ничего не дописывая;
// тот же номер, но другая форма или ключ — отказ
export async function createRoom(storage: RoomStorage, input: CreateInput, now: number): Promise<CreateResult> {
  const existing = foldLog(await readLog(storage))
  if (existing) {
    const owner = await storage.get<KeyRecord>(KEY + input.keyHash)
    const host = existing.members.find((m) => m.id === existing.hostId)
    const invite = await storage.get<InviteRecord>(INVITE)
    const same =
      owner?.memberId === existing.hostId &&
      existing.name === input.name &&
      existing.currency === input.currency &&
      host?.name === input.hostName
    if (!same || !invite) return { ok: false, status: 409, error: REQUEST_TAKEN }
    return { ok: true, roomId: existing.id, memberId: existing.hostId, invite: invite.token }
  }
  const hostId = ulid(now)
  // Ключ и приглашение — до журнала: журнал есть — значит, комната создана целиком
  await storage.put<KeyRecord>(KEY + input.keyHash, { memberId: hostId, at: now })
  await storage.put<InviteRecord>(INVITE, { token: input.invite, at: now })
  await append(storage, [
    { id: ulid(now), at: now, memberId: hostId, type: 'room.created', roomId: input.roomId, name: input.name, currency: input.currency },
    { id: ulid(now), at: now, memberId: hostId, type: 'member.added', member: hostId, name: input.hostName },
  ])
  return { ok: true, roomId: input.roomId, memberId: hostId, invite: input.invite }
}

// Отказ комнаты; join — ключ заявки, которую ещё не впустили или отклонили (экран ожидания)
export type Failure = { ok: false; status: 400 | 403 | 404 | 409; error: string; join?: 'waiting' | 'rejected' }

// events и offers — события и пари комнаты из журнала, cases — дела суда по ним (Р-25; статус на
// время ответа считает http.ts)
export type StateResult =
  | { ok: true; state: RoomState; me: string; events: EventState[]; offers: OfferState[]; cases: CourtCase[] }
  | Failure

function fail(status: Failure['status'], error: string, join?: Failure['join']): Failure {
  return join ? { ok: false, status, error, join } : { ok: false, status, error }
}

type Caller = { ok: true; log: LogEntry[]; state: RoomState; me: string }

// Кто прислал ключ: участник — дальше; заявка — «ждём» или «отклонили»; отвязанный или чужой — отказ
async function caller(storage: RoomStorage, keyHash: string): Promise<Caller | Failure> {
  const log = await readLog(storage)
  const state = foldLog(log)
  if (!state) return fail(404, NO_ROOM)
  const owner = await storage.get<KeyRecord>(KEY + keyHash)
  if (!owner || owner.unlinkedAt !== undefined) return fail(403, WRONG_KEY)
  if (state.members.some((m) => m.id === owner.memberId)) return { ok: true, log, state, me: owner.memberId }
  const request = joinRequests(log).find((r) => r.id === owner.memberId)
  if (request?.status === 'waiting') return fail(403, WAITING, 'waiting')
  if (request?.status === 'rejected') return fail(403, REJECTED, 'rejected')
  return fail(403, WRONG_KEY)
}

async function hostCaller(storage: RoomStorage, keyHash: string): Promise<Caller | Failure> {
  const c = await caller(storage, keyHash)
  if (c.ok && c.me !== c.state.hostId) return fail(403, HOST_ONLY)
  return c
}

// Состояние комнаты для владельца ключа (по хешу ключа). Сначала — суд по «ждёт суда», если пора
// (drawDueCourts): чтение комнаты тоже может дописать запись, один раз на суд. seed — источник зёрен
// жребия (тесты подставляют своё)
export async function roomState(storage: RoomStorage, keyHash: string, now: number, seed: () => string = randomSeed): Promise<StateResult> {
  await drawDueCourts(storage, now, seed)
  const c = await caller(storage, keyHash)
  if (!c.ok) return c
  const events = roomEvents(c.log)
  const offers = logOffers(c.log)
  return { ok: true, state: c.state, me: c.me, events, offers, cases: appeal.logAppeals(c.log, { events, offers }) }
}

// Суд по «ждёт суда» (Р-17, Р-25) собирается сам — будильника нет: при первом запросе к комнате после
// того, как исход пула перешёл в «ждёт суда», — запись court.drawn (зерно, кандидаты на этот миг; автор —
// ведущий). Суд уже собран — второй записи нет; кандидатов нет — записи нет, исход остаётся «ждёт суда»
// (выход — отмена ведущим с причиной, Р-19)
export async function drawDueCourts(storage: RoomStorage, now: number, seed: () => string): Promise<void> {
  const log = await readLog(storage)
  const state = foldLog(log)
  if (!state) return
  const events = roomEvents(log)
  const cases = appeal.logAppeals(log, { events, offers: [] })
  const room = appeal.courtRoom(state)
  const entries: LogEntry[] = []
  for (const event of events) {
    const t = { kind: 'event', event } as const
    if (appeal.checkCourtDraw(t, appeal.caseOf(cases, event.id), now)) continue
    const candidates = appeal.courtCandidates(t, room, now)
    if (candidates.length === 0) continue
    entries.push({ id: ulid(now), at: now, memberId: state.hostId, type: 'court.drawn', target: event.id, seed: seed(), candidates })
  }
  if (entries.length > 0) await append(storage, entries)
}

// Действия комнаты, кроме создания и чтения состояния. Токены и ключи, которые выдаёт сервер,
// придумывает Worker (http.ts) и передаёт сюда хешами; ключ заявки выводится здесь — из секрета комнаты
export type RoomAction =
  | { type: 'preview'; invite: string } // что за комната по ссылке-приглашению
  | { type: 'join'; invite: string; name: string; requestId: string } // заявка на вход
  | { type: 'requests'; keyHash: string } // ждущие заявки — ведущему
  | { type: 'admit'; keyHash: string; request: string }
  | { type: 'reject'; keyHash: string; request: string }
  | { type: 'renewInvite'; keyHash: string; invite: string } // новая ссылка-приглашение
  | { type: 'issueDevice'; keyHash: string; member: string | null; unlink: boolean; tokenHash: string }
  | { type: 'claimDevice'; tokenHash: string; keyHash: string } // новый ключ по ссылке для устройства
  // События-пул: форма уже проверена (event.ts, checkEventInput); сроки — здесь, по времени сервера
  | { type: 'createEvent'; keyHash: string; input: EventInput; requestId: string }
  | { type: 'placeBet'; keyHash: string; event: string; outcome: string; amount: number; requestId: string }
  | { type: 'clarifyEvent'; keyHash: string; event: string; text: string }
  | { type: 'cancelEvent'; keyHash: string; event: string; reason: string | null }
  // Исход события: сроки — по времени сервера в момент запроса (будильника нет)
  | { type: 'proposeOutcome'; keyHash: string; event: string; outcome: string; requestId: string }
  | { type: 'objectOutcome'; keyHash: string; event: string; reason: string; requestId: string }
  | { type: 'agreeOutcome'; keyHash: string; event: string; requestId: string }
  | { type: 'decideOutcome'; keyHash: string; event: string; outcome: string; requestId: string }
  | { type: 'voteOutcome'; keyHash: string; event: string; outcome: string; requestId: string }
  // Пари (Р-22): форма уже проверена (offer.ts, checkOfferInput); сроки, гарант и адресат — здесь.
  // Встречное: odds и amount не заданы (null) — исходного
  | { type: 'createOffer'; keyHash: string; input: OfferInput; requestId: string }
  | { type: 'counterOffer'; keyHash: string; offer: string; odds: Odds | null; amount: number | null; closesAt: number; requestId: string }
  | { type: 'acceptOffer'; keyHash: string; offer: string; requestId: string }
  | { type: 'revokeOffer'; keyHash: string; offer: string; requestId: string }
  // Исход пари (Р-23): фазы — по времени сервера в момент запроса (будильника нет)
  | { type: 'markOffer'; keyHash: string; offer: string; winner: OfferSide; requestId: string }
  | { type: 'decideOffer'; keyHash: string; offer: string; winner: OfferSide; requestId: string }
  | { type: 'declineOffer'; keyHash: string; offer: string; requestId: string }
  | { type: 'nominateGuarantor'; keyHash: string; offer: string; guarantor: string; requestId: string }
  // Апелляция и суд (Р-25) у события-пул (kind: 'event') и пари ('offer'): правила — appeal.ts, на
  // время сервера в момент запроса. Зерно жребия при подаче — из источника seed у act
  | { type: 'appealOutcome'; keyHash: string; kind: CourtKind; target: string; reason: string; requestId: string }
  | { type: 'joinAppeal'; keyHash: string; kind: CourtKind; target: string; requestId: string }
  | { type: 'judgeCourt'; keyHash: string; kind: CourtKind; target: string; vote: CourtVerdict; requestId: string }
  | { type: 'replaceJuror'; keyHash: string; kind: CourtKind; target: string; member: string; reason: string; requestId: string }

export type CourtKind = appeal.AppealTarget['kind']

export type JoinStatus = JoinRequest['status']

// Что отдаёт каждое действие при успехе
export type ActionValues = {
  preview: { name: string; hostName: string }
  join: { memberId: string; key: string; join: JoinStatus }
  requests: { requests: { id: string; name: string; at: number }[] }
  admit: { member: { id: string; name: string } }
  reject: { request: string }
  renewInvite: { invite: string }
  issueDevice: { member: string; expiresAt: number }
  claimDevice: { memberId: string }
  createEvent: { event: EventInfo }
  placeBet: { bet: BetInfo }
  clarifyEvent: { clarification: Clarification }
  cancelEvent: { cancelled: Cancellation }
  proposeOutcome: { proposal: OutcomeMark }
  objectOutcome: { objection: Objection }
  agreeOutcome: { agreement: Agreement }
  decideOutcome: { decision: OutcomeMark }
  voteOutcome: { vote: OutcomeMark }
  createOffer: { offer: OfferInfo }
  counterOffer: { offer: OfferInfo }
  acceptOffer: { accepted: OfferAct; offer: OfferInfo }
  revokeOffer: { revoked: OfferAct }
  markOffer: { marked: OfferWinnerAct }
  decideOffer: { decided: OfferWinnerAct }
  declineOffer: { declined: OfferAct }
  nominateGuarantor: { nominated: OfferAct & { guarantor: string } }
  appealOutcome: { appeal: AppealResponse['appeal'] }
  joinAppeal: { joined: JoinAppealResponse['joined'] }
  judgeCourt: { voted: JudgeResponse['voted'] }
  replaceJuror: { replaced: ReplaceJurorResponse['replaced'] }
}

export type ActionType = RoomAction['type']
export type ActionResult<K extends ActionType = ActionType> = { ok: true; value: ActionValues[K] } | Failure

function ok<V>(value: V): { ok: true; value: V } {
  return { ok: true, value }
}

// Одно действие комнаты; объект Room (и очередь Node-обёртки) вызывает их по одному. Сначала — суд по
// «ждёт суда», если пора (drawDueCourts). seed — источник зёрен жребия (тесты подставляют своё)
export async function act<K extends ActionType>(
  storage: RoomStorage,
  action: Extract<RoomAction, { type: K }>,
  now: number,
  seed: () => string = randomSeed,
): Promise<ActionResult<K>> {
  const a = action as RoomAction
  await drawDueCourts(storage, now, seed)
  let r: ActionResult
  switch (a.type) {
    case 'preview':
      r = await preview(storage, a.invite)
      break
    case 'join':
      r = await join(storage, a, now)
      break
    case 'requests':
      r = await listRequests(storage, a.keyHash)
      break
    case 'admit':
      r = await admit(storage, a.keyHash, a.request, now)
      break
    case 'reject':
      r = await reject(storage, a.keyHash, a.request, now)
      break
    case 'renewInvite':
      r = await renewInvite(storage, a.keyHash, a.invite, now)
      break
    case 'issueDevice':
      r = await issueDevice(storage, a, now)
      break
    case 'claimDevice':
      r = await claimDevice(storage, a.tokenHash, a.keyHash, now)
      break
    case 'createEvent':
      r = await createEvent(storage, a, now)
      break
    case 'placeBet':
      r = await placeBet(storage, a, now)
      break
    case 'clarifyEvent':
      r = await clarifyEvent(storage, a, now)
      break
    case 'cancelEvent':
      r = await cancelEvent(storage, a, now)
      break
    case 'proposeOutcome':
      r = await proposeOutcome(storage, a, now)
      break
    case 'objectOutcome':
      r = await objectOutcome(storage, a, now)
      break
    case 'agreeOutcome':
      r = await agreeOutcome(storage, a, now)
      break
    case 'decideOutcome':
      r = await decideOutcome(storage, a, now)
      break
    case 'voteOutcome':
      r = await voteOutcome(storage, a, now)
      break
    case 'createOffer':
      r = await createOffer(storage, a, now)
      break
    case 'counterOffer':
      r = await counterOffer(storage, a, now)
      break
    case 'acceptOffer':
      r = await acceptOffer(storage, a, now)
      break
    case 'revokeOffer':
      r = await revokeOffer(storage, a, now)
      break
    case 'markOffer':
      r = await markOffer(storage, a, now)
      break
    case 'decideOffer':
      r = await decideOffer(storage, a, now)
      break
    case 'declineOffer':
      r = await declineOffer(storage, a, now)
      break
    case 'nominateGuarantor':
      r = await nominateGuarantor(storage, a, now)
      break
    case 'appealOutcome':
      r = await appealOutcome(storage, a, now, seed)
      break
    case 'joinAppeal':
      r = await joinAppeal(storage, a, now)
      break
    case 'judgeCourt':
      r = await judgeCourt(storage, a, now)
      break
    case 'replaceJuror':
      r = await replaceJuror(storage, a, now)
      break
  }
  return r as ActionResult<K>
}

async function inviteValid(storage: RoomStorage, given: string): Promise<boolean> {
  const invite = await storage.get<InviteRecord>(INVITE)
  return invite !== undefined && given !== '' && sameText(given, invite.token)
}

// По ссылке-приглашению видно только название комнаты и имя ведущего
async function preview(storage: RoomStorage, invite: string): Promise<ActionResult<'preview'>> {
  const state = foldLog(await readLog(storage))
  if (!state || !(await inviteValid(storage, invite))) return fail(403, BAD_LINK)
  const host = state.members.find((m) => m.id === state.hostId)
  return ok({ name: state.name, hostName: host?.name ?? '' })
}

// Секрет комнаты для ключей по заявкам; у комнаты его нет — заводится
async function roomSecret(storage: RoomStorage, now: number): Promise<string> {
  const existing = await storage.get<SecretRecord>(SECRET)
  if (existing) return existing.secret
  const secret = randomToken(32)
  await storage.put<SecretRecord>(SECRET, { secret, at: now })
  return secret
}

// Заявка по ссылке: ключ телефона, который откроет комнату, когда ведущий впустит.
// Повтор с тем же номером запроса — та же заявка и тот же ключ
async function join(
  storage: RoomStorage,
  a: { invite: string; name: string; requestId: string },
  now: number,
): Promise<ActionResult<'join'>> {
  const log = await readLog(storage)
  const state = foldLog(log)
  if (!state || !(await inviteValid(storage, a.invite))) return fail(403, BAD_LINK)
  const key = await deriveJoinKey(await roomSecret(storage, now), a.requestId)
  const keyHash = await hashKey(key)
  const requests = joinRequests(log)
  const owner = await storage.get<KeyRecord>(KEY + keyHash)
  if (owner) {
    const request = requests.find((r) => r.id === owner.memberId)
    if (request) {
      if (request.name !== a.name) return fail(409, JOIN_TAKEN)
      return ok({ memberId: request.id, key, join: request.status })
    }
    // Ключ записан, а заявки в журнале нет (прошлый раз оборвался между ними) — дописать заявку
  }
  if (nameTaken(state, requests, a.name)) return fail(409, NAME_TAKEN)
  const id = owner?.memberId ?? ulid(now)
  // Ключ — до журнала: заявка в журнале есть — значит, ключ к ней выдан
  if (!owner) await storage.put<KeyRecord>(KEY + keyHash, { memberId: id, at: now })
  await append(storage, [{ id: ulid(now), at: now, memberId: id, type: 'join.requested', request: id, name: a.name }])
  return ok({ memberId: id, key, join: 'waiting' })
}

// Ждущие заявки — только ведущему
async function listRequests(storage: RoomStorage, keyHash: string): Promise<ActionResult<'requests'>> {
  const c = await hostCaller(storage, keyHash)
  if (!c.ok) return c
  const waiting = joinRequests(c.log).filter((r) => r.status === 'waiting')
  return ok({ requests: waiting.map((r) => ({ id: r.id, name: r.name, at: r.at })) })
}

// Заявка по номеру — для решения ведущего
async function hostRequest(
  storage: RoomStorage,
  keyHash: string,
  requestId: string,
): Promise<{ ok: true; me: string; request: JoinRequest } | Failure> {
  const c = await hostCaller(storage, keyHash)
  if (!c.ok) return c
  const request = joinRequests(c.log).find((r) => r.id === requestId)
  if (!request) return fail(404, NO_REQUEST)
  return { ok: true, me: c.me, request }
}

// Впустить: участник в списке, ключ заявки открывает комнату. Повтор — тот же ответ без новой
// записи; отклонённую не впустить — пусть подаст новую заявку
async function admit(storage: RoomStorage, keyHash: string, requestId: string, now: number): Promise<ActionResult<'admit'>> {
  const found = await hostRequest(storage, keyHash, requestId)
  if (!found.ok) return found
  const { me, request } = found
  if (request.status === 'rejected') return fail(409, ALREADY_REJECTED)
  if (request.status === 'waiting') {
    await append(storage, [{ id: ulid(now), at: now, memberId: me, type: 'member.added', member: request.id, name: request.name }])
  }
  return ok({ member: { id: request.id, name: request.name } })
}

// Отклонить: ключ заявки отвечает «Ведущий отклонил заявку». Повтор — тот же ответ; впущенного не отклонить
async function reject(storage: RoomStorage, keyHash: string, requestId: string, now: number): Promise<ActionResult<'reject'>> {
  const found = await hostRequest(storage, keyHash, requestId)
  if (!found.ok) return found
  const { me, request } = found
  if (request.status === 'admitted') return fail(409, ALREADY_ADMITTED)
  if (request.status === 'waiting') {
    await append(storage, [{ id: ulid(now), at: now, memberId: me, type: 'join.rejected', request: request.id }])
  }
  return ok({ request: request.id })
}

// Новая ссылка-приглашение: старая перестаёт работать; впущенные и ждущие не страдают
async function renewInvite(storage: RoomStorage, keyHash: string, invite: string, now: number): Promise<ActionResult<'renewInvite'>> {
  const c = await hostCaller(storage, keyHash)
  if (!c.ok) return c
  await storage.put<InviteRecord>(INVITE, { token: invite, at: now })
  await append(storage, [{ id: ulid(now), at: now, memberId: c.me, type: 'invite.changed' }])
  return ok({ invite })
}

// Ссылка для другого устройства: себе — любой участник; за другого — только ведущий
async function issueDevice(
  storage: RoomStorage,
  a: { keyHash: string; member: string | null; unlink: boolean; tokenHash: string },
  now: number,
): Promise<ActionResult<'issueDevice'>> {
  const c = await caller(storage, a.keyHash)
  if (!c.ok) return c
  const member = a.member ?? c.me
  if (member !== c.me && c.me !== c.state.hostId) return fail(403, HOST_ONLY)
  if (!c.state.members.some((m) => m.id === member)) return fail(404, NO_MEMBER)
  const expiresAt = now + DEVICE_LINK_TTL
  await storage.put<DeviceRecord>(DEVICE + a.tokenHash, { member, unlink: a.unlink, expiresAt, at: now })
  await append(storage, [{ id: ulid(now), at: now, memberId: c.me, type: 'device.issued', member, unlink: a.unlink, expiresAt }])
  return ok({ member, expiresAt })
}

// Ссылку для другого устройства использовали: новый ключ того же участника. Одна ссылка — один раз;
// с отметкой «отвязать прежние» — старые ключи участника и его неиспользованные ссылки гаснут
async function claimDevice(storage: RoomStorage, tokenHash: string, keyHash: string, now: number): Promise<ActionResult<'claimDevice'>> {
  const state = foldLog(await readLog(storage))
  const link = await storage.get<DeviceRecord>(DEVICE + tokenHash)
  if (
    !state ||
    !link ||
    link.usedAt !== undefined ||
    link.revokedAt !== undefined ||
    now >= link.expiresAt ||
    !state.members.some((m) => m.id === link.member)
  ) {
    return fail(403, BAD_DEVICE_LINK)
  }
  // Сначала — «использована»: оборвётся дальше — повторно ссылка всё равно не сработает
  await storage.put<DeviceRecord>(DEVICE + tokenHash, { ...link, usedAt: now })
  if (link.unlink) {
    for (const [k, rec] of await storage.list<KeyRecord>({ prefix: KEY })) {
      if (rec.memberId === link.member && rec.unlinkedAt === undefined) await storage.put<KeyRecord>(k, { ...rec, unlinkedAt: now })
    }
    for (const [k, rec] of await storage.list<DeviceRecord>({ prefix: DEVICE })) {
      if (k !== DEVICE + tokenHash && rec.member === link.member && rec.usedAt === undefined && rec.revokedAt === undefined) {
        await storage.put<DeviceRecord>(k, { ...rec, revokedAt: now })
      }
    }
  }
  await storage.put<KeyRecord>(KEY + keyHash, { memberId: link.member, at: now })
  await append(storage, [{ id: ulid(now), at: now, memberId: link.member, type: 'device.linked', member: link.member, unlink: link.unlink }])
  return ok({ memberId: link.member })
}

// Завести событие: любой участник. Повтор с тем же номером запроса — то же событие и тот же
// ответ (даже после срока); тот же номер с другой формой — отказ
async function createEvent(
  storage: RoomStorage,
  a: { keyHash: string; input: EventInput; requestId: string },
  now: number,
): Promise<ActionResult<'createEvent'>> {
  const c = await caller(storage, a.keyHash)
  if (!c.ok) return c
  const repeat = roomEvents(c.log).find((e) => e.requestId === a.requestId)
  if (repeat) return sameEvent(repeat, c.me, a.input) ? ok({ event: infoOf(repeat) }) : fail(409, EVENT_TAKEN)
  const { input } = a
  if (input.subject !== null && !c.state.members.some((m) => m.id === input.subject)) return fail(400, BAD_SUBJECT)
  const late = checkEventTimes(input, now)
  if (late) return fail(400, late)
  const id = ulid(now)
  await append(storage, [
    {
      id,
      at: now,
      memberId: c.me,
      type: 'event.created',
      condition: input.condition,
      check: input.check,
      outcomes: input.outcomes,
      closesAt: input.closesAt,
      expectedAt: input.expectedAt,
      subject: input.subject,
      requestId: a.requestId,
    },
  ])
  return ok({
    event: {
      id,
      at: now,
      authorId: c.me,
      condition: input.condition,
      check: input.check,
      outcomes: input.outcomes,
      closesAt: input.closesAt,
      expectedAt: input.expectedAt,
      subjectId: input.subject,
    },
  })
}

// Событие комнаты по номеру — для действия участника
async function eventCaller(
  storage: RoomStorage,
  keyHash: string,
  eventId: string,
): Promise<(Caller & { event: EventState }) | Failure> {
  const c = await caller(storage, keyHash)
  if (!c.ok) return c
  const event = roomEvents(c.log).find((e) => e.id === eventId)
  if (!event) return fail(404, NO_EVENT)
  return { ...c, event }
}

// Ставка: любой участник, на исход открытого события. Приём закрыт по времени сервера в момент
// запроса — даже если в срок сервер лежал. Повтор с тем же номером — та же ставка и тот же ответ
async function placeBet(
  storage: RoomStorage,
  a: { keyHash: string; event: string; outcome: string; amount: number; requestId: string },
  now: number,
): Promise<ActionResult<'placeBet'>> {
  const c = await caller(storage, a.keyHash)
  if (!c.ok) return c
  const events = roomEvents(c.log)
  for (const e of events) {
    const b = e.bets.find((x) => x.requestId === a.requestId)
    if (!b) continue
    const same = b.memberId === c.me && b.event === a.event && b.outcome === a.outcome && b.amount === a.amount
    return same ? ok({ bet: betOf(b) }) : fail(409, BET_TAKEN)
  }
  const event = events.find((e) => e.id === a.event)
  if (!event) return fail(404, NO_EVENT)
  const status = eventStatus(event, now)
  if (status === 'cancelled') return fail(409, EVENT_CANCELLED)
  if (status === 'closed') return fail(409, BETS_CLOSED)
  if (!event.outcomes.some((o) => o.id === a.outcome)) return fail(400, NO_OUTCOME)
  if (eventBank(event) + a.amount > Number.MAX_SAFE_INTEGER) return fail(400, BANK_FULL)
  const bet: BetInfo = { id: ulid(now), event: event.id, memberId: c.me, outcome: a.outcome, amount: a.amount, at: now }
  await append(storage, [{ ...bet, type: 'bet.placed', requestId: a.requestId }])
  return ok({ bet })
}

// Уточнение: только автор; видно всем под условием, само условие не меняется
async function clarifyEvent(
  storage: RoomStorage,
  a: { keyHash: string; event: string; text: string },
  now: number,
): Promise<ActionResult<'clarifyEvent'>> {
  const c = await eventCaller(storage, a.keyHash, a.event)
  if (!c.ok) return c
  if (c.me !== c.event.authorId) return fail(403, AUTHOR_ONLY)
  const clarification: Clarification = { id: ulid(now), at: now, text: a.text }
  await append(storage, [{ ...clarification, memberId: c.me, type: 'event.clarified', event: c.event.id }])
  return ok({ clarification })
}

// Отмена: пока приём идёт — автор; после закрытия — только ведущий и только с причиной.
// Уже отменено — та же отмена без новой записи. Ставки возвращаются (eventRefunds)
async function cancelEvent(
  storage: RoomStorage,
  a: { keyHash: string; event: string; reason: string | null },
  now: number,
): Promise<ActionResult<'cancelEvent'>> {
  const c = await eventCaller(storage, a.keyHash, a.event)
  if (!c.ok) return c
  if (c.event.cancelled) return ok({ cancelled: c.event.cancelled })
  if (eventStatus(c.event, now) === 'open') {
    if (c.me !== c.event.authorId) return fail(403, AUTHOR_ONLY)
  } else {
    if (c.me !== c.state.hostId) return fail(403, HOST_ONLY)
    if (a.reason === null) return fail(400, NEED_REASON)
  }
  await append(storage, [{ id: ulid(now), at: now, memberId: c.me, type: 'event.cancelled', event: c.event.id, reason: a.reason }])
  return ok({ cancelled: { at: now, by: c.me, reason: a.reason } })
}

// Действие с исходом уже было с этим номером запроса: то же (участник, событие, содержимое) —
// прежняя запись, ответ тот же и без новой записи; другое — номер занят. Не было — null
function repeated<T extends { by: string; requestId: string }>(
  events: readonly EventState[],
  items: (e: EventState) => readonly T[],
  requestId: string,
  same: (e: EventState, x: T) => boolean,
): { ok: true; value: T } | Failure | null {
  for (const e of events) {
    const x = items(e).find((i) => i.requestId === requestId)
    if (x) return same(e, x) ? { ok: true, value: x } : fail(409, REQUEST_USED)
  }
  return null
}

type OutcomeAction = { keyHash: string; event: string; outcome: string; requestId: string }

// Участник, события комнаты и событие по номеру — для действия с исходом. Повтор узнаётся
// до проверки события: ответ потерялся — повтор получит тот же ответ и после сроков
async function outcomeCaller(
  storage: RoomStorage,
  keyHash: string,
): Promise<(Caller & { events: EventState[] }) | Failure> {
  const c = await caller(storage, keyHash)
  return c.ok ? { ...c, events: roomEvents(c.log) } : c
}

// Событие для действия с исходом: есть и не отменено
function liveEvent(events: readonly EventState[], id: string): { ok: true; event: EventState } | Failure {
  const event = events.find((e) => e.id === id)
  if (!event) return fail(404, NO_EVENT)
  if (event.cancelled) return fail(409, EVENT_CANCELLED)
  return { ok: true, event }
}

// Предложить исход: после закрытия приёма — автор события (не предмет спора); автор — предмет
// или молчит 3 дня после «исход ожидается к» — ведущий; событие ведущего о себе — любой, кроме
// него (Р-19). Одно предложение на событие: первое
async function proposeOutcome(storage: RoomStorage, a: OutcomeAction, now: number): Promise<ActionResult<'proposeOutcome'>> {
  const c = await outcomeCaller(storage, a.keyHash)
  if (!c.ok) return c
  const again = repeated(c.events, (e) => (e.proposal ? [e.proposal] : []), a.requestId, (e, x) => e.id === a.event && x.by === c.me && x.outcome === a.outcome)
  if (again) return again.ok ? ok({ proposal: markOut(again.value) }) : again
  const live = liveEvent(c.events, a.event)
  if (!live.ok) return live
  const { event } = live
  if (event.proposal) return fail(409, ALREADY_PROPOSED)
  if (eventStatus(event, now) === 'open') return fail(409, BETS_OPEN)
  if (c.me === event.subjectId) return fail(403, SUBJECT_SILENT)
  if (!mayPropose(event, c.me, now)) return fail(403, PROPOSER_ONLY)
  if (!event.outcomes.some((o) => o.id === a.outcome)) return fail(400, NO_OUTCOME)
  const proposal: OutcomeMark = { id: ulid(now), at: now, by: c.me, outcome: a.outcome }
  await append(storage, [{ id: proposal.id, at: now, memberId: c.me, type: 'outcome.proposed', event: event.id, outcome: a.outcome, requestId: a.requestId }])
  return ok({ proposal })
}

// Возразить: ставивший (кроме предложившего), сутки после предложения, с причиной; одно возражение
// от участника. Утверждённый ведущим исход уже не оспорить — дальше апелляция (этап 4)
async function objectOutcome(
  storage: RoomStorage,
  a: { keyHash: string; event: string; reason: string; requestId: string },
  now: number,
): Promise<ActionResult<'objectOutcome'>> {
  const c = await outcomeCaller(storage, a.keyHash)
  if (!c.ok) return c
  const again = repeated(c.events, (e) => e.objections, a.requestId, (e, x) => e.id === a.event && x.by === c.me && x.reason === a.reason)
  if (again) return again.ok ? ok({ objection: objectionOut(again.value) }) : again
  const live = liveEvent(c.events, a.event)
  if (!live.ok) return live
  const { event } = live
  if (!event.proposal) return fail(409, NOT_PROPOSED)
  if (c.me === event.proposal.by) return fail(403, OWN_PROPOSAL)
  if (!betOn(event, c.me)) return fail(403, BETTORS_ONLY)
  if (event.objections.some((o) => o.by === c.me)) return fail(409, ALREADY_OBJECTED)
  if (event.agreements.some((x) => x.by === c.me)) return fail(409, ALREADY_AGREED)
  const view = eventOutcome(event, now)
  if (view && now >= view.objectionUntil) return fail(409, OBJECTION_OVER)
  if (view?.approved) return fail(409, ALREADY_APPROVED)
  const objection: Objection = { id: ulid(now), at: now, by: c.me, reason: a.reason }
  await append(storage, [{ id: objection.id, at: now, memberId: c.me, type: 'outcome.objected', event: event.id, reason: a.reason, requestId: a.requestId }])
  return ok({ objection })
}

// Согласиться (Р-21): ставивший (кроме предложившего), сутки после предложения, пока нет возражений;
// одно согласие от участника, не отзывается. Согласились все ставившие — исход утверждён и окончательный
// сразу (eventOutcome)
async function agreeOutcome(
  storage: RoomStorage,
  a: { keyHash: string; event: string; requestId: string },
  now: number,
): Promise<ActionResult<'agreeOutcome'>> {
  const c = await outcomeCaller(storage, a.keyHash)
  if (!c.ok) return c
  const again = repeated(c.events, (e) => e.agreements, a.requestId, (e, x) => e.id === a.event && x.by === c.me)
  if (again) return again.ok ? ok({ agreement: agreementOut(again.value) }) : again
  const live = liveEvent(c.events, a.event)
  if (!live.ok) return live
  const { event } = live
  if (!event.proposal) return fail(409, NOT_PROPOSED)
  if (c.me === event.proposal.by) return fail(403, OWN_AGREEMENT)
  if (!betOn(event, c.me)) return fail(403, AGREE_BETTORS_ONLY)
  if (event.agreements.some((x) => x.by === c.me)) return fail(409, ALREADY_AGREED)
  if (event.objections.some((o) => o.by === c.me)) return fail(409, ALREADY_OBJECTED)
  if (event.objections.length > 0) return fail(409, AGREEMENT_CLOSED)
  const view = eventOutcome(event, now)
  if (view && now >= view.objectionUntil) return fail(409, OBJECTION_OVER)
  if (view?.approved) return fail(409, ALREADY_APPROVED)
  const agreement: Agreement = { id: ulid(now), at: now, by: c.me }
  await append(storage, [{ id: agreement.id, at: now, memberId: c.me, type: 'outcome.agreed', event: event.id, requestId: a.requestId }])
  return ok({ agreement })
}

// Решение ведущего после возражения: любой исход события; только если ведущий не ставил и не
// предмет спора (иначе — голосование). Одно решение
async function decideOutcome(storage: RoomStorage, a: OutcomeAction, now: number): Promise<ActionResult<'decideOutcome'>> {
  const c = await outcomeCaller(storage, a.keyHash)
  if (!c.ok) return c
  const again = repeated(c.events, (e) => (e.decision ? [e.decision] : []), a.requestId, (e, x) => e.id === a.event && x.by === c.me && x.outcome === a.outcome)
  if (again) return again.ok ? ok({ decision: markOut(again.value) }) : again
  const live = liveEvent(c.events, a.event)
  if (!live.ok) return live
  const { event } = live
  if (c.me !== c.state.hostId) return fail(403, HOST_ONLY)
  if (event.objections.length === 0) return fail(409, NO_OBJECTION)
  if (!hostDecides(event)) return fail(403, HOST_INTERESTED)
  if (event.decision) return fail(409, ALREADY_DECIDED)
  if (!event.outcomes.some((o) => o.id === a.outcome)) return fail(400, NO_OUTCOME)
  const decision: OutcomeMark = { id: ulid(now), at: now, by: c.me, outcome: a.outcome }
  await append(storage, [{ id: decision.id, at: now, memberId: c.me, type: 'outcome.decided', event: event.id, outcome: a.outcome, requestId: a.requestId }])
  return ok({ decision })
}

// Голос: ведущий ставил или он предмет спора — после возражения голосуют не ставившие и не предмет
// (участники на миг первого возражения); 72 часа или пока не проголосуют все; голос — один
async function voteOutcome(storage: RoomStorage, a: OutcomeAction, now: number): Promise<ActionResult<'voteOutcome'>> {
  const c = await outcomeCaller(storage, a.keyHash)
  if (!c.ok) return c
  const again = repeated(c.events, (e) => e.votes, a.requestId, (e, x) => e.id === a.event && x.by === c.me && x.outcome === a.outcome)
  if (again) return again.ok ? ok({ vote: markOut(again.value) }) : again
  const live = liveEvent(c.events, a.event)
  if (!live.ok) return live
  const { event } = live
  if (event.objections.length === 0) return fail(409, NO_OBJECTION)
  if (hostDecides(event)) return fail(409, NO_VOTING)
  if (!eventVoters(event).includes(c.me)) return fail(403, VOTERS_ONLY)
  if (event.votes.some((v) => v.by === c.me)) return fail(409, ALREADY_VOTED)
  if (eventOutcome(event, now)?.status !== 'voting') return fail(409, VOTING_OVER)
  if (!event.outcomes.some((o) => o.id === a.outcome)) return fail(400, NO_OUTCOME)
  const vote: OutcomeMark = { id: ulid(now), at: now, by: c.me, outcome: a.outcome }
  await append(storage, [{ id: vote.id, at: now, memberId: c.me, type: 'outcome.voted', event: event.id, outcome: a.outcome, requestId: a.requestId }])
  return ok({ vote })
}

// --- Пари (Р-22). Правила — offer.ts; сроки — по времени сервера в момент запроса (будильника нет:
// статус «истекло» считается, не записывается). Повтор с тем же номером запроса — тот же ответ без
// новой записи (и после сроков); тот же номер с другим содержимым или от другого — 409

type OfferCaller = Caller & { offers: OfferState[]; roles: RoomRoles; again: OfferEntry | undefined }

async function offerCaller(storage: RoomStorage, keyHash: string, requestId: string): Promise<OfferCaller | Failure> {
  const c = await caller(storage, keyHash)
  if (!c.ok) return c
  const again = c.log.find((e): e is OfferEntry => isOfferEntry(e) && e.requestId === requestId)
  return { ...c, offers: logOffers(c.log), roles: roomRoles(c.state), again }
}

// Отказ правил пари: «не вам» — 403, «уже не то состояние» — 409, кривое тело — 400; истекло —
// «Приём закрыт»
const OFFER_FORBIDDEN: readonly string[] = [
  OWN_OFFER,
  GUARANTOR_TAKES,
  NOT_ADDRESSEE,
  NOT_MEMBER,
  ONLY_AUTHOR,
  OWN_COUNTER,
  GUARANTOR_COUNTERS,
  GUARANTOR_MARKS,
  NOT_SIDE,
  ONLY_GUARANTOR,
]
const OFFER_BAD_BODY: readonly string[] = [BAD_MARK, BAD_GUARANTOR]

function offerRefusal(error: string): Failure {
  if (error === EXPIRED) return fail(409, OFFER_CLOSED)
  if (OFFER_BAD_BODY.includes(error)) return fail(400, error)
  return fail(OFFER_FORBIDDEN.includes(error) ? 403 : 409, error)
}

// Повтор создания или встречного: та же запись offer.created от того же участника — то же пари
function repeatedOffer(c: OfferCaller, same: (e: Extract<OfferEntry, { type: 'offer.created' }>) => boolean): { ok: true; value: { offer: OfferInfo } } | Failure {
  const e = c.again
  const o = e?.type === 'offer.created' && e.memberId === c.me && same(e) ? c.offers.find((x) => x.id === e.id) : undefined
  return o ? ok({ offer: offerInfo(o) }) : fail(409, REQUEST_USED)
}

function sameTerms(e: { odds: Odds; amount: number; closesAt: number }, x: { odds: Odds; amount: number; closesAt: number }): boolean {
  return e.odds.a === x.odds.a && e.odds.b === x.odds.b && e.amount === x.amount && e.closesAt === x.closesAt
}

// Записать новое пари (проверенное правилами) и ответить его условиями
async function writeOffer(
  storage: RoomStorage,
  c: OfferCaller,
  input: OfferInput,
  counterTo: string | null,
  requestId: string,
  now: number,
): Promise<ActionResult<'createOffer'>> {
  const guarantor = offerGuarantor(input, c.me, c.roles)
  if (!guarantor.ok) return fail(400, guarantor.error)
  const late = checkOfferTimes(input, now)
  if (late) return fail(late === CLOSE_PASSED ? 409 : 400, late)
  const entry: LogEntry = {
    id: ulid(now),
    at: now,
    memberId: c.me,
    type: 'offer.created',
    condition: input.condition,
    check: input.check,
    side: input.side,
    odds: { a: input.odds.a, b: input.odds.b },
    amount: input.amount,
    to: input.to,
    closesAt: input.closesAt,
    expectedAt: input.expectedAt,
    guarantor: guarantor.value,
    counterTo,
    requestId,
  }
  await append(storage, [entry])
  const created = logOffers([...c.log, entry]).find((o) => o.id === entry.id)
  return created ? ok({ offer: offerInfo(created) }) : fail(409, NO_OFFER)
}

// Предложить пари: любой участник; адресное — другому участнику, открытое — всем. Гарант не выбран —
// ведущий (ведущий — сторона — отказ). «Приём до» прошёл — 409
async function createOffer(
  storage: RoomStorage,
  a: { keyHash: string; input: OfferInput; requestId: string },
  now: number,
): Promise<ActionResult<'createOffer'>> {
  const c = await offerCaller(storage, a.keyHash, a.requestId)
  if (!c.ok) return c
  const { input } = a
  if (c.again) {
    return repeatedOffer(
      c,
      (e) =>
        e.counterTo === null &&
        sameTerms(e, input) &&
        e.condition === input.condition &&
        e.check === input.check &&
        e.side === input.side &&
        e.to === input.to &&
        e.expectedAt === input.expectedAt &&
        e.guarantor === (input.guarantor ?? c.state.hostId),
    )
  }
  return writeOffer(storage, c, input, null, a.requestId, now)
}

// Встречное: новое пари автору исходного со своими кэфом, суммой и «приём до» (counterInput); делает
// тот, кто мог бы принять исходное. Автор принял встречное — исходное закрыто встречным (roomOffers)
async function counterOffer(
  storage: RoomStorage,
  a: { keyHash: string; offer: string; odds: Odds | null; amount: number | null; closesAt: number; requestId: string },
  now: number,
): Promise<ActionResult<'counterOffer'>> {
  const c = await offerCaller(storage, a.keyHash, a.requestId)
  if (!c.ok) return c
  const original = c.offers.find((o) => o.id === a.offer)
  const terms = original && { odds: a.odds ?? original.odds, amount: a.amount ?? original.amount, closesAt: a.closesAt }
  if (c.again) return repeatedOffer(c, (e) => e.counterTo === a.offer && !!terms && sameTerms(e, terms))
  if (!original || !terms) return fail(404, NO_OFFER)
  const refused = checkCounter(original, c.me, c.roles, now)
  if (refused) return offerRefusal(refused)
  const checked = checkOfferInput(counterInput(original, terms))
  if (!checked.ok) return fail(400, checked.error)
  return writeOffer(storage, c, checked.value, original.id, a.requestId, now)
}

function actOf(e: Exclude<OfferEntry, { type: 'offer.created' }>): OfferAct {
  return { id: e.id, at: e.at, by: e.memberId, offer: e.offer }
}

// Принять: адресное — адресат, открытое — любой участник, кроме автора и гаранта; до «приём до»
async function acceptOffer(
  storage: RoomStorage,
  a: { keyHash: string; offer: string; requestId: string },
  now: number,
): Promise<ActionResult<'acceptOffer'>> {
  const c = await offerCaller(storage, a.keyHash, a.requestId)
  if (!c.ok) return c
  const o = c.offers.find((x) => x.id === a.offer)
  if (c.again) {
    const e = c.again
    return e.type === 'offer.accepted' && e.offer === a.offer && e.memberId === c.me && o
      ? ok({ accepted: actOf(e), offer: offerInfo(o) })
      : fail(409, REQUEST_USED)
  }
  if (!o) return fail(404, NO_OFFER)
  const refused = checkAccept(o, c.me, c.roles, now)
  if (refused) return offerRefusal(refused)
  const entry = { id: ulid(now), at: now, memberId: c.me, type: 'offer.accepted', offer: o.id, requestId: a.requestId } as const
  await append(storage, [entry])
  return ok({ accepted: actOf(entry), offer: offerInfo(o) })
}

// Отозвать: только автор, пока не принято и не закрыто встречным
async function revokeOffer(
  storage: RoomStorage,
  a: { keyHash: string; offer: string; requestId: string },
  now: number,
): Promise<ActionResult<'revokeOffer'>> {
  const c = await offerCaller(storage, a.keyHash, a.requestId)
  if (!c.ok) return c
  if (c.again) {
    const e = c.again
    return e.type === 'offer.revoked' && e.offer === a.offer && e.memberId === c.me ? ok({ revoked: actOf(e) }) : fail(409, REQUEST_USED)
  }
  const o = c.offers.find((x) => x.id === a.offer)
  if (!o) return fail(404, NO_OFFER)
  const refused = checkWithdraw(o, c.me)
  if (refused) return offerRefusal(refused)
  const entry = { id: ulid(now), at: now, memberId: c.me, type: 'offer.revoked', offer: o.id, requestId: a.requestId } as const
  await append(storage, [entry])
  return ok({ revoked: actOf(entry) })
}

// --- Исход пари (Р-23, Р-06). Правила — checkMark / checkDecide / checkDecline / checkNominate и
// offerOutcome (offer.ts); фазы — по времени сервера в момент запроса. Повтор с тем же номером
// запроса — тот же ответ без новой записи (и после сроков); чужое действие или содержимое — 409

type OfferOutcomeAction = { keyHash: string; offer: string; requestId: string }
type MarkedEntry = Extract<OfferEntry, { type: 'offer.marked' }>
type DecidedEntry = Extract<OfferEntry, { type: 'offer.decided' }>
type NominatedEntry = Extract<OfferEntry, { type: 'offer.nominated' }>

function winnerAct(e: MarkedEntry | DecidedEntry): OfferWinnerAct {
  return { ...actOf(e), winner: e.winner }
}

function nominatedAct(e: NominatedEntry): OfferAct & { guarantor: string } {
  return { ...actOf(e), guarantor: e.guarantor }
}

// Пари для действия с исходом; повтор уже узнан — сюда не доходит
function offerById(c: OfferCaller, id: string): { ok: true; offer: OfferState } | Failure {
  const offer = c.offers.find((x) => x.id === id)
  return offer ? { ok: true, offer } : fail(404, NO_OFFER)
}

// Отметка стороны «прав автор» / «прав соперник»: после принятия, пока исход не утверждён; поменять —
// до решения гаранта. Та же отметка, что действует, — прежняя запись без новой. Обе совпали — исход
// утверждён согласием и окончательный сразу (offerOutcome)
async function markOffer(
  storage: RoomStorage,
  a: OfferOutcomeAction & { winner: OfferSide },
  now: number,
): Promise<ActionResult<'markOffer'>> {
  const c = await offerCaller(storage, a.keyHash, a.requestId)
  if (!c.ok) return c
  if (c.again) {
    const e = c.again
    return e.type === 'offer.marked' && e.offer === a.offer && e.memberId === c.me && e.winner === a.winner
      ? ok({ marked: winnerAct(e) })
      : fail(409, REQUEST_USED)
  }
  const found = offerById(c, a.offer)
  if (!found.ok) return found
  const o = found.offer
  const refused = checkMark(o, c.me, a.winner)
  if (refused) return offerRefusal(refused)
  const side = sideOf(o, c.me) as OfferSide
  if (currentMarks(o)[side] === a.winner) {
    // Действующая отметка — последняя запись этой стороны с тем же выбором
    for (let i = c.log.length - 1; i >= 0; i--) {
      const e = c.log[i]
      if (e.type === 'offer.marked' && e.offer === o.id && e.memberId === c.me && e.winner === a.winner) return ok({ marked: winnerAct(e) })
    }
  }
  const entry = { id: ulid(now), at: now, memberId: c.me, type: 'offer.marked', offer: o.id, winner: a.winner, requestId: a.requestId } as const
  await append(storage, [entry])
  return ok({ marked: winnerAct(entry) })
}

// Решение гаранта: нынешний гарант, когда решение перешло к нему (стороны разошлись или одна молчит
// 3 дня), в его 3 дня; окончательный через 7 дней
async function decideOffer(
  storage: RoomStorage,
  a: OfferOutcomeAction & { winner: OfferSide },
  now: number,
): Promise<ActionResult<'decideOffer'>> {
  const c = await offerCaller(storage, a.keyHash, a.requestId)
  if (!c.ok) return c
  if (c.again) {
    const e = c.again
    return e.type === 'offer.decided' && e.offer === a.offer && e.memberId === c.me && e.winner === a.winner
      ? ok({ decided: winnerAct(e) })
      : fail(409, REQUEST_USED)
  }
  const found = offerById(c, a.offer)
  if (!found.ok) return found
  const refused = checkDecide(found.offer, c.me, a.winner, now)
  if (refused) return offerRefusal(refused)
  const entry = { id: ulid(now), at: now, memberId: c.me, type: 'offer.decided', offer: found.offer.id, winner: a.winner, requestId: a.requestId } as const
  await append(storage, [entry])
  return ok({ decided: winnerAct(entry) })
}

// Отказ гаранта: нынешний гарант принятого пари, пока исход не утверждён; дальше стороны называют другого
async function declineOffer(storage: RoomStorage, a: OfferOutcomeAction, now: number): Promise<ActionResult<'declineOffer'>> {
  const c = await offerCaller(storage, a.keyHash, a.requestId)
  if (!c.ok) return c
  if (c.again) {
    const e = c.again
    return e.type === 'offer.declined' && e.offer === a.offer && e.memberId === c.me ? ok({ declined: actOf(e) }) : fail(409, REQUEST_USED)
  }
  const found = offerById(c, a.offer)
  if (!found.ok) return found
  const refused = checkDecline(found.offer, c.me, now)
  if (refused) return offerRefusal(refused)
  const entry = { id: ulid(now), at: now, memberId: c.me, type: 'offer.declined', offer: found.offer.id, requestId: a.requestId } as const
  await append(storage, [entry])
  return ok({ declined: actOf(entry) })
}

// Новый гарант: сторона называет участника не из сторон, когда нужен другой гарант; обе назвали
// одного — он гарант, его 3 дня — с назначения (roomOffers)
async function nominateGuarantor(
  storage: RoomStorage,
  a: OfferOutcomeAction & { guarantor: string },
  now: number,
): Promise<ActionResult<'nominateGuarantor'>> {
  const c = await offerCaller(storage, a.keyHash, a.requestId)
  if (!c.ok) return c
  if (c.again) {
    const e = c.again
    return e.type === 'offer.nominated' && e.offer === a.offer && e.memberId === c.me && e.guarantor === a.guarantor
      ? ok({ nominated: nominatedAct(e) })
      : fail(409, REQUEST_USED)
  }
  const found = offerById(c, a.offer)
  if (!found.ok) return found
  const refused = checkNominate(found.offer, c.me, a.guarantor, c.roles, now)
  if (refused) return offerRefusal(refused)
  const entry = {
    id: ulid(now),
    at: now,
    memberId: c.me,
    type: 'offer.nominated',
    offer: found.offer.id,
    guarantor: a.guarantor,
    requestId: a.requestId,
  } as const
  await append(storage, [entry])
  return ok({ nominated: nominatedAct(entry) })
}

// --- Апелляция и суд (Р-24, Р-25). Правила — checkAppeal / checkJoin / checkCourtVote / checkReplace
// (appeal.ts) на время сервера в момент запроса, на том же деле суда, что даёт свёртка журнала
// (logAppeals): сервер и свёртка не расходятся. Повтор с тем же номером запроса — тот же ответ без
// новой записи (и после сроков); тот же номер у другого действия, спора или содержимого — 409

type CourtAction = { keyHash: string; kind: CourtKind; target: string; requestId: string }
type FiledEntry = Extract<LogEntry, { type: 'appeal.filed' }>
type JoinedEntry = Extract<LogEntry, { type: 'appeal.joined' }>
type VotedEntry = Extract<LogEntry, { type: 'court.voted' }>
type ReplacedEntry = Extract<LogEntry, { type: 'court.replaced' }>

// Спор для апелляции: событие или пари комнаты, дело суда по нему (или null) и участники для жребия;
// again — запись журнала с этим номером запроса (повтор узнаётся до проверки спора)
type CourtCaller = Caller & { again: undefined; dispute: appeal.AppealTarget; court: CourtCase | null; room: appeal.CourtRoom }

async function courtCaller(storage: RoomStorage, a: CourtAction): Promise<(Caller & { again: LogEntry }) | CourtCaller | Failure> {
  const c = await caller(storage, a.keyHash)
  if (!c.ok) return c
  const again = c.log.find((e) => 'requestId' in e && e.requestId === a.requestId)
  if (again) return { ...c, again }
  let dispute: appeal.AppealTarget
  if (a.kind === 'event') {
    const event = roomEvents(c.log).find((e) => e.id === a.target)
    if (!event) return fail(404, NO_EVENT)
    dispute = { kind: 'event', event }
  } else {
    const offer = logOffers(c.log).find((o) => o.id === a.target)
    if (!offer) return fail(404, NO_OFFER)
    dispute = { kind: 'offer', offer }
  }
  // Дело суда — только по этому спору: свёртке нужен лишь он
  const one = dispute.kind === 'event' ? { events: [dispute.event], offers: [] } : { events: [], offers: [dispute.offer] }
  const court = appeal.caseOf(appeal.logAppeals(c.log, one), a.target)
  return { ...c, again: undefined, dispute, court, room: appeal.courtRoom(c.state) }
}

// Отказ правил апелляции: «не вам» — 403, кривое тело (причина, голос, кого заменить) — 400, «уже не
// то состояние» — 409
const COURT_FORBIDDEN: readonly string[] = [
  appeal.NOT_BETTOR,
  appeal.AGREED_BETTOR,
  appeal.NOT_SIDE,
  appeal.OWN_APPEAL,
  appeal.NOT_JUROR,
  appeal.ONLY_HOST,
  appeal.HOST_INTERESTED,
  appeal.OWN_SEAT,
]
const COURT_BAD_BODY: readonly string[] = [
  appeal.NEED_APPEAL,
  appeal.LONG_APPEAL,
  appeal.BAD_VERDICT,
  appeal.NO_KEEP,
  appeal.SAME_CHANGE,
  appeal.NOT_SEAT,
  appeal.NEED_REPLACE,
  appeal.LONG_REPLACE,
]

function courtRefusal(error: string): Failure {
  if (COURT_BAD_BODY.includes(error)) return fail(400, error)
  return fail(COURT_FORBIDDEN.includes(error) ? 403 : 409, error)
}

function courtAct(e: { id: string; at: number; memberId: string; target: string }): CourtAct {
  return { id: e.id, at: e.at, by: e.memberId, target: e.target }
}

function verdictOf(v: CourtVerdict): CourtVerdict {
  if (v.verdict !== 'change') return { verdict: v.verdict }
  return 'outcome' in v ? { verdict: 'change', outcome: v.outcome } : { verdict: 'change', winner: v.winner }
}

function sameVerdict(a: CourtVerdict, b: CourtVerdict): boolean {
  return JSON.stringify(verdictOf(a)) === JSON.stringify(verdictOf(b))
}

// Подать апелляцию: ставивший на событие (кроме согласившихся) или сторона пари, пока исход утверждён
// и не окончательный; суд собирается в этот миг — зерно сервера и кандидаты на этот миг в той же записи
async function appealOutcome(
  storage: RoomStorage,
  a: CourtAction & { reason: string },
  now: number,
  seed: () => string,
): Promise<ActionResult<'appealOutcome'>> {
  const c = await courtCaller(storage, a)
  if (!c.ok) return c
  if (c.again) {
    const e = c.again
    return e.type === 'appeal.filed' && e.target === a.target && e.memberId === c.me && e.reason === a.reason
      ? ok({ appeal: filedOut(e) })
      : fail(409, REQUEST_USED)
  }
  const d: CourtCaller = c
  const refused = appeal.checkAppeal(d.dispute, d.court, c.me, a.reason, d.room, now)
  if (refused) return courtRefusal(refused)
  const candidates = appeal.courtCandidates(d.dispute, d.room, now, [c.me])
  const entry: FiledEntry = {
    id: ulid(now),
    at: now,
    memberId: c.me,
    type: 'appeal.filed',
    target: a.target,
    reason: a.reason,
    seed: seed(),
    candidates,
    requestId: a.requestId,
  }
  await append(storage, [entry])
  return ok({ appeal: filedOut(entry) })
}

function filedOut(e: FiledEntry): AppealResponse['appeal'] {
  return { ...courtAct(e), reason: e.reason, seed: e.seed, candidates: [...e.candidates] }
}

// Присоединиться к апелляции: тот, кто мог бы подать, кроме подавшего; один раз; до решения суда
async function joinAppeal(storage: RoomStorage, a: CourtAction, now: number): Promise<ActionResult<'joinAppeal'>> {
  const c = await courtCaller(storage, a)
  if (!c.ok) return c
  if (c.again) {
    const e = c.again
    return e.type === 'appeal.joined' && e.target === a.target && e.memberId === c.me ? ok({ joined: courtAct(e) }) : fail(409, REQUEST_USED)
  }
  const d: CourtCaller = c
  const refused = appeal.checkJoin(d.dispute, d.court, c.me, now)
  if (refused) return courtRefusal(refused)
  const entry: JoinedEntry = { id: ulid(now), at: now, memberId: c.me, type: 'appeal.joined', target: a.target, requestId: a.requestId }
  await append(storage, [entry])
  return ok({ joined: courtAct(entry) })
}

// Голос суда: член суда на своём месте в свои 72 часа, один раз, не меняется
async function judgeCourt(storage: RoomStorage, a: CourtAction & { vote: CourtVerdict }, now: number): Promise<ActionResult<'judgeCourt'>> {
  const c = await courtCaller(storage, a)
  if (!c.ok) return c
  if (c.again) {
    const e = c.again
    return e.type === 'court.voted' && e.target === a.target && e.memberId === c.me && sameVerdict(e, a.vote)
      ? ok({ voted: votedOut(e) })
      : fail(409, REQUEST_USED)
  }
  const d: CourtCaller = c
  if (!d.court) return fail(409, NO_COURT)
  const refused = appeal.checkCourtVote(d.dispute, d.court, c.me, a.vote, now)
  if (refused) return courtRefusal(refused)
  const entry = {
    id: ulid(now),
    at: now,
    memberId: c.me,
    type: 'court.voted',
    target: a.target,
    requestId: a.requestId,
    ...verdictOf(a.vote),
  } as VotedEntry
  await append(storage, [entry])
  return ok({ voted: votedOut(entry) })
}

function votedOut(e: VotedEntry): JudgeResponse['voted'] {
  return { ...courtAct(e), ...verdictOf(e) }
}

// Досрочная замена: ведущий, если сам не заинтересован; не проголосовавшего на своём месте, не себя,
// одна замена на место, с причиной, до решения
async function replaceJuror(
  storage: RoomStorage,
  a: CourtAction & { member: string; reason: string },
  now: number,
): Promise<ActionResult<'replaceJuror'>> {
  const c = await courtCaller(storage, a)
  if (!c.ok) return c
  if (c.again) {
    const e = c.again
    return e.type === 'court.replaced' && e.target === a.target && e.memberId === c.me && e.member === a.member && e.reason === a.reason
      ? ok({ replaced: replacedOut(e) })
      : fail(409, REQUEST_USED)
  }
  const d: CourtCaller = c
  if (!d.court) return fail(409, NO_COURT)
  const refused = appeal.checkReplace(d.court, c.me, a.member, a.reason, now)
  if (refused) return courtRefusal(refused)
  const entry: ReplacedEntry = {
    id: ulid(now),
    at: now,
    memberId: c.me,
    type: 'court.replaced',
    target: a.target,
    member: a.member,
    reason: a.reason,
    requestId: a.requestId,
  }
  await append(storage, [entry])
  return ok({ replaced: replacedOut(entry) })
}

function replacedOut(e: ReplacedEntry): ReplaceJurorResponse['replaced'] {
  return { ...courtAct(e), member: e.member, reason: e.reason }
}
