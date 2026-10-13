import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AppointmentsContext } from '../AppointmentsProvider'
import { AppointmentPanel } from './AppointmentPanel'
import { CLOSED, panelReducer } from './panelState'
import type { Bootstrap } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) => (typeof fallback === 'string' ? fallback : key),
    i18n: { language: 'en' },
  }),
}))

const boot: Bootstrap = {
  name: 'HexaTech Appointments',
  organization: { id: 16, name: 'Lumière Salon', industry: 'beauty' },
  brand: null,
  venue: { timezone: 'Europe/London', timezone_named: true, today: '2026-10-06', currency: 'GBP' },
  staff: { name: 'Vitalij K', role: 'manager' },
  loyalty: { programme_on: true, points_on_bookings: true },
  readiness: { services: 5, team: 4, bookable: true, checklist: { steps: [], complete: true } },
}

function panel(slide?: boolean) {
  const state = panelReducer(CLOSED, { type: 'openCreate', key: 'k', draft: { date: '2026-10-06', time: '10:00', masterId: 1 } })
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <AppointmentsContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <AppointmentPanel state={state} dispatch={() => {}} masters={[]} services={[]} today="2026-10-06" slide={slide} />
        </AppointmentsContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
  return html.match(/<aside[^>]*role="dialog"[^>]*>/)?.[0] ?? ''
}

describe('AppointmentPanel motion', () => {
  it('slides in when it opens', () => {
    expect(panel(true)).toContain('animate-a-slide-in')
    expect(panel()).toContain('animate-a-slide-in')
  })

  it('stays in place when it replaces another appointment', () => {
    const tag = panel(false)
    expect(tag).toContain('role="dialog"')
    expect(tag).not.toContain('animate-a-slide-in')
  })

  it('says it covers the calendar, so a card\'s preview is not placed under it', () => {
    expect(panel()).toContain('data-covers-calendar=""')
  })
})
