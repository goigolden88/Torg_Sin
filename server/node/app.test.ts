// Запасная обёртка: перезапуск сервера (файл SQLite) и будильники комнат
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { PROTOCOL_VERSION, type CreateRoomResponse, type RoomStateResponse } from '../../src/rules/protocol'
import { ulid } from '../../src/rules/ulid'
import type { RoomStorage } from '../src/room'
import { readLog } from '../src/room'
import { START_TIME } from '../src/testing'
import { startServer, type NodeServer, type NodeServerOptions } from './app'
import { Alarms } from './alarms'
import { MAX_BODY, TOO_LARGE } from './listen'

const PASSWORD = 'пароль-компании'
const FORM = { v: PROTOCOL_VERSION, password: PASSWORD, name: 'Дача', currency: 'RUB', hostName: 'Аня' }

const dir = mkdtempSync(join(tmpdir(), 'torgsin-node-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
let files = 0
const newFile = () => join(dir, `app-${++files}.sqlite`)

const running: NodeServer[] = []
afterEach(async () => {
  for (const s of running.splice(0)) await s.close()
})

async function start(options: Partial<NodeServerOptions> & { file: string }): Promise<NodeServer> {
  const s = await startServer({ password: PASSWORD, port: 0, host: '127.0.0.1', ...options })
  running.push(s)
  return s
}

async function stop(s: NodeServer): Promise<void> {
  running.splice(running.indexOf(s), 1)
  await s.close()
}

describe('перезапуск сервера на Node', () => {
  it('комната и её журнал на месте после перезапуска', async () => {
    const file = newFile()
    const first = await start({ file })
    const r = await fetch(first.url + '/rooms', { method: 'POST', body: JSON.stringify({ ...FORM, requestId: ulid() }) })
    expect(r.status).toBe(200)
    const created = (await r.json()) as CreateRoomResponse
    const log = await readLog(first.storage(created.roomId))
    expect(log.map((e) => e.type)).toEqual(['room.created', 'member.added'])
    await stop(first)

    const second = await start({ file })
    expect(await readLog(second.storage(created.roomId))).toEqual(log)
    const state = await fetch(second.url + '/rooms/' + created.roomId, { headers: { Authorization: 'Bearer ' + created.key } })
    expect(state.status).toBe(200)
    const body = (await state.json()) as RoomStateResponse
    expect(body.room.name).toBe('Дача')
    expect(body.me).toBe(created.memberId)
  })

  it('пароль компании — из настроек запуска: не задан — создание выключено', async () => {
    const s = await start({ file: newFile(), password: undefined })
    const r = await fetch(s.url + '/rooms', { method: 'POST', body: JSON.stringify(FORM) })
    expect(r.status).toBe(503)
  })

  it('слишком большой запрос — отказ, сервер жив', async () => {
    const s = await start({ file: newFile() })
    const r = await fetch(s.url + '/rooms', { method: 'POST', body: 'x'.repeat(MAX_BODY + 1) })
    expect(r.status).toBe(413)
    expect(await r.json()).toEqual({ v: PROTOCOL_VERSION, error: TOO_LARGE })
    expect((await fetch(s.url + '/health')).status).toBe(200)
  })
})

describe('будильник комнаты на Node', () => {
  it('сервер лежал в момент срока — после подъёма будильник срабатывает', async () => {
    const file = newFile()
    const clock = { now: START_TIME }
    const now = () => clock.now
    const first = await start({ file, now, onAlarm: async () => {} })
    await first.storage('ROOM-LATE').setAlarm(START_TIME + 60_000)
    await first.storage('ROOM-LATER').setAlarm(START_TIME + 3_600_000 * 24)
    await stop(first)

    // Сервер лежал, срок первого будильника прошёл
    clock.now = START_TIME + 120_000
    const rang: string[] = []
    const second = await start({
      file,
      now,
      onAlarm: async (roomId: string, storage: RoomStorage) => {
        await storage.put('rang', clock.now)
        rang.push(roomId)
      },
    })
    await vi.waitFor(() => expect(rang).toEqual(['ROOM-LATE']))
    expect(await second.storage('ROOM-LATE').get('rang')).toBe(clock.now)
    // Сработавший снят, будущий — на месте
    expect(second.rooms.alarms()).toEqual([{ roomId: 'ROOM-LATER', at: START_TIME + 3_600_000 * 24 }])
    await stop(second)

    // Ещё перезапуск — сработавший не звенит второй раз
    const again: string[] = []
    await start({ file, now, onAlarm: async (roomId: string) => void again.push(roomId) })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(again).toEqual([])
  })

  it('будильник звенит в срок, пока сервер работает; новый заменяет прежний', async () => {
    const rang: number[] = []
    const s = await start({ file: newFile(), onAlarm: async () => void rang.push(Date.now()) })
    const storage = s.storage('ROOM-1')
    await storage.setAlarm(Date.now() + 3_600_000)
    const at = Date.now() + 30
    await storage.setAlarm(at)
    await vi.waitFor(() => expect(rang.length).toBe(1))
    expect(rang[0]).toBeGreaterThanOrEqual(at)
    expect(s.rooms.alarms()).toEqual([])
  })

  it('обработчик упал — будильник остаётся в файле и звенит повторно', async () => {
    vi.useFakeTimers()
    try {
      const calls: number[] = []
      const errors: unknown[] = []
      const alarms = new Alarms({
        now: () => Date.now(),
        ring: async () => {
          calls.push(Date.now())
          if (calls.length === 1) throw new Error('упал')
        },
        onError: (_alarm, error) => void errors.push(error),
      })
      alarms.set({ roomId: 'R', at: Date.now() })
      await vi.advanceTimersByTimeAsync(0)
      expect(calls.length).toBe(1)
      expect(errors.length).toBe(1)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(calls.length).toBe(2)
      await vi.advanceTimersByTimeAsync(120_000)
      expect(calls.length).toBe(2)
      alarms.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('срок дальше 24 суток — ждёт частями и не звенит раньше', async () => {
    vi.useFakeTimers()
    try {
      const calls: number[] = []
      const alarms = new Alarms({ now: () => Date.now(), ring: async () => void calls.push(Date.now()), onError: () => {} })
      const at = Date.now() + 40 * 86_400_000
      alarms.set({ roomId: 'R', at })
      await vi.advanceTimersByTimeAsync(30 * 86_400_000)
      expect(calls).toEqual([])
      await vi.advanceTimersByTimeAsync(10 * 86_400_000)
      expect(calls).toEqual([at])
      alarms.stop()
    } finally {
      vi.useRealTimers()
    }
  })
})

// Суточная копия на Node (server/src/backup.ts) — таймером в тот же миг, что у Worker'а; GitHub — подделка
describe('суточная копия на Node', () => {
  const AT = Date.UTC(2026, 10, 20, 21, 17) // 21:17 UTC
  // Комната в файле — с прошлого запуска; новый запуск — за 50 мс до копии
  async function roomInFile(): Promise<{ file: string; roomId: string }> {
    const file = newFile()
    const first = await start({ file })
    const r = await fetch(first.url + '/rooms', { method: 'POST', body: JSON.stringify({ ...FORM, requestId: ulid() }) })
    const { roomId } = (await r.json()) as CreateRoomResponse
    await stop(first)
    return { file, roomId }
  }

  it('заданы DATA_TOKEN и DATA_REPO — в 21:17 UTC копия комнат из своей базы', async () => {
    const { file, roomId } = await roomInFile()
    const calls: { method: string; body?: string }[] = []
    const lines: string[] = []
    await start({
      file,
      now: () => AT - 50,
      dataToken: 'выдуманный-токен',
      dataRepo: 'someone/Torg_Sin_Data',
      log: (line) => lines.push(line),
      fetch: async (_url, init) => {
        calls.push({ method: init.method ?? 'GET', body: typeof init.body === 'string' ? init.body : undefined })
        return init.method === 'PUT' ? Response.json({}, { status: 201 }) : Response.json({ message: 'Not Found' }, { status: 404 })
      },
    })
    await vi.waitFor(() => expect(lines).toEqual(['Суточная копия записана: «Копия 21.11.2026, комнат: 1»']))
    expect(calls.map((c) => c.method)).toEqual(['GET', 'PUT'])
    const content = (JSON.parse(calls[1].body!) as { content: string }).content
    const text = new TextDecoder().decode(Uint8Array.from(atob(content), (c) => c.charCodeAt(0)))
    expect((JSON.parse(text) as { roomId: string }[]).map((b) => b.roomId)).toEqual([roomId])
  })

  it('ключей нет — таймера нет, к GitHub ни одного запроса', async () => {
    const { file } = await roomInFile()
    const calls: string[] = []
    const fake = async (url: string) => {
      calls.push(url)
      return Response.json({}, { status: 404 })
    }
    await start({ file, now: () => AT - 20, dataToken: 'выдуманный-токен', fetch: fake })
    await start({ file: newFile(), now: () => AT - 20, dataRepo: 'someone/Torg_Sin_Data', fetch: fake })
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(calls).toEqual([])
  })
})
