import { describe, expect, it } from 'vitest'
import { BACKUP_FORMAT, type Backup } from '../rules/backup'
import { backupFileName, backupText, deliveryWay, isApple } from './backupParts'

const AT = Date.UTC(2026, 10, 20, 12, 0) // 20.11.2026, полдень UTC
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

describe('backupFileName', () => {
  it('«ТоргСин — <название> — ДД.ММ.ГГГГ.json»', () => {
    expect(backupFileName('Дача 2026', AT, 'UTC')).toBe('ТоргСин — Дача 2026 — 20.11.2026.json')
  })

  it('дата — местная: в Москве уже следующий день', () => {
    const late = Date.UTC(2026, 10, 20, 22, 30)
    expect(backupFileName('Дача', late, 'UTC')).toBe('ТоргСин — Дача — 20.11.2026.json')
    expect(backupFileName('Дача', late, 'Europe/Moscow')).toBe('ТоргСин — Дача — 21.11.2026.json')
  })

  it('недопустимые в имени знаки заменены дефисом', () => {
    expect(backupFileName('Футбол: 1/2 финала?', AT, 'UTC')).toBe('ТоргСин — Футбол- 1-2 финала- — 20.11.2026.json')
    expect(backupFileName('a\\b*c"d<e>f|g', AT, 'UTC')).toBe('ТоргСин — a-b-c-d-e-f-g — 20.11.2026.json')
  })

  it('управляющие и невидимые знаки заменены, пробелы — один', () => {
    expect(backupFileName('Баня\tпо\nпятницам', AT, 'UTC')).toBe('ТоргСин — Баня-по-пятницам — 20.11.2026.json')
    expect(backupFileName('Баня‮по​пятницам', AT, 'UTC')).toBe('ТоргСин — Баня-по-пятницам — 20.11.2026.json')
    expect(backupFileName('  Баня    по   пятницам  ', AT, 'UTC')).toBe('ТоргСин — Баня по пятницам — 20.11.2026.json')
  })

  it('точки по краям убраны; пустое название — «комната»', () => {
    expect(backupFileName('...Дача.', AT, 'UTC')).toBe('ТоргСин — Дача — 20.11.2026.json')
    expect(backupFileName('', AT, 'UTC')).toBe('ТоргСин — комната — 20.11.2026.json')
    expect(backupFileName(' . ', AT, 'UTC')).toBe('ТоргСин — комната — 20.11.2026.json')
  })

  it('длинное название — первые 80 знаков, эмодзи не разрезан', () => {
    const name = backupFileName('я'.repeat(79) + '🎲🎲', AT, 'UTC')
    expect(name).toBe(`ТоргСин — ${'я'.repeat(79)}🎲 — 20.11.2026.json`)
  })
})

describe('backupText', () => {
  it('только поля копии, без версии протокола и служебных записей; с отступами', () => {
    const reply = { v: 9, format: BACKUP_FORMAT, roomId: 'R1', exportedAt: AT, log: [], store: { secret: { secret: 's', at: 1 } } } as Backup & { v: number }
    const text = backupText(reply)
    expect(JSON.parse(text)).toEqual({ format: BACKUP_FORMAT, roomId: 'R1', exportedAt: AT, log: [] })
    expect(text).toContain('\n  "roomId": "R1"')
    expect(text.endsWith('\n')).toBe(true)
  })
})

describe('deliveryWay', () => {
  it('iPhone и iPad — «Поделиться», если умеет файлы', () => {
    expect(isApple(IPHONE, 5)).toBe(true)
    expect(isApple(MAC, 5)).toBe(true) // iPad под видом Mac
    expect(deliveryWay(IPHONE, 5, true)).toBe('share')
    expect(deliveryWay(MAC, 5, true)).toBe('share')
    expect(deliveryWay(IPHONE, 5, false)).toBe('download')
  })

  it('Android и компьютер (и Mac) — загрузка', () => {
    expect(isApple(MAC, 0)).toBe(false)
    expect(deliveryWay(MAC, 0, true)).toBe('download')
    expect(deliveryWay(ANDROID, 5, true)).toBe('download')
    expect(deliveryWay(WINDOWS, 0, true)).toBe('download')
  })
})
