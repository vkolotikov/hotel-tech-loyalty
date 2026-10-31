import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { failureOf } from '../lib/failure'
import { feel } from '../lib/haptics'
import { queryClient } from '../lib/queries'
import { useT } from '../lib/i18n'
import { C, fonts } from '../lib/theme'
import { actionOf, dateBlock, errorPhrase, eventCounted, noteOf, pastEvents, whenPhrase, whyPhrase } from '../shared/portal'
import type { PortalEvent } from '../lib/types'
import { Empty, GhostButton, GoldButton, Notice, Pill, Shimmer, Surface } from '../components/ui'
import { Sheet } from '../components/Sheet'

/**
 * The venue's events, as the portal's: what is coming up, signing up and cancelling (the server decides who may, and
 * says why not), and the events the member came to. Times are the venue's wall clock, read as written.
 */
export default function Events() {
  const { tp, language } = useT()
  const events = useQuery({ queryKey: ['events'], queryFn: api.events })
  const [problem, setProblem] = useState<string | null>(null)

  const done = () => { void queryClient.invalidateQueries({ queryKey: ['events'] }); void queryClient.invalidateQueries({ queryKey: ['boot'] }) }
  const signUp = useMutation({
    mutationFn: (id: number) => api.eventSignUp(id),
    onMutate: () => setProblem(null),
    onSuccess: () => { feel.success(); done() },
    onError: error => { feel.warning(); const p = errorPhrase(failureOf(error).code); setProblem(tp(p.key, p.fallback, p.options)); done() },
  })
  const cancel = useMutation({
    mutationFn: (id: number) => api.eventCancel(id),
    onMutate: () => setProblem(null),
    onSuccess: () => done(),
    onError: error => { const p = errorPhrase(failureOf(error).code); setProblem(tp(p.key, p.fallback, p.options)); done() },
  })

  const data = events.data
  const attended = data ? pastEvents(data) : []
  return (
    <Sheet title={tp('portal.events.title')}>
      {problem && <Notice text={problem} />}
      {events.isLoading && <View style={{ gap: 10 }}><Shimmer height={140} /><Shimmer height={140} /></View>}
      {events.isError && <Notice text={tp('portal.events.load_failed')} action={tp('portal.common.retry')} onAction={() => { void events.refetch() }} />}
      {data && data.upcoming.length === 0 && (
        <View style={{ gap: 6 }}>
          <Empty icon="ticket-outline" text={tp('portal.events.none')} />
          <Text style={[fonts.small, { color: C.text2, textAlign: 'center' }]}>{tp('portal.events.none_body')}</Text>
        </View>
      )}
      {data && data.upcoming.length > 0 && <Text style={[fonts.label, { color: C.text2 }]}>{tp('portal.events.coming_up')}</Text>}
      {data?.upcoming.map((event: PortalEvent) => (
        <EventCard
          key={event.id}
          event={event}
          busy={(signUp.isPending && signUp.variables === event.id) || (cancel.isPending && cancel.variables === event.id)}
          onSignUp={() => signUp.mutate(event.id)}
          onCancel={() => cancel.mutate(event.id)}
          language={language}
        />
      ))}
      {attended.length > 0 && <Text style={[fonts.label, { color: C.text2 }]}>{tp('portal.events.attended')}</Text>}
      {attended.map(event => {
        const when = dateBlock(event.starts_at, language)
        const points = event.points > 0 ? eventCounted('points', event.points, language) : null
        return (
          <Surface key={`a${event.id}`} style={styles.row}>
            <Text style={[fonts.small, { color: C.text2, width: 70 }]}>{when.day} {when.month}</Text>
            <Text style={[fonts.bodyStrong, { color: C.text, flex: 1 }]} numberOfLines={1}>{event.title}</Text>
            {points && <Text style={[fonts.smallStrong, { color: C.success }]}>{tp(points.key, points.fallback, points.options)}</Text>}
          </Surface>
        )
      })}
    </Sheet>
  )
}

function EventCard({ event, busy, onSignUp, onCancel, language }: { event: PortalEvent; busy: boolean; onSignUp: () => void; onCancel: () => void; language: string }) {
  const { tp } = useT()
  const action = actionOf(event)
  const when = whenPhrase(event, language)
  const date = dateBlock(event.starts_at, language)
  const note = noteOf(event, language)
  const points = event.points > 0 ? eventCounted('points', event.points, language) : null
  return (
    <Surface style={{ gap: 12 }}>
      <View style={styles.row}>
        <View style={[styles.date, { backgroundColor: C.goldWash, borderColor: C.goldEdge }]}>
          <Text style={[fonts.label, { color: C.gold, fontSize: 9 }]}>{date.weekday}</Text>
          <Text style={[fonts.number, { color: C.text }]}>{date.day}</Text>
          <Text style={[fonts.small, { color: C.text2, fontSize: 11 }]}>{date.month}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[fonts.bodyStrong, { color: C.text }]}>{event.title}</Text>
          <Text style={[fonts.small, { color: C.text2 }]}>{tp(when.key, when.fallback, when.options)}</Text>
          {event.where ? <Text style={[fonts.small, { color: C.text3 }]}>{event.where}</Text> : null}
        </View>
        {points && <Pill text={tp(points.key, points.fallback, points.options)} color={C.success} />}
      </View>
      {event.description ? <Text style={[fonts.small, { color: C.text2 }]}>{event.description}</Text> : null}
      {action.kind === 'sign_up' && <GoldButton title={tp('portal.events.sign_up')} icon="ticket" busy={busy} onPress={onSignUp} />}
      {action.kind === 'signed_up' && (
        <View style={{ gap: 8 }}>
          <Notice tone="success" text={tp('portal.events.signed_up')} />
          {action.canCancel && <GhostButton title={tp('portal.events.cancel_sign_up')} disabled={busy} onPress={onCancel} />}
        </View>
      )}
      {action.kind === 'checked_in' && <Notice tone="success" text={tp('portal.events.checked_in')} />}
      {action.kind === 'come_along' && <Text style={[fonts.smallStrong, { color: C.text2 }]}>{tp('portal.events.come_along')}</Text>}
      {action.kind === 'full' && <Text style={[fonts.smallStrong, { color: C.text2 }]}>{tp('portal.events.full')}</Text>}
      {action.kind === 'why_not' && (() => { const why = whyPhrase(action.code); return <Text style={[fonts.smallStrong, { color: C.warning }]}>{tp(why.key, why.fallback, why.options)}</Text> })()}
      {note && <Text style={[fonts.small, { color: C.text3 }]}>{tp(note.key, note.fallback, note.options)}</Text>}
    </Surface>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  date: { width: 58, paddingVertical: 8, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
})
