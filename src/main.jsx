import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import { UserProvider } from './context/UserProvider'
import { getInitialTheme, applyTheme } from './lib/theme'
import './lib/installPrompt' // starts listening for the browser's install prompt early
import './index.css'
import App from './App.jsx'

// Applied before the first render so there's no flash of the wrong theme.
applyTheme(getInitialTheme(), { persist: false })

// Offline app shell (public/sw.js). Production only — in dev it would cache
// Vite's unbundled modules and fight hot reload.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}))
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <UserProvider>
          <App />
        </UserProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)