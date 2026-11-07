// Экран пари один на один (Р-04): условие, «как проверяем», автор и его сторона, кэф, суммы обеих
// сторон с основанием, кому, гарант, «приём до» с отсчётом по времени сервера, «исход к», статус;
// встречное — к какому пари, и встречные к этому. Действия — по правам из правил (offer.ts), без
// своих проверок: «Принять» (checkAccept), «Отозвать» (checkWithdraw), «Встречное» (checkCounter);
// кнопок, которых правила не позволяют, нет. Каждое — с окном подтверждения, синхронным замком и
// номером запроса (Р-13). Исхода здесь нет — у принятого «принято, ждём исхода к …». Состояние —
// с сервера раз в 5 с (useRoom); нет связи — последнее известное, действия закрыты. Рядом (от 1280 px)
// или ниже — список пари комнаты (OfferList)
import { useCallback, useRef, useState, type FormEvent, type MutableRefObject } from 'react'
import { acceptOffer, counterOffer, revokeOffer, type Result } from '../api'
import { currency as currencyOf, isCurrencyCode, parseAmount, type CurrencyCode } from '../rules/currency'
import { formatDateTime, fromLocalInput, toLocalInput } from '../rules/date'
import {
  BAD_ODDS,
  checkAccept,
  checkCounter,
  checkOfferInput,
  checkOfferTimes,
  checkWithdraw,
  counterInput,
  NEED_TIMES,
  offerStakes,
  offerStatus,
  type OfferInput,
} from '../rules/offer'
import type { OfferView } from '../rules/protocol'
import { formKey, requestFor, type PendingRequest } from '../rules/request'
import { ulid } from '../rules/ulid'
import { savedOffers, type SavedRoom } from '../store/db'
import { BackLink, useEscape } from './BackLink'
import { money, nameOf } from './eventParts'
import { OfferList } from './OfferList'
import {
  OddsField,
  oddsLabel,
  oddsNumber,
  offerHref,
  offerState,
  OfferStatusLine,
  roomRolesOf,
  sideLabel,
  stakesLine,
  stakesOf,
  toLabel,
  validOdds,
  who,
} from './offerParts'
import { serverTime, useRoom, useServerNow, type Clock } from './useRoom'

// Окно подтверждения: что спрашиваем, основание, кнопка и запрос
type Ask = {
  question: string
  body: string[]
  button: string
  busyLabel: string
  form: string // номер запроса — по пари, действию и содержимому
  run: (requestId: string) => Promise<Result<{ v: number; offer?: { id: string } }>> // встречное — новое пари в offer
}

const pending = new Map<string, PendingRequest>() // по пари: окно закрыли и открыли — тот же номер

export function OfferScreen({ room, offerId, onUpdate }: { room: SavedRoom; offerId: string; onUpdate: (room: SavedRoom) => void }) {
  const { sync, clock, refresh } = useRoom(room, onUpdate)
  const offers = savedOffers(room)
  const offer = offers.find((o) => o.id === offerId)
  const now = useServerNow(clock, !!offer)
  const [ask, setAsk] = useState<Ask | null>(null)
  const [counter, setCounter] = useState(false)
  const busy = useRef(false) // идёт запрос — окно не закрывается
  const back = '#/room/' + room.id

  useEscape(
    useCallback(() => {
      if (busy.current) return
      if (ask) setAsk(null)
      else if (counter) setCounter(false)
      else location.hash = back
    }, [ask, counter, back]),
  )

  if (!offer) {
    return (
      <div className="card">
        <BackLink href={back} />
        {sync.state === 'fail' && <p className="error">{sync.text}</p>}
        <p className="hint">{sync.state === 'busy' ? 'Загружаю…' : 'Нет такого пари.'}</p>
      </div>
    )
  }

  const o: OfferView = offer // для действий ниже: пари уже найдено
  const state = offerState(o)
  const roles = roomRolesOf(room)
  const me = room.memberId
  const status = offerStatus(state, now)
  const online = sync.state === 'ok'
  const mayAccept = checkAccept(state, me, roles, now) === null
  const mayRevoke = checkWithdraw(state, me) === null
  const mayCounter = checkCounter(state, me, roles, now) === null
  const stakes = stakesOf(offer)
  const sum = (n: number) => money(n, room.currency)
  const original = offer.counterTo === null ? undefined : offers.find((o) => o.id === offer.counterTo)
  const counters = offers.filter((o) => o.counterTo === offer.id)
  const closedBy = offer.closedBy ? offers.find((o) => o.id === offer.closedBy?.offer) : undefined
  const takerSide = sideLabel(offer.side === 'yes' ? 'no' : 'yes')

  function askAccept() {
    setCounter(false)
    setAsk({
      question: 'Принять пари?',
      body: [
        stakes
          ? `Вы ставите ${sum(stakes.taker)} против ${sum(stakes.author)} — кэф ${oddsLabel(o.odds)}, банк ${sum(stakes.bank)}.`
          : `Кэф ${oddsLabel(o.odds)}.`,
        `Ваша сторона — „${takerSide}“, у ${nameOf(room, o.authorId)} — „${sideLabel(o.side)}“. Гарант — ${nameOf(room, o.guarantorId)}, исход к ${formatDateTime(o.expectedAt)}.`,
        'Принятое пари не отзывается.',
      ],
      button: 'Принять',
      busyLabel: 'Принимаю…',
      form: formKey(room.id, o.id, 'accept'),
      run: (requestId) => acceptOffer(room.server, room.id, room.key, o.id, { requestId }),
    })
  }

  function askRevoke() {
    setCounter(false)
    setAsk({
      question: 'Отозвать пари?',
      body: ['Его больше нельзя будет принять. Отзыв не вернуть — захотите снова, предложите новое пари.'],
      button: 'Отозвать',
      busyLabel: 'Отзываю…',
      form: formKey(room.id, o.id, 'revoke'),
      run: (requestId) => revokeOffer(room.server, room.id, room.key, o.id, { requestId }),
    })
  }

  // Две обёртки-колонки, как у события: «само пари и действия» и «пари комнаты»; от 1280 px — рядом
  return (
    <div className="card event offer">
      <div className="event-main">
        <BackLink href={back} />
        <h2 className="event-title">{offer.condition}</h2>
        <p className="event-check">
          <span className="hint">Как проверяем: </span>
          {offer.check}
        </p>
        {offer.counterTo !== null && (
          <p className="hint">
            Встречное к пари{' '}
            {original ? <a href={offerHref(room.id, original.id)}>„{original.condition}“ от {who(room, original.authorId)}</a> : 'другого участника'}
          </p>
        )}
        <ul className="offer-facts" aria-label="Условия пари">
          <li>
            <span className="hint">Автор</span>
            <span>
              {who(room, offer.authorId)} — за „{sideLabel(offer.side)}“
            </span>
          </li>
          <li>
            <span className="hint">{offer.accepted ? 'Соперник' : 'Кому'}</span>
            <span>
              {offer.accepted
                ? `${who(room, offer.accepted.by)} — за „${takerSide}“, принял ${formatDateTime(offer.accepted.at)}`
                : `${toLabel(room, offer)} — за „${takerSide}“`}
            </span>
          </li>
          <li>
            <span className="hint">Кэф</span>
            <span>{oddsLabel(offer.odds)}</span>
          </li>
          <li>
            <span className="hint">Суммы</span>
            <span>{stakesLine(room, offer)}</span>
          </li>
          <li>
            <span className="hint">Гарант</span>
            <span>{who(room, offer.guarantorId)}</span>
          </li>
          <li>
            <span className="hint">Приём до</span>
            <span>{formatDateTime(offer.closesAt)}</span>
          </li>
          <li>
            <span className="hint">Исход к</span>
            <span>{formatDateTime(offer.expectedAt)}</span>
          </li>
        </ul>
        <p>
          <OfferStatusLine offer={offer} now={now} />
        </p>
        {offer.withdrawnAt !== null && <p className="hint">Автор отозвал пари {formatDateTime(offer.withdrawnAt)}.</p>}
        {offer.closedBy && (
          <p className="hint">
            Закрыто встречным {closedBy ? <a href={offerHref(room.id, closedBy.id)}>от {who(room, closedBy.authorId)}</a> : ''} —{' '}
            {nameOf(room, offer.authorId)} принял его {formatDateTime(offer.closedBy.at)}.
          </p>
        )}
        {offer.counterTo !== null && status === 'open' && offer.to !== null && (
          <p className="ok">{offer.to === me ? 'Встречное ждёт вашего ответа.' : `Встречное ждёт ответа автора — ${nameOf(room, offer.to)}.`}</p>
        )}
        {sync.state === 'fail' && <p className="error">{sync.text}</p>}

        {mayAccept || mayRevoke || mayCounter ? (
          <>
            <div className="row">
              {mayAccept && (
                <button className="button" type="button" onClick={askAccept} disabled={!online}>
                  Принять
                </button>
              )}
              {mayCounter && (
                <button className="button secondary" type="button" onClick={() => setCounter(!counter)} aria-expanded={counter} disabled={!online}>
                  Встречное
                </button>
              )}
              {mayRevoke && (
                <button className="button secondary" type="button" onClick={askRevoke} disabled={!online}>
                  Отозвать
                </button>
              )}
            </div>
            {!online && <p className="hint">Действия — когда есть связь с сервером.</p>}
          </>
        ) : null}
        {counter && mayCounter && <CounterPanel room={room} offer={offer} clock={clock} busy={busy} onAsk={setAsk} onClose={() => setCounter(false)} />}

        {counters.length > 0 && <Counters room={room} offer={offer} counters={counters} now={now} />}
      </div>
      <div className="event-side">
        <OfferList room={room} clock={clock} current={offer.id} />
      </div>

      {ask && (
        <ConfirmAct
          ask={ask}
          offerId={offer.id}
          busy={busy}
          onClose={() => setAsk(null)}
          onDone={async (next) => {
            setAsk(null)
            setCounter(false)
            await refresh()
            if (next) location.hash = offerHref(room.id, next)
          }}
        />
      )}
    </div>
  )
}

// Встречные к этому пари: кто, на каких условиях, ждёт ли ответа автора
function Counters({ room, offer, counters, now }: { room: SavedRoom; offer: OfferView; counters: OfferView[]; now: number }) {
  return (
    <section aria-label="Встречные">
      <h3>Встречные</h3>
      <ul className="event-list">
        {counters.map((c) => {
          const open = offerStatus(offerState(c), now) === 'open'
          return (
            <li key={c.id}>
              <a className="event-item" href={offerHref(room.id, c.id)}>
                <span className="event-name">От {who(room, c.authorId)}</span>
                <span className="hint">{stakesLine(room, c)}</span>
                <OfferStatusLine offer={c} now={now} />
                {open && (
                  <span className="hint">
                    {offer.authorId === room.memberId ? 'ждёт вашего ответа' : `ждёт ответа автора — ${nameOf(room, offer.authorId)}`}
                  </span>
                )}
              </a>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// Сумма в поле: минимальные единицы → «100» или «100,5» (для подсказки во встречном)
function unitsText(units: number, code: CurrencyCode): string {
  const digits = currencyOf(code).digits
  if (digits === 0) return String(units)
  const s = String(units).padStart(digits + 1, '0')
  const frac = s.slice(-digits).replace(/0+$/, '')
  return s.slice(0, -digits) + (frac ? ',' + frac : '')
}

// Встречное: свои кэф, сумма и «приём до»; условие, «как проверяем», «исход к» и гарант — исходного,
// сторона — обратная, ответит автор исходного (counterInput). Поля сначала — те же условия со своей
// стороны: кэф наоборот, сумма — та, что пришлось бы ставить, приём — до того же срока
function CounterPanel({
  room,
  offer,
  clock,
  busy,
  onAsk,
  onClose,
}: {
  room: SavedRoom
  offer: OfferView
  clock: Clock | null
  busy: MutableRefObject<boolean>
  onAsk: (ask: Ask) => void
  onClose: () => void
}) {
  const code = isCurrencyCode(room.currency) ? room.currency : null
  const sign = code ? currencyOf(code).sign || code : room.currency
  const [a, setA] = useState(String(offer.odds.b))
  const [b, setB] = useState(String(offer.odds.a))
  const [amount, setAmount] = useState(() => (code ? unitsText(offer.takerAmount, code) : ''))
  const [closes, setCloses] = useState(() => toLocalInput(offer.closesAt))
  const [error, setError] = useState('')
  const author = nameOf(room, offer.authorId)
  const mySide = offer.side === 'yes' ? 'no' : 'yes'
  const odds = { a: oddsNumber(a), b: oddsNumber(b) }
  const parsed = code && amount.trim() ? parseAmount(amount, code) : null
  const stakes = parsed?.ok && validOdds(odds) ? offerStakes(odds, parsed.units) : null
  const sum = (n: number) => money(n, room.currency)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (busy.current) return
    if (!code) return setError('Валюта комнаты незнакома этой версии сайта — обновите страницу')
    const closesAt = fromLocalInput(closes)
    if (closesAt === null) return setError(NEED_TIMES)
    const units = parseAmount(amount, code)
    if (!units.ok) return setError(units.error)
    const checked = checkOfferInput(counterInput(offerState(offer), { odds, amount: units.units, closesAt }))
    if (!checked.ok) return setError(checked.error)
    const late = checkOfferTimes(checked.value, serverTime(clock))
    if (late) return setError(late)
    setError('')
    const x: OfferInput = checked.value
    const s = offerStakes(x.odds, x.amount)
    onAsk({
      question: 'Предложить встречное?',
      body: [
        s.ok
          ? `Вы ставите ${sum(s.value.author)} на „${sideLabel(x.side)}“, ${author} — ${sum(s.value.taker)} (кэф ${oddsLabel(x.odds)}), банк ${sum(s.value.bank)}.`
          : `Кэф ${oddsLabel(x.odds)}.`,
        `Приём до ${formatDateTime(x.closesAt)}; условие, «как проверяем», исход к и гарант — как у исходного.`,
        `Ответит ${author}: примет встречное — исходное закроется.`,
      ],
      button: 'Предложить встречное',
      busyLabel: 'Предлагаю…',
      form: formKey(room.id, offer.id, 'counter', String(x.odds.a), String(x.odds.b), String(x.amount), String(x.closesAt)),
      run: (requestId) => counterOffer(room.server, room.id, room.key, offer.id, { odds: x.odds, amount: x.amount, closesAt: x.closesAt, requestId }),
    })
  }

  return (
    <form className="panel form" onSubmit={submit} aria-label="Встречное">
      <p>
        Встречное — новое пари для {author}: вы — за „{sideLabel(mySide)}“, свои кэф и сумма. Условие, «как проверяем», исход к и гарант —
        как у исходного.
      </p>
      <OddsField a={a} b={b} onA={setA} onB={setB} mine="Вы рискуете" theirs={author} />
      <label className="field">
        <span>Ваша сумма, {sign}</span>
        <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoComplete="off" />
      </label>
      <label className="field">
        <span>Приём до</span>
        <input className="input" type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} />
      </label>
      <div className="offer-summary" aria-live="polite">
        <p>
          {stakes?.ok
            ? `Вы ставите ${sum(stakes.value.author)}, ${author} — ${sum(stakes.value.taker)}, банк ${sum(stakes.value.bank)} (кэф ${oddsLabel(odds)}).`
            : stakes
              ? stakes.error
              : parsed && !parsed.ok
                ? parsed.error
                : !validOdds(odds)
                  ? BAD_ODDS
                  : 'Введите свою сумму — здесь появится, сколько ставит каждый.'}
        </p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="button" type="submit">
          Предложить встречное
        </button>
        <button className="button secondary" type="button" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </form>
  )
}

// Окно подтверждения действия. Повтор того же действия (двойное нажатие, ещё раз после «нет связи») —
// тот же номер запроса: сервер запишет одно (Р-13). Удалось — номер забыт. Встречное — открыть новое пари
function ConfirmAct({
  ask,
  offerId,
  busy,
  onClose,
  onDone,
}: {
  ask: Ask
  offerId: string
  busy: MutableRefObject<boolean>
  onClose: () => void
  onDone: (next: string | null) => Promise<void>
}) {
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    if (busy.current) return // синхронный замок: второе нажатие раньше перерисовки
    const request = requestFor(pending.get(offerId) ?? null, ask.form, ulid)
    pending.set(offerId, request)
    busy.current = true
    setSending(true)
    setError('')
    try {
      const res = await ask.run(request.requestId)
      if (!res.ok) return setError(res.error)
      pending.delete(offerId)
      busy.current = false
      const next = res.value.offer && res.value.offer.id !== offerId ? res.value.offer.id : null
      await onDone(next)
    } finally {
      busy.current = false
      setSending(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !busy.current && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={ask.question} onClick={(e) => e.stopPropagation()}>
        <p className="modal-question">{ask.question}</p>
        {ask.body.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button className="button" type="button" onClick={confirm} disabled={sending} autoFocus>
            {sending ? ask.busyLabel : ask.button}
          </button>
          <button className="button secondary" type="button" onClick={onClose} disabled={sending}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}
