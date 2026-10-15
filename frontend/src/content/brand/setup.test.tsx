import { describe, expect, it, vi } from 'vitest'
import { brandWith, profile, renderBrand } from './brandTesting'
import { GuidedSetup } from './setup/GuidedSetup'
import { QuickSetupDialog } from './setup/QuickSetup'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

const empty = { profile: null, audiences: [], channels: [], voice: null, readiness: null }

describe('setting up a brand', () => {
  it('offers managers Quick setup and Guided setup when the brand has no profile, and no sections yet', () => {
    const html = renderBrand(empty, true)
    expect(html).toContain('Set up this brand')
    expect(html).toContain('>Quick setup<')
    expect(html).toContain('>Guided setup<')
    expect(html).not.toContain('Brand DNA')
  })

  it('offers to continue a setup that was started, beside the sections', () => {
    const html = renderBrand(brandWith({ profile: { ...profile, setup_completed_at: null } }), true)
    expect(html).toContain('Setup has started but is not finished.')
    expect(html).toContain('Continue setup')
    expect(html).toContain('Brand DNA')
  })

  it('shows staff no setup buttons', () => {
    const html = renderBrand(empty, false)
    expect(html).not.toContain('>Quick setup<')
    expect(html).not.toContain('Your manager has not set up this brand yet.')
  })

  it('asks Quick setup for the essentials, waiting for at least one platform', () => {
    const html = renderBrand(empty, true, <QuickSetupDialog onClose={() => {}} />)
    expect(html).toContain('value="Lumière Salon"')
    expect(html).toContain('Where the brand posts')
    expect(html).toMatch(/aria-pressed="true"[^>]*>Standard</)
    expect(html).toMatch(/<button[^>]*\bdisabled=""[^>]*>Set up with AI</)
  })

  it('walks Guided setup from Brand DNA, with the brand\'s name filled in, step 1 of 7, no Skip before a profile exists', () => {
    const html = renderBrand(empty, true, <GuidedSetup brand={empty} onExit={() => {}} />)
    expect(html).toContain('Step 1 of 7')
    expect(html).toContain('Brand DNA')
    expect(html).toContain('value="Lumière Salon"')
    expect(html).not.toContain('Skip this step')
    expect(html).toContain('Leave setup')
  })
})
