import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { AdminProvider } from './context/AdminContext.jsx'
import { LanguageProvider } from './context/LanguageContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { FeedbackProvider } from './context/FeedbackContext.jsx'
import { captureInstallPrompt } from './components/InstallCard.jsx'
import './index.css'

captureInstallPrompt()

// The worker also serves the app offline, so it is registered for everyone,
// not only people who turned reminders on (same URL and scope as push.js).
// Production only: in dev it would cache over Vite's live modules.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const url = new URL(import.meta.env.BASE_URL + 'sw.js', window.location.href)
    navigator.serviceWorker.register(url.href, { scope: new URL('./', url).href }).catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <ErrorBoundary>
        <FeedbackProvider>
        <HashRouter>
          <AuthProvider>
            <AdminProvider>
              <App />
            </AdminProvider>
          </AuthProvider>
        </HashRouter>
        </FeedbackProvider>
      </ErrorBoundary>
    </LanguageProvider>
  </React.StrictMode>,
)
