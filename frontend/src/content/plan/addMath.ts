import { suggestedTimes, usualTime } from '../lib/bestTimes'
import type { Channel, DateKey, Platform, Slot } from '../lib/types'
import type { NewDraft } from '../panel/PanelProvider'

/** A day takes a new post from the venue's today on (spec 2026-10-15 §4): past days have no "+" and ignore clicks. */
export const canAdd = (day: DateKey, today: DateKey): boolean => day >= today

/** What a click inside a day hit: its empty space counts; a card, a slot, a link or a control does its own thing. */
export function clickAdds(target: { closest?: (selector: string) => unknown } | null): boolean {
  if (!target || typeof target.closest !== 'function') return false
  return !target.closest('button, a, input, select, textarea, label, summary, [data-post], [data-slot]')
}

/** Each platform's usual posting time (spec 2026-10-15 §5): its first active channel's own, else the first suggested time. */
export function usualTimes(channels: readonly Channel[], industry: string | null | undefined): Partial<Record<Platform, string>> {
  const out: Partial<Record<Platform, string>> = {}
  for (const channel of channels) {
    if (!channel.active || out[channel.platform] !== undefined) continue
    const time = usualTime(channel, industry)
    if (time) out[channel.platform] = time
  }
  return out
}

/**
 * A new post from a day (spec 2026-10-15 §4): the platform of the day's first open slot, else the brand's first active
 * channel, else none (the panel then takes the first platform); the time is that platform's usual time.
 */
export function newPostDraft(day: DateKey, slots: readonly Slot[], channels: readonly Channel[], industry: string | null | undefined): NewDraft {
  const platform = slots.find(s => s.date === day)?.platform ?? channels.find(c => c.active)?.platform ?? null
  const time = platform ? usualTimes(channels, industry)[platform] ?? suggestedTimes(platform, industry)[0] ?? null : null
  return { date: day, platform, time }
}
