import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api', () => ({ api: {} }))

import type { BrandPayload, PostDetail, Template } from '../lib/types'
import { removeTemplate, saveTemplate, templateBody, templateForm, templateFromPost, templateProblem, withTemplates } from './templateActions'

const offer: Template = {
  id: 3, name: 'Seasonal offer', platform: 'instagram', pillar_name: 'Offers', topic: null, hook: 'Book your [treatment]',
  main_copy: 'Our [treatment] is back.', cta: 'Book now', hashtags: ['#autumn'],
}

describe('the template editor’s rules (spec 2026-10-16 §5.1)', () => {
  it('holds a template as text, and stops a save with no name or more than 30 hashtags', () => {
    expect(templateForm(offer)).toEqual({
      name: 'Seasonal offer', platform: 'instagram', pillar_name: 'Offers', topic: '', hook: 'Book your [treatment]',
      main_copy: 'Our [treatment] is back.', cta: 'Book now', hashtags: '#autumn',
    })
    expect(templateProblem({ ...templateForm(offer), name: '  ' })).toBe('invalid')
    expect(templateProblem({ ...templateForm(offer), hashtags: Array.from({ length: 31 }, (_, i) => `#t${i}`).join(' ') })).toBe('too_many_tags')
    expect(templateProblem(templateForm(offer))).toBeNull()
  })

  it('sends everything for a new template, only the changes for an edit, and nothing for no change', () => {
    expect(templateBody({ ...templateForm(null), name: ' Welcome ', hook: 'Hi [name]', hashtags: '#a, #b' }, null)).toEqual({
      name: 'Welcome', platform: null, pillar_name: null, topic: null, hook: 'Hi [name]', main_copy: null, cta: null, hashtags: ['#a', '#b'],
    })
    expect(templateBody({ ...templateForm(offer), cta: 'Book today' }, offer)).toEqual({ cta: 'Book today' })
    expect(templateBody({ ...templateForm(offer), hashtags: '#autumn #glow' }, offer)).toEqual({ hashtags: ['#autumn', '#glow'] })
    expect(templateBody(templateForm(offer), offer)).toEqual({})
  })
})

describe('saving and removing', () => {
  it('creates, edits with only what changed, sends nothing for no change, removes by id; keeps the answer’s list', async () => {
    const list = [offer]
    const api = {
      createTemplate: vi.fn(async () => ({ template: offer, templates: list })),
      updateTemplate: vi.fn(async () => ({ template: offer, templates: list })),
      deleteTemplate: vi.fn(async () => ({ templates: [] })),
    }
    const setTemplates = vi.fn()
    await saveTemplate({ api, setTemplates }, null, { ...templateForm(null), name: 'Welcome' })
    expect(api.createTemplate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Welcome', hashtags: [] }))
    await saveTemplate({ api, setTemplates }, offer, { ...templateForm(offer), cta: 'Book today' })
    expect(api.updateTemplate).toHaveBeenCalledWith(3, { cta: 'Book today' })
    await saveTemplate({ api, setTemplates }, offer, templateForm(offer))
    expect(api.updateTemplate).toHaveBeenCalledTimes(1)
    await removeTemplate({ api, setTemplates }, 3)
    expect(api.deleteTemplate).toHaveBeenCalledWith(3)
    expect(setTemplates.mock.calls).toEqual([[list], [list], [[]]])
  })

  it('puts a changed list into the brand, keeping the rest', () => {
    const brand = { profile: null, snippets: [], templates: [] } as unknown as BrandPayload
    expect(withTemplates(brand, [offer])).toEqual({ profile: null, snippets: [], templates: [offer] })
  })
})

describe('Save as template (spec §5.2)', () => {
  it('starts from the post: its words and platform, its pillar by name, the topic (else the hook) as the name, cut to 80', () => {
    const post = { platform: 'linkedin', topic: null, hook: 'h'.repeat(90), main_copy: 'Text', cta: null, hashtags: ['#a'] } as unknown as PostDetail
    const form = templateFromPost(post, 'Education')
    expect(form.name).toHaveLength(80)
    expect(form).toMatchObject({ platform: 'linkedin', pillar_name: 'Education', hook: 'h'.repeat(90), main_copy: 'Text', cta: '', hashtags: '#a' })
    expect(templateFromPost({ ...post, topic: 'Autumn colours' }, null)).toMatchObject({ name: 'Autumn colours', pillar_name: '' })
  })
})
