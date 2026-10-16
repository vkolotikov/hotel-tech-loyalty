import { describe, expect, it, vi } from 'vitest'

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

import type { Template } from '../lib/types'
import { brandWith, renderBrand } from './brandTesting'
import { TemplateEditor, TemplatesSection } from './sections/Templates'
import { templateForm } from './templateActions'

const offer: Template = {
  id: 3, name: 'Seasonal offer', platform: 'instagram', pillar_name: 'Offers', topic: null, hook: 'Book your [treatment]',
  main_copy: null, cta: null, hashtags: [],
}
const addButton = (html: string, words: string) => html.match(new RegExp(`<button(?:(?!</button>).)*${words}</button>`))?.[0] ?? ''

// Spec 2026-10-16 §5.2: everyone reads the templates; managers add, edit, remove and ask the AI.
describe('TemplatesSection', () => {
  it('shows everyone the templates with their platform and pillar; only managers get the buttons', () => {
    const brand = brandWith({ templates: [offer] })
    const staff = renderBrand(brand, false, <TemplatesSection brand={brand} canEdit={false} />)
    expect(staff).toContain('>Templates<')
    expect(staff).toContain('Seasonal offer')
    expect(staff).toContain('instagram · Offers')
    expect(staff).not.toContain('Add a template')
    expect(staff).not.toContain('Suggest templates with AI')
    const manager = renderBrand(brand, true, <TemplatesSection brand={brand} canEdit />)
    expect(addButton(manager, 'Add a template')).not.toContain('disabled=""')
    expect(manager).toContain('Remove')
    expect(manager).toContain('Suggest templates with AI')
  })

  it('stops a manager adding a 101st template, and says why; says when there are none', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ ...offer, id: i + 1, name: `T${i}` }))
    const full = renderBrand(brandWith({ templates: many }), true, <TemplatesSection brand={brandWith({ templates: many })} canEdit />)
    expect(addButton(full, 'Add a template')).toContain('disabled=""')
    expect(full).toContain('A brand keeps at most 100 templates. Remove one first.')
    expect(renderBrand(brandWith(), false, <TemplatesSection brand={brandWith()} canEdit={false} />)).toContain('No templates yet.')
  })
})

describe('TemplateEditor', () => {
  it('writes a template: its name, any platform, a pillar kept by name, and what [blanks] are', () => {
    const out = renderBrand(brandWith(), true, <TemplateEditor template={null} initial={{ ...templateForm(null), name: 'From a post', pillar_name: 'Old pillar' }} onDone={() => {}} />)
    expect(out).toContain('value="From a post"')
    expect(out).toContain('>Any platform</option>')
    expect(out).toContain('<option value="Old pillar" selected="">Old pillar</option>')
    expect(out).toContain('Words in [square brackets] are blanks to fill, such as [treatment] or [date].')
  })
})
