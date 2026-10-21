import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { points } from '../lib/format'
import { svgId, type PreviewPaint } from './appMath'

/**
 * A phone-sized preview of the member app's home (release 2 §7), drawn as the full admin's live preview draws it:
 * the header with the logo, the member card in the chosen style, three figures, an offer, a button and the tab bar,
 * every corner from the radius. It is an SVG whose colours are presentation attributes: the colours are the venue's
 * own, and the workspace's stylesheet has no class for an arbitrary colour (the tier chip sets variables for its one
 * colour; this needs eleven). Texts are clipped to their space so a long word in another language cannot run over.
 */
export function PhonePreview({ paint, logo, venue, tier }: { paint: PreviewPaint; logo: string | null; venue: string; tier: string | null }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const base = svgId(useId())
  const ids = { title: `${base}-title`, card: `${base}-card`, screen: `${base}-screen` }
  const { c, radius, button } = paint
  const glass = paint.card === 'glass'
  const cardFill = paint.card === 'gradient' ? `url(#${ids.card})` : c.primary
  const initial = (venue.trim()[0] ?? '·').toUpperCase()
  const stats = [
    { value: '12', label: t('loyalty.app.preview.visits', 'Visits'), colour: c.success },
    { value: points(4, locale), label: t('loyalty.app.preview.offers', 'Offers'), colour: c.warning },
    { value: points(3, locale), label: t('loyalty.app.preview.rewards', 'Rewards'), colour: c.info },
  ]

  return (
    <svg role="img" aria-labelledby={ids.title} viewBox="0 0 264 520" data-preview="" className="mx-auto block h-auto w-full max-w-[16.5rem]">
      <title id={ids.title}>{t('loyalty.app.preview.title', 'Preview of the member app with these colours')}</title>
      <defs>
        <linearGradient id={ids.card} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={c.primary} />
          <stop offset="0.6" stopColor={c.primary} stopOpacity="0.6" />
          <stop offset="1" stopColor={c.secondary} />
        </linearGradient>
        <clipPath id={ids.screen}><rect x="8" y="8" width="248" height="504" rx="30" /></clipPath>
      </defs>

      <rect x="0" y="0" width="264" height="520" rx="38" fill="#0b0b0c" />
      <g clipPath={`url(#${ids.screen})`}>
        <rect x="8" y="8" width="248" height="504" fill={c.background} />
        <text x="30" y="30" fontSize="12" fontWeight="600" fill={c.text}>9:41</text>

        <rect x="8" y="40" width="248" height="48" fill={c.surface} />
        <line x1="8" y1="88.5" x2="256" y2="88.5" stroke={c.border} />
        {logo
          ? <image href={logo} x="20" y="50" width="28" height="28" preserveAspectRatio="xMidYMid meet" />
          : (
            <>
              <rect x="20" y="50" width="28" height="28" rx="7" fill={c.primary} />
              <text x="34" y="69" textAnchor="middle" fontSize="13" fontWeight="700" fill={c.background}>{initial}</text>
            </>
          )}
        <svg x="56" y="50" width="188" height="28"><text x="0" y="19" fontSize="13" fontWeight="700" fill={c.text}>{venue}</text></svg>

        <rect x="20" y="104" width="224" height="132" rx={radius} fill={cardFill} fillOpacity={glass ? 0.15 : 1}
          stroke={glass ? c.primary : 'none'} strokeOpacity={glass ? 0.3 : 0} />
        <svg x="36" y="116" width="192" height="44">
          <text x="0" y="16" fontSize="12" fontWeight="600" fill={paint.cardInk} fillOpacity="0.85">
            {tier ? t('loyalty.app.preview.tier', '{{tier}} member', { tier }) : t('loyalty.app.preview.member', 'Member')}
          </text>
          <text x="0" y="36" fontSize="13" fill={paint.cardInk}>{t('loyalty.app.preview.name', 'Sarah Johnson')}</text>
        </svg>
        <text x="36" y="196" fontSize="12" fill={paint.cardInk2} fillOpacity="0.75">{t('loyalty.app.preview.points', 'Points')}</text>
        <text x="36" y="222" fontSize="24" fontWeight="700" fill={paint.cardInk}>{points(2485, locale)}</text>

        {stats.map((stat, i) => (
          <g key={stat.label}>
            <rect x={20 + i * 78} y="248" width="68" height="56" rx={radius * 0.6} fill={c.secondary} stroke={c.border} />
            <text x={54 + i * 78} y="273" textAnchor="middle" fontSize="15" fontWeight="700" fill={stat.colour}>{stat.value}</text>
            <svg x={22 + i * 78} y="280" width="64" height="20"><text x="32" y="13" textAnchor="middle" fontSize="12" fill={c.text_secondary}>{stat.label}</text></svg>
          </g>
        ))}

        <rect x="20" y="316" width="224" height="56" rx={radius * 0.7} fill={c.secondary} stroke={c.border} />
        <rect x="30" y="328" width="32" height="32" rx={radius * 0.5} fill={c.primary} fillOpacity="0.15" />
        <circle cx="46" cy="344" r="6" fill={c.primary} />
        <svg x="72" y="326" width="124" height="38">
          <text x="0" y="15" fontSize="12" fontWeight="600" fill={c.text}>{t('loyalty.app.preview.offer', 'Spa treatment')}</text>
          <text x="0" y="32" fontSize="12" fill={c.text_secondary}>{t('loyalty.app.preview.offer_line', '15% off, 7 days left')}</text>
        </svg>
        <rect x="200" y="334" width="36" height="20" rx={radius * 0.3} fill={c.error} fillOpacity="0.15" />
        <svg x="200" y="334" width="36" height="20"><text x="18" y="14" textAnchor="middle" fontSize="12" fontWeight="700" fill={c.error}>{t('loyalty.app.preview.new', 'New')}</text></svg>

        <rect x="20" y="388" width="224" height="40" rx={radius * 0.7} fill={button.fill ?? 'none'} fillOpacity={button.fillOpacity}
          stroke={button.stroke ?? 'none'} strokeWidth="2" />
        <text x="132" y="413" textAnchor="middle" fontSize="13" fontWeight="700" fill={button.ink}>{t('loyalty.app.preview.button', 'Redeem')}</text>

        <rect x="8" y="464" width="248" height="48" fill={c.surface} />
        <line x1="8" y1="464.5" x2="256" y2="464.5" stroke={c.border} />
        {[39, 101, 163, 225].map((x, i) => <circle key={x} cx={x} cy="486" r="6" fill={i === 0 ? c.primary : c.text_secondary} />)}
      </g>
    </svg>
  )
}
