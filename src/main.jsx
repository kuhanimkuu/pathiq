import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthProvider'
import { UserProvider } from './context/UserProvider'
import { getInitialTheme, applyTheme } from './lib/theme'
import './index.css'
import App from './App.jsx'

// Applied before the first render so there's no flash of the wrong theme.
applyTheme(getInitialTheme())

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