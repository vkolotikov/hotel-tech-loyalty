import { describe, expect, it } from 'vitest'
import { answerFixture } from '../options/fixture'
import { baseExample, earningUrl, earnLocation, filteredWays } from './model'
import { EARN_WORDS } from './words'
import en from '../i18n/earn.en.json'

describe('Ways to earn navigation and illustrative amounts', () => {
  const answer = answerFixture()
  it('defaults to earning and preserves direct method links and group boundaries', () => {
    expect(earnLocation('', answer.ways).tab).toBe('earn')
    expect(earnLocation('?way=referrals', answer.ways)).toMatchObject({ tab: 'bonus', way: 'referrals', selected: 'referrals' })
    expect(earnLocation('?tab=earn&way=referrals', answer.ways)).toMatchObject({ tab: 'earn', way: null, selected: null })
    expect(earnLocation('?tab=broken&way=unknown&status=broken', answer.ways)).toMatchObject({ tab: 'earn', way: null, status: 'all' })
    expect(earnLocation('?tab=overview', answer.ways).tab).toBe('overview')
    const next = { ...answer.ways[0], key: 'future_method' }
    expect(earnLocation('?way=future_method', [...answer.ways, next])).toMatchObject({ tab: 'more', way: 'future_method' })
  })
  it('round-trips translated filters and selection without adding a write', () => {
    const url = earningUrl('earn', { selected: 'check_in', q: 'Посещение & café', status: 'active' })
    expect(earnLocation(url.slice(url.indexOf('?')), answer.ways)).toMatchObject({ selected: 'check_in', q: 'Посещение & café', status: 'active' })
    expect(earningUrl('overview')).toBe('/loyalty/options?tab=overview')
  })
  it('filters all real methods by translated text and switch state, in server order', () => {
    expect(filteredWays(answer, 'earn', '', 'all', w => w.key).map(w => w.key)).toEqual(['earn_rate', 'points_on_spend', 'stamp_card', 'check_in', 'desk_earn', 'cashback'])
    expect(filteredWays(answer, 'earn', '', 'active', w => w.key).map(w => w.key)).toEqual(['earn_rate', 'points_on_spend'])
    expect(filteredWays(answer, 'earn', ' STAMP ', 'off', w => w.key).map(w => w.key)).toEqual(['stamp_card'])
    expect(filteredWays(answer, 'bonus', 'REFERRALS', 'all', w => w.key).map(w => w.key)).toEqual(['referrals'])
  })
  it.each([['50', '5', 250], ['10,50', '1.5', 15], ['0', '5', 0], ['2', '0.01', 0], ['', '5', null], ['-1', '5', null], ['NaN', '5', null], ['50', '0', null], ['50', '', null], ['1e50', '1e50', null]])('base example %s × %s gives %s without an award', (amount, rate, result) => {
    expect(baseExample(String(amount), String(rate))).toBe(result)
  })
  it('registers every dynamic English phrase exactly; the locale suite checks all five translations', () => {
    expect(en).toEqual(EARN_WORDS)
  })
})
