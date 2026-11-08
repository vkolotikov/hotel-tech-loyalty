import i18n from '../../i18n'

/**
 * HexaTech CRM's words, kept out of the admin's common.json so a session that never opens the workspace never
 * downloads them. `crm.<lang>.json` holds the frame's and the shared words, registered under the `crm` key of the
 * `common` namespace (key crm.nav.today); every other `<area>.<lang>.json` here is one area's, registered under
 * `crm.<area>` (key crm.inbox.reply). A new area adds its five files and nothing else. Every key is in all five
 * languages (crmLocales.test.ts); Spanish addresses staff as usted.
 */
export const LANGS = ['en', 'ru', 'de', 'fr', 'es'] as const

const FILES = import.meta.glob<Record<string, unknown>>('./*.json', { eager: true, import: 'default' })

/** Every language's bundle: the root file's words, then each area's under its name. */
export function crmBundles(files: Record<string, Record<string, unknown>> = FILES): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = Object.fromEntries(LANGS.map(lang => [lang, {}]))
  for (const [path, words] of Object.entries(files)) {
    const m = /\/([a-z]+)\.([a-z]{2})\.json$/.exec(path)
    if (!m || !(m[2] in out)) continue
    const [, area, lang] = m
    if (area === 'crm') out[lang] = { ...words, ...out[lang] }
    else out[lang][area] = words
  }
  return out
}

let registered = false

export function registerCrmLocales(): void {
  if (registered) return
  for (const [lang, bundle] of Object.entries(crmBundles())) {
    i18n.addResourceBundle(lang, 'common', { crm: bundle }, true, true)
  }
  registered = true
}
