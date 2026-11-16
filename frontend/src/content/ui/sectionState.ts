export const BRAND_SECTIONS = ['overview', 'website', 'identity', 'audiences', 'voice', 'positioning', 'channels', 'locations', 'links', 'dates', 'reusable', 'rhythm'] as const
export const BRAND_SECTION_NAMES = ['Overview', 'Website', 'Identity', 'Audiences', 'Voice', 'Positioning', 'Channels', 'Locations', 'Links', 'Dates & approvals', 'Reusable content', 'Rhythm']
export function sectionOf(value: string | null, keys: readonly string[]): string { return value && keys.includes(value) ? value : keys[0] }
