// Ответы Worker'а без привязки к Cloudflare: их же отдаст запасная обёртка на Node (Р-02).
// Комнаты даёт вызывающий (RoomsDeps): Cloudflare — объекты Room, тесты — подделки
import {
  PROTOCOL_VERSION,
  type CreateRoomResponse,
  type ErrorResponse,
  type Health,
  type RoomStateResponse,
} from '../../src/rules/protocol'
import { checkAmount, checkClarification, checkEventInput, checkObjection, checkReason, eventView } from '../../src/rules/event'
import {
  BAD_BID,
  BAD_GUARANTOR,
  BAD_MARK,
  BAD_ODDS,
  checkOfferInput,
  MAX_ODDS,
  MIN_ODDS,
  NO_GUARANTOR_CHOSEN,
  NO_OFFER,
  offerView,
  type Odds,
} from '../../src/rules/offer'
import { appealReason, caseOf, courtVote, NOT_SEAT, replaceReason } from '../../src/rules/appeal'
import { BAD_LOT_BID, checkLotInput, lotView } from '../../src/rules/lot'
import { BAD_STAKE, choiceView, NO_OPTION } from '../../src/rules/choice'
import type { LotMark } from '../../src/rules/protocol'
import { checkBackup, type Backup } from '../../src/rules/backup'
import { checkPace, timesOf, type PaceInput } from '../../src/rules/pace'
import { checkMemberName, checkRoomInput } from '../../src/rules/room'
import {
  BAD_MODE,
  NO_TRANSFER,
  NOT_MEMBER as TRANSFER_NOT_MEMBER,
  roomSettlement,
  SETTLE_MODES,
  type SettleMode,
} from '../../src/rules/settle'
import { ulid } from '../../src/rules/ulid'
import { collectBackups } from './backup'
import { deriveCreation, hashKey, randomToken, sameText, ULID_PATTERN } from './keys'
import {
  BAD_DEVICE_LINK,
  BAD_LINK,
  NO_CHOICE,
  NO_EVENT,
  NO_LOT,
  NO_OUTCOME,
  NO_ROOM,
  type ActionResult,
  type ActionType,
  type BackupResult,
  type CourtKind,
  type CreateInput,
  type CreateResult,
  type RestoreResult,
  type RoomAction,
  type StateResult,
  type TransferAnswer,
} from './room'

// Сайт живёт на другом адресе (GitHub Pages) — браузеру нужно разрешение
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export const STATUS_TEXT = 'Сервер комнат ТоргСина работает. Протокол ' + PROTOCOL_VERSION + '.'

export const BAD_REQUEST = 'Неверный запрос'
export const VERSION_ERROR = 'Версия сайта и сервера разная — обновите страницу'
export const CREATION_OFF = 'Создание комнат выключено'
export const WRONG_PASSWORD = 'Неверный пароль компании'
export const BAD_REQUEST_ID = 'Неверный номер запроса'
export const NEED_KEY = 'Нет доступа: нужен ключ телефона'
export const NEED_CLOSE = 'Нужен срок «приём до»'
export const NEED_PARTY = 'Укажите одно: кому перевели или от кого получили'
export const BACKUP_OFF = 'Выгрузка и загрузка комнат выключены'
export const OTHER_ROOM = 'Копия другой комнаты: номер в адресе и в копии разный'

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  })
}

// Общие адреса сервера; не наш адрес — null (решает вызывающий)
export function route(method: string, path: string, now: number): Response | null {
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS })
  if (method === 'GET' && path === '/') {
    return new Response(STATUS_TEXT, { headers: { 'Content-Type': 'text/plain; charset=utf-8', ...CORS_HEADERS } })
  }
  if (method === 'GET' && path === '/health') {
    const body: Health = { v: PROTOCOL_VERSION, ok: true, time: now }
    return json(200, body)
  }
  return null
}

export function notFound(): Response {
  return json(404, { v: PROTOCOL_VERSION, error: 'Нет такого адреса' })
}

// Комнаты для адресов /rooms: обёртка находит хранилище комнаты по номеру
export type RoomsDeps = {
  password: string | undefined // секрет ROOM_PASSWORD; не задан — создание выключено
  now: () => number // время сервера, UTC, мс
  create: (input: CreateInput) => Promise<CreateResult>
  state: (roomId: string, keyHash: string) => Promise<StateResult>
  // Остальные действия комнаты (room.ts, act) — по одному, в очереди комнаты
  act: <K extends ActionType>(roomId: string, action: Extract<RoomAction, { type: K }>) => Promise<ActionResult<K>>
  // Копия комнаты (этап 6, room.ts): keyHash — копия участника, null — полная; загрузка — в пустую
  backup: (roomId: string, keyHash: string | null) => Promise<BackupResult>
  restore: (roomId: string, backup: Backup) => Promise<RestoreResult>
  // Номера всех комнат сервера: Cloudflare — из реестра комнат, Node — из своей базы
  roomIds: () => Promise<string[]>
}

type Reply<T> = { status: number; body: T | ErrorResponse }

function failure(status: number, error: string, join?: ErrorResponse['join']): Reply<never> {
  return { status, body: join ? { v: PROTOCOL_VERSION, error, join } : { v: PROTOCOL_VERSION, error } }
}

// Все адреса сервера
export async function handle(request: Request, deps: RoomsDeps): Promise<Response> {
  const path = new URL(request.url).pathname
  const common = route(request.method, path, deps.now())
  if (common) return common
  if (path === '/rooms' && request.method === 'POST') {
    const body: unknown = await request.json().catch(() => null)
    const r = await createRoom(body, deps)
    return json(r.status, r.body)
  }
  const match = /^\/rooms\/([^/]+)$/.exec(path)
  if (match && request.method === 'GET') {
    const r = await getRoom(match[1],request.headers.get('Authorization'), deps)
    return json(r.status, r.body)
  }
  // Копия комнаты (этап 6): GET /export — все комнаты, GET /rooms/<номер>/export, POST /rooms/<номер>/import
  if (path === '/export' && request.method === 'GET') {
    const r = await exportAll(request.headers.get('Authorization'), deps)
    return json(r.status, r.body)
  }
  const copy = /^\/rooms\/([^/]+)\/(export|import)$/.exec(path)
  if (copy && request.method === (copy[2] === 'export' ? 'GET' : 'POST')) {
    const authorization = request.headers.get('Authorization')
    const r = copy[2] === 'export' ? await exportOne(copy[1], authorization, deps) : await importOne(copy[1], authorization, request, deps)
    return json(r.status, r.body)
  }
  const sub = /^\/rooms\/([^/]+)\/(preview|join|requests|admit|reject|invite|device|device\/claim)$/.exec(path)
  if (sub) {
    const r = await roomAction(sub[1], sub[2], request, deps)
    if (r) return json(r.status, r.body)
  }
  // События-пул: /rooms/<номер>/events и /rooms/<номер>/events/<событие>/<действие>; апелляция и суд —
  // appeal | appeal/join | judge | replace (Р-25)
  const ev = /^\/rooms\/([^/]+)\/events(?:\/([^/]+)\/(bets|clarify|cancel|propose|object|agree|decide|vote|appeal|appeal\/join|judge|replace))?$/.exec(path)
  if (ev && request.method === 'POST') {
    const r = await eventAction(ev[1], ev[2], ev[3], request, deps)
    return json(r.status, r.body)
  }
  // Пари (Р-22; исход — Р-23; апелляция и суд — Р-25; торг — Р-37): /rooms/<номер>/offers и /rooms/<номер>/offers/<пари>/<действие>
  const of = /^\/rooms\/([^/]+)\/offers(?:\/([^/]+)\/(accept|revoke|counter|bid|bid\/accept|mark|decide|decline|nominate|appeal|appeal\/join|judge|replace))?$/.exec(path)
  if (of && request.method === 'POST') {
    const r = await offerAction(of[1], of[2], of[3], request, deps)
    return json(r.status, r.body)
  }
  // Лот (Р-38): /rooms/<номер>/lots и /rooms/<номер>/lots/<лот>/<действие>; суд по «Не получил» — judge | replace
  const lt = /^\/rooms\/([^/]+)\/lots(?:\/([^/]+)\/(bid|withdraw|handed|cannot|received|not-received|judge|replace))?$/.exec(path)
  if (lt && request.method === 'POST') {
    const r = await lotAction(lt[1], lt[2], lt[3], request, deps)
    return json(r.status, r.body)
  }
  // Выбор (Р-39): /rooms/<номер>/choices и /rooms/<номер>/choices/<выбор>/<действие>
  const ch = /^\/rooms\/([^/]+)\/choices(?:\/([^/]+)\/(option|stake))?$/.exec(path)
  if (ch && request.method === 'POST') {
    const r = await choiceAction(ch[1], ch[2], ch[3], request, deps)
    return json(r.status, r.body)
  }
  // Расчёт (Р-32): /rooms/<номер>/transfers, /rooms/<номер>/transfers/<перевод>/<действие>, /rooms/<номер>/settle-mode
  const tr = /^\/rooms\/([^/]+)\/transfers(?:\/([^/]+)\/(receive|reject|cancel))?$/.exec(path)
  if (tr && request.method === 'POST') {
    const r = await transferAction(tr[1], tr[2], tr[3] as TransferAnswer | undefined, request, deps)
    return json(r.status, r.body)
  }
  const sm = /^\/rooms\/([^/]+)\/settle-mode$/.exec(path)
  if (sm && request.method === 'POST') {
    const r = await settleModeAction(sm[1], request, deps)
    return json(r.status, r.body)
  }
  // Темп комнаты (Р-35): /rooms/<номер>/pace
  const pc = /^\/rooms\/([^/]+)\/pace$/.exec(path)
  if (pc && request.method === 'POST') {
    const r = await paceAction(pc[1], request, deps)
    return json(r.status, r.body)
  }
  return notFound()
}

// POST /rooms/<номер>/pace { pace: "normal" | "fast" | "custom", times?, requestId? } — ведущий меняет темп
// комнаты; times — только у «своего». Форма — checkPace (400 с текстом правил)
async function paceAction(roomId: string, request: Request, deps: RoomsDeps): Promise<Reply<unknown>> {
  const authorization = request.headers.get('Authorization')
  const raw: unknown = await request.json().catch(() => null)
  return withKey(roomId, authorization, async (keyHash) => {
    const read = readBody(raw)
    if (!read.ok) return read.reply
    const checked = checkPace({ pace: read.body.pace, times: read.body.times })
    if (!checked.ok) return failure(400, checked.error)
    const requestId = requestIdOf(read.body, deps)
    if (!requestId) return failure(400, BAD_REQUEST_ID)
    return reply(await deps.act(roomId, { type: 'setPace', keyHash, pace: checked.value, requestId }))
  })
}

// POST /rooms/<номер>/transfers { to, amount, requestId? } — «Перевёл»; { from, amount, requestId? } —
// «Получил» сам; …/transfers/<перевод>/receive | reject | cancel { requestId? } — «Получил», «Не
// получал», отмена своей отметки. Отказы — тексты правил (settle.ts)
async function transferAction(
  roomId: string,
  transferId: string | undefined,
  answer: TransferAnswer | undefined,
  request: Request,
  deps: RoomsDeps,
): Promise<Reply<unknown>> {
  const authorization = request.headers.get('Authorization')
  const raw: unknown = await request.json().catch(() => null)
  return withKey(roomId, authorization, async (keyHash) => {
    if (transferId !== undefined && !ULID_PATTERN.test(transferId)) return failure(404, NO_TRANSFER)
    const read = readBody(raw, answer !== undefined)
    if (!read.ok) return read.reply
    const b = read.body
    const requestId = requestIdOf(b, deps)
    if (transferId !== undefined && answer !== undefined) {
      if (!requestId) return failure(400, BAD_REQUEST_ID)
      return reply(await deps.act(roomId, { type: 'answerTransfer', keyHash, transfer: transferId, answer, requestId }))
    }
    if ((b.to === undefined) === (b.from === undefined)) return failure(400, NEED_PARTY)
    const party = b.to ?? b.from
    if (typeof party !== 'string' || !party) return failure(400, TRANSFER_NOT_MEMBER)
    const amount = checkAmount(b.amount)
    if (!amount.ok) return failure(400, amount.error)
    if (!requestId) return failure(400, BAD_REQUEST_ID)
    return b.to !== undefined
      ? reply(await deps.act(roomId, { type: 'sendTransfer', keyHash, to: party, amount: amount.value, requestId }))
      : reply(await deps.act(roomId, { type: 'receiveTransfer', keyHash, from: party, amount: amount.value, requestId }))
  })
}

// POST /rooms/<номер>/settle-mode { mode: "stakes" | "fewest", requestId? } — ведущий меняет режим «кто кому»
async function settleModeAction(roomId: string, request: Request, deps: RoomsDeps): Promise<Reply<unknown>> {
  const authorization = request.headers.get('Authorization')
  const raw: unknown = await request.json().catch(() => null)
  return withKey(roomId, authorization, async (keyHash) => {
    const read = readBody(raw)
    if (!read.ok) return read.reply
    const mode = settleModeOf(read.body.mode)
    if (!mode) return failure(400, BAD_MODE)
    const requestId = requestIdOf(read.body, deps)
    if (!requestId) return failure(400, BAD_REQUEST_ID)
    return reply(await deps.act(roomId, { type: 'setSettleMode', keyHash, mode, requestId }))
  })
}

// Режим «кто кому» из тела: «по ставкам» или «меньше переводов»; иное — null
function settleModeOf(x: unknown): SettleMode | null {
  return SETTLE_MODES.includes(x as SettleMode) ? (x as SettleMode) : null
}

// POST /rooms/<номер>/offers { condition, check, side?, odds: { a, b }, amount, to?, closesAt,
// expectedAt, guarantor?, noGuarantor?, subject?, requestId? } — предложить; торг (Р-37) — auction
// { start, step? } вместо odds; …/offers/<пари>/accept | revoke { requestId? }; …/offers/<пари>/counter
// { odds?, amount?, closesAt, guarantor?, noGuarantor?, requestId? } — встречное (noGuarantor — без
// гаранта, Р-36); торг: …/bid { amount, requestId? } — встречное в торге, …/bid/accept { requestId? } —
// «принять сейчас»; исход (Р-23):
// …/mark | decide { winner: "author" | "taker", requestId? }, …/decline { requestId? },
// …/nominate { guarantor, requestId? }; апелляция и суд (Р-25) — courtAction
async function offerAction(
  roomId: string,
  offerId: string | undefined,
  action: string | undefined,
  request: Request,
  deps: RoomsDeps,
): Promise<Reply<unknown>> {
  const authorization = request.headers.get('Authorization')
  const raw: unknown = await request.json().catch(() => null)
  return withKey(roomId, authorization, async (keyHash) => {
    if (offerId !== undefined && !ULID_PATTERN.test(offerId)) return failure(404, NO_OFFER)
    const read = readBody(raw, action === 'accept' || action === 'revoke' || action === 'decline' || action === 'appeal/join' || action === 'bid/accept')
    if (!read.ok) return read.reply
    const b = read.body
    if (offerId !== undefined && action !== undefined) {
      const court = await courtAction(roomId, 'offer', offerId, action, b, keyHash, deps)
      if (court) return court
    }
    const requestId = requestIdOf(b, deps)
    if (offerId === undefined) {
      const checked = checkOfferInput({
        condition: b.condition,
        check: b.check,
        side: b.side,
        odds: b.odds,
        amount: b.amount,
        to: b.to,
        closesAt: b.closesAt,
        expectedAt: b.expectedAt,
        guarantor: b.guarantor,
        noGuarantor: b.noGuarantor,
        subject: b.subject,
        auction: b.auction,
      })
      if (!checked.ok) return failure(400, checked.error)
      if (!requestId) return failure(400, BAD_REQUEST_ID)
      return reply(await deps.act(roomId, { type: 'createOffer', keyHash, input: checked.value, requestId }))
    }
    if (action === 'counter') {
      const odds = b.odds === undefined ? null : oddsOf(b.odds)
      if (odds === undefined) return failure(400, BAD_ODDS)
      const amount = b.amount === undefined ? null : checkAmount(b.amount)
      if (amount && !amount.ok) return failure(400, amount.error)
      if (!Number.isSafeInteger(b.closesAt)) return failure(400, NEED_CLOSE)
      // Гарант встречного (Р-36): участник, «без гаранта» или не задан — гарант исходного
      const guarantor = b.guarantor === undefined || b.guarantor === null ? undefined : b.guarantor
      if (guarantor !== undefined && (typeof guarantor !== 'string' || !guarantor)) return failure(400, BAD_GUARANTOR)
      const none = b.noGuarantor === undefined || b.noGuarantor === null ? false : b.noGuarantor
      if (typeof none !== 'boolean') return failure(400, BAD_GUARANTOR)
      if (none && guarantor !== undefined) return failure(400, NO_GUARANTOR_CHOSEN)
      if (!requestId) return failure(400, BAD_REQUEST_ID)
      return reply(
        await deps.act(roomId, {
          type: 'counterOffer',
          keyHash,
          offer: offerId,
          odds,
          amount: amount ? amount.value : null,
          closesAt: b.closesAt as number,
          ...(guarantor !== undefined && { guarantor }),
          ...(none && { noGuarantor: true }),
          requestId,
        }),
      )
    }
    if (action === 'mark' || action === 'decide') {
      const winner = b.winner
      if (winner !== 'author' && winner !== 'taker') return failure(400, BAD_MARK)
      if (!requestId) return failure(400, BAD_REQUEST_ID)
      const a = { keyHash, offer: offerId, winner, requestId } as const
      return action === 'mark'
        ? reply(await deps.act(roomId, { type: 'markOffer', ...a }))
        : reply(await deps.act(roomId, { type: 'decideOffer', ...a }))
    }
    if (action === 'bid') {
      // Сумма — целое > 0 (как в checkBid); старт, шаг и конец торга — в комнате
      if (!Number.isSafeInteger(b.amount) || (b.amount as number) < 1) return failure(400, BAD_BID)
      if (!requestId) return failure(400, BAD_REQUEST_ID)
      return reply(await deps.act(roomId, { type: 'bidOffer', keyHash, offer: offerId, amount: b.amount as number, requestId }))
    }
    if (action === 'nominate') {
      if (typeof b.guarantor !== 'string' || !b.guarantor) return failure(400, BAD_GUARANTOR)
      if (!requestId) return failure(400, BAD_REQUEST_ID)
      return reply(await deps.act(roomId, { type: 'nominateGuarantor', keyHash, offer: offerId, guarantor: b.guarantor, requestId }))
    }
    if (!requestId) return failure(400, BAD_REQUEST_ID)
    const a = { keyHash, offer: offerId, requestId }
    if (action === 'decline') return reply(await deps.act(roomId, { type: 'declineOffer', ...a }))
    if (action === 'bid/accept') return reply(await deps.act(roomId, { type: 'takeBid', ...a }))
    return action === 'accept'
      ? reply(await deps.act(roomId, { type: 'acceptOffer', ...a }))
      : reply(await deps.act(roomId, { type: 'revokeOffer', ...a }))
  })
}

// Отметки по лоту: адрес → отметка
const LOT_MARK_PATHS: Record<string, LotMark> = {
  withdraw: 'withdrawn',
  handed: 'handed',
  cannot: 'declined',
  received: 'received',
  'not-received': 'disputed',
}

// POST /rooms/<номер>/lots { title, description?, start, step?, closesAt, requestId? } — выставить лот;
// …/lots/<лот>/bid { amount, requestId? } — ставка; …/withdraw | handed | cannot | received | not-received
// { requestId? } — отметки; суд — …/judge { verdict: "delivered" | "undelivered" } и …/replace (courtAction).
// Форма — checkLotInput (400 с текстом правил), до комнаты
async function lotAction(
  roomId: string,
  lotId: string | undefined,
  action: string | undefined,
  request: Request,
  deps: RoomsDeps,
): Promise<Reply<unknown>> {
  const authorization = request.headers.get('Authorization')
  const raw: unknown = await request.json().catch(() => null)
  return withKey(roomId, authorization, async (keyHash) => {
    if (lotId !== undefined && !ULID_PATTERN.test(lotId)) return failure(404, NO_LOT)
    const mark = action === undefined ? undefined : LOT_MARK_PATHS[action]
    const read = readBody(raw, mark !== undefined)
    if (!read.ok) return read.reply
    const b = read.body
    if (lotId !== undefined && action !== undefined) {
      const court = await courtAction(roomId, 'lot', lotId, action, b, keyHash, deps)
      if (court) return court
    }
    const requestId = requestIdOf(b, deps)
    if (lotId === undefined) {
      const checked = checkLotInput({ title: b.title, description: b.description, start: b.start, step: b.step, closesAt: b.closesAt })
      if (!checked.ok) return failure(400, checked.error)
      if (!requestId) return failure(400, BAD_REQUEST_ID)
      return reply(await deps.act(roomId, { type: 'createLot', keyHash, input: checked.value, requestId }))
    }
    if (action === 'bid') {
      // Сумма — целое > 0 (как в checkLotBid); старт, шаг и конец торга — в комнате
      if (!Number.isSafeInteger(b.amount) || (b.amount as number) < 1) return failure(400, BAD_LOT_BID)
      if (!requestId) return failure(400, BAD_REQUEST_ID)
      return reply(await deps.act(roomId, { type: 'bidLot', keyHash, lot: lotId, amount: b.amount as number, requestId }))
    }
    if (!requestId) return failure(400, BAD_REQUEST_ID)
    return reply(await deps.act(roomId, { type: 'markLot', keyHash, lot: lotId, mark: mark as LotMark, requestId }))
  })
}

// POST /rooms/<номер>/choices { question, options?, recipient?, cashbox?, optionsUntil, closesAt, requestId? }
// — завести выбор (форму и получателя проверяет комната: нужны участники); …/choices/<выбор>/option
// { title, requestId? } — вариант; …/stake { option, amount, requestId? } — вклад
async function choiceAction(
  roomId: string,
  choiceId: string | undefined,
  action: string | undefined,
  request: Request,
  deps: RoomsDeps,
): Promise<Reply<unknown>> {
  const authorization = request.headers.get('Authorization')
  const raw: unknown = await request.json().catch(() => null)
  return withKey(roomId, authorization, async (keyHash) => {
    if (choiceId !== undefined && !ULID_PATTERN.test(choiceId)) return failure(404, NO_CHOICE)
    const read = readBody(raw)
    if (!read.ok) return read.reply
    const b = read.body
    const requestId = requestIdOf(b, deps)
    if (choiceId === undefined) {
      if (!requestId) return failure(400, BAD_REQUEST_ID)
      const form = { question: b.question, options: b.options, recipient: b.recipient, cashbox: b.cashbox, optionsUntil: b.optionsUntil, closesAt: b.closesAt }
      return reply(await deps.act(roomId, { type: 'createChoice', keyHash, form, requestId }))
    }
    if (action === 'stake') {
      // Вариант — строка, сумма — целое > 0 (как в checkChoiceStake); фаза и выбор варианта — в комнате
      if (typeof b.option !== 'string' || !b.option) return failure(400, NO_OPTION)
      if (!Number.isSafeInteger(b.amount) || (b.amount as number) < 1) return failure(400, BAD_STAKE)
      if (!requestId) return failure(400, BAD_REQUEST_ID)
      return reply(await deps.act(roomId, { type: 'stakeChoice', keyHash, choice: choiceId, option: b.option, amount: b.amount as number, requestId }))
    }
    if (!requestId) return failure(400, BAD_REQUEST_ID)
    return reply(await deps.act(roomId, { type: 'addChoiceOption', keyHash, choice: choiceId, title: b.title, requestId }))
  })
}

// Кэф из тела: целые MIN_ODDS…MAX_ODDS (как в checkOfferInput); кривой — undefined
function oddsOf(x: unknown): Odds | undefined {
  const odd = (v: unknown) => Number.isInteger(v) && (v as number) >= MIN_ODDS && (v as number) <= MAX_ODDS
  return isRecord(x) && odd(x.a) && odd(x.b) ? { a: x.a as number, b: x.b as number } : undefined
}

// POST /rooms/<номер>/events — завести; …/events/<событие>/bets | clarify | cancel;
// исход — …/propose | object | agree | decide | vote; апелляция и суд (Р-25) — courtAction
async function eventAction(
  roomId: string,
  eventId: string | undefined,
  action: string | undefined,
  request: Request,
  deps: RoomsDeps,
): Promise<Reply<unknown>> {
  const authorization = request.headers.get('Authorization')
  const raw: unknown = await request.json().catch(() => null)
  if (eventId === undefined) return createEvent(roomId, authorization, raw, deps)
  return withKey(roomId, authorization, async (keyHash) => {
    if (!ULID_PATTERN.test(eventId)) return failure(404, NO_EVENT)
    const read = readBody(raw, action === 'cancel' || action === 'appeal/join')
    if (!read.ok) return read.reply
    const body = read.body
    const court = action === undefined ? null : await courtAction(roomId, 'event', eventId, action, body, keyHash, deps)
    if (court) return court
    switch (action) {
      case 'bets': {
        const amount = checkAmount(body.amount)
        if (typeof body.outcome !== 'string' || !body.outcome) return failure(400, NO_OUTCOME)
        if (!amount.ok) return failure(400, amount.error)
        const requestId = requestIdOf(body, deps)
        if (!requestId) return failure(400, BAD_REQUEST_ID)
        return reply(await deps.act(roomId, { type: 'placeBet', keyHash, event: eventId, outcome: body.outcome, amount: amount.value, requestId }))
      }
      case 'clarify': {
        const text = checkClarification(body.text)
        if (!text.ok) return failure(400, text.error)
        return reply(await deps.act(roomId, { type: 'clarifyEvent', keyHash, event: eventId, text: text.value }))
      }
      case 'object': {
        const reason = checkObjection(body.reason)
        if (!reason.ok) return failure(400, reason.error)
        const requestId = requestIdOf(body, deps)
        if (!requestId) return failure(400, BAD_REQUEST_ID)
        return reply(await deps.act(roomId, { type: 'objectOutcome', keyHash, event: eventId, reason: reason.value, requestId }))
      }
      case 'agree': {
        const requestId = requestIdOf(body, deps)
        if (!requestId) return failure(400, BAD_REQUEST_ID)
        return reply(await deps.act(roomId, { type: 'agreeOutcome', keyHash, event: eventId, requestId }))
      }
      case 'propose':
      case 'decide':
      case 'vote': {
        if (typeof body.outcome !== 'string' || !body.outcome) return failure(400, NO_OUTCOME)
        const requestId = requestIdOf(body, deps)
        if (!requestId) return failure(400, BAD_REQUEST_ID)
        const a = { keyHash, event: eventId, outcome: body.outcome, requestId }
        if (action === 'propose') return reply(await deps.act(roomId, { type: 'proposeOutcome', ...a }))
        if (action === 'decide') return reply(await deps.act(roomId, { type: 'decideOutcome', ...a }))
        return reply(await deps.act(roomId, { type: 'voteOutcome', ...a }))
      }
      default: {
        const reason = checkReason(body.reason)
        if (!reason.ok) return failure(400, reason.error)
        return reply(await deps.act(roomId, { type: 'cancelEvent', keyHash, event: eventId, reason: reason.value }))
      }
    }
  })
}

// Апелляция и суд (Р-25) у события и пари: …/appeal { reason }, …/appeal/join {}, …/judge { verdict:
// "keep" | "change" | "cancel", outcome? (пул) | winner? (пари) }, …/replace { member, reason } — все с
// requestId?; у лота (Р-38) — только …/judge { verdict: "delivered" | "undelivered" } и …/replace. Не то
// действие — null
async function courtAction(
  roomId: string,
  kind: CourtKind,
  target: string,
  action: string,
  body: Record<string, unknown>,
  keyHash: string,
  deps: RoomsDeps,
): Promise<Reply<unknown> | null> {
  const a = { keyHash, kind, target }
  switch (action) {
    case 'appeal': {
      const reason = appealReason(body.reason)
      if (!reason.ok) return failure(400, reason.error)
      const requestId = requestIdOf(body, deps)
      if (!requestId) return failure(400, BAD_REQUEST_ID)
      return reply(await deps.act(roomId, { type: 'appealOutcome', ...a, reason: reason.value, requestId }))
    }
    case 'appeal/join': {
      const requestId = requestIdOf(body, deps)
      if (!requestId) return failure(400, BAD_REQUEST_ID)
      return reply(await deps.act(roomId, { type: 'joinAppeal', ...a, requestId }))
    }
    case 'judge': {
      const vote = courtVote(body, kind)
      if (!vote.ok) return failure(400, vote.error)
      const requestId = requestIdOf(body, deps)
      if (!requestId) return failure(400, BAD_REQUEST_ID)
      return reply(await deps.act(roomId, { type: 'judgeCourt', ...a, vote: vote.value, requestId }))
    }
    case 'replace': {
      if (typeof body.member !== 'string' || !body.member) return failure(400, NOT_SEAT)
      const reason = replaceReason(body.reason)
      if (!reason.ok) return failure(400, reason.error)
      const requestId = requestIdOf(body, deps)
      if (!requestId) return failure(400, BAD_REQUEST_ID)
      return reply(await deps.act(roomId, { type: 'replaceJuror', ...a, member: body.member, reason: reason.value, requestId }))
    }
  }
  return null
}

// Номер запроса из тела: нет — новый (повтор не узнать, но действие выполняется); кривой — null
function requestIdOf(body: Record<string, unknown>, deps: RoomsDeps): string | null {
  const id = body.requestId === undefined ? ulid(deps.now()) : body.requestId
  return typeof id === 'string' && ULID_PATTERN.test(id) ? id : null
}

// POST /rooms/<номер>/events { condition, check, outcomes?, closesAt, expectedAt, subject?, requestId? }
export async function createEvent(roomId: string, authorization: string | null, raw: unknown, deps: RoomsDeps): Promise<Reply<unknown>> {
  return withKey(roomId, authorization, async (keyHash) => {
    const read = readBody(raw)
    if (!read.ok) return read.reply
    const b = read.body
    const checked = checkEventInput({
      condition: b.condition,
      check: b.check,
      outcomes: b.outcomes,
      closesAt: b.closesAt,
      expectedAt: b.expectedAt,
      subject: b.subject,
    })
    if (!checked.ok) return failure(400, checked.error)
    const requestId = requestIdOf(b, deps)
    if (!requestId) return failure(400, BAD_REQUEST_ID)
    return reply(await deps.act(roomId, { type: 'createEvent', keyHash, input: checked.value, requestId }))
  })
}

// Адреса входа по ссылке (Р-03): /rooms/<номер>/<действие>. Не тот метод — null (404)
async function roomAction(roomId: string, action: string, request: Request, deps: RoomsDeps): Promise<Reply<unknown> | null> {
  const authorization = request.headers.get('Authorization')
  if (action === 'requests') return request.method === 'GET' ? listRequests(roomId, authorization, deps) : null
  if (request.method !== 'POST') return null
  const body: unknown = await request.json().catch(() => null)
  switch (action) {
    case 'preview':
      return previewRoom(roomId, body, deps)
    case 'join':
      return joinRoom(roomId, body, deps)
    case 'admit':
    case 'reject':
      return decide(roomId, action, authorization, body, deps)
    case 'invite':
      return renewInvite(roomId, authorization, body, deps)
    case 'device':
      return issueDevice(roomId, authorization, body, deps)
    case 'device/claim':
      return claimDevice(roomId, body, deps)
  }
  return null
}

// Тело запроса: версия протокола не та — отказ. Без тела (или не JSON) — пустое, если можно
function readBody(body: unknown, optional = false): { ok: true; body: Record<string, unknown> } | { ok: false; reply: Reply<never> } {
  const record = isRecord(body) ? body : optional && body === null ? {} : null
  if (!record) return { ok: false, reply: failure(400, BAD_REQUEST) }
  if (record.v !== undefined && record.v !== PROTOCOL_VERSION) return { ok: false, reply: failure(400, VERSION_ERROR) }
  return { ok: true, body: record }
}

function reply<K extends ActionType>(r: ActionResult<K>, extra: Record<string, unknown> = {}): Reply<unknown> {
  if (!r.ok) return failure(r.status, r.error, r.join)
  return { status: 200, body: { v: PROTOCOL_VERSION, ...r.value, ...extra } }
}

// Ключ телефона из заголовка Authorization: Bearer <ключ>
function bearer(authorization: string | null): string | undefined {
  return /^Bearer\s+(\S+)$/i.exec(authorization ?? '')?.[1]
}

// Действие по ключу телефона: нет ключа — 403; кривой номер комнаты — 404, хранилище не трогаем
async function withKey(
  roomId: string,
  authorization: string | null,
  run: (keyHash: string) => Promise<Reply<unknown>>,
): Promise<Reply<unknown>> {
  const key = bearer(authorization)
  if (!key) return failure(403, NEED_KEY)
  if (!ULID_PATTERN.test(roomId)) return failure(404, NO_ROOM)
  return run(await hashKey(key))
}

// POST /rooms/<номер>/preview { invite } → название комнаты и имя ведущего
export async function previewRoom(roomId: string, raw: unknown, deps: RoomsDeps): Promise<Reply<unknown>> {
  const read = readBody(raw)
  if (!read.ok) return read.reply
  const invite = read.body.invite
  if (typeof invite !== 'string' || !invite || !ULID_PATTERN.test(roomId)) return failure(403, BAD_LINK)
  return reply(await deps.act(roomId, { type: 'preview', invite }))
}

// POST /rooms/<номер>/join { invite, name, requestId? } → ключ заявки
export async function joinRoom(roomId: string, raw: unknown, deps: RoomsDeps): Promise<Reply<unknown>> {
  const read = readBody(raw)
  if (!read.ok) return read.reply
  const { invite } = read.body
  if (typeof invite !== 'string' || !invite || !ULID_PATTERN.test(roomId)) return failure(403, BAD_LINK)
  const name = checkMemberName(read.body.name)
  if (!name.ok) return failure(400, name.error)
  // Номера запроса нет — повтор не узнать, но заявка подаётся
  const requestId = read.body.requestId === undefined ? ulid(deps.now()) : read.body.requestId
  if (typeof requestId !== 'string' || !ULID_PATTERN.test(requestId)) return failure(400, BAD_REQUEST_ID)
  return reply(await deps.act(roomId, { type: 'join', invite, name: name.name, requestId }))
}

// GET /rooms/<номер>/requests — ждущие заявки, ведущему
export async function listRequests(roomId: string, authorization: string | null, deps: RoomsDeps): Promise<Reply<unknown>> {
  return withKey(roomId, authorization, async (keyHash) => reply(await deps.act(roomId, { type: 'requests', keyHash })))
}

// POST /rooms/<номер>/admit | reject { request } — решение ведущего
export async function decide(
  roomId: string,
  decision: 'admit' | 'reject',
  authorization: string | null,
  raw: unknown,
  deps: RoomsDeps,
): Promise<Reply<unknown>> {
  return withKey(roomId, authorization, async (keyHash) => {
    const read = readBody(raw)
    if (!read.ok) return read.reply
    const request = read.body.request
    if (typeof request !== 'string' || !request) return failure(400, BAD_REQUEST)
    return decision === 'admit'
      ? reply(await deps.act(roomId, { type: 'admit', keyHash, request }))
      : reply(await deps.act(roomId, { type: 'reject', keyHash, request }))
  })
}

// POST /rooms/<номер>/invite — новая ссылка-приглашение, ведущему
export async function renewInvite(roomId: string, authorization: string | null, raw: unknown, deps: RoomsDeps): Promise<Reply<unknown>> {
  return withKey(roomId, authorization, async (keyHash) => {
    const read = readBody(raw, true)
    if (!read.ok) return read.reply
    return reply(await deps.act(roomId, { type: 'renewInvite', keyHash, invite: randomToken() }))
  })
}

// POST /rooms/<номер>/device { member?, unlink? } — ссылка для другого устройства; токен — только в ответе
export async function issueDevice(roomId: string, authorization: string | null, raw: unknown, deps: RoomsDeps): Promise<Reply<unknown>> {
  return withKey(roomId, authorization, async (keyHash) => {
    const read = readBody(raw, true)
    if (!read.ok) return read.reply
    const { member, unlink } = read.body
    if ((member !== undefined && (typeof member !== 'string' || !member)) || (unlink !== undefined && typeof unlink !== 'boolean')) {
      return failure(400, BAD_REQUEST)
    }
    const token = randomToken()
    const r = await deps.act(roomId, {
      type: 'issueDevice',
      keyHash,
      member: typeof member === 'string' ? member : null,
      unlink: unlink === true,
      tokenHash: await hashKey(token),
    })
    return reply(r, { token })
  })
}

// POST /rooms/<номер>/device/claim { token } — новое устройство получает свой ключ участника
export async function claimDevice(roomId: string, raw: unknown, deps: RoomsDeps): Promise<Reply<unknown>> {
  const read = readBody(raw)
  if (!read.ok) return read.reply
  const token = read.body.token
  if (typeof token !== 'string' || !token || !ULID_PATTERN.test(roomId)) return failure(403, BAD_DEVICE_LINK)
  const key = randomToken(32)
  return reply(await deps.act(roomId, { type: 'claimDevice', tokenHash: await hashKey(token), keyHash: await hashKey(key) }), { key })
}

// --- Копия комнаты (этап 6, Р-02; формат — src/rules/backup.ts). Пароль компании — в заголовке
// Authorization: Password <пароль в base64 из UTF-8> (кириллицу заголовок как есть не несёт); ключ
// участника — как у чтения: Bearer <ключ>

// Пароль из заголовка; другой способ или кривой base64 — undefined
function passwordOf(authorization: string | null): string | undefined {
  const encoded = /^Password\s+(\S+)$/i.exec(authorization ?? '')?.[1]
  if (encoded === undefined) return undefined
  try {
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
  } catch {
    return undefined
  }
}

// Пароль компании для выгрузки и загрузки — до всего остального: на сервере не задан — 503 (как у
// создания комнаты), неверный, пустой или его нет — 403. Годен — null
function passwordRefusal(authorization: string | null, deps: RoomsDeps): Reply<never> | null {
  if (!deps.password) return failure(503, BACKUP_OFF)
  const given = passwordOf(authorization)
  if (given === undefined || !samePassword(given, deps.password)) return failure(403, WRONG_PASSWORD)
  return null
}

// Копия в ответе — сами поля копии и версия протокола: тело ответа годится для загрузки как есть
function backupReply(r: BackupResult): Reply<unknown> {
  if (!r.ok) return failure(r.status, r.error, r.join)
  return { status: 200, body: { v: PROTOCOL_VERSION, ...r.backup } }
}

// GET /export с паролем компании → { v, exportedAt, backups: [полная копия…] } — все комнаты сервера
// (номера — из реестра или базы; collectBackups — та же, что у суточной копии); номер без комнаты пропускается
export async function exportAll(authorization: string | null, deps: RoomsDeps): Promise<Reply<unknown>> {
  const refused = passwordRefusal(authorization, deps)
  if (refused) return refused
  const backups = await collectBackups(deps)
  return { status: 200, body: { v: PROTOCOL_VERSION, exportedAt: deps.now(), backups } }
}

// GET /rooms/<номер>/export: с паролем компании — полная копия, с ключом участника — копия участника
// (только журнал; не участник и заявка — отказы, как у чтения)
export async function exportOne(roomId: string, authorization: string | null, deps: RoomsDeps): Promise<Reply<unknown>> {
  if (/^Password(\s|$)/i.test(authorization ?? '')) {
    const refused = passwordRefusal(authorization, deps)
    if (refused) return refused
    if (!ULID_PATTERN.test(roomId)) return failure(404, NO_ROOM)
    return backupReply(await deps.backup(roomId, null))
  }
  return withKey(roomId, authorization, async (keyHash) => backupReply(await deps.backup(roomId, keyHash)))
}

// POST /rooms/<номер>/import с паролем компании, тело — полная копия → { v, roomId, entries } (сколько
// записей журнала). Битая копия (checkBackup) — 400, комнату не трогаем; копия другой комнаты — 400;
// в комнате уже что-то есть — 409. Версию протокола тела не сверяем: копию старого сервера тоже грузим
export async function importOne(roomId: string, authorization: string | null, request: Request, deps: RoomsDeps): Promise<Reply<unknown>> {
  const refused = passwordRefusal(authorization, deps)
  if (refused) return refused
  if (!ULID_PATTERN.test(roomId)) return failure(404, NO_ROOM)
  const raw: unknown = await request.json().catch(() => null)
  const checked = checkBackup(raw, 'full')
  if (!checked.ok) return failure(400, checked.error)
  if (checked.backup.roomId !== roomId) return failure(400, OTHER_ROOM)
  const r = await deps.restore(roomId, checked.backup)
  if (!r.ok) return failure(r.status, r.error, r.join)
  return { status: 200, body: { v: PROTOCOL_VERSION, roomId: r.roomId, entries: r.entries } }
}

// POST /rooms: пароль компании → проверка формы → комната. Пароль проверяется до всего
// остального: без него сервер не говорит, что не так с формой
export async function createRoom(body: unknown, deps: RoomsDeps): Promise<Reply<CreateRoomResponse>> {
  const fail = (status: number, error: string) => ({ status, body: { v: PROTOCOL_VERSION, error } })
  if (!isRecord(body)) return fail(400, BAD_REQUEST)
  if (!deps.password) return fail(503, CREATION_OFF)
  if (typeof body.password !== 'string' || !samePassword(body.password, deps.password)) return fail(403, WRONG_PASSWORD)
  if (body.v !== undefined && body.v !== PROTOCOL_VERSION) return fail(400, VERSION_ERROR)
  // Номера запроса нет — повтор не узнать, но комната создаётся
  const requestId = body.requestId === undefined ? ulid(deps.now()) : body.requestId
  if (typeof requestId !== 'string' || !ULID_PATTERN.test(requestId)) return fail(400, BAD_REQUEST_ID)
  const checked = checkRoomInput({ name: body.name, currency: body.currency, hostName: body.hostName })
  if (!checked.ok) return fail(400, checked.error)
  // Режим «кто кому» (Р-32): не задан — «по ставкам» (старый сайт поля не шлёт)
  const settleMode = body.settleMode === undefined ? undefined : settleModeOf(body.settleMode)
  if (settleMode === null) return fail(400, BAD_MODE)
  // Темп (Р-35): не задан (ни темпа, ни сроков) — обычный, полей в записи нет; иначе — checkPace
  let pace: PaceInput | undefined
  if (body.pace !== undefined || body.times !== undefined) {
    const p = checkPace({ pace: body.pace, times: body.times })
    if (!p.ok) return fail(400, p.error)
    pace = p.value
  }
  const { roomId, key } = await deriveCreation(requestId, deps.password)
  const created = await deps.create({
    ...checked.input,
    ...(settleMode && { settleMode }),
    ...(pace && { pace }),
    roomId,
    keyHash: await hashKey(key),
    invite: randomToken(),
  })
  if (!created.ok) return fail(created.status, created.error)
  return { status: 200, body: { v: PROTOCOL_VERSION, roomId: created.roomId, invite: created.invite, memberId: created.memberId, key } }
}

// GET /rooms/<номер>: ключ телефона — в заголовке Authorization: Bearer <ключ>
export async function getRoom(roomId: string, authorization: string | null, deps: RoomsDeps): Promise<Reply<RoomStateResponse>> {
  const fail = (status: number, error: string) => ({ status, body: { v: PROTOCOL_VERSION, error } })
  const key = bearer(authorization)
  if (!key) return fail(403, NEED_KEY)
  // Кривой номер — комнаты точно нет: хранилище не трогаем
  if (!ULID_PATTERN.test(roomId)) return fail(404, NO_ROOM)
  const r = await deps.state(roomId, await hashKey(key))
  // Ключ заявки: «ждём, пока ведущий впустит» или «отклонил» — с отметкой join для экрана ожидания
  if (!r.ok) return failure(r.status, r.error, r.join)
  const { state } = r
  // Статус событий — на время сервера в ответе: им же сайт считает отсчёт
  const now = deps.now()
  return {
    status: 200,
    body: {
      v: PROTOCOL_VERSION,
      // Темп комнаты и его сроки (Р-35) — нынешние: по ним заведутся новые события и пари
      room: {
        id: state.id,
        name: state.name,
        currency: state.currency,
        hostId: state.hostId,
        createdAt: state.createdAt,
        pace: r.pace.pace,
        times: { ...r.pace.times },
      },
      members: state.members.map((m) => ({ id: m.id, name: m.name })),
      me: r.me,
      // Апелляция и суд (Р-25) — у исхода своего события или пари; times — сроки, закреплённые при
      // создании (Р-35; у старых — обычный набор, timesOf): экраны показывают их, а не константы
      events: r.events.map((e) => ({ ...eventView(e, now, caseOf(r.cases, e.id)), times: { ...timesOf(e) } })),
      offers: r.offers.map((o) => ({ ...offerView(o, now, caseOf(r.cases, o.id)), times: { ...timesOf(o) } })),
      // Лоты (Р-38): ставки, конец с продлениями, ход после торга и суд по «Не получил»; times — в самом виде
      lots: r.lots.map((l) => lotView(l, now, caseOf(r.cases, l.id))),
      // Выборы (Р-39): фаза, варианты с суммами, вклады, конец с продлениями, итог с жребием и долги
      choices: r.choices.map((c) => choiceView(c, now)),
      // Свод расчёта (Р-32) — на то же время, в режиме комнаты; виден всем участникам; с лотами и
      // выборами — у чисел счётчики lots (Р-38) и choices (Р-39)
      settlement: roomSettlement(
        {
          currency: state.currency,
          members: state.members.map((m) => m.id),
          events: r.events,
          offers: r.offers,
          lots: r.lots,
          choices: r.choices,
          cases: r.cases,
          transfers: r.transfers,
        },
        now,
        r.settleMode,
      ),
      now,
    },
  }
}

// Сравнение без раннего выхода (keys.ts): время ответа не подсказывает, сколько знаков угадано
function samePassword(given: string, expected: string): boolean {
  return sameText(given, expected)
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}
