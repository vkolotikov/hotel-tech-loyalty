/** The languages the panel offers for a post; a post keeps any other one it already has. */
export const LANGUAGES = ['en', 'ru', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'lv', 'lt', 'et', 'uk', 'sv', 'fi', 'da', 'nb', 'cs'] as const

/** A language's name in the reader's language ("de" reads "German" in English); the code where the browser cannot say. */
export function languageName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}
