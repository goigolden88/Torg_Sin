// Исход пари на экране пари (Р-05, Р-06, Р-23): отметки сторон, решение гаранта, новый гарант, итог.
// Фаза и сроки — offerOutcome на часах сервера по ходу исхода из ответа (offerState); кто какие кнопки
// видит — правила (sideOf, checkMark, checkDecide, checkDecline, checkNominate), без своих проверок;
// итог сторон — offerNets. Блок — у принятого, когда «исход к» настал или исход уже пошёл; до «исход
// к» сторонам — «Исход уже известен?»: отметить можно в любой миг после принятия (Р-27). Каждое
// действие — окном подтверждения экрана пари (номер запроса по пари, действию и выбору — Р-13). Сроки в
// текстах — пари (times, Р-35), не постоянные. Пари без гаранта (Р-36): блока гаранта нет; в
// текстах вместо гаранта — суд (разошлись — сразу, вторая сторона молчит — с turnAt) и почему
import { useState, type FormEvent } from 'react'
import { declineOffer, decideOffer, markOffer, nominateGuarantor } from '../api'
import { formatDateTime } from '../rules/date'
import { courtCandidates } from '../rules/appeal'
import {
  checkDecide,
  checkDecline,
  checkMark,
  checkNominate,
  courtFrom,
  offerOutcome,
  sideOf,
  type OfferOutcome as Outcome,
  type OfferSide,
  type OfferState,
} from '../rules/offer'
import type { CourtVerdict, OfferView } from '../rules/protocol'
import { formKey } from '../rules/request'
import type { SavedRoom } from '../store/db'
import { CourtBlock } from './CourtBlock'
import { courtRoomOf } from './courtParts'
import { nameOf } from './eventParts'
import { courtWhy, netsOf, offerCourt, offerState, roomRolesOf, sideMember, who, winnerLabel, type OfferAsk } from './offerParts'
import { capital, spanText, viewTimes } from './paceParts'

const SIDES: OfferSide[] = ['author', 'taker']
const ROLE: Record<OfferSide, string> = { author: 'автор', taker: 'соперник' }
const OF: Record<OfferSide, string> = { author: 'автора', taker: 'соперника' }

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
  const [known, setKnown] = useState(false) // сторона нажала «Исход уже известен?» до «исход к»
  const state = offerState(offer)
  const times = viewTimes(offer) // сроки пари (Р-35); у пари до темпа — обычные
  // С судом (Р-24) — как у сервера: апелляция, решение суда, отмена; без суда — решение до суда
  const court = offerCourt(room, offer)
  const out = offerOutcome(state, now, court)
  const before = offerOutcome(state, now)?.approved?.winner ?? null
  const me = room.memberId
  const mySide = sideOf(state, me)
  if (!out || !offer.accepted) return null
  const started = now >= offer.expectedAt || out.marks.author !== null || out.marks.taker !== null || out.phase !== 'marking'
  // До «исход к» не начато: сторонам — «Исход уже известен?» (Р-27), остальным — ничего
  if (!started && !mySide) return null
  if (!started && !known) {
    return (
      <section className="outcome" aria-label="Исход">
        <h3>Исход</h3>
        <p className="hint">
          Исход к {formatDateTime(offer.expectedAt)}. Стал известен раньше — отметьте его сейчас: совпадут отметки — исход окончательный сразу.
        </p>
        {!online && <p className="hint">Действовать можно, когда есть связь с сервером.</p>}
        <div className="row">
          <button className="button" type="button" onClick={() => setKnown(true)} disabled={!online}>
            Исход уже известен?
          </button>
        </div>
      </section>
    )
  }

  const mayMark = mySide !== null && checkMark(state, me, 'author') === null
  const mayDecide = checkDecide(state, me, 'author', now) === null
  const mayDecline = checkDecline(state, me, now) === null
  const roles = roomRolesOf(room)
  const candidates = mySide ? room.members.filter((m) => checkNominate(state, me, m.id, roles, now) === null).map((m) => m.id) : []
  const mayNominate = candidates.length > 0
  const guarantor = who(room, out.guarantorId)
  // Пари без гаранта (Р-36), пока стороны его не назвали: разошлись или одна молчит — сразу суд
  const none = out.guarantorId === null
  const fmt = formatDateTime
  const name = (side: OfferSide) => nameOf(room, sideMember(offer, side))
  const result = (winner: OfferSide) => {
    const n = netsOf(room, offer, winner)
    return n ? `${winnerLabel(winner)} — ${n.winner} получает банк ${n.bank}: ${n.lines.map((l) => `${l.name} ${l.text}`).join(', ')}` : winnerLabel(winner)
  }
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
  const label = (v: CourtVerdict) =>
    v.verdict === 'keep'
      ? `оставить: ${before ? winnerLabel(before) : ''}`
      : v.verdict === 'cancel'
        ? 'отменить — вернуть ставки'
        : `изменить на „${'winner' in v ? winnerLabel(v.winner) : ''}“`

  function askMark(winner: OfferSide) {
    if (!mySide) return
    const other: OfferSide = mySide === 'author' ? 'taker' : 'author'
    const theirs = out?.marks[other] ?? null
    // Первая отметка раньше «исход к» у прежних пари (Р-27): молчание второй стороны — срок молчания с неё.
    // Правило гаранта (Р-31): раньше «исход к» исход утверждают только совпавшие отметки
    const first = out?.marks.author === null && out?.marks.taker === null
    const early = now < offer.expectedAt
    // Без гаранта (Р-36) вместо гаранта — суд: разойдутся — сразу, вторая сторона промолчит — с turnAt
    const silentUntil = first ? Math.max(now, offer.expectedAt) + times.silence : (out?.turnAt ?? now)
    const next =
      theirs === winner
        ? `${cap(ROLE[other])} уже отметил так же — исход станет окончательным сразу и не обжалуется.`
        : theirs === null
          ? none
            ? `Если ${ROLE[other]} отметит так же, исход окончательный сразу и не обжалуется. Отметит иначе — сразу суд; промолчит до ${fmt(silentUntil)} — тоже суд.`
            : `Если ${ROLE[other]} отметит так же, исход окончательный сразу и не обжалуется.`
          : none
            ? `${cap(ROLE[other])} отметил иначе — гаранта нет, решит суд жребием из участников: соберётся сразу, отметки после этого не поменять.`
            : `${cap(ROLE[other])} отметил иначе — решает гарант ${nameOf(room, offer.guarantorId)}; пока он не решил, отметку можно поменять.`
    const silence = !early
      ? []
      : none
        ? [
            `Совпадёт с отметкой ${OF[other]} — исход окончательный сразу. Разойдётся — решит суд жребием из участников, но не раньше «исход к» (${fmt(offer.expectedAt)})${theirs === null ? `; ${ROLE[other]} не отметит до ${fmt(silentUntil)} — тоже суд` : ''}.`,
          ]
      : state.guarantorRule
        ? [
            `Совпадёт с отметкой ${OF[other]} — исход окончательный сразу. Разойдётся или ${ROLE[other]} не отметит — решит гарант ${nameOf(room, offer.guarantorId)}, но не раньше «исход к» (${formatDateTime(offer.expectedAt)}).`,
          ]
        : first
          ? [
              `Отмечаете раньше срока «исход к» (${formatDateTime(offer.expectedAt)}). Если ${ROLE[other]} не отметит до ${formatDateTime(now + times.silence)}, решит гарант ${nameOf(room, offer.guarantorId)}.`,
            ]
          : []
    // У ранней отметки по правилу гаранта строка про гаранта — в silence, вместо next
    const nextLine = early && state.guarantorRule && theirs !== winner ? [] : [next]
    onAsk({
      question: `Отметить: ${winnerLabel(winner)}?`,
      body: [`Вы отмечаете: ${result(winner)}.`, ...nextLine, ...silence],
      button: 'Отметить',
      busyLabel: 'Отмечаю…',
      form: formKey(room.id, offer.id, 'mark', winner),
      run: (requestId) => markOffer(room.server, room.id, room.key, offer.id, { winner, requestId }),
    })
  }

  function askDecide(winner: OfferSide) {
    onAsk({
      question: `Решение гаранта: ${winnerLabel(winner)}?`,
      body: [`Утвердить: ${result(winner)}.`, `Решение не изменить; окончательным станет через ${spanText(times.appeal)}.`],
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
          ? `${name(other)} назвал(а) того же — ${nameOf(room, guarantorId)} сразу станет гарантом, на решение — ${spanText(times.silence)}.`
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
      <Head room={room} offer={offer} state={state} out={out} now={now} guarantor={guarantor} />
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
      {out.approved && out.phase !== 'cancelled' && <Result room={room} offer={offer} winner={out.approved.winner} />}
      {out.phase === 'need-guarantor' && <Nominations room={room} offer={offer} out={out} first={none} />}
      <CourtBlock
        room={room}
        kind="offer"
        target={offer.id}
        dispute={{ kind: 'offer', offer: state }}
        c={court}
        now={now}
        online={online}
        changes={SIDES.map((w) => ({ verdict: 'change', winner: w }))}
        label={label}
        why={none ? courtWhy(room, offer, out.marks) : undefined}
        onAsk={onAsk}
      />
      {!online && (mayMark || mayDecide || mayDecline || mayNominate) && <p className="hint">Действовать можно, когда есть связь с сервером.</p>}

      {mayMark && mySide && (
        <div className="outcome-act" role="group" aria-label="Ваша отметка">
          <p className="hint">
            {out.marks[mySide]
              ? `Ваша отметка: ${winnerLabel(out.marks[mySide])}. Поменять можно, ${none ? 'пока не собрался суд' : 'пока гарант не решил'}.`
              : 'Кто прав? Отметка — с подтверждением.'}
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
            {mayDecide
              ? `Вы — гарант: ваше решение до ${out.guarantorUntil === null ? '' : formatDateTime(out.guarantorUntil)}.`
              : state.guarantorRule && now < offer.expectedAt
                ? `Вы — гарант: решаете, если стороны разойдутся или одна не отметит, но не раньше «исход к» (${formatDateTime(offer.expectedAt)}).`
                : `Вы — гарант: решаете, если стороны разойдутся или одна промолчит до ${formatDateTime(out.turnAt)}.`}
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
          first={none}
          initial={out.nominations[mySide === 'author' ? 'taker' : 'author'] ?? out.nominations[mySide] ?? null}
          disabled={!online}
          onChoose={askNominate}
        />
      )}
    </section>
  )
}

// Строка фазы сверху: ждём отметок / решает гарант до … / нужен новый гарант / ждёт суда / утверждено
function Head({
  room,
  offer,
  state,
  out,
  now,
  guarantor,
}: {
  room: SavedRoom
  offer: OfferView
  state: OfferState
  out: Outcome
  now: number
  guarantor: string
}) {
  const { marks } = out
  const silence = spanText(viewTimes(offer).silence)
  const none = out.guarantorId === null // без гаранта (Р-36)
  if (out.phase === 'marking' && none) {
    // Разошлись до «исход к» — суд соберётся в «исход к» (turnAt), если отметки не сойдутся
    const apart = marks.author !== null && marks.taker !== null && marks.author !== marks.taker
    return (
      <>
        <p className="outcome-head">{apart ? 'Отметки сторон разошлись' : 'Ждём отметок сторон'}</p>
        <p className="hint">
          {apart
            ? `Поменяет кто-то отметку и они совпадут — исход окончательный сразу. Не совпадут — суд соберётся ${formatDateTime(out.turnAt)}.`
            : `Совпадут отметки — исход окончательный сразу. Разойдутся — суд соберётся ${
                now < offer.expectedAt ? `сразу, но не раньше «исход к» (${formatDateTime(offer.expectedAt)})` : 'сразу'
              }; одна сторона промолчит до ${formatDateTime(out.turnAt)} — суд соберётся тогда.`}
        </p>
        <p className="hint">Гаранта нет: суд — жребием из участников, кроме сторон.</p>
      </>
    )
  }
  if (out.phase === 'marking') {
    // Правило гаранта (Р-31): до «исход к» исход утверждают только совпавшие отметки
    if (state.guarantorRule && now < offer.expectedAt) {
      const apart = marks.author !== null && marks.taker !== null && marks.author !== marks.taker
      return (
        <>
          <p className="outcome-head">{apart ? 'Отметки сторон разошлись' : 'Ждём отметок сторон'}</p>
          <p className="hint">
            {apart ? 'Поменяет кто-то отметку и они совпадут' : 'Совпадут отметки сторон'} — исход окончательный сразу. Разойдутся или одна сторона не
            отметит — решит гарант {guarantor}, но не раньше «исход к» ({formatDateTime(offer.expectedAt)}).
          </p>
        </>
      )
    }
    return (
      <>
        <p className="outcome-head">Ждём отметок сторон</p>
        <p className="hint">
          Отметки совпадут — исход окончательный сразу. Разойдутся или одна сторона промолчит до {formatDateTime(out.turnAt)} — решает гарант {guarantor}.
        </p>
      </>
    )
  }
  if (out.phase === 'court') {
    return (
      <>
        <p className="outcome-head court">Ждёт суда</p>
        <p className="hint">
          {none ? `Гаранта нет, ${courtWhy(room, offer, marks)}` : `${capital(silence)} без общего гаранта`} — решает суд. Суд выбирает: прав автор, прав соперник
          или отменить — вернуть ставки.
        </p>
      </>
    )
  }
  if (out.phase === 'guarantor') {
    const why = marks.author !== null && marks.taker !== null ? 'Отметки сторон разошлись' : `Одна сторона не отметила исход за ${silence}`
    return (
      <>
        <p className="outcome-head">
          Решает гарант {guarantor} до {out.guarantorUntil === null ? '' : formatDateTime(out.guarantorUntil)}
        </p>
        <p className="hint">{why}. Пока гарант не решил, стороны могут поменять отметку: совпадут — исход утвердится согласием.</p>
      </>
    )
  }
  if (out.phase === 'need-guarantor' && none) {
    // Без гаранта (Р-36): дело у суда с turnAt; суд соберёт следующий запрос, а судить некому —
    // стороны называют общего гаранта, дальше — обычный путь с гарантом
    const nobody = courtCandidates({ kind: 'offer', offer: state }, courtRoomOf(room), now).length === 0
    const why = capital(courtWhy(room, offer, marks))
    return nobody ? (
      <>
        <p className="outcome-head court">Нужен гарант</p>
        <p className="hint">
          {why}, а суд собрать не из кого. Каждая сторона называет участника не из сторон; назовут одного и того же — это и есть гарант, на решение — {silence}.
        </p>
      </>
    ) : (
      <>
        <p className="outcome-head court">Собираем суд</p>
        <p className="hint">{why} — гаранта нет, решит суд жребием из участников.</p>
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
          назовут одного и того же — это и есть гарант, на решение — {silence}.
        </p>
        <CourtDeadline room={room} state={state} now={now} />
      </>
    )
  }
  const a = out.approved
  if (out.phase === 'cancelled') {
    return (
      <>
        <p className="outcome-head cancelled">Пари отменено судом — ставки возвращены</p>
        {a && <p className="hint">Было утверждено гарантом: {winnerLabel(a.winner)}. Выплат нет.</p>}
      </>
    )
  }
  if (!a) return null
  if (a.how === 'court') {
    return (
      <>
        <p className="outcome-head approved">Утверждено судом: {winnerLabel(a.winner)}, окончательно</p>
        <p className="hint">
          {formatDateTime(a.at)}. <strong className="final">Окончательно.</strong>
        </p>
      </>
    )
  }
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
        Утверждено гарантом {by}
        {out.phase === 'final' ? ', окончательно' : out.finalAt !== null ? ', окончательно ' + formatDateTime(out.finalAt) : ' — обжалуется в суде'}
      </p>
      <p className="hint">
        Решение — {formatDateTime(a.at)}.{' '}
        {out.phase === 'final' ? (
          <strong className="final">Окончательно.</strong>
        ) : out.finalAt !== null ? (
          `Окончательно ${formatDateTime(out.finalAt)}, если до неё нет апелляции.`
        ) : (
          'Подана апелляция — окончательно, когда решит суд.'
        )}
      </p>
    </>
  )
}

// Срок суда, пока нужен новый гарант (Р-31; courtFrom): до срока — «не сойдётесь до … — решит суд»;
// срок прошёл, а суда нет — судить некому (courtCandidates пусто) или суд соберёт следующий запрос.
// Прежние пари — ничего: суда без гаранта у них нет
function CourtDeadline({ room, state, now }: { room: SavedRoom; state: OfferState; now: number }) {
  const from = courtFrom(state, now)
  if (from === null) return null
  if (now < from) return <p className="hint">Не сойдётесь до {formatDateTime(from)} — решит суд.</p>
  const nobody = courtCandidates({ kind: 'offer', offer: state }, courtRoomOf(room), now).length === 0
  return <p className="hint">{nobody ? 'Суд собрать не из кого — договоритесь о гаранте.' : `${capital(spanText(viewTimes(state).silence))} без общего гаранта прошли — собираем суд.`}</p>
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
function Nominations({ room, offer, out, first }: { room: SavedRoom; offer: OfferView; out: Outcome; first: boolean }) {
  return (
    <ul className="outcome-log" aria-label={first ? 'Гарант' : 'Новый гарант'}>
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

// Выбор нового гаранта → окно подтверждения. Сначала выбран тот, кого назвала другая сторона. first —
// пари без гаранта (Р-36): гарант первый, не «новый»
function NominateForm({
  room,
  candidates,
  first,
  initial,
  disabled,
  onChoose,
}: {
  room: SavedRoom
  candidates: string[]
  first: boolean
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
    <form className="form outcome-form" onSubmit={submit} aria-label={first ? 'Назовите гаранта' : 'Назовите нового гаранта'}>
      <fieldset className="field">
        <legend>{first ? 'Назовите гаранта' : 'Назовите нового гаранта'}</legend>
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
