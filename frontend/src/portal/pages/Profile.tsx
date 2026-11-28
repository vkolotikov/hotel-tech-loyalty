import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { usePortal } from '../PortalProvider'
import { portalApi, apiMessage } from '../lib/portalApi'
import { logoutAndRedirect } from '../../lib/logout'
import { SUPPORTED_LANGUAGES } from '../../i18n'
import { formatDay } from '../lib/dates'
import { PortalIcon } from '../design/PortalIcon'
import { useProgramme } from '../design/programme'
import { usePortalPanels } from '../design/panels'
import { Button } from '../ui/Button'
import { Sheet } from '../ui/Sheet'
import { Notice } from '../ui/Notice'
import { Field, INPUT_CLASS } from '../ui/Field'
import { MessagesCard } from './profile/MessagesCard'
import { PasswordSheet } from './profile/PasswordSheet'
import { DeleteAccountSheet } from './profile/DeleteAccountSheet'
import { messageKinds, preferencesOf } from './profile/messages'

export function Profile() {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const { data } = usePortal()
  const panels = usePortalPanels()
  const [editing, setEditing] = useState(false)
  const [notifications, setNotifications] = useState(false)
  const [password, setPassword] = useState(false)
  const [remove, setRemove] = useState(false)
  const { hash, pathname, search } = useLocation()
  const navigate = useNavigate()
  const programme = useProgramme(!!data?.member && !!data.capabilities.loyalty)
  const member = data?.member
  const user = member?.user
  const notificationsOpen = notifications || hash === '#messages'
  const closeNotifications = () => {
    setNotifications(false)
    if (hash === '#messages') navigate({ pathname, search, hash: '' }, { replace: true })
  }

  const save = useMutation({
    mutationFn: portalApi.updateProfile,
    onSuccess: (_reply, payload) => {
      if (typeof payload.language === 'string') void i18n.changeLanguage(payload.language)
      toast.success(t('portal.common.saved', 'Saved'))
      void qc.invalidateQueries({ queryKey: ['portal-bootstrap'] })
      setEditing(false)
    },
  })
  if (!data) return null
  const prefs = member ? preferencesOf(member) : null
  const notificationsOn = prefs ? messageKinds(data.capabilities).filter(k => prefs[k]).length : 0
  const language = SUPPORTED_LANGUAGES.find(l => l.code === (user?.language ?? i18n.language))?.label ?? i18n.language
  const contact = data.venue.contact.email ? `mailto:${data.venue.contact.email}` : data.venue.contact.phone ? `tel:${data.venue.contact.phone}` : null
  const birthdayPoints = programme.data?.earning?.birthday_points ?? 0
  return (
    <div>
      <div className="p-page-heading"><h1>{t('portal.profile.title', 'Profile')}</h1></div>
      <div className="p-profile-grid">
        <aside className="space-y-3">
          <div className="p-profile-identity">
            <span className="p-avatar">{user?.avatar_url ? <img src={user.avatar_url} alt="" /> : (user?.name ?? member?.name ?? '').split(' ').filter(Boolean).slice(0, 2).map(n => n[0]).join('')}</span>
            <div className="min-w-0"><h2>{user?.name ?? member?.name}</h2>{member && <p>{t('portal.home.member_since', 'Member since {{date}}', { date: formatDay(member.member_since, i18n.language) })}</p>}</div>
            {member?.tier && <span className="p-tier-badge"><PortalIcon name="medal" />{member.tier.name}</span>}
          </div>
          <div className="p-profile-desktop-actions">
            {contact && <a href={contact} className="p-profile-action"><PortalIcon name="help" tile /><span>{t('portal.design.contact_venue', 'Contact the venue')}</span><PortalIcon name="chevron" /></a>}
            <button className="p-profile-action" onClick={() => { void logoutAndRedirect('/login') }}><PortalIcon name="logout" tile /><span>{t('portal.common.sign_out', 'Sign out')}</span><PortalIcon name="chevron" /></button>
          </div>
        </aside>
        <div className="space-y-3">
          <section className="p-personal-details">
            <div className="flex items-center justify-between gap-2 pb-2"><h2 className="font-semibold">{t('portal.design.personal_details', 'Personal details')}</h2><Button variant="secondary" size="sm" onClick={() => { save.reset(); setEditing(true) }}><PortalIcon name="edit" />{t('portal.design.edit', 'Edit')}</Button></div>
            <div className="p-personal-row"><PortalIcon name="mail" /><span>{t('portal.profile.email', 'Email')}</span><strong>{user?.email}</strong><PortalIcon name="lock" /></div>
            <div className="p-personal-row"><PortalIcon name="phone" /><span>{t('portal.profile.phone', 'Phone')}</span>{user?.phone ? <strong>{user.phone}</strong> : <button onClick={() => { save.reset(); setEditing(true) }}>{t('portal.design.add_phone', 'Add phone')}</button>}</div>
            <div className="p-personal-row"><PortalIcon name="birthday" /><span>{t('portal.profile.birthday', 'Date of birth')}</span>{user?.date_of_birth ? <strong>{formatDay(user.date_of_birth.slice(0, 10), i18n.language)}</strong> : <button onClick={() => { save.reset(); setEditing(true) }}>{t('portal.design.add_birthday', 'Add birthday')}</button>}{birthdayPoints > 0 && !user?.date_of_birth && <small className="p-tier-badge">+{birthdayPoints.toLocaleString(i18n.language)} {t('portal.design.pts', 'pts')}</small>}</div>
            <div className="p-personal-row"><PortalIcon name="globe" /><span>{t('portal.profile.language', 'Language')}</span><button onClick={() => { save.reset(); setEditing(true) }}>{language}</button></div>
          </section>
          {member && <button id="messages" className="p-profile-action" onClick={() => setNotifications(true)}><PortalIcon name="bell" tile /><span>{t('portal.design.notifications', 'Notifications')}</span><small className="p-count-badge">{t('portal.design.notifications_on', '{{count}} on', { count: notificationsOn })}</small><PortalIcon name="chevron" /></button>}
          <div className="p-profile-mobile-actions">
            {contact && <a href={contact} className="p-profile-action"><PortalIcon name="help" tile /><span>{t('portal.design.contact_venue', 'Contact the venue')}</span><PortalIcon name="chevron" /></a>}
            <button className="p-profile-action" onClick={() => { void logoutAndRedirect('/login') }}><PortalIcon name="logout" tile /><span>{t('portal.common.sign_out', 'Sign out')}</span><PortalIcon name="chevron" /></button>
          </div>
          <details className="p-account-more">
            <summary>{t('portal.design.account_help', 'Account & help')}</summary>
            <div className="space-y-2 mt-3">
              <Link to="/portal/help" data-help-link="" className="p-profile-action"><PortalIcon name="help" tile /><span>{t('portal.help.title', 'Help')}</span><PortalIcon name="chevron" /></Link>
              {data.capabilities.events && <Link to="/portal/events" className="p-profile-action"><PortalIcon name="calendar" tile /><span>{t('portal.nav.events', 'Events')}</span><PortalIcon name="chevron" /></Link>}
              {programme.data?.earning?.referrals && <button className="p-profile-action" onClick={() => panels.open('invite')}><PortalIcon name="invite" tile /><span>{t('portal.profile.invite_title', 'Invite a friend')}</span><PortalIcon name="chevron" /></button>}
              <Button variant="secondary" size="sm" onClick={() => setPassword(true)}>{t('portal.profile.password_change', 'Change password')}</Button>
              <Button variant="ghost" size="sm" className="text-p-danger" onClick={() => setRemove(true)}>{t('portal.profile.delete_title', 'Delete account')}</Button>
              {member && <p className="text-xs text-p-text-2">{t('portal.profile.member_number', 'Member number {{number}}', { number: member.member_number })}</p>}
            </div>
          </details>
        </div>
      </div>
      <Sheet open={editing} onClose={() => setEditing(false)} busy={save.isPending} title={t('portal.design.edit_details', 'Edit personal details')} icon={<PortalIcon name="edit" tile />}
        footer={<><Button variant="ghost" disabled={save.isPending} onClick={() => setEditing(false)}>{t('portal.common.cancel', 'Cancel')}</Button><Button form="p-profile-form" type="submit" loading={save.isPending}>{t('portal.common.save', 'Save changes')}</Button></>}>
        <form id="p-profile-form" className="space-y-3" onSubmit={e => {
          e.preventDefault()
          if (save.isPending) return
          const fd = new FormData(e.currentTarget)
          const dob = String(fd.get('date_of_birth') ?? '')
          save.mutate({ name: String(fd.get('name') ?? '').trim(), phone: String(fd.get('phone') ?? ''), language: String(fd.get('language') ?? 'en'), ...(dob ? { date_of_birth: dob } : {}) })
        }}>
          {save.isError && <Notice tone="danger">{apiMessage(save.error, t('portal.profile.save_failed', 'Could not save your changes'))}</Notice>}
          <Field label={t('portal.profile.name', 'Name')}><input name="name" defaultValue={user?.name ?? ''} required maxLength={191} autoComplete="name" className={INPUT_CLASS} /></Field>
          <Field label={t('portal.profile.phone', 'Phone')}><input name="phone" type="tel" maxLength={20} defaultValue={user?.phone ?? ''} autoComplete="tel" className={INPUT_CLASS} /></Field>
          <Field label={t('portal.profile.birthday', 'Date of birth')}><input name="date_of_birth" type="date" defaultValue={user?.date_of_birth?.slice(0, 10) ?? ''} className={INPUT_CLASS} /></Field>
          <Field label={t('portal.profile.language', 'Language')}><select name="language" defaultValue={user?.language ?? i18n.language} className={INPUT_CLASS}>{SUPPORTED_LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}</select></Field>
        </form>
      </Sheet>
      <Sheet open={notificationsOpen} onClose={closeNotifications} title={t('portal.design.notifications', 'Notifications')} icon={<PortalIcon name="bell" tile />} footer={<Button onClick={closeNotifications} size="sm">{t('portal.design.done', 'Done')}</Button>}>{member && <MessagesCard member={member} />}</Sheet>
      <PasswordSheet open={password} onClose={() => setPassword(false)} />
      <DeleteAccountSheet open={remove} onClose={() => setRemove(false)} />
    </div>
  )
}
