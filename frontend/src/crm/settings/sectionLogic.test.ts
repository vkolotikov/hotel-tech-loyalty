import { describe, expect, it } from 'vitest'
import { editingAfterRemove } from './canned'
import { presetList, presetOutcome } from './customFields'
import { flaggedParts, neighbours, pickPart, withPart, withSection } from './sectionLogic'
import { CHAT_PARTS, LOOK_PARTS, partOf, tabOfPart } from '../widget/tabs'
import { BEHAVIOUR_PARTS, behaviourPartOf } from '../assistant/lists'

const PARTS = ['site', 'style', 'words'] as const

describe('form parts in the address', () => {
  it('opens the part ?part= names, else the first', () => {
    expect(pickPart('style', PARTS)).toBe('style')
    expect(pickPart(null, PARTS)).toBe('site')
    expect(pickPart('hours', PARTS)).toBe('site')
  })

  it('writes the part into the address, leaving it out for the first and keeping the rest', () => {
    const prev = new URLSearchParams('tab=look&lead=4')
    expect(withPart(prev, PARTS, 'words').toString()).toBe('tab=look&lead=4&part=words')
    expect(withPart(new URLSearchParams('tab=look&part=words'), PARTS, 'site').toString()).toBe('tab=look')
  })

  it('drops the open part (or a section\'s open item) when the page\'s section changes', () => {
    expect(withSection(new URLSearchParams('tab=look&part=words'), 'behaviour', 'look').toString()).toBe('tab=behaviour')
    expect(withSection(new URLSearchParams('tab=behaviour&part=hours&lead=2'), 'look', 'look').toString()).toBe('lead=2')
    expect(withSection(new URLSearchParams('tab=templates&template=3'), 'fields', 'canned', 'tab', 'template').toString()).toBe('tab=fields')
  })

  it('names the parts before and after, none past either end', () => {
    expect(neighbours(PARTS, 'site')).toEqual({ prev: null, next: 'style' })
    expect(neighbours(PARTS, 'style')).toEqual({ prev: 'site', next: 'words' })
    expect(neighbours(PARTS, 'words')).toEqual({ prev: 'style', next: null })
  })

  it('marks every part holding a refused field, once', () => {
    expect([...flaggedParts(['primary_color', 'bot_text', 'handoff_email'] as const, f => (f === 'handoff_email' ? 'person' : 'style'))].sort()).toEqual(['person', 'style'])
    expect(flaggedParts([], () => 'style').size).toBe(0)
  })
})

describe('the widget\'s and the assistant\'s parts', () => {
  it('puts each refused widget field in the part that shows it, and each part in its section', () => {
    expect(partOf('primary_color')).toBe('style')
    expect(partOf('header_gradient_end')).toBe('style')
    expect(partOf('welcome_message')).toBe('words')
    expect(partOf('suggestions')).toBe('questions')
    expect(partOf('branding_text')).toBe('picture')
    expect(partOf('handoff_whatsapp')).toBe('person')
    expect(partOf('gdpr_consent_text')).toBe('privacy')
    expect(partOf('offline_message')).toBe('hours')
    expect(partOf('mon')).toBe('hours')
    for (const p of LOOK_PARTS) expect(tabOfPart(p)).toBe('look')
    for (const p of CHAT_PARTS) expect(tabOfPart(p)).toBe('behaviour')
  })

  it('puts each refused behaviour field in its part', () => {
    expect(behaviourPartOf('assistant_name')).toBe('basics')
    expect(behaviourPartOf('goal')).toBe('identity')
    expect(behaviourPartOf('rule')).toBe('rules')
    expect(behaviourPartOf('fallback_message')).toBe('handover')
    expect(behaviourPartOf('model')).toBe('model')
    expect(behaviourPartOf('custom_instructions')).toBe('more')
    expect(BEHAVIOUR_PARTS[0]).toBe('basics')
  })
})

describe('canned replies edited in place', () => {
  it('keeps the same reply open after another one is removed', () => {
    expect(editingAfterRemove(null, 2)).toBeNull()
    expect(editingAfterRemove(2, 2)).toBeNull()
    expect(editingAfterRemove(3, 1)).toBe(2)
    expect(editingAfterRemove(1, 3)).toBe(1)
  })
})

describe('custom-field presets', () => {
  it('reads the server\'s list safely and says what applying one did', () => {
    expect(presetList([{ key: 'medical', label: 'Medical / Healthcare', icon: 'stethoscope', description: 'DOB…', field_count: 12 }, { label: 'no key' }, null]))
      .toEqual([{ key: 'medical', label: 'Medical / Healthcare', icon: 'stethoscope', description: 'DOB…', field_count: 12 }])
    expect(presetList({ not: 'a list' })).toEqual([])
    expect(presetList([{ key: 'x' }])).toEqual([{ key: 'x', label: 'x', icon: 'briefcase', description: '', field_count: 0 }])
    expect(presetOutcome({ created_count: 4 })).toEqual({ added: 4 })
    expect(presetOutcome({ created_count: 0 })).toEqual({ added: 0 })
    expect(presetOutcome(undefined)).toEqual({ added: 0 })
  })
})
