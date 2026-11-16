import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import { useRetainedState } from '../drafts/useRetainedState'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { PageHeader } from '../ui/PageHeader'
import { CAMPAIGN_STATUSES, type Campaign, type CampaignFields } from './types'

const EMPTY: CampaignFields = { name: '', goal: '', brief: '', start_date: null, end_date: null, status: 'draft' }

function CampaignForm({ target, row, onDone }: { target: number | 'new'; row: Campaign | null; onDone: () => void }) {
  const api = useApi(), brand = useBrandId(), client = useQueryClient(), { t } = useTranslation()
  const [form, setForm, retained] = useRetainedState<CampaignFields>(`campaign:${target}`, () => row ? { name: row.name, goal: row.goal, brief: row.brief, start_date: row.start_date, end_date: row.end_date, status: row.status } : EMPTY)
  const [busy, setBusy] = useRetainedState(`campaign-busy:${target}`, false, false)
  const [error, setError] = useState(false)
  const save = async () => {
    setBusy(true); setError(false)
    try {
      await api.saveCampaign(target === 'new' ? null : target, form)
      await client.invalidateQueries({ queryKey: ['content', brand, 'campaigns'] })
      retained.clear(); onDone()
    } catch { setError(true) } finally { setBusy(false) }
  }
  return <form onSubmit={e => { e.preventDefault(); void save() }} className="c-settings-card">
    <fieldset disabled={busy} className="space-y-4">
      <h2 className="font-a-display text-xl text-a-text">{target === 'new' ? t('content.campaigns.add', 'Add campaign') : t('content.campaigns.edit', 'Edit campaign')}</h2>
      <label className="block text-sm text-a-text">{t('content.campaigns.name', 'Name')}<input required maxLength={255} className="c-launch-input mt-1" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
      <label className="block text-sm text-a-text">{t('content.campaigns.goal', 'Goal')}<textarea rows={2} maxLength={5000} className="c-launch-input mt-1" value={form.goal ?? ''} onChange={e => setForm({ ...form, goal: e.target.value })} /></label>
      <div className="grid gap-3 sm:grid-cols-2">{(['start_date', 'end_date'] as const).map(key => <label key={key} className="block text-sm text-a-text">{t(`content.campaigns.${key}`, key === 'start_date' ? 'Start date' : 'End date')}<input type="date" min={key === 'end_date' ? form.start_date ?? undefined : undefined} className="c-launch-input mt-1" value={form[key] ?? ''} onChange={e => setForm({ ...form, [key]: e.target.value || null })} /></label>)}</div>
      <label className="block text-sm text-a-text">{t('content.campaigns.brief', 'Brief')}<textarea rows={5} maxLength={10000} className="c-launch-input mt-1" value={form.brief ?? ''} onChange={e => setForm({ ...form, brief: e.target.value })} /></label>
      <label className="block text-sm text-a-text">{t('content.posts.status', 'Status')}<select className="c-launch-input mt-1" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as CampaignFields['status'] })}>{CAMPAIGN_STATUSES.map(status => <option key={status} value={status}>{t(`content.campaigns.${status}`, status)}</option>)}</select></label>
      <p className="text-sm text-a-text-2">{t('content.campaigns.history', 'Archiving keeps associated posts and existing tracked links. Dates guide the brief; they do not move posts.')}</p>
      {error && <Notice tone="danger">{t('content.campaigns.save_failed', 'The campaign could not be saved. Check its name and date range, then try again.')}</Notice>}
      <div className="flex flex-wrap gap-2"><Button type="submit" loading={busy} disabled={!form.name.trim()}>{t('content.brand.save', 'Save')}</Button><Button variant="secondary" onClick={() => { retained.clear(); onDone() }}>{t('content.common.cancel', 'Cancel')}</Button></div>
    </fieldset>
  </form>
}

export function CampaignsPage() {
  const api = useApi(), brand = useBrandId(), boot = useBoot(), { t } = useTranslation()
  const query = useQuery({ queryKey: ['content', brand, 'campaigns'], queryFn: api.campaigns })
  const [open, setOpen] = useRetainedState<number | 'new' | null>('campaign-open', null, false)
  const [filter, setFilter] = useState('')
  const row = typeof open === 'number' ? query.data?.campaigns.find(c => c.id === open) : null
  const rows = query.data?.campaigns.filter(c => !filter || c.status === filter) ?? []
  return <div className="space-y-4 px-4 py-4 lg:px-6">
    <PageHeader title={t('content.campaigns.title', 'Campaigns')}><span>{boot.staff.can_manage && boot.profile && <Button onClick={() => setOpen('new')}>{t('content.campaigns.add', 'Add campaign')}</Button>}</span></PageHeader>
    <p className="text-sm text-a-text-2">{t('content.campaigns.intro', 'Keep a goal, dates and brief together, then assign posts or select the campaign when generating drafts.')}</p>
    {!boot.profile && <Notice tone="info">{t('content.campaigns.setup', 'Set up this brand before creating a campaign.')} {boot.staff.can_manage && <Link className="underline" to="/content/brand">{t('content.nav.brand', 'Brand')}</Link>}</Notice>}
    <label className="block max-w-xs text-xs text-a-text-2">{t('content.posts.status', 'Status')}<select className="c-launch-input mt-1" value={filter} onChange={e => setFilter(e.target.value)}><option value="">{t('content.posts.all_statuses', 'All statuses')}</option>{CAMPAIGN_STATUSES.map(s => <option value={s} key={s}>{t(`content.campaigns.${s}`, s)}</option>)}</select></label>
    {query.isPending && <p role="status">{t('content.common.loading', 'Loading…')}</p>}
    {query.isError && <Notice tone="danger">{t('content.common.error', 'Something went wrong. Please try again.')} <Button variant="secondary" onClick={() => { void query.refetch() }}>{t('content.common.retry', 'Try again')}</Button></Notice>}
    {open !== null && boot.staff.can_manage && (open === 'new' || row) && <CampaignForm key={`${brand}:${open}`} target={open} row={row ?? null} onDone={() => setOpen(current => current === open ? null : current)} />}
    {typeof open === 'number' && !row && !query.isPending && !query.isError && <Notice tone="warning">{t('content.campaigns.unavailable', 'Saved campaign')} <Button onClick={() => setOpen(null)}>{t('content.common.cancel', 'Cancel')}</Button></Notice>}
    {query.data && rows.length === 0 && <div className="c-settings-card text-sm text-a-text-2">{filter ? t('content.campaigns.no_match', 'No campaigns match this status.') : t('content.campaigns.empty', 'No campaigns yet. A manager can add the first brief.')}</div>}
    <div className="grid gap-4 xl:grid-cols-2">{rows.map(c => <article className="c-settings-card min-w-0 space-y-3" key={c.id}>
      <div className="flex flex-wrap items-start justify-between gap-2"><h2 className="min-w-0 break-words font-a-display text-xl text-a-text">{c.name}</h2><span className="text-xs text-a-text-2">{t(`content.campaigns.${c.status}`, c.status)}</span></div>
      <p className="whitespace-pre-wrap break-words text-sm text-a-text">{c.goal}</p><p className="text-xs text-a-text-2">{[c.start_date, c.end_date].filter(Boolean).join(' – ')}</p>
      {c.brief && <details className="text-sm text-a-text-2"><summary className="cursor-pointer">{t('content.campaigns.brief', 'Brief')}</summary><p className="mt-2 whitespace-pre-wrap break-words">{c.brief}</p></details>}
      <div className="flex flex-wrap items-center gap-3"><Link className="text-sm text-a-accent-text underline" to={`/content/posts?campaign=${c.id}`}>{t('content.campaigns.posts', 'View posts')}</Link>{boot.staff.can_manage && <Button variant="secondary" size="sm" onClick={() => setOpen(c.id)}>{t('content.campaigns.edit', 'Edit campaign')}</Button>}</div>
    </article>)}</div>
  </div>
}
