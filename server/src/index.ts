// Сервер комнат на Cloudflare (Р-01): Worker принимает запросы, объект Room — одна комната, объект
// Registry — реестр комнат (этап 6). Логика — в http.ts, room.ts, registry.ts и правилах src/rules/;
// здесь только привязка к Cloudflare
import { DurableObject } from 'cloudflare:workers'
import type { Backup } from '../../src/rules/backup'
import { handle } from './http'
import { addRoom, listRooms } from './registry'
import * as room from './room'

export type Env = {
  ROOMS: DurableObjectNamespace<Room>
  REGISTRY: DurableObjectNamespace<Registry>
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
      backup: (roomId, keyHash) => roomStub(env, roomId).backup(keyHash),
      restore: (roomId, backup) => roomStub(env, roomId).restore(backup),
      roomIds: async () => (await registryStub(env).list()).map((e) => e.roomId),
    })
  },
}

// Объект комнаты — по её номеру
function roomStub(env: Env, roomId: string): DurableObjectStub<Room> {
  return env.ROOMS.get(env.ROOMS.idFromName(roomId))
}

// Реестр комнат — один объект на сервер
function registryStub(env: Env): DurableObjectStub<Registry> {
  return env.REGISTRY.get(env.REGISTRY.idFromName('registry'))
}

// Объект обрабатывает вызовы по одному — двойное создание не создаст двух комнат
export class Room extends DurableObject<Env> {
  async create(input: room.CreateInput): Promise<room.CreateResult> {
    const r = await room.createRoom(this.ctx.storage, input, Date.now())
    await this.register()
    return r
  }

  // Чтение комнаты может дописать суд по «ждёт суда» (Р-25); зерно жребия — crypto (keys.ts)
  async state(keyHash: string): Promise<room.StateResult> {
    await this.register()
    return room.roomState(this.ctx.storage, keyHash, Date.now())
  }

  // Вход по ссылке и решения ведущего (room.act): по одному, по времени сервера
  async act(action: room.RoomAction): Promise<room.ActionResult> {
    await this.register()
    return room.act(this.ctx.storage, action, Date.now())
  }

  // Копия комнаты (этап 6): keyHash — копия участника, null — полная
  async backup(keyHash: string | null): Promise<room.BackupResult> {
    await this.register()
    return room.exportRoom(this.ctx.storage, keyHash, Date.now())
  }

  // Загрузка полной копии в пустую комнату — и сразу в реестр
  async restore(backup: Backup): Promise<room.RestoreResult> {
    const r = await room.importRoom(this.ctx.storage, backup)
    await this.register()
    return r
  }

  // Комната — в реестре один раз (room.registerOnce): новая — сразу, старая — при первом запросе после
  // выкатки. Пока зовём реестр, другие вызовы комнаты ждут; реестр упал — комната работает, отметка —
  // при следующем запросе
  private async register(): Promise<void> {
    await this.ctx.blockConcurrencyWhile(async () => {
      try {
        await room.registerOnce(this.ctx.storage, (entry) => registryStub(this.env).add(entry), Date.now())
      } catch (error) {
        console.error('Реестр комнат недоступен — отмечу комнату при следующем запросе', error)
      }
    })
  }
}

// Реестр комнат: одна запись на комнату (registry.ts)
export class Registry extends DurableObject<Env> {
  async add(entry: room.RegistryEntry): Promise<void> {
    await addRoom(this.ctx.storage, entry)
  }

  async list(): Promise<room.RegistryEntry[]> {
    return listRooms(this.ctx.storage)
  }
}
