import { describe, expect, it, vi } from 'vitest'

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

import { brandWith, profile, renderBrand } from './brandTesting'
import { ApprovalsSection } from './sections/Approvals'

const on = brandWith({ profile: { ...profile, requires_approval: true } })

describe('Brand → Approvals (spec 2026-10-16 §6.1)', () => {
  it('gives a manager the switch, off by default, and says what each position means', () => {
    const off = brandWith()
    const html = renderBrand(off, true, <ApprovalsSection brand={off} canEdit />)
    expect(html).toContain('Approvals')
    expect(html).toMatch(/role="switch" aria-checked="false"/)
    expect(html).toContain('Posts need a manager’s approval')
    expect(html).toContain('Off: everyone can mark posts ready and published.')
    const html2 = renderBrand(on, true, <ApprovalsSection brand={on} canEdit />)
    expect(html2).toMatch(/role="switch" aria-checked="true"/)
    expect(html2).toContain('On: staff write, edit and send posts for approval; only managers approve, mark ready and publish.')
  })

  it('shows staff the position without a switch', () => {
    const html = renderBrand(on, false, <ApprovalsSection brand={on} canEdit={false} />)
    expect(html).not.toContain('role="switch"')
    expect(html).toContain('Posts need a manager’s approval: ')
    expect(html).toContain('>On<')
  })

  it('sits on the Brand page after Key dates', () => {
    const html = renderBrand(brandWith(), true)
    expect(html.indexOf('id="content-approvals"')).toBeGreaterThan(html.indexOf('id="content-keydates"'))
  })
})
