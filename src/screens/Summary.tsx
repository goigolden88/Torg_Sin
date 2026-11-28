// «Сводка» (Р-50, #168) — над «Моими комнатами»: баланс по всем комнатам, «Ждут вас» — дела с кнопкой и
// сроком, «Скоро закроется» — споры с вашей ставкой, где приём кончается в ближайшие сутки. Всё — по
// копиям комнат на устройстве (summaryParts), без запроса к серверу; разовая проверка копий старше 5 минут
// — у «Моих комнат» (useSavedRooms). Кнопка дела ведёт на экран спора или «Расчёт»: действий с
// подтверждением прямо в карточке нет
import type { SavedRoom } from '../store/db'
import { balanceTotals, closingSoon, deadlineText, freshLine, KIND_LABEL, SOON_LABEL, summaryTasks, tasksCountText, type Task } from './summaryParts'

export function Summary({ rooms, now }: { rooms: SavedRoom[]; now: number }) {
  const tasks = summaryTasks(rooms, now)
  const soon = closingSoon(rooms, now)
  const totals = balanceTotals(rooms)
  return (
    <section className="summary" aria-label="Сводка">
      <div className="summary-head">
        <h1>Сводка</h1>
        <span className="fresh">{freshLine(rooms, now)}</span>
      </div>
      {totals.length > 0 && (
        <div className="card summary-balance">
          <span className="hint">Всего по комнатам</span>
          {totals.map((t) => (
            <div key={t.currency} className="summary-total">
              <b className={t.amount > 0 ? 'win' : t.amount < 0 ? 'loss' : ''}>{t.text}</b>
              <span className="hint">
                {t.basis}: {t.rooms.map((r) => r.text).join(', ')}
              </span>
            </div>
          ))}
        </div>
      )}
      <h2>{tasksCountText(tasks.length)}</h2>
      {tasks.length > 0 && (
        <ul className="summary-grid">
          {tasks.map((t) => (
            <li key={t.roomId + '/' + t.kind + '/' + t.id + '/' + t.action}>
              <TaskCard task={t} now={now} />
            </li>
          ))}
        </ul>
      )}
      {soon.length > 0 && (
        <>
          <h2>Скоро закроется</h2>
          <ul className="summary-grid">
            {soon.map((s) => (
              <li key={s.roomId + '/' + s.kind + '/' + s.id}>
                <a className="card summary-soon" href={s.href}>
                  <span className="summary-meta">
                    <span>
                      {s.roomName} · {SOON_LABEL[s.kind]}
                    </span>
                    <span className="pill warn">{deadlineText(s.closesAt, now)}</span>
                  </span>
                  <b className="summary-title">{s.title}</b>
                  <span className="hint">{s.mine}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

// Карточка дела: комната и вид, срок, о чём и что ждёт, кнопка — на экран. Срок по копии прошёл —
// приглушена: дело могло уже решиться
function TaskCard({ task, now }: { task: Task; now: number }) {
  const due = deadlineText(task.deadline, now)
  return (
    <article className={'card summary-task' + (task.overdue ? ' overdue' : '')}>
      <span className="summary-meta">
        <span>
          {task.roomName} · {KIND_LABEL[task.kind]}
        </span>
        {due && <span className={'pill' + (task.overdue ? '' : ' warn')}>{due}</span>}
      </span>
      <p>
        <b className="summary-title">{task.title}</b> — {task.text}
      </p>
      <a className="button" href={task.href}>
        {task.action}
      </a>
    </article>
  )
}
