// Запуск запасного сервера: npm run server:node.
// Переменные окружения: ROOM_PASSWORD — пароль компании (как секрет Worker'а); PORT — порт
// (по умолчанию 8787); HOST — адрес (по умолчанию все); ROOMS_DB — файл SQLite
// (по умолчанию server/node/data.sqlite)
import { DEFAULT_DB, DEFAULT_PORT, startServer } from './app'

const port = process.env.PORT ? Number(process.env.PORT) : DEFAULT_PORT
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('PORT — номер порта от 0 до 65535, а не', process.env.PORT)
  process.exit(1)
}
const file = process.env.ROOMS_DB || DEFAULT_DB
const password = process.env.ROOM_PASSWORD || undefined

const server = await startServer({ file, password, port, host: process.env.HOST || undefined })
console.log(`Сервер комнат ТоргСина: ${server.url} (файл ${file})`)
if (!password) console.log('ROOM_PASSWORD не задан — создание комнат выключено')

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    console.log('Остановка…')
    server.close().then(
      () => process.exit(0),
      (error: unknown) => {
        console.error(error)
        process.exit(1)
      },
    )
  })
}
