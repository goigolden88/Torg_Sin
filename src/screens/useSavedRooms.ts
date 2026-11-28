// Комнаты на устройстве — одним списком для меню и «Моих комнат» (#167): оба показывают одни и те же
// записи (store), обновлённая на экране комнаты сразу видна и в меню. Список читается при запуске и
// при каждом входе в «Мои комнаты» (reloadKey); копии старше 5 минут (или без ответа сервера) тогда
// один раз спрашиваются у сервера — «вы в суде» и баланс по свежему ответу, без пушей
import { useCallback, useEffect, useState } from 'react'
import { fetchRoom } from '../api'
import { store, withState, type SavedRoom } from '../store/db'

const STORE_FAILED = 'Не открылось хранилище на этом устройстве — комнаты не сохранятся. Частный режим браузера?'

export type SavedRooms = {
  rooms: SavedRoom[] | null // null — ещё читается
  storeError: string
  upsert: (room: SavedRoom) => void // новая комната — сверху, обновлённая — на своём месте
  remove: (id: string) => void // вышел из комнаты (Р-40): запись на устройстве уже убрана
}

export function useSavedRooms(reloadKey: string): SavedRooms {
  const [rooms, setRooms] = useState<SavedRoom[] | null>(null)
  const [storeError, setStoreError] = useState('')

  const upsert = useCallback((room: SavedRoom) => {
    setRooms((prev) => {
      const list = prev ?? []
      return list.some((r) => r.id === room.id) ? list.map((r) => (r.id === room.id ? room : r)) : [room, ...list]
    })
  }, [])

  const remove = useCallback((id: string) => {
    setRooms((prev) => (prev ?? []).filter((r) => r.id !== id))
  }, [])

  useEffect(() => {
    let live = true
    store()
      .listRooms()
      .then(
        (list) => {
          if (!live) return
          setRooms(list)
          setStoreError('')
          refreshStale(list, upsert)
        },
        () => {
          if (!live) return
          setRooms([])
          setStoreError(STORE_FAILED)
        },
      )
    return () => {
      live = false
    }
  }, [reloadKey, upsert])

  return { rooms, storeError, upsert, remove }
}

const STALE = 5 * 60 * 1000

// Не вышло (нет связи, нет доступа) — остаётся копия
function refreshStale(rooms: readonly SavedRoom[], onUpdate: (room: SavedRoom) => void): void {
  const now = Date.now()
  for (const room of rooms) {
    if (room.syncedAt !== null && now - room.syncedAt <= STALE) continue
    void fetchRoom(room.server, room.id, room.key).then(async (res) => {
      if (!res.ok) return
      // Пока шёл запрос, комнату могли открыть — ответ ложится поверх записи на устройстве, как у опроса
      const saved = (await store().getRoom(room.id).catch(() => undefined)) ?? room
      const next = withState(saved, res.value, Date.now())
      onUpdate(next)
      await store()
        .saveRoom(next)
        .catch(() => undefined)
    })
  }
}
