// Подделки для тестов: хранилище кладёт значения JSON-строкой (как настоящее — между
// вызовами в памяти ничего не держится) и помнит каждую запись; комнаты — по номеру
import { handle, type RoomsDeps } from './http'
import { addRoom, listRooms } from './registry'
import { act, createRoom, exportRoom, importRoom, registerOnce, roomState, type RoomStorage } from './room'
import { perKey } from './serial'

export class FakeStorage implements RoomStorage {
  data = new Map<string, string>()
  puts: string[] = [] // ключи всех записей по порядку
  alarmAt: number | null = null

  async get<T>(key: string): Promise<T | undefined> {
    const raw = this.data.get(key)
    return raw === undefined ? undefined : (JSON.parse(raw) as T)
  }
  async put<T>(key: string, value: T): Promise<void> {
    this.puts.push(key)
    this.data.set(key, JSON.stringify(value))
  }
  async list<T>(options: { prefix: string }): Promise<Map<string, T>> {
    const keys = [...this.data.keys()].filter((k) => k.startsWith(options.prefix)).sort()
    return new Map(keys.map((k) => [k, JSON.parse(this.data.get(k) as string) as T]))
  }
  async setAlarm(time: number): Promise<void> {
    this.alarmAt = time
  }
}

// Сервер для общего набора тестов комнат (rooms.suite.ts): одни тесты — на любом хранилище (Р-02)
export type TestServer = {
  send(path: string, init?: RequestInit): Promise<Response> // запрос к адресу сервера
  roomIds(): string[] // номера комнат, у которых что-то есть в хранилище
  storage(roomId: string): RoomStorage // хранилище комнаты — проверить журнал напрямую
  puts(roomId: string): string[] // ключи всех записей хранилища комнаты по порядку
  clock: { now: number } // время сервера задаёт тест
  seeds: string[] // зёрна следующих жребиев суда по очереди (Р-25) — вместо случайных
  close(): Promise<void>
}

export const START_TIME = 1_700_000_000_000

// Источник зёрен жребия для тестов: по очереди из seeds, кончились — по счётчику (тоже hex)
export function testSeeds(): { seeds: string[]; next: () => string } {
  const seeds: string[] = []
  let n = 0
  return { seeds, next: () => seeds.shift() ?? (++n).toString(16).padStart(32, '0') }
}

// Сервер в памяти, как на Cloudflare (index.ts): хранилище на каждый номер комнаты и реестр комнат —
// комната отмечается в нём один раз (registerOnce); время задаёт тест. registered — номера комнат по
// порядку вызовов реестра
export function fakeServer(password: string | undefined): TestServer & { deps: RoomsDeps; registry: FakeStorage; registered: string[] } {
  const rooms = new Map<string, FakeStorage>()
  const clock = { now: START_TIME }
  const storage = (roomId: string) => {
    let s = rooms.get(roomId)
    if (!s) rooms.set(roomId, (s = new FakeStorage()))
    return s
  }
  const serial = perKey() // как объект Room: вызовы комнаты по одному
  const random = testSeeds()
  const registry = new FakeStorage()
  const registered: string[] = []
  const register = (roomId: string) =>
    registerOnce(
      storage(roomId),
      async (entry) => {
        registered.push(entry.roomId)
        await addRoom(registry, entry)
      },
      clock.now,
    )
  // Вызов комнаты: старая комната сначала встаёт в реестр (как Room в index.ts)
  const inRoom = <T>(roomId: string, run: (s: FakeStorage) => Promise<T>) =>
    serial(roomId, async () => {
      await register(roomId)
      return run(storage(roomId))
    })
  // Создание и загрузка: комната — в реестр сразу после
  const thenRegister = <T>(roomId: string, run: (s: FakeStorage) => Promise<T>) =>
    serial(roomId, async () => {
      const r = await run(storage(roomId))
      await register(roomId)
      return r
    })
  const deps: RoomsDeps = {
    password,
    now: () => clock.now,
    create: (input) => thenRegister(input.roomId, (s) => createRoom(s, input, clock.now)),
    state: (roomId, keyHash) => inRoom(roomId, (s) => roomState(s, keyHash, clock.now, random.next)),
    act: (roomId, action) => inRoom(roomId, (s) => act(s, action, clock.now, random.next)),
    backup: (roomId, keyHash) => inRoom(roomId, (s) => exportRoom(s, keyHash, clock.now)),
    restore: (roomId, backup) => thenRegister(roomId, (s) => importRoom(s, backup)),
    roomIds: async () => (await listRooms(registry)).map((e) => e.roomId),
  }
  return {
    deps,
    registry,
    registered,
    send: (path, init) => handle(new Request('https://x' + path, init), deps),
    roomIds: () => [...rooms].filter(([, s]) => s.data.size > 0).map(([id]) => id),
    storage,
    puts: (roomId) => storage(roomId).puts,
    clock,
    seeds: random.seeds,
    close: async () => {},
  }
}
