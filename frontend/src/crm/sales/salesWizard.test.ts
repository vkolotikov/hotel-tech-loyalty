import { describe, expect, it } from 'vitest'
import { addFiles, editedFields, effectiveValue, missingSuggestions, websiteAddress, validWebsite, type Profile } from './salesWizard'

const profile: Profile = {
  brand: { id: 1, name: 'Studio' }, steps: { company: ['name', 'website'], market: ['usp'], services: ['offerings', 'terms'] },
  fields: { name: 'Studio', usp: 'Reviewed offer', offerings: 'Engraving' },
  manual: { offerings: 'Engraving' }, inherited: { usp: 'Reviewed offer' }, sources: {}, revision: 0,
}

describe('Our business setup', () => {
  it('fills blanks without replacing approved CRM or inherited values', () => {
    const suggestions = {
      usp: { value: 'Suggested pitch', sources: [] },
      offerings: { value: 'Suggested offer', sources: [] },
      terms: { value: 'One sample included', sources: [] },
    }
    expect(missingSuggestions(profile, profile.manual, suggestions)).toEqual({ terms: 'One sample included' })
    expect(effectiveValue(profile, { ...profile.manual, usp: '' }, 'usp')).toBe('Reviewed offer')
    expect(effectiveValue(profile, { ...profile.manual, usp: 'Manual override' }, 'usp')).toBe('Manual override')
    expect(missingSuggestions(profile, { offerings: '' }, suggestions)).toEqual({ offerings: 'Suggested offer', terms: 'One sample included' })
  })

  it('reuses brand records and submits only the fields a manager changed', () => {
    const current = { ...profile, defaults: { website: 'https://studio.example.org', overview: 'A copper studio' } }
    expect(effectiveValue(current, {}, 'website')).toBe('https://studio.example.org')
    expect(missingSuggestions(current, {}, { overview: { value: 'Older summary', sources: [] } })).toEqual({})
    expect(editedFields({ voice: ' Direct ', goal: '' }, { voice: 'Direct', goal: 'Old goal', terms: '10 minimum' })).toEqual({ goal: '' })
  })

  it('accepts a bare domain and checks URL schemes before capture', () => {
    expect(websiteAddress(' example.com ')).toBe('https://example.com')
    expect(websiteAddress('https://example.com/catalog')).toBe('https://example.com/catalog')
    expect(websiteAddress('')).toBe('')
    expect(validWebsite('ftp://example.com')).toBe(false)
    expect(validWebsite('https://login:secret@example.test')).toBe(false)
  })

  it('keeps the selected files when extra files exceed the upload limits', () => {
    const limits = { count: 2, each_bytes: 6, total_bytes: 8, extensions: ['pdf', 'txt'] }
    const first = new File(['abcde'], 'brief.PDF', { lastModified: 2 })
    const duplicate = new File(['abcde'], 'brief.PDF', { lastModified: 2 })
    const second = new File(['abcd'], 'terms.txt', { lastModified: 3 })
    expect(addFiles([first], [duplicate], limits)).toEqual({ files: [first] })
    expect(addFiles([first], [second], limits)).toEqual({ files: [first], error: 'file_total' })
    expect(addFiles([], [new File(['abc'], 'unknown.exe')], limits)).toEqual({ files: [], error: 'file_type' })
  })
})
