/**
 * Program's words whose keys the code builds at run time (`loyalty.program.<family>.<value>`), with their English
 * fallbacks; loyaltyLocales.test.ts checks every family in all five program.<lang>.json bundles.
 */
export const WORD_FAMILIES: Record<string, Record<string, string>> = {}
