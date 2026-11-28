// Тема (Р-50, #166): «Настройки» → «Внешний вид» — «Как в системе / Тёмная / Светлая». Устройство
// открыто в теме системы прогона (common.ts, withTheme): без выбора сайт в ней; выбор ставит
// data-theme на <html> сразу и после перезагрузки — до первой отрисовки (без вспышки), цвет полосы
// браузера (meta theme-color) — фон темы; «Как в системе» убирает выбор
import { Device, SITE, type Cdp, type Size } from './common.ts'

// Фон и цвет полосы браузера по темам — как --bg в styles.css и THEME_COLOR в src/theme.ts
const BG = { light: 'rgb(255, 255, 255)', dark: 'rgb(15, 18, 23)' }
const META = { light: '#ffffff', dark: '#0f1217' }

type Seen = { attr: string | null; stored: string | null; meta: string; bg: string; pressed: string[]; first: string | null | undefined }

const SEEN = `(() => ({
  attr: document.documentElement.getAttribute('data-theme'),
  stored: localStorage.getItem('torgsin.theme'),
  meta: document.querySelector('meta[name="theme-color"]').getAttribute('content'),
  bg: getComputedStyle(document.body).backgroundColor === 'rgba(0, 0, 0, 0)'
    ? getComputedStyle(document.documentElement).backgroundColor
    : getComputedStyle(document.body).backgroundColor,
  pressed: [...document.querySelectorAll('.seg-button[aria-pressed="true"]')].map((b) => b.innerText.trim()),
  first: window.__themeAtFirstPaint,
}))()`

// Что было у <html> в миг, когда приложение впервые что-то нарисовало
const FIRST_PAINT = `new MutationObserver((list, observer) => {
  const root = document.getElementById('root')
  if (!root || !root.childElementCount) return
  window.__themeAtFirstPaint = document.documentElement.getAttribute('data-theme')
  observer.disconnect()
}).observe(document, { childList: true, subtree: true })`

export async function theme(cdp: Cdp, size: Size) {
  console.log(`Тема, ${size.width} px`)
  const device = await Device.open(cdp, size, 'тема')
  const system = device.theme
  await device.onNewDocument(FIRST_PAINT)
  await device.goto(SITE + '#/settings')
  await device.waitText('Внешний вид')

  const expect = async (step: string, want: { attr: string | null; stored: string | null; shown: 'light' | 'dark'; pressed: string }) => {
    const seen = await device.eval<Seen>(SEEN)
    const bad: string[] = []
    if (seen.attr !== want.attr) bad.push(`data-theme «${seen.attr}», ждали «${want.attr}»`)
    if (seen.stored !== want.stored) bad.push(`torgsin.theme «${seen.stored}», ждали «${want.stored}»`)
    if (seen.meta !== META[want.shown]) bad.push(`theme-color ${seen.meta}, ждали ${META[want.shown]}`)
    if (seen.bg !== BG[want.shown]) bad.push(`фон ${seen.bg}, ждали ${BG[want.shown]}`)
    if (seen.pressed.join() !== want.pressed) bad.push(`нажата «${seen.pressed.join(', ')}», ждали «${want.pressed}»`)
    if (bad.length) throw new Error(`${step}: ${bad.join('; ')}`)
    return seen
  }

  // Три кнопки темы — не ниже 44 px, по порядку
  const buttons = await device.eval<{ text: string; height: number }[]>(
    `[...document.querySelectorAll('.seg-button')].map((b) => ({ text: b.innerText.trim(), height: b.getBoundingClientRect().height }))`,
  )
  if (buttons.map((b) => b.text).join() !== 'Как в системе,Тёмная,Светлая') throw new Error(`Кнопки темы: ${buttons.map((b) => b.text).join(', ')}`)
  const low = buttons.find((b) => b.height < 44)
  if (low) throw new Error(`Кнопка «${low.text}» — ${low.height} px, а нужно не ниже 44`)
  const wide = await device.eval<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth')
  if (wide > 0) throw new Error(`«Настройки» прокручиваются вбок на ${wide} px`)

  // Выбора нет — как в системе
  await expect('без выбора', { attr: null, stored: null, shown: system, pressed: 'Как в системе' })
  await device.shot('T1-tema-kak-v-sisteme')

  // Другая тема, чем у системы, — весь сайт меняется сразу
  const other = system === 'light' ? 'dark' : 'light'
  const label = { light: 'Светлая', dark: 'Тёмная' }
  await device.press(label[other])
  await expect(`«${label[other]}»`, { attr: other, stored: other, shown: other, pressed: label[other] })
  await device.shot(other === 'dark' ? 'T2-tema-tyomnaya' : 'T2-tema-svetlaya')

  // После перезагрузки выбор остался и стоял до первой отрисовки — без вспышки темы системы
  await device.reload()
  await device.waitText('Внешний вид')
  const after = await expect(`«${label[other]}» после перезагрузки`, { attr: other, stored: other, shown: other, pressed: label[other] })
  if (after.first !== other) throw new Error(`До первой отрисовки data-theme «${after.first}», ждали «${other}»`)
  await device.goto(SITE + '#/')
  await device.waitText('Комнат пока нет')
  await device.shot(other === 'dark' ? 'T3-moi-komnaty-tyomnaya' : 'T3-moi-komnaty-svetlaya')

  // Тема как у системы, выбранная явно, и снова «Как в системе» — выбор стёрт
  await device.goto(SITE + '#/settings')
  await device.waitText('Внешний вид')
  await device.press(label[system])
  await expect(`«${label[system]}»`, { attr: system, stored: system, shown: system, pressed: label[system] })
  await device.press('Как в системе')
  await expect('«Как в системе»', { attr: null, stored: null, shown: system, pressed: 'Как в системе' })
  console.log(`  тема системы ${system}: выбор, перезагрузка и «Как в системе» — как ждали`)
}
