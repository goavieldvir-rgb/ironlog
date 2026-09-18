import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Trash2, AlertTriangle } from 'lucide-react'
import { BackChevron } from './DirectionalIcon.jsx'
import { supabase } from '../supabase.js'
import { useLanguage } from '../context/LanguageContext.jsx'
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
  const { t } = useLanguage()
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
    if (!confirm(t('errorLogs.clearAllConfirm')(logs.length))) return
    await supabase.from('error_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    load()
  }

  return (
    <div className="flex flex-col gap-5">
      <Link to="/people" className="text-chalkdim text-sm inline-flex items-center gap-1 hover:text-chalk w-fit">
        <BackChevron size={15} /> {t('errorLogs.backToPeople')}
      </Link>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="eyebrow mb-1">{t('errorLogs.admin')}</div>
          <h1 className="text-3xl">{t('errorLogs.title')}</h1>
          <p className="text-chalkdim text-sm mt-1">{t('errorLogs.subtitle')}</p>
        </div>
        {logs.length > 0 && (
          <Button variant="ghost" onClick={clearAll}>
            <Trash2 size={15} /> {t('errorLogs.clearAll')}
          </Button>
        )}
      </div>

      {!loading && logs.length === 0 && (
        <EmptyState title={t('errorLogs.emptyTitle')} body={t('errorLogs.emptyBody')} />
      )}

      <div className="flex flex-col gap-2">
        {logs.map((log) => (
          <Card key={log.id} className="flex flex-col gap-2">
            <button
              onClick={() => setOpenId(openId === log.id ? null : log.id)}
              className="flex items-start justify-between gap-3 text-start"
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
                {log.component_stack || log.stack || t('errorLogs.noStackTrace')}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
