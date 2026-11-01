// Хранилище на устройстве — единственный модуль, который трогает IndexedDB (CLAUDE.md).
// База «torgsin», версия схемы — DB_VERSION; каждая новая версия — шаг в upgrade, старые шаги
// не меняются. Настройки устройства (адрес сервера, пароль компании) — не здесь, а в settings.ts
import type { EventView, RoomStateResponse } from '../rules/protocol'

export const DB_NAME = 'torgsin'
export const DB_VERSION = 2

const ROOMS = 'rooms'
const JOINS = 'joins' // с версии 2

// Своя комната на этом устройстве: ключ телефона и последнее известное с сервера
export type SavedRoom = {
  id: string // номер комнаты
  server: string // адрес сервера комнаты: у комнаты свой, «Настройки» его не меняют
  memberId: string // мой номер участника
  key: string // ключ телефона: Authorization: Bearer <ключ>
  invite: string | null // токен приглашения; есть только у ведущего — создал комнату здесь или сменил ссылку
  name: string
  currency: string
  hostId: string
  createdAt: number // время сервера, UTC, мс
  members: { id: string; name: string }[]
  savedAt: number // когда записано на устройстве — порядок в «Моих комнатах»
  syncedAt: number | null // последний ответ сервера о комнате; null — ещё не было
  // События-пул — последнее известное с сервера (Р-18). Поле только добавлено, версия базы та же:
  // у записей до него поля нет — «событий нет» до первого ответа сервера
  events?: EventView[]
}

// События комнаты на устройстве: старая запись без поля — пусто
export function savedEvents(room: SavedRoom): EventView[] {
  return room.events ?? []
}

// Ответ сервера о комнате поверх записанного на устройстве; syncedAt — сейчас
export function withState(room: SavedRoom, state: RoomStateResponse, now: number): SavedRoom {
  const { room: s, members, events } = state
  return { ...room, name: s.name, currency: s.currency, hostId: s.hostId, createdAt: s.createdAt, members, events, syncedAt: now }
}

// Заявка на вход по ссылке, которую ещё не впустили: ключ заявки откроет комнату, когда ведущий
// впустит. Впустили — заявка становится комнатой (SavedRoom) и отсюда убирается
export type SavedJoin = {
  roomId: string // номер комнаты
  server: string // адрес сервера комнаты — из ссылки; «Настройки» его не меняют
  invite: string // токен ссылки, по которой подана заявка
  name: string // моё имя в заявке
  memberId: string // номер заявки — он же мой номер участника, когда впустят
  key: string // ключ заявки: Authorization: Bearer <ключ>
  roomName: string // что показала ссылка: название комнаты и имя ведущего
  hostName: string
  status: 'waiting' | 'rejected'
  savedAt: number
}

// Шаги схемы: от версии, которая была на устройстве, до DB_VERSION. Шаг только добавляет:
// записи прежних версий остаются как есть
function upgrade(db: IDBDatabase, from: number): void {
  if (from < 1) db.createObjectStore(ROOMS, { keyPath: 'id' })
  if (from < 2) db.createObjectStore(JOINS, { keyPath: 'roomId' })
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
  getJoin(roomId: string): Promise<SavedJoin | undefined>
  saveJoin(join: SavedJoin): Promise<void>
  // Впустили: комната записана, заявка убрана — одной транзакцией
  admitJoin(room: SavedRoom): Promise<void>
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
  // Запись: готово, когда транзакция завершилась, а не когда принят запрос
  const write = async (names: string[], run: (tx: IDBTransaction) => void) => {
    const tx = (await db()).transaction(names, 'readwrite')
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('Запись отменена'))
      run(tx)
    })
  }

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
      await write([ROOMS], (tx) => tx.objectStore(ROOMS).put(room))
    },
    async getJoin(roomId) {
      return (await done((await db()).transaction(JOINS, 'readonly').objectStore(JOINS).get(roomId))) as SavedJoin | undefined
    },
    async saveJoin(join) {
      await write([JOINS], (tx) => tx.objectStore(JOINS).put(join))
    },
    async admitJoin(room) {
      await write([ROOMS, JOINS], (tx) => {
        tx.objectStore(ROOMS).put(room)
        tx.objectStore(JOINS).delete(room.id)
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
