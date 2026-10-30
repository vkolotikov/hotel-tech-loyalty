import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, HelpCircle, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '../../lib/api'
import { useAuthStore } from '../../stores/authStore'
import { Card } from '../../components/ui/Card'
import { useOperationsWords } from './words'

type CheckKey = 'media_versioning' | 'wallet_updates' | 'email_failures' | 'email_delays' | 'loyalty_delays' | 'scheduler' | 'scheduled_failures' | 'queue_failures' | 'queue_delays'
type Check = { key: CheckKey; status: 'ok' | 'attention' | 'unavailable' | 'unobserved'; count?: number; last_seen_at?: string | null }
export type OperationsSnapshot = { checked_at: string; checks: Check[] }
const actionClass = 'inline-flex items-center justify-center gap-2 min-h-11 px-4 py-2 rounded-xl border border-dark-border bg-dark-surface text-sm font-medium text-white hover:bg-dark-surface2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 disabled:opacity-50'

export function StatusChecks({ snapshot }: { snapshot: OperationsSnapshot }) {
  const w = useOperationsWords(), { i18n } = useTranslation()
  return <>
    <p className="text-sm text-t-secondary">{w.checked}: <time dateTime={snapshot.checked_at}>{new Date(snapshot.checked_at).toLocaleString(i18n.language)}</time></p>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {snapshot.checks.map(check => {
        const Icon = check.status === 'ok' ? CheckCircle2 : check.status === 'attention' ? AlertTriangle : HelpCircle
        return <Card key={check.key} className="min-w-0">
          <div className="flex items-start justify-between gap-3"><h2 className="text-base font-semibold text-white">{w[check.key]}</h2><Icon aria-hidden size={20} className={`shrink-0 ${check.status === 'attention' ? 'text-warning' : check.status === 'ok' ? 'text-success' : 'text-t-secondary'}`} /></div>
          <p className="mt-3 text-sm font-semibold text-t-soft">{w[check.status]}{check.count !== undefined && <span className="ml-2 text-2xl text-white tabular-nums">{check.count}</span>}</p>
          {check.last_seen_at && <p className="text-sm text-t-secondary mt-2"><time dateTime={check.last_seen_at}>{new Date(check.last_seen_at).toLocaleString(i18n.language)}</time></p>}
          <p className="mt-3 text-sm leading-relaxed text-t-secondary">{w[`${check.key}_hint`]}</p>
        </Card>
      })}
    </div>
  </>
}

export default function SystemStatus() {
  const w = useOperationsWords(), userId = useAuthStore(state => state.user?.id)
  const query = useQuery({ queryKey: ['operations-status', userId], queryFn: () => api.get<OperationsSnapshot>('/v1/admin/operations-status', { timeout: 15_000 }).then(r => r.data), refetchInterval: 60_000, retry: false })
  return <div className="space-y-6 max-w-6xl mx-auto">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0"><h1 className="text-2xl font-bold text-white">{w.title}</h1><p className="text-sm text-t-secondary mt-2 max-w-2xl">{w.intro}</p></div>
      <button type="button" disabled={query.isFetching} onClick={() => { void query.refetch() }} className={actionClass}><RefreshCw size={16} aria-hidden className={query.isFetching ? 'animate-spin' : ''} />{w.refresh}</button>
    </header>
    {query.isError ? <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-t-soft">{w.error}</div> : query.isPending ? <p role="status" className="text-t-secondary">{w.loading}</p> : <StatusChecks snapshot={query.data} />}
    <nav className="flex flex-wrap gap-3" aria-label={w.title}><Link to="/campaigns?tab=email" className={actionClass}>{w.campaigns}</Link><Link to="/audit-log" className={actionClass}>{w.audit}</Link></nav>
    <p className="text-sm text-t-secondary max-w-3xl">{w.footer}</p>
  </div>
}
