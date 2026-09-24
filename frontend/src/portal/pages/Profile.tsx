import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { usePortal } from '../PortalProvider'
import { portalApi, apiMessage } from '../lib/portalApi'
import { logoutAndRedirect } from '../../lib/logout'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Field, INPUT_CLASS } from '../ui/Field'
import { Toggle } from '../ui/Toggle'
import { LanguageSelect } from './profile/LanguageSelect'
import { PasswordSheet } from './profile/PasswordSheet'
import { DeleteAccountSheet } from './profile/DeleteAccountSheet'
import { ReferralCard } from './profile/ReferralCard'

export function Profile() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data } = usePortal()
  const [password, setPassword] = useState(false)
  const [remove, setRemove] = useState(false)

  const save = useMutation({
    mutationFn: portalApi.updateProfile,
    onSuccess: () => { toast.success(t('portal.common.saved', 'Saved')); void qc.invalidateQueries({ queryKey: ['portal-bootstrap'] }) },
    onError: e => toast.error(apiMessage(e, t('portal.profile.save_failed', 'Could not save your changes'))),
  })

  const member = data?.member
  const user = member?.user
  if (!data) return null

  return (
    <div className="space-y-5">
      <h1 className="font-p-display text-2xl">{t('portal.profile.title', 'Profile')}</h1>

      {/* Uncontrolled and re-seeded by key: mirroring server state into
          useState needed an effect that re-fired on every refetch and quietly
          discarded whatever the member was mid-way through typing. */}
      <form
        key={user?.email ?? 'profile'}
        onSubmit={e => {
          e.preventDefault()
          const fd = new FormData(e.currentTarget)
          const dob = String(fd.get('date_of_birth') ?? '')
          // Omit the key entirely when the field is empty rather than send
          // `null` — a client that never touched this field (or a legacy
          // payload shape) must never blank a birthday SendBirthdayRewards
          // depends on just by saving the name or phone.
          save.mutate({ name: String(fd.get('name') ?? ''), phone: String(fd.get('phone') ?? ''), ...(dob ? { date_of_birth: dob } : {}) })
        }}
      >
        <Card className="p-4 space-y-3">
          <Field label={t('portal.profile.name', 'Name')}><input name="name" defaultValue={user?.name ?? ''} autoComplete="name" className={INPUT_CLASS} /></Field>
          <Field label={t('portal.profile.email', 'Email')} hint={t('portal.profile.email_hint', 'Contact the venue if you need to change this')}><input value={user?.email ?? ''} disabled className={INPUT_CLASS} /></Field>
          <Field label={t('portal.profile.phone', 'Phone')}><input name="phone" type="tel" defaultValue={user?.phone ?? ''} autoComplete="tel" className={INPUT_CLASS} /></Field>
          {/* .slice(0, 10): guards against a legacy payload shape (a full
              ISO datetime instead of the plain Y-m-d the backend now sends)
              blanking this field outright — <input type="date"> rejects
              anything but Y-m-d and silently renders empty. */}
          <Field label={t('portal.profile.birthday', 'Date of birth')}><input name="date_of_birth" type="date" defaultValue={user?.date_of_birth?.slice(0, 10) ?? ''} className={INPUT_CLASS} /></Field>
          <LanguageSelect />
          <Button type="submit" loading={save.isPending}>{t('portal.common.save', 'Save changes')}</Button>
        </Card>
      </form>

      {member && (
        <Card className="p-4">
          <h2 className="text-sm font-semibold mb-2">{t('portal.profile.communication', 'Communication')}</h2>
          <Toggle label={t('portal.profile.marketing', 'Offers and news by email')} hint={t('portal.profile.marketing_hint', 'Occasional emails about rewards, offers and events. You can turn this off at any time.')}
            checked={!!member.marketing_consent} disabled={save.isPending} onChange={v => save.mutate({ marketing_consent: v })} />
          <Toggle label={t('portal.profile.push', 'Push notifications')} hint={t('portal.profile.push_hint', 'Points updates and reminders on your phone.')}
            checked={!!member.push_notifications} disabled={save.isPending} onChange={v => save.mutate({ push_notifications: v })} />
          <p className="text-[11px] text-p-text-2 pt-2 leading-relaxed">{t('portal.profile.service_messages', "You'll still receive service messages about your account — password resets, booking confirmations and similar — regardless of these settings.")}</p>
        </Card>
      )}

      {data.capabilities.loyalty && <ReferralCard />}

      <Card className="p-4 flex items-center justify-between gap-3">
        <div><h2 className="text-sm font-semibold">{t('portal.profile.password_title', 'Password')}</h2></div>
        <Button variant="secondary" size="sm" onClick={() => setPassword(true)}>{t('portal.profile.password_change', 'Change password')}</Button>
      </Card>

      <div className="flex items-center justify-between gap-3 pt-2">
        <Button variant="ghost" size="sm" onClick={() => { void logoutAndRedirect('/login') }}>{t('portal.common.sign_out', 'Sign out')}</Button>
        <Button variant="ghost" size="sm" className="text-p-danger" onClick={() => setRemove(true)}>{t('portal.profile.delete_title', 'Delete account')}</Button>
      </div>
      {member && <p className="text-center text-[11px] text-p-text-2">{t('portal.profile.member_number', 'Member number {{number}}', { number: member.member_number })}</p>}

      <PasswordSheet open={password} onClose={() => setPassword(false)} />
      <DeleteAccountSheet open={remove} onClose={() => setRemove(false)} />
    </div>
  )
}
