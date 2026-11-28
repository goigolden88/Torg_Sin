// Тема сайта (Р-50, #166): «Как в системе / Тёмная / Светлая» — настройка устройства, localStorage
// `torgsin.theme` (`dark` / `light`; нет ключа — как в системе). Выбор — атрибут `data-theme` на
// <html>, цвета — переменные темы в styles.css. До первой отрисовки тему ставит скрипт в index.html
// (без вспышки светлого) — тем же ключом и теми же цветами; этот модуль — смена в «Настройках» и цвет
// полосы браузера (meta theme-color), в том числе когда «как в системе» и система сменила тему

export type ThemeChoice = 'system' | 'dark' | 'light'
export type Theme = 'dark' | 'light'

export const THEME_KEY = 'torgsin.theme'

// Цвет полосы браузера — фон темы (--bg в styles.css); те же — в index.html
export const THEME_COLOR: Record<Theme, string> = { light: '#ffffff', dark: '#0f1217' }

// Порядок и подписи кнопок в «Настройках»
export const THEME_CHOICES: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Как в системе' },
  { value: 'dark', label: 'Тёмная' },
  { value: 'light', label: 'Светлая' },
]

const DARK_QUERY = '(prefers-color-scheme: dark)'

// Записанное на устройстве → выбор; чужое или пусто — как в системе
export function parseTheme(raw: string | null): ThemeChoice {
  return raw === 'dark' || raw === 'light' ? raw : 'system'
}

// Какая тема на экране: выбор, а «как в системе» — по теме системы
export function resolveTheme(choice: ThemeChoice, systemDark: boolean): Theme {
  if (choice === 'system') return systemDark ? 'dark' : 'light'
  return choice
}

export function getTheme(): ThemeChoice {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY))
  } catch {
    return 'system'
  }
}

function systemDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia(DARK_QUERY).matches
}

// Поставить тему на страницу: data-theme (как в системе — без атрибута) и цвет полосы браузера
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', choice)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[resolveTheme(choice, systemDark())])
}

// Выбор в «Настройках»: запомнить на устройстве и сразу поставить
export function setTheme(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, choice)
  } catch {
    // localStorage недоступен (частный режим) — тема продержится до перезагрузки страницы
  }
  applyTheme(choice)
}

// При запуске: тема уже стоит (index.html) — следить за темой системы, пока выбрано «как в системе»
export function watchSystemTheme(): void {
  if (typeof matchMedia !== 'function') return
  matchMedia(DARK_QUERY).addEventListener('change', () => applyTheme(getTheme()))
}
