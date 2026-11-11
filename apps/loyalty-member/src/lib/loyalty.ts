import type { PortalBootstrap, PortalMember } from './types'
import { failureOf } from './failure'

export function rewardMessage(error: unknown, say: (key: string) => string, fallback: string): string {
  const failure = failureOf(error)
  return failure.code === 'membership_not_started' || failure.code === 'membership_expired' ? say(`portal.rewards.${failure.code}`) : failure.message ?? fallback
}

/** Presentation switches only; the server still decides every action and access verdict. */
export function loyaltyFeatures(boot: PortalBootstrap | undefined) {
  const member = !!boot?.member
  const points = member && !!boot?.capabilities.loyalty
  return { points, benefits: member && (points || boot?.member?.membership_mode === 'assigned'), events: member && !!boot?.capabilities.events }
}

/** The native product has event registration, but no accommodation/appointment booking. */
export function loyaltyHelp(boot: PortalBootstrap): PortalBootstrap {
  return { ...boot, capabilities: { ...boot.capabilities, services: false, stays: false } }
}

export type RewardTab = 'benefits' | 'catalogue' | 'offers' | 'codes'
export function rewardTab(requested: string | undefined, points: boolean): RewardTab {
  return requested === 'codes' || (points && (requested === 'offers' || requested === 'catalogue')) ? requested : 'benefits'
}

export function walletEnabled(boot: PortalBootstrap | undefined, platform: string, which: 'apple' | 'google'): boolean {
  return !!boot?.member && !!boot.capabilities.wallets?.[which] && (platform === 'web' || platform === (which === 'apple' ? 'ios' : 'android'))
}

/** null means the person has not edited the birthday; a background refresh must never turn it into a write. */
export function profileUpdate(name: string, phone: string, birthdayDraft: string | null): { name: string; phone: string; date_of_birth?: string | null } {
  return { name: name.trim(), phone: phone.trim(), ...(birthdayDraft !== null ? { date_of_birth: birthdayDraft || null } : {}) }
}

/** Mutation callbacks can outlive a signed-out screen. Never write their response into the next member's cache. */
export function profileSaved(before: PortalBootstrap | undefined, userId: number, reply: Partial<PortalMember['user']> | undefined, submitted: ReturnType<typeof profileUpdate>): PortalBootstrap | undefined {
  if (!before?.member || before.member.user.id !== userId || (reply?.id !== undefined && reply.id !== userId)) return before
  return { ...before, member: { ...before.member, user: { ...before.member.user, ...submitted, ...reply } } }
}

const EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
/** Files arrive through an authenticated endpoint, with names kept inside this app's cache directory. */
export function voucherName(name: string, mime: string): string {
  const extension = EXT[mime]
  if (!extension) throw new Error('Unsupported voucher')
  const leaf = name.split(/[/\\]/).pop() ?? ''
  const stem = leaf.replace(/\.[^.]*$/, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/^\.+/, '').trim().slice(0, 100)
  return `${stem || 'voucher'}.${extension}`
}

export function offerNotification(n: { type: string; data: Record<string, unknown> | null }): { id: number; name: string | null } | null {
  const id = n.data?.offer_id
  if (n.type !== 'new_offer' || typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return null
  const attachment = n.data?.attachment
  const name = attachment && typeof attachment === 'object' && 'name' in attachment && typeof attachment.name === 'string' ? attachment.name : null
  return { id, name }
}

/** A synchronous lock covers the gap before React renders a mutation's pending state. */
export function singleFlight() {
  let pending = false
  return async (action: () => Promise<unknown>): Promise<void> => {
    if (pending) return
    pending = true
    try { await action() } finally { pending = false }
  }
}
