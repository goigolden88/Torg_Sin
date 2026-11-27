// «Выбор» в комнате — под «Лотами» (этап 7, Р-39): идущие — «Предлагают варианты» и «Идут вклады» (с ними и
// «ждёт жребия»), ближний срок сверху, с отсчётом; прошедшее — решённые и не состоявшиеся — в «Истории»
// (historyParts), не здесь; пусто — «Выборов пока нет», всё прошло — «Идущих выборов нет». У каждого — вопрос,
// получатель, сколько вариантов, строка статуса; вложил — «вы вложили … в „…“». Выборы — последнее известное
// с сервера, статус и отсчёт — по времени сервера (choiceOutcome). На экране выбора — тот же список рядом,
// открытый отмечен. Помеченному «выбыл» (Р-41) и в закрытой комнате (Р-43) «Начать выбор» нет
import type { ChoiceView } from '../rules/protocol'
import { plural } from '../rules/currency'
import { savedChoices, type SavedRoom } from '../store/db'
import { choiceHref, choiceOutcomeOf, choicePastNow, choiceStatusText, myOption, myStake, newChoiceHref, optionTitle, recipientLine } from './choiceParts'
import { money } from './eventParts'
import { mayStartNew } from './memberParts'
import { useServerNow, type Clock } from './useRoom'

export function ChoiceList({ room, clock, current }: { room: SavedRoom; clock: Clock | null; current?: string }) {
  const choices = savedChoices(room)
  const now = useServerNow(clock, choices.length > 0)
  const going = choices.filter((c) => choicePastNow(c, now) === null)
  const options = going.filter((c) => choiceOutcomeOf(c, now).status === 'options').sort((a, b) => a.optionsUntil - b.optionsUntil)
  const stakes = going.filter((c) => choiceOutcomeOf(c, now).status !== 'options').sort((a, b) => choiceOutcomeOf(a, now).endsAt - choiceOutcomeOf(b, now).endsAt)

  return (
    <section className="events choices" aria-label="Выбор">
      <div className="events-head">
        <h3>Выбор</h3>
        {mayStartNew(room) && (
          <a className="button" href={newChoiceHref(room.id)}>
            Начать выбор
          </a>
        )}
      </div>
      {options.length + stakes.length === 0 ? (
        <p className="empty">{choices.length === 0 ? 'Выборов пока нет' : 'Идущих выборов нет'}</p>
      ) : (
        <>
          {options.length > 0 && <Group title="Предлагают варианты" room={room} choices={options} now={now} current={current} />}
          {stakes.length > 0 && <Group title="Идут вклады" room={room} choices={stakes} now={now} current={current} />}
        </>
      )}
    </section>
  )
}

function Group({ title, room, choices, now, current }: { title: string; room: SavedRoom; choices: ChoiceView[]; now: number; current?: string }) {
  return (
    <>
      <h4 className="events-group">{title}</h4>
      <ul className="event-list">
        {choices.map((c) => {
          const mine = myOption(c, room.memberId)
          const n = c.options.length
          return (
            <li key={c.id}>
              <a className="event-item" href={choiceHref(room.id, c.id)} aria-current={c.id === current ? 'page' : undefined}>
                <span className="event-name">{c.question}</span>
                <span className="hint">
                  получатель — {recipientLine(room, c)} · {n} {plural(BigInt(n), ['вариант', 'варианта', 'вариантов'])}
                </span>
                <ChoiceStatusLine choice={c} now={now} />
                {mine !== null && (
                  <span className="hint">
                    вы вложили {money(myStake(c, room.memberId), room.currency)} в {optionTitle(c, mine)}
                  </span>
                )}
              </a>
            </li>
          )
        })}
      </ul>
    </>
  )
}

// Строка статуса выбора на время сервера (choiceStatusText): фазы закрываются в срок и между опросами
export function ChoiceStatusLine({ choice, now }: { choice: ChoiceView; now: number }) {
  const s = choiceStatusText(choice, now)
  return <span className={'status ' + s.tone}>{s.text}</span>
}
