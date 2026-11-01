// Экран события-пула (Р-04): условие, «как проверяем», уточнения, автор и предмет спора, отсчёт до
// закрытия приёма по времени сервера; по каждому исходу — полоса банка с числом и основанием;
// ставка — с окном подтверждения и честной прикидкой выигрыша; «Лента ставок» и «Ваша позиция».
// Автору — «Уточнить» и, пока приём идёт, «Отменить событие»; ведущему после закрытия — «Отменить»
// с причиной. Состояние — с сервера раз в 5 с (useRoom); нет связи — последнее известное, ставить
// нельзя. Деньги считает pool.ts — здесь не считаем заново. Исход (EventView.outcome) — не здесь
import { useCallback, useRef, useState, type FormEvent, type MutableRefObject } from 'react'
import { cancelEvent, clarifyEvent, placeBet } from '../api'
import { currency as currencyOf, isCurrencyCode, parseAmount } from '../rules/currency'
import { formatDateTime } from '../rules/date'
import { checkClarification, checkReason, eventStatus, MAX_EVENT_TEXT, NEED_REASON } from '../rules/event'
import { formatChance, formatOdds, payoutIfWins, poolOdds, settlePool } from '../rules/pool'
import type { EventStatus, EventView } from '../rules/protocol'
import { formKey, requestFor, type PendingRequest } from '../rules/request'
import { ulid } from '../rules/ulid'
import { savedEvents, type SavedRoom } from '../store/db'
import { BackLink, useEscape } from './BackLink'
import { money, nameOf, StatusLine } from './eventParts'
import { useRoom, useServerNow, type Sync } from './useRoom'

type Ask = { outcome: string; units: number }
type Panel = 'none' | 'clarify' | 'cancel'

export function EventScreen({ room, eventId, onUpdate }: { room: SavedRoom; eventId: string; onUpdate: (room: SavedRoom) => void }) {
  const { sync, clock, refresh } = useRoom(room, onUpdate)
  const event = savedEvents(room).find((e) => e.id === eventId)
  const now = useServerNow(clock, !!event && !event.cancelled)
  const [ask, setAsk] = useState<Ask | null>(null)
  const [panel, setPanel] = useState<Panel>('none')
  const [placed, setPlaced] = useState('')
  const busy = useRef(false) // идёт запрос ставки — окно не закрывается
  const back = '#/room/' + room.id

  useEscape(
    useCallback(() => {
      if (busy.current) return
      if (ask) setAsk(null)
      else if (panel !== 'none') setPanel('none')
      else location.hash = back
    }, [ask, panel, back]),
  )

  if (!event) {
    return (
      <div className="card">
        <BackLink href={back} />
        {sync.state === 'fail' && <p className="error">{sync.text}</p>}
        <p className="hint">{sync.state === 'busy' ? 'Загружаю…' : 'Нет такого события.'}</p>
      </div>
    )
  }

  const status = eventStatus(event, now)
  const isAuthor = event.authorId === room.memberId
  const isHost = room.hostId === room.memberId
  const mayClarify = isAuthor && status !== 'cancelled'
  const mayCancel = (status === 'open' && isAuthor) || (status === 'closed' && isHost)

  return (
    <div className="card event">
      <BackLink href={back} />
      <h2 className="event-title">{event.condition}</h2>
      <p className="event-check">
        <span className="hint">Как проверяем: </span>
        {event.check}
      </p>
      {event.clarifications.length > 0 && (
        <ul className="clarifications" aria-label="Уточнения">
          {event.clarifications.map((c) => (
            <li key={c.id}>
              <span className="hint">Уточнение, {formatDateTime(c.at)}: </span>
              {c.text}
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        Автор — {nameOf(room, event.authorId)} · предмет спора — {nameOf(room, event.subjectId)} · исход ожидается к{' '}
        {formatDateTime(event.expectedAt)}
      </p>
      <p>
        <StatusLine event={event} now={now} />
      </p>
      {event.cancelled && (
        <p className="hint">
          Отмена: {nameOf(room, event.cancelled.by)}
          {event.cancelled.by === event.authorId ? ' (автор)' : ''}, {formatDateTime(event.cancelled.at)}
          {event.cancelled.reason ? `. Причина: ${event.cancelled.reason}` : ''}
        </p>
      )}
      {sync.state === 'fail' && <p className="error">{sync.text}</p>}

      <Bars room={room} event={event} />

      {status === 'open' && <BetForm room={room} event={event} sync={sync} onAsk={setAsk} placed={placed} />}

      {mayClarify || mayCancel ? (
        <div className="row">
          {mayClarify && (
            <button className="button secondary" type="button" onClick={() => setPanel(panel === 'clarify' ? 'none' : 'clarify')} aria-expanded={panel === 'clarify'}>
              Уточнить
            </button>
          )}
          {mayCancel && (
            <button className="button secondary" type="button" onClick={() => setPanel(panel === 'cancel' ? 'none' : 'cancel')} aria-expanded={panel === 'cancel'}>
              {status === 'open' ? 'Отменить событие' : 'Отменить'}
            </button>
          )}
        </div>
      ) : null}
      {panel === 'clarify' && <ClarifyPanel room={room} event={event} onDone={refresh} onClose={() => setPanel('none')} />}
      {panel === 'cancel' && mayCancel && (
        <CancelPanel room={room} event={event} status={status} onDone={refresh} onClose={() => setPanel('none')} />
      )}

      <Position room={room} event={event} />
      <Feed room={room} event={event} />

      {ask && (
        <ConfirmBet
          room={room}
          event={event}
          ask={ask}
          busy={busy}
          onClose={() => setAsk(null)}
          onPlaced={async (text) => {
            setAsk(null)
            setPlaced(text)
            await refresh()
          }}
        />
      )}
    </div>
  )
}

// Полосы банка: по каждому исходу — доля банка, число и основание
function Bars({ room, event }: { room: SavedRoom; event: EventView }) {
  const odds = poolOdds(
    event.outcomes.map((o) => o.id),
    event.bets,
  )
  return (
    <section aria-label="Банк по исходам">
      <h3>{odds.bank > 0 ? `Банк ${money(odds.bank, room.currency)}` : 'Банк пока пуст'}</h3>
      <ul className="bars">
        {event.outcomes.map((o, i) => {
          const x = odds.outcomes[i]
          return (
            <li key={o.id} className="bar-row">
              <div className="bar-head">
                <span className="bar-title">{o.title}</span>
                <span className="bar-chance">{x.stake > 0 ? formatChance(x.chance) : ''}</span>
              </div>
              <div className="bar" aria-hidden="true">
                <div className="bar-fill" style={{ width: `${(x.chance ?? 0) * 100}%` }} />
              </div>
              <span className="hint">
                {x.stake > 0
                  ? `банк ${money(odds.bank, room.currency)}, на „${o.title}“ ${money(x.stake, room.currency)} — коэффициент ${formatOdds(x.odds)}, вероятность по ставкам ${formatChance(x.chance)}`
                  : 'ставок нет'}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// Выбор исхода и суммы → окно подтверждения (ставка — только после него)
function BetForm({
  room,
  event,
  sync,
  onAsk,
  placed,
}: {
  room: SavedRoom
  event: EventView
  sync: Sync
  onAsk: (ask: Ask) => void
  placed: string
}) {
  const [outcome, setOutcome] = useState(event.outcomes[0].id)
  const [amount, setAmount] = useState('')
  const [error, setError] = useState('')
  const code = isCurrencyCode(room.currency) ? room.currency : null
  const sign = code ? currencyOf(code).sign || code : room.currency
  const online = sync.state === 'ok'

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!online) return
    if (!code) return setError('Валюта комнаты незнакома этой версии сайта — обновите страницу')
    const parsed = parseAmount(amount, code)
    if (!parsed.ok) return setError(parsed.error)
    setError('')
    onAsk({ outcome, units: parsed.units })
  }

  return (
    <form className="form bet-form" onSubmit={submit} aria-label="Ставка">
      <h3>Поставить</h3>
      <fieldset className="field">
        <legend>На исход</legend>
        <div className="chips">
          {event.outcomes.map((o) => (
            <label key={o.id} className="chip">
              <input type="radio" name="bet-outcome" checked={outcome === o.id} onChange={() => setOutcome(o.id)} />
              <span>{o.title}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field">
        <span>Сумма, {sign}</span>
        <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Например: 300" autoComplete="off" />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {placed && <p className="ok">{placed}</p>}
      {!online && <p className="hint">Ставить можно, когда есть связь с сервером.</p>}
      <div className="row">
        <button className="button" type="submit" disabled={!online}>
          Поставить
        </button>
      </div>
    </form>
  )
}

// Окно подтверждения ставки. Повтор той же ставки (двойное нажатие, «Поставить» ещё раз после
// «нет связи») — тот же номер запроса: сервер примет одну (Р-13). Принята — номер забыт: следующая
// ставка, даже такая же, — новая и снова с подтверждением
const pendingBets = new Map<string, PendingRequest>() // по событию: окно закрыли и открыли — тот же номер

function ConfirmBet({
  room,
  event,
  ask,
  busy,
  onClose,
  onPlaced,
}: {
  room: SavedRoom
  event: EventView
  ask: Ask
  busy: MutableRefObject<boolean>
  onClose: () => void
  onPlaced: (text: string) => Promise<void>
}) {
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const title = event.outcomes.find((o) => o.id === ask.outcome)?.title ?? ask.outcome
  const sum = money(ask.units, room.currency)
  const win = money(payoutIfWins(event.bets, ask.outcome, ask.units), room.currency)

  async function confirm() {
    if (busy.current) return // синхронный замок: второе нажатие раньше перерисовки
    const form = formKey(room.id, event.id, ask.outcome, String(ask.units))
    const request = requestFor(pendingBets.get(event.id) ?? null, form, ulid)
    pendingBets.set(event.id, request)
    busy.current = true
    setSending(true)
    setError('')
    try {
      const res = await placeBet(room.server, room.id, room.key, event.id, { outcome: ask.outcome, amount: ask.units, requestId: request.requestId })
      if (!res.ok) return setError(res.error)
      pendingBets.delete(event.id)
      busy.current = false
      await onPlaced(`Ставка принята: ${sum} на „${title}“`)
    } finally {
      busy.current = false
      setSending(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !busy.current && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Подтверждение ставки" onClick={(e) => e.stopPropagation()}>
        <p className="modal-question">
          Поставить {sum} на „{title}“?
        </p>
        <p>
          Если „{title}“ выиграет, при нынешних ставках получите ≈ {win} — до закрытия приёма это число ещё сдвинется.
        </p>
        <p className="hint">Ставку нельзя отменить — можно только добавить.</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button className="button" type="button" onClick={confirm} disabled={sending} autoFocus>
            {sending ? 'Ставлю…' : 'Поставить'}
          </button>
          <button className="button secondary" type="button" onClick={onClose} disabled={sending}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}

// «Ваша позиция»: мои ставки по исходам и сколько получу при каждом исходе по нынешним ставкам
// (settlePool); отменено — сколько вернётся (refunds)
function Position({ room, event }: { room: SavedRoom; event: EventView }) {
  const me = room.memberId
  const mine = event.bets.filter((b) => b.memberId === me)
  const staked = (outcome: string) => mine.filter((b) => b.outcome === outcome).reduce((s, b) => s + b.amount, 0)

  let body
  if (mine.length === 0) {
    body = <p className="hint">Вы ещё не ставили.</p>
  } else if (event.cancelled) {
    const refund = event.refunds.find((r) => r.memberId === me)?.amount ?? 0
    body = <p>Событие отменено — вам вернётся {money(refund, room.currency)}.</p>
  } else {
    body = (
      <ul className="position">
        {event.outcomes.map((o) => {
          const settled = settlePool(event.bets, o.id)
          const payout = settled.payouts.find((p) => p.memberId === me)?.payout ?? 0
          const on = staked(o.id)
          return (
            <li key={o.id} className="position-row">
              <span className="position-title">{o.title}</span>
              <span>{on > 0 ? `ваши ставки: ${money(on, room.currency)}` : 'не ставили'}</span>
              <span>
                если выиграет — получите {money(payout, room.currency)}
                {settled.void ? ' (без игры: ставки вернутся)' : ''}
              </span>
            </li>
          )
        })}
      </ul>
    )
  }
  return (
    <section aria-label="Ваша позиция">
      <h3>Ваша позиция</h3>
      {body}
    </section>
  )
}

// «Лента ставок»: все ставки, новые сверху
function Feed({ room, event }: { room: SavedRoom; event: EventView }) {
  const title = (id: string) => event.outcomes.find((o) => o.id === id)?.title ?? id
  const bets = [...event.bets].reverse()
  return (
    <section aria-label="Лента ставок">
      <h3>Лента ставок</h3>
      {bets.length === 0 ? (
        <p className="hint">Ставок пока нет.</p>
      ) : (
        <ul className="feed">
          {bets.map((b) => (
            <li key={b.id} className="feed-row">
              <span className="feed-who">
                {nameOf(room, b.memberId)}
                {b.memberId === room.memberId ? ' (вы)' : ''}
              </span>
              <span>
                {money(b.amount, room.currency)} на „{title(b.outcome)}“
              </span>
              <span className="hint">{formatDateTime(b.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// «Уточнить» — текст под условием; само условие не меняется никогда
function ClarifyPanel({ room, event, onDone, onClose }: { room: SavedRoom; event: EventView; onDone: () => Promise<void>; onClose: () => void }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const checked = checkClarification(text)
    if (!checked.ok) return setError(checked.error)
    setBusy(true)
    setError('')
    const res = await clarifyEvent(room.server, room.id, room.key, event.id, checked.value)
    setBusy(false)
    if (!res.ok) return setError(res.error)
    onClose()
    await onDone()
  }

  return (
    <form className="panel form" onSubmit={submit} aria-label="Уточнить">
      <label className="field">
        <span>Уточнение</span>
        <textarea className="input textarea" value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_EVENT_TEXT * 2} rows={2} />
        <span className="hint">Видно всем под условием. Условие, «как проверяем» и исходы не меняются.</span>
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="button" type="submit" disabled={busy}>
          {busy ? 'Добавляю…' : 'Добавить уточнение'}
        </button>
        <button className="button secondary" type="button" onClick={onClose} disabled={busy}>
          Закрыть
        </button>
      </div>
    </form>
  )
}

// Отмена с подтверждением: пока приём идёт — автор, причина по желанию; после закрытия — ведущий,
// причина обязательна. Ставки возвращаются
function CancelPanel({
  room,
  event,
  status,
  onDone,
  onClose,
}: {
  room: SavedRoom
  event: EventView
  status: EventStatus
  onDone: () => Promise<void>
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const required = status !== 'open'

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const checked = checkReason(reason)
    if (!checked.ok) return setError(checked.error)
    if (required && !checked.value) return setError(NEED_REASON)
    setBusy(true)
    setError('')
    const res = await cancelEvent(room.server, room.id, room.key, event.id, checked.value)
    setBusy(false)
    if (!res.ok) return setError(res.error)
    onClose()
    await onDone()
  }

  return (
    <form className="confirm form" onSubmit={submit} aria-label="Отменить событие?">
      <p>Отменить событие? Все ставки вернутся, отмену не вернуть.</p>
      <label className="field">
        <span>{required ? 'Причина отмены' : 'Причина (по желанию)'}</span>
        <textarea className="input textarea" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={MAX_EVENT_TEXT * 2} rows={2} />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="button" type="submit" disabled={busy}>
          {busy ? 'Отменяю…' : 'Да, отменить'}
        </button>
        <button className="button secondary" type="button" onClick={onClose} disabled={busy}>
          Не отменять
        </button>
      </div>
    </form>
  )
}
