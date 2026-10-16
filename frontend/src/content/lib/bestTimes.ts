import table from './bestTimes.json'
import type { Platform } from './types'

type Times = Record<string, string[]>
const DEFAULT: Times = table.default
const INDUSTRIES: Record<string, Times> = table.industries

/** Suggested posting times for a platform, the industry's own where it has them (spec 2026-10-15 §5; the server reads the same table). */
export function suggestedTimes(platform: Platform, industry: string | null | undefined): string[] {
  return (industry ? INDUSTRIES[industry]?.[platform] : undefined) ?? DEFAULT[platform] ?? []
}

/** A channel's usual time: its own, else the first suggested time for its platform. */
export function usualTime(channel: { platform: Platform; post_time?: string | null }, industry: string | null | undefined): string | null {
  return channel.post_time || suggestedTimes(channel.platform, industry)[0] || null
}
