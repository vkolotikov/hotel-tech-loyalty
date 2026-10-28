import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useBoot } from '../../LoyaltyProvider'
import { OverviewButton } from '../../overview/OverviewUI'
import { points } from '../../lib/format'
import { campaignsApi, campaignsKey, SEGMENTS_KEY } from '../api'
import { CAMPAIGN_TABS, searchFor, type CampaignTab } from '../campaignsMath'
import { TAB_WORDS, STATUS_WORDS } from '../words'
import { pushApi, pushListKey } from '../../push/api'
import { smsApi, smsListKey } from '../../sms/api'
import { useCampaignWords } from './words'
import './campaigns.css'

/** A fresh cache per organisation/staff/permission boundary; all existing writers share it. */
export function CampaignCache({ children }: { children: ReactNode }) {
  const boot = useBoot()
  return <Cache key={`${boot.organization.id}:${boot.staff.id}:${boot.staff.can.manage_campaigns}:${boot.features.campaigns}:${boot.features.push}`}>{children}</Cache>
}
function Cache({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, retry: false } } }))
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

export function CampaignHeading({ title, line, children }: { title: string; line?: string; children?: ReactNode }) {
  return <header className="l-cm-heading"><div><h1>{title}</h1>{line && <p>{line}</p>}</div><div className="l-cm-actions">{children}</div></header>
}

export function CampaignSteps({ step, onStep, busy = false }: { step: 'message' | 'audience'; onStep: (step: 'message' | 'audience') => void; busy?: boolean }) {
  const w = useCampaignWords()
  return <nav className="l-cm-steps" aria-label={w('quickTitle')}><OverviewButton disabled={busy} aria-current={step === 'message' ? 'step' : undefined} onClick={() => onStep('message')}>1 {w('message')}</OverviewButton><OverviewButton disabled={busy} aria-current={step === 'audience' ? 'step' : undefined} onClick={() => onStep('audience')}>2 {w('audienceSend')}</OverviewButton><small>{w('draftOnly')}</small></nav>
}

export function CampaignChannels({ tab }: { tab: CampaignTab }) {
  const w = useCampaignWords(), { t, i18n } = useTranslation(), boot = useBoot()
  const email = useQuery({ queryKey: campaignsKey(1), queryFn: () => campaignsApi.campaigns(1), enabled: boot.features.campaigns })
  const segments = useQuery({ queryKey: SEGMENTS_KEY, queryFn: campaignsApi.segments })
  const push = useQuery({ queryKey: pushListKey(1), queryFn: () => pushApi.messages(1), enabled: boot.features.push })
  const sms = useQuery({ queryKey: smsListKey(1), queryFn: () => smsApi.messages(1), enabled: boot.features.campaigns })
  const n = (value: number) => points(value, i18n.language)
  const loading = t('loyalty.common.loading', 'Loading…')
  const cards = {
    campaigns: { state: !boot.features.campaigns ? w('locked') : email.isError ? w('unavailable') : email.data ? w('included') : loading, hint: email.data && !email.isError ? w('campaignCount', { number: n(email.data.all_total ?? email.data.total) }) : w('channelNote') },
    segments: { state: segments.isError ? w('unavailable') : segments.data ? w('saved', { number: n(segments.data.segments.length) }) : loading, hint: w('groups') },
    push: { state: !boot.features.push ? w('locked') : push.isError ? w('unavailable') : push.data ? w('included') : loading, hint: push.data && !push.isError ? w('campaignCount', { number: n(push.data.all_total ?? push.data.total) }) : w('channelNote') },
    sms: { state: !boot.features.campaigns ? w('locked') : sms.isError ? w('unavailable') : sms.data ? w(sms.data.twilio.ready ? 'available' : 'setup') : loading, hint: sms.data?.twilio.ready && !sms.isError ? w('campaignCount', { number: n(sms.data.all_total ?? sms.data.total) }) : w('connect') },
  }
  return <nav className="l-cm-channels" aria-label={t('loyalty.campaigns.tabs', 'Campaigns areas')}>{CAMPAIGN_TABS.map(key => <Link key={key} to={{ pathname: '/loyalty/campaigns', search: searchFor(key) }} className="l-cm-channel" data-channel={key} aria-current={tab === key ? 'page' : undefined}><span>{key === 'campaigns' ? w('email') : key === 'push' ? w('push') : t(`loyalty.campaigns.tab.${key}`, TAB_WORDS[key])}</span><strong>{cards[key].state}</strong><small>{cards[key].hint}</small></Link>)}</nav>
}

export function CampaignFilters({ q, status, onChange }: { q: string; status: string; onChange: (q: string, status: string) => void }) {
  const w = useCampaignWords(), { t } = useTranslation(), id = useId()
  return <div className="l-cm-filters"><label><span>{w('search')}</span><input type="search" maxLength={200} value={q} placeholder={w('searchHint')} onChange={e => onChange(e.target.value, status)} /></label><label><span id={id}>{w('status')}</span><select aria-labelledby={id} value={status} onChange={e => onChange(q, e.target.value)}><option value="">{w('allStatuses')}</option>{Object.entries(STATUS_WORDS).map(([value, label]) => <option key={value} value={value}>{t(`loyalty.campaigns.status.${value}`, label)}</option>)}</select></label></div>
}

export function CampaignGuidance({ sender }: { sender?: string }) {
  const w = useCampaignWords(), boot = useBoot()
  return <aside className="l-cm-guidance"><section className="l-cm-panel l-cm-accent"><h2>{w('emailSetup')}</h2><dl className="l-cm-facts"><dt>{w('sender')}</dt><dd>{sender || boot.organization.name}</dd><dt>{w('sendingPlan')}</dt><dd>{w(boot.features.campaigns ? 'included' : 'locked')}</dd><dt>{w('checks')}</dt><dd>{w('beforeSending')}</dd></dl><p>{w('eligibleOnly')}</p><Link className="l-ov-button" to="/settings?tab=integrations">{w('senderSettings')}</Link></section><section className="l-cm-panel"><h2>{w('quickTitle')}</h2><strong className="l-cm-cyan">{w('writeStep')}</strong><p>{w('writeHint')}</p><hr /><strong className="l-cm-cyan">{w('chooseStep')}</strong><p>{w('chooseHint')}</p><Link className="l-ov-button" to="/loyalty/guide">{w('guide')}</Link></section></aside>
}
