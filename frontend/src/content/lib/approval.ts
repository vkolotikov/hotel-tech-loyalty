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

/** A card's flags in words, in order: the name of a card whose marks are drawn without them (the Plan's cards). */
export function flagWords(flags: ReturnType<typeof cardFlags>, t: Translate): string {
  return [
    flags.waiting ? t('content.flags.waiting', 'Waiting for approval') : '',
    flags.sentBack ? t('content.flags.sent_back', 'Sent back') : '',
    flags.comments > 0 ? t('content.flags.comments', 'Comments: {{count}}', { count: flags.comments }) : '',
  ].filter(Boolean).join(', ')
}
