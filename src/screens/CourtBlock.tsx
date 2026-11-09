// Апелляция и суд в блоке «Исход» события и пари (этап 4, Р-05, Р-24, Р-25). Кто что может — правила
// appeal.ts на часах сервера (checkAppeal, checkJoin, checkCourtVote, checkReplace) по делу суда из
// ответа (courtCaseOf), без своих проверок; места, сроки и решение — courtState и courtVerdict, так что
// срок места и решение идут между опросами. Голоса видны всем сразу (Р-11). Каждое действие — окном
// подтверждения экрана (onAsk: номер запроса по спору, действию и выбору — Р-13). Esc закрывает форму
// причины здесь, не уводя с экрана
import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { fileAppeal, joinAppeal, judgeCourt, replaceJuror, type CourtKind, type Result } from '../api'
import {
  appealReason,
  checkAppeal,
  checkCourtVote,
  checkJoin,
  checkReplace,
  COURT_SIZE,
  courtCandidates,
  courtState,
  courtVerdict,
  NO_JUDGES,
  replaceReason,
  SEAT_TIME,
  type AppealTarget,
  type CourtCase,
} from '../rules/appeal'
import { formatCountdown, formatDateTime } from '../rules/date'
import { MAX_EVENT_TEXT } from '../rules/event'
import type { CourtSeat, CourtVerdict } from '../rules/protocol'
import { formKey } from '../rules/request'
import type { SavedRoom } from '../store/db'
import { courtRoomOf } from './courtParts'
import { nameOf } from './eventParts'

// Окно подтверждения: вопрос, основание строками, кнопка и запрос с номером
export type CourtAsk = {
  question: string
  body: string[]
  button: string
  busyLabel: string
  form: string
  run: (requestId: string) => Promise<Result<{ v: number }>>
}

const HOURS = SEAT_TIME / (60 * 60 * 1000)

type Form = { kind: 'appeal' } | { kind: 'replace'; member: string } | null

export function CourtBlock({
  room,
  kind,
  target,
  dispute,
  c,
  now,
  online,
  changes,
  label,
  onAsk,
}: {
  room: SavedRoom
  kind: CourtKind
  target: string // номер события или пари
  dispute: AppealTarget // спор для правил (eventState / offerState)
  c: CourtCase | null // дело суда из ответа (courtCaseOf)
  now: number
  online: boolean
  changes: CourtVerdict[] // все «изменить на …» спора: исходы события / стороны пари — правила отберут
  label: (v: CourtVerdict) => string // «оставить „Да“», «изменить на „Нет“», «отменить — вернуть ставки»
  onAsk: (ask: CourtAsk) => void
}) {
  const [form, setForm] = useState<Form>(null)
  const me = room.memberId
  const courtRoom = courtRoomOf(room)
  const what = kind === 'event' ? 'событие' : 'пари'
  const who = (id: string) => nameOf(room, id) + (id === me ? ' (вы)' : '')
  const send = { server: room.server, roomId: room.id, key: room.key }

  const appealError = checkAppeal(dispute, c, me, '-', courtRoom, now)
  const mayAppeal = appealError === null
  const mayJoin = checkJoin(dispute, c, me, now) === null
  const state = c ? courtState(c, now) : null
  const decision = c ? courtVerdict(c, now) : null
  const all: CourtVerdict[] = [{ verdict: 'keep' }, ...changes, { verdict: 'cancel' }]
  const verdicts = c ? all.filter((v) => checkCourtVote(dispute, c, me, v, now) === null) : []
  const mySeat = state?.seats.find((s) => s.member === me && !s.vote) ?? null
  const mayReplace = (s: CourtSeat) => !!c && s.member !== null && checkReplace(c, me, s.member, '-', now) === null
  const nextReserve = state ? (state.order[state.seats.length + state.seats.filter((s) => s.replaced).length] ?? null) : null

  function close(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !form) return
    e.stopPropagation()
    setForm(null)
  }

  function askAppeal(reason: string) {
    const candidates = courtCandidates(dispute, courtRoom, now, [me])
    const n = Math.min(COURT_SIZE, candidates.length)
    const host = candidates.includes(room.hostId)
    const jurors = (k: number) => `${k} ${k === 1 ? 'присяжный' : 'присяжных'} по жребию`
    const court = host ? (n === 1 ? 'ведущий' : `ведущий и ${jurors(n - 1)}`) : jurors(n)
    onAsk({
      question: 'Подать апелляцию?',
      body: [
        `Апелляция одна на ${what}. Суд: ${court}, ${HOURS} часа, решение окончательное.${n < COURT_SIZE ? ' Больше судить некому.' : ''}`,
        `Причина: ${reason}`,
        'Апелляцию не отозвать. До решения суда исход не окончательный.',
      ],
      button: 'Подать',
      busyLabel: 'Подаю…',
      form: formKey(room.id, target, 'appeal', reason),
      run: (requestId) => fileAppeal(send.server, send.roomId, send.key, kind, target, { reason, requestId }),
    })
  }

  function askJoin() {
    const a = c?.appeal
    if (!a) return
    onAsk({
      question: 'Присоединиться к апелляции?',
      body: [`Апелляцию подал(а) ${nameOf(room, a.by)}: ${a.reason}`, 'Присоединение не отозвать. Суд уже собран — решит он.'],
      button: 'Присоединиться',
      busyLabel: 'Отправляю…',
      form: formKey(room.id, target, 'appeal/join'),
      run: (requestId) => joinAppeal(send.server, send.roomId, send.key, kind, target, { requestId }),
    })
  }

  function askVote(v: CourtVerdict) {
    const effect =
      v.verdict === 'keep'
        ? 'Будет большинство за это — исход остаётся и становится окончательным.'
        : v.verdict === 'change'
          ? 'Будет большинство за это — исход меняется, итог считается по новому.'
          : 'Будет большинство за это — ставки возвращаются, выплат нет.'
    onAsk({
      question: `Ваш голос: ${label(v)}?`,
      body: [effect, 'Суд решает большинством поданных голосов, когда проголосуют все или пройдут сроки мест.', 'Голос не изменить.'],
      button: 'Голосовать',
      busyLabel: 'Голосую…',
      form: formKey(room.id, target, 'judge', v.verdict, 'outcome' in v ? v.outcome : 'winner' in v ? v.winner : ''),
      run: (requestId) => judgeCourt(send.server, send.roomId, send.key, kind, target, { ...v, requestId }),
    })
  }

  function askReplace(member: string, reason: string) {
    onAsk({
      question: `Заменить: ${nameOf(room, member)}?`,
      body: [
        'Место перейдёт следующему по жребию; одна замена на место.',
        nextReserve ? `Следующий по жребию — ${nameOf(room, nextReserve)}, у него свои ${HOURS} часа.` : 'Запасных нет — место останется пустым.',
        `Причина: ${reason}`,
      ],
      button: 'Заменить',
      busyLabel: 'Заменяю…',
      form: formKey(room.id, target, 'replace', member, reason),
      run: (requestId) => replaceJuror(send.server, send.roomId, send.key, kind, target, { member, reason, requestId }),
    })
  }

  const a = c?.appeal ?? null
  const showAppeal = !!a || mayAppeal || appealError === NO_JUDGES
  if (!showAppeal && !c) return null

  return (
    <div className="court" onKeyDown={close}>
      {!online && (mayAppeal || mayJoin || verdicts.length > 0) && <p className="hint">Действовать можно, когда есть связь с сервером.</p>}
      {showAppeal && (
        <section className="court-box" aria-label="Апелляция">
          <h4>Апелляция</h4>
          {a ? (
            <>
              <p>
                Апелляция: {who(a.by)}, {formatDateTime(a.at)}, причина: {a.reason}
              </p>
              {a.joined.length > 0 && (
                <p className="hint">Присоединились: {a.joined.map((j) => `${who(j.by)} (${formatDateTime(j.at)})`).join(', ')}</p>
              )}
              {mayJoin && (
                <div className="row">
                  <button className="button secondary" type="button" onClick={askJoin} disabled={!online}>
                    Присоединиться
                  </button>
                </div>
              )}
            </>
          ) : appealError === NO_JUDGES ? (
            <p className="hint">Апелляции нет: все участники заинтересованы.</p>
          ) : form?.kind === 'appeal' ? (
            <ReasonForm
              label="Причина апелляции"
              hint={`Видно всем. Не длиннее ${MAX_EVENT_TEXT} знаков.`}
              submit="Подать апелляцию"
              cancel="Не подавать"
              check={appealReason}
              disabled={!online}
              onSubmit={askAppeal}
              onClose={() => setForm(null)}
            />
          ) : (
            <div className="row">
              <button className="button secondary" type="button" onClick={() => setForm({ kind: 'appeal' })} disabled={!online}>
                Подать апелляцию
              </button>
            </div>
          )}
        </section>
      )}

      {c && state && (
        <section className="court-box" aria-label="Суд">
          <h4>Суд</h4>
          <p className="hint">
            {c.appeal ? 'По апелляции' : 'Исход ждал суда'}, собран {formatDateTime(c.drawnAt)}. У каждого места — {HOURS} часа; промолчал — место переходит
            следующему по жребию. Решает большинство поданных голосов, решение окончательное.
          </p>
          <ol className="seats" aria-label="Места суда">
            {state.seats.map((s, i) => (
              <li key={i} className={s.vote ? 'voted' : ''}>
                <span className="seat-who">
                  {s.member === null ? 'Место пустое — запасные кончились' : who(s.member)}
                  {s.member !== null && s.member === c.hostId ? ', ведущий' : ''}
                </span>
                {s.member !== null && (
                  <span>
                    {s.vote ? (
                      <>
                        голос: {label(s.vote)}
                        <span className="hint"> · {formatDateTime(s.vote.at)}</span>
                      </>
                    ) : decision || now >= s.until ? (
                      <span className="hint">не голосовал(а)</span>
                    ) : (
                      <>
                        ещё не голосовал(а) <span className="hint">· до {formatDateTime(s.until)}, осталось {formatCountdown(s.until - now)}</span>
                      </>
                    )}
                  </span>
                )}
                {s.replaced && (
                  <span className="hint">
                    вместо {nameOf(room, s.replaced.member)}: {s.replaced.by ? `заменён(а) ведущим — ${s.replaced.reason ?? ''}` : `молчал(а) ${HOURS} ч`},{' '}
                    {formatDateTime(s.replaced.at)}
                  </span>
                )}
                {mayReplace(s) && !(form?.kind === 'replace' && form.member === s.member) && (
                  <div className="row">
                    <button className="button secondary" type="button" onClick={() => s.member && setForm({ kind: 'replace', member: s.member })} disabled={!online}>
                      Заменить
                    </button>
                  </div>
                )}
                {form?.kind === 'replace' && form.member === s.member && mayReplace(s) && (
                  <ReasonForm
                    label="Причина замены"
                    hint="Видно всем. Заменить можно один раз на место."
                    submit="Заменить"
                    cancel="Не заменять"
                    check={replaceReason}
                    disabled={!online}
                    onSubmit={(reason) => askReplace(form.member, reason)}
                    onClose={() => setForm(null)}
                  />
                )}
              </li>
            ))}
          </ol>
          <p className="hint seed">
            Кандидаты по порядку жребия: {state.order.map((m) => nameOf(room, m)).join(', ')} — первые {Math.min(COURT_SIZE, state.order.length)} в суде,
            дальше запасные. Зерно жребия: <span className="seed-value">{c.seed}</span> — проверить может любой.
          </p>

          {decision ? (
            <p className="outcome-head approved">
              Решение суда: {decision.majority ? label(decision) : `большинства нет — ${c.appeal ? 'исход остаётся' : 'отменить — вернуть ставки'}`},{' '}
              {formatDateTime(decision.at)}, голоса: {tally(state.seats, label)}. Решение окончательное.
            </p>
          ) : (
            <p className="hint">Голосов: {state.seats.filter((s) => s.vote).length} из {state.seats.length}.</p>
          )}

          {verdicts.length > 0 && mySeat && (
            <div className="outcome-act" role="group" aria-label="Ваш голос">
              <p className="hint">
                Вы в суде: голос до {formatDateTime(mySeat.until)}, осталось {formatCountdown(mySeat.until - now)}. Голоса видны всем сразу.
              </p>
              <div className="row">
                {verdicts.map((v) => (
                  <button key={label(v)} className={v.verdict === 'cancel' ? 'button secondary' : 'button'} type="button" onClick={() => askVote(v)} disabled={!online}>
                    {cap(label(v))}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function cap(s: string): string {
  return s[0].toUpperCase() + s.slice(1)
}

// Голоса по вариантам: «2 — изменить на „Нет“, 1 — оставить „Да“»; голосов нет — «нет»
function tally(seats: readonly CourtSeat[], label: (v: CourtVerdict) => string): string {
  const count = new Map<string, number>()
  for (const s of seats) if (s.vote) count.set(label(s.vote), (count.get(label(s.vote)) ?? 0) + 1)
  return count.size === 0 ? 'нет' : [...count].map(([l, n]) => `${n} — ${l}`).join(', ')
}

// Причина (апелляции, замены) → проверка правилами → окно подтверждения
function ReasonForm({
  label,
  hint,
  submit,
  cancel,
  check,
  disabled,
  onSubmit,
  onClose,
}: {
  label: string
  hint: string
  submit: string
  cancel: string
  check: (x: unknown) => { ok: true; value: string } | { ok: false; error: string }
  disabled: boolean
  onSubmit: (reason: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  function send(e: FormEvent) {
    e.preventDefault()
    if (disabled) return
    const checked = check(reason)
    if (!checked.ok) return setError(checked.error)
    setError('')
    onSubmit(checked.value)
  }

  return (
    <form className="form outcome-form" onSubmit={send} aria-label={submit}>
      <label className="field">
        <span>{label}</span>
        <textarea className="input textarea" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={MAX_EVENT_TEXT * 2} rows={2} />
        <span className="hint">{hint}</span>
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="button" type="submit" disabled={disabled}>
          {submit}
        </button>
        <button className="button secondary" type="button" onClick={onClose}>
          {cancel}
        </button>
      </div>
    </form>
  )
}
