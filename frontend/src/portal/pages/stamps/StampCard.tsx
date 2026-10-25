import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check, Stamp } from 'lucide-react'
import { resolveLocale } from '../../lib/dates'
import { Card } from '../../ui/Card'
import { rewardPhrase, STAMP_WORDS, stampFace, toGoPhrase } from './stampMath'
import { STAMPS_KEY, stampsApi } from './stampsApi'

/**
 * The member's stamp card on Home (release 7, spec 2026-10-25 §2), when the venue uses it: a circle per stamp the card
 * needs, filled for each visit stamped, how many visits are left and what a full card gives. Nothing at all while the
 * venue does not use it, or before the answer arrives — the card is not worth a placeholder.
 */
export function StampCard() {
  const { t, i18n } = useTranslation()
  const { data } = useQuery({ queryKey: STAMPS_KEY, queryFn: stampsApi.mine, staleTime: 60_000 })
  const face = stampFace(data)
  if (!face) return null
  const locale = resolveLocale(i18n.language)
  const numbers = { have: face.count.toLocaleString(locale), needed: face.needed.toLocaleString(locale) }
  const toGo = toGoPhrase(face)
  const reward = rewardPhrase(face, i18n.language)

  return (
    <Card className="p-4" data-stamp-card="">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-p-text">
          <Stamp size={16} className="text-p-accent-deep" aria-hidden />{t('portal.stamps.title', STAMP_WORDS.title)}
        </p>
        <span className="text-xs text-p-text-2 tabular-nums">{t('portal.stamps.count', STAMP_WORDS.count, numbers)}</span>
      </div>
      <div role="img" aria-label={t('portal.stamps.label', STAMP_WORDS.label, numbers)} className="flex flex-wrap gap-2">
        {face.filled.map((filled, i) => (
          <span key={i} data-filled={filled ? '' : undefined}
            className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${filled ? 'bg-p-accent border-p-accent text-p-accent-ink' : 'bg-p-surface-2 border-p-border'}`}>
            {filled && <Check size={14} aria-hidden />}
          </span>
        ))}
      </div>
      <p className="text-sm font-semibold text-p-text mt-3">{t(toGo.key, toGo.fallback, toGo.options)}</p>
      <p className="text-[11px] text-p-text-2 mt-0.5">
        {t(reward.key, reward.fallback, reward.options)}
        {face.completed > 0 && <> · {t('portal.stamps.completed', STAMP_WORDS.completed, { cards: face.completed.toLocaleString(locale) })}</>}
      </p>
    </Card>
  )
}
