import type { EventKind, PostDetail, TimelineComment } from '../lib/types'

/** The longest comment: the server's ContentPlannerPostComment::MAX_LENGTH. */
export const COMMENT_MAX = 2000

/** The most the timeline holds: the server's ContentTimeline::LIMIT (the newest). */
export const TIMELINE_MAX = 200

/** Each approval step's English line, the fallback under content.timeline.event.<kind> (timelineMath.test.ts keeps them equal). */
export const EVENT_TEXT: Record<EventKind, string> = {
  sent_for_approval: '{{name}} sent it for approval',
  approved: '{{name}} approved it',
  sent_back: '{{name}} sent it back',
  changed_after_approval: '{{name}} changed it after approval, so it needs approval again',
}

/** Why a comment cannot go yet: nothing written, or past 2,000 characters (counted as characters); null when it can. */
export function commentProblem(text: string): 'invalid' | 'too_long' | null {
  const trimmed = text.trim()
  if (trimmed === '') return 'invalid'
  return [...trimmed].length > COMMENT_MAX ? 'too_long' : null
}

/** Enter sends; Shift + Enter adds a line; the Enter that ends an input method's composition sends nothing. */
export const sendsOnEnter = (e: { key: string; shiftKey: boolean; isComposing?: boolean }): boolean =>
  e.key === 'Enter' && !e.shiftKey && e.isComposing !== true

/** The post with a new comment at the timeline's end and its new count; the newest 200 kept. */
export function withComment(post: PostDetail, comment: TimelineComment, count: number): PostDetail {
  return { ...post, timeline: [...(post.timeline ?? []), comment].slice(-TIMELINE_MAX), comments_count: count }
}

/** The post with an edited comment in its place. */
export function withEdited(post: PostDetail, comment: TimelineComment): PostDetail {
  return { ...post, timeline: (post.timeline ?? []).map(item => (item.type === 'comment' && item.id === comment.id ? comment : item)) }
}

/** The post without a deleted comment, and its new count. */
export function withoutComment(post: PostDetail, id: number, count: number): PostDetail {
  return { ...post, timeline: (post.timeline ?? []).filter(item => !(item.type === 'comment' && item.id === id)), comments_count: count }
}

/** Edit your own comments; delete your own, or anyone's as a manager (spec §7.1). */
export function commentRights(item: Pick<TimelineComment, 'mine'>, manager: boolean): { edit: boolean; remove: boolean } {
  return { edit: item.mine, remove: item.mine || manager }
}
