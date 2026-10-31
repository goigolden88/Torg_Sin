// Те же тесты комнат, что на Cloudflare-подделке (server/src/rooms.test.ts), — на запасной
// обёртке: настоящий веб-сервер Node и файл SQLite (Р-02)
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll } from 'vitest'
import type { RoomStorage } from '../src/room'
import { roomsSuite } from '../src/rooms.suite'
import { START_TIME, type TestServer } from '../src/testing'
import { startServer } from './app'

const dir = mkdtempSync(join(tmpdir(), 'torgsin-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
let files = 0

// Хранилище, которое помнит ключи всех записей (проверка «журнал только дописывается»)
function recording(storage: RoomStorage, puts: string[]): RoomStorage {
  return {
    get: (key) => storage.get(key),
    put: (key, value) => {
      puts.push(key)
      return storage.put(key, value)
    },
    list: (options) => storage.list(options),
    setAlarm: (time) => storage.setAlarm(time),
  }
}

async function sqliteServer(password: string | undefined): Promise<TestServer> {
  const file = join(dir, `rooms-${++files}.sqlite`)
  const clock = { now: START_TIME }
  const puts = new Map<string, string[]>()
  const putsOf = (roomId: string) => {
    let p = puts.get(roomId)
    if (!p) puts.set(roomId, (p = []))
    return p
  }
  const server = await startServer({
    file,
    password,
    port: 0,
    host: '127.0.0.1',
    now: () => clock.now,
    wrapStorage: (roomId, storage) => recording(storage, putsOf(roomId)),
  })
  return {
    send: (path, init) => fetch(server.url + path, init),
    roomIds: () => server.rooms.roomIds(),
    storage: server.storage,
    puts: putsOf,
    clock,
    close: server.close,
  }
}

roomsSuite('SQLite (Node)', (password) => sqliteServer(password))
