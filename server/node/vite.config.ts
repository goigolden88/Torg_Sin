// Сборка запасного сервера в один файл для Node (npm run server:node): Node сам не находит
// модули без расширения .ts, поэтому код собирает Vite, как сайт. Встроенные модули Node — снаружи
import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: false,
  logLevel: 'warn',
  build: {
    ssr: 'server/node/main.ts',
    outDir: 'server/node/dist',
    emptyOutDir: true,
    target: 'node24',
    minify: false,
    rollupOptions: { external: [/^node:/], output: { entryFileNames: 'main.js' } },
  },
})
