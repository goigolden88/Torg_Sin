// Ссылка на экране: поле, «Скопировать» и «Поделиться» (где телефон умеет). Буфер обмена
// недоступен — ссылка выделяется, чтобы скопировать руками
import { useRef, useState } from 'react'

type Copy = 'idle' | 'copied' | 'failed'

// Адрес сайта с base сборки — основа ссылок на комнату
export function siteUrl(): string {
  return new URL(import.meta.env.BASE_URL, location.href).href
}

export function LinkBox({ link, label, title, text }: { link: string; label: string; title: string; text: string }) {
  const [copy, setCopy] = useState<Copy>('idle')
  const field = useRef<HTMLInputElement>(null)
  const canShare = typeof navigator.share === 'function'

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setCopy('copied')
    } catch {
      field.current?.select()
      setCopy('failed')
    }
  }

  async function share() {
    try {
      await navigator.share({ title, text, url: link })
    } catch {
      // Отменили или не вышло — ссылка остаётся на экране
    }
  }

  return (
    <>
      <input ref={field} className="input link" value={link} readOnly onFocus={(e) => e.target.select()} aria-label={label} />
      <div className="row">
        <button className="button" type="button" onClick={copyLink}>
          Скопировать
        </button>
        {canShare && (
          <button className="button secondary" type="button" onClick={share}>
            Поделиться
          </button>
        )}
      </div>
      {copy === 'copied' && <p className="ok">Ссылка скопирована</p>}
      {copy === 'failed' && <p className="error">Не скопировалось — ссылка выделена, скопируйте её вручную</p>}
    </>
  )
}
