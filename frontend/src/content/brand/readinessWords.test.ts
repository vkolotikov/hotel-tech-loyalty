import { describe, expect, it } from 'vitest'
import en from '../i18n/content.en.json'
import { GAP_TEXT, SECTION_TEXT } from './readinessWords'

describe('readiness words', () => {
  it('name every gap and section in the English bundle exactly as the fallbacks', () => {
    expect(en.brand.gap).toEqual(GAP_TEXT)
    expect(en.brand.section).toEqual(SECTION_TEXT)
  })
})
