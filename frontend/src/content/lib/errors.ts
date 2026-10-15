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
} as const

export type ErrorFamily = keyof typeof ERRORS

/** The key and the English fallback for a refusal: `const [key, text] = errorKey('move', code); t(key, text)`. */
export function errorKey(family: ErrorFamily, code: string): [string, string] {
  const words: Record<string, string> = ERRORS[family]
  const known = Object.prototype.hasOwnProperty.call(words, code) ? code : 'unknown'
  return [`content.${family}.error.${known}`, words[known]]
}
