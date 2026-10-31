// Адрес сервера комнат (Р-02): по умолчанию — свой Worker; другой — в «Настройках»
// или в ссылке комнаты, так телефоны переезжают на запасной сервер сами
export const DEFAULT_SERVER = 'https://torg-sin.goigolden88.workers.dev'

// Приводит введённое к виду «https://хост[/путь]» без слэша в конце; не адрес — null.
// http — только для своего компьютера (localhost, 127.0.0.1): иначе браузер сайта на https его не пустит
export function normalizeServer(input: string): string | null {
  let text = input.trim()
  if (!text) return null
  if (!/^[a-z]+:\/\//i.test(text)) text = 'https://' + text
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) return null
  if (!url.hostname.includes('.') && !local) return null
  if (url.search || url.hash || url.username || url.password) return null
  return (url.origin + url.pathname).replace(/\/+$/, '')
}

export function healthUrl(server: string): string {
  return server + '/health'
}
