// Запросы к серверу комнат. Ответ — проверенный (protocol.ts) или отказ с текстом для человека.
// server — адрес сервера комнаты (у комнаты свой, из ссылки или с создания; «Настройки» — только для новых)
import {
  isAdmitResponse,
  isAgreeOutcomeResponse,
  isCancelEventResponse,
  isClaimDeviceResponse,
  isClarifyEventResponse,
  isCreateEventResponse,
  isDecideOutcomeResponse,
  isObjectOutcomeResponse,
  isProposeOutcomeResponse,
  isVoteOutcomeResponse,
  isCreateRoomResponse,
  isPlaceBetResponse,
  isDeviceLinkResponse,
  isErrorResponse,
  isInviteResponse,
  isJoinRequestsResponse,
  isJoinRoomResponse,
  isPreviewResponse,
  isRejectResponse,
  isRoomStateResponse,
  joinMark,
  PROTOCOL_VERSION,
  type AdmitResponse,
  type AgreeOutcomeResponse,
  type CancelEventResponse,
  type ClaimDeviceResponse,
  type ClarifyEventResponse,
  type CreateEventRequest,
  type CreateEventResponse,
  type DecideOutcomeResponse,
  type ObjectOutcomeResponse,
  type ProposeOutcomeResponse,
  type VoteOutcomeResponse,
  type PlaceBetRequest,
  type PlaceBetResponse,
  type CreateRoomRequest,
  type CreateRoomResponse,
  type DeviceLinkRequest,
  type DeviceLinkResponse,
  type InviteResponse,
  type JoinRequestsResponse,
  type JoinRoomRequest,
  type JoinRoomResponse,
  type PreviewResponse,
  type RejectResponse,
  type RoomStateResponse,
  isAcceptOfferResponse,
  isBidOfferResponse,
  isCreateOfferResponse,
  isRevokeOfferResponse,
  isTakeBidResponse,
  type AcceptOfferResponse,
  type BidOfferRequest,
  type BidOfferResponse,
  type TakeBidResponse,
  type CounterOfferRequest,
  type CreateOfferRequest,
  type CreateOfferResponse,
  type OfferActRequest,
  type RevokeOfferResponse,
  isDecideOfferResponse,
  isDeclineOfferResponse,
  isMarkOfferResponse,
  isNominateResponse,
  type DecideOfferResponse,
  type DeclineOfferResponse,
  type MarkOfferResponse,
  type NominateRequest,
  type NominateResponse,
  type OfferWinnerRequest,
  isAppealResponse,
  isJoinAppealResponse,
  isJudgeResponse,
  isReplaceJurorResponse,
  type AppealRequest,
  type AppealResponse,
  type JoinAppealRequest,
  type JoinAppealResponse,
  type JudgeRequest,
  type JudgeResponse,
  type ReplaceJurorRequest,
  type ReplaceJurorResponse,
  isSettleModeResponse,
  isPaceResponse,
  isTransferResponse,
  type PaceRequest,
  type PaceResponse,
  type SettleModeRequest,
  type SettleModeResponse,
  type TransferActRequest,
  type TransferRequest,
  type TransferResponse,
  isBidLotResponse,
  isLotMarkResponse,
  isLotResponse,
  type BidLotRequest,
  type BidLotResponse,
  type CreateLotRequest,
  type LotActRequest,
  type LotMarkResponse,
  type LotResponse,
  isChoiceOptionResponse,
  isChoiceResponse,
  isChoiceStakeResponse,
  type ChoiceOptionRequest,
  type ChoiceOptionResponse,
  type ChoiceResponse,
  type ChoiceStakeRequest,
  type ChoiceStakeResponse,
  type CreateChoiceRequest,
} from './rules/protocol'
import { checkBackup, type Backup } from './rules/backup'

export const OFFLINE = 'Нет связи с сервером'
export const VERSION_MISMATCH = 'Версия сайта и сервера разная — обновите страницу'
const STRANGE = 'Сервер ответил непонятно. Проверьте адрес сервера в «Настройках»'

// join — отметка заявки в отказе: ждём ведущего или отклонили (экран ожидания)
export type Failure = { ok: false; error: string; offline?: true; status?: number; join?: 'waiting' | 'rejected' }
export type Result<T> = { ok: true; value: T } | Failure

async function call<T>(url: string, init: RequestInit, valid: (x: unknown) => x is T & { v: number }): Promise<Result<T>> {
  let response: Response
  try {
    response = await fetch(url, { ...init, cache: 'no-store' })
  } catch {
    return { ok: false, error: OFFLINE, offline: true }
  }
  const body: unknown = await response.json().catch(() => null)
  if (isErrorResponse(body) && !response.ok) {
    const join = joinMark(body)
    return join ? { ok: false, error: body.error, status: response.status, join } : { ok: false, error: body.error, status: response.status }
  }
  if (body && typeof body === 'object' && 'v' in body && body.v !== PROTOCOL_VERSION) return { ok: false, error: VERSION_MISMATCH }
  if (!response.ok || !valid(body)) return { ok: false, error: STRANGE, status: response.status }
  return { ok: true, value: body }
}

function roomUrl(server: string, roomId: string, action = ''): string {
  return server + '/rooms/' + encodeURIComponent(roomId) + (action ? '/' + action : '')
}

// POST с телом JSON; key — ключ телефона (Authorization: Bearer), если действие по ключу
function post(body: object, key?: string): RequestInit {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (key) headers.Authorization = 'Bearer ' + key
  return { method: 'POST', headers, body: JSON.stringify({ v: PROTOCOL_VERSION, ...body }) }
}

function bearer(key: string): RequestInit {
  return { headers: { Authorization: 'Bearer ' + key } }
}

// POST /rooms — создать комнату по паролю компании
export function createRoom(server: string, request: CreateRoomRequest): Promise<Result<CreateRoomResponse>> {
  return call(server + '/rooms', post(request), isCreateRoomResponse)
}

// GET /rooms/<номер> — состояние комнаты по ключу телефона. Ключ заявки — отказ с join
export function fetchRoom(server: string, roomId: string, key: string): Promise<Result<RoomStateResponse>> {
  return call(roomUrl(server, roomId), bearer(key), isRoomStateResponse)
}

// POST /rooms/<номер>/preview — что за комната по ссылке-приглашению
export function previewRoom(server: string, roomId: string, invite: string): Promise<Result<PreviewResponse>> {
  return call(roomUrl(server, roomId, 'preview'), post({ invite }), isPreviewResponse)
}

// POST /rooms/<номер>/join — заявка; повтор с тем же requestId — та же заявка и тот же ключ
export function joinRoom(server: string, roomId: string, request: Omit<JoinRoomRequest, 'v'>): Promise<Result<JoinRoomResponse>> {
  return call(roomUrl(server, roomId, 'join'), post(request), isJoinRoomResponse)
}

// Копия участника — годная копия (checkBackup) без служебных записей
function isMemberBackup(x: unknown): x is Backup & { v: number } {
  const r = checkBackup(x)
  return r.ok && r.backup.store === undefined
}

// GET /rooms/<номер>/export — копия комнаты по ключу телефона: журнал целиком, без служебных записей.
// Старый сервер без адреса — отказ «Нет такого адреса»
export function fetchBackup(server: string, roomId: string, key: string): Promise<Result<Backup>> {
  return call(roomUrl(server, roomId, 'export'), bearer(key), isMemberBackup)
}

// GET /rooms/<номер>/requests — ждущие заявки, ведущему
export function fetchRequests(server: string, roomId: string, key: string): Promise<Result<JoinRequestsResponse>> {
  return call(roomUrl(server, roomId, 'requests'), bearer(key), isJoinRequestsResponse)
}

// POST /rooms/<номер>/admit — впустить
export function admitRequest(server: string, roomId: string, key: string, request: string): Promise<Result<AdmitResponse>> {
  return call(roomUrl(server, roomId, 'admit'), post({ request }, key), isAdmitResponse)
}

// POST /rooms/<номер>/reject — отклонить
export function rejectRequest(server: string, roomId: string, key: string, request: string): Promise<Result<RejectResponse>> {
  return call(roomUrl(server, roomId, 'reject'), post({ request }, key), isRejectResponse)
}

// POST /rooms/<номер>/invite — новая ссылка-приглашение; старая перестаёт работать
export function renewInvite(server: string, roomId: string, key: string): Promise<Result<InviteResponse>> {
  return call(roomUrl(server, roomId, 'invite'), post({}, key), isInviteResponse)
}

// POST /rooms/<номер>/device — ссылка для другого устройства (себе или, ведущему, за другого)
export function issueDeviceLink(
  server: string,
  roomId: string,
  key: string,
  request: Omit<DeviceLinkRequest, 'v'>,
): Promise<Result<DeviceLinkResponse>> {
  return call(roomUrl(server, roomId, 'device'), post(request, key), isDeviceLinkResponse)
}

// POST /rooms/<номер>/device/claim — ключ этого устройства по ссылке
export function claimDevice(server: string, roomId: string, token: string): Promise<Result<ClaimDeviceResponse>> {
  return call(roomUrl(server, roomId, 'device/claim'), post({ token }), isClaimDeviceResponse)
}

// …/events/<событие>/<действие>
function eventUrl(server: string, roomId: string, eventId: string, action: string): string {
  return roomUrl(server, roomId, 'events/' + encodeURIComponent(eventId) + '/' + action)
}

// POST /rooms/<номер>/events — завести событие; повтор с тем же requestId — то же событие
export function createEvent(
  server: string,
  roomId: string,
  key: string,
  request: Omit<CreateEventRequest, 'v'>,
): Promise<Result<CreateEventResponse>> {
  return call(roomUrl(server, roomId, 'events'), post(request, key), isCreateEventResponse)
}

// POST …/events/<событие>/bets — ставка; повтор с тем же requestId — та же ставка
export function placeBet(
  server: string,
  roomId: string,
  key: string,
  eventId: string,
  request: Omit<PlaceBetRequest, 'v'>,
): Promise<Result<PlaceBetResponse>> {
  return call(eventUrl(server, roomId, eventId, 'bets'), post(request, key), isPlaceBetResponse)
}

// POST …/events/<событие>/clarify — уточнение автора
export function clarifyEvent(server: string, roomId: string, key: string, eventId: string, text: string): Promise<Result<ClarifyEventResponse>> {
  return call(eventUrl(server, roomId, eventId, 'clarify'), post({ text }, key), isClarifyEventResponse)
}

// POST …/events/<событие>/cancel — отмена; после закрытия приёма — ведущий с причиной
export function cancelEvent(
  server: string,
  roomId: string,
  key: string,
  eventId: string,
  reason: string | null,
): Promise<Result<CancelEventResponse>> {
  return call(eventUrl(server, roomId, eventId, 'cancel'), post(reason ? { reason } : {}, key), isCancelEventResponse)
}

// Исход события (Р-17): повтор с тем же requestId — тот же ответ без второй записи (Р-13)
type OutcomeCall = { outcome: string; requestId: string }

// POST …/events/<событие>/propose — предложить исход после закрытия приёма
export function proposeOutcome(server: string, roomId: string, key: string, eventId: string, request: OutcomeCall): Promise<Result<ProposeOutcomeResponse>> {
  return call(eventUrl(server, roomId, eventId, 'propose'), post(request, key), isProposeOutcomeResponse)
}

// POST …/events/<событие>/object — возразить ставившему, с причиной, сутки после предложения
export function objectOutcome(
  server: string,
  roomId: string,
  key: string,
  eventId: string,
  request: { reason: string; requestId: string },
): Promise<Result<ObjectOutcomeResponse>> {
  return call(eventUrl(server, roomId, eventId, 'object'), post(request, key), isObjectOutcomeResponse)
}

// POST …/events/<событие>/agree — согласие ставившего с предложенным исходом (Р-21)
export function agreeOutcome(server: string, roomId: string, key: string, eventId: string, request: { requestId: string }): Promise<Result<AgreeOutcomeResponse>> {
  return call(eventUrl(server, roomId, eventId, 'agree'), post(request, key), isAgreeOutcomeResponse)
}

// POST …/events/<событие>/decide — решение ведущего после возражения
export function decideOutcome(server: string, roomId: string, key: string, eventId: string, request: OutcomeCall): Promise<Result<DecideOutcomeResponse>> {
  return call(eventUrl(server, roomId, eventId, 'decide'), post(request, key), isDecideOutcomeResponse)
}

// POST …/events/<событие>/vote — голос не ставившего
export function voteOutcome(server: string, roomId: string, key: string, eventId: string, request: OutcomeCall): Promise<Result<VoteOutcomeResponse>> {
  return call(eventUrl(server, roomId, eventId, 'vote'), post(request, key), isVoteOutcomeResponse)
}

// Пари (Р-22): повтор с тем же requestId — тот же ответ без второй записи (Р-13).
// …/offers/<пари>/<действие>
function offerUrl(server: string, roomId: string, offerId: string, action: string): string {
  return roomUrl(server, roomId, 'offers/' + encodeURIComponent(offerId) + '/' + action)
}

// POST /rooms/<номер>/offers — предложить пари
export function createOffer(server: string, roomId: string, key: string, request: Omit<CreateOfferRequest, 'v'>): Promise<Result<CreateOfferResponse>> {
  return call(roomUrl(server, roomId, 'offers'), post(request, key), isCreateOfferResponse)
}

// POST …/offers/<пари>/counter — встречное: ответ — новое пари
export function counterOffer(
  server: string,
  roomId: string,
  key: string,
  offerId: string,
  request: Omit<CounterOfferRequest, 'v'>,
): Promise<Result<CreateOfferResponse>> {
  return call(offerUrl(server, roomId, offerId, 'counter'), post(request, key), isCreateOfferResponse)
}

// POST …/offers/<пари>/accept — принять
export function acceptOffer(server: string, roomId: string, key: string, offerId: string, request: Omit<OfferActRequest, 'v'>): Promise<Result<AcceptOfferResponse>> {
  return call(offerUrl(server, roomId, offerId, 'accept'), post(request, key), isAcceptOfferResponse)
}

// POST …/offers/<пари>/revoke — отозвать своё, пока не принято
export function revokeOffer(server: string, roomId: string, key: string, offerId: string, request: Omit<OfferActRequest, 'v'>): Promise<Result<RevokeOfferResponse>> {
  return call(offerUrl(server, roomId, offerId, 'revoke'), post(request, key), isRevokeOfferResponse)
}

// Торг (Р-37): повтор с тем же requestId — тот же ответ без второй записи (Р-13)

// POST …/offers/<пари>/bid — встречное в торге: сколько ставишь против суммы автора
export function bidOffer(server: string, roomId: string, key: string, offerId: string, request: Omit<BidOfferRequest, 'v'>): Promise<Result<BidOfferResponse>> {
  return call(offerUrl(server, roomId, offerId, 'bid'), post(request, key), isBidOfferResponse)
}

// POST …/offers/<пари>/bid/accept — «принять сейчас»: автор принимает лучшее встречное, торг закончен
export function takeBid(server: string, roomId: string, key: string, offerId: string, request: Omit<OfferActRequest, 'v'>): Promise<Result<TakeBidResponse>> {
  return call(offerUrl(server, roomId, offerId, 'bid/accept'), post(request, key), isTakeBidResponse)
}

// Исход пари (Р-23): повтор с тем же requestId — тот же ответ без второй записи (Р-13)

// POST …/offers/<пари>/mark — отметка стороны: кто прав
export function markOffer(server: string, roomId: string, key: string, offerId: string, request: Omit<OfferWinnerRequest, 'v'>): Promise<Result<MarkOfferResponse>> {
  return call(offerUrl(server, roomId, offerId, 'mark'), post(request, key), isMarkOfferResponse)
}

// POST …/offers/<пари>/decide — решение гаранта, когда решение перешло к нему
export function decideOffer(server: string, roomId: string, key: string, offerId: string, request: Omit<OfferWinnerRequest, 'v'>): Promise<Result<DecideOfferResponse>> {
  return call(offerUrl(server, roomId, offerId, 'decide'), post(request, key), isDecideOfferResponse)
}

// POST …/offers/<пари>/decline — гарант отказывается
export function declineOffer(server: string, roomId: string, key: string, offerId: string, request: Omit<OfferActRequest, 'v'>): Promise<Result<DeclineOfferResponse>> {
  return call(offerUrl(server, roomId, offerId, 'decline'), post(request, key), isDeclineOfferResponse)
}

// POST …/offers/<пари>/nominate — сторона называет нового гаранта
export function nominateGuarantor(server: string, roomId: string, key: string, offerId: string, request: Omit<NominateRequest, 'v'>): Promise<Result<NominateResponse>> {
  return call(offerUrl(server, roomId, offerId, 'nominate'), post(request, key), isNominateResponse)
}

// Лот (Р-38): повтор с тем же requestId — тот же ответ без второй записи (Р-13).
// …/lots/<лот>/<действие>
function lotUrl(server: string, roomId: string, lotId: string, action: string): string {
  return roomUrl(server, roomId, 'lots/' + encodeURIComponent(lotId) + '/' + action)
}

// POST /rooms/<номер>/lots — выставить лот
export function createLot(server: string, roomId: string, key: string, request: Omit<CreateLotRequest, 'v'>): Promise<Result<LotResponse>> {
  return call(roomUrl(server, roomId, 'lots'), post(request, key), isLotResponse)
}

// POST …/lots/<лот>/bid — ставка
export function bidLot(server: string, roomId: string, key: string, lotId: string, request: Omit<BidLotRequest, 'v'>): Promise<Result<BidLotResponse>> {
  return call(lotUrl(server, roomId, lotId, 'bid'), post(request, key), isBidLotResponse)
}

// Отметка по лоту → адрес: «Снять лот», «Передал», «Не смогу передать», «Получил», «Не получил»
export type LotMarkAction = 'withdraw' | 'handed' | 'cannot' | 'received' | 'not-received'

// POST …/lots/<лот>/<отметка>
export function markLot(
  server: string,
  roomId: string,
  key: string,
  lotId: string,
  action: LotMarkAction,
  request: Omit<LotActRequest, 'v'>,
): Promise<Result<LotMarkResponse>> {
  return call(lotUrl(server, roomId, lotId, action), post(request, key), isLotMarkResponse)
}

// «Выбор» (Р-39): повтор с тем же requestId — тот же ответ без второй записи (Р-13).
// …/choices/<выбор>/<действие>
function choiceUrl(server: string, roomId: string, choiceId: string, action: string): string {
  return roomUrl(server, roomId, 'choices/' + encodeURIComponent(choiceId) + '/' + action)
}

// POST /rooms/<номер>/choices — завести выбор
export function createChoice(server: string, roomId: string, key: string, request: Omit<CreateChoiceRequest, 'v'>): Promise<Result<ChoiceResponse>> {
  return call(roomUrl(server, roomId, 'choices'), post(request, key), isChoiceResponse)
}

// POST …/choices/<выбор>/option — вариант в фазе вариантов
export function addChoiceOption(
  server: string,
  roomId: string,
  key: string,
  choiceId: string,
  request: Omit<ChoiceOptionRequest, 'v'>,
): Promise<Result<ChoiceOptionResponse>> {
  return call(choiceUrl(server, roomId, choiceId, 'option'), post(request, key), isChoiceOptionResponse)
}

// POST …/choices/<выбор>/stake — вклад в фазе вкладов
export function stakeChoice(
  server: string,
  roomId: string,
  key: string,
  choiceId: string,
  request: Omit<ChoiceStakeRequest, 'v'>,
): Promise<Result<ChoiceStakeResponse>> {
  return call(choiceUrl(server, roomId, choiceId, 'stake'), post(request, key), isChoiceStakeResponse)
}

// Апелляция и суд (Р-25) — у события и у пари одними адресами: …/events/<событие>/ или
// …/offers/<пари>/ + appeal | appeal/join | judge | replace. Повтор с тем же requestId — тот же ответ.
// Лот (Р-38) — только суд по «Не получил»: …/lots/<лот>/judge | replace, апелляции нет
export type CourtKind = 'event' | 'offer' | 'lot'

function courtUrl(server: string, roomId: string, kind: CourtKind, target: string, action: string): string {
  if (kind === 'lot') return lotUrl(server, roomId, target, action)
  return kind === 'event' ? eventUrl(server, roomId, target, action) : offerUrl(server, roomId, target, action)
}

// POST …/appeal — подать апелляцию с причиной; суд собирается в этот миг
export function fileAppeal(
  server: string,
  roomId: string,
  key: string,
  kind: CourtKind,
  target: string,
  request: Omit<AppealRequest, 'v'>,
): Promise<Result<AppealResponse>> {
  return call(courtUrl(server, roomId, kind, target, 'appeal'), post(request, key), isAppealResponse)
}

// POST …/appeal/join — присоединиться к поданной апелляции
export function joinAppeal(
  server: string,
  roomId: string,
  key: string,
  kind: CourtKind,
  target: string,
  request: Omit<JoinAppealRequest, 'v'>,
): Promise<Result<JoinAppealResponse>> {
  return call(courtUrl(server, roomId, kind, target, 'appeal/join'), post(request, key), isJoinAppealResponse)
}

// POST …/judge — голос члена суда: оставить, изменить на …, отменить
export function judgeCourt(
  server: string,
  roomId: string,
  key: string,
  kind: CourtKind,
  target: string,
  request: Omit<JudgeRequest, 'v'>,
): Promise<Result<JudgeResponse>> {
  return call(courtUrl(server, roomId, kind, target, 'judge'), post(request, key), isJudgeResponse)
}

// POST …/replace — ведущий досрочно заменяет не проголосовавшего члена суда
export function replaceJuror(
  server: string,
  roomId: string,
  key: string,
  kind: CourtKind,
  target: string,
  request: Omit<ReplaceJurorRequest, 'v'>,
): Promise<Result<ReplaceJurorResponse>> {
  return call(courtUrl(server, roomId, kind, target, 'replace'), post(request, key), isReplaceJurorResponse)
}

// Расчёт (Р-32, Р-33): повтор с тем же requestId — тот же ответ без второй записи (Р-13)

// POST /rooms/<номер>/transfers — «Перевёл» { to, amount } (должник) или «Получил» сам { from, amount }
export function createTransfer(server: string, roomId: string, key: string, request: Omit<TransferRequest, 'v'>): Promise<Result<TransferResponse>> {
  return call(roomUrl(server, roomId, 'transfers'), post(request, key), isTransferResponse)
}

// Ответ на перевод: receive — «Получил», reject — «Не получал», cancel — отмена своей отметки
export type TransferAct = 'receive' | 'reject' | 'cancel'

// POST …/transfers/<перевод>/<действие>
export function answerTransfer(
  server: string,
  roomId: string,
  key: string,
  transferId: string,
  act: TransferAct,
  request: Omit<TransferActRequest, 'v'>,
): Promise<Result<TransferResponse>> {
  return call(roomUrl(server, roomId, 'transfers/' + encodeURIComponent(transferId) + '/' + act), post(request, key), isTransferResponse)
}

// POST /rooms/<номер>/settle-mode — ведущий меняет режим «кто кому»
export function changeSettleMode(server: string, roomId: string, key: string, request: Omit<SettleModeRequest, 'v'>): Promise<Result<SettleModeResponse>> {
  return call(roomUrl(server, roomId, 'settle-mode'), post(request, key), isSettleModeResponse)
}

// POST /rooms/<номер>/pace — ведущий меняет темп комнаты (новые сроки — для новых событий и пари)
export function changePace(server: string, roomId: string, key: string, request: Omit<PaceRequest, 'v'>): Promise<Result<PaceResponse>> {
  return call(roomUrl(server, roomId, 'pace'), post(request, key), isPaceResponse)
}
