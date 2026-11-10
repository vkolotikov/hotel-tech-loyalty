import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SideMenu } from '../../../workspace/shell/SideMenu'
import { Notice } from '../../../workspace/ui/Notice'
import { useBoot } from '../../LoyaltyProvider'
import { failureOf } from '../../lib/api'
import { amountOf } from '../../lib/format'
import { refusalKey } from '../../lib/errors'
import { OverviewButton } from '../../overview/OverviewUI'
import { TierAssignmentEditor } from '../../management/TierAssignmentEditor'
import { useAdminWords } from '../../management/words'
import { ManagementVisual } from '../../management/ManagementUI'
import { PROGRAM_KEY, afterProgramChange, programApi } from '../../program/api'
import { BenefitDialog } from '../../program/BenefitDialog'
import { RemoveBenefit, RenameDialog } from '../../program/RemoveDialogs'
import { ERRORS } from '../../program/errors'
import type { Benefit, Tier, TierBenefit } from '../../program/types'
import { APPLIES_TO_WORDS, CATEGORY_WORDS, FULFILLMENT_WORDS, VALUE_PHRASE_WORDS } from '../../program/words'
import { LoadFailed, Loading } from '../parts'
import { RewardColumns, RewardEmpty, RewardEyebrow, RewardHeading, RewardRow } from './RewardUI'
import { RewardIcon, RewardStatus } from './presentation'
import { benefitAssignments, benefitState, benefitPreview, rewardsUrl } from './math'
import { useRewardWords } from './words'

type Open = { kind: 'edit'; benefit: Benefit | null } | { kind: 'rename' | 'remove' | 'assign'; benefit: Benefit } | { kind: 'assignment'; tier: Tier; current: TierBenefit | null; benefit: Benefit }

export function MembershipBenefitsPage() {
  const { t, i18n } = useTranslation(), say = useRewardWords(), admin = useAdminWords(), boot = useBoot(), client = useQueryClient()
  const query = useQuery({ queryKey: PROGRAM_KEY, queryFn: programApi.program }), data = query.data
  const [open, setOpen] = useState<Open | null>(null)
  const close = () => { setOpen(null); if (params.has('assign')) { params.delete('assign'); navigate(`${location.pathname}?${params}`, { replace: true }) } }
  const [previewTier, setPreviewTier] = useState<{ benefit: number; tier: number } | null>(null)
  const location = useLocation(), navigate = useNavigate(), params = new URLSearchParams(location.search)
  const q = params.get('q') ?? '', delivery = params.get('delivery') ?? 'all', level = params.get('level') ?? 'all', status = params.get('status') ?? 'all'
  const manage = boot.staff.can.manage_program
  const unused = data?.advice?.find(a => a.code === 'benefit_unused')
  const go = (patch: Record<string, string | number>) => { const url = rewardsUrl('benefits', { q, delivery, level, status, selected: params.get('selected'), ...patch }); navigate(url, { replace: true }) }
  const assigned = (b: Benefit) => benefitAssignments(b, data?.tiers ?? [])
  const state = (b: Benefit) => data?.advice === undefined ? benefitState(b, data?.tiers ?? []) : !b.is_active ? 'off' : unused?.benefits.some(ref => ref.id === b.id) ? 'unassigned' : 'active'
  const visible = (data?.benefits ?? []).filter(b => b.name.toLocaleLowerCase().includes(q.toLocaleLowerCase()) && (delivery === 'all' || b.fulfillment_mode === delivery) && (level === 'all' || assigned(b).some(a => String(a.tier.id) === level)) && (status === 'all' || state(b) === status))
  const selected = visible.find(b => String(b.id) === params.get('selected')) ?? visible[0]
  const assignments = selected ? assigned(selected) : []
  const preview = selected ? benefitPreview(selected, data?.tiers ?? [], previewTier?.benefit === selected.id ? previewTier.tier : (level === 'all' ? null : Number(level))) : undefined
  const directAssignment = data?.benefits.find(b => String(b.id) === params.get('assign'))
  const mode = (value: string | null) => value ? t(`loyalty.program.fulfillment_mode.${value}`, FULFILLMENT_WORDS[value] ?? value) : '—'
  const flip = useMutation({ mutationFn: (b: Benefit) => programApi.updateBenefit(b.id, { is_active: !b.is_active }), onSuccess: () => afterProgramChange(client, { benefits: true }) })
  const previewValue = preview?.value.value_amount !== null && preview?.value.value_amount !== undefined && VALUE_PHRASE_WORDS[preview.value.value_type] ? t(`loyalty.program.value_phrase.${preview.value.value_type}`, VALUE_PHRASE_WORDS[preview.value.value_type], { amount: amountOf(preview.value.value_type, preview.value.value_amount, boot.venue.currency, i18n.language) }) : preview?.value.value || selected?.name
  return <div className="l-ad-page l-rd-page l-rb-page l-rc-page l-rc-benefits">
    <RewardHeading title={admin('perks')} line={admin('perksLine')}><Link className="l-ov-button" to="/loyalty/requests">{t('loyalty.nav.requests', 'Requests')}</Link>{manage && data && <OverviewButton type="button" primary onClick={() => setOpen({ kind: 'edit', benefit: null })}>{say('addBenefit')}</OverviewButton>}</RewardHeading>
    {!manage && <p data-read-only="">{t('loyalty.program.read_only', 'Only an owner or a manager can change the programme.')}</p>}
    {query.isError && <LoadFailed error={query.error} onRetry={() => { void query.refetch() }} />}{!data && query.isLoading && <Loading />}
    {data && <>

      <div className="l-rb-columns"><section className="l-ov-panel l-rb-list"><header><div className="l-rc-heading"><RewardIcon kind="members" /><h2>{say('yourBenefits')}</h2></div><small>{say('activeBenefitTotal', { active: data.benefits.filter(b => state(b) === 'active').length, total: data.benefits.length })}</small></header>
      <div className="l-rb-filters"><label><span>{say('searchBenefits')}</span><input type="search" value={q} placeholder={say('searchName')} onChange={e => go({ q: e.target.value })} /></label><label><span>{say('delivery')}</span><select value={delivery} onChange={e => go({ delivery: e.target.value })}><option value="all">{say('allMethods')}</option>{[...new Set([...data.options.fulfillment_modes, ...data.benefits.map(b => b.fulfillment_mode).filter((m): m is string => !!m)])].map(m => <option key={m} value={m}>{mode(m)}</option>)}</select></label><label><span>{say('level')}</span><select value={level} onChange={e => go({ level: e.target.value })}><option value="all">{say('allLevels')}</option>{data.tiers.map(tier => <option key={tier.id} value={tier.id}>{tier.name}</option>)}</select></label></div>
      <div className="l-ad-filter-tabs">{(['all', 'active', 'unassigned', 'off'] as const).map(v => <button type="button" key={v} aria-pressed={status === v} onClick={() => go({ status: v })}>{v === 'all' ? say('allStatuses') : v === 'active' ? admin('assigned') : v === 'off' ? say('off') : admin('needsTier')} <small>{data.benefits.filter(b => v === 'all' || state(b) === v).length}</small></button>)}</div><RewardColumns first={say('benefitDelivery')} value={say('assigned')} /><ul>{visible.map(b => <RewardRow key={b.id} id={`benefit-${b.id}`} icon={b.fulfillment_mode === 'pms_linked' ? 'calendarNeutral' : b.fulfillment_mode === 'automatic' ? 'discount' : 'gift'} name={b.name} caption={mode(b.fulfillment_mode)} value={assigned(b).map(a => a.tier.name).join(' · ') || say('noLevels')} status={say(state(b))} tone={state(b)} selected={b.id === selected?.id} onSelect={() => { go({ selected: b.id }); setPreviewTier(null); flip.reset() }} />)}</ul>{!visible.length && <RewardEmpty empty={!data.benefits.length ? say('emptyBenefits') : undefined} onClear={data.benefits.length ? () => go({ q: '', delivery: 'all', level: 'all', status: 'all' }) : undefined} />}</section>
      {selected && <aside id="management-detail" tabIndex={-1} className="l-ov-panel l-rb-detail l-rc-benefit-detail"><div className="l-rb-section-head"><RewardEyebrow icon="members">{say('selectedBenefit')}</RewardEyebrow><RewardStatus tone={state(selected)}>{say(state(selected))}</RewardStatus>{manage && <OverviewButton onClick={() => setOpen({ kind: 'edit', benefit: selected })}>{t('loyalty.program.edit', 'Edit')}</OverviewButton>}</div><h2 className="l-rb-title">{selected.name}</h2><ManagementVisual art="perkArt" label={`${say('preview')}${preview ? ` · ${preview.tier.name}` : ''}`} title={preview ? previewValue : admin('needsTier')} line={selected.description} />
        {assignments.length > 0 && <label className="l-rb-field"><span>{say('level')}</span><select value={preview?.tier.id ?? ''} onChange={e => setPreviewTier({ benefit: selected.id, tier: Number(e.target.value) })}>{!preview && <option value="">{admin('chooseTier')}</option>}{assignments.map(a => <option key={a.tier.id} value={a.tier.id}>{a.tier.name}{!a.tier.is_active && ` · ${say('off')}`}</option>)}</select></label>}
        <dl className="l-rb-facts"><dt>{say('delivery')}</dt><dd>{mode(selected.fulfillment_mode)}</dd>{preview && <><dt>{t('loyalty.program.tier_benefit.applies_to', 'Applies to')}</dt><dd>{t(`loyalty.program.applies_to.${preview.value.applies_to}`, APPLIES_TO_WORDS[preview.value.applies_to] ?? preview.value.applies_to)}</dd></>}<dt>{say('assigned')}</dt><dd>{assignments.map(a => `${a.tier.name}${a.tier.is_active ? '' : ` (${say('off')})`}`).join(' · ') || say('noLevels')}</dd></dl><details className="l-rb-more"><summary>{t('loyalty.program.benefit.category', 'Category')}</summary><p>{selected.category ? t(`loyalty.program.category.${selected.category}`, CATEGORY_WORDS[selected.category] ?? selected.category) : '—'}</p></details>
        <div className="l-rb-divider"><strong>{say('valuesPerLevel')}</strong><p>{preview ? manage ? say('assignmentNote', { level: preview.tier.name }) : say('valuesPerLevel') : say('noLevels')}</p>{preview && manage && <button className="l-ov-link" onClick={() => setOpen({ kind: 'assignment', tier: preview.tier, current: preview.value, benefit: selected })}>{say('manageAssignment', { level: preview.tier.name })}</button>}</div>
        {manage && <><div className="l-rb-detail-actions"><SideMenu kind="menu" place="down-right" named label={t('loyalty.membership.more.label', 'More')} face="…" buttonClassName="l-ov-button" listClassName="w-56"><button role="menuitem" className="l-rd-menu-item" onClick={() => setOpen({ kind: 'rename', benefit: selected })}>{t('loyalty.program.rename.action', 'Rename')}</button><button role="menuitem" disabled={flip.isPending} className="l-rd-menu-item" onClick={() => flip.mutate(selected)}>{selected.is_active ? t('loyalty.program.benefits.switch_off', 'Switch off') : t('loyalty.program.benefits.switch_on', 'Switch on')}</button><button role="menuitem" className="l-rd-menu-item" onClick={() => setOpen({ kind: 'remove', benefit: selected })}>{t('loyalty.program.remove_benefit.action', 'Delete')}</button></SideMenu></div><OverviewButton type="button" primary disabled={!selected.is_active || flip.isPending} onClick={() => setOpen({ kind: 'assign', benefit: selected })}>{say('assign')}</OverviewButton></>}
        {flip.isError && <Notice tone="danger">{t(...refusalKey('loyalty.program', ERRORS, 'benefit', failureOf(flip.error)))}</Notice>}
      </aside>}</div></>}
    {data && manage && open?.kind === 'edit' && <BenefitDialog benefit={open.benefit} options={data.options} onClose={close} />}
    {manage && open?.kind === 'rename' && <RenameDialog subject={{ kind: 'benefit', benefit: open.benefit }} onClose={close} />}
    {manage && open?.kind === 'remove' && <RemoveBenefit benefit={open.benefit} onClose={close} />}
    {data && manage && (open?.kind === 'assign' || open?.kind === 'assignment' || directAssignment) && <TierAssignmentEditor program={data} benefitId={open && 'benefit' in open ? open.benefit?.id : directAssignment?.id} tierId={open?.kind === 'assignment' ? open.tier.id : undefined} current={open?.kind === 'assignment' ? open.current : undefined} onClose={close} />}

  </div>
}
