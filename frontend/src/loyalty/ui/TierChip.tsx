import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import type { ThemeName } from '../../workspace/theme/accent'
import { tierTextStyle } from '../redesign/designMath'
import { tierPaint } from '../theme/tierChip'
import type { TierRef } from '../lib/types'

/** A tier's name on its own colour (theme/tierChip.ts); "No tier" for a member without one. */
export function TierChip({ tier, theme, size = 'md' }: { tier: Pick<TierRef, 'name' | 'color'> | null | undefined; theme: ThemeName; size?: 'sm' | 'md' }) {
  const { t } = useTranslation()
  const paint = tierPaint(tier?.color, theme)
  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
  return (
    <span data-tier-chip="" data-edge={paint.edge ? '' : undefined} style={{ ...paint.style, ...tierTextStyle(tier?.color) } as CSSProperties}
      className={`l-tier inline-flex max-w-full items-center rounded-full font-semibold ${pad}`}>
      <span className="truncate">{tier ? tier.name : t('loyalty.common.no_tier', 'No tier')}</span>
    </span>
  )
}
