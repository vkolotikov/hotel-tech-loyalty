import { describe, expect, it } from 'vitest'
import { brandInitials, pageKeyOf } from './shellMath'

describe('the breadcrumb (spec 2026-10-21 §4.2)', () => {
  it('draws a brand without a logo by up to two initials', () => {
    expect(brandInitials('FDS Cards')).toBe('FC')
    expect(brandInitials('Lumière')).toBe('LU')
    expect(brandInitials('A very long brand name')).toBe('AV')
    expect(brandInitials('  ')).toBe('?')
  })

  it('names the page from its address', () => {
    expect(pageKeyOf('/content')).toBe('plan')
    expect(pageKeyOf('/content/')).toBe('plan')
    expect(pageKeyOf('/content/ideas')).toBe('ideas')
    expect(pageKeyOf('/content/promote')).toBe('promote')
    expect(pageKeyOf('/content/brand')).toBe('brand')
    expect(pageKeyOf('/content/write/12')).toBe('write')
    expect(pageKeyOf('/content/nowhere')).toBe('plan')
  })
})
