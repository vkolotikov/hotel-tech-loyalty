import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : String(fallback?.defaultValue ?? key)
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {}, resolveImage: (url: string | null | undefined) => url ?? null }))

import { LoyaltyContext } from '../LoyaltyProvider'
import type { Bootstrap, MemberRow } from '../lib/types'
import { ContextPicker } from './ContextPicker'
import { ScannedCard } from './ScannedCard'
import { NfcPanel, ScanPage, ScanTroubleNotice } from './ScanPage'
import type { EventRow, PlaceRow } from './scanApi'
import { resolveContext } from './scanContext'
import { cameraAttempt, fieldAttempt, nfcAttempt } from './scanMath'
import { TodayHere } from './TodayHere'
import type { Today } from './useToday'
import { answerVerdict, failureVerdict, type VerdictFacts } from './verdict'
import { Announcer, VerdictCard } from './VerdictCard'

const boot: Bootstrap = {
  name: 'HexaTech Loyalty',
  organization: { id: 1, name: 'Lumière', industry: 'hotel' },
  accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-21', currency: 'EUR' },
  features: { campaigns: true, wallet: true, push: true },
  staff: { id: 5, name: 'Ada', role: 'staff', can: { award: true, redeem: true, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false } },
  programme: { on: true, tiers: [] },
  counts: { members: 40, requests_waiting: 2 },
}

function render(node: ReactElement, at = '/loyalty/scan') {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[at]}>
        <LoyaltyContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}>{node}</LoyaltyContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

const member = (over: Partial<MemberRow> = {}): MemberRow => ({
  id: 7, name: 'Ada Lovelace', email: null, phone: null, member_number: 'LS-001007', tier_id: null, points: 1200, lifetime_points: 3000,
  is_active: true, joined_at: null, last_activity_at: null, ...over,
})
const places: PlaceRow[] = [
  { id: 3, name: 'VIP lounge', admits: 'tiers', tiers: [], is_active: true },
  { id: 4, name: 'Spa', admits: 'all', tiers: [], is_active: true },
]
const events: EventRow[] = [{ id: 5, title: 'Wine tasting', starts_at: '2026-10-21T18:00', ends_at: '2026-10-21T23:00', place: null, location: null, status: 'published' }]
const facts: VerdictFacts = { locale: 'en', today: '2026-10-21', nowWall: '2026-10-21T19:00', timeZone: 'Europe/Riga' }

describe('the Scan page (release 5)', () => {
  it('keeps readers behind an explicit start and provides manual lookup and options', () => {
    const html = render(<ScanPage />), words = text(html)
    for (const label of ['Camera', 'Start camera', 'Options', 'Find member manually']) expect(words).toContain(label)
    expect(html).not.toContain('<video')
    expect(html).not.toMatch(/<input[^>]*autofocus/i)
    expect(words).not.toContain('Hold the card')
  })

  it('says plainly where NFC does not work, and what NFC is doing where it does', () => {
    expect(text(render(<NfcPanel state="unsupported" onStart={() => {}} onStop={() => {}} />)))
      .toContain('NFC works in Chrome on Android phones and tablets; on this device scan the QR code or type the number.')
    const listening = text(render(<NfcPanel state="listening" onStart={() => {}} onStop={() => {}} />))
    expect(listening).toContain('Hold the card flat against the back of the phone or tablet.')
    expect(listening).toContain('Stop NFC')
    expect(listening).not.toContain('Try NFC again')
    const denied = text(render(<NfcPanel state="denied" onStart={() => {}} onStop={() => {}} />))
    expect(denied).toContain('NFC is blocked for this site.')
    expect(denied).toContain('Try NFC again')
    expect(text(render(<NfcPanel state="off" onStart={() => {}} onStop={() => {}} />))).toContain('Turn NFC on in the device’s settings')
  })

  it('a card nobody has offers "Link this card"; one switched off says so and offers it too', () => {
    const tap = nfcAttempt('04:a2:b3:c4', [])!
    const unknown = text(render(<ScanTroubleNotice failure={{ status: 404, code: 'not_found', extra: {} }} attempt={tap} onLink={() => {}} />))
    expect(unknown).toContain('No member has this card yet.')
    expect(unknown).toContain('Link this card')

    const off = text(render(<ScanTroubleNotice failure={{ status: 404, code: 'inactive', extra: { card: 'off' } }} attempt={tap} onLink={() => {}} />))
    expect(off).toContain('This card was switched off.')
    expect(off).toContain('Link this card')
  })

  it('any other refusal says the scan’s own words and offers no link', () => {
    const number = text(render(<ScanTroubleNotice failure={{ status: 404, code: 'not_found', extra: {} }} attempt={fieldAttempt('LS-999999')} onLink={() => {}} />))
    expect(number).toContain('No member has this card or number.')
    expect(number).not.toContain('Link this card')

    const expired = text(render(<ScanTroubleNotice failure={{ status: 404, code: 'expired', extra: {} }} attempt={cameraAttempt('x')} onLink={() => {}} />))
    expect(expired).toContain('This QR code has expired.')
    expect(expired).not.toContain('Link this card')
  })
})

describe('Scanning for (release 8 §2)', () => {
  it('opens on the desk: pressed, no door mode and no "Today here"', () => {
    const html = render(<ScanPage />)
    const words = text(html)
    expect(words).toContain('Desk mode')
    expect(words).toContain('Options')
    expect(words).not.toContain('Door mode')
    expect(words).not.toContain('Today here')
    // The announcement region is there, silent until a verdict.
    expect(html).toMatch(/aria-live="assertive" aria-atomic="true"><\/p>/)
  })

  it('an address that names a place (an event’s Start check-in names its event) chooses it: door mode, "Today here", the verdict announced', () => {
    const html = render(<ScanPage />, '/loyalty/scan?place=3')
    const words = text(html)
    expect(words).toContain('Door check')
    expect(words).toContain('Options')
    expect(words).toContain('Today here')
    expect(html).toContain('aria-live="assertive"')
    expect(text(render(<ScanPage />, '/loyalty/scan?event=5'))).toContain('Today here')
  })

  it('lists the desk, each place and each event open today in one row, the kinds named for a screen reader, the chosen one pressed', () => {
    const resolved = resolveContext({ kind: 'place', id: 3 }, places, events)
    const html = render(<ContextPicker resolved={resolved} onChoose={() => {}} choices={{ places, events, loading: false, failed: false, canSetUp: true }} />)
    const words = text(html)
    for (const choice of ['Desk', 'VIP lounge', 'Spa', 'Wine tasting', '18:00–23:00']) expect(words).toContain(choice)
    // No headings on screen: the icons say the kind; the groups keep their names for a screen reader.
    expect(words).not.toContain('Events today')
    expect(html).toContain('role="group" aria-label="Places"')
    expect(html).toContain('role="group" aria-label="Events today"')
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*?VIP lounge/)
    expect(html).toContain('href="/loyalty/scan/door?place=3"')
    expect(words).not.toContain('Set up places')

    const atEvent = render(<ContextPicker resolved={resolveContext({ kind: 'event', id: 5 }, places, events)} onChoose={() => {}} choices={{ places, events, loading: false, failed: false, canSetUp: false }} />)
    expect(atEvent).toMatch(/aria-pressed="true"[^>]*>.*?Wine tasting/)
  })

  it('offers a manager "Set up places" when there are none; says so when the lists could not be loaded', () => {
    const none = { places: [], events: [], loading: false, failed: false, canSetUp: true }
    const html = render(<ContextPicker resolved={resolveContext({ kind: 'desk' }, [], [])} onChoose={() => {}} choices={none} />)
    expect(html).toContain('href="/loyalty/program?tab=places"')
    expect(text(html)).toContain('Set up places')
    expect(text(render(<ContextPicker resolved={resolveContext({ kind: 'desk' }, [], [])} onChoose={() => {}} choices={{ ...none, canSetUp: false }} />))).not.toContain('Set up places')
    const failed = text(render(<ContextPicker resolved={resolveContext({ kind: 'desk' }, undefined, undefined)} onChoose={() => {}} choices={{ ...none, places: undefined, events: undefined, failed: true }} />))
    expect(failed).toContain('Places and events could not be loaded.')
  })
})

describe('the verdict on the scan page', () => {
  it('a welcome: the green band with its icon and words, then the member, tier, number, end date and benefits', () => {
    const view = answerVerdict({
      member: member(),
      verdict: { granted: true, reason: 'welcome', valid_until: '2027-10-03', expires_in_days: null, tier: { id: 2, name: 'Silver', color: '#9ca3af' }, allowed_tiers: [], place: { id: 3, name: 'VIP lounge' } },
      benefits: [{ name: 'Lounge access', value: null, category: 'access' }],
    }, facts)
    const html = render(<VerdictCard view={view} />)
    const words = text(html)
    expect(html).toContain('data-tone="granted"')
    expect(html).toContain('<svg')
    // The band says "Welcome"; the name is written once, beneath it, with the member's initials.
    expect(words).toContain('Welcome')
    expect(words).not.toContain('Welcome, Ada')
    expect(words.match(/Ada/g)).toHaveLength(1)
    expect(words).toContain('AL')
    expect(html).toContain('href="/loyalty/members/7"')
    expect(words).toContain('Silver')
    expect(words).toContain('LS-001007')
    expect(words).toMatch(/Valid until .*2027/)
    expect(words).toContain('Lounge access')
  })

  it('a refusal: red, "No access" and why, still with the member', () => {
    const view = answerVerdict({
      member: member(),
      verdict: { granted: false, reason: 'tier_not_allowed', valid_until: null, expires_in_days: null, tier: { id: 2, name: 'Silver', color: '#9ca3af' }, allowed_tiers: ['Gold', 'Platinum'] },
    }, facts)
    const words = text(render(<VerdictCard view={view} />))
    expect(words).toContain('No access')
    expect(words).toContain('Gold and Platinum only — Ada is Silver.')
    expect(words).toContain('Ada Lovelace')
    expect(render(<VerdictCard view={view} />)).toContain('data-tone="denied"')
    // At a closed door the tier's benefits are beside the point.
    const withBenefits = answerVerdict({ member: member(), verdict: { granted: false, reason: 'expired', valid_until: '2026-10-01', expires_in_days: null, tier: null, allowed_tiers: [] }, benefits: [{ name: 'Lounge access', value: null, category: 'access' }] }, facts)
    expect(text(render(<VerdictCard view={withBenefits} />))).not.toContain('Lounge access')
  })

  it('a code that names nobody: "Card not recognised" with no member; the announcement says the band', () => {
    const view = failureVerdict({ status: 404, code: 'not_found', extra: {} })
    const html = render(<VerdictCard view={view} />)
    expect(text(html)).toContain('Card not recognised')
    expect(text(html)).toContain('No member has this card or number.')
    expect(html).not.toContain('/loyalty/members/')
    const said = render(<Announcer view={view} />)
    expect(said).toContain('aria-live="assertive"')
    expect(text(said)).toContain('Card not recognised. No member has this card or number.')
  })

  it('at an event: "Signed up" or "Walk-in", "Already checked in at 19:02", "+50 points"', () => {
    const view = answerVerdict({
      member: member(), checked_in: false, already_in: '19:02', signed_up: false, points: 50,
      verdict: { granted: true, reason: 'welcome', valid_until: null, expires_in_days: null, tier: null, allowed_tiers: [], event: { id: 5, title: 'Wine tasting' } },
    }, { ...facts, event: events[0] })
    const words = text(render(<VerdictCard view={view} />))
    for (const fact of ['Already checked in at 19:02', 'Walk-in', '+50 points', 'No tier']) expect(words).toContain(fact)
  })
})

describe('Today here', () => {
  const today = (over: Partial<Today>): Today => ({ lines: [], counts: null, isLoading: false, isError: false, ...over })
  it('a place’s numbers and its latest entries, let in or why not', () => {
    const html = render(<TodayHere locale="en" today={today({
      counts: { kind: 'place', granted: 23, denied: 2 },
      lines: [
        { id: 'entry-2', time: '19:05', name: 'Ada Lovelace', number: 'LS-001007', granted: true, label: { key: 'loyalty.door.entry.welcome', fallback: 'Let in' } },
        { id: 'entry-1', time: '19:01', name: '', number: null, granted: false, label: { key: 'loyalty.door.entry.card_unknown', fallback: 'Card not recognised' } },
      ],
    })} />)
    const words = text(html)
    for (const part of ['Today here', 'Let in: 23 Refused: 2', '19:05', 'Ada Lovelace', 'LS-001007', 'Let in', '19:01', 'No member', 'Card not recognised']) expect(words).toContain(part)
  })

  it('an event’s numbers; nobody yet; loading; a list that could not be loaded', () => {
    expect(text(render(<TodayHere locale="en" today={today({ counts: { kind: 'event', checkedIn: 12, signedUp: 30, walkIns: 3, roomLeft: 8 } })} />)))
      .toContain('Checked in: 12 Signed up: 30 Walk-ins: 3 Places left: 8')
    expect(text(render(<TodayHere locale="en" today={today({ counts: { kind: 'event', checkedIn: 0, signedUp: 0, walkIns: 0, roomLeft: null } })} />)))
      .toContain('Nobody scanned in yet today.')
    expect(render(<TodayHere locale="en" today={today({ isLoading: true })} />)).toContain('animate-pulse')
    expect(text(render(<TodayHere locale="en" today={today({ isError: true })} />))).toContain('Today’s list could not be loaded.')
  })
})

describe('the desk’s card keeps releases 5–7 and adds the membership’s end', () => {
  it('Award, Redeem, Open member, and "Valid until" when the row carries an end date', () => {
    const words = text(render(<ScannedCard member={member({ valid_until: '2027-10-03', membership_state: 'active' })} />))
    for (const part of ['Ada Lovelace', 'LS-001007', 'Award points', 'Redeem points', 'Open member']) expect(words).toContain(part)
    expect(words).toMatch(/Valid until .*2027/)
    expect(text(render(<ScannedCard member={member()} />))).not.toContain('Valid until')
    expect(text(render(<ScannedCard member={member({ valid_until: '2026-10-03', membership_state: 'expired' })} />))).toContain('Membership ended on')
  })
})
