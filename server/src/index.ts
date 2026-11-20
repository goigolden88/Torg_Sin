// Сервер комнат на Cloudflare (Р-01): Worker принимает запросы, объект Room — одна комната, объект
// Registry — реестр комнат (этап 6), scheduled — суточная копия комнат. Логика — в http.ts, room.ts,
// registry.ts, backup.ts и правилах src/rules/; здесь только привязка к Cloudflare
import { DurableObject } from 'cloudflare:workers'
import type { Backup } from '../../src/rules/backup'
import { dailyBackup } from './backup'
import { handle } from './http'
import { addRoom, listRooms } from './registry'
import * as room from './room'

export type Env = {
  ROOMS: DurableObjectNamespace<Room>
  REGISTRY: DurableObjectNamespace<Registry>
  ROOM_PASSWORD?: string
  // Суточная копия в репо данных (backup.ts): оба — секреты Worker'а в панели Cloudflare
  DATA_TOKEN?: string
  DATA_REPO?: string
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
      restore: (roomId, backup) => roomStub(env, roomId).restore(backup),
      ...copies(env),
    })
  },

  // Суточная копия по расписанию (server/wrangler.toml, [triggers]); ключей нет — строка в лог и всё
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await dailyBackup({
      token: env.DATA_TOKEN,
      repo: env.DATA_REPO,
      now: () => Date.now(),
      fetch: (url, init) => fetch(url, init),
      log: (line) => console.log(line),
      ...copies(env),
    })
  },
}

// Копии комнат — для GET /export и суточной копии: номера из реестра, копия — вызовом объекта комнаты
function copies(env: Env) {
  return {
    backup: (roomId: string, keyHash: string | null) => roomStub(env, roomId).backup(keyHash),
    roomIds: async () => (await registryStub(env).list()).map((e) => e.roomId),
  }
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
