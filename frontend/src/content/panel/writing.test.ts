import { describe, expect, it } from 'vitest'
import { withWriting } from './writing'

// Final review (Plan 4A-2): one note for the whole portal — Monday's template write ending cleared Tuesday's mid-write,
// and Monday failing put its failure on Tuesday's note.
describe('the AI writing posts from elsewhere', () => {
  it('keeps each post’s write apart: one ending or failing leaves the other as it is', () => {
    let writes = withWriting({}, 41, { failed: null })
    writes = withWriting(writes, 42, { failed: null })
    writes = withWriting(writes, 41, null)
    expect(writes).toEqual({ 42: { failed: null } })
    writes = withWriting(writes, 43, { failed: 'ai_failed' })
    expect(writes).toEqual({ 42: { failed: null }, 43: { failed: 'ai_failed' } })
  })
})
