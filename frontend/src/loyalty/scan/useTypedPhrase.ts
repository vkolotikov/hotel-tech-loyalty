import { useTranslation } from 'react-i18next'
import { useBoot } from '../LoyaltyProvider'
import { amountOf } from '../lib/format'
import { VALUE_PHRASE_WORDS } from '../program/words'

/** A typed benefit value in the reader's words, as Program says it ("15% off", "€5.00 off", "×2 points"). */
export function useTypedPhrase(): (type: string, amount: number) => string | null {
  const { t, i18n } = useTranslation()
  const currency = useBoot().venue.currency
  const locale = i18n.language || 'en'
  return (type, amount) => VALUE_PHRASE_WORDS[type]
    ? t(`loyalty.program.value_phrase.${type}`, VALUE_PHRASE_WORDS[type], { amount: amountOf(type, amount, currency, locale) })
    : null
}
