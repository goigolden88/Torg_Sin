// Снимки экранов для отчёта PR (Р-10: каждый экран — на 390 и 1280 px): npm run shots.
// Собирает сайт, поднимает vite preview (порт 4173) и запасной сервер комнат (server/node) в памяти
// с выдуманным паролем, затем ведёт Chrome без окна по сценарию «ведущий создаёт комнату → друг
// просится → ведущий впускает…»: у каждого «устройства» своё хранилище (отдельный контекст
// браузера). Chrome управляется по DevTools-протоколу — обычный --screenshot не умеет нажимать
// кнопки. PNG — в shots/ (не в репо). Сбой — код выхода 1.
// Chrome — google-chrome, google-chrome-stable или chromium; свой путь — переменная CHROME
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build, preview, runnerImport } from 'vite'

const OUT = 'shots'
const PORT = 4173
const SITE = `http://localhost:${PORT}/Torg_Sin/`
const PASSWORD = 'demo-password' // выдуманный: сервер живёт только на время снимков
type Size = { name: string; width: number; height: number }
const SIZES: Size[] = [
  { name: '390', width: 390, height: 844 },
  { name: '1280', width: 1280, height: 800 },
]
// Раскладка компьютера (меню слева, ширина содержимого) — ещё и на широком мониторе
const WIDE: Size[] = [SIZES[1], { name: '1920', width: 1920, height: 1080 }]
const TIMEOUT = 20_000 // ожидание экрана: опрос сервера — раз в 5 секунд

type RoomsServer = { url: string; close: () => Promise<void> }
type ServerModule = {
  startServer: (options: { file: string; password: string | undefined; port: number }) => Promise<RoomsServer>
}

// ─── DevTools-протокол ───────────────────────────────────────────────────────

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void }

class Cdp {
  private next = 0
  private pending = new Map<number, Pending>()
  private ws: WebSocket

  private constructor(ws: WebSocket) {
    this.ws = ws
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message: string } }
      if (message.id === undefined) return
      const p = this.pending.get(message.id)
      if (!p) return
      this.pending.delete(message.id)
      if (message.error) p.reject(new Error(message.error.message))
      else p.resolve(message.result)
    })
  }

  static connect(url: string): Promise<Cdp> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      ws.addEventListener('open', () => resolve(new Cdp(ws)))
      ws.addEventListener('error', () => reject(new Error('Нет связи с Chrome: ' + url)))
    })
  }

  send<T = Record<string, unknown>>(method: string, params: object = {}, sessionId?: string): Promise<T> {
    const id = ++this.next
    this.ws.send(JSON.stringify({ id, method, params, sessionId }))
    return new Promise<T>((resolve, reject) => this.pending.set(id, { resolve: (v) => resolve(v as T), reject }))
  }

  close(): void {
    this.ws.close()
  }
}

// Найти Chrome и поднять без окна; адрес DevTools — из его вывода
async function launchChrome(profile: string): Promise<{ process: ChildProcess; url: string }> {
  const candidates = process.env.CHROME ? [process.env.CHROME] : ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']
  for (const binary of candidates) {
    const chrome = spawn(
      binary,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--hide-scrollbars',
        '--no-first-run',
        '--lang=en-US', // язык браузера — английский: даты всё равно должны быть по-русски
        '--remote-debugging-port=0',
        `--user-data-dir=${profile}`,
        'about:blank',
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    )
    const url = await new Promise<string | null>((resolve) => {
      let log = ''
      chrome.on('error', () => resolve(null))
      chrome.on('exit', () => resolve(null))
      chrome.stderr?.on('data', (chunk: Buffer) => {
        log += chunk.toString()
        const match = /DevTools listening on (ws:\/\/\S+)/.exec(log)
        if (match) resolve(match[1])
      })
      setTimeout(() => resolve(null), 15_000)
    })
    if (url) return { process: chrome, url }
    chrome.kill('SIGKILL')
  }
  throw new Error('Chrome не найден: ' + candidates.join(', '))
}

// ─── Устройство: своё хранилище, своя страница ───────────────────────────────

class Device {
  private cdp: Cdp
  private session: string
  private size: Size
  private name: string

  private constructor(cdp: Cdp, session: string, size: Size, name: string) {
    this.cdp = cdp
    this.session = session
    this.size = size
    this.name = name
  }

  static async open(cdp: Cdp, size: Size, name: string): Promise<Device> {
    const { browserContextId } = await cdp.send<{ browserContextId: string }>('Target.createBrowserContext')
    const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank', browserContextId })
    const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true })
    await cdp.send('Page.enable', {}, sessionId)
    const device = new Device(cdp, sessionId, size, name)
    await device.metrics(size.height)
    return device
  }

  async goto(url: string): Promise<void> {
    await this.cdp.send('Page.navigate', { url }, this.session)
  }

  async reload(): Promise<void> {
    await this.cdp.send('Page.reload', { ignoreCache: true }, this.session)
  }

  async eval<T>(expression: string): Promise<T> {
    const r = await this.cdp.send<{ result: { value: T }; exceptionDetails?: { exception?: { description?: string }; text: string } }>(
      'Runtime.evaluate',
      { expression, awaitPromise: true, returnByValue: true },
      this.session,
    )
    if (r.exceptionDetails) throw new Error(`${this.name}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`)
    return r.result.value
  }

  // Ждать, пока на экране появится текст
  async waitText(text: string, timeout = TIMEOUT): Promise<void> {
    const started = Date.now()
    while (Date.now() - started < timeout) {
      const found = await this.eval<boolean>(`!!document.body && document.body.innerText.includes(${JSON.stringify(text)})`).catch(() => false)
      if (found) return
      await sleep(200)
    }
    const screen = await this.eval<string>('document.body ? document.body.innerText : ""').catch(() => '')
    throw new Error(`${this.name}: не дождался «${text}». На экране:\n${screen}`)
  }

  // Нажать видимую кнопку, ссылку или подпись (флажок, выбор) по тексту: сначала точное совпадение, потом начало
  async click(text: string): Promise<void> {
    const done = await this.eval<boolean>(`(() => {
      const text = ${JSON.stringify(text)}
      const all = [...document.querySelectorAll('button, a, label')].filter((el) => el.offsetParent !== null && !el.disabled)
      const el = all.find((e) => e.innerText.trim() === text) || all.find((e) => e.innerText.trim().startsWith(text))
      if (!el) return false
      el.click()
      return true
    })()`)
    if (!done) throw new Error(`${this.name}: нет кнопки «${text}»`)
  }

  // Ввести в поле с подписью label — как человек: React узнаёт о вводе по событию input
  async fill(label: string, value: string): Promise<void> {
    const done = await this.eval<boolean>(`(() => {
      const label = [...document.querySelectorAll('label')].find((l) => l.querySelector('span')?.textContent.trim() === ${JSON.stringify(label)})
      const input = label?.querySelector('input')
      if (!input) return false
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)})
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`)
    if (!done) throw new Error(`${this.name}: нет поля «${label}»`)
  }

  async value(selector: string): Promise<string> {
    return this.eval<string>(`document.querySelector(${JSON.stringify(selector)}).value`)
  }

  private metrics(height: number): Promise<unknown> {
    const { width } = this.size
    return this.cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 }, this.session)
  }

  // Снимок страницы целиком: длинная — экран на время снимка вытягивается во всю её высоту,
  // чтобы меню снизу (телефон) и слева (компьютер) встали, как при прокрутке до конца
  async shot(file: string): Promise<void> {
    await sleep(400) // перерисовка и шрифты
    const height = await this.eval<number>('Math.max(document.documentElement.scrollHeight, innerHeight)')
    if (height > this.size.height) {
      await this.metrics(height)
      await sleep(300)
    }
    const { data } = await this.cdp.send<{ data: string }>('Page.captureScreenshot', { format: 'png' }, this.session)
    if (height > this.size.height) await this.metrics(this.size.height)
    const path = join(OUT, `${this.size.name}-${file}.png`)
    await writeFile(path, Buffer.from(data, 'base64'))
    console.log('  снимок', path)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── Сценарий ────────────────────────────────────────────────────────────────

async function scenario(cdp: Cdp, size: Size, server: RoomsServer, startServer: ServerModule['startServer']) {
  console.log(`Ширина ${size.width} px`)
  const host = await Device.open(cdp, size, 'ведущий')
  await host.goto(SITE + '#/')
  await host.waitText('Комнат пока нет')
  // Комнату ведущий создаёт на сервере снимков: адрес — в его «Настройках»
  await host.eval(`localStorage.setItem('torgsin.server', ${JSON.stringify(server.url)})`)
  await host.shot('01-moi-komnaty-pusto')

  await host.click('Создать комнату')
  await host.waitText('Новая комната')
  await host.fill('Название', 'Дача 2026')
  await host.fill('Ваше имя в комнате', 'Аня')
  await host.fill('Пароль компании', PASSWORD)
  await host.shot('02-sozdat-komnatu')
  await host.click('Создать')
  await host.waitText('Участники')
  await host.shot('03-komnata-vedushchego')

  await host.click('Пригласить')
  await host.waitText('Отправьте ссылку друзьям')
  const invite = await host.value('input[aria-label="Ссылка-приглашение"]')
  await host.shot('04-priglasit')

  // Друг открывает ссылку, сначала с занятым именем
  const friend = await Device.open(cdp, size, 'друг')
  await friend.goto(invite)
  await friend.waitText('Вход в комнату „Дача 2026“, ведущий — Аня')
  await friend.shot('05-vhod-po-ssylke')
  await friend.fill('Ваше имя в комнате', 'аня')
  await friend.click('Попроситься')
  await friend.waitText('Такое имя уже есть — добавьте букву')
  await friend.shot('06-imya-zanyato')
  await friend.fill('Ваше имя в комнате', 'Боря')
  await friend.click('Попроситься')
  await friend.waitText('Ждём, пока ведущий впустит')
  await friend.shot('07-ozhidanie')

  await host.click('Закрыть')
  await host.waitText('Заявки (1)')
  await host.shot('08-zayavki')
  await host.click('Впустить')
  await friend.waitText('Участники')
  await friend.waitText('Боря')
  await friend.shot('09-drug-v-komnate')
  await friend.goto(SITE + '#/')
  await friend.waitText('Дача 2026')
  await friend.shot('10-moi-komnaty-druga')
  // Сервер комнаты — из ссылки; «Настройки» друга остались по умолчанию
  await friend.goto(SITE + '#/settings')
  await friend.waitText('Сейчас: https://torg-sin.goigolden88.workers.dev')
  await friend.shot('11-nastroyki-druga')

  // Ещё одна заявка — ведущий отклоняет
  const other = await Device.open(cdp, size, 'другой друг')
  await other.goto(invite)
  await other.waitText('Вход в комнату')
  await other.fill('Ваше имя в комнате', 'Вера')
  await other.click('Попроситься')
  await other.waitText('Ждём, пока ведущий впустит')
  await host.waitText('Заявки (1)')
  await host.click('Отклонить')
  await other.waitText('Ведущий отклонил заявку')
  await other.shot('12-otkloneno')

  // «Попроситься снова»: форма с прежним именем, новая заявка; двойное нажатие — одна заявка (Р-13)
  await other.click('Попроситься снова')
  await other.waitText('Вход в комнату „Дача 2026“, ведущий — Аня')
  const again = await other.value('.join input')
  if (again !== 'Вера') throw new Error('В поле не прежнее имя: ' + again)
  await other.shot('12a-poprositsya-snova')
  await other.eval(`(() => {
    const button = document.querySelector('.join button[type="submit"]')
    button.click()
    button.click()
  })()`)
  await other.waitText('Ждём, пока ведущий впустит')
  await other.shot('12b-snova-ozhidanie')
  await host.waitText('Заявки (1)')
  await sleep(6000) // ещё один опрос ведущего: второй заявки не появилось
  const requests = await host.eval<string>('document.body.innerText')
  if (requests.includes('Заявки (2)')) throw new Error('Двойное нажатие дало две заявки')
  await host.shot('12c-snova-zayavka')
  await host.click('Впустить')
  await other.waitText('Участники')
  await other.waitText('Боря')
  await other.shot('12d-snova-v-komnate')

  // Ссылка для другого устройства: ведущий выдаёт за Борю и отвязывает его старый телефон
  await host.waitText('Боря')
  await host.click('Ссылка для другого устройства')
  await host.waitText('Для кого')
  await host.click('Боря')
  await host.click('Отвязать старый телефон')
  await host.shot('13-ssylka-ustroystva-vybor')
  await host.click('Получить ссылку')
  await host.waitText('сработает один раз, до')
  const device = await host.value('input[aria-label="Ссылка для другого устройства"]')
  await host.shot('14-ssylka-ustroystva')

  const computer = await Device.open(cdp, size, 'компьютер Бори')
  await computer.goto(device)
  await computer.waitText('Открыть комнату здесь')
  await computer.shot('15-otkryt-na-ustroystve')
  await computer.click('Открыть комнату здесь')
  await computer.waitText('Участники')
  await computer.waitText('Аня')
  await computer.shot('16-komnata-na-drugom-ustroystve')
  // Ссылка одноразовая
  await computer.goto(SITE + '#/')
  await computer.goto(device)
  await computer.waitText('уже есть на этом устройстве')
  // Старый телефон Бори отвязан
  await friend.goto(SITE + '#/')
  await friend.goto(SITE + '#/room/' + device.split('#/device/')[1].split('/')[0])
  await friend.waitText('Нет доступа')
  await friend.shot('17-staryy-telefon-otvyazan')

  // Сменить ссылку — старая не работает
  await host.click('Пригласить')
  await host.click('Сменить ссылку')
  await host.waitText('Сменить ссылку?')
  await host.shot('18-smenit-ssylku')
  await host.click('Да, сменить')
  await host.waitText('Ссылка новая')
  const renewed = await host.value('input[aria-label="Ссылка-приглашение"]')
  if (renewed === invite) throw new Error('Ссылка не сменилась')
  const stranger = await Device.open(cdp, size, 'новый друг')
  await stranger.goto(invite)
  await stranger.waitText('Ссылка недействительна — попросите новую у ведущего')
  await stranger.shot('19-staraya-ssylka')

  // Ссылка на другой сервер; сервер пропал — «Нет связи с сервером», имя не стёрлось
  const spare = await startServer({ file: ':memory:', password: PASSWORD, port: 0 })
  const created = (await (
    await fetch(spare.url + '/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: PASSWORD, name: 'Футбол по средам', currency: 'PTS', hostName: 'Олег' }),
    })
  ).json()) as { roomId: string; invite: string }
  const spareLink = `${SITE}#/join/${created.roomId}/${created.invite}?server=${encodeURIComponent(spare.url)}`
  await stranger.goto(SITE + '#/')
  await stranger.goto(spareLink)
  await stranger.waitText('Вход в комнату „Футбол по средам“, ведущий — Олег')
  await stranger.fill('Ваше имя в комнате', 'Гена')
  await spare.close()
  await stranger.click('Попроситься')
  await stranger.waitText('Нет связи с сервером')
  const kept = await stranger.eval<string>(`document.querySelector('.join input').value`)
  if (kept !== 'Гена') throw new Error('Имя стёрлось: ' + kept)
  await stranger.shot('20-net-svyazi')
}

// Раскладка компьютера: две комнаты, в открытой — два участника; меню развёрнуто и свёрнуто
async function layout(cdp: Cdp, size: Size, server: RoomsServer) {
  console.log(`Раскладка компьютера, ${size.width} px`)
  const host = await Device.open(cdp, size, 'ведущий')
  await host.goto(SITE + '#/')
  await host.waitText('Комнат пока нет')
  await host.eval(`localStorage.setItem('torgsin.server', ${JSON.stringify(server.url)})`)
  for (const name of ['Футбол по средам', 'Дача 2026']) {
    await host.click('Создать комнату')
    await host.waitText('Новая комната')
    await host.fill('Название', name)
    await host.fill('Ваше имя в комнате', 'Аня')
    await host.fill('Пароль компании', PASSWORD)
    await host.click('Создать')
    await host.waitText('Участники')
  }
  await host.click('Пригласить')
  await host.waitText('Отправьте ссылку друзьям')
  const invite = await host.value('input[aria-label="Ссылка-приглашение"]')
  await host.click('Закрыть')
  const friend = await Device.open(cdp, size, 'друг')
  await friend.goto(invite)
  await friend.waitText('Вход в комнату')
  await friend.fill('Ваше имя в комнате', 'Боря')
  await friend.click('Попроситься')
  await friend.waitText('Ждём, пока ведущий впустит')
  await host.waitText('Заявки (1)')
  await host.click('Впустить')
  await friend.waitText('Участники')
  await host.reload()
  await host.waitText('Боря')
  await host.shot('21-komnata-menu-razvernuto')
}

async function main(): Promise<void> {
  await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })
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
    for (const size of SIZES) await scenario(cdp, size, server, module.startServer)
    for (const size of WIDE) await layout(cdp, size, server)
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

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  },
)
