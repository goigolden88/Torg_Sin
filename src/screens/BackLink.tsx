// «Назад» к списку комнат: на телефоне открытое — отдельный экран; на компьютере список и так
// рядом, кнопку прячет CSS (.back). Из события и нового события — в комнату (href): там «Назад»
// виден на любой ширине (.rooms.wide)
import { useEffect } from 'react'

export function BackLink({ href = '#/' }: { href?: string }) {
  return (
    <a className="back" href={href}>
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
