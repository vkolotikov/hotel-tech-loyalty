import { describe, expect, it } from 'vitest'
import { availableSections } from './strategySections'
describe('strategy URL sections', () => {
 it('offers only sections the saved document can actually render', () => {
  expect(availableSections({ brand_summary: 'A summary', next_actions: ['Do this'] }, [])).toEqual(['summary', 'next'])
  expect(availableSections({}, [{ name: 'Care' }])).toEqual(['pillars'])
  expect(availableSections(null, [])).toEqual([])
 })
})
