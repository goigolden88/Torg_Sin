// Запасная обёртка сервера комнат (Р-02): то же, что Worker и объект Room в server/src/index.ts,
// но на Node и SQLite — для любого VPS, если Cloudflare недоступен.
// Ответы — handle из server/src/http.ts, комната — server/src/room.ts; здесь только привязка
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dailyBackup, nextBackupAt, type DailyBackupDeps } from '../src/backup'
import { handle } from '../src/http'
import { randomSeed } from '../src/keys'
import { act, createRoom, exportRoom, importRoom, roomState, type RoomStorage } from '../src/room'
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
  seed?: () => string // зерно жребия суда (Р-25); не задано — crypto (keys.ts, randomSeed)
  // Будильник комнаты сработал (как alarm() объекта Room); своих сроков у комнат пока нет
  onAlarm?: (roomId: string, storage: RoomStorage) => Promise<void>
  // Для тестов: подменить хранилище комнаты (например, следить за записями)
  wrapStorage?: (roomId: string, storage: RoomStorage) => RoomStorage
  // Суточная копия в репо данных (server/src/backup.ts): заданы оба — таймер раз в сутки, иначе его нет
  dataToken?: string
  dataRepo?: string
  fetch?: DailyBackupDeps['fetch'] // запрос к GitHub; для тестов — подделка
  log?: (line: string) => void // строка суточной копии в лог; по умолчанию — console.log
}

export type NodeServer = {
  url: string // http://localhost:<порт> или http://<HOST>:<порт>
  rooms: SqliteRooms
  storage: (roomId: string) => RoomStorage
  close: () => Promise<void>
}

export async function startServer(options: NodeServerOptions): Promise<NodeServer> {
  const now = options.now ?? (() => Date.now())
  const seed = options.seed ?? randomSeed
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
  // Копии комнат — для GET /export и суточной копии; реестр комнат не нужен: список — из своей базы (этап 6)
  const backup = (roomId: string, keyHash: string | null) => serial(roomId, () => exportRoom(storage(roomId), keyHash, now()))
  const roomIds = async () => rooms.roomIds()

  let server: Server
  try {
    server = await listen(
      (request) =>
        handle(request, {
          password: options.password,
          now,
          create: (input) => serial(input.roomId, () => createRoom(storage(input.roomId), input, now())),
          state: (roomId, keyHash) => serial(roomId, () => roomState(storage(roomId), keyHash, now(), seed)),
          act: (roomId, action) => serial(roomId, () => act(storage(roomId), action, now(), seed)),
          backup,
          restore: (roomId, copy) => serial(roomId, () => importRoom(storage(roomId), copy)),
          roomIds,
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
  const daily = dailyTimer(options, { now, backup, roomIds })

  const { port } = server.address() as AddressInfo
  const host = !options.host || options.host === '0.0.0.0' || options.host === '::' ? 'localhost' : options.host
  return {
    url: `http://${host.includes(':') ? `[${host}]` : host}:${port}`,
    rooms,
    storage,
    close: async () => {
      alarms.stop()
      daily.stop()
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

// Суточная копия по таймеру — в тот же миг, что у Worker'а (nextBackupAt). Ключей нет — таймера нет.
// Сервер лежал в срок — копия на следующую ночь: она полная, догонять нечего. Остановка не ждёт
// начатой копии: комната после закрытия файла не прочтётся — копия не сделается, строка в лог
function dailyTimer(options: NodeServerOptions, copies: Pick<DailyBackupDeps, 'now' | 'backup' | 'roomIds'>): { stop: () => void } {
  const { dataToken: token, dataRepo: repo } = options
  if (!token || !repo) return { stop: () => {} }
  const log = options.log ?? ((line: string) => console.log(line))
  const fetcher = options.fetch ?? ((url: string, init: RequestInit) => fetch(url, init))
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  // after — миг прошлой копии: таймер может сработать на миг раньше — второй копии в ту же ночь не будет
  const schedule = (after: number) => {
    if (stopped) return
    const at = nextBackupAt(Math.max(after, copies.now()))
    timer = setTimeout(() => {
      void dailyBackup({ ...copies, token, repo, fetch: fetcher, log })
        .catch((error: unknown) => console.error('Суточная копия упала', error))
        .finally(() => schedule(at))
    }, at - copies.now())
  }
  schedule(copies.now())
  return {
    stop: () => {
      stopped = true
      clearTimeout(timer)
    },
  }
}
