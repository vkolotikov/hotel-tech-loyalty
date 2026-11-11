import { useState } from 'react'
import { Text } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { KEYS, LIVE_MS, useBoot } from '../lib/queries'
import { loyaltyFeatures } from '../lib/loyalty'
import { useT } from '../lib/i18n'
import { C, fonts } from '../lib/theme'
import { formatMoney, stampFace } from '../shared/portal'
import { ActivityRow } from '../components/ActivityRow'
import { StampCard } from '../components/Programme'
import { Sheet } from '../components/Sheet'
import { Empty, GhostButton, Notice, Segments, Shimmer } from '../components/ui'
import { AnimatedBalance } from '../components/Feedback'
import { PointsHistory } from '../components/PointsHistory'

export default function Balances() {
  const { history } = useLocalSearchParams<{ history?: string }>()
  return history === '1' ? <PointsHistory /> : <BalancePopup />
}
function BalancePopup() {
  const { t, tp, language } = useT()
  const boot = useBoot()
  const points = loyaltyFeatures(boot.data).points
  const enabled = !!boot.data?.member && !!boot.data.capabilities.loyalty
  const history = useQuery({ queryKey: [...KEYS.history, 'recent'], queryFn: () => api.pointsHistory(1), enabled: points, staleTime: LIVE_MS })
  const stamps = useQuery({ queryKey: ['stamps'], queryFn: api.stamps, enabled, staleTime: LIVE_MS })
  const credit = useQuery({ queryKey: ['credit'], queryFn: api.credit, enabled, staleTime: LIVE_MS })
  const tabs = [...(points ? [{ id: 'points', label: tp('portal.common.points') }] : []), ...(enabled && stampFace(stamps.data) ? [{ id: 'stamps', label: tp('portal.stamps.title') }] : []), ...(enabled && (credit.data?.enabled || (credit.data?.balance ?? 0) > 0) ? [{ id: 'credit', label: t('balance.credit') }] : [])]
  const [selected, setSelected] = useState('points')
  const tab = tabs.some(t => t.id === selected) ? selected : tabs[0]?.id
  return <Sheet title={t('balance.title')} kind="popup">
    {tabs.length > 1 && <Segments value={tab ?? 'points'} onChange={setSelected} items={tabs} />}
    {boot.isLoading && <Shimmer height={240} />}
    {tab === 'points' && <>
      <AnimatedBalance value={boot.data?.member?.current_points ?? 0} language={language} />
      {history.isLoading && <Shimmer height={150} />}
      {history.isError && <Notice text={tp('portal.common.error')} action={tp('portal.common.retry')} onAction={() => { void history.refetch() }} />}
      {history.data?.data.slice(0, 5).map((a, i, all) => <ActivityRow key={a.id} item={a} timezone={boot.data?.venue.timezone ?? 'UTC'} last={i === all.length - 1} />)}
      {history.isSuccess && !history.data.data.length && <Empty icon="pulse-outline" text={tp('portal.activity.empty')} />}
      <GhostButton title={tp('portal.common.see_all')} onPress={() => router.setParams({ history: '1' })} />
    </>}
    {tab === 'stamps' && <StampCard compact />}
    {tab === 'credit' && credit.data && <>
      <Text style={[fonts.figure, { color: C.text }]}>{formatMoney(credit.data.balance, credit.data.currency, language)}</Text>
      <Text style={[fonts.small, { color: C.text2 }]}>{tp('portal.credit.at_desk')}</Text>
      {credit.data.lines.map(line => <Text key={line.id} style={[fonts.body, { color: C.text2 }]}>{line.note ?? line.type} · {formatMoney(line.amount, line.currency, language)}</Text>)}
    </>}
    {!boot.isLoading && !tabs.length && <Empty icon="pulse-outline" text={tp('portal.activity.empty')} />}
    {!!tabs.length && <GhostButton title={tp('portal.help.how')} onPress={() => router.push('/programme')} />}
  </Sheet>
}
