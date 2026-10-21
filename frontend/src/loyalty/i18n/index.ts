import i18n from '../../i18n'
import en from './loyalty.en.json'
import ru from './loyalty.ru.json'
import de from './loyalty.de.json'
import fr from './loyalty.fr.json'
import es from './loyalty.es.json'
import programEn from './program.en.json'
import programRu from './program.ru.json'
import programDe from './program.de.json'
import programFr from './program.fr.json'
import programEs from './program.es.json'
import rewardsEn from './rewards.en.json'
import rewardsRu from './rewards.ru.json'
import rewardsDe from './rewards.de.json'
import rewardsFr from './rewards.fr.json'
import rewardsEs from './rewards.es.json'

/**
 * HexaTech Loyalty's words, kept out of the admin's common.json so a session
 * that never opens Loyalty never downloads them. Registered under the
 * `loyalty` key of the `common` namespace, so call sites read
 * `t('loyalty.members.title')`; Program's and Rewards' own files sit under
 * `loyalty.program` and `loyalty.rewards`. Registered when the chunk loads.
 */
export const LOYALTY_LOCALE_FILES = {
  en: { ...en, program: programEn, rewards: rewardsEn },
  ru: { ...ru, program: programRu, rewards: rewardsRu },
  de: { ...de, program: programDe, rewards: rewardsDe },
  fr: { ...fr, program: programFr, rewards: rewardsFr },
  es: { ...es, program: programEs, rewards: rewardsEs },
} as const

let registered = false

export function registerLoyaltyLocales(): void {
  if (registered) return
  for (const [lang, bundle] of Object.entries(LOYALTY_LOCALE_FILES)) {
    i18n.addResourceBundle(lang, 'common', { loyalty: bundle }, true, true)
  }
  registered = true
}
