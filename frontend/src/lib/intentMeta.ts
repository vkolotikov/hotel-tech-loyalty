import {
  Calendar, HelpCircle, AlertTriangle, XCircle, LifeBuoy, ShieldOff, MessageCircleQuestion,
} from 'lucide-react'

/**
 * Engagement Hub Phase 3 — shared metadata for the seven conversation
 * intent tags. Used by the drawer's AI Brief tab, the row UI, and the
 * intent filter chips so labels + colours stay consistent.
 *
 * The set of keys here MUST match `EngagementAiService::INTENTS` on the
 * backend — anything else is normalised to 'other' before persistence.
 */
export const INTENT_META: Record<string, {
  label: string
  icon: any
  cls: string
}> = {
  booking_inquiry: { label: 'Booking inquiry', icon: Calendar,                cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40' },
  info_request:    { label: 'Info request',    icon: HelpCircle,              cls: 'bg-blue-500/10 text-blue-400 border-blue-500/40' },
  complaint:       { label: 'Complaint',       icon: AlertTriangle,           cls: 'bg-red-500/10 text-red-400 border-red-500/40' },
  cancellation:    { label: 'Cancellation',    icon: XCircle,                 cls: 'bg-orange-500/10 text-orange-400 border-orange-500/40' },
  support:         { label: 'Support',         icon: LifeBuoy,                cls: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/40' },
  spam:            { label: 'Spam',            icon: ShieldOff,               cls: 'bg-gray-500/10 text-gray-400 border-gray-500/40' },
  other:           { label: 'Other',           icon: MessageCircleQuestion,   cls: 'bg-slate-500/10 text-slate-400 border-slate-500/40' },
}
