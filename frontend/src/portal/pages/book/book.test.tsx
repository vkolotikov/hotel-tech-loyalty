import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Slot } from '../../lib/types'
import { Book } from './Book'
import { ServiceStep } from './ServiceStep'
import { StaffStep } from './StaffStep'
import { WhenStep } from './WhenStep'
import { base, catalogue, render, renderAsync } from './testUtils'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const vars = typeof fallback === 'object' ? fallback : opts
      let text = typeof fallback === 'string' ? fallback : _k
      for (const [k, v] of Object.entries(vars ?? {})) text = text.replace(`{{${k}}}`, String(v))
      return text
    },
    i18n: { language: 'en' },
  }),
}))
// apiErrorCode/bookErrorKey stay the real implementations (they are pure code-to-key
// lookups the too_far_ahead test below depends on) — only the network calls are stubbed.
vi.mock('../../lib/portalApi', async () => {
  const actual = await vi.importActual<typeof import('../../lib/portalApi')>('../../lib/portalApi')
  return {
    ...actual,
    portalApi: {
      ...actual.portalApi,
      catalogue: () => new Promise(() => {}),
      calendar: () => new Promise(() => {}),
      availability: () => new Promise(() => {}),
      offers: () => new Promise(() => {}),
      redemptions: () => new Promise(() => {}),
    },
  }
})

describe('Book', () => {
  it('lists services with the member price and the automatic discount label', () => {
    const html = render(<Book />, base, c => c.setQueryData(['portal-catalogue'], catalogue))
    expect(html).toContain('Deep Tissue')
    expect(html).toContain('Hot Stone')
    expect(html).toContain('10% off treatments')
    expect(html).toContain('54') // member price
    expect(html).toContain('Your price')
  })

  it('tells a member the venue does not book online instead of listing services', () => {
    const html = render(<Book />, { ...base, capabilities: { ...base.capabilities, services: false } }, c => c.setQueryData(['portal-catalogue'], catalogue))
    expect(html).toContain('Online booking is not available for this venue yet.')
    expect(html).not.toContain('Deep Tissue')
  })

  it('shows a retry notice, not an endless skeleton, when the catalogue fails to load', async () => {
    const html = await renderAsync(<Book />, base, async c => {
      await c.prefetchQuery({ queryKey: ['portal-catalogue'], queryFn: () => Promise.reject(new Error('boom')), retry: false })
    })
    expect(html).toContain('Something went wrong. Please try again.')
    expect(html).toContain('Try again')
    expect(html).not.toContain('animate-pulse')
  })
})

describe('WhenStep', () => {
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-05T06:00:00Z')) })
  afterAll(() => { vi.useRealTimers() })

  const slots: Slot[] = [
    { start: '2026-10-05T09:00:00Z', end: '2026-10-05T09:45:00Z', duration_minutes: 45, time_label: '09:00', masters: [5] },
    { start: '2026-10-05T10:00:00Z', end: '2026-10-05T10:45:00Z', duration_minutes: 45, time_label: '10:00', masters: [5] },
  ]

  it('shows the slot labels for the selected day and greys days with nothing available', () => {
    const html = render(<WhenStep serviceId={11} masterId={null} rules={catalogue.rules} value={null} onPick={() => {}} timezone="Europe/Riga" />, base, c => {
      c.setQueryData(['portal-calendar', 11, null, '2026-10-05', '2026-10-11'], { available_dates: ['2026-10-05', '2026-10-07'] })
      c.setQueryData(['portal-slots', 11, null, '2026-10-05'], { slots })
    }, '/portal/book?service=11&date=2026-10-05')
    expect(html).toContain('09:00')
    expect(html).toContain('10:00')
    expect(html).toContain('aria-disabled="true"') // an unavailable day in the strip
    // renderToStaticMarkup HTML-escapes the apostrophe in text nodes ("'" -> "&#x27;").
    expect(html).toContain("Times are shown in the venue&#x27;s local time.")
  })

  it('says when a day has no times left', () => {
    const html = render(<WhenStep serviceId={11} masterId={null} rules={catalogue.rules} value={null} onPick={() => {}} timezone="Europe/Riga" />, base, c => {
      c.setQueryData(['portal-calendar', 11, null, '2026-10-05', '2026-10-11'], { available_dates: ['2026-10-05'] })
      c.setQueryData(['portal-slots', 11, null, '2026-10-05'], { slots: [] })
    }, '/portal/book?service=11&date=2026-10-05')
    expect(html).toContain('No times left on this day.')
  })

  it('keeps the two arrow buttons in a header row above the seven-day grid, not squeezed beside it', () => {
    const html = render(<WhenStep serviceId={11} masterId={null} rules={catalogue.rules} value={null} onPick={() => {}} timezone="Europe/Riga" />, base, c => {
      c.setQueryData(['portal-calendar', 11, null, '2026-10-05', '2026-10-11'], { available_dates: ['2026-10-05'] })
      c.setQueryData(['portal-slots', 11, null, '2026-10-05'], { slots })
    }, '/portal/book?service=11&date=2026-10-05')
    const headerIdx = html.indexOf('data-strip-header="true"')
    const gridIdx = html.indexOf('grid-cols-7')
    const prevIdx = html.indexOf('aria-label="Previous"')
    const nextIdx = html.indexOf('aria-label="Next"')
    expect(headerIdx).toBeGreaterThan(-1)
    expect(prevIdx).toBeGreaterThan(headerIdx)
    expect(nextIdx).toBeGreaterThan(headerIdx)
    expect(prevIdx).toBeLessThan(gridIdx)
    expect(nextIdx).toBeLessThan(gridIdx)
    // The header `<div>` closes and the grid `<div>` opens as siblings, with the
    // grid never nested inside the arrows' own row.
    expect(html).toMatch(/<\/div><div class="grid grid-cols-7/)
  })

  it('shows a retry notice when the calendar fails to load', async () => {
    const html = await renderAsync(<WhenStep serviceId={11} masterId={null} rules={catalogue.rules} value={null} onPick={() => {}} timezone="Europe/Riga" />, base, async c => {
      await c.prefetchQuery({ queryKey: ['portal-calendar', 11, null, '2026-10-05', '2026-10-11'], queryFn: () => Promise.reject(new Error('boom')), retry: false })
      c.setQueryData(['portal-slots', 11, null, '2026-10-05'], { slots: [] })
    }, '/portal/book?service=11&date=2026-10-05')
    expect(html).toContain('Something went wrong. Please try again.')
    expect(html).toContain('Try again')
  })

  it('shows a retry notice when the slots fail to load', async () => {
    const html = await renderAsync(<WhenStep serviceId={11} masterId={null} rules={catalogue.rules} value={null} onPick={() => {}} timezone="Europe/Riga" />, base, async c => {
      c.setQueryData(['portal-calendar', 11, null, '2026-10-05', '2026-10-11'], { available_dates: ['2026-10-05'] })
      await c.prefetchQuery({ queryKey: ['portal-slots', 11, null, '2026-10-05'], queryFn: () => Promise.reject(new Error('boom')), retry: false })
    }, '/portal/book?service=11&date=2026-10-05')
    expect(html).toContain('Something went wrong. Please try again.')
    expect(html).toContain('Try again')
  })

  it('shows the booking-window sentence, not the generic one, when the server refuses a day as too far ahead', async () => {
    const tooFarAhead = { response: { status: 422, data: { error: 'too_far_ahead' } } }
    const html = await renderAsync(<WhenStep serviceId={11} masterId={null} rules={catalogue.rules} value={null} onPick={() => {}} timezone="Europe/Riga" />, base, async c => {
      c.setQueryData(['portal-calendar', 11, null, '2026-10-05', '2026-10-11'], { available_dates: ['2026-10-05'] })
      await c.prefetchQuery({ queryKey: ['portal-slots', 11, null, '2026-10-05'], queryFn: () => Promise.reject(tooFarAhead), retry: false })
    }, '/portal/book?service=11&date=2026-10-05')
    expect(html).toContain('That date is beyond the booking window.')
    expect(html).not.toContain('Something went wrong. Please try again.')
  })
})

describe("WhenStep's default day", () => {
  // 22:30 UTC on 2026-10-05 is already 01:30 on 2026-10-06 in Riga (UTC+3,
  // EEST) — the venue's "today" and the UTC day disagree for hours every day.
  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-05T22:30:00Z')) })
  afterAll(() => { vi.useRealTimers() })

  it("follows the venue's own calendar day, not the UTC day, when no ?date= is given", () => {
    const html = render(<WhenStep serviceId={11} masterId={null} rules={catalogue.rules} value={null} onPick={() => {}} timezone="Europe/Riga" />, base, c => {
      c.setQueryData(['portal-calendar', 11, null, '2026-10-06', '2026-10-12'], { available_dates: ['2026-10-06'] })
      c.setQueryData(['portal-slots', 11, null, '2026-10-06'], { slots: [{ start: '2026-10-06T09:00:00Z', end: '2026-10-06T09:45:00Z', duration_minutes: 45, time_label: '09:00', masters: [5] }] })
    }, '/portal/book')
    // Only reachable if the component queried the venue day (2026-10-06):
    // the UTC day (2026-10-05) has no seeded data for these keys.
    expect(html).toContain('09:00')
    expect(html).toMatch(/aria-label="Previous"[^>]*disabled=""/)
  })
})

// Final review, Minor 11: after a step change Book moves keyboard focus to the new step's heading (or to the
// notice a bounce carried — see focusTargetFor in steps.ts), so every step must render a heading that script
// can focus without adding it to the tab order.
const focusableHeading = (step: string) =>
  new RegExp(`<h2[^>]*tabindex="-1"[^>]*data-step-heading="${step}"|<h2[^>]*data-step-heading="${step}"[^>]*tabindex="-1"`)

describe('step headings', () => {
  it('Service, Who and When each render a focusable heading', () => {
    expect(render(<ServiceStep catalogue={catalogue} onPick={() => {}} />)).toMatch(focusableHeading('service'))
    expect(render(<StaffStep catalogue={catalogue} serviceId={11} value={null} onPick={() => {}} />)).toMatch(focusableHeading('staff'))
    expect(render(<WhenStep serviceId={11} masterId={null} rules={catalogue.rules} value={null} onPick={() => {}} timezone="Europe/Riga" />, base, undefined, '/portal/book?service=11'))
      .toMatch(focusableHeading('when'))
  })
})
