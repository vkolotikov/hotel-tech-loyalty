import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppointmentsContext } from '../AppointmentsProvider'
import { money } from '../../lib/money'
import { CardPreview, PREVIEW_ROOM, previewPlacement, visibleArea, type PreviewPlacement } from './CardPreview'
import type { AppointmentDetail, AppointmentSummary, Bootstrap, MemberSummary } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

const boot = (programmeOn: boolean): Bootstrap => ({
  name: 'HexaTech Appointments',
  organization: { id: 16, name: 'Lumière Salon', industry: 'beauty' },
  brand: null,
  venue: { timezone: 'Europe/London', timezone_named: true, today: '2026-10-06', currency: 'EUR' },
  staff: { name: 'Vitalij K', role: 'manager', can_manage: true },
  loyalty: { programme_on: programmeOn, points_on_bookings: true },
  readiness: { services: 5, team: 4, bookable: true, checklist: { steps: [], complete: true } },
})

/** What the calendar card knows: one hour, 60 minutes, with Marie. */
const summary: AppointmentSummary = {
  id: 7, reference: 'SVC-7', start: '2026-10-06T10:00', end: '2026-10-06T11:00', duration_minutes: 60,
  service: { id: 1, name: 'Haircut & Styling' }, master: { id: 1, name: 'Marie' },
  client: { id: 5, name: 'Sophie Williams', is_member: true }, status: 'confirmed', payment: { state: 'not_paid_online' }, revision: 'r',
}

const gold: MemberSummary = { id: 9, number: 'M-9', tier: 'Gold', points: 2350 }

/** The appointment detail the panel loads, with a member on the client. */
const detail = (over: Partial<AppointmentDetail> = {}, member: MemberSummary | null = gold): AppointmentDetail => ({
  ...summary,
  client: { id: 5, name: 'Sophie Williams', phone: null, email: null, member },
  payment: { state: 'paid_by_card', raw: 'paid', amount: 45, refunded_amount: null, carries_card_payment: true, currency: 'EUR' },
  price: { total: 45, list: null, discount_label: null, currency: 'EUR' },
  source: 'staff', notes: { customer: null, staff: null }, actions: [], loyalty: null, history: [],
  ...over,
})

const KEY = ['appointments', 'booking', 7]
const below = { side: 'right' as const, above: false }

type Seed = 'none' | 'failed' | { booking: AppointmentDetail }

/** The preview as a static render: the detail query holds nothing yet (loading), has failed, or holds `booking`. */
function preview(opts: { seed?: Seed; programme?: boolean; placement?: PreviewPlacement; by?: 'pointer' | 'focus' } = {}) {
  const client = new QueryClient()
  const seed = opts.seed ?? 'none'
  if (seed === 'failed') {
    client.getQueryCache().build(client, { queryKey: KEY }).setState({ status: 'error', error: new Error('offline'), fetchStatus: 'idle' })
    expect(client.getQueryState(KEY)?.status).toBe('error') // the failure is really in the cache, not the same as loading
  } else if (seed !== 'none') client.setQueryData(KEY, seed)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <AppointmentsContext.Provider value={{ data: boot(opts.programme ?? true), isLoading: false, isError: false, error: null, refetch: () => {} }}>
        <CardPreview id="card-preview-7" appointment={summary} memberName="Marie" placement={opts.placement ?? below} top={120} bottom={180} by={opts.by ?? 'pointer'} />
      </AppointmentsContext.Provider>
    </QueryClientProvider>,
  )
}

/** The text a reader gets: tags removed, entities decoded back to the characters they stand for. */
const words = (html: string) => html.replace(/<[^>]*>/g, '|').replace(/\|+/g, '|').replace(/&amp;/g, '&')

describe('previewPlacement', () => {
  // The part of the grid that can be seen: a 1440 px screen with the day's scroller at 280–1128 and its head ending at 425.
  const view = { left: 280, right: 1128, top: 425, bottom: 884 }
  const box = (left: number, top: number, width: number, height: number) => ({ left, right: left + width, top, bottom: top + height })
  /** A column `width` wide at `left` (the preview is placed beside it) and an ordinary card in it: 2 px in from each side. */
  const at = (left: number, top: number, width = 193, height = 54) => [box(left, 0, width, 2000), box(left + 2, top, width - 4, height)] as const
  const place = (left: number, top: number, width?: number, height?: number) => previewPlacement(...at(left, top, width, height), view)
  const { width: W, height: H } = PREVIEW_ROOM

  it('needs the room of the preview itself: 17rem wide with its gap, and every line of it tall', () => {
    expect(W).toBe(272 + 8)
    expect(H).toBeGreaterThanOrEqual(201 + 8) // the tallest preview measured in the browser (points and price shown)
  })

  it('puts the preview to the right of the card\'s column while the seen part of the grid has room there, else to the left', () => {
    expect(place(340, 500).side).toBe('right')
    expect(place(735, 500).side).toBe('left') // 1128 − 928 = 200 px: not enough
    expect(place(1128 - 193 - W, 500).side).toBe('right') // exactly enough
    expect(place(1128 - 193 - W + 1, 500).side).toBe('left')
  })

  // The preview is placed beside the column (left|right: calc(100% + 8px) inside it), not beside the card, which can be
  // narrower: half a column in an overlap lane, or 28 px short of it with a gutter (a cancellation or no-show).
  it('judges the sides by the column, not by a card narrower than its column', () => {
    // The left card of an overlapping pair (half its column) in a column ending at 930, the panel's edge at 1100:
    // 1100 − 783 = 317 px beside the card, but only 1100 − 930 = 170 px beside the column.
    const column = box(640, 0, 290, 2000)
    const firstLane = box(642, 500, 141, 54)
    expect(previewPlacement(column, firstLane, { ...view, right: 1100 }).side).toBe('left')
    // A card with a gutter (290 − 4 − 28 = 258 px) in a column ending at 850: 1128 − 820 = 308 beside the card, 278 beside the column.
    expect(previewPlacement(box(560, 0, 290, 2000), box(562, 500, 258, 54), view).side).toBe('left')
    // With room beside the column, the right all the same.
    expect(previewPlacement(box(340, 0, 290, 2000), box(342, 500, 141, 54), view).side).toBe('right')
  })

  it('sits inside the card\'s column when neither side has room (a single wide column)', () => {
    expect(place(340, 500, 757).side).toBe('inside')
  })

  it('opens below a card while the seen part has room under its top, else above when there is more room above', () => {
    expect(place(340, 500).above).toBe(false)
    expect(place(340, 884 - H).above).toBe(false) // exactly enough
    expect(place(340, 884 - H + 1).above).toBe(true)
    expect(place(340, 858, 193, 72).above).toBe(true) // the case the browser showed: 26 px of it was left
    // A short window: neither way fits, so the side with more room.
    const short = { ...view, top: 425, bottom: 625 }
    expect(previewPlacement(...at(340, 440), short).above).toBe(false)
    expect(previewPlacement(...at(340, 560), short).above).toBe(true)
  })

  it('moves the preview into view by as much of the card as is out of it, and not at all otherwise', () => {
    expect(place(340, 500).nudge).toBe(0)
    expect(place(340, 884 - 100).nudge).toBe(0) // above, the card wholly in view
    // A card cut by the scroller's bottom: the preview above it ends where the view does.
    expect(place(340, 858, 193, 72)).toEqual({ side: 'right', above: true, nudge: 930 - 884 })
    // A card partly under the column head: the preview below it starts where the view does.
    expect(place(340, 400, 193, 72)).toEqual({ side: 'right', above: false, nudge: 425 - 400 })
  })
})

describe('visibleArea', () => {
  const scroller = { left: 280, right: 1128, top: 351, bottom: 884 }

  it('is the scroller\'s window below the sticky column head', () => {
    expect(visibleArea(scroller, 425, null)).toEqual({ left: 280, right: 1128, top: 425, bottom: 884 })
    expect(visibleArea(scroller, 300, null).top).toBe(351) // a head above the window (never stuck there) changes nothing
  })

  it('ends where an open panel covers the grid', () => {
    expect(visibleArea(scroller, 425, 1000).right).toBe(1000)
    expect(visibleArea(scroller, 425, 1300).right).toBe(1128) // a panel beyond the scroller covers nothing of it
  })
})

describe('CardPreview', () => {
  // WCAG 1.4.13 (hoverable): the pointer may rest on the preview itself, and a click there opens the appointment.
  it('is a tooltip with the id the card points at, that the pointer can rest on and click', () => {
    const html = preview({ seed: { booking: detail() } })
    expect(html).toMatch(/^<div id="card-preview-7" role="tooltip"/)
    expect(html).not.toContain('pointer-events-none')
    expect(html).toMatch(/^<div[^>]*class="[^"]*\bcursor-pointer\b/)
  })

  // Handlers do not show in a static render: the wiring is read from the source.
  it('tells the grid when the pointer arrives, where it went when it leaves, and opens on a click without taking the focus from the card', () => {
    const source = readFileSync(new URL('./CardPreview.tsx', import.meta.url), 'utf8')
    expect(source).toMatch(/onPointerEnter=\{onHold\}/)
    expect(source).toMatch(/onPointerLeave=\{\(e\) => onLeave\?\.\(e\.relatedTarget\)\}/)
    expect(source).toMatch(/onClick=\{onOpen\}/)
    // Pressing on it must not blur a card the keyboard previewed: the blur would close the preview before the click arrives.
    expect(source).toMatch(/onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/)
  })

  it('with the detail loaded: the client in the display face, tier and points, service, time and length, who, price and payment', () => {
    const html = preview({ seed: { booking: detail() } })
    expect(html).toMatch(/<div class="font-a-display[^"]*">Sophie Williams<\/div>/)
    expect(words(html)).toContain(`|Gold · ${new Intl.NumberFormat('en').format(2350)} points|`) // the workspace's own number formatting
    expect(words(html)).toContain('Gold · 2,350 points')
    expect(words(html)).toContain('|Haircut & Styling|')
    expect(html).toMatch(/<div class="font-a-mono[^"]*">10:00 – 11:00 · 60 min<\/div>/)
    expect(words(html)).toContain('|with Marie|')
    expect(words(html)).toContain(`|${money(45, 'EUR')}| · appointments.payment.paid_by_card|`)
    expect(words(html)).toContain('|Click to open|')
  })

  it('says how to open it the way it was opened: "Click to open" for the pointer, "Press Enter to open" for the keyboard', () => {
    const byPointer = words(preview({ seed: { booking: detail() }, by: 'pointer' }))
    expect(byPointer).toContain('|Click to open|')
    expect(byPointer).not.toContain('Press Enter')
    const byKeyboard = words(preview({ seed: { booking: detail() }, by: 'focus' }))
    expect(byKeyboard).toContain('|Press Enter to open|')
    expect(byKeyboard).not.toContain('Click to open')
    expect(words(preview({ by: 'focus' }))).toContain('|Press Enter to open|') // while the detail loads too
  })

  it('is told by the grid how it was opened (pointer or keyboard focus)', () => {
    const grid = readFileSync(new URL('./TimeGrid.tsx', import.meta.url), 'utf8')
    expect(grid).toMatch(/const startPreview = \(id: number, by: PreviewOpener\) => \{ if \(!dragging\) previewTimer\.start\(\{ id, grid, by \}\) \}/)
    expect(grid).toMatch(/<CardPreview [^>]*by=\{preview\.by\}/)
  })

  it('reads the member from the loyalty card first, then from the client; a member without a tier shows the points alone', () => {
    const fromLoyalty = preview({ seed: { booking: detail({ loyalty: { member: { ...gold, tier: 'Silver', points: 90 }, benefits: [] } }) } })
    expect(words(fromLoyalty)).toContain('Silver · 90 points')
    expect(words(fromLoyalty)).not.toContain('Gold')
    const noTier = preview({ seed: { booking: detail({}, { ...gold, tier: null, points: 1200 }) } })
    expect(words(noTier)).toContain('|1,200 points|')
    expect(words(noTier)).not.toContain('Gold')
  })

  it('shows no points line for a client who is not a member, or when the programme is off', () => {
    expect(words(preview({ seed: { booking: detail({}, null) } }))).not.toMatch(/points/)
    const off = preview({ seed: { booking: detail() }, programme: false })
    expect(words(off)).not.toMatch(/points/)
    expect(words(off)).not.toContain('Gold')
    expect(words(off)).toContain('|Sophie Williams|') // everything else is still there
    expect(words(off)).toContain(money(45, 'EUR'))
  })

  for (const seed of ['none', 'failed'] as const) {
    it(`while the detail is ${seed === 'none' ? 'loading' : 'unavailable'}: still the client, service, time, length and person from the card, no price line, no throw`, () => {
      const html = preview({ seed })
      expect(html).toContain('role="tooltip"')
      expect(html).toMatch(/<div class="font-a-display[^"]*">Sophie Williams<\/div>/)
      expect(words(html)).toContain('|Haircut & Styling|')
      expect(html).toMatch(/<div class="font-a-mono[^"]*">10:00 – 11:00 · 60 min<\/div>/)
      expect(words(html)).toContain('|with Marie|')
      expect(words(html)).toContain('|Click to open|')
      expect(html).not.toContain('appointments.payment.')
      expect(html).not.toContain('€')
      expect(words(html)).not.toMatch(/points/)
    })
  }

  it('shows a dash for an appointment without a service, and no person line without a person', () => {
    const client = new QueryClient()
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <AppointmentsContext.Provider value={{ data: boot(true), isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <CardPreview id="card-preview-7" appointment={{ ...summary, service: null }} memberName={null} placement={below} top={0} bottom={60} />
        </AppointmentsContext.Provider>
      </QueryClientProvider>,
    )
    expect(words(html)).toContain('|—|')
    expect(html).not.toContain('with ')
  })

  it('sits beside the card: right or left of its column, from the card\'s top; above the card it is anchored to the card\'s bottom', () => {
    const right = preview({ placement: { side: 'right', above: false } })
    expect(right).toContain('left:calc(100% + 8px)')
    expect(right).toContain('top:120px')
    expect(right).not.toContain('right:')
    const left = preview({ placement: { side: 'left', above: false } })
    expect(left).toContain('right:calc(100% + 8px)')
    expect(left).not.toContain('left:')
    const above = preview({ placement: { side: 'right', above: true } })
    expect(above).toContain('bottom:calc(100% - 180px)')
    expect(above).not.toContain('top:')
  })

  it('is moved into view by its nudge: down from the card\'s top below it, up from the card\'s bottom above it', () => {
    expect(preview({ placement: { side: 'right', above: false, nudge: 25 } })).toContain('top:145px')
    expect(preview({ placement: { side: 'left', above: true, nudge: 46 } })).toContain('bottom:calc(100% - 134px)')
  })

  it('with no room beside the card, sits inside the column\'s right edge so it is not clipped away', () => {
    const html = preview({ placement: { side: 'inside', above: false } })
    expect(html).toContain('right:8px')
    expect(html).not.toContain('calc(100% + 8px)')
    expect(html).toContain('top:120px')
    expect(preview({ placement: { side: 'inside', above: true } })).toContain('bottom:calc(100% - 180px)')
  })
})
