// Веб-сервер запасной обёртки на встроенном node:http: запрос Node → Request, ответ Response →
// Node. Сами ответы — из server/src/http.ts, те же, что у Worker'а
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { PROTOCOL_VERSION } from '../../src/rules/protocol'
import { json } from '../src/http'

// Запросы сервера комнат маленькие; больше — отказ, чтобы чужой не забил память
export const MAX_BODY = 1024 * 1024
export const TOO_LARGE = 'Слишком большой запрос'
export const SERVER_ERROR = 'Ошибка сервера — попробуйте ещё раз'

export type Handler = (request: Request) => Promise<Response>

export function listen(handler: Handler, port: number, host?: string): Promise<Server> {
  const server = createServer((req, res) => {
    serve(req, res, handler).catch((error: unknown) => {
      console.error('Ошибка запроса', req.method, req.url, error)
      if (!res.headersSent) void write(res, json(500, { v: PROTOCOL_VERSION, error: SERVER_ERROR })).catch(() => res.destroy())
      else res.destroy()
    })
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve(server)
    })
  })
}

async function serve(req: IncomingMessage, res: ServerResponse, handler: Handler): Promise<void> {
  const chunks: Buffer[] = []
  let size = 0
  // Лишнее дочитывается без хранения: оборвать чтение — оборвать и соединение, ответ не дойдёт
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size <= MAX_BODY) chunks.push(chunk as Buffer)
  }
  if (size > MAX_BODY) return write(res, json(413, { v: PROTOCOL_VERSION, error: TOO_LARGE }), true)
  const method = req.method ?? 'GET'
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    for (const one of Array.isArray(value) ? value : [value]) headers.append(name, one)
  }
  const hasBody = method !== 'GET' && method !== 'HEAD' && chunks.length > 0
  // Адрес хоста ответам не нужен — только путь: заголовку Host не доверяем
  const url = new URL(req.url ?? '/', 'http://localhost')
  await write(res, await handler(new Request(url, { method, headers, body: hasBody ? Buffer.concat(chunks) : undefined })))
}

async function write(res: ServerResponse, response: Response, close = false): Promise<void> {
  res.statusCode = response.status
  response.headers.forEach((value, name) => res.setHeader(name, value))
  if (close) res.setHeader('Connection', 'close')
  res.end(Buffer.from(await response.arrayBuffer()))
}
