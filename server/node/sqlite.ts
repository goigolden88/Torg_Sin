// Хранилище комнат запасной обёртки (Р-02): один файл SQLite на все комнаты, встроенный
// node:sqlite. Каждой комнате — свой RoomStorage, как объекту Room на Cloudflare.
//
// Таблицы:
//   entries (room, key, value) — то, что комната кладёт в хранилище; значение — JSON
//   alarms  (room, at)         — будильник комнаты (один на комнату, как у Cloudflare), UTC, мс
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { RoomStorage } from '../src/room'

// Версия схемы файла (PRAGMA user_version); правка схемы — новая версия и шаг миграции в open()
const SCHEMA_VERSION = 1

export type Alarm = { roomId: string; at: number }

export class SqliteRooms {
  private readonly db: DatabaseSync
  // Будильник поставлен — сообщить расписанию (alarms.ts)
  onAlarmSet: (alarm: Alarm) => void = () => {}

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true })
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA busy_timeout = 5000')
    this.migrate()
  }

  private migrate(): void {
    const version = (this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
    if (version > SCHEMA_VERSION) {
      throw new Error(`Файл комнат новее этого сервера (схема ${version}, сервер знает ${SCHEMA_VERSION}) — обновите сервер`)
    }
    if (version < 1) {
      this.db.exec(`
        BEGIN;
        CREATE TABLE IF NOT EXISTS entries (
          room TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
          PRIMARY KEY (room, key)
        ) WITHOUT ROWID;
        CREATE TABLE IF NOT EXISTS alarms (room TEXT NOT NULL PRIMARY KEY, at INTEGER NOT NULL) WITHOUT ROWID;
        PRAGMA user_version = 1;
        COMMIT;
      `)
    }
  }

  // Хранилище комнаты по номеру
  storage(roomId: string): RoomStorage {
    const db = this.db
    const rooms = this
    return {
      async get<T>(key: string): Promise<T | undefined> {
        const row = db.prepare('SELECT value FROM entries WHERE room = ? AND key = ?').get(roomId, key) as { value: string } | undefined
        return row === undefined ? undefined : (JSON.parse(row.value) as T)
      },
      async put<T>(key: string, value: T): Promise<void> {
        const json = JSON.stringify(value)
        if (json === undefined) throw new Error('Хранилище комнаты: значение не записывается в JSON')
        db.prepare('INSERT INTO entries (room, key, value) VALUES (?, ?, ?) ON CONFLICT (room, key) DO UPDATE SET value = excluded.value').run(
          roomId,
          key,
          json,
        )
      },
      // По возрастанию ключа: порядок байтов UTF-8, как у Cloudflare
      async list<T>(options: { prefix: string }): Promise<Map<string, T>> {
        const rows = db
          .prepare('SELECT key, value FROM entries WHERE room = ? AND key >= ? ORDER BY key')
          .all(roomId, options.prefix) as { key: string; value: string }[]
        const result = new Map<string, T>()
        for (const row of rows) {
          if (!row.key.startsWith(options.prefix)) break
          result.set(row.key, JSON.parse(row.value) as T)
        }
        return result
      },
      // Новый будильник заменяет прежний — как у Cloudflare
      async setAlarm(time: number): Promise<void> {
        db.prepare('INSERT INTO alarms (room, at) VALUES (?, ?) ON CONFLICT (room) DO UPDATE SET at = excluded.at').run(roomId, time)
        rooms.onAlarmSet({ roomId, at: time })
      },
    }
  }

  // Номера комнат, у которых что-то есть в хранилище
  roomIds(): string[] {
    return (this.db.prepare('SELECT DISTINCT room FROM entries ORDER BY room').all() as { room: string }[]).map((r) => r.room)
  }

  // Все поставленные будильники — расписание поднимает их при старте сервера
  alarms(): Alarm[] {
    return (this.db.prepare('SELECT room, at FROM alarms ORDER BY at').all() as { room: string; at: number }[]).map((r) => ({
      roomId: r.room,
      at: r.at,
    }))
  }

  // Будильник сработал. Снимается только тот, что звенел: если комната во время срабатывания
  // поставила новый — он остаётся
  clearAlarm(alarm: Alarm): void {
    this.db.prepare('DELETE FROM alarms WHERE room = ? AND at = ?').run(alarm.roomId, alarm.at)
  }

  close(): void {
    this.db.close()
  }
}
