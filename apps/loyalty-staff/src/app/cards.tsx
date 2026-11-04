import { useQuery } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { Text } from 'react-native'
import { api } from '../lib/api'
import { KEYS } from '../lib/queries'
import { useT } from '../lib/i18n'
import { day } from '../lib/format'
import { C, fonts } from '../lib/theme'
import { Sheet } from '../components/Sheet'
import { MemberSummary } from '../components/MemberCard'
import { Empty, GoldButton, Notice, Pill, Shimmer, Surface } from '../components/ui'
import { Glyph } from '../components/Glyph'

export default function Cards() {
  const { id: raw } = useLocalSearchParams<{ id: string }>()
  const id = Number(raw)
  const { t, language } = useT()
  const detail = useQuery({ queryKey: KEYS.member(id), queryFn: () => api.member(id), enabled: id > 0 })
  const cards = useQuery({ queryKey: KEYS.cards(id), queryFn: () => api.cards(id), enabled: id > 0 })
  return <Sheet title={t('member.cards')} footer={detail.data && !detail.data.member.is_erased ? <GoldButton title={t('member.linkCard')} icon="add" onPress={() => router.push({ pathname: '/link-card', params: { id: String(id) } })} /> : undefined}>
    {detail.data && <MemberSummary member={detail.data.member} />}
    {cards.isPending && <Shimmer height={180} />}
    {cards.isError && <Notice text={t('error.unknown')} action={t('common.retry')} onAction={() => { void cards.refetch() }} />}
    {cards.isSuccess && !cards.data.cards.length && <Empty icon="card-outline" text={t('member.noCards')} />}
    {cards.data?.cards.map(card => <Surface key={card.id} style={{ gap: 16, padding: 20 }}>
      <Glyph name="card-outline" size={42} color={C.gold} />
      <Text selectable style={[fonts.heading, { color: C.text }]}>{card.uid}</Text>
      {card.linked_at && <Text style={[fonts.small, { color: C.text2 }]}>{day(card.linked_at, language)}</Text>}
      <Pill text={t(card.is_active ? 'card.state.active' : 'card.state.off')} color={card.is_active ? C.success : C.text2} />
    </Surface>)}
  </Sheet>
}
