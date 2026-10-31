// Опрос сервера, пока экран открыт: сразу и дальше раз в every мс (WebSocket — с этапа 2).
// Вкладка скрыта — не спрашиваем; вернулись — спрашиваем сразу. Следующий опрос — только после
// ответа на прошлый: медленная сеть не копит запросы
import { useEffect } from 'react'

export const POLL_MS = 5000

export function usePoll(tick: () => Promise<void>, every = POLL_MS, active = true): void {
  useEffect(() => {
    if (!active) return
    let alive = true
    let running = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const run = async () => {
      clearTimeout(timer)
      if (!alive || running) return
      if (document.visibilityState === 'visible') {
        running = true
        await tick().catch(() => undefined)
        running = false
      }
      if (alive) timer = setTimeout(run, every)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void run()
    }

    void run()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [tick, every, active])
}
