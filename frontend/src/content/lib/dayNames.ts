import type { BuiltInDay } from './types'

/** i18next's `t` as these helpers use it: a key, the English under it, the {{names}} to fill. */
export type Words = (key: string, english: string, vars?: Record<string, unknown>) => string

/** A built-in day's name in the interface's language (spec 2026-10-16 §9.3): the bundles' words under its id, else the server's English. */
export function dayName(t: Words, day: Pick<BuiltInDay, 'id' | 'name_en'>): string {
  return t(`content.keydates.day.${day.id}`, day.name_en)
}

/** A chip's words: a substitute day says so — "observed" in the United States, "day off in lieu" elsewhere. */
export function dayLabel(t: Words, day: BuiltInDay, observed: boolean): string {
  const name = dayName(t, day)
  if (!day.substitute) return name
  return observed
    ? t('content.keydates.observed', '{{name}} (observed)', { name })
    : t('content.keydates.substitute', '{{name}} (day off in lieu)', { name })
}
