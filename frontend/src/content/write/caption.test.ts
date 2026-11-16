import { describe, expect, it } from 'vitest'
import { caption, captionLimit, defaultDestination, safeChannel } from './caption'
import { newForm } from '../panel/panelState'
import { saveLabelKey } from '../panel/panelMath'

describe('manual publishing handoff', () => {
  const form = { ...newForm({ date: null, platform: 'x' }, ['x']), hook: 'Hello', main_copy: 'World', hashtags: 'news' }
  it('counts the exact final caption and appends an opted-in URL only once', () => {
    expect(caption(form, 'https://example.test/go', true)).toBe('Hello\n\nWorld\n\n#news\n\nhttps://example.test/go')
    expect(caption({ ...form, main_copy: 'World https://example.test/go' }, 'https://example.test/go', true).match(/https:/g)).toHaveLength(1)
    expect(caption(form, 'https://example.test/go', false)).toBe('Hello\n\nWorld\n\n#news')
    expect(defaultDestination('instagram')).toBe(false)
    expect(defaultDestination('tiktok')).toBe(false)
    expect(defaultDestination('linkedin')).toBe(true)
  })
  it('uses the agreed network limits without limiting blog/email drafts', () => {
    expect(['x','instagram','tiktok','linkedin','youtube','facebook','blog','email'].map(p => captionLimit(p))).toEqual([280,2200,2200,3000,5000,63206,null,null])
  })
  it('only offers safe saved channel URLs and explicitly labels publication', () => {
    expect(safeChannel('javascript:alert(1)')).toBeNull()
    expect(safeChannel('https://example.test')).toBe('https://example.test')
    expect(saveLabelKey(true, 'published', 'draft')[1]).toBe('Save and mark published')
    expect(saveLabelKey(false, 'published')[1]).toBe('Save and mark published')
    expect(saveLabelKey(true, 'published', 'published')[1]).toBe('Save')
  })
})
