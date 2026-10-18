import { describe, expect, it } from 'vitest'
import en from '../i18n/content.en.json'
import { ERRORS, errorKey } from './errors'

describe('refusal words', () => {
  it('every family has an "unknown", and the English bundle says exactly the fallbacks', () => {
    for (const [family, words] of Object.entries(ERRORS)) {
      expect(words, family).toHaveProperty('unknown')
      expect((en as Record<string, { error?: unknown }>)[family]?.error, `content.${family}.error`).toEqual(words)
    }
  })

  it('a code the family does not know reads as unknown; the server\'s words are never used', () => {
    expect(errorKey('move', 'changed_elsewhere')).toEqual(['content.move.error.changed_elsewhere', ERRORS.move.changed_elsewhere])
    expect(errorKey('move', 'something_new')).toEqual(['content.move.error.unknown', ERRORS.move.unknown])
    expect(errorKey('save', 'toString')).toEqual(['content.save.error.unknown', ERRORS.save.unknown])
  })
})

describe('release 3 refusals', () => {
  it('words a repeat and a snippet refusal in the portal\'s own sentence', () => {
    expect(errorKey('repeat', 'already_repeating')).toEqual(['content.repeat.error.already_repeating', 'This post already repeats.'])
    expect(errorKey('repeat', 'too_many_copies')[0]).toBe('content.repeat.error.too_many_copies')
    expect(errorKey('snippet', 'too_many_snippets')).toEqual(['content.snippet.error.too_many_snippets', 'A brand keeps at most 50 of each. Remove one first.'])
    expect(errorKey('snippet', 'whatever')[0]).toBe('content.snippet.error.unknown')
  })
})

// Review Focus 1: a tab that has not heard of the switch meets the rule on a save, an action or a board move.
describe('release 4b refusals', () => {
  it('words the approval rule wherever a staff write meets it, and the approval, comment and bell refusals', () => {
    const rule = 'Only a manager can approve posts while approvals are on for this brand.'
    for (const family of ['save', 'action', 'idea', 'approval'] as const) {
      expect(errorKey(family, 'needs_approval')).toEqual([`content.${family}.error.needs_approval`, rule])
    }
    expect(errorKey('approval', 'changed_elsewhere')[1]).toBe('Someone changed this post since you opened it. Read it again before approving.')
    expect(errorKey('comment', 'not_yours')).toEqual(['content.comment.error.not_yours', 'You can only change your own comments.'])
    expect(errorKey('comment', 'too_long')[1]).toBe('A comment holds at most 2,000 characters.')
    expect(errorKey('inbox', 'network')).toEqual(['content.inbox.error.unknown', 'The list could not be loaded. Please try again.'])
  })
})
