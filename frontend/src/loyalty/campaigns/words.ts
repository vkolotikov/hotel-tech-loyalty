/**
 * Campaigns' words whose keys the code builds at run time (`loyalty.campaigns.<family>.<value>`), with their English
 * fallbacks; campaignsLocales.test.ts checks every family in all five campaigns.<lang>.json bundles. The server sends
 * the values (its rule types and operators, a campaign's status, the reasons it gives); the workspace names them. A
 * value without a word here is shown as sent.
 */

/** The page's tabs (campaignsMath.ts `CAMPAIGN_TABS`). */
export const TAB_WORDS: Record<string, string> = {
  campaigns: 'Campaigns',
  segments: 'Segments',
  push: 'Push messages',
}

/** A campaign's status (EmailCampaign::STATUS_*). */
export const STATUS_WORDS: Record<string, string> = {
  draft: 'Draft',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

/** A rule's type (SegmentRules::TYPES). */
export const RULE_TYPE_WORDS: Record<string, string> = {
  tier: 'Tier',
  activity: 'Last activity',
  current_points: 'Points balance',
  lifetime_points: 'Points earned in all',
  joined: 'Joined',
  redemptions: 'Reward redemptions',
  earn: 'Points earned',
}

/** A rule's operator, by type and operator (`<type>_<op>`): the same `min` reads differently for points and days. */
export const RULE_OP_WORDS: Record<string, string> = {
  tier_in: 'is one of',
  tier_not_in: 'is none of',
  activity_active_within: 'within the last',
  activity_inactive_over: 'before the last',
  current_points_min: 'at least',
  current_points_max: 'at most',
  lifetime_points_min: 'at least',
  lifetime_points_max: 'at most',
  joined_after: 'on or after',
  joined_before: 'before',
  redemptions_any: 'has redeemed a reward',
  redemptions_none: 'has never redeemed a reward',
  earn_any: 'has earned points',
  earn_none: 'has never earned points',
}

/** How the rules combine (SegmentRules::OPERATORS). */
export const OPERATOR_WORDS: Record<string, string> = {
  AND: 'Members who match all of these rules',
  OR: 'Members who match any of these rules',
}

/** What is wrong with a rule or with the segment's rules (SegmentRules' reasons, and the form's own checks). */
export const REASON_WORDS: Record<string, string> = {
  unknown_type: 'The workspace does not know this kind of rule. Choose another kind, or remove the rule.',
  unknown_op: 'Choose how this rule compares.',
  no_value: 'Fill in this rule.',
  bad_value: 'Enter a whole number or a real date.',
  unknown_tier: 'A tier in this rule is no longer in the programme. Choose the tiers again.',
  out_of_range: 'Enter a value from {{min}} to {{max}}.',
  too_many_tiers: 'Choose at most {{max}} tiers.',
  too_many: 'A segment has at most {{max}} rules.',
  operator: 'Choose whether members match all of the rules or any of them.',
  no_rules: 'Add a rule, or choose Everyone.',
  everyone_with_rules: 'Everyone takes no rules: remove them, or choose rules.',
  bad_rules: 'These rules cannot be read. Build them again.',
}

/** What stops the segment form (campaignsMath.ts `segmentProblems`). */
export const SEGMENT_PROBLEM_WORDS: Record<string, string> = {
  name: 'Give the segment a name, up to 120 characters.',
  description: 'Keep the description to 500 characters.',
}

/** A body block's kind (CampaignBody::TYPES). */
export const BLOCK_WORDS: Record<string, string> = {
  heading: 'Heading',
  text: 'Text',
  button: 'Button',
  divider: 'Divider',
  spacer: 'Space',
}

/** A block's alignment. */
export const ALIGN_WORDS: Record<string, string> = {
  left: 'Left',
  center: 'Centre',
  right: 'Right',
}

/** A heading's size, by level. */
export const LEVEL_WORDS: Record<string, string> = {
  1: 'Large',
  2: 'Medium',
  3: 'Small',
}

/** What stops the draft from being saved, before sending or from the server's field errors (campaignsMath.ts `draftProblems`). */
export const DRAFT_PROBLEM_WORDS: Record<string, string> = {
  name: 'Give the campaign a name, up to 120 characters.',
  subject_long: 'Keep the subject to 200 characters.',
  segment_gone: 'That segment no longer exists. Choose another.',
  too_many_blocks: 'An email has at most 100 blocks.',
  text_long: 'This text is too long.',
  url: 'A link starts with https://, http:// or mailto:.',
  look: 'This block cannot be saved as it is. Remove it and add it again.',
}

/** Why Send cannot be pressed yet (campaignsMath.ts `sendBlockers`). */
export const BLOCKER_WORDS: Record<string, string> = {
  unsaved: 'Save your changes first.',
  no_segment: 'Choose who receives it.',
  segment_gone: 'Its segment no longer exists. Choose another.',
  segment_problem: 'Its segment has a rule that cannot be used. Fix the segment first.',
  subject: 'Write a subject.',
  body: 'Write something in the email.',
  button: 'Give every button a label and a link.',
}

/** Why a member of the segment will not get it (CampaignAudience's buckets). */
export const NOT_REACHED_WORDS: Record<string, string> = {
  no_consent: '{{number}} have not agreed to marketing email, or switched email off',
  unsubscribed: '{{number}} unsubscribed',
  suppressed: '{{number}} have an address that bounced or complained, which is never emailed',
  no_email: '{{number}} have no email address',
}

/** The families above by the key prefix they are read under. */
export const WORD_FAMILIES: Record<string, Record<string, string>> = {
  tab: TAB_WORDS,
  status: STATUS_WORDS,
  rule_type: RULE_TYPE_WORDS,
  rule_op: RULE_OP_WORDS,
  operator: OPERATOR_WORDS,
  reason: REASON_WORDS,
  'segment.problem': SEGMENT_PROBLEM_WORDS,
  block: BLOCK_WORDS,
  align: ALIGN_WORDS,
  level: LEVEL_WORDS,
  'draft.problem': DRAFT_PROBLEM_WORDS,
  blocker: BLOCKER_WORDS,
  not_reached: NOT_REACHED_WORDS,
}
