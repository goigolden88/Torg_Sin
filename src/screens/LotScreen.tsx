// Экран лота (этап 7, Р-09, Р-38): название, описание, продавец, старт и шаг, конец торга с продлениями и
// «не позже …», лучшая ставка и кто, все ставки (BidList, видны всем — Р-11), статус с отсчётом по времени
// сервера. Действия — по правам из правил (lot.ts) на часах сервера, без своих проверок: «Ваша ставка»
// (checkLotBid; подставлено лучшая + шаг, вдвое больше — второе подтверждение), продавцу «Снять лот»
// (checkLotWithdraw, пока ставок нет); после торга продавцу — «Передал» (checkHanded) и «Не смогу передать»
// (checkDeclined), победителю — «Получил» (checkReceived) и «Не получил» (checkDisputed) со сроком «если
// промолчите до …, считается получено». Суд по «Не получил» — блоком суда, как у пари (CourtBlock: голоса
// «передано» / «не передано»). Каждое действие — окном подтверждения с синхронным замком и номером запроса
// (Р-13). Состояние — с сервера раз в 5 с (useRoom); нет связи — последнее известное, действия закрыты.
// Рядом (от 1280 px) или ниже — список лотов комнаты (LotList). Прошедший лот — «Назад» в «Историю»
import { useCallback, useRef, useState, type FormEvent, type MutableRefObject } from 'react'
import { bidLot, markLot, type LotMarkAction, type Result } from '../api'
import { auctionLatestEnd } from '../rules/auction'
import { currency as currencyOf, isCurrencyCode, parseAmount } from '../rules/currency'
import { formatDateTime } from '../rules/date'
import { checkDeclined, checkDisputed, checkHanded, checkLotBid, checkLotWithdraw, checkReceived } from '../rules/lot'
import type { LotView } from '../rules/protocol'
import { formKey, requestFor, type PendingRequest } from '../rules/request'
import { ulid } from '../rules/ulid'
import { savedLots, type SavedRoom } from '../store/db'
import { BackLink, useEscape } from './BackLink'
import { BidList } from './BidList'
import { ChatButton } from './ChatButton'
import { CourtBlock } from './CourtBlock'
import { money, nameOf } from './eventParts'
import { historyHref } from './historyParts'
import { LotList, LotStatusLine } from './LotList'
import { mayCallChat, mayStartNew } from './memberParts'
import {
  afterLine,
  LOT_COURT_WHY,
  LOT_VERDICTS,
  lotBidAskText,
  lotBidHint,
  lotCourt,
  lotOutbid,
  lotOutcomeOf,
  lotPastNow,
  lotRoomOf,
  lotState,
  lotVerdictLabel,
  nextLotBid,
  receivedHow,
} from './lotParts'
import { unitsText, who } from './offerParts'
import { spanText } from './paceParts'
import { serverTime, useRoom, useServerNow, type Clock } from './useRoom'

const pending = new Map<string, PendingRequest>() // по лоту: окно закрыли и открыли — тот же номер

// Окно подтверждения: вопрос, основание строками, кнопка и запрос; twice — второе подтверждение
type Ask = {
  question: string
  body: string[]
  button: string
  busyLabel: string
  form: string
  run: (requestId: string) => Promise<Result<{ v: number }>>
  twice?: string
}

export function LotScreen({ room, lotId, onUpdate }: { room: SavedRoom; lotId: string; onUpdate: (room: SavedRoom) => void }) {
  const { sync, clock, refresh } = useRoom(room, onUpdate)
  const lot = savedLots(room).find((l) => l.id === lotId)
  const now = useServerNow(clock, !!lot)
  const [ask, setAsk] = useState<Ask | null>(null)
  const [round, setRound] = useState(0) // действие удалось — поле ставки снова с подставленной суммой
  const busy = useRef(false) // идёт запрос — окно не закрывается
  // Прошедший лот живёт в «Истории» — «Назад» туда; идущий — в комнату
  const back = lot && lotPastNow(room, lot, now) !== null ? historyHref(room.id) : '#/room/' + room.id

  useEscape(
    useCallback(() => {
      if (busy.current) return
      if (ask) setAsk(null)
      else location.hash = back
    }, [ask, back]),
  )

  if (!lot) {
    return (
      <div className="card">
        <BackLink href={back} />
        {sync.state === 'fail' && <p className="error">{sync.text}</p>}
        <p className="hint">{sync.state === 'busy' ? 'Загружаю…' : 'Нет такого лота.'}</p>
      </div>
    )
  }

  const l: LotView = lot // для действий ниже: лот уже найден
  const state = lotState(l)
  const me = room.memberId
  const online = sync.state === 'ok'
  const out = lotOutcomeOf(room, l, now)
  const sum = (n: number) => money(n, room.currency)
  const best = l.bids[l.bids.length - 1] ?? null
  const winner = out.winner
  const open = out.status === 'open'
  // Помеченный «выбыл» (Р-41) не ставит; передать, получить и снять своё — как раньше; в закрытой (Р-43) — никто
  const mayBid = mayStartNew(room) && checkLotBid(state, me, nextLotBid(l), lotRoomOf(room), now) === null
  const mayWithdraw = checkLotWithdraw(state, me, now) === null
  const mayHand = checkHanded(state, me, now) === null
  const mayDecline = checkDeclined(state, me, now) === null
  const mayReceive = checkReceived(state, me, now) === null
  const mayDispute = checkDisputed(state, me, now) === null
  const c = lotCourt(room, l)
  const after = afterLine(room, l, now)
  const seller = nameOf(room, l.sellerId)

  function mark(action: LotMarkAction, a: Omit<Ask, 'form' | 'run'>) {
    setAsk({ ...a, form: formKey(room.id, l.id, action), run: (requestId) => markLot(room.server, room.id, room.key, l.id, action, { requestId }) })
  }

  const w = winner ? `${nameOf(room, winner.by)}, ${sum(winner.amount)}` : ''

  function askWithdraw() {
    mark('withdraw', {
      question: 'Снять лот?',
      body: ['Торг закончится: ставок больше не будет. Снятие не вернуть — захотите снова, выставьте лот заново.'],
      button: 'Снять лот',
      busyLabel: 'Снимаю…',
    })
  }

  function askHanded() {
    mark('handed', {
      question: 'Вы передали лот?',
      body: [
        `Победитель — ${w}.`,
        winner
          ? `Отметит «Получил» или промолчит ${spanText(l.times.silence)} — лот получен: долг ${nameOf(room, winner.by)} вам — ${sum(winner.amount)}, в «Расчёте». Отметит «Не получил» — решит суд.`
          : '',
        'Отметку не отменить.',
      ].filter(Boolean),
      button: 'Передал',
      busyLabel: 'Отмечаю…',
    })
  }

  function askDecline() {
    mark('cannot', {
      question: 'Не сможете передать?',
      body: [`Лот не состоится: никто никому не должен${winner ? `, ставка ${nameOf(room, winner.by)} не в счёт` : ''}.`, 'Отметку не отменить.'],
      button: 'Не смогу передать',
      busyLabel: 'Отмечаю…',
    })
  }

  function askReceived() {
    mark('received', {
      question: 'Вы получили лот?',
      body: [winner ? `Лот получен: вы должны продавцу — ${seller} — ${sum(winner.amount)}, долг — в «Расчёте».` : '', 'Отметку не отменить.'].filter(Boolean),
      button: 'Получил',
      busyLabel: 'Отмечаю…',
    })
  }

  function askDisputed() {
    mark('not-received', {
      question: 'Вы не получили лот?',
      body: [
        'Решит суд: участники по жребию, кроме вас и продавца; решение окончательное. Судить некому — лот будет «в споре», пока одна из сторон не уступит.',
        'До решения суда долга нет. Отметку не отменить.',
      ],
      button: 'Не получил',
      busyLabel: 'Отмечаю…',
    })
  }

  return (
    <div className="card event lot">
      <div className="event-main">
        <BackLink href={back} />
        <h2 className="event-title">{l.title}</h2>
        {l.description && <p className="event-check">{l.description}</p>}
        <ul className="offer-facts" aria-label="Условия лота">
          <li>
            <span className="hint">Продавец</span>
            <span>{who(room, l.sellerId)}</span>
          </li>
          <li>
            <span className="hint">Торг</span>
            <span>
              старт — {sum(l.start)}, шаг — {sum(l.step)}: ставка больше лучшей хотя бы на шаг
            </span>
          </li>
          <li>
            <span className="hint">Лучшая ставка</span>
            <span>{best ? `${who(room, best.by)} — ${sum(best.amount)}` : 'ставок нет'}</span>
          </li>
          <li>
            <span className="hint">Конец торга</span>
            <span>
              {formatDateTime(state.endsAt)}
              {state.endsAt > l.closesAt ? ` (продлён с ${formatDateTime(l.closesAt)})` : ''}, не позже {formatDateTime(auctionLatestEnd(l))}
            </span>
          </li>
          {winner && (
            <li>
              <span className="hint">Победитель</span>
              <span>
                {who(room, winner.by)} — {sum(winner.amount)}
              </span>
            </li>
          )}
        </ul>
        <p>
          <LotStatusLine room={room} lot={l} now={now} />
        </p>
        {out.status === 'received' && out.received && winner && (
          <p className="auction-result">
            Получен {receivedHow(out.received.how)} {formatDateTime(out.received.at)}: {nameOf(room, winner.by)} → {seller}, {sum(winner.amount)} — в «Расчёте».
          </p>
        )}
        {l.withdrawnAt !== null && <p className="hint">Продавец снял лот {formatDateTime(l.withdrawnAt)}.</p>}
        {l.declinedAt !== null && <p className="hint">Продавец отметил «Не смогу передать» {formatDateTime(l.declinedAt)} — лот не состоялся, никто никому не должен.</p>}
        {l.handedAt !== null && out.status !== 'handed' && <p className="hint">Продавец отметил «Передал» {formatDateTime(l.handedAt)}.</p>}
        {l.disputedAt !== null && winner && (
          <p className="hint">
            {nameOf(room, winner.by)} отметил(а) «Не получил» {formatDateTime(l.disputedAt)}.
          </p>
        )}
        {after && <p className="ok">{after}</p>}
        {sync.state === 'fail' && <p className="error">{sync.text}</p>}

        <section className="bidding" aria-label="Ставки">
          <h3>Ставки</h3>
          {open && <p>{best ? `Лучшая ставка — ${who(room, best.by)}: ${sum(best.amount)}.` : `Ставок пока нет. Первая — не меньше старта: ${sum(l.start)}.`}</p>}
          {lotOutbid(room, l, now) && best && (
            <p className="outbid" role="status">
              Вас перебили: лучшая ставка — {who(room, best.by)}, {sum(best.amount)}. Можете перебить снова.
            </p>
          )}
          {l.bids.length === 0 ? (
            !open && <p className="hint">Ставок не было.</p>
          ) : (
            <BidList room={room} bids={l.bids} bestId={best?.id ?? null} badge={open ? 'лучшая' : winner ? 'выиграла' : 'лучшая'} label="Ставки" />
          )}
        </section>
        {mayBid && <BidPanel key={round} room={room} lot={l} clock={clock} busy={busy} online={online} onAsk={setAsk} />}

        {mayWithdraw || mayHand || mayDecline || mayReceive || mayDispute ? (
          <>
            <div className="row">
              {mayHand && (
                <button className="button" type="button" onClick={askHanded} disabled={!online}>
                  Передал
                </button>
              )}
              {mayReceive && (
                <button className="button" type="button" onClick={askReceived} disabled={!online}>
                  Получил
                </button>
              )}
              {mayDispute && (
                <button className="button secondary" type="button" onClick={askDisputed} disabled={!online}>
                  Не получил
                </button>
              )}
              {mayDecline && (
                <button className="button secondary" type="button" onClick={askDecline} disabled={!online}>
                  Не смогу передать
                </button>
              )}
              {mayWithdraw && (
                <button className="button secondary" type="button" onClick={askWithdraw} disabled={!online}>
                  Снять лот
                </button>
              )}
            </div>
            {!online && <p className="hint">Действия — когда есть связь с сервером.</p>}
          </>
        ) : null}

        {c && (
          <section className="outcome" aria-label="Суд по лоту">
            <CourtBlock
              room={room}
              kind="lot"
              target={l.id}
              title={l.title}
              dispute={{ kind: 'lot', lot: state }}
              c={c}
              now={now}
              online={online}
              changes={LOT_VERDICTS}
              label={lotVerdictLabel}
              why={LOT_COURT_WHY}
              onAsk={setAsk}
            />
          </section>
        )}
        {mayCallChat(room) && (
          <ChatButton
            room={room}
            screen={{ kind: 'lot', id: l.id }}
            news={{
              kind: 'lot',
              seller,
              title: l.title,
              // Продан — победитель есть и лот не сорвался («Не смогу передать», суд «не передано»)
              state: open ? 'open' : winner && out.status !== 'failed' && out.status !== 'undelivered' ? 'sold' : 'other',
              start: l.start,
              best: winner ? winner.amount : (best?.amount ?? null),
            }}
          />
        )}
      </div>
      <div className="event-side">
        <LotList room={room} clock={clock} current={l.id} />
      </div>

      {ask && (
        <ConfirmAct
          ask={ask}
          lotId={l.id}
          busy={busy}
          onClose={() => setAsk(null)}
          onDone={async () => {
            setAsk(null)
            setRound((r) => r + 1)
            await refresh()
          }}
        />
      )}
    </div>
  )
}

// «Ваша ставка»: подставлено лучшая + шаг (ставок нет — старт), по ходу ввода — основание; проверка —
// checkLotBid на часах сервера; окно подтверждения, вдвое больше лучшей — второе подтверждение
function BidPanel({
  room,
  lot,
  clock,
  busy,
  online,
  onAsk,
}: {
  room: SavedRoom
  lot: LotView
  clock: Clock | null
  busy: MutableRefObject<boolean>
  online: boolean
  onAsk: (ask: Ask) => void
}) {
  const code = isCurrencyCode(room.currency) ? room.currency : null
  const sign = code ? currencyOf(code).sign || code : room.currency
  const [text, setText] = useState<string | null>(null) // null — подставленное
  const [error, setError] = useState('')
  const shown = text ?? (code ? unitsText(nextLotBid(lot), code) : '')
  const parsed = code && shown.trim() ? parseAmount(shown, code) : null

  function submit(e: FormEvent) {
    e.preventDefault()
    if (busy.current) return
    if (!code) return setError('Валюта комнаты незнакома этой версии сайта — обновите страницу')
    const units = parseAmount(shown, code)
    if (!units.ok) return setError(units.error)
    const refusal = checkLotBid(lotState(lot), room.memberId, units.units, lotRoomOf(room), serverTime(clock))
    if (refusal) return setError(refusal)
    setError('')
    const t = lotBidAskText(room, lot, units.units)
    onAsk({
      question: 'Сделать ставку?',
      body: [
        t.body,
        'Останется лучшей к концу торга — вы покупаете: долг продавцу появится в «Расчёте», когда отметите «Получил». Перебьют — вы свободны.',
        'Ставка не отзывается.',
      ],
      button: 'Сделать ставку',
      busyLabel: 'Отправляю…',
      form: formKey(room.id, lot.id, 'bid', String(units.units)),
      run: (requestId) => bidLot(room.server, room.id, room.key, lot.id, { amount: units.units, requestId }),
      ...(t.twice && { twice: t.twice }),
    })
  }

  return (
    <form className="panel form" onSubmit={submit} aria-label="Ваша ставка">
      <label className="field">
        <span>Ваша ставка, {sign}</span>
        <input className="input" inputMode="decimal" value={shown} onChange={(e) => setText(e.target.value)} autoComplete="off" />
      </label>
      <span className="hint">{lotBidHint(lot, room.currency)}</span>
      <div className="offer-summary" aria-live="polite">
        <p>{parsed?.ok ? lotBidAskText(room, lot, parsed.units).body : parsed ? parsed.error : 'Введите сумму ставки.'}</p>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="button" type="submit" disabled={!online}>
          Сделать ставку
        </button>
      </div>
    </form>
  )
}

// Окно подтверждения действия. Повтор того же действия (двойное нажатие, ещё раз после «нет связи») —
// тот же номер запроса: сервер запишет одно (Р-13). Удалось — номер забыт. twice — второе подтверждение:
// первое нажатие только переводит окно ко второму вопросу (двойное нажатие его не проскочит)
function ConfirmAct({
  ask,
  lotId,
  busy,
  onClose,
  onDone,
}: {
  ask: Ask
  lotId: string
  busy: MutableRefObject<boolean>
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [second, setSecond] = useState(false)

  async function confirm() {
    if (busy.current) return // синхронный замок: второе нажатие раньше перерисовки
    if (ask.twice && !second) return setSecond(true)
    const request = requestFor(pending.get(lotId) ?? null, ask.form, ulid)
    pending.set(lotId, request)
    busy.current = true
    setSending(true)
    setError('')
    try {
      const res = await ask.run(request.requestId)
      if (!res.ok) return setError(res.error)
      pending.delete(lotId)
      busy.current = false
      await onDone()
    } finally {
      busy.current = false
      setSending(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !busy.current && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={ask.question} onClick={(e) => e.stopPropagation()}>
        <p className="modal-question">{second ? 'Точно столько?' : ask.question}</p>
        {ask.body.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
        {second && ask.twice && (
          <p className="warn" role="alert">
            {ask.twice}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button className="button" type="button" onClick={confirm} disabled={sending} autoFocus>
            {sending ? ask.busyLabel : second ? 'Да, ' + ask.button.toLowerCase() : ask.button}
          </button>
          <button className="button secondary" type="button" onClick={onClose} disabled={sending}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}
