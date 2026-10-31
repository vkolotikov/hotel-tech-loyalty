import { describe, expect, it } from 'vitest'
import i18next from 'i18next'
import { BUNDLES, LANGUAGES, languageOf, nested, say } from './i18n'
import { en } from './i18n/en'
import { PORTAL_BUNDLES } from './i18n/portalBundles'
import { failureFrom } from './failure'
import { errorKey, signInErrorKey } from './errors'
import { greeting, initials, joinTokenFrom, spacedNumber } from './format'
import { pushTarget } from './alerts'
import { compareVersions, versionState } from './version'
import { DEFAULT_LOOK, lookFrom } from './theme'
import { counted, formatMoney } from '../shared/portal'

const placeholders = (text: string) => (text.match(/\{\{\w+\}\}/g) ?? []).sort().join(',')

describe('the app’s own words', () => {
  it('exist in all five languages with the same placeholders', () => {
    const keys = Object.keys(en).sort()
    for (const lang of LANGUAGES) {
      expect(Object.keys(BUNDLES[lang]).sort(), lang).toEqual(keys)
      for (const key of keys) {
        expect(placeholders(BUNDLES[lang][key as keyof typeof en]), `${lang} ${key}`).toBe(placeholders(en[key as keyof typeof en]))
        expect(BUNDLES[lang][key as keyof typeof en].trim(), `${lang} ${key}`).not.toBe('')
      }
    }
  })

  it('address members as usted in Spanish, as the portal does', () => {
    const spanish = Object.values(BUNDLES.es).join(' ')
    expect(spanish).not.toMatch(/\b(tú|tu|tus|puedes|tienes|quieres|elige|escribe|inicia|únete)\b/i)
  })

  it('resolve through i18next beside the portal’s, in each language', () => {
    expect(say('ru', 'signIn.submit')).toBe('Войти')
    expect(say('de', 'more.version', { v: '2.0.0' })).toBe('Version 2.0.0')
    expect(i18next.t('portal.nav.home', { lng: 'fr' })).toBe(PORTAL_BUNDLES.fr.nav.home)
    expect(i18next.t('portal.help.title', { lng: 'es' })).toBe((PORTAL_BUNDLES.es.help as { title: string }).title)
  })

  it('nest dotted keys for i18next', () => {
    expect(nested({ 'a.b': 'x', 'a.c': 'y', d: 'z' })).toEqual({ a: { b: 'x', c: 'y' }, d: 'z' })
  })

  it('pick a supported language from a phone’s code', () => {
    expect(languageOf('ru-LV')).toBe('ru')
    expect(languageOf('pt-BR')).toBe('en')
    expect(languageOf(null)).toBe('en')
  })
})

describe('the portal’s shared logic, in the app', () => {
  it('counts with each language’s own plural rule', () => {
    const t = (key: string, fallback: string, options: Record<string, unknown>) => i18next.t(key, { defaultValue: fallback, ...options, lng: 'ru' })
    expect(counted(t, 'home.points_to_go', 1, 'ru')).toBe(i18next.t('portal.home.points_to_go_one', { lng: 'ru', count: '1' }).replace('{{count}}', '1'))
    expect(counted(t, 'home.points_to_go', 5, 'ru')).toContain('5')
    expect(counted(t, 'home.points_to_go', 2, 'ru')).not.toBe(counted(t, 'home.points_to_go', 5, 'ru').replace('5', '2'))
  })

  it('write money in the venue’s currency and the member’s language', () => {
    expect(formatMoney(12.5, 'EUR', 'en')).toBe('€12.50')
    expect(formatMoney(12.5, 'ZZZ', 'en')).toContain('12.5')
  })
})

describe('joining by code', () => {
  it('reads the programme from a join link, the app’s own link or a bare token', () => {
    const token = 'Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z'
    expect(joinTokenFrom(`https://app.hexa-tech.uk/portal/join?org=${token}`)).toEqual({ org: token, ref: null })
    expect(joinTokenFrom(`https://app.hexa-tech.uk/portal/join?org=${token}&ref=ANNA22`)).toEqual({ org: token, ref: 'ANNA22' })
    expect(joinTokenFrom(`hotel-loyalty://join?org=${token}`)).toEqual({ org: token, ref: null })
    expect(joinTokenFrom(`  ${token}  `)).toEqual({ org: token, ref: null })
  })

  it('refuses anything else', () => {
    expect(joinTokenFrom('')).toBeNull()
    expect(joinTokenFrom('https://example.com/menu')).toBeNull()
    expect(joinTokenFrom('hello')).toBeNull()
  })
})

describe('the venue’s look', () => {
  it('takes the venue’s dark-page accent and face, field by field', () => {
    expect(lookFrom({ accent: { dark_hex: '#8fb3ff', dark_ink: '#0b1220', dark_deep: '#4a6fd0' }, display_face: 'playfair' }))
      .toEqual({ accent: '#8fb3ff', ink: '#0b1220', deep: '#4a6fd0', face: 'playfair' })
  })

  it('falls back to the gold and Cormorant for anything missing or odd', () => {
    expect(lookFrom(null)).toEqual(DEFAULT_LOOK)
    expect(lookFrom({ accent: { dark_hex: 'blue', dark_ink: null }, display_face: 'comic' })).toEqual(DEFAULT_LOOK)
  })
})

describe('failures and their words', () => {
  it('keep the server’s own sentence for the screens that show it', () => {
    expect(failureFrom(422, { message: 'The given data was invalid.', errors: { email: ['The email has already been taken.'] } }).message).toBe('The email has already been taken.')
    expect(failureFrom(422, { error: 'This sign-up link is not valid.' }).message).toBe('This sign-up link is not valid.')
    expect(failureFrom(0, null)).toMatchObject({ code: 'network', status: 0 })
  })

  it('word sign-in and other failures', () => {
    expect(signInErrorKey({ code: 'invalid', status: 422 })).toBe('error.invalid')
    expect(signInErrorKey({ code: 'network', status: 0 })).toBe('error.network')
    expect(errorKey({ code: 'unknown', status: 429 })).toBe('error.too_many')
    expect(errorKey({ code: 'unknown', status: 500 })).toBe('error.unknown')
  })
})

describe('small helpers', () => {
  it('greet by the hour, write initials and space long numbers', () => {
    expect(greeting(8)).toBe('home.morning')
    expect(greeting(14)).toBe('home.afternoon')
    expect(greeting(20)).toBe('home.evening')
    expect(initials('Ada Lovelace')).toBe('AL')
    expect(spacedNumber('12345678')).toBe('1234 5678')
    expect(spacedNumber('LS-001001')).toBe('LS-001001')
  })

  it('open every notification in the inbox', () => {
    expect(pushTarget({ type: 'points_earned' })).toBe('/inbox')
    expect(pushTarget(null)).toBe('/inbox')
  })

  it('compare app versions as numbers', () => {
    expect(compareVersions('2.10.0', '2.9.9')).toBeGreaterThan(0)
    expect(versionState('1.9.0', { min_version: '2.0.0', latest_version: '2.0.0' })).toBe('update_required')
    expect(versionState('2.0.0', { min_version: '2.0.0', latest_version: '2.1.0' })).toBe('update_available')
  })
})
