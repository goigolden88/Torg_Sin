// Открытая комната с сервера: опрос раз в 5 с, пока экран открыт и вкладка видна (Р-18; WebSocket
// нет). Ответ записывается на устройство поверх своей комнаты; нет связи — показано последнее
// известное. Часы сервера: его now в последнем ответе плюс прошедшее на телефоне (монотонные
// часы, не часы телефона) — по ним отсчёт до закрытия приёма
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchRoom } from '../api'
import { store, withState, type SavedRoom } from '../store/db'
import { usePoll } from './usePoll'

export type Sync = { state: 'busy' } | { state: 'ok' } | { state: 'fail'; text: string }

// now сервера и миг ответа по performance.now() телефона
export type Clock = { server: number; local: number }

// Часы — на комнату, а не на экран: перешёл из комнаты в событие — отсчёт тот же сразу
const clocks = new Map<string, Clock>()

export const OFFLINE_SHOWN = 'Нет связи с сервером — показано последнее известное'

export function useRoom(room: SavedRoom, onUpdate: (room: SavedRoom) => void) {
  const [sync, setSync] = useState<Sync>({ state: 'busy' })
  const [clock, setClock] = useState<Clock | null>(() => clocks.get(room.id) ?? null)
  const latest = useRef(room)
  latest.current = room

  // Показать и записать на устройстве; не записалось — покажем с сервера и в следующий раз
  const save = useCallback(
    (next: SavedRoom) => {
      onUpdate(next)
      void store()
        .saveRoom(next)
        .catch(() => undefined)
    },
    [onUpdate],
  )

  const refresh = useCallback(async () => {
    const r = latest.current
    const res = await fetchRoom(r.server, r.id, r.key)
    if (!res.ok) {
      setSync({ state: 'fail', text: res.offline ? OFFLINE_SHOWN : res.error })
      return
    }
    const next = { server: res.value.now, local: performance.now() }
    clocks.set(r.id, next)
    setClock(next)
    setSync({ state: 'ok' })
    save(withState(latest.current, res.value, Date.now()))
  }, [save])

  usePoll(refresh)

  return { sync, clock, refresh, save, latest }
}

// Время сервера сейчас; ответа ещё не было — часы телефона (ставить без ответа сервера всё равно нельзя)
export function serverTime(clock: Clock | null): number {
  return clock ? clock.server + (performance.now() - clock.local) : Date.now()
}

// Время сервера, пересчитывается раз в секунду — для отсчёта на экране
export function useServerNow(clock: Clock | null, active = true): number {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [active])
  return serverTime(clock)
}
