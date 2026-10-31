import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { createStore, DB_NAME, DB_VERSION, openDb, type SavedRoom } from './db'

function room(id: string, savedAt: number, extra: Partial<SavedRoom> = {}): SavedRoom {
  return {
    id,
    server: 'https://torg-sin.goigolden88.workers.dev',
    memberId: 'M' + id,
    key: 'ключ-' + id,
    invite: 'приглашение-' + id,
    name: 'Комната ' + id,
    currency: 'RUB',
    hostId: 'M' + id,
    createdAt: 1,
    members: [{ id: 'M' + id, name: 'Аня' }],
    savedAt,
    syncedAt: null,
    ...extra,
  }
}

describe('хранилище на устройстве', () => {
  it('пустое — комнат нет', async () => {
    const store = createStore(new IDBFactory())
    expect(await store.listRooms()).toEqual([])
    expect(await store.getRoom('A')).toBeUndefined()
  })

  it('комнаты и ключ на месте после перезапуска (новое открытие той же базы)', async () => {
    const factory = new IDBFactory()
    const first = createStore(factory)
    await first.saveRoom(room('A', 1))
    await first.saveRoom(room('B', 2))
    await first.close()

    const again = createStore(factory)
    const list = await again.listRooms()
    expect(list.map((r) => r.id)).toEqual(['B', 'A']) // новые сверху
    expect((await again.getRoom('A'))?.key).toBe('ключ-A')
  })

  it('та же комната дважды — одна запись, последняя', async () => {
    const store = createStore(new IDBFactory())
    await Promise.all([store.saveRoom(room('A', 1)), store.saveRoom(room('A', 1, { name: 'Дача' }))])
    const list = await store.listRooms()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Дача')
  })

  it('схема версии 1: база заводится с первого открытия', async () => {
    const factory = new IDBFactory()
    const db = await openDb(factory)
    expect(db.name).toBe(DB_NAME)
    expect(db.version).toBe(DB_VERSION)
    expect([...db.objectStoreNames]).toEqual(['rooms'])
    db.close()
  })
})
