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

import type { ShortLinkFacts } from '../lib/types'
import { ShortLink } from './ShortLink'

const days = Array.from({ length: 14 }, (_, i) => ({ day: `2026-10-${String(i + 1).padStart(2, '0')}`, clicks: i === 13 ? 4 : i === 12 ? 2 : 0 }))
const link: ShortLinkFacts = {
  code: 'abc2345', short_url: 'https://sites.hexa-tech.uk/go/abc2345', destination: 'https://lumiere.example/autumn', on: true,
  clicks: 9, clicks_bio: 3, days,
}

describe('the short link under the Link field (spec 2026-10-19 §5.5)', () => {
  it('says nothing without a Link, and that the short link comes with the save when one is typed', () => {
    // No words — only the empty live region that later notes come into (final review).
    expect(renderToStaticMarkup(<ShortLink typed="" link={null} />)).toBe('<p data-short-link-note="" role="status" class="sr-only"></p>')
    expect(renderToStaticMarkup(<ShortLink typed="https://lumiere.example" link={null} />)).toContain('The short link appears once the post is saved.')
  })

  it('shows the short link with Copy, the clicks and those from the bio page, and 14 bars each named for a screen reader', () => {
    const html = renderToStaticMarkup(<ShortLink typed="https://lumiere.example/autumn" link={link} />)
    expect(html).toContain('https://sites.hexa-tech.uk/go/abc2345')
    expect(html).toContain('Copy short link</button>')
    expect(html).toContain('Clicks: 9')
    expect(html).toContain('From the link-in-bio page: 3')
    expect(html).toContain('Clicks per day, last 14 days')
    expect(html.match(/<li/g)?.length).toBe(14)
    expect(html).toContain('<span class="sr-only">14 Oct: 4</span>')
    expect(html).toContain('<span class="sr-only">1 Oct: 0</span>')
    expect(html).not.toContain('Saving')
  })

  // Review Focus 1
  it('warns before a save moves or clears it, and says when it is off, without Copy', () => {
    expect(renderToStaticMarkup(<ShortLink typed="https://lumiere.example/winter" link={link} />)).toContain('Saving keeps this short link: it will lead to the new address, also from posts already out.')
    expect(renderToStaticMarkup(<ShortLink typed="" link={link} />)).toContain('Saving without a link switches this short link off')
    const off = renderToStaticMarkup(<ShortLink typed="" link={{ ...link, on: false, destination: null }} />)
    expect(off).toContain('This short link is switched off. Enter a link to switch it back on.')
    expect(off).toContain('switched off')
    expect(off).not.toContain('Copy short link</button>')
    expect(renderToStaticMarkup(<ShortLink typed="https://lumiere.example" link={{ ...link, on: false, destination: null }} />)).toContain('Saving switches this short link back on.')
  })
})

// Final review: what saving will do was plain text that appeared while typing — a screen reader never heard it. The
// note is a live region that is there before any words come into it.
describe('the short link’s note for a screen reader', () => {
  it('is a polite live region, present (empty) before the first word and holding the warning once one applies', () => {
    expect(renderToStaticMarkup(<ShortLink typed="" link={null} />)).toMatch(/<p data-short-link-note="" role="status" class="sr-only"><\/p>/)
    expect(renderToStaticMarkup(<ShortLink typed="https://lumiere.example" link={null} />)).toMatch(/role="status"[^>]*>The short link appears once the post is saved\.<\/p>/)
    expect(renderToStaticMarkup(<ShortLink typed="https://lumiere.example/autumn" link={link} />)).toMatch(/<p data-short-link-note="" role="status" class="sr-only"><\/p>/)
    expect(renderToStaticMarkup(<ShortLink typed="" link={link} />)).toMatch(/role="status"[^>]*>Saving without a link switches this short link off/)
  })
})
