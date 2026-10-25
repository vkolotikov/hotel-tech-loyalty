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
import membershipEn from './membership.en.json'
import membershipRu from './membership.ru.json'
import membershipDe from './membership.de.json'
import membershipFr from './membership.fr.json'
import membershipEs from './membership.es.json'
import insightsEn from './insights.en.json'
import insightsRu from './insights.ru.json'
import insightsDe from './insights.de.json'
import insightsFr from './insights.fr.json'
import insightsEs from './insights.es.json'
import campaignsEn from './campaigns.en.json'
import campaignsRu from './campaigns.ru.json'
import campaignsDe from './campaigns.de.json'
import campaignsFr from './campaigns.fr.json'
import campaignsEs from './campaigns.es.json'
import appEn from './app.en.json'
import appRu from './app.ru.json'
import appDe from './app.de.json'
import appFr from './app.fr.json'
import appEs from './app.es.json'
import pushEn from './push.en.json'
import pushRu from './push.ru.json'
import pushDe from './push.de.json'
import pushFr from './push.fr.json'
import pushEs from './push.es.json'
import smsEn from './sms.en.json'
import smsRu from './sms.ru.json'
import smsDe from './sms.de.json'
import smsFr from './sms.fr.json'
import smsEs from './sms.es.json'
import optionsEn from './options.en.json'
import optionsRu from './options.ru.json'
import optionsDe from './options.de.json'
import optionsFr from './options.fr.json'
import optionsEs from './options.es.json'
import visitsEn from './visits.en.json'
import visitsRu from './visits.ru.json'
import visitsDe from './visits.de.json'
import visitsFr from './visits.fr.json'
import visitsEs from './visits.es.json'
import creditEn from './credit.en.json'
import creditRu from './credit.ru.json'
import creditDe from './credit.de.json'
import creditFr from './credit.fr.json'
import creditEs from './credit.es.json'

/**
 * HexaTech Loyalty's words, kept out of the admin's common.json so a session
 * that never opens Loyalty never downloads them. Registered under the
 * `loyalty` key of the `common` namespace, so call sites read
 * `t('loyalty.members.title')`; each area with its own files sits under its
 * name: `loyalty.program`, `loyalty.rewards`, and release 2's
 * `loyalty.membership`, `loyalty.insights`, `loyalty.campaigns`, `loyalty.app`, and release 3's
 * `loyalty.push`, release 4's `loyalty.sms`, and release 7's `loyalty.options`, `loyalty.visits` and `loyalty.credit`.
 * Registered when the chunk loads.
 */
export const LOYALTY_LOCALE_FILES = {
  en: { ...en, program: programEn, rewards: rewardsEn, membership: membershipEn, insights: insightsEn, campaigns: campaignsEn, app: appEn, push: pushEn, sms: smsEn, options: optionsEn, visits: visitsEn, credit: creditEn },
  ru: { ...ru, program: programRu, rewards: rewardsRu, membership: membershipRu, insights: insightsRu, campaigns: campaignsRu, app: appRu, push: pushRu, sms: smsRu, options: optionsRu, visits: visitsRu, credit: creditRu },
  de: { ...de, program: programDe, rewards: rewardsDe, membership: membershipDe, insights: insightsDe, campaigns: campaignsDe, app: appDe, push: pushDe, sms: smsDe, options: optionsDe, visits: visitsDe, credit: creditDe },
  fr: { ...fr, program: programFr, rewards: rewardsFr, membership: membershipFr, insights: insightsFr, campaigns: campaignsFr, app: appFr, push: pushFr, sms: smsFr, options: optionsFr, visits: visitsFr, credit: creditFr },
  es: { ...es, program: programEs, rewards: rewardsEs, membership: membershipEs, insights: insightsEs, campaigns: campaignsEs, app: appEs, push: pushEs, sms: smsEs, options: optionsEs, visits: visitsEs, credit: creditEs },
} as const

let registered = false

export function registerLoyaltyLocales(): void {
  if (registered) return
  for (const [lang, bundle] of Object.entries(LOYALTY_LOCALE_FILES)) {
    i18n.addResourceBundle(lang, 'common', { loyalty: bundle }, true, true)
  }
  registered = true
}
