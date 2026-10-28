import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Notice } from '../../../workspace/ui/Notice'
import { useBoot } from '../../LoyaltyProvider'
import { useLeaveGuard, type EarnGuard } from '../../earn/useLeaveGuard'
import { failureOf, mediaUrl } from '../../lib/api'
import { refusalKey } from '../../lib/errors'
import { wallInput } from '../../lib/forms'
import { points } from '../../lib/format'
import { FormField } from '../../ui/formParts'
import { OverviewButton } from '../../overview/OverviewUI'
import { DesignDialog, NumberControl } from '../../redesign/DesignUI'
import { CATALOGUE_KEY, rewardsApi } from '../api'
import { ERRORS } from '../errors'
import { BrandField } from '../parts'
import { PictureField } from '../PictureField'
import { MAX_COST, MAX_DISCOUNT, MAX_PER_MEMBER, MAX_STOCK, brandPart, initialBrand, rewardBody, rewardFormOf, rewardProblems, rewardServerProblems, type RewardForm } from '../rewardsMath'
import type { BrandChoice, Catalogue, Reward, RewardOptions } from '../types'
import { APPLIES_TO_WORDS, DISCOUNT_TYPE_WORDS, REWARD_PROBLEM_WORDS } from '../words'
import { RewardEyebrow, RewardHeading, RewardLeaveDialog } from './RewardUI'
import { rewardsUrl, rewardEditorProblems, rewardModes, type RewardModes } from './math'
import { useRewardWords } from './words'

export function RewardEditorPage({ id, catalogue }: { id: string; catalogue: Catalogue }) {
  const guard = useLeaveGuard(), say = useRewardWords()
  const reward = catalogue.rewards.find(r => String(r.id) === id) ?? null
  if (id !== 'new' && !reward) return <div className="l-ov-page l-rb-page"><p role="status">{say('missing')}</p><Link className="l-ov-link" to="/loyalty/rewards">{say('back')}</Link></div>
  return <><RewardEditor key={`${id}:${guard.resetVersion}`} reward={reward} options={catalogue.options} guard={guard} /><RewardLeaveDialog guard={guard} /></>
}

function RewardEditor({ reward, options, guard }: { reward: Reward | null; options: RewardOptions; guard: EarnGuard }) {
  const { t, i18n } = useTranslation(), say = useRewardWords(), boot = useBoot(), client = useQueryClient(), navigate = useNavigate()
  const manage = boot.staff.can.manage_rewards, zone = boot.venue.timezone
  const [initial] = useState(() => rewardFormOf(reward, options, zone))
  const [form, setForm] = useState<RewardForm>(initial), [tried, setTried] = useState(false)
  const [modes, setModes] = useState<RewardModes>(() => rewardModes(initial))
  const savedBrand = reward ? reward.brand_id ?? null : undefined
  const [initialBrandValue] = useState(() => initialBrand(options.brands, savedBrand))
  const [brand, setBrand] = useState<BrandChoice>(initialBrandValue)
  const [picture, setPicture] = useState(reward?.image_url ?? null), [dialog, setDialog] = useState<'terms' | 'picture' | null>(null)
  const { mark, begin, end } = guard
  const dirty = JSON.stringify(form) !== JSON.stringify(initial) || JSON.stringify(modes) !== JSON.stringify(rewardModes(initial)) || brand !== initialBrandValue
  useEffect(() => { mark('reward', dirty); return () => mark('reward', false) }, [dirty, mark])
  const pictureBusy = useCallback((busy: boolean) => { if (busy) begin(); else end() }, [begin, end])
  const save = useMutation({
    mutationFn: () => reward ? rewardsApi.updateReward(reward.id, { ...rewardBody(form), ...brandPart(brand, savedBrand) }) : rewardsApi.createReward({ ...rewardBody(form), ...brandPart(brand) }),
    onSuccess: ({ reward: updated }) => {
      client.setQueryData<Catalogue>(CATALOGUE_KEY, old => old ? { ...old, rewards: reward ? old.rewards.map(r => r.id === updated.id ? updated : r) : [...old.rewards, updated] } : old)
      void client.invalidateQueries({ queryKey: CATALOGUE_KEY }); mark('reward', false)
      navigate(rewardsUrl('catalogue', { selected: updated.id, saved: '1' }))
    }, onSettled: end,
  })
  const update = (patch: Partial<RewardForm>) => { setForm(old => ({ ...old, ...patch })); if (save.isError) save.reset() }
  const failure = save.isError ? failureOf(save.error) : null
  const problems = { ...(tried ? rewardEditorProblems(form, options, modes) : {}), ...rewardServerProblems(failure?.fields, form) }
  const problem = (field: string) => problems[field] ? t(`loyalty.rewards.reward.problem.${problems[field]}`, REWARD_PROBLEM_WORDS[problems[field]] ?? REWARD_PROBLEM_WORDS.name) : null
  const cancel = () => guard.go('/loyalty/rewards')
  const submit = (e: React.FormEvent) => { e.preventDefault(); setTried(true); if (manage && !Object.keys(rewardEditorProblems(form, options, modes)).length && begin()) save.mutate() }
  const num = (name: 'stock' | 'per_member_limit' | 'discount_value', max: number, min: number, step = 1) => <input type="number" min={min} max={max} step={step} inputMode={step < 1 ? 'decimal' : 'numeric'} value={form[name]} onChange={e => update({ [name]: e.target.value })} />
  const eligibleCost = !rewardProblems(form, options).points_cost
  return <div className="l-ov-page l-rd-page l-rb-page">
    <Link className="l-ov-link l-rb-back" to="/loyalty/rewards">{say('back')}</Link>
    <RewardHeading title={reward ? say('editReward') : t('loyalty.rewards.reward.new_title', 'Add a reward')} line={say('editorLine')}><Link className="l-ov-button" to="/loyalty/rewards?tab=redemptions">{t('loyalty.rewards.tab.redemptions', 'Redemptions')}</Link></RewardHeading>
    {!manage && <Notice>{t('loyalty.rewards.catalogue.read_only', 'Only staff allowed to manage offers can add or change rewards.')}</Notice>}
    <form noValidate onSubmit={submit} className="l-rb-editor"><div className="l-rb-columns"><section className="l-ov-panel l-rb-form-panel"><fieldset disabled={!manage || guard.busy} className="l-rb-fields">
      <div className="l-rb-name-status"><FormField label={say('rewardName')} problem={problem('name')}><input value={form.name} maxLength={191} onChange={e => update({ name: e.target.value })} /></FormField><FormField label={say('status')}><select value={String(form.is_active)} onChange={e => update({ is_active: e.target.value === 'true' })}><option value="true">{say('active')}</option><option value="false">{say('off')}</option></select></FormField></div>
      <FormField label={say('description')} problem={problem('description')}><textarea rows={1} value={form.description} onChange={e => update({ description: e.target.value })} /></FormField>
      <div className="l-rb-grid-two"><FormField label={say('rewardType')} problem={problem('discount_type')}><select value={form.discount_type} onChange={e => update({ discount_type: e.target.value })}><option value="">{say('item')}</option>{options.discount_types.map(value => <option key={value} value={value}>{t(`loyalty.rewards.discount_type.${value}`, DISCOUNT_TYPE_WORDS[value] ?? value)}</option>)}{form.discount_type && !options.discount_types.includes(form.discount_type) && <option>{form.discount_type}</option>}</select></FormField><div className="l-rb-read-field"><span>{say('claimMethod')}</span><p>{say('memberCode')}</p></div>
        <FormField label={say('pointsCost')} problem={problem('points_cost')}><NumberControl label={say('pointsCost')} value={form.points_cost} onValue={v => update({ points_cost: v })} min={1} max={MAX_COST} invalid={!!problem('points_cost')} disabled={!manage || guard.busy} /></FormField><div className="l-rb-read-field"><span>{say('eligibility')}</span><p>{say('allMembers')}</p></div>
        <div className="l-rb-fields"><FormField label={say('availability')}><select value={modes.stock} onChange={e => { setModes(m => ({ ...m, stock: e.target.value as RewardModes['stock'] })); update({ stock: e.target.value === 'unlimited' ? '' : '0' }) }}><option value="unlimited">{say('unlimited')}</option><option value="limited">{say('limitedStock')}</option></select></FormField>{modes.stock === 'limited' && <FormField label={t('loyalty.rewards.reward.stock', 'Stock')} problem={problem('stock')}>{num('stock', MAX_STOCK, 0)}</FormField>}</div>
        <div className="l-rb-fields"><FormField label={say('claims')}><select value={modes.limit} onChange={e => { setModes(m => ({ ...m, limit: e.target.value as RewardModes['limit'] })); update({ per_member_limit: e.target.value === 'none' ? '' : e.target.value === 'once' ? '1' : '2' }) }}><option value="none">{say('noLimit')}</option><option value="once">{say('once')}</option><option value="custom">{say('custom')}</option></select></FormField>{modes.limit === 'custom' && <FormField label={say('custom')} problem={problem('per_member_limit')}>{num('per_member_limit', MAX_PER_MEMBER, 1)}</FormField>}</div>
        <div className="l-rb-fields"><FormField label={say('validUntil')}><select value={modes.expiry} onChange={e => { setModes(m => ({ ...m, expiry: e.target.value as RewardModes['expiry'] })); update({ expires_at: e.target.value === 'none' ? '' : `${boot.venue.today}T23:59` }) }}><option value="none">{say('noEnd')}</option><option value="date">{say('setEnd')}</option></select></FormField>{modes.expiry === 'date' && <FormField label={t('loyalty.rewards.reward.expires_at', 'Offered until')} problem={problem('expires_at')} hint={zone}><input type="datetime-local" value={form.expires_at} onChange={e => update({ expires_at: wallInput(e.target.value) })} /></FormField>}</div>
        <div className="l-rb-read-field"><span>{t('loyalty.rewards.picture.label', 'Picture')}</span>{reward ? <OverviewButton type="button" onClick={() => setDialog('picture')}>{picture ? t('loyalty.rewards.picture.replace', 'Replace picture') : t('loyalty.rewards.picture.add', 'Add a picture')}</OverviewButton> : <small>{t('loyalty.rewards.picture.after_save_reward', 'You can add a picture once the reward is saved.')}</small>}</div>
      </div>
      <div className="l-rb-terms"><strong>{say('terms')}</strong><p className="l-rb-prewrap">{form.terms || say('noTerms')}</p><button type="button" className="l-ov-link" onClick={() => setDialog('terms')}>{say('editTerms')}</button>{problem('terms') && <p role="alert">{problem('terms')}</p>}</div>
      {form.discount_type && <div className="l-rb-grid-two"><FormField label={t('loyalty.rewards.reward.discount_value', 'Amount')} problem={problem('discount_value')}>{num('discount_value', form.discount_type === 'percent_discount' ? 100 : MAX_DISCOUNT, .01, .01)}</FormField><FormField label={t('loyalty.rewards.reward.applies_to', 'Applies to')} problem={problem('applies_to')}><select value={form.applies_to} onChange={e => update({ applies_to: e.target.value })}>{[...new Set([...options.applies_to, form.applies_to])].map(v => <option key={v} value={v}>{t(`loyalty.rewards.applies_to.${v}`, APPLIES_TO_WORDS[v] ?? v)}</option>)}</select></FormField></div>}
      <details className="l-rb-more" open={!!problems.category || !!failure?.fields?.brand || undefined}><summary>{t('loyalty.rewards.reward.category', 'Category')} · {t('loyalty.rewards.brand.label', 'Brand')}</summary><FormField label={t('loyalty.rewards.reward.category', 'Category')} problem={problem('category')}><input value={form.category} maxLength={60} onChange={e => update({ category: e.target.value })} /></FormField><BrandField options={options.brands} saved={savedBrand} value={brand} refused={!!failure?.fields?.brand} onChange={setBrand} />{!form.discount_type && <FormField label={t('loyalty.rewards.reward.applies_to', 'Applies to')} problem={problem('applies_to')}><select value={form.applies_to} onChange={e => update({ applies_to: e.target.value })}>{[...new Set([...options.applies_to, form.applies_to])].map(v => <option key={v} value={v}>{t(`loyalty.rewards.applies_to.${v}`, APPLIES_TO_WORDS[v] ?? v)}</option>)}</select></FormField>}</details>
    </fieldset>{failure && <Notice tone="danger">{t(...refusalKey('loyalty.rewards', ERRORS, 'reward', failure))}</Notice>}</section>
    <aside className="l-rb-side"><section className="l-ov-panel l-rb-detail"><div className="l-rb-eyebrow">{say('preview')}</div><div className="l-rb-preview"><RewardEyebrow>{null}</RewardEyebrow>{picture && <img className="l-rb-picture" src={mediaUrl(picture)} alt={form.name} />}<h2 className="l-rb-title">{form.name || say('rewardName')}</h2><p>{form.description}</p><hr />{eligibleCost ? <><strong className="l-rb-preview-price">{t('loyalty.earn.points', '{{n}} points', { n: points(Number(form.points_cost), i18n.language) })}</strong><span className="l-ov-button l-ov-primary l-rb-preview-claim">{say('claimPreview', { n: points(Number(form.points_cost), i18n.language) })}</span></> : <p>{say('invalidPreview')}</p>}</div><small>{say('allMembers')} · {form.per_member_limit === '' ? say('noLimit') : say('limit', { n: form.per_member_limit })}</small><small>{form.expires_at || say('noEnd')}</small></section><section className="l-ov-panel l-rb-detail"><h2>{say('afterClaim')}</h2><p>{say('afterClaimLine')}</p><Link className="l-ov-link" to="/loyalty/rewards?tab=redemptions">{t('loyalty.rewards.tab.redemptions', 'Redemptions')} →</Link></section></aside></div>
    <footer className="l-ov-panel l-rb-save"><div><strong>{say('review')}</strong><small>{say('unsaved')}</small></div><OverviewButton type="button" disabled={guard.busy} onClick={cancel}>{t('loyalty.common.cancel', 'Cancel')}</OverviewButton>{manage && <OverviewButton primary type="submit" disabled={guard.busy}>{t('loyalty.rewards.reward.save', 'Save reward')}</OverviewButton>}</footer></form><small>{say('previewNote')}</small>
    {dialog === 'terms' && <DesignDialog title={say('terms')} onClose={() => setDialog(null)}><FormField label={say('terms')}><textarea rows={5} value={form.terms} onChange={e => update({ terms: e.target.value })} /></FormField><OverviewButton type="button" onClick={() => setDialog(null)}>{t('loyalty.overview.close', 'Close')}</OverviewButton></DesignDialog>}
    {dialog === 'picture' && reward && <DesignDialog title={t('loyalty.rewards.picture.label', 'Picture')} onClose={() => setDialog(null)} busy={guard.busy}><PictureField owner="rewards" id={reward.id} picture={picture} alt={form.name} limits={options.image} onBusyChange={pictureBusy} onChange={url => { setPicture(url); void client.invalidateQueries({ queryKey: CATALOGUE_KEY }) }} /></DesignDialog>}
  </div>
}
