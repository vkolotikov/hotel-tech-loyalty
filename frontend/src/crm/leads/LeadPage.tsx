import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import { QueryState } from '../ui/QueryState'
import { LeadRecordView } from './LeadRecord'
import { pageTab, withPageTab } from './recordLogic'
import { useLeadDetail } from './recordData'

/**
 * One lead on its own page (`/crm/leads/:id`, round 5): the same record as its panel — the same header, actions and
 * tabs — drawn full width, its tab kept in the address (`?rtab=`) as the panel keeps it. The lead refreshes as the
 * full admin's lead page does.
 */
export function LeadPage() {
  const { id } = useParams<{ id: string }>()
  const leadId = Number(id)
  const { t } = useTranslation()
  const [sp, setSp] = useSearchParams()
  const lead = useLeadDetail(leadId)
  const valid = Number.isInteger(leadId) && leadId > 0
  return (
    <div className="mx-auto w-full max-w-none space-y-3 px-4 py-4 lg:px-6 lg:py-5">
      <h1 className="sr-only">{t('crm.nav.leads', 'Leads')}</h1>
      <Link to="/crm/leads" className="inline-flex min-h-8 items-center gap-1 text-sm font-medium text-a-accent-text hover:underline">
        <ArrowLeft size={14} aria-hidden />{t('crm.leads.all', 'All leads')}
      </Link>
      <QueryState loading={lead.isLoading} error={lead.error ?? (!valid ? { response: { status: 404 } } : null)} onRetry={() => { void lead.refetch() }}>
        {lead.data ? (
          <div className="rounded-2xl border border-a-border bg-a-surface shadow-a-sm">
            <LeadRecordView lead={lead.data} back tab={pageTab(sp)} onTab={tab => setSp(prev => withPageTab(prev, tab), { replace: true })} />
          </div>
        ) : <p className="text-sm text-a-text-2">{t('crm.errors.not_found', 'This is no longer here. It may have been deleted.')}</p>}
      </QueryState>
    </div>
  )
}
