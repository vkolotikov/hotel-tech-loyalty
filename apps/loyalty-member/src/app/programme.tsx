import { Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { KEYS, LIVE_MS, useBoot } from '../lib/queries'
import { useT } from '../lib/i18n'
import { C, fonts } from '../lib/theme'
import { formatMoney } from '../shared/portal'
import { Sheet } from '../components/Sheet'
import { Empty, Notice, Shimmer, Surface } from '../components/ui'

/** The programme and admission decisions are read from the canonical member DTO, never inferred from the tier. */
export default function Programme() {
  const { tp, language } = useT()
  const boot = useBoot()
  const q = useQuery({ queryKey: KEYS.programme, queryFn: api.programme, enabled: !!boot.data?.member, staleTime: LIVE_MS })
  const e = boot.data?.capabilities.loyalty ? q.data?.earning : null
  return <Sheet title={tp('portal.help.how')}>
    {q.isLoading && <Shimmer height={200} />}
    {q.isError && <Notice text={tp('portal.common.error')} action={tp('portal.common.retry')} onAction={() => { void q.refetch() }} />}
    {e && <Surface style={{ gap: 16 }}>
      <Text style={[fonts.heading, { color: C.text }]}>{tp('portal.design.earn_points')}</Text>
      {(e.desk || e.bookings) && <View style={{ gap: 4 }}>
        <Text style={[fonts.bodyStrong, { color: C.text }]}>{tp('portal.design.eligible_spend')}</Text>
        <Text style={[fonts.body, { color: C.text2 }]}>{tp('portal.design.base_rate', { points: e.base_rate.toLocaleString(language), amount: formatMoney(1, boot.data?.venue.currency ?? 'EUR', language) })}</Text>
      </View>}
      {e.checkin && <View style={{ gap: 4 }}>
        <Text style={[fonts.bodyStrong, { color: C.text }]}>{tp('portal.design.checkin')} · +{e.checkin_points.toLocaleString(language)} {tp('portal.common.points')}</Text>
        <Text style={[fonts.body, { color: C.text2 }]}>{tp('portal.design.recorded_visit')}</Text>
      </View>}
      {e.birthday_points > 0 && <View style={{ gap: 4 }}>
        <Text style={[fonts.bodyStrong, { color: C.text }]}>{tp('portal.profile.birthday')} · +{e.birthday_points.toLocaleString(language)} {tp('portal.common.points')}</Text>
        <Text style={[fonts.body, { color: C.text2 }]}>{tp('portal.design.birthday_hint')}</Text>
      </View>}
      <Text style={[fonts.small, { color: C.text2 }]}>{e.expiry_months > 0 ? tp('portal.design.expiry', { months: e.expiry_months }) : tp('portal.design.no_expiry')}</Text>
    </Surface>}
    {!!q.data?.places.length && <View style={{ gap: 12 }}>
      <Text style={[fonts.heading, { color: C.text }]}>{tp('portal.design.your_access')}</Text>
      {q.data.places.map(place => <Surface key={place.id} style={{ gap: 8 }}>
        <Text style={[fonts.bodyStrong, { color: C.text }]}>{place.name}</Text>
        {place.description && <Text style={[fonts.body, { color: C.text2 }]}>{place.description}</Text>}
        <Notice text={tp(place.granted ? 'portal.design.access_included' : 'portal.design.access_unavailable')} tone={place.granted ? 'success' : 'warning'} />
        {!place.granted && place.reason === 'tier_not_allowed' && place.allowed_tiers.length > 0 && <Text style={[fonts.small, { color: C.text2 }]}>{tp('portal.design.tier_access', { tiers: place.allowed_tiers.join(' · ') })}</Text>}
      </Surface>)}
    </View>}
    {q.isSuccess && !e && !q.data.places.length && <Empty icon="ribbon-outline" text={tp('portal.rewards.benefits_empty')} />}
  </Sheet>
}
