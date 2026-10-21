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

// Release 7a (spec 2026-10-21 §7.4): the owner's order — the hook, the day, the status and who posts it, the words, then
// the folding sections (platform, pillar, audience, language and topic under Targeting & language).
describe('the panel’s field order', () => {
  it('is Post hook, Date, Time, Status, Who posts it, Post text, Call to action, then Platform, Pillar, Audience in the folds', () => {
    const html = render('')
    const order = ['Post hook', 'Date', 'Time', 'Status', 'Who posts it', 'Post text', 'Call to action', 'Platform', 'Pillar', 'Audience'].map(label => html.indexOf(`>${label}<`))
    expect(order.every(i => i >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('draws the hook as the large serif line, edited in place', () => {
    expect(render('')).toMatch(/>Post hook<[\s\S]*?<textarea[^>]*placeholder="Write the first line people see"[^>]*class="[^"]*font-a-display/)
    expect(render('')).toMatch(/<textarea[^>]*placeholder="Write the first line people see"[^>]*class="[^"]*\bc-hook\b/)
  })

  it('folds Targeting & language, Link & hashtags and Versions & repeat, closed at first', () => {
    const html = render('')
    for (const title of ['Targeting &amp; language', 'Link &amp; hashtags', 'Versions &amp; repeat']) {
      expect(html).toMatch(new RegExp(`aria-expanded="false"[^>]*>(?:(?!</button>).)*${title}`, 's'))
    }
  })
})

describe('a folding section with something to see to', () => {
  const fields = (invalid: (keyof import('./panelState').PostForm)[], hashtags = '') => renderToStaticMarkup(
    <PostFormFields form={{ ...newForm({ date: '2026-10-07', platform: 'instagram' }, ['instagram']), hashtags }} onChange={() => {}}
      platforms={['instagram']} statuses={['draft']} pillars={[]} audiences={[]} published={false} invalid={invalid} locale="en" industry={null} snippets={[]} />,
  )
  const opened = (html: string, title: string) => new RegExp(`aria-expanded="true"[^>]*>(?:(?!</button>).)*${title}`, 's').test(html)

  it('opens by itself when a refused save named one of its fields, so the person sees what to fix', () => {
    expect(opened(fields(['pillar_id']), 'Targeting &amp; language')).toBe(true)
    expect(opened(fields(['pillar_id']), 'Link &amp; hashtags')).toBe(false)
    expect(opened(fields(['hashtags']), 'Link &amp; hashtags')).toBe(true)
  })

  it('opens Link & hashtags when the platform takes fewer hashtags than the post has', () => {
    const many = Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(' ')
    expect(opened(fields([], many), 'Link &amp; hashtags')).toBe(true)
  })
})

describe('the destination under the call to action (spec 2026-10-21 §7.4)', () => {
  const withLink = (link: string) => renderToStaticMarkup(
    <PostFormFields form={{ ...newForm({ date: '2026-10-07', platform: 'instagram' }, ['instagram']), link }} onChange={() => {}}
      platforms={['instagram']} statuses={['draft']} pillars={[]} audiences={[]} published={false} invalid={[]} locale="en" industry={null} snippets={[]} />,
  )

  it('offers "Add destination URL" until there is a link, then the Link field in its place', () => {
    expect(withLink('')).toContain('Add destination URL')
    expect(withLink('')).not.toMatch(/type="url"/)
    expect(withLink('https://lumiere.example')).not.toContain('Add destination URL')
    expect(withLink('https://lumiere.example')).toMatch(/type="url"/)
  })
})
