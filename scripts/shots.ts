// Снимки экранов для отчёта PR (Р-10: каждый экран — на 390 и 1280 px; раскладка компьютера —
// меню развёрнуто и свёрнуто — ещё и на 1920 px; событие — на 1024, 1280, 1440, 1536, 1920 и
// 2560 px с проверкой, что оно во всю ширину области, по центру и от 1280 px в две колонки).
// Собирает сайт, поднимает vite preview (порт 4173) и запасной сервер комнат (server/node) в памяти
// с выдуманным паролем, затем ведёт Chrome без окна по сценариям из scripts/shots/: у каждого
// «устройства» своё хранилище (отдельный контекст браузера). Chrome управляется по
// DevTools-протоколу — обычный --screenshot не умеет нажимать кнопки. PNG — в shots/ (не в репо).
// Сбой — код выхода 1.
//
// npm run shots — все сценарии, shots/ сначала очищается.
// npm run shots -- outcomes courts — только названные (порядок и ширины — как во всём прогоне),
// shots/ не очищается: снимки других сценариев остаются. Имена — в списке SCENARIOS в конце файла.
import type { ChildProcess } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build, preview, runnerImport } from 'vite'
import { Cdp, launchChrome, OUT, PASSWORD, PORT, SIZES, WIDE, type RoomsServer, type ServerModule, type Size } from './shots/common.ts'
import { courts } from './shots/courts.ts'
import { crash } from './shots/crash.ts'
import { eventWidth } from './shots/event-width.ts'
import { known } from './shots/known.ts'
import { layout } from './shots/layout.ts'
import { offerOutcomes } from './shots/offer-outcomes.ts'
import { offers } from './shots/offers.ts'
import { outcomes } from './shots/outcomes.ts'
import { pasteLink } from './shots/paste-link.ts'
import { points } from './shots/points.ts'
import { scenario } from './shots/start.ts'
import { subjects } from './shots/subjects.ts'

// Что нужно сценарию: Chrome, общий сервер снимков (его берут start и layout) и запуск своего
type Context = { cdp: Cdp; server: RoomsServer; startServer: ServerModule['startServer'] }
// perSize — сценарий на каждой ширине SIZES (все такие — по ширине за раз, как прежде);
// иначе — один раз, ширины выбирает сам сценарий
type Scenario = { name: string; about: string } & (
  | { perSize: (ctx: Context, size: Size) => Promise<void> }
  | { once: (ctx: Context) => Promise<void> }
)

// Имена из командной строки; неизвестное — ошибка со списком, до сборки
function choose(names: string[]): Scenario[] {
  const unknown = names.filter((name) => !SCENARIOS.some((s) => s.name === name))
  if (unknown.length) {
    const list = SCENARIOS.map((s) => `  ${s.name} — ${s.about}`).join('\n')
    throw new Error(`Нет такого сценария: ${unknown.join(', ')}. Есть:\n${list}`)
  }
  return names.length ? SCENARIOS.filter((s) => names.includes(s.name)) : SCENARIOS
}

async function main(): Promise<void> {
  const names = process.argv.slice(2)
  const chosen = choose(names)
  if (!names.length) await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })
  console.log('Сценарии:', chosen.map((s) => s.name).join(', '))
  console.log('Сборка сайта…')
  await build({ logLevel: 'warn' })

  // Запасной сервер (server/node): тот же код, что у Worker'а; комнаты — в памяти
  const { module } = await runnerImport<ServerModule>('./server/node/app.ts', { configFile: false, logLevel: 'warn' })
  const server = await module.startServer({ file: ':memory:', password: PASSWORD, port: 0 })
  const site = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'warn' })
  const profile = await mkdtemp(join(tmpdir(), 'torgsin-shots-'))
  let chrome: ChildProcess | null = null
  let cdp: Cdp | null = null
  try {
    const launched = await launchChrome(profile)
    chrome = launched.process
    cdp = await Cdp.connect(launched.url)
    const ctx: Context = { cdp, server, startServer: module.startServer }
    for (const size of SIZES) for (const s of chosen) if ('perSize' in s) await s.perSize(ctx, size)
    for (const s of chosen) if ('once' in s) await s.once(ctx)
    console.log('Готово: снимки в', OUT)
  } finally {
    if (cdp) {
      await cdp.send('Browser.close').catch(() => undefined)
      cdp.close()
    }
    chrome?.kill('SIGKILL')
    await site.close()
    await server.close()
    await rm(profile, { recursive: true, force: true }).catch(() => undefined)
  }
}

// Сценарии в порядке прогона: имя (для npm run shots -- <имя>) и что снимает. Код — в scripts/shots/<имя>.ts
const SCENARIOS: Scenario[] = [
  {
    name: 'start',
    about: 'вход: комната, приглашение, заявки, события и ставки, ссылка для другого устройства, нет связи (01–20, 12a–12n)',
    perSize: (c, size) => scenario(c.cdp, size, c.server, c.startServer),
  },
  { name: 'outcomes', about: 'исход события: предложение, возражение, решение, голосование, согласие, окончательно (24–32, 38–41)', perSize: (c, size) => outcomes(c.cdp, size, c.startServer) },
  { name: 'offers', about: 'пари: новое, принять, встречное, отозвать, список (43–54)', perSize: (c, size) => offers(c.cdp, size, c.startServer) },
  { name: 'offer-outcomes', about: 'исход пари: отметки сторон, гарант, новый гарант, окончательно (55–63)', perSize: (c, size) => offerOutcomes(c.cdp, size, c.startServer) },
  { name: 'courts', about: 'апелляция и суд по событию и по пари (80–90)', perSize: (c, size) => courts(c.cdp, size, c.startServer) },
  { name: 'paste-link', about: '«Вставить ссылку» и заметка про экран «Домой» на iPhone (64–68)', perSize: (c, size) => pasteLink(c.cdp, size, c.startServer) },
  { name: 'subjects', about: 'предмет спора: событие и пари о ком-то, пометки (91–98)', perSize: (c, size) => subjects(c.cdp, size, c.startServer) },
  { name: 'known', about: '«Исход уже известен»: досрочно в событии и в пари (99–106)', perSize: (c, size) => known(c.cdp, size, c.startServer) },
  {
    name: 'layout',
    about: 'раскладка компьютера на 1280 и 1920 px: меню развёрнуто и свёрнуто (21–23)',
    once: async (c) => {
      for (const size of WIDE) await layout(c.cdp, size, c.server)
    },
  },
  { name: 'event-width', about: 'событие, «Новое событие» и комната на ширинах 390 и 1024–2560 px (33–35, 37)', once: (c) => eventWidth(c.cdp, c.startServer) },
  { name: 'points', about: 'комната в очках (36)', once: (c) => points(c.cdp, c.startServer) },
  {
    name: 'crash',
    about: 'экран ошибки при испорченной копии комнаты (42)',
    once: async (c) => {
      for (const size of SIZES) await crash(c.cdp, size)
    },
  },
]

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  },
)
