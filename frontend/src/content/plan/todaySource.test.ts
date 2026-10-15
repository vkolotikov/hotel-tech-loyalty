import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

// "Today" on the Plan is the venue's day as the server says it (boot.venue.today): a computer whose
// clock is off must still land "This week" on the week that holds the highlighted today (Plan B deferred minor).
describe('the Plan\'s today', () => {
  it('comes from the server, never from this computer\'s clock', () => {
    const source = fs.readFileSync(new URL('./PlanPage.tsx', import.meta.url), 'utf8')
    expect(source).not.toContain('venueNow(')
    expect(source).toContain('setDate(boot.venue.today)')
  })
})
