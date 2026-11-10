import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import type { EventView, OfferView, RoomStateResponse } from '../rules/protocol'
import { createStore, DB_NAME, DB_VERSION, openDb, savedEvents, savedOffers, withState, type SavedJoin, type SavedRoom } from './db'

// Пари «3 к 1, сумма автора 300 ₽» — открытое, как его отдаёт сервер
function offer(id: string): OfferView {
  return {
    id,
    at: 10,
    authorId: 'MA',
    condition: 'Боря подтянется 20 раз',
    check: 'Снимаем на видео',
    side: 'yes',
    odds: { a: 3, b: 1 },
    amount: 30000,
    takerAmount: 10000,
    to: null,
    closesAt: 100,
    expectedAt: 200,
    guarantorId: 'MV',
    counterTo: null,
    subjectId: null,
    status: 'open',
    accepted: null,
    withdrawnAt: null,
    closedBy: null,
    outcome: null,
  }
}

function room(id: string, savedAt: number, extra: Partial<SavedRoom> = {}): SavedRoom {
  return {
    id,
    server: 'https://torg-sin.goigolden88.workers.dev',
    memberId: 'M' + id,
    key: 'ключ-' + id,
    invite: 'приглашение-' + id,
    name: 'Комната ' + id,
    currency: 'RUB',
    hostId: 'M' + id,
    createdAt: 1,
    members: [{ id: 'M' + id, name: 'Аня' }],
    savedAt,
    syncedAt: null,
    ...extra,
  }
}

describe('хранилище на устройстве', () => {
  it('пустое — комнат нет', async () => {
    const store = createStore(new IDBFactory())
    expect(await store.listRooms()).toEqual([])
    expect(await store.getRoom('A')).toBeUndefined()
  })

  it('комнаты и ключ на месте после перезапуска (новое открытие той же базы)', async () => {
    const factory = new IDBFactory()
    const first = createStore(factory)
    await first.saveRoom(room('A', 1))
    await first.saveRoom(room('B', 2))
    await first.close()

    const again = createStore(factory)
    const list = await again.listRooms()
    expect(list.map((r) => r.id)).toEqual(['B', 'A']) // новые сверху
    expect((await again.getRoom('A'))?.key).toBe('ключ-A')
  })

  it('та же комната дважды — одна запись, последняя', async () => {
    const store = createStore(new IDBFactory())
    await Promise.all([store.saveRoom(room('A', 1)), store.saveRoom(room('A', 1, { name: 'Дача' }))])
    const list = await store.listRooms()
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Дача')
  })

  it('схема заводится с первого открытия: комнаты и заявки', async () => {
    const factory = new IDBFactory()
    const db = await openDb(factory)
    expect(db.name).toBe(DB_NAME)
    expect(db.version).toBe(DB_VERSION)
    expect([...db.objectStoreNames].sort()).toEqual(['joins', 'rooms'])
    db.close()
  })

  it('с версии 1 на 2: комнаты на месте, хранилище заявок добавлено', async () => {
    const factory = new IDBFactory()
    // База версии 1, как её завёл сайт до заявок
    await new Promise<void>((resolve, reject) => {
      const request = factory.open(DB_NAME, 1)
      request.onupgradeneeded = () => request.result.createObjectStore('rooms', { keyPath: 'id' }).put(room('A', 1))
      request.onsuccess = () => {
        request.result.close()
        resolve()
      }
      request.onerror = () => reject(request.error)
    })

    const store = createStore(factory)
    expect((await store.getRoom('A'))?.key).toBe('ключ-A')
    expect(await store.getJoin('A')).toBeUndefined()
    await store.close()
    const db = await openDb(factory)
    expect(db.version).toBe(2)
    expect([...db.objectStoreNames].sort()).toEqual(['joins', 'rooms'])
    db.close()
  })

  it('события: старая запись без поля — пусто; ответ сервера — записан и на месте после перезапуска', async () => {
    const factory = new IDBFactory()
    const first = createStore(factory)
    await first.saveRoom(room('A', 1)) // как до событий: поля events нет
    const old = await first.getRoom('A')
    expect(old && savedEvents(old)).toEqual([])

    const event: EventView = {
      id: 'E1',
      at: 10,
      authorId: 'MA',
      condition: 'Дождь в субботу',
      check: 'Прогноз на даче',
      outcomes: [
        { id: '1', title: 'Да' },
        { id: '2', title: 'Нет' },
      ],
      closesAt: 100,
      expectedAt: 200,
      subjectId: null,
      subjectRule: false,
      status: 'open',
      clarifications: [],
      bets: [{ id: 'B1', memberId: 'MA', outcome: '1', amount: 30000, at: 20 }],
      cancelled: null,
      refunds: [],
      outcome: null,
    }
    const state: RoomStateResponse = {
      v: 1,
      room: { id: 'A', name: 'Дача', currency: 'RUB', hostId: 'MA', createdAt: 1 },
      members: [{ id: 'MA', name: 'Аня' }],
      me: 'MA',
      events: [event],
      now: 50,
    }
    await first.saveRoom(withState(old as SavedRoom, state, 60))
    await first.close()

    const saved = await createStore(factory).getRoom('A')
    expect(saved && savedEvents(saved)).toEqual([event])
    expect(saved?.syncedAt).toBe(60)
    expect(saved?.key).toBe('ключ-A') // ключ и приглашение не тронуты
  })

  it('события: копия до нового поля протокола не отдаётся, свежая — отдаётся; запись не переписана', async () => {
    const factory = new IDBFactory()
    const first = createStore(factory)
    const fresh: EventView = {
      id: 'E1',
      at: 10,
      authorId: 'MA',
      condition: 'Дождь в субботу',
      check: 'Прогноз на даче',
      outcomes: [
        { id: '1', title: 'Да' },
        { id: '2', title: 'Нет' },
      ],
      closesAt: 100,
      expectedAt: 200,
      subjectId: null,
      subjectRule: false,
      status: 'closed',
      clarifications: [],
      bets: [{ id: 'B1', memberId: 'MA', outcome: '1', amount: 30000, at: 20 }],
      cancelled: null,
      refunds: [],
      outcome: {
        status: 'proposed',
        proposal: { id: 'P1', by: 'MA', outcome: '1', at: 110 },
        objectionUntil: 200,
        objections: [],
        agreements: [],
        awaiting: [],
        decision: null,
        voters: [],
        votingUntil: null,
        votes: [],
        approved: null,
        finalAt: null,
        void: false,
        payouts: [],
      },
    }
    // Исход, записанный до согласий (протокол 2): поля agreements нет
    const oldOutcome: Record<string, unknown> = { ...fresh.outcome }
    delete oldOutcome.agreements
    const noAgreements = { ...fresh, id: 'E2', outcome: oldOutcome }
    // Событие до возвратов при отмене: поля refunds нет
    const noRefunds: Record<string, unknown> = { ...fresh, id: 'E3' }
    delete noRefunds.refunds
    const stale = [noAgreements, noRefunds] as unknown as EventView[]
    await first.saveRoom(room('A', 1, { events: [fresh, ...stale] }))
    await first.close()

    const again = createStore(factory)
    const saved = await again.getRoom('A')
    expect(saved && savedEvents(saved)).toEqual([fresh])
    const listed = (await again.listRooms())[0]
    expect(savedEvents(listed).map((e) => e.id)).toEqual(['E1'])
    // Хранимое как было: следующий ответ сервера ляжет поверх
    expect(saved?.events?.map((e) => e.id)).toEqual(['E1', 'E2', 'E3'])
  })

  it('события: не список в записи — пусто', () => {
    expect(savedEvents(room('A', 1, { events: 'испорчено' as unknown as EventView[] }))).toEqual([])
  })

  it('пари: старая запись без поля — пусто; ответ сервера — записан вместе с событиями', async () => {
    const factory = new IDBFactory()
    const first = createStore(factory)
    await first.saveRoom(room('A', 1)) // как до пари: поля offers нет
    const old = (await first.getRoom('A')) as SavedRoom
    expect(savedOffers(old)).toEqual([])

    const state: RoomStateResponse = {
      v: 2,
      room: { id: 'A', name: 'Дача', currency: 'RUB', hostId: 'MA', createdAt: 1 },
      members: [{ id: 'MA', name: 'Аня' }],
      me: 'MA',
      events: [],
      offers: [offer('O1')],
      now: 50,
    }
    await first.saveRoom(withState(old, state, 60))
    await first.close()
    const saved = await createStore(factory).getRoom('A')
    expect(saved && savedOffers(saved)).toEqual([offer('O1')])

    // Сервер до этапа 3 пари не шлёт — пари нет, прежняя копия не остаётся
    const noOffers: RoomStateResponse = { ...state }
    delete noOffers.offers
    expect(savedOffers(withState(saved as SavedRoom, noOffers, 70))).toEqual([])
  })

  it('пари: копия до нового поля протокола не отдаётся, свежая — отдаётся; запись не переписана', async () => {
    const factory = new IDBFactory()
    const first = createStore(factory)
    // Пари, записанное до исхода (Р-23): поля outcome нет
    const noOutcome: Record<string, unknown> = { ...offer('O2') }
    delete noOutcome.outcome
    await first.saveRoom(room('A', 1, { offers: [offer('O1'), noOutcome as unknown as OfferView] }))
    await first.close()

    const saved = await createStore(factory).getRoom('A')
    expect(saved && savedOffers(saved).map((o) => o.id)).toEqual(['O1'])
    expect(saved?.offers?.map((o) => o.id)).toEqual(['O1', 'O2'])
    expect(savedOffers(room('A', 1, { offers: 'испорчено' as unknown as OfferView[] }))).toEqual([])
  })

  it('заявка: записана, отклонена, а впустили — стала комнатой и убрана', async () => {
    const factory = new IDBFactory()
    const store = createStore(factory)
    const join: SavedJoin = {
      roomId: 'A',
      server: 'http://localhost:8787',
      invite: 'приглашение',
      name: 'Боря',
      memberId: 'MB',
      key: 'ключ-заявки',
      roomName: 'Дача',
      hostName: 'Аня',
      status: 'waiting',
      savedAt: 1,
    }
    await store.saveJoin(join)
    await store.saveJoin({ ...join, status: 'rejected' })
    expect((await store.getJoin('A'))?.status).toBe('rejected')

    await store.saveJoin(join)
    await store.admitJoin(room('A', 2, { memberId: 'MB', key: 'ключ-заявки', invite: null, server: join.server }))
    expect(await store.getJoin('A')).toBeUndefined()
    await store.close()

    const again = createStore(factory)
    expect((await again.listRooms()).map((r) => [r.id, r.memberId, r.server])).toEqual([['A', 'MB', 'http://localhost:8787']])
  })
})
