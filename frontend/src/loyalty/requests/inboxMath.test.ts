import { describe, expect, it } from 'vitest'
import { inboxFilters, recordKey, recordLabel } from './inboxMath'
import { REQUEST_DESIGN_WORDS } from './words'
import { LOYALTY_LOCALE_FILES } from '../i18n'

describe('combined Requests addresses', () => {
  it('preserves old benefit-only tab and request bookmarks', () => {
    expect(inboxFilters('?tab=approved&request=42')).toMatchObject({ type: 'benefit', view: 'approved', selected_kind: 'benefit', selected_id: 42 })
    expect(inboxFilters('?tab=done')).toMatchObject({ type: 'benefit', view: 'closed' })
    expect(inboxFilters('')).toMatchObject({ type: 'all', view: 'open', page: 1 })
  })
  it('keeps identical source IDs separate and rejects malformed IDs', () => {
    expect(inboxFilters('?record=redemption:42')).toMatchObject({ selected_kind: 'redemption', selected_id: 42 })
    expect(recordKey('benefit:1e3')).toBeNull()
    expect(recordKey('referral:0')).toBeNull()
    expect(recordKey('referral:9999999999999999999')).toBeNull()
    expect(recordLabel({ kind: 'referral', id: 42 })).toBe('#RF-42')
  })
  it('normalizes unsupported filters and bounds search and page', () => {
    expect(inboxFilters('?type=invalid&view=nope&sort=random&page=-3&q='+'a'.repeat(130))).toEqual({ type: 'all', view: 'open', sort: 'newest', page: 1, q: 'a'.repeat(120) })
  })
  it('ships every new phrase and preserves interpolation in all five languages', () => {
    for (const [lang, bundle] of Object.entries(LOYALTY_LOCALE_FILES)) for (const [key, fallback] of Object.entries(REQUEST_DESIGN_WORDS)) {
      const text = bundle.requestdesign[key as keyof typeof REQUEST_DESIGN_WORDS]
      expect(typeof text, lang+':'+key).toBe('string')
      expect(text.length, lang+':'+key).toBeGreaterThan(0)
      expect([...text.matchAll(/\{\{\w+\}\}/g)].map(m=>m[0]).sort()).toEqual([...fallback.matchAll(/\{\{\w+\}\}/g)].map(m=>m[0]).sort())
    }
  })
})
