import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { UserPlus, X } from 'lucide-react'
import { appointmentsApi, failureOf } from '../lib/api'
import type { ClientSummary } from '../lib/types'
import { useVocab } from '../lib/vocab'
import { Button } from '../ui/Button'
import { Notice } from '../ui/Notice'
import { clientFormKey, duplicatesFor, type DuplicateWarning } from './clientForm'

const input = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text placeholder:text-a-text-2'

function contact(c: ClientSummary): string {
  return [c.phone, c.email].filter(Boolean).join(' · ')
}

/**
 * Choose the client without leaving the booking: search the organisation's
 * own clients, or add one with a name and a phone number or email. A likely
 * duplicate is shown for the operator to pick or to override — never merged.
 */
export function ClientPicker({ client, onPick }: { client: ClientSummary | null; onPick: (client: ClientSummary | null) => void }) {
  const { t } = useTranslation()
  const vocab = useVocab()
  const [term, setTerm] = useState('')
  const [debounced, setDebounced] = useState('')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', email: '' })
  const [warning, setMatches] = useState<DuplicateWarning | null>(null)
  // Only for the details the server was asked about: editing them withdraws the warning and "add anyway".
  const matches = duplicatesFor(warning, form)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Choosing or clearing a client replaces the control that was used; once
  // the operator has done either, focus follows to the control that took its
  // place. Never on first render, where it would pull focus off the panel's heading.
  const [handled, setHandled] = useState(false)
  const pick = (next: ClientSummary | null) => { setHandled(true); onPick(next) }

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(term.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [term])

  const search = useQuery({
    queryKey: ['appointments', 'clients', debounced],
    queryFn: () => appointmentsApi.searchClients(debounced),
    enabled: debounced.length >= 2,
  })

  const canAdd = form.name.trim() !== '' && (form.phone.trim() !== '' || form.email.trim() !== '')

  const add = async (confirmNew: boolean) => {
    const sent = form
    setBusy(true)
    setError(null)
    try {
      const { client: made } = await appointmentsApi.createClient({
        name: sent.name.trim(),
        phone: sent.phone.trim() || undefined,
        email: sent.email.trim() || undefined,
        confirm_new: confirmNew || undefined,
      })
      setAdding(false)
      setMatches(null)
      pick(made)
    } catch (e) {
      const failure = failureOf(e)
      if (failure.code === 'possible_duplicate' && failure.matches) setMatches({ for: clientFormKey(sent), list: failure.matches })
      else setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  if (client) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border border-a-border bg-a-surface-2 px-3 py-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-a-text truncate">{client.name}</div>
          <div className="text-xs text-a-text-2 truncate">{contact(client)}</div>
          <div className="text-xs text-a-text-2 mt-0.5">
            {client.member
              ? t('appointments.client.member_line', 'Member · {{tier}} · {{points}} points', { tier: client.member.tier ?? '—', points: client.member.points })
              : t('appointments.client.not_member', 'Not a member')}
          </div>
        </div>
        <button type="button" autoFocus={handled} onClick={() => pick(null)} className="shrink-0 rounded p-1 text-a-text-2 hover:text-a-text" aria-label={t('appointments.client.change', 'Choose someone else')}>
          <X size={16} aria-hidden />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <label className="block">
        <span className="block text-xs font-medium text-a-text-2 mb-1">{vocab('client')}</span>
        <input value={term} onChange={(e) => setTerm(e.target.value)} className={input} autoFocus={handled}
          placeholder={t('appointments.client.search_placeholder', 'Name, phone or email')} />
      </label>

      {search.isFetching && <p className="text-xs text-a-text-2" role="status">{t('appointments.common.loading', 'Loading…')}</p>}
      {search.data && search.data.clients.length === 0 && (
        <p className="text-xs text-a-text-2">{t('appointments.client.none_found', 'No one found.')}</p>
      )}
      {search.data && search.data.clients.length > 0 && (
        <ul className="rounded-lg border border-a-border divide-y divide-a-border max-h-56 overflow-y-auto">
          {search.data.clients.map(c => (
            <li key={c.id}>
              <button type="button" onClick={() => pick(c)} className="w-full text-left px-3 py-2 hover:bg-a-surface-2">
                <div className="text-sm font-medium text-a-text">{c.name}</div>
                <div className="text-xs text-a-text-2">{contact(c)}{c.member ? ` · ${c.member.tier ?? t('appointments.client.member', 'Member')}` : ''}</div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!adding && (
        <button type="button" onClick={() => { setAdding(true); setForm(f => ({ ...f, name: f.name || term.trim() })) }}
          className="inline-flex items-center gap-2 text-sm font-semibold text-a-accent-deep">
          <UserPlus size={15} aria-hidden /> {t('appointments.client.new', 'Add new')}
        </button>
      )}

      {adding && (
        <div className="rounded-lg border border-a-border p-3 space-y-2">
          <label className="block">
            <span className="block text-xs font-medium text-a-text-2 mb-1">{t('appointments.client.name', 'Name')}</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} maxLength={200} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-a-text-2 mb-1">{t('appointments.client.phone', 'Phone')}</span>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={input} maxLength={50} inputMode="tel" />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-a-text-2 mb-1">{t('appointments.client.email', 'Email')}</span>
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} maxLength={150} inputMode="email" />
          </label>
          <p className="text-xs text-a-text-2">{t('appointments.client.contact_hint', 'A name, and a phone number or an email.')}</p>

          {matches && (
            <Notice tone="warning">
              <p className="font-semibold">{t('appointments.client.duplicate_title', 'This may already be a client:')}</p>
              <ul className="mt-1 space-y-1">
                {matches.map(m => (
                  <li key={m.id}>
                    <button type="button" onClick={() => pick(m)} className="underline underline-offset-2 text-left">{m.name} — {contact(m)}</button>
                  </li>
                ))}
              </ul>
            </Notice>
          )}
          {error && <Notice tone="danger">{error}</Notice>}

          <div className="flex flex-wrap gap-2">
            {!matches && <Button type="button" size="sm" disabled={!canAdd} loading={busy} onClick={() => { void add(false) }}>{t('appointments.client.add', 'Add')}</Button>}
            {matches && <Button type="button" size="sm" variant="secondary" disabled={!canAdd} loading={busy} onClick={() => { void add(true) }}>{t('appointments.client.add_anyway', 'Add as a new client anyway')}</Button>}
            <Button type="button" size="sm" variant="ghost" onClick={() => { setAdding(false); setMatches(null); setError(null) }}>{t('appointments.common.cancel', 'Cancel')}</Button>
          </div>
        </div>
      )}
    </div>
  )
}
