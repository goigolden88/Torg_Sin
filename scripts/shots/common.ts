// Общее для сценариев снимков (scripts/shots.ts — вход): адреса и ширины, DevTools-протокол,
// Chrome без окна, «устройство» со своим хранилищем и помощники, которыми пользуются несколько
// сценариев. Chrome — google-chrome, google-chrome-stable или chromium; свой путь — переменная CHROME
import { spawn, type ChildProcess } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const OUT = 'shots'
export const PORT = 4173
export const SITE = `http://localhost:${PORT}/Torg_Sin/`
export const PASSWORD = 'demo-password' // выдуманный: сервер живёт только на время снимков
export type Size = { name: string; width: number; height: number }
export const SIZES: Size[] = [
  { name: '390', width: 390, height: 844 },
  { name: '1280', width: 1280, height: 800 },
]
// Раскладка компьютера (меню слева, ширина содержимого) — ещё и на широком мониторе
export const WIDE: Size[] = [SIZES[1], { name: '1920', width: 1920, height: 1080 }]
// Узкий компьютер: событие с развёрнутым меню должно получить свою ширину (≥ 640 px)
export const LAPTOP: Size = { name: '1024', width: 1024, height: 768 }
// Событие на ширинах ноутбука и монитора: карточка — во всю ширину области, не шире
// --content-max, по центру; от 1280 px — две колонки (#38)
export const EVENT_WIDTHS: Size[] = [
  LAPTOP,
  SIZES[1],
  { name: '1440', width: 1440, height: 900 },
  { name: '1536', width: 1536, height: 864 },
  WIDE[1],
  { name: '2560', width: 2560, height: 1440 },
]
export const CONTENT_MAX = 1600 // --content-max, 100 rem при шрифте 16 px
export const TIMEOUT = 20_000 // ожидание экрана: опрос сервера — раз в 5 секунд

export type RoomsServer = { url: string; close: () => Promise<void> }
export type ServerModule = {
  // now — подставные часы сервера (исход: сутки на возражение, 7 дней до «окончательно» — без ожидания);
  // seed — зерно жребия суда (выдуманное: снимки одинаковы от прогона к прогону)
  startServer: (options: { file: string; password: string | undefined; port: number; now?: () => number; seed?: () => string }) => Promise<RoomsServer>
}

// ─── DevTools-протокол ───────────────────────────────────────────────────────

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void }

export class Cdp {
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
export async function launchChrome(profile: string): Promise<{ process: ChildProcess; url: string }> {
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

export class Device {
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

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ─── Помощники нескольких сценариев ──────────────────────────────────────────

// Запрос сценария к серверу в обход экрана (событие с близким сроком закрытия, ставки на нём);
// key пустой — без ключа (создать комнату, заявка)
export async function api<T>(server: RoomsServer, path: string, key: string, body: object): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (key) headers.Authorization = 'Bearer ' + key
  const res = await fetch(server.url + path, { method: 'POST', headers, body: JSON.stringify(body) })
  const json = (await res.json()) as T
  if (!res.ok) throw new Error(`${path}: ${JSON.stringify(json)}`)
  return json
}

// Подтвердить ставку в окне; двойное нажатие — ставка должна быть одна (Р-13)
export async function confirmBet(device: Device): Promise<void> {
  await device.eval(`(() => {
    const button = document.querySelector('.modal .button')
    button.click()
    button.click()
  })()`)
  await device.waitText('Ставка принята')
}

// Выбрать точку графика вероятности: место по ширине рисунка (0 — начало оси, 1 — конец);
// hover — наведением мыши (компьютер), иначе нажатием (телефон)
export async function pickPoint(device: Device, fraction: number, hover: boolean): Promise<void> {
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

// Подтвердить действие с исходом в окне; двойное нажатие — одно действие (Р-13)
export async function confirmTwice(device: Device, done: string): Promise<void> {
  await device.eval(`(() => {
    const button = document.querySelector('.modal .button')
    button.click()
    button.click()
  })()`)
  await device.waitText(done)
}

// Где стоит карточка открытого: ширина, поля слева и справа от неё до краёв области справа от
// меню, доступная ширина (содержимое .main без полей), список и «Назад», прокрутка вбок; на
// событии — график и таблица выплат внутри карточки, длинное условие не вылезает; колонки:
// левая (.event-main или первая .form-col) и правая (.event-side или вторая .form-col),
// «Ваша позиция» — её правый край
export type Box = { left: number; right: number; top: number; bottom: number; width: number }
export type Placement = {
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

export const PLACEMENT = `(() => {
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

// Чужие браузеры и заметка про экран «Домой» (#56)
export const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
export const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
export const HOME_NOTE = 'Поставите ТоргСин на экран „Домой“ — там комнаты не будет: iPhone хранит её отдельно.'
