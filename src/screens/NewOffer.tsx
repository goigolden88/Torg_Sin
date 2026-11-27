// «Предложить пари» (Р-04): условие, «как проверяем», своя сторона («сбудется» / «не сбудется»), кэф
// «a к b», своя сумма, кому (участник или «открытое — любой»), «приём до», «исход к», гарант (по
// умолчанию ведущий; ведущий — сторона — выбрать обязательно; «без гаранта» — разошлись, решит суд,
// Р-36: только если судить есть кому, иначе вариант закрыт с объяснением), о ком спор (по желанию, Р-26: предмет —
// только на «сбудется» и не гарант; сторона тогда — одна). Под формой по ходу ввода — «вы ставите
// …, соперник — …, банк …» (offerStakes). «Предложить» — окно подтверждения; повтор той же формы —
// тот же номер запроса: двойное нажатие и повтор после «нет связи» дают одно пари (Р-13). Отказ
// сервера — текстом под формой, введённое остаётся. Проверка до отправки — правила (offer.ts). Под
// сроками — сроки комнаты (темп, Р-35). «Как примут» (Р-37): «Принимает первый» или «Торг до …» — вместо
// кэфа старт (наименьшая сумма соперника) и шаг (подставлен 10 % старта), «Приём до» — «Конец торга» со
// строкой «Торг закончится не позже …», адресата нет. repeat — «Повторить» не состоявшийся торг: те же
// условия, сроки — та же длительность от нового «сейчас» (repeatForm). В «Кому» и «Гарант» — только кто в
// игре: вышедших и помеченных «выбыл» нет (Р-40, Р-41). «На кону» (Р-44): «Сумма» или «Обещание» — тогда
// «Если проиграю, я…» и «Если проиграет он…» (по умолчанию — то же); кэф, сумма и «Как примут» скрыты
import { useCallback, useRef, useState, type FormEvent } from 'react'
import { createOffer } from '../api'
import { currency as currencyOf, isCurrencyCode, parseAmount, type CurrencyCode } from '../rules/currency'
import { formatDateTime, fromLocalInput, toLocalInput } from '../rules/date'
import { MAX_EVENT_TEXT } from '../rules/event'
import {
  auctionStep,
  BAD_ODDS,
  BAD_START,
  BAD_STEP,
  checkOfferInput,
  checkOfferSubject,
  checkOfferTimes,
  NEED_GUARANTOR,
  NEED_GUARANTOR_SUBJECT,
  NEED_TIMES,
  offerGuarantor,
  offerStakes,
  type OfferInput,
} from '../rules/offer'
import { formKey, requestFor, type PendingRequest } from '../rules/request'
import { ulid } from '../rules/ulid'
import { savedOffers, type SavedRoom } from '../store/db'
import { BackLink, useEscape } from './BackLink'
import { money, nameOf, SMALL_ROOM, SMALL_ROOM_NOTE } from './eventParts'
import {
  auctionSummary,
  latestEndLine,
  OddsField,
  oddsLabel,
  oddsNumber,
  offerHref,
  promiseSummary,
  repeatForm,
  roomRolesOf,
  sideLabel,
  unitsText,
  validOdds,
} from './offerParts'
import { inPlayMember } from './memberParts'
import { roomTimesLine, spanText } from './paceParts'
import { NORMAL_TIMES } from '../rules/pace'
import { serverTime, useRoom } from './useRoom'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

// Подсказка сроков, как у события: приём — до завтра к ровному часу, исход — ещё через сутки
function defaultTimes(now: number): { closes: string; expected: string } {
  const closes = Math.ceil((now + DAY) / HOUR) * HOUR
  return { closes: toLocalInput(closes), expected: toLocalInput(closes + DAY) }
}

const UNKNOWN_CURRENCY = 'Валюта комнаты незнакома этой версии сайта — обновите страницу'

// Проверенная форма и гарант, которого покажем в подтверждении
type Ask = { input: OfferInput; guarantorId: string | null }

export function NewOffer({ room, repeat, onUpdate }: { room: SavedRoom; repeat?: string; onUpdate: (room: SavedRoom) => void }) {
  const { sync, clock, pace, refresh } = useRoom(room, onUpdate)
  const code = isCurrencyCode(room.currency) ? room.currency : null
  // «Повторить» (Р-37): условия не состоявшегося торга, сроки — от нового «сейчас»; пари нет — пустая форма
  const [again] = useState(() => {
    const source = repeat ? savedOffers(room).find((o) => o.id === repeat) : undefined
    return source ? repeatForm(source, room.hostId, serverTime(clock)) : null
  })
  const field = (n: number | undefined) => (n !== undefined && code ? unitsText(n, code) : '')
  const [condition, setCondition] = useState(again?.condition ?? '')
  const [check, setCheck] = useState(again?.check ?? '')
  const [side, setSide] = useState<'yes' | 'no'>(again?.side ?? 'yes')
  const [mode, setMode] = useState<'first' | 'auction'>(again ? 'auction' : 'first') // «Принимает первый» / «Торг до …»
  const [stake, setStake] = useState<'money' | 'promise'>('money') // на кону — сумма / обещание (Р-44)
  const [promise, setPromise] = useState('') // «Если проиграю, я…»
  const [theirs, setTheirs] = useState<string | null>(null) // «Если проиграет он…»; null — то же, что своё
  const [a, setA] = useState('1')
  const [b, setB] = useState('1')
  const [amount, setAmount] = useState(field(again?.amount))
  const [start, setStart] = useState(field(again?.start)) // старт торга — наименьшая сумма соперника
  const [step, setStep] = useState<string | null>(again ? field(again.step) : null) // null — подставлен 10 % старта
  const [to, setTo] = useState('') // пусто — открытое
  const [times] = useState(() => defaultTimes(Date.now()))
  const [closes, setCloses] = useState(again ? toLocalInput(again.closesAt) : times.closes)
  const [expected, setExpected] = useState(again ? toLocalInput(again.expectedAt) : times.expected)
  const [guarantor, setGuarantor] = useState(again?.guarantor ?? '') // пусто — ведущий
  const [none, setNone] = useState(again?.none ?? false) // без гаранта (Р-36): разошлись — суд
  const [subject, setSubject] = useState(again?.subject ?? '') // о ком спор (Р-26); пусто — ни о ком
  const [error, setError] = useState('')
  const [ask, setAsk] = useState<Ask | null>(null)
  const [busy, setBusy] = useState(false)
  // Синхронный замок: второе нажатие приходит раньше, чем React перерисует кнопку
  const sending = useRef(false)
  const pending = useRef<PendingRequest | null>(null)
  const back = '#/room/' + room.id

  useEscape(
    useCallback(() => {
      if (sending.current) return
      if (ask) setAsk(null)
      else location.hash = back
    }, [ask, back]),
  )

  const sign = code ? currencyOf(code).sign || code : room.currency
  const promised = stake === 'promise'
  const theirText = theirs ?? promise
  // На обещание (Р-44) торга нет: «Как примут» скрыт, принимает первый (или адресат)
  const auction = mode === 'auction' && !promised
  // Торг: старт и шаг из полей; шаг не трогали — подставлен 10 % старта (auctionStep)
  const parse = (text: string) => {
    if (!code || !text.trim()) return null
    const p = parseAmount(text, code)
    return p.ok ? p.units : null
  }
  const startUnits = parse(start)
  const stepText = step ?? (startUnits !== null && code ? unitsText(auctionStep(startUnits), code) : '')
  const endAt = fromLocalInput(closes) // конец торга — для строки «Торг закончится не позже …»
  const others = room.members.filter((m) => m.id !== room.memberId)
  // Адресат и гарант — только из тех, кто в игре: вышедших и помеченных «выбыл» в выборе нет (Р-40, Р-41)
  const players = others.filter(inPlayMember)
  // Ведущий — автор, адресат или предмет спора: гаранта по умолчанию нет, выбрать обязательно
  const hostIsSide = room.hostId === room.memberId || room.hostId === to
  const hostNoDefault = hostIsSide || room.hostId === subject
  const candidates = players.filter((m) => m.id !== to && m.id !== room.hostId && m.id !== subject)
  // Предмет спора (Р-26) — только на «сбудется»: предмет — вы — ваша сторона «сбудется»; предмет —
  // адресат — ваша «не сбудется». Иначе сторону выбираете сами
  const fixedSide: 'yes' | 'no' | null = subject === '' ? null : subject === room.memberId ? 'yes' : subject === to ? 'no' : null
  const mySide = fixedSide ?? side
  // «Без гаранта» — только если судить есть кому (правило offerGuarantor, как у сервера)
  const noneOk = (toId: string, subjectId: string) =>
    offerGuarantor({ to: toId || null, guarantor: null, noGuarantor: true, subject: subjectId || null }, room.memberId, roomRolesOf(room)).ok
  const mayNone = noneOk(to, subject)
  const silence = spanText((pace?.times ?? NORMAL_TIMES).silence)

  // Торг — только открытое (Р-37): адресат снимается
  function chooseMode(next: 'first' | 'auction') {
    setMode(next)
    if (next === 'auction') chooseTo('')
  }

  function chooseTo(id: string) {
    setTo(id)
    // Адресат не бывает гарантом; ведущий стал стороной — его по умолчанию больше нет
    if (guarantor === id) setGuarantor('')
    if (!noneOk(id, subject)) setNone(false)
  }

  function chooseSubject(id: string) {
    setSubject(id)
    // Предмет спора не бывает гарантом
    if (guarantor === id) setGuarantor('')
    if (!noneOk(to, id)) setNone(false)
  }

  function chooseGuarantor(id: string) {
    setGuarantor(id)
    setNone(false)
  }

  function chooseNone() {
    setGuarantor('')
    setNone(true)
  }

  // Сумма из поля: целые минимальные единицы или отказ правил валюты
  function units(): { ok: true; value: number } | { ok: false; error: string } {
    if (!code) return { ok: false, error: UNKNOWN_CURRENCY }
    const parsed = parseAmount(amount, code)
    return parsed.ok ? { ok: true, value: parsed.units } : parsed
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (sending.current) return
    const closesAt = fromLocalInput(closes)
    const expectedAt = fromLocalInput(expected)
    if (closesAt === null || expectedAt === null) return setError(NEED_TIMES)
    // На обещание (Р-44): суммы и кэфа нет — обещания проверяют правила (пустое — свой отказ, а не null)
    const sum = promised ? ({ ok: true, value: 0 } as const) : units()
    if (!sum.ok) return setError(sum.error)
    // Торг (Р-37): старт и шаг — суммы валюты; пусто или не сумма — отказ правил своим текстом
    let terms: { start: number; step: number } | null = null
    if (auction) {
      if (!code) return setError(UNKNOWN_CURRENCY)
      const s = parseAmount(start, code)
      if (!s.ok) return setError(start.trim() ? s.error : BAD_START)
      const st = parseAmount(stepText, code)
      if (!st.ok) return setError(stepText.trim() ? st.error : BAD_STEP)
      terms = { start: s.units, step: st.units }
    }
    const checked = checkOfferInput({
      condition,
      check,
      side: mySide,
      ...(promised
        ? { promise, takerPromise: theirText }
        : { ...(terms ? { auction: terms } : { odds: { a: oddsNumber(a), b: oddsNumber(b) } }), amount: sum.value }),
      to: auction ? null : to || null,
      closesAt,
      expectedAt,
      guarantor: none ? null : guarantor || null,
      ...(none && { noGuarantor: true }),
      subject: subject || null,
    })
    if (!checked.ok) return setError(checked.error)
    const g = offerGuarantor(checked.value, room.memberId, roomRolesOf(room))
    if (!g.ok) return setError(g.error)
    const about = checkOfferSubject(checked.value, room.memberId, roomRolesOf(room))
    if (about) return setError(about)
    const late = checkOfferTimes(checked.value, serverTime(clock))
    if (late) return setError(late)
    setError('')
    setAsk({ input: checked.value, guarantorId: g.value })
  }

  async function confirm() {
    if (!ask || sending.current) return
    const x = ask.input
    const terms = x.auction
      ? ['auction', String(x.auction.start), String(x.auction.step)]
      : x.promise
        ? ['promise', x.promise.author, x.promise.taker]
        : []
    const form = formKey(room.id, x.condition, x.check, x.side, String(x.odds.a), String(x.odds.b), String(x.amount), x.to ?? '', String(x.closesAt), String(x.expectedAt), x.noGuarantor ? 'none' : (x.guarantor ?? ''), x.subject ?? '', ...terms)
    const request = requestFor(pending.current, form, ulid)
    pending.current = request
    sending.current = true
    setBusy(true)
    try {
      const res = await createOffer(room.server, room.id, room.key, {
        condition: x.condition,
        check: x.check,
        side: x.side,
        // Торг (Р-37): старт и шаг вместо кэфа; на обещание (Р-44) — обещания вместо кэфа и суммы
        ...(x.promise
          ? { promise: x.promise.author, takerPromise: x.promise.taker }
          : x.auction
            ? { auction: { start: x.auction.start, step: x.auction.step } }
            : { odds: x.odds }),
        amount: x.amount, // на обещание — 0, сервер его не смотрит
        ...(x.to ? { to: x.to } : {}),
        closesAt: x.closesAt,
        expectedAt: x.expectedAt,
        ...(x.guarantor ? { guarantor: x.guarantor } : {}),
        ...(x.noGuarantor ? { noGuarantor: true } : {}),
        ...(x.subject ? { subject: x.subject } : {}),
        requestId: request.requestId,
      })
      if (!res.ok) {
        setAsk(null)
        return setError(res.error)
      }
      pending.current = null
      await refresh() // пари — в комнату на устройстве; не вышло — экран пари спросит сам
      location.hash = offerHref(room.id, res.value.offer.id)
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  return (
    <div className="card event-form offer-form">
      <BackLink href={back} />
      <h2>Предложить пари</h2>
      {again && <p className="hint">Повтор торга, который не состоялся: условия те же, сроки — от сейчас. Можно поправить до отправки.</p>}
      {sync.state === 'fail' && <p className="error">{sync.text}</p>}
      {/* Как «Новое событие»: две обёртки-колонки, до 1280 px одна под другой (styles.css) */}
      <form className="form" onSubmit={submit}>
        <div className="form-col">
          <label className="field">
            <span>Условие</span>
            <textarea
              className="input textarea"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              maxLength={MAX_EVENT_TEXT * 2}
              rows={2}
              placeholder="Например: Боря подтянется 20 раз до конца месяца"
            />
          </label>
          <label className="field">
            <span>Как проверяем</span>
            <textarea
              className="input textarea"
              value={check}
              onChange={(e) => setCheck(e.target.value)}
              maxLength={MAX_EVENT_TEXT * 2}
              rows={2}
              placeholder="Например: видео в общий чат"
            />
          </label>
          <fieldset className="field">
            <legend>Ваша сторона</legend>
            <div className="chips">
              {fixedSide !== 'no' && (
                <label className="chip">
                  <input type="radio" name="offer-side" checked={mySide === 'yes'} onChange={() => setSide('yes')} />
                  <span>Сбудется</span>
                </label>
              )}
              {fixedSide !== 'yes' && (
                <label className="chip">
                  <input type="radio" name="offer-side" checked={mySide === 'no'} onChange={() => setSide('no')} />
                  <span>Не сбудется</span>
                </label>
              )}
            </div>
            {fixedSide && (
              <span className="hint">
                {fixedSide === 'yes'
                  ? 'Спор о вас: предмет спора — только на стороне «сбудется».'
                  : `Предмет спора — ${nameOf(room, subject)}, кому вы предлагаете: предмету спора доступна только сторона «сбудется», поэтому ваша сторона — «не сбудется».`}
              </span>
            )}
          </fieldset>
          <fieldset className="field">
            <legend>О ком спор</legend>
            <div className="chips">
              <label className="chip">
                <input type="radio" name="offer-subject" value="" checked={subject === ''} onChange={() => chooseSubject('')} />
                <span>Ни о ком</span>
              </label>
              {room.members.map((m) => (
                <label key={m.id} className="chip">
                  <input type="radio" name="offer-subject" value={m.id} checked={subject === m.id} onChange={() => chooseSubject(m.id)} />
                  <span>
                    {m.name}
                    {m.id === room.memberId ? ' (вы)' : ''}
                  </span>
                </label>
              ))}
            </div>
            <span className="hint">По желанию. Предмет спора бывает только на стороне «сбудется» и не бывает гарантом.</span>
          </fieldset>
          <fieldset className="field">
            <legend>На кону</legend>
            <div className="chips">
              <label className="chip">
                <input type="radio" name="offer-stake" value="money" checked={!promised} onChange={() => setStake('money')} />
                <span>Сумма</span>
              </label>
              <label className="chip">
                <input type="radio" name="offer-stake" value="promise" checked={promised} onChange={() => setStake('promise')} />
                <span>Обещание</span>
              </label>
            </div>
            <span className="hint">
              {promised
                ? 'Проигравший исполняет своё обещание: «везу шашлык», «мою машину». Денег нет — итог и «кто кому» не меняются, исполнение отмечают в «Расчёте».'
                : `Ставки — в валюте комнаты, ${sign}.`}
            </span>
          </fieldset>
          {promised && (
            <>
              <label className="field">
                <span>Если проиграю, я…</span>
                <textarea
                  className="input textarea"
                  value={promise}
                  onChange={(e) => setPromise(e.target.value)}
                  maxLength={MAX_EVENT_TEXT * 2}
                  rows={2}
                  placeholder="Например: везу шашлык"
                />
              </label>
              <label className="field">
                <span>Если проиграет он…</span>
                <textarea
                  className="input textarea"
                  value={theirText}
                  onChange={(e) => setTheirs(e.target.value)}
                  maxLength={MAX_EVENT_TEXT * 2}
                  rows={2}
                  placeholder="Например: моет машину"
                />
                <span className="hint">{theirs === null ? 'По умолчанию — то же, что у вас. Можно поменять.' : 'Что сделает соперник, если проиграет.'}</span>
              </label>
            </>
          )}
          {!promised && (
          <fieldset className="field">
            <legend>Как примут</legend>
            <div className="chips">
              <label className="chip">
                <input type="radio" name="offer-mode" value="first" checked={!auction} onChange={() => chooseMode('first')} />
                <span>Принимает первый</span>
              </label>
              <label className="chip">
                <input type="radio" name="offer-mode" value="auction" checked={auction} onChange={() => chooseMode('auction')} />
                <span>Торг до …</span>
              </label>
            </div>
            <span className="hint">
              {auction
                ? 'Участники до конца торга перебивают друг друга: сколько поставят против вашей суммы. Кто даст больше всех — тот соперник; лучшее можно принять и раньше.'
                : 'Ваш кэф и сумма — кто первый примет, тот соперник.'}
            </span>
          </fieldset>
          )}
          {!auction && !promised && <OddsField a={a} b={b} onA={setA} onB={setB} mine="Вы рискуете" theirs="Соперник" />}
          {!promised && (
            <label className="field">
              <span>Ваша сумма, {sign}</span>
              <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Например: 300" autoComplete="off" />
            </label>
          )}
          {auction && (
            <div className="times">
              <label className="field">
                <span>Старт, {sign}</span>
                <input className="input" inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} placeholder="Например: 1000" autoComplete="off" />
                <span className="hint">Наименьшая сумма соперника</span>
              </label>
              <label className="field">
                <span>Шаг, {sign}</span>
                <input className="input" inputMode="decimal" value={stepText} onChange={(e) => setStep(e.target.value)} autoComplete="off" />
                <span className="hint">{step === null ? 'Подставлено 10 % старта' : 'Новое встречное больше лучшего хотя бы на шаг'}</span>
              </label>
            </div>
          )}
        </div>

        <div className="form-col">
          {auction ? (
            <p className="hint">Кому: торг — открытое пари, адресата у него нет. Перебивать может любой участник, кроме гаранта.</p>
          ) : (
          <fieldset className="field">
            <legend>Кому</legend>
            <div className="chips">
              <label className="chip">
                <input type="radio" name="offer-to" value="" checked={to === ''} onChange={() => chooseTo('')} />
                <span>Открытое — любой</span>
              </label>
              {players.map((m) => (
                <label key={m.id} className="chip">
                  <input type="radio" name="offer-to" value={m.id} checked={to === m.id} onChange={() => chooseTo(m.id)} />
                  <span>{m.name}</span>
                </label>
              ))}
            </div>
            <span className="hint">Открытое примет любой участник, кроме гаранта; адресное — только тот, кому предложено.</span>
          </fieldset>
          )}

          <div className="times">
            <label className="field">
              <span>{auction ? 'Конец торга' : 'Приём до'}</span>
              <input className="input" type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} />
            </label>
            <label className="field">
              <span>Исход к</span>
              <input className="input" type="datetime-local" value={expected} onChange={(e) => setExpected(e.target.value)} />
            </label>
          </div>
          {auction ? (
            <>
              <p className="hint">Торг — от 10 минут до 3 дней; «исход к» — не раньше чем через 30 минут после конца торга. Время — местное, торг закрывается по часам сервера.</p>
              {endAt !== null && <p className="hint">{latestEndLine(endAt)}</p>}
            </>
          ) : (
            <p className="hint">Время — местное, на этом устройстве. Приём закрывается по часам сервера.</p>
          )}
          {pace && <p className="hint">{roomTimesLine(pace)}</p>}

          <fieldset className="field">
            <legend>Гарант</legend>
            <div className="chips">
              {!hostNoDefault && (
                <label className="chip">
                  <input type="radio" name="offer-guarantor" value="" checked={!none && guarantor === ''} onChange={() => chooseGuarantor('')} />
                  <span>Ведущий — {nameOf(room, room.hostId)}</span>
                </label>
              )}
              {candidates.map((m) => (
                <label key={m.id} className="chip">
                  <input type="radio" name="offer-guarantor" value={m.id} checked={!none && guarantor === m.id} onChange={() => chooseGuarantor(m.id)} />
                  <span>{m.name}</span>
                </label>
              ))}
              {/* Без гаранта (Р-36): судить некому — вариант виден, но закрыт, ниже — почему */}
              <label className="chip">
                <input type="radio" name="offer-guarantor" value="none" checked={none} onChange={chooseNone} disabled={!mayNone} />
                <span>Без гаранта — разойдётесь, решит суд</span>
              </label>
            </div>
            <span className="hint">
              {none
                ? `Отметите одинаково — исход окончательный сразу. Разойдётесь или соперник промолчит ${silence} — суд жребием из участников.`
                : hostNoDefault && guarantor === ''
                  ? (hostIsSide ? NEED_GUARANTOR : NEED_GUARANTOR_SUBJECT) + '.'
                  : `Гарант решает исход, если вы с соперником разойдётесь или кто-то промолчит ${silence}. Он не принимает пари.`}
            </span>
            {!mayNone && (
              <span className="hint">
                «Без гаранта» недоступно: судить некому.{' '}
                {to
                  ? `Нужен хотя бы один участник, кроме вас, ${nameOf(room, to)}${subject && subject !== to && subject !== room.memberId ? ' и предмета спора' : ''}.`
                  : `Нужны хотя бы двое, кроме вас${subject && subject !== room.memberId ? ' и предмета спора' : ''}: один примет пари, другой рассудит.`}
              </span>
            )}
          </fieldset>
          {room.members.length < SMALL_ROOM && <p className="hint">{SMALL_ROOM_NOTE}</p>}
        </div>

        {promised ? (
          <div className="offer-summary" aria-live="polite">
            <p>{promiseSummary(promise, theirText)}</p>
          </div>
        ) : auction ? (
          <div className="offer-summary" aria-live="polite">
            <p>{auctionSummary({ side: mySide, amount: parse(amount), start: startUnits, step: parse(stepText), currency: room.currency })}</p>
          </div>
        ) : (
          <Summary side={mySide} a={a} b={b} amount={amount} code={code} currency={room.currency} />
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button className="button" type="submit" disabled={busy}>
            Предложить
          </button>
          <a className="button secondary" href={back}>
            Отмена
          </a>
        </div>
      </form>

      {ask && <ConfirmOffer room={room} ask={ask} busy={busy} onConfirm={confirm} onClose={() => !sending.current && setAsk(null)} />}
    </div>
  )
}

// Под формой по ходу ввода: сколько ставит каждая сторона и банк — по правилам (offerStakes)
function Summary({
  side,
  a,
  b,
  amount,
  code,
  currency,
}: {
  side: 'yes' | 'no'
  a: string
  b: string
  amount: string
  code: CurrencyCode | null
  currency: string
}) {
  let text: string
  let hint = ''
  const odds = { a: oddsNumber(a), b: oddsNumber(b) }
  const parsed = code && amount.trim() ? parseAmount(amount, code) : null
  if (!amount.trim()) text = 'Введите свою сумму — здесь появится, сколько ставит каждый.'
  else if (!code) text = UNKNOWN_CURRENCY
  else if (!parsed || !parsed.ok) text = parsed ? parsed.error : ''
  else if (!validOdds(odds)) text = BAD_ODDS
  else {
    const s = offerStakes(odds, parsed.units)
    if (!s.ok) text = s.error
    else {
      const sum = (n: number) => money(n, currency)
      text = `Вы ставите ${sum(s.value.author)} на „${sideLabel(side)}“, соперник — ${sum(s.value.taker)} на „${sideLabel(side === 'yes' ? 'no' : 'yes')}“, банк ${sum(s.value.bank)} (кэф ${oddsLabel(odds)}).`
      if (!s.value.exact) hint = 'Сумма соперника — вниз до целой единицы.'
    }
  }
  return (
    <div className="offer-summary" aria-live="polite">
      <p>{text}</p>
      {hint && <p className="hint">{hint}</p>}
    </div>
  )
}

// Окно подтверждения: всё, что уйдёт на сервер, — словами и числами с основанием
function ConfirmOffer({ room, ask, busy, onConfirm, onClose }: { room: SavedRoom; ask: Ask; busy: boolean; onConfirm: () => void; onClose: () => void }) {
  const x = ask.input
  const s = offerStakes(x.odds, x.amount)
  const sum = (n: number) => money(n, room.currency)
  const terms = x.auction
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Подтверждение пари" onClick={(e) => e.stopPropagation()}>
        <p className="modal-question">{terms ? 'Начать торг?' : 'Предложить пари?'}</p>
        <p>„{x.condition}“</p>
        {x.promise ? (
          <>
            <p>Вы — за „{sideLabel(x.side)}“, соперник — за „{sideLabel(x.side === 'yes' ? 'no' : 'yes')}“.</p>
            <p>{promiseSummary(x.promise.author, x.promise.taker)}</p>
          </>
        ) : terms ? (
          <p>{auctionSummary({ side: x.side, amount: x.amount, start: terms.start, step: terms.step, currency: room.currency })}</p>
        ) : (
          s.ok && (
            <p>
              Вы ставите {sum(s.value.author)} на „{sideLabel(x.side)}“, соперник — {sum(s.value.taker)} (кэф {oddsLabel(x.odds)}), банк{' '}
              {sum(s.value.bank)}.
            </p>
          )
        )}
        <p className="hint">
          {terms ? 'Торг — открытое' : `Кому: ${x.to ? nameOf(room, x.to) : 'открытое — любой'}`} ·{' '}
          {ask.guarantorId === null ? 'без гаранта: разойдётесь — решит суд' : `гарант — ${nameOf(room, ask.guarantorId)}`}
          {x.subject ? ` · о ком спор — ${nameOf(room, x.subject)}` : ''} · {terms ? 'торг до' : 'приём до'} {formatDateTime(x.closesAt)} · исход к{' '}
          {formatDateTime(x.expectedAt)}
        </p>
        {terms && <p className="hint">{latestEndLine(x.closesAt)}</p>}
        <p className="hint">
          {terms
            ? 'Лучшее встречное к концу торга примется само — отклонить его нельзя. Отозвать торг можно, пока встречных нет.'
            : 'Пока пари не приняли, его можно отозвать.'}
        </p>
        <div className="row">
          <button className="button" type="button" onClick={onConfirm} disabled={busy} autoFocus>
            {busy ? 'Предлагаю…' : 'Предложить'}
          </button>
          <button className="button secondary" type="button" onClick={onClose} disabled={busy}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}
