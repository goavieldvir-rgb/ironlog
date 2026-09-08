import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Trash2, AlertTriangle } from 'lucide-react'
import { supabase } from '../supabase.js'
import { Card, EmptyState, Button } from './ui.jsx'

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ErrorLogs() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState(null)

  function load() {
    setLoading(true)
    supabase
      .from('error_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (error) console.error(error)
        setLogs(data || [])
        setLoading(false)
      })
  }

  useEffect(load, [])

  async function clearAll() {
    if (!confirm(`Delete all ${logs.length} error logs?`)) return
    await supabase.from('error_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    load()
  }

  return (
    <div className="flex flex-col gap-5">
      <Link to="/people" className="text-chalkdim text-sm inline-flex items-center gap-1 hover:text-chalk w-fit">
        <ChevronLeft size={15} /> People
      </Link>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="eyebrow mb-1">Admin</div>
          <h1 className="text-3xl">Error logs</h1>
          <p className="text-chalkdim text-sm mt-1">Unexpected errors anyone hits in the app show up here.</p>
        </div>
        {logs.length > 0 && (
          <Button variant="ghost" onClick={clearAll}>
            <Trash2 size={15} /> Clear all
          </Button>
        )}
      </div>

      {!loading && logs.length === 0 && (
        <EmptyState title="No errors logged" body="Good news — nobody's hit an unexpected error since this was set up." />
      )}

      <div className="flex flex-col gap-2">
        {logs.map((log) => (
          <Card key={log.id} className="flex flex-col gap-2">
            <button
              onClick={() => setOpenId(openId === log.id ? null : log.id)}
              className="flex items-start justify-between gap-3 text-left"
            >
              <div className="flex items-start gap-2 min-w-0">
                <AlertTriangle size={16} className="text-iron shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="truncate">{log.message}</p>
                  <p className="text-chalkdim text-xs mt-0.5">{formatDate(log.created_at)}</p>
                </div>
              </div>
            </button>
            {openId === log.id && (
              <div className="text-xs text-chalkdim font-mono bg-surface2 rounded-md p-3 overflow-x-auto whitespace-pre-wrap">
                URL: {log.url}
                {'\n\n'}
                {log.component_stack || log.stack || 'No stack trace available.'}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
