import earnEs from './earn.es.json'
import earnFr from './earn.fr.json'
import earnDe from './earn.de.json'
import earnRu from './earn.ru.json'
import earnEn from './earn.en.json'
import redesignEs from './redesign.es.json'
import redesignFr from './redesign.fr.json'
import redesignDe from './redesign.de.json'
import redesignRu from './redesign.ru.json'
import redesignEn from './redesign.en.json'
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
import placesEn from './places.en.json'
import placesRu from './places.ru.json'
import placesDe from './places.de.json'
import placesFr from './places.fr.json'
import placesEs from './places.es.json'
import eventsEn from './events.en.json'
import eventsRu from './events.ru.json'
import eventsDe from './events.de.json'
import eventsFr from './events.fr.json'
import eventsEs from './events.es.json'
import doorEn from './door.en.json'
import doorRu from './door.ru.json'
import doorDe from './door.de.json'
import doorFr from './door.fr.json'
import doorEs from './door.es.json'
import guideEn from './guide.en.json'
import guideRu from './guide.ru.json'
import guideDe from './guide.de.json'
import guideFr from './guide.fr.json'
import guideEs from './guide.es.json'
import startEn from './start.en.json'
import startRu from './start.ru.json'
import startDe from './start.de.json'
import startFr from './start.fr.json'
import startEs from './start.es.json'
import overviewEn from './overview.en.json'
import overviewRu from './overview.ru.json'
import overviewDe from './overview.de.json'
import overviewFr from './overview.fr.json'
import overviewEs from './overview.es.json'

/**
 * HexaTech Loyalty's words, kept out of the admin's common.json so a session
 * that never opens Loyalty never downloads them. Registered under the
 * `loyalty` key of the `common` namespace, so call sites read
 * `t('loyalty.members.title')`; each area with its own files sits under its
 * name: `loyalty.program`, `loyalty.rewards`, and release 2's
 * `loyalty.membership`, `loyalty.insights`, `loyalty.campaigns`, `loyalty.app`, and release 3's
 * `loyalty.push`, release 4's `loyalty.sms`, release 7's `loyalty.options`, `loyalty.visits` and `loyalty.credit`, and release 8's
 * `loyalty.places`, `loyalty.events` and `loyalty.door` (the scan screen's verdicts and door mode), `loyalty.guide` (the
 * Guide, owner 2026-10-26) and `loyalty.start` ("Start here", release 10).
 * Registered when the chunk loads.
 */
export const LOYALTY_LOCALE_FILES = {
  en: { ...en, program: programEn, rewards: rewardsEn, membership: membershipEn, insights: insightsEn, campaigns: campaignsEn, app: appEn, push: pushEn, sms: smsEn, options: optionsEn, visits: visitsEn, credit: creditEn, places: placesEn, events: eventsEn, door: doorEn, guide: guideEn, start: startEn, overview: overviewEn, redesign: redesignEn, earn: earnEn, rewarddesign: rewardDesignEn, eventdesign: eventDesignEn },
  ru: { ...ru, program: programRu, rewards: rewardsRu, membership: membershipRu, insights: insightsRu, campaigns: campaignsRu, app: appRu, push: pushRu, sms: smsRu, options: optionsRu, visits: visitsRu, credit: creditRu, places: placesRu, events: eventsRu, door: doorRu, guide: guideRu, start: startRu, overview: overviewRu, redesign: redesignRu, earn: earnRu, rewarddesign: rewardDesignRu, eventdesign: eventDesignRu },
  de: { ...de, program: programDe, rewards: rewardsDe, membership: membershipDe, insights: insightsDe, campaigns: campaignsDe, app: appDe, push: pushDe, sms: smsDe, options: optionsDe, visits: visitsDe, credit: creditDe, places: placesDe, events: eventsDe, door: doorDe, guide: guideDe, start: startDe, overview: overviewDe, redesign: redesignDe, earn: earnDe, rewarddesign: rewardDesignDe, eventdesign: eventDesignDe },
  fr: { ...fr, program: programFr, rewards: rewardsFr, membership: membershipFr, insights: insightsFr, campaigns: campaignsFr, app: appFr, push: pushFr, sms: smsFr, options: optionsFr, visits: visitsFr, credit: creditFr, places: placesFr, events: eventsFr, door: doorFr, guide: guideFr, start: startFr, overview: overviewFr, redesign: redesignFr, earn: earnFr, rewarddesign: rewardDesignFr, eventdesign: eventDesignFr },
  es: { ...es, program: programEs, rewards: rewardsEs, membership: membershipEs, insights: insightsEs, campaigns: campaignsEs, app: appEs, push: pushEs, sms: smsEs, options: optionsEs, visits: visitsEs, credit: creditEs, places: placesEs, events: eventsEs, door: doorEs, guide: guideEs, start: startEs, overview: overviewEs, redesign: redesignEs, earn: earnEs, rewarddesign: rewardDesignEs, eventdesign: eventDesignEs },
} as const

let registered = false

export function registerLoyaltyLocales(): void {
  if (registered) return
  for (const [lang, bundle] of Object.entries(LOYALTY_LOCALE_FILES)) {
    i18n.addResourceBundle(lang, 'common', { loyalty: bundle }, true, true)
  }
  registered = true
}
import rewardDesignEn from './rewarddesign.en.json'
import rewardDesignRu from './rewarddesign.ru.json'
import rewardDesignDe from './rewarddesign.de.json'
import rewardDesignFr from './rewarddesign.fr.json'
import rewardDesignEs from './rewarddesign.es.json'

import eventDesignEn from './eventdesign.en.json'
import eventDesignRu from './eventdesign.ru.json'
import eventDesignDe from './eventdesign.de.json'
import eventDesignFr from './eventdesign.fr.json'
import eventDesignEs from './eventdesign.es.json'

