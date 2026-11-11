import { useState } from 'react'
import { Text, View } from 'react-native'
import { router } from 'expo-router'
import { useIsMutating, useMutation } from '@tanstack/react-query'
import { api } from '../lib/api'
import { failureOf } from '../lib/failure'
import { forgetLook, KEYS, queryClient, useBoot } from '../lib/queries'
import { useSession } from '../lib/session'
import { feel } from '../lib/haptics'
import { useT } from '../lib/i18n'
import { C, fonts } from '../lib/theme'
import type { PortalBootstrap } from '../lib/types'
import { Field, GhostButton, GoldButton, Notice, Row, Shimmer, Surface } from '../components/ui'
import { Sheet } from '../components/Sheet'
import { profileSaved, profileUpdate, singleFlight } from '../lib/loyalty'
import { ActionPopup } from '../components/ActionPopup'
import { MemberIcon } from '../components/MemberIcon'
import { notify } from '../components/Feedback'

/**
 * The member's own account, as the portal's profile: name and phone, which messages arrive and how (the portal's own
 * rules, saved one switch at a time), inviting a friend, the password, and deleting the account.
 */
export default function Profile() {
  const { tp } = useT()
  const boot = useBoot()
  const member = boot.data?.member
  const [panel, setPanel] = useState<'password' | 'delete' | null>(null)
  const busy = useIsMutating({ mutationKey: ['member-account'] }) > 0
  return (
    <Sheet title={tp('portal.profile.title')} busy={busy}>
      {!member || !boot.data ? <View style={{ gap: 10 }}><Shimmer height={180} /><Shimmer height={260} /></View> : (
        <>
          <Details key={member.user.id} userId={member.user.id} name={member.user.name} phone={member.user.phone ?? ''} email={member.user.email} birthday={member.user.date_of_birth?.slice(0, 10) ?? ''} />
          <Surface padding={0} style={{ paddingHorizontal: 16 }}>
            <Row left={<MemberIcon name="lock" />} title={tp('portal.profile.password_title')} onPress={() => { if (!busy) setPanel('password') }} />
            <Row left={<MemberIcon name="alert" color={C.danger} />} title={tp('portal.profile.delete_title')} onPress={() => { if (!busy) setPanel('delete') }} last />
          </Surface>
          <ActionPopup visible={!!panel} title={tp(panel === 'password' ? 'portal.profile.password_title' : 'portal.profile.delete_title')} kind={panel === 'delete' ? 'sheet' : 'popup'} busy={busy} onClose={() => setPanel(null)}>
            {panel === 'password' ? <Password onDone={() => setPanel(null)} /> : <DeleteAccount />}
          </ActionPopup>
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

/** Account details; an untouched birthday is omitted from the write. */
function Details({ userId, name: initialName, phone: initialPhone, email, birthday: initialBirthday }: { userId: number; name: string; phone: string; email: string; birthday: string }) {
  const { tp } = useT()
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState(initialPhone)
  const [birthdayDraft, setBirthday] = useState<string | null>(null)
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [run] = useState(singleFlight)
  const save = useMutation({
    mutationKey: ['member-account'],
    onMutate: () => ({ owner: useSession.getState().token }),
    mutationFn: (submitted: ReturnType<typeof profileUpdate>) => api.updateProfile(submitted),
    onSuccess: (answer, submitted, context) => {
      if (context?.owner !== useSession.getState().token) return
      queryClient.setQueryData<PortalBootstrap>(KEYS.boot, before => profileSaved(before, userId, answer.user, submitted))
      setBirthday(null)
      feel.success(); setNote(null); notify(tp('portal.common.saved'))
      void queryClient.invalidateQueries({ queryKey: KEYS.boot })
    },
    onError: error => setNote({ tone: 'danger', text: failureOf(error).message ?? tp('portal.profile.save_failed') }),
  })
  return (
    <Section title={tp('portal.profile.title')}>
      <Field label={tp('portal.profile.name')} value={name} onChangeText={setName} autoComplete="name" editable={!save.isPending} />
      <Field label={tp('portal.profile.email')} hint={tp('portal.profile.email_hint')} value={email} editable={false} />
      <Field label={tp('portal.profile.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" editable={!save.isPending} />
      <Field label={tp('portal.profile.birthday')} hint="YYYY-MM-DD" value={birthdayDraft ?? initialBirthday} onChangeText={setBirthday} placeholder="YYYY-MM-DD" autoCorrect={false} autoCapitalize="none" maxLength={10} editable={!save.isPending} />
      {note && <Notice tone={note.tone} text={note.text} />}
      <GoldButton title={tp('portal.common.save')} busy={save.isPending} disabled={!name.trim()} onPress={() => { void run(() => save.mutateAsync(profileUpdate(name, phone, birthdayDraft))).catch(() => {}) }} />
    </Section>
  )
}

/** Changing the password signs the member's other devices out (the server's rule). */
function Password({ onDone }: { onDone: () => void }) {
  const { tp } = useT()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [note, setNote] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [run] = useState(singleFlight)
  const change = useMutation({
    mutationKey: ['member-account'],
    onMutate: () => ({ owner: useSession.getState().token }),
    mutationFn: () => api.changePassword({ current_password: current, password: next, password_confirmation: confirm }),
    onSuccess: (_answer, _variables, context) => { if (context?.owner !== useSession.getState().token) return; feel.success(); notify(tp('portal.profile.password_changed')); setCurrent(''); setNext(''); setConfirm(''); onDone() },
    onError: error => setNote({ tone: 'danger', text: failureOf(error).message ?? tp('portal.profile.password_failed') }),
  })
  const submit = () => {
    if (next !== confirm) return setNote({ tone: 'danger', text: tp('portal.profile.password_mismatch') })
    void run(() => change.mutateAsync()).catch(() => {})
  }
  return (
    <View style={{ gap: 14 }}>
      <Field label={tp('portal.profile.password_current')} value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
      <Field label={tp('portal.profile.password_new')} hint={tp('portal.profile.password_hint')} value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" />
      <Field label={tp('portal.profile.password_confirm')} value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" />
      {note && <Notice tone={note.tone} text={note.text} />}
      <GoldButton title={tp('portal.profile.password_change')} busy={change.isPending} disabled={!current || next.length < 8} onPress={submit} />
    </View>
  )
}

/** Deleting the account (the stores require it in the app): the password and the word DELETE, as the server asks. */
function DeleteAccount() {
  const { tp } = useT()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [run] = useState(singleFlight)
  const remove = useMutation({
    mutationKey: ['member-account'],
    onMutate: () => ({ owner: useSession.getState().token }),
    mutationFn: () => api.deleteAccount({ password, confirmation }),
    onSuccess: async (_answer, _variables, context) => {
      if (context?.owner !== useSession.getState().token) return
      await useSession.getState().signOut()
      queryClient.clear()
      await forgetLook()
      router.replace('/sign-in')
    },
    onError: error => setProblem(failureOf(error).message ?? tp('portal.profile.delete_failed')),
  })
  return (
    <View style={{ gap: 14 }}>
      <Text style={[fonts.small, { color: C.text2 }]}>{tp('portal.profile.delete_body')}</Text>
      <Field label={tp('portal.profile.delete_password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
      <Field label={tp('portal.profile.delete_confirm_label')} value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" autoCorrect={false} />
      {problem && <Notice text={problem} />}
      <GhostButton title={tp('portal.profile.delete_button')} tone={C.danger} busy={remove.isPending} disabled={!password || confirmation !== 'DELETE'} onPress={() => { void run(() => remove.mutateAsync()).catch(() => {}) }} />
    </View>
  )
}

