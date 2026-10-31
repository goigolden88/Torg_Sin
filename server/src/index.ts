// Сервер комнат на Cloudflare (Р-01): Worker принимает запросы, объект Room — одна комната.
// Логика — в http.ts, room.ts и правилах src/rules/; здесь только привязка к Cloudflare
import { DurableObject } from 'cloudflare:workers'
import { handle } from './http'
import * as room from './room'

export type Env = {
  ROOMS: DurableObjectNamespace<Room>
  ROOM_PASSWORD?: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, {
      password: env.ROOM_PASSWORD,
      now: () => Date.now(),
      create: (input) => roomStub(env, input.roomId).create(input),
      state: (roomId, keyHash) => roomStub(env, roomId).state(keyHash),
      // Вызов объекта не сохраняет связь «действие → ответ» в типах — её держит room.act
      act: async <K extends room.ActionType>(roomId: string, action: Extract<room.RoomAction, { type: K }>) =>
        (await roomStub(env, roomId).act(action)) as room.ActionResult<K>,
    })
  },
}

// Объект комнаты — по её номеру; реестра комнат нет: список своих комнат держит телефон
function roomStub(env: Env, roomId: string): DurableObjectStub<Room> {
  return env.ROOMS.get(env.ROOMS.idFromName(roomId))
}

// Объект обрабатывает вызовы по одному — двойное создание не создаст двух комнат
export class Room extends DurableObject<Env> {
  async create(input: room.CreateInput): Promise<room.CreateResult> {
    return room.createRoom(this.ctx.storage, input, Date.now())
  }

  async state(keyHash: string): Promise<room.StateResult> {
    return room.roomState(this.ctx.storage, keyHash)
  }

  // Вход по ссылке и решения ведущего (room.act): по одному, по времени сервера
  async act(action: room.RoomAction): Promise<room.ActionResult> {
    return room.act(this.ctx.storage, action, Date.now())
  }
}
