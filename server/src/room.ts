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
//   registry       — комната отмечена в реестре комнат (только Cloudflare, index.ts); в копию не идёт
//
// Копия комнаты (этап 6, src/rules/backup.ts) — журнал и записи key:, device:, invite, secret как есть
import {
  BACKUP_FORMAT,
  STORE_DEVICE,
  STORE_INVITE,
  STORE_KEY,
  STORE_SECRET,
  type Backup,
  type DeviceRecord,
  type InviteRecord,
  type KeyRecord,
  type SecretRecord,
} from '../../src/rules/backup'
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
  CANCEL_AUTHOR_HOST,
  CANCEL_HOST_INVOLVED,
  CANCEL_OTHERS_BETS,
  checkCancel,
  checkEventTimes,
  earlyProposal,
  eventBank,
  eventOutcome,
  eventRounds,
  eventStatus,
  eventVoters,
  hostDecides,
  infoOf,
  markOut,
  mayPropose,
  NEED_REASON,
  NOT_YET,
  objectionOut,
  objectionOver,
  proposerOnly,
  roomEvents,
  sameEvent,
  subjectBetError,
  withdrawnAt,
  type EventInput,
  type EventState,
} from '../../src/rules/event'
import {
  BAD_BID,
  BAD_GUARANTOR,
  BAD_MARK,
  BANK_TOO_BIG,
  bestBid,
  checkAccept,
  checkBid,
  checkCounter,
  checkDecide,
  checkDecline,
  checkMark,
  checkNominate,
  checkOfferInput,
  checkOfferSubject,
  checkOfferTimes,
  checkTakeBid,
  checkWithdraw,
  CLOSE_PASSED,
  counterInput,
  currentMarks,
  EXPIRED,
  GUARANTOR_BIDS,
  GUARANTOR_COUNTERS,
  GUARANTOR_MARKS,
  GUARANTOR_TAKES,
  isOfferEntry,
  logOffers,
  NO_GUARANTOR_CHOSEN,
  NO_OFFER,
  NOT_ADDRESSEE,
  NOT_MEMBER,
  NOT_SIDE,
  offerAt,
  offerGuarantor,
  offerInfo,
  ONLY_AUTHOR,
  ONLY_AUTHOR_TAKES,
  ONLY_GUARANTOR,
  OWN_BID,
  OWN_COUNTER,
  OWN_OFFER,
  roomRoles,
  sideOf,
  SUBJECT_BIDS,
  SUBJECT_GUARANTOR,
  SUBJECT_TAKES,
  type OfferEntry,
  type OfferInput,
  type OfferSide,
  type OfferState,
  type Odds,
  type RoomRoles,
} from '../../src/rules/offer'
import * as appeal from '../../src/rules/appeal'
import type { CourtCase } from '../../src/rules/court'
import * as lot from '../../src/rules/lot'
import * as choice from '../../src/rules/choice'
import type {
  Agreement,
  AppealResponse,
  BetInfo,
  Cancellation,
  ChoiceOptionAct,
  ChoiceStakeAct,
  ChoiceView,
  Clarification,
  CourtAct,
  CourtVerdict,
  EventInfo,
  JoinAppealResponse,
  JudgeResponse,
  LotBidAct,
  LotMark,
  LotMarkAct,
  LotView,
  Objection,
  OfferAct,
  OfferBidAct,
  OfferInfo,
  OfferTakeAct,
  OfferWinnerAct,
  OutcomeMark,
  ReplaceJurorResponse,
  SettleModeResponse,
} from '../../src/rules/protocol'
import * as pace from '../../src/rules/pace'
import type { PaceResponse } from '../../src/rules/protocol'
import * as settle from '../../src/rules/settle'
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
export const BETS_CLOSED_PROPOSED = 'Приём закрыт: исход уже предложен'
export const EVENT_CANCELLED = 'Событие отменено'
export const AUTHOR_ONLY = 'Это может только автор события'
export const EVENT_TAKEN = 'Этот номер запроса уже занят другим событием'
export const BET_TAKEN = 'Этот номер запроса уже занят другой ставкой'
export const BANK_FULL = 'Банк события слишком велик для такой ставки'
// Исход события
// Отказы со сроком — из сроков события (proposerOnly, objectionOver); константы — у обычного темпа
export const PROPOSER_ONLY = proposerOnly({})
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
export const OBJECTION_OVER = objectionOver({})
export const ALREADY_APPROVED = 'Исход уже утверждён'
export const NO_OBJECTION = 'Возражений нет — решать нечего'
export const HOST_INTERESTED = 'Ведущий ставил или он предмет спора — исход решает голосование'
export const ALREADY_DECIDED = 'Ведущий уже решил'
export const NO_VOTING = 'Голосования нет: возражение решает ведущий'
export const VOTERS_ONLY = 'Голосуют только те, кто не ставил и не предмет спора'
export const ALREADY_VOTED = 'Вы уже проголосовали'
export const VOTING_OVER = 'Голосование закончено'
export const PROPOSAL_WITHDRAWN = 'Предложение снято: исход ещё не известен — его предложат снова'
export const REQUEST_USED = 'Этот номер запроса уже занят другим действием'
// Пари (Р-22): прочие отказы — тексты правил offer.ts
export const OFFER_CLOSED = 'Приём закрыт — срок «приём до» прошёл'
export { NO_OFFER }
// Апелляция и суд (Р-25): прочие отказы — тексты правил appeal.ts
export const NO_COURT = 'Суда по этому спору нет'
// Лот (Р-38): прочие отказы — тексты правил lot.ts
export const NO_LOT = 'Нет такого лота'
// Выбор (Р-39): прочие отказы — тексты правил choice.ts
export const NO_CHOICE = 'Нет такого выбора'

// Ссылка для другого устройства живёт сутки
export const DEVICE_LINK_TTL = 24 * 60 * 60 * 1000

const LOG = 'log:'
const KEY = STORE_KEY
const INVITE = STORE_INVITE
const SECRET = STORE_SECRET
const DEVICE = STORE_DEVICE
const REGISTERED = 'registry'

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

// Что Worker передаёт комнате при создании: номер, проверенная форма, хеш ключа ведущего, приглашение;
// режим «кто кому» (Р-32) — если выбран: нет — «по ставкам»; темп (Р-35, проверен checkPace) — если
// выбран: нет — обычный
export type CreateInput = RoomInput & { roomId: string; keyHash: string; invite: string; settleMode?: settle.SettleMode; pace?: pace.PaceInput }

// Темп с его сроками: не выбран — обычный
function roomPaceOf(input: pace.PaceInput | undefined): pace.RoomPace {
  const p = input ?? { pace: pace.DEFAULT_PACE }
  return { pace: p.pace, times: pace.paceTimes(p) }
}

// Поля темпа в записи журнала (room.created, room.pace): сроки — только у «своего»
function paceFields(p: pace.PaceInput): { pace: pace.Pace; times?: pace.Times } {
  return p.pace === 'custom' ? { pace: p.pace, times: { ...p.times } } : { pace: p.pace }
}

function samePace(a: pace.RoomPace, b: pace.RoomPace): boolean {
  return a.pace === b.pace && pace.TIME_KEYS.every((k) => a.times[k] === b.times[k])
}

export type CreateResult =
  | { ok: true; roomId: string; memberId: string; invite: string }
  | { ok: false; status: 409; error: string }

// Создать комнату. Комната уже есть (повтор того же запроса) — тот же ответ, ничего не дописывая;
// тот же номер, но другая форма или ключ — отказ
export async function createRoom(storage: RoomStorage, input: CreateInput, now: number): Promise<CreateResult> {
  const log = await readLog(storage)
  const existing = foldLog(log)
  if (existing) {
    const owner = await storage.get<KeyRecord>(KEY + input.keyHash)
    const host = existing.members.find((m) => m.id === existing.hostId)
    const invite = await storage.get<InviteRecord>(INVITE)
    const created = log.find((e) => e.type === 'room.created')
    const createdMode = created?.type === 'room.created' ? created.settleMode : undefined
    const same =
      owner?.memberId === existing.hostId &&
      existing.name === input.name &&
      existing.currency === input.currency &&
      host?.name === input.hostName &&
      (createdMode ?? settle.DEFAULT_SETTLE_MODE) === (input.settleMode ?? settle.DEFAULT_SETTLE_MODE) &&
      // Темп при создании (Р-35): logPace по одной записи room.created — без смен ведущим
      !!created &&
      samePace(pace.logPace([created]), roomPaceOf(input.pace))
    if (!same || !invite) return { ok: false, status: 409, error: REQUEST_TAKEN }
    return { ok: true, roomId: existing.id, memberId: existing.hostId, invite: invite.token }
  }
  const hostId = ulid(now)
  // Ключ и приглашение — до журнала: журнал есть — значит, комната создана целиком
  await storage.put<KeyRecord>(KEY + input.keyHash, { memberId: hostId, at: now })
  await storage.put<InviteRecord>(INVITE, { token: input.invite, at: now })
  await append(storage, [
    {
      id: ulid(now),
      at: now,
      memberId: hostId,
      type: 'room.created',
      roomId: input.roomId,
      name: input.name,
      currency: input.currency,
      // Режим «кто кому» (Р-32) — только если выбран: без поля — «по ставкам», как у старых комнат
      ...(input.settleMode !== undefined && { settleMode: input.settleMode }),
      // Темп (Р-35) — только если выбран, сроки — только у «своего»: без полей — обычный
      ...(input.pace !== undefined && paceFields(input.pace)),
    },
    { id: ulid(now), at: now, memberId: hostId, type: 'member.added', member: hostId, name: input.hostName },
  ])
  return { ok: true, roomId: input.roomId, memberId: hostId, invite: input.invite }
}

// Отказ комнаты; join — ключ заявки, которую ещё не впустили или отклонили (экран ожидания)
export type Failure = { ok: false; status: 400 | 403 | 404 | 409; error: string; join?: 'waiting' | 'rejected' }

// events, offers и lots — события, пари и лоты (Р-38) комнаты из журнала, cases — дела суда по ним (Р-25;
// статус на время ответа считает http.ts); transfers — записи о переводах, settleMode — режим «кто кому»
// (Р-32; свод на время ответа считает http.ts); pace — нынешний темп комнаты и его сроки (Р-35, logPace);
// choices — выборы комнаты (Р-39; статус и итог на время ответа считает http.ts)
export type StateResult =
  | {
      ok: true
      state: RoomState
      me: string
      events: EventState[]
      offers: OfferState[]
      lots: lot.LotState[]
      choices: choice.ChoiceState[]
      cases: CourtCase[]
      transfers: settle.TransferRecord[]
      settleMode: settle.SettleMode
      pace: pace.RoomPace
    }
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

// Состояние комнаты для владельца ключа (по хешу ключа). Сначала — суд по «ждёт суда» и жребий выбора
// при ничьей, если пора (drawDue): чтение комнаты тоже может дописать запись, один раз на суд и на
// выбор. seed — источник зёрен жребия (тесты подставляют своё)
export async function roomState(storage: RoomStorage, keyHash: string, now: number, seed: () => string = randomSeed): Promise<StateResult> {
  await drawDue(storage, now, seed)
  const c = await caller(storage, keyHash)
  if (!c.ok) return c
  const events = roomEvents(c.log)
  const offers = logOffers(c.log)
  const lots = lot.logLots(c.log)
  return {
    ok: true,
    state: c.state,
    me: c.me,
    events,
    offers,
    lots,
    choices: choice.logChoices(c.log),
    cases: appeal.logAppeals(c.log, { events, offers, lots }),
    transfers: logTransfers(c.log),
    settleMode: logSettleMode(c.log),
    pace: pace.logPace(c.log),
  }
}

// Суд по «ждёт суда» (Р-17, Р-25) собирается сам — будильника нет: при первом запросе к комнате после
// того, как исход пула перешёл в «ждёт суда», стороны пари срок молчания не сошлись на новом гаранте
// (Р-31) или стороны пари без гаранта разошлись либо одна молчит (Р-36), или победитель лота отметил
// «Не получил» (Р-38), — запись court.drawn (зерно, кандидаты на этот миг; автор — ведущий). Суд уже
// собран — второй записи нет; кандидатов нет — записи нет: у пула исход остаётся «ждёт суда» (выход —
// отмена ведущим с причиной, Р-19), у пари — «нужен другой гарант» (стороны по-прежнему могут сойтись на
// гаранте), у лота — «в споре» (пока одна сторона не уступит).
// Пари — на now (offerAt, Р-37): торг, кончившийся со встречным, принят — его соперник в суд не попадёт
export async function drawDueCourts(storage: RoomStorage, now: number, seed: () => string): Promise<void> {
  const log = await readLog(storage)
  const state = foldLog(log)
  if (!state) return
  const events = roomEvents(log)
  const offers = logOffers(log).map((o) => offerAt(o, now))
  const lots = lot.logLots(log)
  const cases = appeal.logAppeals(log, { events, offers, lots })
  const room = appeal.courtRoom(state)
  const targets: appeal.CourtTarget[] = [
    ...events.map((event) => ({ kind: 'event' as const, event })),
    ...offers.map((offer) => ({ kind: 'offer' as const, offer })),
    ...lots.map((l) => ({ kind: 'lot' as const, lot: l })),
  ]
  const entries: LogEntry[] = []
  for (const t of targets) {
    const target = t.kind === 'event' ? t.event.id : t.kind === 'offer' ? t.offer.id : t.lot.id
    if (appeal.checkCourtDraw(t, appeal.caseOf(cases, target), now)) continue
    const candidates = appeal.courtCandidates(t, room, now)
    if (candidates.length === 0) continue
    entries.push({ id: ulid(now), at: now, memberId: state.hostId, type: 'court.drawn', target, seed: seed(), candidates })
  }
  if (entries.length > 0) await append(storage, entries)
}

// Жребий выбора при ничьей (Р-39, зерно сервера — как у жребия суда, Р-25) бросается сам — будильника
// нет: при первом запросе к комнате после конца вкладов со всеми продлениями, если в конце ничья, —
// запись choice.drawn (зерно, равные варианты на этот миг; автор — ведущий). Жребий уже брошен — второй
// записи нет (choiceDrawOptions пусто); победителя по зерну считает правило drawChoice
export async function drawDueChoices(storage: RoomStorage, now: number, seed: () => string): Promise<void> {
  const log = await readLog(storage)
  const state = foldLog(log)
  if (!state) return
  const entries: LogEntry[] = []
  for (const c of choice.logChoices(log)) {
    const options = choice.choiceDrawOptions(c, now)
    if (options.length === 0) continue
    entries.push({ id: ulid(now), at: now, memberId: state.hostId, type: 'choice.drawn', choice: c.id, seed: seed(), options })
  }
  if (entries.length > 0) await append(storage, entries)
}

// Всё, что сервер дописывает сам перед запросом: суд по «ждёт суда», затем жребий выбора
async function drawDue(storage: RoomStorage, now: number, seed: () => string): Promise<void> {
  await drawDueCourts(storage, now, seed)
  await drawDueChoices(storage, now, seed)
}

// --- Копия комнаты (этап 6, Р-02; формат и проверка — src/rules/backup.ts)

export const ROOM_EXISTS = 'Комната уже есть — загрузка только в пустую'

export type BackupResult = { ok: true; backup: Backup } | Failure
export type RestoreResult = { ok: true; roomId: string; entries: number } | Failure

// Выгрузить комнату. keyHash — ключ участника: копия участника (только журнал; заявка и чужой ключ —
// отказы, как у чтения); null — полная копия (пароль компании проверил Worker). Ничего не пишет:
// суд по «ждёт суда» не собирается
export async function exportRoom(storage: RoomStorage, keyHash: string | null, now: number): Promise<BackupResult> {
  if (keyHash !== null) {
    const c = await caller(storage, keyHash)
    if (!c.ok) return c
    return { ok: true, backup: { format: BACKUP_FORMAT, roomId: c.state.id, exportedAt: now, log: c.log } }
  }
  const log = await readLog(storage)
  const state = foldLog(log)
  if (!state) return fail(404, NO_ROOM)
  // Служебные записи — как хранятся: хеши ключей и ссылок, приглашение, секрет; новых секретов нет
  const store: Record<string, unknown> = {}
  for (const k of [INVITE, SECRET]) {
    const v = await storage.get(k)
    if (v !== undefined) store[k] = v
  }
  for (const prefix of [KEY, DEVICE]) for (const [k, v] of await storage.list({ prefix })) store[k] = v
  return { ok: true, backup: { format: BACKUP_FORMAT, roomId: state.id, exportedAt: now, log, store } }
}

// Загрузить полную копию (уже проверенную checkBackup) — только в пустую комнату: в хранилище нет ни
// одной записи. Служебные записи — до журнала (журнал есть — значит, комната поднята целиком, как у
// создания); журнал пишется как есть, по порядку (Р-11)
export async function importRoom(storage: RoomStorage, backup: Backup): Promise<RestoreResult> {
  if ((await storage.list({ prefix: '' })).size > 0) return fail(409, ROOM_EXISTS)
  for (const [k, v] of Object.entries(backup.store ?? {})) await storage.put(k, v)
  await append(storage, backup.log)
  return { ok: true, roomId: backup.roomId, entries: backup.log.length }
}

// Запись реестра комнат (Cloudflare, registry.ts): номер и миг создания
export type RegistryEntry = { roomId: string; createdAt: number }

// Отметить комнату в реестре один раз: уже отмечена (пометка registry) или комнаты нет — ничего;
// иначе — вызов реестра и пометка. Новая комната — сразу после создания или загрузки, старая — при
// первом запросе после выкатки. Реестр упал — пометки нет, следующий запрос попробует снова
export async function registerOnce(storage: RoomStorage, register: (entry: RegistryEntry) => Promise<void>, now: number): Promise<void> {
  if ((await storage.get(REGISTERED)) !== undefined) return
  const state = foldLog(await readLog(storage))
  if (!state) return
  await register({ roomId: state.id, createdAt: state.createdAt })
  await storage.put(REGISTERED, { at: now })
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
  | {
      type: 'counterOffer'
      keyHash: string
      offer: string
      odds: Odds | null
      amount: number | null
      closesAt: number
      guarantor?: string // выбор автора встречного (Р-36); нет — гарант исходного
      noGuarantor?: boolean
      requestId: string
    }
  | { type: 'acceptOffer'; keyHash: string; offer: string; requestId: string }
  | { type: 'revokeOffer'; keyHash: string; offer: string; requestId: string }
  // Торг (Р-37): встречное — сколько ставит против суммы автора; «принять сейчас» — автор берёт лучшее
  | { type: 'bidOffer'; keyHash: string; offer: string; amount: number; requestId: string }
  | { type: 'takeBid'; keyHash: string; offer: string; requestId: string }
  // Исход пари (Р-23): фазы — по времени сервера в момент запроса (будильника нет)
  | { type: 'markOffer'; keyHash: string; offer: string; winner: OfferSide; requestId: string }
  | { type: 'decideOffer'; keyHash: string; offer: string; winner: OfferSide; requestId: string }
  | { type: 'declineOffer'; keyHash: string; offer: string; requestId: string }
  | { type: 'nominateGuarantor'; keyHash: string; offer: string; guarantor: string; requestId: string }
  // Лот (Р-38): форма уже проверена (lot.ts, checkLotInput); конец торга — здесь, по времени сервера.
  // Отметки — «Снять лот», «Передал», «Не смогу передать», «Получил», «Не получил»
  | { type: 'createLot'; keyHash: string; input: lot.LotInput; requestId: string }
  | { type: 'bidLot'; keyHash: string; lot: string; amount: number; requestId: string }
  | { type: 'markLot'; keyHash: string; lot: string; mark: LotMark; requestId: string }
  // Выбор (Р-39): форма — как прислана (её и получателя проверяет checkChoiceInput здесь: нужны участники);
  // сроки — по времени сервера. Вариант — название как прислано; вклад — в какой вариант, сколько
  | { type: 'createChoice'; keyHash: string; form: ChoiceForm; requestId: string }
  | { type: 'addChoiceOption'; keyHash: string; choice: string; title: unknown; requestId: string }
  | { type: 'stakeChoice'; keyHash: string; choice: string; option: string; amount: number; requestId: string }
  // Апелляция и суд (Р-25) у события-пул (kind: 'event') и пари ('offer'), суд по «Не получил» у лота
  // ('lot', Р-38; апелляции нет): правила — appeal.ts, на время сервера в момент запроса. Зерно жребия при
  // подаче — из источника seed у act
  | { type: 'appealOutcome'; keyHash: string; kind: CourtKind; target: string; reason: string; requestId: string }
  | { type: 'joinAppeal'; keyHash: string; kind: CourtKind; target: string; requestId: string }
  | { type: 'judgeCourt'; keyHash: string; kind: CourtKind; target: string; vote: CourtVerdict; requestId: string }
  | { type: 'replaceJuror'; keyHash: string; kind: CourtKind; target: string; member: string; reason: string; requestId: string }
  // Расчёт (Р-32): правила — settle.ts. «Перевёл» (кому) и «Получил» сам (от кого); ответ на перевод —
  // «Получил», «Не получал», отмена своей отметки; смена режима «кто кому» — ведущий
  | { type: 'sendTransfer'; keyHash: string; to: string; amount: number; requestId: string }
  | { type: 'receiveTransfer'; keyHash: string; from: string; amount: number; requestId: string }
  | { type: 'answerTransfer'; keyHash: string; transfer: string; answer: TransferAnswer; requestId: string }
  | { type: 'setSettleMode'; keyHash: string; mode: settle.SettleMode; requestId: string }
  // Темп комнаты (Р-35): правила — pace.ts; форма уже проверена (checkPace); меняет ведущий
  | { type: 'setPace'; keyHash: string; pace: pace.PaceInput; requestId: string }

export type CourtKind = appeal.CourtTarget['kind']

// Форма выбора из тела запроса: поля как присланы
export type ChoiceForm = Parameters<typeof choice.checkChoiceInput>[0]

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
  bidOffer: { bid: OfferBidAct; offer: OfferInfo }
  takeBid: { taken: OfferTakeAct; offer: OfferInfo }
  markOffer: { marked: OfferWinnerAct }
  decideOffer: { decided: OfferWinnerAct }
  declineOffer: { declined: OfferAct }
  nominateGuarantor: { nominated: OfferAct & { guarantor: string } }
  createLot: { lot: LotView }
  bidLot: { bid: LotBidAct; lot: LotView }
  markLot: { marked: LotMarkAct; lot: LotView }
  createChoice: { choice: ChoiceView }
  addChoiceOption: { option: ChoiceOptionAct; choice: ChoiceView }
  stakeChoice: { stake: ChoiceStakeAct; choice: ChoiceView }
  appealOutcome: { appeal: AppealResponse['appeal'] }
  joinAppeal: { joined: JoinAppealResponse['joined'] }
  judgeCourt: { voted: JudgeResponse['voted'] }
  replaceJuror: { replaced: ReplaceJurorResponse['replaced'] }
  sendTransfer: { transfer: settle.Transfer }
  receiveTransfer: { transfer: settle.Transfer }
  answerTransfer: { transfer: settle.Transfer }
  setSettleMode: { settleMode: SettleModeResponse['settleMode'] }
  setPace: { pace: PaceResponse['pace'] }
}

export type ActionType = RoomAction['type']
export type ActionResult<K extends ActionType = ActionType> = { ok: true; value: ActionValues[K] } | Failure

function ok<V>(value: V): { ok: true; value: V } {
  return { ok: true, value }
}

// Одно действие комнаты; объект Room (и очередь Node-обёртки) вызывает их по одному. Сначала — суд по
// «ждёт суда» и жребий выбора, если пора (drawDue). seed — источник зёрен жребия (тесты подставляют своё)
export async function act<K extends ActionType>(
  storage: RoomStorage,
  action: Extract<RoomAction, { type: K }>,
  now: number,
  seed: () => string = randomSeed,
): Promise<ActionResult<K>> {
  const a = action as RoomAction
  await drawDue(storage, now, seed)
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
    case 'bidOffer':
      r = await bidOffer(storage, a, now)
      break
    case 'takeBid':
      r = await takeBid(storage, a, now)
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
    case 'createLot':
      r = await createLot(storage, a, now)
      break
    case 'bidLot':
      r = await bidLot(storage, a, now)
      break
    case 'markLot':
      r = await markLot(storage, a, now)
      break
    case 'createChoice':
      r = await createChoice(storage, a, now)
      break
    case 'addChoiceOption':
      r = await addChoiceOption(storage, a, now)
      break
    case 'stakeChoice':
      r = await stakeChoice(storage, a, now)
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
    case 'sendTransfer':
      r = await newTransfer(storage, { keyHash: a.keyHash, kind: 'send', party: a.to, amount: a.amount, requestId: a.requestId }, now)
      break
    case 'receiveTransfer':
      r = await newTransfer(storage, { keyHash: a.keyHash, kind: 'receive', party: a.from, amount: a.amount, requestId: a.requestId }, now)
      break
    case 'answerTransfer':
      r = await answerTransfer(storage, a, now)
      break
    case 'setSettleMode':
      r = await setSettleMode(storage, a, now)
      break
    case 'setPace':
      r = await setPace(storage, a, now)
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
  // Событие с предметом — с признаком правила предмета (Р-26); без предмета признак не нужен
  const rule = input.subject !== null
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
      ...(rule && { subjectRule: 1 as const }),
      // Сроки нынешнего темпа комнаты (Р-35) — у каждого нового события, и у обычного: смена темпа потом их не трогает
      times: { ...pace.logPace(c.log).times },
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
      subjectRule: rule,
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
// запроса — даже если в срок сервер лежал, — или досрочным предложением исхода, навсегда (Р-27).
// Повтор с тем же номером — та же ставка и тот же ответ
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
  if (status === 'closed') return fail(409, event.closedAt !== null ? BETS_CLOSED_PROPOSED : BETS_CLOSED)
  if (!event.outcomes.some((o) => o.id === a.outcome)) return fail(400, NO_OUTCOME)
  // Предмет спора — только на «Да», в событии со своими исходами — никак (Р-26; у старых событий — без правила)
  const subject = subjectBetError(event, c.me, a.outcome)
  if (subject) return fail(403, subject)
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

// Отказ отмены «не вам» — 403; «уже не то состояние» (окончательный, суд) — 409; без причины — 400
const CANCEL_FORBIDDEN: readonly string[] = [CANCEL_AUTHOR_HOST, CANCEL_OTHERS_BETS, CANCEL_HOST_INVOLVED]

// Отмена — по checkCancel (Р-29): окончательный исход и идущий суд — никто; чужих ставок нет — автор
// или ведущий без причины; есть — только ведущий, сам не ставивший и не предмет спора, с причиной.
// Уже отменено — та же отмена без новой записи. Ставки возвращаются (eventRefunds)
async function cancelEvent(
  storage: RoomStorage,
  a: { keyHash: string; event: string; reason: string | null },
  now: number,
): Promise<ActionResult<'cancelEvent'>> {
  const c = await eventCaller(storage, a.keyHash, a.event)
  if (!c.ok) return c
  if (c.event.cancelled) return ok({ cancelled: c.event.cancelled })
  // Дело суда — только по этому событию
  const court = appeal.caseOf(appeal.logAppeals(c.log, { events: [c.event], offers: [] }), c.event.id)
  const error = checkCancel(c.event, eventOutcome(c.event, now, court), c.me, c.state.hostId, a.reason)
  if (error) return fail(error === NEED_REASON ? 400 : CANCEL_FORBIDDEN.includes(error) ? 403 : 409, error)
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

// Предложить исход: автор события (не предмет спора); автор — предмет или молчит 3 дня после
// «исход ожидается к» — ведущий; событие ведущего о себе — любой, кроме него (Р-19). До «приём до» —
// досрочно: приём закрывается в миг предложения навсегда (Р-27). Одно предложение на событие:
// первое; снято «ещё не известно» — можно снова (Р-27)
async function proposeOutcome(storage: RoomStorage, a: OutcomeAction, now: number): Promise<ActionResult<'proposeOutcome'>> {
  const c = await outcomeCaller(storage, a.keyHash)
  if (!c.ok) return c
  const proposals = (e: EventState) => eventRounds(e).flatMap((r) => (r.proposal ? [r.proposal] : []))
  const again = repeated(c.events, proposals, a.requestId, (e, x) => e.id === a.event && x.by === c.me && x.outcome === a.outcome)
  if (again) return again.ok ? ok({ proposal: markOut(again.value) }) : again
  const live = liveEvent(c.events, a.event)
  if (!live.ok) return live
  const { event } = live
  if (event.proposal && withdrawnAt(event, now) === null) return fail(409, ALREADY_PROPOSED)
  if (c.me === event.subjectId) return fail(403, SUBJECT_SILENT)
  if (!mayPropose(event, c.me, now)) return fail(403, proposerOnly(event))
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
  const objections = (e: EventState) => eventRounds(e).flatMap((r) => r.objections)
  const again = repeated(c.events, objections, a.requestId, (e, x) => e.id === a.event && x.by === c.me && x.reason === a.reason)
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
  if (view?.status === 'withdrawn') return fail(409, PROPOSAL_WITHDRAWN)
  if (view && now >= view.objectionUntil) return fail(409, objectionOver(event))
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
  const agreements = (e: EventState) => eventRounds(e).flatMap((r) => r.agreements)
  const again = repeated(c.events, agreements, a.requestId, (e, x) => e.id === a.event && x.by === c.me)
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
  if (view && now >= view.objectionUntil) return fail(409, objectionOver(event))
  if (view?.approved) return fail(409, ALREADY_APPROVED)
  const agreement: Agreement = { id: ulid(now), at: now, by: c.me }
  await append(storage, [{ id: agreement.id, at: now, memberId: c.me, type: 'outcome.agreed', event: event.id, requestId: a.requestId }])
  return ok({ agreement })
}

// Исход для решения ведущего и голоса: исход события; по досрочному предложению — ещё и «ещё не
// известно» (NOT_YET, Р-27)
function decisionChoice(event: EventState, outcome: string): boolean {
  return event.outcomes.some((o) => o.id === outcome) || (outcome === NOT_YET && earlyProposal(event))
}

// Решение ведущего после возражения: любой исход события (по досрочному — и «ещё не известно»);
// только если ведущий не ставил и не предмет спора (иначе — голосование). Одно решение на предложение
async function decideOutcome(storage: RoomStorage, a: OutcomeAction, now: number): Promise<ActionResult<'decideOutcome'>> {
  const c = await outcomeCaller(storage, a.keyHash)
  if (!c.ok) return c
  const decisions = (e: EventState) => eventRounds(e).flatMap((r) => (r.decision ? [r.decision] : []))
  const again = repeated(c.events, decisions, a.requestId, (e, x) => e.id === a.event && x.by === c.me && x.outcome === a.outcome)
  if (again) return again.ok ? ok({ decision: markOut(again.value) }) : again
  const live = liveEvent(c.events, a.event)
  if (!live.ok) return live
  const { event } = live
  if (c.me !== c.state.hostId) return fail(403, HOST_ONLY)
  if (event.objections.length === 0) return fail(409, NO_OBJECTION)
  if (!hostDecides(event)) return fail(403, HOST_INTERESTED)
  if (event.decision) return fail(409, ALREADY_DECIDED)
  if (!decisionChoice(event, a.outcome)) return fail(400, NO_OUTCOME)
  const decision: OutcomeMark = { id: ulid(now), at: now, by: c.me, outcome: a.outcome }
  await append(storage, [{ id: decision.id, at: now, memberId: c.me, type: 'outcome.decided', event: event.id, outcome: a.outcome, requestId: a.requestId }])
  return ok({ decision })
}

// Голос: ведущий ставил или он предмет спора — после возражения голосуют не ставившие и не предмет
// (участники на миг первого возражения); 72 часа или пока не проголосуют все; голос — один; по
// досрочному предложению — и за «ещё не известно» (Р-27)
async function voteOutcome(storage: RoomStorage, a: OutcomeAction, now: number): Promise<ActionResult<'voteOutcome'>> {
  const c = await outcomeCaller(storage, a.keyHash)
  if (!c.ok) return c
  const votes = (e: EventState) => eventRounds(e).flatMap((r) => r.votes)
  const again = repeated(c.events, votes, a.requestId, (e, x) => e.id === a.event && x.by === c.me && x.outcome === a.outcome)
  if (again) return again.ok ? ok({ vote: markOut(again.value) }) : again
  const live = liveEvent(c.events, a.event)
  if (!live.ok) return live
  const { event } = live
  if (event.objections.length === 0) return fail(409, NO_OBJECTION)
  if (hostDecides(event)) return fail(409, NO_VOTING)
  if (!eventVoters(event).includes(c.me)) return fail(403, VOTERS_ONLY)
  if (event.votes.some((v) => v.by === c.me)) return fail(409, ALREADY_VOTED)
  if (eventOutcome(event, now)?.status !== 'voting') return fail(409, VOTING_OVER)
  if (!decisionChoice(event, a.outcome)) return fail(400, NO_OUTCOME)
  const vote: OutcomeMark = { id: ulid(now), at: now, by: c.me, outcome: a.outcome }
  await append(storage, [{ id: vote.id, at: now, memberId: c.me, type: 'outcome.voted', event: event.id, outcome: a.outcome, requestId: a.requestId }])
  return ok({ vote })
}

// --- Пари (Р-22). Правила — offer.ts; сроки — по времени сервера в момент запроса (будильника нет:
// статус «истекло» считается, не записывается). Повтор с тем же номером запроса — тот же ответ без
// новой записи (и после сроков); тот же номер с другим содержимым или от другого — 409

type OfferCaller = Caller & { offers: OfferState[]; roles: RoomRoles; again: OfferEntry | undefined }

// Пари — на now (offerAt, Р-37): торг, кончившийся со встречным, уже принят — так его видят и проверки
// без времени (checkMark, checkWithdraw, sideOf)
async function offerCaller(storage: RoomStorage, keyHash: string, requestId: string, now: number): Promise<OfferCaller | Failure> {
  const c = await caller(storage, keyHash)
  if (!c.ok) return c
  const again = c.log.find((e): e is OfferEntry => isOfferEntry(e) && e.requestId === requestId)
  return { ...c, offers: logOffers(c.log).map((o) => offerAt(o, now)), roles: roomRoles(c.state), again }
}

// Отказ правил пари: «не вам» — 403, «уже не то состояние» — 409, кривое тело — 400; истекло —
// «Приём закрыт». Торг (Р-37): автор, гарант и предмет не на своей стороне не торгуются, «принять
// сейчас» — только автор (403); кривая сумма — 400; меньше старта или шага — 409 (лучшее могли перебить,
// пока телефон отправлял); торг кончился — 409 «Торг закончен»
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
  SUBJECT_TAKES,
  OWN_BID,
  GUARANTOR_BIDS,
  SUBJECT_BIDS,
  ONLY_AUTHOR_TAKES,
]
const OFFER_BAD_BODY: readonly string[] = [BAD_MARK, BAD_GUARANTOR, SUBJECT_GUARANTOR, NO_GUARANTOR_CHOSEN, BAD_BID, BANK_TOO_BIG]

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
  const subject = checkOfferSubject(input, c.me, c.roles)
  if (subject) return fail(400, subject)
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
    // О ком спор (Р-26) — только если задан: у пари ни о ком поля нет, как до выкатки
    ...(input.subject !== null && { subject: input.subject }),
    // Правило гаранта (Р-31) — у всех новых пари, встречных тоже: часы гаранта с «исход к», суд без гаранта
    guarantorRule: 1,
    // Сроки нынешнего темпа комнаты (Р-35) — у всех новых пари, встречных тоже, и у обычного
    times: { ...pace.logPace(c.log).times },
    // «Торг до …» (Р-37) — только у торга: у обычного пари поля нет
    ...(input.auction && { auction: { start: input.auction.start, step: input.auction.step } }),
    requestId,
  }
  await append(storage, [entry])
  const created = logOffers([...c.log, entry]).find((o) => o.id === entry.id)
  return created ? ok({ offer: offerInfo(created) }) : fail(409, NO_OFFER)
}

// Предложить пари: любой участник; адресное — другому участнику, открытое — всем. Гарант не выбран —
// ведущий (ведущий — сторона — отказ); «без гаранта» (Р-36) — guarantor null, если судить есть кому
// (offerGuarantor). «Приём до» прошёл — 409. Торг (Р-37): input.auction — старт и шаг, closesAt — конец
// торга (checkOfferTimes: от 10 минут до 3 дней, 400)
async function createOffer(
  storage: RoomStorage,
  a: { keyHash: string; input: OfferInput; requestId: string },
  now: number,
): Promise<ActionResult<'createOffer'>> {
  const c = await offerCaller(storage, a.keyHash, a.requestId, now)
  if (!c.ok) return c
  const { input } = a
  if (c.again) {
    return repeatedOffer(
      c,
      (e) =>
        e.counterTo === null &&
        sameTerms(e, input) &&
        e.auction?.start === input.auction?.start &&
        e.auction?.step === input.auction?.step &&
        e.condition === input.condition &&
        e.check === input.check &&
        e.side === input.side &&
        e.to === input.to &&
        e.expectedAt === input.expectedAt &&
        (e.subject ?? null) === input.subject &&
        e.guarantor === (input.noGuarantor ? null : (input.guarantor ?? c.state.hostId)),
    )
  }
  return writeOffer(storage, c, input, null, a.requestId, now)
}

// Встречное: новое пари автору исходного со своими кэфом, суммой и «приём до» (counterInput); делает
// тот, кто мог бы принять исходное. Автор принял встречное — исходное закрыто встречным (roomOffers).
// Гарант — выбор автора встречного (Р-36): guarantor, noGuarantor или, не выбрал, — гарант исходного
async function counterOffer(
  storage: RoomStorage,
  a: {
    keyHash: string
    offer: string
    odds: Odds | null
    amount: number | null
    closesAt: number
    guarantor?: string
    noGuarantor?: boolean
    requestId: string
  },
  now: number,
): Promise<ActionResult<'counterOffer'>> {
  const c = await offerCaller(storage, a.keyHash, a.requestId, now)
  if (!c.ok) return c
  const original = c.offers.find((o) => o.id === a.offer)
  const terms = original && {
    odds: a.odds ?? original.odds,
    amount: a.amount ?? original.amount,
    closesAt: a.closesAt,
    ...(a.guarantor !== undefined && { guarantor: a.guarantor }),
    ...(a.noGuarantor === true && { noGuarantor: true }),
  }
  const input = original && terms && counterInput(original, terms)
  if (c.again) return repeatedOffer(c, (e) => e.counterTo === a.offer && !!input && sameTerms(e, input) && e.guarantor === (input.noGuarantor ? null : input.guarantor))
  if (!original || !input) return fail(404, NO_OFFER)
  const refused = checkCounter(original, c.me, c.roles, now)
  if (refused) return offerRefusal(refused)
  const checked = checkOfferInput(input)
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
  const c = await offerCaller(storage, a.keyHash, a.requestId, now)
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

// Отозвать: только автор, пока не принято и не закрыто встречным; торг (Р-37) — пока нет встречных
async function revokeOffer(
  storage: RoomStorage,
  a: { keyHash: string; offer: string; requestId: string },
  now: number,
): Promise<ActionResult<'revokeOffer'>> {
  const c = await offerCaller(storage, a.keyHash, a.requestId, now)
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

// --- Торг (Р-37). Правила — checkBid / checkTakeBid (offer.ts) на время сервера в момент запроса;
// продление, конец торга и принятие лучшего к концу — свёртка и offerAt: будильника и записи о конце нет.
// Ответ — действие и условия пари после него (takerAmount — лучшее встречное); ход торга — в ответе
// комнаты (bidding)

// Встречное в торге: amount — сколько ставит против суммы автора; первое — не меньше старта, дальше —
// больше лучшего хотя бы на шаг; не автор, не гарант, предмет — только на своей стороне
async function bidOffer(
  storage: RoomStorage,
  a: { keyHash: string; offer: string; amount: number; requestId: string },
  now: number,
): Promise<ActionResult<'bidOffer'>> {
  const c = await offerCaller(storage, a.keyHash, a.requestId, now)
  if (!c.ok) return c
  const o = c.offers.find((x) => x.id === a.offer)
  if (c.again) {
    const e = c.again
    return e.type === 'offer.bid' && e.offer === a.offer && e.memberId === c.me && e.amount === a.amount && o
      ? ok({ bid: { ...actOf(e), amount: e.amount }, offer: offerInfo(o) })
      : fail(409, REQUEST_USED)
  }
  if (!o) return fail(404, NO_OFFER)
  const refused = checkBid(o, c.me, a.amount, c.roles, now)
  if (refused) return offerRefusal(refused)
  const entry = { id: ulid(now), at: now, memberId: c.me, type: 'offer.bid', offer: o.id, amount: a.amount, requestId: a.requestId } as const
  await append(storage, [entry])
  const after = logOffers([...c.log, entry]).find((x) => x.id === o.id)
  return after ? ok({ bid: { ...actOf(entry), amount: entry.amount }, offer: offerInfo(after) }) : fail(409, NO_OFFER)
}

// «Принять сейчас»: автор берёт лучшее встречное в любой миг торга — торг закончен, пари принято
// (bid — каким встречным)
async function takeBid(
  storage: RoomStorage,
  a: { keyHash: string; offer: string; requestId: string },
  now: number,
): Promise<ActionResult<'takeBid'>> {
  const c = await offerCaller(storage, a.keyHash, a.requestId, now)
  if (!c.ok) return c
  const o = c.offers.find((x) => x.id === a.offer)
  if (c.again) {
    const e = c.again
    const best = o?.auction && o.auction.taken === 'now' ? bestBid(o.auction) : null
    return e.type === 'offer.bid-accepted' && e.offer === a.offer && e.memberId === c.me && o && best
      ? ok({ taken: { ...actOf(e), bid: best.id }, offer: offerInfo(o) })
      : fail(409, REQUEST_USED)
  }
  if (!o) return fail(404, NO_OFFER)
  const refused = checkTakeBid(o, c.me, now)
  if (refused) return offerRefusal(refused)
  // checkTakeBid пропустил — торг и лучшее встречное есть
  const best = o.auction && bestBid(o.auction)
  if (!best) return fail(409, NO_OFFER)
  const entry = { id: ulid(now), at: now, memberId: c.me, type: 'offer.bid-accepted', offer: o.id, requestId: a.requestId } as const
  await append(storage, [entry])
  return ok({ taken: { ...actOf(entry), bid: best.id }, offer: offerInfo(o) })
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
  const c = await offerCaller(storage, a.keyHash, a.requestId, now)
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
  const c = await offerCaller(storage, a.keyHash, a.requestId, now)
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
  const c = await offerCaller(storage, a.keyHash, a.requestId, now)
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
  const c = await offerCaller(storage, a.keyHash, a.requestId, now)
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

// --- Лот (Р-38). Правила — checkLotTimes / checkLotBid / checkLotWithdraw / checkHanded / checkDeclined /
// checkReceived / checkDisputed и свёртка logLots (lot.ts) на время сервера в момент запроса; конец торга,
// продление, победитель, молчание и итог — считаются, записи о них нет. Суд по «Не получил» собирает
// drawDueCourts. Повтор с тем же номером запроса — тот же ответ без новой записи (лот — каким он сейчас);
// тот же номер у другого действия, лота, содержимого или от другого — 409

type LotCaller = Caller & { lots: lot.LotState[]; room: lot.LotRoom; again: LogEntry | undefined }

async function lotCaller(storage: RoomStorage, keyHash: string, requestId: string): Promise<LotCaller | Failure> {
  const c = await caller(storage, keyHash)
  if (!c.ok) return c
  const room = { members: c.state.members.map((m) => m.id) }
  return { ...c, lots: lot.logLots(c.log), room, again: byRequest(c.log, requestId) }
}

// Отказ правил лота: «не вам» — 403, кривая сумма — 400, «уже не то состояние» — 409 (и ставка меньше
// старта или шага: лучшую могли перебить, пока телефон отправлял)
const LOT_FORBIDDEN: readonly string[] = [lot.OWN_LOT, lot.NOT_MEMBER, lot.ONLY_SELLER, lot.ONLY_WINNER]

function lotRefusal(error: string): Failure {
  if (error === lot.BAD_LOT_BID) return fail(400, error)
  return fail(LOT_FORBIDDEN.includes(error) ? 403 : 409, error)
}

// Лот из журнала на now — с судом по нему (свёртке суда нужен лишь он)
function lotOut(log: readonly LogEntry[], id: string, now: number): LotView | null {
  const l = lot.logLots(log).find((x) => x.id === id)
  if (!l) return null
  const court = appeal.caseOf(appeal.logAppeals(log, { events: [], offers: [], lots: [l] }), id)
  return lot.lotView(l, now, court)
}

function lotReply<V extends object>(log: readonly LogEntry[], id: string, now: number, value: V): { ok: true; value: V & { lot: LotView } } | Failure {
  const view = lotOut(log, id, now)
  return view ? ok({ ...value, lot: view }) : fail(404, NO_LOT)
}

type LotCreatedEntry = Extract<LogEntry, { type: 'lot.created' }>
type LotBidEntry = Extract<LogEntry, { type: 'lot.bid' }>

function sameLot(e: LotCreatedEntry, x: lot.LotInput): boolean {
  return e.title === x.title && e.description === x.description && e.start === x.start && e.step === x.step && e.closesAt === x.closesAt
}

// Выставить лот: любой участник — продавец; конец торга — от 10 минут до 3 дней с создания по времени
// сервера (400). Сроки нынешнего темпа комнаты (Р-35) — в запись: молчание и суд лота — по ним
async function createLot(
  storage: RoomStorage,
  a: { keyHash: string; input: lot.LotInput; requestId: string },
  now: number,
): Promise<ActionResult<'createLot'>> {
  const c = await lotCaller(storage, a.keyHash, a.requestId)
  if (!c.ok) return c
  const { input } = a
  if (c.again) {
    const e = c.again
    return e.type === 'lot.created' && e.memberId === c.me && sameLot(e, input) ? lotReply(c.log, e.id, now, {}) : fail(409, REQUEST_USED)
  }
  const late = lot.checkLotTimes(input, now)
  if (late) return fail(400, late)
  const entry: LotCreatedEntry = {
    id: ulid(now),
    at: now,
    memberId: c.me,
    type: 'lot.created',
    title: input.title,
    description: input.description,
    start: input.start,
    step: input.step,
    closesAt: input.closesAt,
    times: { ...pace.logPace(c.log).times },
    requestId: a.requestId,
  }
  await append(storage, [entry])
  return lotReply([...c.log, entry], entry.id, now, {})
}

function lotBidAct(e: LotBidEntry): LotBidAct {
  return { id: e.id, at: e.at, by: e.memberId, lot: e.lot, amount: e.amount }
}

// Ставка: участник, не продавец, до конца торга (с продлениями); первая — не меньше старта, следующая —
// больше лучшей хотя бы на шаг. Не отзывается; ответ — ставка и лот после неё
async function bidLot(
  storage: RoomStorage,
  a: { keyHash: string; lot: string; amount: number; requestId: string },
  now: number,
): Promise<ActionResult<'bidLot'>> {
  const c = await lotCaller(storage, a.keyHash, a.requestId)
  if (!c.ok) return c
  if (c.again) {
    const e = c.again
    return e.type === 'lot.bid' && e.lot === a.lot && e.memberId === c.me && e.amount === a.amount
      ? lotReply(c.log, a.lot, now, { bid: lotBidAct(e) })
      : fail(409, REQUEST_USED)
  }
  const l = c.lots.find((x) => x.id === a.lot)
  if (!l) return fail(404, NO_LOT)
  const refused = lot.checkLotBid(l, c.me, a.amount, c.room, now)
  if (refused) return lotRefusal(refused)
  const entry: LotBidEntry = { id: ulid(now), at: now, memberId: c.me, type: 'lot.bid', lot: l.id, amount: a.amount, requestId: a.requestId }
  await append(storage, [entry])
  return lotReply([...c.log, entry], l.id, now, { bid: lotBidAct(entry) })
}

// Отметки по лоту: запись журнала и проверка правил на время сервера
type LotMarkEntry = Extract<LogEntry, { type: 'lot.withdrawn' | 'lot.handed' | 'lot.declined' | 'lot.received' | 'lot.disputed' }>
const LOT_MARKS: Record<LotMark, { type: LotMarkEntry['type']; check: (l: lot.LotState, memberId: string, now: number) => string | null }> = {
  withdrawn: { type: 'lot.withdrawn', check: lot.checkLotWithdraw },
  handed: { type: 'lot.handed', check: lot.checkHanded },
  declined: { type: 'lot.declined', check: lot.checkDeclined },
  received: { type: 'lot.received', check: lot.checkReceived },
  disputed: { type: 'lot.disputed', check: lot.checkDisputed },
}

function lotMarkAct(e: LotMarkEntry, mark: LotMark): LotMarkAct {
  return { id: e.id, at: e.at, by: e.memberId, lot: e.lot, mark }
}

// «Снять лот» — продавец, пока ставок нет; после торга: продавец — «Передал» / «Не смогу передать»,
// победитель — «Получил» / «Не получил» (после «Передал» или когда со дня конца прошёл срок молчания).
// Ответ — отметка и лот после неё; суд по «Не получил» собирается при следующем запросе к комнате
async function markLot(
  storage: RoomStorage,
  a: { keyHash: string; lot: string; mark: LotMark; requestId: string },
  now: number,
): Promise<ActionResult<'markLot'>> {
  const c = await lotCaller(storage, a.keyHash, a.requestId)
  if (!c.ok) return c
  const rule = LOT_MARKS[a.mark]
  if (c.again) {
    const e = c.again
    return e.type === rule.type && (e as LotMarkEntry).lot === a.lot && e.memberId === c.me
      ? lotReply(c.log, a.lot, now, { marked: lotMarkAct(e as LotMarkEntry, a.mark) })
      : fail(409, REQUEST_USED)
  }
  const l = c.lots.find((x) => x.id === a.lot)
  if (!l) return fail(404, NO_LOT)
  const refused = rule.check(l, c.me, now)
  if (refused) return lotRefusal(refused)
  const entry = { id: ulid(now), at: now, memberId: c.me, type: rule.type, lot: l.id, requestId: a.requestId } as LotMarkEntry
  await append(storage, [entry])
  return lotReply([...c.log, entry], l.id, now, { marked: lotMarkAct(entry, a.mark) })
}

// --- Выбор (Р-39). Правила — checkChoiceInput / checkChoiceTimes / checkChoiceOption / checkChoiceStake и
// свёртка logChoices (choice.ts) на время сервера в момент запроса; конец с продлениями, победитель, итог
// и долги — считаются, записи о них нет. Жребий при ничьей пишет drawDueChoices. Повтор с тем же номером
// запроса — тот же ответ без новой записи (выбор — каким он сейчас); тот же номер у другого действия,
// выбора, содержимого или от другого — 409

type ChoiceCaller = Caller & { choices: choice.ChoiceState[]; room: choice.ChoiceRoom; again: LogEntry | undefined }

async function choiceCaller(storage: RoomStorage, keyHash: string, requestId: string): Promise<ChoiceCaller | Failure> {
  const c = await caller(storage, keyHash)
  if (!c.ok) return c
  const room = { hostId: c.state.hostId, members: c.state.members.map((m) => m.id) }
  return { ...c, choices: choice.logChoices(c.log), room, again: byRequest(c.log, requestId) }
}

// Отказ правил выбора: «не вам» — 403; кривое название, сумма или вариант — 400; «уже не та фаза» и
// прочее состояние — 409 (вклады могли кончиться, вариант — появиться, пока телефон отправлял)
const CHOICE_BAD: readonly string[] = [choice.NEED_OPTION, choice.LONG_OPTION, choice.BAD_STAKE, choice.NO_OPTION]

function choiceRefusal(error: string): Failure {
  if (error === choice.NOT_MEMBER) return fail(403, error)
  return fail(CHOICE_BAD.includes(error) ? 400 : 409, error)
}

function choiceReply<V extends object>(
  log: readonly LogEntry[],
  id: string,
  now: number,
  value: V,
): { ok: true; value: V & { choice: ChoiceView } } | Failure {
  const c = choice.logChoices(log).find((x) => x.id === id)
  return c ? ok({ ...value, choice: choice.choiceView(c, now) }) : fail(404, NO_CHOICE)
}

type ChoiceCreatedEntry = Extract<LogEntry, { type: 'choice.created' }>
type ChoiceOptionEntry = Extract<LogEntry, { type: 'choice.option' }>
type ChoiceStakeEntry = Extract<LogEntry, { type: 'choice.stake' }>

function sameChoice(e: ChoiceCreatedEntry, x: choice.ChoiceInput): boolean {
  return (
    e.question === x.question &&
    e.options.length === x.options.length &&
    e.options.every((t, i) => t === x.options[i]) &&
    e.recipient === x.recipient &&
    e.cashbox === x.cashbox &&
    e.optionsUntil === x.optionsUntil &&
    e.closesAt === x.closesAt
  )
}

// Завести выбор: любой участник — автор; форма и получатель — checkChoiceInput (400); «варианты до» — не
// раньше чем через 10 минут, «вклады до» — через 10 минут после них и не позже 3 дней с создания по
// времени сервера (400). Сроки постоянные (решение), не темпа: times в запись не идут
async function createChoice(
  storage: RoomStorage,
  a: { keyHash: string; form: ChoiceForm; requestId: string },
  now: number,
): Promise<ActionResult<'createChoice'>> {
  const c = await choiceCaller(storage, a.keyHash, a.requestId)
  if (!c.ok) return c
  const checked = choice.checkChoiceInput(a.form, c.room)
  if (!checked.ok) return fail(400, checked.error)
  const input = checked.value
  if (c.again) {
    const e = c.again
    return e.type === 'choice.created' && e.memberId === c.me && sameChoice(e, input) ? choiceReply(c.log, e.id, now, {}) : fail(409, REQUEST_USED)
  }
  const late = choice.checkChoiceTimes(input, now)
  if (late) return fail(400, late)
  const entry: ChoiceCreatedEntry = {
    id: ulid(now),
    at: now,
    memberId: c.me,
    type: 'choice.created',
    question: input.question,
    options: [...input.options],
    recipient: input.recipient,
    cashbox: input.cashbox,
    optionsUntil: input.optionsUntil,
    closesAt: input.closesAt,
    requestId: a.requestId,
  }
  await append(storage, [entry])
  return choiceReply([...c.log, entry], entry.id, now, {})
}

function choiceOptionAct(e: ChoiceOptionEntry): ChoiceOptionAct {
  return { id: e.id, at: e.at, by: e.memberId, choice: e.choice, title: e.title }
}

// Вариант: участник, до «варианты до», не больше 10, без повторов (без учёта регистра). Название — без
// пробелов по краям; номер варианта — номер записи. Ответ — вариант и выбор после него
async function addChoiceOption(
  storage: RoomStorage,
  a: { keyHash: string; choice: string; title: unknown; requestId: string },
  now: number,
): Promise<ActionResult<'addChoiceOption'>> {
  const c = await choiceCaller(storage, a.keyHash, a.requestId)
  if (!c.ok) return c
  if (c.again) {
    const e = c.again
    const title = choice.checkOptionTitle(a.title)
    return e.type === 'choice.option' && e.choice === a.choice && e.memberId === c.me && title.ok && e.title === title.value
      ? choiceReply(c.log, a.choice, now, { option: choiceOptionAct(e) })
      : fail(409, REQUEST_USED)
  }
  const found = c.choices.find((x) => x.id === a.choice)
  if (!found) return fail(404, NO_CHOICE)
  const refused = choice.checkChoiceOption(found, c.me, a.title, c.room, now)
  if (refused) return choiceRefusal(refused)
  const title = (choice.checkOptionTitle(a.title) as { ok: true; value: string }).value
  const entry: ChoiceOptionEntry = { id: ulid(now), at: now, memberId: c.me, type: 'choice.option', choice: found.id, title, requestId: a.requestId }
  await append(storage, [entry])
  return choiceReply([...c.log, entry], found.id, now, { option: choiceOptionAct(entry) })
}

function choiceStakeAct(e: ChoiceStakeEntry): ChoiceStakeAct {
  return { id: e.id, at: e.at, by: e.memberId, choice: e.choice, option: e.option, amount: e.amount }
}

// Вклад: участник, с «варианты до» до конца с продлениями, вариантов хотя бы два; первый вклад выбирает
// вариант — дальше только в него. Вклад за 2 минуты до конца продлевает (правило свёртки). Не отзывается;
// ответ — вклад и выбор после него
async function stakeChoice(
  storage: RoomStorage,
  a: { keyHash: string; choice: string; option: string; amount: number; requestId: string },
  now: number,
): Promise<ActionResult<'stakeChoice'>> {
  const c = await choiceCaller(storage, a.keyHash, a.requestId)
  if (!c.ok) return c
  if (c.again) {
    const e = c.again
    return e.type === 'choice.stake' && e.choice === a.choice && e.memberId === c.me && e.option === a.option && e.amount === a.amount
      ? choiceReply(c.log, a.choice, now, { stake: choiceStakeAct(e) })
      : fail(409, REQUEST_USED)
  }
  const found = c.choices.find((x) => x.id === a.choice)
  if (!found) return fail(404, NO_CHOICE)
  const refused = choice.checkChoiceStake(found, c.me, a.option, a.amount, c.room, now)
  if (refused) return choiceRefusal(refused)
  const entry: ChoiceStakeEntry = {
    id: ulid(now),
    at: now,
    memberId: c.me,
    type: 'choice.stake',
    choice: found.id,
    option: a.option,
    amount: a.amount,
    requestId: a.requestId,
  }
  await append(storage, [entry])
  return choiceReply([...c.log, entry], found.id, now, { stake: choiceStakeAct(entry) })
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
type CourtCaller = Caller & { again: undefined; dispute: appeal.CourtTarget; court: CourtCase | null; room: appeal.CourtRoom }

// Пари — на now (offerAt, Р-37): торг, кончившийся со встречным, принят — у него две стороны
async function courtCaller(storage: RoomStorage, a: CourtAction, now: number): Promise<(Caller & { again: LogEntry }) | CourtCaller | Failure> {
  const c = await caller(storage, a.keyHash)
  if (!c.ok) return c
  const again = c.log.find((e) => 'requestId' in e && e.requestId === a.requestId)
  if (again) return { ...c, again }
  let dispute: appeal.CourtTarget
  if (a.kind === 'event') {
    const event = roomEvents(c.log).find((e) => e.id === a.target)
    if (!event) return fail(404, NO_EVENT)
    dispute = { kind: 'event', event }
  } else if (a.kind === 'offer') {
    const offer = logOffers(c.log).find((o) => o.id === a.target)
    if (!offer) return fail(404, NO_OFFER)
    dispute = { kind: 'offer', offer: offerAt(offer, now) }
  } else {
    const found = lot.logLots(c.log).find((l) => l.id === a.target)
    if (!found) return fail(404, NO_LOT)
    dispute = { kind: 'lot', lot: found }
  }
  // Дело суда — только по этому спору: свёртке нужен лишь он
  const one =
    dispute.kind === 'event'
      ? { events: [dispute.event], offers: [] }
      : dispute.kind === 'offer'
        ? { events: [], offers: [dispute.offer] }
        : { events: [], offers: [], lots: [dispute.lot] }
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
  appeal.BAD_LOT_VERDICT,
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
  const c = await courtCaller(storage, a, now)
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
  const c = await courtCaller(storage, a, now)
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
  const c = await courtCaller(storage, a, now)
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
  const c = await courtCaller(storage, a, now)
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

// --- Расчёт (этап 5, Р-32). Правила — settle.ts: переводы — checkSend / checkReceive / checkAnswer /
// checkRevoke и свёртка roomTransfers, режим «кто кому» — checkSettleMode; свод — roomSettlement на время
// ответа (http.ts), не хранится. Повтор с тем же номером запроса — тот же ответ без новой записи; тот же
// номер у другого действия, перевода, содержимого или от другого — 409

type TransferEntry = Extract<LogEntry, { type: 'transfer.sent' | 'transfer.received' | 'transfer.rejected' | 'transfer.revoked' }>
type SettleModeEntry = Extract<LogEntry, { type: 'room.settle-mode' }>

function isTransferEntry(e: LogEntry): e is TransferEntry {
  return e.type === 'transfer.sent' || e.type === 'transfer.received' || e.type === 'transfer.rejected' || e.type === 'transfer.revoked'
}

// Записи о переводах из журнала — записи правил (номер запроса правилам не нужен)
export function logTransfers(log: readonly LogEntry[]): settle.TransferRecord[] {
  return log.filter(isTransferEntry)
}

// Вход свода комнаты из журнала: события, пари, лоты (Р-38), выборы (Р-39), дела суда и переводы
function settleInput(log: readonly LogEntry[], state: RoomState): settle.SettleInput {
  const events = roomEvents(log)
  const offers = logOffers(log)
  const lots = lot.logLots(log)
  return {
    currency: state.currency,
    members: state.members.map((m) => m.id),
    events,
    offers,
    lots,
    choices: choice.logChoices(log),
    cases: appeal.logAppeals(log, { events, offers, lots }),
    transfers: logTransfers(log),
  }
}

// Режим «кто кому» из журнала: при создании (нет поля — «по ставкам»), дальше — смены ведущим. Смена
// действует, если её разрешает checkSettleMode на её место в журнале (свод на её время): сервер и
// свёртка не расходятся
export function logSettleMode(log: readonly LogEntry[]): settle.SettleMode {
  const created = log.find((e) => e.type === 'room.created')
  const initial = created?.type === 'room.created' ? created.settleMode : undefined
  let mode = initial && settle.SETTLE_MODES.includes(initial) ? initial : settle.DEFAULT_SETTLE_MODE
  log.forEach((e, i) => {
    if (e.type !== 'room.settle-mode') return
    const before = log.slice(0, i)
    const state = foldLog(before)
    if (!state) return
    const settlement = settle.roomSettlement(settleInput(before, state), e.at, mode)
    if (!settle.checkSettleMode(settlement, state, e.memberId, e.mode)) mode = e.mode
  })
  return mode
}

// Запись журнала с этим номером запроса, если она есть
function byRequest(log: readonly LogEntry[], requestId: string): LogEntry | undefined {
  return log.find((e) => 'requestId' in e && e.requestId === requestId)
}

type SettleCaller = Caller & { room: settle.TransferRoom; transfers: settle.Transfer[]; again: LogEntry | undefined }

async function settleCaller(storage: RoomStorage, keyHash: string, requestId: string): Promise<SettleCaller | Failure> {
  const c = await caller(storage, keyHash)
  if (!c.ok) return c
  const room: settle.TransferRoom = { currency: c.state.currency, members: c.state.members.map((m) => m.id) }
  return { ...c, room, transfers: settle.roomTransfers(logTransfers(c.log), room), again: byRequest(c.log, requestId) }
}

// Отказ правил расчёта: «не вам» — 403, нет перевода — 404, «уже не то состояние» и комната на очки —
// 409, кривое тело (кому, сумма, режим) — 400
const SETTLE_FORBIDDEN: readonly string[] = [settle.ONLY_RECEIVER, settle.ONLY_OWN, settle.ONLY_HOST_MODE]
const SETTLE_CONFLICT: readonly string[] = [
  settle.NO_TRANSFERS,
  settle.ALREADY_RECEIVED,
  settle.ALREADY_REJECTED,
  settle.TRANSFER_CANCELLED,
  settle.RECEIVED_NO_REVOKE,
  settle.NOTHING_TO_REVOKE,
  settle.SAME_MODE,
  settle.MODE_LOCKED,
]

function settleRefusal(error: string): Failure {
  if (error === settle.NO_TRANSFER) return fail(404, error)
  if (SETTLE_FORBIDDEN.includes(error)) return fail(403, error)
  return fail(SETTLE_CONFLICT.includes(error) ? 409 : 400, error)
}

// Перевод, каким он стал после записей журнала (и новой записи, если есть)
function transferAfter(c: SettleCaller, id: string, entry?: TransferEntry): ActionResult<'sendTransfer'> {
  const transfers = entry ? settle.roomTransfers([...logTransfers(c.log), entry], c.room) : c.transfers
  const transfer = transfers.find((t) => t.id === id)
  return transfer ? ok({ transfer }) : fail(404, settle.NO_TRANSFER)
}

// «Перевёл» (должник: кому, сколько) или «Получил» сам (получатель: от кого, сколько); сумма — целое > 0,
// долгом не ограничена. Перевод — сразу в своде: «ждёт подтверждения» или «получен»
async function newTransfer(
  storage: RoomStorage,
  a: { keyHash: string; kind: 'send' | 'receive'; party: string; amount: number; requestId: string },
  now: number,
): Promise<ActionResult<'sendTransfer'>> {
  const c = await settleCaller(storage, a.keyHash, a.requestId)
  if (!c.ok) return c
  if (c.again) {
    const e = c.again
    const same =
      e.memberId === c.me &&
      (a.kind === 'send'
        ? e.type === 'transfer.sent' && e.to === a.party && e.amount === a.amount
        : e.type === 'transfer.received' && 'from' in e && e.from === a.party && e.amount === a.amount)
    return same ? transferAfter(c, e.id) : fail(409, REQUEST_USED)
  }
  const refused = a.kind === 'send' ? settle.checkSend(c.room, c.me, a.party, a.amount) : settle.checkReceive(c.room, c.me, a.party, a.amount)
  if (refused) return settleRefusal(refused)
  const base = { id: ulid(now), at: now, memberId: c.me, amount: a.amount, requestId: a.requestId }
  const entry: TransferEntry =
    a.kind === 'send' ? { ...base, type: 'transfer.sent', to: a.party } : { ...base, type: 'transfer.received', from: a.party }
  await append(storage, [entry])
  return transferAfter(c, entry.id, entry)
}

export type TransferAnswer = 'receive' | 'reject' | 'cancel'

const ANSWER_TYPE = { receive: 'transfer.received', reject: 'transfer.rejected', cancel: 'transfer.revoked' } as const

// «Получил» на «Перевёл» и «Не получал» — получатель, пока перевод ждёт подтверждения; отмена своей
// отметки — новой записью (Р-11): должник — своё «Перевёл», пока не подтверждён; получатель — своё «Получил»
async function answerTransfer(
  storage: RoomStorage,
  a: { keyHash: string; transfer: string; answer: TransferAnswer; requestId: string },
  now: number,
): Promise<ActionResult<'answerTransfer'>> {
  const c = await settleCaller(storage, a.keyHash, a.requestId)
  if (!c.ok) return c
  const type = ANSWER_TYPE[a.answer]
  if (c.again) {
    const e = c.again
    const same = e.type === type && e.memberId === c.me && 'transfer' in e && e.transfer === a.transfer
    return same ? transferAfter(c, a.transfer) : fail(409, REQUEST_USED)
  }
  const t = c.transfers.find((x) => x.id === a.transfer) ?? null
  const refused = a.answer === 'cancel' ? settle.checkRevoke(c.room, t, c.me) : settle.checkAnswer(c.room, t, c.me)
  if (refused) return settleRefusal(refused)
  const entry = { id: ulid(now), at: now, memberId: c.me, type, transfer: a.transfer, requestId: a.requestId } as TransferEntry
  await append(storage, [entry])
  return transferAfter(c, a.transfer, entry)
}

function settleModeAct(e: SettleModeEntry): SettleModeResponse['settleMode'] {
  return { id: e.id, at: e.at, by: e.memberId, mode: e.mode }
}

// Смена режима «кто кому» ведущим (checkSettleMode на свод в нынешнем режиме на время сервера)
async function setSettleMode(
  storage: RoomStorage,
  a: { keyHash: string; mode: settle.SettleMode; requestId: string },
  now: number,
): Promise<ActionResult<'setSettleMode'>> {
  const c = await caller(storage, a.keyHash)
  if (!c.ok) return c
  const again = byRequest(c.log, a.requestId)
  if (again) {
    return again.type === 'room.settle-mode' && again.memberId === c.me && again.mode === a.mode
      ? ok({ settleMode: settleModeAct(again) })
      : fail(409, REQUEST_USED)
  }
  const settlement = settle.roomSettlement(settleInput(c.log, c.state), now, logSettleMode(c.log))
  const refused = settle.checkSettleMode(settlement, c.state, c.me, a.mode)
  if (refused) return settleRefusal(refused)
  const entry: SettleModeEntry = { id: ulid(now), at: now, memberId: c.me, type: 'room.settle-mode', mode: a.mode, requestId: a.requestId }
  await append(storage, [entry])
  return ok({ settleMode: settleModeAct(entry) })
}

// --- Темп комнаты (Р-35). Правила — pace.ts: смена — checkPaceChange, нынешний темп — logPace. Новый темп —
// только для новых событий и пари: их сроки закрепляются при создании (поле times записи)

type PaceEntry = Extract<LogEntry, { type: 'room.pace' }>

// Отказ правил темпа: не ведущий — 403, тот же темп — 409, кривое тело — 400
function paceRefusal(error: string): Failure {
  if (error === pace.ONLY_HOST_PACE) return fail(403, error)
  return fail(error === pace.SAME_PACE ? 409 : 400, error)
}

function paceAct(e: PaceEntry): PaceResponse['pace'] {
  return { id: e.id, at: e.at, by: e.memberId, pace: e.pace, times: { ...pace.paceTimes(e) } }
}

// Смена темпа ведущим в любой момент (checkPaceChange на нынешний темп). Повтор с тем же номером запроса —
// тот же ответ без второй записи; тот же номер у другого действия, темпа или от другого — 409
async function setPace(
  storage: RoomStorage,
  a: { keyHash: string; pace: pace.PaceInput; requestId: string },
  now: number,
): Promise<ActionResult<'setPace'>> {
  const c = await caller(storage, a.keyHash)
  if (!c.ok) return c
  const again = byRequest(c.log, a.requestId)
  if (again) {
    return again.type === 'room.pace' && again.memberId === c.me && samePace(paceAct(again), roomPaceOf(a.pace))
      ? ok({ pace: paceAct(again) })
      : fail(409, REQUEST_USED)
  }
  const refused = pace.checkPaceChange(pace.logPace(c.log), { hostId: c.state.hostId }, c.me, a.pace)
  if (refused) return paceRefusal(refused)
  const entry: PaceEntry = { id: ulid(now), at: now, memberId: c.me, type: 'room.pace', ...paceFields(a.pace), requestId: a.requestId }
  await append(storage, [entry])
  return ok({ pace: paceAct(entry) })
}
