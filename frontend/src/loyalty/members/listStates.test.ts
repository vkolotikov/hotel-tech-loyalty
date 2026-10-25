import { describe, expect, it } from 'vitest'
import { membersParams } from '../lib/api'
import { NO_FILTERS, asMemberFilters, byValidity, filtersFrom, searchFor, withChange } from './membersQuery'

/** The members list's Show by a membership's end date (release 8, spec 2026-10-25 §3): Expiring soon and Expired. */
describe('the list by end date', () => {
  it('reads and writes the two states in the address, and sends them as they are', () => {
    expect(filtersFrom('?state=expiring', []).state).toBe('expiring')
    expect(filtersFrom('?state=expired', []).state).toBe('expired')
    expect(filtersFrom('?state=soon', [])).toEqual(NO_FILTERS)
    const expired = withChange(NO_FILTERS, { state: 'expired' })
    expect(searchFor(expired)).toBe('?state=expired')
    expect(membersParams(asMemberFilters(expired))).toEqual({ state: 'expired' })
    expect([byValidity('expiring'), byValidity('expired'), byValidity('active')]).toEqual([true, true, false])
  })
})
