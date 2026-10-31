// Запасная обёртка сервера комнат (Р-02): то же, что Worker и объект Room в server/src/index.ts,
// но на Node и SQLite — для любого VPS, если Cloudflare недоступен.
// Ответы — handle из server/src/http.ts, комната — server/src/room.ts; здесь только привязка
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { handle } from '../src/http'
import { createRoom, roomState, type RoomStorage } from '../src/room'
import { perKey } from '../src/serial'
import { Alarms } from './alarms'
import { listen } from './listen'
import { SqliteRooms, type Alarm } from './sqlite'

export const DEFAULT_PORT = 8787
export const DEFAULT_DB = 'server/node/data.sqlite'

export type NodeServerOptions = {
  file: string // файл SQLite
  password: string | undefined // пароль компании ROOM_PASSWORD; не задан — создание выключено
  port: number // 0 — любой свободный (тесты)
  host?: string // не задан — все адреса машины
  now?: () => number // время сервера, UTC, мс
  // Будильник комнаты сработал (как alarm() объекта Room); своих сроков у комнат пока нет
  onAlarm?: (roomId: string, storage: RoomStorage) => Promise<void>
  // Для тестов: подменить хранилище комнаты (например, следить за записями)
  wrapStorage?: (roomId: string, storage: RoomStorage) => RoomStorage
}

export type NodeServer = {
  url: string // http://localhost:<порт> или http://<HOST>:<порт>
  rooms: SqliteRooms
  storage: (roomId: string) => RoomStorage
  close: () => Promise<void>
}

export async function startServer(options: NodeServerOptions): Promise<NodeServer> {
  const now = options.now ?? (() => Date.now())
  const rooms = new SqliteRooms(options.file)
  const storage = (roomId: string) => {
    const base = rooms.storage(roomId)
    return options.wrapStorage ? options.wrapStorage(roomId, base) : base
  }
  // Вызовы комнаты — по одному, как у объекта Room (будильник — тоже в очереди комнаты)
  const serial = perKey()
  const onAlarm = options.onAlarm ?? (async () => {})
  const alarms = new Alarms({
    now,
    ring: (alarm: Alarm) =>
      serial(alarm.roomId, async () => {
        await onAlarm(alarm.roomId, storage(alarm.roomId))
        rooms.clearAlarm(alarm)
      }),
    onError: (alarm, error) => console.error('Будильник комнаты', alarm.roomId, 'упал — повтор', error),
  })
  rooms.onAlarmSet = (alarm) => alarms.set(alarm)

  let server: Server
  try {
    server = await listen(
      (request) =>
        handle(request, {
          password: options.password,
          now,
          create: (input) => serial(input.roomId, () => createRoom(storage(input.roomId), input, now())),
          state: (roomId, keyHash) => serial(roomId, () => roomState(storage(roomId), keyHash)),
        }),
      options.port,
      options.host,
    )
  } catch (error) {
    rooms.close()
    throw error
  }
  // Сервер поднялся — будильники из файла; просроченные (сервер лежал в срок) звенят сразу
  for (const alarm of rooms.alarms()) alarms.set(alarm)

  const { port } = server.address() as AddressInfo
  const host = !options.host || options.host === '0.0.0.0' || options.host === '::' ? 'localhost' : options.host
  return {
    url: `http://${host.includes(':') ? `[${host}]` : host}:${port}`,
    rooms,
    storage,
    close: async () => {
      alarms.stop()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
        server.closeAllConnections()
      })
      // Дождаться работы комнат, начатой до остановки, — потом закрыть файл
      await serial.idle()
      rooms.close()
    },
  }
}
