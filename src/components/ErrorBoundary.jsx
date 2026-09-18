import React from 'react'
import { supabase } from '../supabase.js'
import { useLanguage } from '../context/LanguageContext.jsx'

// Catches any uncaught error anywhere in the app so a single broken page
// shows a friendly recovery screen instead of a blank white page — and logs
// it to Supabase so an admin can actually find out it happened.
//
// This is a class component (React error boundaries require the
// getDerivedStateFromError/componentDidCatch lifecycle, which only exists
// on classes) but its fallback screen still needs translated text. Since
// classes can't call hooks directly, ErrorBoundaryInner takes `t` as a
// prop, and the default-exported functional wrapper below supplies it —
// this only works because LanguageProvider sits above ErrorBoundary in
// main.jsx, so useLanguage() here is always safe to call.
class ErrorBoundaryInner extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error(error, info)
    this.logError(error, info)
  }

  async logError(error, info) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      await supabase.from('error_logs').insert({
        user_id: session?.user?.id || null,
        message: String(error?.message || error).slice(0, 2000),
        stack: String(error?.stack || '').slice(0, 4000),
        component_stack: String(info?.componentStack || '').slice(0, 4000),
        url: window.location.href,
      })
    } catch (e) {
      // If logging itself fails (e.g. offline), there's nothing more useful
      // to do than note it locally — the user still sees the recovery screen.
      console.error('Failed to log error', e)
    }
  }

  render() {
    if (this.state.hasError) {
      const { t } = this.props
      return (
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="max-w-sm text-center flex flex-col gap-4">
            <div className="eyebrow">Ironlog</div>
            <h1 className="text-3xl">{t('errorBoundary.title')}</h1>
            <p className="text-chalkdim text-sm">{t('errorBoundary.body')}</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-iron text-chalk rounded-md px-4 py-2 text-sm font-medium hover:bg-iron/90 mx-auto"
            >
              {t('errorBoundary.reload')}
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function ErrorBoundary({ children }) {
  const { t } = useLanguage()
  return <ErrorBoundaryInner t={t}>{children}</ErrorBoundaryInner>
}
