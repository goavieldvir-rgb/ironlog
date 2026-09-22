import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { AdminProvider } from './context/AdminContext.jsx'
import { LanguageProvider } from './context/LanguageContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { FeedbackProvider } from './context/FeedbackContext.jsx'
import './index.css'

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
