// Тесты комнат на Cloudflare-подделке; те же — на SQLite в server/node/rooms.test.ts (Р-02)
import { describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION } from '../../src/rules/protocol'
import { ulid } from '../../src/rules/ulid'
import { hashKey } from './keys'
import { addRoom, listRooms } from './registry'
import { createRoom, registerOnce } from './room'
import { roomsSuite } from './rooms.suite'
import { FakeStorage, fakeServer, START_TIME } from './testing'

roomsSuite('Cloudflare-подделка', async (password) => fakeServer(password))

// Реестр комнат (этап 6) — только у Cloudflare: Node берёт список комнат из своей базы
describe('реестр комнат', () => {
  const PASSWORD = 'пароль'
  const FORM = { v: PROTOCOL_VERSION, password: PASSWORD, name: 'Дача', currency: 'RUB', hostName: 'Аня' }
  const auth = 'Password ' + btoa(String.fromCharCode(...new TextEncoder().encode(PASSWORD)))

  it('новая комната — в реестре сразу при создании; дальше реестр не зовётся', async () => {
    const s = fakeServer(PASSWORD)
    const r = await s.send('/rooms', { method: 'POST', body: JSON.stringify(FORM) })
    const room = (await r.json()) as { roomId: string; key: string }
    expect(s.registered).toEqual([room.roomId])
    expect(await listRooms(s.registry)).toEqual([{ roomId: room.roomId, createdAt: START_TIME }])
    s.clock.now += 1000
    for (let i = 0; i < 3; i++) await s.send('/rooms/' + room.roomId, { headers: { Authorization: 'Bearer ' + room.key } })
    expect(s.registered).toEqual([room.roomId])
  })

  it('старая комната (до выкатки реестра) встаёт в реестр сама при первом запросе, один раз', async () => {
    const s = fakeServer(PASSWORD)
    const roomId = ulid(START_TIME)
    const key = 'host-key-before-registry'
    // Комната создана в обход реестра — как до выкатки
    await createRoom(s.storage(roomId), { roomId, keyHash: await hashKey(key), invite: 'приглашение', name: 'Дача', currency: 'RUB', hostName: 'Аня' }, START_TIME)
    expect(s.registered).toEqual([])
    const before = (await (await s.send('/export', { headers: { Authorization: auth } })).json()) as { backups: unknown[] }
    expect(before.backups).toEqual([])
    s.clock.now += 1000
    const r = await s.send('/rooms/' + roomId, { headers: { Authorization: 'Bearer ' + key } })
    expect(r.status).toBe(200)
    expect(s.registered).toEqual([roomId])
    expect(await listRooms(s.registry)).toEqual([{ roomId, createdAt: START_TIME }])
    await s.send('/rooms/' + roomId, { headers: { Authorization: 'Bearer ' + key } })
    await s.send(`/rooms/${roomId}/preview`, { method: 'POST', body: JSON.stringify({ invite: 'приглашение' }) })
    expect(s.registered).toEqual([roomId])
    const after = (await (await s.send('/export', { headers: { Authorization: auth } })).json()) as { backups: { roomId: string }[] }
    expect(after.backups.map((b) => b.roomId)).toEqual([roomId])
  })

  it('запрос к пустой комнате реестр не трогает', async () => {
    const s = fakeServer(PASSWORD)
    const r = await s.send(`/rooms/${ulid(START_TIME)}`, { headers: { Authorization: 'Bearer some-key' } })
    expect(r.status).toBe(404)
    expect(s.registered).toEqual([])
    expect(s.roomIds()).toEqual([])
  })

  it('реестр упал — пометки нет, следующий запрос отмечает снова; комната отмечается один раз', async () => {
    const storage = new FakeStorage()
    const roomId = ulid(START_TIME)
    await createRoom(storage, { roomId, keyHash: 'хеш', invite: 'приглашение', name: 'Дача', currency: 'RUB', hostName: 'Аня' }, START_TIME)
    const calls: string[] = []
    const broken = async () => {
      calls.push('сбой')
      throw new Error('реестр недоступен')
    }
    await expect(registerOnce(storage, broken, START_TIME)).rejects.toThrow('реестр недоступен')
    expect(await storage.get('registry')).toBeUndefined()
    const registry = new FakeStorage()
    const working = async (entry: { roomId: string; createdAt: number }) => {
      calls.push(entry.roomId)
      await addRoom(registry, entry)
    }
    await registerOnce(storage, working, START_TIME + 1)
    await registerOnce(storage, working, START_TIME + 2)
    expect(calls).toEqual(['сбой', roomId])
    expect(await storage.get('registry')).toEqual({ at: START_TIME + 1 })
    // Повтор записи в реестр (сбой между вызовом и пометкой) — одна запись
    await addRoom(registry, { roomId, createdAt: 1 })
    expect(await listRooms(registry)).toEqual([{ roomId, createdAt: START_TIME }])
  })
})
