// Экран «Расчёт» комнаты (этап 5, Р-07, Р-32): свои три числа с основанием (итог, ждёт окончательности,
// в игре), «Вы должны» с «Перевёл» и «Вам должны» с «Получил» (из подсказки «кто кому» сервера), строка
// режима «кто кому» (ведущему — «Изменить», пока правила разрешают), переводы комнаты с состоянием и
// кнопками по правам (checkAnswer, checkRevoke), таблица всех участников (на телефоне — карточками).
// В комнате на очки — «Таблица очков»: участники по убыванию итога, без переводов и кнопок. Свод — из
// ответа комнаты (useRoom, раз в 5 с); сервер без свода — «Расчёта на этом сервере пока нет». Каждое
// действие — окном подтверждения с синхронным замком и номером запроса (Р-13); Enter отправляет, Esc
// закрывает. Колонки — как у события: .event-main и .event-side, от 1280 px — рядом. Полученные лоты (Р-38) —
// «Долги по лотам» с основанием «лот „…“»; решённые выборы (Р-39) — «Долги по выборам» с основанием «выбор „…“».
// Пари на обещание (Р-44) — блок «Обещания»: «Вы обещали» с «Исполнил», «Вам обещали» с «Получил» / «Не получил»
import { useCallback, useRef, useState, type FormEvent, type MutableRefObject, type ReactNode } from 'react'
import { answerTransfer, changeSettleMode, createTransfer, markPromise, type PromiseAct, type Result, type TransferAct } from '../api'
import { isCurrencyCode, parseAmount } from '../rules/currency'
import { formatDateTime } from '../rules/date'
import type { PromiseView, SettlementView, SettleModeView, TransferView } from '../rules/protocol'
import { formKey, requestFor, type PendingRequest } from '../rules/request'
import { ulid } from '../rules/ulid'
import { savedChoices, savedEvents, savedLots, savedOffers, savedSettlement, type SavedRoom } from '../store/db'
import { BackLink, useEscape } from './BackLink'
import { ChatButton } from './ChatButton'
import { mayCallChat } from './memberParts'
import { choiceDebtLine, choiceDebtsOf, choiceHref, type ChoiceDebt } from './choiceParts'
import { nameOf } from './eventParts'
import { lotDebtLine, lotDebts, lotHref, type LotDebt } from './lotParts'
import {
  amountText,
  basisText,
  byTotal,
  isPoints,
  MODE_ABOUT,
  MODE_LOCKED_NOTE,
  MODE_TITLE,
  modeChange,
  modeLabel,
  MODES,
  memberNumbers,
  myDebts,
  myPromises,
  nothingFinal,
  pendingDisputes,
  PROMISE_STATUS,
  promiseButtons,
  signedSum,
  sumText,
  TRANSFER_STATUS,
  transferButtons,
  type Debt,
  type PromiseButton,
  type TransferButton,
} from './settleParts'
import { offerHref } from './offerParts'
import { useRoom, useServerNow } from './useRoom'

const pending = new Map<string, PendingRequest>() // по комнате: окно закрыли и открыли — тот же номер

// Открытое окно: «Перевёл» / «Получил» с суммой, ответ на перевод, смена режима
type Ask =
  | { kind: 'send' | 'receive'; debt: Debt }
  | { kind: 'act'; transfer: TransferView; button: TransferButton }
  | { kind: 'promise'; promise: PromiseView; button: PromiseButton }
  | { kind: 'mode' }

export function SettleScreen({ room, onUpdate }: { room: SavedRoom; onUpdate: (room: SavedRoom) => void }) {
  const { sync, clock, refresh } = useRoom(room, onUpdate)
  const lots = savedLots(room)
  const choices = savedChoices(room)
  const now = useServerNow(clock, lots.length + choices.length > 0)
  const [ask, setAsk] = useState<Ask | null>(null)
  const busy = useRef(false) // идёт запрос — окно не закрывается
  const back = '#/room/' + room.id
  const points = isPoints(room.currency)
  const title = points ? 'Таблица очков' : 'Расчёт'

  useEscape(
    useCallback(() => {
      if (busy.current) return
      if (ask) setAsk(null)
      else location.hash = back
    }, [ask, back]),
  )

  const settlement = savedSettlement(room)
  if (!settlement) {
    return (
      <div className="card">
        <BackLink href={back} />
        <h2>{title}</h2>
        {sync.state === 'fail' && <p className="error">{sync.text}</p>}
        <p className="hint">{sync.state === 'busy' ? 'Загружаю…' : 'Расчёта на этом сервере пока нет — сервер старше сайта.'}</p>
      </div>
    )
  }

  const s: SettlementView = settlement
  const me = room.memberId
  const online = sync.state === 'ok'
  const empty = nothingFinal(s)
  const waiting = pendingDisputes(savedEvents(room), savedOffers(room))
  const mine = s.members.find((m) => m.memberId === me)
  const numbers = mine ? memberNumbers(mine, room.currency) : null
  const debts = myDebts(s, me)
  const change = modeChange(s, room, me)

  return (
    <div className="card event settle">
      <div className="event-main">
        <BackLink href={back} />
        <h2 className="event-title">
          {title} — {room.name}
        </h2>
        {sync.state === 'fail' && <p className="error">{sync.text}</p>}

        {empty ? (
          <section className="settle-mine" aria-label="Пока считать нечего">
            <p className="outcome-head">Пока считать нечего: окончательных событий и пари нет</p>
            {waiting > 0 && <p className="hint">Ждут окончательности — {waiting}</p>}
          </section>
        ) : (
          <section className="settle-mine" aria-label="Ваш расчёт">
            <h3>{points ? 'Ваши очки' : 'Ваш расчёт'}</h3>
            {numbers && (
              <ul className="settle-numbers">
                <li>
                  <span className="hint">Итог</span>
                  <span className={mine && mine.total.amount > 0 ? 'win' : mine && mine.total.amount < 0 ? 'loss' : ''}>{numbers.total}</span>
                </li>
                <li>
                  <span className="hint">Ждёт окончательности</span>
                  <span>{numbers.pending}</span>
                </li>
                <li>
                  <span className="hint">В игре</span>
                  <span>{numbers.inPlay}</span>
                </li>
              </ul>
            )}
            {!points && (
              <>
                {debts.owe.length > 0 && (
                  <DebtList
                    label="Вы должны"
                    debts={debts.owe}
                    room={room}
                    button="Перевёл"
                    online={online}
                    onPress={(debt) => setAsk({ kind: 'send', debt })}
                  />
                )}
                {debts.owed.length > 0 && (
                  <DebtList
                    label="Вам должны"
                    debts={debts.owed}
                    room={room}
                    button="Получил"
                    online={online}
                    onPress={(debt) => setAsk({ kind: 'receive', debt })}
                  />
                )}
                {s.suggestions.length === 0 ? (
                  <p className="ok">Все в расчёте: переводить нечего</p>
                ) : (
                  debts.owe.length === 0 && debts.owed.length === 0 && <p className="ok">Вы в расчёте: вам переводить нечего</p>
                )}
                {!online && (debts.owe.length > 0 || debts.owed.length > 0) && <p className="hint">Действия — когда есть связь с сервером.</p>}
              </>
            )}
          </section>
        )}

        <Promises room={room} settlement={s} online={online} onAct={(promise, button) => setAsk({ kind: 'promise', promise, button })} />
        <LotDebts room={room} debts={lotDebts(room, lots, now)} />
        <ChoiceDebts room={room} debts={choiceDebtsOf(choices, now)} />
        {!points && <ModeLine settlement={s} change={change} online={online} onChange={() => setAsk({ kind: 'mode' })} />}
        {mayCallChat(room) && (
          <ChatButton
            room={room}
            screen={{ kind: 'settle' }}
            news={
              points
                ? { kind: 'points', room: room.name, totals: byTotal(s.members).map((m) => ({ name: nameOf(room, m.memberId), amount: m.total.amount })) }
                : { kind: 'settle', room: room.name, transfers: s.suggestions.map((t) => ({ from: nameOf(room, t.from), to: nameOf(room, t.to), amount: t.amount })) }
            }
          />
        )}
      </div>

      {!points && (
        <div className="event-side">
          <Transfers room={room} settlement={s} online={online} onAct={(transfer, button) => setAsk({ kind: 'act', transfer, button })} />
        </div>
      )}

      {/* Таблица — под обеими колонками: пять столбцов в одной колонке переносили бы суммы */}
      {!empty && (
        <div className="settle-all">
          <MembersTable room={room} settlement={s} points={points} />
        </div>
      )}

      {ask && (
        <AskWindow
          ask={ask}
          room={room}
          settlement={s}
          busy={busy}
          onClose={() => setAsk(null)}
          onDone={async () => {
            setAsk(null)
            await refresh()
          }}
        />
      )}
    </div>
  )
}

// «Вы должны: Петя — 300 ₽ [Перевёл]» / «Вам должны: Аня — 900 ₽ [Получил]»
function DebtList({
  label,
  debts,
  room,
  button,
  online,
  onPress,
}: {
  label: string
  debts: Debt[]
  room: SavedRoom
  button: string
  online: boolean
  onPress: (debt: Debt) => void
}) {
  return (
    <div className="settle-debts" role="group" aria-label={label}>
      <p className="settle-debts-head">{label}:</p>
      <ul>
        {debts.map((d) => (
          <li key={d.other} className="settle-debt">
            <span>
              {nameOf(room, d.other)} — <strong>{sumText(d.amount, room.currency)}</strong>
            </span>
            <button className="button" type="button" onClick={() => onPress(d)} disabled={!online}>
              {button}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Обещания (Р-44): «Вы обещали» — кому и что, состояние, «Исполнил»; «Вам обещали» — от кого и что,
// «Получил» / «Не получил» — по правам (promiseButtons), как у переводов; ссылка — на пари. Обещаний с вами
// нет — блока нет
function Promises({
  room,
  settlement,
  online,
  onAct,
}: {
  room: SavedRoom
  settlement: SettlementView
  online: boolean
  onAct: (p: PromiseView, b: PromiseButton) => void
}) {
  const { mine, owed } = myPromises(settlement, room.memberId)
  if (mine.length === 0 && owed.length === 0) return null
  const offers = savedOffers(room)
  const group = (label: string, list: PromiseView[], other: (p: PromiseView) => string) =>
    list.length > 0 && (
      <div className="settle-debts" role="group" aria-label={label}>
        <p className="settle-debts-head">{label}:</p>
        <ul className="transfer-list">
          {list.map((p) => {
            const buttons = promiseButtons(p, room.memberId)
            const offer = offers.find((o) => o.id === p.offer)
            return (
              <li key={p.offer} className={'transfer ' + (p.status === 'received' ? 'received' : p.status === 'rejected' ? 'rejected' : 'pending')}>
                <span className="transfer-who">
                  {other(p)}: <strong>{p.text}</strong>
                </span>
                <span className={'status transfer-status ' + (p.status === 'received' ? 'received' : p.status === 'rejected' ? 'rejected' : 'pending')}>
                  {PROMISE_STATUS[p.status]}
                </span>
                <span className="hint">
                  {offer ? <a href={offerHref(room.id, offer.id)}>пари „{offer.condition}“</a> : 'пари'} · окончательно {formatDateTime(p.at)}
                  {p.changedAt !== p.at ? ` · изменено ${formatDateTime(p.changedAt)}` : ''}
                </span>
                {buttons.length > 0 && (
                  <div className="row">
                    {buttons.map((b) => (
                      <button key={b.act} className={b.act === 'rejected' ? 'button secondary' : 'button'} type="button" onClick={() => onAct(p, b)} disabled={!online}>
                        {b.label}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    )
  return (
    <section className="settle-lots settle-promises" aria-label="Обещания">
      <h3>Обещания</h3>
      <p className="hint">Пари на обещание: деньги, итог и «кто кому» они не меняют.</p>
      {group('Вы обещали', mine, (p) => nameOf(room, p.to))}
      {group('Вам обещали', owed, (p) => nameOf(room, p.from))}
      {!online && <p className="hint">Действия — когда есть связь с сервером.</p>}
    </section>
  )
}

// Долги по лотам (Р-38) — основание чисел выше: полученный лот — победитель должен продавцу свою ставку,
// «Вера (вы) → Боря: 1 500 ₽ — лот „Велосипед“», ссылкой на лот; полученных нет — блока нет
function LotDebts({ room, debts }: { room: SavedRoom; debts: LotDebt[] }) {
  if (debts.length === 0) return null
  return (
    <section className="settle-lots" aria-label="Долги по лотам">
      <h3>Долги по лотам</h3>
      <ul className="event-list">
        {debts.map((d) => (
          <li key={d.lot}>
            <a className={'event-item' + (d.from === room.memberId || d.to === room.memberId ? ' mine' : '')} href={lotHref(room.id, d.lot)}>
              <span className="event-name">{lotDebtLine(room, d)}</span>
              <span className="hint">получен {formatDateTime(d.at)} · уже в итоге и «кто кому»</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

// Долги по выборам (Р-39) — основание чисел выше: решённый выбор — вложившийся в победивший вариант должен
// получателю свою сумму, «Вера (вы) → Аня: 500 ₽ — выбор „Куда едем?“», ссылкой на выбор; решённых с долгами
// нет — блока нет
function ChoiceDebts({ room, debts }: { room: SavedRoom; debts: ChoiceDebt[] }) {
  if (debts.length === 0) return null
  return (
    <section className="settle-lots settle-choices" aria-label="Долги по выборам">
      <h3>Долги по выборам</h3>
      <ul className="event-list">
        {debts.map((d) => (
          <li key={d.choice + '/' + d.from}>
            <a className={'event-item' + (d.from === room.memberId || d.to === room.memberId ? ' mine' : '')} href={choiceHref(room.id, d.choice)}>
              <span className="event-name">{choiceDebtLine(room, d)}</span>
              <span className="hint">решён {formatDateTime(d.at)} · уже в итоге и «кто кому»</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

// Строка режима «кто кому» всем; ведущему — «Изменить», пока правила разрешают; после переводов —
// пояснение, когда режим снова меняется
function ModeLine({ settlement, change, online, onChange }: { settlement: SettlementView; change: 'can' | 'locked' | 'none'; online: boolean; onChange: () => void }) {
  return (
    <div className="settle-mode">
      <p>
        <span className="hint">Кто кому: </span>
        {modeLabel(settlement.mode)}
      </p>
      {change === 'can' && (
        <button className="button secondary" type="button" onClick={onChange} disabled={!online}>
          Изменить
        </button>
      )}
      {change === 'locked' && <p className="hint">{MODE_LOCKED_NOTE}.</p>}
    </div>
  )
}

// Все участники: имя, итог, ждёт окончательности, в игре, баланс после переводов (в очках — без
// баланса, по убыванию итога). На телефоне — карточками (.payouts), шире — таблицей
function MembersTable({ room, settlement, points }: { room: SavedRoom; settlement: SettlementView; points: boolean }) {
  const members = points ? byTotal(settlement.members) : settlement.members
  const cell = (amount: string, basis: string) => (
    <>
      <span>{amount}</span>
      {basis && <span className="hint">{basis}</span>}
    </>
  )
  const tone = (n: number) => (n > 0 ? 'win' : n < 0 ? 'loss' : '')
  return (
    <section className="payouts-box" aria-label="Все участники">
      <h3>Все участники</h3>
      {!points && <p className="hint">Баланс — итог с переводами: плюс — участнику должны, минус — он должен.</p>}
      <table className="payouts settle-table">
        <thead>
          <tr>
            <th scope="col">Кто</th>
            <th scope="col">Итог</th>
            <th scope="col">Ждёт окончательности</th>
            <th scope="col">В игре</th>
            {!points && <th scope="col">Баланс</th>}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.memberId} className={m.memberId === room.memberId ? 'mine' : ''}>
              <th scope="row">
                {nameOf(room, m.memberId)}
                {m.memberId === room.memberId ? ' (вы)' : ''}
              </th>
              <td data-label="Итог" className={tone(m.total.amount)}>
                {cell(signedSum(m.total.amount, room.currency), basisText(m.total))}
              </td>
              <td data-label="Ждёт окончательности">{cell(signedSum(m.pending.amount, room.currency), basisText(m.pending))}</td>
              <td data-label="В игре">{cell(sumText(m.inPlay.amount, room.currency), basisText(m.inPlay))}</td>
              {!points && (
                <td data-label="Баланс" className={tone(m.balance)}>
                  <span>{signedSum(m.balance, room.currency)}</span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

// Переводы комнаты по порядку заведения, новые сверху: кто, кому, сколько, состояние, когда; кнопки — по правам
function Transfers({
  room,
  settlement,
  online,
  onAct,
}: {
  room: SavedRoom
  settlement: SettlementView
  online: boolean
  onAct: (t: TransferView, b: TransferButton) => void
}) {
  const ids = settlement.members.map((m) => m.memberId)
  const list = [...settlement.transfers].reverse()
  return (
    <section aria-label="Переводы">
      <h3>Переводы</h3>
      {list.length === 0 ? (
        <p className="hint">Переводов пока нет.</p>
      ) : (
        <ul className="transfer-list">
          {list.map((t) => {
            const buttons = transferButtons(t, room.memberId, { currency: room.currency, members: ids })
            return (
              <li key={t.id} className={'transfer ' + t.status}>
                <span className="transfer-who">
                  {who(room, t.from)} → {who(room, t.to)}: <strong>{sumText(t.amount, room.currency)}</strong>
                </span>
                <span className={'status transfer-status ' + t.status}>{TRANSFER_STATUS[t.status]}</span>
                <span className="hint">
                  {t.by === 'sender' ? 'перевёл' : 'получатель отметил сам'} {formatDateTime(t.at)}
                  {t.changedAt !== t.at ? ` · изменён ${formatDateTime(t.changedAt)}` : ''}
                </span>
                {buttons.length > 0 && (
                  <div className="row">
                    {buttons.map((b) => (
                      <button key={b.act} className={b.act === 'receive' ? 'button' : 'button secondary'} type="button" onClick={() => onAct(t, b)} disabled={!online}>
                        {b.label}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function who(room: SavedRoom, id: string): string {
  return nameOf(room, id) + (id === room.memberId ? ' (вы)' : '')
}

// Что отправить: строка формы (номер запроса — по ней) и запрос; не годится — текст ошибки
type Prepared = { form: string; run: (requestId: string) => Promise<Result<unknown>> } | string

function AskWindow({
  ask,
  room,
  settlement,
  busy,
  onClose,
  onDone,
}: {
  ask: Ask
  room: SavedRoom
  settlement: SettlementView
  busy: MutableRefObject<boolean>
  onClose: () => void
  onDone: () => Promise<void>
}) {
  if (ask.kind === 'mode') return <ModeWindow room={room} current={settlement.mode} busy={busy} onClose={onClose} onDone={onDone} />
  if (ask.kind === 'act') return <ActWindow transfer={ask.transfer} button={ask.button} room={room} busy={busy} onClose={onClose} onDone={onDone} />
  if (ask.kind === 'promise') return <PromiseWindow promise={ask.promise} button={ask.button} room={room} busy={busy} onClose={onClose} onDone={onDone} />
  return <AmountWindow ask={ask} room={room} busy={busy} onClose={onClose} onDone={onDone} />
}

// «Перевёл» / «Получил»: сумма из подсказки, можно изменить (частями)
function AmountWindow({
  ask,
  room,
  busy,
  onClose,
  onDone,
}: {
  ask: { kind: 'send' | 'receive'; debt: Debt }
  room: SavedRoom
  busy: MutableRefObject<boolean>
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [amount, setAmount] = useState(() => amountText(ask.debt.amount, room.currency))
  const code = isCurrencyCode(room.currency) ? room.currency : null
  const parsed = code ? parseAmount(amount, code) : null
  const name = nameOf(room, ask.debt.other)
  const send = ask.kind === 'send'
  const sum = parsed?.ok ? sumText(parsed.units, room.currency) : null
  const question = send ? (sum ? `Вы перевели ${sum}?` : 'Сколько вы перевели?') : sum ? `Вы получили ${sum}?` : 'Сколько вы получили?'

  function prepare(): Prepared {
    if (!code) return 'Валюта комнаты незнакома этой версии сайта — обновите страницу'
    const units = parseAmount(amount, code)
    if (!units.ok) return units.error
    const other = ask.debt.other
    return send
      ? { form: formKey(room.id, 'send', other, String(units.units)), run: (requestId) => createTransfer(room.server, room.id, room.key, { to: other, amount: units.units, requestId }) }
      : { form: formKey(room.id, 'receive', other, String(units.units)), run: (requestId) => createTransfer(room.server, room.id, room.key, { from: other, amount: units.units, requestId }) }
  }

  return (
    <Window question={question} button={send ? 'Да, перевёл' : 'Да, получил'} busyLabel="Отмечаю…" busy={busy} roomId={room.id} prepare={prepare} onClose={onClose} onDone={onDone} focusButton={false}>
      <p>
        {send ? 'Кому' : 'От кого'}: <strong>{name}</strong>. По подсказке — {sumText(ask.debt.amount, room.currency)}; перевели частями — укажите, сколько на
        самом деле.
      </p>
      <label className="field">
        <span>Сумма</span>
        <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoComplete="off" autoFocus />
        {parsed && !parsed.ok && amount.trim() !== '' && <span className="hint">{parsed.error}</span>}
      </label>
      <p className="hint">
        {send
          ? `${name} подтвердит «Получил»; до тех пор перевод ждёт подтверждения, но в балансе уже учтён. Ошиблись — «Отозвать».`
          : 'Перевод сразу «получен» и учтён в балансе. Ошиблись — «Отменить отметку».'}
      </p>
    </Window>
  )
}

// Ответ на перевод: «Получил», «Не получал», «Отозвать», «Отменить отметку»
function ActWindow({
  transfer: t,
  button,
  room,
  busy,
  onClose,
  onDone,
}: {
  transfer: TransferView
  button: TransferButton
  room: SavedRoom
  busy: MutableRefObject<boolean>
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const sum = sumText(t.amount, room.currency)
  const from = nameOf(room, t.from)
  const to = nameOf(room, t.to)
  const text: Record<TransferAct, { question: string; body: string }> = {
    receive: { question: `Вы получили ${sum}?`, body: `От кого: ${from}. Перевод станет «получен».` },
    reject: { question: `Вы не получали ${sum}?`, body: `От кого: ${from}. Перевод станет «отклонён», долг вернётся.` },
    cancel:
      room.memberId === t.to
        ? { question: 'Отменить отметку «Получил»?', body: `${sum} от ${from}: ${t.by === 'sender' ? 'перевод снова будет ждать подтверждения' : 'перевод станет «отменён», долг вернётся'}.` }
        : { question: `Отозвать «Перевёл» ${sum}?`, body: `Кому: ${to}. Перевод станет «отменён», долг вернётся.` },
  }
  const { question, body } = text[button.act]
  const prepare = (): Prepared => ({
    form: formKey(room.id, t.id, button.act),
    run: (requestId) => answerTransfer(room.server, room.id, room.key, t.id, button.act, { requestId }),
  })
  return (
    <Window question={question} button={button.label} busyLabel="Отмечаю…" busy={busy} roomId={room.id} prepare={prepare} onClose={onClose} onDone={onDone}>
      <p>{body}</p>
    </Window>
  )
}

// Отметка обещания (Р-44): «Исполнил» — проигравший, «Получил» / «Не получил» — выигравший
function PromiseWindow({
  promise: p,
  button,
  room,
  busy,
  onClose,
  onDone,
}: {
  promise: PromiseView
  button: PromiseButton
  room: SavedRoom
  busy: MutableRefObject<boolean>
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const from = nameOf(room, p.from)
  const to = nameOf(room, p.to)
  const text: Record<PromiseAct, { question: string; body: string }> = {
    kept: { question: 'Вы исполнили обещание?', body: `${to}: «${p.text}». ${to} ответит «Получил» или «Не получил».` },
    received: { question: 'Вы получили обещанное?', body: `От ${from}: «${p.text}». Обещание станет «получено» — отметку не отменить.` },
    rejected: { question: 'Вы не получили обещанное?', body: `От ${from}: «${p.text}». Обещание станет «не получено», ${from} сможет снова отметить «Исполнил».` },
  }
  const { question, body } = text[button.act]
  const prepare = (): Prepared => ({
    form: formKey(room.id, 'promise', p.offer, button.act),
    run: (requestId) => markPromise(room.server, room.id, room.key, p.offer, button.act, { requestId }),
  })
  return (
    <Window question={question} button={button.label} busyLabel="Отмечаю…" busy={busy} roomId={room.id} prepare={prepare} onClose={onClose} onDone={onDone}>
      <p>{body}</p>
      <p className="hint">Деньги, итог и «кто кому» не меняются.</p>
    </Window>
  )
}

// Смена режима «кто кому» ведущим: два варианта, нынешний отмечен
function ModeWindow({
  room,
  current,
  busy,
  onClose,
  onDone,
}: {
  room: SavedRoom
  current: SettleModeView
  busy: MutableRefObject<boolean>
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [mode, setMode] = useState<SettleModeView>(current === 'stakes' ? 'fewest' : 'stakes')
  const prepare = (): Prepared =>
    mode === current
      ? 'Этот режим уже выбран'
      : { form: formKey(room.id, 'settle-mode', mode), run: (requestId) => changeSettleMode(room.server, room.id, room.key, { mode, requestId }) }
  return (
    <Window question="Кто кому переводит?" button="Сменить режим" busyLabel="Меняю…" busy={busy} roomId={room.id} prepare={prepare} onClose={onClose} onDone={onDone} focusButton={false}>
      <p className="hint">Режим видят все; когда отмечены переводы, меняется, только когда все в расчёте.</p>
      <fieldset className="field" aria-label="Режим «кто кому»">
        {MODES.map((m) => (
          <label key={m} className="check">
            <input type="radio" name="settle-mode" value={m} checked={mode === m} onChange={() => setMode(m)} autoFocus={m === mode} />
            <span>
              {MODE_TITLE[m]}
              <span className="hint"> — {MODE_ABOUT[m]}</span>
              {m === current ? <span className="hint"> (сейчас)</span> : null}
            </span>
          </label>
        ))}
      </fieldset>
    </Window>
  )
}

// Окно подтверждения — форма: Enter отправляет, Esc закрывает (экран). Повтор того же (двойное нажатие,
// ещё раз после «нет связи») — тот же номер запроса: сервер запишет одно (Р-13). Отказ сервера — его
// текстом в окне. Удалось — номер забыт
function Window({
  question,
  button,
  busyLabel,
  busy,
  roomId,
  prepare,
  onClose,
  onDone,
  focusButton = true,
  children,
}: {
  question: string
  button: string
  busyLabel: string
  busy: MutableRefObject<boolean>
  roomId: string
  prepare: () => Prepared
  onClose: () => void
  onDone: () => Promise<void>
  focusButton?: boolean
  children: ReactNode
}) {
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy.current) return // синхронный замок: второе нажатие раньше перерисовки
    const p = prepare()
    if (typeof p === 'string') return setError(p)
    const request = requestFor(pending.get(roomId) ?? null, p.form, ulid)
    pending.set(roomId, request)
    busy.current = true
    setSending(true)
    setError('')
    try {
      const res = await p.run(request.requestId)
      if (!res.ok) return setError(res.error)
      pending.delete(roomId)
      busy.current = false
      await onDone()
    } finally {
      busy.current = false
      setSending(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !busy.current && onClose()}>
      <form className="modal form" role="dialog" aria-modal="true" aria-label={question} onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <p className="modal-question">{question}</p>
        {children}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button className="button" type="submit" disabled={sending} autoFocus={focusButton}>
            {sending ? busyLabel : button}
          </button>
          <button className="button secondary" type="button" onClick={onClose} disabled={sending}>
            Отмена
          </button>
        </div>
      </form>
    </div>
  )
}
