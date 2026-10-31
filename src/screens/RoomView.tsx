// Открытая комната: название, валюта, участники; «Пригласить» — ссылка из токена, который
// хранится у комнаты на устройстве. Сервер не спрашиваем: POST /invite сменил бы ссылку,
// и старая погасла бы. Состояние — с сервера при открытии; нет связи — последнее известное
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchRoom } from '../api'
import { currencyLabel } from '../rules/currency'
import { inviteLink } from '../rules/link'
import { store, type SavedRoom } from '../store/db'
import { BackLink, useEscape } from './BackLink'

type Sync = { state: 'busy' } | { state: 'ok' } | { state: 'fail'; text: string }

export function RoomView({ room, onUpdate }: { room: SavedRoom; onUpdate: (room: SavedRoom) => void }) {
  const [sync, setSync] = useState<Sync>({ state: 'busy' })
  const [inviting, setInviting] = useState(false)
  const latest = useRef(room)
  latest.current = room

  useEffect(() => {
    let alive = true
    const r = latest.current
    fetchRoom(r.server, r.id, r.key).then(async (res) => {
      if (!alive) return
      if (!res.ok) {
        setSync({ state: 'fail', text: res.offline ? 'Нет связи с сервером — показано последнее известное' : res.error })
        return
      }
      const { room: s, members } = res.value
      const next: SavedRoom = { ...latest.current, name: s.name, currency: s.currency, hostId: s.hostId, createdAt: s.createdAt, members, syncedAt: Date.now() }
      setSync({ state: 'ok' })
      onUpdate(next)
      await store()
        .saveRoom(next)
        .catch(() => undefined) // не записалось — покажем с сервера и в следующий раз
    })
    return () => {
      alive = false
    }
  }, [room.id, onUpdate])

  useEscape(
    useCallback(() => setInviting(false), []),
    inviting,
  )

  const isHost = room.hostId === room.memberId

  return (
    <div className="card room">
      <BackLink />
      <h2 className="room-title">{room.name}</h2>
      <p className="hint">
        Валюта: {currencyLabel(room.currency)} · создана {new Date(room.createdAt).toLocaleDateString()}
      </p>
      {sync.state === 'busy' && <p className="hint">Обновляю с сервера…</p>}
      {sync.state === 'fail' && <p className="error">{sync.text}</p>}

      <div className="row">
        <button className="button" type="button" onClick={() => setInviting((v) => !v)} aria-expanded={inviting}>
          Пригласить
        </button>
      </div>
      {inviting && <Invite room={room} isHost={isHost} onClose={() => setInviting(false)} />}

      <h3>Участники</h3>
      <ul className="members">
        {room.members.map((m) => (
          <li key={m.id} className="member">
            <span>{m.name}</span>
            {m.id === room.hostId && <span className="badge">ведущий</span>}
            {m.id === room.memberId && <span className="badge muted">вы</span>}
          </li>
        ))}
      </ul>
      <p className="hint">События и пари — в следующих обновлениях.</p>
    </div>
  )
}

type Copy = 'idle' | 'copied' | 'failed'

function Invite({ room, isHost, onClose }: { room: SavedRoom; isHost: boolean; onClose: () => void }) {
  const [copy, setCopy] = useState<Copy>('idle')
  const field = useRef<HTMLInputElement>(null)

  if (!room.invite) {
    return (
      <div className="panel" role="region" aria-label="Пригласить">
        <p>
          {isHost
            ? 'Ссылки-приглашения на этом устройстве нет: комнату создали на другом. Ссылку можно сменить — старая перестанет работать; экран смены — в следующем обновлении.'
            : 'Позвать друга может ведущий — попросите у него ссылку.'}
        </p>
        <button className="button secondary" type="button" onClick={onClose}>
          Закрыть
        </button>
      </div>
    )
  }

  const site = new URL(import.meta.env.BASE_URL, location.href).href
  const link = inviteLink(site, { roomId: room.id, invite: room.invite, server: room.server })
  const canShare = typeof navigator.share === 'function'

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setCopy('copied')
    } catch {
      // Буфер обмена недоступен — выделить ссылку, чтобы скопировать руками
      field.current?.select()
      setCopy('failed')
    }
  }

  async function share() {
    try {
      await navigator.share({ title: room.name, text: `Заходи в комнату «${room.name}» в ТоргСине`, url: link })
    } catch {
      // Отменили или не вышло — ссылка остаётся на экране
    }
  }

  return (
    <div className="panel" role="region" aria-label="Пригласить">
      <p>Отправьте ссылку друзьям. По ней друг попросится в комнату — впускаете вы.</p>
      <input ref={field} className="input link" value={link} readOnly onFocus={(e) => e.target.select()} aria-label="Ссылка-приглашение" />
      <div className="row">
        <button className="button" type="button" onClick={copyLink}>
          Скопировать
        </button>
        {canShare && (
          <button className="button secondary" type="button" onClick={share}>
            Поделиться
          </button>
        )}
        <button className="button secondary" type="button" onClick={onClose}>
          Закрыть
        </button>
      </div>
      {copy === 'copied' && <p className="ok">Ссылка скопирована</p>}
      {copy === 'failed' && <p className="error">Не скопировалось — ссылка выделена, скопируйте её вручную</p>}
    </div>
  )
}
