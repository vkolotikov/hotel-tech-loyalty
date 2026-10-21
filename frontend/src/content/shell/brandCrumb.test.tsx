import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BrandRef } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) => (typeof fallback === 'string' ? fallback : key),
    i18n: { language: 'en' },
  }),
}))

import { BrandCrumb } from './BrandCrumb'

const b1: BrandRef = { id: 1, name: 'FDS Cards', logo_url: 'https://cdn.example/l.png' }
const b2: BrandRef = { id: 2, name: 'First Design', logo_url: null }

describe('the breadcrumb (spec 2026-10-21 §4.2)', () => {
  it('shows the brand\'s logo, its name with a menu when there are several brands, and the page', () => {
    const html = renderToStaticMarkup(<BrandCrumb brand={b1} brands={[b1, b2]} page="Plan" onChoose={() => {}} />)
    expect(html).toMatch(/<nav[^>]*aria-label="Breadcrumb"/)
    expect(html).toMatch(/<img[^>]*src="https:\/\/cdn.example\/l.png"[^>]*alt=""/)
    expect(html).toMatch(/aria-haspopup="menu"[^>]*>[\s\S]*?FDS Cards/)
    expect(html).toMatch(/aria-current="page"[^>]*>Plan</)
  })

  // Review Focus 1: a long name and no logo at 1024–1279 px.
  it('draws initials without a logo, no menu for one brand, and cuts a long name', () => {
    const html = renderToStaticMarkup(<BrandCrumb brand={{ id: 1, name: 'A very long brand name that goes on', logo_url: null }} brands={[b1]} page="Plan" onChoose={() => {}} />)
    expect(html).toContain('>AV<')
    expect(html).not.toContain('aria-haspopup')
    expect(html).toMatch(/class="[^"]*min-w-0[^"]*truncate[^"]*"[^>]*>A very long brand name/)
  })
})
