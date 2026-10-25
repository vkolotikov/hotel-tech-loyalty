import { describe, expect, it, vi } from 'vitest'
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
import { answerFixture, presetFixture } from './fixture'
import { OPTIONS_KEY } from './optionsApi'
import { recommendedForm } from './optionsMath'
import { SetupWizard, Wizard, type WizardStart } from './SetupWizard'
import type { OptionsAnswer } from './types'

const can = (manager: boolean): Can => ({ award: true, redeem: true, reverse: manager, manage_program: manager, manage_rewards: false, manage_members: manager, view_insights: false, manage_campaigns: manager, manage_app: manager })
const boot: Bootstrap = {
  name: 'HexaTech Loyalty',
  organization: { id: 1, name: 'Lumière', industry: 'beauty' },
  accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-25', currency: 'EUR' },
  features: { campaigns: true, wallet: true, push: true },
  staff: { id: 5, name: 'Ada', role: 'manager', can: can(true) },
  programme: { on: false, tiers: [] },
  counts: { members: 0, requests_waiting: 0 },
}
const fresh = answerFixture({ catalogue: { tiers: 0, rewards: [], offers: 0, boosts: 0 } })

function render(answer: OptionsAnswer, start?: WizardStart) {
  const client = new QueryClient()
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/loyalty/options/setup']}>
        <LoyaltyContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <Wizard answer={answer} start={start} />
        </LoyaltyContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('the setup wizard (release 7 §1)', () => {
  it('shows four steps, the first current, with Next and Skip but no Back', () => {
    const html = render(fresh)
    const words = text(html)
    expect(words).toContain('Step 1 of 4')
    expect(html).toMatch(/data-step="business" aria-current="step"/)
    for (const step of ['Your business', 'Choose', 'Configure', 'Review']) expect(words).toContain(step)
    expect(words).toContain('Next')
    expect(words).toContain('Skip setup')
    expect(words).not.toContain(' Back ')
  })

  it('a new venue chooses a starting programme, its industry’s first, chosen and marked', () => {
    const html = render(fresh)
    const words = text(html)
    expect(html.indexOf('data-choice="beauty"')).toBeLessThan(html.indexOf('data-choice="hotel_classic"'))
    expect(html).toMatch(/data-choice="beauty" data-checked=""/)
    expect(words).toContain('Beauty and spa')
    expect(words).toContain('Suggested for your business')
    expect(words).toContain('Tiers: Welcome, Devotee, Inner Circle')
    expect(words).toContain('Rewards such as Brow Tidy, 10 Off Any Service')
    expect(words).not.toContain('Keep my tiers and rewards')
    expect(html).not.toMatch(/type="radio"[^>]*disabled=""/)
  })

  it('a venue with tiers keeps them, and sees the presets greyed with why', () => {
    const html = render(answerFixture())
    const words = text(html)
    expect(words).toContain('Keep my tiers and rewards')
    expect(words).toContain('Tiers: 3. Rewards in the catalogue: 2. Nothing in them changes.')
    expect(words).toContain('Starting programmes set up a new venue’s tiers only.')
    expect(html).toMatch(/data-choice="keep" data-checked=""/)
    expect((html.match(/type="radio"[^>]*disabled=""/g) ?? []).length).toBe(2)
  })

  it('step 2 ticks every way as the preset suggests, with what members get for the ticked ones', () => {
    const html = render(fresh, { step: 'choose', choice: 'beauty' })
    const words = text(html)
    expect(words).toContain('Ticked: what we suggest for Beauty and spa.')
    expect(html).toMatch(/data-tick="stamp_card" data-checked=""/)
    expect(html).not.toMatch(/data-tick="cashback" data-checked=""/)
    expect(words).toContain('A card holds 8 stamps; a full card gives 400 points.')
    expect(words).toContain('Back')
  })

  it('keeping the tiers ticks what the venue uses today', () => {
    const html = render(answerFixture(), { step: 'choose' })
    expect(text(html)).toContain('Ticked: what your programme uses today.')
    expect(html).toMatch(/data-tick="points_on_spend" data-checked=""/)
    expect(html).not.toMatch(/data-tick="stamp_card" data-checked=""/)
  })

  it('step 3 sets the ticked ways’ numbers, prefilled', () => {
    const html = render(fresh, { step: 'configure', choice: 'beauty' })
    expect(html).toContain('data-configure="stamp_card"')
    expect(html).not.toContain('data-configure="cashback"')
    expect(html).not.toContain('data-configure="desk_earn"')
    expect(html).toContain('value="8"')
    expect(text(html)).toContain('Stamps on a card')
  })

  it('step 4 says what members will get, what is left off and where it starts, then Apply', () => {
    const html = render(fresh, { step: 'review', choice: 'beauty' })
    const words = text(html)
    expect(words).toContain('Starts from Beauty and spa: the tiers Welcome, Devotee, Inner Circle and a first rewards catalogue.')
    expect(words).toContain('Members get 10 points for every €1 they spend.')
    expect(words).toContain('New members get 100 points when they join.')
    expect(words).toContain('Not used: Check-in, Earn at the desk, Cashback credit.')
    expect(words).toContain('Apply')
    expect(words).not.toContain('Next')
  })

  it('keeping the tiers says so in the review', () => {
    const form = recommendedForm(answerFixture(), null, answerFixture().options)
    const words = text(render(answerFixture(), { step: 'review', choice: 'keep', form }))
    expect(words).toContain('Your tiers and rewards stay as they are.')
    expect(words).toContain('Not used: Stamp card, Check-in, Earn at the desk, Cashback credit.')
  })

  it('warns when nothing is ticked', () => {
    const form = recommendedForm(fresh, presetFixture('beauty', true), fresh.options)
    for (const key of Object.keys(form)) form[key] = { ...form[key], on: false }
    expect(text(render(fresh, { step: 'review', choice: 'beauty', form }))).toContain('No way to earn is ticked')
  })

  it('says what it did once applied', () => {
    const built = text(render(fresh, { done: { preset: 'beauty', preset_applied: true, reason: null, summary: { tiers_added: 3, rewards_added: 5 }, completed_at: '2026-10-25T10:00:00+00:00', replayed: false } }))
    expect(built).toContain('Your programme is set up')
    expect(built).toContain('Tiers added: 3. Rewards added: 5.')
    const kept = text(render(answerFixture(), { done: { preset: null, preset_applied: false, reason: null, summary: null, completed_at: '2026-10-25T10:00:00+00:00', replayed: false } }))
    expect(kept).toContain('Your tiers and rewards stayed as they were')
  })

  it('tells anyone but a manager who sets it up', () => {
    const client = new QueryClient()
    client.setQueryData(OPTIONS_KEY, answerFixture({ can_change: false }))
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <LoyaltyContext.Provider value={{ data: { ...boot, staff: { ...boot.staff, role: 'staff', can: can(false) } }, isLoading: false, isError: false, error: null, refetch: () => {} }}>
            <SetupWizard />
          </LoyaltyContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(text(html)).toContain('Only an owner or a manager can set up the programme.')
    expect(html).not.toContain('data-step=')
  })
})
