import { useMemo, useState } from 'react'
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useBoot } from '../lib/queries'
import { appRoute } from '../lib/format'
import { useT } from '../lib/i18n'
import { C, RADIUS, fonts } from '../lib/theme'
import { STEPS, narrow, questionWords, questionsFor, showsSteps, stepWords, topicWord, topicsFor, type QuestionId, type TopicId } from '../shared/portal'
import { GhostButton, Press, SearchField, Shimmer, Surface } from '../components/ui'
import { Sheet } from '../components/Sheet'

const STEP_ICON = { card: 'qr-code', earn: 'add-circle', spend: 'gift' } as const

/**
 * Help, as the portal's: how the programme works in three steps, the questions this member's venue has answers for
 * (searchable, by topic, in the member's language), and the venue's own contact. Answers that are done somewhere open it.
 */
export default function Help() {
  const { tp } = useT()
  const boot = useBoot()
  const [query, setQuery] = useState('')
  const [topic, setTopic] = useState<TopicId | 'all'>('all')
  const [open, setOpen] = useState<QuestionId | null>(null)
  const data = boot.data
  const say = (key: string, fallback: string) => tp(key, fallback)

  const questions = useMemo(() => (data ? questionsFor(data) : []), [data])
  const topics = useMemo(() => topicsFor(questions), [questions])
  const shown = data ? narrow(query, topic, questions, say) : []

  return (
    <Sheet title={tp('portal.help.title')} line={tp('portal.help.line')}>
      {!data ? <View style={{ gap: 10 }}><Shimmer height={120} /><Shimmer height={200} /></View> : (
        <>
          {showsSteps(data) && (
            <View style={{ gap: 10 }}>
              <Text style={[fonts.label, { color: C.text2 }]}>{tp('portal.help.how')}</Text>
              {STEPS.map((step, i) => {
                const words = stepWords(step.id, say)
                const route = appRoute(step.to)
                return (
                  <Press key={step.id} onPress={() => { if (route) router.navigate(route) }}>
                    <Surface style={styles.step}>
                      <View style={[styles.stepMark, { backgroundColor: C.goldWash, borderColor: C.goldEdge }]}>
                        <Ionicons name={STEP_ICON[step.id]} size={18} color={C.gold} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[fonts.bodyStrong, { color: C.text }]}>{i + 1}. {words.title}</Text>
                        <Text style={[fonts.small, { color: C.text2 }]}>{words.line}</Text>
                      </View>
                    </Surface>
                  </Press>
                )
              })}
            </View>
          )}

          <View style={{ gap: 10 }}>
            <Text style={[fonts.label, { color: C.text2 }]}>{tp('portal.help.questions')}</Text>
            <SearchField value={query} onChangeText={setQuery} placeholder={tp('portal.help.search')} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {(['all', ...topics] as (TopicId | 'all')[]).map(id => {
                const on = topic === id
                return (
                  <Press key={id} onPress={() => setTopic(id)} style={[styles.chip, on && { backgroundColor: C.goldWash, borderColor: C.goldEdge }]}>
                    <Text style={[fonts.smallStrong, { color: on ? C.gold : C.text2 }]}>{id === 'all' ? tp('portal.help.all') : topicWord(id, say)}</Text>
                  </Press>
                )
              })}
            </ScrollView>
            {shown.length === 0 && <Text style={[fonts.body, { color: C.text2, paddingVertical: 12 }]}>{tp('portal.help.nothing')}</Text>}
            <Surface padding={0} style={{ paddingHorizontal: 16 }}>
              {shown.map((id, i) => {
                const words = questionWords(id, say)
                const isOpen = open === id
                const route = appRoute(questions.find(q => q.id === id)?.to)
                return (
                  <View key={id} style={[styles.question, i < shown.length - 1 && styles.divider]}>
                    <Press onPress={() => setOpen(isOpen ? null : id)} style={styles.questionHead} label={words.q}>
                      <Text style={[fonts.bodyStrong, { color: C.text, flex: 1 }]}>{words.q}</Text>
                      <Ionicons name={isOpen ? 'remove' : 'add'} size={18} color={C.gold} />
                    </Press>
                    {isOpen && (
                      <View style={{ gap: 10 }}>
                        <Text style={[fonts.body, { color: C.text2 }]}>{words.a}</Text>
                        {route && (
                          <Press onPress={() => router.navigate(route)} style={styles.openLink}>
                            <Text style={[fonts.smallStrong, { color: C.gold }]}>{tp('portal.help.open')}</Text>
                            <Ionicons name="arrow-forward" size={14} color={C.gold} />
                          </Press>
                        )}
                      </View>
                    )}
                  </View>
                )
              })}
            </Surface>
          </View>

          {(data.venue.contact.email || data.venue.contact.phone) && (
            <Surface style={{ gap: 12 }}>
              <Text style={[fonts.heading, { color: C.text }]}>{tp('portal.help.contact')}</Text>
              <Text style={[fonts.small, { color: C.text2 }]}>{tp('portal.help.contact_line', { venue: data.venue.name })}</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {data.venue.contact.email && (
                  <GhostButton title={tp('portal.help.email')} icon="mail-outline" onPress={() => { void Linking.openURL(`mailto:${data.venue.contact.email}`) }} style={{ flex: 1 }} />
                )}
                {data.venue.contact.phone && (
                  <GhostButton title={tp('portal.help.call')} icon="call-outline" onPress={() => { void Linking.openURL(`tel:${data.venue.contact.phone}`) }} style={{ flex: 1 }} />
                )}
              </View>
            </Surface>
          )}
        </>
      )}
    </Sheet>
  )
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepMark: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.hairlineStrong, backgroundColor: C.surface },
  question: { paddingVertical: 14, gap: 10 },
  questionHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  divider: { borderBottomWidth: 1, borderBottomColor: C.hairline },
  openLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
})
