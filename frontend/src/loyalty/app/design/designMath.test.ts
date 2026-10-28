import { describe, expect, it } from 'vitest'
import { applyColorMode, colorMode } from './designMath'
import { lookBody, lookChanged, type LookForm } from '../appMath'
import type { LookOptions } from '../types'
import en from '../../i18n/carddesign.en.json'
import ru from '../../i18n/carddesign.ru.json'
import de from '../../i18n/carddesign.de.json'
import fr from '../../i18n/carddesign.fr.json'
import es from '../../i18n/carddesign.es.json'

const form: LookForm = { colors: { primary: '#aa1234', background: '#111111', text: '#ffffff', success: '#22aa55' }, card_style: 'glass', radius: 24, button_style: 'outline', accent_intensity: 'bold', preset: null }
const options: LookOptions = { colors: Object.keys(form.colors), card_styles: ['gradient', 'solid', 'glass'], button_styles: ['filled', 'outline'], accent_intensities: ['bold'], radius: { min: 0, max: 32 }, presets: [], logo: { max_kb: 4096, max_edge: 4096, types: ['image/png'] }, color_modes: { light: { background: '#f5f7fb', text: '#242c3b' }, dark: { background: '#111111', text: '#ffffff' } } }

describe('Card appearance palettes', () => {
  it('changes only supplied neutral colours and persists the result through the existing writer shape', () => {
    const next = applyColorMode(form, options, 'light')
    expect(next.colors).toEqual({ primary: '#aa1234', background: '#f5f7fb', text: '#242c3b', success: '#22aa55' })
    expect(form.colors.background).toBe('#111111')
    expect(lookBody(next, options)).toEqual({ colors: next.colors, card_style: 'glass', radius: 24, button_style: 'outline', accent_intensity: 'bold' })
    expect(lookChanged(next, { ...form, logo_url: null }, options)).toBe(true)
  })
  it('recognizes saved colours without inventing a theme mode; manual changes clear the selection', () => {
    expect(colorMode(form, options)).toBe('dark')
    expect(colorMode({ ...form, colors: { ...form.colors, background: '#222222' } }, options)).toBeNull()
    expect(colorMode({ ...form, colors: { ...form.colors, text: '#FFFFFF' } }, options)).toBe('dark')
    expect(applyColorMode(form, options, 'auto')).toBe(form)
    expect(applyColorMode(form, { ...options, color_modes: undefined }, 'dark')).toBe(form)
  })
})
describe('Card & app translations', () => {
  for (const [locale, words] of Object.entries({ ru, de, fr, es })) it(`${locale} preserves every key and interpolation`, () => {
    expect(Object.keys(words).sort()).toEqual(Object.keys(en).sort())
    for (const [key, value] of Object.entries(en)) {
      const translated = words[key as keyof typeof en]
      expect(translated.trim().length, key).toBeGreaterThan(0)
      expect(translated.match(/\{\{\w+\}\}/g)?.sort() ?? [], key).toEqual(value.match(/\{\{\w+\}\}/g)?.sort() ?? [])
    }
  })
})
