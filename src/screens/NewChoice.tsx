// «Новый выбор» (этап 7, Р-09, Р-39): вопрос, варианты (можно сразу — до 10, пустые не в счёт; можно и потом,
// до «варианты до»), получатель — участник комнаты (по умолчанию ведущий) и подпись «касса», «варианты до»
// и «вклады до» (постоянные решения: фаза вариантов — не меньше 10 минут, вклады — не меньше 10 минут после,
// весь выбор — не дольше 3 дней) со строкой «Вклады закончатся не позже …». Под формой — как это работает в
// три строки (choiceHowLines). «Начать» — окно подтверждения; повтор той же формы — тот же номер запроса:
// двойное нажатие и повтор после «нет связи» дают один выбор (Р-13). Отказ сервера — текстом под формой,
// введённое остаётся. Проверка до отправки — правила (checkChoiceInput, checkChoiceTimes на часах сервера).
// Enter отправляет, Esc — в комнату (из окна — закрывает окно)
import { useCallback, useRef, useState, type FormEvent } from 'react'
import { createChoice } from '../api'
import { checkChoiceInput, checkChoiceTimes, MAX_CHOICE_OPTION, MAX_CHOICE_OPTIONS, NEED_CHOICE_TIMES, type ChoiceInput } from '../rules/choice'
import { formatDateTime, fromLocalInput, toLocalInput } from '../rules/date'
import { MAX_EVENT_TEXT } from '../rules/event'
import { formKey, requestFor, type PendingRequest } from '../rules/request'
import { ulid } from '../rules/ulid'
import type { SavedRoom } from '../store/db'
import { BackLink, useEscape } from './BackLink'
import { choiceHowLines, choiceHref, choiceLatestLine, choiceRoomOf } from './choiceParts'
import { nameOf } from './eventParts'
import { serverTime, useRoom } from './useRoom'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

export function NewChoice({ room, onUpdate }: { room: SavedRoom; onUpdate: (room: SavedRoom) => void }) {
  const { sync, clock, refresh } = useRoom(room, onUpdate)
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState<string[]>(['', ''])
  const [recipient, setRecipient] = useState(room.hostId)
  const [cashbox, setCashbox] = useState(false)
  // Подсказки сроков: варианты — через час к ровному часу, вклады — через сутки к ровному часу
  const [optionsUntil, setOptionsUntil] = useState(() => toLocalInput(Math.ceil((Date.now() + HOUR) / HOUR) * HOUR))
  const [closes, setCloses] = useState(() => toLocalInput(Math.ceil((Date.now() + DAY) / HOUR) * HOUR))
  const [error, setError] = useState('')
  const [ask, setAsk] = useState<ChoiceInput | null>(null)
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

  const endAt = fromLocalInput(closes)
  const recipientName = nameOf(room, recipient) + (cashbox ? ' — касса' : '')

  function setOption(i: number, text: string) {
    setOptions((list) => list.map((o, j) => (j === i ? text : o)))
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (sending.current) return
    const until = fromLocalInput(optionsUntil)
    const closesAt = fromLocalInput(closes)
    if (until === null || closesAt === null) return setError(NEED_CHOICE_TIMES)
    // Пустые поля вариантов — не в счёт: варианты можно добавить и потом
    const filled = options.filter((o) => o.trim())
    const checked = checkChoiceInput({ question, options: filled, recipient, cashbox, optionsUntil: until, closesAt }, choiceRoomOf(room))
    if (!checked.ok) return setError(checked.error)
    const late = checkChoiceTimes(checked.value, serverTime(clock))
    if (late) return setError(late)
    setError('')
    setAsk(checked.value)
  }

  async function confirm() {
    if (!ask || sending.current) return
    const x = ask
    const form = formKey(room.id, 'choice', x.question, x.options.join('\n'), x.recipient, String(x.cashbox), String(x.optionsUntil), String(x.closesAt))
    const request = requestFor(pending.current, form, ulid)
    pending.current = request
    sending.current = true
    setBusy(true)
    try {
      const res = await createChoice(room.server, room.id, room.key, {
        question: x.question,
        options: x.options,
        recipient: x.recipient,
        ...(x.cashbox ? { cashbox: true } : {}),
        optionsUntil: x.optionsUntil,
        closesAt: x.closesAt,
        requestId: request.requestId,
      })
      if (!res.ok) {
        setAsk(null)
        return setError(res.error)
      }
      pending.current = null
      await refresh() // выбор — в комнату на устройстве; не вышло — экран выбора спросит сам
      location.hash = choiceHref(room.id, res.value.choice.id)
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  return (
    <div className="card event-form choice-form">
      <BackLink href={back} />
      <h2>Новый выбор</h2>
      <p className="hint">Компания решает, куда поехать или что купить: каждый вкладывает в свой вариант, побеждает большая сумма.</p>
      {sync.state === 'fail' && <p className="error">{sync.text}</p>}
      {/* Как «Новое событие»: две обёртки-колонки, до 1280 px одна под другой (styles.css) */}
      <form className="form" onSubmit={submit}>
        <div className="form-col">
          <label className="field">
            <span>Вопрос</span>
            <textarea
              className="input textarea"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={MAX_EVENT_TEXT * 2}
              rows={2}
              placeholder="Например: Куда едем на майские?"
            />
          </label>
          <fieldset className="field choice-options-field">
            <legend>Варианты</legend>
            {options.map((o, i) => (
              <label key={i} className="field">
                <span>Вариант {i + 1}</span>
                <input
                  className="input"
                  value={o}
                  onChange={(e) => setOption(i, e.target.value)}
                  maxLength={MAX_CHOICE_OPTION * 2}
                  placeholder={i === 0 ? 'Например: Ладога' : i === 1 ? 'Например: Карелия' : ''}
                  autoComplete="off"
                />
              </label>
            ))}
            {options.length < MAX_CHOICE_OPTIONS && (
              <div className="row">
                <button className="button secondary" type="button" onClick={() => setOptions((list) => [...list, ''])}>
                  Ещё вариант
                </button>
              </div>
            )}
            <span className="hint">Можно сразу или потом: варианты предлагает любой участник до «варианты до». Нужно хотя бы два.</span>
          </fieldset>
        </div>

        <div className="form-col">
          <fieldset className="field">
            <legend>Получатель</legend>
            <div className="chips">
              {room.members.map((m) => (
                <label key={m.id} className="chip">
                  <input type="radio" name="choice-recipient" value={m.id} checked={recipient === m.id} onChange={() => setRecipient(m.id)} />
                  <span>
                    {m.name}
                    {m.id === room.hostId ? ' — ведущий' : ''}
                  </span>
                </label>
              ))}
            </div>
            <label className="check">
              <input type="checkbox" checked={cashbox} onChange={(e) => setCashbox(e.target.checked)} />
              <span>Подписать «касса»</span>
            </label>
            <span className="hint">Получателю платят вложившиеся в победивший вариант. «Касса» — только подпись: кошелька нет, деньги — у получателя.</span>
          </fieldset>
          <div className="times">
            <label className="field">
              <span>Варианты до</span>
              <input className="input" type="datetime-local" value={optionsUntil} onChange={(e) => setOptionsUntil(e.target.value)} />
            </label>
            <label className="field">
              <span>Вклады до</span>
              <input className="input" type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} />
            </label>
          </div>
          <p className="hint">
            Варианты — не меньше 10 минут, вклады — не меньше 10 минут после, весь выбор — не дольше 3 дней. Время — местное, фазы закрываются по часам
            сервера.
          </p>
          {endAt !== null && <p className="hint">{choiceLatestLine(endAt)}</p>}
        </div>

        <div className="offer-summary" aria-live="polite" aria-label="Как это работает">
          {choiceHowLines(recipientName).map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button className="button" type="submit" disabled={busy}>
            Начать
          </button>
          <a className="button secondary" href={back}>
            Отмена
          </a>
        </div>
      </form>

      {ask && (
        <div className="modal-backdrop" onClick={() => !sending.current && setAsk(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Начать выбор?" onClick={(e) => e.stopPropagation()}>
            <p className="modal-question">Начать выбор?</p>
            <p>„{ask.question}“</p>
            <p className="hint">{ask.options.length > 0 ? 'Варианты: ' + ask.options.map((o) => `„${o}“`).join(', ') + '.' : 'Вариантов пока нет — их предложат участники.'}</p>
            <p>
              Получатель — {nameOf(room, ask.recipient)}
              {ask.cashbox ? ' (касса)' : ''}. Варианты — до {formatDateTime(ask.optionsUntil)}, вклады — до {formatDateTime(ask.closesAt)}.
            </p>
            <p className="hint">{choiceLatestLine(ask.closesAt)}</p>
            <p className="hint">Выбор не отменить; меньше двух вариантов к «варианты до» — не состоится.</p>
            <div className="row">
              <button className="button" type="button" onClick={confirm} disabled={busy} autoFocus>
                {busy ? 'Начинаю…' : 'Начать'}
              </button>
              <button className="button secondary" type="button" onClick={() => setAsk(null)} disabled={busy}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
