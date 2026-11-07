import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
import { ErrorBoundary } from './screens/ErrorBoundary'
import './styles.css'

// Просим браузер не чистить данные комнат при нехватке места
void navigator.storage?.persist?.()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Запасной перехват: упала сама оболочка (меню) — тоже не белая страница */}
    <ErrorBoundary resetKey="">
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
