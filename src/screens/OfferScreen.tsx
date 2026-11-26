// Экран пари один на один (Р-04): условие, «как проверяем», автор и его сторона, кэф, суммы обеих
// сторон с основанием, кому, гарант, «приём до» с отсчётом по времени сервера, «исход к», статус;
// встречное — к какому пари, и встречные к этому. Действия — по правам из правил (offer.ts), без
// своих проверок: «Принять» (checkAccept), «Отозвать» (checkWithdraw), «Встречное» (checkCounter);
// кнопок, которых правила не позволяют, нет. Каждое — с окном подтверждения, синхронным замком и
// номером запроса (Р-13). У принятого — блок «Исход» (OfferOutcome): отметки сторон, решение гаранта,
// новый гарант, итог. Состояние — с сервера раз в 5 с (useRoom); нет связи — последнее известное,
// действия закрыты. Рядом (от 1280 px) или ниже — список пари комнаты (OfferList). О ком спор (Р-26):
// строкой в условиях; предмет — сторона — пометка; предмету «Принять» нет, пока автор за «сбудется».
// Торг (Р-37): вместо «Принять» и «Встречного» — ход торга (Bidding: лучшее, все встречные, «вас
// перебили») и «Ваше встречное» (BidPanel, checkBid); автору — «Принять сейчас» (checkTakeBid) и
// «Отозвать», пока встречных нет; конец — «Торг закончен — соперник …», дальше — обычное пари; «не
// состоялось» — автору «Повторить» (новое пари с теми же условиями)
import { useCallback, useRef, useState, type FormEvent, type MutableRefObject } from 'react'
import { acceptOffer, bidOffer, counterOffer, revokeOffer, takeBid } from '../api'
import { currency as currencyOf, isCurrencyCode, parseAmount } from '../rules/currency'
import { formatDateTime, fromLocalInput, toLocalInput } from '../rules/date'
import {
  auctionLatestEnd,
  BAD_ODDS,
  checkAccept,
  checkBid,
  checkCounter,
  checkOfferInput,
  checkOfferTimes,
  checkTakeBid,
  checkWithdraw,
  counterInput,
  NEED_TIMES,
  offerStakes,
  offerStatus,
  SUBJECT_BIDS,
  SUBJECT_TAKES,
  subjectIsSide,
  type OfferInput,
} from '../rules/offer'
import type { OfferView } from '../rules/protocol'
import { formKey, requestFor, type PendingRequest } from '../rules/request'
import { ulid } from '../rules/ulid'
import { savedOffers, type SavedRoom } from '../store/db'
import { BackLink, useEscape } from './BackLink'
import { BidList } from './BidList'
import { money, nameOf } from './eventParts'
import { historyHref, offerPastNow } from './historyParts'
import { iAmDropped } from './memberParts'
import { OfferList } from './OfferList'
import { OfferOutcome } from './OfferOutcome'
import {
  amountsOddsLabel,
  auctionResultText,
  bidAskText,
  nextBid,
  OddsField,
  oddsLabel,
  oddsNumber,
  offerHref,
  offerState,
  OfferStatusLine,
  OfferSubjectFlag,
  outbid,
  repeatHref,
  roomRolesOf,
  sideLabel,
  stakesLine,
  stakesOf,
  guarantorLabel,
  toLabel,
  unitsText,
  validOdds,
  who,
  type OfferAsk as Ask,
} from './offerParts'
import { serverTime, useRoom, useServerNow, type Clock } from './useRoom'

const pending = new Map<string, PendingRequest>() // по пари: окно закрыли и открыли — тот же номер

export function OfferScreen({ room, offerId, onUpdate }: { room: SavedRoom; offerId: string; onUpdate: (room: SavedRoom) => void }) {
  const { sync, clock, refresh } = useRoom(room, onUpdate)
  const offers = savedOffers(room)
  const offer = offers.find((o) => o.id === offerId)
  const now = useServerNow(clock, !!offer)
  const [ask, setAsk] = useState<Ask | null>(null)
  const [counter, setCounter] = useState(false)
  const [round, setRound] = useState(0) // действие удалось — поле встречного в торге снова с подставленной суммой
  const busy = useRef(false) // идёт запрос — окно не закрывается
  // Прошедшее пари живёт в «Истории» — «Назад» туда; идущее — в комнату
  const back = offer && offerPastNow(room, offer, now) !== null ? historyHref(room.id) : '#/room/' + room.id

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
  // Помеченный «выбыл» (Р-41) нового не начинает: «Принять», «Встречное», встречное в торге и «Повторить»
  // скрыты; отозвать своё, «Принять сейчас» в своём торге и исход — как раньше
  const dropped = iAmDropped(room)
  const acceptRefusal = checkAccept(state, me, roles, now)
  const mayAccept = acceptRefusal === null && !dropped
  // Торг, который не состоялся (Р-37), уже закончен: отзывать нечего — вместо этого «Повторить»
  const mayRevoke = checkWithdraw(state, me) === null && status !== 'failed'
  const mayCounter = checkCounter(state, me, roles, now) === null && !dropped
  const stakes = stakesOf(offer)
  const sum = (n: number) => money(n, room.currency)
  const original = offer.counterTo === null ? undefined : offers.find((o) => o.id === offer.counterTo)
  const counters = offers.filter((o) => o.counterTo === offer.id)
  const closedBy = offer.closedBy ? offers.find((o) => o.id === offer.closedBy?.offer) : undefined
  const takerSide = sideLabel(offer.side === 'yes' ? 'no' : 'yes')
  // Торг (Р-37): встречное — правилом checkBid на подставленной сумме (отказ по сумме — в окне),
  // «Принять сейчас» — checkTakeBid; «не состоялось» — автору «Повторить»
  const auction = state.auction ?? null
  const bidAt = nextBid(o)
  const bidRefusal = auction && bidAt !== null ? checkBid(state, me, bidAt, roles, now) : null
  const mayBid = !!auction && bidRefusal === null && !dropped
  const mayTake = !!auction && checkTakeBid(state, me, now) === null
  const result = auctionResultText(room, o, now)
  const mayRepeat = !!auction && status === 'failed' && me === o.authorId && !dropped

  function askTake() {
    const best = o.bidding?.best
    if (!best) return
    setCounter(false)
    setAsk({
      question: 'Принять лучшее встречное сейчас?',
      body: [
        `${nameOf(room, best.by)} ставит ${sum(best.amount)} против ваших ${sum(o.amount)} — кэф ${amountsOddsLabel(o.amount, best.amount)}, банк ${sum(o.amount + best.amount)}.`,
        `Торг закончится сейчас, ${nameOf(room, best.by)} — соперник. Дальше — обычное пари: исход к ${formatDateTime(o.expectedAt)}, ${
          o.guarantorId === null ? 'гаранта нет — разойдётесь, решит суд' : `гарант — ${nameOf(room, o.guarantorId)}`
        }.`,
        'Придёт встречное больше, пока вы подтверждаете, — примется оно. Принятое не отменить.',
      ],
      button: 'Принять сейчас',
      busyLabel: 'Принимаю…',
      form: formKey(room.id, o.id, 'bid/accept'),
      run: (requestId) => takeBid(room.server, room.id, room.key, o.id, { requestId }),
    })
  }

  function askAccept() {
    setCounter(false)
    setAsk({
      question: 'Принять пари?',
      body: [
        stakes
          ? `Вы ставите ${sum(stakes.taker)} против ${sum(stakes.author)} — кэф ${oddsLabel(o.odds)}, банк ${sum(stakes.bank)}.`
          : `Кэф ${oddsLabel(o.odds)}.`,
        `Ваша сторона — „${takerSide}“, у ${nameOf(room, o.authorId)} — „${sideLabel(o.side)}“. ${
          o.guarantorId === null
            ? `Исход к ${formatDateTime(o.expectedAt)}. Гаранта нет: отметите одинаково — окончательно сразу, разойдётесь — решит суд`
            : `Гарант — ${nameOf(room, o.guarantorId)}, исход к ${formatDateTime(o.expectedAt)}`
        }.`,
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
      body: [
        auction
          ? 'Торг закончится: встречных больше не будет. Отзыв не вернуть — захотите снова, предложите новое пари.'
          : 'Его больше нельзя будет принять. Отзыв не вернуть — захотите снова, предложите новое пари.',
      ],
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
            {original ? (
              <a href={offerHref(room.id, original.id)}>
                „{original.condition}“ (автор — {who(room, original.authorId)})
              </a>
            ) : (
              'другого участника'
            )}
          </p>
        )}
        <ul className="offer-facts" aria-label="Условия пари">
          <li>
            <span className="hint">Автор</span>
            <span>
              {who(room, offer.authorId)} — за „{sideLabel(offer.side)}“
            </span>
          </li>
          {auction ? (
            <li>
              <span className="hint">{status === 'accepted' ? 'Соперник' : 'Кому'}</span>
              <span>
                {status === 'accepted' && o.bidding?.best
                  ? `${who(room, o.bidding.best.by)} — за „${takerSide}“, торг закончен ${formatDateTime(o.accepted?.at ?? o.bidding.endsAt)}`
                  : status === 'open'
                    ? `торг — кто даст больше к концу, за „${takerSide}“`
                    : `торг — открытое, за „${takerSide}“`}
              </span>
            </li>
          ) : (
            <li>
              <span className="hint">{offer.accepted ? 'Соперник' : 'Кому'}</span>
              <span>
                {offer.accepted
                  ? `${who(room, offer.accepted.by)} — за „${takerSide}“, принято ${formatDateTime(offer.accepted.at)}`
                  : `${toLabel(room, offer)} — за „${takerSide}“`}
              </span>
            </li>
          )}
          <li>
            <span className="hint">Кэф</span>
            <span>{auction ? (stakes ? amountsOddsLabel(stakes.author, stakes.taker) : '—') : oddsLabel(offer.odds)}</span>
          </li>
          <li>
            <span className="hint">Суммы</span>
            <span>{stakesLine(room, offer, now)}</span>
          </li>
          {auction && (
            <li>
              <span className="hint">Торг</span>
              <span>
                старт — {sum(auction.start)}, шаг — {sum(auction.step)}: встречное больше лучшего хотя бы на шаг
              </span>
            </li>
          )}
          <li>
            <span className="hint">Гарант</span>
            <span>{guarantorLabel(room, offer)}</span>
          </li>
          {offer.subjectId !== null && (
            <li>
              <span className="hint">О ком спор</span>
              <span>{who(room, offer.subjectId)} — только на стороне „{sideLabel('yes')}“</span>
            </li>
          )}
          {auction ? (
            <li>
              <span className="hint">Конец торга</span>
              <span>
                {formatDateTime(auction.endsAt)}
                {auction.endsAt > offer.closesAt ? ` (продлён с ${formatDateTime(offer.closesAt)})` : ''}, не позже{' '}
                {formatDateTime(auctionLatestEnd(offer))}
              </span>
            </li>
          ) : (
            <li>
              <span className="hint">Приём до</span>
              <span>{formatDateTime(offer.closesAt)}</span>
            </li>
          )}
          <li>
            <span className="hint">Исход к</span>
            <span>{formatDateTime(offer.expectedAt)}</span>
          </li>
        </ul>
        <p>
          <OfferStatusLine room={room} offer={offer} now={now} />
        </p>
        {subjectIsSide(offer) && (
          <p>
            <OfferSubjectFlag room={room} offer={offer} />
          </p>
        )}
        {result && <p className={status === 'failed' ? 'auction-result failed' : 'auction-result'}>{result}</p>}
        {status === 'failed' && <p className="hint">Никто никому не должен. Хотите снова — новое пари с теми же условиями.</p>}
        {acceptRefusal === SUBJECT_TAKES && <p className="hint">{SUBJECT_TAKES}.</p>}
        {bidRefusal === SUBJECT_BIDS && <p className="hint">{SUBJECT_BIDS}.</p>}
        {offer.withdrawnAt !== null && <p className="hint">Автор отозвал пари {formatDateTime(offer.withdrawnAt)}.</p>}
        {offer.closedBy && (
          <p className="hint">
            Закрыто встречным{closedBy ? <> (<a href={offerHref(room.id, closedBy.id)}>встречное — {who(room, closedBy.authorId)}</a>)</> : ''}: автор
            принял его {formatDateTime(offer.closedBy.at)}.
          </p>
        )}
        {offer.counterTo !== null && status === 'open' && offer.to !== null && (
          <p className="ok">{offer.to === me ? 'Встречное ждёт вашего ответа.' : `Встречное ждёт ответа автора — ${nameOf(room, offer.to)}.`}</p>
        )}
        {sync.state === 'fail' && <p className="error">{sync.text}</p>}

        {auction && <Bidding room={room} offer={offer} now={now} />}
        {mayBid && <BidPanel key={round} room={room} offer={offer} clock={clock} busy={busy} online={online} onAsk={setAsk} />}

        {mayAccept || mayRevoke || mayCounter || mayTake || mayRepeat ? (
          <>
            <div className="row">
              {mayAccept && (
                <button className="button" type="button" onClick={askAccept} disabled={!online}>
                  Принять
                </button>
              )}
              {mayTake && (
                <button className="button" type="button" onClick={askTake} disabled={!online}>
                  Принять сейчас
                </button>
              )}
              {mayRepeat && (
                <a className="button" href={repeatHref(room.id, offer.id)}>
                  Повторить
                </a>
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
        <OfferOutcome room={room} offer={offer} now={now} online={online} onAsk={setAsk} />

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
            setRound((r) => r + 1)
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
                <span className="event-name">{who(room, c.authorId)} предлагает встречное</span>
                <span className="hint">{stakesLine(room, c)}</span>
                <OfferStatusLine room={room} offer={c} now={now} />
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
        Встречное — новое пари, ответит автор — {author}. Вы — за „{sideLabel(mySide)}“, кэф и сумма — свои; условие, «как проверяем»,
        исход к и гарант — как у исходного.
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

// Ход торга (Р-37): лучшее встречное и кто (сколько осталось — в строке статуса), все встречные — кто,
// сколько, когда, новые сверху (видны всем, Р-11); моё перебили — «Вас перебили»
function Bidding({ room, offer, now }: { room: SavedRoom; offer: OfferView; now: number }) {
  const bids = offer.bidding?.bids ?? []
  const best = offer.bidding?.best ?? null
  const open = offerStatus(offerState(offer), now) === 'open'
  const sum = (n: number) => money(n, room.currency)
  const start = offer.auction?.start ?? 0
  return (
    <section className="bidding" aria-label="Торг">
      <h3>Встречные в торге</h3>
      {open && (
        <p>
          {best
            ? `Лучшее встречное — ${who(room, best.by)}: ${sum(best.amount)} против ${sum(offer.amount)} автора, кэф ${amountsOddsLabel(offer.amount, best.amount)}.`
            : `Встречных пока нет. Первое — не меньше старта: ${sum(start)}.`}
        </p>
      )}
      {outbid(offer, room.memberId, now) && best && (
        <p className="outbid" role="status">
          Вас перебили: лучшее встречное — {who(room, best.by)}, {sum(best.amount)}. Ваше встречное больше не держит вас — можете перебить снова.
        </p>
      )}
      {bids.length === 0 ? (
        !open && <p className="hint">Встречных не было.</p>
      ) : (
        <BidList room={room} bids={bids} bestId={best?.id ?? null} badge={open ? 'лучшее' : 'принято'} label="Встречные" />
      )}
    </section>
  )
}

// «Ваше встречное» в торге (Р-37): подставлено лучшее + шаг (без встречных — старт), по ходу ввода —
// «вы ставите … против … автора — кэф …»; проверка — checkBid на часах сервера; окно подтверждения, вдвое
// больше лучшего — второе подтверждение
function BidPanel({
  room,
  offer,
  clock,
  busy,
  online,
  onAsk,
}: {
  room: SavedRoom
  offer: OfferView
  clock: Clock | null
  busy: MutableRefObject<boolean>
  online: boolean
  onAsk: (ask: Ask) => void
}) {
  const code = isCurrencyCode(room.currency) ? room.currency : null
  const sign = code ? currencyOf(code).sign || code : room.currency
  const suggested = nextBid(offer)
  const [text, setText] = useState<string | null>(null) // null — подставленное
  const [error, setError] = useState('')
  const shown = text ?? (code && suggested !== null ? unitsText(suggested, code) : '')
  const parsed = code && shown.trim() ? parseAmount(shown, code) : null
  const best = offer.bidding?.best ?? null
  const sum = (n: number) => money(n, room.currency)
  const step = offer.auction?.step ?? 0
  const takerSide = sideLabel(offer.side === 'yes' ? 'no' : 'yes')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (busy.current) return
    if (!code) return setError('Валюта комнаты незнакома этой версии сайта — обновите страницу')
    const units = parseAmount(shown, code)
    if (!units.ok) return setError(units.error)
    const refusal = checkBid(offerState(offer), room.memberId, units.units, roomRolesOf(room), serverTime(clock))
    if (refusal) return setError(refusal)
    setError('')
    const t = bidAskText(room, offer, units.units)
    onAsk({
      question: 'Отправить встречное?',
      body: [
        t.body,
        `Вы — за „${takerSide}“. Останется лучшим к концу торга или автор примет его раньше — вы соперник; перебьют — вы свободны.`,
        'Встречное не отзывается.',
      ],
      button: 'Отправить встречное',
      busyLabel: 'Отправляю…',
      form: formKey(room.id, offer.id, 'bid', String(units.units)),
      run: (requestId) => bidOffer(room.server, room.id, room.key, offer.id, { amount: units.units, requestId }),
      ...(t.twice && { twice: t.twice }),
    })
  }

  return (
    <form className="panel form" onSubmit={submit} aria-label="Ваше встречное">
      <label className="field">
        <span>Ваше встречное, {sign}</span>
        <input className="input" inputMode="decimal" value={shown} onChange={(e) => setText(e.target.value)} autoComplete="off" />
      </label>
      <span className="hint">
        {best
          ? `Не меньше ${sum(best.amount + step)}: лучшее ${sum(best.amount)} + шаг ${sum(step)}. Больше сумма — лучше кэф для автора.`
          : `Не меньше старта — ${sum(offer.auction?.start ?? 0)}. Больше сумма — лучше кэф для автора.`}
      </span>
      <div className="offer-summary" aria-live="polite">
        <p>{parsed?.ok ? bidAskText(room, offer, parsed.units).body : parsed ? parsed.error : 'Введите сумму — здесь появится кэф и банк.'}</p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="button" type="submit" disabled={!online}>
          Отправить встречное
        </button>
      </div>
    </form>
  )
}

// Окно подтверждения действия. Повтор того же действия (двойное нажатие, ещё раз после «нет связи») —
// тот же номер запроса: сервер запишет одно (Р-13). Удалось — номер забыт. Встречное — открыть новое пари.
// twice — второе подтверждение: первое нажатие только переводит окно ко второму вопросу (двойное нажатие
// его не проскочит — оба нажатия видят первый шаг)
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
  const [second, setSecond] = useState(false) // второе подтверждение открыто

  async function confirm() {
    if (busy.current) return // синхронный замок: второе нажатие раньше перерисовки
    if (ask.twice && !second) return setSecond(true)
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
        <p className="modal-question">{second ? 'Точно столько?' : ask.question}</p>
        {ask.body.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
        {second && ask.twice && (
          <p className="warn" role="alert">
            {ask.twice}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button className="button" type="button" onClick={confirm} disabled={sending} autoFocus>
            {sending ? ask.busyLabel : second ? 'Да, ' + ask.button.toLowerCase() : ask.button}
          </button>
          <button className="button secondary" type="button" onClick={onClose} disabled={sending}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}
