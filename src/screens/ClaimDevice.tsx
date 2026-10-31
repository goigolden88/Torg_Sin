// Ссылка для другого устройства: по кнопке это устройство получает свой ключ того же участника
// (POST /device/claim) и комната записывается здесь. Ссылка одноразовая — поэтому не сама при
// открытии, а кнопкой: просмотр ссылки в мессенджере её не истратит. Сервер — из ссылки
import { useCallback, useEffect, useRef, useState } from 'react'
import { claimDevice, fetchRoom } from '../api'
import type { DeviceLink } from '../rules/link'
import { store, withState, type SavedRoom } from '../store/db'
import { BackLink, useEscape } from './BackLink'

const NOT_SAVED = 'Комната открыта, но не записалась на этом устройстве. Частный режим браузера?'

type Phase = { kind: 'loading' } | { kind: 'ready' } | { kind: 'here'; room: SavedRoom }

export function ClaimDevice({ link, onClaimed }: { link: DeviceLink; onClaimed: (room: SavedRoom) => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const sending = useRef(false)

  useEscape(
    useCallback(() => {
      if (!sending.current) location.hash = '#/'
    }, []),
  )

  useEffect(() => {
    let alive = true
    store()
      .getRoom(link.roomId)
      .catch(() => undefined)
      .then((room) => {
        if (alive) setPhase(room ? { kind: 'here', room } : { kind: 'ready' })
      })
    return () => {
      alive = false
    }
  }, [link.roomId])

  async function claim() {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setError('')
    try {
      const res = await claimDevice(link.server, link.roomId, link.token)
      if (!res.ok) return setError(res.error)
      const { memberId, key } = res.value
      // Ключ уже выдан, ссылка истрачена: записать комнату, даже если состояние не пришло, —
      // название и участников подтянет экран комнаты
      const base: SavedRoom = {
        id: link.roomId,
        server: link.server,
        memberId,
        key,
        invite: null,
        name: 'Комната',
        currency: '',
        hostId: '',
        createdAt: Date.now(),
        members: [],
        savedAt: Date.now(),
        syncedAt: null,
      }
      const state = await fetchRoom(link.server, link.roomId, key)
      const room = state.ok ? withState(base, state.value, Date.now()) : base
      onClaimed(room)
      try {
        await store().saveRoom(room)
      } catch {
        return setError(NOT_SAVED)
      }
      location.replace('#/room/' + room.id)
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <BackLink />
      <h2>Комната на этом устройстве</h2>
      {phase.kind === 'loading' && <p className="hint">Загружаю…</p>}
      {phase.kind === 'here' && (
        <>
          <p>Комната «{phase.room.name}» уже есть на этом устройстве — ссылка не нужна, пусть остаётся неиспользованной.</p>
          <div className="row">
            <a className="button" href={'#/room/' + phase.room.id}>
              Открыть комнату
            </a>
          </div>
        </>
      )}
      {phase.kind === 'ready' && (
        <>
          <p>По этой ссылке комната откроется здесь — вы будете в ней тем же участником. Ссылка сработает один раз.</p>
          <div className="row">
            <button className="button" type="button" onClick={claim} disabled={busy}>
              {busy ? 'Открываю…' : 'Открыть комнату здесь'}
            </button>
          </div>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
