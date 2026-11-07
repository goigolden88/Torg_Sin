// «Предложить пари» (Р-04): условие, «как проверяем», своя сторона («сбудется» / «не сбудется»), кэф
// «a к b», своя сумма, кому (участник или «открытое — любой»), «приём до», «исход к», гарант (по
// умолчанию ведущий; ведущий — сторона — выбрать обязательно). Под формой по ходу ввода — «вы ставите
// …, соперник — …, банк …» (offerStakes). «Предложить» — окно подтверждения; повтор той же формы —
// тот же номер запроса: двойное нажатие и повтор после «нет связи» дают одно пари (Р-13). Отказ
// сервера — текстом под формой, введённое остаётся. Проверка до отправки — правила (offer.ts)
import { useCallback, useRef, useState, type FormEvent } from 'react'
import { createOffer } from '../api'
import { currency as currencyOf, isCurrencyCode, parseAmount, type CurrencyCode } from '../rules/currency'
import { formatDateTime, fromLocalInput, toLocalInput } from '../rules/date'
import { MAX_EVENT_TEXT } from '../rules/event'
import { BAD_ODDS, checkOfferInput, checkOfferTimes, NEED_GUARANTOR, NEED_TIMES, offerGuarantor, offerStakes, type OfferInput } from '../rules/offer'
import { formKey, requestFor, type PendingRequest } from '../rules/request'
import { ulid } from '../rules/ulid'
import type { SavedRoom } from '../store/db'
import { BackLink, useEscape } from './BackLink'
import { money, nameOf } from './eventParts'
import { OddsField, oddsLabel, oddsNumber, offerHref, roomRolesOf, sideLabel, validOdds } from './offerParts'
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
type Ask = { input: OfferInput; guarantorId: string }

export function NewOffer({ room, onUpdate }: { room: SavedRoom; onUpdate: (room: SavedRoom) => void }) {
  const { sync, clock, refresh } = useRoom(room, onUpdate)
  const [condition, setCondition] = useState('')
  const [check, setCheck] = useState('')
  const [side, setSide] = useState<'yes' | 'no'>('yes')
  const [a, setA] = useState('1')
  const [b, setB] = useState('1')
  const [amount, setAmount] = useState('')
  const [to, setTo] = useState('') // пусто — открытое
  const [times] = useState(() => defaultTimes(Date.now()))
  const [closes, setCloses] = useState(times.closes)
  const [expected, setExpected] = useState(times.expected)
  const [guarantor, setGuarantor] = useState('') // пусто — ведущий
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

  const code = isCurrencyCode(room.currency) ? room.currency : null
  const sign = code ? currencyOf(code).sign || code : room.currency
  const others = room.members.filter((m) => m.id !== room.memberId)
  // Ведущий — автор или адресат: гаранта по умолчанию нет, выбрать обязательно
  const hostIsSide = room.hostId === room.memberId || room.hostId === to
  const candidates = others.filter((m) => m.id !== to && m.id !== room.hostId)

  function chooseTo(id: string) {
    setTo(id)
    // Адресат не бывает гарантом; ведущий стал стороной — его по умолчанию больше нет
    if (guarantor === id) setGuarantor('')
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
    const sum = units()
    if (!sum.ok) return setError(sum.error)
    const checked = checkOfferInput({
      condition,
      check,
      side,
      odds: { a: oddsNumber(a), b: oddsNumber(b) },
      amount: sum.value,
      to: to || null,
      closesAt,
      expectedAt,
      guarantor: guarantor || null,
    })
    if (!checked.ok) return setError(checked.error)
    const g = offerGuarantor(checked.value, room.memberId, roomRolesOf(room))
    if (!g.ok) return setError(g.error)
    const late = checkOfferTimes(checked.value, serverTime(clock))
    if (late) return setError(late)
    setError('')
    setAsk({ input: checked.value, guarantorId: g.value })
  }

  async function confirm() {
    if (!ask || sending.current) return
    const x = ask.input
    const form = formKey(room.id, x.condition, x.check, x.side, String(x.odds.a), String(x.odds.b), String(x.amount), x.to ?? '', String(x.closesAt), String(x.expectedAt), x.guarantor ?? '')
    const request = requestFor(pending.current, form, ulid)
    pending.current = request
    sending.current = true
    setBusy(true)
    try {
      const res = await createOffer(room.server, room.id, room.key, {
        condition: x.condition,
        check: x.check,
        side: x.side,
        odds: x.odds,
        amount: x.amount,
        ...(x.to ? { to: x.to } : {}),
        closesAt: x.closesAt,
        expectedAt: x.expectedAt,
        ...(x.guarantor ? { guarantor: x.guarantor } : {}),
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
              <label className="chip">
                <input type="radio" name="offer-side" checked={side === 'yes'} onChange={() => setSide('yes')} />
                <span>Сбудется</span>
              </label>
              <label className="chip">
                <input type="radio" name="offer-side" checked={side === 'no'} onChange={() => setSide('no')} />
                <span>Не сбудется</span>
              </label>
            </div>
          </fieldset>
          <OddsField a={a} b={b} onA={setA} onB={setB} mine="Вы рискуете" theirs="Соперник" />
          <label className="field">
            <span>Ваша сумма, {sign}</span>
            <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Например: 300" autoComplete="off" />
          </label>
        </div>

        <div className="form-col">
          <fieldset className="field">
            <legend>Кому</legend>
            <div className="chips">
              <label className="chip">
                <input type="radio" name="offer-to" value="" checked={to === ''} onChange={() => chooseTo('')} />
                <span>Открытое — любой</span>
              </label>
              {others.map((m) => (
                <label key={m.id} className="chip">
                  <input type="radio" name="offer-to" value={m.id} checked={to === m.id} onChange={() => chooseTo(m.id)} />
                  <span>{m.name}</span>
                </label>
              ))}
            </div>
            <span className="hint">Открытое примет любой участник, кроме гаранта; адресное — только тот, кому предложено.</span>
          </fieldset>

          <div className="times">
            <label className="field">
              <span>Приём до</span>
              <input className="input" type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} />
            </label>
            <label className="field">
              <span>Исход к</span>
              <input className="input" type="datetime-local" value={expected} onChange={(e) => setExpected(e.target.value)} />
            </label>
          </div>
          <p className="hint">Время — местное, на этом устройстве. Приём закрывается по часам сервера.</p>

          <fieldset className="field">
            <legend>Гарант</legend>
            <div className="chips">
              {!hostIsSide && (
                <label className="chip">
                  <input type="radio" name="offer-guarantor" value="" checked={guarantor === ''} onChange={() => setGuarantor('')} />
                  <span>Ведущий — {nameOf(room, room.hostId)}</span>
                </label>
              )}
              {candidates.map((m) => (
                <label key={m.id} className="chip">
                  <input type="radio" name="offer-guarantor" value={m.id} checked={guarantor === m.id} onChange={() => setGuarantor(m.id)} />
                  <span>{m.name}</span>
                </label>
              ))}
            </div>
            <span className="hint">
              {hostIsSide && guarantor === ''
                ? NEED_GUARANTOR + '.'
                : 'Гарант решает исход, если вы с соперником разойдётесь или кто-то промолчит 3 дня. Он не принимает пари.'}
            </span>
          </fieldset>
        </div>

        <Summary side={side} a={a} b={b} amount={amount} code={code} currency={room.currency} />
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
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Подтверждение пари" onClick={(e) => e.stopPropagation()}>
        <p className="modal-question">Предложить пари?</p>
        <p>„{x.condition}“</p>
        {s.ok && (
          <p>
            Вы ставите {sum(s.value.author)} на „{sideLabel(x.side)}“, соперник — {sum(s.value.taker)} (кэф {oddsLabel(x.odds)}), банк{' '}
            {sum(s.value.bank)}.
          </p>
        )}
        <p className="hint">
          Кому: {x.to ? nameOf(room, x.to) : 'открытое — любой'} · гарант — {nameOf(room, ask.guarantorId)} · приём до {formatDateTime(x.closesAt)} · исход к{' '}
          {formatDateTime(x.expectedAt)}
        </p>
        <p className="hint">Пока пари не приняли, его можно отозвать.</p>
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
