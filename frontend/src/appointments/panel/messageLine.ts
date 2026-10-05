import type { ClientMessageInfo } from '../lib/types'

export interface MessageLine { key: string; fallback: string; vars: Record<string, string>; tone: 'success' | 'info' | 'warning' | 'danger' }

const REASON: Record<string, [string, MessageLine['tone']]> = {
  not_requested: ['Not sent: staff chose not to tell the client.', 'info'],
  no_recipient:  ['Not sent: no email address.', 'warning'],
  suppressed:    ['Not sent: {{email}} does not accept our emails.', 'warning'],
  stale:         ['Not sent: the appointment changed before the email left.', 'info'],
  mail_error:    ['The email to {{email}} could not be sent.', 'danger'],
}

/** What happened to one client message, in words. Queued counts as sent: it leaves within seconds. */
export function messageLine(m: ClientMessageInfo): MessageLine {
  const vars = { email: m.recipient ?? '' }
  if (m.status === 'sent' || m.status === 'queued') {
    return { key: 'appointments.messages.sent', fallback: 'Emailed to {{email}}.', vars, tone: 'success' }
  }
  const reason = m.reason ?? 'mail_error'
  const [fallback, tone] = REASON[reason] ?? REASON.mail_error
  return { key: `appointments.messages.reason.${reason}`, fallback, vars, tone }
}
