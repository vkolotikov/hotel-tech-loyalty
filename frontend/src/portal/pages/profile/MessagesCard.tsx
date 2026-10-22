import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { usePortal } from '../../PortalProvider'
import { apiMessage, portalApi } from '../../lib/portalApi'
import { useVocab } from '../../lib/vocab'
import type { MessageKind, PortalBootstrap, PortalMember } from '../../lib/types'
import { Card } from '../../ui/Card'
import { Toggle } from '../../ui/Toggle'
import { applyMessageChange, marketingNeedsEmail, messageBody, messageKinds, preferencesOf, smsSwitch, type MessageChange } from './messages'

const BOOTSTRAP = ['portal-bootstrap'] as const

/**
 * What the venue tells the member about, and how it reaches them. Each switch saves on its own through
 * PUT member/profile; the words say what a switch really does.
 */
export function MessagesCard({ member }: { member: PortalMember }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const vocab = useVocab()
  const { data } = usePortal()
  const venue = data?.venue.name ?? ''

  const save = useMutation({
    mutationFn: (change: MessageChange) => portalApi.updateProfile(messageBody(change)),
    onSuccess: (_reply, change) => {
      qc.setQueryData<PortalBootstrap | undefined>(BOOTSTRAP, boot => applyMessageChange(boot, change))
      toast.success(t('portal.common.saved', 'Saved'))
      void qc.invalidateQueries({ queryKey: BOOTSTRAP })
    },
    onError: e => toast.error(apiMessage(e, t('portal.profile.save_failed', 'Could not save your changes'))),
  })

  const prefs = preferencesOf(member)
  const kinds = messageKinds(data?.capabilities ?? { loyalty: false })
  const noun = vocab('booking_plural')
  const KIND_TEXT: Record<MessageKind, { label: string; hint: string }> = {
    offers: { label: t('portal.profile.kind_offers', 'Offers'), hint: t('portal.profile.kind_offers_hint', 'New offers, and offers about to end.') },
    points: { label: t('portal.profile.kind_points', 'Points'), hint: t('portal.profile.kind_points_hint', 'Points you earn, and points about to expire.') },
    tier: { label: t('portal.profile.kind_tier', 'Your level'), hint: t('portal.profile.kind_tier_hint', 'When your membership level changes.') },
    stays: { label: t('portal.profile.kind_stays', 'Your {{noun}}', { noun }), hint: t('portal.profile.kind_stays_hint', 'Reminders and news about your {{noun}}.', { noun }) },
  }
  const sms = smsSwitch(member)
  const busy = save.isPending

  return (
    <Card className="p-4" id="messages">
      <h2 className="text-sm font-semibold">{t('portal.profile.communication', 'Communication')}</h2>

      <h3 className="text-xs font-semibold text-p-text-2 uppercase tracking-wide mt-4">{t('portal.profile.kinds_title', 'What we tell you about')}</h3>
      <p className="text-[11px] text-p-text-2 mt-1 mb-1 leading-relaxed">{t('portal.profile.kinds_hint', 'A kind you switch off is not sent to you at all: no push on your phone, and nothing in your inbox.')}</p>
      {kinds.map(kind => (
        <Toggle key={kind} label={KIND_TEXT[kind].label} hint={KIND_TEXT[kind].hint}
          checked={prefs[kind]} disabled={busy} onChange={on => save.mutate({ kind, on })} />
      ))}

      <h3 className="text-xs font-semibold text-p-text-2 uppercase tracking-wide mt-4 mb-1">{t('portal.profile.channels_title', 'How we reach you')}</h3>
      <Toggle label={t('portal.profile.push', 'Push notifications')}
        hint={t('portal.profile.push_hint', 'On your phone, through the member app: it needs the app installed and signed in. Without it, messages still wait in your inbox here.')}
        checked={!!member.push_notifications} disabled={busy} onChange={on => save.mutate({ field: 'push_notifications', on })} />
      <Toggle label={t('portal.profile.email_messages', 'Emails from {{venue}}', { venue })}
        hint={t('portal.profile.email_messages_hint', 'News about your points, offers and level by email. Booking confirmations and password emails always arrive.')}
        checked={!!member.email_notifications} disabled={busy} onChange={on => save.mutate({ field: 'email_notifications', on })} />
      <Toggle label={t('portal.profile.marketing', 'Offers and news by email')}
        hint={marketingNeedsEmail(member)
          ? t('portal.profile.marketing_needs_email', 'These arrive only while emails from {{venue}} are on.', { venue })
          : t('portal.profile.marketing_hint', 'Occasional emails about rewards, offers and events. You can turn this off at any time.')}
        checked={!!member.marketing_consent} disabled={busy} onChange={on => save.mutate({ field: 'marketing_consent', on })} />
      {sms.show && (
        <Toggle label={t('portal.profile.sms', 'Offers by SMS')}
          hint={sms.needsPhone
            ? t('portal.profile.sms_needs_phone', 'Add your phone number above to get offers by SMS.')
            : t('portal.profile.sms_hint', 'Text messages about offers, to {{phone}}. Off until you turn it on.', { phone: member.user.phone ?? '' })}
          checked={sms.on} disabled={busy || sms.disabled} onChange={on => save.mutate({ field: 'sms_consent', on })} />
      )}

      <p className="text-[11px] text-p-text-2 pt-2 leading-relaxed">{t('portal.profile.service_messages', "You'll still receive service messages about your account — password resets, booking confirmations and similar — regardless of these settings.")}</p>
    </Card>
  )
}
