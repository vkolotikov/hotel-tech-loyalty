import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { brandWith, renderBrand } from './brandTesting'
import { SectionCard } from './SectionCard'

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

describe('BrandPage', () => {
  it('shows how ready the brand is and what is missing, in the portal\'s words', () => {
    const html = renderBrand(brandWith(), false)
    expect(html).toContain('>Brand<')
    expect(html).toContain('64 %')
    expect(html).toContain('Add the mission (Brand DNA).')
    expect(html).toContain('Add more questions and answers to the knowledge base: 2 so far, 5 or more work best.')
    expect(html).not.toContain('Company info') // the server's English label is never shown
  })

  it('reads Brand DNA to everyone, and offers Edit and Refresh knowledge only to managers', () => {
    const staff = renderBrand(brandWith(), false)
    expect(staff).toContain('Organic colour only')
    expect(staff).toContain('Calm')
    expect(staff).toContain('Premium')
    expect(staff).not.toContain('>Edit<')
    expect(staff).not.toContain('Refresh knowledge')
    const manager = renderBrand(brandWith(), true)
    expect(manager).toContain('>Edit<')
    expect(manager).toContain('Refresh knowledge')
  })

  it('leaves telling staff the brand is not set up to the shell (no second notice), and shows no sections', () => {
    const html = renderBrand({ profile: null, audiences: [], channels: [], voice: null, readiness: null }, false)
    expect(html).not.toContain('Your manager has not set up this brand yet.')
    expect(html).not.toContain('Brand DNA')
  })
})

describe('SectionCard', () => {
  it('opens on its form when asked to, with Save and Cancel', () => {
    const html = renderToStaticMarkup(
      <SectionCard id="s" title="Voice" canEdit startOpen readView={<p>read</p>} makeDraft={() => ({ tone: 'warm' })}
        editView={(draft) => <p>editing {draft.tone}</p>} save={() => Promise.resolve()} />,
    )
    expect(html).toContain('editing warm')
    expect(html).toMatch(/<button[^>]*>Save</)
    expect(html).toContain('>Cancel<')
    expect(html).not.toContain('read')
  })
})
