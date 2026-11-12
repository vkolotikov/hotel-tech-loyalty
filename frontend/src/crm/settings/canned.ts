/**
 * Canned replies (chat-inbox-canned): the short answers the team inserts in the inbox. The whole list is one form and
 * saved at once (PUT replaces it). Limits are ChatInboxController::updateCannedResponses': at most 50, a label of 80
 * characters, a text of 2000. Pure.
 */
export interface CannedReply { label: string; text: string }

export const CANNED_LIMITS = { count: 50, label: 80, text: 2000 } as const

export type CannedProblem = { index: number; field: 'label' | 'text'; code: 'required' | 'too_long' }

/** The replies the server holds, as the form edits them. */
export function cannedList(data: { canned_responses?: unknown } | undefined): CannedReply[] {
  const list = Array.isArray(data?.canned_responses) ? data.canned_responses : []
  return list
    .filter((r): r is { label?: unknown; text?: unknown } => !!r && typeof r === 'object')
    .map(r => ({ label: typeof r.label === 'string' ? r.label : '', text: typeof r.text === 'string' ? r.text : '' }))
}

export function cannedProblems(list: readonly CannedReply[]): CannedProblem[] {
  const out: CannedProblem[] = []
  list.forEach((reply, index) => {
    const label = reply.label.trim()
    const text = reply.text.trim()
    if (!label) out.push({ index, field: 'label', code: 'required' })
    else if (label.length > CANNED_LIMITS.label) out.push({ index, field: 'label', code: 'too_long' })
    if (!text) out.push({ index, field: 'text', code: 'required' })
    else if (text.length > CANNED_LIMITS.text) out.push({ index, field: 'text', code: 'too_long' })
  })
  return out
}

export function cannedValid(list: readonly CannedReply[]): boolean {
  return list.length <= CANNED_LIMITS.count && cannedProblems(list).length === 0
}

/** The body of PUT chat-inbox-canned: the whole list, trimmed. */
export function cannedPayload(list: readonly CannedReply[]): { canned_responses: CannedReply[] } {
  return { canned_responses: list.map(r => ({ label: r.label.trim(), text: r.text.trim() })) }
}

export function sameCanned(a: readonly CannedReply[], b: readonly CannedReply[]): boolean {
  return JSON.stringify(cannedPayload(a)) === JSON.stringify(cannedPayload(b))
}

/** Whether another reply may be added (the server keeps at most 50). */
export function canAddReply(list: readonly CannedReply[]): boolean {
  return list.length < CANNED_LIMITS.count
}

/** Which row stays open after row `removed` went: the same reply (one up when it was below), none when it was the one. */
export function editingAfterRemove(editing: number | null, removed: number): number | null {
  if (editing === null || editing === removed) return null
  return editing > removed ? editing - 1 : editing
}
