import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en-GB' },
  }),
}))

import { newForm } from './panelState'
import { PostFormFields } from './PostFormFields'

const render = (posterId: string, team = [{ id: 3, name: 'Mia' }, { id: 7, name: 'Sam' }]) => renderToStaticMarkup(
  <PostFormFields form={{ ...newForm({ date: '2026-10-07', platform: 'instagram' }, ['instagram']), poster_id: posterId }} onChange={() => {}}
    platforms={['instagram']} statuses={['draft']} pillars={[]} audiences={[]} published={false} invalid={[]} locale="en" industry={null}
    snippets={[]} team={team} />,
)

describe('"Who posts it" in the panel (spec 2026-10-19 §4.1)', () => {
  it('offers Not set and the brand’s team, with the poster chosen', () => {
    const html = render('7')
    expect(html).toContain('Who posts it')
    expect(html).toMatch(/<option value="">Not set<\/option>/)
    expect(html).toMatch(/<option value="3">Mia<\/option>/)
    expect(html).toMatch(/<option value="7" selected="">Sam<\/option>/)
  })

  it('chooses Not set for nobody', () => {
    expect(render('')).toMatch(/<option value="" selected="">Not set<\/option>/)
  })
})

describe('the Link next to the call to action (spec 2026-10-19 §5.1, §5.5)', () => {
  const linked = (link: string, facts: import('../lib/types').ShortLinkFacts | null = null) => renderToStaticMarkup(
    <PostFormFields form={{ ...newForm({ date: '2026-10-07', platform: 'instagram' }, ['instagram']), link }} onChange={() => {}}
      platforms={['instagram']} statuses={['draft']} pillars={[]} audiences={[]} published={false} invalid={[]} locale="en" industry={null}
      snippets={[]} link={facts} />,
  )

  it('is a web address field after the call to action and before the hashtags, saying the short link comes with the save', () => {
    const html = linked('https://lumiere.example')
    expect(html).toMatch(/Call to action[\s\S]*>Link<[\s\S]*type="url"[^>]*value="https:\/\/lumiere.example"[\s\S]*Hashtags/)
    expect(html).toContain('Where readers should go. HexaTech makes a short link that counts clicks.')
    expect(html).toContain('The short link appears once the post is saved.')
  })

  it('shows the saved post’s short link and its clicks under it', () => {
    const facts = { code: 'abc2345', short_url: 'https://sites.hexa-tech.uk/go/abc2345', destination: 'https://lumiere.example/autumn', on: true, clicks: 2, clicks_bio: 0, days: [] }
    const html = linked('https://lumiere.example/autumn', facts)
    expect(html).toContain('https://sites.hexa-tech.uk/go/abc2345')
    expect(html).toContain('Clicks: 2')
  })
})

// 5A-2 review: Date and Time sit side by side; Who posts it comes after them.
describe('the panel’s field order', () => {
  it('is Platform, Status, Date, Time, Who posts it, Pillar, Audience', () => {
    const html = render('')
    const order = ['Platform', 'Status', 'Date', 'Time', 'Who posts it', 'Pillar', 'Audience'].map(label => html.indexOf(`>${label}<`))
    expect(order.every(i => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })
})
