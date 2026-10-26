import i18n from '../../i18n'
import en from './portal.en.json'
import ru from './portal.ru.json'
import de from './portal.de.json'
import fr from './portal.fr.json'
import es from './portal.es.json'
import stampsEn from './stamps.en.json'
import stampsRu from './stamps.ru.json'
import stampsDe from './stamps.de.json'
import stampsFr from './stamps.fr.json'
import stampsEs from './stamps.es.json'
import creditEn from './credit.en.json'
import creditRu from './credit.ru.json'
import creditDe from './credit.de.json'
import creditFr from './credit.fr.json'
import creditEs from './credit.es.json'
import eventsEn from './events.en.json'
import eventsRu from './events.ru.json'
import eventsDe from './events.de.json'
import eventsFr from './events.fr.json'
import eventsEs from './events.es.json'
import helpEn from './help.en.json'
import helpRu from './help.ru.json'
import helpDe from './help.de.json'
import helpFr from './help.fr.json'
import helpEs from './help.es.json'

/**
 * The member portal's strings, kept out of the admin's common.json so a
 * staff session never downloads them and a translator sees them as one
 * file per language. Registered under the `portal` key of the `common`
 * namespace, so call sites read `t('portal.nav.home')` — dotted keys the
 * locale sweep in src/i18n/localeCompleteness.test.ts can see.
 */
// Release 7 (spec 2026-10-25): the stamp card's and cashback credit's words, in their own files, under
// `portal.stamps` and `portal.credit`. The Help page (2026-10-26) under `portal.help`.
export const PORTAL_LOCALE_FILES = {
  en: { ...en, stamps: stampsEn, credit: creditEn, events: eventsEn, help: helpEn },
  ru: { ...ru, stamps: stampsRu, credit: creditRu, events: eventsRu, help: helpRu },
  de: { ...de, stamps: stampsDe, credit: creditDe, events: eventsDe, help: helpDe },
  fr: { ...fr, stamps: stampsFr, credit: creditFr, events: eventsFr, help: helpFr },
  es: { ...es, stamps: stampsEs, credit: creditEs, events: eventsEs, help: helpEs },
} as const

let registered = false

export function registerPortalLocales(): void {
  if (registered) return
  for (const [lang, bundle] of Object.entries(PORTAL_LOCALE_FILES)) {
    i18n.addResourceBundle(lang, 'common', { portal: bundle }, true, true)
  }
  registered = true
}
