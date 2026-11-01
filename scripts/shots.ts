// Снимки экранов для отчёта PR (Р-10: каждый экран — на 390 и 1280 px; раскладка компьютера —
// меню развёрнуто и свёрнуто — ещё и на 1920 px; событие — на 1024, 1280, 1440, 1536 и 1920 px
// с проверкой, что оно во всю свою ширину и по центру): npm run shots.
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
// Событие на ширинах ноутбука и монитора: карточка — во всю свою ширину и по центру (#30)
const EVENT_WIDTHS: Size[] = [
  LAPTOP,
  SIZES[1],
  { name: '1440', width: 1440, height: 900 },
  { name: '1536', width: 1536, height: 864 },
  WIDE[1],
]
const TIMEOUT = 20_000 // ожидание экрана: опрос сервера — раз в 5 секунд

type RoomsServer = { url: string; close: () => Promise<void> }
type ServerModule = {
  // now — подставные часы сервера (исход: сутки на возражение, 7 дней до «окончательно» — без ожидания)
  startServer: (options: { file: string; password: string | undefined; port: number; now?: () => number }) => Promise<RoomsServer>
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
    const ten = await event(hostKey, 'К обеду клюнет хотя бы десять рыб', 'Считаем улов в ведре в 14:00', [
      [hostKey, '1', 40000],
      [boryaKey, '2', 60000],
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
    await borya.waitText('Ставившие смогут возразить в течение суток')
    await borya.shot('24-predlozhit-iskhod')
    await confirmTwice(borya, 'возразить до')
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
    await borya.waitText('Утверждён „Нет“ — ведущим')
    await borya.shot('28-utverzhden-vyplaty')
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

    // Все ставили на «Да», «Да» и утверждён — сутки без возражений: без игры
    await api(server, `${rooms}/events/${boat.id}/propose`, hostKey, { outcome: '1' })
    shift += 25 * HOUR
    await vera.goto(boat.href)
    await vera.waitText('Утверждён „Да“ — без возражений')
    await vera.waitText('Без игры: ставки возвращены')
    await vera.shot('31-bez-igry')

    // Через 7 дней после утверждения — «Окончательно»
    shift += 7 * 24 * HOUR
    await borya.waitText('Окончательно.')
    await borya.shot('32-okonchatelno')
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
// событии — график и таблица выплат внутри карточки
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
}

const PLACEMENT = `(() => {
  const card = document.querySelector('.detail > .card')
  const main = document.querySelector('.main')
  const navRight = document.querySelector('.nav').getBoundingClientRect().right
  const page = document.documentElement.clientWidth
  const box = card.getBoundingClientRect()
  const style = getComputedStyle(main)
  const room = main.getBoundingClientRect().width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
  const parts = [...card.querySelectorAll('.chart-frame, .payouts')].map((el) => el.getBoundingClientRect())
  const row = card.querySelector('.payouts tr')
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
  }
})()`

// Событие и «Новое событие» на компьютере (#30): на 1024–1920 px, меню развёрнуто и свёрнуто,
// карточка — во всю свою ширину (≈ 720 px) или всё доступное, если меньше, по центру области
// справа от меню; списка комнат нет, «Назад» есть; график и выплаты — внутри карточки, таблицей.
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
    const check = async (where: string) => {
      const p = await host.eval<Placement>(PLACEMENT)
      console.log(`  ${where}: ${JSON.stringify(p)}`)
      const want = Math.min(720, p.room)
      if (Math.abs(p.card - want) > 1) problems.push(`${where}: ширина ${p.card}, а нужно ${want}`)
      if (Math.abs(p.gapLeft - p.gapRight) > 2) problems.push(`${where}: не по центру — слева ${p.gapLeft}, справа ${p.gapRight}`)
      if (p.list) problems.push(`${where}: виден список комнат`)
      if (!p.back) problems.push(`${where}: нет «Назад»`)
      if (p.scroll > 0) problems.push(`${where}: прокрутка вбок ${p.scroll} px`)
      if (!p.inside) problems.push(`${where}: график или выплаты вылезают из карточки`)
      if (!p.table) problems.push(`${where}: выплаты не таблицей`)
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
        await check(`событие, ${size.width} px, ${menu}`)
        if (!collapsed && size.width !== 1536) await host.shot('33-sobytie-shirina')
        if (collapsed && size.width === 1440) await host.shot('34-sobytie-shirina-menu-svernuto')
        await open(newHref, 'Приём ставок до')
        await check(`новое событие, ${size.width} px, ${menu}`)
        if (!collapsed && size.width === 1440) await host.shot('35-novoe-sobytie-shirina')
      }
      await nav(false)
    }
    // Комната — по-прежнему «список + открытое» рядом
    await host.resize(SIZES[1])
    await open(`${SITE}#/room/${room.roomId}`, 'Участники')
    if (!(await host.eval<boolean>(`document.querySelector('.rooms .list').offsetParent !== null`))) problems.push('комната: список комнат пропал')
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
    }
    for (const size of WIDE) await layout(cdp, size, server)
    await eventWidth(cdp, module.startServer)
    await points(cdp, module.startServer)
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
