import { useTranslation } from 'react-i18next'
import { Award } from 'lucide-react'
import type { LoyaltyCardData, PointsPreview } from '../lib/types'
import { pointsLine } from './consequences'

/**
 * The client's real membership: number, tier, balance and the tier's
 * benefits, all read from the programme. `preview` is what completing this
 * appointment would award (absent on the client profile). Nothing is shown
 * at all when the venue runs no programme (`card` is null).
 */
export function LoyaltyCard({ card, preview }: { card: LoyaltyCardData | null; preview: PointsPreview | null }) {
  const { t } = useTranslation()
  if (card === null) return null

  const about = card.awarded != null
    ? (card.awarded > 0
        ? t('appointments.loyalty.awarded', '{{points}} points awarded for this visit.', { points: card.awarded })
        : t('appointments.loyalty.awarded_none', 'No points were awarded for this visit.'))
    : (() => { const line = pointsLine(preview); return line ? t(line.key, line.fallback, line.vars) : null })()

  return (
    <section className="rounded-lg border border-a-border p-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-a-text">
        <Award size={15} aria-hidden /> {t('appointments.loyalty.title', 'Membership')}
      </h3>

      {card.member === null && <p className="mt-1 text-sm text-a-text-2">{t('appointments.client.not_member', 'Not a member')}</p>}

      {card.member !== null && (
        <>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
            <div><dt className="text-xs text-a-text-2">{t('appointments.loyalty.tier', 'Tier')}</dt><dd className="font-semibold text-a-text">{card.member.tier ?? '—'}</dd></div>
            <div><dt className="text-xs text-a-text-2">{t('appointments.loyalty.points', 'Points')}</dt><dd className="font-semibold text-a-text">{card.member.points}</dd></div>
            <div><dt className="text-xs text-a-text-2">{t('appointments.loyalty.number', 'Number')}</dt><dd className="text-a-text">{card.member.number}</dd></div>
          </dl>
          {card.benefits.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {card.benefits.map((b, i) => (
                <li key={i} className="text-a-text">
                  <span className="font-medium">{b.name}</span>
                  {b.display && b.display !== b.name && <span className="text-a-text-2"> — {b.display}</span>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {about && <p className="mt-2 text-sm text-a-text-2">{about}</p>}
    </section>
  )
}
