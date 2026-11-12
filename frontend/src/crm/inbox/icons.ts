import {
  Archive, CalendarCheck, CalendarX2, CheckCircle2, CircleHelp, Hourglass, Inbox, LifeBuoy, MessageCircle,
  MessageCircleQuestion, ShieldOff, TriangleAlert, type LucideIcon,
} from 'lucide-react'
import type { Tone } from '../ui/tones'
import type { INTENTS, StatusFilter } from './inboxLogic'

/**
 * Round 5 (owner 2026-11-12, "more icons"): what a chat is about and where it stands, each as its icon in a tone —
 * the words stay as their tooltips and for a screen reader (words.ts, crm.inbox.intent.*, crm.status.*).
 */
export const INTENT_ICON: Record<(typeof INTENTS)[number], LucideIcon> = {
  booking_inquiry: CalendarCheck,
  info_request: CircleHelp,
  complaint: TriangleAlert,
  cancellation: CalendarX2,
  support: LifeBuoy,
  spam: ShieldOff,
  other: MessageCircleQuestion,
}

export const INTENT_TONE: Record<(typeof INTENTS)[number], Tone> = {
  booking_inquiry: 'success',
  info_request: 'progress',
  complaint: 'danger',
  cancellation: 'pending',
  support: 'accent',
  spam: 'neutral',
  other: 'neutral',
}

export const STATUS_ICON: Record<StatusFilter, LucideIcon> = {
  all: Inbox,
  waiting: Hourglass,
  active: MessageCircle,
  resolved: CheckCircle2,
  archived: Archive,
}

/** The ink of a tone alone (an icon with no chip behind it). */
export const TONE_INK: Record<Tone, string> = {
  neutral: 'text-a-text-2',
  accent: 'text-a-accent-text',
  pending: 'text-a-st-pending',
  progress: 'text-a-st-progress',
  success: 'text-a-st-confirmed',
  danger: 'text-a-danger',
  ai: 'crm-ai-text',
}
