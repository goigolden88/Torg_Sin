// Тесты комнат на Cloudflare-подделке; те же — на SQLite в server/node/rooms.test.ts (Р-02)
import { roomsSuite } from './rooms.suite'
import { fakeServer } from './testing'

roomsSuite('Cloudflare-подделка', async (password) => fakeServer(password))
