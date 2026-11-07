import type { TFunction } from 'i18next'
import { dayLabel } from '../lib/format'
import type { View } from './board'
import type { ActivityType, ContactChannel, DueFilter, LeadProblem, PhoneFilter, SortKey } from './leadLogic'
import type { DueIn, Freshness, LeadColumn, TimelineKind } from './listLogic'

/** A lead's source: the system's own in our words, an organisation's own as it wrote it. */
export function sourceLabel(t: TFunction, source: string | null | undefined): string {
  switch (source) {
    case 'chatbot': return t('crm.leads.source_chatbot', 'Website chat')
    case 'booking_widget': return t('crm.leads.source_booking_widget', 'Booking form')
    case 'booking_widget_failed': return t('crm.leads.source_booking_failed', 'Unfinished booking')
    case null: case undefined: case '': return t('crm.leads.source_none', 'Added by hand')
    default: return source
  }
}

export function dueLabel(t: TFunction, due: DueFilter): string {
  switch (due) {
    case 'now': return t('crm.leads.due_now', 'Due now')
    case 'overdue': return t('crm.leads.due_overdue', 'Overdue')
    case 'today': return t('crm.leads.due_today', 'Due today')
    case 'soon': return t('crm.leads.due_soon', 'Next 3 days')
    default: return t('crm.leads.due_any', 'All open')
  }
}

export function sortLabel(t: TFunction, sort: SortKey): string {
  switch (sort) {
    case 'oldest': return t('crm.leads.sort_oldest', 'Oldest first')
    case 'follow_up': return t('crm.leads.sort_follow_up', 'Follow-up soonest')
    case 'updated': return t('crm.leads.sort_updated', 'Recently changed')
    case 'value': return t('crm.leads.sort_value', 'Largest value first')
    case 'ai': return t('crm.leads.sort_ai', 'Most likely to win')
    case 'arrival': return t('crm.leads.sort_arrival', 'Arrival soonest')
    default: return t('crm.leads.sort_newest', 'Newest first')
  }
}

export function viewLabel(t: TFunction, view: View): string {
  switch (view) {
    case 'board': return t('crm.leads.view_board', 'Board')
    case 'team': return t('crm.leads.view_team', 'Team')
    default: return t('crm.leads.view_list', 'List')
  }
}

export function columnLabel(t: TFunction, column: LeadColumn): string {
  switch (column) {
    case 'value': return t('crm.leads.col_value', 'Value')
    case 'ai_signal': return t('crm.leads.col_ai', 'AI signal')
    case 'next_task': return t('crm.leads.col_next', 'Next step')
    case 'owner': return t('crm.leads.col_owner', 'Owner and source')
    case 'touches': return t('crm.leads.col_touches', 'Calls and emails')
    case 'stay': return t('crm.leads.col_stay', 'Stay')
    default: return t('crm.leads.col_country', 'Country')
  }
}

export function phoneLabel(t: TFunction, phone: PhoneFilter): string {
  switch (phone) {
    case 'yes': return t('crm.leads.phone_yes', 'With a phone number')
    case 'no': return t('crm.leads.phone_no', 'Without a phone number')
    default: return t('crm.leads.phone_any', 'Any')
  }
}

/** A lead's freshness chip: new, its age, or cold since the last touch. */
export function freshLabel(t: TFunction, fresh: Freshness): string {
  switch (fresh.kind) {
    case 'fresh': return t('crm.leads.fresh_new', 'New')
    case 'cold': return t('crm.leads.fresh_cold', 'Cold {{count}} d', { count: fresh.days })
    default: return t('crm.leads.fresh_age', '{{count}} d old', { count: fresh.days })
  }
}

/** When a next step falls: "3 d late", "Today", "Tomorrow", "In 4 d", or its day. */
export function dueInLabel(t: TFunction, due: DueIn, lang: string): string {
  switch (due.state) {
    case 'late': return t('crm.leads.due_late', '{{count}} d late', { count: due.days })
    case 'today': return t('crm.leads.next_today', 'Today')
    case 'tomorrow': return t('crm.leads.due_tomorrow', 'Tomorrow')
    case 'soon': return t('crm.leads.due_in', 'In {{count}} d', { count: due.days })
    default: return dayLabel(due.day, lang)
  }
}

export function dueInTone(due: DueIn | null): 'danger' | 'pending' | 'neutral' {
  if (!due) return 'neutral'
  return due.state === 'late' ? 'danger' : due.state === 'today' ? 'pending' : 'neutral'
}

export function timelineKindLabel(t: TFunction, kind: TimelineKind): string {
  return kind === '' ? t('crm.common.all', 'All') : activityLabel(t, kind)
}

export function activityLabel(t: TFunction, type: string): string {
  switch (type) {
    case 'note': return t('crm.leads.activity_note', 'Note')
    case 'call': return t('crm.leads.activity_call', 'Call')
    case 'email': return t('crm.leads.activity_email', 'Email')
    case 'meeting': return t('crm.leads.activity_meeting', 'Meeting')
    case 'chat': return t('crm.leads.activity_chat', 'Chat')
    case 'status_change': return t('crm.leads.activity_status', 'Stage')
    case 'task_completed': return t('crm.leads.activity_task_done', 'Task done')
    case 'file': return t('crm.leads.activity_file', 'File')
    default: return t('crm.leads.activity_system', 'Update')
  }
}

export const activityTypeLabel = (t: TFunction, type: ActivityType): string => activityLabel(t, type)

export function channelLabel(t: TFunction, channel: ContactChannel): string {
  switch (channel) {
    case 'call': return t('crm.leads.channel_call', 'Called')
    case 'email': return t('crm.leads.channel_email', 'Emailed')
    case 'whatsapp': return t('crm.leads.channel_whatsapp', 'WhatsApp')
    default: return t('crm.leads.channel_sms', 'Text message')
  }
}

export function problemText(t: TFunction, problem: LeadProblem | undefined): string | undefined {
  switch (problem) {
    case 'required': return t('crm.leads.problem_required', 'This is needed.')
    case 'email': return t('crm.leads.problem_email', 'This does not look like an email address.')
    case 'number': return t('crm.leads.problem_number', 'Enter a number of zero or more.')
    case 'dates': return t('crm.leads.problem_dates', 'The end is before the start.')
    case 'too_long': return t('crm.leads.problem_too_long', 'This is too long.')
    default: return undefined
  }
}

export function impactLabel(t: TFunction, key: 'activities' | 'tasks' | 'attachments' | 'reservations', count: number): string {
  switch (key) {
    case 'activities': return t('crm.leads.impact_activities', '{{count}} timeline entries', { count })
    case 'tasks': return t('crm.leads.impact_tasks', '{{count}} tasks', { count })
    case 'attachments': return t('crm.leads.impact_attachments', '{{count}} files', { count })
    default: return t('crm.leads.impact_reservations', '{{count}} linked bookings stay, without the lead', { count })
  }
}

export function intentLabel(t: TFunction, intent: string | null | undefined): string | null {
  switch (intent) {
    case 'booking_inquiry': return t('crm.leads.intent_booking', 'Wants to book')
    case 'group': return t('crm.leads.intent_group', 'Group')
    case 'event': return t('crm.leads.intent_event', 'Event')
    case 'info_request': return t('crm.leads.intent_info', 'Asking for information')
    case 'complaint': return t('crm.leads.intent_complaint', 'Complaint')
    case 'other': return t('crm.leads.intent_other', 'Other')
    default: return null
  }
}

export function coldLabel(t: TFunction, risk: string | null | undefined): string | null {
  switch (risk) {
    case 'low': return t('crm.leads.cold_low', 'Engaged')
    case 'medium': return t('crm.leads.cold_medium', 'Worth a nudge')
    case 'high': return t('crm.leads.cold_high', 'Going cold')
    default: return null
  }
}

export function confidenceLabel(t: TFunction, confidence: string | null | undefined): string {
  switch (confidence) {
    case 'high': return t('crm.leads.confidence_high', 'fairly sure')
    case 'medium': return t('crm.leads.confidence_medium', 'not sure')
    default: return t('crm.leads.confidence_low', 'a guess')
  }
}

export function senderLabel(t: TFunction, sender: string, visitor: string | null | undefined): string {
  switch (sender) {
    case 'visitor': return visitor || t('crm.common.visitor', 'Visitor')
    case 'ai': case 'bot': return t('crm.leads.sender_ai', 'Assistant')
    case 'agent': return t('crm.leads.sender_team', 'Team')
    default: return t('crm.leads.sender_system', 'System')
  }
}
