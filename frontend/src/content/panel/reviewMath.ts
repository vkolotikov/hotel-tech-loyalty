import type { ApiFailure } from '../lib/api'
import { SEND_FROM } from '../lib/approval'
import type { PostDetail, PostStatus } from '../lib/types'

/** The approval steps the panel offers on a post (spec 2026-10-16 §6.2), only while the brand's approvals are on. */
export function reviewButtons(status: PostStatus, on: boolean, manager: boolean): { send: boolean; approve: boolean; sendBack: boolean } {
  const inReview = status === 'needs_review'
  return { send: on && !manager && SEND_FROM.includes(status), approve: on && manager && inReview, sendBack: on && manager && inReview }
}

/** The longest send-back note: the server's comment limit. */
export const NOTE_MAX = 2000

/** Why a send-back note cannot go yet — nothing written, or past 2,000 characters (counted as characters); null when it can. */
export function noteProblem(note: string): 'invalid' | null {
  const length = [...note.trim()].length
  return length === 0 || length > NOTE_MAX ? 'invalid' : null
}

/**
 * After a refused step: the post as it now is when the refusal carries it (`changed_elsewhere`, `wrong_status`) — the
 * panel shows it, so nobody approves words they have not read — and the refusal's code for its words.
 */
export function afterRefusal(failure: ApiFailure): { post: PostDetail | null; code: string } {
  return { post: failure.post ?? null, code: failure.code }
}
