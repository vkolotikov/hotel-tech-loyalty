import { describe, expect, it } from 'vitest'
import { benefitAssignments, offerMatches, offerReadUrl, rewardEditorProblems, rewardModes, rewardsUrl, rewardStatus } from './math'
import { rewardFormOf } from '../rewardsMath'
import type { Offer, Reward } from '../types'
import type { Benefit, Tier } from '../../program/types'
import { REWARD_DESIGN_WORDS } from './words'
import en from '../../i18n/rewarddesign.en.json'

describe('Rewards design contracts', () => {
  const offer = { id: 7, title: 'Autumn weekend', code: 'AUTUMN', brand_id: 2, state: 'live' } as Offer
  it('keeps the saved offer selected when its name, brand or state no longer matches the editor entry filters', () => {
    const changed = { ...offer, title: 'Winter stay', code: null, brand_id: 3, state: 'off' }
    const url = new URL(offerReadUrl('?tab=offers&q=Autumn&brand=2&status=current&selected=7&edit=1', changed, 'Other hotel', true), 'https://example.test')
    expect(url.searchParams.get('selected')).toBe('7')
    expect(url.searchParams.has('q')).toBe(false)
    expect(url.searchParams.get('brand')).toBe('all')
    expect(url.searchParams.get('status')).toBe('all')
    expect(url.searchParams.has('edit')).toBe(false)
    expect(url.searchParams.get('saved')).toBe('1')
  })
  it('retains matching search, brand and status filters when returning from edit', () => {
    const url = new URL(offerReadUrl('?q=autumn&brand=2&status=current&edit=1', offer, 'Hotel'), 'https://example.test')
    expect(url.searchParams.get('q')).toBe('autumn')
    expect(url.searchParams.get('brand')).toBe('2')
    expect(url.searchParams.get('status')).toBe('current')
    expect(url.searchParams.has('saved')).toBe(false)
    expect(offerMatches(offer, { q: 'hotel', brand: 'all', status: 'live' }, 'Hotel')).toBe(true)
    expect(offerMatches({ ...offer, brand_id: null }, { q: 'AUTUMN', brand: 'every', status: 'all' }, 'Every brand')).toBe(true)
  })
  const now = Date.parse('2026-10-28T10:00:00Z')
  const reward = { is_active: true, expires_at: null, stock: null } as Reward
  it('keeps custom stock, limits and expiry invalid while temporarily empty', () => {
    const options = { discount_types: [], applies_to: ['all'], image: { max_kb: 5120, max_edge: 4096, types: [] } }
    const form = { ...rewardFormOf(null, options, 'Europe/Riga'), name: 'Coffee', points_cost: '500' }
    expect(rewardEditorProblems(form, options, rewardModes(form))).toEqual({})
    expect(rewardEditorProblems(form, options, { stock: 'limited', limit: 'custom', expiry: 'date' })).toMatchObject({ stock: 'stock', per_member_limit: 'per_member_limit', expires_at: 'expires_at' })
    expect(rewardEditorProblems({ ...form, stock: '0', per_member_limit: '10', expires_at: '2027-01-01T18:00' }, options, { stock: 'limited', limit: 'custom', expiry: 'date' })).toEqual({})
  })
  it('counts only available rewards and distinguishes depleted stock from unlimited stock', () => {
    expect(rewardStatus(reward, now)).toBe('active')
    expect(rewardStatus({ ...reward, stock: 0 }, now)).toBe('soldOut')
    expect(rewardStatus({ ...reward, stock: 1 }, now)).toBe('active')
    expect(rewardStatus({ ...reward, expires_at: '2026-10-28T12:00:00+02:00' }, now)).toBe('ended')
    expect(rewardStatus({ ...reward, expires_at: '2026-10-28T12:00:01+02:00' }, now)).toBe('active')
    expect(rewardStatus({ ...reward, is_active: false, stock: 0 }, now)).toBe('off')
  })
  it('keeps per-level values and scopes associated with the right benefit', () => {
    const benefit = { id: 7 } as Benefit
    const tiers = [{ id: 1, benefits: [{ benefit_id: 8, value_amount: 99 }] }, { id: 2, benefits: [{ benefit_id: 7, value_amount: 10, applies_to: 'stays' }] }] as Tier[]
    const rows = benefitAssignments(benefit, tiers)
    expect(rows).toHaveLength(1)
    expect(rows[0].tier.id).toBe(2)
    expect(rows[0].value).toMatchObject({ value_amount: 10, applies_to: 'stays' })
    expect(benefitAssignments({ id: 9 } as Benefit, tiers)).toEqual([])
  })
  it('preserves direct legacy activity routes and safely encodes search values', () => {
    expect(rewardsUrl('catalogue')).toBe('/loyalty/rewards')
    expect(rewardsUrl('redemptions', { request: 42 })).toBe('/loyalty/rewards?tab=redemptions&request=42')
    expect(rewardsUrl('offers', { q: 'Spa & stays', selected: 7, empty: null })).toBe('/loyalty/rewards?tab=offers&q=Spa+%26+stays&selected=7')
    expect(rewardsUrl('catalogue', { reward: 'new' })).toBe('/loyalty/rewards?reward=new')
  })
  it('keeps every dynamic design word in the registered English bundle', () => {
    expect(en).toEqual(REWARD_DESIGN_WORDS)
  })
})
