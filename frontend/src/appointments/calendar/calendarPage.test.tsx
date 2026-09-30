import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppointmentsContext } from '../AppointmentsProvider'
import { CalendarPage } from './CalendarPage'
import type { Bootstrap } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
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
  readiness: { services: 5, team: 4, bookable: true },
}

function page() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/appointments']}>
      <QueryClientProvider client={new QueryClient()}>
        <AppointmentsContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <CalendarPage />
        </AppointmentsContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('CalendarPage', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('opens on the venue\'s today as the server gave it, even when this computer\'s clock is days out', () => {
    vi.setSystemTime(new Date('2026-10-09T12:00:00Z'))
    expect(page()).toContain('value="2026-10-06"')
  })
})
