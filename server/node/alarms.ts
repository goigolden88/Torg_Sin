// Расписание будильников комнат запасной обёртки. Будильник лежит в файле SQLite (sqlite.ts),
// таймер в памяти — только напоминание: сервер лежал в момент срока — при подъёме все
// просроченные будильники срабатывают сразу (02-Архитектура, «Крайние случаи»)
import type { Alarm } from './sqlite'

// setTimeout дольше ~24,8 суток не умеет: длинный срок ждём частями
const MAX_DELAY = 2 ** 31 - 1
// Обработчик упал — повтор через минуту; будильник в файле остаётся до успеха
export const RETRY_DELAY = 60_000

export type AlarmsOptions = {
  now: () => number // время сервера, UTC, мс
  ring: (alarm: Alarm) => Promise<void> // сработать: обработчик комнаты и снять будильник
  onError: (alarm: Alarm, error: unknown) => void
}

export class Alarms {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private stopped = false

  constructor(private readonly options: AlarmsOptions) {}

  // Поставить или заменить будильник комнаты
  set(alarm: Alarm): void {
    this.schedule(alarm, alarm.at - this.options.now())
  }

  private schedule(alarm: Alarm, delay: number): void {
    if (this.stopped) return
    const old = this.timers.get(alarm.roomId)
    if (old) clearTimeout(old)
    const timer = setTimeout(() => {
      if (this.timers.get(alarm.roomId) === timer) this.timers.delete(alarm.roomId)
      if (this.options.now() < alarm.at) return this.set(alarm) // длинный срок — ждём дальше
      this.options.ring(alarm).catch((error: unknown) => {
        this.options.onError(alarm, error)
        // Пока обработчик работал, комната могла поставить новый будильник — его не трогаем
        if (!this.timers.has(alarm.roomId)) this.schedule(alarm, RETRY_DELAY)
      })
    }, Math.min(MAX_DELAY, Math.max(0, delay)))
    this.timers.set(alarm.roomId, timer)
  }

  stop(): void {
    this.stopped = true
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
  }
}
