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

describe('release 5a refusals (spec 2026-10-19 §7.3)', () => {
  it('words a refused version and a refused poster on a schedule in the portal’s own sentence', () => {
    expect(errorKey('version', 'version_exists')).toEqual(['content.version.error.version_exists', 'This post already has a version for that platform.'])
    expect(errorKey('version', 'ai_budget_used_up')[1]).toBe("This month's AI budget is used up. Choose Copy as is.")
    expect(errorKey('version', 'teapot')[0]).toBe('content.version.error.unknown')
    expect(errorKey('schedule', 'invalid')).toEqual(['content.schedule.error.invalid', 'Check the day and who posts it.']) // its own family since the 5A-2 review
  })
})

describe('release 5b refusals (spec 2026-10-19 §7.3)', () => {
  it('words a bad Link and the link-in-bio page’s refusals in the portal’s own sentence', () => {
    expect(errorKey('link', 'bad_link')).toEqual(['content.link.error.bad_link', 'The link must be a web address that starts with http:// or https://.'])
    expect(errorKey('bio', 'bio_name_taken')).toEqual(['content.bio.error.bio_name_taken', 'Another page already has this name. Choose another one.'])
    expect(errorKey('bio', 'bio_name_invalid')[0]).toBe('content.bio.error.bio_name_invalid')
    expect(errorKey('bio', 'too_many_buttons')).toEqual(['content.bio.error.too_many_buttons', 'A page has at most 8 buttons.'])
    expect(errorKey('bio', 'bad_link')[0]).toBe('content.bio.error.bad_link')
    expect(errorKey('bio', 'whatever')[0]).toBe('content.bio.error.unknown')
  })
})

// 5A-2 review: an Unlink failure had Make versions' words; a Plan drag's rare 422 had the Schedule dialog's.
// Task 2: a save moving a version onto its group's platform.
describe('refusal words after the 5A-2 review', () => {
  it('gives Unlink its own words, Schedule the day-and-poster line, and a Plan move the general one', () => {
    expect(errorKey('unlink', 'unknown')[1]).toBe('The post could not be unlinked. Please try again.')
    expect(errorKey('schedule', 'invalid')[1]).toBe('Check the day and who posts it.')
    expect(errorKey('schedule', 'changed_elsewhere')[0]).toBe('content.schedule.error.changed_elsewhere')
    expect(errorKey('move', 'invalid')).toEqual(['content.move.error.unknown', 'The post could not be moved. Please try again.'])
    expect(errorKey('save', 'version_exists')[1]).toBe('Another version in this group is already for that platform.')
  })
})
