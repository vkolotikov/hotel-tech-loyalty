import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Toolbar } from './Toolbar'
import { AppointmentsContext } from '../AppointmentsProvider'
import type { CalendarMaster } from '../lib/types'
import type { View } from '../lib/prefs'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

const masters: CalendarMaster[] = [
  { id: 1, name: 'Emma', title: null, avatar: null, days: {} },
  { id: 2, name: 'James', title: null, avatar: null, days: {} },
]

function toolbar(view: View, masterId: number | null, extra: { viewLocked?: boolean } = {}) {
  const noop = () => {}
  return renderToStaticMarkup(
    <AppointmentsContext.Provider value={{ data: undefined, isLoading: false, isError: false, error: null, refetch: noop }}>
      <Toolbar
        view={view} viewLocked={extra.viewLocked ?? false} date="2026-10-06" locale="en-GB"
        masters={masters} masterId={masterId} showCancelled={false} updatedAt={615} refreshing={false}
        onView={noop} onDate={noop} onPrev={noop} onNext={noop} onToday={noop} onMaster={noop} onShowCancelled={noop} onRefresh={noop}
      />
    </AppointmentsContext.Provider>,
  )
}

describe('Toolbar', () => {
  it('names the day, or the week as a range', () => {
    expect(toolbar('day', null)).toContain('6 Oct 2026')
    expect(toolbar('week', 1)).toMatch(/5 Oct – .*11 Oct 2026/)
  })

  it('offers the whole team in the day and list views', () => {
    expect(toolbar('day', null)).toContain('Whole team')
    expect(toolbar('list', null)).toContain('Whole team')
  })

  it('the week view is one person\'s week, so it names that person and offers no "whole team"', () => {
    const html = toolbar('week', 2)
    expect(html).not.toContain('Whole team')
    expect(html).toMatch(/<option value="2" selected="">James<\/option>/)
  })

  it('does not clip the focus ring of the view buttons', () => {
    const html = toolbar('day', null)
    const group = html.slice(html.indexOf('role="group"') - 120, html.indexOf('role="group"') + 40)
    expect(group).not.toContain('overflow-hidden')
  })

  it('has no view switch on a narrow screen, where the list is the only view', () => {
    expect(toolbar('list', null, { viewLocked: true })).not.toContain('role="group"')
  })

  it('says when the calendar was last loaded', () => {
    expect(toolbar('day', null)).toContain('Updated 10:15')
  })
})
