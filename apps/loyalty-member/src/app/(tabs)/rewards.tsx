import { useState } from 'react'
import { Alert, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { api } from '../../lib/api'
import { failureOf } from '../../lib/failure'
import { KEYS, queryClient, useBoot } from '../../lib/queries'
import { number } from '../../lib/format'
import { feel } from '../../lib/haptics'
import { useT } from '../../lib/i18n'
import { C, TAB_BAR_ROOM, fonts } from '../../lib/theme'
import { claimedMessage, counted, formatDay, offerPerkNote, offerValueLabel } from '../../shared/portal'
import type { Benefit, Claim, Offer, Redemption, Reward } from '../../lib/types'
import { Backdrop, Empty, GhostButton, GoldButton, Notice, Picture, Pill, Segments, Shimmer, Surface } from '../../components/ui'

type Tab = 'benefits' | 'catalogue' | 'offers' | 'codes'

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
  const { tp, language } = useT()
  const boot = useBoot()
  const [tab, setTab] = useState<Tab>('benefits')
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const points = boot.data?.member?.current_points ?? 0

  const refresh = async () => {
    setRefreshing(true)
    await queryClient.invalidateQueries({ queryKey: ['rewards'] })
    setRefreshing(false)
  }

  return (
    <Backdrop>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: TAB_BAR_ROOM, paddingHorizontal: 20, gap: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh() }} tintColor={C.gold} />}
      >
        <View style={{ gap: 4 }}>
          <Text style={[fonts.display, { color: C.text }]}>{tp('portal.rewards.title')}</Text>
          <Text style={[fonts.bodyStrong, { color: C.goldLight }]}>{counted(tp, 'rewards.you_have', points, language)}</Text>
        </View>
        <Segments<Tab>
          value={tab}
          onChange={next => { setTab(next); setNote(null) }}
          items={[
            { id: 'benefits', label: tp('portal.rewards.tab_benefits') },
            { id: 'catalogue', label: tp('portal.rewards.tab_catalogue') },
            { id: 'offers', label: tp('portal.rewards.tab_offers') },
            { id: 'codes', label: tp('portal.rewards.tab_codes') },
          ]}
        />
        {note && <Notice tone={note.tone} text={note.text} />}
        {tab === 'benefits' && <Benefits onNote={setNote} />}
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
  const { tp, language } = useT()
  const boot = useBoot()
  const list = useQuery({ queryKey: ['rewards', 'benefits'], queryFn: api.benefits })
  const ask = useMutation({
    mutationFn: (id: number) => api.requestBenefit(id),
    onSuccess: () => { feel.success(); onNote({ tone: 'success', text: tp('portal.rewards.request_sent') }); refreshRewards() },
    onError: error => { feel.warning(); onNote({ tone: 'danger', text: failureOf(error).message ?? tp('portal.rewards.request_failed') }) },
  })
  const withdraw = useMutation({
    mutationFn: (id: number) => api.cancelBenefitRequest(id),
    onSuccess: () => { onNote({ tone: 'success', text: tp('portal.rewards.request_cancelled') }); refreshRewards() },
    onError: error => onNote({ tone: 'danger', text: failureOf(error).message ?? tp('portal.rewards.request_failed') }),
  })

  if (list.isLoading) return <Loading />
  if (list.isError) return <Failed retry={() => { void list.refetch() }} />
  const benefits = list.data?.benefits ?? []
  if (benefits.length === 0) return <Empty icon="ribbon-outline" text={tp('portal.rewards.benefits_empty')} />

  return (
    <View style={{ gap: 12 }}>
      {list.data?.tier && <Pill text={tp('portal.rewards.tier_level', { tier: list.data.tier })} />}
      {benefits.map((benefit: Benefit) => {
        const open = benefit.request
        return (
          <Surface key={benefit.tier_benefit_id} style={{ gap: 10 }}>
            <View style={styles.head}>
              <View style={[styles.mark, { backgroundColor: C.goldWash }]}><Ionicons name="ribbon" size={18} color={C.gold} /></View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[fonts.bodyStrong, { color: C.text }]}>{benefit.name}</Text>
                {benefit.display ? <Text style={[fonts.small, { color: C.goldLight }]}>{benefit.display}</Text> : null}
              </View>
            </View>
            {benefit.description ? <Text style={[fonts.small, { color: C.text2 }]}>{benefit.description}</Text> : null}
            {open ? (
              <View style={{ gap: 8 }}>
                <Notice tone={open.status === 'approved' ? 'success' : 'info'} text={open.status === 'approved' ? tp('portal.rewards.approved') : tp('portal.rewards.requested')} />
                {(open.status === 'pending' || open.status === 'eligible') && (
                  <GhostButton title={tp('portal.rewards.cancel_request')} disabled={withdraw.isPending} onPress={() => withdraw.mutate(open.id)} />
                )}
              </View>
            ) : benefit.requestable ? (
              <GoldButton title={tp('portal.rewards.request')} icon="hand-right" busy={ask.isPending && ask.variables === benefit.tier_benefit_id} onPress={() => ask.mutate(benefit.tier_benefit_id)} />
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
  const { tp, language } = useT()
  const list = useQuery({ queryKey: ['rewards', 'catalogue'], queryFn: api.rewards })
  const redeem = useMutation({
    mutationFn: (id: number) => api.redeem(id),
    onSuccess: answer => { feel.success(); onNote({ tone: 'success', text: tp('portal.rewards.redeemed', { code: answer.redemption.code }) }); refreshRewards() },
    onError: error => { feel.warning(); onNote({ tone: 'danger', text: failureOf(error).message ?? tp('portal.rewards.redeem_failed') }) },
  })

  const confirm = (reward: Reward) => {
    const title = tp('portal.rewards.redeem_title', { name: reward.name })
    const body = counted(tp, 'rewards.redeem_body', reward.points_cost, language)
    if (Platform.OS === 'web') {
      redeem.mutate(reward.id)
      return
    }
    Alert.alert(title, body, [
      { text: tp('portal.common.cancel'), style: 'cancel' },
      { text: tp('portal.common.confirm'), onPress: () => redeem.mutate(reward.id) },
    ])
  }

  if (list.isLoading) return <Loading />
  if (list.isError) return <Failed retry={() => { void list.refetch() }} />
  const rewards = list.data?.rewards ?? []
  if (rewards.length === 0) return <Empty icon="gift-outline" text={tp('portal.rewards.catalogue_empty')} />
  const balance = list.data?.current_points ?? points

  return (
    <View style={{ gap: 12 }}>
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
                    : <GoldButton title={tp('portal.rewards.redeem')} icon="gift" busy={redeem.isPending && redeem.variables === reward.id} onPress={() => confirm(reward)} />}
            </View>
          </Surface>
        )
      })}
    </View>
  )
}

/** The venue's offers: the member's own claimed ones first, then those still to claim. */
function Offers({ currency, onNote }: { currency: string; onNote: OnNote }) {
  const { tp, language } = useT()
  const list = useQuery({ queryKey: ['rewards', 'offers'], queryFn: api.offers })
  const claim = useMutation({
    mutationFn: (id: number) => api.claimOffer(id),
    onSuccess: reply => { feel.success(); onNote({ tone: 'success', text: claimedMessage(reply, tp, language) }); refreshRewards() },
    onError: error => { feel.warning(); onNote({ tone: 'danger', text: failureOf(error).message ?? tp('portal.rewards.claim_failed') }) },
  })

  if (list.isLoading) return <Loading />
  if (list.isError) return <Failed retry={() => { void list.refetch() }} />
  const claimed = (list.data?.personalized ?? []).filter((c: Claim) => c.offer)
  const claimedIds = new Set(claimed.map(c => c.offer?.id))
  const available = (list.data?.general ?? []).filter((o: Offer) => !claimedIds.has(o.id))
  if (claimed.length === 0 && available.length === 0) return <Empty icon="pricetags-outline" text={tp('portal.rewards.offers_empty')} />

  const value = (offer: Offer) => offerValueLabel(offer, tp, { currency, locale: language })
  return (
    <View style={{ gap: 12 }}>
      {claimed.length > 0 && <Text style={[fonts.label, { color: C.text2 }]}>{tp('portal.rewards.offers_yours')}</Text>}
      {claimed.map(c => (
        <Surface key={`c${c.id}`} tint={C.success} style={{ gap: 6 }}>
          <View style={styles.head}>
            <Text style={[fonts.bodyStrong, { color: C.text, flex: 1 }]}>{c.offer?.title}</Text>
            {c.offer && value(c.offer) ? <Pill text={value(c.offer) ?? ''} color={C.success} /> : null}
          </View>
          <Text style={[fonts.small, { color: C.text2 }]}>
            {c.used_at ? tp('portal.rewards.used_on', { date: formatDay(c.used_at, language) }) : (c.offer && offerPerkNote(c.offer, tp)) ?? tp('portal.rewards.ready_to_use')}
          </Text>
          {c.expires_at && !c.used_at ? <Text style={[fonts.small, { color: C.text3 }]}>{tp('portal.rewards.valid_until', { date: formatDay(c.expires_at, language) })}</Text> : null}
        </Surface>
      ))}
      {available.length > 0 && <Text style={[fonts.label, { color: C.text2 }]}>{tp('portal.rewards.offers_available')}</Text>}
      {available.map(offer => {
        const full = offer.usage_limit != null && (offer.times_used ?? 0) >= offer.usage_limit
        return (
          <Surface key={`o${offer.id}`} padding={0} style={{ overflow: 'hidden' }}>
            <Picture url={offer.image_url} style={styles.picture} />
            <View style={{ padding: 16, gap: 10 }}>
              <View style={styles.head}>
                <Text style={[fonts.bodyStrong, { color: C.text, flex: 1 }]}>{offer.title}</Text>
                {value(offer) ? <Pill text={value(offer) ?? ''} /> : null}
              </View>
              {offer.description ? <Text style={[fonts.small, { color: C.text2 }]}>{offer.description}</Text> : null}
              {offerPerkNote(offer, tp) ? <Text style={[fonts.small, { color: C.text3 }]}>{offerPerkNote(offer, tp)}</Text> : null}
              {offer.end_date ? <Text style={[fonts.small, { color: C.text3 }]}>{tp('portal.rewards.ends', { date: formatDay(offer.end_date, language) })}</Text> : null}
              {full ? <Text style={[fonts.smallStrong, { color: C.text2 }]}>{tp('portal.rewards.fully_claimed')}</Text>
                : <GoldButton title={tp('portal.rewards.claim')} icon="pricetag" busy={claim.isPending && claim.variables === offer.id} onPress={() => claim.mutate(offer.id)} />}
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

