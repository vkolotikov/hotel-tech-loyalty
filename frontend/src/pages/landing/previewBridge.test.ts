import { describe, expect, it } from 'vitest'
import { FOCUS_MESSAGE, focusMessage, isFromPreview, previewOrigin, selectedKey } from './previewBridge'

/**
 * TEMPLATE FIDELITY 2.5 — the bridge's grammar and its origin rule.
 *
 * Both are here rather than inside `LandingPreview.tsx` for the reason this
 * repository's vitest config forces and this design happens to want: the
 * origin check is the security-relevant half of a cross-origin message
 * channel, and a security rule expressed as a condition inside a component
 * is a rule no test in this repository can execute.
 */

const PREVIEW = 'https://sites.hexa-tech.uk/p/glamour-salon?sig=abc123'

describe('previewOrigin', () => {
  it('is the origin of the URL the SERVER minted, never a config copy', () => {
    expect(previewOrigin(PREVIEW)).toBe('https://sites.hexa-tech.uk')
    expect(previewOrigin('http://localhost:8000/preview/9')).toBe('http://localhost:8000')
  })

  // No URL yet, a relative path, or a URL with no real origin. A null
  // target means nothing is posted at all — an unaddressable message is
  // never sent to `'*'` instead.
  it('is null for anything that cannot be addressed', () => {
    expect(previewOrigin(null)).toBeNull()
    expect(previewOrigin(undefined)).toBeNull()
    expect(previewOrigin('')).toBeNull()
    expect(previewOrigin('/p/glamour-salon')).toBeNull()
    expect(previewOrigin('data:text/html,<p>hi</p>')).toBeNull()
  })
})

describe('focusMessage', () => {
  it('names itself, so a page that happens to use the same verb cannot be mistaken for it', () => {
    expect(focusMessage('about')).toEqual({
      source: 'landing-builder',
      type: FOCUS_MESSAGE,
      key: 'about',
    })
  })
})

describe('selectedKey', () => {
  const valid = { source: 'landing-preview', type: 'landing:select', key: 'gallery_1' }

  it('reads the key a band in the preview names', () => {
    expect(selectedKey(valid)).toBe('gallery_1')
  })

  it('refuses anything that is not this exact message', () => {
    expect(selectedKey(null)).toBeNull()
    expect(selectedKey('landing:select')).toBeNull()
    expect(selectedKey({ ...valid, source: 'somewhere-else' })).toBeNull()
    expect(selectedKey({ ...valid, type: 'landing:focus' })).toBeNull()
    expect(selectedKey({ ...valid, key: '' })).toBeNull()
    expect(selectedKey({ ...valid, key: 42 })).toBeNull()
  })

  /**
   * A message that clears every gate still only ever SELECTS A CARD — it
   * can neither write nor save anything — which is why this direction is
   * safe to accept before the sender that will use it has shipped.
   */
  it('carries nothing but a key', () => {
    expect(Object.keys(focusMessage('hero')).sort()).toEqual(['key', 'source', 'type'])
  })
})

describe('isFromPreview', () => {
  it('accepts the frame this pane is actually showing', () => {
    expect(isFromPreview('https://sites.hexa-tech.uk', PREVIEW)).toBe(true)
  })

  // Any other frame in the document, an opener, or an extension.
  it('drops everything else, including a near miss', () => {
    expect(isFromPreview('https://sites.hexa-tech.uk.evil.test', PREVIEW)).toBe(false)
    expect(isFromPreview('http://sites.hexa-tech.uk', PREVIEW)).toBe(false)
    expect(isFromPreview('https://admin.hexa-tech.uk', PREVIEW)).toBe(false)
    expect(isFromPreview('null', PREVIEW)).toBe(false)
  })

  // No frame, no trust: with no preview URL there is nothing this could be
  // the origin OF.
  it('trusts nothing while there is no preview URL', () => {
    expect(isFromPreview('https://sites.hexa-tech.uk', null)).toBe(false)
    expect(isFromPreview('https://sites.hexa-tech.uk', '')).toBe(false)
  })
})
