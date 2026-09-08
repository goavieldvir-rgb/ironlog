import React from 'react'
import { supabase } from '../supabase.js'

// Catches any uncaught error anywhere in the app so a single broken page
// shows a friendly recovery screen instead of a blank white page — and logs
// it to Supabase so an admin can actually find out it happened.
export default class ErrorBoundary extends React.Component {
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
      return (
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="max-w-sm text-center flex flex-col gap-4">
            <div className="eyebrow">Ironlog</div>
            <h1 className="text-3xl">Something went wrong</h1>
            <p className="text-chalkdim text-sm">
              This screen hit an unexpected error. Your training data is safe — this is just a display hiccup.
              Reloading usually fixes it.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-iron text-chalk rounded-md px-4 py-2 text-sm font-medium hover:bg-iron/90 mx-auto"
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
