import type { Bootstrap, PostCard, PostStatus } from './types'

/** The bundles' words with a fallback, as the components hand `t` to a helper. */
export type Translate = (key: string, fallback: string, vars?: Record<string, unknown>) => string

/** What only a manager sets while a brand's approvals are on (the server's ContentApproval::MANAGER_STATUSES). */
export const MANAGER_STATUSES: readonly PostStatus[] = ['approved', 'ready_to_publish', 'published']

/**
 * What the panel offers "Send for approval" from (spec 2026-10-16 §6.2). The server also takes Needs review, which
 * records the step again; the portal does not offer it there — the post already says it waits.
 */
export const SEND_FROM: readonly PostStatus[] = ['idea', 'draft', 'needs_visual']

/** What a post's own poster may mark published from while the brand's approvals are on (spec 2026-10-19 §4.4). */
export const POSTER_PUBLISHES: readonly PostStatus[] = ['approved', 'ready_to_publish']

/**
 * Whether Mark published is offered: never on a published post; while approvals lock the person, only on a post they
 * post themselves (`me`, the bootstrap's `staff.id`) that is Approved or Ready — the server's guardPublish.
 */
export function canMarkPublished(post: Pick<PostCard, 'status' | 'poster_id'>, locked: boolean, me: number | null): boolean {
  if (post.status === 'published') return false
  if (!locked) return true
  return me !== null && post.poster_id === me && POSTER_PUBLISHES.includes(post.status)
}

/** The brand's approvals are on (the bootstrap says so; an answer without the field means off). */
export const approvalsOn = (boot: Pick<Bootstrap, 'profile'> | undefined): boolean => boot?.profile?.requires_approval === true

/** Staff while the brand's approvals are on: the portal hides what the server would refuse them (spec §6.2). */
export const staffLocked = (boot: Pick<Bootstrap, 'profile' | 'staff'> | undefined): boolean => approvalsOn(boot) && boot?.staff.can_manage !== true

/** The status list: without the three manager statuses while locked — the post's own status stays, so the list can show it. */
export function statusChoices(statuses: readonly PostStatus[], locked: boolean, current: PostStatus): PostStatus[] {
  return locked ? statuses.filter(s => !MANAGER_STATUSES.includes(s) || s === current) : [...statuses]
}

/** What a card shows beside its status (spec §6.3, §7.1): waiting for approval (only while on), sent back, its comments. */
export function cardFlags(post: Pick<PostCard, 'status' | 'sent_back' | 'comments_count'>, on: boolean): { waiting: boolean; sentBack: boolean; comments: number } {
  return { waiting: on && post.status === 'needs_review', sentBack: post.sent_back === true, comments: post.comments_count ?? 0 }
}

/** How many posts share a card's group of versions (spec 2026-10-19 §3.4): 0 for none and for a group of one. */
export const versionsOf = (post: Pick<PostCard, 'group_size'>): number => ((post.group_size ?? 0) >= 2 ? (post.group_size as number) : 0)

/** A card's flags in words, in order, its versions last: the name of a card whose marks are drawn without them (the Plan's cards). */
export function flagWords(flags: ReturnType<typeof cardFlags>, t: Translate, versions = 0): string {
  return [
    flags.waiting ? t('content.flags.waiting', 'Waiting for approval') : '',
    flags.sentBack ? t('content.flags.sent_back', 'Sent back') : '',
    flags.comments > 0 ? t('content.flags.comments', 'Comments: {{count}}', { count: flags.comments }) : '',
    versions > 0 ? t('content.flags.versions', 'Versions: {{count}}', { count: versions }) : '',
  ].filter(Boolean).join(', ')
}
