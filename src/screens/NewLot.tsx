// «Новый лот» (этап 7, Р-09, Р-38): название, описание (по желанию), старт, шаг (подставлен 10 % старта —
// auctionStep), конец торга (от 10 минут до 3 дней) со строкой «Торг закончится не позже …». Под формой по
// ходу ввода — что значат старт и шаг (lotSummary). «Выставить» — окно подтверждения; повтор той же формы —
// тот же номер запроса: двойное нажатие и повтор после «нет связи» дают один лот (Р-13). Отказ сервера —
// текстом под формой, введённое остаётся. Проверка до отправки — правила (checkLotInput, checkLotTimes на
// часах сервера). Enter отправляет, Esc — в комнату (из окна — закрывает окно)
import { useCallback, useRef, useState, type FormEvent } from 'react'
import { createLot } from '../api'
import { auctionStep } from '../rules/auction'
import { currency as currencyOf, isCurrencyCode, parseAmount } from '../rules/currency'
import { formatDateTime, fromLocalInput, toLocalInput } from '../rules/date'
import { MAX_EVENT_TEXT } from '../rules/event'
import { BAD_LOT_START, BAD_LOT_STEP, checkLotInput, checkLotTimes, MAX_LOT_TITLE, NEED_LOT_END, type LotInput } from '../rules/lot'
import { formKey, requestFor, type PendingRequest } from '../rules/request'
import { ulid } from '../rules/ulid'
import type { SavedRoom } from '../store/db'
import { BackLink, useEscape } from './BackLink'
import { lotHref, lotSummary } from './lotParts'
import { latestEndLine, unitsText } from './offerParts'
import { serverTime, useRoom } from './useRoom'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const UNKNOWN_CURRENCY = 'Валюта комнаты незнакома этой версии сайта — обновите страницу'

export function NewLot({ room, onUpdate }: { room: SavedRoom; onUpdate: (room: SavedRoom) => void }) {
  const { sync, clock, refresh } = useRoom(room, onUpdate)
  const code = isCurrencyCode(room.currency) ? room.currency : null
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [start, setStart] = useState('')
  const [step, setStep] = useState<string | null>(null) // null — подставлен 10 % старта
  // Подсказка конца торга — через сутки к ровному часу
  const [closes, setCloses] = useState(() => toLocalInput(Math.ceil((Date.now() + DAY) / HOUR) * HOUR))
  const [error, setError] = useState('')
  const [ask, setAsk] = useState<LotInput | null>(null)
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
  const parse = (text: string) => {
    if (!code || !text.trim()) return null
    const p = parseAmount(text, code)
    return p.ok ? p.units : null
  }
  const startUnits = parse(start)
  const stepText = step ?? (startUnits !== null && code ? unitsText(auctionStep(startUnits), code) : '')
  const endAt = fromLocalInput(closes)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (sending.current) return
    if (!code) return setError(UNKNOWN_CURRENCY)
    const closesAt = fromLocalInput(closes)
    if (closesAt === null) return setError(NEED_LOT_END)
    const s = parseAmount(start, code)
    if (!s.ok) return setError(start.trim() ? s.error : BAD_LOT_START)
    const st = parseAmount(stepText, code)
    if (!st.ok) return setError(stepText.trim() ? st.error : BAD_LOT_STEP)
    const checked = checkLotInput({ title, description, start: s.units, step: st.units, closesAt })
    if (!checked.ok) return setError(checked.error)
    const late = checkLotTimes(checked.value, serverTime(clock))
    if (late) return setError(late)
    setError('')
    setAsk(checked.value)
  }

  async function confirm() {
    if (!ask || sending.current) return
    const x = ask
    const form = formKey(room.id, 'lot', x.title, x.description, String(x.start), String(x.step), String(x.closesAt))
    const request = requestFor(pending.current, form, ulid)
    pending.current = request
    sending.current = true
    setBusy(true)
    try {
      const res = await createLot(room.server, room.id, room.key, {
        title: x.title,
        ...(x.description ? { description: x.description } : {}),
        start: x.start,
        step: x.step,
        closesAt: x.closesAt,
        requestId: request.requestId,
      })
      if (!res.ok) {
        setAsk(null)
        return setError(res.error)
      }
      pending.current = null
      await refresh() // лот — в комнату на устройстве; не вышло — экран лота спросит сам
      location.hash = lotHref(room.id, res.value.lot.id)
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  return (
    <div className="card event-form lot-form">
      <BackLink href={back} />
      <h2>Новый лот</h2>
      <p className="hint">Вещь, цифровой товар или услуга: участники перебивают друг друга, лучшая ставка к концу торга покупает. Передача — вне приложения.</p>
      {sync.state === 'fail' && <p className="error">{sync.text}</p>}
      {/* Как «Новое событие»: две обёртки-колонки, до 1280 px одна под другой (styles.css) */}
      <form className="form" onSubmit={submit}>
        <div className="form-col">
          <label className="field">
            <span>Название</span>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={MAX_LOT_TITLE * 2}
              placeholder="Например: Велосипед «Кама»"
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span>Описание</span>
            <textarea
              className="input textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={MAX_EVENT_TEXT * 2}
              rows={3}
              placeholder="Например: синий, 2015 год, звонок в подарок; забрать на даче"
            />
            <span className="hint">По желанию: состояние, как и где передадите.</span>
          </label>
        </div>

        <div className="form-col">
          <div className="times">
            <label className="field">
              <span>Старт, {sign}</span>
              <input className="input" inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} placeholder="Например: 1000" autoComplete="off" />
              <span className="hint">Наименьшая первая ставка</span>
            </label>
            <label className="field">
              <span>Шаг, {sign}</span>
              <input className="input" inputMode="decimal" value={stepText} onChange={(e) => setStep(e.target.value)} autoComplete="off" />
              <span className="hint">{step === null ? 'Подставлено 10 % старта' : 'Новая ставка больше лучшей хотя бы на шаг'}</span>
            </label>
          </div>
          <label className="field">
            <span>Конец торга</span>
            <input className="input" type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} />
          </label>
          <p className="hint">Торг — от 10 минут до 3 дней. Время — местное, торг закрывается по часам сервера.</p>
          {endAt !== null && <p className="hint">{latestEndLine(endAt, 'ставка')}</p>}
        </div>

        <div className="offer-summary" aria-live="polite">
          <p>{lotSummary({ start: startUnits, step: parse(stepText), currency: room.currency })}</p>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button className="button" type="submit" disabled={busy}>
            Выставить
          </button>
          <a className="button secondary" href={back}>
            Отмена
          </a>
        </div>
      </form>

      {ask && (
        <div className="modal-backdrop" onClick={() => !sending.current && setAsk(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Выставить лот?" onClick={(e) => e.stopPropagation()}>
            <p className="modal-question">Выставить лот?</p>
            <p>„{ask.title}“</p>
            {ask.description && <p className="hint">{ask.description}</p>}
            <p>{lotSummary({ start: ask.start, step: ask.step, currency: room.currency })}</p>
            <p className="hint">Торг до {formatDateTime(ask.closesAt)}. {latestEndLine(ask.closesAt, 'ставка')}</p>
            <p className="hint">Лучшая ставка к концу торга побеждает — отклонить её нельзя. Снять лот можно, пока ставок нет.</p>
            <div className="row">
              <button className="button" type="button" onClick={confirm} disabled={busy} autoFocus>
                {busy ? 'Выставляю…' : 'Выставить'}
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
