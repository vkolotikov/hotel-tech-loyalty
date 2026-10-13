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
  { id: 1, name: 'Emma', title: null, avatar: null, color: '#3b7dd8', days: {} },
  { id: 2, name: 'James', title: null, avatar: null, color: '#c46f1b', days: {} },
]

function toolbar(view: View, masterId: number | null, extra: { viewLocked?: boolean; panelOpen?: boolean; date?: string; personPicker?: boolean } = {}) {
  const noop = () => {}
  return renderToStaticMarkup(
    <AppointmentsContext.Provider value={{ data: undefined, isLoading: false, isError: false, error: null, refetch: noop }}>
      <Toolbar
        view={view} viewLocked={extra.viewLocked ?? false} panelOpen={extra.panelOpen ?? false} date={extra.date ?? '2026-10-06'} locale="en-GB"
        masters={masters} masterId={masterId} personPicker={extra.personPicker ?? view !== 'day'} showCancelled={false} updatedAt={615} refreshing={false}
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

  it('heads the day in the display serif, with the ISO week number beside it (Atelier)', () => {
    const html = toolbar('day', null, { date: '2026-10-12' })
    expect(html).toMatch(/<h2[^>]*class="[^"]*font-a-display[^"]*"[^>]*>[^<]*12 Oct 2026<\/h2>/)
    expect(html).toMatch(/<span[^>]*class="[^"]*font-a-mono[^"]*"[^>]*>Week 42<\/span>/)
    // The week view heads the range, and the week number is that of the date on screen.
    expect(toolbar('week', 1, { date: '2026-10-12' })).toContain('Week 42')
  })

  it('keeps the date input reachable by name, and groups the views as a quiet segmented control', () => {
    const html = toolbar('day', null)
    expect(html).toMatch(/<span class="sr-only">Go to date<\/span><input type="date"[^>]*value="2026-10-06"/)
    const group = html.match(/<div[^>]*role="group"[^>]*>/)?.[0] ?? ''
    expect(group).toContain('bg-a-surface-2')
    expect(group).not.toContain('border-a-border')
    // The pressed view is a raised surface chip, not a filled accent block.
    expect(html).toMatch(/aria-pressed="true"[^>]*class="[^"]*bg-a-surface [^"]*shadow-a-sm/)
    expect(html).not.toContain('first:rounded-l')
  })

  it('marks the pressed view by weight as well as by colour', () => {
    const buttons = [...toolbar('week', 1).matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*class="([^"]*)"[^>]*>(Day|Week|List)</g)]
    expect(buttons.map(m => m[3])).toEqual(['Day', 'Week', 'List'])
    expect(buttons.map(m => m[1])).toEqual(['false', 'true', 'false'])
    for (const [, pressed, cls, name] of buttons) {
      const classes = cls.split(' ')
      expect(classes, `${name} pressed=${pressed}`).toContain(pressed === 'true' ? 'font-semibold' : 'font-medium')
      expect(classes, `${name} pressed=${pressed}`).not.toContain(pressed === 'true' ? 'font-medium' : 'font-semibold')
    }
  })

  it('sits on the canvas with no rule under it', () => {
    const html = toolbar('day', null)
    const root = html.slice(0, html.indexOf('>'))
    expect(root).toContain('bg-a-canvas')
    expect(root).not.toContain('border-b')
  })

  it('offers the whole team in the list view; the day view shows team chips instead of a picker', () => {
    expect(toolbar('list', null)).toContain('Whole team')
    expect(toolbar('day', null)).not.toContain('Whole team')
  })

  it('renders the team picker only when asked to (the day view has chips instead)', () => {
    expect(toolbar('day', null, { personPicker: false })).not.toContain('<select')
    expect(toolbar('day', null, { personPicker: false })).not.toContain('James')
    expect(toolbar('day', null, { personPicker: true })).toContain('<select')
    expect(toolbar('week', 1, { personPicker: true })).toContain('<select')
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

  it('keeps clear of the open appointment panel on a wide screen, so Refresh stays in view', () => {
    const root = (html: string) => html.slice(0, html.indexOf('>'))
    expect(root(toolbar('day', null, { panelOpen: true }))).toContain('lg:pr-[456px]')
    expect(root(toolbar('day', null))).not.toContain('pr-[456px]')
  })

  it('from 1280 px reserves only what the panel covers beyond the day overview column (440 − 288 + 24)', () => {
    // Reserving the full 456 px there squeezed the toolbar into three rows with the panel open (browser pass).
    const root = (html: string) => html.slice(0, html.indexOf('>'))
    expect(root(toolbar('day', null, { panelOpen: true }))).toContain('xl:pr-[176px]')
    expect(root(toolbar('day', null))).not.toContain('xl:pr-')
  })

  it('keeps the week number with the date heading when the toolbar wraps', () => {
    const html = toolbar('day', null, { date: '2026-10-12' })
    expect(html).toMatch(/<div class="[^"]*\bflex\b[^"]*"><h2[^>]*>[^<]*12 Oct 2026<\/h2><span[^>]*>Week 42<\/span><\/div>/)
  })

  it('has no view switch on a narrow screen, where the list is the only view', () => {
    expect(toolbar('list', null, { viewLocked: true })).not.toContain('role="group"')
  })

  it('says when the calendar was last loaded', () => {
    expect(toolbar('day', null)).toContain('Updated 10:15')
  })
})
