import type { TFunction } from 'i18next'
import type { BotGap } from '../lib/types'
import type { ChatTurn } from './types'

/**
 * Teach the assistant (HexaTech CRM, 2026-11-07): an answer a person rated wrong in the inbox gets the right one, saved
 * through the inbox's own feedback endpoint (POST chat-inbox/messages/{id}/feedback), which files it as an "AI
 * Corrections" answer for the visitor's question. Pure.
 */
export const CORRECTION_MAX = 5000

/** Whether this answer can be taught here: the server found the question it answered, and the person may teach. */
export function canTeach(gap: BotGap, canManage: boolean): boolean {
  return canManage && gap.teachable
}

/**
 * What a person can do with an answer to fix (round 2): a manager teaches the assistant; a staff member suggests the
 * right answer, which the server keeps for a manager to check (nothing is taught); nobody can do either when the
 * server found no question before the answer.
 */
export type TeachMode = 'teach' | 'suggest' | 'none'

export function teachMode(gap: BotGap, canManage: boolean): TeachMode {
  if (!gap.teachable) return 'none'
  return canManage ? 'teach' : 'suggest'
}

/** What the answer box starts with: a staff member's suggestion, for the manager to check and send. */
export function startingAnswer(gap: BotGap): string {
  return (gap.suggested_answer ?? '').trim()
}

export function correctionValid(text: string): boolean {
  const n = text.trim().length
  return n > 0 && n <= CORRECTION_MAX
}

/**
 * The body of the feedback call (manager and staff alike: the server decides whether it teaches or keeps a
 * suggestion). The endpoint keeps one rating per person and answer, so the person who wrote the rating's comment
 * sends it back with it — known by their id (`rated_by_id`), never by a name two people may share; nobody else's.
 */
export function teachPayload(gap: BotGap, correction: string, myId: number): Record<string, unknown> {
  const mine = typeof gap.rated_by_id === 'number' && gap.rated_by_id === myId
  return {
    rating: 'bad',
    corrected_answer: correction.trim(),
    apply_to_training: true,
    ...(mine && gap.comment ? { comment: gap.comment } : {}),
  }
}

/** What the server did with it: taught the assistant, kept a staff member's suggestion, or neither. */
export function teachOutcome(response: unknown): 'taught' | 'suggested' | 'kept' {
  const r = response && typeof response === 'object' ? (response as Record<string, unknown>) : {}
  if (r.suggested === true) return 'suggested'
  if (r.applied_to_training === true) return 'taught'
  return 'kept'
}

/** The answers still to teach first: the ones that can be taught, then the most rated, then the newest. */
export function sortGaps(gaps: readonly BotGap[]): BotGap[] {
  return [...gaps].sort((a, b) =>
    Number(b.teachable) - Number(a.teachable)
    || b.ratings - a.ratings
    || String(b.rated_at ?? '').localeCompare(String(a.rated_at ?? '')))
}

/** Try it: the body of POST chatbot-config/test-chat — the new message and the last 20 turns before it. */
export function testChatPayload(message: string, history: readonly ChatTurn[]): { message: string; history: ChatTurn[] } {
  return { message: message.trim().slice(0, 2000), history: history.slice(-20) }
}

/** The conversation after an answer: the person's message, then the assistant's reply. */
export function afterReply(history: readonly ChatTurn[], message: string, reply: string): ChatTurn[] {
  return [...history, { role: 'user', content: message.trim() }, { role: 'assistant', content: reply }]
}

/** Questions any visitor might ask first, offered as buttons while the test chat is empty. */
export function starterQuestions(t: TFunction): string[] {
  return [
    t('crm.assistant.try.starter_hours', 'What are your opening hours?'),
    t('crm.assistant.try.starter_price', 'How much does it cost?'),
    t('crm.assistant.try.starter_book', 'Can I book for this weekend?'),
    t('crm.assistant.try.starter_person', 'Can I talk to a person?'),
  ]
}
