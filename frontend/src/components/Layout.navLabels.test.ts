import { describe, expect, it } from 'vitest'
import { navGroups } from './Layout'
import { vocabularyFor } from '../lib/vocabulary'
import type { IndustryId } from '../lib/industryHosts'

const INDUSTRIES: IndustryId[] = ['hotel', 'beauty', 'medical', 'restaurant', 'legal', 'real_estate', 'education', 'fitness', 'other']

/**
 * Two sidebar items with the same name are one item nobody can tell apart. The vocabulary relabels items
 * one at a time, so nothing stopped it from giving two of them the same word — a clinic's sidebar read
 * "Procedures" twice (the bookings list and the catalogue).
 */
describe('sidebar labels', () => {
  for (const industry of INDUSTRIES) {
    it(`${industry}: no two items of a group share a label`, () => {
      const vocab = vocabularyFor(industry)
      for (const group of navGroups) {
        const labels = group.items.map(i => vocab(i.defaultLabel) ?? i.defaultLabel)
        const twice = labels.filter((l, n) => labels.indexOf(l) !== n)
        expect(twice, `${industry} · ${group.defaultLabel}: ${twice.join(', ')}`).toEqual([])
      }
    })

    it(`${industry}: no item's label equals its own group's label`, () => {
      const vocab = vocabularyFor(industry)
      for (const group of navGroups) {
        const groupLabel = vocab(group.defaultLabel) ?? group.defaultLabel
        const itemLabels = group.items.map(i => vocab(i.defaultLabel) ?? i.defaultLabel)
        const collides = itemLabels.includes(groupLabel)

        // Known, PRE-EXISTING collisions (Task 24 fix round 1): the GROUP
        // "Members & Loyalty" relabels to the same word as its first item
        // "Members" for these four industries — restaurant's own comment
        // in vocabulary.ts already called this "Regulars" collision
        // intentional. Medical had the same collision ("Patients" /
        // "Patients") and was fixed in this round to "Patient Membership".
        // The owner decides names for the remaining four; until then this
        // test records the truth instead of silently passing or failing.
        const isKnownCollision = group.defaultLabel === 'Members & Loyalty'
          && (['legal', 'real_estate', 'education', 'restaurant'] as IndustryId[]).includes(industry)

        if (isKnownCollision) {
          expect(collides, `${industry} · ${group.defaultLabel}: expected the known, not-yet-fixed collision — update this test if the owner renames it`).toBe(true)
        } else {
          expect(collides, `${industry} · ${group.defaultLabel}: item label "${groupLabel}" duplicates the group label`).toBe(false)
        }
      }
    })
  }
})
