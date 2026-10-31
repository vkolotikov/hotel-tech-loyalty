/**
 * Industry nouns' keys, framework-free (the members' app shares this file). The words live in the portal bundle
 * under vocab.<industry>.<noun>; `useVocab()` in vocab.ts resolves them for the web portal.
 */
export type VocabIndustry = 'hotel' | 'beauty' | 'medical' | 'restaurant' | 'fitness' | 'other'
export type VocabNoun = 'booking' | 'booking_plural' | 'service' | 'service_plural' | 'staff' | 'venue' | 'visit'

const KNOWN: readonly VocabIndustry[] = ['hotel', 'beauty', 'medical', 'restaurant', 'fitness']

export function vocabIndustry(industry: string | null | undefined): VocabIndustry {
  return (KNOWN as readonly string[]).includes(industry ?? '') ? (industry as VocabIndustry) : 'other'
}

/** The bundle key of a venue's noun (`portal.vocab.beauty.booking_plural`). */
export function vocabKey(industry: string | null | undefined, noun: VocabNoun): string {
  return `portal.vocab.${vocabIndustry(industry)}.${noun}`
}
