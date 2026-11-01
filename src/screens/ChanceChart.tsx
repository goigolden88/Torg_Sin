// График «вероятность по ставкам во времени» на экране события (как у Polymarket): по горизонтали —
// от заведения события до сейчас (по часам сервера) или до закрытия приёма, по вертикали 0–100 %,
// ломаная на каждый исход своим цветом (--series-N в styles.css), точка на каждую ставку. Точки —
// chanceHistory из pool.ts, здесь не считаем заново. Подпись ставки — под графиком: по нажатию на
// телефоне, по наведению на компьютере, стрелками с клавиатуры; выбирается ближайшая по времени
// ставка. Новые ставки приходят опросом экрана (useRoom) — график перерисовывается сам.
// Рисунок — свой SVG (Р-12): в рамке 0…100 растягивается по ширине контейнера, толщина линий и
// точек — в пикселях экрана (vector-effect), подписи осей — обычным текстом поверх, в процентах
import { useState, type KeyboardEvent, type PointerEvent } from 'react'
import { formatDateTime } from '../rules/date'
import { chanceHistory, chancePercents, formatChance } from '../rules/pool'
import type { EventView } from '../rules/protocol'
import type { SavedRoom } from '../store/db'
import { money, nameOf } from './eventParts'

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE
const Y_TICKS = [100, 75, 50, 25, 0] // сетка; подписаны 0, 50 и 100 %

export function ChanceChart({ room, event, now }: { room: SavedRoom; event: EventView; now: number }) {
  const [picked, setPicked] = useState<number | null>(null)
  const ids = event.outcomes.map((o) => o.id)
  const points = chanceHistory(ids, event.bets)

  if (points.length < 2) {
    return (
      <section aria-label="Вероятность по ставкам">
        <h3>Вероятность по ставкам</h3>
        <p className="hint">График появится после второй ставки.</p>
      </section>
    )
  }

  // Ось времени: от заведения события до сейчас или до закрытия приёма (отменено — до отмены);
  // часы телефона и сервера могут разойтись — последняя ставка всегда внутри
  const last = points[points.length - 1]
  const stop = Math.min(event.cancelled?.at ?? Infinity, event.closesAt, now)
  const start = Math.min(event.at, points[0].at)
  const end = Math.max(stop, last.at)
  const span = Math.max(end - start, 1)
  const x = (at: number) => ((at - start) / span) * 100
  const y = (chance: number) => 100 - chance * 100

  const selected = picked !== null && picked < points.length ? picked : null
  const bet = selected !== null ? event.bets[selected] : null
  const title = (id: string) => event.outcomes.find((o) => o.id === id)?.title ?? id
  // Подписи процентов точки — на весь набор исходов (в сумме 100); высота линий — по сырым долям
  const labels = (p: (typeof points)[number]) => {
    const shares = ids.map((id) => p.chances[id] ?? 0)
    const pct = chancePercents(shares)
    return shares.map((s, i) => formatChance(s, pct[i]))
  }
  const lastLabels = labels(last)
  const pickedLabels = selected !== null ? labels(points[selected]) : null

  // Ближайшая по времени ставка к точке касания
  function nearest(e: { currentTarget: HTMLDivElement; clientX: number }): number {
    const box = e.currentTarget.getBoundingClientRect()
    const at = start + ((e.clientX - box.left) / Math.max(box.width, 1)) * span
    let best = 0
    points.forEach((p, i) => {
      if (Math.abs(p.at - at) < Math.abs(points[best].at - at)) best = i
    })
    return best
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const from = selected ?? (step > 0 ? -1 : points.length)
    setPicked(Math.min(points.length - 1, Math.max(0, from + step)))
  }

  return (
    <section aria-label="Вероятность по ставкам" className="chart">
      <h3>Вероятность по ставкам</h3>
      <ul className="chart-legend">
        {event.outcomes.map((o, i) => (
          <li key={o.id} className={`chart-key series-${i + 1}`}>
            <span className="chart-swatch" aria-hidden="true" />
            <span className="chart-key-title">{o.title}</span>
            <span className="chart-key-chance">{lastLabels[i]}</span>
          </li>
        ))}
      </ul>

      <div className="chart-frame">
        <div className="chart-y" aria-hidden="true">
          {[100, 50, 0].map((t) => (
            <span key={t} style={{ top: `${y(t / 100)}%` }}>
              {t} %
            </span>
          ))}
        </div>
        <div
          className="chart-plot"
          tabIndex={0}
          role="group"
          aria-label="График: нажмите на точку — кто, на что и сколько поставил; стрелки — от ставки к ставке"
          onClick={(e) => setPicked(nearest(e))}
          onPointerMove={(e: PointerEvent<HTMLDivElement>) => {
            if (e.pointerType === 'mouse') setPicked(nearest(e))
          }}
          onKeyDown={onKey}
        >
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {Y_TICKS.map((t) => (
              <line key={t} className={t === 0 ? 'chart-base' : 'chart-grid'} x1="0" x2="100" y1={y(t / 100)} y2={y(t / 100)} vectorEffect="non-scaling-stroke" />
            ))}
            {selected !== null && (
              <line className="chart-guide" x1={x(points[selected].at)} x2={x(points[selected].at)} y1="0" y2="100" vectorEffect="non-scaling-stroke" />
            )}
            {event.outcomes.map((o, i) => {
              const line = points.map((p) => `${x(p.at)},${y(p.chances[o.id] ?? 0)}`)
              line.push(`${x(end)},${y(last.chances[o.id] ?? 0)}`) // нынешняя вероятность — до конца оси
              // Точка — отрезок нулевой длины с круглым концом: круглая при любом растяжении рамки
              const dots = points.map((p) => `M${x(p.at)} ${y(p.chances[o.id] ?? 0)}h0.001`).join('')
              const at = selected !== null ? points[selected] : null
              return (
                <g key={o.id} className={`series-${i + 1}`}>
                  <polyline className="chart-line" points={line.join(' ')} vectorEffect="non-scaling-stroke" />
                  <path className="chart-dots" d={dots} vectorEffect="non-scaling-stroke" />
                  {at && <path className="chart-dot-on" d={`M${x(at.at)} ${y(at.chances[o.id] ?? 0)}h0.001`} vectorEffect="non-scaling-stroke" />}
                </g>
              )
            })}
          </svg>
        </div>
        <div className="chart-x" aria-hidden="true">
          <span>{axisTime(start, span)}</span>
          <span>{axisTime(end, span)}</span>
        </div>
      </div>

      <div className="chart-tip" aria-live="polite">
        {bet && selected !== null ? (
          <>
            <p className="chart-tip-head">
              {formatDateTime(bet.at)} · {nameOf(room, bet.memberId)}
              {bet.memberId === room.memberId ? ' (вы)' : ''}: {money(bet.amount, room.currency)} на „{title(bet.outcome)}“
            </p>
            <p className="hint">После этой ставки:</p>
            <ul className="chart-tip-list">
              {event.outcomes.map((o, i) => (
                <li key={o.id} className={`chart-key series-${i + 1}`}>
                  <span className="chart-swatch" aria-hidden="true" />
                  <span className="chart-key-title">{o.title}</span>
                  <span className="chart-key-chance">{pickedLabels?.[i]}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="hint">Нажмите на точку графика — кто, на что и сколько поставил и какие стали вероятности.</p>
        )}
      </div>
    </section>
  )
}

// Подпись оси времени: в пределах пары минут — с секундами, в пределах суток — часы и минуты,
// дольше — ещё и день
function axisTime(ms: number, span: number): string {
  const d = new Date(ms)
  if (span < 2 * MINUTE) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  if (span < DAY) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
