import { describe, expect, it } from 'vitest'
import { buildOfferFormData, offerTierIds, type OfferFormValues } from './offerFormData'

const base: OfferFormValues = {
  title: 'Summer stay', description: 'Book now', type: 'discount', value: '10',
  code: '', tier_ids: [], per_member_limit: '', applies_to: 'all',
  start_date: '2026-01-01', end_date: '2026-02-01', usage_limit: '',
  is_featured: false, is_active: true,
}

describe('buildOfferFormData — tier targeting', () => {
  it('keeps an untouched tier selection as tier_ids[] entries, with no bare tier_ids field', () => {
    const fd = buildOfferFormData({ ...base, tier_ids: [3, 5] }, { editing: true })
    expect(fd.getAll('tier_ids[]')).toEqual(['3', '5'])
    expect(fd.has('tier_ids')).toBe(false)
  })

  it('clears an emptied selection with a single tier_ids="" marker and no tier_ids[] entries', () => {
    const fd = buildOfferFormData({ ...base, tier_ids: [] }, { editing: true })
    expect(fd.getAll('tier_ids')).toEqual([''])
    expect(fd.getAll('tier_ids[]')).toEqual([])
  })

  it('sends the same empty tier_ids marker on a brand-new offer with no tiers selected', () => {
    const fd = buildOfferFormData({ ...base, tier_ids: [] }, { editing: false })
    expect(fd.getAll('tier_ids')).toEqual([''])
    expect(fd.getAll('tier_ids[]')).toEqual([])
  })
})

describe('offerTierIds — the edit form reading a saved offer', () => {
  // A row saved before the server stored integers holds ["30","29"]; read as-is, no
  // checkbox matched `tier.id` (a number), the form showed every tier unticked, and
  // pressing Save cleared the targeting (Task 21 browser pass).
  it('reads string ids as numbers so the saved tiers are ticked', () => {
    expect(offerTierIds(['30', '29'])).toEqual([30, 29])
    expect(offerTierIds([30])).toEqual([30])
  })

  it('reads no targeting as an empty selection', () => {
    expect(offerTierIds(null)).toEqual([])
    expect(offerTierIds(undefined)).toEqual([])
  })
})

describe('buildOfferFormData — code normalization', () => {
  it('upper-cases and trims the code', () => {
    const fd = buildOfferFormData({ ...base, code: '  welcome10  ' }, { editing: false })
    expect(fd.get('code')).toBe('WELCOME10')
  })

  it('sends an empty code as the empty-string clear marker', () => {
    const fd = buildOfferFormData({ ...base, code: '' }, { editing: true })
    expect(fd.get('code')).toBe('')
  })
})

describe('buildOfferFormData — per_member_limit', () => {
  it('sends a real value as-is', () => {
    const fd = buildOfferFormData({ ...base, per_member_limit: '2' }, { editing: true })
    expect(fd.get('per_member_limit')).toBe('2')
  })

  it('clears an emptied limit on edit with "", never "0"', () => {
    const fd = buildOfferFormData({ ...base, per_member_limit: '' }, { editing: true })
    expect(fd.get('per_member_limit')).toBe('')
    expect(fd.get('per_member_limit')).not.toBe('0')
  })

  it('omits an empty limit entirely on create', () => {
    const fd = buildOfferFormData({ ...base, per_member_limit: '' }, { editing: false })
    expect(fd.has('per_member_limit')).toBe(false)
  })
})

describe('buildOfferFormData — usage_limit (existing behaviour, unchanged)', () => {
  it('clears an emptied usage limit on edit', () => {
    const fd = buildOfferFormData({ ...base, usage_limit: '' }, { editing: true })
    expect(fd.get('usage_limit')).toBe('')
  })

  it('omits an empty usage limit on create', () => {
    const fd = buildOfferFormData({ ...base, usage_limit: '' }, { editing: false })
    expect(fd.has('usage_limit')).toBe(false)
  })
})

describe('buildOfferFormData — image', () => {
  it('attaches the image file only when one was picked', () => {
    const file = new File(['x'], 'photo.png', { type: 'image/png' })
    const fd = buildOfferFormData(base, { editing: false, imageFile: file })
    expect(fd.get('image')).toBe(file)
  })

  it('sends no image field when none was picked', () => {
    const fd = buildOfferFormData(base, { editing: false, imageFile: null })
    expect(fd.has('image')).toBe(false)
  })
})
