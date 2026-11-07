// Заметка в комнате — только на iPhone в браузере (не с экрана «Домой»): приложение с экрана
// «Домой» хранит данные отдельно от Safari, комнаты там не будет. Кнопка создаёт ссылку для
// другого устройства себе (как «Ссылка для другого устройства» в комнате) и копирует её — её
// вставляют в приложении: «Мои комнаты» → «Вставить ссылку». Закрыли — не показывается больше
// на этом устройстве ни в одной комнате (settings.ts)
import { useState } from 'react'
import { issueDeviceLink } from '../api'
import { formatDateTime } from '../rules/date'
import { deviceLink } from '../rules/link'
import { getHomeNoteClosed, setHomeNoteClosed } from '../settings'
import type { SavedRoom } from '../store/db'
import { LinkBox, siteUrl } from './LinkBox'

type State =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; link: string; expiresAt: number; copied: boolean }
  | { kind: 'failed'; text: string }

type Issued = { ok: true; link: string; expiresAt: number } | { ok: false; error: string }

// iPhone, и сайт открыт в браузере, а не приложением с экрана «Домой»
export function iphoneBrowserTab(): boolean {
  if (!/iPhone|iPod/.test(navigator.userAgent)) return false
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches
  return !standalone
}

export function HomeScreenNote({ room }: { room: SavedRoom }) {
  const [shown, setShown] = useState(() => iphoneBrowserTab() && !getHomeNoteClosed())
  const [state, setState] = useState<State>({ kind: 'idle' })
  if (!shown) return null

  function close() {
    setHomeNoteClosed()
    setShown(false)
  }

  async function copyForApp() {
    setState({ kind: 'busy' })
    const issued: Promise<Issued> = issueDeviceLink(room.server, room.id, room.key, {}).then((res) =>
      res.ok
        ? { ok: true, link: deviceLink(siteUrl(), { roomId: room.id, token: res.value.token, server: room.server }), expiresAt: res.value.expiresAt }
        : { ok: false, error: res.error },
    )
    // Safari пускает в буфер обмена только сразу по нажатию, а ссылку ещё спрашиваем у сервера:
    // запись начинается сейчас и ждёт ссылку (ClipboardItem с обещанием). Где так нельзя —
    // обычное копирование, когда ссылка уже есть; не вышло и оно — ссылка на экране, руками
    const early =
      typeof ClipboardItem === 'function' && typeof navigator.clipboard?.write === 'function'
        ? navigator.clipboard
            .write([
              new ClipboardItem({
                'text/plain': issued.then((r) => {
                  if (!r.ok) throw new Error(r.error)
                  return new Blob([r.link], { type: 'text/plain' })
                }),
              }),
            ])
            .then(
              () => true,
              () => false,
            )
        : Promise.resolve(false)
    const result = await issued
    let copied = await early
    if (!result.ok) return setState({ kind: 'failed', text: result.error })
    if (!copied) {
      copied = await (navigator.clipboard?.writeText(result.link) ?? Promise.reject()).then(
        () => true,
        () => false,
      )
    }
    setState({ kind: 'done', link: result.link, expiresAt: result.expiresAt, copied })
  }

  return (
    <div className="panel home-note" role="region" aria-label="Экран «Домой»">
      <p>
        Поставите ТоргСин на экран „Домой“ — там комнаты не будет: iPhone хранит её отдельно. Скопируйте ссылку для другого устройства и
        вставьте её в приложении: „Мои комнаты“ → „Вставить ссылку“
      </p>
      {state.kind === 'done' && (
        <>
          <p className={state.copied ? 'ok' : 'hint'}>
            {state.copied ? 'Ссылка скопирована' : 'Ссылка готова — скопируйте её кнопкой ниже'} — сработает один раз, до{' '}
            {formatDateTime(state.expiresAt)}. Откройте ТоргСин с экрана „Домой“ и вставьте её в „Мои комнаты“ → „Вставить ссылку“.
          </p>
          <LinkBox link={state.link} label="Ссылка для приложения" title={room.name} text={`Комната «${room.name}» в ТоргСине`} />
        </>
      )}
      {state.kind === 'failed' && <p className="error">{state.text}</p>}
      <div className="row">
        {state.kind !== 'done' && (
          <button className="button" type="button" onClick={copyForApp} disabled={state.kind === 'busy'}>
            {state.kind === 'busy' ? 'Получаю…' : 'Скопировать ссылку для приложения'}
          </button>
        )}
        <button className="button secondary" type="button" onClick={close}>
          Закрыть
        </button>
      </div>
    </div>
  )
}
