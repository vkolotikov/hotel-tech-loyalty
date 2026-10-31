/**
 * The member portal's own words (frontend/src/portal/i18n), read from the portal's files rather than copied, so a
 * sentence fixed for the portal is fixed in the app too. Built as the portal's own `PORTAL_LOCALE_FILES` is: the main
 * bundle with stamps, credit, events and help beside it.
 */
import en from '../../../../../frontend/src/portal/i18n/portal.en.json'
import ru from '../../../../../frontend/src/portal/i18n/portal.ru.json'
import de from '../../../../../frontend/src/portal/i18n/portal.de.json'
import fr from '../../../../../frontend/src/portal/i18n/portal.fr.json'
import es from '../../../../../frontend/src/portal/i18n/portal.es.json'
import stampsEn from '../../../../../frontend/src/portal/i18n/stamps.en.json'
import stampsRu from '../../../../../frontend/src/portal/i18n/stamps.ru.json'
import stampsDe from '../../../../../frontend/src/portal/i18n/stamps.de.json'
import stampsFr from '../../../../../frontend/src/portal/i18n/stamps.fr.json'
import stampsEs from '../../../../../frontend/src/portal/i18n/stamps.es.json'
import creditEn from '../../../../../frontend/src/portal/i18n/credit.en.json'
import creditRu from '../../../../../frontend/src/portal/i18n/credit.ru.json'
import creditDe from '../../../../../frontend/src/portal/i18n/credit.de.json'
import creditFr from '../../../../../frontend/src/portal/i18n/credit.fr.json'
import creditEs from '../../../../../frontend/src/portal/i18n/credit.es.json'
import eventsEn from '../../../../../frontend/src/portal/i18n/events.en.json'
import eventsRu from '../../../../../frontend/src/portal/i18n/events.ru.json'
import eventsDe from '../../../../../frontend/src/portal/i18n/events.de.json'
import eventsFr from '../../../../../frontend/src/portal/i18n/events.fr.json'
import eventsEs from '../../../../../frontend/src/portal/i18n/events.es.json'
import helpEn from '../../../../../frontend/src/portal/i18n/help.en.json'
import helpRu from '../../../../../frontend/src/portal/i18n/help.ru.json'
import helpDe from '../../../../../frontend/src/portal/i18n/help.de.json'
import helpFr from '../../../../../frontend/src/portal/i18n/help.fr.json'
import helpEs from '../../../../../frontend/src/portal/i18n/help.es.json'

export const PORTAL_BUNDLES = {
  en: { ...en, stamps: stampsEn, credit: creditEn, events: eventsEn, help: helpEn },
  ru: { ...ru, stamps: stampsRu, credit: creditRu, events: eventsRu, help: helpRu },
  de: { ...de, stamps: stampsDe, credit: creditDe, events: eventsDe, help: helpDe },
  fr: { ...fr, stamps: stampsFr, credit: creditFr, events: eventsFr, help: helpFr },
  es: { ...es, stamps: stampsEs, credit: creditEs, events: eventsEs, help: helpEs },
} as const
