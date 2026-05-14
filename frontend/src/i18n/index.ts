import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from './locales/en/common.json'
import ru from './locales/ru/common.json'
import de from './locales/de/common.json'

/**
 * Admin SPA i18n. Russian is the first non-English locale; German /
 * French / Spanish follow. Strings live in `locales/<lang>/common.json`
 * — one flat namespace is enough at this scale (it keeps lookups fast
 * and avoids the per-feature-bundle juggling).
 *
 * Resolution order:
 *   1. localStorage (`admin_lang`) — set by the in-app switcher.
 *   2. The authenticated user's `language` column — synced on login via
 *      `applyServerLanguage()` so the same user gets the same locale on
 *      every device.
 *   3. Browser navigator — best-effort default for first-time visitors.
 *   4. English — fallback that always renders.
 */
export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English',  flag: '\u{1F1FA}\u{1F1F8}' },
  { code: 'ru', label: 'Russian',  flag: '\u{1F1F7}\u{1F1FA}' },
  { code: 'de', label: 'Deutsch',  flag: '\u{1F1E9}\u{1F1EA}' },
] as const

export type LangCode = (typeof SUPPORTED_LANGUAGES)[number]['code']

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: en },
      ru: { common: ru },
      de: { common: de },
    },
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common'],
    supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
    nonExplicitSupportedLngs: true, // 'ru-RU' falls back to 'ru'
    interpolation: { escapeValue: false }, // React already escapes
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'admin_lang',
      caches: ['localStorage'],
    },
    returnNull: false,
  })

/**
 * Apply the language the server says this user prefers (from
 * `users.language`). Idempotent — only switches if it actually differs
 * from the current i18n language, so we don't re-fire React re-renders
 * for nothing. Called once on app boot from `AuthStore.bootstrap`.
 */
export function applyServerLanguage(lang?: string | null) {
  if (!lang) return
  const supported = SUPPORTED_LANGUAGES.find((l) => l.code === lang)
  if (!supported) return
  if (i18n.language !== supported.code) {
    void i18n.changeLanguage(supported.code)
  }
}

export default i18n
