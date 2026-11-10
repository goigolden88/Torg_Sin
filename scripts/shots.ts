// Снимки экранов для отчёта PR (Р-10: каждый экран — на 390 и 1280 px; раскладка компьютера —
// меню развёрнуто и свёрнуто — ещё и на 1920 px; событие — на 1024, 1280, 1440, 1536, 1920 и
// 2560 px с проверкой, что оно во всю ширину области, по центру и от 1280 px в две колонки): npm run shots.
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
// Узкий компьютер: событие с развёрнутым меню должно получить свою ширину (≥ 640 px)
const LAPTOP: Size = { name: '1024', width: 1024, height: 768 }
// Событие на ширинах ноутбука и монитора: карточка — во всю ширину области, не шире
// --content-max, по центру; от 1280 px — две колонки (#38)
const EVENT_WIDTHS: Size[] = [
  LAPTOP,
  SIZES[1],
  { name: '1440', width: 1440, height: 900 },
  { name: '1536', width: 1536, height: 864 },
  WIDE[1],
  { name: '2560', width: 2560, height: 1440 },
]
const CONTENT_MAX = 1600 // --content-max, 100 rem при шрифте 16 px
const TIMEOUT = 20_000 // ожидание экрана: опрос сервера — раз в 5 секунд

type RoomsServer = { url: string; close: () => Promise<void> }
type ServerModule = {
  // now — подставные часы сервера (исход: сутки на возражение, 7 дней до «окончательно» — без ожидания);
  // seed — зерно жребия суда (выдуманное: снимки одинаковы от прогона к прогону)
  startServer: (options: { file: string; password: string | undefined; port: number; now?: () => number; seed?: () => string }) => Promise<RoomsServer>
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

  // options: userAgent — чужой браузер (iPhone, Android); standalone — открыто с экрана «Домой»
  // (navigator.standalone, как у iPhone); clipboard — сайту можно писать в буфер обмена
  static async open(
    cdp: Cdp,
    size: Size,
    name: string,
    options: { userAgent?: string; standalone?: boolean; clipboard?: boolean } = {},
  ): Promise<Device> {
    const { browserContextId } = await cdp.send<{ browserContextId: string }>('Target.createBrowserContext')
    const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank', browserContextId })
    const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true })
    await cdp.send('Page.enable', {}, sessionId)
    if (options.userAgent) await cdp.send('Emulation.setUserAgentOverride', { userAgent: options.userAgent }, sessionId)
    if (options.standalone) {
      await cdp.send(
        'Page.addScriptToEvaluateOnNewDocument',
        { source: `Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true })` },
        sessionId,
      )
    }
    if (options.clipboard) {
      await cdp.send('Browser.grantPermissions', {
        permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
        origin: new URL(SITE).origin,
        browserContextId,
      })
    }
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

  // Ждать текст внутри блока selector («Ваша позиция»); неразрывные пробелы сумм — как обычные.
  // Возвращает весь текст блока — для проверки, чего в нём быть не должно
  async waitIn(selector: string, text: string, timeout = TIMEOUT): Promise<string> {
    const read = `(document.querySelector(${JSON.stringify(selector)})?.innerText ?? '').replace(/\\u00a0/g, ' ')`
    const started = Date.now()
    let seen = ''
    while (Date.now() - started < timeout) {
      seen = await this.eval<string>(read).catch(() => '')
      if (seen.includes(text)) return seen
      await sleep(200)
    }
    throw new Error(`${this.name}: в ${selector} не дождался «${text}». В блоке:\n${seen}`)
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
      const input = label?.querySelector('input, textarea')
      if (!input) return false
      const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, ${JSON.stringify(value)})
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })()`)
    if (!done) throw new Error(`${this.name}: нет поля «${label}»`)
  }

  async value(selector: string): Promise<string> {
    return this.eval<string>(`document.querySelector(${JSON.stringify(selector)}).value`)
  }

  // Ждать, пока на экране станет n элементов selector (строки ленты ставок и т. п.)
  async waitCount(selector: string, n: number, timeout = TIMEOUT): Promise<void> {
    const started = Date.now()
    let count = -1
    while (Date.now() - started < timeout) {
      count = await this.eval<number>(`document.querySelectorAll(${JSON.stringify(selector)}).length`).catch(() => -1)
      if (count === n) return
      await sleep(200)
    }
    throw new Error(`${this.name}: ждал ${n} × ${selector}, на экране ${count}`)
  }

  // Ключ телефона комнаты — из хранилища устройства (для запросов сценария к серверу в обход экрана)
  async roomKey(roomId: string): Promise<string> {
    return this.eval<string>(`new Promise((resolve, reject) => {
      const open = indexedDB.open('torgsin')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const get = open.result.transaction('rooms').objectStore('rooms').get(${JSON.stringify(roomId)})
        get.onsuccess = () => {
          open.result.close()
          resolve(get.result.key)
        }
        get.onerror = () => reject(get.error)
      }
    })`)
  }

  // Переписать комнаты в хранилище устройства в обход сайта: edit — тело функции (room) => void,
  // которая правит запись на месте (копия «как до нового поля», испорченная запись)
  async editRooms(edit: string): Promise<void> {
    await this.eval(`new Promise((resolve, reject) => {
      const edit = (room) => { ${edit} }
      const open = indexedDB.open('torgsin')
      open.onerror = () => reject(open.error)
      open.onsuccess = () => {
        const tx = open.result.transaction('rooms', 'readwrite')
        const rooms = tx.objectStore('rooms')
        const all = rooms.getAll()
        all.onsuccess = () => all.result.forEach((room) => {
          edit(room)
          rooms.put(room)
        })
        tx.oncomplete = () => {
          open.result.close()
          resolve(true)
        }
        tx.onerror = () => reject(tx.error)
      }
    })`)
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

  // Сменить ширину окна (раскладка события на ширинах компьютера)
  async resize(size: Size): Promise<void> {
    this.size = size
    await this.metrics(size.height)
    await sleep(200)
  }

  // Снимок на другой ширине (событие на 1024 px), затем — обратно
  async shotAt(size: Size, file: string): Promise<void> {
    const own = this.size
    this.size = size
    try {
      await this.metrics(size.height)
      await this.shot(file)
    } finally {
      this.size = own
      await this.metrics(own.height)
    }
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
  // Кнопка сворачивания меню — только на компьютере (от 1024 px)
  const toggle = await host.eval<boolean>(`document.querySelector('.nav-toggle').offsetParent !== null`)
  if (toggle !== size.width >= 1024) throw new Error(`Кнопка сворачивания меню ${toggle ? 'видна' : 'не видна'} на ${size.width} px`)
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

  await events(host, friend, size, server)

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

// Запрос сценария к серверу в обход экрана (событие с близким сроком закрытия, ставки на нём);
// key пустой — без ключа (создать комнату, заявка)
async function api<T>(server: RoomsServer, path: string, key: string, body: object): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (key) headers.Authorization = 'Bearer ' + key
  const res = await fetch(server.url + path, { method: 'POST', headers, body: JSON.stringify(body) })
  const json = (await res.json()) as T
  if (!res.ok) throw new Error(`${path}: ${JSON.stringify(json)}`)
  return json
}

// Подтвердить ставку в окне; двойное нажатие — ставка должна быть одна (Р-13)
async function confirmBet(device: Device): Promise<void> {
  await device.eval(`(() => {
    const button = document.querySelector('.modal .button')
    button.click()
    button.click()
  })()`)
  await device.waitText('Ставка принята')
}

// Выбрать точку графика вероятности: место по ширине рисунка (0 — начало оси, 1 — конец);
// hover — наведением мыши (компьютер), иначе нажатием (телефон)
async function pickPoint(device: Device, fraction: number, hover: boolean): Promise<void> {
  const done = await device.eval<boolean>(`(() => {
    const plot = document.querySelector('.chart-plot')
    if (!plot) return false
    const box = plot.getBoundingClientRect()
    const init = { bubbles: true, clientX: box.left + box.width * ${fraction}, clientY: box.top + box.height / 2 }
    if (${hover}) plot.dispatchEvent(new PointerEvent('pointermove', { ...init, pointerType: 'mouse' }))
    else plot.dispatchEvent(new MouseEvent('click', init))
    return true
  })()`)
  if (!done) throw new Error('Нет графика вероятности')
}

// События: пусто → новое событие → друг ставит с подтверждением → у ведущего обновилось само →
// ведущий ставит на другой исход → лента и позиция → приём закрыт → отменено ведущим с причиной →
// свои варианты с «Другое» → отменено автором → список событий
async function events(host: Device, friend: Device, size: Size, server: RoomsServer) {
  const roomId = (await host.eval<string>('location.hash')).split('/')[2]
  await host.waitText('Событий пока нет')
  await host.shot('12e-sobytiy-net')

  await host.click('Новое событие')
  await host.waitText('Приём ставок до')
  await host.fill('Условие', 'В субботу на даче будет дождь')
  await host.fill('Как проверяем', 'Кто на даче — в полдень присылает фото неба в общий чат')
  // В комнате трое — суда может не хватить (#63)
  await host.waitText('В маленькой комнате суда может не хватить: судят только не ставившие.')
  await host.shot('12f-novoe-sobytie')
  await host.click('Завести событие')
  await host.waitText('Банк пока пуст')
  const eventHash = await host.eval<string>('location.hash')

  // Друг видит событие в комнате и ставит 300 ₽ на «Да»
  await friend.goto(SITE + '#/room/' + roomId)
  await friend.waitText('В субботу на даче будет дождь')
  await friend.waitText('осталось')
  await friend.click('В субботу на даче будет дождь')
  await friend.waitText('Банк пока пуст')
  await friend.click('Да')
  await friend.fill('Сумма, ₽', '300')
  await friend.click('Поставить')
  await friend.waitText('при нынешних ставках получите')
  await friend.shot('12g-podtverzhdenie-stavki')
  await confirmBet(friend)
  await friend.waitCount('.feed-row', 1)
  // Одна ставка — графика ещё нет
  await friend.waitText('График появится после второй ставки')
  await friend.shot('12g1-grafik-malo-stavok')

  // У ведущего — сам, опросом раз в 5 с; ставит 450 ₽ на «Нет»
  await host.waitCount('.feed-row', 1)
  await host.click('Нет')
  await host.fill('Сумма, ₽', '450')
  await host.click('Поставить')
  await host.waitText('при нынешних ставках получите')
  await confirmBet(host)
  await host.waitCount('.feed-row', 2)
  await host.waitCount('.chart-plot', 1)
  await host.shot('12h-sobytie-s-bankom')
  if (size.width >= 1024) await host.shotAt(LAPTOP, '12h-sobytie-s-bankom')
  // Подпись ставки: на телефоне — нажатием, на компьютере — наведением
  await pickPoint(host, 1, size.width >= 1024)
  await host.waitText('После этой ставки')
  await host.waitText('Аня (вы): 450')
  await host.shot('12h1-grafik-da-net')
  // У друга график появился сам, опросом, без перезагрузки
  await friend.waitCount('.chart-plot', 1)
  await friend.waitCount('.feed-row', 2)
  await sleep(6000) // ещё опрос: двойное нажатие не дало второй ставки
  await friend.waitCount('.feed-row', 2)
  await friend.shot('12i-lenta-i-pozitsiya')

  // График с 4 исходами (3 своих и «Другое») и с 7 (6 своих и «Другое»): ставки — через сервер,
  // с паузой, чтобы точки разошлись по времени
  const hostKey = await host.roomKey(roomId)
  const friendKey = await friend.roomKey(roomId)
  const many = async (condition: string, titles: string[], bets: [string, string, number][], file: string) => {
    const closesAt = Date.now() + 24 * 60 * 60 * 1000
    const { event } = await api<{ event: { id: string } }>(server, `/rooms/${roomId}/events`, hostKey, {
      condition,
      check: 'Фото в общий чат',
      outcomes: titles,
      closesAt,
      expectedAt: closesAt + 60 * 60 * 1000,
    })
    for (const [key, outcome, amount] of bets) {
      await sleep(700)
      await api(server, `/rooms/${roomId}/events/${event.id}/bets`, key, { outcome, amount })
    }
    await host.goto(SITE + `#/room/${roomId}/event/${event.id}`)
    await host.waitCount('.chart-key', titles.length + 1)
    await pickPoint(host, 0.75, size.width >= 1024)
    await host.waitText('После этой ставки')
    await host.shot(file)
  }
  await many(
    'Какую рыбу поймаем первой',
    ['Окунь', 'Щука', 'Лещ'],
    [
      [friendKey, '1', 20000],
      [hostKey, '2', 30000],
      [friendKey, '3', 10000],
      [hostKey, '4', 15000],
      [friendKey, '2', 25000],
      [hostKey, '1', 40000],
    ],
    '12i1-grafik-4-iskhoda',
  )
  await many(
    'Кто приедет на дачу последним',
    ['Аня', 'Боря', 'Вера', 'Гена', 'Дима', 'Женя'],
    [
      [friendKey, '1', 10000],
      [hostKey, '2', 20000],
      [friendKey, '3', 15000],
      [hostKey, '4', 5000],
      [friendKey, '5', 12000],
      [hostKey, '6', 8000],
      [friendKey, '7', 6000],
      [hostKey, '3', 20000],
    ],
    '12i2-grafik-7-iskhodov',
  )

  // Приём закрыт: событие со сроком через 8 секунд — через сервер, минуя экран
  const closesAt = Date.now() + 8000
  const { event } = await api<{ event: { id: string } }>(server, `/rooms/${roomId}/events`, hostKey, {
    condition: 'Электричка в 18:05 придёт без опоздания',
    check: 'Табло на станции и фото в чат',
    closesAt,
    expectedAt: closesAt + 60 * 60 * 1000,
  })
  await api(server, `/rooms/${roomId}/events/${event.id}/bets`, friendKey, { outcome: '1', amount: 20000 })
  await api(server, `/rooms/${roomId}/events/${event.id}/bets`, hostKey, { outcome: '2', amount: 50000 })
  await host.goto(SITE + `#/room/${roomId}/event/${event.id}`)
  await host.waitText('Приём ставок закрыт')
  const betButton = await host.eval<boolean>(`[...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Поставить')`)
  if (betButton) throw new Error('После закрытия приёма кнопка «Поставить» осталась')
  await host.shot('12j-priyom-zakryt')

  // Ведущий отменяет закрытое: причина обязательна
  await host.click('Отменить')
  await host.click('Да, отменить')
  await host.waitText('Нужна причина отмены')
  await host.fill('Причина отмены', 'Электричку отменили — спорить не о чем')
  await host.click('Да, отменить')
  await host.waitText('отменено — ставки возвращены')
  await host.shot('12k-otmeneno-vedushchim')

  // Свои варианты: под ними видно «Другое»; автор отменяет, пока приём идёт
  await friend.goto(SITE + `#/room/${roomId}/event/new`)
  await friend.waitText('Приём ставок до')
  await friend.fill('Условие', 'Кто первым доплывёт до буйка')
  await friend.fill('Как проверяем', 'Смотрим с берега, Вера судит')
  await friend.click('Свои варианты')
  await friend.fill('Вариант 1', 'Аня')
  await friend.fill('Вариант 2', 'Боря')
  await friend.click('Вера')
  await friend.shot('12l-novoe-svoi-varianty')
  await friend.click('Завести событие')
  await friend.waitText('Другое (ничего из перечисленного)')
  await friend.waitText('Банк пока пуст')
  await friend.click('Отменить событие')
  await friend.waitText('Отменить событие?')
  await friend.click('Да, отменить')
  await friend.waitText('отменено — ставки возвращены')
  await friend.shot('12m-otmeneno-avtorom')

  // Список событий: открытые сверху, ниже закрытые и отменённые
  await host.goto(SITE + '#/room/' + roomId)
  await host.waitText('Закрытые и отменённые')
  await host.waitText('Кто первым доплывёт до буйка')
  await host.shot('12n-spisok-sobytiy')
  if (!eventHash.includes('/event/')) throw new Error('После «Завести событие» открылось не событие: ' + eventHash)
}

// Подтвердить действие с исходом в окне; двойное нажатие — одно действие (Р-13)
async function confirmTwice(device: Device, done: string): Promise<void> {
  await device.eval(`(() => {
    const button = document.querySelector('.modal .button')
    button.click()
    button.click()
  })()`)
  await device.waitText(done)
}

// Исход события. Свой запасной сервер с подставными часами: сдвигаем их вперёд — приём закрыт,
// сутки на возражение прошли, 7 дней до «окончательно» — без ожидания; отсчёт на сайте — от now
// сервера. Комната «Рыбалка»: Аня — ведущая, Боря, Вера; на устройства — ссылкой для другого
// устройства. Три события: ведущая не ставила — решает она; ставила — голосует Вера; все на один
// исход — «без игры»
async function outcomes(cdp: Cdp, size: Size, startServer: ServerModule['startServer']) {
  console.log(`Исход события, ${size.width} px`)
  const HOUR = 60 * 60 * 1000
  let shift = 0
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0, now: () => Date.now() + shift })
  try {
    const room = await api<{ roomId: string; invite: string; key: string }>(server, '/rooms', '', {
      password: PASSWORD,
      name: 'Рыбалка',
      currency: 'RUB',
      hostName: 'Аня',
    })
    const rooms = `/rooms/${room.roomId}`
    const join = async (name: string) => {
      const j = await api<{ memberId: string; key: string }>(server, `${rooms}/join`, '', { invite: room.invite, name })
      await api(server, `${rooms}/admit`, room.key, { request: j.memberId })
      return j.key
    }
    const hostKey = room.key
    const boryaKey = await join('Боря')
    const veraKey = await join('Вера')
    const open = async (name: string, key: string) => {
      const { token } = await api<{ token: string }>(server, `${rooms}/device`, key, {})
      const device = await Device.open(cdp, size, name)
      await device.goto(`${SITE}#/device/${room.roomId}/${token}?server=${encodeURIComponent(server.url)}`)
      await device.waitText('Открыть комнату здесь')
      await device.click('Открыть комнату здесь')
      await device.waitText('Участники')
      return device
    }
    const host = await open('Аня', hostKey)
    const borya = await open('Боря', boryaKey)
    const vera = await open('Вера', veraKey)

    // «Ваша позиция» после утверждения (#39): итог из строки выплат, без прикидки «если выиграет».
    // Снимки позиции на компьютере — ещё и на 1440 px
    const POSITION = 'section[aria-label="Ваша позиция"]'
    const position = async (device: Device, text: string) => {
      const seen = await device.waitIn(POSITION, text)
      if (seen.includes('если выиграет')) throw new Error(`После утверждения в «Вашей позиции» осталась прикидка:\n${seen}`)
    }
    const shotWide = async (device: Device, file: string) => {
      await device.shot(file)
      if (size.width >= 1024) await device.shotAt(EVENT_WIDTHS[2], file)
    }

    // Событие с приёмом на 3 секунды по часам сервера и ставками
    const event = async (key: string, condition: string, check: string, bets: [string, string, number][]) => {
      const closesAt = Date.now() + shift + 3000
      const { event } = await api<{ event: { id: string } }>(server, `${rooms}/events`, key, { condition, check, closesAt, expectedAt: closesAt + HOUR })
      for (const [k, outcome, amount] of bets) await api(server, `${rooms}/events/${event.id}/bets`, k, { outcome, amount })
      return { id: event.id, href: `${SITE}#/room/${room.roomId}/event/${event.id}` }
    }
    const pike = await event(boryaKey, 'Боря поймает щуку больше двух килограммов', 'Весы на причале, фото в общий чат', [
      [boryaKey, '1', 30000],
      [veraKey, '2', 50000],
    ])
    // Аня ставит на оба исхода — в позиции общая сумма и ставки по исходам
    const ten = await event(hostKey, 'К обеду клюнет хотя бы десять рыб', 'Считаем улов в ведре в 14:00', [
      [hostKey, '1', 40000],
      [boryaKey, '2', 60000],
      [hostKey, '2', 10000],
    ])
    const boat = await event(hostKey, 'Лодку на базе дадут без очереди', 'Кто первым придёт на базу — пишет в чат', [
      [boryaKey, '1', 20000],
      [veraKey, '1', 30000],
    ])
    shift += HOUR // приём закрыт у всех трёх

    // Автор (Боря) предлагает «Да» — выбор, подтверждение
    await borya.goto(pike.href)
    await borya.waitText('Исход ещё не предложен')
    await borya.click('Да')
    await borya.click('Предложить исход')
    await borya.waitText('Ставившие смогут согласиться или возразить в течение суток')
    await borya.shot('24-predlozhit-iskhod')
    await confirmTwice(borya, 'возразить до')
    await borya.waitIn(POSITION, 'если выиграет — получите') // не утверждён — прикидка, как прежде
    await borya.shot('25-iskhod-predlozhen')

    // Вера ставила на «Нет» — возражает с причиной; у Бори появляется само (опрос раз в 5 с)
    await vera.goto(pike.href)
    await vera.waitText('возразить до')
    await vera.click('Возразить')
    await vera.click('Возразить')
    await vera.waitText('Нужна причина возражения')
    await vera.fill('Причина возражения', 'Взвешивали вместе с садком')
    await vera.click('Возразить')
    await vera.waitText('Возразить против „Да“?')
    await confirmTwice(vera, 'Возражение: Вера (вы), Взвешивали вместе с садком')
    await vera.shot('26-vozrazhenie')
    await borya.waitText('Возражение: Вера, Взвешивали вместе с садком')

    // Ведущая не ставила — решает она
    await host.goto(pike.href)
    await host.waitText('решает ведущий')
    await host.click('Нет')
    await host.shot('27-reshenie-vedushchego')
    await host.click('Решить')
    await host.waitText('Утвердить „Нет“ решением ведущего?')
    await confirmTwice(host, 'Утверждён „Нет“ — ведущим')
    await position(host, 'Вы не ставили.')
    // Боря ставил 300 ₽ на «Да» — проиграл; Вера 500 ₽ на «Нет» — забрала банк
    await borya.waitText('Утверждён „Нет“ — ведущим')
    await position(borya, 'Утверждён „Нет“: вы поставили 300 ₽, получите 0 ₽ — итог −300 ₽')
    // Апелляции (#63): окончательно через 7 дней, если её не подадут; в «Рыбалке» судить некому —
    // ставили Боря и Вера, ведущая решила возражение
    await borya.waitText(', если до неё нет апелляции.')
    await borya.waitText('Апелляции нет: все участники заинтересованы.')
    await shotWide(borya, '28-utverzhden-vyplaty')
    await vera.waitText('Утверждён „Нет“ — ведущим')
    await position(vera, 'Утверждён „Нет“: вы поставили 500 ₽, получите 800 ₽ — итог +300 ₽')
    await shotWide(vera, '28a-pozitsiya-vyigral')
    const objections = await borya.eval<number>(`[...document.querySelectorAll('.outcome-log > li')].filter((li) => li.innerText.startsWith('Возражение')).length`)
    if (objections !== 1) throw new Error('Двойное нажатие дало возражений: ' + objections)

    // Ведущая ставила — после возражения Бори голосует не ставившая Вера
    await api(server, `${rooms}/events/${ten.id}/propose`, hostKey, { outcome: '1' })
    await api(server, `${rooms}/events/${ten.id}/object`, boryaKey, { reason: 'Мальков не считаем' })
    await vera.goto(ten.href)
    await vera.waitText('голосуют не ставившие')
    await vera.waitText('проголосовали 0 из 1')
    await vera.click('Да')
    await vera.shot('29-golosovanie')
    await vera.click('Голосовать')
    await vera.waitText('Голосовать за „Да“?')
    await confirmTwice(vera, 'Утверждён „Да“ — голосованием')
    await vera.shot('30-utverzhden-golosovaniem')
    // Аня: 400 ₽ на «Да» и 100 ₽ на «Нет» — банк 1 100 ₽ целиком её
    await host.goto(ten.href)
    await host.waitText('Утверждён „Да“ — голосованием')
    await position(host, 'Утверждён „Да“: вы поставили 500 ₽, получите 1 100 ₽ — итог +600 ₽')
    await position(host, 'ваши ставки: „Да“ 400 ₽, „Нет“ 100 ₽')
    await shotWide(host, '30a-pozitsiya-neskolko-iskhodov')

    // Все ставили на «Да», «Да» и утверждён — сутки без возражений: без игры
    await api(server, `${rooms}/events/${boat.id}/propose`, hostKey, { outcome: '1' })
    shift += 25 * HOUR
    await vera.goto(boat.href)
    await vera.waitText('Утверждён „Да“ — без возражений')
    await vera.waitText('Без игры: ставки возвращены')
    await position(vera, 'Без игры — вам вернётся 300 ₽.')
    await shotWide(vera, '31-bez-igry')

    // Через 7 дней после утверждения — «Окончательно»: «получили», «вернулось»
    shift += 7 * 24 * HOUR
    await borya.waitText('Окончательно.')
    await position(borya, 'Утверждён „Нет“: вы поставили 300 ₽, получили 0 ₽ — итог −300 ₽')
    await shotWide(borya, '32-okonchatelno')
    await position(vera, 'Без игры — вам вернулось 300 ₽.')

    // Согласие с исходом (Р-21). «Костёр»: ставили Боря и Вера, Боря предложил — у Веры «Согласны
    // 1 из 2» и кнопка; согласилась — все согласны, окончательно сразу. «Палатка»: ставили трое,
    // Аня предложила, Боря согласился, Вера молчит — у Бори «Вы согласны с исходом»
    const fire = await event(boryaKey, 'Костёр разведём с одной спички', 'Смотрим все вместе у мангала', [
      [boryaKey, '1', 20000],
      [veraKey, '2', 10000],
    ])
    const tent = await event(hostKey, 'Палатку поставим за десять минут', 'Засекаем на телефоне Ани', [
      [hostKey, '1', 10000],
      [boryaKey, '1', 10000],
      [veraKey, '2', 20000],
    ])
    shift += HOUR // приём закрыт у обоих
    await api(server, `${rooms}/events/${fire.id}/propose`, boryaKey, { outcome: '1' })
    await vera.goto(fire.href)
    await vera.waitText('Согласны 1 из 2 ставивших: Боря')
    await vera.shot('38-soglasny-1-iz-2')
    await vera.click('Согласен с исходом')
    await vera.waitText('Согласие не отозвать. Когда согласятся все ставившие, исход утвердится сразу и станет окончательным.')
    await vera.waitIn('.modal', 'Соглашаясь, вы отказываетесь возразить и подать апелляцию.')
    await vera.shot('38a-soglasie-podtverzhdenie')
    await confirmTwice(vera, 'Все ставившие согласны — утверждён')
    await vera.waitText('Утверждён „Да“ — все ставившие согласны')
    await vera.waitText('Окончательно.')
    await position(vera, 'Утверждён „Да“: вы поставили 100 ₽, получили 0 ₽ — итог −100 ₽')
    await shotWide(vera, '39-vse-soglasny-okonchatelno')
    const agreements = await vera.eval<number>(`[...document.querySelectorAll('.outcome-log > li')].filter((li) => li.innerText.startsWith('Согласие')).length`)
    if (agreements !== 1) throw new Error('Двойное нажатие дало согласий: ' + agreements)

    await api(server, `${rooms}/events/${tent.id}/propose`, hostKey, { outcome: '1' })
    await api(server, `${rooms}/events/${tent.id}/agree`, boryaKey, {})
    await borya.goto(tent.href)
    await borya.waitText('Вы согласны с исходом.')
    await borya.waitText('Согласны 2 из 3 ставивших: Аня, Боря (вы)')
    if (await borya.eval<boolean>(`[...document.querySelectorAll('button')].some((b) => /Согласен|Возразить/.test(b.innerText))`)) {
      throw new Error('У согласившегося остались кнопки «Согласен» или «Возразить»')
    }
    await borya.shot('40-vy-soglasny')

    // Старая копия на устройстве (#49): события записаны до согласий — у исхода нет agreements.
    // Экран события не падает: копию не показывает, ждёт сервер — и открывает событие с сервера.
    // Комната закрыта на время правки: опрос не перепишет копию раньше, чем откроется событие
    await borya.goto(`${SITE}#/`)
    await borya.waitText('Рыбалка')
    await borya.editRooms(`(room.events || []).forEach((e) => { if (e.outcome) delete e.outcome.agreements })`)
    await borya.reload()
    await borya.waitText('Рыбалка')
    await borya.goto(tent.href)
    await borya.waitText('Вы согласны с исходом.')
    await borya.waitText('Согласны 2 из 3 ставивших: Аня, Боря (вы)')
    if (await borya.eval<boolean>(`document.body.innerText.includes('Что-то пошло не так')`)) throw new Error('Старая копия события уронила экран')
    await borya.shot('41-staraya-kopiya-sobytiya')
  } finally {
    await server.close()
  }
}

// Пари (#52). Свой запасной сервер; комната «Дача 2026»: Аня — ведущая, Боря, Вера; на устройства —
// ссылкой для другого устройства. Пусто → Аня предлагает Боре «3 к 1, 300 ₽» (ведущая — сторона:
// гарант — Вера), двойное нажатие — одно пари → у Бори в списке с суммами обеих сторон → принимает с
// подтверждением → у Ани «принято» само. Открытое «2 к 1» → Боря делает встречное «1 к 3» → Аня
// видит, что встречное ждёт её ответа, принимает его — исходное «закрыто встречным». Отзыв своего
// до принятия. Список со всеми статусами; старая копия пари на устройстве — с сервера, не падение
async function offers(cdp: Cdp, size: Size, startServer: ServerModule['startServer']) {
  console.log(`Пари, ${size.width} px`)
  const HOUR = 60 * 60 * 1000
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0 })
  try {
    const room = await api<{ roomId: string; invite: string; key: string; memberId: string }>(server, '/rooms', '', {
      password: PASSWORD,
      name: 'Дача 2026',
      currency: 'RUB',
      hostName: 'Аня',
    })
    const rooms = `/rooms/${room.roomId}`
    const join = async (name: string) => {
      const j = await api<{ memberId: string; key: string }>(server, `${rooms}/join`, '', { invite: room.invite, name })
      await api(server, `${rooms}/admit`, room.key, { request: j.memberId })
      return j
    }
    const borya = await join('Боря')
    const vera = await join('Вера')
    const open = async (name: string, key: string) => {
      const { token } = await api<{ token: string }>(server, `${rooms}/device`, key, {})
      const device = await Device.open(cdp, size, name)
      await device.goto(`${SITE}#/device/${room.roomId}/${token}?server=${encodeURIComponent(server.url)}`)
      await device.waitText('Открыть комнату здесь')
      await device.click('Открыть комнату здесь')
      await device.waitText('Участники')
      return device
    }
    const host = await open('Аня', room.key)
    const boryaPhone = await open('Боря', borya.key)
    const roomHref = `${SITE}#/room/${room.roomId}`
    const offerHref = (id: string) => `${SITE}#/room/${room.roomId}/offer/${id}`
    const LIST = 'section[aria-label="Пари"]'
    // Выбор в форме по номеру участника: подписи «Боря» и «Вера» есть и у «Кому», и у «Гаранта»
    const pick = (device: Device, name: string, value: string) =>
      device.eval(`document.querySelector('input[name="${name}"][value="${value}"]').click()`)
    const buttons = (device: Device) =>
      device.eval<string[]>(`[...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null).map((b) => b.innerText.trim())`)
    const noScroll = async (device: Device, where: string) => {
      const scroll = await device.eval<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
      if (scroll > 0) throw new Error(`${where} на ${size.width} px: прокрутка вбок ${scroll} px`)
    }
    // От 1280 px — пари и список пари комнаты рядом; уже — одно под другим
    const columns = async (device: Device, where: string) => {
      const c = await device.eval<{ main: { right: number; bottom: number }; side: { left: number; top: number } }>(`(() => {
        const r = (el) => {
          const b = el.getBoundingClientRect()
          return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }
        }
        return { main: r(document.querySelector('.offer .event-main')), side: r(document.querySelector('.offer .event-side')) }
      })()`)
      const beside = c.side.left >= c.main.right - 1
      if (size.width >= 1280 ? !beside : c.side.top < c.main.bottom - 1) throw new Error(`${where} на ${size.width} px: колонки ${JSON.stringify(c)}`)
    }

    await host.goto(roomHref)
    await host.waitText('Пари пока нет')
    await host.shot('43-pari-net')

    // Адресное пари: Аня → Боря, «сбудется», 3 к 1, 300 ₽; ведущая — сторона, гарант — Вера
    await host.click('Предложить пари')
    await host.waitText('Ваша сторона')
    await host.fill('Условие', 'Боря подтянется 20 раз до конца месяца')
    await host.fill('Как проверяем', 'Видео в общий чат, считаем вместе')
    await host.fill('Вы рискуете', '3')
    await host.fill('Соперник', '1')
    await host.fill('Ваша сумма, ₽', '300')
    await pick(host, 'offer-to', borya.memberId)
    await host.waitText('Ведущий — сторона пари: выберите гаранта')
    await pick(host, 'offer-guarantor', vera.memberId)
    await host.waitIn('.offer-summary', 'Вы ставите 300 ₽ на „сбудется“, соперник — 100 ₽ на „не сбудется“, банк 400 ₽ (кэф 3 к 1).')
    await noScroll(host, 'Форма пари')
    await host.shot('44-novoe-pari')
    await host.click('Предложить')
    await host.waitText('Предложить пари?')
    await host.waitIn('.modal', 'Вы ставите 300 ₽ на „сбудется“, соперник — 100 ₽ (кэф 3 к 1), банк 400 ₽.')
    await host.waitIn('.modal', 'Кому: Боря · гарант — Вера')
    await host.shot('44a-podtverzhdenie-pari')
    await confirmTwice(host, 'открыто — приём до')
    await host.waitText('Отозвать')
    const own = await buttons(host)
    if (own.includes('Принять') || own.includes('Встречное')) throw new Error('Автору видны «Принять» или «Встречное»: ' + own.join(', '))
    await columns(host, 'Пари')
    await noScroll(host, 'Пари')
    await host.shot('45-pari-otkryto-avtor')

    // Боря видит пари в комнате — с суммами обеих сторон, принимает с подтверждением
    await boryaPhone.goto(roomHref)
    await boryaPhone.waitIn(LIST, 'Аня ставит 300 ₽ на „сбудется“, соперник — 100 ₽ (кэф 3 к 1), банк 400 ₽')
    await boryaPhone.waitIn(LIST, 'кому — Боря (вы)')
    await boryaPhone.waitIn(LIST, 'открыто — приём до')
    await boryaPhone.shot('46-spisok-pari')
    await boryaPhone.click('Боря подтянется 20 раз до конца месяца')
    await boryaPhone.waitText('Принять')
    await boryaPhone.shot('47-pari-adresatu')
    await boryaPhone.click('Принять')
    await boryaPhone.waitIn('.modal', 'Вы ставите 100 ₽ против 300 ₽ — кэф 3 к 1, банк 400 ₽.')
    await boryaPhone.shot('47a-prinyat-podtverzhdenie')
    await confirmTwice(boryaPhone, 'принято — ждём исхода к')
    const left = await buttons(boryaPhone)
    if (left.some((b) => ['Принять', 'Встречное', 'Отозвать'].includes(b))) throw new Error('У принятого пари остались кнопки: ' + left.join(', '))
    await boryaPhone.shot('48-pari-prinyato')
    await host.waitText('принято — ждём исхода к') // у Ани — само, опросом
    await host.waitText('Боря — за „не сбудется“, принято')

    // Открытое пари Ани — Боря делает встречное «1 к 3»: 100 ₽ против 300 ₽
    const closesAt = Date.now() + 24 * HOUR
    const { offer: wide } = await api<{ offer: { id: string } }>(server, `${rooms}/offers`, room.key, {
      condition: 'В субботу на рыбалке поймаем щуку',
      check: 'Фото улова в общий чат',
      odds: { a: 2, b: 1 },
      amount: 20000,
      closesAt,
      expectedAt: closesAt + 48 * HOUR,
      guarantor: vera.memberId,
    })
    await boryaPhone.goto(offerHref(wide.id))
    await boryaPhone.waitText('открытое — любой')
    await boryaPhone.click('Встречное')
    await boryaPhone.waitText('Встречное — новое пари, ответит автор — Аня')
    await boryaPhone.waitIn('.offer-summary', 'Вы ставите 100 ₽, Аня — 200 ₽, банк 300 ₽ (кэф 1 к 2).') // те же условия со своей стороны
    await boryaPhone.fill('Аня', '3')
    await boryaPhone.waitIn('.offer-summary', 'Вы ставите 100 ₽, Аня — 300 ₽, банк 400 ₽ (кэф 1 к 3).')
    await boryaPhone.shot('49-vstrechnoe-forma')
    await boryaPhone.click('Предложить встречное')
    await boryaPhone.waitText('Предложить встречное?')
    await boryaPhone.waitIn('.modal', 'Вы ставите 100 ₽ на „не сбудется“, Аня — 300 ₽ (кэф 1 к 3), банк 400 ₽.')
    await confirmTwice(boryaPhone, 'Встречное ждёт ответа автора — Аня.')
    await boryaPhone.shot('50-vstrechnoe-zhdyot')

    // Аня: у исходного — встречное ждёт её ответа; принимает его — исходное закрыто встречным
    await host.goto(offerHref(wide.id))
    await host.waitText('ждёт вашего ответа')
    await host.shot('51-vstrechnoe-u-avtora')
    await host.click('Боря предлагает встречное')
    await host.waitText('Встречное ждёт вашего ответа.')
    await host.click('Принять')
    await host.waitIn('.modal', 'Вы ставите 300 ₽ против 100 ₽ — кэф 1 к 3, банк 400 ₽.')
    await confirmTwice(host, 'принято — ждём исхода к')
    await host.goto(offerHref(wide.id))
    await host.waitText('закрыто встречным')
    await host.waitText('Закрыто встречным (встречное — Боря): автор принял его')
    await host.shot('52-zakryto-vstrechnym')

    // Отозвать своё до принятия
    const { offer: revoked } = await api<{ offer: { id: string } }>(server, `${rooms}/offers`, room.key, {
      condition: 'Вера приедет на дачу раньше всех',
      check: 'Кто первым напишет «я на месте» в чат',
      side: 'no',
      odds: { a: 1, b: 1 },
      amount: 50000,
      to: borya.memberId,
      closesAt,
      expectedAt: closesAt + 24 * HOUR,
      guarantor: vera.memberId,
    })
    await host.goto(offerHref(revoked.id))
    await host.waitText('Отозвать')
    await host.click('Отозвать')
    await host.waitText('Отозвать пари?')
    await host.shot('53-otozvat-podtverzhdenie')
    await confirmTwice(host, 'Автор отозвал пари')
    await host.shot('53a-otozvano')

    // Список: открытые и принятые сверху, ниже отозванные и закрытые встречным
    await host.goto(roomHref)
    await host.waitIn(LIST, 'Отозванные, истёкшие и закрытые встречным')
    await host.waitIn(LIST, 'отозвано')
    await noScroll(host, 'Комната с пари')
    await host.shot('54-spisok-pari-vse')
    // Двойные нажатия не дали лишних пари: четыре — два через экран, два через сервер, встречное
    const seen = (await (await fetch(server.url + rooms, { headers: { Authorization: 'Bearer ' + room.key } })).json()) as { offers: unknown[] }
    if (seen.offers.length !== 4) throw new Error('Пари на сервере: ' + seen.offers.length + ', а ждали 4')

    // Старая копия на устройстве: пари записаны до исхода (Р-23) — без outcome. Экран не падает,
    // копию не показывает, а пари открывается с сервера
    await boryaPhone.goto(`${SITE}#/`)
    await boryaPhone.waitText('Дача 2026')
    await boryaPhone.editRooms(`(room.offers || []).forEach((o) => { delete o.outcome })`)
    await boryaPhone.reload()
    await boryaPhone.waitText('Дача 2026')
    await boryaPhone.goto(offerHref(wide.id))
    await boryaPhone.waitText('закрыто встречным')
    if (await boryaPhone.eval<boolean>(`document.body.innerText.includes('Что-то пошло не так')`)) throw new Error('Старая копия пари уронила экран')
  } finally {
    await server.close()
  }
}

// Исход пари (#53). Свой запасной сервер с подставными часами: «исход к», 3 дня молчания и 7 дней до
// «окончательно» — сдвигом часов. Комната «Байдарки»: Аня — ведущая, Боря, Вера, Гена; на устройства —
// ссылкой для другого устройства. Пари 1 (Аня — Боря, гарант Вера): отметки совпали — окончательно
// сразу; Гена видит всё без кнопок. Пари 2 (Боря — Вера, гарант — ведущая Аня): отметки разошлись —
// решает гарант. Пари 3 (Аня — Вера, гарант Боря): Вера молчит 3 дня, Боря отказывается — стороны
// называют Гену. Двойные нажатия — по одной записи. Список с фазами исхода одной строкой
async function offerOutcomes(cdp: Cdp, size: Size, startServer: ServerModule['startServer']) {
  console.log(`Исход пари, ${size.width} px`)
  const HOUR = 60 * 60 * 1000
  const DAY = 24 * HOUR
  let shift = 0
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0, now: () => Date.now() + shift })
  try {
    const room = await api<{ roomId: string; invite: string; key: string; memberId: string }>(server, '/rooms', '', {
      password: PASSWORD,
      name: 'Байдарки',
      currency: 'RUB',
      hostName: 'Аня',
    })
    const rooms = `/rooms/${room.roomId}`
    const join = async (name: string) => {
      const j = await api<{ memberId: string; key: string }>(server, `${rooms}/join`, '', { invite: room.invite, name })
      await api(server, `${rooms}/admit`, room.key, { request: j.memberId })
      return j
    }
    const borya = await join('Боря')
    const vera = await join('Вера')
    const gena = await join('Гена')
    const open = async (name: string, key: string) => {
      const { token } = await api<{ token: string }>(server, `${rooms}/device`, key, {})
      const device = await Device.open(cdp, size, name)
      await device.goto(`${SITE}#/device/${room.roomId}/${token}?server=${encodeURIComponent(server.url)}`)
      await device.waitText('Открыть комнату здесь')
      await device.click('Открыть комнату здесь')
      await device.waitText('Участники')
      return device
    }
    const host = await open('Аня', room.key)
    const boryaPhone = await open('Боря', borya.key)
    const veraPhone = await open('Вера', vera.key)
    const genaPhone = await open('Гена', gena.key)
    const offerHref = (id: string) => `${SITE}#/room/${room.roomId}/offer/${id}`
    const OUTCOME = 'section[aria-label="Исход"]'
    const LIST = 'section[aria-label="Пари"]'
    const ACTIONS = ['Прав автор', 'Прав соперник', 'Отказаться', 'Назвать гарантом']
    const actions = (device: Device) =>
      device.eval<string[]>(
        `[...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null && !b.disabled).map((b) => b.innerText.trim()).filter((t) => ${JSON.stringify(ACTIONS)}.includes(t))`,
      )
    const noScroll = async (device: Device, where: string) => {
      const scroll = await device.eval<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
      if (scroll > 0) throw new Error(`${where} на ${size.width} px: прокрутка вбок ${scroll} px`)
    }
    // Кнопки исхода не ниже 44 px
    const tall = async (device: Device, where: string) => {
      const low = await device.eval<number>(
        `[...document.querySelectorAll('${OUTCOME} button')].filter((b) => b.offsetParent !== null && b.getBoundingClientRect().height < 44).length`,
      )
      if (low > 0) throw new Error(`${where} на ${size.width} px: кнопок исхода ниже 44 px — ${low}`)
    }
    // От 1280 px — пари и список пари рядом; уже — одно под другим
    const columns = async (device: Device, where: string) => {
      const c = await device.eval<{ main: { right: number; bottom: number }; side: { left: number; top: number } }>(`(() => {
        const r = (el) => {
          const b = el.getBoundingClientRect()
          return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }
        }
        return { main: r(document.querySelector('.offer .event-main')), side: r(document.querySelector('.offer .event-side')) }
      })()`)
      const beside = c.side.left >= c.main.right - 1
      if (size.width >= 1280 ? !beside : c.side.top < c.main.bottom - 1) throw new Error(`${where} на ${size.width} px: колонки ${JSON.stringify(c)}`)
    }
    const check = async (device: Device, where: string) => {
      await noScroll(device, where)
      await tall(device, where)
      await columns(device, where)
    }
    // Пари через сервер: принять сразу; «исход к» — через час после «приём до»
    const offer = async (key: string, takerKey: string, body: object) => {
      const closesAt = Date.now() + shift + HOUR
      const { offer } = await api<{ offer: { id: string } }>(server, `${rooms}/offers`, key, { closesAt, expectedAt: closesAt + HOUR, ...body })
      await api(server, `${rooms}/offers/${offer.id}/accept`, takerKey, {})
      return offer.id
    }
    const agree = await offer(room.key, borya.key, {
      condition: 'Пройдём порог без переворота',
      check: 'Видео с берега, смотрим вместе',
      odds: { a: 3, b: 1 },
      amount: 30000,
      to: borya.memberId,
      guarantor: vera.memberId,
    })
    const split = await offer(borya.key, vera.key, {
      condition: 'Дойдём до стоянки к шести вечера',
      check: 'Время по телефону Бори у костра',
      odds: { a: 1, b: 1 },
      amount: 50000,
      to: vera.memberId,
    })
    const lapse = await offer(room.key, vera.key, {
      condition: 'Дождя за весь сплав не будет',
      check: 'Кто промок — пишет в чат',
      odds: { a: 1, b: 2 },
      amount: 20000,
      to: vera.memberId,
      guarantor: borya.memberId,
    })

    // До «исход к» — блока исхода нет, кнопок нет
    await host.goto(offerHref(agree))
    await host.waitText('принято — ждём исхода к')
    if ((await actions(host)).length > 0) throw new Error('Кнопки исхода до «исход к»: ' + (await actions(host)).join(', '))
    shift += 3 * HOUR // «исход к» настал у всех трёх

    // Пари 1. Аня отмечает «прав автор» — с подтверждением и итогом
    await host.waitText('Ждём отметок сторон')
    await host.click('Прав автор')
    await host.waitIn('.modal', 'Вы отмечаете: прав автор — Аня получает банк 400 ₽: Аня +100 ₽, Боря −100 ₽.')
    await host.waitIn('.modal', 'Если соперник отметит так же, исход окончательный сразу и не обжалуется.')
    await host.shot('55-otmetka-podtverzhdenie')
    await confirmTwice(host, 'Ваша отметка: прав автор')
    await host.waitIn(OUTCOME, 'Боря, соперник: ещё не отметил(а)')
    await check(host, 'Пари: ждём отметок')
    await host.shot('56-pari-zhdyom-otmetok')

    // Гена — не сторона и не гарант: видит всё без кнопок
    await genaPhone.goto(offerHref(agree))
    await genaPhone.waitIn(OUTCOME, 'Аня, автор: прав автор')
    if ((await actions(genaPhone)).length > 0) throw new Error('У не-стороны кнопки исхода: ' + (await actions(genaPhone)).join(', '))
    await genaPhone.shot('57-pari-nablyudatel')

    // Боря отмечает так же — утверждено согласием, окончательно сразу
    await boryaPhone.goto(offerHref(agree))
    await boryaPhone.waitIn(OUTCOME, 'Аня, автор: прав автор')
    await boryaPhone.click('Прав автор')
    await boryaPhone.waitIn('.modal', 'Автор уже отметил так же — исход станет окончательным сразу и не обжалуется.')
    await confirmTwice(boryaPhone, 'Утверждено согласием сторон, окончательно')
    await boryaPhone.waitIn('section[aria-label="Итог пари"]', 'Боря (вы) — −100 ₽')
    await boryaPhone.waitIn('section[aria-label="Итог пари"]', 'Аня — +100 ₽')
    if ((await actions(boryaPhone)).length > 0) throw new Error('После согласия остались кнопки: ' + (await actions(boryaPhone)).join(', '))
    await check(boryaPhone, 'Пари: окончательно')
    await boryaPhone.shot('58-soglasie-okonchatelno')
    await genaPhone.waitText('Утверждено согласием сторон, окончательно') // у Гены — само, опросом

    // Пари 2. Боря — «прав автор», Вера — «прав соперник»: решает гарант — ведущая Аня
    await api(server, `${rooms}/offers/${split}/mark`, borya.key, { winner: 'author' })
    await api(server, `${rooms}/offers/${split}/mark`, vera.key, { winner: 'taker' })
    await host.goto(offerHref(split))
    await host.waitText('Решает гарант Аня (вы) до')
    await host.waitText('Отметки сторон разошлись')
    await check(host, 'Пари: решает гарант')
    await host.shot('59-reshaet-garant')
    await veraPhone.goto(offerHref(split))
    await veraPhone.waitText('Решает гарант Аня до')
    await veraPhone.waitText('Ваша отметка: прав соперник. Поменять можно, пока гарант не решил.')
    await veraPhone.shot('59a-reshaet-garant-storona')
    await host.click('Прав соперник')
    await host.waitIn('.modal', 'Утвердить: прав соперник — Вера получает банк 1 000 ₽: Боря −500 ₽, Вера +500 ₽.')
    await host.shot('59b-reshenie-podtverzhdenie')
    await confirmTwice(host, 'Утверждено гарантом Аня (вы), окончательно')
    await host.waitText(', если до неё нет апелляции.')
    await host.shot('60-utverzhdeno-garantom')
    await veraPhone.waitText('Утверждено гарантом Аня, окончательно')
    await veraPhone.waitIn('section[aria-label="Итог пари"]', 'Вера (вы) — +500 ₽')
    if ((await actions(veraPhone)).length > 0) throw new Error('После решения гаранта у стороны кнопки: ' + (await actions(veraPhone)).join(', '))

    // Пари 3. Аня отметила, Вера молчит 3 дня — решает гарант Боря; он отказывается
    await api(server, `${rooms}/offers/${lapse}/mark`, room.key, { winner: 'author' })
    shift += 3 * DAY + HOUR
    await boryaPhone.goto(offerHref(lapse))
    await boryaPhone.waitText('Решает гарант Боря (вы) до')
    await boryaPhone.waitText('Одна сторона не отметила исход за 3 дня')
    await boryaPhone.click('Отказаться')
    await boryaPhone.waitText('Отказаться быть гарантом?')
    await confirmTwice(boryaPhone, 'Нужен новый гарант')
    await boryaPhone.waitText('Гарант Боря (вы) отказался')
    if ((await actions(boryaPhone)).length > 0) throw new Error('У отказавшегося гаранта кнопки: ' + (await actions(boryaPhone)).join(', '))

    // Аня называет Гену; Вера видит, кого назвала Аня, и называет того же — Гена гарант
    await host.goto(offerHref(lapse))
    await host.waitText('Назовите нового гаранта')
    await host.click('Гена')
    await host.click('Назвать гарантом')
    await host.waitText('Назвать гарантом: Гена?')
    await confirmTwice(host, 'Аня (вы) — называет: Гена')
    await host.waitIn(OUTCOME, 'Вера — ещё не назвал(а)')
    await check(host, 'Пари: нужен гарант')
    await host.shot('61-nuzhen-garant')
    await veraPhone.goto(offerHref(lapse))
    await veraPhone.waitText('Аня — называет: Гена')
    await veraPhone.click('Назвать гарантом') // выбран тот, кого назвала Аня
    await veraPhone.waitText('Аня назвал(а) того же — Гена сразу станет гарантом, на решение — 3 дня.')
    await confirmTwice(veraPhone, 'Решает гарант Гена до')
    await veraPhone.shot('61a-novyi-garant')
    await genaPhone.goto(offerHref(lapse))
    await genaPhone.waitText('Вы — гарант: ваше решение до')
    await genaPhone.shot('61b-novyi-garant-reshaet')

    // Через 7 дней решение гаранта — окончательно. Пари 4 — только что принято, «исход к» через
    // 2 секунды: в списке «ждём отметок»; у остальных — своя фаза одной строкой
    shift += 7 * DAY
    const fresh = Date.now() + shift + 2000
    const { offer: wait } = await api<{ offer: { id: string } }>(server, `${rooms}/offers`, room.key, {
      condition: 'Палатку соберём за пять минут',
      check: 'Секундомер у Веры',
      odds: { a: 1, b: 1 },
      amount: 10000,
      to: gena.memberId,
      guarantor: vera.memberId,
      closesAt: fresh,
      expectedAt: fresh,
    })
    await api(server, `${rooms}/offers/${wait.id}/accept`, gena.key, {})
    await sleep(2500)
    await host.goto(`${SITE}#/room/${room.roomId}`)
    await host.waitIn(LIST, 'окончательно: +100 ₽ Аня')
    await host.waitIn(LIST, 'окончательно: +500 ₽ Вера')
    await host.waitIn(LIST, 'нужен новый гарант') // Гена не решил за 3 дня
    await host.waitIn(LIST, 'принято — ждём отметок сторон')
    await noScroll(host, 'Список пари с исходами')
    await host.shot('62-spisok-iskhody')
    await host.goto(offerHref(split))
    await host.waitText('Утверждено гарантом Аня (вы), окончательно')
    await host.waitText('Окончательно.')
    await host.shot('63-okonchatelno-garantom')

    // Действия исхода не завели лишних пари: на сервере — четыре
    const seen = (await (await fetch(server.url + rooms, { headers: { Authorization: 'Bearer ' + room.key } })).json()) as { offers: unknown[] }
    if (seen.offers.length !== 4) throw new Error('Пари на сервере: ' + seen.offers.length + ', а ждали 4')
  } finally {
    await server.close()
  }
}

// Апелляция и суд (#63). Свой запасной сервер с подставными часами и выдуманным зерном жребия; комната
// «Сплав»: Аня — ведущая, Боря, Вера, Гена, Дима, Женя, Зоя; на устройства — ссылкой для другого
// устройства. Событие: ставили Боря, Вера и Женя, Боря предложил «Да», сутки без возражений — Вера
// подаёт апелляцию (причина, окно подтверждения), Женя присоединяется; суд — Аня и двое по жребию из
// Гены, Димы и Зои. Присяжный видит «вы в суде» в «Моих комнатах» (копию старше 5 минут они спросили у
// сервера) и в комнате, голосует «изменить на „Нет“»; Аня досрочно заменяет второго; решение — новый
// исход и выплаты. Пари: гарант Гена решил в пользу Бори, Вера подаёт апелляцию, суд отменяет пари
async function courts(cdp: Cdp, size: Size, startServer: ServerModule['startServer']) {
  console.log(`Апелляция и суд, ${size.width} px`)
  const HOUR = 60 * 60 * 1000
  let shift = 0
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0, now: () => Date.now() + shift, seed: () => '5eed0063a1b2c3d4' })
  try {
    const room = await api<{ roomId: string; invite: string; key: string; memberId: string }>(server, '/rooms', '', {
      password: PASSWORD,
      name: 'Сплав',
      currency: 'RUB',
      hostName: 'Аня',
    })
    const rooms = `/rooms/${room.roomId}`
    type Person = { name: string; memberId: string; key: string; device: Device | null }
    const people: Person[] = [{ name: 'Аня', memberId: room.memberId, key: room.key, device: null }]
    for (const name of ['Боря', 'Вера', 'Гена', 'Дима', 'Женя', 'Зоя']) {
      const j = await api<{ memberId: string; key: string }>(server, `${rooms}/join`, '', { invite: room.invite, name })
      await api(server, `${rooms}/admit`, room.key, { request: j.memberId })
      people.push({ name, memberId: j.memberId, key: j.key, device: null })
    }
    const person = (name: string) => people.find((p) => p.name === name) as Person
    const byId = (id: string) => people.find((p) => p.memberId === id) as Person
    const open = async (p: Person) => {
      const { token } = await api<{ token: string }>(server, `${rooms}/device`, p.key, {})
      const device = await Device.open(cdp, size, p.name)
      await device.goto(`${SITE}#/device/${room.roomId}/${token}?server=${encodeURIComponent(server.url)}`)
      await device.waitText('Открыть комнату здесь')
      await device.click('Открыть комнату здесь')
      await device.waitText('Участники')
      p.device = device
      return device
    }
    const deviceOf = (p: Person) => p.device as Device
    const [borya, vera, zhenya] = [person('Боря'), person('Вера'), person('Женя')]
    for (const p of people) if (p.name !== 'Боря') await open(p)
    const host = deviceOf(people[0])
    const COURT = 'section[aria-label="Суд"]'
    const APPEAL = 'section[aria-label="Апелляция"]'
    type Seat = { member: string | null }
    type Court = { seats: Seat[]; candidates: string[] }
    const state = async () =>
      (await (await fetch(server.url + rooms, { headers: { Authorization: 'Bearer ' + room.key } })).json()) as {
        events: { id: string; outcome: { court?: Court } | null }[]
        offers: { id: string; outcome: { court?: Court } | null }[]
      }
    const noScroll = async (device: Device, where: string) => {
      const scroll = await device.eval<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
      if (scroll > 0) throw new Error(`${where} на ${size.width} px: прокрутка вбок ${scroll} px`)
    }
    // Нажать, когда кнопка открыта: после перехода экран сначала показывает копию, а действия
    // закрыты до первого ответа сервера
    const press = async (device: Device, text: string) => {
      const started = Date.now()
      for (;;) {
        try {
          return await device.click(text)
        } catch (e) {
          if (Date.now() - started > TIMEOUT) throw e
          await sleep(200)
        }
      }
    }
    // Кнопки исхода, апелляции и суда не ниже 44 px; без прокрутки вбок
    const check = async (device: Device, where: string) => {
      await noScroll(device, where)
      const low = await device.eval<number>(
        `[...document.querySelectorAll('section[aria-label="Исход"] button')].filter((b) => b.offsetParent !== null && b.getBoundingClientRect().height < 44).length`,
      )
      if (low > 0) throw new Error(`${where} на ${size.width} px: кнопок ниже 44 px — ${low}`)
    }

    // Событие: приём на 3 секунды по часам сервера, ставки, предложение «Да», сутки без возражений
    const closesAt = Date.now() + shift + 3000
    const { event } = await api<{ event: { id: string } }>(server, `${rooms}/events`, borya.key, {
      condition: 'Пройдём весь маршрут за два дня',
      check: 'Отметки в общем треке похода',
      closesAt,
      expectedAt: closesAt + HOUR,
    })
    await api(server, `${rooms}/events/${event.id}/bets`, borya.key, { outcome: '1', amount: 30000 })
    await api(server, `${rooms}/events/${event.id}/bets`, vera.key, { outcome: '2', amount: 50000 })
    await api(server, `${rooms}/events/${event.id}/bets`, zhenya.key, { outcome: '2', amount: 20000 })
    shift += HOUR
    await api(server, `${rooms}/events/${event.id}/propose`, borya.key, { outcome: '1' })
    shift += 25 * HOUR
    const eventHref = `${SITE}#/room/${room.roomId}/event/${event.id}`
    // Присяжные-кандидаты ждут в «Моих комнатах»: их копия свежая, сервер не спрашивается
    for (const name of ['Гена', 'Дима', 'Зоя']) {
      await deviceOf(person(name)).goto(`${SITE}#/`)
      await deviceOf(person(name)).waitText('Сплав')
    }

    // Вера ставила на «Нет» — подаёт апелляцию: причина обязательна, окно с составом суда
    const v = deviceOf(vera)
    await v.goto(eventHref)
    await v.waitText('Утверждён „Да“ — без возражений')
    await v.waitText(', если до неё нет апелляции.')
    await v.waitIn(APPEAL, 'Подать апелляцию')
    await check(v, 'Событие: можно подать апелляцию')
    await v.shot('80-apellyatsiya-mozhno-podat')
    await press(v, 'Подать апелляцию')
    await v.click('Подать апелляцию')
    await v.waitText('Нужна причина апелляции')
    await v.fill('Причина апелляции', 'Боря срезал через протоку — по треку видно')
    await v.click('Подать апелляцию')
    await v.waitIn('.modal', 'Апелляция одна на событие. Суд: ведущий и 2 присяжных по жребию, 72 часа, решение окончательное.')
    await v.shot('80a-apellyatsiya-podtverzhdenie')
    await confirmTwice(v, 'Апелляция: Вера (вы)')
    await v.waitIn(COURT, 'ещё не голосовал(а)')
    await v.waitIn(COURT, 'проверить может любой')
    await v.waitText('Подана апелляция — окончательно, когда решит суд.')
    await check(v, 'Событие: суд идёт')
    await v.shot('81-sud-idyot')

    // Суд: Аня (ведущая не ставила — первая) и двое по жребию; третий кандидат — запасной
    const pool = (await state()).events.find((e) => e.id === event.id)?.outcome?.court
    if (!pool || pool.seats.length !== 3 || pool.seats[0].member !== room.memberId) throw new Error('Суд по событию: ' + JSON.stringify(pool))
    const [juror, silent] = [byId(pool.seats[1].member as string), byId(pool.seats[2].member as string)]
    const reserve = byId(pool.candidates[3])

    // Женя тоже ставил на «Нет» — присоединяется с подтверждением
    const z = deviceOf(zhenya)
    await z.goto(eventHref)
    await z.waitIn(APPEAL, 'Апелляция: Вера')
    await press(z, 'Присоединиться')
    await z.waitText('Присоединиться к апелляции?')
    await confirmTwice(z, 'Присоединились: Женя (вы)')
    await z.shot('82-prisoedinilsya')

    // Присяжный: копия комнаты на устройстве — «старше 5 минут»; «Мои комнаты» спрашивают сервер сами
    const j = deviceOf(juror)
    await j.editRooms('room.syncedAt = Date.now() - 6 * 60 * 1000')
    await j.reload()
    await j.waitIn('.room-list', 'вы в суде')
    await j.shot('83-moi-komnaty-vy-v-sude')
    await j.click('Сплав')
    await j.waitIn('section[aria-label="События"]', 'вы в суде')
    await j.shot('84-komnata-vy-v-sude')
    await j.goto(eventHref)
    await j.waitText('Вы в суде: голос до')
    await check(j, 'Событие: член суда')
    await j.shot('85-chlen-suda-golosuet')
    await press(j, 'Изменить на „Нет“')
    await j.waitIn('.modal', 'Голос не изменить.')
    await j.shot('85a-golos-podtverzhdenie')
    await confirmTwice(j, 'голос: изменить на „Нет“')

    // Ведущая не заинтересована — досрочно заменяет молчащего: причина, окно, следующий по жребию
    await host.goto(eventHref)
    await host.waitIn(COURT, 'Заменить')
    await press(host, 'Заменить')
    await host.fill('Причина замены', 'В походе без связи — не ответит до конца недели')
    await host.click('Заменить')
    await host.waitIn('.modal', 'Место перейдёт следующему по жребию; одна замена на место.')
    await host.waitIn('.modal', `Следующий по жребию — ${reserve.name}`)
    await host.shot('86-zamena-podtverzhdenie')
    await confirmTwice(host, `вместо ${silent.name}: заменён(а) ведущим`)
    await check(host, 'Событие: замена')
    await host.shot('86a-zamena')

    // Аня и запасной голосуют через сервер: 2 — «изменить на „Нет“», 1 — «оставить» → новый исход
    await api(server, `${rooms}/events/${event.id}/judge`, room.key, { verdict: 'change', outcome: '2' })
    await api(server, `${rooms}/events/${event.id}/judge`, reserve.key, { verdict: 'keep' })
    await v.waitText('Решение суда: изменить на „Нет“')
    await v.waitText('Утверждён „Нет“ — судом')
    await v.waitIn('section[aria-label="Ваша позиция"]', 'Утверждён „Нет“: вы поставили 500 ₽, получили')
    await check(v, 'Событие: решение суда')
    await v.shot('87-reshenie-suda')

    // Пари: Боря — «прав автор», Вера — «прав соперник»; гарант Гена решил «прав автор»
    const offerAt = Date.now() + shift + HOUR
    const { offer } = await api<{ offer: { id: string } }>(server, `${rooms}/offers`, borya.key, {
      condition: 'На второй день ветер будет попутным',
      check: 'Прогноз и флажок на корме',
      odds: { a: 1, b: 1 },
      amount: 40000,
      to: vera.memberId,
      guarantor: person('Гена').memberId,
      closesAt: offerAt,
      expectedAt: offerAt + HOUR,
    })
    await api(server, `${rooms}/offers/${offer.id}/accept`, vera.key, {})
    shift += 3 * HOUR
    await api(server, `${rooms}/offers/${offer.id}/mark`, borya.key, { winner: 'author' })
    await api(server, `${rooms}/offers/${offer.id}/mark`, vera.key, { winner: 'taker' })
    await api(server, `${rooms}/offers/${offer.id}/decide`, person('Гена').key, { winner: 'author' })
    const offerHref = `${SITE}#/room/${room.roomId}/offer/${offer.id}`
    await v.goto(offerHref)
    await v.waitText(', если до неё нет апелляции.')
    await press(v, 'Подать апелляцию')
    await v.fill('Причина апелляции', 'Ветер был боковой — видно на видео')
    await v.click('Подать апелляцию')
    await v.waitIn('.modal', 'Апелляция одна на пари.')
    await confirmTwice(v, 'Апелляция: Вера (вы)')
    await v.waitIn(COURT, 'ещё не голосовал(а)')
    await check(v, 'Пари: суд идёт')
    await v.shot('88-pari-sud-idyot')

    // Член суда по пари голосует «отменить»; Аня — тоже, третий — «оставить»: пари отменено судом
    const bet = (await state()).offers.find((o) => o.id === offer.id)?.outcome?.court
    if (!bet || bet.seats.length !== 3) throw new Error('Суд по пари: ' + JSON.stringify(bet))
    const [offerJuror, offerThird] = [byId(bet.seats[1].member as string), byId(bet.seats[2].member as string)]
    const oj = deviceOf(offerJuror)
    await oj.goto(offerHref)
    await oj.waitText('Вы в суде: голос до')
    await oj.waitIn(COURT, 'Изменить на „прав соперник“')
    await check(oj, 'Пари: член суда')
    await oj.shot('89-pari-chlen-suda')
    await press(oj, 'Отменить — вернуть ставки')
    await oj.waitIn('.modal', 'Голос не изменить.')
    await confirmTwice(oj, 'голос: отменить — вернуть ставки')
    await api(server, `${rooms}/offers/${offer.id}/judge`, room.key, { verdict: 'cancel' })
    await api(server, `${rooms}/offers/${offer.id}/judge`, offerThird.key, { verdict: 'keep' })
    await v.waitText('Пари отменено судом — ставки возвращены')
    await v.waitText('Решение суда: отменить — вернуть ставки')
    if (await v.eval<boolean>(`!!document.querySelector('section[aria-label="Итог пари"]')`)) throw new Error('У отменённого судом пари остался итог')
    await check(v, 'Пари: отменено судом')
    await v.shot('90-pari-otmeneno-sudom')
  } finally {
    await server.close()
  }
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

  // Свернуть меню: подписи скрыты, у значков — всплывающая подпись; положение помнится после перезагрузки
  await host.click('«')
  await sleep(200)
  const collapsed = await host.eval<{ app: boolean; labels: boolean; titles: string[]; toggle: string | null }>(`({
    app: document.querySelector('.app').classList.contains('nav-collapsed'),
    labels: [...document.querySelectorAll('.nav-label')].some((el) => el.offsetParent !== null),
    titles: [...document.querySelectorAll('.nav-item')].map((el) => el.title),
    toggle: document.querySelector('.nav-toggle').getAttribute('aria-label'),
  })`)
  if (!collapsed.app || collapsed.labels || collapsed.titles.some((t) => !t) || collapsed.toggle !== 'Развернуть меню')
    throw new Error('Меню не свернулось: ' + JSON.stringify(collapsed))
  await host.shot('22-komnata-menu-svernuto')
  await host.reload()
  await host.waitText('Боря')
  if (!(await host.eval<boolean>(`document.querySelector('.app').classList.contains('nav-collapsed')`)))
    throw new Error('После перезагрузки меню развернулось')
  await host.goto(SITE + '#/')
  await host.waitText('Выберите комнату слева')
  await host.shot('23-moi-komnaty-menu-svernuto')
  // Развернуть обратно
  await host.click('»')
  await sleep(200)
  if (await host.eval<boolean>(`document.querySelector('.app').classList.contains('nav-collapsed')`)) throw new Error('Меню не развернулось')
  if (await host.eval<string | null>(`localStorage.getItem('torgsin.navCollapsed')`)) throw new Error('Развёрнутое меню не запомнилось')
}

// Где стоит карточка открытого: ширина, поля слева и справа от неё до краёв области справа от
// меню, доступная ширина (содержимое .main без полей), список и «Назад», прокрутка вбок; на
// событии — график и таблица выплат внутри карточки, длинное условие не вылезает; колонки:
// левая (.event-main или первая .form-col) и правая (.event-side или вторая .form-col),
// «Ваша позиция» — её правый край
type Box = { left: number; right: number; top: number; bottom: number; width: number }
type Placement = {
  card: number
  room: number
  gapLeft: number
  gapRight: number
  list: boolean
  back: boolean
  scroll: number
  inside: boolean
  table: boolean
  left: Box | null
  right: Box | null
  position: Box | null
}

const PLACEMENT = `(() => {
  const card = document.querySelector('.detail > .card')
  const main = document.querySelector('.main')
  const navRight = document.querySelector('.nav').getBoundingClientRect().right
  const page = document.documentElement.clientWidth
  const box = card.getBoundingClientRect()
  const style = getComputedStyle(main)
  const room = main.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
  const parts = [...card.querySelectorAll('.chart-frame, .payouts, .event-title, .event-main, .event-side, .form-col')].map((el) => el.getBoundingClientRect())
  const row = card.querySelector('.payouts tr')
  const rect = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width) }
  }
  const cols = card.querySelectorAll('.form-col')
  return {
    card: Math.round(box.width),
    room: Math.round(room),
    gapLeft: Math.round(box.left - navRight),
    gapRight: Math.round(page - box.right),
    list: document.querySelector('.rooms .list').offsetParent !== null,
    back: [...card.querySelectorAll('a')].some((a) => a.offsetParent !== null && a.innerText.includes('Назад')),
    scroll: document.documentElement.scrollWidth - page,
    inside: parts.every((r) => r.left >= box.left - 0.5 && r.right <= box.right + 0.5),
    table: !row || getComputedStyle(row).display === 'table-row',
    left: rect(card.querySelector('.event-main') || cols[0]),
    right: rect(card.querySelector('.event-side') || cols[1]),
    position: rect(card.querySelector('section[aria-label="Ваша позиция"]')),
  }
})()`

// Событие и «Новое событие» на компьютере (#30, #38): на 1024–2560 px, меню развёрнуто и свёрнуто,
// карточка — во всю ширину области справа от меню (не шире --content-max), область — по центру;
// списка комнат нет, «Назад» есть; график и выплаты — внутри карточки, таблицей. От 1280 px —
// две колонки: правая (график и лента; у формы — исходы и сроки) — справа от левой, её верх —
// не ниже середины левой; ≈ 55 / 45 у события. Уже — одна под другой.
// Событие с графиком и утверждённым исходом с выплатами — на своём сервере с подставными часами
async function eventWidth(cdp: Cdp, startServer: ServerModule['startServer']) {
  console.log('Ширина события на компьютере')
  const HOUR = 60 * 60 * 1000
  let shift = 0
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0, now: () => Date.now() + shift })
  try {
    const room = await api<{ roomId: string; invite: string; key: string }>(server, '/rooms', '', {
      password: PASSWORD,
      name: 'Рыбалка',
      currency: 'RUB',
      hostName: 'Аня',
    })
    const rooms = `/rooms/${room.roomId}`
    const j = await api<{ memberId: string; key: string }>(server, `${rooms}/join`, '', { invite: room.invite, name: 'Боря' })
    await api(server, `${rooms}/admit`, room.key, { request: j.memberId })
    const closesAt = Date.now() + 3000
    const { event } = await api<{ event: { id: string } }>(server, `${rooms}/events`, room.key, {
      condition: 'К обеду клюнет хотя бы десять рыб',
      check: 'Считаем улов в ведре в 14:00',
      closesAt,
      expectedAt: closesAt + HOUR,
    })
    await api(server, `${rooms}/events/${event.id}/bets`, room.key, { outcome: '1', amount: 40000 })
    await sleep(700) // точки графика — порознь по времени
    await api(server, `${rooms}/events/${event.id}/bets`, j.key, { outcome: '2', amount: 60000 })
    shift += HOUR // приём закрыт
    await api(server, `${rooms}/events/${event.id}/propose`, room.key, { outcome: '1' })
    shift += 25 * HOUR // сутки без возражений — утверждён, выплаты

    const { token } = await api<{ token: string }>(server, `${rooms}/device`, room.key, {})
    const host = await Device.open(cdp, SIZES[0], 'Аня')
    await host.goto(`${SITE}#/device/${room.roomId}/${token}?server=${encodeURIComponent(server.url)}`)
    await host.waitText('Открыть комнату здесь')
    await host.click('Открыть комнату здесь')
    await host.waitText('Участники')
    const eventHref = `${SITE}#/room/${room.roomId}/event/${event.id}`
    const newHref = `${SITE}#/room/${room.roomId}/event/new`
    await host.goto(eventHref)
    await host.waitText('Утверждён „Да“ — без возражений')
    await host.waitCount('.payouts', 1)
    await host.waitCount('.chart-plot', 1)
    // Телефон — как было
    const phone = await host.eval<Placement>(PLACEMENT)
    if (phone.scroll > 0) throw new Error('Событие на 390 px: прокрутка вбок ' + JSON.stringify(phone))
    await host.shot('33-sobytie-shirina')

    const problems: string[] = []
    const check = async (where: string, width: number, event: boolean) => {
      const p = await host.eval<Placement>(PLACEMENT)
      console.log(`  ${where}: ${JSON.stringify(p)}`)
      if (Math.abs(p.card - p.room) > 1) problems.push(`${where}: ширина ${p.card}, а область ${p.room}`)
      if (p.room > CONTENT_MAX + 1) problems.push(`${where}: область ${p.room} шире ${CONTENT_MAX}`)
      if (Math.abs(p.gapLeft - p.gapRight) > 2) problems.push(`${where}: не по центру — слева ${p.gapLeft}, справа ${p.gapRight}`)
      if (p.list) problems.push(`${where}: виден список комнат`)
      if (!p.back) problems.push(`${where}: нет «Назад»`)
      if (p.scroll > 0) problems.push(`${where}: прокрутка вбок ${p.scroll} px`)
      if (!p.inside) problems.push(`${where}: условие, колонки, график или выплаты вылезают из карточки`)
      if (!p.table) problems.push(`${where}: выплаты не таблицей`)
      const { left, right, position } = p
      if (!left || !right || (event && !position)) return void problems.push(`${where}: нет колонок или «Вашей позиции»`)
      if (width >= 1280) {
        const edge = event && position ? Math.max(left.right, position.right) : left.right
        if (right.left < edge) problems.push(`${where}: правая колонка (${right.left}) не справа от левой (${edge})`)
        if (right.top > (left.top + left.bottom) / 2) problems.push(`${where}: правая колонка начинается ниже середины левой`)
        const share = left.width / (left.width + right.width)
        if (event && Math.abs(share - 0.55) > 0.02) problems.push(`${where}: левая колонка — ${Math.round(share * 100)} %, а нужно ≈ 55 %`)
      } else if (right.top < left.bottom) problems.push(`${where}: до 1280 px колонки должны идти одна под другой`)
    }
    const nav = (collapsed: boolean) =>
      host.eval(`(() => {
        if (document.querySelector('.app').classList.contains('nav-collapsed') !== ${collapsed}) document.querySelector('.nav-toggle').click()
      })()`)
    const open = async (href: string, text: string) => {
      await host.goto(href)
      await host.waitText(text)
    }

    for (const size of EVENT_WIDTHS) {
      await host.resize(size)
      for (const collapsed of [false, true]) {
        await nav(collapsed)
        await sleep(200)
        const menu = collapsed ? 'меню свёрнуто' : 'меню развёрнуто'
        await open(eventHref, 'Утверждён „Да“ — без возражений')
        await host.waitCount('.chart-plot', 1)
        await check(`событие, ${size.width} px, ${menu}`, size.width, true)
        if (!collapsed && size.width !== 1536) await host.shot('33-sobytie-shirina')
        if (collapsed && size.width === 1440) await host.shot('34-sobytie-shirina-menu-svernuto')
        await open(newHref, 'Приём ставок до')
        await check(`новое событие, ${size.width} px, ${menu}`, size.width, false)
        if (!collapsed && size.width === 1440) await host.shot('35-novoe-sobytie-shirina')
      }
      await nav(false)
    }
    // Комната — «список + открытое» рядом: список ≈ 340 px, открытое — остаток области
    for (const size of [SIZES[1], EVENT_WIDTHS[2], EVENT_WIDTHS[5]]) {
      await host.resize(size)
      await open(`${SITE}#/room/${room.roomId}`, 'Участники')
      const split = await host.eval<{ list: number; detail: number; room: number; gap: number; scroll: number } | null>(`(() => {
        const list = document.querySelector('.rooms .list')
        const detail = document.querySelector('.rooms .detail')
        if (list.offsetParent === null) return null
        const main = document.querySelector('.main')
        const style = getComputedStyle(main)
        const l = list.getBoundingClientRect()
        const d = detail.getBoundingClientRect()
        return {
          list: Math.round(l.width),
          detail: Math.round(d.width),
          room: Math.round(main.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)),
          gap: Math.round(d.left - l.right),
          scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }
      })()`)
      console.log(`  комната, ${size.width} px: ${JSON.stringify(split)}`)
      if (!split) {
        problems.push(`комната, ${size.width} px: список комнат пропал`)
        continue
      }
      if (Math.abs(split.list - 340) > 1) problems.push(`комната, ${size.width} px: список ${split.list}, а нужно ≈ 340`)
      if (Math.abs(split.list + split.gap + split.detail - split.room) > 1) problems.push(`комната, ${size.width} px: открытое не на всё место области`)
      if (split.room > CONTENT_MAX + 1) problems.push(`комната, ${size.width} px: область ${split.room} шире ${CONTENT_MAX}`)
      if (split.scroll > 0) problems.push(`комната, ${size.width} px: прокрутка вбок ${split.scroll} px`)
      if (size.width === 1440) await host.shot('37-komnata-shirina')
    }
    if (problems.length) throw new Error('Раскладка события:\n' + problems.join('\n'))
  } finally {
    await server.close()
  }
}

// Комната в очках (#31): «Да» 300, «Нет» 500 — «Банк 800 очков», вероятности 38 % и 62 % (в сумме
// 100), в позиции «получите 800 очков» и «0 очков»; на телефоне и компьютере
async function points(cdp: Cdp, startServer: ServerModule['startServer']) {
  console.log('Комната в очках')
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0 })
  try {
    const room = await api<{ roomId: string; invite: string; key: string }>(server, '/rooms', '', {
      password: PASSWORD,
      name: 'Футбол по средам',
      currency: 'PTS',
      hostName: 'Олег',
    })
    const rooms = `/rooms/${room.roomId}`
    const j = await api<{ memberId: string; key: string }>(server, `${rooms}/join`, '', { invite: room.invite, name: 'Гена' })
    await api(server, `${rooms}/admit`, room.key, { request: j.memberId })
    const closesAt = Date.now() + 24 * 60 * 60 * 1000
    const { event } = await api<{ event: { id: string } }>(server, `${rooms}/events`, room.key, {
      condition: 'В среду придёт хотя бы десять человек',
      check: 'Считаем на поле в 20:00',
      closesAt,
      expectedAt: closesAt + 60 * 60 * 1000,
    })
    await api(server, `${rooms}/events/${event.id}/bets`, j.key, { outcome: '1', amount: 300 })
    await sleep(700) // точки графика — порознь по времени
    await api(server, `${rooms}/events/${event.id}/bets`, room.key, { outcome: '2', amount: 500 })

    const { token } = await api<{ token: string }>(server, `${rooms}/device`, room.key, {})
    const host = await Device.open(cdp, SIZES[0], 'Олег')
    await host.goto(`${SITE}#/device/${room.roomId}/${token}?server=${encodeURIComponent(server.url)}`)
    await host.waitText('Открыть комнату здесь')
    await host.click('Открыть комнату здесь')
    await host.waitText('Участники')
    const N = ' '
    for (const size of SIZES) {
      await host.resize(size)
      await host.goto(`${SITE}#/room/${room.roomId}/event/${event.id}`)
      for (const text of [`Банк 800${N}очков`, `38${N}%`, `62${N}%`, `получите 800${N}очков`, `получите 0${N}очков`]) await host.waitText(text)
      const wrong = await host.eval<boolean>(`document.body.innerText.includes('63\\u00a0%') || /\\d\\u00a0очки/.test(document.body.innerText)`)
      if (wrong) throw new Error('Комната в очках: «63 %» или «… очки» при числе')
      await host.shot('36-ochki')
    }
  } finally {
    await server.close()
  }
}

// Экран упал (#49): на устройстве — испорченная запись комнаты (участники не списком), «Мои
// комнаты» бросают ошибку при отрисовке — вместо белой страницы «Что-то пошло не так» и
// «Обновить»; меню на месте, «Настройки» открываются
async function crash(cdp: Cdp, size: Size) {
  console.log(`Экран ошибки, ${size.width} px`)
  const device = await Device.open(cdp, size, 'сломанная копия')
  await device.goto(SITE + '#/')
  await device.waitText('Комнат пока нет')
  await device.eval(`new Promise((resolve, reject) => {
    const open = indexedDB.open('torgsin')
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const tx = open.result.transaction('rooms', 'readwrite')
      tx.objectStore('rooms').put({ id: 'X', server: 'http://localhost:9', memberId: 'M', key: 'k', invite: null, name: 'Сломанная', currency: 'RUB', hostId: 'M', createdAt: 1, members: null, savedAt: 1, syncedAt: null })
      tx.oncomplete = () => {
        open.result.close()
        resolve(true)
      }
      tx.onerror = () => reject(tx.error)
    }
  })`)
  await device.reload()
  await device.waitText('Что-то пошло не так')
  const seen = await device.eval<{ button: boolean; nav: boolean }>(`({
    button: [...document.querySelectorAll('button')].some((b) => b.offsetParent !== null && b.innerText.trim() === 'Обновить'),
    nav: document.querySelector('.nav') !== null,
  })`)
  if (!seen.button || !seen.nav) throw new Error('Экран ошибки: ' + JSON.stringify(seen))
  const scroll = await device.eval<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
  if (scroll > 0) throw new Error(`Экран ошибки на ${size.width} px: прокрутка вбок ${scroll} px`)
  await device.shot('42-oshibka-ekrana')
  // Другой раздел — открывается: перехват не держит ошибку после смены адреса
  await device.goto(SITE + '#/settings')
  await device.waitText('Сейчас:')
  if (await device.eval<boolean>(`document.body.innerText.includes('Что-то пошло не так')`)) throw new Error('После смены раздела осталась ошибка')
}

// «Вставить ссылку» и заметка про экран «Домой» (#56). Свой запасной сервер — ссылки с ?server=.
// Приложение с экрана «Домой» на iPhone: пустые «Мои комнаты» с полем; не ссылка — текст;
// приглашение (сообщением целиком) — подсказка про второго участника и экран входа с сервером
// из ссылки. iPhone в Safari: в комнате заметка, кнопка — ссылка для другого устройства; её
// вставляют в приложении — та же комната тем же участником, заметки там нет. Закрыли — нет и
// после перезагрузки; на Android заметки нет
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
const HOME_NOTE = 'Поставите ТоргСин на экран „Домой“ — там комнаты не будет: iPhone хранит её отдельно.'

async function pasteLink(cdp: Cdp, size: Size, startServer: ServerModule['startServer']) {
  console.log(`Вставить ссылку, ${size.width} px`)
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0 })
  try {
    const room = await api<{ roomId: string; invite: string; key: string }>(server, '/rooms', '', {
      password: PASSWORD,
      name: 'Баня по пятницам',
      currency: 'RUB',
      hostName: 'Дима',
    })
    const rooms = `/rooms/${room.roomId}`
    const j = await api<{ memberId: string; key: string }>(server, `${rooms}/join`, '', { invite: room.invite, name: 'Женя' })
    await api(server, `${rooms}/admit`, room.key, { request: j.memberId })
    const query = '?server=' + encodeURIComponent(server.url)
    const deviceHref = async () => {
      const { token } = await api<{ token: string }>(server, `${rooms}/device`, j.key, {})
      return `${SITE}#/device/${room.roomId}/${token}${query}`
    }
    const has = (device: Device, text: string) => device.eval<boolean>(`document.body.innerText.includes(${JSON.stringify(text)})`)

    // Приложение с экрана «Домой»: адресной строки нет — ссылку вставляют в «Мои комнаты»
    const app = await Device.open(cdp, size, 'приложение на iPhone', { userAgent: IPHONE_UA, standalone: true })
    await app.goto(SITE + '#/')
    await app.waitText('Комнат пока нет')
    await app.waitText('вставьте в „Вставить ссылку“ ниже')
    await app.fill('Вставить ссылку', 'https://example.com/#/room/1')
    await app.click('Открыть')
    await app.waitText('Это не ссылка ТоргСина: нужна ссылка-приглашение или ссылка для другого устройства')
    await app.shot('64-vstavit-ssylku-ne-ta')
    await app.fill('Вставить ссылку', `Заходи в комнату «Баня по пятницам» в ТоргСине ${SITE}#/join/${room.roomId}/${room.invite}${query}`)
    await app.waitText('Уже вошли в эту комнату в браузере? Тогда нужна не эта ссылка, а „Ссылка для другого устройства“')
    await app.shot('65-vstavit-priglashenie')
    await app.click('Открыть')
    await app.waitText('Вход в комнату „Баня по пятницам“, ведущий — Дима')
    const joinHash = await app.eval<string>('location.hash')
    if (joinHash !== `#/join/${room.roomId}/${room.invite}${query}`) throw new Error('Приглашение открыло не тот адрес: ' + joinHash)

    // iPhone в Safari: вошёл — в комнате заметка; кнопка создаёт ссылку для другого устройства
    const safari = await Device.open(cdp, size, 'Safari на iPhone', { userAgent: IPHONE_UA, clipboard: true })
    await safari.goto(await deviceHref())
    await safari.waitText('Открыть комнату здесь')
    await safari.click('Открыть комнату здесь')
    await safari.waitText('Участники')
    await safari.waitText(HOME_NOTE)
    await safari.shot('66-zametka-iphone')
    await safari.click('Скопировать ссылку для приложения')
    await safari.waitText('сработает один раз, до')
    const appLink = await safari.value('input[aria-label="Ссылка для приложения"]')
    if (!appLink.includes(`#/device/${room.roomId}/`)) throw new Error('Кнопка заметки дала не ссылку для другого устройства: ' + appLink)
    await safari.shot('67-zametka-ssylka')

    // Приложение: вставили ссылку из заметки — та же комната, тот же участник; заметки нет
    await app.goto(SITE + '#/')
    await app.waitText('Комнат пока нет')
    await app.fill('Вставить ссылку', appLink)
    if (await has(app, 'Уже вошли в эту комнату')) throw new Error('Подсказка про второго участника — у ссылки для другого устройства')
    await app.click('Открыть')
    await app.waitText('Открыть комнату здесь')
    await app.click('Открыть комнату здесь')
    await app.waitText('Участники')
    await app.waitText('Женя')
    if (await has(app, HOME_NOTE)) throw new Error('Заметка про экран «Домой» — в приложении с экрана «Домой»')
    const members = await app.eval<number>(`document.querySelectorAll('.members > li').length`)
    if (members !== 2) throw new Error('В комнате приложения участников: ' + members)
    await app.goto(SITE + '#/')
    await app.waitText('Баня по пятницам')
    await app.waitText('Вставить ссылку')
    await app.shot('68-moi-komnaty-s-polem')

    // Заметку закрыли — нет и после перезагрузки
    await safari.click('Закрыть')
    if (await has(safari, HOME_NOTE)) throw new Error('Заметка не закрылась')
    await safari.reload()
    await safari.waitText('Участники')
    await sleep(500)
    if (await has(safari, HOME_NOTE)) throw new Error('Закрытая заметка вернулась после перезагрузки')

    // Android — заметки нет, поле есть
    const android = await Device.open(cdp, size, 'Android', { userAgent: ANDROID_UA })
    await android.goto(await deviceHref())
    await android.waitText('Открыть комнату здесь')
    await android.click('Открыть комнату здесь')
    await android.waitText('Участники')
    await sleep(500)
    if (await has(android, HOME_NOTE)) throw new Error('Заметка про экран «Домой» — на Android')
    await android.goto(SITE + '#/')
    await android.waitText('Вставить ссылку')
  } finally {
    await server.close()
  }
}

// Предмет спора (#64, Р-26). Комната «Работа и спорт»: Аня — ведущая, Боря, Вера. Событие «Аня найдёт
// работу до декабря» о ней: Ане — только «Да», ставит — у всех пометка; событие о ней со своими
// исходами — Аня не ставит. Пари: «О ком спор» в форме — предмет Боря сам, сторона только «сбудется»;
// пари о Ане, автор за «сбудется», — Ане «Принять» нет
async function subjects(cdp: Cdp, size: Size, startServer: ServerModule['startServer']) {
  console.log(`Предмет спора, ${size.width} px`)
  const HOUR = 60 * 60 * 1000
  const server = await startServer({ file: ':memory:', password: PASSWORD, port: 0 })
  try {
    const room = await api<{ roomId: string; invite: string; key: string; memberId: string }>(server, '/rooms', '', {
      password: PASSWORD,
      name: 'Работа и спорт',
      currency: 'RUB',
      hostName: 'Аня',
    })
    const rooms = `/rooms/${room.roomId}`
    const join = async (name: string) => {
      const j = await api<{ memberId: string; key: string }>(server, `${rooms}/join`, '', { invite: room.invite, name })
      await api(server, `${rooms}/admit`, room.key, { request: j.memberId })
      return j
    }
    const borya = await join('Боря')
    const vera = await join('Вера')
    const open = async (name: string, key: string) => {
      const { token } = await api<{ token: string }>(server, `${rooms}/device`, key, {})
      const device = await Device.open(cdp, size, name)
      await device.goto(`${SITE}#/device/${room.roomId}/${token}?server=${encodeURIComponent(server.url)}`)
      await device.waitText('Открыть комнату здесь')
      await device.click('Открыть комнату здесь')
      await device.waitText('Участники')
      return device
    }
    const noScroll = async (device: Device, where: string) => {
      const scroll = await device.eval<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
      if (scroll > 0) throw new Error(`${where} на ${size.width} px: прокрутка вбок ${scroll} px`)
    }
    const text = (device: Device, selector: string) =>
      device.eval<string>(`(document.querySelector(${JSON.stringify(selector)})?.innerText ?? '').replace(/\\u00a0/g, ' ')`)
    const closesAt = Date.now() + 24 * HOUR
    const job = await api<{ event: { id: string } }>(server, `${rooms}/events`, borya.key, {
      condition: 'Аня найдёт работу до декабря',
      check: 'Аня покажет приказ о приёме',
      closesAt,
      expectedAt: closesAt + 30 * 24 * HOUR,
      subject: room.memberId,
    })
    await api(server, `${rooms}/events/${job.event.id}/bets`, vera.key, { outcome: '2', amount: 50000 })
    const pullups = await api<{ event: { id: string } }>(server, `${rooms}/events`, borya.key, {
      condition: 'Сколько раз Аня подтянется в субботу',
      check: 'Видео в общий чат',
      outcomes: ['меньше 10', '10–20', 'больше 20'],
      closesAt,
      expectedAt: closesAt + 48 * HOUR,
      subject: room.memberId,
    })
    const eventHref = (id: string) => `${SITE}#/room/${room.roomId}/event/${id}`
    const offerHref = (id: string) => `${SITE}#/room/${room.roomId}/offer/${id}`

    // Аня — предмет спора: в форме ставки только «Да», с подсказкой; ставит 300 ₽
    const anya = await open('Аня', room.key)
    await anya.goto(eventHref(job.event.id))
    await anya.waitText('Вы — предмет спора: ставить можно только на „Да“')
    const form = await text(anya, 'form[aria-label="Ставка"]')
    if (form.includes('Нет')) throw new Error('Предмету спора в форме ставки виден «Нет»: ' + form)
    await noScroll(anya, 'Событие о себе')
    await anya.shot('91-predmet-stavka-tolko-da')
    await anya.fill('Сумма, ₽', '300')
    await anya.click('Поставить')
    await anya.waitIn('.modal', 'Поставить 300 ₽ на „Да“?')
    await confirmBet(anya)
    await anya.waitIn('.subject-flag', '⚑ Аня (вы) — предмет спора — сам ставит: 300 ₽ на „Да“')

    // Событие о ней со своими исходами — формы ставки нет
    await anya.goto(eventHref(pullups.event.id))
    await anya.waitText('Вы — предмет спора: в событии со своими исходами вы не ставите.')
    if (await anya.eval<boolean>(`!!document.querySelector('form[aria-label="Ставка"]')`)) throw new Error('Предмету спора в событии со своими исходами видна форма ставки')
    await anya.shot('92-predmet-svoi-ishody')

    // Боря видит пометку у события — на экране события и в списке
    const boryaPhone = await open('Боря', borya.key)
    await boryaPhone.goto(eventHref(job.event.id))
    await boryaPhone.waitIn('.subject-flag', '⚑ Аня — предмет спора — сам ставит: 300 ₽ на „Да“')
    await noScroll(boryaPhone, 'Событие с пометкой')
    await boryaPhone.shot('93-pometka-sobytie')

    // «Предложить пари»: о ком спор — Боря сам; сторона — только «сбудется»
    await boryaPhone.goto(`${SITE}#/room/${room.roomId}/offer/new`)
    await boryaPhone.waitText('О ком спор')
    await boryaPhone.fill('Условие', 'Боря пробежит полумарафон до весны')
    await boryaPhone.fill('Как проверяем', 'Скрин из приложения с забегом')
    await boryaPhone.fill('Ваша сумма, ₽', '500')
    await boryaPhone.eval(`document.querySelector('input[name="offer-subject"][value="${borya.memberId}"]').click()`)
    await boryaPhone.waitText('Спор о вас: предмет спора — только на стороне «сбудется».')
    const sides = await text(boryaPhone, 'form')
    if (sides.includes('Не сбудется')) throw new Error('Предмету спора в форме пари видно «Не сбудется»')
    await noScroll(boryaPhone, 'Форма пари с «О ком спор»')
    await boryaPhone.shot('94-o-kom-spor-forma')
    await boryaPhone.click('Предложить')
    await boryaPhone.waitIn('.modal', 'о ком спор — Боря')
    await confirmTwice(boryaPhone, 'открыто — приём до')
    await boryaPhone.waitIn('.subject-flag', '⚑ Боря (вы) — предмет спора — сам на стороне „сбудется“')
    await boryaPhone.waitText('только на стороне „сбудется“')
    await noScroll(boryaPhone, 'Пари с пометкой')
    await boryaPhone.shot('95-pometka-pari')

    // Пари о Ане, автор (Вера) — за «сбудется»: Ане «Принять» нет
    const aboutAnya = await api<{ offer: { id: string } }>(server, `${rooms}/offers`, vera.key, {
      condition: 'Аня выучит испанский до лета',
      check: 'Поговорит с Верой пять минут без словаря',
      odds: { a: 1, b: 1 },
      amount: 20000,
      closesAt,
      expectedAt: closesAt + 90 * 24 * HOUR,
      guarantor: borya.memberId,
      subject: room.memberId,
    })
    await anya.goto(offerHref(aboutAnya.offer.id))
    await anya.waitText('Вы — предмет спора: принять можно, только если автор — за «не сбудется».')
    const visible = await anya.eval<string[]>(`[...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null).map((b) => b.innerText.trim())`)
    if (visible.includes('Принять') || visible.includes('Встречное')) throw new Error('Предмету спора видны «Принять» или «Встречное»: ' + visible.join(', '))
    await anya.shot('96-predmet-ne-prinimaet')

    // Комната у Бори: пометки в списках событий и пари
    await boryaPhone.goto(`${SITE}#/room/${room.roomId}`)
    await boryaPhone.waitIn('section[aria-label="События"]', '⚑ Аня — предмет спора — сам ставит: 300 ₽ на „Да“')
    await boryaPhone.waitIn('section[aria-label="Пари"]', '⚑ Боря (вы) — предмет спора — сам на стороне „сбудется“')
    await noScroll(boryaPhone, 'Комната с пометками')
    await boryaPhone.shot('97-pometki-v-spiskah')
  } finally {
    await server.close()
  }
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
    for (const size of SIZES) {
      await scenario(cdp, size, server, module.startServer)
      await outcomes(cdp, size, module.startServer)
      await offers(cdp, size, module.startServer)
      await offerOutcomes(cdp, size, module.startServer)
      await courts(cdp, size, module.startServer)
      await pasteLink(cdp, size, module.startServer)
      await subjects(cdp, size, module.startServer)
    }
    for (const size of WIDE) await layout(cdp, size, server)
    await eventWidth(cdp, module.startServer)
    await points(cdp, module.startServer)
    for (const size of SIZES) await crash(cdp, size)
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
