// «Назад» к списку комнат: на телефоне открытое — отдельный экран; на компьютере список и так
// рядом, кнопку прячет CSS (.back)
import { useEffect } from 'react'

export function BackLink() {
  return (
    <a className="back" href="#/">
      ← Назад
    </a>
  )
}

// Esc на компьютере закрывает открытое (Р-10)
export function useEscape(onEscape: () => void, active = true): void {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onEscape, active])
}
