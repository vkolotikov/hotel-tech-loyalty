/**
 * Rewards' words whose keys the code builds at run time (`loyalty.rewards.<family>.<value>`), with their English
 * fallbacks; loyaltyLocales.test.ts checks every family in all five rewards.<lang>.json bundles.
 */
export const WORD_FAMILIES: Record<string, Record<string, string>> = {}
