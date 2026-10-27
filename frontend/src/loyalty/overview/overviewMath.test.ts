import { describe, expect, it } from 'vitest'
import { AxiosError } from 'axios'
import { canRetain, filterFrom, overviewKey, overviewScope, overviewSearch, periodFrom } from './overviewMath'
import { LOYALTY_LOCALE_FILES } from '../i18n'
import { OVERVIEW_WORDS } from './words'
import type { Bootstrap } from '../lib/types'

describe('Overview state and authorization boundaries', () => {
  it('keeps period and activity independent across direct links, and rejects unsupported values', () => {
    const search = overviewSearch('?period=90d&activity=rewards', { period: '12m' })
    expect(periodFrom(search)).toBe('12m')
    expect(filterFrom(search)).toBe('rewards')
    expect(periodFrom('?period=forever')).toBe('30d')
    expect(filterFrom('?activity=people')).toBe('all')
  })
  it('separates period queries, identities, organizations and capability changes without duplicating current totals', () => {
    const boot = { organization: { id: 1 }, staff: { id: 5, can: { view_insights: true } } } as Bootstrap
    const scope = overviewScope(boot)
    expect(overviewScope({ ...boot, organization: { ...boot.organization, id: 2 } })).not.toBe(scope)
    expect(overviewScope({ ...boot, staff: { ...boot.staff, id: 6 } })).not.toBe(scope)
    expect(overviewScope({ ...boot, staff: { ...boot.staff, can: { ...boot.staff.can, view_insights: false } } })).not.toBe(scope)
    expect(overviewKey(scope, 'metrics', '30d')).not.toEqual(overviewKey(scope, 'metrics', '90d'))
    expect(overviewKey(scope, 'activity', '30d', 'all')).not.toEqual(overviewKey(scope, 'activity', '30d', 'visits'))
    expect(overviewKey(scope, 'queue', '30d')).toEqual(overviewKey(scope, 'queue', '12m'))
  })
  it('retains successful same-scope data on outages, never on denial or across organizations', () => {
    const fail = (status: number) => new AxiosError('failure', undefined, undefined, undefined, { status } as never)
    expect(canRetain(fail(503), 1, 1)).toBe(true)
    for (const status of [401, 402, 403]) expect(canRetain(fail(status), 1, 1)).toBe(false)
    expect(canRetain(null, 2, 1)).toBe(false)
    expect(canRetain(null, undefined, 1)).toBe(false)
  })
  it('ships every Overview sentence and interpolation in all five languages', () => {
    const placeholders = (s: string) => [...s.matchAll(/{{(\w+)}}/g)].map(m => m[1]).sort()
    for (const locale of Object.values(LOYALTY_LOCALE_FILES)) {
      expect(Object.keys(locale.overview).sort()).toEqual(Object.keys(OVERVIEW_WORDS).sort())
      for (const [key, english] of Object.entries(OVERVIEW_WORDS)) {
        const translated = locale.overview[key as keyof typeof OVERVIEW_WORDS]
        expect(translated, key).toBeTruthy()
        expect(placeholders(translated), key).toEqual(placeholders(english))
      }
    }
  })
})
