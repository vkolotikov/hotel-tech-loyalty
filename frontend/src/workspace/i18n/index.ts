import i18n from '../../i18n'
import en from './workspace.en.json'
import ru from './workspace.ru.json'
import de from './workspace.de.json'
import fr from './workspace.fr.json'
import es from './workspace.es.json'

/**
 * The words every workspace's frame shares (the theme switch, the side
 * panel, Find, the list of shortcuts), kept out of the admin's common.json so
 * a session that never opens a workspace never downloads them. Registered
 * under the `workspace` key of the `common` namespace, so call sites read
 * `t('workspace.theme.light')`. A workspace registers them when its chunk loads.
 */
export const WORKSPACE_LOCALE_FILES = { en, ru, de, fr, es } as const

let registered = false

export function registerWorkspaceLocales(): void {
  if (registered) return
  for (const [lang, bundle] of Object.entries(WORKSPACE_LOCALE_FILES)) {
    i18n.addResourceBundle(lang, 'common', { workspace: bundle }, true, true)
  }
  registered = true
}
