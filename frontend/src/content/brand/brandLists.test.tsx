import { describe, expect, it, vi } from 'vitest'
import type { Audience, Channel } from '../lib/types'
import { brandWith, renderBrand } from './brandTesting'
import { AudiencesSection } from './sections/Audiences'
import { ChannelsSection } from './sections/Channels'

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

const audience = { id: 5, name: 'Busy parents', job_role: 'Parent', industry: null, country: 'Latvia', pain_points: ['No time'], goals: ['Look good fast'], is_ai_assumed: true, posts_count: 4 } as Audience
const channels = [
  { id: 6, platform: 'instagram', label: 'Instagram', active: true, frequency: { mon: true, wed: true, fri: true }, posts_per_week: 3 },
  { id: 7, platform: 'linkedin', label: 'LinkedIn', active: false, frequency: { tue: true }, posts_per_week: 1 },
] as Channel[]

describe('AudiencesSection', () => {
  it('lists each audience with what moves it and how many posts use it; only managers may change them', () => {
    const brand = brandWith({ audiences: [audience] })
    const staff = renderBrand(brand, false, <AudiencesSection brand={brand} canEdit={false} />)
    expect(staff).toContain('Busy parents')
    expect(staff).toContain('No time')
    expect(staff).toContain('Posts using it: 4')
    expect(staff).toContain('Assumed by the AI')
    expect(staff).not.toContain('Add audience')
    const manager = renderBrand(brand, true, <AudiencesSection brand={brand} canEdit />)
    expect(manager).toContain('Add audience')
    expect(manager).toContain('>Remove<')
  })

  // Review: a list field stored as one string (or an object) crashed the whole portal.
  it('reads an audience whose lists were stored as a string or an object, without breaking', () => {
    const odd = { ...audience, pain_points: 'No time' as never, goals: { a: 1 } as never }
    const brand = brandWith({ audiences: [odd] })
    const html = renderBrand(brand, false, <AudiencesSection brand={brand} canEdit={false} />)
    expect(html).toContain('No time')
    expect(html).toContain('Busy parents')
  })

  it('opens the add form at once in Guided setup when there is no audience yet', () => {
    const brand = brandWith({ audiences: [] })
    const html = renderBrand(brand, true, <AudiencesSection brand={brand} canEdit startOpen onSaved={() => {}} />)
    expect(html).toContain('More about this audience')
    expect(html).toMatch(/<button[^>]*>Save</)
  })
})

describe('ChannelsSection', () => {
  it('lists each channel with its days, posts a week and whether it is on; only managers may change them', () => {
    const brand = brandWith({ channels })
    const staff = renderBrand(brand, false, <ChannelsSection brand={brand} canEdit={false} />)
    expect(staff).toContain('Instagram')
    expect(staff).toContain('Mon, Wed, Fri')
    expect(staff).toContain('posts a week: 3')
    expect(staff).toContain('>Off<')
    expect(staff).not.toContain('Add channel')
    const manager = renderBrand(brand, true, <ChannelsSection brand={brand} canEdit />)
    expect(manager).toContain('Add channel')
    expect(manager).toContain('role="switch"')
  })

  // Release check (Task 11): on a phone in Russian the text shrank to a word a line and the name to "R…"; it keeps 12rem and the switch and buttons wrap below.
  it('keeps the channel\'s text a readable width, the switch and buttons wrapping below it on a phone', () => {
    const brand = brandWith({ channels })
    const manager = renderBrand(brand, true, <ChannelsSection brand={brand} canEdit />)
    expect(manager).toContain('class="min-w-0 grow basis-48"')
    expect(manager).not.toContain('class="min-w-0 flex-1"')
  })

  // Lighthouse: a faded row put its Edit and Remove buttons under 4.5:1. The row says Off in words instead, to everyone.
  it('shows a switched-off channel at full contrast, saying Off, to managers as to staff', () => {
    const brand = brandWith({ channels })
    const manager = renderBrand(brand, true, <ChannelsSection brand={brand} canEdit />)
    // No plain opacity class (the shared Button's own disabled:opacity-50 is not a fade of the row).
    expect(manager).not.toMatch(/(^|[\s"])opacity-\d/)
    expect(manager).toContain('>Off<')
  })
})

describe('a channel\'s usual time on the Brand page', () => {
  // Spec 2026-10-15 §5: the channel editor shows the usual time with the suggested times as chips.
  it('shows it in the list and asks for it in the editor with the suggested times', () => {
    const channel = { id: 1, platform: 'instagram', label: 'Instagram', active: true, post_time: '08:30', frequency: { mon: true }, posts_per_week: 3 }
    const brand = brandWith({ channels: [channel as unknown as Channel] })
    expect(renderBrand(brand, true, <ChannelsSection brand={brand} canEdit />)).toContain('usually at 08:30')
    // startOpen opens the new-channel editor on a brand with no channel yet (Guided setup).
    const none = brandWith({ channels: [] })
    const open = renderBrand(none, true, <ChannelsSection brand={none} canEdit startOpen onSaved={() => {}} />)
    expect(open).toContain('Usual posting time')
    expect(open).toContain('aria-label="Suggested times"')
  })
})
