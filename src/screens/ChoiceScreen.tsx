// Экран выбора (этап 7, Р-09, Р-39): вопрос, получатель (подпись «касса»), фаза и сколько осталось, сроки
// («варианты до», «вклады до» с продлениями и «не позже …»), варианты — с суммами и вкладчиками (вклады
// видны всем, Р-11). Действия — по правам из правил (choice.ts) на часах сервера, без своих проверок: в фазе
// вариантов — «Добавить вариант» (checkChoiceOption), в фазе вкладов — «Вложить» (checkChoiceStake: только
// в один вариант — докладывать в свой). Итог — победитель, «ничья — решил жребий», кто сколько должен
// получателю (choiceDebts). Каждое действие — окном подтверждения с синхронным замком и номером запроса
// (Р-13). Состояние — с сервера раз в 5 с (useRoom); нет связи — последнее известное, действия закрыты.
// Рядом (от 1280 px) или ниже — список выборов комнаты (ChoiceList). Прошедший выбор — «Назад» в «Историю»
import { useCallback, useRef, useState, type FormEvent, type MutableRefObject } from 'react'
import { addChoiceOption, stakeChoice, type Result } from '../api'
import type { ChatNews } from '../rules/chat'
import { checkChoiceOption, checkChoiceStake, choiceDebts, checkOptionTitle, MAX_CHOICE_OPTION, MAX_CHOICE_OPTIONS, NEED_OPTION } from '../rules/choice'
import { currency as currencyOf, isCurrencyCode, parseAmount } from '../rules/currency'
import { formatDateTime } from '../rules/date'
import type { ChoiceView } from '../rules/protocol'
import { formKey, requestFor, type PendingRequest } from '../rules/request'
import { ulid } from '../rules/ulid'
import { savedChoices, type SavedRoom } from '../store/db'
import { BackLink, useEscape } from './BackLink'
import { ChoiceList, ChoiceStatusLine } from './ChoiceList'
import {
  choiceHowLines,
  choiceOutcomeOf,
  choicePastNow,
  choiceRoomOf,
  choiceState,
  debtLine,
  myOption,
  optionStakers,
  optionTitle,
  phaseText,
  recipientLine,
  stakeAskText,
  winnerLine,
} from './choiceParts'
import { ChatButton } from './ChatButton'
import { money, nameOf } from './eventParts'
import { historyHref } from './historyParts'
import { mayCallChat, mayStartNew } from './memberParts'
import { who } from './offerParts'
import { serverTime, useRoom, useServerNow, type Clock } from './useRoom'

const pending = new Map<string, PendingRequest>() // по выбору: окно закрыли и открыли — тот же номер

// Окно подтверждения: вопрос, основание строками, кнопка и запрос
type Ask = {
  question: string
  body: string[]
  button: string
  busyLabel: string
  form: string
  run: (requestId: string) => Promise<Result<{ v: number }>>
}

export function ChoiceScreen({ room, choiceId, onUpdate }: { room: SavedRoom; choiceId: string; onUpdate: (room: SavedRoom) => void }) {
  const { sync, clock, refresh } = useRoom(room, onUpdate)
  const choice = savedChoices(room).find((c) => c.id === choiceId)
  const now = useServerNow(clock, !!choice)
  const [ask, setAsk] = useState<Ask | null>(null)
  const [round, setRound] = useState(0) // действие удалось — формы снова пустые
  const busy = useRef(false) // идёт запрос — окно не закрывается
  // Прошедший выбор живёт в «Истории» — «Назад» туда; идущий — в комнату
  const back = choice && choicePastNow(choice, now) !== null ? historyHref(room.id) : '#/room/' + room.id

  useEscape(
    useCallback(() => {
      if (busy.current) return
      if (ask) setAsk(null)
      else location.hash = back
    }, [ask, back]),
  )

  if (!choice) {
    return (
      <div className="card">
        <BackLink href={back} />
        {sync.state === 'fail' && <p className="error">{sync.text}</p>}
        <p className="hint">{sync.state === 'busy' ? 'Загружаю…' : 'Нет такого выбора.'}</p>
      </div>
    )
  }

  const c: ChoiceView = choice // для действий ниже: выбор уже найден
  const state = choiceState(c)
  const me = room.memberId
  const online = sync.state === 'ok'
  const out = choiceOutcomeOf(c, now)
  const croom = choiceRoomOf(room)
  // Правила: с пустым названием отказ — «нужно название», значит, остальное разрешено
  // Помеченный «выбыл» (Р-41) вариантов не добавляет и не вкладывает; в закрытой комнате (Р-43) — никто
  const dropped = !mayStartNew(room)
  const mayAdd = !dropped && checkChoiceOption(state, me, null, croom, now) === NEED_OPTION && c.options.length < MAX_CHOICE_OPTIONS
  const stakeable = dropped ? [] : c.options.filter((o) => checkChoiceStake(state, me, o.id, 1, croom, now) === null)
  const mine = myOption(c, me)
  const showTotals = out.status !== 'options'
  const winner = winnerLine(room, c, out)
  const debts = choiceDebts(state, now) // у решённого — и между опросами, как у сервера

  return (
    <div className="card event choice">
      <div className="event-main">
        <BackLink href={back} />
        <h2 className="event-title">{c.question}</h2>
        <ul className="offer-facts" aria-label="Условия выбора">
          <li>
            <span className="hint">Получатель</span>
            <span>{recipientLine(room, c)}</span>
          </li>
          <li>
            <span className="hint">Фаза</span>
            <span>{phaseText(out.status)}</span>
          </li>
          <li>
            <span className="hint">Варианты до</span>
            <span>{formatDateTime(c.optionsUntil)}</span>
          </li>
          <li>
            <span className="hint">Вклады до</span>
            <span>
              {formatDateTime(out.endsAt)}
              {out.endsAt > c.closesAt ? ` (продлены с ${formatDateTime(c.closesAt)})` : ''}, не позже {formatDateTime(c.latestEnd)}
            </span>
          </li>
          <li>
            <span className="hint">Предложил(а)</span>
            <span>
              {who(room, c.authorId)}, {formatDateTime(c.at)}
            </span>
          </li>
        </ul>
        <p>
          <ChoiceStatusLine choice={c} now={now} />
        </p>
        {sync.state === 'fail' && <p className="error">{sync.text}</p>}

        {winner && (
          <section className="auction-result choice-result" aria-label="Итог выбора">
            <p className="outcome-head approved">{winner}.</p>
            {out.how === 'draw' && c.draw && (
              <p className="hint">
                В конце — ничья между {c.draw.options.map((o) => optionTitle(c, o)).join(' и ')}: решил жребий сервера {formatDateTime(c.draw.at)}.
              </p>
            )}
            {debts.length > 0 ? (
              <>
                <p>Должны получателю — {nameOf(room, c.recipientId)}:</p>
                <ul className="choice-debts">
                  {debts.map((d) => (
                    <li key={d.from} className={d.from === me || d.to === me ? 'mine' : undefined}>
                      {debtLine(room, d)}
                    </li>
                  ))}
                </ul>
                <p className="hint">Долги — уже в «Расчёте». Вложившиеся в другие варианты не платят.</p>
              </>
            ) : (
              <p className="hint">Никто никому не должен: в победивший вариант вложил только получатель.</p>
            )}
          </section>
        )}
        {out.status === 'failed' && (
          <p className="hint">
            {out.failed === 'options' ? 'К «варианты до» было меньше двух вариантов' : 'Никто не вложил'} — выбор не состоялся, никто никому не должен.
          </p>
        )}
        {out.status === 'draw' && <p className="hint">Вклады закончились ничьей и продления исчерпаны — победителя выберет жребий сервера.</p>}

        <section className="choice-options" aria-label="Варианты">
          <h3>Варианты</h3>
          {c.options.length === 0 ? (
            <p className="hint">Вариантов пока нет.</p>
          ) : (
            <ul className="event-list">
              {c.options.map((o) => {
                const stakers = optionStakers(room, c, o.id)
                return (
                  <li key={o.id} className={'choice-option' + (o.id === out.winner ? ' won' : '') + (o.id === mine ? ' mine' : '')}>
                    <span className="event-name">
                      „{o.title}“{o.id === out.winner && <span className="badge">победил</span>}
                      {o.id === mine && <span className="badge muted">ваш</span>}
                    </span>
                    {showTotals && <span className="choice-total">{money(o.total, room.currency)}</span>}
                    <span className="hint">предложил(а) {who(room, o.by)}</span>
                    {showTotals && <span className="hint">{stakers.length > 0 ? 'вклады: ' + stakers.join(', ') : 'вкладов нет'}</span>}
                  </li>
                )
              })}
            </ul>
          )}
          {out.status === 'options' && <p className="hint">Вклады — с {formatDateTime(c.optionsUntil)}: тогда появятся суммы.</p>}
        </section>

        {mayAdd && <OptionPanel key={'o' + round} room={room} choice={c} clock={clock} busy={busy} online={online} onAsk={setAsk} />}
        {stakeable.length > 0 && (
          <StakePanel key={'s' + round} room={room} choice={c} options={stakeable.map((o) => o.id)} mine={mine} clock={clock} busy={busy} online={online} onAsk={setAsk} />
        )}
        {(mayAdd || stakeable.length > 0) && !online && <p className="hint">Действия — когда есть связь с сервером.</p>}
        {mayCallChat(room) && <ChatButton room={room} screen={{ kind: 'choice', id: c.id }} news={choiceNews(c, out.status, out.winner)} />}

        <div className="offer-summary" aria-label="Как это работает">
          {choiceHowLines(nameOf(room, c.recipientId) + (c.cashbox ? ' — касса' : '')).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>
      <div className="event-side">
        <ChoiceList room={room} clock={clock} current={c.id} />
      </div>

      {ask && (
        <ConfirmAct
          ask={ask}
          choiceId={c.id}
          busy={busy}
          onClose={() => setAsk(null)}
          onDone={async () => {
            setAsk(null)
            setRound((r) => r + 1)
            await refresh()
          }}
        />
      )}
    </div>
  )
}

// Сообщение «Позвать в чат»: всего вложено и вариант — победивший у решённого, иначе с наибольшей суммой
// (вкладов нет — никакой)
function choiceNews(c: ChoiceView, status: ChoiceNewsState, winner: string | null): ChatNews {
  const total = c.options.reduce((s, o) => s + o.total, 0)
  const top = c.options.reduce<ChoiceView['options'][number] | null>((best, o) => (o.total > (best?.total ?? 0) ? o : best), null)
  const lead = status === 'decided' ? (c.options.find((o) => o.id === winner) ?? null) : top
  return { kind: 'choice', question: c.question, state: status, total, lead: lead && { title: lead.title, total: lead.total } }
}

type ChoiceNewsState = Extract<ChatNews, { kind: 'choice' }>['state']

// «Добавить вариант» в фазе вариантов: название; проверка — checkChoiceOption на часах сервера; окно
// подтверждения («вариант не удалить»)
function OptionPanel({
  room,
  choice,
  clock,
  busy,
  online,
  onAsk,
}: {
  room: SavedRoom
  choice: ChoiceView
  clock: Clock | null
  busy: MutableRefObject<boolean>
  online: boolean
  onAsk: (ask: Ask) => void
}) {
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (busy.current) return
    const refusal = checkChoiceOption(choiceState(choice), room.memberId, title, choiceRoomOf(room), serverTime(clock))
    if (refusal) return setError(refusal)
    const t = checkOptionTitle(title)
    if (!t.ok) return setError(t.error)
    setError('')
    const value = t.value
    onAsk({
      question: 'Добавить вариант?',
      body: [`„${value}“ — в выбор „${choice.question}“.`, `Вклады — с ${formatDateTime(choice.optionsUntil)}. Вариант не удалить.`],
      button: 'Добавить',
      busyLabel: 'Добавляю…',
      form: formKey(room.id, choice.id, 'option', value),
      run: (requestId) => addChoiceOption(room.server, room.id, room.key, choice.id, { title: value, requestId }),
    })
  }

  return (
    <form className="panel form" onSubmit={submit} aria-label="Добавить вариант">
      <label className="field">
        <span>Ваш вариант</span>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={MAX_CHOICE_OPTION * 2}
          placeholder="Например: Выборг"
          autoComplete="off"
        />
      </label>
      <span className="hint">
        Любой участник, до {formatDateTime(choice.optionsUntil)}; не больше {MAX_CHOICE_OPTIONS} вариантов, без повторов.
      </span>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="button" type="submit" disabled={!online}>
          Добавить вариант
        </button>
      </div>
    </form>
  )
}

// «Вложить» в фазе вкладов: вариант (уже вкладывал — только свой) и сумма; по ходу ввода — основание
// (stakeAskText); проверка — checkChoiceStake на часах сервера; окно подтверждения
function StakePanel({
  room,
  choice,
  options,
  mine,
  clock,
  busy,
  online,
  onAsk,
}: {
  room: SavedRoom
  choice: ChoiceView
  options: string[]
  mine: string | null
  clock: Clock | null
  busy: MutableRefObject<boolean>
  online: boolean
  onAsk: (ask: Ask) => void
}) {
  const code = isCurrencyCode(room.currency) ? room.currency : null
  const sign = code ? currencyOf(code).sign || code : room.currency
  const [picked, setOption] = useState<string | null>(options.length === 1 ? options[0] : null)
  // Уже вкладывал — только свой вариант (и когда вклад пришёл с сервера после открытия формы)
  const option = mine ?? picked
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const parsed = code && text.trim() ? parseAmount(text, code) : null

  function submit(e: FormEvent) {
    e.preventDefault()
    if (busy.current) return
    if (!code) return setError('Валюта комнаты незнакома этой версии сайта — обновите страницу')
    if (option === null) return setError('Выберите вариант')
    const units = parseAmount(text, code)
    if (!units.ok) return setError(units.error)
    const refusal = checkChoiceStake(choiceState(choice), room.memberId, option, units.units, choiceRoomOf(room), serverTime(clock))
    if (refusal) return setError(refusal)
    setError('')
    const o = option
    onAsk({
      question: 'Вложить?',
      body: [stakeAskText(room, choice, o, units.units), mine === null ? `Дальше докладывать можно только в ${optionTitle(choice, o)}.` : ''].filter(Boolean),
      button: 'Вложить',
      busyLabel: 'Отправляю…',
      form: formKey(room.id, choice.id, 'stake', o, String(units.units)),
      run: (requestId) => stakeChoice(room.server, room.id, room.key, choice.id, { option: o, amount: units.units, requestId }),
    })
  }

  return (
    <form className="panel form" onSubmit={submit} aria-label="Ваш вклад">
      {mine === null ? (
        <fieldset className="field">
          <legend>Ваш вариант</legend>
          <div className="chips">
            {options.map((id) => (
              <label key={id} className="chip">
                <input type="radio" name="choice-option" value={id} checked={option === id} onChange={() => setOption(id)} />
                <span>{optionTitle(choice, id)}</span>
              </label>
            ))}
          </div>
          <span className="hint">Вкладывают только в один вариант — выбрать другой потом нельзя.</span>
        </fieldset>
      ) : (
        <p className="hint">Докладывать — только в свой вариант: {optionTitle(choice, mine)}.</p>
      )}
      <label className="field">
        <span>Вклад, {sign}</span>
        <input className="input" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} placeholder="Например: 500" autoComplete="off" />
      </label>
      <div className="offer-summary" aria-live="polite">
        <p>
          {option === null
            ? 'Выберите вариант и сумму.'
            : parsed?.ok
              ? stakeAskText(room, choice, option, parsed.units)
              : parsed
                ? parsed.error
                : 'Введите сумму вклада.'}
        </p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="button" type="submit" disabled={!online}>
          Вложить
        </button>
      </div>
    </form>
  )
}

// Окно подтверждения действия. Повтор того же действия (двойное нажатие, ещё раз после «нет связи») —
// тот же номер запроса: сервер запишет одно (Р-13). Удалось — номер забыт
function ConfirmAct({
  ask,
  choiceId,
  busy,
  onClose,
  onDone,
}: {
  ask: Ask
  choiceId: string
  busy: MutableRefObject<boolean>
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    if (busy.current) return // синхронный замок: второе нажатие раньше перерисовки
    const request = requestFor(pending.get(choiceId) ?? null, ask.form, ulid)
    pending.set(choiceId, request)
    busy.current = true
    setSending(true)
    setError('')
    try {
      const res = await ask.run(request.requestId)
      if (!res.ok) return setError(res.error)
      pending.delete(choiceId)
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
