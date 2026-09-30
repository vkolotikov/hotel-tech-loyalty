import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { appointmentsApi } from '../lib/api'
import { useVocab } from '../lib/vocab'
import { Notice } from '../ui/Notice'

/** Find a client. The list is the organisation's own clients — the people the full admin lists under Customers. */
export function ClientsPage() {
  const { t } = useTranslation()
  const vocab = useVocab()
  const [params, setParams] = useSearchParams()
  const [term, setTerm] = useState(params.get('search') ?? '')
  const [debounced, setDebounced] = useState(term.trim())

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [term])

  // The top bar's search lands here with ?search=; keep the field and the address in step.
  useEffect(() => {
    const linked = params.get('search') ?? ''
    if (linked !== '' && linked !== term) setTerm(linked)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])
  useEffect(() => {
    setParams(debounced.length >= 2 ? { search: debounced } : {}, { replace: true })
  }, [debounced, setParams])

  const query = useQuery({
    queryKey: ['appointments', 'clients', debounced],
    queryFn: () => appointmentsApi.searchClients(debounced),
    enabled: debounced.length >= 2,
  })

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold text-a-text">{vocab('clients')}</h1>
      <label className="block">
        <span className="sr-only">{t('appointments.shell.search', 'Search clients')}</span>
        <input value={term} onChange={(e) => setTerm(e.target.value)} autoFocus
          placeholder={t('appointments.client.search_placeholder', 'Name, phone or email')}
          className="w-full rounded-lg border border-a-border bg-a-surface px-3 py-2.5 text-sm text-a-text placeholder:text-a-text-2" />
      </label>

      {debounced.length < 2 && <p className="text-sm text-a-text-2">{t('appointments.client.search_hint', 'Type at least two characters to search.')}</p>}
      {query.isFetching && <p className="text-sm text-a-text-2" role="status">{t('appointments.common.loading', 'Loading…')}</p>}
      {query.isError && <Notice tone="danger">{t('appointments.common.error', 'Something went wrong. Please try again.')}</Notice>}
      {query.data && query.data.clients.length === 0 && <p className="text-sm text-a-text-2">{t('appointments.client.none_found', 'No one found.')}</p>}

      {query.data && query.data.clients.length > 0 && (
        <ul className="divide-y divide-a-border rounded-lg border border-a-border bg-a-surface">
          {query.data.clients.map(c => (
            <li key={c.id}>
              <Link to={`/appointments/clients/${c.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-a-surface-2">
                <span>
                  <span className="block text-sm font-semibold text-a-text">{c.name}</span>
                  <span className="block text-xs text-a-text-2">{[c.phone, c.email].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="text-xs text-a-text-2">
                  {c.member
                    ? t('appointments.client.member_line', 'Member · {{tier}} · {{points}} points', { tier: c.member.tier ?? '—', points: c.member.points })
                    : t('appointments.client.not_member', 'Not a member')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
