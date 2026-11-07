// Исход пари на экране пари (Р-05, Р-06, Р-23): отметки сторон, решение гаранта, новый гарант, итог.
// Фаза и сроки — offerOutcome на часах сервера по ходу исхода из ответа (offerState); кто какие кнопки
// видит — правила (sideOf, checkMark, checkDecide, checkDecline, checkNominate), без своих проверок;
// итог сторон — offerNets. Блок — у принятого, когда «исход к» настал или исход уже пошёл. Каждое
// действие — окном подтверждения экрана пари (номер запроса по пари, действию и выбору — Р-13)
import { useState, type FormEvent } from 'react'
import { declineOffer, decideOffer, markOffer, nominateGuarantor } from '../api'
import { formatDateTime } from '../rules/date'
import { checkDecide, checkDecline, checkMark, checkNominate, offerOutcome, sideOf, type OfferOutcome as Outcome, type OfferSide } from '../rules/offer'
import type { OfferView } from '../rules/protocol'
import { formKey } from '../rules/request'
import type { SavedRoom } from '../store/db'
import { nameOf } from './eventParts'
import { netsOf, offerState, roomRolesOf, sideMember, who, winnerLabel, type OfferAsk } from './offerParts'

const SIDES: OfferSide[] = ['author', 'taker']
const ROLE: Record<OfferSide, string> = { author: 'автор', taker: 'соперник' }

export function OfferOutcome({
  room,
  offer,
  now,
  online,
  onAsk,
}: {
  room: SavedRoom
  offer: OfferView
  now: number
  online: boolean
  onAsk: (ask: OfferAsk) => void
}) {
  const state = offerState(offer)
  const out = offerOutcome(state, now)
  if (!out || !offer.accepted) return null
  const started = now >= offer.expectedAt || out.marks.author !== null || out.marks.taker !== null || out.phase !== 'marking'
  if (!started) return null

  const me = room.memberId
  const mySide = sideOf(state, me)
  const mayMark = mySide !== null && checkMark(state, me, 'author') === null
  const mayDecide = checkDecide(state, me, 'author', now) === null
  const mayDecline = checkDecline(state, me, now) === null
  const roles = roomRolesOf(room)
  const candidates = mySide ? room.members.filter((m) => checkNominate(state, me, m.id, roles, now) === null).map((m) => m.id) : []
  const mayNominate = candidates.length > 0
  const guarantor = who(room, out.guarantorId)
  const name = (side: OfferSide) => nameOf(room, sideMember(offer, side))
  const result = (winner: OfferSide) => {
    const n = netsOf(room, offer, winner)
    return n ? `${winnerLabel(winner)} — ${n.winner} получает банк ${n.bank}: ${n.lines.map((l) => `${l.name} ${l.text}`).join(', ')}` : winnerLabel(winner)
  }
  const sentence = (s: string) => s[0].toUpperCase() + s.slice(1) + '.'

  function askMark(winner: OfferSide) {
    if (!mySide) return
    const other: OfferSide = mySide === 'author' ? 'taker' : 'author'
    const theirs = out?.marks[other] ?? null
    const next =
      theirs === winner
        ? `${sentence(ROLE[other])} уже отметил так же — исход станет окончательным сразу и не обжалуется.`
        : theirs === null
          ? `Если ${ROLE[other]} отметит так же, исход окончательный сразу и не обжалуется.`
          : `${sentence(ROLE[other])} отметил иначе — решает гарант ${nameOf(room, offer.guarantorId)}; пока он не решил, отметку можно поменять.`
    onAsk({
      question: `Отметить: ${winnerLabel(winner)}?`,
      body: [`Вы отмечаете: ${result(winner)}.`, next],
      button: 'Отметить',
      busyLabel: 'Отмечаю…',
      form: formKey(room.id, offer.id, 'mark', winner),
      run: (requestId) => markOffer(room.server, room.id, room.key, offer.id, { winner, requestId }),
    })
  }

  function askDecide(winner: OfferSide) {
    onAsk({
      question: `Решение гаранта: ${winnerLabel(winner)}?`,
      body: [`Утвердить: ${result(winner)}.`, 'Решение не изменить; окончательным станет через 7 дней.'],
      button: 'Утвердить',
      busyLabel: 'Утверждаю…',
      form: formKey(room.id, offer.id, 'decide', winner),
      run: (requestId) => decideOffer(room.server, room.id, room.key, offer.id, { winner, requestId }),
    })
  }

  function askDecline() {
    onAsk({
      question: 'Отказаться быть гарантом?',
      body: ['Стороны назовут нового гаранта — участника не из сторон. Отказ не отозвать.'],
      button: 'Отказаться',
      busyLabel: 'Отказываюсь…',
      form: formKey(room.id, offer.id, 'decline'),
      run: (requestId) => declineOffer(room.server, room.id, room.key, offer.id, { requestId }),
    })
  }

  function askNominate(guarantorId: string) {
    if (!mySide) return
    const other: OfferSide = mySide === 'author' ? 'taker' : 'author'
    const theirs = out?.nominations[other]
    onAsk({
      question: `Назвать гарантом: ${nameOf(room, guarantorId)}?`,
      body: [
        theirs === guarantorId
          ? `${name(other)} назвал(а) того же — ${nameOf(room, guarantorId)} сразу станет гарантом, на решение — 3 дня.`
          : `Гарантом станет, когда ${name(other)} назовёт того же.`,
      ],
      button: 'Назвать',
      busyLabel: 'Отправляю…',
      form: formKey(room.id, offer.id, 'nominate', guarantorId),
      run: (requestId) => nominateGuarantor(room.server, room.id, room.key, offer.id, { guarantor: guarantorId, requestId }),
    })
  }

  return (
    <section className="outcome" aria-label="Исход">
      <h3>Исход</h3>
      <Head room={room} out={out} guarantor={guarantor} />
      <ul className="outcome-log" aria-label="Отметки сторон">
        {SIDES.map((side) => {
          const mark = out.marks[side]
          return (
            <li key={side}>
              {who(room, sideMember(offer, side))}, {ROLE[side]}: {mark ? winnerLabel(mark) : <span className="hint">ещё не отметил(а)</span>}
            </li>
          )
        })}
      </ul>
      {out.approved && <Result room={room} offer={offer} winner={out.approved.winner} />}
      {out.phase === 'need-guarantor' && <Nominations room={room} offer={offer} out={out} />}
      {!online && (mayMark || mayDecide || mayDecline || mayNominate) && <p className="hint">Действовать можно, когда есть связь с сервером.</p>}

      {mayMark && mySide && (
        <div className="outcome-act" role="group" aria-label="Ваша отметка">
          <p className="hint">
            {out.marks[mySide] ? `Ваша отметка: ${winnerLabel(out.marks[mySide])}. Поменять можно, пока гарант не решил.` : 'Кто прав? Отметка — с подтверждением.'}
          </p>
          <div className="row">
            {SIDES.map((w) => (
              <button
                key={w}
                className={out.marks[mySide] === w ? 'button secondary' : 'button'}
                type="button"
                onClick={() => askMark(w)}
                disabled={!online || out.marks[mySide] === w}
                aria-pressed={out.marks[mySide] === w}
              >
                {w === 'author' ? 'Прав автор' : 'Прав соперник'}
              </button>
            ))}
          </div>
        </div>
      )}

      {(mayDecide || mayDecline) && (
        <div className="outcome-act" role="group" aria-label="Решение гаранта">
          <p className="hint">
            {mayDecide ? `Вы — гарант: ваше решение до ${out.guarantorUntil === null ? '' : formatDateTime(out.guarantorUntil)}.` : `Вы — гарант: решаете, если стороны разойдутся или одна промолчит до ${formatDateTime(out.turnAt)}.`}
          </p>
          <div className="row">
            {mayDecide &&
              SIDES.map((w) => (
                <button key={w} className="button" type="button" onClick={() => askDecide(w)} disabled={!online}>
                  {w === 'author' ? 'Прав автор' : 'Прав соперник'}
                </button>
              ))}
            {mayDecline && (
              <button className="button secondary" type="button" onClick={askDecline} disabled={!online}>
                Отказаться
              </button>
            )}
          </div>
        </div>
      )}

      {mayNominate && mySide && (
        <NominateForm
          room={room}
          candidates={candidates}
          initial={out.nominations[mySide === 'author' ? 'taker' : 'author'] ?? out.nominations[mySide] ?? null}
          disabled={!online}
          onChoose={askNominate}
        />
      )}
    </section>
  )
}

// Строка фазы сверху: ждём отметок / решает гарант до … / нужен новый гарант / утверждено
function Head({ room, out, guarantor }: { room: SavedRoom; out: Outcome; guarantor: string }) {
  const { marks } = out
  if (out.phase === 'marking') {
    return (
      <>
        <p className="outcome-head">Ждём отметок сторон</p>
        <p className="hint">
          Отметки совпадут — исход окончательный сразу. Разойдутся или одна сторона промолчит до {formatDateTime(out.turnAt)} — решает гарант {guarantor}.
        </p>
      </>
    )
  }
  if (out.phase === 'guarantor') {
    const why = marks.author !== null && marks.taker !== null ? 'Отметки сторон разошлись' : 'Одна сторона не отметила исход за 3 дня'
    return (
      <>
        <p className="outcome-head">
          Решает гарант {guarantor} до {out.guarantorUntil === null ? '' : formatDateTime(out.guarantorUntil)}
        </p>
        <p className="hint">{why}. Пока гарант не решил, стороны могут поменять отметку: совпадут — исход утвердится согласием.</p>
      </>
    )
  }
  if (out.phase === 'need-guarantor') {
    const declined = out.needSince !== null && out.guarantorUntil !== null && out.needSince < out.guarantorUntil
    const since = out.needSince === null ? '' : formatDateTime(out.needSince)
    return (
      <>
        <p className="outcome-head court">Нужен новый гарант</p>
        <p className="hint">
          {declined ? `Гарант ${guarantor} отказался ${since}.` : `Гарант ${guarantor} не решил до ${since}.`} Каждая сторона называет участника не из сторон;
          назовут одного — он гарант, на решение — 3 дня.
        </p>
      </>
    )
  }
  const a = out.approved
  if (!a) return null
  if (a.how === 'agreement') {
    return (
      <>
        <p className="outcome-head approved">Утверждено согласием сторон, окончательно</p>
        <p className="hint">
          {formatDateTime(a.at)}. <strong className="final">Окончательно.</strong>
        </p>
      </>
    )
  }
  const by = who(room, a.by ?? out.guarantorId)
  return (
    <>
      <p className="outcome-head approved">
        Утверждено гарантом {by}, окончательно{out.phase !== 'final' && out.finalAt !== null ? ' ' + formatDateTime(out.finalAt) : ''}
      </p>
      <p className="hint">
        Решение — {formatDateTime(a.at)}.{' '}
        {out.phase === 'final' ? <strong className="final">Окончательно.</strong> : 'Окончательным станет через 7 дней после решения.'}
      </p>
    </>
  )
}

// Итог: кто прав, кто забирает банк, плюс и минус каждой стороны (offerNets) — с основанием
function Result({ room, offer, winner }: { room: SavedRoom; offer: OfferView; winner: OfferSide }) {
  const n = netsOf(room, offer, winner)
  return (
    <section className="payouts-box offer-result" aria-label="Итог пари">
      <h3>Итог</h3>
      {n ? (
        <>
          <p>
            {winnerLabel(winner)[0].toUpperCase() + winnerLabel(winner).slice(1)} — {n.winner} получает банк {n.bank}:
          </p>
          <ul className="outcome-log">
            {n.lines.map((l) => (
              <li key={l.side} className={sideMember(offer, l.side) === room.memberId ? 'mine' : ''}>
                {who(room, sideMember(offer, l.side))} — <span className={l.net > 0 ? 'win' : l.net < 0 ? 'loss' : ''}>{l.text}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>{winnerLabel(winner)}</p>
      )}
    </section>
  )
}

// Кого называют стороны, пока нужен новый гарант
function Nominations({ room, offer, out }: { room: SavedRoom; offer: OfferView; out: Outcome }) {
  return (
    <ul className="outcome-log" aria-label="Новый гарант">
      {SIDES.map((side) => {
        const id = out.nominations[side]
        return (
          <li key={side}>
            {who(room, sideMember(offer, side))} — {id ? `называет: ${nameOf(room, id)}` : <span className="hint">ещё не назвал(а)</span>}
          </li>
        )
      })}
    </ul>
  )
}

// Выбор нового гаранта → окно подтверждения. Сначала выбран тот, кого назвала другая сторона
function NominateForm({
  room,
  candidates,
  initial,
  disabled,
  onChoose,
}: {
  room: SavedRoom
  candidates: string[]
  initial: string | null
  disabled: boolean
  onChoose: (id: string) => void
}) {
  const [chosen, setChosen] = useState<string | null>(initial && candidates.includes(initial) ? initial : null)
  const [error, setError] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (disabled) return
    if (!chosen) return setError('Выберите участника')
    setError('')
    onChoose(chosen)
  }

  return (
    <form className="form outcome-form" onSubmit={submit} aria-label="Назовите нового гаранта">
      <fieldset className="field">
        <legend>Назовите нового гаранта</legend>
        <div className="chips">
          {candidates.map((id) => (
            <label key={id} className="chip">
              <input type="radio" name="offer-nominee" value={id} checked={chosen === id} onChange={() => setChosen(id)} />
              <span>{nameOf(room, id)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="button" type="submit" disabled={disabled}>
          Назвать гарантом
        </button>
      </div>
    </form>
  )
}
