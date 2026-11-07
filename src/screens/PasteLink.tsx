// «Вставить ссылку» в «Моих комнатах»: у приложения с экрана «Домой» нет адресной строки, а на
// iPhone у него своё хранилище — комнату из Safari сюда переносят ссылкой. Приглашение ведёт на
// экран входа (#/join/…), ссылка для другого устройства — на её экран (#/device/…); сервер — из
// ссылки (src/rules/link.ts, parsePastedLink). Приглашение в комнату, которой на устройстве нет, —
// с подсказкой: участник, уже вошедший в другом браузере, по нему стал бы вторым с тем же именем
import { useState, type FormEvent } from 'react'
import { parsePastedLink } from '../rules/link'

const NOT_A_LINK = 'Это не ссылка ТоргСина: нужна ссылка-приглашение или ссылка для другого устройства'
const SECOND_MEMBER =
  'Уже вошли в эту комнату в браузере? Тогда нужна не эта ссылка, а „Ссылка для другого устройства“ — иначе появится второй участник с тем же именем'

export function PasteLink({ roomIds }: { roomIds: string[] }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const parsed = parsePastedLink(text)
  const secondMember = parsed?.kind === 'join' && !roomIds.includes(parsed.link.roomId)

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!parsed) return setError(NOT_A_LINK)
    setText('')
    setError('')
    location.hash = parsed.hash
  }

  return (
    <form className="card form paste-link" onSubmit={submit}>
      <label className="field">
        <span>Вставить ссылку</span>
        <input
          className="input"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setError('')
          }}
          placeholder="Ссылка из сообщения"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </label>
      {secondMember && <p className="hint">{SECOND_MEMBER}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="row">
        <button className="button secondary" type="submit">
          Открыть
        </button>
      </div>
    </form>
  )
}
