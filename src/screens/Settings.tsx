// «Настройки»: адрес сервера комнат и проверка связи (Р-02)
import { useState, type FormEvent } from 'react'
import { DEFAULT_SERVER, healthUrl } from '../rules/address'
import { isHealth, PROTOCOL_VERSION } from '../rules/protocol'
import { getServer, setServer } from '../settings'

type Check = { state: 'idle' } | { state: 'busy' } | { state: 'ok'; text: string } | { state: 'fail'; text: string }

export function Settings() {
  const [server, setServerState] = useState(getServer)
  const [draft, setDraft] = useState(server === DEFAULT_SERVER ? '' : server)
  const [error, setError] = useState('')
  const [check, setCheck] = useState<Check>({ state: 'idle' })

  function save(e: FormEvent) {
    e.preventDefault()
    if (!setServer(draft)) {
      setError('Это не адрес сервера. Пример: torg.example.com')
      return
    }
    setError('')
    const next = getServer()
    setServerState(next)
    setDraft(next === DEFAULT_SERVER ? '' : next)
    setCheck({ state: 'idle' })
  }

  async function probe() {
    setCheck({ state: 'busy' })
    try {
      const started = Date.now()
      const r = await fetch(healthUrl(server), { cache: 'no-store' })
      const body: unknown = await r.json()
      if (!isHealth(body)) throw new Error('bad')
      const ms = Date.now() - started
      if (body.v !== PROTOCOL_VERSION) {
        setCheck({ state: 'fail', text: `Сервер на связи, но протокол ${body.v}, а у сайта ${PROTOCOL_VERSION} — обновите страницу` })
      } else {
        setCheck({ state: 'ok', text: `Сервер на связи, ответ за ${ms} мс` })
      }
    } catch {
      setCheck({ state: 'fail', text: 'Сервер не отвечает. Проверьте сеть или адрес' })
    }
  }

  return (
    <div className="screen">
      <h1>Настройки</h1>
      <section className="card">
        <h2>Сервер комнат</h2>
        <p className="hint">Сейчас: {server}</p>
        <form className="row" onSubmit={save}>
          <input
            className="input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Свой адрес — пусто: по умолчанию"
            inputMode="url"
            autoComplete="off"
            aria-label="Адрес сервера"
          />
          <button className="button" type="submit">
            Сохранить
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="button secondary" type="button" onClick={probe} disabled={check.state === 'busy'}>
            {check.state === 'busy' ? 'Проверяю…' : 'Проверить связь'}
          </button>
        </div>
        {check.state === 'ok' && <p className="ok">{check.text}</p>}
        {check.state === 'fail' && <p className="error">{check.text}</p>}
      </section>
      <p className="hint">Версия {__APP_VERSION__}</p>
    </div>
  )
}
