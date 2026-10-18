import { describe, expect, it } from 'vitest'
import type { ApiFailure } from '../lib/api'
import type { PostDetail } from '../lib/types'
import { afterRefusal, NOTE_MAX, noteProblem, reviewButtons } from './reviewMath'

describe('the approval steps the panel offers (spec 2026-10-16 §6.2)', () => {
  it('offers staff Send for approval from Idea, Draft or Needs visual, and managers Approve and Send back on a post in review', () => {
    expect(reviewButtons('draft', true, false)).toEqual({ send: true, approve: false, sendBack: false })
    expect(reviewButtons('idea', true, false).send).toBe(true)
    expect(reviewButtons('needs_visual', true, false).send).toBe(true)
    expect(reviewButtons('needs_review', true, false)).toEqual({ send: false, approve: false, sendBack: false })
    expect(reviewButtons('approved', true, false).send).toBe(false)
    expect(reviewButtons('needs_review', true, true)).toEqual({ send: false, approve: true, sendBack: true })
    expect(reviewButtons('draft', true, true)).toEqual({ send: false, approve: false, sendBack: false })
  })

  it('offers nothing while approvals are off', () => {
    expect(reviewButtons('needs_review', false, true)).toEqual({ send: false, approve: false, sendBack: false })
    expect(reviewButtons('draft', false, false)).toEqual({ send: false, approve: false, sendBack: false })
  })

  it('wants a send-back note of 1 to 2,000 characters, counted as characters', () => {
    expect(noteProblem('')).toBe('invalid')
    expect(noteProblem('   \n ')).toBe('invalid')
    expect(noteProblem('Shorter, please.')).toBeNull()
    expect(noteProblem('a'.repeat(NOTE_MAX))).toBeNull()
    expect(noteProblem('a'.repeat(NOTE_MAX + 1))).toBe('invalid')
    expect(noteProblem('😀'.repeat(NOTE_MAX))).toBeNull()
  })

  // Review Focus 2: a refused Approve shows the post as it now is, so nobody approves words they have not read.
  it('after a refusal that carries the post, hands the post on with the refusal’s code', () => {
    const post = { id: 5, hook: 'Changed since' } as unknown as PostDetail
    expect(afterRefusal({ status: 409, code: 'changed_elsewhere', message: '', post } as ApiFailure)).toEqual({ post, code: 'changed_elsewhere' })
    expect(afterRefusal({ status: 403, code: 'manager_only', message: '' })).toEqual({ post: null, code: 'manager_only' })
  })
})
