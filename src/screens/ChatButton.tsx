// «Позвать в чат» (#150): готовое сообщение со ссылкой на экран (текст — chatMessage, src/rules/chat.ts).
// Телефон умеет «Поделиться» — окно телефона (выбрать чат); не умеет — сообщение в буфер обмена,
// «Скопировано», как у ссылки-приглашения (LinkBox). Буфер недоступен — сообщение в поле, выделено:
// скопировать руками. Вышедшим и «выбыл» кнопку не показывают экраны (mayCallChat)
import { useRef, useState } from 'react'
import { chatMessage, screenLink, type ChatNews, type ChatScreen } from '../rules/chat'
import type { SavedRoom } from '../store/db'
import { siteUrl } from './LinkBox'

type Copy = 'idle' | 'copied' | 'failed'

export function ChatButton({ room, screen, news }: { room: SavedRoom; screen: ChatScreen; news: ChatNews }) {
  const [copy, setCopy] = useState<Copy>('idle')
  const field = useRef<HTMLTextAreaElement>(null)
  const text = chatMessage(news, room.currency, screenLink(siteUrl(), room.id, screen))

  async function call() {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: room.name, text })
        return
      } catch (e) {
        // Отменили — ничего; не вышло по другой причине — копируем
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopy('copied')
    } catch {
      setCopy('failed')
      requestAnimationFrame(() => field.current?.select())
    }
  }

  return (
    <div className="chat-call">
      <div className="row">
        <button className="button secondary" type="button" onClick={call}>
          Позвать в чат
        </button>
      </div>
      {copy === 'copied' && <p className="ok">Скопировано — вставьте в чат компании</p>}
      {copy === 'failed' && (
        <>
          <p className="error">Не скопировалось — сообщение выделено, скопируйте его вручную</p>
          <textarea ref={field} className="input textarea" value={text} readOnly rows={3} aria-label="Сообщение в чат" onFocus={(e) => e.target.select()} />
        </>
      )}
    </div>
  )
}
