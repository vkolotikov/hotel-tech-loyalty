import type { CHANNELS, INTENTS } from './inboxLogic'
import type { ConvStatus } from './types'

/**
 * The English defaults of the words the inbox builds at run time (t(`crm.inbox.channel.${key}`) and the like). The
 * locale files hold the same keys in all five languages; inboxWords.test.ts checks that every key here is there.
 */
export const STATUS_DEFAULTS: Record<ConvStatus, string> = {
  active: 'Active',
  waiting: 'Waiting',
  resolved: 'Resolved',
  archived: 'Archived',
}

export const CHANNEL_DEFAULTS: Record<(typeof CHANNELS)[number], string> = {
  widget: 'Website chat',
  messenger: 'Messenger',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  admin_initiated: 'Started by the team',
}

export const INTENT_DEFAULTS: Record<(typeof INTENTS)[number], string> = {
  booking_inquiry: 'Wants to book',
  info_request: 'Asks for information',
  complaint: 'Complaint',
  cancellation: 'Wants to cancel',
  support: 'Needs help',
  spam: 'Spam',
  other: 'Other',
}

export const ACTION_DEFAULTS = {
  resolve: 'Resolve',
  archive: 'Archive',
  reopen: 'Reopen',
} as const

export const ACTION_DONE_DEFAULTS = {
  resolve: 'Marked as resolved',
  archive: 'Archived',
  reopen: 'Reopened',
} as const

export const UPLOAD_ERROR_DEFAULTS = {
  too_big: 'That file is larger than 8 MB.',
  wrong_type: 'Send a picture, a PDF, a Word document or a text file.',
} as const

export const DICTATION_ERROR_DEFAULTS = {
  denied: 'The microphone is not allowed in this browser.',
  no_speech: 'No words were heard. Try again a little closer to the microphone.',
  off: 'Dictation is not available for your organisation.',
  failed: 'The recording could not be turned into text. Please try again.',
} as const

export const FIELD_ERROR_DEFAULTS = {
  email: 'This does not look like an email address.',
  too_long: 'This is too long.',
} as const
