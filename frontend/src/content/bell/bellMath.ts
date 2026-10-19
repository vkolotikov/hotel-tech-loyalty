import type { Translate } from '../lib/approval'
import { cardLine } from '../lib/postText'
import type { DateKey, InboxItem, InboxKind } from '../lib/types'
import type { PopItem } from '../ui/PopMenu'

/** The badge: nothing at 0, the number up to 99, then "99+". */
export const badgeText = (count: number): string => (count <= 0 ? '' : count > 99 ? '99+' : String(count))

/**
 * The list's size and place: 20rem under the bell; on a phone pinned to the screen below the header with the page's
 * 16 px gutters (right-aligned to the bell, which sits left of New post, 20rem ran off the screen's left edge).
 */
export const BELL_LIST_CLASS = 'w-80 max-sm:fixed max-sm:inset-x-4 max-sm:top-14 max-sm:w-auto'

/** Each kind's English line, the fallback under content.bell.kind.<kind> (bellMath.test.ts keeps them equal). */
export const BELL_TEXT: Record<InboxKind, string> = {
  waiting: 'Waiting for approval: {{post}}',
  approved: '{{name}} approved: {{post}}',
  sent_back: '{{name}} sent back: {{post}}',
  comment: '{{name}} commented: {{post}}',
  // Release 5a (spec 2026-10-19 §4.3): the posts the person is to put out.
  to_post: 'To post today: {{post}}',
  not_posted: 'Not marked as posted: {{post}}',
}

/** A reminder names its post's status only when it is not ready to go out. */
const READY = ['approved', 'ready_to_publish']

/** A line's second line: a reminder's time or the day it was due, then a status not yet ready; else who and when. */
function subLine(item: InboxItem, t: Translate, when: (at: string) => string, day: (date: DateKey) => string): string[] {
  if (item.kind === 'to_post' || item.kind === 'not_posted') {
    const post = item.post
    const status = post?.status && !READY.includes(post.status) ? t(`content.status.${post.status}`, post.status) : ''
    const timing = item.kind === 'to_post'
      ? (post?.scheduled_time ? t('content.bell.at', 'at {{time}}', { time: post.scheduled_time }) : '')
      : (post?.scheduled_date ? t('content.bell.due', 'Due {{day}}', { day: day(post.scheduled_date) }) : '')
    return [timing, status].filter(Boolean)
  }
  const first = item.kind === 'waiting' ? (item.by?.name ?? '') : (item.note ?? '')
  return [first, when(item.at)].filter(Boolean)
}

/**
 * The list's lines (spec 2026-10-16 §8), newest first as the server sends them: what happened to which post; beneath,
 * who wrote a waiting post (nobody for one the AI wrote), or the note or comment, and when. News is marked.
 */
export function bellItems(items: InboxItem[], t: Translate, when: (at: string) => string, day: (date: DateKey) => string = date => date): PopItem[] {
  return items.map(item => {
    const post = (item.post && cardLine(item.post)) || t('content.plan.untitled', 'Untitled post')
    const name = item.by?.name ?? t('content.people.former', 'Former team member')
    const label = t(`content.bell.kind.${item.kind}`, BELL_TEXT[item.kind], { name, post })
    return { id: item.id, label, sub: subLine(item, t, when, day).join(' · '), mark: item.unread }
  })
}
