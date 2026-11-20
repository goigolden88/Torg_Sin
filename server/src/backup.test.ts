// Суточная копия комнат (backup.ts) на подделке GitHub: настоящий GitHub в тестах не вызывается
import { describe, expect, it } from 'vitest'
import type { Backup } from '../../src/rules/backup'
import { PROTOCOL_VERSION } from '../../src/rules/protocol'
import { BACKUP_FILE, backupDate, collectBackups, dailyBackup, DAY, nextBackupAt, type DailyBackupDeps } from './backup'
import { fakeServer, START_TIME } from './testing'

const PASSWORD = 'пароль'
const TOKEN = 'github_pat_выдуманный-токен'
const REPO = 'someone/Torg_Sin_Data'
const FILE_URL = `https://api.github.com/repos/${REPO}/contents/${BACKUP_FILE}`
const FORM = { v: PROTOCOL_VERSION, password: PASSWORD, name: 'Дача', currency: 'RUB', hostName: 'Аня' }
const auth = 'Password ' + btoa(String.fromCharCode(...new TextEncoder().encode(PASSWORD)))

// Подделка GitHub: один файл в репо, запросы по порядку; fail — отказ кодом или «не ответил» (throw)
type Call = { method: string; url: string; headers: Record<string, string>; body?: { message: string; content: string; sha?: string } }
function fakeGitHub(options: { file?: string; failRead?: number | 'throw'; failWrite?: number | 'throw'; noContent?: boolean } = {}) {
  let file: { sha: string; text: string } | null = options.file === undefined ? null : { sha: 'sha-1', text: options.file }
  let shas = 1
  const calls: Call[] = []
  const fetch: DailyBackupDeps['fetch'] = async (url, init) => {
    const call: Call = { method: init.method ?? 'GET', url, headers: { ...(init.headers as Record<string, string>) } }
    if (typeof init.body === 'string') call.body = JSON.parse(init.body)
    calls.push(call)
    if (call.method === 'GET') {
      if (options.failRead === 'throw') throw new TypeError('fetch failed')
      if (options.failRead) return new Response('{"message":"отказ"}', { status: options.failRead })
      if (!file) return Response.json({ message: 'Not Found' }, { status: 404 })
      // GitHub переносит base64 строками по 60 знаков; файл больше 1 МБ — без содержимого
      const content = options.noContent ? '' : (toBase64(file.text).match(/.{1,60}/g) ?? []).join('\n')
      return Response.json({ name: BACKUP_FILE, sha: file.sha, encoding: options.noContent ? 'none' : 'base64', content })
    }
    if (options.failWrite === 'throw') throw new TypeError('fetch failed')
    if (options.failWrite) return new Response('{"message":"отказ"}', { status: options.failWrite })
    const body = call.body!
    if ((file?.sha ?? undefined) !== body.sha) return Response.json({ message: 'sha' }, { status: 409 })
    const created = file === null
    file = { sha: 'sha-' + ++shas, text: fromBase64(body.content) }
    return Response.json({ content: { sha: file.sha } }, { status: created ? 201 : 200 })
  }
  return { fetch, calls, file: () => file }
}

function toBase64(text: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)))
}

function fromBase64(content: string): string {
  return new TextDecoder().decode(Uint8Array.from(atob(content), (c) => c.charCodeAt(0)))
}

// Сервер в памяти с двумя комнатами (кириллица в названиях)
async function twoRooms() {
  const s = fakeServer(PASSWORD)
  for (const name of ['Дача', 'Работа «Ёлка»']) {
    const r = await s.send('/rooms', { method: 'POST', body: JSON.stringify({ ...FORM, name }) })
    expect(r.status).toBe(200)
  }
  return s
}

function deps(s: ReturnType<typeof fakeServer>, github: ReturnType<typeof fakeGitHub>, extra: Partial<DailyBackupDeps> = {}) {
  const lines: string[] = []
  const d: DailyBackupDeps = {
    token: TOKEN,
    repo: REPO,
    now: () => s.clock.now,
    fetch: github.fetch,
    log: (line) => lines.push(line),
    backup: s.deps.backup,
    roomIds: s.deps.roomIds,
    ...extra,
  }
  return { d, lines }
}

async function exported(s: ReturnType<typeof fakeServer>): Promise<Backup[]> {
  return ((await (await s.send('/export', { headers: { Authorization: auth } })).json()) as { backups: Backup[] }).backups
}

describe('суточная копия комнат', () => {
  it('копии — те же, что у GET /export', async () => {
    const s = await twoRooms()
    expect(await collectBackups(s.deps)).toEqual(await exported(s))
    expect((await collectBackups(s.deps)).length).toBe(2)
  })

  it('файла нет — первый коммит без sha: массив полных копий, сообщение с датой по Екатеринбургу', async () => {
    const s = await twoRooms()
    s.clock.now = Date.UTC(2026, 10, 20, 21, 17) // 21.11.2026, 02:17 в Екатеринбурге
    const github = fakeGitHub()
    const { d, lines } = deps(s, github)
    const r = await dailyBackup(d)
    expect(r).toEqual({ status: 'saved', rooms: 2, message: 'Копия 21.11.2026, комнат: 2' })
    expect(github.calls.map((c) => c.method)).toEqual(['GET', 'PUT'])
    expect(github.calls.every((c) => c.url === FILE_URL)).toBe(true)
    expect(github.calls[1].body?.sha).toBeUndefined()
    expect(github.calls[1].body?.message).toBe('Копия 21.11.2026, комнат: 2')
    expect(JSON.parse(github.file()!.text)).toEqual(await exported(s))
    expect(github.file()!.text).toContain('Работа «Ёлка»')
    expect(lines).toEqual(['Суточная копия записана: «Копия 21.11.2026, комнат: 2»'])
  })

  it('файл есть и изменился — коммит поверх с его sha', async () => {
    const s = await twoRooms()
    const github = fakeGitHub({ file: '[]\n' })
    const r = await dailyBackup(deps(s, github).d)
    expect(r.status).toBe('saved')
    expect(github.calls[1].body?.sha).toBe('sha-1')
    expect(JSON.parse(github.file()!.text)).toHaveLength(2)
  })

  it('ничего не изменилось с прошлого раза (кроме мига выгрузки) — коммита нет; изменилось — есть', async () => {
    const s = await twoRooms()
    const github = fakeGitHub()
    expect((await dailyBackup(deps(s, github).d)).status).toBe('saved')
    s.clock.now += DAY
    const { d, lines } = deps(s, github)
    expect(await dailyBackup(d)).toEqual({ status: 'same', rooms: 2 })
    expect(github.calls.map((c) => c.method)).toEqual(['GET', 'PUT', 'GET'])
    expect(lines).toEqual(['Суточная копия: с прошлого раза ничего не изменилось, комнат: 2 — коммита нет'])
    // Третья комната — коммит
    s.clock.now += DAY
    await s.send('/rooms', { method: 'POST', body: JSON.stringify({ ...FORM, name: 'Третья' }) })
    expect(await dailyBackup(deps(s, github).d)).toMatchObject({ status: 'saved', rooms: 3 })
    expect(github.calls[4].body?.sha).toBe('sha-2')
  })

  it('содержимого файла в ответе нет (больше 1 МБ) — пишем заново', async () => {
    const s = await twoRooms()
    const github = fakeGitHub({ file: '[]\n', noContent: true })
    expect((await dailyBackup(deps(s, github).d)).status).toBe('saved')
    expect(github.calls[1].body?.sha).toBe('sha-1')
  })

  it('комнат нет — файл с пустым массивом', async () => {
    const s = fakeServer(PASSWORD)
    const github = fakeGitHub()
    expect(await dailyBackup(deps(s, github).d)).toMatchObject({ status: 'saved', rooms: 0 })
    expect(github.file()!.text).toBe('[]\n')
  })

  it('ключей нет — к GitHub ни одного запроса, строка в лог', async () => {
    const s = await twoRooms()
    for (const extra of [{ token: undefined }, { repo: undefined }, { token: '' }, { token: undefined, repo: undefined }]) {
      const github = fakeGitHub()
      const { d, lines } = deps(s, github, extra)
      expect(await dailyBackup(d)).toEqual({ status: 'off' })
      expect(github.calls).toEqual([])
      expect(lines).toEqual(['Суточная копия пропущена: не заданы DATA_TOKEN и DATA_REPO'])
    }
    const github = fakeGitHub()
    const { d, lines } = deps(s, github, { repo: 'не репо/../x y' })
    expect(await dailyBackup(d)).toEqual({ status: 'off' })
    expect(github.calls).toEqual([])
    expect(lines).toEqual(['Суточная копия пропущена: DATA_REPO — не «владелец/репо»'])
  })

  it('отказ GitHub на чтении и записи — строка в лог с кодом; не ответил — без кода', async () => {
    const s = await twoRooms()
    const cases = [
      { options: { failRead: 401 }, result: { status: 'failed', step: 'read', code: 401 }, line: 'отказал в чтении rooms.json, код 401', calls: 1 },
      { options: { failRead: 'throw' as const }, result: { status: 'failed', step: 'read', code: null }, line: 'не ответил на чтение', calls: 1 },
      { options: { failWrite: 403 }, result: { status: 'failed', step: 'write', code: 403 }, line: 'отказал в записи rooms.json, код 403', calls: 2 },
      { options: { failWrite: 429 }, result: { status: 'failed', step: 'write', code: 429 }, line: 'код 429', calls: 2 },
      { options: { failWrite: 'throw' as const }, result: { status: 'failed', step: 'write', code: null }, line: 'не ответил на запись', calls: 2 },
    ]
    for (const c of cases) {
      const github = fakeGitHub(c.options)
      const { d, lines } = deps(s, github)
      expect(await dailyBackup(d)).toEqual(c.result)
      expect(github.calls).toHaveLength(c.calls)
      expect(lines).toHaveLength(1)
      expect(lines[0]).toContain(c.line)
    }
  })

  it('файл сменился между чтением и записью (409) — сбой, без второй попытки', async () => {
    const s = await twoRooms()
    const github = fakeGitHub({ file: '[]\n' })
    const { d, lines } = deps(s, github, {
      fetch: async (url, init) => {
        const r = await github.fetch(url, init)
        if (init.method !== 'GET') return r
        const file = (await r.json()) as Record<string, unknown>
        return Response.json({ ...file, sha: 'устаревший' })
      },
    })
    expect(await dailyBackup(d)).toEqual({ status: 'failed', step: 'write', code: 409 })
    expect(lines[0]).toContain('код 409')
  })

  it('комнаты не собрались (реестр упал) — к GitHub ни одного запроса, строка в лог', async () => {
    const s = await twoRooms()
    const github = fakeGitHub()
    const { d, lines } = deps(s, github, { roomIds: async () => Promise.reject(new Error('реестр недоступен')) })
    expect(await dailyBackup(d)).toEqual({ status: 'failed', step: 'rooms', code: null })
    expect(github.calls).toEqual([])
    expect(lines).toEqual(['Суточная копия не сделана: комнаты не собрались — реестр недоступен'])
  })

  it('токен — только в заголовке к GitHub: не в логе, не в файле, не в сообщении', async () => {
    const s = await twoRooms()
    for (const options of [{}, { failRead: 401 }, { failWrite: 403 }, { failRead: 'throw' as const }]) {
      const github = fakeGitHub(options)
      const { d, lines } = deps(s, github)
      await dailyBackup(d)
      expect(lines.join('\n')).not.toContain(TOKEN)
      expect(github.calls[0].headers.Authorization).toBe('Bearer ' + TOKEN)
      for (const c of github.calls) expect(JSON.stringify(c.body ?? {})).not.toContain(TOKEN)
    }
  })

  it('комнаты не трогаются: ни одной записи в хранилище', async () => {
    const s = await twoRooms()
    const ids = s.roomIds()
    const before = ids.map((id) => s.puts(id).length)
    await dailyBackup(deps(s, fakeGitHub()).d)
    await dailyBackup(deps(s, fakeGitHub({ failWrite: 500 })).d)
    expect(ids.map((id) => s.puts(id).length)).toEqual(before)
  })
})

describe('когда суточная копия', () => {
  it('дата коммита — по Екатеринбургу (UTC+5)', () => {
    expect(backupDate(Date.UTC(2026, 10, 20, 18, 59))).toBe('20.11.2026')
    expect(backupDate(Date.UTC(2026, 10, 20, 19, 0))).toBe('21.11.2026')
    expect(backupDate(Date.UTC(2026, 11, 31, 21, 17))).toBe('01.01.2027')
  })

  it('следующий миг — 21:17 UTC строго после заданного', () => {
    const at = Date.UTC(2026, 10, 20, 21, 17)
    expect(nextBackupAt(at - 1)).toBe(at)
    expect(nextBackupAt(at)).toBe(at + DAY)
    expect(nextBackupAt(Date.UTC(2026, 10, 20, 23, 0))).toBe(at + DAY)
    expect(nextBackupAt(Date.UTC(2026, 10, 20, 0, 0))).toBe(at)
    expect(nextBackupAt(START_TIME)).toBeGreaterThan(START_TIME)
  })
})
