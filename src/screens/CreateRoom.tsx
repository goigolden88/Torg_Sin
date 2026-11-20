// «Создать комнату» по паролю компании (Р-03). Повтор той же формы — тот же номер запроса:
// двойное нажатие и «Создать» ещё раз после «нет связи» дают одну комнату (Р-13). «Кто кому переводит»
// (Р-32): «По ставкам» (выбран) или «Меньше переводов»; в комнате на очки выбора нет
import { useCallback, useRef, useState, type FormEvent } from 'react'
import { createRoom, fetchRoom } from '../api'
import { CURRENCIES, currencyLabel, type CurrencyCode } from '../rules/currency'
import { checkRoomInput, MAX_MEMBER_NAME, MAX_ROOM_NAME } from '../rules/room'
import { formKey, requestFor, type PendingRequest } from '../rules/request'
import { ulid } from '../rules/ulid'
import { getPassword, getServer, setPassword } from '../settings'
import { store, type SavedRoom } from '../store/db'
import type { SettleModeView } from '../rules/protocol'
import { BackLink, useEscape } from './BackLink'
import { isPoints, MODE_ABOUT, MODE_TITLE, MODES } from './settleParts'

const NEED_PASSWORD = 'Нужен пароль компании'
const NOT_SAVED = 'Комната создана, но не записалась на этом устройстве. Нажмите «Создать» ещё раз — будет та же комната'

export function CreateRoom({ onCreated }: { onCreated: (room: SavedRoom) => void }) {
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState<CurrencyCode>('RUB')
  // Режим «кто кому» (Р-32): по умолчанию — по ставкам; в комнате на очки выбора нет
  const [settleMode, setSettleMode] = useState<SettleModeView>('stakes')
  const points = isPoints(currency)
  const mode: SettleModeView = points ? 'stakes' : settleMode
  const [hostName, setHostName] = useState('')
  const [password, setPasswordDraft] = useState(getPassword)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Синхронный замок: второе нажатие приходит раньше, чем React перерисует кнопку
  const sending = useRef(false)
  const pending = useRef<PendingRequest | null>(null)

  useEscape(
    useCallback(() => {
      if (!sending.current) location.hash = '#/'
    }, []),
  )

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (sending.current) return
    const checked = checkRoomInput({ name, currency, hostName })
    if (!checked.ok) return setError(checked.error)
    if (!password.trim()) return setError(NEED_PASSWORD)
    const server = getServer()
    const request = requestFor(pending.current, formKey(checked.input.name, currency, checked.input.hostName, password, server, mode), ulid)
    pending.current = request

    sending.current = true
    setBusy(true)
    setError('')
    try {
      // «По ставкам» — без поля: так и сервер до этапа 5 комнату создаст
      const modeField = mode === 'stakes' ? {} : { settleMode: mode }
      const created = await createRoom(server, { password, ...checked.input, ...modeField, requestId: request.requestId })
      if (!created.ok) return setError(created.error)
      const { roomId, invite, memberId, key } = created.value
      setPassword(password) // пароль верный — устройство его помнит
      // Сразу спросить состояние: время создания и участники — сервера. Не вышло — из формы
      const state = await fetchRoom(server, roomId, key)
      const room: SavedRoom = {
        id: roomId,
        server,
        memberId,
        key,
        invite,
        name: state.ok ? state.value.room.name : checked.input.name,
        currency: state.ok ? state.value.room.currency : currency,
        hostId: state.ok ? state.value.room.hostId : memberId,
        createdAt: state.ok ? state.value.room.createdAt : Date.now(),
        members: state.ok ? state.value.members : [{ id: memberId, name: checked.input.hostName }],
        savedAt: Date.now(),
        syncedAt: state.ok ? Date.now() : null,
        settlement: state.ok ? state.value.settlement : undefined,
      }
      try {
        await store().saveRoom(room)
      } catch {
        return setError(NOT_SAVED)
      }
      pending.current = null
      onCreated(room)
      location.hash = '#/room/' + roomId
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <BackLink />
      <h2>Новая комната</h2>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Название</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_ROOM_NAME * 2}
            placeholder="Например: Дача 2026"
            autoComplete="off"
          />
        </label>
        <fieldset className="field">
          <legend>Валюта</legend>
          <div className="chips">
            {CURRENCIES.map((c) => (
              <label key={c.code} className="chip">
                <input type="radio" name="currency" value={c.code} checked={currency === c.code} onChange={() => setCurrency(c.code)} />
                <span>{currencyLabel(c.code)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {!points && (
          <fieldset className="field">
            <legend>Кто кому переводит</legend>
            {MODES.map((m) => (
              <label key={m} className="check">
                <input type="radio" name="settle-mode" value={m} checked={settleMode === m} onChange={() => setSettleMode(m)} />
                <span>
                  {MODE_TITLE[m]}
                  <span className="hint"> — {MODE_ABOUT[m]}</span>
                </span>
              </label>
            ))}
            <span className="hint">Ведущий может сменить режим в «Расчёте», пока переводов нет.</span>
          </fieldset>
        )}
        <label className="field">
          <span>Ваше имя в комнате</span>
          <input
            className="input"
            value={hostName}
            onChange={(e) => setHostName(e.target.value)}
            maxLength={MAX_MEMBER_NAME * 2}
            placeholder="Как вас зовут друзья"
            autoComplete="nickname"
          />
        </label>
        <label className="field">
          <span>Пароль компании</span>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPasswordDraft(e.target.value)}
            autoComplete="current-password"
          />
          <span className="hint">Этот телефон запомнит пароль — стереть можно в «Настройках».</span>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button className="button" type="submit" disabled={busy}>
            {busy ? 'Создаю…' : 'Создать'}
          </button>
          <a className="button secondary" href="#/">
            Отмена
          </a>
        </div>
      </form>
    </div>
  )
}
