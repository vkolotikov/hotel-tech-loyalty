import i18n from '../../i18n'
import en from './portal.en.json'
import ru from './portal.ru.json'
import de from './portal.de.json'
import fr from './portal.fr.json'
import es from './portal.es.json'

/**
 * The member portal's strings, kept out of the admin's common.json so a
 * staff session never downloads them and a translator sees them as one
 * file per language. Registered under the `portal` key of the `common`
 * namespace, so call sites read `t('portal.nav.home')` — dotted keys the
 * locale sweep in src/i18n/localeCompleteness.test.ts can see.
 */
export const PORTAL_LOCALE_FILES = { en, ru, de, fr, es } as const

let registered = false

export function registerPortalLocales(): void {
  if (registered) return
  for (const [lang, bundle] of Object.entries(PORTAL_LOCALE_FILES)) {
    i18n.addResourceBundle(lang, 'common', { portal: bundle }, true, true)
  }
  registered = true
}
