// Подделки для тестов: хранилище кладёт значения JSON-строкой (как настоящее — между
// вызовами в памяти ничего не держится) и помнит каждую запись; комнаты — по номеру
import { handle, type RoomsDeps } from './http'
import { act, createRoom, roomState, type RoomStorage } from './room'
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
  close(): Promise<void>
}

export const START_TIME = 1_700_000_000_000

// Сервер в памяти: хранилище на каждый номер комнаты, время задаёт тест
export function fakeServer(password: string | undefined): TestServer & { deps: RoomsDeps } {
  const rooms = new Map<string, FakeStorage>()
  const clock = { now: START_TIME }
  const storage = (roomId: string) => {
    let s = rooms.get(roomId)
    if (!s) rooms.set(roomId, (s = new FakeStorage()))
    return s
  }
  const serial = perKey() // как объект Room: вызовы комнаты по одному
  const deps: RoomsDeps = {
    password,
    now: () => clock.now,
    create: (input) => serial(input.roomId, () => createRoom(storage(input.roomId), input, clock.now)),
    state: (roomId, keyHash) => serial(roomId, () => roomState(storage(roomId), keyHash)),
    act: (roomId, action) => serial(roomId, () => act(storage(roomId), action, clock.now)),
  }
  return {
    deps,
    send: (path, init) => handle(new Request('https://x' + path, init), deps),
    roomIds: () => [...rooms].filter(([, s]) => s.data.size > 0).map(([id]) => id),
    storage,
    puts: (roomId) => storage(roomId).puts,
    clock,
    close: async () => {},
  }
}
