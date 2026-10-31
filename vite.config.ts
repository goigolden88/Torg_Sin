import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { coinIcon, ICONS } from './scripts/icons.ts'

const BASE = '/Torg_Sin/'
const VERSION = (JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }).version

// PNG-иконки рисуются при сборке (scripts/icons.ts) и в dev отдаются с сервера;
// apple-touch-icon — ссылкой в <head> для iPhone
function coinIcons(): Plugin {
  return {
    name: 'coin-icons',
    generateBundle() {
      for (const [fileName, spec] of Object.entries(ICONS)) {
        this.emitFile({ type: 'asset', fileName, source: coinIcon(spec) })
      }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split('?')[0].replace(BASE, '')
        const spec = name ? ICONS[name] : undefined
        if (!spec) return next()
        res.setHeader('Content-Type', 'image/png')
        res.end(coinIcon(spec))
      })
    },
    transformIndexHtml() {
      return [{ tag: 'link', attrs: { rel: 'apple-touch-icon', href: BASE + 'apple-touch-icon.png' }, injectTo: 'head' }]
    },
  }
}

export default defineConfig({
  base: BASE,
  define: { __APP_VERSION__: JSON.stringify(VERSION) },
  oxc: { jsx: { runtime: 'automatic' } },
  plugins: [
    coinIcons(),
    VitePWA({
      registerType: 'autoUpdate',
      // id постоянный и не меняется никогда: другой id — для Chrome другое приложение (Р-12)
      manifestFilename: 'torgsin.webmanifest',
      manifest: {
        id: '/Torg_Sin/torgsin',
        name: 'ТоргСин',
        short_name: 'ТоргСин',
        description: 'Споры и ставки с друзьями: события, пари, исход и расчёт «кто кому»',
        lang: 'ru',
        start_url: BASE + '?app=torgsin',
        scope: BASE,
        display: 'standalone',
        background_color: '#11141c',
        theme_color: '#11141c',
        icons: [
          { src: BASE + 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: BASE + 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: BASE + 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // ?app=torgsin в адресе запуска не мешает взять index.html из кеша без сети
        ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^app$/],
        navigateFallback: 'index.html',
      },
    }),
  ],
})
