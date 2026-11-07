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

export function correctionValid(text: string): boolean {
  const n = text.trim().length
  return n > 0 && n <= CORRECTION_MAX
}

/**
 * The body of the feedback call. The endpoint keeps one rating per person and answer and writes its comment again
 * each time, so a person who rated this answer themselves sends their own comment back with it; nobody else's.
 */
export function teachPayload(gap: BotGap, correction: string, myName: string): Record<string, unknown> {
  const mine = !!gap.rated_by && gap.rated_by === myName
  return {
    rating: 'bad',
    corrected_answer: correction.trim(),
    apply_to_training: true,
    ...(mine && gap.comment ? { comment: gap.comment } : {}),
  }
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
