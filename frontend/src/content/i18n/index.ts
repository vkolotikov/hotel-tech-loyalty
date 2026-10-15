import i18n from '../../i18n'
import en from './content.en.json'
import ru from './content.ru.json'
import de from './content.de.json'
import fr from './content.fr.json'
import es from './content.es.json'

/**
 * HexaTech Content's words, kept out of the admin's common.json so a session
 * that never opens Content never downloads them. Registered under the
 * `content` key of the `common` namespace, so call sites read
 * `t('content.plan.today')`. Registered when the chunk loads.
 */
export const CONTENT_LOCALE_FILES = { en, ru, de, fr, es } as const

let registered = false

export function registerContentLocales(): void {
  if (registered) return
  for (const [lang, bundle] of Object.entries(CONTENT_LOCALE_FILES)) {
    i18n.addResourceBundle(lang, 'common', { content: bundle }, true, true)
  }
  registered = true
}
