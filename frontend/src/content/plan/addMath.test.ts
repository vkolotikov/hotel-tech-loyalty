import { describe, expect, it } from 'vitest'
import type { Channel } from '../lib/types'
import { canAdd, clickAdds, newPostDraft, usualTimes } from './addMath'

const channel = (id: number, platform: Channel['platform'], more: Partial<Channel> = {}): Channel => ({
  id, platform, label: platform, url: null, goal: null, role: null, cta_style: null, visual_style: null, link_policy: null, tone_override: null,
  default_language: null, emoji_policy: null, hashtag_policy: null, posts_per_week: 3, preferred_formats: null, frequency: null, audience_id: null,
  active: true, post_time: null, ...more,
})
/** An element whose `closest` finds the selectors listed (as the browser's would for what is around the click). */
const at = (...around: string[]) => ({ closest: (selector: string) => (selector.split(', ').some(s => around.includes(s)) ? {} : null) })

describe('canAdd', () => {
  // Review Focus 2: judged on the venue's today (the server's), never this computer's date.
  it('takes a new post from the venue\'s today on, never on a day already gone', () => {
    expect(canAdd('2026-10-07', '2026-10-07')).toBe(true)
    expect(canAdd('2026-10-08', '2026-10-07')).toBe(true)
    expect(canAdd('2026-10-06', '2026-10-07')).toBe(false)
  })
})

describe('clickAdds', () => {
  it('counts a click on a day\'s empty space, not on a card, a slot or a control', () => {
    expect(clickAdds(at())).toBe(true)
    expect(clickAdds(at('[data-post]'))).toBe(false)
    expect(clickAdds(at('[data-slot]'))).toBe(false)
    expect(clickAdds(at('button'))).toBe(false)
    expect(clickAdds(null)).toBe(false)
  })
})

describe('newPostDraft', () => {
  const channels = [channel(1, 'linkedin', { active: false }), channel(2, 'instagram', { post_time: '08:30' }), channel(3, 'facebook')]

  it('starts on the day\'s first open slot, at its channel\'s usual time', () => {
    expect(newPostDraft('2026-10-09', [{ date: '2026-10-08', platform: 'instagram' }, { date: '2026-10-09', platform: 'facebook' }], channels, 'beauty'))
      .toEqual({ date: '2026-10-09', platform: 'facebook', time: '10:00' })
  })

  it('else on the brand\'s first active channel, else on no platform (the panel then takes the first one)', () => {
    expect(newPostDraft('2026-10-09', [], channels, 'beauty')).toEqual({ date: '2026-10-09', platform: 'instagram', time: '08:30' })
    expect(newPostDraft('2026-10-09', [], [], 'beauty')).toEqual({ date: '2026-10-09', platform: null, time: null })
  })
})

describe('usualTimes', () => {
  it('gives each platform its first active channel\'s usual time', () => {
    expect(usualTimes([channel(1, 'instagram', { active: false, post_time: '07:00' }), channel(2, 'instagram'), channel(3, 'instagram', { post_time: '21:00' })], 'fitness'))
      .toEqual({ instagram: '06:30' })
  })
})
