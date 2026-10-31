// Сервер комнат на Cloudflare (Р-01): Worker принимает запросы, объект Room — одна
// комната (этап 1). Логика — в http.ts и правилах src/rules/; здесь только привязка к Cloudflare
import { DurableObject } from 'cloudflare:workers'
import { notFound, route } from './http'

export type Env = {
  ROOMS: DurableObjectNamespace<Room>
  ROOM_PASSWORD?: string
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    return route(request.method, url.pathname, Date.now()) ?? notFound()
  },
}

// Комната — пока пустая: класс объявлен с первой выкатки, чтобы этапу 1 не нужна была миграция
export class Room extends DurableObject<Env> {}
