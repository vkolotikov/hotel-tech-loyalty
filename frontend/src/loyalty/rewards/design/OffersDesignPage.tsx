import { EditorDialog, EditorSection, EditorDisclosure, EditorPreview, EditorArt, EditorFooter, EditorSwitch } from '../../editors/EditorUI'
import { ManagementVisual, ManagementFact } from '../../management/ManagementUI'
import { useAdminWords } from '../../management/words'
import { useCallback, useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Notice } from '../../../workspace/ui/Notice'
import { formatDate } from '../../../workspace/lib/wallClock'
import { useBoot } from '../../LoyaltyProvider'
import { useLeaveGuard, type EarnGuard } from '../../earn/useLeaveGuard'
import { failureOf, mediaUrl } from '../../lib/api'
import { refusalKey } from '../../lib/errors'
import { serverProblems, toggled } from '../../lib/forms'
import { amountOf, points } from '../../lib/format'
import { FormField } from '../../ui/formParts'
import { OverviewButton } from '../../overview/OverviewUI'
import { DesignDialog, NumberControl } from '../../redesign/DesignUI'
import { OFFERS_KEY, rewardsApi } from '../api'
import { ERRORS } from '../errors'
import { BrandField, LoadFailed, Loading } from '../parts'
import { PictureField } from '../PictureField'
import { MAX_OFFER_VALUE, OFFER_FIELDS, brandPart, initialBrand, offerBody, offerFormOf, offerProblems, typeChoices, type OfferForm } from '../rewardsMath'
import type { BrandChoice, Offer, OfferOptions, OffersList } from '../types'
import { APPLIES_TO_WORDS, OFFER_KIND_NOTE_WORDS, OFFER_PROBLEM_WORDS, OFFER_TYPE_WORDS, OFFER_VALUE_WORDS } from '../words'
import { RewardColumns, RewardEmpty, RewardHeading, RewardLeaveDialog, RewardRow } from './RewardUI'
import { RewardIcon, RewardStatus } from './presentation'
import { offerCounts, offerMatches, offerReadUrl, rewardsUrl } from './math'
import { useRewardWords } from './words'

export function OffersDesignPage() {
  const { t, i18n } = useTranslation(), say = useRewardWords(), boot = useBoot(), navigate = useNavigate(), location = useLocation()
  const query = useQuery({ queryKey: OFFERS_KEY, queryFn: rewardsApi.offers }), data = query.data
  const guard = useLeaveGuard(), manage = boot.staff.can.manage_rewards, params = new URLSearchParams(location.search)
  const q = params.get('q') ?? '', brand = params.get('brand') ?? 'all', status = params.get('status') ?? 'current', adding = params.get('offer') === 'new'
  const go = (patch: Record<string, string | number | null>) => {
    const url = rewardsUrl('offers', { q, brand, status, selected: params.get('selected'), ...patch })
    if (guard.dirty || guard.busy) guard.go(url); else navigate(url, { replace: true })
  }
  const brandName = (offer: Offer) => offer.brand_id == null ? t('loyalty.rewards.brand.every', 'Every brand') : data?.options.brands?.list.find(b => b.id === offer.brand_id)?.name ?? String(offer.brand_id)
  const dateLabel = (date: string | null) => date ? formatDate(date, i18n.language, { day: 'numeric', month: 'short' }) : '—'
  const editing = manage && (adding || params.get('edit') === '1')
  const visible = (data?.offers ?? []).filter(o => offerMatches(o, { q, brand, status }, brandName(o)))
  const selected = (editing ? data?.offers : visible)?.find(o => String(o.id) === params.get('selected')) ?? visible[0]
  const selectedParam = params.get('selected')
  // Pin the initial selection so a background refresh cannot replace an unsaved draft with a newer first row.
  useEffect(() => {
    if (adding || selectedParam || !selected) return
    const next = new URLSearchParams(location.search); next.set('selected', String(selected.id))
    navigate({ pathname: location.pathname, search: next.toString() }, { replace: true })
  }, [adding, selectedParam, selected, location.pathname, location.search, navigate])
  const counts = offerCounts(data?.offers ?? [])
  const filters = <div className="l-rb-filters l-rb-offer-filters"><label><span>{say('searchOffers')}</span><input type="search" value={q} placeholder={say('searchOfferHint')} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }} onChange={e => go({ q: e.target.value })} /></label><label><span>{t('loyalty.rewards.brand.label', 'Brand')}</span><select value={brand} onChange={e => go({ brand: e.target.value })}><option value="all">{say('allBrands')}</option><option value="every">{t('loyalty.rewards.brand.every', 'Every brand')}</option>{data?.options.brands?.list.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label></div>
  const list = <section className="l-ov-panel l-rb-list"><header><div className="l-rc-heading"><RewardIcon kind="calendar" /><h2>{say(status === 'current' ? 'liveUpcoming' : 'yourOffers')}</h2></div><button type="button" className="l-ov-link" onClick={() => go({ status: 'ended' })}>{say('endedOffers')}</button></header>{filters}<div className="l-ad-filter-tabs">{(['current', 'all', 'live', 'upcoming', 'ended', 'off'] as const).map(s => <button key={s} type="button" aria-pressed={status === s} onClick={() => go({ status: s })}>{say(s === 'all' ? 'allStatuses' : s)} <small>{counts[s]}</small></button>)}</div><RewardColumns first={say('offerSchedule')} value={say('value')} /><ul>{visible.map(o => <RewardRow key={o.id} id={`offer-${o.id}`} icon={o.type === 'discount' ? 'amberGift' : o.type === 'fixed_amount' ? 'calendarNeutral' : 'gift'} name={o.title} caption={`${brandName(o)} · ${dateLabel(o.start_date)} – ${dateLabel(o.end_date)}`} value={OFFER_VALUE_WORDS[o.type] ? t(`loyalty.rewards.offer_value.${o.type}`, OFFER_VALUE_WORDS[o.type], { value: amountOf(o.type, o.value, boot.venue.currency, i18n.language) }) : `${t(`loyalty.rewards.offer_type.${o.type}`, OFFER_TYPE_WORDS[o.type] ?? o.type)} · ${points(o.value, i18n.language)}`} status={['live', 'upcoming', 'off', 'ended'].includes(o.state) ? say(o.state as 'live' | 'upcoming' | 'off' | 'ended') : o.state} tone={o.state} selected={!adding && selected?.id === o.id} onSelect={() => go({ selected: o.id })} />)}</ul>{!visible.length && <RewardEmpty empty={!data?.offers.length ? say('emptyOffers') : undefined} onClear={data?.offers.length ? () => go({ q: '', brand: 'all', status: 'all' }) : undefined} />}</section>
  return <div className="l-ad-page l-rd-page l-rb-page l-rc-page l-rc-offers">
    <RewardHeading title={say('offers')} line={say('offersLine')}><Link className="l-ov-button" to="/loyalty/rewards">{say('pointsRewards')}</Link>{manage && data && <OverviewButton primary onClick={() => guard.go(rewardsUrl('offers', { offer: 'new' }))}>{say('createOffer')}</OverviewButton>}</RewardHeading>
    {!manage && <p data-read-only="">{t('loyalty.rewards.offers.read_only', 'Only staff allowed to manage offers can add or change them.')}</p>}
    {query.isError && <LoadFailed error={query.error} onRetry={() => { void query.refetch() }} />}{!data && query.isLoading && <Loading />}
    {params.get('saved') && <p role="status" className="l-rb-success">{say('saved')}</p>}
    {data && <>
    {selected ? <div className="l-rb-columns">{list}<OfferDetails offer={selected} options={data.options} onEdit={manage ? () => go({ selected: selected.id, edit: '1' }) : undefined} /></div> : list}
    {editing && (selected || adding) && <OfferEditor key={`${adding ? 'new' : selected!.id}:${guard.resetVersion}`} offer={adding ? null : selected!} options={data.options} guard={guard} />}</>}

    <RewardLeaveDialog guard={guard} />
  </div>
}

function OfferDetails({ offer, options, onEdit }: { offer: Offer; options: OfferOptions; onEdit?: () => void }) {
  const { t, i18n } = useTranslation(), say = useRewardWords(), admin = useAdminWords(), boot = useBoot()
  const value = OFFER_VALUE_WORDS[offer.type] ? t(`loyalty.rewards.offer_value.${offer.type}`, OFFER_VALUE_WORDS[offer.type], { value: amountOf(offer.type, offer.value, boot.venue.currency, i18n.language) }) : t(`loyalty.rewards.offer_type.${offer.type}`, OFFER_TYPE_WORDS[offer.type] ?? offer.type)
  const date = (day: string | null) => day ? formatDate(day, i18n.language, { day: 'numeric', month: 'short', year: 'numeric' }) : say('noEnd')
  return <aside id="management-detail" tabIndex={-1} className="l-ov-panel l-rb-detail l-rc-offer-detail" data-offer-view="read">
    <div className="l-rb-section-head"><h2 className="l-rb-eyebrow">{admin('selectedOffer')}</h2><RewardStatus tone={offer.state}>{['live', 'upcoming', 'off', 'ended'].includes(offer.state) ? say(offer.state as 'live' | 'upcoming' | 'off' | 'ended') : offer.state}</RewardStatus>{onEdit && <OverviewButton onClick={onEdit}>{t('loyalty.program.edit', 'Edit')}</OverviewButton>}</div>
    {offer.image_url && <img className="l-rb-picture" src={mediaUrl(offer.image_url)} alt={offer.title} loading="lazy" />}
    <ManagementVisual art="offerArt" label={value} title={offer.title} line={offer.code ? say('useCode', { code: offer.code }) : undefined} />
    {offer.usage_limit !== null && offer.times_used >= offer.usage_limit && <p className="l-ad-inset">{admin('limitReached')}</p>}
    <div className="l-ad-inset l-ad-dates"><div><small>{say('starts')}</small><strong>{date(offer.start_date)}</strong></div><div><small>{say('ends')}</small><strong>{date(offer.end_date)}</strong></div></div>
    <ManagementFact icon="people" label={say('eligibility')}>{offer.tier_ids?.length ? offer.tier_ids.map(id => boot.programme.tiers.find(tier => tier.id === id)?.name ?? String(id)).join(', ') : say('allMembers')}</ManagementFact>
    <ManagementFact icon="bookingSmall" label={t('loyalty.rewards.offer.applies_to', 'Applies to')}>{t(`loyalty.rewards.applies_to.${offer.applies_to}`, APPLIES_TO_WORDS[offer.applies_to] ?? offer.applies_to)}</ManagementFact>
    <details className="l-ad-more"><summary>{admin('advanced')}</summary><small>{offer.brand_id == null ? t('loyalty.rewards.brand.every', 'Every brand') : options.brands?.list.find(b => b.id === offer.brand_id)?.name ?? boot.organization.name}</small><dl className="l-rb-facts"><dt>{say('caps')}</dt><dd>{offer.usage_limit === null ? say('noLimit') : points(offer.usage_limit, i18n.language)}</dd><dt>{say('perMember')}</dt><dd>{offer.per_member_limit === null ? say('noLimit') : points(offer.per_member_limit, i18n.language)}</dd></dl><strong>{say('terms')}</strong><p className="l-rb-prewrap">{offer.description || say('noTerms')}</p><small>{t('loyalty.rewards.offers.used', 'Used: {{used}}', { used: points(offer.times_used, i18n.language) })}</small></details>
  </aside>
}

function OfferEditor({ offer, options, guard }: { offer: Offer | null; options: OfferOptions; guard: EarnGuard }) {
  const { t, i18n } = useTranslation(), say = useRewardWords(), boot = useBoot(), client = useQueryClient(), navigate = useNavigate(), location = useLocation()
  const manage = boot.staff.can.manage_rewards, current = offer?.type ?? null, savedBrand = offer ? offer.brand_id ?? null : undefined
  const [baseline, setBaseline] = useState(() => offerFormOf(offer, options, boot.venue.today))
  const [form, setForm] = useState<OfferForm>(baseline), [tried, setTried] = useState(false)
  const [baseBrand, setBaseBrand] = useState(() => initialBrand(options.brands, savedBrand))
  const [brand, setBrand] = useState<BrandChoice>(baseBrand), [picture, setPicture] = useState(offer?.image_url ?? null)
  const [dialog, setDialog] = useState<'picture' | null>(null)
  const { mark, begin, end } = guard
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline) || brand !== baseBrand
  useEffect(() => { mark('offer', dirty); return () => mark('offer', false) }, [dirty, mark])
  const pictureBusy = useCallback((busy: boolean) => { if (busy) begin(); else end() }, [begin, end])
  const save = useMutation({
    mutationFn: () => offer ? rewardsApi.updateOffer(offer.id, { ...offerBody(form, true), ...brandPart(brand, savedBrand) }) : rewardsApi.createOffer({ ...offerBody(form, false), ...brandPart(brand) }),
    onSuccess: ({ offer: updated }) => {
      const next = offerFormOf(updated, options, boot.venue.today); setForm(next); setBaseline(next); setBaseBrand(brand); setTried(false); mark('offer', false)
      client.setQueryData<OffersList>(OFFERS_KEY, old => old ? { ...old, offers: offer ? old.offers.map(o => o.id === updated.id ? updated : o) : [updated, ...old.offers] } : old)
      void client.invalidateQueries({ queryKey: OFFERS_KEY })
      navigate(offerReadUrl(location.search, updated, updated.brand_id == null ? t('loyalty.rewards.brand.every', 'Every brand') : options.brands?.list.find(b => b.id === updated.brand_id)?.name ?? String(updated.brand_id), true), { replace: true })
    }, onSettled: end,
  })
  const cancelEditing = () => {
    const params = new URLSearchParams(location.search)
    guard.go(offer ? offerReadUrl(location.search, offer, offer.brand_id == null ? t('loyalty.rewards.brand.every', 'Every brand') : options.brands?.list.find(b => b.id === offer.brand_id)?.name ?? String(offer.brand_id)) : rewardsUrl('offers', { q: params.get('q'), brand: params.get('brand'), status: params.get('status') }))
  }
  const update = (patch: Partial<OfferForm>) => { setForm(old => ({ ...old, ...patch })); if (save.isError) save.reset() }
  const failure = save.isError ? failureOf(save.error) : null
  const problems = { ...(tried ? offerProblems(form, options, current) : {}), ...serverProblems(failure?.fields, OFFER_FIELDS) }
  const problem = (field: string) => problems[field] ? t(`loyalty.rewards.offer.problem.${problems[field]}`, OFFER_PROBLEM_WORDS[problems[field]] ?? OFFER_PROBLEM_WORDS.title) : null
  const word = (prefix: string, map: Record<string, string>, value: string) => t(`loyalty.rewards.${prefix}.${value}`, map[value] ?? value)
  const submit = (e: React.FormEvent) => { e.preventDefault(); setTried(true); const errors = offerProblems(form, options, current); if (manage && !Object.keys(errors).length && begin()) save.mutate() }
  const previewValue = Number.isFinite(Number(form.value)) && form.value !== '' ? OFFER_VALUE_WORDS[form.type] ? t(`loyalty.rewards.offer_value.${form.type}`, OFFER_VALUE_WORDS[form.type], { value: amountOf(form.type, Number(form.value), boot.venue.currency, i18n.language) }) : `${word('offer_type', OFFER_TYPE_WORDS, form.type)} · ${form.value}` : word('offer_type', OFFER_TYPE_WORDS, form.type)
  return <><EditorDialog area="rewards" title={offer ? say('offerChanges') : say('createOffer')} section={say('offers')} icon="ticket" tone="violet" wide onClose={cancelEditing} busy={guard.busy}>
    <form className="l-editor-form" noValidate onSubmit={submit}><div className="l-editor-body"><div className="l-editor-columns"><fieldset className="l-editor-stack" disabled={!manage || guard.busy}>
      <div className="l-editor-two"><FormField label={say('offerName')} problem={problem('title')}><input value={form.title} maxLength={191} onChange={e => update({ title: e.target.value })} /></FormField><FormField label={say('status')}><select value={String(form.is_active)} onChange={e => update({ is_active: e.target.value === 'true' })}><option value="true">{t('loyalty.rewards.offer.active', 'On')}</option><option value="false">{say('off')}</option></select></FormField></div>
      <div className="l-editor-two"><FormField label={t('loyalty.rewards.offer.type', 'Kind')} problem={problem('type')}><select value={form.type} onChange={e => update({ type: e.target.value })}>{!form.type && <option value="">{t('loyalty.rewards.offer.choose', 'Choose…')}</option>}{typeChoices(options.types, current).map(v => <option key={v} value={v}>{word('offer_type', OFFER_TYPE_WORDS, v)}</option>)}</select></FormField><FormField label={t('loyalty.rewards.offer.value', 'Value')} problem={problem('value')}><NumberControl label={t('loyalty.rewards.offer.value', 'Value')} value={form.value} onValue={value => update({ value })} min={0} max={MAX_OFFER_VALUE} step={.01} disabled={!manage || guard.busy} invalid={!!problem('value')} /></FormField></div>
      {OFFER_KIND_NOTE_WORDS[form.type] && <small>{word('offer_kind_note', OFFER_KIND_NOTE_WORDS, form.type)}</small>}
      <EditorSection icon="clock" title={boot.venue.timezone}><div className="l-editor-two"><FormField label={say('starts')} problem={problem('start_date')}><input type="date" value={form.start_date} onChange={e => update({ start_date: e.target.value })} /></FormField><FormField label={say('ends')} problem={problem('end_date')}><input type="date" value={form.end_date} onChange={e => update({ end_date: e.target.value })} /></FormField></div><small>{say('workspaceTime', { zone: boot.venue.timezone })}</small></EditorSection>
      <EditorSection icon="people" title={say('eligibility')}><div className="l-editor-two"><FormField label={t('loyalty.rewards.offer.applies_to', 'Applies to')} problem={problem('applies_to')}><select value={form.applies_to} onChange={e => update({ applies_to: e.target.value })}>{[...new Set([...options.applies_to, form.applies_to])].map(v => <option key={v} value={v}>{word('applies_to', APPLIES_TO_WORDS, v)}</option>)}</select></FormField>
      <div><span className="l-rd-label">{say('eligibility')}</span><EditorDisclosure title={form.tiers.length ? form.tiers.map(id => boot.programme.tiers.find(tier => tier.id === id)?.name ?? String(id)).join(' · ') : say('allMembers')} open={!!problem('tier_ids')}><div className="l-editor-choices" role="group" aria-label={say('eligibility')}>{[...new Set([...boot.programme.tiers.map(tier => tier.id), ...form.tiers])].map(id => <label key={id}><input type="checkbox" checked={form.tiers.includes(id)} onChange={() => update({ tiers: toggled(form.tiers, id) })} />{boot.programme.tiers.find(tier => tier.id === id)?.name ?? id}</label>)}<OverviewButton type="button" onClick={() => update({ tiers: [] })}>{say('allMembers')}</OverviewButton></div></EditorDisclosure>{problem('tier_ids') && <p role="alert" className="text-a-danger">{problem('tier_ids')}</p>}</div></div></EditorSection>
      <EditorDisclosure title={t('loyalty.adminux.advanced', 'Advanced settings')} open={['code','usage_limit','per_member_limit','description'].some(key => !!problems[key]) || !!failure?.fields?.brand}>
        <div className="l-editor-two"><FormField label={say('offerCode')} problem={problem('code')}><input value={form.code} maxLength={24} spellCheck={false} onChange={e => update({ code: e.target.value })} /></FormField><BrandField compact options={options.brands} value={brand} saved={savedBrand} refused={!!failure?.fields?.brand} onChange={b => { setBrand(b); save.reset() }} /></div>
        <div className="l-editor-two"><FormField label={say('caps')} problem={problem('usage_limit')}><input type="number" inputMode="numeric" min={1} max={Number.MAX_SAFE_INTEGER} step={1} placeholder={say('noLimit')} value={form.usage_limit} onChange={e => update({ usage_limit: e.target.value })} /></FormField><FormField label={say('perMember')} problem={problem('per_member_limit')}><input type="number" inputMode="numeric" min={1} max={Number.MAX_SAFE_INTEGER} step={1} placeholder={say('noLimit')} value={form.per_member_limit} onChange={e => update({ per_member_limit: e.target.value })} /></FormField></div>
        <FormField label={t('loyalty.rewards.offer.description', 'Description')} problem={problem('description')}><textarea rows={3} value={form.description} onChange={e => update({ description: e.target.value })} /></FormField><EditorSwitch label={t('loyalty.rewards.offer.featured', 'Featured')} checked={form.is_featured} onChange={is_featured => update({ is_featured })} />
        {offer ? <><small>{t('loyalty.rewards.offers.used', 'Used: {{used}}', { used: points(offer.times_used, i18n.language) })}</small><OverviewButton type="button" onClick={() => setDialog('picture')}>{t('loyalty.rewards.picture.label', 'Picture')}</OverviewButton></> : <small>{t('loyalty.rewards.picture.after_save_offer', 'You can add a picture once the offer is saved.')}</small>}
      </EditorDisclosure>{failure && <Notice tone="danger">{t(...refusalKey('loyalty.rewards', ERRORS, 'offer', failure))}</Notice>}
    </fieldset><EditorPreview tone="violet"><EditorArt kind="offerArt" label={say('offerPreview')} title={previewValue} line={form.title} />
      {picture && <img className="l-editor-picture" src={mediaUrl(picture)} alt={form.title} />}<ManagementFact icon="bonusCalendar" label={say('starts')}>{form.start_date} – {form.end_date}<small>{boot.venue.timezone}</small></ManagementFact><ManagementFact icon="people" label={say('eligibility')}>{form.tiers.length ? form.tiers.map(id => boot.programme.tiers.find(tier => tier.id === id)?.name ?? id).join(', ') : say('allMembers')}</ManagementFact><small>{say('conditionsLine')}</small>
    </EditorPreview></div></div><EditorFooter onCancel={cancelEditing} busy={guard.busy} dirty={dirty} creating={!offer} disabled={!manage} save={offer ? t('loyalty.rewards.offer.save', 'Save offer') : say('createOffer')} /></form>
  </EditorDialog>{dialog === 'picture' && offer && manage && <DesignDialog title={t('loyalty.rewards.picture.label', 'Picture')} onClose={() => setDialog(null)} busy={guard.busy}><PictureField owner="offers" id={offer.id} picture={picture} alt={form.title} limits={options.image} onBusyChange={pictureBusy} onChange={url => { setPicture(url); void client.invalidateQueries({ queryKey: OFFERS_KEY }) }} /></DesignDialog>}</>
}
