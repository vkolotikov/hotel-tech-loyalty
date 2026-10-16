import { describe, expect, it } from 'vitest'
import en from '../i18n/content.en.json'
import type { PostDetail } from '../lib/types'
import { BRIEF_TEXT, REWRITE_TEXT, changes, createBody, formOf, invalidFields, isDirty, newForm, newer, rebase, withChannels } from './panelState'

describe('fallback words', () => {
  it('name the rewrites and the brief\'s fields in the English bundle\'s words', () => {
    expect(en.panel.ai.rewrite_type).toEqual(REWRITE_TEXT)
    expect(en.panel.ai.brief_field).toEqual(BRIEF_TEXT)
  })
})

const detail: PostDetail = {
  id: 5, platform: 'instagram', scheduled_date: '2026-10-07', scheduled_time: '09:00', status: 'draft',
  title: null, hook: 'Three colours', topic: 'Autumn', pillar_id: 2, image_url: null, updated_at: '2026-10-05T06:00:00.000000Z',
  language: 'en', goal: null, format: null, main_copy: 'Warm tones.\nBook now.', short_copy: null, cta: null, hashtags: ['#autumn', 'hair'],
  audience_id: null, campaign_id: null, weekday_role: null, funnel_stage: null, post_type: null, strategic_reason: null,
  quality: null, published_url: null, published_at: null, generated_by: 'manual', hook_alternatives: [], visual_brief: null,
}

describe('formOf and newForm', () => {
  it('turns a post into the inputs\' text, with "" for none', () => {
    expect(formOf(detail)).toEqual({
      platform: 'instagram', scheduled_date: '2026-10-07', scheduled_time: '09:00', status: 'draft', pillar_id: '2', audience_id: '',
      language: 'en', topic: 'Autumn', hook: 'Three colours', main_copy: 'Warm tones.\nBook now.', cta: '', hashtags: '#autumn hair',
    })
  })

  it('starts a new post on the slot\'s day and platform, or the brand\'s first platform, as a draft', () => {
    expect(newForm({ date: '2026-10-09', platform: 'linkedin' }, ['instagram', 'linkedin'])).toMatchObject({ scheduled_date: '2026-10-09', platform: 'linkedin', status: 'draft', language: '' })
    expect(newForm({ date: null, platform: null }, ['tiktok'])).toMatchObject({ scheduled_date: '', platform: 'tiktok' })
  })

  it('starts a post with no slot on the brand\'s own first channel, not the first platform HexaTech knows', () => {
    expect(newForm({ date: null, platform: null }, ['linkedin', 'instagram'], ['instagram', 'facebook'])).toMatchObject({ platform: 'instagram' })
    expect(newForm({ date: null, platform: 'facebook' }, ['linkedin'], ['instagram'])).toMatchObject({ platform: 'facebook' })
  })
})

describe('rebase', () => {
  // An AI answer, an action or a save arrives while the person keeps typing: their typing must survive it.
  it('keeps the fields the person changed and takes the server\'s copy for the rest', () => {
    const base = formOf(detail)
    const draft = { ...base, hook: 'Typed while waiting' }
    const fresh = formOf({ ...detail, main_copy: 'Written by the AI.', scheduled_date: '2026-10-09' })
    expect(rebase(base, draft, fresh)).toEqual({ ...fresh, hook: 'Typed while waiting' })
  })

  it('is the server\'s copy when nothing was changed', () => {
    const base = formOf(detail)
    const fresh = formOf({ ...detail, hook: 'New hook' })
    expect(rebase(base, base, fresh)).toEqual(fresh)
  })
})

describe('newer', () => {
  it('says whether a version was saved after another', () => {
    expect(newer('2026-10-05T06:01:00.000000Z', '2026-10-05T06:00:00.000000Z')).toBe(true)
    expect(newer('2026-10-05T06:00:00.000000Z', '2026-10-05T06:00:00.000000Z')).toBe(false)
    expect(newer('2026-10-05T05:59:00.000000Z', '2026-10-05T06:00:00.000000Z')).toBe(false)
  })
})

describe('changes', () => {
  const base = formOf(detail)

  it('sends only what changed, as the server takes it', () => {
    expect(changes(base, base)).toEqual({})
    expect(changes(base, { ...base, hook: '  New hook ', pillar_id: '', scheduled_time: '' })).toEqual({ hook: 'New hook', pillar_id: null, scheduled_time: null })
    expect(changes(base, { ...base, audience_id: '4' })).toEqual({ audience_id: 4 })
  })

  it('sees no change in a reshuffled spelling of the same hashtags, in spaces around a word, or in an emptied language', () => {
    expect(changes(base, { ...base, hashtags: '#autumn,  hair' })).toEqual({})
    expect(changes(base, { ...base, topic: ' Autumn ' })).toEqual({})
    expect(changes(base, { ...base, language: '' })).toEqual({})
    expect(changes(base, { ...base, hashtags: '#autumn' })).toEqual({ hashtags: ['#autumn'] })
  })

  it('keeps the lines of the text as written', () => {
    expect(changes(base, { ...base, main_copy: 'One.\n\nTwo.' })).toEqual({ main_copy: 'One.\n\nTwo.' })
  })

  it('is dirty only when something would be sent', () => {
    expect(isDirty(base, base)).toBe(false)
    expect(isDirty(base, { ...base, cta: 'Book' })).toBe(true)
  })
})

describe('createBody and invalidFields', () => {
  it('a new post sends every field that holds something', () => {
    expect(createBody(newForm({ date: '2026-10-09', platform: 'linkedin' }, ['linkedin'])))
      .toEqual({ platform: 'linkedin', scheduled_date: '2026-10-09', status: 'draft' })
  })

  it('marks the form fields a refused save names', () => {
    expect(invalidFields({ hook: ['too long'], 'hashtags.0': ['too long'], updated_at: ['required'] })).toEqual(['hook', 'hashtags'])
    expect(invalidFields(undefined)).toEqual([])
  })
})

describe('a new post\'s time', () => {
  it('starts at the time its day or slot gave, else with none', () => {
    expect(newForm({ date: '2026-10-09', platform: 'instagram', time: '08:30' }, ['instagram']).scheduled_time).toBe('08:30')
    expect(newForm({ date: '2026-10-09', platform: 'instagram' }, ['instagram']).scheduled_time).toBe('')
  })

  it('starts a New post on the brand\'s first channel at that channel\'s usual time when the channels are already known', () => {
    expect(newForm({ date: '2026-10-09', platform: null }, ['instagram'], ['linkedin'], { linkedin: '08:00' })).toMatchObject({ platform: 'linkedin', scheduled_time: '08:00' })
    expect(newForm({ date: '2026-10-09', platform: null, time: '10:30' }, ['instagram'], ['linkedin'], { linkedin: '08:00' }).scheduled_time).toBe('10:30')
  })
})

// Release check (Plan 3B Task 11): a "+" clicked before the brand's channels arrived started at the suggested 11:00,
// not the channel's own 08:30. The panel applies a new post's channel and usual time once the channels are known.
describe('withChannels', () => {
  const editing = (platform: 'instagram' | 'linkedin', time = '') => {
    const form = { ...newForm({ date: '2026-10-09', platform }, ['instagram', 'linkedin']), scheduled_time: time }
    return { base: form, draft: form, post: null }
  }

  it('gives a new post with no time its platform\'s usual time, and keeps a time it was given', () => {
    expect(withChannels(editing('instagram'), { date: '2026-10-09', platform: 'instagram' }, ['instagram'], { instagram: '08:30' }).draft.scheduled_time).toBe('08:30')
    expect(withChannels(editing('instagram', '10:00'), { date: '2026-10-09', platform: 'instagram', time: '10:00' }, ['instagram'], { instagram: '08:30' }).draft.scheduled_time).toBe('10:00')
  })

  it('moves a new post with no platform to the brand\'s first channel at its usual time', () => {
    const out = withChannels(editing('instagram'), { date: '2026-10-09', platform: null }, ['linkedin'], { linkedin: '08:00' })
    expect(out.draft).toMatchObject({ platform: 'linkedin', scheduled_time: '08:00' })
    expect(out.base).toMatchObject({ platform: 'linkedin', scheduled_time: '08:00' })
  })

  it('keeps a time the person typed, and answers the same editing when nothing changes', () => {
    const typed = { ...editing('instagram'), draft: { ...editing('instagram').draft, scheduled_time: '07:15' } }
    expect(withChannels(typed, { date: '2026-10-09', platform: 'instagram' }, ['instagram'], { instagram: '08:30' }).draft.scheduled_time).toBe('07:15')
    const settled = editing('instagram', '08:30')
    expect(withChannels(settled, { date: '2026-10-09', platform: 'instagram' }, ['instagram'], { instagram: '08:30' })).toBe(settled)
  })
})
