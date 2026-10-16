import { describe, expect, it } from 'vitest'
import type { Template } from '../lib/types'
import { newForm } from './panelState'
import { applyTemplate, blanksIn, pillarIdByName, replacesText, templateFields } from './templateApply'

const offer: Template = {
  id: 3, name: 'Seasonal offer', platform: 'instagram', pillar_name: 'Offers', topic: null, hook: 'Book your [treatment] before [date]',
  main_copy: 'Our [treatment] is back.', cta: 'Book now', hashtags: ['#autumn', '#glow'],
}
const empty = newForm({ date: '2026-10-20', platform: 'linkedin' }, ['instagram', 'linkedin'])
const pillars = [{ id: 7, name: 'Offers', active: true }, { id: 8, name: 'Old', active: false }]

describe('blanks (spec 2026-10-16 §5.1, §5.3)', () => {
  it('finds each blank once, in the order it first appears in the topic, hook, text and call to action', () => {
    expect(blanksIn({ topic: '[date] sale', hook: 'Book your [treatment] before [date]', main_copy: 'a [x]\n[y', cta: `[] [${'z'.repeat(41)}]` }))
      .toEqual(['[date]', '[treatment]', '[x]'])
  })
})

describe('applying a template (spec §5.3)', () => {
  // Review Focus 4: it asks only when it would replace words already written; the blanks line counts what is left.
  it('asks first only when it would replace words already written', () => {
    expect(replacesText(empty, offer)).toBe(false)
    expect(replacesText({ ...empty, hook: 'My own hook' }, offer)).toBe(true)
    expect(replacesText({ ...empty, topic: 'My topic' }, offer)).toBe(false) // the template has no topic
    expect(replacesText({ ...empty, cta: 'Book now' }, offer)).toBe(false) // the same words
  })

  it('fills what the template has and keeps the rest; takes its platform, and its pillar by name', () => {
    const next = applyTemplate({ ...empty, topic: 'Autumn' }, offer, pillars)
    expect(next).toMatchObject({
      platform: 'instagram', pillar_id: '7', topic: 'Autumn', hook: 'Book your [treatment] before [date]', main_copy: 'Our [treatment] is back.',
      cta: 'Book now', hashtags: '#autumn #glow', scheduled_date: '2026-10-20',
    })
    expect(blanksIn(next)).toEqual(['[treatment]', '[date]'])
    const kept = applyTemplate({ ...empty, pillar_id: '8' }, { ...offer, platform: null, pillar_name: 'Gone', hashtags: [] }, pillars)
    expect(kept).toMatchObject({ platform: 'linkedin', pillar_id: '8', hashtags: '' })
  })

  it('takes the active strategy’s pillar of the template’s name, else none', () => {
    expect(pillarIdByName('offers ', pillars)).toBe('7')
    expect(pillarIdByName('Old', pillars)).toBe('')
    expect(pillarIdByName(null, pillars)).toBe('')
    expect(templateFields(offer, [])).toEqual({
      topic: '', hook: 'Book your [treatment] before [date]', main_copy: 'Our [treatment] is back.', cta: 'Book now', hashtags: '#autumn #glow', pillar_id: '',
    })
  })
})
