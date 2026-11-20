// Открытая комната: название, валюта, участники; у ведущего — «Заявки (N)» (опрос сервера, пока
// комната открыта). «Пригласить» — ссылка из токена, который хранится у комнаты на устройстве:
// сервер не спрашиваем, POST /invite сменил бы ссылку — это отдельная кнопка «Сменить ссылку»
// с подтверждением. «Ссылка для другого устройства» — себе; ведущему — и за другого участника.
// Состояние — с сервера раз в 5 с, пока комната открыта (useRoom); нет связи — последнее известное.
// Под участниками — «Расчёт» (SettleBlock; на очках — «Таблица очков»), «События» (EventList), под ними —
// «Пари» (OfferList); прошедшее из них — в «Истории», строка «История · N» под «Пари». На iPhone в браузере —
// заметка про экран «Домой» (HomeScreenNote). В самом низу — «Скачать копию комнаты» (BackupBlock)
import { useCallback, useState } from 'react'
import { admitRequest, fetchBackup, fetchRequests, issueDeviceLink, rejectRequest, renewInvite } from '../api'
import { currencyLabel } from '../rules/currency'
import { formatDate, formatDateTime } from '../rules/date'
import { deviceLink, inviteLink } from '../rules/link'
import type { JoinRequestsResponse } from '../rules/protocol'
import { savedEvents, savedOffers, savedSettlement, type SavedRoom } from '../store/db'
import { BackLink, useEscape } from './BackLink'
import { BACKUP_FAILED, BACKUP_NOTE, backupFileName, backupText, deliveryWay } from './backupParts'
import { EventList } from './EventList'
import { historyHref, historyItems, historyLine } from './historyParts'
import { HomeScreenNote } from './HomeScreenNote'
import { LinkBox, siteUrl } from './LinkBox'
import { OfferList } from './OfferList'
import { balanceNote, isPoints, myTotalLine, settleHref } from './settleParts'
import { usePoll } from './usePoll'
import { useRoom, useServerNow, type Clock } from './useRoom'

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
      <HomeScreenNote room={room} />

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
      <SettleBlock room={room} />
      <EventList room={room} clock={clock} />
      <OfferList room={room} clock={clock} />
      <HistoryLink room={room} clock={clock} />
      <BackupBlock room={room} />
    </div>
  )
}

// Внизу комнаты — «Скачать копию комнаты» (этап 6, #100): копия участника с сервера файлом. Сервер не
// ответил или старый, без адреса копии, — строка отказа; остальная комната работает как была
function BackupBlock({ room }: { room: SavedRoom }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: true; file: string } | { ok: false } | null>(null)

  async function download() {
    setBusy(true)
    setResult(null)
    const res = await fetchBackup(room.server, room.id, room.key)
    if (!res.ok) {
      setBusy(false)
      return setResult({ ok: false })
    }
    const file = new File([backupText(res.value)], backupFileName(room.name, res.value.exportedAt), { type: 'application/json' })
    const given = await giveFile(file)
    setBusy(false)
    if (given) setResult({ ok: true, file: file.name })
  }

  return (
    <section className="backup" aria-label="Копия комнаты">
      <div className="row">
        <button className="button secondary" type="button" onClick={download} disabled={busy}>
          {busy ? 'Готовлю копию…' : 'Скачать копию комнаты'}
        </button>
      </div>
      <p className="hint">{BACKUP_NOTE}</p>
      {result?.ok === true && <p className="ok">Копия готова: «{result.file}»</p>}
      {result?.ok === false && <p className="error">{BACKUP_FAILED}</p>}
    </section>
  )
}

// Отдать файл: на iPhone — окно «Поделиться» («Сохранить в Файлы»); не вышло (не умеет, срок нажатия
// истёк, пока ждали сервер) — загрузкой, как на Android и компьютере. Отменили «Поделиться» — false
async function giveFile(file: File): Promise<boolean> {
  const canShareFiles = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })
  if (deliveryWay(navigator.userAgent, navigator.maxTouchPoints ?? 0, canShareFiles) === 'share') {
    try {
      await navigator.share({ files: [file], title: file.name })
      return true
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return false
    }
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000) // Safari читает ссылку не сразу
  return true
}

// Под «Пари» — «История · 12»: сколько прошедшего ушло из списков (всё, без пропусков); ноль — строки нет
function HistoryLink({ room, clock }: { room: SavedRoom; clock: Clock | null }) {
  const events = savedEvents(room)
  const offers = savedOffers(room)
  const now = useServerNow(clock, events.length + offers.length > 0)
  const line = historyLine(historyItems(room, events, offers, now).length)
  if (!line) return null
  return (
    <a className="event-item history-link" href={historyHref(room.id)}>
      <span className="event-name">{line}</span>
      <span className="hint">Прошедшие события и пари, итоги участников →</span>
    </a>
  )
}

// «Расчёт» (в комнате на очки — «Таблица очков») со своей строкой; нажатие — экран расчёта. Сервер без
// свода (до этапа 5) — блока нет
function SettleBlock({ room }: { room: SavedRoom }) {
  const settlement = savedSettlement(room)
  if (!settlement) return null
  const title = isPoints(room.currency) ? 'Таблица очков' : 'Расчёт'
  const note = balanceNote(settlement, room.memberId, room.currency)
  return (
    <section className="settle-block" aria-label={title}>
      <h3>{title}</h3>
      <a className="event-item" href={settleHref(room.id)}>
        <span className="event-name">{myTotalLine(settlement, room.memberId, room.currency)}</span>
        {note && <span className={note.startsWith('вы должны') ? 'loss' : 'win'}>{note[0].toUpperCase() + note.slice(1)}</span>}
        <span className="hint">{isPoints(room.currency) ? 'Открыть таблицу →' : 'Кто кому, переводы, все участники →'}</span>
      </a>
    </section>
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
