import { describe, expect, it } from 'vitest'
import { bookingTabCopyFor, industryHiddenGroupsFor, industryHiddenItemsFor, industryHiddenSettingsTabsFor } from './industryGating'
import { vocabularyFor } from './vocabulary'
import type { IndustryId } from './industryHosts'

const INDUSTRIES: IndustryId[] = ['hotel', 'beauty', 'medical', 'restaurant', 'legal', 'real_estate', 'education', 'fitness', 'services', 'other']

describe('every industry has memberships (owner\'s decision, 2026-09-29)', () => {
  it('no industry hides the Members & Loyalty group', () => {
    for (const industry of INDUSTRIES) {
      expect(industryHiddenGroupsFor(industry), industry).not.toContain('Members & Loyalty')
    }
  })

  it('no industry hides the Loyalty settings', () => {
    for (const industry of INDUSTRIES) {
      expect(industryHiddenSettingsTabsFor(industry), industry).not.toContain('loyalty')
    }
  })

  it('a clinic can scan the card it now issues', () => {
    expect(industryHiddenItemsFor('medical')).not.toContain('Scan')
    expect(industryHiddenItemsFor('medical')).toContain('Deals')
  })
})

describe('Settings → Booking', () => {
  it('is shown for every industry: it holds the service rules, the cancellation hours and online payment', () => {
    for (const industry of INDUSTRIES) {
      expect(industryHiddenSettingsTabsFor(industry), industry).not.toContain('booking')
    }
  })

  it('the Member App tab stays hidden where there is no member app', () => {
    for (const industry of ['medical', 'legal', 'real_estate', 'education'] as IndustryId[]) {
      expect(industryHiddenSettingsTabsFor(industry), industry).toContain('mobile_app')
    }
  })
})

describe('a session that does not know its industry', () => {
  it('hides nothing', () => {
    expect(industryHiddenItemsFor(undefined)).toEqual([])
    expect(industryHiddenSettingsTabsFor(null)).toEqual([])
  })
})

describe('medical vocabulary', () => {
  it('names the programme for patients', () => {
    expect(vocabularyFor('medical')('Loyalty Program')).toBe('Patient Programme')
  })
})

describe('Settings → Booking tab copy (wording only, fix round 1)', () => {
  it('hotel keeps its current PMS-flavoured wording exactly', () => {
    expect(bookingTabCopyFor('hotel')).toEqual({ label: 'Booking Engine', desc: 'Rates, currency, payment, Smoobu sync' })
  })

  it('a clinic gets the neutral wording — it has no rooms, rates or Smoobu sync', () => {
    expect(bookingTabCopyFor('medical')).toEqual({ label: 'Booking', desc: 'Slots, policies, payment' })
  })

  it('a law firm gets the same neutral wording as any other non-hotel industry', () => {
    expect(bookingTabCopyFor('legal')).toEqual({ label: 'Booking', desc: 'Slots, policies, payment' })
  })

  it('a session that does not know its industry keeps the hotel wording (legacy default)', () => {
    expect(bookingTabCopyFor(undefined)).toEqual({ label: 'Booking Engine', desc: 'Rates, currency, payment, Smoobu sync' })
    expect(bookingTabCopyFor(null)).toEqual({ label: 'Booking Engine', desc: 'Rates, currency, payment, Smoobu sync' })
  })
})
