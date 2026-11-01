// «Новое событие» по шаблону «Условие / Как проверяем / Срок» (Р-04): исходы «Да / Нет» или свои
// 2–6 (сервер добавит последним «Другое», Р-16), сроки — местное время телефона, на сервер — UTC,
// предмет спора — участник или никто. Повтор той же формы — тот же номер запроса: двойное
// нажатие и «Завести» ещё раз после «нет связи» дают одно событие (Р-13). Ошибка — текст сервера,
// введённое остаётся
import { useCallback, useRef, useState, type FormEvent } from 'react'
import { createEvent } from '../api'
import { fromLocalInput, toLocalInput } from '../rules/date'
import { checkEventInput, MAX_EVENT_TEXT, MAX_OUTCOME, MAX_OUTCOMES, MIN_OUTCOMES, NEED_TIMES, OTHER } from '../rules/event'
import { formKey, requestFor, type PendingRequest } from '../rules/request'
import { ulid } from '../rules/ulid'
import type { SavedRoom } from '../store/db'
import { BackLink, useEscape } from './BackLink'
import { eventHref } from './eventParts'
import { useRoom } from './useRoom'

type Mode = 'yes-no' | 'own'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

// Подсказка сроков: приём — до завтра в это же время (до ровного часа), исход — ещё через сутки
function defaultTimes(now: number): { closes: string; expected: string } {
  const closes = Math.ceil((now + DAY) / HOUR) * HOUR
  return { closes: toLocalInput(closes), expected: toLocalInput(closes + DAY) }
}

export function NewEvent({ room, onUpdate }: { room: SavedRoom; onUpdate: (room: SavedRoom) => void }) {
  const { sync, refresh } = useRoom(room, onUpdate)
  const [condition, setCondition] = useState('')
  const [check, setCheck] = useState('')
  const [mode, setMode] = useState<Mode>('yes-no')
  const [own, setOwn] = useState<string[]>(['', ''])
  const [times] = useState(() => defaultTimes(Date.now()))
  const [closes, setCloses] = useState(times.closes)
  const [expected, setExpected] = useState(times.expected)
  const [subject, setSubject] = useState('') // пусто — никто
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Синхронный замок: второе нажатие приходит раньше, чем React перерисует кнопку
  const sending = useRef(false)
  const pending = useRef<PendingRequest | null>(null)
  const back = '#/room/' + room.id

  useEscape(
    useCallback(() => {
      if (!sending.current) location.hash = back
    }, [back]),
  )

  function setOutcome(i: number, value: string) {
    setOwn((list) => list.map((x, j) => (j === i ? value : x)))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (sending.current) return
    const closesAt = fromLocalInput(closes)
    const expectedAt = fromLocalInput(expected)
    if (closesAt === null || expectedAt === null) return setError(NEED_TIMES)
    const outcomes = mode === 'own' ? own : undefined
    const checked = checkEventInput({ condition, check, outcomes, closesAt, expectedAt, subject: subject || null })
    if (!checked.ok) return setError(checked.error)
    const input = checked.value
    const titles = mode === 'own' ? own.map((t) => t.trim()) : []
    const form = formKey(room.id, input.condition, input.check, mode, ...titles, String(closesAt), String(expectedAt), subject)
    const request = requestFor(pending.current, form, ulid)
    pending.current = request

    sending.current = true
    setBusy(true)
    setError('')
    try {
      const res = await createEvent(room.server, room.id, room.key, {
        condition: input.condition,
        check: input.check,
        ...(mode === 'own' ? { outcomes: titles } : {}),
        closesAt,
        expectedAt,
        ...(subject ? { subject } : {}),
        requestId: request.requestId,
      })
      if (!res.ok) return setError(res.error)
      pending.current = null
      await refresh() // событие — в комнату на устройстве; не вышло — экран события спросит сам
      location.hash = eventHref(room.id, res.value.event.id)
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  return (
    <div className="card event-form">
      <BackLink href={back} />
      <h2>Новое событие</h2>
      {sync.state === 'fail' && <p className="error">{sync.text}</p>}
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Условие</span>
          <textarea
            className="input textarea"
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            maxLength={MAX_EVENT_TEXT * 2}
            rows={2}
            placeholder="Например: в субботу на даче будет дождь"
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
            placeholder="Например: кто на даче — присылает фото"
          />
        </label>

        <fieldset className="field">
          <legend>Исходы</legend>
          <div className="chips">
            <label className="chip">
              <input type="radio" name="mode" checked={mode === 'yes-no'} onChange={() => setMode('yes-no')} />
              <span>Да / Нет</span>
            </label>
            <label className="chip">
              <input type="radio" name="mode" checked={mode === 'own'} onChange={() => setMode('own')} />
              <span>Свои варианты</span>
            </label>
          </div>
          {mode === 'own' && (
            <div className="outcomes-edit">
              {own.map((value, i) => (
                <div key={i} className="outcome-edit">
                  <label className="field">
                    <span>Вариант {i + 1}</span>
                    <input className="input" value={value} onChange={(e) => setOutcome(i, e.target.value)} maxLength={MAX_OUTCOME * 2} autoComplete="off" />
                  </label>
                  {own.length > MIN_OUTCOMES && (
                    <button
                      className="button secondary"
                      type="button"
                      aria-label={`Убрать вариант ${i + 1}`}
                      onClick={() => setOwn((list) => list.filter((_, j) => j !== i))}
                    >
                      Убрать
                    </button>
                  )}
                </div>
              ))}
              {own.length < MAX_OUTCOMES && (
                <div className="row">
                  <button className="button secondary" type="button" onClick={() => setOwn((list) => [...list, ''])}>
                    Добавить вариант
                  </button>
                </div>
              )}
              <p className="hint">
                Последним добавится «{OTHER}» — на случай, если не сбудется ни один вариант.
              </p>
            </div>
          )}
        </fieldset>

        <div className="times">
          <label className="field">
            <span>Приём ставок до</span>
            <input className="input" type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} />
          </label>
          <label className="field">
            <span>Исход ожидается к</span>
            <input className="input" type="datetime-local" value={expected} onChange={(e) => setExpected(e.target.value)} />
          </label>
        </div>
        <p className="hint">Время — местное, на этом устройстве. Приём закрывается по часам сервера.</p>

        <fieldset className="field">
          <legend>Предмет спора</legend>
          <div className="chips">
            <label className="chip">
              <input type="radio" name="subject" checked={subject === ''} onChange={() => setSubject('')} />
              <span>Никто</span>
            </label>
            {room.members.map((m) => (
              <label key={m.id} className="chip">
                <input type="radio" name="subject" checked={subject === m.id} onChange={() => setSubject(m.id)} />
                <span>{m.id === room.memberId ? `${m.name} (вы)` : m.name}</span>
              </label>
            ))}
          </div>
          <span className="hint">Если спор о ком-то из участников («Боря подтянется 20 раз»): он может ставить, но не объявляет исход.</span>
        </fieldset>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button className="button" type="submit" disabled={busy}>
            {busy ? 'Завожу…' : 'Завести событие'}
          </button>
          <a className="button secondary" href={back}>
            Отмена
          </a>
        </div>
      </form>
    </div>
  )
}
