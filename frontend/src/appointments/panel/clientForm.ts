import type { ClientSummary } from '../lib/types'

export interface ClientForm { name: string; phone: string; email: string }

/** The likely duplicates the server reported, and the details it reported them for. */
export interface DuplicateWarning { for: string; list: ClientSummary[] }

/** The details of a new client as the server compares them: trimmed, the email without case. */
export function clientFormKey(form: ClientForm): string {
  return [form.name.trim(), form.phone.trim(), form.email.trim().toLowerCase()].join('\n')
}

/**
 * The duplicates to show for the form as it is now. A warning belongs to the
 * details it was raised for: once the operator edits them, it is gone — and
 * with it "add as a new client anyway", which skips the server's check and
 * must never be offered for details nobody checked.
 */
export function duplicatesFor(warning: DuplicateWarning | null, form: ClientForm): ClientSummary[] | null {
  return warning !== null && warning.for === clientFormKey(form) ? warning.list : null
}
