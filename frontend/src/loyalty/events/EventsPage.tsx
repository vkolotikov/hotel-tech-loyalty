import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarPlus } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { PageHeader } from '../../workspace/ui/PageHeader'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { points } from '../lib/format'
import { useLook } from '../lib/look'
import { Pager } from '../ui/Pager'
import { EventCard } from './EventCard'
import { EventDialog } from './EventDialog'
import { ERRORS } from './errors'
import { EVENTS_KEY, eventsApi } from './eventsApi'
import { EVENT_TABS, searchFor, tabAfter, tabFrom } from './eventsMath'
import type { EventsList, EventsTab } from './types'
import { TAB_WORDS } from './words'
import { GetStarted } from '../ui/GetStarted'

/**
 * Events (release 8, spec 2026-10-25 §4): Upcoming, Past and Drafts, each event a card that opens its page; New event
 * (managers and staff who manage offers) opens the one dialog with sensible defaults. The tab lives in the address
 * (`?tab=`), so a link opens the same one.
 */
export function EventsPage() {
  const { t, i18n } = useTranslation()
  const look = useLook()
  const location = useLocation()
  const navigate = useNavigate()
  const tab = tabFrom(location.search)
  const [pages, setPages] = useState<Record<EventsTab, number>>({ upcoming: 1, past: 1, drafts: 1 })
  const page = pages[tab]
  const query = useQuery({ queryKey: [...EVENTS_KEY, tab, page], queryFn: () => eventsApi.list(tab, page) })
  const [creating, setCreating] = useState(false)
  const data = query.data
  const locale = i18n.language || 'en'
  const go = (next: EventsTab) => navigate({ pathname: '/loyalty/events', search: searchFor(next) }, { replace: true })

  return (
    <div className="space-y-5 px-4 py-6 lg:px-6">
      <PageHeader title={t('loyalty.events.title', 'Events')}>
        {data?.can_change && (
          <Button onClick={() => setCreating(true)}><CalendarPlus size={16} aria-hidden />{t('loyalty.events.new', 'New event')}</Button>
        )}
      </PageHeader>

      <div role="tablist" aria-label={t('loyalty.events.tabs', 'Events')} className="flex flex-wrap gap-2">
        {EVENT_TABS.map(name => {
          const total = data?.totals[name]
          return (
            <button key={name} type="button" role="tab" id={`events-tab-${name}`} aria-selected={tab === name} aria-controls="events-panel"
              tabIndex={tab === name ? 0 : -1} onClick={() => go(name)} onKeyDown={(e) => {
                const next = tabAfter(tab, e.key)
                if (next === null) return
                e.preventDefault()
                go(next)
                document.getElementById(`events-tab-${next}`)?.focus()
              }}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium ${tab === name ? 'border-transparent bg-a-accent text-a-accent-ink' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'}`}>
              {t(`loyalty.events.tab.${name}`, TAB_WORDS[name])}
              {total !== undefined && total > 0 && <span className="tabular-nums opacity-80">{points(total, locale)}</span>}
            </button>
          )
        })}
      </div>

      <div id="events-panel" role="tabpanel" aria-labelledby={`events-tab-${tab}`} className="space-y-4">
        {query.isError && !data && (
          <div className="max-w-xl space-y-3">
            <Notice tone="danger">{t(...refusalKey('loyalty.events', ERRORS, 'load', failureOf(query.error)))}</Notice>
            <Button variant="secondary" onClick={() => { void query.refetch() }}>{t('loyalty.common.retry', 'Try again')}</Button>
          </div>
        )}
        {!data && query.isLoading && (
          <div role="status" className="grid gap-3 lg:grid-cols-2">
            <span className="sr-only">{t('loyalty.common.loading', 'Loading…')}</span>
            {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}
          </div>
        )}
        {data && data.events.length === 0 && <EmptyTab tab={tab} data={data} />}
        {data && data.events.length > 0 && (
          <ul className="grid gap-3 lg:grid-cols-2">
            {data.events.map(event => <EventCard key={event.id} event={event} theme={look.resolved} locale={locale} />)}
          </ul>
        )}
        {data && <Pager page={data.page} pages={data.pages} onPage={(next) => setPages(p => ({ ...p, [tab]: next }))} />}
      </div>

      {creating && data && <EventDialog event={null} options={data.options} onClose={() => setCreating(false)} />}
    </div>
  )
}

/**
 * A tab with nothing in it says what would be there. Nothing coming up teaches how to plan one (release 10, the owner's
 * Figma); New event stays in the page's header.
 */
function EmptyTab({ tab, data }: { tab: EventsTab; data: EventsList }) {
  const { t } = useTranslation()
  if (tab === 'upcoming') {
    return (
      <GetStarted name="events" hue="offer" title={t('loyalty.events.get_started.title', 'Plan your first event')}
        line={t('loyalty.events.get_started.line', 'A tasting, a class or a members’ night: members sign up in the portal, and staff check them in at the door.')}
        steps={[
              { title: t('loyalty.events.get_started.s1_title', 'Name it and set the time'), line: t('loyalty.events.get_started.s1_line', 'A day and times on your venue’s clock, and where it is held.') },
              { title: t('loyalty.events.get_started.s2_title', 'Choose who may come'), line: t('loyalty.events.get_started.s2_line', 'Every member or some tiers, with a sign-up in the portal if you want one.') },
              { title: t('loyalty.events.get_started.s3_title', 'Publish it'), line: t('loyalty.events.get_started.s3_line', 'Members see it in the portal; check them in with Scan on the day.') },
            ]}
        // New event stays in the page's header for whoever may create one; anyone else reads who does.
        who={data.can_change ? null : t('loyalty.events.read_only', 'Managers and staff allowed to manage offers create events.')} />
    )
  }
  const words: Record<Exclude<EventsTab, 'upcoming'>, string> = {
    past: t('loyalty.events.empty.past', 'Events that have ended show here, with who came.'),
    drafts: t('loyalty.events.empty.drafts', 'No drafts. An event saved as a draft stays here until you publish it.'),
  }
  return (
    <div className="rounded-2xl border border-dashed border-a-border px-4 py-10 text-center">
      <p className="mx-auto max-w-md text-sm text-a-text-2">{words[tab]}</p>
    </div>
  )
}
