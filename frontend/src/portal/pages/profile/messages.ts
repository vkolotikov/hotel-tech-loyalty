import type { MessageKind, NotificationPreferences, PortalBootstrap, PortalCapabilities, PortalMember } from '../../lib/types'

/**
 * Profile's message settings, decided outside the component (the frontend tests render to a string): which switches
 * are shown, what each one saves through PUT member/profile, and how the cached bootstrap reads once a save landed.
 * Every rule is the server's; this only says which field a switch writes.
 */

export type ChannelField = 'push_notifications' | 'email_notifications' | 'marketing_consent' | 'sms_consent'

export type MessageChange = { kind: MessageKind; on: boolean } | { field: ChannelField; on: boolean }

const ALL_KINDS: readonly MessageKind[] = ['offers', 'points', 'tier', 'stays']

/**
 * The kinds of message the member can switch: all four at a venue with a loyalty programme; only bookings news
 * where there is none (no points, level or offers to hear about).
 */
export function messageKinds(capabilities: Pick<PortalCapabilities, 'loyalty'>): MessageKind[] {
  return capabilities.loyalty ? [...ALL_KINDS] : ['stays']
}

/** The member's kinds as the server reads them; on when the server has not said (NotificationService::optsOut()). */
export function preferencesOf(member: Pick<PortalMember, 'notification_preferences'>): NotificationPreferences {
  const p = member.notification_preferences
  return { offers: p?.offers ?? true, points: p?.points ?? true, tier: p?.tier ?? true, stays: p?.stays ?? true }
}

/** The PUT member/profile body for one switch. A kind goes one at a time: the server merges it into the rest. */
export function messageBody(change: MessageChange): Record<string, unknown> {
  return 'kind' in change ? { notification_preferences: { [change.kind]: change.on } } : { [change.field]: change.on }
}

/** The bootstrap as it reads once the server saved `change` — shown at once, before the bootstrap is fetched again. */
export function applyMessageChange(boot: PortalBootstrap | undefined, change: MessageChange): PortalBootstrap | undefined {
  if (!boot?.member) return boot
  const member: PortalMember = 'kind' in change
    ? { ...boot.member, notification_preferences: { ...preferencesOf(boot.member), [change.kind]: change.on } }
    : { ...boot.member, [change.field]: change.on }
  return { ...boot, member }
}

/** Offers by email reach the member only while emails are on (the server needs both): say so beside the switch. */
export function marketingNeedsEmail(member: Pick<PortalMember, 'marketing_consent' | 'email_notifications'>): boolean {
  return !!member.marketing_consent && !member.email_notifications
}

/**
 * "Offers by SMS" (release 4, R4-4): shown only once the server sends `sms_consent` (a switch the server does not
 * read back would save and then show itself off). Without a phone number it cannot be turned on — it can always be
 * turned off.
 */
export function smsSwitch(member: Pick<PortalMember, 'sms_consent'> & { user: Pick<PortalMember['user'], 'phone'> }): { show: boolean; on: boolean; needsPhone: boolean; disabled: boolean } {
  const show = typeof member.sms_consent === 'boolean'
  const on = member.sms_consent === true
  const needsPhone = !(member.user.phone ?? '').trim()
  return { show, on, needsPhone, disabled: needsPhone && !on }
}
