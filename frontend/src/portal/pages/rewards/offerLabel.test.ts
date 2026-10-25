import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import i18next from 'i18next'
import { claimedMessage, offerPerkNote, offerValueLabel, paysPointsOnClaim } from './offerLabel'

const t = (key: string, fallback: string, vars?: Record<string, unknown>) =>
  Object.entries(vars ?? {}).reduce((s, [k, v]) => s.replace(`{{${k}}}`, String(v)), fallback || key)

/** A real i18next with the portal bundle, so the plural forms are the bundle's own. */
async function i18nWith(lng: string) {
  const bundle = (l: string) => JSON.parse(fs.readFileSync(path.resolve(__dirname, `../../i18n/portal.${l}.json`), 'utf8'))
  const instance = i18next.createInstance()
  await instance.init({
    lng, fallbackLng: 'en', defaultNS: 'common', ns: ['common'], interpolation: { escapeValue: false },
    resources: Object.fromEntries(['en', 'ru'].map(l => [l, { common: { portal: bundle(l) } }])),
  })
  return instance.t as never
}

describe('offerValueLabel', () => {
  it('reads the three money-shaped offer types', () => {
    expect(offerValueLabel({ id: 1, title: 'x', type: 'discount', value: 15 }, t)).toBe('15% off')
    expect(offerValueLabel({ id: 1, title: 'x', type: 'percent_discount', value: '10' }, t)).toBe('10% off')
    expect(offerValueLabel({ id: 1, title: 'x', type: 'fixed_amount', value: 25 }, t)).toBe('25 off')
    expect(offerValueLabel({ id: 1, title: 'x', type: 'points_multiplier', value: 2 }, t)).toBe('2x points')
  })
  it('says nothing for a type it cannot price', () => {
    expect(offerValueLabel({ id: 1, title: 'x', type: 'free_night', value: 1 }, t)).toBeNull()
    expect(offerValueLabel({ id: 1, title: 'x', type: 'discount', value: 0 }, t)).toBeNull()
  })
  it('a bonus_points offer adds points: "+500 points", never "500x points" (release 7)', async () => {
    expect(offerValueLabel({ id: 1, title: 'x', type: 'bonus_points', value: '500.00' }, t)).toBe('+500 points')
    const en = await i18nWith('en')
    expect(offerValueLabel({ id: 1, title: 'x', type: 'bonus_points', value: 500 }, en)).toBe('+500 points')
    expect(offerValueLabel({ id: 1, title: 'x', type: 'bonus_points', value: 1 }, en)).toBe('+1 point')
    const ru = await i18nWith('ru')
    expect(offerValueLabel({ id: 1, title: 'x', type: 'bonus_points', value: 500 }, ru)).toBe('+500 баллов')
    expect(offerValueLabel({ id: 1, title: 'x', type: 'bonus_points', value: 2 }, ru)).toBe('+2 балла')
    expect(offerValueLabel({ id: 1, title: 'x', type: 'bonus_points', value: 21 }, ru)).toBe('+21 балл')
  })
})

describe('offerPerkNote', () => {
  it('a free night, an upgrade and cashback are given by the venue in person', () => {
    expect(offerPerkNote({ id: 1, title: 'x', type: 'free_night', value: 1 }, t)).toBe('A free night, given by the venue — show this when you book or arrive.')
    expect(offerPerkNote({ id: 1, title: 'x', type: 'upgrade', value: 0 }, t)).toBe('An upgrade, given by the venue — show this when you arrive.')
    expect(offerPerkNote({ id: 1, title: 'x', type: 'cashback', value: 5 }, t)).toBe('Cashback, given by the venue at the desk — show this when you pay.')
  })
  it('says nothing for an offer with a number of its own', () => {
    for (const type of ['discount', 'fixed_amount', 'points_multiplier', 'bonus_points']) {
      expect(offerPerkNote({ id: 1, title: 'x', type, value: 5 }, t), type).toBeNull()
    }
  })
})

describe('claiming', () => {
  it('only a bonus_points offer with points pays on claim', () => {
    expect(paysPointsOnClaim({ id: 1, title: 'x', type: 'bonus_points', value: 500 })).toBe(true)
    expect(paysPointsOnClaim({ id: 1, title: 'x', type: 'bonus_points', value: 0 })).toBe(false)
    expect(paysPointsOnClaim({ id: 1, title: 'x', type: 'points_multiplier', value: 2 })).toBe(false)
    expect(paysPointsOnClaim(null)).toBe(false)
  })
  it('the answer says the points were added, or to show the offer at the desk', async () => {
    expect(claimedMessage({ points_awarded: 500 }, t)).toBe('+500 points added to your balance')
    expect(claimedMessage({ points_awarded: 0 }, t)).toBe('Offer claimed — show it at the desk')
    expect(claimedMessage(undefined, t)).toBe('Offer claimed — show it at the desk')
    expect(claimedMessage({ points_awarded: 1 }, await i18nWith('en'))).toBe('+1 point added to your balance')
    expect(claimedMessage({ points_awarded: 5 }, await i18nWith('ru'))).toBe('Начислено +5 баллов')
  })
})
