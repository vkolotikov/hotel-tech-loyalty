/**
 * Insights' words whose keys the code builds at run time (`loyalty.insights.<family>.<value>`), with their English
 * fallbacks; insightsLocales.test.ts checks every family in all five insights.<lang>.json bundles. The values are the
 * server's (a period, a bucket, an engagement group, a redemption's state, a tier move); the workspace names them.
 */

/** The period choice in the page header. */
export const PERIOD_WORDS: Record<string, string> = {
  '30d': '30 days',
  '90d': '90 days',
  '12m': '12 months',
}

/** How the period is cut, said after its dates. */
export const BUCKET_WORDS: Record<string, string> = {
  day: 'by day',
  week: 'by week, from Monday',
  month: 'by month',
}

/** A table's first column: what one row of a chart's numbers is. */
export const BUCKET_HEAD_WORDS: Record<string, string> = {
  day: 'Day',
  week: 'Week from',
  month: 'Month',
}

/** What the members chart counts, by how the period is cut. */
export const GROWTH_LINE_WORDS: Record<string, string> = {
  day: 'All members at the end of each day, and those who joined that day.',
  week: 'All members at the end of each week, and those who joined that week.',
  month: 'All members at the end of each month, and those who joined that month.',
}

/** The four groups active members fall in (LoyaltyInsights::engagement). */
export const ENGAGEMENT_WORDS: Record<string, string> = {
  new: 'New',
  active: 'Active',
  at_risk: 'At risk',
  dormant: 'Dormant',
}

/** What puts a member in each group. */
export const ENGAGEMENT_HINT_WORDS: Record<string, string> = {
  new: 'Joined in the last 30 days',
  active: 'Activity in the last 30 days',
  at_risk: 'Last activity 31 to 90 days ago',
  dormant: 'No activity in the last 90 days',
}

/** Where a reward redemption stands now. */
export const REDEMPTION_WORDS: Record<string, string> = {
  fulfilled: 'Fulfilled',
  pending: 'Waiting',
  cancelled: 'Cancelled',
}

/** Which way a tier change went on the ladder. */
export const DIRECTION_WORDS: Record<string, string> = {
  up: 'Up',
  down: 'Down',
  lateral: 'Sideways',
}

/** The families above by the key prefix they are read under. */
export const WORD_FAMILIES: Record<string, Record<string, string>> = {
  period: PERIOD_WORDS,
  bucket: BUCKET_WORDS,
  bucket_head: BUCKET_HEAD_WORDS,
  growth_line: GROWTH_LINE_WORDS,
  engagement: ENGAGEMENT_WORDS,
  engagement_hint: ENGAGEMENT_HINT_WORDS,
  redemption: REDEMPTION_WORDS,
  direction: DIRECTION_WORDS,
}
