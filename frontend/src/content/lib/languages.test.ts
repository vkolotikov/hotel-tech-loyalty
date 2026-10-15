import { describe, expect, it } from 'vitest'
import { LANGUAGES, languageName } from './languages'

describe('languages', () => {
  it('names a language in the reader\'s language, and falls back to the code', () => {
    expect(languageName('de', 'en')).toBe('German')
    expect(languageName('de', 'ru')).toBe('немецкий')
    expect(languageName('not a code', 'en')).toBe('not a code')
    expect(LANGUAGES).toContain('lv')
  })
})
