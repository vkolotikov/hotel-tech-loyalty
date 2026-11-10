import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {}, resolveImage: (url: string | null | undefined) => url ?? null }))

import { LoyaltyContext } from '../LoyaltyProvider'
import type { Bootstrap, Can } from '../lib/types'
import { PROGRAM_KEY } from './api'
import { BoostDialog } from './BoostDialog'
import { TierDialog } from './TierDialog'
import { ConfirmTimes, ProgramPage } from './ProgramPage'
import { MembershipBenefitsPage } from '../rewards/design/MembershipBenefitsPage'
import { PROGRAM_SECTIONS, programSearch, type ProgramSection } from './programMath'
import type { Program } from './types'

const can = (more: Partial<Can> = {}): Can => ({ award: true, redeem: true, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false, ...more })
const boot = (c: Can): Bootstrap => ({
  name: 'HexaTech Loyalty',
  organization: { id: 1, name: 'Lumière', industry: 'hotel' },
  accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-21', currency: 'EUR' },
  features: { campaigns: true, wallet: true, push: true },
  staff: { id: 5, name: 'Ada', role: c.manage_program ? 'manager' : 'staff', can: c },
  programme: { on: true, tiers: [{ id: 1, name: 'Silver', color: '#9aa4b1', min_points: 0, is_active: true }, { id: 2, name: 'Gold', color: '#c9a227', min_points: 1000, is_active: true }] },
  counts: { members: 40, requests_waiting: 2 },
})
const program: Program = {
  tiers: [
    { id: 1, name: 'Silver', description: null, color: '#9aa4b1', min_points: 0, min_nights: null, min_stays: null, min_spend: null, earn_rate: 1, is_active: true, sort_order: 1, members: 30, benefits: [] },
    {
      id: 2, name: 'Gold', description: 'Our best guests.', color: '#c9a227', min_points: 1000, min_nights: 5, min_stays: null, min_spend: null, earn_rate: 1.5,
      is_active: false, sort_order: 2, members: 1200,
      benefits: [{ id: 9, benefit_id: 7, name: 'Late checkout', category: 'accommodation', value: 'Until 2 pm', value_type: 'percent_discount', value_amount: 10, applies_to: 'stays' }],
    },
  ],
  benefits: [
    { id: 7, name: 'Late checkout', code: 'LATE', description: null, category: 'accommodation', fulfillment_mode: 'on_request', is_active: true, sort_order: 0 },
    { id: 8, name: 'Spa ritual', code: 'SPA', description: null, category: 'spa', fulfillment_mode: 'voucher', is_active: false, sort_order: 1 },
  ],
  boosts: [
    { id: 3, name: 'Double weekend', description: null, multiplier: 2, starts_at: '2026-10-24T07:00:00+00:00', ends_at: '2026-10-25T21:59:00+00:00', days_of_week: [6, 0], tier_ids: [2], is_active: true, state: 'upcoming' },
    { id: 4, name: 'Summer', description: null, multiplier: 1.5, starts_at: '2026-06-01T00:00:00+00:00', ends_at: '2026-08-31T00:00:00+00:00', days_of_week: null, tier_ids: null, is_active: true, state: 'ended' },
  ],
  options: { categories: ['accommodation', 'other'], fulfillment_modes: ['on_request', 'voucher'], value_types: ['text', 'percent_discount'], applies_to: ['all', 'stays'] },
}

// Release 10: one section at a time, chosen in the address (`?tab=`); Tiers when none is named.
const render = (c: Can, data: Program | null = program, section: ProgramSection | string = 'tiers') => {
  const client = new QueryClient()
  if (data) client.setQueryData(PROGRAM_KEY, data)
  const catalogue = section === 'benefits' || section.includes('tab=benefits')
  const entry = catalogue ? '/loyalty/rewards?tab=benefits' + (section.includes('selected=8') ? '&selected=8' : '') : section.startsWith('#') || section.startsWith('?') ? `/loyalty/program${section}` : `/loyalty/program${programSearch(section as ProgramSection)}`
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <LoyaltyContext.Provider value={{ data: boot(c), isLoading: false, isError: false, error: null, refetch: () => {} }}>
          {catalogue ? <MembershipBenefitsPage /> : <ProgramPage />}
        </LoyaltyContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
/** Every section, one after the other, as a manager or staff would page through them. */
const everySection = (c: Can, data: Program = program) => PROGRAM_SECTIONS.map(section => render(c, data, section)).join('') + render(c, data, 'benefits')

describe('Program (spec 2026-10-21 §4.5, §5)', () => {
  it('shows the ordered path and the selected tier’s real thresholds, rate, members and perks', () => {
    const html = render(can(), program, '?tab=tiers&selected=2'), words = text(html)
    expect(html.indexOf('data-record="tier-1"')).toBeLessThan(html.indexOf('data-record="tier-2"'))
    for (const value of ['1,000 Points to reach', '5 Nights to reach', '×1.5', '1,200 members', 'Switched off', 'Late checkout', '10% off']) expect(words).toContain(value)
    expect(html).toContain('href="/loyalty?tier=2"')
    expect(html).toContain('id="management-detail"')
    expect(text(render(can()))).toContain('No perks assigned yet.')
  })


  it('keeps catalogue categories and delivery while flagging inactive-only assignments', () => {
    const words = text(render(can(), program, 'benefits'))
    expect(words).toContain('Category Accommodation')
    expect(text(render(can(), program, '?tab=benefits&selected=8'))).toContain('Category spa')
    for (const value of ['Late checkout', 'On request', 'Gold', 'Needs assignment', 'Spa ritual', 'Voucher', 'Switched off']) expect(words).toContain(value)
  })

  it('keeps an existing perk assignment editable after the perk is switched off', () => {
    const data = { ...program, benefits: program.benefits.map((benefit, index) => index === 0 ? { ...benefit, is_active: false } : benefit) }
    const html = render(can({ manage_program: true }), data, 'benefits')
    const action = html.match(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*?Manage assignment(?:(?!<\/button>)[\s\S])*?<\/button>/)?.[0]
    expect(action).toBeDefined()
    expect(action).not.toContain('disabled=""')
  })


  it('shows boosts on the venue\'s clock with their days, tiers and state', () => {
    const html = render(can(), program, 'boosts')
    const words = text(html)
    expect(words).toContain('Oct 24, 10:00 → Oct 25, 23:59')
    expect(words).toContain('Sat, Sun')
    expect(words).toContain('Upcoming')
    expect(words).toContain('Ended')
    expect(html).not.toContain('data-boost="4"') // Ended events remain available through All statuses.
    expect(html).not.toContain('data-boost="4"') // Ended events remain available through All statuses.
    expect(html).toMatch(/data-boost="3"[\s\S]*?data-tier-chip[^>]*>[\s\S]*?Gold/)
  })

  it('offers one edit entrance per selected record, assignment and program actions to managers', () => {
    const html = everySection(can({ manage_program: true })), words = text(html)
    for (const action of ['Add level', 'Add perk', 'Add benefit', 'Add boost', 'Edit', 'Readiness checks', 'Guided setup']) expect(words).toContain(action)
    expect(html).toContain('aria-label="Edit Silver"')
    expect(html).toContain('aria-label="More"')
    expect(html).toContain('href="/loyalty/program/setup"')
    expect(words).not.toContain('LATE')
    expect(words).not.toContain('Only an owner or a manager can change the programme.')
  })


  it('shows staff everything, read-only, and says why', () => {
    const html = everySection(can({ manage_rewards: true }))
    const words = text(html)
    expect(words).toContain('Only an owner or a manager can change the programme.')
    expect(words).toContain('Late checkout')
    for (const action of ['Add tier', 'Edit', 'Add benefit', 'Switch off', 'Add boost', 'Remove']) expect(words).not.toContain(action)
    expect(html).not.toContain('Take Late checkout off Gold')
    // The only buttons are the section cards and the figure that leads to Benefits: nothing that changes anything.
    const buttons = [...html.matchAll(/<button[^>]*>/g)].map(m => m[0]).filter(b => !b.includes('role="tab"') && !b.includes('data-leads=""'))
    expect(html).not.toContain('Edit benefit')
    expect(buttons.length).toBeGreaterThan(1) // Read-only selection controls.
  })

  it('waits for the programme with a quiet stand-in', () => {
    expect(render(can(), null)).toContain('Loading…')
  })

  it('asks for a boost\'s times to be checked when they were saved before the fix, until it ends (R4-6)', () => {
    const flagged: Program = { ...program, boosts: program.boosts.map(b => ({ ...b, check_time: true })) }
    const html = render(can({ manage_program: true }), flagged, 'boosts')
    expect(html.match(/data-time-check=""/g)).toHaveLength(1)
    expect(html).toMatch(/data-boost="3"[\s\S]*data-time-check=""/)
    expect(text(html)).toContain('Check the time: saved before boost times were read on the venue’s clock everywhere. If it was last saved in the full admin')
    expect(render(can({ manage_program: true }), program, 'boosts')).not.toContain('data-time-check')
  })

  it('offers a manager "These times are right" for the boosts that ask for the check, and nobody else (release 6)', () => {
    const flagged: Program = { ...program, boosts: program.boosts.map(b => ({ ...b, check_time: true })) }
    const html = render(can({ manage_program: true }), flagged, 'boosts')
    expect(html.match(/data-time-check-all=""/g)).toHaveLength(1)
    expect(text(html)).toContain('Some boosts ask for their times to be checked. If the times shown are right, confirm them together. These times are right')
    expect(render(can(), flagged, 'boosts')).not.toContain('data-time-check-all')
    expect(render(can({ manage_program: true }), program, 'boosts')).not.toContain('data-time-check-all')
    // Only an ended boost is flagged: nothing to confirm.
    const ended: Program = { ...program, boosts: program.boosts.map(b => ({ ...b, check_time: b.state === 'ended' })) }
    expect(render(can({ manage_program: true }), ended, 'boosts')).not.toContain('data-time-check-all')
  })

  it('keeps levels, perks and places in distinct canonical homes', () => {
    const html = render(can())
    expect(html).toContain('data-record="tier-1"')
    expect(text(html)).toContain('Qualification')
    expect(html).not.toContain('data-record="benefit-7"')
    const benefits = render(can(), program, 'benefits')
    expect(text(benefits)).toContain('Tier perks')
    expect(benefits).toContain('data-record="benefit-7"')
    expect(benefits).not.toContain('data-record="tier-1"')
    expect(render(can(), program, '?tab=nothing')).toContain('data-record="tier-1"')
    expect(render(can(), program, '#places')).toContain('id="places" aria-labelledby="program-places"')
  })


  it('surfaces qualification, guided setup and readiness from Levels', () => {
    const html = render(can({ manage_program: true })), words = text(html)
    expect(words).toContain('1 active levels')
    expect(html).toContain('href="/loyalty/program?tab=tiers&amp;settings=qualification"')
    expect(html).toContain('href="/loyalty/program?tab=tiers&amp;checks=1"')
    expect(html).not.toContain('href="/loyalty/program?tab=benefits"')
  })


  it('gives an empty catalogue one useful creation action and retains the optional boost example', () => {
    const empty: Program = { ...program, tiers: [], benefits: [], boosts: [] }
    const tiers = text(render(can({ manage_program: true }), empty))
    expect(tiers.match(/Add level/g)).toHaveLength(1)
    expect(tiers).toContain('A tier is a level members reach')
    const benefits = text(render(can({ manage_program: true }), empty, 'benefits'))
    expect(benefits).toContain('Create a benefit, then assign it to a level.')
    expect(benefits).toContain('+ Add benefit')
    const boosts = text(render(can({ manage_program: true }), empty, 'boosts'))
    expect(boosts).toContain('Example Double-points weekend 100 → 200 points')
    expect(boosts).toContain('Add boost')
    expect(text(render(can(), empty, 'boosts'))).not.toContain('Add boost')
  })


  it('says what the ladder and the catalogue leave out, as the server found it (release 10, the owner\'s 163:88)', () => {
    const checked: Program = {
      ...program,
      advice: [
        { code: 'tiers_share_threshold', level: 'warn', params: { value: 0 }, tiers: [{ id: 1, name: 'Silver' }, { id: 2, name: 'Gold' }], benefits: [] },
        { code: 'benefit_unused', level: 'tip', params: { n: 1 }, tiers: [], benefits: [{ id: 8, name: 'Spa ritual' }] },
      ],
    }
    const tiers = render(can({ manage_program: true }), checked)
    expect(tiers).toMatch(/data-advice="tiers_share_threshold" data-level="warn" data-hue="gift"/)
    expect(text(tiers)).toContain('Several tiers start at the same figure Silver and Gold all start at 0 points: members reach only one of them by earning.')
    expect(text(tiers)).toContain('Open Silver Open Gold')
    // The ladder's warning waits on its card, in the waiting colour, instead of the tier count.
    expect(tiers.match(/data-advice="tiers_share_threshold"/g)).toHaveLength(1)
    // Staff read it, with nothing to press.
    expect(text(render(can(), checked))).not.toContain('Open Silver')
    const benefits = render(can(), checked, 'benefits')
    expect(text(benefits)).toContain('Needs a tier')
    expect(text(render(can({ manage_program: true }), checked, 'benefits'))).toContain('Assign to a level')
    // A ladder with nothing to check shows no banner and its count.
    expect(render(can({ manage_program: true }))).not.toContain('data-advice=')
  })

  it('shows the tier as members meet it, and its earn rate in figures (the owner\'s 163:166)', () => {
    const inDialog = (node: ReactNode) => renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <LoyaltyContext.Provider value={{ data: boot(can({ manage_program: true })), isLoading: false, isError: false, error: null, refetch: () => {} }}>{node}</LoyaltyContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const gold = inDialog(<TierDialog tier={program.tiers[1]} onClose={() => {}} />)
    expect(text(gold)).toContain('100 base points → 150 points earned')
    expect(gold).toContain('data-member-preview=""')
    expect(text(gold)).toContain('What members see Gold')
    expect(text(gold)).toContain('×1.5 points on what they spend')
    expect(text(gold)).toContain('Late checkout')
    const fresh = text(inDialog(<TierDialog tier={null} onClose={() => {}} />))
    expect(fresh).toContain('No benefit yet: add them on the tier’s card in the ladder.')
    const boost = text(inDialog(<BoostDialog boost={program.boosts[0]} tiers={program.tiers} onClose={() => {}} />))
    expect(boost).toContain('From 1 to 10. While it runs, 100 points become 200.')
  })

  it('lists the boosts to confirm with their times on the venue\'s clock (release 6)', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <ConfirmTimes boosts={[{ ...program.boosts[0], check_time: true }]} locale="en" timeZone="Europe/Riga" onClose={() => {}} />
      </QueryClientProvider>,
    )
    const words = text(html)
    expect(words).toContain('Are these times right?')
    expect(words).toContain('Check that each starts and ends as shown, on the venue’s clock (Europe/Riga). Confirming marks them as checked and changes no time')
    expect(html).toMatch(/data-time-check-boost="3"[\s\S]*Double weekend[\s\S]*Oct 24, 10:00 – Oct 25, 23:59/)
    expect(words).toContain('Not yet')
    expect(words).toContain('These times are right')
  })

  it('in the boost dialog: the time check, and the brand only when there is more than one, new or saved (release 4, 6)', () => {
    const inDialog = (node: ReactNode) => renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <LoyaltyContext.Provider value={{ data: boot(can({ manage_program: true })), isLoading: false, isError: false, error: null, refetch: () => {} }}>{node}</LoyaltyContext.Provider>
      </QueryClientProvider>,
    )
    const two = { list: [{ id: 1, name: 'Lumière Spa', is_default: true }, { id: 2, name: 'Lumière Hotel', is_default: false }], default: 1 }
    const flagged = text(inDialog(<BoostDialog boost={{ ...program.boosts[0], check_time: true, brand_id: 2 }} tiers={program.tiers} brands={two} onClose={() => {}} />))
    expect(flagged).toContain('Check these times: this boost was saved before boost times were read on the venue’s clock everywhere')
    expect(inDialog(<BoostDialog boost={{ ...program.boosts[0], brand_id: 2 }} tiers={program.tiers} brands={two} onClose={() => {}} />))
      .toMatch(/<select data-brand=""[^>]*><option value="1">Lumière Spa<\/option><option value="2" selected="">Lumière Hotel<\/option><\/select>/)
    expect(inDialog(<BoostDialog boost={null} tiers={program.tiers} brands={two} onClose={() => {}} />)).toContain('<select data-brand=""')
    const plain = inDialog(<BoostDialog boost={program.boosts[0]} tiers={program.tiers} onClose={() => {}} />)
    expect(plain).not.toContain('Check these times')
    expect(plain).not.toContain('data-brand')
  })
})
