import { useCallback, useEffect, useState, type ReactNode } from 'react'
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
import { FormField, Check } from '../../ui/formParts'
import { OverviewButton } from '../../overview/OverviewUI'
import { DesignDialog } from '../../redesign/DesignUI'
import { OFFERS_KEY, rewardsApi } from '../api'
import { ERRORS } from '../errors'
import { BrandField, LoadFailed, Loading } from '../parts'
import { PictureField } from '../PictureField'
import { MAX_OFFER_VALUE, OFFER_FIELDS, brandPart, initialBrand, offerBody, offerFormOf, offerProblems, typeChoices, type OfferForm } from '../rewardsMath'
import type { BrandChoice, Offer, OfferOptions, OffersList } from '../types'
import { APPLIES_TO_WORDS, OFFER_KIND_NOTE_WORDS, OFFER_PROBLEM_WORDS, OFFER_TYPE_WORDS, OFFER_VALUE_WORDS } from '../words'
import { RewardActivityLinks, RewardEmpty, RewardHeading, RewardLeaveDialog, RewardRow } from './RewardUI'
import { rewardsUrl } from './math'
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
  const visible = (data?.offers ?? []).filter(o => `${o.title} ${brandName(o)} ${o.code ?? ''}`.toLocaleLowerCase().includes(q.toLocaleLowerCase()) && (brand === 'all' || (brand === 'every' ? o.brand_id == null : String(o.brand_id) === brand)) && (status === 'all' || status === 'current' ? status === 'all' || ['live', 'upcoming'].includes(o.state) : o.state === status))
  const selected = visible.find(o => String(o.id) === params.get('selected')) ?? visible[0]
  const selectedParam = params.get('selected')
  // Pin the initial selection so a background refresh cannot replace an unsaved draft with a newer first row.
  useEffect(() => {
    if (adding || selectedParam || !selected) return
    const next = new URLSearchParams(location.search); next.set('selected', String(selected.id))
    navigate({ pathname: location.pathname, search: next.toString() }, { replace: true })
  }, [adding, selectedParam, selected, location.pathname, location.search, navigate])
  const list = <section className="l-ov-panel l-rb-list"><header><h2>{say('yourOffers')}</h2><button type="button" className="l-ov-link" onClick={() => go({ status: 'ended' })}>{say('endedOffers')}</button></header><ul>{visible.map(o => <RewardRow key={o.id} id={`offer-${o.id}`} name={o.title} caption={`${brandName(o)} · ${dateLabel(o.start_date)} – ${dateLabel(o.end_date)}`} value={OFFER_VALUE_WORDS[o.type] ? t(`loyalty.rewards.offer_value.${o.type}`, OFFER_VALUE_WORDS[o.type], { value: amountOf(o.type, o.value, boot.venue.currency, i18n.language) }) : `${t(`loyalty.rewards.offer_type.${o.type}`, OFFER_TYPE_WORDS[o.type] ?? o.type)} · ${points(o.value, i18n.language)}`} status={['live', 'upcoming', 'off', 'ended'].includes(o.state) ? say(o.state as 'live' | 'upcoming' | 'off' | 'ended') : o.state} tone={o.state} selected={!adding && selected?.id === o.id} onSelect={() => go({ selected: o.id })} />)}</ul>{!visible.length && <RewardEmpty empty={!data?.offers.length ? say('emptyOffers') : undefined} onClear={data?.offers.length ? () => go({ q: '', brand: 'all', status: 'all' }) : undefined} />}</section>
  return <div className="l-ov-page l-rd-page l-rb-page">
    <RewardHeading title={say('offers')} line={say('offersLine')}><Link className="l-ov-button" to="/loyalty/rewards">{say('pointsRewards')}</Link>{manage && data && <OverviewButton primary onClick={() => guard.go(rewardsUrl('offers', { offer: 'new' }))}>{say('createOffer')}</OverviewButton>}</RewardHeading>
    {!manage && <p data-read-only="">{t('loyalty.rewards.offers.read_only', 'Only staff allowed to manage offers can add or change them.')}</p>}
    {query.isError && <LoadFailed error={query.error} onRetry={() => { void query.refetch() }} />}{!data && query.isLoading && <Loading />}
    {params.get('saved') && <p role="status" className="l-rb-success">{say('saved')}</p>}
    {data && <><div className="l-rb-filters l-rb-offer-filters"><label><span>{say('searchOffers')}</span><input type="search" value={q} placeholder={say('searchOfferHint')} onChange={e => go({ q: e.target.value })} /></label><label><span>{t('loyalty.rewards.brand.label', 'Brand')}</span><select value={brand} onChange={e => go({ brand: e.target.value })}><option value="all">{say('allBrands')}</option><option value="every">{t('loyalty.rewards.brand.every', 'Every brand')}</option>{data.options.brands?.list.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label><span>{say('status')}</span><select value={status} onChange={e => go({ status: e.target.value })}>{(['current', 'all', 'live', 'upcoming', 'ended', 'off'] as const).map(s => <option key={s} value={s}>{say(s === 'all' ? 'allStatuses' : s)}</option>)}</select></label></div>
    {(selected || adding) ? <OfferEditor key={`${adding ? 'new' : selected.id}:${guard.resetVersion}`} offer={adding ? null : selected} options={data.options} guard={guard} list={list} /> : list}<RewardActivityLinks /></>}
    <RewardLeaveDialog guard={guard} />
  </div>
}

function OfferEditor({ offer, options, guard, list }: { offer: Offer | null; options: OfferOptions; guard: EarnGuard; list: ReactNode }) {
  const { t, i18n } = useTranslation(), say = useRewardWords(), boot = useBoot(), client = useQueryClient(), navigate = useNavigate()
  const manage = boot.staff.can.manage_rewards, current = offer?.type ?? null, savedBrand = offer ? offer.brand_id ?? null : undefined
  const [baseline, setBaseline] = useState(() => offerFormOf(offer, options, boot.venue.today))
  const [form, setForm] = useState<OfferForm>(baseline), [tried, setTried] = useState(false)
  const [baseBrand, setBaseBrand] = useState(() => initialBrand(options.brands, savedBrand))
  const [brand, setBrand] = useState<BrandChoice>(baseBrand), [picture, setPicture] = useState(offer?.image_url ?? null)
  const [dialog, setDialog] = useState<'terms' | 'picture' | null>(null), [saved, setSaved] = useState(false)
  const { mark, begin, end } = guard
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline) || brand !== baseBrand
  useEffect(() => { mark('offer', dirty); return () => mark('offer', false) }, [dirty, mark])
  const pictureBusy = useCallback((busy: boolean) => { if (busy) begin(); else end() }, [begin, end])
  const save = useMutation({
    mutationFn: () => offer ? rewardsApi.updateOffer(offer.id, { ...offerBody(form, true), ...brandPart(brand, savedBrand) }) : rewardsApi.createOffer({ ...offerBody(form, false), ...brandPart(brand) }),
    onSuccess: ({ offer: updated }) => {
      const next = offerFormOf(updated, options, boot.venue.today); setForm(next); setBaseline(next); setBaseBrand(brand); setSaved(true); setTried(false); mark('offer', false)
      client.setQueryData<OffersList>(OFFERS_KEY, old => old ? { ...old, offers: offer ? old.offers.map(o => o.id === updated.id ? updated : o) : [updated, ...old.offers] } : old)
      void client.invalidateQueries({ queryKey: OFFERS_KEY })
      if (!offer) navigate(rewardsUrl('offers', { selected: updated.id, status: 'all', saved: '1' }))
    }, onSettled: end,
  })
  const update = (patch: Partial<OfferForm>) => { setForm(old => ({ ...old, ...patch })); setSaved(false); if (save.isError) save.reset() }
  const failure = save.isError ? failureOf(save.error) : null
  const problems = { ...(tried ? offerProblems(form, options, current) : {}), ...serverProblems(failure?.fields, OFFER_FIELDS) }
  const problem = (field: string) => problems[field] ? t(`loyalty.rewards.offer.problem.${problems[field]}`, OFFER_PROBLEM_WORDS[problems[field]] ?? OFFER_PROBLEM_WORDS.title) : null
  const word = (prefix: string, map: Record<string, string>, value: string) => t(`loyalty.rewards.${prefix}.${value}`, map[value] ?? value)
  const submit = (e: React.FormEvent) => { e.preventDefault(); setTried(true); const errors = offerProblems(form, options, current); if (errors.description) setDialog('terms'); if (manage && !Object.keys(errors).length && begin()) save.mutate() }
  const previewValue = Number.isFinite(Number(form.value)) && form.value !== '' ? OFFER_VALUE_WORDS[form.type] ? t(`loyalty.rewards.offer_value.${form.type}`, OFFER_VALUE_WORDS[form.type], { value: amountOf(form.type, Number(form.value), boot.venue.currency, i18n.language) }) : `${word('offer_type', OFFER_TYPE_WORDS, form.type)} · ${form.value}` : word('offer_type', OFFER_TYPE_WORDS, form.type)
  return <form className="l-rb-columns l-rb-offer-editor" noValidate onSubmit={submit}><div className="l-rb-side">{list}<section className="l-ov-panel l-rb-form-panel"><header className="l-rb-section-head"><h2>{say(offer ? 'details' : 'newOffer')}</h2><OverviewButton type="button" aria-pressed={form.is_featured} disabled={!manage || guard.busy} onClick={() => update({ is_featured: !form.is_featured })}>{t('loyalty.rewards.offer.featured', 'Featured')}: {form.is_featured ? t('loyalty.rewards.offer.active', 'On') : say('off')}</OverviewButton></header>
      <fieldset className="l-rb-fields" disabled={!manage || guard.busy}><div className="l-rb-grid-two"><FormField label={say('offerName')} problem={problem('title')}><input value={form.title} maxLength={191} onChange={e => update({ title: e.target.value })} /></FormField><BrandField compact options={options.brands} value={brand} saved={savedBrand} refused={!!failure?.fields?.brand} onChange={b => { setBrand(b); setSaved(false); save.reset() }} /></div>
      <div className="l-rb-offer-value"><FormField label={t('loyalty.rewards.offer.type', 'Kind')} problem={problem('type')}><select value={form.type} onChange={e => update({ type: e.target.value })}>{!form.type && <option value="">{t('loyalty.rewards.offer.choose', 'Choose…')}</option>}{typeChoices(options.types, current).map(v => <option key={v} value={v}>{word('offer_type', OFFER_TYPE_WORDS, v)}</option>)}</select></FormField><FormField label={t('loyalty.rewards.offer.value', 'Value')} problem={problem('value')}><input type="number" inputMode="decimal" min={0} max={MAX_OFFER_VALUE} step={.01} value={form.value} onChange={e => update({ value: e.target.value })} /></FormField><FormField label={say('offerCode')} problem={problem('code')}><input value={form.code} maxLength={24} spellCheck={false} onChange={e => update({ code: e.target.value })} /></FormField></div>
      {OFFER_KIND_NOTE_WORDS[form.type] && <small>{word('offer_kind_note', OFFER_KIND_NOTE_WORDS, form.type)}</small>}
      <div className="l-rb-grid-two"><FormField label={say('starts')} problem={problem('start_date')}><input type="date" value={form.start_date} onChange={e => update({ start_date: e.target.value })} /></FormField><FormField label={say('ends')} problem={problem('end_date')}><input type="date" value={form.end_date} onChange={e => update({ end_date: e.target.value })} /></FormField></div><small>{say('workspaceTime', { zone: boot.venue.timezone })}</small>
    </fieldset></section></div>
    <aside className="l-ov-panel l-rb-detail"><div className="l-rb-eyebrow">{say('offerPreview')}</div><div className="l-rb-preview"><small>{brand === 'every' || (brand === null && savedBrand === null) ? t('loyalty.rewards.brand.every', 'Every brand') : options.brands?.list.find(b => b.id === (brand ?? savedBrand))?.name ?? boot.organization.name}</small>{picture && <img className="l-rb-picture" src={mediaUrl(picture)} alt={form.title} loading="lazy" />}<strong className="l-rb-preview-price">{previewValue}{['discount', 'fixed_amount'].includes(form.type) && ['services', 'stays'].includes(form.applies_to) && ` ${say(form.applies_to === 'services' ? 'scopeServices' : 'scopeStays')}`}</strong><p>{form.title}</p>{form.code && <p>{say('useCode', { code: form.code.toUpperCase() })}</p>}</div>
      <fieldset className="l-rb-fields" disabled={!manage || guard.busy}><FormField label={t('loyalty.rewards.offer.applies_to', 'Applies to')} problem={problem('applies_to')}><select value={form.applies_to} onChange={e => update({ applies_to: e.target.value })}>{[...new Set([...options.applies_to, form.applies_to])].map(v => <option key={v} value={v}>{word('applies_to', APPLIES_TO_WORDS, v)}</option>)}</select></FormField>
      <div className="l-rb-field"><span id="offer-levels">{say('eligibility')}</span><details className="l-rb-level-picker"><summary>{form.tiers.length ? form.tiers.map(id => boot.programme.tiers.find(tier => tier.id === id)?.name ?? String(id)).join(' · ') : say('allMembers')}</summary><div role="group" aria-labelledby="offer-levels">{boot.programme.tiers.map(tier => <label key={tier.id}><input type="checkbox" checked={form.tiers.includes(tier.id)} onChange={() => update({ tiers: toggled(form.tiers, tier.id) })} />{tier.name}</label>)}{form.tiers.filter(id => !boot.programme.tiers.some(tier => tier.id === id)).map(id => <label key={id}><input type="checkbox" checked onChange={() => update({ tiers: toggled(form.tiers, id) })} />{id}</label>)}<OverviewButton type="button" onClick={() => update({ tiers: [] })}>{say('allMembers')}</OverviewButton></div></details>{problem('tier_ids') && <p role="alert">{problem('tier_ids')}</p>}</div>
      <div className="l-rb-grid-two"><FormField label={say('caps')} problem={problem('usage_limit')}><input type="number" inputMode="numeric" min={1} max={Number.MAX_SAFE_INTEGER} step={1} placeholder={say('noLimit')} value={form.usage_limit} onChange={e => update({ usage_limit: e.target.value })} /></FormField><FormField label={say('perMember')} problem={problem('per_member_limit')}><input type="number" inputMode="numeric" min={1} max={Number.MAX_SAFE_INTEGER} step={1} placeholder={say('noLimit')} value={form.per_member_limit} onChange={e => update({ per_member_limit: e.target.value })} /></FormField></div></fieldset>
      <div className="l-rb-divider"><strong>{say('conditions')}</strong><p>{form.description || say('conditionsLine')}</p><button type="button" className="l-ov-link" onClick={() => setDialog('terms')}>{manage ? say('editTerms') : say('terms')}</button></div>
      {failure && <Notice tone="danger">{t(...refusalKey('loyalty.rewards', ERRORS, 'offer', failure))}</Notice>}{saved && <p className="l-rb-success" role="status">{say('saved')}</p>}
      <div className="l-rb-detail-actions">{manage && <OverviewButton primary type="submit" disabled={guard.busy}>{t('loyalty.rewards.offer.save', 'Save offer')}</OverviewButton>}{offer && <details className="l-rb-overflow"><summary className="l-ov-button" aria-label={t('loyalty.membership.more.label', 'More')}>…</summary><div className="l-ov-panel"><fieldset className="l-rb-fields" disabled={!manage || guard.busy}><Check label={t('loyalty.rewards.offer.active', 'On')} checked={form.is_active} onChange={on => update({ is_active: on })} /></fieldset><small>{t('loyalty.rewards.offers.used', 'Used: {{used}}', { used: points(offer.times_used, i18n.language) })}</small>{manage && <button type="button" className="l-ov-link" disabled={guard.busy} onClick={() => setDialog('picture')}>{t('loyalty.rewards.picture.label', 'Picture')} →</button>}</div></details>}</div>
      {manage && <><button className="l-rb-cancel" type="button" disabled={guard.busy || !dirty} onClick={() => { setForm(baseline); setBrand(baseBrand); setTried(false); save.reset(); setSaved(false) }}>{say('cancelChanges')}</button>{!offer && <small>{t('loyalty.rewards.picture.after_save_offer', 'You can add a picture once the offer is saved.')}</small>}</>}</aside>
    {dialog === 'terms' && <DesignDialog title={say('terms')} onClose={() => setDialog(null)} busy={guard.busy}><FormField label={t('loyalty.rewards.offer.description', 'Description')} problem={problem('description')}><textarea rows={5} readOnly={!manage} value={form.description} onChange={e => update({ description: e.target.value })} /></FormField><OverviewButton type="button" onClick={() => setDialog(null)}>{t('loyalty.overview.close', 'Close')}</OverviewButton></DesignDialog>}
    {dialog === 'picture' && offer && manage && <DesignDialog title={t('loyalty.rewards.picture.label', 'Picture')} onClose={() => setDialog(null)} busy={guard.busy}><PictureField owner="offers" id={offer.id} picture={picture} alt={form.title} limits={options.image} onBusyChange={pictureBusy} onChange={url => { setPicture(url); void client.invalidateQueries({ queryKey: OFFERS_KEY }) }} /></DesignDialog>}
  </form>
}
