// Открытая комната: название, валюта, участники; у ведущего — «Заявки (N)» (опрос сервера, пока
// комната открыта). «Пригласить» — ссылка из токена, который хранится у комнаты на устройстве:
// сервер не спрашиваем, POST /invite сменил бы ссылку — это отдельная кнопка «Сменить ссылку»
// с подтверждением. «Ссылка для другого устройства» — себе; ведущему — и за другого участника.
// Состояние — с сервера раз в 5 с, пока комната открыта (useRoom); нет связи — последнее известное.
// Под названием — строка темпа (Р-35, PaceBlock); у ведущего — «Изменить темп» с подтверждением.
// Под участниками — «Расчёт» (SettleBlock; на очках — «Таблица очков»), «События» (EventList), под ними —
// «Пари» (OfferList), под ними — «Лоты» (LotList, Р-38), под ними — «Выбор» (ChoiceList, Р-39); прошедшее из
// них — в «Истории», строка «История · N» под «Выбором». На iPhone в браузере —
// заметка про экран «Домой» (HomeScreenNote). Внизу — «Скачать копию комнаты» (BackupBlock), под ней —
// «Выйти из комнаты» (LeaveBlock, Р-40; ведущему — «Чтобы выйти, сначала передайте ведение…» со ссылкой к
// участникам). Жизнь комнаты (Р-40, Р-41, Р-46; memberParts): у участника — «вышел» / «выбыл», ведущему —
// «Пометить „выбыл“» / «Снять „выбыл“»; помеченному вверху — строка «Ведущий пометил вас „выбыл“…», кнопок
// нового в списках нет; заявка-возврат вышедшего — «Похож на вышедшего…», «Вернуть его» / «Отклонить — это
// другой человек». Ведение (Р-42): под ведущим — «заходил …»; ведущему — «Передать ведение» у участника;
// остальным — «Взять ведение» (7 дней не заходил) или «Взять ведение можно с …». Закрыть комнату (Р-43): над
// «Скачать копию» ведущему — «Закрыть комнату» / «Открыть снова» (CloseBlock); в закрытой под названием — «Комната
// закрыта <дата>: только чтение и переводы», кнопок нового, заявок, ссылок, темпа, «Выйти» и кнопок у участников нет
import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { admitRequest, changePace, closeRoom, dropMember, fetchBackup, fetchRequests, issueDeviceLink, leaveRoom, passHost, rejectRequest, renewInvite, takeHost } from '../api'
import { currencyLabel } from '../rules/currency'
import { formatDate, formatDateTime } from '../rules/date'
import { deviceLink, inviteLink } from '../rules/link'
import { checkPaceChange, PACE_LABELS, paceSummary, type RoomPace } from '../rules/pace'
import type { JoinRequestsResponse } from '../rules/protocol'
import { formKey, requestFor, type PendingRequest } from '../rules/request'
import type { LogEntry } from '../rules/room'
import { ulid } from '../rules/ulid'
import { savedChoices, savedEvents, savedLots, savedOffers, savedSettlement, store, type SavedRoom } from '../store/db'
import { BackLink, useEscape } from './BackLink'
import { BACKUP_FAILED, BACKUP_NOTE, backupFileName, backupText, deliveryWay } from './backupParts'
import { ChoiceList } from './ChoiceList'
import { EventList } from './EventList'
import { historyHref, historyItems, historyLine } from './historyParts'
import { HomeScreenNote } from './HomeScreenNote'
import { LinkBox, siteUrl } from './LinkBox'
import { LotList } from './LotList'
import {
  CLOSE_CONFIRM,
  CLOSE_HINT,
  CLOSE_LABEL,
  closedNote,
  REOPEN_CONFIRM,
  REOPEN_LABEL,
  roomClosed,
  DROP_LABEL,
  dropAction,
  dropQuestion,
  DROPPED_NOTE,
  HOST_LEAVE,
  iAmDropped,
  LEAVE_CONFIRM,
  leftAt,
  memberMark,
  PASS_LABEL,
  passAction,
  passQuestion,
  returnLine,
  seenLine,
  TAKE_LABEL,
  takeLine,
  takeQuestion,
  takeRefusal,
  takeState,
  type HostTimes,
} from './memberParts'
import { OfferList } from './OfferList'
import { PacePicker } from './PacePicker'
import { draftTimes, PACE_CHANGE_NOTE, paceDraft, paceInput, paceLine, type PaceDraft } from './paceParts'
import { balanceNote, isPoints, myTotalLine, settleHref } from './settleParts'
import { usePoll } from './usePoll'
import { serverTime, useRoom, useServerNow, type Clock } from './useRoom'

type Panel = 'none' | 'invite' | 'device'

export function RoomView({ room, onUpdate, onLeft }: { room: SavedRoom; onUpdate: (room: SavedRoom) => void; onLeft: (id: string) => void }) {
  const [panel, setPanel] = useState<Panel>('none')
  const { sync, clock, pace, host, refresh, save, latest } = useRoom(room, onUpdate)

  useEscape(
    useCallback(() => setPanel('none'), []),
    panel !== 'none',
  )

  const isHost = room.hostId === room.memberId
  // Закрытая комната (Р-43): только чтение и переводы — заявок, ссылок, темпа, кнопок у участников и
  // «Выйти» нет (сервер откажет «Комната закрыта»)
  const closed = roomClosed(room)
  const toggle = (p: Panel) => setPanel((now) => (now === p ? 'none' : p))

  return (
    <div className="card room">
      <BackLink />
      <h2 className="room-title">{room.name}</h2>
      <p className="hint">
        Валюта: {currencyLabel(room.currency)} · создана {formatDate(room.createdAt)}
      </p>
      {room.closedAt !== undefined && (
        <p className="status closed" role="status">
          {closedNote(room.closedAt)}
        </p>
      )}
      {sync.state === 'busy' && <p className="hint">Обновляю с сервера…</p>}
      {sync.state === 'fail' && <p className="error">{sync.text}</p>}
      {iAmDropped(room) && !closed && (
        <p className="error" role="status">
          {DROPPED_NOTE}
        </p>
      )}
      <PaceBlock room={room} pace={pace} isHost={isHost && !closed} onChanged={refresh} />
      <HomeScreenNote room={room} />

      {isHost && !closed && <Requests room={room} onAdmitted={refresh} />}

      {!closed && (
        <div className="row">
          <button className="button" type="button" onClick={() => toggle('invite')} aria-expanded={panel === 'invite'}>
            Пригласить
          </button>
          <button className="button secondary" type="button" onClick={() => toggle('device')} aria-expanded={panel === 'device'}>
            Ссылка для другого устройства
          </button>
        </div>
      )}
      {panel === 'invite' && !closed && (
        <Invite room={room} isHost={isHost} onRenewed={(invite) => save({ ...latest.current, invite })} onClose={() => setPanel('none')} />
      )}
      {panel === 'device' && !closed && <DevicePanel room={room} isHost={isHost} onClose={() => setPanel('none')} />}

      <h3 id="members">Участники</h3>
      <ul className="members">
        {room.members.map((m) => (
          <Member key={m.id} room={room} member={m} host={host} now={serverTime(clock)} onChanged={refresh} />
        ))}
      </ul>
      <SettleBlock room={room} />
      <EventList room={room} clock={clock} />
      <OfferList room={room} clock={clock} />
      <LotList room={room} clock={clock} />
      <ChoiceList room={room} clock={clock} />
      <HistoryLink room={room} clock={clock} />
      {isHost && <CloseBlock room={room} closed={closed} onChanged={refresh} />}
      <BackupBlock room={room} />
      {!closed && <LeaveBlock room={room} isHost={isHost} onLeft={onLeft} />}
    </div>
  )
}

const closePending = new Map<string, PendingRequest>() // по комнате и действию: повтор — тот же номер (Р-13)

// Ведущему (Р-43): «Закрыть комнату» с подтверждением — отказ сервера (что ещё открыто) его текстом;
// в закрытой — «Открыть снова» с подтверждением. Ответ — свежее состояние комнаты с сервера
function CloseBlock({ room, closed, onChanged }: { room: SavedRoom; closed: boolean; onChanged: () => Promise<void> }) {
  const [asking, setAsking] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  const act = closed ? 'reopen' : 'close'

  async function send() {
    if (busy.current) return
    const slot = room.id + '/' + act
    const request = requestFor(closePending.get(slot) ?? null, formKey(room.id, act), ulid)
    closePending.set(slot, request)
    busy.current = true
    setSending(true)
    setError('')
    try {
      const res = await closeRoom(room.server, room.id, room.key, !closed, { requestId: request.requestId })
      if (!res.ok) return setError(res.error)
      closePending.delete(slot)
      setAsking(false)
      await onChanged()
    } finally {
      busy.current = false
      setSending(false)
    }
  }

  const label = closed ? REOPEN_LABEL : CLOSE_LABEL
  return (
    <section className="leave" aria-label={label}>
      {asking ? (
        <div className="confirm" role="group" aria-label={label + '?'}>
          <p>{closed ? REOPEN_CONFIRM : CLOSE_CONFIRM}</p>
          <div className="row">
            <button className="button" type="button" onClick={send} disabled={sending}>
              {sending ? 'Минутку…' : closed ? 'Да, открыть' : 'Да, закрыть'}
            </button>
            <button className="button secondary" type="button" onClick={() => setAsking(false)} disabled={sending}>
              Не надо
            </button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              setError('')
              setAsking(true)
            }}
          >
            {label}
          </button>
        </div>
      )}
      {!closed && !asking && <p className="hint">{CLOSE_HINT}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

// по комнате, участнику и действию: повтор — тот же номер (Р-13)
const memberPending = new Map<string, PendingRequest>()

type MemberAct = 'drop' | 'restore' | 'pass' | 'take'

const CONFIRM_LABEL: Record<MemberAct, string> = { drop: 'Да, пометить', restore: 'Да, снять', pass: 'Да, передать', take: 'Да, взять' }

// Участник в списке: имя, «ведущий», «вы», «вышел» / «выбыл»; под ведущим — «заходил <когда>» (Р-42). Ведущему —
// «Пометить „выбыл“» / «Снять „выбыл“» (dropAction) и «Передать ведение» (passAction); остальным в строке
// ведущего — «Взять ведение» (7 дней не заходил) или подпись «Взять ведение можно с …» (больше суток; takeState).
// Всё — с подтверждением; отказ сервера — его текстом под строкой (на «Взять ведение» — с датой «можно с»)
function Member({
  room,
  member,
  host,
  now,
  onChanged,
}: {
  room: SavedRoom
  member: SavedRoom['members'][number]
  host: HostTimes | null
  now: number
  onChanged: () => Promise<void>
}) {
  const [asking, setAsking] = useState<MemberAct | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<{ text: string; late: boolean } | null>(null)
  const busy = useRef(false)
  // В закрытой комнате (Р-43) кнопок у участников нет
  const closed = roomClosed(room)
  const drop = closed ? null : dropAction(room, member)
  const pass = closed ? null : passAction(room, member)
  const isHostRow = member.id === room.hostId
  const take = isHostRow && !closed ? takeState(room, host, now) : null
  const mark = memberMark(member)

  async function send(act: MemberAct) {
    if (busy.current) return
    const slot = room.id + '/' + member.id + '/' + act
    const request = requestFor(memberPending.get(slot) ?? null, formKey(room.id, member.id, act), ulid)
    memberPending.set(slot, request)
    busy.current = true
    setSending(true)
    setError(null)
    try {
      const opts = { requestId: request.requestId }
      const res =
        act === 'pass'
          ? await passHost(room.server, room.id, room.key, member.id, opts)
          : act === 'take'
            ? await takeHost(room.server, room.id, room.key, opts)
            : await dropMember(room.server, room.id, room.key, member.id, act === 'drop', opts)
      if (!res.ok) {
        // 409 на «Взять ведение» — срок по времени сервера: свежие времена ведущего и к тексту — дата «можно с»
        const late = act === 'take' && 'status' in res && res.status === 409
        setError({ text: res.error, late })
        if (late) await onChanged()
        return
      }
      memberPending.delete(slot)
      setAsking(null)
      await onChanged()
    } finally {
      busy.current = false
      setSending(false)
    }
  }

  const question =
    asking === 'pass'
      ? passQuestion(member.name)
      : asking === 'take'
        ? takeQuestion(member.name, host?.seenAt ?? now)
        : asking
          ? dropQuestion(asking, member.name)
          : ''
  const label = asking === 'pass' ? PASS_LABEL : asking === 'take' ? TAKE_LABEL : asking ? DROP_LABEL[asking] : ''

  return (
    <li className="member">
      <span>{member.name}</span>
      {isHostRow && <span className="badge">ведущий</span>}
      {member.id === room.memberId && <span className="badge muted">вы</span>}
      {mark && <span className="badge muted">{mark}</span>}
      {!asking && (drop || pass || take?.kind === 'take') && (
        <span className="member-action member-actions">
          {drop && (
            <button className="button secondary" type="button" onClick={() => setAsking(drop)}>
              {DROP_LABEL[drop]}
            </button>
          )}
          {pass && (
            <button className="button secondary" type="button" onClick={() => setAsking('pass')}>
              {PASS_LABEL}
            </button>
          )}
          {take?.kind === 'take' && (
            <button className="button" type="button" onClick={() => setAsking('take')}>
              {TAKE_LABEL}
            </button>
          )}
        </span>
      )}
      {isHostRow && host && <span className="hint member-confirm">{seenLine(host.seenAt)}</span>}
      {isHostRow && take?.kind === 'wait' && <span className="hint member-confirm">{takeLine(take.from)}</span>}
      {asking && (
        <div className="confirm member-confirm" role="group" aria-label={label + '?'}>
          <p>{question}</p>
          <div className="row">
            <button className="button" type="button" onClick={() => send(asking)} disabled={sending}>
              {sending ? 'Минутку…' : CONFIRM_LABEL[asking]}
            </button>
            <button className="button secondary" type="button" onClick={() => setAsking(null)} disabled={sending}>
              Не надо
            </button>
          </div>
        </div>
      )}
      {error && <p className="error member-confirm">{error.late ? takeRefusal(error.text, host, now) : error.text}</p>}
    </li>
  )
}

const leavePending = new Map<string, PendingRequest>() // по комнате: повтор «Выйти» — тот же номер (Р-13)

// Внизу комнаты — «Выйти из комнаты» (Р-40) с подтверждением; отказ сервера (что мешает) — его текстом.
// Вышел — комната уходит с устройства и из «Моих комнат» (onLeft). Ведущему кнопки нет — подпись
function LeaveBlock({ room, isHost, onLeft }: { room: SavedRoom; isHost: boolean; onLeft: (id: string) => void }) {
  const [asking, setAsking] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)

  async function leave() {
    if (busy.current) return
    const request = requestFor(leavePending.get(room.id) ?? null, formKey(room.id, 'leave'), ulid)
    leavePending.set(room.id, request)
    busy.current = true
    setSending(true)
    setError('')
    try {
      const res = await leaveRoom(room.server, room.id, room.key, { requestId: request.requestId })
      if (!res.ok) return setError(res.error)
      leavePending.delete(room.id)
      await store()
        .removeRoom(room.id)
        .catch(() => undefined)
      onLeft(room.id)
      location.hash = '#/'
    } finally {
      busy.current = false
      setSending(false)
    }
  }

  // Ведущему — ссылка к списку участников, где «Передать ведение» (Р-42): адрес — та же комната, экран
  // прокручивается к «Участникам»
  if (isHost) {
    const toMembers = (e: MouseEvent) => {
      e.preventDefault()
      document.getElementById('members')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    return (
      <section className="leave" aria-label="Выйти из комнаты">
        <p className="hint">
          {HOST_LEAVE.before}
          <a href={'#/room/' + room.id} onClick={toMembers}>
            {HOST_LEAVE.link}
          </a>
          {HOST_LEAVE.after}
        </p>
      </section>
    )
  }
  return (
    <section className="leave" aria-label="Выйти из комнаты">
      {asking ? (
        <div className="confirm" role="group" aria-label="Выйти из комнаты?">
          <p>{LEAVE_CONFIRM}</p>
          <div className="row">
            <button className="button" type="button" onClick={leave} disabled={sending}>
              {sending ? 'Выхожу…' : 'Да, выйти'}
            </button>
            <button className="button secondary" type="button" onClick={() => setAsking(false)} disabled={sending}>
              Остаться
            </button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button className="button secondary" type="button" onClick={() => setAsking(true)}>
            Выйти из комнаты
          </button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

const pacePending = new Map<string, PendingRequest>() // по комнате: окно закрыли и открыли — тот же номер

// Темп комнаты (Р-35): строка всем; ведущему — «Изменить темп»: окно с тем же выбором, что на создании,
// и подтверждением. Сервер без темпа (или ответа ещё не было) — блока нет
function PaceBlock({ room, pace, isHost, onChanged }: { room: SavedRoom; pace: RoomPace | null; isHost: boolean; onChanged: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  if (!pace) return null
  return (
    <section className="pace-line" aria-label="Темп комнаты">
      <p className="hint">{paceLine(pace)}</p>
      {isHost && (
        <button className="button secondary" type="button" onClick={() => setOpen(true)}>
          Изменить темп
        </button>
      )}
      {open && <PaceWindow room={room} current={pace} onClose={() => setOpen(false)} onDone={onChanged} />}
    </section>
  )
}

// Окно смены темпа — форма: Enter отправляет, Esc закрывает. Тот же темп — отказ правил (checkPaceChange)
// до запроса; повтор того же выбора — тот же номер запроса (Р-13); отказ сервера — его текстом в окне
function PaceWindow({ room, current, onClose, onDone }: { room: SavedRoom; current: RoomPace; onClose: () => void; onDone: () => Promise<void> }) {
  const [draft, setDraft] = useState<PaceDraft>(() => paceDraft(current))
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const busy = useRef(false)
  useEscape(
    useCallback(() => {
      if (!busy.current) onClose()
    }, [onClose]),
  )

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy.current) return // синхронный замок: второе нажатие раньше перерисовки
    const input = paceInput(draft)
    const refused = checkPaceChange(current, room, room.memberId, input)
    if (refused) return setError(refused)
    const request = requestFor(pacePending.get(room.id) ?? null, formKey(room.id, 'pace', JSON.stringify(input)), ulid)
    pacePending.set(room.id, request)
    busy.current = true
    setSending(true)
    setError('')
    try {
      const res = await changePace(room.server, room.id, room.key, { ...input, requestId: request.requestId })
      if (!res.ok) return setError(res.error)
      pacePending.delete(room.id)
      busy.current = false
      await onDone()
      onClose()
    } finally {
      busy.current = false
      setSending(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !busy.current && onClose()}>
      <form className="modal form pace-modal" role="dialog" aria-modal="true" aria-label="Изменить темп" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <p className="modal-question">Изменить темп комнаты?</p>
        <PacePicker value={draft} onChange={setDraft} current={current.pace} autoFocus />
        <p>
          Новый темп: {PACE_LABELS[draft.pace]} — {paceSummary(draftTimes(draft))}.
        </p>
        <p className="hint">{PACE_CHANGE_NOTE}</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button className="button" type="submit" disabled={sending}>
            {sending ? 'Меняю…' : 'Сменить темп'}
          </button>
          <button className="button secondary" type="button" onClick={onClose} disabled={sending}>
            Отмена
          </button>
        </div>
      </form>
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

// Под «Выбором» — «История · 12»: сколько прошедшего ушло из списков (всё, без пропусков); ноль — строки нет
function HistoryLink({ room, clock }: { room: SavedRoom; clock: Clock | null }) {
  const events = savedEvents(room)
  const offers = savedOffers(room)
  const lots = savedLots(room)
  const choices = savedChoices(room)
  const now = useServerNow(clock, events.length + offers.length + lots.length + choices.length > 0)
  const line = historyLine(historyItems(room, events, offers, now, lots, choices).length)
  if (!line) return null
  return (
    <a className="event-item history-link" href={historyHref(room.id)}>
      <span className="event-name">{line}</span>
      <span className="hint">Прошедшие события, пари, лоты и выборы, итоги участников →</span>
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

  // Возврат вышедшего (Р-46): когда он вышел — по журналу комнаты (копия участника), один раз на возврат;
  // журнал не пришёл — строка без даты
  const [log, setLog] = useState<{ for: string; log: LogEntry[] } | null>(null)
  const returning = requests.filter((r) => typeof r.member === 'string').map((r) => r.member).join(',')
  useEffect(() => {
    if (!returning || log?.for === returning) return
    let live = true
    void fetchBackup(server, id, key).then((res) => {
      if (live) setLog({ for: returning, log: res.ok ? res.value.log : [] })
    })
    return () => {
      live = false
    }
  }, [returning, log, server, id, key])

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
        {requests.map((r) => {
          // Сервер узнал вышедшего (Р-46): «Вернуть его» — то же «Впустить» (возврат делает сервер),
          // «Отклонить — это другой человек» — то же «Отклонить»; простого «Впустить» нет
          const back = typeof r.member === 'string' ? r.member : null
          const backName = back === null ? '' : (room.members.find((m) => m.id === back)?.name ?? r.name)
          return (
            <li key={r.id} className="request">
              <div className="request-who">
                <span className="request-name">{r.name}</span>
                {back !== null && <span className="error">{returnLine(backName, log ? leftAt(log.log, back) : null)}</span>}
                <span className="hint">просится с {formatDateTime(r.at)}</span>
              </div>
              <div className="row">
                <button className="button" type="button" disabled={busy !== null} onClick={() => decide(r, true)}>
                  {busy === r.id ? 'Минутку…' : back !== null ? 'Вернуть его' : 'Впустить'}
                </button>
                <button className="button secondary" type="button" disabled={busy !== null} onClick={() => decide(r, false)}>
                  {back !== null ? 'Отклонить — это другой человек' : 'Отклонить'}
                </button>
              </div>
            </li>
          )
        })}
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
