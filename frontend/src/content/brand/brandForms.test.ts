import { describe, expect, it } from 'vitest'
import { addTags, removeTag, asDays, asList, asMix, asPositioning, asRhythm, asText, changedFields, orNull } from './brandForms'

describe('removeTag', () => {
  // A tag stored twice (the old wizard allowed it): its × removes that one, not both.
  it('removes the tag at its place only', () => {
    expect(removeTag(['Care', 'Care', 'Calm'], 0)).toEqual(['Care', 'Calm'])
    expect(removeTag(['Care', 'Calm'], 1)).toEqual(['Care'])
  })
})

describe('reading what the old wizard and the AI wrote', () => {
  it('reads a content mix stored as numbers in text', () => {
    expect(asMix({ education: '40', myths: ' 25 ', proof: 'lots' })).toEqual({ education: 40, myths: 25 })
  })

  it('reads text and lists of any shape', () => {
    expect(asText('Warm')).toBe('Warm')
    expect(asText(42)).toBe('42')
    expect(asText(null)).toBe('')
    expect(asList(['Care', ' ', 'Speed ', 7])).toEqual(['Care', 'Speed'])
    expect(asList('One value')).toEqual(['One value'])
    expect(asList({ a: 1 })).toEqual([])
  })

  it('reads positioning written as plain text as the transformation, and keeps parts it does not edit', () => {
    expect(asPositioning('From quick cuts to healthy hair')).toEqual({ transformation: 'From quick cuts to healthy hair' })
    expect(asPositioning({ old_way: 'Quick', beliefs: 'Care first', extra: 'kept' }))
      .toEqual({ old_way: 'Quick', new_way: '', transformation: '', beliefs: ['Care first'], extra: 'kept' })
    expect(asPositioning(null)).toEqual({})
  })

  it('reads a weekly rhythm with all seven days, keeping what each day had', () => {
    const rhythm = asRhythm({ monday: { role: 'proof', description: 'From the AI' }, funday: { role: 'x' } })
    expect(Object.keys(rhythm)).toEqual(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
    expect(rhythm.monday).toEqual({ role: 'proof', notes: '', description: 'From the AI' })
    expect(rhythm.sunday).toEqual({ role: '', notes: '' })
  })

  it('reads posting days with all seven, off unless on', () => {
    expect(asDays(null)).toEqual({ mon: false, tue: false, wed: false, thu: false, fri: false, sat: false, sun: false })
    expect(asDays({ mon: true, wed: 1, fri: 'yes' })).toMatchObject({ mon: true, wed: true, fri: false })
  })

  it('reads a content mix as whole numbers, leaving out anything else', () => {
    expect(asMix({ education: 24.6, myths: 'lots', proof: 10 })).toEqual({ education: 25, proof: 10 })
    expect(asMix([1, 2])).toEqual({})
  })
})

describe('changedFields', () => {
  // Review Focus 2: a section sends only its own fields, and only those the manager changed.
  it('keeps only the fields that changed, comparing lists and objects by value', () => {
    const before = { usp: 'Organic', brand_values: ['Care'], positioning: { old_way: 'A' }, mission: null as string | null }
    expect(changedFields(before, { ...before })).toEqual({})
    expect(changedFields(before, { ...before, brand_values: ['Care', 'Calm'], mission: 'Hair for life' }))
      .toEqual({ brand_values: ['Care', 'Calm'], mission: 'Hair for life' })
  })

  it('turns an emptied text into null for the server', () => {
    expect(orNull('  ')).toBeNull()
    expect(orNull(' Organic ')).toBe('Organic')
  })
})

describe('addTags', () => {
  it('adds what was typed or pasted, split on commas and lines, trimmed, without doubles', () => {
    expect(addTags(['Care'], 'calm, Care ,  speed\nlight')).toEqual(['Care', 'calm', 'speed', 'light'])
    expect(addTags(['Care'], ' , ')).toEqual(['Care'])
  })
})
