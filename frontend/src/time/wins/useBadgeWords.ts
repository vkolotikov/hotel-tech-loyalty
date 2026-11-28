import { useTranslation } from 'react-i18next'
import type { Recognition } from '../lib/types'
import { isBadgeCode, type Cheers } from './winsLogic'
import { BADGE_WORDS, CHEER_WORDS } from './words'

/**
 * A badge's name and what it takes, in the person's language; `rules` fills the figures a hint names (the server's
 * shares). A code the bundles do not know yet (a newer server) is shown by its own name, without a hint.
 */
export function useBadgeWords(rules: Recognition['rules']): { name: (code: string) => string; hint: (code: string, need: number) => string } {
  const { t } = useTranslation()
  return {
    name: code => t(`time.wins.badge.${code}`, isBadgeCode(code) ? BADGE_WORDS[code].title : code.replace(/_/g, ' ')),
    hint: (code, need) => (isBadgeCode(code)
      ? t(`time.wins.badge_hint.${code}`, BADGE_WORDS[code].hint, { need, share: code === 'on_time' ? (rules?.on_time_share ?? 90) : (rules?.planned_share ?? 60) })
      : ''),
  }
}

/** A celebration in words: what was earned, one line about it, what else came with it, and the points it brought. */
export interface CheerText { title: string; line: string; also: string[]; gained: string }

export function useCheerText(rules: Recognition['rules']): (cheers: Cheers) => CheerText {
  const { t } = useTranslation()
  const words = useBadgeWords(rules)
  return cheers => {
    const gained = t('time.wins.plus_points', '+{{count}} points', { count: cheers.points })
    const main = cheers.main
    if (!main) return { title: gained, line: '', also: [], gained }
    const vars = { badge: words.name(main.badge ?? ''), of: cheers.of ?? '' }
    return {
      title: t(`time.wins.cheer.${main.kind}`, CHEER_WORDS[main.kind].title, vars),
      line: t(`time.wins.cheer_line.${main.kind}`, CHEER_WORDS[main.kind].line, vars),
      // The other moments by their own titles ("You lead the week!"); two are enough for a card.
      also: cheers.also.filter(kind => kind !== 'badge').slice(0, 2).map(kind => t(`time.wins.cheer.${kind}`, CHEER_WORDS[kind].title, vars)),
      gained,
    }
  }
}
