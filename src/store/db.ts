// Хранилище на устройстве — единственный модуль, который трогает IndexedDB (CLAUDE.md).
// База «torgsin», версия схемы — DB_VERSION; каждая новая версия — шаг в upgrade, старые шаги
// не меняются. Настройки устройства (адрес сервера, пароль компании) — не здесь, а в settings.ts
export const DB_NAME = 'torgsin'
export const DB_VERSION = 1

const ROOMS = 'rooms'

// Своя комната на этом устройстве: ключ телефона и последнее известное с сервера
export type SavedRoom = {
  id: string // номер комнаты
  server: string // адрес сервера комнаты: у комнаты свой, «Настройки» его не меняют
  memberId: string // мой номер участника
  key: string // ключ телефона: Authorization: Bearer <ключ>
  invite: string | null // токен приглашения; есть только у ведущего, создавшего комнату здесь
  name: string
  currency: string
  hostId: string
  createdAt: number // время сервера, UTC, мс
  members: { id: string; name: string }[]
  savedAt: number // когда записано на устройстве — порядок в «Моих комнатах»
  syncedAt: number | null // последний ответ сервера о комнате; null — ещё не было
}

// Шаги схемы: от версии, которая была на устройстве, до DB_VERSION
function upgrade(db: IDBDatabase, from: number): void {
  if (from < 1) db.createObjectStore(ROOMS, { keyPath: 'id' })
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export function openDb(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = (e) => upgrade(request.result, e.oldVersion)
    request.onsuccess = () => {
      const db = request.result
      // Другая вкладка открыла базу новой версии — эту закрываем, чтобы не мешать ей
      db.onversionchange = () => db.close()
      resolve(db)
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('База занята другой вкладкой'))
  })
}

export type Store = {
  listRooms(): Promise<SavedRoom[]>
  getRoom(id: string): Promise<SavedRoom | undefined>
  saveRoom(room: SavedRoom): Promise<void>
  close(): Promise<void>
}

// factory — indexedDB браузера; в тестах — fake-indexeddb
export function createStore(factory: IDBFactory): Store {
  let opened: Promise<IDBDatabase> | null = null
  const db = () => {
    opened ??= openDb(factory).catch((e: unknown) => {
      opened = null // не вышло — в следующий раз попробовать снова
      throw e
    })
    return opened
  }
  const rooms = async (mode: IDBTransactionMode) => (await db()).transaction(ROOMS, mode).objectStore(ROOMS)

  return {
    // Новые сверху
    async listRooms() {
      const all = (await done((await rooms('readonly')).getAll())) as SavedRoom[]
      return all.sort((a, b) => b.savedAt - a.savedAt || (a.id < b.id ? 1 : -1))
    },
    async getRoom(id) {
      return (await done((await rooms('readonly')).get(id))) as SavedRoom | undefined
    },
    // По номеру комнаты: повтор той же комнаты не заводит вторую
    async saveRoom(room) {
      const store = await rooms('readwrite')
      // Записано, когда транзакция завершилась, а не когда принят запрос
      await new Promise<void>((resolve, reject) => {
        store.transaction.oncomplete = () => resolve()
        store.transaction.onerror = () => reject(store.transaction.error)
        store.transaction.onabort = () => reject(store.transaction.error ?? new Error('Запись отменена'))
        store.put(room)
      })
    },
    async close() {
      if (opened) (await opened).close()
      opened = null
    },
  }
}

let shared: Store | null = null

// Хранилище сайта
export function store(): Store {
  shared ??= createStore(indexedDB)
  return shared
}
