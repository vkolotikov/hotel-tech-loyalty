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
import designEn from '../../../../../frontend/src/portal/i18n/design.en.json'
import designRu from '../../../../../frontend/src/portal/i18n/design.ru.json'
import designDe from '../../../../../frontend/src/portal/i18n/design.de.json'
import designFr from '../../../../../frontend/src/portal/i18n/design.fr.json'
import designEs from '../../../../../frontend/src/portal/i18n/design.es.json'

const INBOX_LINES = {
  en: 'When {{venue}} sends news about your membership, offers or events, you will find it here.',
  ru: 'Здесь появятся новости о вашем членстве, предложениях и событиях от {{venue}}.',
  de: 'Hier finden Sie Neuigkeiten von {{venue}} zu Ihrer Mitgliedschaft, Angeboten und Events.',
  fr: 'Retrouvez ici les nouvelles de {{venue}} sur votre adhésion, les offres et les événements.',
  es: 'Aquí encontrará las novedades de {{venue}} sobre su membresía, ofertas y eventos.',
}

export const PORTAL_BUNDLES = {
  en: { ...en, inbox: { ...en.inbox, empty_body: INBOX_LINES.en }, stamps: stampsEn, credit: creditEn, events: eventsEn, help: helpEn, design: designEn },
  ru: { ...ru, inbox: { ...ru.inbox, empty_body: INBOX_LINES.ru }, stamps: stampsRu, credit: creditRu, events: eventsRu, help: helpRu, design: designRu },
  de: { ...de, inbox: { ...de.inbox, empty_body: INBOX_LINES.de }, stamps: stampsDe, credit: creditDe, events: eventsDe, help: helpDe, design: designDe },
  fr: { ...fr, inbox: { ...fr.inbox, empty_body: INBOX_LINES.fr }, stamps: stampsFr, credit: creditFr, events: eventsFr, help: helpFr, design: designFr },
  es: { ...es, inbox: { ...es.inbox, empty_body: INBOX_LINES.es }, stamps: stampsEs, credit: creditEs, events: eventsEs, help: helpEs, design: designEs },
} as const
