import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { Ionicons } from '@expo/vector-icons'
import { api } from '../../lib/api'
import { serverCodeOf } from '../../lib/failure'
import { useT } from '../../lib/i18n'
import { C, fonts } from '../../lib/theme'
import {
  addDays, bookErrorFallback, bookErrorKey, counted, formatDay, formatMoney, mastersFor, resolveLocale, venueToday, visibleDay,
  type Catalogue, type CatalogueRules, type CatalogueService,
} from '../../shared/portal'
import { Empty, GhostButton, Notice, Press, Shimmer, Surface } from '../ui'
import { Choice } from './parts'

/** The member's own catalogue: grouped by category, the member price beside the list price (the portal's ServiceStep). */
export function ServiceStep({ catalogue, onPick }: { catalogue: Catalogue; onPick: (serviceId: number) => void }) {
  const { tp } = useT()
  const groups = catalogue.categories
    .map(c => ({ id: c.id, name: c.name, services: catalogue.services.filter(s => s.category_id === c.id) }))
    .filter(g => g.services.length)
  const orphans = catalogue.services.filter(s => !catalogue.categories.some(c => c.id === s.category_id))
  if (orphans.length) groups.push({ id: 0, name: '', services: orphans })
  return (
    <View style={{ gap: 16 }}>
      <Text style={[fonts.heading, { color: C.text }]}>{tp('portal.book.heading_service')}</Text>
      {catalogue.pricing.automatic && (
        <View style={[styles.note, { backgroundColor: C.goldWash, borderColor: C.goldEdge }]}>
          <Ionicons name="ribbon-outline" size={16} color={C.gold} />
          <Text style={[fonts.smallStrong, { color: C.goldLight, flex: 1 }]}>{tp('portal.book.member_price_note', { label: catalogue.pricing.automatic.label })}</Text>
        </View>
      )}
      {groups.map(g => (
        <View key={g.id} style={{ gap: 10 }}>
          {g.name ? <Text style={[fonts.label, { color: C.text2 }]}>{g.name}</Text> : null}
          {g.services.map(s => <ServiceCard key={s.id} service={s} currency={s.currency ?? catalogue.rules.currency} onPick={onPick} />)}
        </View>
      ))}
    </View>
  )
}

function ServiceCard({ service: s, currency, onPick }: { service: CatalogueService; currency: string; onPick: (id: number) => void }) {
  const { tp, language } = useT()
  const discounted = s.member_price < s.price
  return (
    <Press onPress={() => onPick(s.id)} label={s.name}>
      <Surface style={styles.card}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[fonts.bodyStrong, { color: C.text }]}>{s.name}</Text>
          {s.short_description ? <Text style={[fonts.small, { color: C.text2 }]}>{s.short_description}</Text> : null}
          <View style={styles.meta}>
            <Ionicons name="time-outline" size={14} color={C.text3} />
            <Text style={[fonts.small, { color: C.text3 }]}>{tp('portal.book.duration', { count: s.duration_minutes })}</Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          {discounted && <Text style={[fonts.small, { color: C.text3, textDecorationLine: 'line-through' }]} accessibilityLabel={tp('portal.book.list_price')}>{formatMoney(s.price, currency, language)}</Text>}
          <Text style={[fonts.number, { color: C.goldLight }]} accessibilityLabel={discounted ? tp('portal.book.your_price') : undefined}>{formatMoney(s.member_price, currency, language)}</Text>
        </View>
      </Surface>
    </Press>
  )
}

/** Who the member wants, or anyone available (the portal's StaffStep). */
export function StaffStep({ catalogue, serviceId, value, onPick }: { catalogue: Catalogue; serviceId: number | null; value: number | null; onPick: (masterId: number | null) => void }) {
  const { tp } = useT()
  const options = [{ id: null as number | null, name: tp('portal.book.any_staff'), title: null as string | null }, ...mastersFor(catalogue, serviceId)]
  return (
    <View style={{ gap: 10 }}>
      <Text style={[fonts.heading, { color: C.text }]}>{tp('portal.book.choose_staff')}</Text>
      {options.map(m => (
        <Choice key={String(m.id)} picked={value === m.id} onPress={() => onPick(m.id)} label={m.name}>
          <View style={styles.person}>
            <Ionicons name={m.id === null ? 'people-outline' : 'person-outline'} size={18} color={value === m.id ? C.onGold : C.gold} />
            <View style={{ flex: 1 }}>
              <Text style={[fonts.bodyStrong, { color: value === m.id ? C.onGold : C.text }]}>{m.name}</Text>
              {m.title ? <Text style={[fonts.small, { color: value === m.id ? C.onGold : C.text2 }]}>{m.title}</Text> : null}
            </View>
          </View>
        </Choice>
      ))}
    </View>
  )
}

/**
 * A seven-day strip on the venue's own calendar and the scheduler's times for the chosen day; times are the venue's own
 * labels, read as written (the portal's WhenStep).
 */
export function WhenStep({ serviceId, masterId, rules, value, onPick, timezone }: { serviceId: number; masterId: number | null; rules: CatalogueRules; value: string | null; onPick: (startAt: string) => void; timezone: string }) {
  const { tp, language } = useT()
  const today = venueToday(timezone)
  const [selected, setSelected] = useState(today)
  const [from, setFrom] = useState(today)
  const to = addDays(from, 6)
  const last = addDays(today, rules.max_advance_days)
  const calendar = useQuery({ queryKey: ['book', 'calendar', serviceId, masterId, from, to], queryFn: () => api.calendar(serviceId, masterId, from, to), retryOnMount: false })
  const available = new Set(calendar.data?.available_dates ?? [])
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))
  const shown = visibleDay(selected, days, new Set(days.filter(d => available.has(d) && d <= last)))
  const slots = useQuery({ queryKey: ['book', 'slots', serviceId, masterId, shown], queryFn: () => api.availability(serviceId, masterId, shown as string), enabled: shown !== null, retryOnMount: false })
  const locale = resolveLocale(language)
  const sameMonth = from.slice(0, 7) === to.slice(0, 7)
  const range = `${formatDay(from, locale, sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' })} – ${formatDay(to, locale, { day: 'numeric', month: 'short' })}`
  const slotsKey = slots.isError ? bookErrorKey(serverCodeOf(slots.error)) : null
  const slotsError = slotsKey === 'portal.book.too_far_ahead' ? tp(slotsKey, bookErrorFallback('too_far_ahead')) : tp('portal.common.error')

  return (
    <View style={{ gap: 14 }}>
      <Text style={[fonts.heading, { color: C.text }]}>{tp('portal.book.heading_when')}</Text>
      <View style={styles.rangeRow}>
        <Text style={[fonts.bodyStrong, { color: C.text, flex: 1 }]}>{range}</Text>
        <Press onPress={() => setFrom(addDays(from, -7) < today ? today : addDays(from, -7))} disabled={from <= today} label={tp('portal.common.previous')}>
          <View style={[styles.arrow, from <= today && { opacity: 0.35 }]}><Ionicons name="chevron-back" size={18} color={C.text} /></View>
        </Press>
        <Press onPress={() => setFrom(addDays(from, 7))} disabled={to >= last} label={tp('portal.common.next')}>
          <View style={[styles.arrow, to >= last && { opacity: 0.35 }]}><Ionicons name="chevron-forward" size={18} color={C.text} /></View>
        </Press>
      </View>
      {calendar.isError ? (
        <Notice text={tp('portal.common.error')} action={tp('portal.common.retry')} onAction={() => { void calendar.refetch() }} />
      ) : (
        <View style={styles.days}>
          {days.map(d => {
            const ok = available.has(d) && d <= last
            const on = d === shown
            return (
              <Choice key={d} picked={on} disabled={!ok} onPress={() => setSelected(d)} label={formatDay(d, locale)} style={{ flex: 1 }} compact>
                <View style={{ alignItems: 'center' }}>
                  <Text style={[fonts.small, { fontSize: 11, color: on ? C.onGold : C.text2 }]}>{formatDay(d, locale, { weekday: 'short' })}</Text>
                  <Text style={[fonts.bodyStrong, { color: on ? C.onGold : C.text }]}>{d.slice(8, 10)}</Text>
                </View>
              </Choice>
            )
          })}
        </View>
      )}
      {(calendar.isPending || (shown !== null && slots.isPending)) && <Shimmer height={96} />}
      {slots.isError && <Notice text={slotsError} action={tp('portal.common.retry')} onAction={() => { void slots.refetch() }} />}
      {slots.isSuccess && slots.data.slots.length === 0 && <Empty icon="time-outline" text={tp('portal.book.no_slots')} />}
      {slots.isSuccess && slots.data.slots.length > 0 && (
        <View style={styles.slots}>
          {slots.data.slots.map(s => (
            <Choice key={s.start} picked={value === s.start} onPress={() => onPick(s.start)} label={s.time_label} style={styles.slot}>
              <Text style={[fonts.bodyStrong, { color: value === s.start ? C.onGold : C.text, textAlign: 'center' }]}>{s.time_label}</Text>
            </Choice>
          ))}
        </View>
      )}
      {calendar.isSuccess && available.size === 0 && <Empty icon="calendar-outline" text={counted(tp, 'book.no_days', rules.max_advance_days, language)} />}
      <Text style={[fonts.small, { color: C.text3 }]}>{tp('portal.book.lead_note')}</Text>
    </View>
  )
}

/** The quote never decides by itself where a failed confirm sends the member; this only words the notice (BookNotice). */
export function BookNotice({ code }: { code: string | null }) {
  const { tp } = useT()
  if (code === null) return null
  return <Notice tone="warning" text={tp(bookErrorKey(code), bookErrorFallback(code))} />
}

/** A short "go back and change" link for the Review step's summary. */
export function ChangeLink({ onPress }: { onPress: () => void }) {
  const { tp } = useT()
  return <GhostButton title={tp('portal.book.change')} onPress={onPress} style={{ alignSelf: 'flex-start' }} />
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  arrow: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: C.hairlineStrong, alignItems: 'center', justifyContent: 'center' },
  days: { flexDirection: 'row', gap: 4 },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { width: '31%' },
})
