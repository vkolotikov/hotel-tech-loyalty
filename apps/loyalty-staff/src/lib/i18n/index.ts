import { create } from 'zustand'
import { useCallback } from 'react'
import { en, type Key } from './en'
import { ru } from './ru'
import { de } from './de'
import { fr } from './fr'
import { es } from './es'

/** The five languages of HexaTech, as the web workspace has them. Spanish addresses staff as usted. */
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

/** The sentence for a key in a language, its {{placeholders}} filled (an unknown one is left empty). */
export function say(language: Language, key: Key, vars?: Record<string, string | number>): string {
  const text = BUNDLES[language][key] ?? en[key] ?? key
  return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => (vars && name in vars ? String(vars[name]) : ''))
}

interface LanguageState {
  language: Language
  setLanguage: (language: Language) => void
}

export const useLanguage = create<LanguageState>(set => ({
  language: 'en',
  setLanguage: language => set({ language }),
}))

/** `t(key, vars)` in the chosen language; screens re-render when the language changes. */
export function useT() {
  const language = useLanguage(s => s.language)
  const t = useCallback((key: Key, vars?: Record<string, string | number>) => say(language, key, vars), [language])
  return { t, language }
}
