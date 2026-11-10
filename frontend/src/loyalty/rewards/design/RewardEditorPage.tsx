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
import { RewardLeaveDialog } from './RewardUI'
import { rewardsUrl, rewardEditorProblems, rewardModes, type RewardModes } from './math'
import { useRewardWords } from './words'
import { EditorDialog, EditorSection, EditorDisclosure, EditorPreview, EditorArt, EditorFooter } from '../../editors/EditorUI'
import { useEditorWords } from '../../editors/words'
import { ManagementFact } from '../../management/ManagementUI'

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
  const editor = useEditorWords()
  const cancel = () => guard.go(rewardsUrl('catalogue', { selected: reward?.id }))
  const submit = (e: React.FormEvent) => { e.preventDefault(); setTried(true); if (manage && !Object.keys(rewardEditorProblems(form, options, modes)).length && begin()) save.mutate() }
  const num = (name: 'stock' | 'per_member_limit' | 'discount_value', max: number, min: number, step = 1) => <input type="number" min={min} max={max} step={step} inputMode={step < 1 ? 'decimal' : 'numeric'} value={form[name]} onChange={e => update({ [name]: e.target.value })} />
  const eligibleCost = !rewardProblems(form, options).points_cost
  const pictureControl = <div className="l-rb-read-field"><span>{t('loyalty.rewards.picture.label', 'Picture')}</span>{reward ? <OverviewButton type="button" onClick={() => setDialog('picture')}>{picture ? t('loyalty.rewards.picture.replace', 'Replace picture') : t('loyalty.rewards.picture.add', 'Add a picture')}</OverviewButton> : <small>{t('loyalty.rewards.picture.after_save_reward', 'You can add a picture once the reward is saved.')}</small>}</div>
  return <><EditorDialog area="rewards" title={reward ? say('editReward') : t('loyalty.rewards.reward.new_title', 'Add a reward')} section={say('pointsRewards')} icon="ticket" tone="violet" wide onClose={cancel} busy={guard.busy}>
    <form noValidate onSubmit={submit} className="l-editor-form"><div className="l-editor-body"><div className="l-editor-columns"><fieldset disabled={!manage || guard.busy} className="l-editor-stack">
      {!manage && <Notice>{t('loyalty.rewards.catalogue.read_only', 'Only staff allowed to manage offers can add or change rewards.')}</Notice>}
      <EditorSection icon="gift" title={say('rewardDetails')}><div className="l-editor-two"><FormField label={say('rewardName')} problem={problem('name')}><input value={form.name} maxLength={191} onChange={e => update({ name: e.target.value })} /></FormField><FormField label={say('status')}><select value={String(form.is_active)} onChange={e => update({ is_active: e.target.value === 'true' })}><option value="true">{say('active')}</option><option value="false">{say('off')}</option></select></FormField></div>
      <div className="l-editor-two"><FormField label={say('rewardType')} problem={problem('discount_type')}><select value={form.discount_type} onChange={e => update({ discount_type: e.target.value })}><option value="">{say('item')}</option>{options.discount_types.map(value => <option key={value} value={value}>{t(`loyalty.rewards.discount_type.${value}`, DISCOUNT_TYPE_WORDS[value] ?? value)}</option>)}{form.discount_type && !options.discount_types.includes(form.discount_type) && <option>{form.discount_type}</option>}</select></FormField><FormField label={say('pointsCost')} problem={problem('points_cost')}><NumberControl label={say('pointsCost')} value={form.points_cost} onValue={v => update({ points_cost: v })} min={1} max={MAX_COST} invalid={!!problem('points_cost')} disabled={!manage || guard.busy} /></FormField></div>
      <div className="l-editor-two"><FormField label={say('claimMethod')}><input readOnly value={say('memberCode')} /></FormField><FormField label={say('eligibility')}><input readOnly value={say('allMembers')} /></FormField></div>
      {form.discount_type && <div className="l-editor-two"><FormField label={t('loyalty.rewards.reward.discount_value', 'Amount')} problem={problem('discount_value')}>{num('discount_value', form.discount_type === 'percent_discount' ? 100 : MAX_DISCOUNT, .01, .01)}</FormField><FormField label={t('loyalty.rewards.reward.applies_to', 'Applies to')} problem={problem('applies_to')}><select value={form.applies_to} onChange={e => update({ applies_to: e.target.value })}>{[...new Set([...options.applies_to, form.applies_to])].map(v => <option key={v} value={v}>{t(`loyalty.rewards.applies_to.${v}`, APPLIES_TO_WORDS[v] ?? v)}</option>)}</select></FormField></div>}
      </EditorSection>
      <EditorDisclosure title={editor('memberDescription')} open={!!problem('description')}><FormField label={say('description')} problem={problem('description')}><textarea rows={2} value={form.description} onChange={e => update({ description: e.target.value })} /></FormField>{pictureControl}</EditorDisclosure>
      <EditorDisclosure title={editor('availability')} open={['stock','per_member_limit','expires_at','terms','category','applies_to'].some(key => !!problems[key]) || !!failure?.fields?.brand}><div className="l-editor-two">
        <div className="l-editor-stack"><FormField label={say('availability')}><select value={modes.stock} onChange={e => { setModes(m => ({ ...m, stock: e.target.value as RewardModes['stock'] })); update({ stock: e.target.value === 'unlimited' ? '' : '0' }) }}><option value="unlimited">{say('unlimited')}</option><option value="limited">{say('limitedStock')}</option></select></FormField>{modes.stock === 'limited' && <FormField label={t('loyalty.rewards.reward.stock', 'Stock')} problem={problem('stock')}>{num('stock', MAX_STOCK, 0)}</FormField>}</div>
        <div className="l-editor-stack"><FormField label={say('claims')}><select value={modes.limit} onChange={e => { setModes(m => ({ ...m, limit: e.target.value as RewardModes['limit'] })); update({ per_member_limit: e.target.value === 'none' ? '' : e.target.value === 'once' ? '1' : '2' }) }}><option value="none">{say('noLimit')}</option><option value="once">{say('once')}</option><option value="custom">{say('custom')}</option></select></FormField>{modes.limit === 'custom' && <FormField label={say('custom')} problem={problem('per_member_limit')}>{num('per_member_limit', MAX_PER_MEMBER, 1)}</FormField>}</div>
      </div><FormField label={say('validUntil')}><select value={modes.expiry} onChange={e => { setModes(m => ({ ...m, expiry: e.target.value as RewardModes['expiry'] })); update({ expires_at: e.target.value === 'none' ? '' : `${boot.venue.today}T23:59` }) }}><option value="none">{say('noEnd')}</option><option value="date">{say('setEnd')}</option></select></FormField>{modes.expiry === 'date' && <FormField label={t('loyalty.rewards.reward.expires_at', 'Offered until')} problem={problem('expires_at')} hint={zone}><input type="datetime-local" value={form.expires_at} onChange={e => update({ expires_at: wallInput(e.target.value) })} /></FormField>}
        <FormField label={say('terms')} problem={problem('terms')}><textarea value={form.terms} rows={3} onChange={e => update({ terms: e.target.value })} /></FormField>
        <FormField label={t('loyalty.rewards.reward.category', 'Category')} problem={problem('category')}><input value={form.category} maxLength={60} onChange={e => update({ category: e.target.value })} /></FormField><BrandField options={options.brands} saved={savedBrand} value={brand} refused={!!failure?.fields?.brand} onChange={setBrand} />
        {!form.discount_type && <FormField label={t('loyalty.rewards.reward.applies_to', 'Applies to')} problem={problem('applies_to')}><select value={form.applies_to} onChange={e => update({ applies_to: e.target.value })}>{[...new Set([...options.applies_to, form.applies_to])].map(v => <option key={v} value={v}>{t(`loyalty.rewards.applies_to.${v}`, APPLIES_TO_WORDS[v] ?? v)}</option>)}</select></FormField>}
      </EditorDisclosure>{failure && <Notice tone="danger">{t(...refusalKey('loyalty.rewards', ERRORS, 'reward', failure))}</Notice>}
    </fieldset><EditorPreview tone="violet"><EditorArt kind="rewardArt" label={form.name || say('rewardName')} title={eligibleCost ? t('loyalty.earn.points', '{{n}} points', { n: points(Number(form.points_cost), i18n.language) }) : say('invalidPreview')} line={say('memberCode')} />
      {picture && <img className="l-editor-picture" src={mediaUrl(picture)} alt={form.name} />}<ManagementFact icon="people" label={say('who')}>{say('allMembers')}</ManagementFact><ManagementFact icon="rewardTicket" label={say('claimMethod')}>{say('afterClaimLine')}</ManagementFact><small>{say('previewNote')}</small>
    </EditorPreview></div></div><EditorFooter canSave={manage} dirty={dirty} creating={!reward} onCancel={cancel} busy={guard.busy} disabled={!manage} save={reward ? t('loyalty.rewards.reward.save', 'Save reward') : say('addReward')} /></form>
  </EditorDialog>
  {dialog === 'picture' && reward && <DesignDialog title={t('loyalty.rewards.picture.label', 'Picture')} onClose={() => setDialog(null)} busy={guard.busy}><PictureField owner="rewards" id={reward.id} picture={picture} alt={form.name} limits={options.image} onBusyChange={pictureBusy} onChange={url => { setPicture(url); void client.invalidateQueries({ queryKey: CATALOGUE_KEY }) }} /></DesignDialog>}
  </>
}
