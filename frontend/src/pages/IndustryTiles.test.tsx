import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { IndustryTiles } from './IndustryTiles'

const labels = { beauty: 'Salon or spa', medical: 'Clinic', other: 'Something else' }

describe('the sign-up\'s business-type tiles (owner 2026-11-04)', () => {
  it('is one radio group: every tile a radio, only one reachable by Tab', () => {
    const html = renderToStaticMarkup(<IndustryTiles ids={['beauty', 'medical', 'other']} labels={labels} value={null} onChange={() => {}} labelledBy="l" />)
    expect(html).toContain('role="radiogroup"')
    expect(html).toContain('aria-labelledby="l"')
    expect(html.match(/role="radio"/g)).toHaveLength(3)
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html).toMatch(/data-industry="beauty"[^>]*>|tabindex="0"[^>]*data-industry="beauty"/)
    expect(html).toContain('Salon or spa')
    expect(html).not.toContain('aria-checked="true"')
  })

  it('marks the chosen tile, makes it the one Tab reaches, and flags a missing choice', () => {
    const html = renderToStaticMarkup(<IndustryTiles ids={['beauty', 'medical', 'other']} labels={labels} value="medical" onChange={() => {}} labelledBy="l" />)
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1)
    expect(html).toMatch(/aria-checked="true" tabindex="0" data-industry="medical"/)
    const missing = renderToStaticMarkup(<IndustryTiles ids={['beauty']} labels={labels} value={null} onChange={() => {}} labelledBy="l" invalid />)
    expect(missing).toContain('aria-invalid="true"')
  })
})
