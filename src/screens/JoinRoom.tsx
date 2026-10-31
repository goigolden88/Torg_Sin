// Вход по ссылке-приглашению (Р-03): что за комната → имя → «Попроситься» → ожидание, пока
// ведущий впустит (опрос сервера раз в 5 секунд, пока экран открыт). Заявка с ключом
// записывается на устройстве: закрыли и открыли ссылку снова — снова ожидание, а не новая заявка.
// Сервер — из ссылки; «Настройки» не меняются
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { fetchRoom, joinRoom, previewRoom } from '../api'
import type { InviteLink } from '../rules/link'
import { formKey, requestFor, type PendingRequest } from '../rules/request'
import { checkMemberName, MAX_MEMBER_NAME } from '../rules/room'
import { ulid } from '../rules/ulid'
import { store, withState, type SavedJoin, type SavedRoom } from '../store/db'
import { BackLink, useEscape } from './BackLink'
import { usePoll } from './usePoll'

const ROOM_NOT_SAVED = 'Ведущий впустил, но комната не записалась на этом устройстве — обновите страницу'

type Preview = { name: string; hostName: string }
type Phase =
  | { kind: 'loading' }
  | { kind: 'preview-failed'; text: string; offline: boolean }
  | { kind: 'form'; preview: Preview }
  | { kind: 'waiting'; join: SavedJoin }
  | { kind: 'rejected'; join: SavedJoin }

export function JoinRoom({ link, onJoined }: { link: InviteLink; onJoined: (room: SavedRoom) => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  // Постоянные: от них зависит опрос в Waiting — новая функция на каждой перерисовке спрашивала бы сервер заново
  const toPhase = useCallback((join: SavedJoin) => setPhase({ kind: join.status === 'rejected' ? 'rejected' : 'waiting', join }), [])

  useEscape(
    useCallback(() => {
      location.hash = '#/'
    }, []),
  )

  // Комната уже есть — открыть её; заявка уже подана — ждать; иначе — что за комната
  useEffect(() => {
    let alive = true
    void (async () => {
      const saved = await store()
        .getRoom(link.roomId)
        .catch(() => undefined)
      if (!alive) return
      if (saved) return location.replace('#/room/' + saved.id)
      const join = await store()
        .getJoin(link.roomId)
        .catch(() => undefined)
      if (!alive) return
      if (join) return toPhase(join)
      setPhase({ kind: 'loading' })
      const res = await previewRoom(link.server, link.roomId, link.invite)
      if (!alive) return
      setPhase(res.ok ? { kind: 'form', preview: res.value } : { kind: 'preview-failed', text: res.error, offline: !!res.offline })
    })()
    return () => {
      alive = false
    }
  }, [link.roomId, link.invite, link.server, attempt, toPhase])

  return (
    <div className="card join">
      <BackLink />
      {phase.kind === 'loading' && <p className="hint">Смотрю, что за комната…</p>}
      {phase.kind === 'preview-failed' && (
        <>
          <h2>Вход в комнату</h2>
          <p className="error" role="alert">
            {phase.text}
          </p>
          {phase.offline && (
            <div className="row">
              <button className="button" type="button" onClick={() => setAttempt((n) => n + 1)}>
                Повторить
              </button>
            </div>
          )}
        </>
      )}
      {phase.kind === 'form' && <JoinForm link={link} preview={phase.preview} onSent={toPhase} />}
      {phase.kind === 'waiting' && <Waiting join={phase.join} onJoined={onJoined} onRejected={toPhase} />}
      {phase.kind === 'rejected' && (
        <>
          <h2>Ведущий отклонил заявку</h2>
          <p className="hint">
            Комната «{phase.join.roomName}», ведущий — {phase.join.hostName}. Вы просились как {phase.join.name}.
          </p>
          <div className="row">
            <a className="button secondary" href="#/">
              К моим комнатам
            </a>
          </div>
        </>
      )}
    </div>
  )
}

function JoinForm({ link, preview, onSent }: { link: InviteLink; preview: Preview; onSent: (join: SavedJoin) => void }) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Синхронный замок от двойного нажатия; повтор той же формы — тот же номер запроса (Р-13)
  const sending = useRef(false)
  const pending = useRef<PendingRequest | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (sending.current) return
    const checked = checkMemberName(name)
    if (!checked.ok) return setError(checked.error)
    const request = requestFor(pending.current, formKey(checked.name, link.roomId, link.invite, link.server), ulid)
    pending.current = request

    sending.current = true
    setBusy(true)
    setError('')
    try {
      const res = await joinRoom(link.server, link.roomId, { invite: link.invite, name: checked.name, requestId: request.requestId })
      // Ошибка — текст сервера («Такое имя уже есть — добавьте букву», «Нет связи с сервером»); имя остаётся в поле
      if (!res.ok) return setError(res.error)
      const join: SavedJoin = {
        roomId: link.roomId,
        server: link.server,
        invite: link.invite,
        name: checked.name,
        memberId: res.value.memberId,
        key: res.value.key,
        roomName: preview.name,
        hostName: preview.hostName,
        status: res.value.join === 'rejected' ? 'rejected' : 'waiting',
        savedAt: Date.now(),
      }
      // Не записалось (частный режим) — ожидание работает, пока страница открыта
      await store()
        .saveJoin(join)
        .catch(() => undefined)
      onSent(join)
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  return (
    <>
      <h2>
        Вход в комнату „{preview.name}“, ведущий — {preview.hostName}
      </h2>
      <p className="hint">Назовитесь и попроситесь — ведущий увидит заявку и впустит.</p>
      <form className="form" onSubmit={submit}>
        <label className="field">
          <span>Ваше имя в комнате</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_MEMBER_NAME * 2}
            placeholder="Как вас зовут друзья"
            autoComplete="nickname"
            autoFocus
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button className="button" type="submit" disabled={busy}>
            {busy ? 'Отправляю…' : 'Попроситься'}
          </button>
        </div>
      </form>
    </>
  )
}

// Ожидание: ключ заявки спрашивает комнату; 200 — впустили, отметка «rejected» — отклонили
function Waiting({
  join,
  onJoined,
  onRejected,
}: {
  join: SavedJoin
  onJoined: (room: SavedRoom) => void
  onRejected: (join: SavedJoin) => void
}) {
  const [note, setNote] = useState('')

  const tick = useCallback(async () => {
    const res = await fetchRoom(join.server, join.roomId, join.key)
    if (res.ok) {
      const base: SavedRoom = {
        id: join.roomId,
        server: join.server,
        memberId: res.value.me,
        key: join.key,
        invite: null,
        name: join.roomName,
        currency: '',
        hostId: '',
        createdAt: 0,
        members: [],
        savedAt: Date.now(),
        syncedAt: null,
      }
      const room = withState(base, res.value, Date.now())
      try {
        await store().admitJoin(room)
      } catch {
        return setNote(ROOM_NOT_SAVED)
      }
      onJoined(room)
      location.replace('#/room/' + room.id)
      return
    }
    if (res.join === 'rejected') {
      const rejected: SavedJoin = { ...join, status: 'rejected' }
      await store()
        .saveJoin(rejected)
        .catch(() => undefined)
      onRejected(rejected)
      return
    }
    setNote(res.join === 'waiting' ? '' : res.offline ? 'Нет связи с сервером — пробую снова' : res.error)
  }, [join, onJoined, onRejected])
  usePoll(tick)

  return (
    <>
      <h2>Ждём, пока ведущий впустит</h2>
      <p className="hint">
        Комната «{join.roomName}», ведущий — {join.hostName}. Вы попросились как {join.name}.
      </p>
      <p className="waiting" role="status">
        <span className="pulse" aria-hidden="true" /> Экран обновится сам, как только ведущий решит
      </p>
      {note && <p className="error">{note}</p>}
    </>
  )
}
