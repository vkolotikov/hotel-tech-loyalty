import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en-GB' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

import { ContentContext } from '../ContentProvider'
import type { BioPayload } from '../lib/types'
import { bioFormOf } from './bioForm'
import { bootFor, brandWith, renderBrand } from './brandTesting'
import { BioEditor, LinkInBioSection } from './sections/LinkInBio'

const payload = (more: Partial<BioPayload> = {}): BioPayload => ({
  page: { is_on: true, slug: 'lumiere', title: null, line: 'Hair and colour', show_posts: true },
  buttons: [
    { id: 4, label: 'Book now', destination: 'https://lumiere.example/book', short_url: 'https://sites.hexa-tech.uk/go/abc2345', clicks_30d: 6 },
    { id: 5, label: 'Gift cards', destination: 'https://lumiere.example/gifts', short_url: 'https://sites.hexa-tech.uk/go/def2345', clicks_30d: 0 },
  ],
  url: 'https://sites.hexa-tech.uk/links/lumiere', suggested_name: 'lumiere-salon', base_url: 'https://sites.hexa-tech.uk/links/', ...more,
})
const section = (bio: BioPayload, canManage: boolean) => {
  const client = new QueryClient()
  client.setQueryData(['content', 3, 'bio'], bio)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ContentContext.Provider value={{ data: bootFor(canManage), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
        <LinkInBioSection canEdit={canManage} />
      </ContentContext.Provider>
    </QueryClientProvider>,
  )
}
const editor = (draft = bioFormOf(payload()), invalid: string[] = [], bio = payload()) => renderToStaticMarkup(
  <BioEditor bio={bio} draft={draft} onChange={() => {}} invalid={invalid} error={null} busy={false} brandName="Lumière Salon"
    onFocus={() => {}} onSave={() => {}} onCancel={() => {}} />,
)

describe('the Link-in-bio section (spec 2026-10-19 §6.4)', () => {
  it('sits on the Brand page after Channels', () => {
    const html = renderBrand(brandWith(), true)
    const at = html.indexOf('id="content-bio"')
    expect(at).toBeGreaterThan(html.indexOf('id="content-channels"'))
    expect(at).toBeLessThan(html.indexOf('id="content-keydates"'))
  })

  it('shows managers the page, its address with Copy and Open page, its buttons with their clicks, and Edit', () => {
    const html = section(payload(), true)
    expect(html).toContain('https://sites.hexa-tech.uk/links/lumiere')
    expect(html).toContain('Copy address')
    expect(html).toMatch(/<a href="https:\/\/sites.hexa-tech.uk\/links\/lumiere" target="_blank" rel="noopener noreferrer"[^>]*>(?:<[^>]+>)*Open page<\/a>/)
    expect(html).toContain('Book now')
    expect(html).toContain('Clicks in the last 30 days: 6')
    expect(html).toContain('Lumière Salon')
    expect(html).toContain('>Edit<')
  })

  // Review Focus 5
  it('offers managers to set the page up before its first save', () => {
    const html = section(payload({ page: null, buttons: [], url: null }), true)
    expect(html).toContain('No page yet.')
    expect(html).toContain('Set up the page')
  })

  // Review Focus 5
  it('gives staff the address with Copy while the page is on, and nothing to edit', () => {
    const on = section(payload(), false)
    expect(on).toContain('https://sites.hexa-tech.uk/links/lumiere')
    expect(on).toContain('Copy address')
    expect(on).not.toContain('>Edit<')
    expect(on).not.toContain('Book now')
    const off = section(payload({ page: { is_on: false, slug: 'lumiere', title: null, line: null, show_posts: true } }), false)
    expect(off).toContain('The page is not switched on.')
    expect(off).not.toContain('Copy address')
    expect(section(payload({ page: null, buttons: [], url: null }), false)).toContain('The page is not switched on.')
  })
})

describe('the link-in-bio editor', () => {
  it('holds the switch, the name with the full address, title, line, the posts switch and each button with its moves', () => {
    const html = editor()
    expect(html).toMatch(/role="switch" aria-checked="true"/)
    expect(html).toContain('https://sites.hexa-tech.uk/links/lumiere')
    expect(html).toContain('placeholder="Lumière Salon"')
    expect(html).toContain('Show the latest posts that have a link')
    expect(html).toContain('aria-label="Button 2: address"')
    expect(html).toMatch(/<button type="button" data-move="up" disabled=""[^>]*aria-label="Move button 1 up"/)
    expect(html).toContain('aria-label="Remove button 2"')
    expect(html).toContain('Removing a button switches its short link off.')
  })

  // Review Focus 2
  it('warns that the old address stops working when the name changes', () => {
    expect(editor({ ...bioFormOf(payload()), slug: 'lumiere-riga' })).toContain('The old address stops working when you save: https://sites.hexa-tech.uk/links/lumiere')
    expect(editor()).not.toContain('The old address stops working')
  })

  it('stops adding at eight buttons, and marks the fields a check named', () => {
    const form = bioFormOf(payload())
    const full = { ...form, buttons: Array.from({ length: 8 }, (_, i) => ({ key: `n${i}`, id: null, label: `B${i}`, destination: 'https://lumiere.example/' })) }
    expect(editor(full)).toMatch(/<button[^>]*data-bio-add=""[^>]*disabled=""/)
    expect(editor(full)).toContain('A page has at most 8 buttons.')
    expect(editor(form, ['slug'])).toMatch(/aria-invalid="true" aria-describedby="content-bio-address"/)
    expect(editor(form, ['buttons.b5.label'])).toMatch(/aria-label="Button 2: label" aria-invalid="true"/)
  })
})

// Release checks (eyes, 390 px): the hint after the address broke "Lowercase" mid-word; only the address may break anywhere.
describe('the name’s hint on a narrow screen', () => {
  it('lets only the address break anywhere, never the hint’s words', () => {
    const html = editor()
    expect(html).toContain('<span class="break-all">https://sites.hexa-tech.uk/links/lumiere</span>')
    expect(html).not.toMatch(/id="content-bio-address" class="[^"]*break-all/)
  })
})

// 5B-2 review: marks by row key, a label that holds only the name, placeholders on the labels, and a warning beside
// the manager's Copy address while the page is off.
describe('the link-in-bio editor after the 5B-2 review', () => {
  it('marks a button by its row key', () => {
    expect(editor(bioFormOf(payload()), ['buttons.b5.label'])).toMatch(/aria-label="Button 2: label"[^>]*aria-invalid="true"/)
    expect(editor(bioFormOf(payload()), ['buttons.b5.label'])).not.toMatch(/aria-label="Button 1: label"[^>]*aria-invalid="true"/)
  })
  it('names the name field by its label only, the address and the rules after it', () => {
    const html = editor()
    expect(html).toMatch(/<label for="content-bio-name"[^>]*>Name<\/label>/)
    expect(html).toMatch(/<input id="content-bio-name"[^>]*aria-describedby="content-bio-address"/)
    expect(html.indexOf('id="content-bio-address"')).toBeGreaterThan(html.indexOf('</label>', html.indexOf('for="content-bio-name"')))
    expect(html).toContain('3 to 63 lowercase letters, digits and single hyphens.')
  })
  it('shows an example in each button label', () => {
    expect(editor().match(/placeholder="e\.g\. Book a visit"/g)?.length).toBe(2)
  })
  it('warns a manager beside Copy address while the page is off', () => {
    const off = payload({ page: { is_on: false, slug: 'lumiere', title: null, line: null, show_posts: true } })
    expect(section(off, true)).toContain('The page is switched off: this address shows a page that is not found until you switch it on.')
    expect(section(payload(), true)).not.toContain('The page is switched off')
  })
})
