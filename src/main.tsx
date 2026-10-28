import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProvider } from './app/AppProvider'
import { App } from './ui/App'
import './ui/styles.css'

const container = document.getElementById('root')
if (container === null) throw new Error('Missing #root element')

createRoot(container).render(
  <StrictMode>
    <AppProvider
      fallback={<p style={{ padding: 24, textAlign: 'center' }}>Opening your library…</p>}
      renderError={(message) => (
        <div style={{ padding: 24 }}>
          <h1>Rava Music could not start</h1>
          <p>{message}</p>
          <p>
            This usually means the browser blocked storage. Private browsing windows cannot keep a
            music library.
          </p>
        </div>
      )}
    >
      <App />
    </AppProvider>
  </StrictMode>,
)

// The service worker only caches the app shell; the music itself lives in IndexedDB.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js')
  })
}
