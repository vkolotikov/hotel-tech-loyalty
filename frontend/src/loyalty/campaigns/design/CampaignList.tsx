import { CategoryName } from '../../push/parts'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '../../../workspace/ui/Button'
import { formatDate } from '../../../workspace/lib/wallClock'
import { useBoot } from '../../LoyaltyProvider'
import { failureOf } from '../../lib/api'
import { day, points } from '../../lib/format'
import { Pager } from '../../ui/Pager'
import { campaignsApi, campaignsKey, campaignKey, afterCampaignChange } from '../api'
import { campaignPath } from '../campaignsMath'
import { scheduledWhen } from '../scheduleMath'
import { LoadFailed, Loading, Refusal, StatusBadge } from '../parts'
import { pushApi, pushKey, pushListKey, afterPushChange } from '../../push/api'
import { smsApi, smsKey, smsListKey, afterSmsChange } from '../../sms/api'
import { pushSearch } from '../../push/pushMath'
import { smsSearch } from '../../sms/smsMath'
import { TwilioSetup } from '../../sms/parts'
import { CampaignFilters, CampaignGuidance } from './CampaignUI'
import { deniedRead } from './readState'
import { useCampaignWords } from './words'

type Channel = 'email' | 'push' | 'sms'
type Row = { category?: string | null; id: number; name: string; message: string; status: string; segment: string | null; recipient_count: number; sent: number; failed: number; when: string | null; scheduled_for: string | null }

/** All filters run on the existing server list, before pagination. No delivery or audience counts are guessed. */
export function CampaignList({ channel }: { channel: Channel }) {
  const w = useCampaignWords(), { t, i18n } = useTranslation(), boot = useBoot(), client = useQueryClient(), navigate = useNavigate()
  const locale = i18n.language || 'en'
  const [filters, setFilters] = useState({ q: '', status: '', page: 1 })
  const { q, status, page } = filters
  const filterKey = q || status ? JSON.stringify({ q, status }) : ''
  const key = channel === 'email' ? campaignsKey : channel === 'push' ? pushListKey : smsListKey
  const query = useQuery({ queryKey: key(page, filterKey), queryFn: async () => {
    const params = { ...(q.trim() ? { q: q.trim() } : {}), ...(status ? { status } : {}) }
    if (channel === 'email') return campaignsApi.campaigns(page, params)
    if (channel === 'push') return pushApi.messages(page, params)
    return smsApi.messages(page, params)
  } })
  const data = deniedRead(query.error) ? undefined : query.data
  const family = channel === 'email' ? 'campaigns' : channel
  const create = useMutation({ mutationFn: async () => {
    const name = t(`loyalty.${family}.list.new_name`, channel === 'email' ? 'New campaign, {{day}}' : channel === 'push' ? 'New push message, {{day}}' : 'New SMS, {{day}}', { day: formatDate(boot.venue.today, locale, { day: 'numeric', month: 'short', year: 'numeric' }) })
    if (channel === 'email') { const answer = await campaignsApi.createCampaign(name); client.setQueryData(campaignKey(answer.campaign.id), answer); afterCampaignChange(client, null); return campaignPath(answer.campaign.id) }
    if (channel === 'push') { const answer = await pushApi.create(name); client.setQueryData(pushKey(answer.push.id), answer); afterPushChange(client, null); return '/loyalty/campaigns' + pushSearch(answer.push.id) }
    const answer = await smsApi.create(name); client.setQueryData(smsKey(answer.sms.id), answer); afterSmsChange(client, null); return '/loyalty/campaigns' + smsSearch(answer.sms.id)
  }, onSuccess: to => navigate(to) })
  const rows: Row[] = !data ? [] : 'campaigns' in data ? data.campaigns.map(c => ({ ...c, message: c.subject, segment: c.segment?.name ?? null, sent: c.sent_count, failed: c.failed_count, when: c.sent_at ?? c.updated_at ?? c.created_at })) : data.messages.map(c => ({ ...c, message: 'title' in c ? c.title : c.excerpt, segment: c.segment?.name ?? null, sent: c.results.sent, failed: c.results.failed, when: c.sent_at ?? c.updated_at ?? c.created_at }))
  const link = (id: number) => channel === 'email' ? campaignPath(id) : '/loyalty/campaigns' + (channel === 'push' ? pushSearch(id) : smsSearch(id))
  const title = channel === 'email' ? w('emailTitle') : t(`loyalty.campaigns.tab.${channel}`, channel === 'push' ? 'Push' : 'SMS')
  const add = channel === 'email' ? w('createEmail') : t(`loyalty.${family}.list.new`, channel === 'push' ? 'New push message' : 'New SMS')
  return <div className="l-cm-list-columns"><section className="l-cm-panel l-cm-list-panel"><header className="l-cm-panel-head"><h2>{title}</h2>{data && <span className="l-cm-badge">{w('campaignCount', { number: points(data.total, locale) })}</span>}{channel !== 'email' ? <Button className="l-ov-button l-ov-primary" loading={create.isPending} disabled={deniedRead(query.error)} onClick={() => create.mutate()}>{add}</Button> : <details className="l-cm-menu"><summary className="l-ov-button" aria-label={w('more')}>•••</summary><div><Button className="l-ov-button" onClick={() => { void query.refetch() }}>{t('loyalty.common.retry', 'Try again')}</Button><Link className="l-ov-button" to="/loyalty/campaigns?tab=segments">{w('manage')}</Link></div></details>}</header>
    <CampaignFilters q={q} status={status} onChange={(nextQ, nextStatus) => setFilters({ q: nextQ, status: nextStatus, page: 1 })} />
    {create.isError && <Refusal family="create" failure={failureOf(create.error)} />}
    {query.isError && <LoadFailed error={query.error} onRetry={() => { void query.refetch() }} />}
    {!data && query.isPending && <Loading rows={4} />}
    {data && <><div className="l-cm-table-head" aria-hidden><span>{w('campaign')}</span><span>{w('audienceStatus')}</span><span>→</span></div><ul className="l-cm-rows">{rows.map(c => <li key={c.id} data-campaign={channel === 'email' ? c.id : undefined} data-push={channel === 'push' ? c.id : undefined} data-sms={channel === 'sms' ? c.id : undefined}><Link className="l-cm-row" to={link(c.id)} aria-label={w('open', { name: c.name })}><span><strong>{c.name}</strong><small hidden={c.message === c.name}>{c.message || t(`loyalty.${family}.list.${channel === 'email' ? 'no_subject' : channel === 'push' ? 'no_title' : 'no_text'}`, channel === 'email' ? 'No subject yet' : channel === 'push' ? 'No title yet' : 'No text yet')}</small><small>{c.status === 'scheduled' ? scheduledWhen(c.scheduled_for, locale) : c.when ? day(c.when, locale, boot.venue.timezone) : ''}</small></span><span>{channel === 'push' && <small>{c.category ? <CategoryName category={c.category} /> : t('loyalty.push.list.no_category', 'No kind chosen yet')}</small>}<strong className="l-cm-cyan">{c.segment ?? t(`loyalty.${family}.list.no_segment`, 'No segment')}</strong><span className="l-cm-row-status"><StatusBadge status={c.status} />{!['draft','scheduled'].includes(c.status) && <small>{t(channel === 'push' ? 'loyalty.push.list.counts' : 'loyalty.campaigns.list.counts', channel === 'push' ? '{{sent}} of {{total}} pushed · {{failed}} failed' : '{{sent}} of {{total}} sent · {{failed}} failed', { sent: points(c.sent, locale), total: points(c.recipient_count, locale), failed: points(c.failed, locale) })}</small>}</span></span><span className="l-ov-button l-cm-arrow" aria-hidden>→</span></Link></li>)}</ul>{rows.length === 0 && <div className="l-cm-empty"><h3>{q || status ? w('noMatches') : t(`loyalty.${family}.get_started.${channel === 'email' ? 'campaigns.' : ''}title`, channel === 'email' ? 'Send your first email campaign' : channel === 'push' ? 'Send your first push message' : 'Send your first SMS')}</h3><p>{w('chooseHint')}</p>{(q || status) && <Button className="l-ov-button" onClick={() => setFilters({ q: '', status: '', page: 1 })}>{w('reset')}</Button>}</div>}<footer className="l-cm-list-footer"><small>{w('showing', { shown: points(rows.length, locale), total: points(data.total, locale) })}</small><Pager page={data.page} pages={data.pages} onPage={next => setFilters(old => ({ ...old, page: next }))} /></footer></>}
  </section>{channel === 'email' ? <CampaignGuidance sender={data && 'sender_name' in data ? data.sender_name : undefined} /> : <aside className="l-cm-guidance">{channel === 'sms' && data && 'twilio' in data && !data.twilio.ready && <section className="l-cm-panel"><TwilioSetup twilio={data.twilio} /></section>}<section className="l-cm-panel"><h2>{w('quickTitle')}</h2><p>{w('writeHint')}</p><p>{w('chooseHint')}</p><p>{w(channel === 'sms' ? 'cost' : 'pushLimit')}</p><Link className="l-ov-button" to="/loyalty/guide">{w('guide')}</Link></section></aside>}</div>
}
