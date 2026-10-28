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
  const entry = section.startsWith('#') || section.startsWith('?') ? `/loyalty/program${section}` : `/loyalty/program${programSearch(section as ProgramSection)}`
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[entry]}>
        <LoyaltyContext.Provider value={{ data: boot(c), isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <ProgramPage />
        </LoyaltyContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
/** Every section, one after the other, as a manager or staff would page through them. */
const everySection = (c: Can, data: Program = program) => PROGRAM_SECTIONS.map(section => render(c, data, section)).join('')

describe('Program (spec 2026-10-21 §4.5, §5)', () => {
  it('shows the ladder in order with what reaches each tier, its earn rate, members, state and benefits', () => {
    const html = render(can())
    const words = text(html)
    expect(html.indexOf('data-tier="1"')).toBeLessThan(html.indexOf('data-tier="2"'))
    expect(words).toContain('1,000 Points to reach')
    expect(words).toContain('5 Nights to reach')
    expect(words).toContain('Earn rate ×1.5')
    expect(words).toContain('1,200 members')
    expect(words).toContain('Switched off')
    // The wording when there is one — never the typed value beside it too (that stays in the chip's tip).
    expect(words).toContain('Late checkout · Until 2 pm')
    expect(html).toContain('href="/loyalty?tier=2"')
    expect(words).toContain('This tier gives no benefit yet.')
    // The ladder's steps are numbered on the rail; a tier in use wears no pill, only one switched off does.
    expect(words).not.toContain('In use')
    expect(html.match(/class="l-rd-tier-card"/g)).toHaveLength(2)
  })

  it('names the catalogue\'s categories and ways of giving, and shows a value it has no word for as sent', () => {
    const words = text(render(can(), program, 'benefits'))
    expect(words).toContain('Category Accommodation')
    expect(text(render(can(), program, '?tab=benefits&selected=8'))).toContain('Category spa')
    // Release 10 (the owner's Benefit library): which tiers give each one, or that none does yet.
    expect(words).toContain('Late checkout On request Gold Active')
    expect(words).toContain('Spa ritual Voucher No levels assigned Switched off')
  })

  it('shows boosts on the venue\'s clock with their days, tiers and state', () => {
    const html = render(can(), program, 'boosts')
    const words = text(html)
    expect(words).toContain('Oct 24, 10:00 – Oct 25, 23:59 · Sat, Sun')
    expect(words).toContain('Upcoming')
    expect(words).toContain('Ended')
    expect(words).toContain('Every day')
    expect(words).toContain('Every tier')
    expect(html).toMatch(/data-boost="3"[\s\S]*?data-tier-chip[^>]*>[\s\S]*?Gold/)
  })

  it('gives a manager every action', () => {
    const words = text(everySection(can({ manage_program: true })))
    for (const action of ['+ Add level', 'Edit level', 'Add benefit', 'Edit benefit', 'Add boost', 'Edit Double weekend', 'Remove Double weekend']) {
      expect(words).toContain(action)
    }
    const html = everySection(can({ manage_program: true }))
    expect(html).toContain('aria-label="Edit level Gold"')
    expect(html).toContain('aria-label="Add benefit Gold"')
    expect(html).toContain('aria-label="More Gold"')
    // A catalogue entry is switched on and off by its switch, which says its state.
    expect(html).toContain('aria-label="More"') // Selected benefit menu: rename, active state and delete; browser tested.
    // Codes are the system's, not shown in the list.
    expect(words).not.toContain('LATE')
    expect(words).not.toContain('Only an owner or a manager can change the programme.')
  })

  it('shows staff everything, read-only, and says why', () => {
    const html = everySection(can({ manage_rewards: true }))
    const words = text(html)
    expect(words).toContain('Only an owner or a manager can change the programme.')
    expect(words).toContain('Late checkout · Until 2 pm')
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
    expect(html).toMatch(/data-boost="3"[\s\S]*data-time-check=""[\s\S]*data-boost="4"/)
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

  it('is one section at a time, chosen on its card in its colour and kept in the address (release 10, the owner\'s Figma)', () => {
    const html = render(can())
    expect(html).toContain('id="program-tiers"')
    expect(text(html)).toContain('How members move up')
    expect(html).not.toContain('data-benefit="7"')
    expect(html).not.toContain('data-boost="3"')
    const benefits = render(can(), program, 'benefits')
    expect(text(benefits)).toContain('Membership benefits')
    expect(benefits).toContain('data-record="benefit-7"')
    expect(text(benefits)).toContain('Create a benefit once, then choose what each level receives.')
    expect(benefits).not.toContain('data-tier="1"')
    expect(benefits).not.toContain('data-boost="3"')
    // An unknown section is Tiers; #places, the address Scan and the Guide opened before, is Places.
    expect(render(can(), program, '?tab=nothing')).toContain('id="program-tiers"')
    expect(render(can(), program, '#places')).toMatch(/id="program-section-places" aria-selected="true"/)
  })

  it('opens Tiers with the ladder in figures, the catalogue one press away', () => {
    const html = render(can())
    const words = text(html)
    expect(words).toContain('1 active levels · 1,230 active members')
    expect(words).toContain('Benefit catalogue →')
    expect(words).toContain('Switched off')
  })

  it('teaches an empty section how to start, with the action for a manager and who has it for anyone else (the owner\'s 163:322, 163:400)', () => {
    const empty: Program = { ...program, tiers: [], benefits: [], boosts: [] }
    const tiers = render(can({ manage_program: true }), empty)
    expect(tiers).toMatch(/data-get-started="tiers" data-hue="tier"/)
    expect(text(tiers)).toContain('Get started Add your first tier')
    expect(text(tiers)).toContain('1 Name it Members see the name on their card and in the app. 2 Set what reaches it')
    expect(text(tiers).match(/\+ Add level/g)).toHaveLength(1)
    const benefits = text(render(can({ manage_program: true }), empty, 'benefits'))
    expect(benefits).toContain('Create a benefit, then assign it to a level.')
    expect(benefits).toContain('+ Add benefit')
    // A boost is optional, and comes with an example in figures.
    const boosts = render(can({ manage_program: true }), empty, 'boosts')
    expect(boosts).toMatch(/data-get-started="boosts" data-hue="gift"/)
    expect(text(boosts)).toContain('Optional Give members a reason to come back')
    expect(text(boosts)).toContain('Example Double-points weekend 100 → 200 points ×2 boost · Saturday and Sunday')
    expect(text(boosts)).toContain('Add boost')
    // Staff read the same steps, and who sets it up.
    const staff = text(render(can(), empty, 'boosts'))
    expect(staff).toContain('Give members a reason to come back')
    expect(staff).toContain('An owner or a manager sets this up.')
    expect(staff).not.toContain('Add boost')
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
    expect(benefits).toMatch(/data-advice="benefit_unused" data-level="tip" data-hue="rule"/)
    expect(text(benefits)).toContain('No tier gives Spa ritual yet Members have a benefit only once a tier gives it.')
    expect(text(benefits)).toContain('Go to Tiers')
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
