import { describe, expect, it } from 'vitest'
import { industryHiddenGroupsFor } from './industryGating'
import { groupVisibility, visibleGroupCount } from './menuVisibility'

const TOGGLEABLE = ['AI Chat', 'Landing pages', 'Members & Loyalty', 'Bookings', 'CRM & Marketing', 'Operations']

describe('industryHiddenGroupsFor', () => {
  it('hides no group for any industry today', () => {
    expect(industryHiddenGroupsFor('medical')).toEqual([])
    expect(industryHiddenGroupsFor('hotel')).toEqual([])
  })

  it('hides nothing for a session that does not know its industry', () => {
    expect(industryHiddenGroupsFor(null)).toEqual([])
    expect(industryHiddenGroupsFor(undefined)).toEqual([])
  })
})

describe('groupVisibility', () => {
  it('says what the sidebar really does', () => {
    expect(groupVisibility('Bookings', [], [])).toBe('visible')
    expect(groupVisibility('Bookings', ['Bookings'], [])).toBe('hidden')
    expect(groupVisibility('Members & Loyalty', [], ['Members & Loyalty'])).toBe('industry')
  })

  it('the industry wins over the saved list: a toggle cannot bring the group back', () => {
    expect(groupVisibility('Members & Loyalty', ['Members & Loyalty'], ['Members & Loyalty'])).toBe('industry')
  })
})

describe('visibleGroupCount', () => {
  it('counts what the sidebar shows', () => {
    expect(visibleGroupCount(TOGGLEABLE, 2, [], [])).toBe(8)
    expect(visibleGroupCount(TOGGLEABLE, 2, ['AI Chat'], [])).toBe(7)
    expect(visibleGroupCount(TOGGLEABLE, 2, [], ['Members & Loyalty'])).toBe(7)
    expect(visibleGroupCount(TOGGLEABLE, 2, ['Members & Loyalty', 'AI Chat'], ['Members & Loyalty'])).toBe(6)
  })

  it('ignores a saved label that names no group', () => {
    expect(visibleGroupCount(TOGGLEABLE, 2, ['A group that was renamed'], [])).toBe(8)
  })
})
