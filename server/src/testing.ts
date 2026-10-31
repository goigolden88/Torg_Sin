// Подделки для тестов: хранилище кладёт значения JSON-строкой (как настоящее — между
// вызовами в памяти ничего не держится) и помнит каждую запись; комнаты — по номеру
import type { RoomsDeps } from './http'
import { createRoom, roomState, type RoomStorage } from './room'

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

// Сервер в памяти: хранилище на каждый номер комнаты, время задаёт тест
export function fakeServer(password: string | undefined): { deps: RoomsDeps; rooms: Map<string, FakeStorage>; clock: { now: number } } {
  const rooms = new Map<string, FakeStorage>()
  const clock = { now: 1_700_000_000_000 }
  const storage = (roomId: string) => {
    let s = rooms.get(roomId)
    if (!s) rooms.set(roomId, (s = new FakeStorage()))
    return s
  }
  const deps: RoomsDeps = {
    password,
    now: () => clock.now,
    create: (input) => createRoom(storage(input.roomId), input, clock.now),
    state: (roomId, keyHash) => roomState(storage(roomId), keyHash),
  }
  return { deps, rooms, clock }
}
