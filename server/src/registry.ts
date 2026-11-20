// Реестр комнат (этап 6): одна запись на комнату — номер и миг создания; по нему сервер выгружает все
// комнаты (GET /export). На Cloudflare — отдельный объект Registry (index.ts); запасной обёртке
// реестр не нужен — список комнат даёт её база (SqliteRooms.roomIds). Без привязки к Cloudflare
//
// Что лежит в хранилище реестра:
//   room:<номер>  — { roomId, createdAt }; пишется один раз, не меняется
import type { RegistryEntry, RoomStorage } from './room'

const ROOM = 'room:'

export type RegistryStorage = Pick<RoomStorage, 'get' | 'put' | 'list'>

// Отметить комнату; уже есть — ничего (повтор после сбоя безопасен)
export async function addRoom(storage: RegistryStorage, entry: RegistryEntry): Promise<void> {
  if ((await storage.get(ROOM + entry.roomId)) !== undefined) return
  await storage.put<RegistryEntry>(ROOM + entry.roomId, { roomId: entry.roomId, createdAt: entry.createdAt })
}

// Все комнаты реестра по номеру (ULID — по порядку создания)
export async function listRooms(storage: RegistryStorage): Promise<RegistryEntry[]> {
  return [...(await storage.list<RegistryEntry>({ prefix: ROOM })).values()]
}
