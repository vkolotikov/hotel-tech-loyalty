import { useTranslation } from 'react-i18next'
import { named } from '../lib/forms'
import type { Say } from './optionsMath'
import { WAY_LINE_WORDS, WAY_WORDS } from './words'

/** react-i18next's `t` as the pure sentences take it (optionsMath.ts `Say`). */
export function useSay(): Say {
  const { t } = useTranslation()
  return (key, fallback, vars) => t(key, fallback, vars ?? {})
}

/** A way's title and line, in the workspace's words (the key as sent for one it does not know). */
export function wayTitle(t: Say, way: string): string {
  const word = named('loyalty.options.way', WAY_WORDS, way)
  return word ? t(...word) : way
}

export function wayLine(t: Say, way: string): string {
  const word = named('loyalty.options.way_line', WAY_LINE_WORDS, way)
  return word ? t(...word) : ''
}
