import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { ERRORS } from './errors'
import { useBoot } from '../LoyaltyProvider'
import { Notice } from '../../workspace/ui/Notice'
import { SideMenu } from '../../workspace/shell/SideMenu'
import { OverviewButton, OverviewSkeleton } from '../overview/OverviewUI'
import { overviewAssets } from '../overview/assets'
import { useRedesignWords } from '../redesign/words'
import { PROGRAM_KEY, programApi } from './api'
import { TierDialog } from './TierDialog'
import { TierBenefitDialog } from './TierBenefitDialog'
import { RemoveTier } from './RemoveDialogs'
import { TakeOff } from './ProgramPage'
import type { TierBenefit } from './types'

/** A routed editor preserves the tier draft while separate benefit writes refresh the program. */
export function TierEditorPage({ id }: { id: string }) {
  const { t } = useTranslation()
  const say = useRedesignWords()
  const boot = useBoot()
  const navigate = useNavigate()
  const close = () => navigate('/loyalty/program?tab=tiers')
  const query = useQuery({ queryKey: PROGRAM_KEY, queryFn: programApi.program })
  const [all, setAll] = useState(false)
  const [open, setOpen] = useState<{ kind: 'benefit' | 'take_off'; benefit: TierBenefit | null } | { kind: 'delete' } | null>(null)
  if (!boot.staff.can.manage_program) return <div className="l-ov-page"><Notice tone="warning">{t('loyalty.program.read_only', 'Only an owner or a manager can change the programme.')}</Notice><OverviewButton onClick={close}>{say('allLevelsBack')}</OverviewButton></div>
  if (query.isError) return <div className="l-ov-page"><Notice tone="danger">{t(...refusalKey('loyalty.program', ERRORS, 'load', failureOf(query.error)))}</Notice><OverviewButton onClick={() => { void query.refetch() }}>{t('loyalty.common.retry', 'Try again')}</OverviewButton></div>
  const data = query.data
  if (!data) return <div className="l-ov-page"><OverviewSkeleton rows={5} /></div>
  const tier = id === 'new' ? null : data.tiers.find(tier => String(tier.id) === id)
  if (tier === undefined) return <div className="l-ov-page"><Notice tone="warning">{t(...refusalKey('loyalty.program', ERRORS, 'tier', { code: 'not_found', status: 404, extra: {} }))}</Notice><OverviewButton onClick={close}>{say('allLevelsBack')}</OverviewButton></div>
  const more = tier && <SideMenu kind="menu" named place="down-right" label={t('loyalty.membership.more.label', 'More')} buttonClassName="l-ov-button l-rd-icon-button" listClassName="w-56" face="⋯"><button role="menuitem" className="l-rd-menu-item" onClick={() => setOpen({ kind: 'delete' })}>{t('loyalty.program.remove_tier.action', 'Delete')}</button></SideMenu>
  const benefits = tier && <section className="l-ov-panel l-rd-editor-benefits"><div className="l-rd-card-head"><h2>{say('benefitsIn', { name: tier.name })}</h2><OverviewButton type="button" onClick={() => setOpen({ kind: 'benefit', benefit: null })}>+ {say('addBenefit')}</OverviewButton></div>
    <ul>{(all ? tier.benefits : tier.benefits.slice(0, 2)).map(tb => <li key={tb.id}><img src={overviewAssets.gift} alt="" /><div><strong>{tb.name}</strong><small>{tb.value || ''}</small></div><button type="button" className="l-ov-link" onClick={() => setOpen({ kind: 'benefit', benefit: tb })}>{t('loyalty.program.edit', 'Edit')}</button><button type="button" className="l-ov-link" aria-label={t('loyalty.program.tiers.take_off_label', 'Take {{benefit}} off {{tier}}', { benefit: tb.name, tier: tier.name })} onClick={() => setOpen({ kind: 'take_off', benefit: tb })}>×</button></li>)}</ul>
    {!tier.benefits.length && <p>{t('loyalty.program.tiers.no_benefits', 'This tier gives no benefit yet.')}</p>}
    <div className="l-rd-split-line">{tier.benefits.length > 2 && <button type="button" className="l-ov-link" onClick={() => setAll(!all)} aria-expanded={all}>{say('viewAll', { n: tier.benefits.length })}</button>}<small>{say('benefitsSeparate')}</small></div>
  </section>
  return <><TierDialog key={id} page tier={tier} onClose={close} benefits={benefits} more={more} />
    {tier && open?.kind === 'benefit' && <TierBenefitDialog tier={tier} current={open.benefit} benefits={data.benefits} options={data.options} onClose={() => setOpen(null)} />}
    {tier && open?.kind === 'take_off' && open.benefit && <TakeOff tier={tier} tb={open.benefit} onClose={() => setOpen(null)} />}
    {tier && open?.kind === 'delete' && <RemoveTier tier={tier} onClose={() => setOpen(null)} />}
  </>
}
