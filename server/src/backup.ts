// Выгрузка всех комнат и суточная копия (этап 6, Р-02). collectBackups — полные копии всех комнат
// сервера: её зовут GET /export (http.ts) и суточная копия. dailyBackup — раз в сутки кладёт их в
// приватный репо данных одним файлом rooms.json через GitHub REST: копия переживает потерю аккаунта
// Cloudflare. Зовут Worker (scheduled, index.ts) и запасная обёртка (суточный таймер, node/app.ts).
// Без привязки к Cloudflare: запрос к GitHub — fetch из параметров, в тестах — подделка
import type { Backup } from '../../src/rules/backup'
import { ULID_PATTERN } from './keys'
import type { BackupResult } from './room'

// Комнаты для выгрузки: номера (Cloudflare — реестр, Node — своя база) и полная копия комнаты
export type CollectDeps = {
  roomIds: () => Promise<string[]>
  backup: (roomId: string, keyHash: null) => Promise<BackupResult>
}

// Полные копии всех комнат по порядку номеров; номер без комнаты (и кривой) пропускается.
// Только читает: суд по «ждёт суда» не собирает, комнаты не трогает
export async function collectBackups(deps: CollectDeps): Promise<Backup[]> {
  const backups: Backup[] = []
  for (const roomId of await deps.roomIds()) {
    if (!ULID_PATTERN.test(roomId)) continue
    const r = await deps.backup(roomId, null)
    if (r.ok) backups.push(r.backup)
  }
  return backups
}

// --- Суточная копия в репо данных

export const BACKUP_FILE = 'rooms.json' // в корне репо данных, ветка по умолчанию
// Когда: ночь по Екатеринбургу — 21:17 UTC (02:17 там, UTC+5 круглый год). То же расписание —
// в server/wrangler.toml, [triggers]: правишь одно — правь и другое
export const BACKUP_HOUR_UTC = 21
export const BACKUP_MINUTE_UTC = 17
export const DAY = 86_400_000
const EKATERINBURG = 5 * 3_600_000 // сдвиг от UTC — для даты в сообщении коммита

const GITHUB = 'https://api.github.com'
const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/ // владелец/репо

export type DailyBackupDeps = CollectDeps & {
  token: string | undefined // DATA_TOKEN — токен GitHub с доступом только к репо данных
  repo: string | undefined // DATA_REPO — «владелец/репо»
  now: () => number // время сервера, UTC, мс
  fetch: (url: string, init: RequestInit) => Promise<Response>
  log: (line: string) => void // строка в лог сервера; токена в строках нет
}

export type DailyBackupResult =
  | { status: 'off' } // ключей нет (или репо записан криво) — выгрузка пропущена
  | { status: 'same'; rooms: number } // с прошлого раза ничего не изменилось — коммита нет
  | { status: 'saved'; rooms: number; message: string } // коммит «Копия ДД.ММ.ГГГГ, комнат: N»
  // Сбой: комнаты не собрались, GitHub не ответил (code — null) или отказал; следующая попытка — по расписанию
  | { status: 'failed'; step: 'rooms' | 'read' | 'write'; code: number | null }

// Суточная копия: GET файла (его sha и содержимое) → PUT нового содержимого; два запроса к GitHub.
// Копии отличаются от прошлых только мигом выгрузки (exportedAt) — файл не переписывается. Не бросает:
// любой сбой — строкой в лог и результатом
export async function dailyBackup(deps: DailyBackupDeps): Promise<DailyBackupResult> {
  const { token, repo } = deps
  if (!token || !repo) {
    deps.log('Суточная копия пропущена: не заданы DATA_TOKEN и DATA_REPO')
    return { status: 'off' }
  }
  if (!REPO_PATTERN.test(repo)) {
    deps.log('Суточная копия пропущена: DATA_REPO — не «владелец/репо»')
    return { status: 'off' }
  }

  let backups: Backup[]
  try {
    backups = await collectBackups(deps)
  } catch (error) {
    deps.log('Суточная копия не сделана: комнаты не собрались — ' + errorText(error))
    return { status: 'failed', step: 'rooms', code: null }
  }

  const url = `${GITHUB}/repos/${repo}/contents/${BACKUP_FILE}`
  const headers = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'torg-sin-backup', // GitHub без него отказывает
  }

  let read: Response
  try {
    read = await deps.fetch(url, { method: 'GET', headers })
  } catch {
    deps.log('Суточная копия не сделана: GitHub не ответил на чтение ' + BACKUP_FILE)
    return { status: 'failed', step: 'read', code: null }
  }
  let sha: string | undefined
  if (read.status === 200) {
    const file: unknown = await read.json().catch(() => null)
    sha = fileSha(file)
    if (sha === undefined) {
      deps.log('Суточная копия не сделана: GitHub ответил на чтение без sha файла (код 200)')
      return { status: 'failed', step: 'read', code: 200 }
    }
    if (sameBackups(file, backups)) {
      deps.log(`Суточная копия: с прошлого раза ничего не изменилось, комнат: ${backups.length} — коммита нет`)
      return { status: 'same', rooms: backups.length }
    }
  } else if (read.status !== 404) {
    await drain(read)
    deps.log(`Суточная копия не сделана: GitHub отказал в чтении ${BACKUP_FILE}, код ${read.status}`)
    return { status: 'failed', step: 'read', code: read.status }
  } else {
    await drain(read) // 404 — файла ещё нет: первый коммит без sha
  }

  const message = `Копия ${backupDate(deps.now())}, комнат: ${backups.length}`
  const body = { message, content: toBase64(backupText(backups)), ...(sha ? { sha } : {}) }
  let write: Response
  try {
    write = await deps.fetch(url, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    deps.log('Суточная копия не сделана: GitHub не ответил на запись ' + BACKUP_FILE)
    return { status: 'failed', step: 'write', code: null }
  }
  await drain(write)
  if (write.status !== 200 && write.status !== 201) {
    deps.log(`Суточная копия не сделана: GitHub отказал в записи ${BACKUP_FILE}, код ${write.status}`)
    return { status: 'failed', step: 'write', code: write.status }
  }
  deps.log(`Суточная копия записана: «${message}»`)
  return { status: 'saved', rooms: backups.length, message }
}

// Текст файла: массив полных копий, как у GET /export в поле backups
export function backupText(backups: Backup[]): string {
  return JSON.stringify(backups) + '\n'
}

// Дата коммита — по Екатеринбургу: «21.11.2026»
export function backupDate(at: number): string {
  const d = new Date(at + EKATERINBURG)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`
}

// Следующий миг суточной копии строго после at (для таймера запасной обёртки)
export function nextBackupAt(at: number): number {
  const d = new Date(at)
  const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), BACKUP_HOUR_UTC, BACKUP_MINUTE_UTC)
  return today > at ? today : today + DAY
}

function fileSha(file: unknown): string | undefined {
  if (typeof file !== 'object' || file === null) return undefined
  const sha = (file as { sha?: unknown }).sha
  return typeof sha === 'string' && sha ? sha : undefined
}

// Те же копии, что в файле, без учёта мига выгрузки. Содержимого в ответе нет (файл больше 1 МБ —
// GitHub его не отдаёт) или оно не читается — «изменилось»: лишний коммит лучше пропущенной копии
function sameBackups(file: unknown, backups: Backup[]): boolean {
  const { content, encoding } = file as { content?: unknown; encoding?: unknown }
  if (encoding !== 'base64' || typeof content !== 'string' || !content) return false
  try {
    const old: unknown = JSON.parse(fromBase64(content))
    if (!Array.isArray(old)) return false
    return withoutTime(old) === withoutTime(backups)
  } catch {
    return false
  }
}

function withoutTime(backups: unknown[]): string {
  return JSON.stringify(
    backups.map((b) => {
      if (typeof b !== 'object' || b === null) return b
      const { exportedAt: _, ...rest } = b as Record<string, unknown>
      return rest
    }),
  )
}

// base64 из UTF-8 (кириллица) и обратно; GitHub переносит base64 строками — переносы убираем
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

function fromBase64(content: string): string {
  const bytes = Uint8Array.from(atob(content.replace(/\s/g, '')), (c) => c.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
}

// Тело ответа не нужно — дочитать, чтобы не держать соединение
async function drain(response: Response): Promise<void> {
  await response.arrayBuffer().catch(() => undefined)
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
