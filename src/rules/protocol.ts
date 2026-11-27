// Протокол сайта и сервера (Р-01): версия — в каждом ответе и сообщении. Чистые
// функции и типы — ими пользуются и экран, и сервер; ни DOM, ни Cloudflare здесь нет
// 4 — предмет спора (Р-26): subjectRule у события, subjectId у пари, subject в «Предложить пари»
// 5 — «Исход уже известен» (Р-27): closedAt у события, статус исхода «снято», «ещё не известно» в
// решении ведущего и голосе
// 6 — правило гаранта (Р-31): guarantorRule у пари, фаза исхода пари «ждёт суда» (court)
// 7 — пари без гаранта (Р-36): guarantorId у пари и его исхода может быть null, noGuarantor в
// «Предложить пари» и во встречном, guarantor во встречном
// 8 — «Торг до …» (Р-37): статус пари «не состоялось» (failed), auction у пари и в «Предложить пари»,
// bidding у пари, адреса …/bid и …/bid/accept
// 9 — «Лот» (Р-38): lots в состоянии комнаты, счётчик lots в числах «Расчёта», голоса суда «передано» /
// «не передано», адреса …/lots
// 10 — «Выбор» (Р-39): choices в состоянии комнаты, счётчик choices в числах «Расчёта», адреса …/choices
// 11 — выйти и «выбыл» (Р-40, Р-41): left и dropped у участника, member у заявки-возврата, адреса …/leave
// и …/members/<участник>/drop | restore
// 12 — ведение (Р-42): room.hosts, room.hostSeenAt, room.hostTakeFrom в состоянии комнаты, hostId у события и
// суда, адреса …/host (взять) и …/members/<участник>/host (передать)
// 13 — закрыть комнату (Р-43): room.closed в состоянии комнаты, адреса …/close и …/reopen, отказ «Комната
// закрыта» на новые записи в закрытой
// 14 — пари «на обещание» (Р-44): promise у пари, promise и takerPromise в «Предложить пари» и во
// встречном, promises в «Расчёте», адреса …/promises/<пари>/kept | received | rejected
export const PROTOCOL_VERSION = 14

// Ответ GET /health: сервер жив, его протокол и время (UTC, мс) — по нему закрываются сроки
export type Health = { v: number; ok: true; time: number }

// Отказ: понятный человеку текст. join — у ключа заявки, которую ещё не впустили
// («waiting») или отклонили («rejected»): экран ожидания различает их без разбора текста
export type ErrorResponse = { v: number; error: string; join?: 'waiting' | 'rejected' }

// POST /rooms: создать комнату по паролю компании (Р-03). requestId — номер запроса (ULID)
// от телефона: повтор с тем же номером даёт ту же комнату и тот же ответ
// settleMode — режим «кто кому» (Р-32): «по ставкам» / «меньше переводов»; не задан — «по ставкам».
// pace — темп комнаты (Р-35), times — сроки, только у «своего»; не задан — обычный
export type CreateRoomRequest = {
  v?: number
  password: string
  name: string
  currency: string
  hostName: string
  settleMode?: SettleModeView
  pace?: PaceView
  times?: TimesView
  requestId?: string
}

// Темп комнаты (Р-35; правила — pace.ts): «обычный» / «быстрый» / «свой». Сроки (мс): возражение,
// апелляция, молчание, суд
export type PaceView = 'normal' | 'fast' | 'custom'
export type TimesView = { objection: number; appeal: number; silence: number; court: number }
// POST /rooms/<номер>/pace { pace, times? } — ведущий меняет темп (times — только у «своего»); новый
// темп — для новых событий и пари. Ответ — смена: кто, когда, темп и его сроки
export type PaceRequest = { v?: number; pace: PaceView; times?: TimesView; requestId?: string }
export type PaceResponse = { v: number; pace: { id: string; at: number; by: string; pace: PaceView; times: TimesView } }

// Ответ на создание: номер комнаты, токен приглашения, номер участника-ведущего и ключ его
// телефона — ключ дальше идёт в заголовке Authorization: Bearer <ключ>
export type CreateRoomResponse = { v: number; roomId: string; invite: string; memberId: string; key: string }

// GET /rooms/<номер> с ключом телефона: состояние комнаты; me — номер владельца ключа;
// events — события-пул по порядку создания; offers — пари по порядку создания (Р-22; все пари
// комнаты, адресные тоже — тайных нет; сервер до этапа 3 поля не шлёт); now — время сервера
// (UTC, мс): по нему сайт считает отсчёт до закрытия приёма, а не по часам телефона; settlement —
// свод расчёта на now (Р-32; сервер до этапа 5 поля не шлёт), видят все участники; room.pace и
// room.times — нынешний темп комнаты и его сроки (Р-35; сервер до темпа полей не шлёт); lots — лоты по
// порядку создания (Р-38; все лоты комнаты со ставками — тайных нет; сервер до лотов поля не шлёт);
// choices — выборы по порядку создания (Р-39; вклады видны всем; сервер до выбора поля не шлёт); у
// участника left — вышел, dropped — помечен «выбыл» (Р-40, Р-41; сервер до выкатки полей не шлёт).
// Ведение (Р-42; сервер до выкатки полей не шлёт): room.hostId — нынешний ведущий; hosts — кто был ведущим
// по порядку (создатель и каждая смена — для истории); hostSeenAt — когда ведущий заходил (с точностью до
// часа), hostTakeFrom — с какого мига любой участник в игре может взять ведение. room.closed — комната закрыта
// (Р-43): номер записи, когда и кто закрыл; открыта — null (сервер до выкатки поля не шлёт)
export type RoomStateResponse = {
  v: number
  room: {
    id: string
    name: string
    currency: string
    hostId: string
    createdAt: number
    pace?: PaceView
    times?: TimesView
    hosts?: HostTermView[]
    hostSeenAt?: number
    hostTakeFrom?: number
    closed?: RoomClosedView | null
  }
  members: MemberView[]
  me: string
  events: EventView[]
  offers?: OfferView[]
  lots?: LotView[]
  choices?: ChoiceView[]
  settlement?: SettlementView
  now: number
}

// Участник комнаты: вышел (left) и «выбыл» (dropped) — Р-40, Р-41
export type MemberView = { id: string; name: string; left?: boolean; dropped?: boolean }

// POST /rooms/<номер>/leave { requestId? } — выйти самому (Р-40): отказ называет, что мешает; при выходе
// отзываются его непринятые пари и торги без встречных (revoked — какие). Ключи его устройств больше не
// пускают; вернуться — по ссылке-приглашению с тем же именем, впускает ведущий
export type LeaveRequest = { v?: number; requestId?: string }
export type LeaveResponse = { v: number; left: { id: string; at: number; by: string; revoked: string[] } }

// POST /rooms/<номер>/members/<участник>/drop | restore { requestId? } — ведущий ставит и снимает «выбыл» (Р-41)
export type DropRequest = { v?: number; requestId?: string }
export type DropResponse = { v: number; dropped: { id: string; at: number; by: string; member: string; dropped: boolean } }

// Ведение (Р-42). Срок ведения: кто ведущий (member) с мига from; how — создал комнату, ему передали, взял
// сам; by — автор записи, id — её номер
export type HostTermView = { id: string; member: string; from: number; how: 'created' | 'passed' | 'taken'; by: string }
// POST /rooms/<номер>/members/<участник>/host { requestId? } — ведущий передаёт ведение участнику в игре;
// POST /rooms/<номер>/host { requestId? } — участник в игре берёт ведение, если ведущий 7 дней не заходил.
// Ответ — смена: previous — прежний ведущий; у «взял» ещё seenAt — когда тот заходил
export type HostRequest = { v?: number; requestId?: string }
export type HostResponse = { v: number; host: HostTermView & { previous: string; seenAt?: number } }

// Закрыть комнату (Р-43). Комната закрыта: номер записи room.closed, когда, кто (ведущий)
export type RoomClosedView = { id: string; at: number; by: string }
// POST /rooms/<номер>/close | reopen { requestId? } — ведущий закрывает комнату (только когда всё доиграно:
// отказ называет, что открыто) и открывает снова. Ответ — запись: closed — закрыл (true) или открыл (false)
export type CloseRequest = { v?: number; requestId?: string }
export type CloseResponse = { v: number; closed: RoomClosedView & { closed: boolean } }

// Расчёт (этап 5, Р-32; правила — settle.ts, roomSettlement). Режим «кто кому»: «по ставкам» /
// «меньше переводов»
export type SettleModeView = 'stakes' | 'fewest'
// Число с основанием: сумма и из скольких событий и пари она сложена; lots — из скольких лотов (Р-38;
// сервер до лотов поля не шлёт); choices — из скольких выборов (Р-39; сервер до выбора поля не шлёт)
export type SettleSumView = { amount: number; events: number; offers: number; lots?: number; choices?: number }
// Участник: итог (окончательные), ждёт окончательности, в игре; отдал и получил — по переводам «ждёт
// подтверждения» и «получен»; баланс = итог + отдал − получил (плюс — ему должны)
export type MemberSettlementView = {
  memberId: string
  total: SettleSumView
  pending: SettleSumView
  inPlay: SettleSumView
  sent: number
  received: number
  balance: number
}
// «ждёт подтверждения» / «получен» / «отклонён» («Не получал») / «отменён»
export type TransferStatusView = 'pending' | 'received' | 'rejected' | 'cancelled'
// Перевод: номер — id записи, которой заведён; by — кто завёл (должник «Перевёл» или получатель
// «Получил» сам); changedAt — миг последней смены состояния
export type TransferView = {
  id: string
  at: number
  from: string
  to: string
  amount: number
  by: 'sender' | 'receiver'
  status: TransferStatusView
  changedAt: number
}
// Обещание (Р-44): по окончательному пари на обещание offer (at — с какого мига исход окончательный)
// проигравший from должен выигравшему to обещание text; «ждёт» / «Исполнил» (ждёт ответа выигравшего) /
// «получено» / «не получено»; changedAt — миг последней смены состояния (до отметок — at)
export type PromiseStatusView = 'waiting' | 'kept' | 'received' | 'rejected'
export type PromiseView = {
  offer: string
  at: number
  from: string
  to: string
  text: string
  status: PromiseStatusView
  changedAt: number
}
// Свод: режим комнаты, участники, переводы по порядку заведения, подсказка «кто кому» (from → to);
// promises — обещания по порядку пари (Р-44; нет поля — обещаний к исполнению нет, и у сервера до выкатки)
export type SettlementView = {
  mode: SettleModeView
  members: MemberSettlementView[]
  transfers: TransferView[]
  suggestions: { from: string; to: string; amount: number }[]
  promises?: PromiseView[]
}

// Переводы на сервере (Р-32). Адреса — POST /rooms/<номер>/transfers и …/transfers/<перевод>/receive |
// reject | cancel, по ключу участника; requestId — номер запроса (ULID): повтор — тот же ответ без второй
// записи. …/transfers { to, amount } — «Перевёл» (должник); { from, amount } — «Получил» сам (получатель)
export type TransferRequest = { v?: number; to?: string; from?: string; amount: number; requestId?: string }
// …/receive — «Получил» на «Перевёл», …/reject — «Не получал», …/cancel — отмена своей отметки
export type TransferActRequest = { v?: number; requestId?: string }
// Ответ — перевод, каким он стал (повтор — каким он сейчас)
export type TransferResponse = { v: number; transfer: TransferView }
// POST /rooms/<номер>/settle-mode { mode } — ведущий меняет режим «кто кому»
export type SettleModeRequest = { v?: number; mode: SettleModeView; requestId?: string }
export type SettleModeResponse = { v: number; settleMode: { id: string; at: number; by: string; mode: SettleModeView } }
// Обещания на сервере (Р-44). POST /rooms/<номер>/promises/<пари>/kept — «Исполнил» (проигравший);
// …/received — «Получил», …/rejected — «Не получил» (выигравший); { requestId? }: повтор — тот же ответ без
// второй записи. Можно и в закрытой комнате, и «выбывшему». Ответ — обещание, каким оно стало
export type PromiseActRequest = { v?: number; requestId?: string }
export type PromiseResponse = { v: number; promise: PromiseView }

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
  guarantorId: string | null // нынешний гарант; null — пари без гаранта (Р-36), пока стороны его не назвали
  counterTo: string | null
  subjectId: string | null // о ком спор (Р-26): только на стороне «сбудется», не гарант; null — ни о ком
  // Правило гаранта (Р-31): часы гаранта — с «исход к», 3 дня без общего гаранта — суд. У пари,
  // предложенных до выкатки, — false: прежние часы, без суда
  guarantorRule: boolean
  // «Торг до …» (Р-37): старт (наименьшая сумма соперника), шаг и latestEnd — «торг закончится не позже …»
  // (исходный конец closesAt + 30 минут продлений). У торга takerAmount — принятое встречное, до конца —
  // лучшее, без встречных — старт; odds — отношение сумм { a: amount, b: takerAmount }, только для
  // показа. У обычного пари поля нет
  auction?: AuctionInfo
  // На обещание (Р-44): что сделает автор (author) и соперник (taker), если проиграет; amount и
  // takerAmount тогда — 0, odds — { a: 1, b: 1 } (не показываются). У пари на сумму поля нет
  promise?: PromiseTerms
}
export type AuctionInfo = { start: number; step: number; latestEnd: number }
export type PromiseTerms = { author: string; taker: string }

// Встречное в торге (Р-37): кто, когда, сколько ставит против суммы автора
export type OfferBid = { id: string; at: number; by: string; amount: number }
// Ход торга на now: все встречные по порядку (видны всем, Р-11), лучшее (последнее), конец с
// продлениями; result — итог: принято лучшее («принять сейчас» — now, к концу торга — end) — каким
// встречным и когда; «не состоялось» (failed) — в миг конца; торг идёт или отозван — null
export type BiddingView = {
  bids: OfferBid[]
  best: OfferBid | null
  endsAt: number
  result: { how: 'now' | 'end'; at: number; bid: string } | { how: 'failed'; at: number } | null
}

// «открыто» / «истекло» (приём до прошёл, по времени сервера) / «отозвано» / «закрыто встречным» /
// «принято» / «не состоялось» (торг без встречных к концу, Р-37: никто никому не должен)
export type OfferStatus = 'open' | 'expired' | 'withdrawn' | 'countered' | 'accepted' | 'failed'

// Действие с пари: кто (by), когда, с каким пари
export type OfferAct = { id: string; at: number; by: string; offer: string }

// Сторона пари: автор или соперник (принявший). Отметка и решение гаранта — кто прав
export type OfferSide = 'author' | 'taker'

// Ход исхода пари (Р-23) на now: «стороны отмечают» / «решает гарант» / «нужен другой гарант» /
// «ждёт суда» (Р-31: срок молчания без общего гаранта, суд собран; Р-36: без гаранта — сразу, как
// стороны разошлись или одна молчит) / «утверждён» / «окончательный» /
// «отменено судом» (Р-24: без выплат)
export type OfferPhase = 'marking' | 'guarantor' | 'need-guarantor' | 'court' | 'approved' | 'final' | 'cancelled'

// Апелляция и суд (этап 4, Р-05, Р-24; правила — appeal.ts, court.ts). Голос суда: «оставить» (если
// исход утверждён) / «отменить — вернуть ставки» / «изменить на …» — у пула исход события, у пари —
// сторона, которая права. У лота (Р-38) — только «передано» / «не передано». Голоса видны всем сразу (Р-11)
export type CourtVerdict =
  | { verdict: 'keep' }
  | { verdict: 'cancel' }
  | { verdict: 'change'; outcome: string }
  | { verdict: 'change'; winner: OfferSide }
  | { verdict: 'delivered' }
  | { verdict: 'undelivered' }
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
// hostId — ведущий на миг жребия (Р-42): он, если кандидат, — первый в порядке; нет поля — ведущий комнаты
export type CourtView = {
  hostId?: string
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
// отмечала); guarantorId — нынешний гарант (без гаранта — null, Р-36); turnAt — с какого мига решает
// гарант (без гаранта — с какого мига дело у суда); guarantorUntil — до какого мига он решает
// (утверждено или гаранта нет — null); needSince — с какого мига нужен другой гарант (без гаранта —
// с turnAt: суд или, если судить некому, гарант, которого назовут стороны);
// nominations — кого называют стороны; approved — что, когда, как и кем утверждено (судом — by null);
// finalAt — с какого мига окончательный (согласием — сразу, гарантом — через 7 дней; апелляция подана —
// с решения суда, до него — null); appeal и court — апелляция и суд (Р-24; суд без апелляции — appeal
// null; суда нет — полей нет, как у сервера до этапа 4)
export type OfferOutcomeView = {
  phase: OfferPhase
  marks: Record<OfferSide, OfferSide | null>
  guarantorId: string | null
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
// отозвано; closedBy — каким встречным закрыто; outcome — исход (Р-23; не принято — null); times —
// сроки пари, закреплённые при создании (Р-35; у старых — обычный набор; сервер до темпа поля не шлёт);
// bidding — ход торга (Р-37; у обычного пари поля нет)
export type OfferView = OfferInfo & {
  times?: TimesView
  bidding?: BiddingView
  status: OfferStatus
  accepted: { by: string; at: number } | null
  withdrawnAt: number | null
  closedBy: { offer: string; at: number } | null
  outcome: OfferOutcomeView | null
}

// Лот (этап 7, Р-09, Р-38; правила — lot.ts): торг за вещь, цифровой товар или услугу. Ставка — кто,
// когда, сколько; не отзывается, видна всем (Р-11)
export type LotBid = { id: string; at: number; by: string; amount: number }
// «торг идёт» / «снят» (продавцом, пока ставок не было) / «не продан» (к концу ставок нет) / «ждёт
// передачи» (конец, «Передал» нет) / «передан» (продавец отметил, победитель молчит срок молчания —
// «получил») / «в споре» («Не получил», суда нет: судить некому) / «ждёт суда» (суд собран) / «получен»
// (долг победителя продавцу — в «Расчёте») / «не состоялся» («Не смогу передать») / «не передан» (суд)
export type LotStatus = 'open' | 'withdrawn' | 'unsold' | 'awaiting' | 'handed' | 'dispute' | 'court' | 'received' | 'failed' | 'undelivered'
// Лот на now: условия (closesAt — исходный конец, latestEnd — «не позже …», endsAt — конец с
// продлениями; times — сроки, закреплённые при создании), ставки по порядку и лучшая; winner и amount —
// победитель и его ставка (после конца со ставками, иначе null); отметки сторон — когда; disputeFrom —
// с какого мига «Не получил» без «Передал» (конец + срок молчания); silenceUntil — после «Передал» — с
// какого мига молчание победителя — «получил»; received — когда и как получено (отметкой, молчанием,
// судом); closedAt — миг итога (снят, не продан, получен, не состоялся, не передан; иначе null); court —
// суд по «Не получил» (нет — поля нет)
export type LotView = {
  id: string
  at: number
  sellerId: string
  title: string
  description: string
  start: number
  step: number
  closesAt: number
  latestEnd: number
  endsAt: number
  times: TimesView
  status: LotStatus
  bids: LotBid[]
  best: LotBid | null
  winner: string | null
  amount: number | null
  withdrawnAt: number | null
  handedAt: number | null
  declinedAt: number | null
  disputedAt: number | null
  disputeFrom: number | null
  silenceUntil: number | null
  received: { at: number; how: 'mark' | 'silence' | 'court' } | null
  closedAt: number | null
  court?: CourtView | null
}

// Лот на сервере (Р-38). Адреса — POST /rooms/<номер>/lots и …/lots/<лот>/<действие>, по ключу участника;
// requestId — номер запроса (ULID): повтор — тот же ответ без второй записи. Отказы — тексты правил lot.ts.
// …/lots { title, description?, start, step?, closesAt } — выставить: продавец — автор; шаг не задан — 10 %
// старта; closesAt — конец торга (от 10 минут до 3 дней). Ответ — лот на время сервера
export type CreateLotRequest = {
  v?: number
  title: string
  description?: string
  start: number
  step?: number
  closesAt: number
  requestId?: string
}
export type LotResponse = { v: number; lot: LotView }
// …/lots/<лот>/bid { amount } — ставка; ответ — ставка и лот после неё
export type BidLotRequest = { v?: number; amount: number; requestId?: string }
export type LotBidAct = { id: string; at: number; by: string; lot: string; amount: number }
export type BidLotResponse = { v: number; bid: LotBidAct; lot: LotView }
// Отметки по лоту {}: …/withdraw — «Снять лот» (продавец, пока ставок нет), …/handed — «Передал», …/cannot —
// «Не смогу передать» (продавец), …/received — «Получил», …/not-received — «Не получил» (победитель). Ответ —
// отметка (mark — какая) и лот после неё. Суд по «Не получил» — …/lots/<лот>/judge { verdict: "delivered" |
// "undelivered" } и …/replace, как у событий и пари; апелляции нет
export type LotMark = 'withdrawn' | 'handed' | 'declined' | 'received' | 'disputed'
export type LotActRequest = { v?: number; requestId?: string }
export type LotMarkAct = { id: string; at: number; by: string; lot: string; mark: LotMark }
export type LotMarkResponse = { v: number; marked: LotMarkAct; lot: LotView }

// «Выбор» (этап 7, Р-09, Р-39; правила — choice.ts): голосование деньгами. Вариант — кто, когда предложил
// и сколько в него вложено к now; вклад — кто, когда, в какой вариант, сколько: не отзывается, виден всем
// (Р-11)
export type ChoiceOptionView = { id: string; at: number; by: string; title: string; total: number }
export type ChoiceStake = { id: string; at: number; by: string; option: string; amount: number }
// «варианты» (фаза вариантов) / «вклады» (фаза вкладов) / «ждёт жребия» (ничья в конце продлений, жребия
// ещё нет) / «решён» / «не состоялся» (меньше двух вариантов к концу фазы вариантов или вкладов нет)
export type ChoiceStatus = 'options' | 'open' | 'draw' | 'decided' | 'failed'
// Выбор на now: вопрос, получатель (участник; cashbox — подпись «касса»), сроки (optionsUntil — «варианты
// до», closesAt — «вклады до», latestEnd — «не позже …», endsAt — конец вкладов с продлениями на now),
// варианты с суммами, вклады по порядку; failed — почему не состоялся ('options' — меньше двух вариантов,
// 'stakes' — вкладов нет; иначе null); winner — вариант-победитель, how — большей суммой ('sum') или
// жребием ('draw'); draw — жребий сервера при ничьей (зерно, равные варианты); debts — кто сколько должен
// получателю (только у решённого); closedAt — миг итога (не состоялся, решён; иначе null)
export type ChoiceView = {
  id: string
  at: number
  authorId: string
  question: string
  recipientId: string
  cashbox: boolean
  optionsUntil: number
  closesAt: number
  latestEnd: number
  endsAt: number
  status: ChoiceStatus
  failed: 'options' | 'stakes' | null
  options: ChoiceOptionView[]
  stakes: ChoiceStake[]
  winner: string | null
  how: 'sum' | 'draw' | null
  draw: { at: number; seed: string; options: string[] } | null
  debts: { from: string; to: string; amount: number }[]
  closedAt: number | null
}

// «Выбор» на сервере (Р-39). Адреса — POST /rooms/<номер>/choices и …/choices/<выбор>/<действие>, по ключу
// участника; requestId — номер запроса (ULID): повтор — тот же ответ без второй записи. Отказы — тексты
// правил choice.ts; время — сервера. …/choices { question, options?, recipient?, cashbox?, optionsUntil,
// closesAt } — завести: автор — кто прислал; options — варианты автора (можно ни одного); recipient не задан
// — ведущий; optionsUntil — «варианты до», closesAt — «вклады до». Ответ — выбор на время сервера
export type CreateChoiceRequest = {
  v?: number
  question: string
  options?: string[]
  recipient?: string
  cashbox?: boolean
  optionsUntil: number
  closesAt: number
  requestId?: string
}
export type ChoiceResponse = { v: number; choice: ChoiceView }
// …/choices/<выбор>/option { title } — вариант в фазе вариантов; ответ — вариант (id — его номер) и выбор
// после него
export type ChoiceOptionRequest = { v?: number; title: string; requestId?: string }
export type ChoiceOptionAct = { id: string; at: number; by: string; choice: string; title: string }
export type ChoiceOptionResponse = { v: number; option: ChoiceOptionAct; choice: ChoiceView }
// …/choices/<выбор>/stake { option, amount } — вклад в фазе вкладов: в какой вариант, сколько; ответ — вклад
// и выбор после него. Жребий при ничьей адреса не имеет: его записывает сервер сам
export type ChoiceStakeRequest = { v?: number; option: string; amount: number; requestId?: string }
export type ChoiceStakeAct = ChoiceStake & { choice: string }
export type ChoiceStakeResponse = { v: number; stake: ChoiceStakeAct; choice: ChoiceView }

// POST /rooms/<номер>/offers — предложить пари. side не задана — «сбудется»; to не задан — открытое;
// guarantor не задан — ведущий; noGuarantor: true — без гаранта (Р-36; guarantor тогда не задают).
// «Торг до …» (Р-37): auction { start, step? } вместо odds — старт (наименьшая сумма соперника) и шаг (не
// задан — 10 % старта); только открытое; closesAt — конец торга (от 10 минут до 3 дней), expectedAt — не
// раньше конца + 30 минут. На обещание (Р-44): promise — своё обещание (что сделаю, если проиграю),
// takerPromise — соперника (не задано — то же); odds и amount тогда не смотрятся, торг — отказ.
// requestId — номер запроса (ULID): повтор — то же пари и тот же ответ
export type CreateOfferRequest = {
  v?: number
  condition: string
  check: string
  side?: 'yes' | 'no'
  odds?: { a: number; b: number } // у торга не нужен
  auction?: { start: number; step?: number }
  amount: number
  to?: string
  closesAt: number
  expectedAt: number
  guarantor?: string
  noGuarantor?: boolean
  subject?: string // о ком спор (Р-26); не задан — ни о ком
  promise?: string
  takerPromise?: string
  requestId?: string
}
export type CreateOfferResponse = { v: number; offer: OfferInfo }
// POST …/offers/<пари>/counter — встречное: свои кэф и/или сумма (не заданы — исходного) и «приём до»;
// гарант — выбор автора встречного (Р-36): guarantor — участник, noGuarantor: true — без гаранта, ни
// того ни другого — гарант исходного (у исходного без гаранта — тоже без); остальное — исходного,
// сторона — обратная, адресат — автор исходного. К пари на обещание (Р-44) — promise (своё; не задано —
// что исходное просило от соперника) и takerPromise (автора исходного; не задано — его прежнее) вместо
// odds и amount; к пари на сумму обещаний нет. Ответ — новое пари
export type CounterOfferRequest = {
  v?: number
  odds?: { a: number; b: number }
  amount?: number
  closesAt: number
  guarantor?: string
  noGuarantor?: boolean
  promise?: string
  takerPromise?: string
  requestId?: string
}
// POST …/offers/<пари>/accept и /revoke — принять и отозвать
export type OfferActRequest = { v?: number; requestId?: string }
export type AcceptOfferResponse = { v: number; accepted: OfferAct; offer: OfferInfo }
export type RevokeOfferResponse = { v: number; revoked: OfferAct }
// Торг (Р-37). POST …/offers/<пари>/bid { amount } — встречное: сколько ставишь против суммы автора;
// ответ — встречное и условия пари после него (takerAmount — лучшее). …/bid/accept {} — «принять
// сейчас», автор: bid — какое встречное принято. Ход торга — bidding в ответе комнаты
export type BidOfferRequest = { v?: number; amount: number; requestId?: string }
export type OfferBidAct = OfferAct & { amount: number }
export type BidOfferResponse = { v: number; bid: OfferBidAct; offer: OfferInfo }
export type OfferTakeAct = OfferAct & { bid: string }
export type TakeBidResponse = { v: number; taken: OfferTakeAct; offer: OfferInfo }
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
// когда приём закрылся досрочно предложением исхода (Р-27); закрыт в срок или ещё идёт — поля нет.
// times — сроки события, закреплённые при создании (Р-35; у старых — обычный набор; сервер до темпа
// поля не шлёт). hostId — ведущий на миг создания события (Р-42): по нему способ спора (решает ведущий
// или голосование); решает нынешний ведущий; нет поля — ведущий комнаты
export type EventView = EventInfo & {
  hostId?: string
  times?: TimesView
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
// member — заявка вышедшего с его именем: впустить — вернуть того же участника (Р-40); нет — новый
export type JoinRequestsResponse = { v: number; requests: { id: string; name: string; at: number; member?: string }[] }

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
  // Темп комнаты (Р-35): сервер без него (до выкатки) не ломает сайт
  if ((room.pace !== undefined && !PACE_VIEWS.includes(room.pace)) || !optionalTimes(room.times)) return false
  // Ведение (Р-42): сервер без него (до выкатки) не ломает сайт
  if (room.hosts !== undefined && !list(room.hosts, isHostTerm)) return false
  if ((room.hostSeenAt !== undefined && typeof room.hostSeenAt !== 'number') || (room.hostTakeFrom !== undefined && typeof room.hostTakeFrom !== 'number')) return false
  // Закрыта (Р-43): сервер без поля (до выкатки) не ломает сайт
  if (room.closed !== undefined && room.closed !== null && !isRoomClosed(room.closed)) return false
  if (typeof r.now !== 'number' || !Array.isArray(r.events) || !r.events.every(isEventView)) return false
  // Пари — с этапа 3: сервер без них (до выкатки) не ломает сайт
  if (r.offers !== undefined && !list(r.offers, isOfferView)) return false
  // Лоты — с этапа 7 (Р-38): сервер без них (до выкатки) не ломает сайт
  if (r.lots !== undefined && !(Array.isArray(r.lots) && r.lots.every(isLotView))) return false
  // Выборы — с этапа 7 (Р-39): сервер без них (до выкатки) не ломает сайт
  if (r.choices !== undefined && !(Array.isArray(r.choices) && r.choices.every(isChoiceView))) return false
  // Свод расчёта — с этапа 5: сервер без него (до выкатки) не ломает сайт
  if (r.settlement !== undefined && !isSettlementView(r.settlement)) return false
  // Вышел и «выбыл» (Р-40, Р-41): сервер без них (до выкатки) не ломает сайт
  const flag = (x: unknown) => x === undefined || typeof x === 'boolean'
  return r.members.every((m) => {
    const member = record(m)
    return !!member && strings(member, 'id', 'name') && flag(member.left) && flag(member.dropped)
  })
}

export function isLeaveResponse(x: unknown): x is LeaveResponse {
  const r = versioned(x)
  const left = r && record(r.left)
  return !!left && strings(left, 'id', 'by') && typeof left.at === 'number' && Array.isArray(left.revoked) && left.revoked.every((s) => typeof s === 'string')
}

const HOST_HOWS: readonly unknown[] = ['created', 'passed', 'taken']

function isHostTerm(r: Record<string, unknown>): boolean {
  return strings(r, 'id', 'member', 'by') && typeof r.from === 'number' && HOST_HOWS.includes(r.how)
}

export function isHostResponse(x: unknown): x is HostResponse {
  const r = versioned(x)
  const h = r && record(r.host)
  return !!h && isHostTerm(h) && strings(h, 'previous') && (h.seenAt === undefined || typeof h.seenAt === 'number')
}

function isRoomClosed(x: unknown): boolean {
  const r = record(x)
  return !!r && strings(r, 'id', 'by') && typeof r.at === 'number'
}

export function isCloseResponse(x: unknown): x is CloseResponse {
  const r = versioned(x)
  const c = r && record(r.closed)
  return !!c && isRoomClosed(c) && typeof c.closed === 'boolean'
}

export function isDropResponse(x: unknown): x is DropResponse {
  const r = versioned(x)
  const d = r && record(r.dropped)
  return !!d && strings(d, 'id', 'by', 'member') && typeof d.at === 'number' && typeof d.dropped === 'boolean'
}

function numbers(r: Record<string, unknown>, ...names: string[]): boolean {
  return names.every((n) => typeof r[n] === 'number')
}

const PACE_VIEWS: readonly unknown[] = ['normal', 'fast', 'custom']

function isTimes(x: unknown): boolean {
  const r = record(x)
  return !!r && numbers(r, 'objection', 'appeal', 'silence', 'court')
}

// Сроки темпа (Р-35) в ответе: нет поля (сервер до темпа) или четыре числа
function optionalTimes(x: unknown): boolean {
  return x === undefined || isTimes(x)
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
  if (r.verdict === 'keep' || r.verdict === 'cancel' || r.verdict === 'delivered' || r.verdict === 'undelivered') return true
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

function optionalString(x: unknown): boolean {
  return x === undefined || typeof x === 'string'
}

function isCourtView(r: Record<string, unknown>): boolean {
  return (
    optionalString(r.hostId) &&
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
  if (!optionalTimes(r.times) || !optionalString(r.hostId)) return false
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

const OFFER_STATUSES: readonly unknown[] = ['open', 'expired', 'withdrawn', 'countered', 'accepted', 'failed']

function orNull(x: unknown, type: 'string' | 'number'): boolean {
  return x === null || typeof x === type
}

function isOfferInfo(r: Record<string, unknown>): boolean {
  const odds = record(r.odds)
  return (
    strings(r, 'id', 'authorId', 'condition', 'check') &&
    orNull(r.guarantorId, 'string') &&
    numbers(r, 'at', 'amount', 'takerAmount', 'closesAt', 'expectedAt') &&
    (r.side === 'yes' || r.side === 'no') &&
    !!odds &&
    numbers(odds, 'a', 'b') &&
    orNull(r.to, 'string') &&
    orNull(r.counterTo, 'string') &&
    orNull(r.subjectId, 'string') &&
    typeof r.guarantorRule === 'boolean' &&
    optionalAuction(r.auction) &&
    optionalPromise(r.promise)
  )
}

// Обещания сторон (Р-44): нет поля — пари на сумму
function optionalPromise(x: unknown): boolean {
  const p = record(x)
  return x === undefined || (!!p && strings(p, 'author', 'taker'))
}

// Условия торга (Р-37): нет поля — обычное пари
function optionalAuction(x: unknown): boolean {
  const a = record(x)
  return x === undefined || (!!a && numbers(a, 'start', 'step', 'latestEnd'))
}

function isBid(r: Record<string, unknown>): boolean {
  return strings(r, 'id', 'by') && numbers(r, 'at', 'amount')
}

// Ход торга (Р-37): нет поля — обычное пари
function optionalBidding(x: unknown): boolean {
  if (x === undefined) return true
  const r = record(x)
  return (
    !!r &&
    list(r.bids, isBid) &&
    nullable(r.best, isBid) &&
    numbers(r, 'endsAt') &&
    nullable(r.result, (v) =>
      v.how === 'failed' ? numbers(v, 'at') : (v.how === 'now' || v.how === 'end') && numbers(v, 'at') && strings(v, 'bid'),
    )
  )
}

const OFFER_PHASES: readonly unknown[] = ['marking', 'guarantor', 'need-guarantor', 'court', 'approved', 'final', 'cancelled']
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
    orNull(r.guarantorId, 'string') &&
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
    optionalTimes(r.times) &&
    optionalBidding(r.bidding) &&
    OFFER_STATUSES.includes(r.status) &&
    nullable(r.accepted, (a) => strings(a, 'by') && numbers(a, 'at')) &&
    orNull(r.withdrawnAt, 'number') &&
    nullable(r.closedBy, (c) => strings(c, 'offer') && numbers(c, 'at')) &&
    nullable(r.outcome, isOfferOutcome)
  )
}

const LOT_STATUSES: readonly unknown[] = ['open', 'withdrawn', 'unsold', 'awaiting', 'handed', 'dispute', 'court', 'received', 'failed', 'undelivered']
const LOT_RECEIPTS: readonly unknown[] = ['mark', 'silence', 'court']

// Лот с сервера (Р-38) — и копия на устройстве; суд — нет поля, null или как положено
export function isLotView(x: unknown): x is LotView {
  const r = record(x)
  return (
    !!r &&
    strings(r, 'id', 'sellerId', 'title', 'description') &&
    numbers(r, 'at', 'start', 'step', 'closesAt', 'latestEnd', 'endsAt') &&
    isTimes(r.times) &&
    LOT_STATUSES.includes(r.status) &&
    list(r.bids, isBid) &&
    nullable(r.best, isBid) &&
    orNull(r.winner, 'string') &&
    orNull(r.amount, 'number') &&
    orNull(r.withdrawnAt, 'number') &&
    orNull(r.handedAt, 'number') &&
    orNull(r.declinedAt, 'number') &&
    orNull(r.disputedAt, 'number') &&
    orNull(r.disputeFrom, 'number') &&
    orNull(r.silenceUntil, 'number') &&
    nullable(r.received, (v) => numbers(v, 'at') && LOT_RECEIPTS.includes(v.how)) &&
    orNull(r.closedAt, 'number') &&
    (r.court === undefined || nullable(r.court, isCourtView))
  )
}

const CHOICE_STATUSES: readonly unknown[] = ['options', 'open', 'draw', 'decided', 'failed']

// Выбор с сервера (Р-39) — и копия на устройстве
export function isChoiceView(x: unknown): x is ChoiceView {
  const r = record(x)
  return (
    !!r &&
    strings(r, 'id', 'authorId', 'question', 'recipientId') &&
    typeof r.cashbox === 'boolean' &&
    numbers(r, 'at', 'optionsUntil', 'closesAt', 'latestEnd', 'endsAt') &&
    CHOICE_STATUSES.includes(r.status) &&
    (r.failed === null || r.failed === 'options' || r.failed === 'stakes') &&
    list(r.options, (o) => strings(o, 'id', 'by', 'title') && numbers(o, 'at', 'total')) &&
    list(r.stakes, (s) => strings(s, 'id', 'by', 'option') && numbers(s, 'at', 'amount')) &&
    orNull(r.winner, 'string') &&
    (r.how === null || r.how === 'sum' || r.how === 'draw') &&
    nullable(r.draw, (d) => numbers(d, 'at') && strings(d, 'seed') && Array.isArray(d.options) && d.options.every((o) => typeof o === 'string')) &&
    list(r.debts, (d) => strings(d, 'from', 'to') && numbers(d, 'amount')) &&
    orNull(r.closedAt, 'number')
  )
}

export function isChoiceResponse(x: unknown): x is ChoiceResponse {
  return recordIn(x, 'choice', isChoiceView)
}

export function isChoiceOptionResponse(x: unknown): x is ChoiceOptionResponse {
  return recordIn(x, 'option', (r) => strings(r, 'id', 'by', 'choice', 'title') && numbers(r, 'at')) && recordIn(x, 'choice', isChoiceView)
}

export function isChoiceStakeResponse(x: unknown): x is ChoiceStakeResponse {
  return recordIn(x, 'stake', (r) => strings(r, 'id', 'by', 'choice', 'option') && numbers(r, 'at', 'amount')) && recordIn(x, 'choice', isChoiceView)
}

const LOT_MARKS: readonly unknown[] =['withdrawn', 'handed', 'declined', 'received', 'disputed']

function isLotAct(r: Record<string, unknown>): boolean {
  return strings(r, 'id', 'by', 'lot') && numbers(r, 'at')
}

export function isLotResponse(x: unknown): x is LotResponse {
  return recordIn(x, 'lot', isLotView)
}

export function isBidLotResponse(x: unknown): x is BidLotResponse {
  return recordIn(x, 'bid', (r) => isLotAct(r) && numbers(r, 'amount')) && recordIn(x, 'lot', isLotView)
}

export function isLotMarkResponse(x: unknown): x is LotMarkResponse {
  return recordIn(x, 'marked', (r) => isLotAct(r) && LOT_MARKS.includes(r.mark)) && recordIn(x, 'lot', isLotView)
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

export function isBidOfferResponse(x: unknown): x is BidOfferResponse {
  return recordIn(x, 'bid', (r) => isOfferAct(r) && numbers(r, 'amount')) && recordIn(x, 'offer', isOfferInfo)
}

export function isTakeBidResponse(x: unknown): x is TakeBidResponse {
  return recordIn(x, 'taken', (r) => isOfferAct(r) && strings(r, 'bid')) && recordIn(x, 'offer', isOfferInfo)
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

const SETTLE_MODE_VIEWS: readonly unknown[] = ['stakes', 'fewest']
const TRANSFER_STATUSES: readonly unknown[] = ['pending', 'received', 'rejected', 'cancelled']

function isSettleSum(x: unknown): boolean {
  const r = record(x)
  return (
    !!r &&
    numbers(r, 'amount', 'events', 'offers') &&
    (r.lots === undefined || typeof r.lots === 'number') &&
    (r.choices === undefined || typeof r.choices === 'number')
  )
}

function isTransferView(r: Record<string, unknown>): boolean {
  return (
    strings(r, 'id', 'from', 'to') &&
    numbers(r, 'at', 'amount', 'changedAt') &&
    (r.by === 'sender' || r.by === 'receiver') &&
    TRANSFER_STATUSES.includes(r.status)
  )
}

// Свод расчёта в состоянии комнаты (Р-32)
export function isSettlementView(x: unknown): x is SettlementView {
  const r = record(x)
  return (
    !!r &&
    SETTLE_MODE_VIEWS.includes(r.mode) &&
    list(
      r.members,
      (m) => strings(m, 'memberId') && isSettleSum(m.total) && isSettleSum(m.pending) && isSettleSum(m.inPlay) && numbers(m, 'sent', 'received', 'balance'),
    ) &&
    list(r.transfers, isTransferView) &&
    list(r.suggestions, (s) => strings(s, 'from', 'to') && numbers(s, 'amount')) &&
    (r.promises === undefined || list(r.promises, isPromiseView))
  )
}

const PROMISE_STATUSES: readonly unknown[] = ['waiting', 'kept', 'received', 'rejected']

function isPromiseView(r: Record<string, unknown>): boolean {
  return strings(r, 'offer', 'from', 'to', 'text') && numbers(r, 'at', 'changedAt') && PROMISE_STATUSES.includes(r.status)
}

export function isTransferResponse(x: unknown): x is TransferResponse {
  return recordIn(x, 'transfer', isTransferView)
}

export function isPromiseResponse(x: unknown): x is PromiseResponse {
  return recordIn(x, 'promise', isPromiseView)
}

export function isSettleModeResponse(x: unknown): x is SettleModeResponse {
  return recordIn(x, 'settleMode', (r) => strings(r, 'id', 'by') && numbers(r, 'at') && SETTLE_MODE_VIEWS.includes(r.mode))
}

export function isPaceResponse(x: unknown): x is PaceResponse {
  return recordIn(x, 'pace', (r) => strings(r, 'id', 'by') && numbers(r, 'at') && PACE_VIEWS.includes(r.pace) && isTimes(r.times))
}
