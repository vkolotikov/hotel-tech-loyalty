import { describe, expect, it } from 'vitest'
import { applyPlace, countryName, countryOptions, placeLabel, zoneIsUnset, type Place } from './places'

const riga: Place = { name: 'Riga', region: 'Rīga', country: 'Latvia', country_code: 'LV', latitude: 56.946, longitude: 24.1059, timezone: 'Europe/Riga' }

describe('picking a location\'s place (2026-11-09)', () => {
  it('names countries in English, as locations store them', () => {
    expect(countryName('LV')).toBe('Latvia')
    expect(countryName('GB')).toBe('United Kingdom')
  })

  it('lists every country once, A to Z, keeping a stored value the list does not hold', () => {
    const options = countryOptions('')
    expect(options.length).toBeGreaterThan(240)
    expect(new Set(options.map(o => o.value)).size).toBe(options.length)
    expect(options.findIndex(o => o.value === 'Austria')).toBeLessThan(options.findIndex(o => o.value === 'Latvia'))
    expect(countryOptions('Latvia')[0].value).not.toBe('Latvia')
    expect(countryOptions('Lettland')[0]).toEqual({ value: 'Lettland', label: 'Lettland' })
  })

  it('labels a city with its region and country', () => {
    expect(placeLabel(riga)).toBe('Riga — Rīga, Latvia')
    expect(placeLabel({ ...riga, region: 'Riga' })).toBe('Riga — Latvia')
    expect(placeLabel({ ...riga, region: null, country: null })).toBe('Riga')
  })

  it('fills the city, the country and an empty time zone, never a chosen one', () => {
    const blank = { name: 'Old Town', city: 'rigga', country: '', timezone: 'UTC' }
    expect(applyPlace(blank, riga)).toEqual({ name: 'Old Town', city: 'Riga', country: 'Latvia', timezone: 'Europe/Riga' })
    expect(applyPlace({ ...blank, timezone: 'Europe/Tallinn' }, riga).timezone).toBe('Europe/Tallinn')
    expect(applyPlace(blank, { ...riga, timezone: null }).timezone).toBe('UTC')
  })

  it('treats empty and UTC as no time zone at all', () => {
    for (const z of ['', ' ', 'UTC', 'utc', 'GMT', 'Etc/UTC']) expect(zoneIsUnset(z), z).toBe(true)
    expect(zoneIsUnset('Europe/Riga')).toBe(false)
  })
})
