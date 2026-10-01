import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * The unified calendar (/calendar), drawn with this computer's clock set
 * east of UTC (Riga, UTC+3 in October). Service times are the venue's wall
 * clock and stays are calendar dates: neither may move with the browser's zone.
 */
vi.mock('../lib/api', () => ({ api: { get: () => new Promise(() => {}) }, APP_BASE: '' }))

const { default: CalendarUnified } = await import('./CalendarUnified')

const service = {
  id: 7, customer_name: 'Emily Johnson', start_at: '2026-10-21T15:00:00.000000Z',
  service: { id: 3, name: 'Scalp Ritual' },
}
const stay = { id: 9, guest_name: 'Anna Berzina', apartment_name: 'Suite 2', arrival_date: '2026-10-21', departure_date: '2026-10-23' }

function render(): string {
  const qc = new QueryClient()
  qc.setQueryData(['unified-calendar', 'rooms', '2026-10'], { bookings: [stay] })
  qc.setQueryData(['unified-calendar', 'services', '2026-10'], { bookings: [service] })
  qc.setQueryData(['unified-calendar', 'tasks', '2026-10'], [])
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter><CalendarUnified /></MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Each month cell as [day number, whether it is marked today, its markup]. */
function cells(html: string): [number, boolean, string][] {
  return html.split('<button').filter(c => c.includes('min-h-[118px]')).map(c => {
    const m = /text-\[11px\] font-bold (text-emerald-400|text-gray-400)">(\d+)</.exec(c)
    return [Number(m?.[2]), m?.[1] === 'text-emerald-400', c]
  })
}

const original = process.env.TZ
beforeEach(() => {
  process.env.TZ = 'Europe/Riga'
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-21T09:00:00Z')) // 12:00 in Riga
})
afterEach(() => {
  vi.useRealTimers()
  process.env.TZ = original
})

describe('the unified calendar, east of UTC', () => {
  it('puts the days of October under the right weekdays', () => {
    expect(cells(render()).slice(0, 7).map(c => c[0])).toEqual([28, 29, 30, 1, 2, 3, 4])
  })

  it('shows a 15:00 appointment at 15:00 on the 21st', () => {
    const day21 = cells(render()).filter(c => c[0] === 21)[0][2]
    expect(day21).toContain('Emily Johnson')
    expect(day21).toMatch(/>(15:00|03:00\s?PM)</)
  })

  it('shows a stay on each night, and not on the morning the guest leaves', () => {
    const nights = cells(render()).filter(c => c[2].includes('Anna Berzina')).map(c => c[0])
    expect(nights).toEqual([21, 22])
  })

  it('marks today by this computer\'s calendar after midnight', () => {
    vi.setSystemTime(new Date('2026-10-21T22:30:00Z')) // 01:30 on the 22nd in Riga
    expect(cells(render()).filter(c => c[1]).map(c => c[0])).toEqual([22])
  })
})
