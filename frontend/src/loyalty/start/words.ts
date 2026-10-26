/**
 * "Start here"'s words (release 10), with their English: each step's title, its line (what it is and why it matters, in
 * one sentence) and what it counts. start.<lang>.json holds them in all five languages; loyaltyLocales.test.ts checks
 * the English there equals these.
 */

export const STEP_TITLE_WORDS: Record<string, string> = {
  programme: 'Choose how your programme works',
  tiers: 'Set up your tiers',
  ways: 'Check how members earn',
  rewards: 'Add rewards',
  logo: 'Put your logo on the card',
  member: 'Add your first member',
  scan: 'Try a scan at the desk',
}

export const STEP_LINE_WORDS: Record<string, string> = {
  programme: 'Four short questions set your earning, bonuses and first tiers for your kind of business. You can change everything later.',
  tiers: 'Levels such as Silver and Gold: what reaches each one and what it gives.',
  ways: 'Ways to earn checks that your options work together, and fixes most things in one press.',
  rewards: 'What members spend their points on, shown in the member app and the portal.',
  logo: 'Members see it on their card and in the app.',
  member: 'Add someone by hand, or import your list.',
  scan: 'Scan a member’s card or QR code: the screen says who they are and what they may do.',
}

/** What a step counts, said once it counts something ({{n}} the count). */
export const STEP_COUNT_WORDS: Record<string, string> = {
  tiers: '{{n}} in use',
  ways: '{{n}} to fix',
  rewards: '{{n}} offered',
  member: '{{n}} members',
  scan: '{{n}} scans',
}

export const WORD_FAMILIES: Record<string, Record<string, string>> = {
  step_title: STEP_TITLE_WORDS,
  step_line: STEP_LINE_WORDS,
  step_count: STEP_COUNT_WORDS,
}
