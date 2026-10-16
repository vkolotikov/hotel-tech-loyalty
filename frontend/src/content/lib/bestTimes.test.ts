import { describe, expect, it } from 'vitest'
import { suggestedTimes, usualTime } from './bestTimes'

describe('suggestedTimes', () => {
  it('takes the industry\'s own times where it has them, else the platform\'s', () => {
    expect(suggestedTimes('facebook', 'beauty')).toEqual(['10:00', '19:00'])
    expect(suggestedTimes('instagram', 'beauty')).toEqual(['11:00', '19:00'])
    expect(suggestedTimes('instagram', 'fitness')).toEqual(['06:30', '18:00'])
    expect(suggestedTimes('linkedin', 'unknown')).toEqual(['08:00', '12:00'])
    expect(suggestedTimes('blog', null)).toEqual(['10:00'])
  })
})

describe('usualTime', () => {
  it('is the channel\'s own time, else the first suggested one', () => {
    expect(usualTime({ platform: 'instagram', post_time: '08:30' }, 'beauty')).toBe('08:30')
    expect(usualTime({ platform: 'instagram', post_time: null }, 'beauty')).toBe('11:00')
    expect(usualTime({ platform: 'instagram' }, 'restaurant')).toBe('11:00')
  })
})
