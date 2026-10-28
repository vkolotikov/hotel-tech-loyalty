import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useBoot } from '../../LoyaltyProvider'
import { mediaUrl } from '../../lib/api'
import { points } from '../../lib/format'
import type { Summary } from '../../overview/types'
import { OverviewButton } from '../../overview/OverviewUI'
import type { LookForm, PreviewPaint } from '../appMath'
import { useCardWords } from './words'

/** Illustrative, non-scannable member view. Only branding and programme facts are real. */
export function MemberPreview({ paint, form, logo, tier, state, device, summary, summaryFailed, onAction }: {
  paint: PreviewPaint; form: LookForm; logo: string | null; tier: string | null; state: string; device: 'mobile' | 'desktop';
  summary?: Summary; summaryFailed: boolean; onAction: (action: string) => void
}) {
  const say = useCardWords(), boot = useBoot(), { i18n } = useTranslation()
  const reward = summary?.minimum_reward, n = (value: number) => points(value, i18n.language)
  const style = Object.fromEntries(Object.entries(paint.c).map(([key, value]) => [`--ca-${key.replaceAll('_', '-')}`, value])) as CSSProperties
  Object.assign(style, { '--ca-radius': `${paint.radius}px`, '--ca-strength': form.accent_intensity === 'subtle' ? '.1' : form.accent_intensity === 'bold' ? '.3' : '.18' })
  return <div className="l-ca-preview-wrap" data-device={device}>
    <p className="l-ca-preview-label">{say(device === 'mobile' ? 'mobileLabel' : 'desktopLabel')}</p>
    <div className="l-ca-viewport" style={style} data-card={paint.card} data-button={form.button_style}>
      <div className="l-ca-preview-brand">{logo ? <img src={mediaUrl(logo)} alt={say('logoAlt')} /> : boot.organization.name}</div>
      <div className="l-ca-member-card"><div><strong>{boot.organization.name}</strong>{tier && <span>{tier}</span>}</div><p>{say('exampleName')}</p><small>{say(summary?.mode === 'points' ? 'pointsAvailable' : 'membership')}</small><b>{summary?.mode === 'points' ? say('points', { n: n(state === 'new' ? 0 : 750) }) : tier ?? say('member')}</b><small>{say('exampleId')}</small></div>
      <div className="l-ca-member-actions"><OverviewButton type="button" onClick={() => onAction('code')}>{say('showCode')}</OverviewButton><OverviewButton type="button" onClick={() => onAction('wallets')}>{say('walletOptions')}</OverviewButton></div>
      {state !== 'empty' && <div className="l-ca-preview-content">
        <div className="l-ca-preview-reward"><p>{say('rewardExample')}</p>
          {summaryFailed ? <p>{say('programmeUnavailable')}</p> : !summary ? <p>{say('loadingProgramme')}</p> : reward ? <><strong>{reward.name}</strong><small>{say('points', { n: n(reward.points_cost) })}</small><OverviewButton type="button" primary onClick={() => onAction('reward')}>{say('viewReward')}</OverviewButton></> : <p>{say('noRewards')}</p>}
        </div>
        <div className="l-ca-preview-benefit"><strong>{say('memberBenefits')}</strong><p>{summary ? say('benefitsCount', { n: n(summary.benefits) }) : say(summaryFailed ? 'programmeUnavailable' : 'loadingProgramme')}</p><button type="button" className="l-ov-link" onClick={() => onAction('benefits')}>{say('viewBenefits')} →</button></div>
      </div>}
    </div>
  </div>
}
