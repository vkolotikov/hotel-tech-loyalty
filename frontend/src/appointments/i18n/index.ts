import i18n from '../../i18n'
import en from './appointments.en.json'
import ru from './appointments.ru.json'
import de from './appointments.de.json'
import fr from './appointments.fr.json'
import es from './appointments.es.json'

/**
 * The workspace's strings, kept out of the admin's common.json so a session
 * that never opens the workspace never downloads them. Registered under the
 * `appointments` key of the `common` namespace, so call sites read
 * `t('appointments.nav.calendar')`.
 */
export const APPOINTMENTS_LOCALE_FILES = { en, ru, de, fr, es } as const

let registered = false

export function registerAppointmentsLocales(): void {
  if (registered) return
  for (const [lang, bundle] of Object.entries(APPOINTMENTS_LOCALE_FILES)) {
    i18n.addResourceBundle(lang, 'common', { appointments: bundle }, true, true)
  }
  registered = true
}
