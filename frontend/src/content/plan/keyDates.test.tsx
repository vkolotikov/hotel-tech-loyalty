import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en-GB' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

import { ContentContext } from '../ContentProvider'
import { bootFor } from '../brand/brandTesting'
import type { BuiltInDay, OwnKeyDate } from '../lib/types'
import { newForm } from '../panel/panelState'
import { KeyDateChips } from './KeyDateChips'
import { KeyDateEditor } from './KeyDateEditor'
import { KeyDayCard } from './KeyDayCard'
import { Toolbar } from './Toolbar'

const wrap = (el: ReactElement) => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}>
    <ContentContext.Provider value={{ data: bootFor(true), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>{el}</ContentContext.Provider>
  </QueryClientProvider>,
)
const christmas: BuiltInDay = { id: 'christmas', kind: 'holiday', date: '2026-12-25', substitute: false, name_en: 'Christmas Day' }
const boxingInLieu: BuiltInDay = { id: 'gb.boxing_day', kind: 'holiday', date: '2026-12-28', substitute: true, name_en: 'Boxing Day' }
const note: OwnKeyDate = { id: 5, kind: 'note', title: 'Photographer', details: null, start: '2026-12-23', end: null }

describe('KeyDateChips (spec 2026-10-16 §3.4)', () => {
  // Review Focus 3: every chip is a button, so the day's click handler (clickAdds) never starts a post from it.
  it('draws each key date as a button named by its kind; a substitute says so; own ones show their title', () => {
    const out = wrap(<KeyDateChips items={[christmas, boxingInLieu, note]} observed={false} onPick={() => {}} />)
    expect(out).toContain('aria-label="Public holiday: Christmas Day"')
    expect(out).toContain('Boxing Day (day off in lieu)')
    expect(out).toContain('aria-label="Note: Photographer"')
    expect(out.match(/<button/g)).toHaveLength(3)
  })

  it('says "observed" for a United States substitute, and in the month view shows the first and how many more', () => {
    expect(wrap(<KeyDateChips items={[boxingInLieu]} observed onPick={() => {}} />)).toContain('Boxing Day (observed)')
    const month = wrap(<KeyDateChips items={[christmas, boxingInLieu, note]} observed={false} compact onPick={() => {}} onMore={() => {}} />)
    expect(month.match(/<button/g)).toHaveLength(2)
    // Final review: "+N more" is a button (it opens the week), so a click never reaches the day's empty space.
    expect(month).toMatch(/<button[^>]*>\+2 more<\/button>/)
  })
})

describe('KeyDayCard', () => {
  it('offers to write a post for the day, and says when the day has gone', () => {
    expect(wrap(<KeyDayCard day="2026-12-25" keyDate={christmas} observed={false} canWrite onWrite={() => {}} onClose={() => {}} />)).toContain('Write a post for it')
    const gone = wrap(<KeyDayCard day="2026-12-25" keyDate={christmas} observed={false} canWrite={false} onWrite={() => {}} onClose={() => {}} />)
    expect(gone).not.toContain('Write a post for it')
    expect(gone).toContain('This day has gone; new posts start from today.')
  })
})

describe('KeyDateEditor', () => {
  it('asks a new event for its first and last day, with no Delete', () => {
    const out = wrap(<KeyDateEditor kind="event" keyDate={null} day="2026-10-09" onClose={() => {}} />)
    expect(out).toContain('New event')
    expect(out).toContain('First day')
    expect(out).toContain('Last day (optional)')
    expect(out).toContain('value="2026-10-09"')
    expect(out).not.toContain('>Delete<')
  })

  it('edits a note on one day, says the AI never sees it, and can delete it', () => {
    const out = wrap(<KeyDateEditor kind="note" keyDate={note} day="2026-12-23" onClose={() => {}} />)
    expect(out).toContain('value="Photographer"')
    expect(out).not.toContain('Last day')
    expect(out).toContain('Notes are for the team: the AI never sees them.')
    expect(out).toContain('>Delete<')
  })
})

describe('the Key dates toggle and a new post from a key date', () => {
  it('shows a pressed Key dates switch in the toolbar', () => {
    const out = wrap(<Toolbar view="week" viewLocked={false} label="Oct 5 – 11" refreshing={false} canGenerate={false} filter={{ platforms: [], status: 'all' }}
      platforms={[]} statuses={[]} onPrev={() => {}} onNext={() => {}} onToday={() => {}} onView={() => {}} onFilter={() => {}} onGenerate={() => {}}
      keyDates onKeyDates={() => {}} />)
    // Within one button: the Week view's pressed button must not count.
    expect(out).toMatch(/<button[^>]*aria-pressed="true"[^>]*>(?:(?!<\/button>).)*Key dates<\/button>/)
  })

  it('starts a new post with the day’s name as its topic (Write a post for it)', () => {
    expect(newForm({ date: '2026-12-25', platform: null, fields: { topic: 'Christmas Day' } }, ['instagram']).topic).toBe('Christmas Day')
  })
})
