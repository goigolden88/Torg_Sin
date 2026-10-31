// Настройки устройства (не данные комнат): адрес сервера — в localStorage, не в IndexedDB
import { DEFAULT_SERVER, normalizeServer } from './rules/address'

const SERVER_KEY = 'torgsin.server'

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
