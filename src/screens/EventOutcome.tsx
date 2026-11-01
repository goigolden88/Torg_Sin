// Исход события на экране события (Р-05, Р-17, Р-19): что предложено, возражения, решение ведущего,
// голосование, «ждёт суда», «утверждён» с таблицей выплат, «окончательно», отмена. Кто какие кнопки
// видит — из состояния события с сервера (кто ставил, предмет, ведущий, голосующие) теми же
// правилами, что у сервера (mayPropose, hostDecides, betOn); статус и выплаты считает сервер
// (EventView.outcome) — здесь только показ. Каждое действие — с окном подтверждения; номер запроса
// — по событию, действию и выбору, хранится до ответа (двойное нажатие и повтор после «нет связи» —
// одно действие, Р-13). Esc закрывает окно и форму здесь, не уводя с экрана
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { decideOutcome, objectOutcome, proposeOutcome, voteOutcome, type Result } from '../api'
import { formatDateTime } from '../rules/date'
import { AUTHOR_SILENCE, betOn, checkObjection, eventStatus, hostDecides, mayPropose, MAX_EVENT_TEXT } from '../rules/event'
import { formatOdds, poolOdds } from '../rules/pool'
import type { EventView, OutcomeView, Payout } from '../rules/protocol'
import { formKey, requestFor, type PendingRequest } from '../rules/request'
import { ulid } from '../rules/ulid'
import type { SavedRoom } from '../store/db'
import { money, nameOf } from './eventParts'
import type { Sync } from './useRoom'

// Действия выбором исхода и их окна подтверждения
const CHOICE = {
  propose: {
    send: proposeOutcome,
    question: (t: string) => `Предложить „${t}“?`,
    note: 'Ставившие смогут возразить в течение суток. Предложение не отозвать.',
    button: 'Предложить',
    busyLabel: 'Предлагаю…',
    done: 'Исход предложен',
  },
  decide: {
    send: decideOutcome,
    question: (t: string) => `Утвердить „${t}“ решением ведущего?`,
    note: 'Исход станет утверждённым, выплаты посчитаются по нему. Решение не изменить.',
    button: 'Утвердить',
    busyLabel: 'Утверждаю…',
    done: 'Исход утверждён',
  },
  vote: {
    send: voteOutcome,
    question: (t: string) => `Голосовать за „${t}“?`,
    note: 'Голос один, изменить его нельзя.',
    button: 'Голосовать',
    busyLabel: 'Голосую…',
    done: 'Голос принят',
  },
}
type Choice = keyof typeof CHOICE

// Что подтверждаем: вопрос, пояснение, кнопка; send — запрос с номером; slot — событие и действие
type Ask = {
  slot: string
  form: string
  done: string
  question: string
  note: string
  button: string
  busyLabel: string
  send: (requestId: string) => Promise<Result<unknown>>
}

// Номер запроса — по событию и действию: окно закрыли и открыли с тем же выбором — тот же номер
const pending = new Map<string, PendingRequest>()

export function EventOutcome({
  room,
  event,
  now,
  sync,
  onDone,
}: {
  room: SavedRoom
  event: EventView
  now: number
  sync: Sync
  onDone: () => Promise<void>
}) {
  const [ask, setAsk] = useState<Ask | null>(null)
  const [objecting, setObjecting] = useState(false)
  const [done, setDone] = useState('')
  const busy = useRef(false)
  const o = event.outcome
  const me = room.memberId
  const roles = { ...event, hostId: room.hostId }
  const title = (id: string) => event.outcomes.find((x) => x.id === id)?.title ?? id
  const online = sync.state === 'ok'
  const status = eventStatus(event, now)

  // Esc — сначала окно, потом форма возражения; до «Назад» экрана событие не доходит
  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || (!ask && !objecting)) return
    e.stopPropagation()
    if (busy.current) return
    if (ask) setAsk(null)
    else setObjecting(false)
  }

  // Приём ещё идёт — исхода нет и быть не может
  if (!o && status !== 'closed') return null

  const mayObject =
    !!o &&
    !o.approved &&
    o.status !== 'cancelled' &&
    o.proposal.by !== me &&
    betOn(event, me) &&
    now < o.objectionUntil &&
    !o.objections.some((x) => x.by === me)
  const mayDecide = !!o && o.status === 'disputed' && !o.decision && me === room.hostId && hostDecides(roles)
  const mayVote =
    !!o && o.status === 'voting' && o.voters.includes(me) && !o.votes.some((v) => v.by === me) && o.votingUntil !== null && now < o.votingUntil
  const mayProposeNow = !o && status === 'closed' && mayPropose(roles, me, now)

  function chosen(action: Choice, outcome: string) {
    const c = CHOICE[action]
    setDone('')
    setAsk({
      slot: event.id + '/' + action,
      form: formKey(room.id, event.id, action, outcome),
      done: c.done,
      question: c.question(title(outcome)),
      note: c.note,
      button: c.button,
      busyLabel: c.busyLabel,
      send: (requestId) => c.send(room.server, room.id, room.key, event.id, { outcome, requestId }),
    })
  }

  function objected(reason: string) {
    if (!o) return
    setDone('')
    setAsk({
      slot: event.id + '/object',
      form: formKey(room.id, event.id, 'object', reason),
      done: 'Возражение отправлено',
      question: `Возразить против „${title(o.proposal.outcome)}“?`,
      note: `Причина: ${reason}. Возражение не отозвать; исход решит ${hostDecides(roles) ? 'ведущий' : 'голосование не ставивших'}.`,
      button: 'Возразить',
      busyLabel: 'Отправляю…',
      send: (requestId) => objectOutcome(room.server, room.id, room.key, event.id, { reason, requestId }),
    })
  }

  return (
    <section className="outcome" aria-label="Исход" onKeyDown={onKey}>
      <h3>Исход</h3>
      {o ? <OutcomeState room={room} event={event} o={o} now={now} title={title} /> : <NotProposed room={room} event={event} now={now} />}
      {done && <p className="ok">{done}</p>}
      {!online && (mayProposeNow || mayObject || mayDecide || mayVote) && <p className="hint">Действовать можно, когда есть связь с сервером.</p>}

      {mayProposeNow && (
        <ChooseOutcome event={event} legend="Какой исход наступил" button="Предложить исход" disabled={!online} onChoose={(x) => chosen('propose', x)} />
      )}
      {mayDecide && <ChooseOutcome event={event} legend="Ваше решение как ведущего" button="Решить" disabled={!online} onChoose={(x) => chosen('decide', x)} />}
      {mayVote && <ChooseOutcome event={event} legend="Ваш голос" button="Голосовать" disabled={!online} onChoose={(x) => chosen('vote', x)} />}
      {mayObject &&
        (objecting ? (
          <ObjectForm disabled={!online} onObject={objected} onClose={() => setObjecting(false)} />
        ) : (
          <div className="row">
            <button className="button secondary" type="button" onClick={() => setObjecting(true)} disabled={!online}>
              Возразить
            </button>
          </div>
        ))}

      {ask && (
        <ConfirmAction
          ask={ask}
          busy={busy}
          onClose={() => setAsk(null)}
          onDone={async () => {
            setAsk(null)
            setObjecting(false)
            setDone(ask.done)
            await onDone()
          }}
        />
      )}
    </section>
  )
}

// Исход ещё не предложен (приём закрыт): кто предложит; ведущему — с какого мига сможет и он
function NotProposed({ room, event, now }: { room: SavedRoom; event: EventView; now: number }) {
  const hostAboutSelf = event.authorId === room.hostId && event.subjectId === room.hostId
  let who: string
  if (hostAboutSelf) who = `Событие ведущего о себе: предложить может любой участник, кроме ${nameOf(room, room.hostId)}; первое предложение — единственное.`
  else if (event.authorId === event.subjectId) who = `Автор — предмет спора, исход предлагает ведущий — ${nameOf(room, room.hostId)}.`
  else who = `Исход предлагает автор — ${nameOf(room, event.authorId)}.`
  const silentFrom = event.expectedAt + AUTHOR_SILENCE
  const hostLater = room.memberId === room.hostId && !hostAboutSelf && event.authorId !== room.hostId && event.authorId !== event.subjectId && now < silentFrom
  return (
    <>
      <p className="outcome-head">Исход ещё не предложен</p>
      <p className="hint">
        {who}
        {hostLater ? ` Если автор промолчит, вы сможете предложить его сами с ${formatDateTime(silentFrom)}.` : ''}
      </p>
    </>
  )
}

const HOW: Record<'unopposed' | 'host' | 'vote', string> = {
  unopposed: 'без возражений',
  host: 'ведущим',
  vote: 'голосованием',
}

// Исход предложен: строка статуса сверху, ниже — история (предложение, возражения, решение, голоса)
function OutcomeState({
  room,
  event,
  o,
  now,
  title,
}: {
  room: SavedRoom
  event: EventView
  o: OutcomeView
  now: number
  title: (id: string) => string
}) {
  const who = (id: string) => nameOf(room, id) + (id === room.memberId ? ' (вы)' : '')
  const p = o.proposal
  const proposed = `Предложен исход „${title(p.outcome)}“ (${who(p.by)}, ${formatDateTime(p.at)})`
  const approved = o.approved
  const how = approved && (approved.how === 'host' && approved.by ? `${HOW.host} (${who(approved.by)})` : HOW[approved.how])

  let head
  if (o.status === 'cancelled') {
    head = (
      <>
        <p className="outcome-head cancelled">Событие отменено — исход не действует, выплат нет</p>
        {approved && <p className="hint">Был утверждён „{title(approved.outcome)}“ до отмены.</p>}
      </>
    )
  } else if (approved) {
    head = (
      <>
        <p className="outcome-head approved">
          Утверждён „{title(approved.outcome)}“ — {how}
        </p>
        <p className="hint">
          {formatDateTime(approved.at)}.{' '}
          {o.status === 'final' ? <strong className="final">Окончательно.</strong> : o.finalAt ? `Станет окончательным ${formatDateTime(o.finalAt)}.` : ''}
        </p>
      </>
    )
  } else if (o.status === 'proposed') {
    head = (
      <p className="outcome-head">
        {proposed}
        {now < o.objectionUntil ? `, возразить до ${formatDateTime(o.objectionUntil)}` : ' — сутки на возражение прошли'}
      </p>
    )
  } else if (o.status === 'disputed') {
    head = (
      <p className="outcome-head">
        Есть возражение — решает ведущий, {who(room.hostId)}
      </p>
    )
  } else if (o.status === 'voting') {
    head = <p className="outcome-head">Есть возражение — голосуют не ставившие{o.votingUntil ? `, до ${formatDateTime(o.votingUntil)}` : ''}</p>
  } else {
    head = (
      <>
        <p className="outcome-head court">Ждёт суда (этап 4)</p>
        <p className="hint">{courtReason(o)}</p>
      </>
    )
  }

  return (
    <>
      {head}
      <ul className="outcome-log" aria-label="Ход исхода">
        {(o.status !== 'proposed' || approved) && <li>{proposed}</li>}
        {o.objections.map((x) => (
          <li key={x.id}>
            Возражение: {who(x.by)}, {x.reason}
            <span className="hint"> · {formatDateTime(x.at)}</span>
          </li>
        ))}
        {o.decision && (
          <li>
            Решение ведущего: „{title(o.decision.outcome)}“ ({who(o.decision.by)}, {formatDateTime(o.decision.at)})
          </li>
        )}
        {o.voters.length > 0 && <Voters o={o} who={who} />}
      </ul>
      {approved && o.status !== 'cancelled' && <Payouts room={room} event={event} o={o} winner={approved.outcome} title={title} />}
    </>
  )
}

function courtReason(o: OutcomeView): string {
  if (o.voters.length === 0) return 'Голосовать некому: все ставили или предмет спора. Исход не утверждён.'
  if (o.votes.length === 0) return 'За 72 часа никто не проголосовал. Исход не утверждён.'
  return 'Голоса разделились поровну. Исход не утверждён.'
}

// Кто голосует и кто уже проголосовал (за что — не показываем)
function Voters({ o, who }: { o: OutcomeView; who: (id: string) => string }) {
  const voted = new Set(o.votes.map((v) => v.by))
  return (
    <li>
      Голосуют: проголосовали {voted.size} из {o.voters.length}
      {o.votingUntil ? `, голосование до ${formatDateTime(o.votingUntil)}` : ''}
      <ul className="voters">
        {o.voters.map((m) => (
          <li key={m} className={voted.has(m) ? 'voted' : ''}>
            {who(m)} — {voted.has(m) ? 'проголосовал(а)' : 'ещё нет'}
          </li>
        ))}
      </ul>
    </li>
  )
}

// Таблица выплат по утверждённому исходу (settlePool на сервере): кто поставил — получил — итог;
// на телефоне — карточки. Сверху — основание: банк, ставки на выигравший исход, коэффициент
function Payouts({
  room,
  event,
  o,
  winner,
  title,
}: {
  room: SavedRoom
  event: EventView
  o: OutcomeView
  winner: string
  title: (id: string) => string
}) {
  const odds = poolOdds(
    event.outcomes.map((x) => x.id),
    event.bets,
  )
  const onWinner = odds.outcomes.find((x) => x.outcome === winner)
  const sum = (n: number) => money(n, room.currency)
  const net = (p: Payout) => (p.net > 0 ? '+' : '') + sum(p.net)
  let basis: string
  if (o.void) {
    basis = onWinner && onWinner.stake > 0 ? 'все ставки — на один исход: выигрывать не у кого' : `на „${title(winner)}“ никто не ставил`
  } else {
    basis = `банк ${sum(odds.bank)}, на „${title(winner)}“ ${sum(onWinner?.stake ?? 0)} — коэффициент ${formatOdds(onWinner?.odds ?? null)}: поставившие на „${title(winner)}“ делят банк по своим ставкам, остальные теряют ставку`
  }
  return (
    <section className="payouts-box" aria-label="Выплаты">
      {o.void ? <p className="outcome-head">Без игры: ставки возвращены</p> : <h3>Выплаты</h3>}
      <p className="hint">{o.void ? `Каждому — его сумма: ${basis}.` : basis[0].toUpperCase() + basis.slice(1) + '.'}</p>
      {o.payouts.length === 0 ? (
        <p className="hint">Ставок не было.</p>
      ) : (
        <table className="payouts">
          <thead>
            <tr>
              <th scope="col">Кто</th>
              <th scope="col">Поставил</th>
              <th scope="col">Получил</th>
              <th scope="col">Итог</th>
            </tr>
          </thead>
          <tbody>
            {o.payouts.map((p) => (
              <tr key={p.memberId} className={p.memberId === room.memberId ? 'mine' : ''}>
                <th scope="row">
                  {nameOf(room, p.memberId)}
                  {p.memberId === room.memberId ? ' (вы)' : ''}
                </th>
                <td data-label="Поставил">{sum(p.staked)}</td>
                <td data-label="Получил">{sum(p.payout)}</td>
                <td data-label="Итог" className={p.net > 0 ? 'win' : p.net < 0 ? 'loss' : ''}>
                  {net(p)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

// Выбор исхода (предложить, решить, голосовать) → окно подтверждения
function ChooseOutcome({
  event,
  legend,
  button,
  disabled,
  onChoose,
}: {
  event: EventView
  legend: string
  button: string
  disabled: boolean
  onChoose: (outcome: string) => void
}) {
  const [outcome, setOutcome] = useState<string | null>(null)
  const [error, setError] = useState('')
  const name = 'outcome-' + button

  function submit(e: FormEvent) {
    e.preventDefault()
    if (disabled) return
    if (!outcome) return setError('Выберите исход')
    setError('')
    onChoose(outcome)
  }

  return (
    <form className="form outcome-form" onSubmit={submit} aria-label={button}>
      <fieldset className="field">
        <legend>{legend}</legend>
        <div className="chips">
          {event.outcomes.map((o) => (
            <label key={o.id} className="chip">
              <input type="radio" name={name} checked={outcome === o.id} onChange={() => setOutcome(o.id)} />
              <span>{o.title}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="button" type="submit" disabled={disabled}>
          {button}
        </button>
      </div>
    </form>
  )
}

// Возражение: причина обязательна → окно подтверждения
function ObjectForm({ disabled, onObject, onClose }: { disabled: boolean; onObject: (reason: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (disabled) return
    const checked = checkObjection(reason)
    if (!checked.ok) return setError(checked.error)
    setError('')
    onObject(checked.value)
  }

  return (
    <form className="form outcome-form" onSubmit={submit} aria-label="Возразить">
      <label className="field">
        <span>Причина возражения</span>
        <textarea className="input textarea" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={MAX_EVENT_TEXT * 2} rows={2} />
        <span className="hint">Видно всем. Возражение — одно, отозвать нельзя.</span>
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="button" type="submit" disabled={disabled}>
          Возразить
        </button>
        <button className="button secondary" type="button" onClick={onClose}>
          Не возражать
        </button>
      </div>
    </form>
  )
}

// Окно подтверждения действия с исходом. Синхронный замок и номер запроса: второе нажатие и повтор
// после «нет связи» — то же действие (Р-13). Ответ принят — номер забыт
function ConfirmAction({
  ask,
  busy,
  onClose,
  onDone,
}: {
  ask: Ask
  busy: { current: boolean }
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    if (busy.current) return // синхронный замок: второе нажатие раньше перерисовки
    const slot = ask.slot
    const request = requestFor(pending.get(slot) ?? null, ask.form, ulid)
    pending.set(slot, request)
    busy.current = true
    setSending(true)
    setError('')
    try {
      const res = await ask.send(request.requestId)
      if (!res.ok) return setError(res.error)
      pending.delete(slot)
      busy.current = false
      await onDone()
    } finally {
      busy.current = false
      setSending(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !busy.current && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={ask.question} onClick={(e) => e.stopPropagation()}>
        <p className="modal-question">{ask.question}</p>
        <p>{ask.note}</p>
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
