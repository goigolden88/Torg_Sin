// Снимки экранов для отчёта PR (Р-10: каждый экран — на 390 и 1280 px; раскладка компьютера —
// меню развёрнуто и свёрнуто — ещё и на 1920 px; событие — на 1024, 1280, 1440, 1536, 1920 и
// 2560 px с проверкой, что оно во всю ширину области, по центру и от 1280 px в две колонки).
// Собирает сайт, поднимает vite preview (порт 4173) и запасной сервер комнат (server/node) в памяти
// с выдуманным паролем, затем ведёт Chrome без окна по сценариям из scripts/shots/: у каждого
// «устройства» своё хранилище (отдельный контекст браузера). Chrome управляется по
// DevTools-протоколу — обычный --screenshot не умеет нажимать кнопки. PNG — в shots/ (не в репо).
// Сбой — код выхода 1.
//
// Сценарии идут в несколько потоков (THREADS, #149): у каждого потока свой Chrome со своим профилем
// и свой общий сервер снимков на своём порту; сайт (vite preview) — один на всех. Поток берёт
// следующий сценарий (на одной ширине) из общей очереди; вывод сценария печатается целиком, когда
// он закончился. Упавший сценарий не останавливает другие: их снимки снимаются, сбои — в конце.
// В конце — время каждой части, медленные — сверху.
//
// npm run shots — все сценарии, shots/ сначала очищается.
// npm run shots -- outcomes courts — только названные (ширины — как во всём прогоне),
// shots/ не очищается: снимки других сценариев остаются. Имена — в списке SCENARIOS в конце файла.
import { AsyncLocalStorage } from 'node:async_hooks'
import type { ChildProcess } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { availableParallelism, tmpdir } from 'node:os'
import { join } from 'node:path'
import { format } from 'node:util'
import { build, preview, runnerImport } from 'vite'
import { Cdp, launchChrome, OUT, PASSWORD, PORT, SIZES, WIDE, type RoomsServer, type ServerModule, type Size } from './shots/common.ts'
import { auction } from './shots/auction.ts'
import { backup } from './shots/backup.ts'
import { choices } from './shots/choices.ts'
import { close } from './shots/close.ts'
import { courts } from './shots/courts.ts'
import { crash } from './shots/crash.ts'
import { eventWidth } from './shots/event-width.ts'
import { history } from './shots/history.ts'
import { host } from './shots/host.ts'
import { known } from './shots/known.ts'
import { layout } from './shots/layout.ts'
import { lots } from './shots/lots.ts'
import { members } from './shots/members.ts'
import { noGuarantor } from './shots/no-guarantor.ts'
import { offerOutcomes } from './shots/offer-outcomes.ts'
import { offers } from './shots/offers.ts'
import { outcomes } from './shots/outcomes.ts'
import { pace } from './shots/pace.ts'
import { pasteLink } from './shots/paste-link.ts'
import { points } from './shots/points.ts'
import { promises } from './shots/promises.ts'
import { settle } from './shots/settle.ts'
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

// Потоков — три, но не больше ядер: иначе Chrome'ы мешают друг другу и экраны не успевают за TIMEOUT
const THREADS = Math.max(1, Math.min(3, availableParallelism()))

// Шаг очереди: сценарий на одной ширине (perSize) или целиком (once)
type Job = { name: string; label: string; run: (ctx: Context) => Promise<void> }
type Done = { job: Job; seconds: number; error: string | null }

// Вывод шага — в его буфер и целиком по окончании: потоки идут вперемешку, читать — по сценарию
const output = new AsyncLocalStorage<string[]>()
const print = console.log
console.log = (...args: unknown[]) => {
  const lines = output.getStore()
  if (lines) lines.push(format(...args))
  else print(...args)
}

function jobs(chosen: Scenario[]): Job[] {
  const list: Job[] = []
  for (const size of SIZES)
    for (const s of chosen) if ('perSize' in s) list.push({ name: s.name, label: `${s.name}, ${size.name} px`, run: (c) => s.perSize(c, size) })
  for (const s of chosen) if ('once' in s) list.push({ name: s.name, label: s.name, run: s.once })
  return list
}

async function runJob(ctx: Context, job: Job): Promise<Done> {
  const lines: string[] = []
  const started = Date.now()
  let error: string | null = null
  try {
    await output.run(lines, () => job.run(ctx))
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }
  await ctx.cdp.closeContexts()
  const seconds = Math.round((Date.now() - started) / 1000)
  for (const line of lines) print(line)
  print(error ? `  СБОЙ: ${job.label} — ${error}` : `  ${job.label} — ${seconds} с`)
  return { job, seconds, error }
}

// Поток: свой Chrome (свой профиль) и свой общий сервер снимков; берёт шаги из общей очереди
async function thread(queue: Job[], startServer: ServerModule['startServer'], done: Done[]): Promise<void> {
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0 })
  const profile = await mkdtemp(join(tmpdir(), 'torgsin-shots-'))
  let chrome: ChildProcess | null = null
  let cdp: Cdp | null = null
  try {
    const launched = await launchChrome(profile)
    chrome = launched.process
    cdp = await Cdp.connect(launched.url)
    const ctx: Context = { cdp, server, startServer }
    for (let job = queue.shift(); job; job = queue.shift()) done.push(await runJob(ctx, job))
  } finally {
    if (cdp) {
      await cdp.send('Browser.close').catch(() => undefined)
      cdp.close()
    }
    chrome?.kill('SIGKILL')
    await server.close()
    await rm(profile, { recursive: true, force: true }).catch(() => undefined)
  }
}

// Время частей: сумма по ширинам, медленные — сверху
function timings(done: Done[]): void {
  const parts = new Map<string, Done[]>()
  for (const d of done) parts.set(d.job.name, [...(parts.get(d.job.name) ?? []), d])
  const rows = [...parts].map(([name, list]) => ({ name, list, total: list.reduce((sum, d) => sum + d.seconds, 0) }))
  rows.sort((a, b) => b.total - a.total)
  print('Время частей:')
  for (const { name, list, total } of rows) {
    const sizes = list.length > 1 ? ` (${list.map((d) => `${d.job.label.slice(name.length + 2)}: ${d.seconds} с`).join(', ')})` : ''
    print(`  ${name} — ${total} с${sizes}`)
  }
}

async function main(): Promise<void> {
  const started = Date.now()
  const names = process.argv.slice(2)
  const chosen = choose(names)
  if (!names.length) await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })
  console.log('Сценарии:', chosen.map((s) => s.name).join(', '))
  console.log('Сборка сайта…')
  await build({ logLevel: 'warn' })

  // Запасной сервер (server/node): тот же код, что у Worker'а; комнаты — в памяти
  const { module } = await runnerImport<ServerModule>('./server/node/app.ts', { configFile: false, logLevel: 'warn' })
  const site = await preview({ preview: { port: PORT, strictPort: true }, logLevel: 'warn' })
  const queue = jobs(chosen)
  const threads = Math.min(THREADS, queue.length)
  const done: Done[] = []
  console.log(`Потоков: ${threads}, шагов: ${queue.length}`)
  try {
    const results = await Promise.allSettled(Array.from({ length: threads }, () => thread(queue, module.startServer, done)))
    const broken = results.find((r) => r.status === 'rejected')
    if (broken) throw broken.reason
  } finally {
    await site.close()
  }
  timings(done)
  const total = Math.round((Date.now() - started) / 1000)
  print(`Всего: ${Math.floor(total / 60)} мин ${total % 60} с`)
  const failed = done.filter((d) => d.error)
  if (failed.length) throw new Error(`Сбои (${failed.length}):\n` + failed.map((d) => `  ${d.job.label} — ${d.error}`).join('\n'))
  console.log('Готово: снимки в', OUT)
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
    name: 'settle',
    about: '«Расчёт»: пусто, блок в комнате, по ставкам и меньше переводов, «Перевёл», смена режима, создание, таблица очков, карточки (110–118)',
    perSize: (c, size) => settle(c.cdp, size, c.startServer),
  },
  {
    name: 'history',
    about: '«История»: пусто, строка «История · N» в комнате, итоги и прошедшее, «С моим участием», «Назад» из пари (120–123)',
    perSize: (c, size) => history(c.cdp, size, c.startServer),
  },
  { name: 'backup', about: '«Скачать копию комнаты»: кнопка, файл, сервер не отдал копию (124–126)', perSize: (c, size) => backup(c.cdp, size, c.startServer) },
  {
    name: 'pace',
    about: 'темп комнаты: создание со «Своим», строка темпа, смена ведущим, сроки на «Новом событии», исход в быстрой комнате (127–132)',
    perSize: (c, size) => pace(c.cdp, size, c.startServer),
  },
  {
    name: 'no-guarantor',
    about: 'пари без гаранта: выбор в форме, совпали — окончательно, разошлись — сразу суд, «вы в суде», недоступно в комнате из двоих (133–141)',
    perSize: (c, size) => noGuarantor(c.cdp, size, c.startServer),
  },
  {
    name: 'auction',
    about: 'пари «Торг до …»: форма, встречные у участника и автора, «вас перебили», вдвое больше, «Принять сейчас», не состоялось, «Повторить», «История» (142–152)',
    perSize: (c, size) => auction(c.cdp, size, c.startServer),
  },
  {
    name: 'lots',
    about: '«Лот»: пусто, «Новый лот», торг и «вас перебили», комната с лотами, после торга у продавца и победителя, суд, «Расчёт», «История» (160–167)',
    perSize: (c, size) => lots(c.cdp, size, c.startServer),
  },
  {
    name: 'choices',
    about: '«Выбор»: пусто, «Новый выбор», фаза вариантов, комната, фаза вкладов, итог, ничья и жребий, «Расчёт», «История» (170–177)',
    perSize: (c, size) => choices(c.cdp, size, c.startServer),
  },
  {
    name: 'members',
    about: 'выйти и «выбыл»: участники до и после, подтверждение, комната и событие выбывшего, отказ в выходе, вышел, заявка-возврат, «История» (180–190)',
    perSize: (c, size) => members(c.cdp, size, c.startServer),
  },
  {
    name: 'host',
    about: 'ведение: участники до и после у ведущей и участника, «Передать ведение», «Взять ведение можно с …», «Взять ведение», «История» (191–199)',
    perSize: (c, size) => host(c.cdp, size, c.startServer),
  },
  {
    name: 'close',
    about: 'закрыть комнату: подтверждение, отказ — что открыто, закрыта у ведущей и участника, «Мои комнаты», «История», открыть снова (200–206)',
    perSize: (c, size) => close(c.cdp, size, c.startServer),
  },
  {
    name: 'promises',
    about: 'пари на обещание: до (на сумму) и после — форма, окно, пари, «Позвать в чат», список, встречное, «Принять», «Расчёт» у обеих сторон, «История» (210–221)',
    perSize: (c, size) => promises(c.cdp, size, c.startServer),
  },
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
