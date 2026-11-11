import { useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams, usePreventRemove } from 'expo-router'
import { useIsMutating, useMutation, useQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../../lib/api'
import { KEYS, queryClient, useBoot, useRefreshOnFocus } from '../../lib/queries'
import { number } from '../../lib/format'
import { feel } from '../../lib/haptics'
import { useT } from '../../lib/i18n'
import { useSession } from '../../lib/session'
import { C, TAB_BAR_ROOM, fonts } from '../../lib/theme'
import { claimedMessage, counted, formatDay, offerPerkNote, offerValueLabel, paysPointsOnClaim } from '../../shared/portal'
import { loyaltyFeatures, rewardTab, singleFlight, rewardMessage, type RewardTab } from '../../lib/loyalty'
import { VoucherDownload } from '../../components/VoucherDownload'
import type { Benefit, Claim, Offer, Redemption, Reward } from '../../lib/types'
import { Backdrop, Empty, GhostButton, GoldButton, Notice, Picture, Pill, Press, Segments, Shimmer, Surface } from '../../components/ui'
import { ScreenHeader } from '../../components/ScreenHeader'
import { ActionPopup } from '../../components/ActionPopup'
import { MemberIcon } from '../../components/MemberIcon'
import { notify } from '../../components/Feedback'

type Tab = RewardTab

/** What changes a member's rewards also changes Home's figures. */
function refreshRewards(): void {
  void queryClient.invalidateQueries({ queryKey: ['rewards'] })
  void queryClient.invalidateQueries({ queryKey: KEYS.boot })
  void queryClient.invalidateQueries({ queryKey: KEYS.history })
}

/**
 * Rewards, as the portal's: the member's level and what it gives (and asking for what needs a person), the points
 * catalogue, the venue's offers, and the codes to show at the desk. The server decides every price, limit and state.
 */
export default function Rewards() {
  const insets = useSafeAreaInsets()
  const { tp } = useT()
  const boot = useBoot()
  useRefreshOnFocus(REWARDS_FACTS)
  const { tab: requested } = useLocalSearchParams<{ tab?: string }>()
  const features = loyaltyFeatures(boot.data)
  const [selection, setSelection] = useState<{ from: string | undefined; value: Tab } | null>(null)
  const tab = rewardTab(selection?.from === requested ? selection?.value : requested, features.points)
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const points = boot.data?.member?.current_points ?? 0
  const busy = useIsMutating({ mutationKey: ['member-rewards'] }) > 0

  const refresh = async () => {
    setRefreshing(true)
    await queryClient.invalidateQueries({ queryKey: ['rewards'] })
    setRefreshing(false)
  }

  return (
    <Backdrop>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: TAB_BAR_ROOM, paddingHorizontal: 24, gap: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh() }} tintColor={C.gold} />}
      >
        <ScreenHeader title={tp('portal.rewards.title')} />
        <Segments<Tab>
          value={tab}
          onChange={next => { if (!busy) { setSelection({ from: requested, value: next }); setNote(null) } }}
          items={[
            { id: 'benefits', label: tp('portal.rewards.tab_benefits') },
            ...(features.points ? [{ id: 'catalogue' as const, label: tp('portal.rewards.tab_catalogue') }, { id: 'offers' as const, label: tp('portal.rewards.tab_offers') }] : []),
            { id: 'codes', label: tp('portal.rewards.tab_codes') },
          ]}
        />
        {note && <Notice tone={note.tone} text={note.text} />}
        {tab === 'benefits' && (features.benefits ? <Benefits onNote={setNote} /> : <Empty icon="ribbon-outline" text={tp('portal.rewards.benefits_empty')} />)}
        {tab === 'catalogue' && <Catalogue points={points} onNote={setNote} />}
        {tab === 'offers' && <Offers currency={boot.data?.venue.currency ?? 'EUR'} onNote={setNote} />}
        {tab === 'codes' && <Codes />}
      </ScrollView>
    </Backdrop>
  )
}

type OnNote = (note: { tone: 'success' | 'danger'; text: string } | null) => void

function Loading() {
  return <View style={{ gap: 10 }}><Shimmer height={110} /><Shimmer height={110} /></View>
}

function Failed({ retry }: { retry: () => void }) {
  const { tp } = useT()
  return <Notice text={tp('portal.common.error')} action={tp('portal.common.retry')} onAction={retry} />
}

/** The level's benefits; one that needs a person can be asked for, and a waiting request withdrawn. */
function Benefits({ onNote }: { onNote: OnNote }) {
  const { t, tp, language } = useT()
  const boot = useBoot()
  const [detailId, setDetailId] = useState<number | null>(null)
  const [run] = useState(singleFlight)
  const busy = useIsMutating({ mutationKey: ['member-rewards'] }) > 0
  usePreventRemove(busy, () => {})
  const list = useQuery({ queryKey: ['rewards', 'benefits'], queryFn: api.benefits })
  const ask = useMutation({
    mutationKey: ['member-rewards'],
    onMutate: () => ({ owner: useSession.getState().token }),
    mutationFn: (id: number) => api.requestBenefit(id),
    onSuccess: (_answer, _id, context) => { if (context?.owner !== useSession.getState().token) return; notify(tp('portal.rewards.request_sent')); refreshRewards() },
    onError: error => { feel.warning(); onNote({ tone: 'danger', text: rewardMessage(error, tp, tp('portal.rewards.request_failed')) }) },
  })
  const withdraw = useMutation({
    mutationKey: ['member-rewards'],
    onMutate: () => ({ owner: useSession.getState().token }),
    mutationFn: (id: number) => api.cancelBenefitRequest(id),
    onSuccess: (_answer, _id, context) => { if (context?.owner !== useSession.getState().token) return; notify(tp('portal.rewards.request_cancelled')); refreshRewards() },
    onError: error => onNote({ tone: 'danger', text: rewardMessage(error, tp, tp('portal.rewards.request_failed')) }),
  })

  if (list.isLoading) return <Loading />
  if (list.isError) return <Failed retry={() => { void list.refetch() }} />
  const benefits = list.data?.benefits ?? []
  if (benefits.length === 0) return <Empty icon="ribbon-outline" text={tp('portal.rewards.benefits_empty')} />

  const detail = benefits.find(b => b.tier_benefit_id === detailId)
  const write = (id: number, cancel = false) => { if (!queryClient.isMutating({ mutationKey: ['member-rewards'] })) void run(() => cancel ? withdraw.mutateAsync(id) : ask.mutateAsync(id)).catch(() => {}) }
  return (
    <View style={{ gap: 12 }}>
      <ActionPopup visible={!!detail} title={detail?.name ?? t('events.details')} busy={busy} onClose={() => setDetailId(null)}>
        {detail?.display && <Text style={[fonts.bodyStrong, { color: C.gold }]}>{detail.display}</Text>}
        {detail?.description && <Text style={[fonts.body, { color: C.text2 }]}>{detail.description}</Text>}
        {detail && !detail.requestable && <Text style={[fonts.small, { color: C.text2 }]}>{tp(detail.fulfillment_mode === 'voucher' ? 'portal.rewards.voucher' : 'portal.rewards.automatic')}</Text>}
      </ActionPopup>
      {list.data?.tier && <Pill text={tp('portal.rewards.tier_level', { tier: list.data.tier })} />}
      {benefits.map((benefit: Benefit) => {
        const open = benefit.request
        return (
          <Surface key={benefit.tier_benefit_id} style={{ gap: 10 }}>
            <Press label={benefit.name} onPress={() => setDetailId(benefit.tier_benefit_id)}><View style={styles.head}>
              <MemberIcon name="shield" color={C.gold} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[fonts.bodyStrong, { color: C.text }]}>{benefit.name}</Text>
                {benefit.display ? <Text style={[fonts.small, { color: C.goldLight }]}>{benefit.display}</Text> : null}
              </View>
              <MemberIcon name="chevron" size={18} color={C.text2} />
            </View></Press>
            {open ? (
              <View style={{ gap: 8 }}>
                <Notice tone={open.status === 'approved' ? 'success' : 'info'} text={open.status === 'approved' ? tp('portal.rewards.approved') : tp('portal.rewards.requested')} />
                {(open.status === 'pending' || open.status === 'eligible') && (
                  <GhostButton title={tp('portal.rewards.cancel_request')} disabled={busy} onPress={() => write(open.id, true)} />
                )}
              </View>
            ) : benefit.requestable ? (
              <GoldButton title={tp('portal.rewards.request')} disabled={busy} busy={ask.isPending && ask.variables === benefit.tier_benefit_id} onPress={() => write(benefit.tier_benefit_id)} />
            ) : (
              <Text style={[fonts.small, { color: C.text3 }]}>{benefit.fulfillment_mode === 'voucher' ? tp('portal.rewards.voucher') : tp('portal.rewards.automatic')}</Text>
            )}
            {benefit.last_fulfilled_at && !open ? <Text style={[fonts.small, { color: C.text3 }]}>{tp('portal.rewards.last_used', { date: formatDay(benefit.last_fulfilled_at, language, { timeZone: boot.data?.venue.timezone }) })}</Text> : null}
          </Surface>
        )
      })}
    </View>
  )
}

/** The points catalogue: what each reward costs, whether the member can have it, and redeeming with a confirmation. */
function Catalogue({ points, onNote }: { points: number; onNote: OnNote }) {
  const { t, tp, language } = useT()
  const list = useQuery({ queryKey: ['rewards', 'catalogue'], queryFn: api.rewards })
  const [confirming, setConfirming] = useState<Reward | null>(null)
  const [result, setResult] = useState<Redemption | null>(null)
  const [run] = useState(singleFlight)
  const redeem = useMutation({
    mutationKey: ['member-rewards'],
    onMutate: () => ({ owner: useSession.getState().token }),
    mutationFn: (id: number) => api.redeem(id),
    onSuccess: (answer, _id, context) => { if (context?.owner !== useSession.getState().token) return; setResult(answer.redemption); feel.success(); refreshRewards() },
    onError: error => { feel.warning(); onNote({ tone: 'danger', text: rewardMessage(error, tp, tp('portal.rewards.redeem_failed')) }); refreshRewards() },
  })
  usePreventRemove(redeem.isPending, () => {})
  const confirm = (reward: Reward) => { if (!redeem.isPending) { redeem.reset(); setResult(null); setConfirming(reward) } }

  if (list.isLoading) return <Loading />
  if (list.isError) return <Failed retry={() => { void list.refetch() }} />
  const rewards = list.data?.rewards ?? []
  if (rewards.length === 0) return <Empty icon="gift-outline" text={tp('portal.rewards.catalogue_empty')} />
  const balance = list.data?.current_points ?? points

  return (
    <View style={{ gap: 12 }}>
      <ActionPopup visible={!!confirming} title={result ? t('rewards.ready') : tp('portal.rewards.redeem_title', { name: confirming?.name ?? '' })} busy={redeem.isPending} onClose={() => setConfirming(null)}>
          {result ? <>
            <MemberIcon name="check" size={36} color={C.success} />
            <Text style={[fonts.bodyStrong, { color: C.text }]}>{confirming?.name}</Text>
            <Text style={[styles.code, { color: C.gold }]} selectable>{result.code}</Text>
            <Text style={[fonts.small, { color: C.text2 }]}>{t('rewards.showCode')}</Text>
          </> : <>
            <Text style={[fonts.body, { color: C.text2 }]}>{counted(tp, 'rewards.redeem_body', confirming?.points_cost ?? 0, language)}</Text>
            {redeem.isError && <Notice text={rewardMessage(redeem.error, tp, tp('portal.rewards.redeem_failed'))} />}
            <GoldButton title={tp('portal.common.confirm')} busy={redeem.isPending} onPress={() => { const reward = confirming; if (reward && !queryClient.isMutating({ mutationKey: ['member-rewards'] })) void run(() => redeem.mutateAsync(reward.id)).catch(() => {}) }} />
          </>}
      </ActionPopup>
      {rewards.map(reward => {
        const limitReached = reward.remaining_for_me === 0
        const outOfStock = reward.in_stock === false
        const short = reward.can_afford ? 0 : Math.max(1, reward.points_cost - balance)
        return (
          <Surface key={reward.id} padding={0} style={{ overflow: 'hidden' }}>
            <Picture url={reward.image_url} style={styles.picture} />
            <View style={{ padding: 16, gap: 10 }}>
              <View style={styles.head}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[fonts.bodyStrong, { color: C.text }]}>{reward.name}</Text>
                  {reward.category ? <Text style={[fonts.small, { color: C.text3 }]}>{reward.category}</Text> : null}
                </View>
                <Text style={[fonts.number, { color: C.goldLight }]}>{number(reward.points_cost, language)}</Text>
              </View>
              {reward.description ? <Text style={[fonts.small, { color: C.text2 }]} numberOfLines={3}>{reward.description}</Text> : null}
              {limitReached ? <Text style={[fonts.smallStrong, { color: C.text2 }]}>{tp('portal.rewards.already_claimed')}</Text>
                : outOfStock ? <Text style={[fonts.smallStrong, { color: C.text2 }]}>{tp('portal.rewards.out_of_stock')}</Text>
                  : short > 0 ? <Text style={[fonts.smallStrong, { color: C.text2 }]}>{counted(tp, 'rewards.points_needed', short, language)}</Text>
                    : <GoldButton title={tp('portal.rewards.redeem')} icon="gift" disabled={redeem.isPending} onPress={() => confirm(reward)} />}
            </View>
          </Surface>
        )
      })}
    </View>
  )
}

/** The venue's offers: the member's own claimed ones first, then those still to claim. */
function Offers({ currency, onNote }: { currency: string; onNote: OnNote }) {
  const { t, tp, language } = useT()
  const [selected, setSelected] = useState<Offer | null>(null)
  const [downloadBusy, setDownloadBusy] = useState(false)
  const [run] = useState(singleFlight)
  const busy = useIsMutating({ mutationKey: ['member-rewards'] }) > 0
  usePreventRemove(busy || downloadBusy, () => {})
  const list = useQuery({ queryKey: ['rewards', 'offers'], queryFn: api.offers })
  const claim = useMutation({
    mutationKey: ['member-rewards'],
    onMutate: () => ({ owner: useSession.getState().token }),
    mutationFn: (id: number) => api.claimOffer(id),
    onSuccess: (reply, _id, context) => { if (context?.owner !== useSession.getState().token) return; feel.success(); notify(claimedMessage(reply, tp, language)); refreshRewards() },
    onError: error => { feel.warning(); onNote({ tone: 'danger', text: rewardMessage(error, tp, tp('portal.rewards.claim_failed')) }) },
  })

  if (list.isLoading) return <Loading />
  if (list.isError) return <Failed retry={() => { void list.refetch() }} />
  const claimed = (list.data?.personalized ?? []).filter((c: Claim) => c.offer)
  const claimedIds = new Set(claimed.map(c => c.offer?.id))
  const available = (list.data?.general ?? []).filter((o: Offer) => !claimedIds.has(o.id))
  if (claimed.length === 0 && available.length === 0) return <Empty icon="pricetags-outline" text={tp('portal.rewards.offers_empty')} />

  const value = (offer: Offer) => offerValueLabel(offer, tp, { currency, locale: language })
  const selectedClaim = claimed.find(c => c.offer?.id === selected?.id)
  return (
    <View style={{ gap: 12 }}>
      <ActionPopup visible={!!selected} title={selected?.title ?? t('events.details')} kind="sheet" busy={downloadBusy || busy} onClose={() => setSelected(null)}>
        {selected?.description && <Text style={[fonts.body, { color: C.text2 }]}>{selected.description}</Text>}
        {selected?.terms_conditions && <Text style={[fonts.small, { color: C.text2 }]}>{selected.terms_conditions}</Text>}
        {selected?.attachment && selectedClaim?.usable_now !== false && <VoucherDownload id={selected.id} name={selected.attachment.name} onBusyChange={setDownloadBusy} />}
      </ActionPopup>
      {claimed.length > 0 && <Text style={[fonts.label, { color: C.text2 }]}>{tp('portal.rewards.offers_yours')}</Text>}
      {claimed.map(c => (
        <Surface key={`c${c.id}`} tint={C.success} style={{ gap: 6 }}>
          <Press label={c.offer!.title} onPress={() => setSelected(c.offer!)}><View style={styles.head}>
            <Text style={[fonts.bodyStrong, { color: C.text, flex: 1 }]}>{c.offer?.title}</Text>
            {c.offer && value(c.offer) ? <Pill text={value(c.offer) ?? ''} color={C.success} /> : null}
            <MemberIcon name="chevron" size={18} color={C.text2} />
          </View></Press>
          <Text style={[fonts.small, { color: C.text2 }]}>
            {c.used_at ? tp(paysPointsOnClaim(c.offer!) ? 'portal.rewards.points_added_on' : 'portal.rewards.used_on', { date: formatDay(c.used_at, language) }) : c.usable_now === false ? tp('portal.rewards.offer_membership_unavailable') : (c.offer && offerPerkNote(c.offer, tp)) ?? tp('portal.rewards.ready_to_use')}
          </Text>
          {c.expires_at && !c.used_at ? <Text style={[fonts.small, { color: C.text3 }]}>{tp('portal.rewards.valid_until', { date: formatDay(c.expires_at, language) })}</Text> : null}
          {c.usable_now !== false && c.offer?.attachment && <GhostButton title={t('rewards.openVoucher')} onPress={() => setSelected(c.offer!)} />}
        </Surface>
      ))}
      {available.length > 0 && <Text style={[fonts.label, { color: C.text2 }]}>{tp('portal.rewards.offers_available')}</Text>}
      {available.map(offer => {
        const full = offer.usage_limit != null && (offer.times_used ?? 0) >= offer.usage_limit
        return (
          <Surface key={`o${offer.id}`} padding={0} style={{ overflow: 'hidden' }}>
            <Picture url={offer.image_url} style={styles.picture} />
            <View style={{ padding: 16, gap: 10 }}>
              <Press label={offer.title} onPress={() => setSelected(offer)}><View style={styles.head}>
                <Text style={[fonts.bodyStrong, { color: C.text, flex: 1 }]}>{offer.title}</Text>
                {value(offer) ? <Pill text={value(offer) ?? ''} /> : null}
                <MemberIcon name="chevron" size={18} color={C.text2} />
              </View></Press>
              {offer.description ? <Text style={[fonts.small, { color: C.text2 }]} numberOfLines={2}>{offer.description}</Text> : null}
              {offerPerkNote(offer, tp) ? <Text style={[fonts.small, { color: C.text3 }]}>{offerPerkNote(offer, tp)}</Text> : null}
              {offer.end_date ? <Text style={[fonts.small, { color: C.text3 }]}>{tp('portal.rewards.ends', { date: formatDay(offer.end_date, language) })}</Text> : null}
              {full ? <Text style={[fonts.smallStrong, { color: C.text2 }]}>{tp('portal.rewards.fully_claimed')}</Text>
                : <GoldButton title={tp('portal.rewards.claim')} disabled={busy} busy={claim.isPending && claim.variables === offer.id} onPress={() => { if (!queryClient.isMutating({ mutationKey: ['member-rewards'] })) void run(() => claim.mutateAsync(offer.id)).catch(() => {}) }} />}
              {offer.attachment && <GhostButton title={t('rewards.openVoucher')} onPress={() => setSelected(offer)} />}
            </View>
          </Surface>
        )
      })}
    </View>
  )
}

const CODE_STATE: Record<string, { key: string; color: string }> = {
  pending: { key: 'portal.rewards.code_pending', color: C.warning },
  fulfilled: { key: 'portal.rewards.code_fulfilled', color: C.success },
  cancelled: { key: 'portal.rewards.code_cancelled', color: C.text3 },
}

/** The member's redemption codes: what to show at the desk, what was used. */
function Codes() {
  const { tp, language } = useT()
  const list = useQuery({ queryKey: ['rewards', 'codes'], queryFn: api.redemptions })
  if (list.isLoading) return <Loading />
  if (list.isError) return <Failed retry={() => { void list.refetch() }} />
  const codes = list.data?.redemptions ?? []
  if (codes.length === 0) return <Empty icon="ticket-outline" text={tp('portal.rewards.codes_empty')} />
  return (
    <View style={{ gap: 12 }}>
      {codes.map((code: Redemption) => {
        const state = CODE_STATE[code.status] ?? CODE_STATE.pending
        return (
          <Surface key={code.id} tint={code.status === 'pending' ? C.gold : undefined} style={{ gap: 8 }}>
            <View style={styles.head}>
              <Text style={[fonts.bodyStrong, { color: C.text, flex: 1 }]}>{code.reward?.name ?? '—'}</Text>
              <Pill text={tp(state.key)} color={state.color} />
            </View>
            <Text style={[styles.code, { color: code.status === 'pending' ? C.goldLight : C.text2 }]} selectable>{code.code}</Text>
            <Text style={[fonts.small, { color: C.text3 }]}>{formatDay(code.created_at, language)} · {number(code.points_spent, language)} {tp('portal.common.points')}</Text>
          </Surface>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  picture: { width: '100%', height: 140 },
  code: { fontFamily: 'Inter_700Bold', fontSize: 22, letterSpacing: 2, fontVariant: ['tabular-nums'] },
})

const REWARDS_FACTS = [KEYS.boot, ['rewards']] as const
