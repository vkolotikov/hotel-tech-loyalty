import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Download, Loader2, MoreHorizontal, Upload, Users } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { SideMenu } from '../../workspace/shell/SideMenu'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { useApi, useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { errorKey, refusalKey } from '../lib/errors'
import { formatDate } from '../../workspace/lib/wallClock'
import { day, points } from '../lib/format'
import { memberPath } from '../lib/links'
import { useLook } from '../lib/look'
import type { MemberRow, MemberSort } from '../lib/types'
import { TierChip } from '../ui/TierChip'
import { AddMemberDialog } from '../membership/AddMemberDialog'
import { membershipApi } from '../membership/api'
import { ERRORS as MEMBERSHIP_ERRORS } from '../membership/errors'
import { exportFileName, listActions } from '../membership/membershipMath'
import { StartCard } from '../start/StartPage'
import { OverviewButton } from '../overview/OverviewUI'
import { useRedesignWords } from '../redesign/words'
import { asMemberFilters, filtersFrom, initials, searchFor, withChange, type ListFilters, type ListState } from './membersQuery'

const TOOL = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-a-text hover:bg-a-surface-2 focus:bg-a-surface-2 focus:outline-none'

/** MB-01: the existing tenant directory, tools and URL filters in the approved composition. */
export function MembersPage() {
  const { t, i18n } = useTranslation()
  const say = useRedesignWords()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const api = useApi()
  const look = useLook()
  const location = useLocation()
  const navigate = useNavigate()
  const tiers = boot.programme.tiers
  const filters = useMemo(() => filtersFrom(location.search, tiers.map(tier => tier.id)), [location.search, tiers])
  const apply = (next: ListFilters) => navigate({ pathname: '/loyalty', search: searchFor(next) }, { replace: true })
  const [typed, setTyped] = useState(filters.q)
  const [seen, setSeen] = useState(filters.q)
  if (filters.q !== seen) { setSeen(filters.q); setTyped(filters.q) }
  useEffect(() => {
    if (typed === filters.q) return
    const timer = window.setTimeout(() => navigate({ pathname: '/loyalty', search: searchFor(withChange(filters, { q: typed })) }, { replace: true }), 300)
    return () => window.clearTimeout(timer)
  }, [typed, filters, navigate])
  const query = useQuery({ queryKey: ['loyalty', 'members', filters], queryFn: () => api.members({ ...asMemberFilters(filters), per_page: filters.per_page ?? 10 }), placeholderData: keepPreviousData })
  const page = query.data
  const figures = page?.figures
  const timeZone = boot.venue.timezone
  const actions = listActions(boot.staff.can)
  const [adding, setAdding] = useState(false)
  const download = useMutation({
    mutationFn: () => membershipApi.exportMembers(asMemberFilters(filters)),
    onSuccess: blob => {
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = exportFileName(boot.venue.today)
      link.click()
      URL.revokeObjectURL(link.href)
    },
  })
  const pageSize = page?.per_page ?? filters.per_page ?? 10
  const status = (m: MemberRow) => !m.is_active ? 'off' : m.membership_state ?? 'active'
  const ends = (m: MemberRow) => {
    if (!m.valid_until || !m.is_active || !['expiring', 'expired'].includes(m.membership_state ?? '')) return null
    const date = formatDate(m.valid_until, locale, { day: 'numeric', month: 'short', year: 'numeric' })
    return <small className="block">{m.membership_state === 'expiring' ? t('loyalty.membership.list.ends', 'Ends {{day}}', { day: date }) : t('loyalty.membership.list.ended', 'Expired {{day}}', { day: date })}</small>
  }
  const identity = (m: MemberRow) => <Link to={memberPath(m.id)} className="l-rd-member-identity"><span className="l-rd-avatar" aria-hidden>{initials(m.name || m.email || '')}</span><span><strong>{m.name || m.email || `#${m.id}`}</strong><small>{m.email || m.member_number}</small></span></Link>
  return <div className="l-ov-page l-rd-page">
    <header className="l-ov-page-heading"><div><h1>{t('loyalty.members.title', 'Members')}</h1><p>{say('membersLine')}</p></div><div className="l-rd-actions">
      {actions.add && <OverviewButton primary onClick={() => setAdding(true)}>+ {t('loyalty.membership.list.add', 'Add member')}</OverviewButton>}
      {actions.tools && <SideMenu kind="menu" place="down-right" named label={t('loyalty.membership.more.label', 'More')} buttonClassName="l-ov-button l-rd-icon-button" listClassName="w-56"
        face={download.isPending ? <Loader2 size={18} aria-hidden className="animate-spin" /> : <MoreHorizontal size={18} aria-hidden />}><ListTools exporting={download.isPending} onExport={() => download.mutate()} /></SideMenu>}
    </div></header>
    {figures && <div data-figures="" className="l-rd-figures" aria-label={t('loyalty.members.tiles', 'Members in figures')}>
      <strong>{say('membersTotal', { n: points(figures.total, locale) })}</strong><span>{say('activeCount', { n: points(figures.active, locale) })}</span>
      <span>{say('joinedCount', { n: points(figures.new_this_month, locale) })}</span><span title={t('loyalty.members.tile.average_note', 'per member')}>{say('average', { n: points(figures.average_points, locale) })}</span>
    </div>}
    <StartCard />
    {download.isError && <Notice tone="danger">{t(...refusalKey('loyalty.membership', MEMBERSHIP_ERRORS, 'export', failureOf(download.error)))}</Notice>}
    {adding && <AddMemberDialog onClose={() => setAdding(false)} />}
    <div className="l-rd-filters">
      <label><span>{t('loyalty.members.search', 'Search members')}</span><input type="search" value={typed} onChange={e => setTyped(e.target.value)} maxLength={100} placeholder={t('loyalty.members.search_hint', 'Name, email, phone or member number')} /></label>
      <label><span>{say('level')}</span><select value={filters.tier_id ?? ''} onChange={e => apply(withChange(filters, { tier_id: e.target.value ? Number(e.target.value) : null }))}>
        <option value="">{say('allLevels')}</option>{tiers.filter(tier => tier.is_active || tier.id === filters.tier_id).map(tier => <option key={tier.id} value={tier.id}>{tier.name}{figures?.tiers[String(tier.id)] !== undefined ? ` · ${points(figures.tiers[String(tier.id)], locale)}` : ''}</option>)}
      </select></label>
      <label title={t('loyalty.members.state', 'Show')}><span>{say('membership')}</span><select value={filters.state} onChange={e => apply(withChange(filters, { state: e.target.value as ListState }))}>
        <option value="all">{say('allStates')}</option><option value="active">{t('loyalty.members.state_active', 'Active')}</option><option value="inactive">{t('loyalty.members.state_inactive', 'Switched off')}</option>
        <option value="expiring">{t('loyalty.membership.list.state.expiring', 'Expiring soon')}{figures?.expiring !== undefined ? ` · ${points(figures.expiring, locale)}` : ''}</option>
        <option value="expired">{t('loyalty.membership.list.state.expired', 'Expired')}{figures?.expired !== undefined ? ` · ${points(figures.expired, locale)}` : ''}</option>
      </select></label>
      <label title={t('loyalty.members.sort', 'Order')}><span>{say('sort')}</span><select value={filters.sort} onChange={e => apply(withChange(filters, { sort: e.target.value as MemberSort }))}>
        <option value="recent">{t('loyalty.members.sort_recent', 'Newest first')}</option><option value="points">{t('loyalty.members.sort_points', 'Most points')}</option><option value="name">{t('loyalty.members.sort_name', 'Name')}</option><option value="activity">{t('loyalty.members.sort_activity', 'Last seen')}</option>
      </select></label>
    </div>
    {query.isError && <div className="space-y-3"><Notice tone="danger">{t(...errorKey('load', failureOf(query.error)))}</Notice><Button variant="secondary" onClick={() => { void query.refetch() }}>{t('loyalty.common.retry', 'Try again')}</Button></div>}
    {!page && query.isLoading && <div role="status" className="space-y-2"><span className="sr-only">{t('loyalty.common.loading', 'Loading…')}</span>{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12" />)}</div>}
    {page && page.members.length === 0 && <p className="l-ov-panel">{filters.q.trim() || filters.tier_id !== null || filters.state !== 'active' ? t('loyalty.members.none_match', 'No member matches.') : t('loyalty.members.none', 'No members yet. They join from the member app, the portal or the booking widget.')}</p>}
    {page && page.members.length > 0 && <section className="l-rd-directory" aria-busy={query.isFetching}>
      <p className="sr-only" role="status">{t('loyalty.members.count', 'Members: {{count}}', { count: page.total })}</p>
      <table className="l-rd-members-table"><thead><tr><th scope="col">{t('loyalty.members.col_name', 'Member')}</th><th scope="col">{say('level')}</th><th scope="col">{say('pointsBalance')}</th><th scope="col">{say('membership')}</th><th scope="col">{t('loyalty.members.col_last', 'Last seen')}</th><th scope="col">{t('loyalty.members.col_joined', 'Joined')}</th><th scope="col"><span className="sr-only">{t('loyalty.program.edit', 'Edit')}</span></th></tr></thead>
        <tbody>{page.members.map(m => <tr key={m.id}><td>{identity(m)}</td><td><TierChip tier={tiers.find(tier => tier.id === m.tier_id) ?? null} theme={look.resolved} size="sm" /></td><td>{points(m.points, locale)}</td><td><span className={`l-rd-status l-rd-status-${status(m)}`} title={m.valid_until ?? undefined}>{say(status(m))}{ends(m)}</span></td><td>{m.last_activity_at ? day(m.last_activity_at, locale, timeZone) : t('loyalty.member.not_seen', 'Not seen yet')}</td><td>{day(m.joined_at, locale, timeZone)}</td><td><Link className="l-ov-link" to={memberPath(m.id)} aria-label={say('openMember', { name: m.name })}>→</Link></td></tr>)}</tbody>
      </table>
      <ul className="l-rd-member-cards">{page.members.map(m => <li key={m.id}>{identity(m)}<div><TierChip tier={tiers.find(tier => tier.id === m.tier_id) ?? null} theme={look.resolved} size="sm" /><strong>{t('loyalty.common.points_count', '{{points}} pts', { points: points(m.points, locale) })}</strong><span className={`l-rd-status l-rd-status-${status(m)}`}>{say(status(m))}</span></div><small>{t('loyalty.member.joined', 'Joined {{day}}', { day: day(m.joined_at, locale, timeZone) })} · {m.last_activity_at ? t('loyalty.member.last_seen', 'Last seen {{day}}', { day: day(m.last_activity_at, locale, timeZone) }) : t('loyalty.member.not_seen', 'Not seen yet')}</small></li>)}</ul>
      <div className="l-rd-pagination"><small>{say('showing', { from: points((page.page - 1) * pageSize + 1, locale), to: points((page.page - 1) * pageSize + page.members.length, locale), total: points(page.total, locale) })}</small>
        <select aria-label={say('pageSize')} value={filters.per_page ?? 10} disabled={query.isFetching} onChange={e => apply(withChange(filters, { per_page: Number(e.target.value) as 10 | 25 | 50 }))}>{[10, 25, 50].map(n => <option key={n} value={n}>{say('perPage', { n })}</option>)}</select>
        <OverviewButton className="l-rd-icon-button" disabled={page.page <= 1 || query.isFetching} aria-label={t('loyalty.common.previous', 'Previous')} onClick={() => apply({ ...filters, page: page.page - 1 })}>‹</OverviewButton>
        <small>{t('loyalty.common.page_of', 'Page {{page}} of {{pages}}', { page: page.page, pages: page.pages })}</small>
        <OverviewButton className="l-rd-icon-button" disabled={page.page >= page.pages || query.isFetching} aria-label={t('loyalty.common.next', 'Next')} onClick={() => apply({ ...filters, page: page.page + 1 })}>›</OverviewButton>
      </div>
    </section>}
    <small>{say('listHint')}</small>
  </div>
}

/**
 * A manager's tools under the header's ⋯: Duplicates and Import (their pages), and Export (the list as it is filtered
 * now, saved as a file).
 */
export function ListTools({ exporting, onExport }: { exporting: boolean; onExport: () => void }) {
  const { t } = useTranslation()
  return (
    <>
      <Link to="/loyalty/members/duplicates" role="menuitem" className={TOOL}><Users size={15} aria-hidden className="shrink-0 text-a-text-2" />{t('loyalty.membership.list.duplicates', 'Duplicates')}</Link>
      <Link to="/loyalty/members/import" role="menuitem" className={TOOL}><Upload size={15} aria-hidden className="shrink-0 text-a-text-2" />{t('loyalty.membership.list.import', 'Import')}</Link>
      <button type="button" role="menuitem" disabled={exporting} onClick={onExport} className={`${TOOL} disabled:opacity-60`}>
        <Download size={15} aria-hidden className="shrink-0 text-a-text-2" />{t('loyalty.membership.list.export', 'Export')}
      </button>
    </>
  )
}
