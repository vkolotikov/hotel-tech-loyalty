import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Notice } from '../../../workspace/ui/Notice'
import { failureOf } from '../../lib/api'
import { errorKey } from '../../lib/errors'
import type { BrandPayload, ProfileFields } from '../../lib/types'
import { HOLIDAY_COUNTRIES, holidayCountryOf } from '../../plan/keyDateMath'
import { INPUT } from '../inputs'
import { useBrand } from '../useBrand'

/** A country's name in the interface's language, from the browser (Intl), never a word list of ours. */
function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/**
 * Key dates (spec 2026-10-16 §3.3): whose public holidays the Plan shows — chosen, "none", or guessed from the venue —
 * and whether marketing and international days show. Managers change them; everyone reads them.
 */
export function KeyDatesSection({ brand, canEdit }: { brand: BrandPayload; canEdit: boolean }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const { saveProfile } = useBrand()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const w = (key: string, english: string, vars?: Record<string, unknown>) => t(`content.brand.keydates.${key}`, english, vars)
  const chosen = brand.profile?.holiday_country ?? null
  const guess = brand.holiday_country_guess ?? null
  const marketing = brand.profile?.marketing_days ?? true
  const country = holidayCountryOf(brand)
  const line = chosen === 'none' ? w('none_line', 'No public holidays are shown.')
    : country === null ? w('no_guess', 'No public holidays until a country is chosen.')
    : chosen === null ? w('guessed', '{{country}} (guessed from the venue’s time zone)', { country: countryName(country, locale) })
    : countryName(country, locale)

  const save = async (fields: ProfileFields) => {
    setBusy(true)
    setError(null)
    try {
      await saveProfile(fields)
    } catch (e) {
      const [key, text] = errorKey('brand', failureOf(e).code)
      setError(t(key, text))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="content-keydates" className="space-y-4 rounded-xl border border-a-border bg-a-surface p-4">
      <div className="space-y-0.5">
        <h2 id="content-keydates" className="font-a-display text-lg font-normal text-a-text">{w('title', 'Key dates')}</h2>
        <p className="text-sm text-a-text-2">{w('intro', 'The holidays and special days the Plan shows. The team adds its own events and notes on the Plan itself.')}</p>
      </div>
      {canEdit ? (
        <div className="space-y-3">
          <label className="block max-w-sm">
            <span className="mb-1 block text-xs font-medium text-a-text-2">{w('country', 'Public holidays of')}</span>
            <select value={chosen ?? ''} disabled={busy} onChange={(e) => { void save({ holiday_country: e.target.value === '' ? null : e.target.value }) }} className={`${INPUT} border-a-border`}>
              <option value="">{guess ? w('auto', 'Automatic: {{country}}', { country: countryName(guess, locale) }) : w('auto_none', 'Automatic: none found')}</option>
              {HOLIDAY_COUNTRIES.map(code => <option key={code} value={code}>{countryName(code, locale)}</option>)}
              <option value="none">{w('none', 'No public holidays')}</option>
            </select>
          </label>
          <p className="text-xs text-a-text-2">{line}</p>
          <div className="flex items-center gap-3">
            <button type="button" role="switch" aria-checked={marketing} disabled={busy} aria-labelledby="content-keydates-marketing"
              onClick={() => { void save({ marketing_days: !marketing }) }}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${marketing ? 'bg-a-accent' : 'bg-a-surface-2'}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-a-surface shadow-a-sm transition ${marketing ? 'left-[1.375rem]' : 'left-0.5'}`} />
            </button>
            <span id="content-keydates-marketing" className="text-sm text-a-text">{w('marketing', 'Marketing and international days')}</span>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5 text-sm">
          <p><span className="text-a-text-2">{w('country', 'Public holidays of')}: </span><span className="text-a-text">{line}</span></p>
          <p>
            <span className="text-a-text-2">{w('marketing', 'Marketing and international days')}: </span>
            <span className="text-a-text">{marketing ? t('content.brand.channels.on', 'On') : t('content.brand.channels.off', 'Off')}</span>
          </p>
        </div>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
    </section>
  )
}
