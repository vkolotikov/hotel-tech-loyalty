import { useEffect, useState } from 'react'
import { Share, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { failureOf } from '../lib/failure'
import { forgetLook, KEYS, queryClient, useBoot } from '../lib/queries'
import { useSession } from '../lib/session'
import { feel } from '../lib/haptics'
import { useT } from '../lib/i18n'
import { C, fonts } from '../lib/theme'
import { applyMessageChange, counted, marketingNeedsEmail, messageBody, messageKinds, preferencesOf, smsSwitch, vocabKey, type ChannelField, type MessageChange } from '../shared/portal'
import type { MessageKind } from '../lib/types'
import { Field, GhostButton, GoldButton, Notice, Shimmer, Surface, Toggle } from '../components/ui'
import { Sheet } from '../components/Sheet'

/**
 * The member's own account, as the portal's profile: name and phone, which messages arrive and how (the portal's own
 * rules, saved one switch at a time), inviting a friend, the password, and deleting the account.
 */
export default function Profile() {
  const { tp } = useT()
  const boot = useBoot()
  const member = boot.data?.member
  return (
    <Sheet title={tp('portal.profile.title')}>
      {!member || !boot.data ? <View style={{ gap: 10 }}><Shimmer height={180} /><Shimmer height={260} /></View> : (
        <>
          <Details name={member.user.name} phone={member.user.phone ?? ''} email={member.user.email} />
          <Messages />
          {boot.data.capabilities.loyalty && <Invite />}
          <Password />
          <DeleteAccount />
        </>
      )}
    </Sheet>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={[fonts.label, { color: C.text2 }]}>{title}</Text>
      <Surface style={{ gap: 14 }}>{children}</Surface>
    </View>
  )
}

/** Name and phone; the email is the sign-in and is changed by the venue. Saving never touches the birthday. */
function Details({ name: initialName, phone: initialPhone, email }: { name: string; phone: string; email: string }) {
  const { tp } = useT()
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState(initialPhone)
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  useEffect(() => { setName(initialName); setPhone(initialPhone) }, [initialName, initialPhone])
  const save = useMutation({
    mutationFn: () => api.updateProfile({ name: name.trim(), phone: phone.trim() }),
    onSuccess: () => { feel.success(); setNote({ tone: 'success', text: tp('portal.common.saved') }); void queryClient.invalidateQueries({ queryKey: KEYS.boot }) },
    onError: error => setNote({ tone: 'danger', text: failureOf(error).message ?? tp('portal.profile.save_failed') }),
  })
  return (
    <Section title={tp('portal.profile.title')}>
      <Field label={tp('portal.profile.name')} value={name} onChangeText={setName} autoComplete="name" />
      <Field label={tp('portal.profile.email')} hint={tp('portal.profile.email_hint')} value={email} editable={false} />
      <Field label={tp('portal.profile.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
      {note && <Notice tone={note.tone} text={note.text} />}
      <GoldButton title={tp('portal.common.save')} icon="checkmark" busy={save.isPending} disabled={!name.trim()} onPress={() => save.mutate()} />
    </Section>
  )
}

/** Which kinds of message arrive, and by which channel — each switch saved on its own (the server merges it). */
function Messages() {
  const { tp } = useT()
  const boot = useBoot()
  const [failed, setFailed] = useState(false)
  const change = useMutation({
    mutationFn: (next: MessageChange) => api.updateProfile(messageBody(next)),
    onMutate: next => {
      setFailed(false)
      const before = queryClient.getQueryData(KEYS.boot)
      queryClient.setQueryData(KEYS.boot, applyMessageChange(boot.data, next))
      return { before }
    },
    onError: (_error, _next, context) => { setFailed(true); if (context?.before) queryClient.setQueryData(KEYS.boot, context.before) },
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
      <Toggle value={value} disabled={disabled} onChange={onChange} label={label} />
    </View>
  )
  const channel = (field: ChannelField, on: boolean) => change.mutate({ field, on })

  return (
    <>
      <Section title={tp('portal.profile.kinds_title')}>
        <Text style={[fonts.small, { color: C.text2 }]}>{tp('portal.profile.kinds_hint')}</Text>
        {messageKinds(data.capabilities).map((kind: MessageKind) => (
          <View key={kind}>{row(tp(`portal.profile.kind_${kind}`, { noun: tp(vocabKey(data.venue.industry, 'booking_plural')) }), tp(`portal.profile.kind_${kind}_hint`), prefs[kind], on => change.mutate({ kind, on }))}</View>
        ))}
      </Section>
      <Section title={tp('portal.profile.channels_title')}>
        {row(tp('portal.profile.push'), tp('portal.profile.push_hint'), member.push_notifications, on => channel('push_notifications', on))}
        {row(tp('portal.profile.email_messages', { venue }), tp('portal.profile.email_messages_hint'), member.email_notifications, on => channel('email_notifications', on))}
        {row(tp('portal.profile.marketing'), tp('portal.profile.marketing_hint'), member.marketing_consent, on => channel('marketing_consent', on))}
        {marketingNeedsEmail(member) && <Notice tone="warning" text={tp('portal.profile.marketing_needs_email', { venue })} />}
        {sms.show && row(tp('portal.profile.sms'), sms.needsPhone ? tp('portal.profile.sms_needs_phone') : tp('portal.profile.sms_hint', { phone: member.user.phone ?? '' }), sms.on, on => channel('sms_consent', on), sms.disabled)}
        <Text style={[fonts.small, { color: C.text3 }]}>{tp('portal.profile.service_messages')}</Text>
        {failed && <Notice text={tp('portal.profile.save_failed')} />}
      </Section>
    </>
  )
}

/** The member's referral link, shared from the phone, and how many friends joined. */
function Invite() {
  const { tp, language } = useT()
  const referral = useQuery({ queryKey: ['referral'], queryFn: api.referral })
  const link = referral.data?.referral_link
  return (
    <Section title={tp('portal.profile.invite_title')}>
      {referral.isLoading ? <Shimmer height={60} /> : !link ? <Text style={[fonts.small, { color: C.text2 }]}>{tp('portal.profile.invite_unavailable')}</Text> : (
        <>
          <Text style={[fonts.small, { color: C.text2 }]}>{tp('portal.profile.invite_body')}</Text>
          {referral.data?.referral_code ? <Text style={[styles.code, { color: C.goldLight }]} selectable>{referral.data.referral_code}</Text> : null}
          <GoldButton title={tp('portal.profile.invite_share')} icon="share-social" onPress={() => { void Share.share({ message: link, url: link }) }} />
          <Text style={[fonts.small, { color: C.text3 }]}>{counted(tp, 'profile.invite_stats', referral.data?.total_referrals ?? 0, language)}</Text>
        </>
      )}
    </Section>
  )
}

/** Changing the password signs the member's other devices out (the server's rule). */
function Password() {
  const { tp } = useT()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const change = useMutation({
    mutationFn: () => api.changePassword({ current_password: current, password: next, password_confirmation: confirm }),
    onSuccess: () => { feel.success(); setNote({ tone: 'success', text: tp('portal.profile.password_changed') }); setCurrent(''); setNext(''); setConfirm('') },
    onError: error => setNote({ tone: 'danger', text: failureOf(error).message ?? tp('portal.profile.password_failed') }),
  })
  const submit = () => {
    if (next !== confirm) return setNote({ tone: 'danger', text: tp('portal.profile.password_mismatch') })
    change.mutate()
  }
  return (
    <Section title={tp('portal.profile.password_title')}>
      <Field label={tp('portal.profile.password_current')} value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
      <Field label={tp('portal.profile.password_new')} hint={tp('portal.profile.password_hint')} value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" />
      <Field label={tp('portal.profile.password_confirm')} value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" />
      {note && <Notice tone={note.tone} text={note.text} />}
      <GhostButton title={tp('portal.profile.password_change')} icon="key-outline" disabled={!current || next.length < 8 || change.isPending} onPress={submit} />
    </Section>
  )
}

/** Deleting the account (the stores require it in the app): the password and the word DELETE, as the server asks. */
function DeleteAccount() {
  const { tp } = useT()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const remove = useMutation({
    mutationFn: () => api.deleteAccount({ password, confirmation }),
    onSuccess: async () => {
      await useSession.getState().signOut()
      queryClient.clear()
      await forgetLook()
      router.replace('/sign-in')
    },
    onError: error => setProblem(failureOf(error).message ?? tp('portal.profile.delete_failed')),
  })
  return (
    <Section title={tp('portal.profile.delete_title')}>
      <Text style={[fonts.small, { color: C.text2 }]}>{tp('portal.profile.delete_body')}</Text>
      <Field label={tp('portal.profile.delete_password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
      <Field label={tp('portal.profile.delete_confirm_label')} value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" autoCorrect={false} />
      {problem && <Notice text={problem} />}
      <GhostButton title={tp('portal.profile.delete_button')} icon="trash-outline" tone={C.danger} disabled={!password || confirmation !== 'DELETE' || remove.isPending} onPress={() => remove.mutate()} />
    </Section>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  code: { fontFamily: 'Inter_700Bold', fontSize: 20, letterSpacing: 2 },
})
