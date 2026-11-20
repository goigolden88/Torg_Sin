// «Скачать копию комнаты» (этап 6, Р-08, #100): копия участника — журнал целиком, без служебных
// записей (src/rules/backup.ts). Имя файла, текст файла и способ отдать его — чистые функции с тестами
import type { Backup } from '../rules/backup'
import { formatDate } from '../rules/date'

export const BACKUP_FAILED = 'Сервер не отдал копию — попробуйте позже'
export const BACKUP_NOTE = 'Копия — на случай, если сервер пропадёт: в ней всё, что было в комнате. Ключей входа в ней нет'

// Знаки, недопустимые в имени файла на Windows, macOS, iPhone и Android, управляющие и невидимые
// (направление текста, нулевой ширины) — заменяются дефисом
const BAD_CHARS = /[\\/:*?"<>|\u0000-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g
const NAME_MAX = 80 // знаков названия комнаты в имени файла
const NO_NAME = 'комната'

// «ТоргСин — Дача 2026 — 20.11.2026.json»: дата — местная, по мигу выгрузки (время сервера);
// timeZone — для тестов
export function backupFileName(roomName: string, at: number, timeZone?: string): string {
  const clean = roomName.replace(BAD_CHARS, '-').replace(/\s+/g, ' ').trim()
  const cut = Array.from(clean).slice(0, NAME_MAX).join('').trim()
  // Точка в начале — скрытый файл, в конце — Windows её отбрасывает
  const name = cut.replace(/^[.\s]+|[.\s]+$/g, '') || NO_NAME
  return `ТоргСин — ${name} — ${formatDate(at, timeZone)}.json`
}

// Текст файла: только поля копии (без версии протокола и, на всякий случай, без служебных записей),
// с отступами — открывается как текст
export function backupText(backup: Backup): string {
  const { format, roomId, exportedAt, log } = backup
  return JSON.stringify({ format, roomId, exportedAt, log }, null, 2) + '\n'
}

// iPhone и iPad (iPadOS называет себя «Macintosh», но у него сенсорный экран)
export function isApple(userAgent: string, touchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1)
}

// Как отдать файл: на iPhone и iPad — окно «Поделиться» («Сохранить в Файлы»), если оно умеет файлы;
// иначе (Android, компьютер) — загрузка
export function deliveryWay(userAgent: string, touchPoints: number, canShareFiles: boolean): 'share' | 'download' {
  return isApple(userAgent, touchPoints) && canShareFiles ? 'share' : 'download'
}
