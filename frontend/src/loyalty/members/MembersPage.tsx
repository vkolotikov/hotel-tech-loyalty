import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowDownUp, Coins, Download, ListFilter, Loader2, MoreHorizontal, ScanLine, Search, Upload, UserPlus, Users } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { PageHeader } from '../../workspace/ui/PageHeader'
import { SideMenu } from '../../workspace/shell/SideMenu'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { useApi, useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { errorKey, refusalKey } from '../lib/errors'
import { day, points } from '../lib/format'
import { memberPath } from '../lib/links'
import { useLook } from '../lib/look'
import type { Figures, MemberRow, MemberSort, TierRef } from '../lib/types'
import { FigureTile, FigureTiles } from '../ui/FigureTiles'
import { Pager } from '../ui/Pager'
import { TierChip } from '../ui/TierChip'
import { ToneBadge } from '../ui/formParts'
import { formatDate } from '../../workspace/lib/wallClock'
import { stateTone } from '../membership/validityMath'
import { AddMemberDialog } from '../membership/AddMemberDialog'
import { membershipApi } from '../membership/api'
import { ERRORS as MEMBERSHIP_ERRORS } from '../membership/errors'
import { exportFileName, listActions } from '../membership/membershipMath'
import { SetupBanner } from '../options/SetupBanner'
import { ICON_BUTTON } from '../member/CardHead'
import { asMemberFilters, filtersFrom, initials, searchFor, toggleTier, withChange, type ListFilters, type ListState } from './membersQuery'

const INPUT = 'rounded-lg border border-a-border bg-a-surface px-2.5 py-2.5 text-sm text-a-text sm:py-1.5'
/** An item of the manager's tools menu (⋯). */
const TOOL = 'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-a-text hover:bg-a-surface-2 focus:bg-a-surface-2 focus:outline-none'

/**
 * Members, the workspace's home (spec 2026-10-21 §4.2): the figures (release 10: as tiles), the tiers as chips, a search, the state and
 * the order; 50 a page. Everything chosen lives in the address, so a list can be shared and survives a reload. A row
 * opens the member's page. Release 2 (§4.1): Add member for everyone; for a manager Import, Export (the list as it is
 * filtered now) and Duplicates — release 9 puts these three under the ⋯ menu at the header's end. Release 8 (spec 2026-10-25 §3): Show also offers the members whose membership is
 * expiring soon or has expired, the numbers line counts them (each count opens that list), and a row says when a
 * membership ends soon or has ended.
 */
export function MembersPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const api = useApi()
  const look = useLook()
  const location = useLocation()
  const navigate = useNavigate()
  const tiers = boot.programme.tiers
  const filters = useMemo(() => filtersFrom(location.search, tiers.map(tier => tier.id)), [location.search, tiers])
  const apply = (next: ListFilters) => navigate({ pathname: '/loyalty', search: searchFor(next) }, { replace: true })

  // The search box shows each letter at once; the list is asked once typing pauses. Back or a link brings the address's words.
  const [typed, setTyped] = useState(filters.q)
  const [seen, setSeen] = useState(filters.q)
  if (filters.q !== seen) {
    setSeen(filters.q)
    setTyped(filters.q)
  }
  useEffect(() => {
    if (typed === filters.q) return
    const timer = window.setTimeout(() => navigate({ pathname: '/loyalty', search: searchFor(withChange(filters, { q: typed })) }, { replace: true }), 300)
    return () => window.clearTimeout(timer)
  }, [typed, filters, navigate])

  const query = useQuery({ queryKey: ['loyalty', 'members', filters], queryFn: () => api.members(asMemberFilters(filters)), placeholderData: keepPreviousData })
  const page = query.data
  const tierOf = (id: number | null): TierRef | null => tiers.find(tier => tier.id === id) ?? null
  // Release 8 adds `expiring` and `expired` to the figures (MemberDirectory::figures); a server before it sends neither.
  const figures = page?.figures as (Figures & { expiring?: number; expired?: number }) | undefined
  const timeZone = boot.venue.timezone
  const actions = listActions(boot.staff.can)
  const [adding, setAdding] = useState(false)

  // The file comes through the same client as every call; the browser saves it under the venue's day.
  const download = useMutation({
    mutationFn: () => membershipApi.exportMembers(asMemberFilters(filters)),
    onSuccess: (blob) => {
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = exportFileName(boot.venue.today)
      link.click()
      URL.revokeObjectURL(link.href)
    },
  })

  return (
    <div className="space-y-5 px-4 py-6 lg:px-6">
      <PageHeader stacked title={t('loyalty.members.title', 'Members')} line={t('loyalty.members.line', 'Find a member, see where they stand, and welcome new ones.')}>
        {actions.add && (
          <Button variant="secondary" onClick={() => setAdding(true)}><UserPlus size={15} aria-hidden />{t('loyalty.membership.list.add', 'Add member')}</Button>
        )}
        <Link to="/loyalty/scan" className="inline-flex items-center gap-2 rounded-full bg-a-accent px-4 py-2.5 text-sm font-semibold text-a-accent-ink shadow-a-sm hover:bg-a-accent-deep">
          <ScanLine size={15} aria-hidden />{t('loyalty.members.scan', 'Scan a card')}
        </Link>
        {actions.tools && (
          <SideMenu kind="menu" place="down-right" named label={t('loyalty.membership.more.label', 'More')} buttonClassName={ICON_BUTTON} listClassName="w-56"
            face={<span title={t('loyalty.membership.more.label', 'More')} className="inline-flex">{download.isPending ? <Loader2 size={18} aria-hidden className="animate-spin" /> : <MoreHorizontal size={18} aria-hidden />}</span>}>
            <ListTools exporting={download.isPending} onExport={() => download.mutate()} />
          </SideMenu>
        )}
      </PageHeader>

      {/* Release 10 (the owner's Figma 131:3945): the figures as tiles; the memberships ending or ended open their list. */}
      {figures && (
        <div data-figures="" className="space-y-2">
          <FigureTiles label={t('loyalty.members.tiles', 'Members in figures')}>
            <FigureTile name="active" icon={Users} hue="tier" label={t('loyalty.members.tile.active', 'Active members')} value={points(figures.active, locale)}
              note={t('loyalty.members.tile.active_note', 'of {{total}}', { total: points(figures.total, locale) })} />
            <FigureTile name="joined" icon={UserPlus} hue="bonus" label={t('loyalty.members.tile.joined', 'Joined this month')} value={points(figures.new_this_month, locale)} />
            <FigureTile name="average" icon={Coins} hue="earn" label={t('loyalty.members.tile.average', 'Average points')} value={points(figures.average_points, locale)}
              note={t('loyalty.members.tile.average_note', 'per member')} />
          </FigureTiles>
          {(['expiring', 'expired'] as const).some(state => (figures[state] ?? 0) > 0) && (
            <p className="flex flex-wrap gap-2 text-sm">
              {(['expiring', 'expired'] as const).filter(state => (figures[state] ?? 0) > 0).map(state => (
                <button key={state} type="button" data-figure={state} onClick={() => apply(withChange(filters, { state }))}
                  className={`rounded-full border border-a-border bg-a-surface px-3 py-1 font-medium hover:bg-a-surface-2 ${state === 'expired' ? 'text-a-danger' : 'text-a-text'}`}>
                  {state === 'expiring'
                    ? t('loyalty.membership.list.expiring_count', '{{n}} expiring soon', { n: points(figures.expiring ?? 0, locale) })
                    : t('loyalty.membership.list.expired_count', '{{n}} expired', { n: points(figures.expired ?? 0, locale) })}
                </button>
              ))}
            </p>
          )}
        </div>
      )}

      {/* Release 7: a manager is offered the programme's setup wizard until it is applied or skipped. */}
      <SetupBanner />

      {download.isError && (
        <div className="max-w-xl"><Notice tone="danger">{t(...refusalKey('loyalty.membership', MEMBERSHIP_ERRORS, 'export', failureOf(download.error)))}</Notice></div>
      )}
      {adding && <AddMemberDialog onClose={() => setAdding(false)} />}

      {tiers.length > 0 && (
        <div role="group" aria-label={t('loyalty.members.tiers', 'Tiers')} className="flex flex-wrap gap-2">
          {tiers.filter(tier => tier.is_active || tier.id === filters.tier_id).map(tier => {
            const on = filters.tier_id === tier.id
            return (
              <button key={tier.id} type="button" aria-pressed={on} onClick={() => apply(toggleTier(filters, tier.id))}
                className={`inline-flex items-center gap-2 rounded-full border px-2 py-1 text-sm ${on ? 'border-a-accent-text bg-a-accent/10 text-a-text' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'}`}>
                <TierChip tier={tier} theme={look.resolved} size="sm" />
                <span className="tabular-nums">{points(figures?.tiers[String(tier.id)] ?? 0, locale)}</span>
              </button>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative w-full sm:w-auto sm:min-w-[12rem] sm:max-w-sm sm:flex-1">
          <span className="sr-only">{t('loyalty.members.search', 'Search members')}</span>
          <Search size={15} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-a-text-2" />
          <input type="search" value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={100}
            placeholder={t('loyalty.members.search_hint', 'Name, email, phone or member number')} className={`${INPUT} w-full pl-8`} />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-a-text-2" title={t('loyalty.members.state', 'Show')}>
          <ListFilter size={16} aria-hidden className="shrink-0" /><span className="sr-only">{t('loyalty.members.state', 'Show')}</span>
          <select value={filters.state} onChange={(e) => apply(withChange(filters, { state: e.target.value as ListState }))} className={INPUT}>
            <option value="active">{t('loyalty.members.state_active', 'Active')}</option>
            <option value="inactive">{t('loyalty.members.state_inactive', 'Switched off')}</option>
            <option value="all">{t('loyalty.members.state_all', 'All')}</option>
            <option value="expiring">{t('loyalty.membership.list.state.expiring', 'Expiring soon')}</option>
            <option value="expired">{t('loyalty.membership.list.state.expired', 'Expired')}</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-sm text-a-text-2" title={t('loyalty.members.sort', 'Order')}>
          <ArrowDownUp size={16} aria-hidden className="shrink-0" /><span className="sr-only">{t('loyalty.members.sort', 'Order')}</span>
          <select value={filters.sort} onChange={(e) => apply(withChange(filters, { sort: e.target.value as MemberSort }))} className={INPUT}>
            <option value="recent">{t('loyalty.members.sort_recent', 'Newest first')}</option>
            <option value="points">{t('loyalty.members.sort_points', 'Most points')}</option>
            <option value="name">{t('loyalty.members.sort_name', 'Name')}</option>
            <option value="activity">{t('loyalty.members.sort_activity', 'Last seen')}</option>
          </select>
        </label>
      </div>

      {query.isError && (
        <div className="max-w-xl space-y-3">
          <Notice tone="danger">{t(...errorKey('load', failureOf(query.error)))}</Notice>
          <Button variant="secondary" onClick={() => { void query.refetch() }}>{t('loyalty.common.retry', 'Try again')}</Button>
        </div>
      )}

      {!page && query.isLoading && (
        <div role="status" className="space-y-2">
          <span className="sr-only">{t('loyalty.common.loading', 'Loading…')}</span>
          {[0, 1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12" />)}
        </div>
      )}

      {page && page.members.length === 0 && (
        <p className="rounded-xl border border-dashed border-a-border px-4 py-8 text-center text-sm text-a-text-2">
          {filters.q.trim() !== '' || filters.tier_id !== null || filters.state !== 'active'
            ? t('loyalty.members.none_match', 'No member matches.')
            : t('loyalty.members.none', 'No members yet. They join from the member app, the portal or the booking widget.')}
        </p>
      )}

      {page && page.members.length > 0 && (
        <>
          <p className="sr-only" role="status">{t('loyalty.members.count', 'Members: {{count}}', { count: page.total })}</p>
          <div className={`overflow-hidden rounded-2xl border border-a-border bg-a-surface ${query.isFetching ? 'opacity-70' : ''}`}>
            <table className="hidden w-full text-left text-sm md:table">
              <thead className="border-b border-a-border text-xs text-a-text-2">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t('loyalty.members.col_name', 'Member')}</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">{t('loyalty.members.col_tier', 'Tier')}</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">{t('loyalty.members.col_points', 'Points')}</th>
                  <th scope="col" className="hidden px-4 py-2.5 font-medium lg:table-cell">{t('loyalty.members.col_last', 'Last seen')}</th>
                  <th scope="col" className="hidden px-4 py-2.5 font-medium xl:table-cell">{t('loyalty.members.col_joined', 'Joined')}</th>
                </tr>
              </thead>
              <tbody>
                {page.members.map(m => (
                  <tr key={m.id} className="border-b border-a-border last:border-0 hover:bg-a-surface-2">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-3">
                        <Avatar name={m.name || m.email || ''} />
                        <span className="min-w-0">
                          <Link to={memberPath(m.id)} className="block font-medium text-a-text hover:underline">{m.name || m.email || `#${m.id}`}</Link>
                          <span className="block text-xs text-a-text-2">{[m.member_number, m.email].filter(Boolean).join(' · ')}</span>
                          <EndsBadge member={m} locale={locale} />
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5"><TierChip tier={tierOf(m.tier_id)} theme={look.resolved} size="sm" /></td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-a-text">{points(m.points, locale)}</td>
                    <td className="hidden px-4 py-2.5 text-a-text-2 lg:table-cell">{m.last_activity_at ? day(m.last_activity_at, locale, timeZone) : t('loyalty.members.never', 'Not yet')}</td>
                    <td className="hidden px-4 py-2.5 text-a-text-2 xl:table-cell">{day(m.joined_at, locale, timeZone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-a-border md:hidden">
              {page.members.map(m => <MemberCard key={m.id} member={m} tier={tierOf(m.tier_id)} theme={look.resolved} locale={locale} />)}
            </ul>
          </div>
          <Pager page={page.page} pages={page.pages} onPage={(n) => apply({ ...filters, page: n })} />
        </>
      )}
    </div>
  )
}

/** A member as a card, below 768 px. */
function MemberCard({ member: m, tier, theme, locale }: { member: MemberRow; tier: TierRef | null; theme: 'light' | 'dark'; locale: string }) {
  const { t } = useTranslation()
  return (
    <li>
      <Link to={memberPath(m.id)} className="flex items-center gap-3 px-4 py-3 hover:bg-a-surface-2">
        <Avatar name={m.name || m.email || ''} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-a-text">{m.name || m.email || `#${m.id}`}</span>
          <span className="block truncate text-xs text-a-text-2">{m.member_number}</span>
          <EndsBadge member={m} locale={locale} />
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-sm font-semibold tabular-nums text-a-text">{t('loyalty.common.points_count', '{{points}} pts', { points: points(m.points, locale) })}</span>
          <TierChip tier={tier} theme={theme} size="sm" />
        </span>
      </Link>
    </li>
  )
}

/** A member's initials in a small circle beside the name (decoration: the name says who it is). */
function Avatar({ name }: { name: string }) {
  return (
    <span aria-hidden className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-a-accent/10 text-xs font-semibold text-a-accent-text">
      {initials(name)}
    </span>
  )
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

/**
 * A row's membership when it needs looking at (release 8): "Ends 20 Oct" (amber) within 30 days, "Expired 1 Sep" (red)
 * after; nothing for a membership without an end, one far off, or a switched-off member (the list's own state says it).
 */
function EndsBadge({ member: m, locale }: { member: MemberRow; locale: string }) {
  const { t } = useTranslation()
  if (!m.valid_until || (m.membership_state !== 'expiring' && m.membership_state !== 'expired')) return null
  const day = formatDate(m.valid_until, locale, { day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <span className="mt-1 block">
      <ToneBadge tone={stateTone(m.membership_state)}>
        {m.membership_state === 'expiring'
          ? t('loyalty.membership.list.ends', 'Ends {{day}}', { day })
          : t('loyalty.membership.list.ended', 'Expired {{day}}', { day })}
      </ToneBadge>
    </span>
  )
}
