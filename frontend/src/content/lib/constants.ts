/** The interface name. One constant: the owner may rename the product. */
export const APP_NAME = 'HexaTech Content'

/** How often the Plan asks the server again (spec §4.2: every 60 s, and when the window regains focus). */
export const PLAN_REFRESH_MS = 60_000

/** How long the "Moved · Undo" notice stays (spec §4.2). */
export const UNDO_MS = 8_000

/** The longest range a plan read or a generation may cover, both ends counted (the server's ContentRules::MAX_RANGE_DAYS). */
export const MAX_RANGE_DAYS = 62
