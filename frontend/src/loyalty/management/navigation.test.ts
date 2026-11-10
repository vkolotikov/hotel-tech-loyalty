import { describe, expect, it } from 'vitest'
import { legacyDestination } from './navigation'

describe('one home for loyalty settings', () => {
  it.each(['rule', 'rules'])('repairs the legacy %s qualification link', tab => {
    expect(legacyDestination('/loyalty/options', `?tab=${tab}`)).toBe('/loyalty/program?tab=tiers&settings=qualification')
  })
  it('moves only expiry to Points Settings and keeps the current search', () => {
    expect(legacyDestination('/loyalty/options', '?tab=rule&way=points_expiry&q=spa')).toBe('/loyalty/options?tab=earn&q=spa&settings=points')
  })
  it('moves a directly bookmarked qualification editor to Levels', () => {
    expect(legacyDestination('/loyalty/options', '?way=tier_progress')).toBe('/loyalty/program?tab=tiers&settings=qualification')
  })
  it('preserves the selected perk and level when removing its old Program home', () => {
    expect(legacyDestination('/loyalty/program', '?tab=benefits&selected=41&level=7')).toBe('/loyalty/rewards?tab=benefits&selected=41&level=7')
  })
  it('preserves a selected timed boost in Bonuses & Boosts', () => {
    expect(legacyDestination('/loyalty/program', '?tab=boosts&selected=9&q=weekend')).toBe('/loyalty/options?tab=bonus&q=weekend&boost=9')
  })
  it('keeps setup return context when moving Guided Setup into Program', () => {
    expect(legacyDestination('/loyalty/options/setup', '?from=logo')).toBe('/loyalty/program/setup?from=logo')
  })
  it('moves readiness to Program and retains the actual selected tier', () => {
    expect(legacyDestination('/loyalty/options', '?tab=overview&tier=3')).toBe('/loyalty/program?tab=tiers&tier=3&checks=1')
  })
  it('preserves the old place hash without using a root-relative anchor', () => {
    expect(legacyDestination('/loyalty/program', '?q=main', '#places')).toBe('/loyalty/program?q=main&tab=places')
  })
  it.each([
    ['/loyalty/program', '?tab=tiers&settings=qualification'],
    ['/loyalty/program/setup', '?from=logo'],
    ['/loyalty/options', '?tab=earn&settings=points'],
    ['/loyalty/options', '?tab=bonus&boost=9'],
    ['/loyalty/rewards', '?tab=benefits&selected=41'],
    ['/loyalty/rewards', '?tab=redemptions'],
    ['/loyalty/rewards', '?tab=referrals'],
  ])('does not redirect a canonical or retained activity URL %s%s', (path, search) => {
    expect(legacyDestination(path, search)).toBeNull()
  })
})
