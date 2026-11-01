// Настройки устройства (не данные комнат): адрес сервера, пароль компании, свёрнутое меню —
// в localStorage, не в IndexedDB
import { DEFAULT_SERVER, normalizeServer } from './rules/address'

const SERVER_KEY = 'torgsin.server'
const PASSWORD_KEY = 'torgsin.password'
const NAV_KEY = 'torgsin.navCollapsed'

// Меню слева на компьютере свёрнуто до значков; по умолчанию — развёрнуто
export function getNavCollapsed(): boolean {
  try {
    return localStorage.getItem(NAV_KEY) === '1'
  } catch {
    return false
  }
}

export function setNavCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) localStorage.setItem(NAV_KEY, '1')
    else localStorage.removeItem(NAV_KEY)
  } catch {
    // localStorage недоступен (частный режим) — положение меню просто не запомнится
  }
}

// Пароль компании, которым на этом устройстве уже создали комнату; нет — пусто
export function getPassword(): string {
  try {
    return localStorage.getItem(PASSWORD_KEY) ?? ''
  } catch {
    return ''
  }
}

// Запомнить (после удачного создания комнаты); пусто — стереть
export function setPassword(password: string): void {
  try {
    if (password) localStorage.setItem(PASSWORD_KEY, password)
    else localStorage.removeItem(PASSWORD_KEY)
  } catch {
    // localStorage недоступен (частный режим) — пароль просто не запомнится
  }
}

export function getServer(): string {
  try {
    return normalizeServer(localStorage.getItem(SERVER_KEY) ?? '') ?? DEFAULT_SERVER
  } catch {
    return DEFAULT_SERVER
  }
}

// Пустое или адрес по умолчанию — забыть своё; не адрес — false
export function setServer(input: string): boolean {
  if (!input.trim()) {
    localStorage.removeItem(SERVER_KEY)
    return true
  }
  const server = normalizeServer(input)
  if (!server) return false
  if (server === DEFAULT_SERVER) localStorage.removeItem(SERVER_KEY)
  else localStorage.setItem(SERVER_KEY, server)
  return true
}
