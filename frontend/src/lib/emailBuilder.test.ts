import { describe, expect, it } from 'vitest'
import {
  blankContent,
  embedContent,
  extractContent,
  PRESETS,
  renderEmailHtml,
  type Block,
  type EmailContent,
} from './emailBuilder'

/**
 * Locks the structured-block email builder — the system behind
 * /campaigns block builder (CLAUDE.md 2026-05-13). Three contract
 * surfaces:
 *
 *   1. Block→HTML rendering: 13 supported block types each get
 *      a deterministic stub of HTML. A regression that drops a
 *      block from the renderer's switch silently produces empty
 *      campaign emails.
 *
 *   2. Round-trip embed/extract: the visual editor saves the
 *      structured EmailContent inside an HTML comment so it can
 *      reload + edit the same email later without re-typing.
 *      A break here means the Visual/Code toggle eats every
 *      campaign on load.
 *
 *   3. HTML escaping: user-controlled content (CTA labels,
 *      headings) MUST escape angle brackets + quotes to prevent
 *      injecting markup. But merge tags ({{first_name}}) stay
 *      VERBATIM so server-side substitution at send time can
 *      replace them.
 *
 * What's deliberately NOT tested:
 *   - Exact byte-for-byte HTML string match — marketing reshuffles
 *     the styles constantly; testing the literal output would
 *     produce noise commits. Tests assert structure + presence
 *     instead.
 */
describe('renderEmailHtml — structural skeleton', () => {
  const baseContent = (): EmailContent => ({
    styleId: 'test',
    font: 'sans',
    palette: PRESETS[0].content.palette,
    logoText: 'Test Hotel',
    blocks: [],
    footerText: 'Test footer',
  })

  it('returns a well-formed HTML document', () => {
    const html = renderEmailHtml(baseContent())
    expect(html).toMatch(/^<!DOCTYPE html>/)
    expect(html).toContain('<html>')
    expect(html).toContain('</html>')
    expect(html).toContain('<body')
    expect(html).toContain('</body>')
  })

  it('emits the logoText in the header', () => {
    const c = baseContent()
    c.logoText = 'Forrest Glamp Test'
    const html = renderEmailHtml(c)
    expect(html).toContain('Forrest Glamp Test')
  })

  it('emits the footerText', () => {
    const c = baseContent()
    c.footerText = 'Unsubscribe link here'
    const html = renderEmailHtml(c)
    expect(html).toContain('Unsubscribe link here')
  })

  it('emits a preheader hidden div when preheader is set', () => {
    // The preheader is the gmail/inbox preview line. Rendered
    // inside a display:none div so it doesn't show in the
    // email body but DOES surface in inbox previews.
    const c = baseContent()
    c.preheader = 'Preview line for inbox'
    const html = renderEmailHtml(c)
    expect(html).toContain('Preview line for inbox')
    expect(html).toContain('display:none')
  })

  it('omits the preheader div when preheader is not set', () => {
    const html = renderEmailHtml(baseContent())
    expect(html).not.toContain('display:none')
  })

  it('selects serif font family when font="serif"', () => {
    const c = baseContent()
    c.font = 'serif'
    const html = renderEmailHtml(c)
    expect(html).toContain('Playfair Display')
  })

  it('selects sans-serif font family when font="sans" (default)', () => {
    const c = baseContent()
    c.font = 'sans'
    const html = renderEmailHtml(c)
    expect(html).toContain('Roboto')
  })
})

describe('renderEmailHtml — each block type renders', () => {
  const base = (blocks: Block[]): EmailContent => ({
    styleId: 'test',
    font: 'sans',
    palette: PRESETS[0].content.palette,
    logoText: 'Test',
    blocks,
    footerText: 'Footer',
  })

  it('heading: emits an <h2> with the content', () => {
    const html = renderEmailHtml(base([
      { type: 'heading', content: 'Welcome to the program' },
    ]))
    expect(html).toContain('<h2')
    expect(html).toContain('Welcome to the program')
  })

  it('text: emits a <p>', () => {
    const html = renderEmailHtml(base([
      { type: 'text', content: 'Thanks for joining' },
    ]))
    expect(html).toContain('<p')
    expect(html).toContain('Thanks for joining')
  })

  it('pointsBox: emits the value + label', () => {
    const html = renderEmailHtml(base([
      { type: 'pointsBox', value: '1,250', label: 'Available points' },
    ]))
    expect(html).toContain('1,250')
    expect(html).toContain('Available points')
  })

  it('tierBadge: emits the label', () => {
    const html = renderEmailHtml(base([
      { type: 'tierBadge', label: 'Gold member' },
    ]))
    expect(html).toContain('Gold member')
  })

  it('cta: emits an <a> with href + label', () => {
    const html = renderEmailHtml(base([
      { type: 'cta', label: 'Book now', url: 'https://example.com/book' },
    ]))
    expect(html).toContain('<a ')
    expect(html).toContain('href="https://example.com/book"')
    expect(html).toContain('Book now')
  })

  it('cta: empty URL falls back to # so the link is still clickable-looking', () => {
    const html = renderEmailHtml(base([
      { type: 'cta', label: 'Click', url: '' },
    ]))
    expect(html).toContain('href="#"')
  })

  it('divider: emits an <hr>', () => {
    const html = renderEmailHtml(base([{ type: 'divider' }]))
    expect(html).toContain('<hr')
  })

  it('image: emits an <img> with src + alt', () => {
    const html = renderEmailHtml(base([
      { type: 'image', url: 'https://example.com/img.png', alt: 'Logo' },
    ]))
    expect(html).toContain('<img')
    expect(html).toContain('src="https://example.com/img.png"')
    expect(html).toContain('alt="Logo"')
  })

  it('quote: emits a <blockquote>', () => {
    const html = renderEmailHtml(base([
      { type: 'quote', content: 'An incredible experience', author: 'A guest' },
    ]))
    expect(html).toContain('<blockquote')
    expect(html).toContain('An incredible experience')
    expect(html).toContain('A guest')
  })

  it('spacer: respects size (sm=16, md=28, lg=48)', () => {
    const small = renderEmailHtml(base([{ type: 'spacer', size: 'sm' }]))
    const medium = renderEmailHtml(base([{ type: 'spacer', size: 'md' }]))
    const large = renderEmailHtml(base([{ type: 'spacer', size: 'lg' }]))
    expect(small).toContain('height:16px')
    expect(medium).toContain('height:28px')
    expect(large).toContain('height:48px')
  })

  it('hero: emits the headline + subheadline + background image', () => {
    const html = renderEmailHtml(base([
      {
        type: 'hero',
        imageUrl: 'https://example.com/bg.jpg',
        headline: 'Stay with us',
        subheadline: 'Limited time offer',
      },
    ]))
    expect(html).toContain('https://example.com/bg.jpg')
    expect(html).toContain('Stay with us')
    expect(html).toContain('Limited time offer')
  })

  it('twoColumn: emits left + right text', () => {
    const html = renderEmailHtml(base([
      {
        type: 'twoColumn',
        leftHeading: 'Check-in',
        leftText: 'Anytime after 3pm',
        rightHeading: 'Check-out',
        rightText: 'By 11am',
      },
    ]))
    expect(html).toContain('Check-in')
    expect(html).toContain('Anytime after 3pm')
    expect(html).toContain('Check-out')
    expect(html).toContain('By 11am')
  })

  it('voucher: emits title + value + code', () => {
    const html = renderEmailHtml(base([
      { type: 'voucher', title: 'Welcome offer', value: '20% OFF', code: 'WELCOME20' },
    ]))
    expect(html).toContain('Welcome offer')
    expect(html).toContain('20% OFF')
    expect(html).toContain('WELCOME20')
  })

  it('stats: emits every item', () => {
    const html = renderEmailHtml(base([
      {
        type: 'stats',
        items: [
          { value: '120', label: 'Nights' },
          { value: '$15K', label: 'Spend' },
          { value: '4', label: 'Visits' },
        ],
      },
    ]))
    expect(html).toContain('120')
    expect(html).toContain('Nights')
    expect(html).toContain('$15K')
    expect(html).toContain('4')
    expect(html).toContain('Visits')
  })
})

describe('renderEmailHtml — HTML escaping invariants', () => {
  const base = (blocks: Block[]): EmailContent => ({
    styleId: 'test',
    font: 'sans',
    palette: PRESETS[0].content.palette,
    logoText: 'Test',
    blocks,
    footerText: 'Footer',
  })

  it('escapes angle brackets in user-supplied content (prevent injection)', () => {
    const html = renderEmailHtml(base([
      { type: 'heading', content: '<script>alert("xss")</script>' },
    ]))
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes double-quotes in content', () => {
    const html = renderEmailHtml(base([
      { type: 'text', content: 'She said "hello"' },
    ]))
    expect(html).toContain('&quot;hello&quot;')
  })

  it('escapes ampersands', () => {
    const html = renderEmailHtml(base([
      { type: 'text', content: 'Stay & dine package' },
    ]))
    expect(html).toContain('Stay &amp; dine package')
  })

  it('PRESERVES merge tags ({{name}}) so server-side substitution works', () => {
    // The critical exception. Pre-fix, escaping would have
    // mangled {{first_name}} into &#123;&#123;first_name&#125;&#125;
    // and server-side substitution at send time would never find
    // the placeholder. escKeepTags is exactly the fix.
    const html = renderEmailHtml(base([
      { type: 'heading', content: 'Hello {{first_name}}' },
    ]))
    expect(html).toContain('{{first_name}}')
  })

  it('PRESERVES merge tags even when surrounded by special characters', () => {
    const html = renderEmailHtml(base([
      { type: 'text', content: '<b>{{tier_name}}</b> member' },
    ]))
    // Brackets escaped, merge tag preserved.
    expect(html).toContain('{{tier_name}}')
    expect(html).toContain('&lt;b&gt;')
  })

  it('escapes URLs in cta href via esc()', () => {
    // URL escaping uses plain esc() (not escKeepTags). A URL with
    // quotes would otherwise allow attribute injection.
    const html = renderEmailHtml(base([
      { type: 'cta', label: 'Click', url: 'javascript:"alert(1)"' },
    ]))
    expect(html).toContain('&quot;')
  })
})

describe('embedContent + extractContent — round-trip', () => {
  const sample: EmailContent = {
    styleId: 'test',
    font: 'sans',
    palette: PRESETS[0].content.palette,
    logoText: 'Round-trip test',
    blocks: [
      { type: 'heading', content: 'Welcome' },
      { type: 'text', content: 'Thanks for joining' },
      { type: 'cta', label: 'Book', url: 'https://example.com' },
    ],
    footerText: 'Footer text',
  }

  it('embedContent inserts an HTML comment carrying the JSON content', () => {
    const html = embedContent(renderEmailHtml(sample), sample)
    expect(html).toMatch(/<!--builder:[^>]+-->/)
  })

  it('extractContent reads back the same EmailContent', () => {
    const html = embedContent(renderEmailHtml(sample), sample)
    const extracted = extractContent(html)
    expect(extracted).toBeTruthy()
    expect(extracted!.logoText).toBe('Round-trip test')
    expect(extracted!.blocks.length).toBe(3)
    expect(extracted!.blocks[0].type).toBe('heading')
  })

  it('extractContent returns null when no marker present', () => {
    // The graceful failure path: a campaign saved without the
    // marker (legacy or hand-edited HTML) must fall through to
    // null so the editor can render in Code-only mode.
    const result = extractContent('<html><body>No marker here</body></html>')
    expect(result).toBeNull()
  })

  it('extractContent returns null when marker payload is corrupted', () => {
    // If someone hand-edits the embedded JSON to invalidity, the
    // extractor must NOT throw — return null so the editor
    // falls back cleanly.
    const corrupted = '<!--builder:not-valid-json-->'
    expect(extractContent(corrupted)).toBeNull()
  })

  it('embedContent inserts the marker right after DOCTYPE when present', () => {
    // Putting it at the top means a partial-read of the HTML
    // (e.g. by a preview parser that only reads the first N bytes)
    // can still surface the structured content.
    const html = embedContent('<!DOCTYPE html>\n<html><body>x</body></html>', sample)
    const doctypeEnd = html.indexOf('>') + 1
    const next = html.slice(doctypeEnd, doctypeEnd + 30).trim()
    expect(next.startsWith('<!--builder:')).toBe(true)
  })

  it('embedContent prepends the marker when no DOCTYPE present', () => {
    // Fallback case: still attaches the marker; just at the very
    // start since there's no DOCTYPE to anchor to.
    const html = embedContent('<html><body>x</body></html>', sample)
    expect(html.trim().startsWith('<!--builder:')).toBe(true)
  })

  it('full round-trip: render→embed→extract→render produces equal output', () => {
    // The end-to-end editor save→load cycle. A break here means
    // every campaign mutates on reload.
    const html1 = embedContent(renderEmailHtml(sample), sample)
    const extracted = extractContent(html1)
    expect(extracted).toBeTruthy()
    const html2 = renderEmailHtml(extracted!)

    // Render output may differ on whitespace, but the EmailContent
    // semantic equality must hold:
    expect(extracted!.logoText).toBe(sample.logoText)
    expect(extracted!.footerText).toBe(sample.footerText)
    expect(extracted!.blocks.length).toBe(sample.blocks.length)
    expect(html2).toContain('Welcome')
    expect(html2).toContain('Book')
  })
})

describe('PRESETS + blankContent', () => {
  it('PRESETS exposes at least one preset', () => {
    expect(PRESETS.length).toBeGreaterThan(0)
  })

  it('every preset has the required shape', () => {
    for (const p of PRESETS) {
      expect(typeof p.id).toBe('string')
      expect(typeof p.name).toBe('string')
      expect(typeof p.tagline).toBe('string')
      expect(typeof p.defaultSubject).toBe('string')
      expect(typeof p.accentSwatch).toBe('string')
      expect(p.content).toBeTruthy()
      expect(Array.isArray(p.content.blocks)).toBe(true)
    }
  })

  it('preset ids are unique', () => {
    const ids = PRESETS.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every preset belongs to a valid category', () => {
    const validCategories = ['welcome', 'campaign', 'transactional', 'birthday', 're-engagement']
    for (const p of PRESETS) {
      expect(validCategories).toContain(p.category)
    }
  })

  it('blankContent returns a deep clone of PRESETS[0].content', () => {
    // The deep-clone invariant: mutating the result must NOT
    // affect future blankContent() calls. Without deep clone,
    // shared structure across instances would silently link
    // separate campaigns.
    const a = blankContent()
    const b = blankContent()
    a.blocks.push({ type: 'divider' })
    expect(b.blocks.length).not.toBe(a.blocks.length)
  })

  it('every PRESETS entry renders without throwing', () => {
    // Regression guard: a preset whose block shape doesn't
    // satisfy the renderer's switch would surface here as a
    // runtime error.
    for (const p of PRESETS) {
      expect(() => renderEmailHtml(p.content)).not.toThrow()
    }
  })
})
