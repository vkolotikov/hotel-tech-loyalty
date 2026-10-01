import { describe, expect, it } from 'vitest'
import { EMPTY_LINK, linkOf } from './links'

describe('linkOf', () => {
  it('reads a person or service the draft knows, and an empty link for one it does not', () => {
    // A service or person added elsewhere while an editor is open is not in its draft: the editor must not crash.
    const links = { 3: { on: true, duration: '50', price: '' } }
    expect(linkOf(links, 3)).toEqual({ on: true, duration: '50', price: '' })
    expect(linkOf(links, 99)).toEqual(EMPTY_LINK)
    expect(EMPTY_LINK).toEqual({ on: false, duration: '', price: '' })
  })
})
