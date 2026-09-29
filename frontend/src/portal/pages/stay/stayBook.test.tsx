import { describe, expect, it, vi } from 'vitest'
import { render, renderAsync } from '../book/testUtils'
import { DatesStep } from './DatesStep'
import { RoomStep } from './RoomStep'
import { StayBook } from './StayBook'
import { initialStayState } from './staySteps'
import { availability, stayCatalogue, stayVenue } from './stayTestUtils'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const vars = typeof fallback === 'object' ? fallback : opts
      let text = typeof fallback === 'string' ? fallback : k
      for (const [key, v] of Object.entries(vars ?? {})) text = text.replace(`{{${key}}}`, String(v))
      return text
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../lib/portalApi', async () => {
  const actual = await vi.importActual<typeof import('../../lib/portalApi')>('../../lib/portalApi')
  const never = () => new Promise(() => {})
  return { ...actual, portalApi: { ...actual.portalApi, stayCatalogue: never, stayAvailability: never, stayQuote: never, stayPaymentIntent: never, stayConfirm: never, offers: never, redemptions: never } }
})

const noop = () => {}
const picked = { ...initialStayState, checkIn: '2026-10-10', checkOut: '2026-10-12' }

describe('StayBook', () => {
  it('says so when the venue sells no stays online', () => {
    const html = render(<StayBook />, { ...stayVenue, capabilities: { ...stayVenue.capabilities, stays: false } })
    expect(html).toContain('Online booking is not available for this venue yet.')
  })

  it('starts on the dates, with the four steps named', () => {
    const html = render(<StayBook />, stayVenue, c => c.setQueryData(['portal-stay-catalogue'], stayCatalogue), '/portal/book/stay')
    expect(html).toContain('Book a stay')
    for (const label of ['Dates', 'Room', 'Review', 'Pay']) expect(html).toContain(label)
    expect(html).toMatch(/<h2[^>]*tabindex="-1"[^>]*data-step-heading="dates"/)
    expect(html).toContain('10% off stays applied')
  })

  it('offers a retry when the rooms cannot be loaded', async () => {
    const html = await renderAsync(<StayBook />, stayVenue, async c => {
      await c.prefetchQuery({ queryKey: ['portal-stay-catalogue'], queryFn: () => Promise.reject(new Error('down')), retry: false })
    }, '/portal/book/stay')
    expect(html).toContain('Something went wrong. Please try again.')
    expect(html).toContain('Try again')
  })
})

describe('DatesStep', () => {
  it('asks for both dates and the party, and holds the search back until the dates are chosen', () => {
    const html = render(<DatesStep state={initialStayState} rules={stayCatalogue.rules} timezone="Europe/Riga" onDates={noop} onGuests={noop} onSearch={noop} />, stayVenue)
    expect(html).toContain('Arrival')
    expect(html).toContain('Departure')
    expect(html).toContain('Adults')
    expect(html).toContain('Children')
    expect(html).toMatch(/<input[^>]*type="date"[^>]*min="\d{4}-\d{2}-\d{2}"/)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>See rooms/)
    expect(html).toContain('Choose your arrival and departure dates.')
  })

  it('counts the nights and lets the member search once the dates fit', () => {
    const html = render(<DatesStep state={picked} rules={stayCatalogue.rules} timezone="Europe/Riga" onDates={noop} onGuests={noop} onSearch={noop} />, stayVenue)
    expect(html).toContain('Nights: 2')
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>See rooms/)
  })

  it('names the venue\'s own limit when the stay is too short or too long', () => {
    const short = render(<DatesStep state={picked} rules={{ ...stayCatalogue.rules, min_nights: 3 }} timezone="Europe/Riga" onDates={noop} onGuests={noop} onSearch={noop} />, stayVenue)
    expect(short).toContain('The shortest stay here is 3 nights.')
    expect(short).toMatch(/<button[^>]*disabled=""[^>]*>See rooms/)
    const long = render(<DatesStep state={{ ...picked, checkOut: '2026-10-30' }} rules={{ ...stayCatalogue.rules, max_nights: 14 }} timezone="Europe/Riga" onDates={noop} onGuests={noop} onSearch={noop} />, stayVenue)
    expect(long).toContain('The longest stay you can book online is 14 nights.')
  })

  it('the departure cannot be before the day after the arrival', () => {
    const html = render(<DatesStep state={picked} rules={stayCatalogue.rules} timezone="Europe/Riga" onDates={noop} onGuests={noop} onSearch={noop} />, stayVenue)
    expect(html).toContain('min="2026-10-11"')
  })
})

describe('RoomStep', () => {
  const key = ['portal-stay-availability', '2026-10-10', '2026-10-12', 2, 0]

  it('lists the free rooms with the price a night, the total and the member\'s own total', () => {
    const html = render(<RoomStep state={picked} onPick={noop} onChangeDates={noop} />, stayVenue, c => c.setQueryData(key, availability))
    expect(html).toContain('Sea view')
    expect(html).toContain('A balcony over the bay')
    expect(html).toContain('Sleeps 2')
    expect(html).toContain('Garden')
    expect(html).toContain('Sleeps 3')
    expect(html).toMatch(/line-through[^>]*>.*200/s)
    expect(html).toContain('180')
    expect(html).toMatch(/<h2[^>]*tabindex="-1"[^>]*data-step-heading="room"/)
  })

  it('strikes no price through when the member pays the list price', () => {
    const html = render(<RoomStep state={picked} onPick={noop} onChangeDates={noop} />, stayVenue, c => c.setQueryData(key, { ...availability, rooms: [availability.rooms[1]] }))
    expect(html).not.toContain('line-through')
  })

  it('says when nothing is free and offers other dates', () => {
    const html = render(<RoomStep state={picked} onPick={noop} onChangeDates={noop} />, stayVenue, c => c.setQueryData(key, { rooms: [], nights: 2, party_too_large: false }))
    expect(html).toContain('No rooms are free for these dates.')
    expect(html).toContain('Change dates')
  })

  it('tells a party too large for any room to contact the venue, with the venue\'s contact', () => {
    const html = render(<RoomStep state={{ ...picked, adults: 5 }} onPick={noop} onChangeDates={noop} />, stayVenue, c => c.setQueryData(['portal-stay-availability', '2026-10-10', '2026-10-12', 5, 0], { rooms: [], nights: 2, party_too_large: true }))
    expect(html).toContain('No single room fits your party. Please contact Seaside Hotel and we will arrange it.')
    expect(html).toContain('href="mailto:hello@seaside.test"')
    expect(html).not.toContain('No rooms are free for these dates.')
  })

  it('shows the price a night, muted, under the total', () => {
    // Room 102 in the fixture isn't discounted (member_total === total_price), so its per-night line is
    // the list rate exactly as given — 90.
    const html = render(<RoomStep state={picked} onPick={noop} onChangeDates={noop} />, stayVenue, c => c.setQueryData(key, { ...availability, rooms: [availability.rooms[1]] }))
    expect(html).toMatch(/90[^<]*a night/)
  })

  it("a discounted room's per-night line agrees with the member's own total, not the list rate", () => {
    // Room 101: list rate 100 a night, but a 200/180 discount over 2 nights — the line must say 90, the
    // member's own total spread over the stay, never 100, which would contradict the 180 shown above it.
    const html = render(<RoomStep state={picked} onPick={noop} onChangeDates={noop} />, stayVenue, c => c.setQueryData(key, { ...availability, rooms: [availability.rooms[0]] }))
    expect(html).toMatch(/90[^<]*a night/)
    expect(html).not.toMatch(/100[^<]*a night/)
  })

  it('a room with no nightly rate and no discount shows no per-night line', () => {
    const html = render(<RoomStep state={picked} onPick={noop} onChangeDates={noop} />, stayVenue, c => c.setQueryData(key, { ...availability, rooms: [{ ...availability.rooms[1], price_per_night: 0 }] }))
    expect(html).not.toContain('a night')
  })

  it('shows a skeleton while loading and a retry when the search fails', async () => {
    expect(render(<RoomStep state={picked} onPick={noop} onChangeDates={noop} />, stayVenue)).not.toContain('Sea view')
    const html = await renderAsync(<RoomStep state={picked} onPick={noop} onChangeDates={noop} />, stayVenue, async c => {
      await c.prefetchQuery({ queryKey: key, queryFn: () => Promise.reject({ response: { status: 422, data: { error: 'invalid_stay' } } }), retry: false })
    })
    expect(html).toContain('Those dates cannot be booked online.')
    expect(html).toContain('Change dates')
  })
})
