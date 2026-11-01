// Открытая комната: название, валюта, участники; у ведущего — «Заявки (N)» (опрос сервера, пока
// комната открыта). «Пригласить» — ссылка из токена, который хранится у комнаты на устройстве:
// сервер не спрашиваем, POST /invite сменил бы ссылку — это отдельная кнопка «Сменить ссылку»
// с подтверждением. «Ссылка для другого устройства» — себе; ведущему — и за другого участника.
// Состояние — с сервера раз в 5 с, пока комната открыта (useRoom); нет связи — последнее известное.
// Под участниками — «События» (EventList)
import { useCallback, useState } from 'react'
import { admitRequest, fetchRequests, issueDeviceLink, rejectRequest, renewInvite } from '../api'
import { currencyLabel } from '../rules/currency'
import { formatDate, formatDateTime } from '../rules/date'
import { deviceLink, inviteLink } from '../rules/link'
import type { JoinRequestsResponse } from '../rules/protocol'
import type { SavedRoom } from '../store/db'
import { BackLink, useEscape } from './BackLink'
import { EventList } from './EventList'
import { LinkBox, siteUrl } from './LinkBox'
import { usePoll } from './usePoll'
import { useRoom } from './useRoom'

type Panel = 'none' | 'invite' | 'device'

export function RoomView({ room, onUpdate }: { room: SavedRoom; onUpdate: (room: SavedRoom) => void }) {
  const [panel, setPanel] = useState<Panel>('none')
  const { sync, clock, refresh, save, latest } = useRoom(room, onUpdate)

  useEscape(
    useCallback(() => setPanel('none'), []),
    panel !== 'none',
  )

  const isHost = room.hostId === room.memberId
  const toggle = (p: Panel) => setPanel((now) => (now === p ? 'none' : p))

  return (
    <div className="card room">
      <BackLink />
      <h2 className="room-title">{room.name}</h2>
      <p className="hint">
        Валюта: {currencyLabel(room.currency)} · создана {formatDate(room.createdAt)}
      </p>
      {sync.state === 'busy' && <p className="hint">Обновляю с сервера…</p>}
      {sync.state === 'fail' && <p className="error">{sync.text}</p>}

      {isHost && <Requests room={room} onAdmitted={refresh} />}

      <div className="row">
        <button className="button" type="button" onClick={() => toggle('invite')} aria-expanded={panel === 'invite'}>
          Пригласить
        </button>
        <button className="button secondary" type="button" onClick={() => toggle('device')} aria-expanded={panel === 'device'}>
          Ссылка для другого устройства
        </button>
      </div>
      {panel === 'invite' && (
        <Invite room={room} isHost={isHost} onRenewed={(invite) => save({ ...latest.current, invite })} onClose={() => setPanel('none')} />
      )}
      {panel === 'device' && <DevicePanel room={room} isHost={isHost} onClose={() => setPanel('none')} />}

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
      <EventList room={room} clock={clock} />
    </div>
  )
}

type JoinRequest = JoinRequestsResponse['requests'][number]

// Заявки по ссылке — ведущему: опрос, пока комната открыта; нет заявок — блока нет
function Requests({ room, onAdmitted }: { room: SavedRoom; onAdmitted: () => Promise<void> }) {
  const [requests, setRequests] = useState<JoinRequest[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const { server, id, key } = room

  const tick = useCallback(async () => {
    const res = await fetchRequests(server, id, key)
    if (res.ok) setRequests(res.value.requests)
  }, [server, id, key])
  usePoll(tick)

  async function decide(request: JoinRequest, admit: boolean) {
    setBusy(request.id)
    setError('')
    const res = admit ? await admitRequest(server, id, key, request.id) : await rejectRequest(server, id, key, request.id)
    setBusy(null)
    if (!res.ok) return setError(res.error)
    setRequests((prev) => prev.filter((r) => r.id !== request.id))
    if (admit) await onAdmitted()
  }

  if (requests.length === 0) return error ? <p className="error">{error}</p> : null
  return (
    <section className="requests" aria-label="Заявки">
      <h3>Заявки ({requests.length})</h3>
      <ul className="request-list">
        {requests.map((r) => (
          <li key={r.id} className="request">
            <div className="request-who">
              <span className="request-name">{r.name}</span>
              <span className="hint">просится с {formatDateTime(r.at)}</span>
            </div>
            <div className="row">
              <button className="button" type="button" disabled={busy !== null} onClick={() => decide(r, true)}>
                {busy === r.id ? 'Минутку…' : 'Впустить'}
              </button>
              <button className="button secondary" type="button" disabled={busy !== null} onClick={() => decide(r, false)}>
                Отклонить
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
    </section>
  )
}

function Invite({
  room,
  isHost,
  onRenewed,
  onClose,
}: {
  room: SavedRoom
  isHost: boolean
  onRenewed: (invite: string) => void
  onClose: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [renewed, setRenewed] = useState(false)
  const [error, setError] = useState('')

  async function renew() {
    setBusy(true)
    setError('')
    const res = await renewInvite(room.server, room.id, room.key)
    setBusy(false)
    if (!res.ok) return setError(res.error)
    setConfirming(false)
    setRenewed(true)
    onRenewed(res.value.invite)
  }

  const link = room.invite ? inviteLink(siteUrl(), { roomId: room.id, invite: room.invite, server: room.server }) : null

  return (
    <div className="panel" role="region" aria-label="Пригласить">
      {link ? (
        <>
          <p>Отправьте ссылку друзьям. По ней друг попросится в комнату — впускаете вы.</p>
          <LinkBox link={link} label="Ссылка-приглашение" title={room.name} text={`Заходи в комнату «${room.name}» в ТоргСине`} />
        </>
      ) : (
        <p>
          {isHost
            ? 'Ссылки-приглашения на этом устройстве нет: комнату создали на другом. Смените ссылку — появится новая, старая перестанет работать.'
            : 'Позвать друга может ведущий — попросите у него ссылку.'}
        </p>
      )}
      {renewed && <p className="ok">Ссылка новая — старая больше не работает</p>}
      {isHost &&
        (confirming ? (
          <div className="confirm" role="group" aria-label="Сменить ссылку?">
            <p>
              Сменить ссылку? Старая перестанет работать: кто её получил, не сможет попроситься. Впущенные и уже поданные заявки не
              пострадают.
            </p>
            <div className="row">
              <button className="button" type="button" onClick={renew} disabled={busy}>
                {busy ? 'Меняю…' : 'Да, сменить'}
              </button>
              <button className="button secondary" type="button" onClick={() => setConfirming(false)} disabled={busy}>
                Не менять
              </button>
            </div>
          </div>
        ) : (
          <div className="row">
            <button className="button secondary" type="button" onClick={() => setConfirming(true)}>
              Сменить ссылку
            </button>
          </div>
        ))}
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="button secondary" type="button" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  )
}

type Issued = { link: string; name: string; expiresAt: number }

// Ссылка для другого устройства: себе — любой участник; ведущий — и за другого, тогда можно
// отвязать его старый телефон (флажок — только ведущему за другого)
function DevicePanel({ room, isHost, onClose }: { room: SavedRoom; isHost: boolean; onClose: () => void }) {
  const [member, setMember] = useState(room.memberId)
  const [unlink, setUnlink] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [issued, setIssued] = useState<Issued | null>(null)
  const forOther = member !== room.memberId
  const name = room.members.find((m) => m.id === member)?.name ?? ''

  function choose(id: string) {
    setMember(id)
    setUnlink(false)
    setIssued(null)
  }

  async function issue() {
    setBusy(true)
    setError('')
    const res = await issueDeviceLink(room.server, room.id, room.key, forOther ? { member, unlink } : {})
    setBusy(false)
    if (!res.ok) return setError(res.error)
    const link = deviceLink(siteUrl(), { roomId: room.id, token: res.value.token, server: room.server })
    setIssued({ link, name, expiresAt: res.value.expiresAt })
  }

  return (
    <div className="panel" role="region" aria-label="Ссылка для другого устройства">
      <p>
        {forOther
          ? `По ссылке ${name} откроет комнату на новом устройстве тем же участником.`
          : 'Откройте ссылку на другом устройстве — там будет эта же комната, и вы в ней — тем же участником.'}{' '}
        Ссылка сработает один раз, в течение суток.
      </p>
      {isHost && room.members.length > 1 && (
        <fieldset className="field">
          <legend>Для кого</legend>
          <div className="chips">
            {room.members.map((m) => (
              <label key={m.id} className="chip">
                <input type="radio" name="device-member" value={m.id} checked={member === m.id} onChange={() => choose(m.id)} />
                <span>{m.id === room.memberId ? `${m.name} (вы)` : m.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {isHost && forOther && (
        <label className="check">
          <input
            type="checkbox"
            checked={unlink}
            onChange={(e) => {
              setUnlink(e.target.checked)
              setIssued(null)
            }}
          />
          <span>
            Отвязать старый телефон
            <span className="hint"> — когда {name} откроет ссылку, прежний телефон перестанет открывать комнату (если потерян)</span>
          </span>
        </label>
      )}
      {issued ? (
        <>
          <p className="ok">
            Ссылка {forOther ? `для участника «${issued.name}»` : 'для вашего устройства'} — сработает один раз, до{' '}
            {formatDateTime(issued.expiresAt)}
          </p>
          <LinkBox link={issued.link} label="Ссылка для другого устройства" title={room.name} text={`Комната «${room.name}» в ТоргСине`} />
        </>
      ) : (
        <div className="row">
          <button className="button" type="button" onClick={issue} disabled={busy}>
            {busy ? 'Получаю…' : 'Получить ссылку'}
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="button secondary" type="button" onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  )
}
