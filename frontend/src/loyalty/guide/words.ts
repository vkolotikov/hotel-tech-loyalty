/**
 * The Guide's words (owner 2026-10-26: "documentation … modern and easy … short, like frequently asked questions"),
 * with their English. guide.<lang>.json holds each family in all five languages; loyaltyLocales.test.ts checks the
 * English there equals these. Keep every answer to one or two short sentences.
 */

/** The quick start: five steps, each a title and one line. */
export const STEP_WORDS = {
  tiers: 'Set your tiers',
  tiers_line: 'Levels like Silver and Gold, and what each one gives.',
  earn: 'Choose how members earn',
  earn_line: 'Points, visits, stamps or cashback.',
  places: 'Add your places',
  places_line: 'Entrances and rooms, and who may enter.',
  members: 'Add your members',
  members_line: 'One by one, or import a spreadsheet.',
  scan: 'Scan at the door',
  scan_line: 'Green means welcome. Red says why not.',
} as const

/** What the workspace does: a card each, a title and one line. */
export const FEATURE_WORDS = {
  scan: 'Scan',
  scan_line: 'Camera, NFC card or USB reader.',
  door: 'Door mode',
  door_line: 'A full-screen scanner for a tablet at the entrance.',
  members: 'Members',
  members_line: 'Find, add, import and edit members.',
  tiers: 'Tiers & benefits',
  tiers_line: 'Levels, what they give, and how members move up.',
  places: 'Places',
  places_line: 'Who may enter each entrance or room.',
  events: 'Events',
  events_line: 'Sign-ups, check-in and points for coming.',
  earn: 'Ways to earn',
  earn_line: 'Points, visits, stamps and cashback.',
  rewards: 'Rewards',
  rewards_line: 'What members can spend their points on.',
  requests: 'Requests',
  requests_line: 'Rewards and benefits members asked for.',
  campaigns: 'Campaigns',
  campaigns_line: 'Email, push and SMS to chosen members.',
  insights: 'Insights',
  insights_line: 'Members, points and visits at a glance.',
  app: 'Card & app',
  app_line: 'The wallet card and the app’s look.',
} as const

/** The questions' topics. */
export const TOPIC_WORDS = {
  start: 'Getting started',
  scan: 'Scanning',
  members: 'Members & tiers',
  events: 'Events',
  rewards: 'Points & rewards',
  portal: 'Member portal',
} as const

/** Frequently asked questions: each a question (`_q`) and a short answer (`_a`). */
export const FAQ_WORDS = {
  start_q: 'Where do I start?',
  start_a: 'Follow the quick start: tiers, ways to earn, places, members — then scan.',
  roles_q: 'Who can change what?',
  roles_a: 'Owners and managers set up the programme. Staff scan, check members in and award points if their account allows it.',
  look_q: 'Can I switch the language or use dark mode?',
  look_a: 'Yes: Settings, at the bottom of the menu.',
  how_scan_q: 'How do I scan a member?',
  how_scan_a: 'Open Scan, choose where you are, then use the camera, an NFC card, a USB reader or type the member number.',
  colours_q: 'What do the colours mean?',
  colours_a: 'Green: welcome. Amber: welcome, but the membership ends soon. Red: no access, with the reason. Grey: no answer — try again.',
  door_q: 'What is door mode?',
  door_a: 'A full-screen scanner for a tablet at the entrance. Each answer clears after 4 seconds.',
  expired_q: 'A membership has ended. What now?',
  expired_a: 'A manager taps Renew for 1 year on the red answer, or extends it on the member’s page.',
  nfc_q: 'Why does NFC not work?',
  nfc_a: 'Phone NFC works in Chrome on Android. On an iPhone, scan the QR code or type the number.',
  move_up_q: 'How do members move up a tier?',
  move_up_a: 'Automatically, by points, visits or spend — you choose in Ways to earn.',
  by_hand_q: 'Can I put someone on a tier by hand?',
  by_hand_a: 'Yes: on the member’s page, ⋯ → Change tier. Add a “keep until” date to hold it.',
  rename_delete_q: 'Can I rename or delete a tier or a benefit?',
  rename_delete_a: 'Yes: on Program, each has Rename and Delete. Delete says first what changes: a tier’s members move to the tier you choose; history keeps the old name.',
  end_date_q: 'Can a membership end on a date?',
  end_date_a: 'Yes. Set or extend it on the member’s page. Members get a reminder two weeks before.',
  import_q: 'How do I add many members at once?',
  import_a: 'Members → ⋯ → Import, with a spreadsheet.',
  run_event_q: 'How do I run an event?',
  run_event_a: 'Events → New event → Publish. At the door, tap Start check-in.',
  sign_up_q: 'Can members sign up in advance?',
  sign_up_a: 'Yes: turn on sign-up in the event. Members sign up in their portal.',
  give_points_q: 'How do I give points?',
  give_points_a: 'Scan or open the member, then tap Award points.',
  redeem_q: 'How do members use their rewards?',
  redeem_a: 'They choose a reward in their portal or app. It appears in Requests, where you mark it done.',
  boosts_q: 'What are boosts?',
  boosts_a: 'Times when points are multiplied — for example ×2 at weekends. Set them in Program.',
  portal_what_q: 'What do members see?',
  portal_what_a: 'Their card and QR code, points, tier and benefits, events, rewards and history.',
  portal_card_q: 'Where is a member’s card?',
  portal_card_a: 'In their portal or app — and in Apple or Google Wallet once you set it up in Card & app.',
} as const

/** "Try a scan": the four answers to try, and the sample member's words. */
export const DEMO_WORDS = {
  welcome: 'Welcome',
  ending: 'Ends soon',
  wrong_tier: 'Wrong tier',
  ended: 'Ended',
  name: 'Alex Morgan',
  place: 'VIP lounge',
  top_tier: 'Gold',
  low_tier: 'Silver',
  benefit_drink: 'Welcome drink',
  benefit_priority: 'Priority booking',
} as const

export const WORD_FAMILIES: Record<string, Record<string, string>> = {
  step: STEP_WORDS,
  feature: FEATURE_WORDS,
  topic: TOPIC_WORDS,
  faq: FAQ_WORDS,
  demo: DEMO_WORDS,
}
