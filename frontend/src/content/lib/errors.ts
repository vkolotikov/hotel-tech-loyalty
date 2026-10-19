/**
 * The portal's own words for each refusal (spec §8.1), by where it happened.
 * The bundles hold them under content.<family>.error.<code> (errors.test.ts
 * keeps the English bundle equal to these fallbacks). A code a family does not
 * list reads as `unknown`. The server's message is never shown.
 */
export const ERRORS = {
  move: {
    changed_elsewhere: 'Someone else changed this post. The plan now shows their version.',
    published_cannot_move: 'A published post keeps the date it went out.',
    // Ideas → Schedule sends who posts it (spec 2026-10-19 §4.1): someone off the team is refused.
    invalid: 'Check the day and who posts it.',
    not_found: 'This post no longer exists.',
    unknown: 'The post could not be moved. Please try again.',
  },
  fill: {
    slot_not_open: 'That slot already has a post.',
    ai_budget_used_up: "This month's AI budget is used up.",
    already_generating: 'AI is already writing for this brand. Try again in a moment.',
    ai_failed: 'The AI could not write this post. Please try again.',
    no_profile: 'This brand is not set up yet.',
    unknown: 'The slot could not be filled. Please try again.',
  },
  generate: {
    range_in_past: 'These days are already over.',
    no_channels: 'This brand has no active channel to plan for.',
    already_generating: 'AI is already writing for this brand. Try again in a moment.',
    ai_budget_used_up: "This month's AI budget is used up.",
    generation_failed: 'Generation stopped unexpectedly. Any drafts already saved remain in your plan.',
    manager_only: 'Only an owner or a manager can generate posts.',
    unknown: 'Generation failed. Please try again.',
  },
  save: {
    needs_approval: 'Only a manager can approve posts while approvals are on for this brand.',
    published_cannot_move: 'A published post keeps the date it went out.',
    invalid: 'Some fields need attention.',
    not_found: 'This post no longer exists.',
    no_profile: 'This brand is not set up yet.',
    unknown: 'The post could not be saved. Please try again.',
  },
  ai: {
    ai_budget_used_up: "This month's AI budget is used up. Writing by hand still works.",
    ai_failed: 'The AI could not finish this. Please try again.',
    not_found: 'This post no longer exists.',
    unknown: 'The AI could not finish this. Please try again.',
  },
  action: {
    needs_approval: 'Only a manager can approve posts while approvals are on for this brand.',
    invalid: 'Check the link and try again.',
    not_found: 'This post no longer exists.',
    unknown: 'That did not work. Please try again.',
  },
  posts: {
    invalid: 'Check the dates: the end must not be before the start.',
    unknown: 'The posts could not be loaded. Please try again.',
  },
  strategy: {
    manager_only: 'Only an owner or a manager can change the strategy.',
    already_generating: 'A strategy is already being made for this brand.',
    ai_budget_used_up: "This month's AI budget is used up.",
    not_ready: 'This strategy is not finished, so it cannot be made active or archived.',
    not_found: 'This strategy no longer exists.',
    no_profile: 'Set up the brand first: the strategy is made from it.',
    unknown: 'That did not work. Please try again.',
  },
  brand: {
    manager_only: 'Only an owner or a manager can change the brand.',
    invalid: 'Some fields need attention.',
    not_found: 'This item no longer exists. The page now shows the brand as it is.',
    no_profile: 'This brand is not set up yet.',
    already_set_up: 'This brand is already set up.',
    already_generating: 'The brand is already being set up. Please wait a moment.',
    ai_budget_used_up: "This month's AI budget is used up.",
    ai_failed: 'The AI could not finish. Please try again.',
    unknown: 'The change could not be saved. Please try again.',
  },
  repeat: {
    already_repeating: 'This post already repeats.',
    no_day: 'Give the post a day first: a post repeats from its day.',
    no_dates: 'There is no day to repeat on before that date.',
    too_many_copies: 'A post repeats at most 26 times. Choose an earlier end date.',
    until_too_far: 'A post repeats for at most 12 months after its day.',
    too_many_ai: 'The AI rewrites at most 12 copies. Choose an earlier end date, or repeat the copies as they are.',
    ai_budget_used_up: "This month's AI budget is used up. The copies can still repeat without rewording.",
    not_found: 'This post no longer exists.',
    invalid: 'Check the repeat: how often, and until when.',
    unknown: 'The post could not be repeated. Please try again.',
  },
  snippet: {
    manager_only: 'Only an owner or a manager can change hashtags and snippets.',
    too_many_snippets: 'A brand keeps at most 50 of each. Remove one first.',
    invalid: 'Give it a name and some text.',
    not_found: 'This item no longer exists. The page now shows the brand as it is.',
    no_profile: 'This brand is not set up yet.',
    ai_budget_used_up: "This month's AI budget is used up.",
    ai_failed: 'The AI could not suggest hashtags. Please try again.',
    unknown: 'The change could not be saved. Please try again.',
  },
  // Spec 2026-10-16 §9.3: the portal checks the limits first, so a refusal names the limit
  // (end_before_start, too_long and too_many_tags are the portal's own checks; the server answers `invalid`).
  keydate: {
    invalid: 'Give it a title and a first day.',
    end_before_start: 'The last day cannot be before the first.',
    too_long: 'An event lasts at most 31 days.',
    too_many_key_dates: 'A brand keeps at most 1,000 events and notes. Remove one first.',
    not_found: 'This key date no longer exists.',
    no_profile: 'This brand is not set up yet.',
    unknown: 'The key date could not be saved. Please try again.',
  },
  idea: {
    needs_approval: 'Only a manager can approve posts while approvals are on for this brand.',
    invalid: 'Write the idea first.',
    changed_elsewhere: 'Someone else changed this post. The board now shows their version.',
    not_found: 'This post no longer exists.',
    no_profile: 'This brand is not set up yet.',
    unknown: 'The idea could not be saved. Please try again.',
  },
  template: {
    manager_only: 'Only an owner or a manager can change templates.',
    invalid: 'Give the template a name.',
    too_many_tags: 'A template keeps at most 30 hashtags.',
    too_many_templates: 'A brand keeps at most 100 templates. Remove one first.',
    not_found: 'This template no longer exists.',
    no_profile: 'This brand is not set up yet.',
    ai_budget_used_up: "This month's AI budget is used up.",
    ai_failed: 'The AI could not suggest templates. Please try again.',
    unknown: 'The template could not be saved. Please try again.',
  },
  // Release 4b (spec 2026-10-16 §6–§8). `invalid` (approval) and `invalid` / `too_long` (comment) are also the portal's
  // own checks, made before anything is sent.
  approval: {
    needs_approval: 'Only a manager can approve posts while approvals are on for this brand.',
    approvals_off: 'Approvals are off for this brand. Reload to see the post as it is.',
    wrong_status: 'This post has moved on since you opened it. The panel now shows it as it is.',
    changed_elsewhere: 'Someone changed this post since you opened it. Read it again before approving.',
    manager_only: 'Only an owner or a manager can approve or send back posts.',
    invalid: 'Say what should change, in at most 2,000 characters.',
    not_found: 'This post no longer exists.',
    unknown: 'That did not work. Please try again.',
  },
  comment: {
    invalid: 'Write the comment first.',
    too_long: 'A comment holds at most 2,000 characters.',
    not_yours: 'You can only change your own comments.',
    not_found: 'This comment no longer exists.',
    unknown: 'The comment could not be saved. Please try again.',
  },
  inbox: {
    unknown: 'The list could not be loaded. Please try again.',
  },
  // Release 5a (spec 2026-10-19 §3). `invalid` is also the portal's own check (no platform picked).
  version: {
    version_exists: 'This post already has a version for that platform.',
    ai_budget_used_up: "This month's AI budget is used up. Choose Copy as is.",
    invalid: 'Choose at least one platform.',
    not_found: 'This post no longer exists.',
    unknown: 'The versions could not be made. Please try again.',
  },
} as const

export type ErrorFamily = keyof typeof ERRORS

/** The key and the English fallback for a refusal: `const [key, text] = errorKey('move', code); t(key, text)`. */
export function errorKey(family: ErrorFamily, code: string): [string, string] {
  const words: Record<string, string> = ERRORS[family]
  const known = Object.prototype.hasOwnProperty.call(words, code) ? code : 'unknown'
  return [`content.${family}.error.${known}`, words[known]]
}
