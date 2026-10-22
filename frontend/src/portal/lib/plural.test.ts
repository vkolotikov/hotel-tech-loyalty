import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import i18next from 'i18next'
import { COUNTED, PLURAL_FORMS, counted, nightsAndGuests, type CountedKey } from './plural'

const LOCALES = ['en', 'ru', 'de', 'fr', 'es'] as const
const I18N_DIR = path.resolve(__dirname, '../i18n')
const PORTAL_DIR = path.resolve(__dirname, '..')
const KEYS = Object.keys(COUNTED) as CountedKey[]

function bundle(locale: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(I18N_DIR, `portal.${locale}.json`), 'utf8'))
}
function at(json: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), json)
}
function flatten(o: unknown, prefix = ''): string[] {
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]))
}

/** A real i18next with the five portal bundles, registered the way registerPortalLocales() does. */
async function i18nWith(lng: string) {
  const instance = i18next.createInstance()
  await instance.init({
    lng, fallbackLng: 'en', defaultNS: 'common', ns: ['common'], interpolation: { escapeValue: false },
    resources: Object.fromEntries(LOCALES.map(l => [l, { common: { portal: bundle(l) } }])),
  })
  return instance
}

describe('count phrases agree with their number', () => {
  for (const locale of LOCALES) {
    it(`${locale}: every family carries one/few/many/other, each with its {{count}}, and no plain key is left behind`, () => {
      const json = bundle(locale)
      const problems: string[] = []
      for (const key of KEYS) {
        if (at(json, key) !== undefined) problems.push(`${key} is still a plain key`)
        for (const form of PLURAL_FORMS) {
          const v = at(json, `${key}_${form}`)
          if (typeof v !== 'string' || !v.trim()) problems.push(`${key}_${form} is missing`)
          else if (!v.includes('{{count}}')) problems.push(`${key}_${form} has no {{count}}`)
        }
      }
      expect(problems, problems.join('\n')).toEqual([])
    })
  }

  it("the English fallbacks are the en bundle's own words", () => {
    const en = bundle('en')
    for (const key of KEYS) {
      const [one, other] = COUNTED[key]
      expect(at(en, `${key}_one`), key).toBe(one)
      for (const form of ['few', 'many', 'other'] as const) expect(at(en, `${key}_${form}`), `${key}_${form}`).toBe(other)
    }
  })

  it('reads right at 1, 2, 5, 21 and a million, in each language', async () => {
    const say = async (lng: string, key: CountedKey, n: number) => counted((await i18nWith(lng)).t as never, key, n)

    expect(await say('en', 'bookings.night_count', 1)).toBe('1 night')
    expect(await say('en', 'bookings.night_count', 2)).toBe('2 nights')
    expect(await say('en', 'rewards.you_have', 1)).toBe('You have 1 point')

    expect(await say('ru', 'bookings.night_count', 1)).toBe('1 ночь')
    expect(await say('ru', 'bookings.night_count', 2)).toBe('2 ночи')
    expect(await say('ru', 'bookings.night_count', 5)).toBe('5 ночей')
    expect(await say('ru', 'bookings.night_count', 21)).toBe('21 ночь')
    expect(await say('ru', 'bookings.night_count', 11)).toBe('11 ночей')
    expect(await say('ru', 'bookings.guest_count', 3)).toBe('3 гостя')
    expect(await say('ru', 'home.points_to_go', 5)).toBe('Осталось 5 баллов')
    expect(await say('ru', 'stay.free_cancellation', 24)).toBe('Бесплатная отмена не позднее чем за 24 часа до заезда.')
    expect(await say('ru', 'stay.free_cancellation', 48)).toBe('Бесплатная отмена не позднее чем за 48 часов до заезда.')

    expect(await say('de', 'bookings.night_count', 1)).toBe('1 Nacht')
    expect(await say('de', 'stay.sleeps', 1)).toBe('Für 1 Gast')
    expect(await say('fr', 'bookings.guest_count', 1)).toBe('1 invité')
    expect(await say('fr', 'rewards.you_have', 1_000_000)).toBe('Vous avez 1000000 points')
    expect(await say('es', 'bookings.night_count', 1)).toBe('1 noche')
    expect(await say('es', 'bookings.night_count', 1_000_000)).toBe('1000000 noches')
  })

  it('a stay names its nights and its guests each in agreement: "1 night · 2 guests"', async () => {
    expect(nightsAndGuests((await i18nWith('en')).t as never, 1, 2)).toBe('1 night · 2 guests')
    expect(nightsAndGuests((await i18nWith('ru')).t as never, 1, 1)).toBe('1 ночь · 1 гость')
    expect(nightsAndGuests((await i18nWith('ru')).t as never, 2, 5)).toBe('2 ночи · 5 гостей')
  })

  it('every family is asked for through counted(), never as a literal key a plural cannot reach', () => {
    const files = (function walk(dir: string): string[] {
      return fs.readdirSync(dir).flatMap(e => {
        const full = path.join(dir, e)
        return fs.statSync(full).isDirectory() ? walk(full) : /\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e) ? [full] : []
      })
    })(PORTAL_DIR)
    const hits = files.flatMap(file => {
      const src = fs.readFileSync(file, 'utf8')
      return KEYS.filter(key => src.includes(`'portal.${key}'`) || src.includes(`"portal.${key}"`)).map(key => `${path.relative(PORTAL_DIR, file)}: ${key}`)
    })
    expect(hits, hits.join('\n')).toEqual([])
    expect(files.some(f => fs.readFileSync(f, 'utf8').includes("'portal.bookings.nights_guests'")), 'the old two-count key').toBe(false)
  })

  // A number followed by a word that must agree with it belongs in a family. The one known exception is an
  // abbreviation, which agrees with every number ("45 min", "45 мин").
  it('no other phrase puts a word after {{count}} that would have to agree with it', () => {
    const ABBREVIATIONS = ['book.duration']
    for (const locale of LOCALES) {
      const json = bundle(locale)
      const wrong = flatten(json)
        .filter(k => !/_(one|few|many|other)$/.test(k) && !ABBREVIATIONS.includes(k))
        .filter(k => /\{\{count\}\}\s+\p{L}/u.test(String(at(json, k))))
      expect(wrong, `${locale}: ${wrong.join(', ')}`).toEqual([])
    }
  })
})
