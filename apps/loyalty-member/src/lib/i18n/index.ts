import i18next from 'i18next'
import { initReactI18next, useTranslation } from 'react-i18next'
import { create } from 'zustand'
import { useCallback } from 'react'
import { en, type Key } from './en'
import { ru } from './ru'
import { de } from './de'
import { fr } from './fr'
import { es } from './es'
import { PORTAL_BUNDLES } from './portalBundles'

/** The five languages of HexaTech, as the portal has them. */
export const LANGUAGES = ['en', 'ru', 'de', 'fr', 'es'] as const
export type Language = typeof LANGUAGES[number]
export type { Key }

export const BUNDLES: Record<Language, Record<Key, string>> = { en, ru, de, fr, es }

/** Each language's own name, for the picker. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', ru: 'Русский', de: 'Deutsch', fr: 'Français', es: 'Español' }

/** A supported language from a code such as `ru-LV` or `de`, else English. */
export function languageOf(code: string | null | undefined): Language {
  const base = (code ?? '').toLowerCase().split(/[-_]/)[0]
  return (LANGUAGES as readonly string[]).includes(base) ? (base as Language) : 'en'
}

/** `{'signIn.title': …}` as i18next's nested tree (`{signIn: {title: …}}`), so `member.signIn.title` resolves. */
export function nested(flat: Record<string, string>): Record<string, unknown> {
  const tree: Record<string, unknown> = {}
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split('.')
    let node = tree
    parts.slice(0, -1).forEach(part => {
      node[part] = (node[part] as Record<string, unknown> | undefined) ?? {}
      node = node[part] as Record<string, unknown>
    })
    node[parts[parts.length - 1]] = value
  }
  return tree
}

/**
 * One i18next for everything: the portal's words under `portal.*` (shared with the portal and with the portal's own
 * framework-free helpers, which import this same `i18next`), the app's under `member.*`. Plurals follow each
 * language's own rule, as in the portal.
 */
void i18next.use(initReactI18next).init({
  resources: Object.fromEntries(LANGUAGES.map(lang => [lang, { common: { portal: PORTAL_BUNDLES[lang], member: nested(BUNDLES[lang]) } }])),
  lng: 'en',
  fallbackLng: 'en',
  defaultNS: 'common',
  ns: ['common'],
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
  react: { useSuspense: false },
})

interface LanguageState {
  language: Language
  setLanguage: (language: Language) => void
}

export const useLanguage = create<LanguageState>(set => ({
  language: 'en',
  setLanguage: language => {
    void i18next.changeLanguage(language)
    set({ language })
  },
}))

/** The app's own sentence for a key in a language, outside React (tests, notifications). */
export function say(language: Language, key: Key, vars?: Record<string, string | number>): string {
  return i18next.t(`member.${key}`, { lng: language, ...vars })
}

/**
 * `t(key, vars)` for the app's own words (typed), `tp(key, fallback, options)` for the portal's — the same call the
 * portal's helpers take. Screens re-render when the language changes.
 */
export function useT() {
  const language = useLanguage(s => s.language)
  const { t: raw } = useTranslation()
  const t = useCallback((key: Key, vars?: Record<string, string | number>) => raw(`member.${key}`, { ...vars }), [raw, language])
  const tp = useCallback(
    (key: string, fallback?: string | Record<string, unknown>, options?: Record<string, unknown>) =>
      typeof fallback === 'string' ? raw(key, fallback, options ?? {}) : raw(key, fallback ?? {}),
    [raw, language],
  ) as (key: string, fallback?: string | Record<string, unknown>, options?: Record<string, unknown>) => string
  return { t, tp, language }
}
