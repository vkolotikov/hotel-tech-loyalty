import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useMutation } from '@tanstack/react-query'
import { api } from '../lib/api'
import { KEYS, queryClient, useBoot } from '../lib/queries'
import { useSession } from '../lib/session'
import { useT } from '../lib/i18n'
import { C, fonts } from '../lib/theme'
import { applyMessageChange, marketingNeedsEmail, messageBody, messageKinds, preferencesOf, smsSwitch, vocabKey, type ChannelField, type MessageChange } from '../shared/portal'
import type { MessageKind, PortalBootstrap } from '../lib/types'
import { Notice, Row, Surface, Toggle } from './ui'
import { MemberIcon } from './MemberIcon'
import { singleFlight } from '../lib/loyalty'
import { notify } from './Feedback'
/** Which kinds of message arrive, and by which channel — each switch saved on its own (the server merges it). */
export function Messages() {
  const { t, tp } = useT()
  const boot = useBoot()
  const [failed, setFailed] = useState(false)
  const [run] = useState(singleFlight)
  const [channels, setChannels] = useState(false)
  const change = useMutation({
    mutationFn: (next: MessageChange) => api.updateProfile(messageBody(next)),
    onMutate: async next => {
      setFailed(false)
      await queryClient.cancelQueries({ queryKey: KEYS.boot })
      const before = queryClient.getQueryData<PortalBootstrap>(KEYS.boot)
      queryClient.setQueryData(KEYS.boot, applyMessageChange(before, next))
      return { before, owner: useSession.getState().token }
    },
    onError: (_error, _next, context) => { setFailed(true); if (context?.before && context.owner === useSession.getState().token) queryClient.setQueryData(KEYS.boot, context.before) },
    onSuccess: (_answer, _next, context) => { if (context?.owner === useSession.getState().token) { notify(tp('portal.common.saved')); void queryClient.invalidateQueries({ queryKey: KEYS.boot }) } },
  })
  const data = boot.data
  const member = data?.member
  if (!data || !member) return null
  const prefs = preferencesOf(member)
  const sms = smsSwitch(member)
  const venue = data.venue.name

  const row = (label: string, hint: string | null, value: boolean, onChange: (on: boolean) => void, disabled = false) => (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[fonts.bodyStrong, { color: C.text }]}>{label}</Text>
        {hint ? <Text style={[fonts.small, { color: C.text2 }]}>{hint}</Text> : null}
      </View>
      <Toggle value={value} disabled={disabled || change.isPending} onChange={onChange} label={label} />
    </View>
  )
  const write = (next: MessageChange) => { void run(() => change.mutateAsync(next)).catch(() => {}) }
  const channel = (field: ChannelField, on: boolean) => write({ field, on })

  return (
    <>
      <Section title={tp('portal.profile.kinds_title')}>
        {messageKinds({ loyalty: data.capabilities.loyalty || member.membership_mode === 'assigned' }).filter(kind => kind !== 'stays' && (data.capabilities.loyalty || kind === 'tier')).map((kind: MessageKind) => (
          <View key={kind}>{row(tp(`portal.profile.kind_${kind}`, { noun: tp(vocabKey(data.venue.industry, 'booking_plural')) }), null, prefs[kind], on => write({ kind, on }))}</View>
        ))}
      </Section>
      <Text style={[fonts.small, { color: C.text3 }]}>{t('preferences.essential')}</Text>
      <Surface padding={0} style={{ paddingHorizontal: 16 }}><Row title={tp('portal.profile.channels_title')} left={<MemberIcon name="mail" />} onPress={() => setChannels(!channels)} last /></Surface>
      {channels && <Section title={tp('portal.profile.channels_title')}>
        {row(tp('portal.profile.push'), tp('portal.profile.push_hint'), member.push_notifications, on => channel('push_notifications', on))}
        {row(tp('portal.profile.email_messages', { venue }), tp('portal.profile.email_messages_hint'), member.email_notifications, on => channel('email_notifications', on))}
        {row(tp('portal.profile.marketing'), tp('portal.profile.marketing_hint'), member.marketing_consent, on => channel('marketing_consent', on))}
        {marketingNeedsEmail(member) && <Notice tone="warning" text={tp('portal.profile.marketing_needs_email', { venue })} />}
        {sms.show && row(tp('portal.profile.sms'), sms.needsPhone ? tp('portal.profile.sms_needs_phone') : tp('portal.profile.sms_hint', { phone: member.user.phone ?? '' }), sms.on, on => channel('sms_consent', on), sms.disabled)}
        {failed && <Notice text={tp('portal.profile.save_failed')} />}
      </Section>}
      {failed && !channels && <Notice text={tp('portal.profile.save_failed')} />}
    </>
  )
}


function Section({title,children}:{title:string;children:React.ReactNode}) {
  return <View style={{gap:10}}><Text style={[fonts.label,{color:C.text2}]}>{title}</Text><Surface style={{gap:14}}>{children}</Surface></View>
}
const styles=StyleSheet.create({row:{flexDirection:'row',alignItems:'center',gap:12}})
