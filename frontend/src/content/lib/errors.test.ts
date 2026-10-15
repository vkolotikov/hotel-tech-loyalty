import { describe, expect, it } from 'vitest'
import en from '../i18n/content.en.json'
import { ERRORS, errorKey } from './errors'

describe('refusal words', () => {
  it('every family has an "unknown", and the English bundle says exactly the fallbacks', () => {
    for (const [family, words] of Object.entries(ERRORS)) {
      expect(words, family).toHaveProperty('unknown')
      expect((en as Record<string, { error?: unknown }>)[family]?.error, `content.${family}.error`).toEqual(words)
    }
  })

  it('a code the family does not know reads as unknown; the server\'s words are never used', () => {
    expect(errorKey('move', 'changed_elsewhere')).toEqual(['content.move.error.changed_elsewhere', ERRORS.move.changed_elsewhere])
    expect(errorKey('move', 'something_new')).toEqual(['content.move.error.unknown', ERRORS.move.unknown])
    expect(errorKey('save', 'toString')).toEqual(['content.save.error.unknown', ERRORS.save.unknown])
  })
})
