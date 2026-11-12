import type { CSSProperties } from 'react'
import { useLook } from '../lib/look'
import { TierChip } from '../ui/TierChip'
import { useRedesignWords } from '../redesign/words'
import type { TierRef } from '../lib/types'
import { overviewAssets } from '../overview/assets'
import { memberTierPaint } from './memberPaint'
import { memberAssets } from './assets'
export type MemberStatusName = 'active' | 'off' | 'expiring' | 'expired' | 'scheduled'

export function MemberStatus({ state, pill = false }: { state: MemberStatusName; pill?: boolean }) {
  const say = useRedesignWords()
  const dot = state === 'active' ? overviewAssets.green : state === 'expiring' || state === 'scheduled' ? overviewAssets.amber : state === 'expired' ? memberAssets.expiredDot : overviewAssets.neutral
  return <span className={`l-mb-status l-mb-status-${state}`} data-pill={pill || undefined}><img src={dot} alt="" />{say(state)}</span>
}

/** Compose the existing chip while applying a local, independently verified background. */
export function MemberTierChip({ tier }: { tier?: Pick<TierRef, 'name' | 'color'> | null }) {
  const look = useLook(), paint = memberTierPaint(tier?.color, look.resolved)
  return <span className="l-mb-tier" title={tier?.name} style={{ '--l-mb-tier-bg': paint.background, '--l-mb-tier-text': paint.text, '--l-mb-tier-swatch': paint.swatch } as CSSProperties}><TierChip tier={tier} theme={look.resolved} size="sm" /></span>
}
