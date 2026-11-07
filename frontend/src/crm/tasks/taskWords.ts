import type { TFunction } from 'i18next'
import {
  Building2, CalendarDays, ChevronRight, FileSignature, FileText, HelpCircle, ListChecks, Mail, MessageCircle,
  MessageSquare, Phone, Sparkles, Video, type LucideIcon,
} from 'lucide-react'
import type { Bucket, TaskType } from './taskLogic'

/** A task type's name, in the person's language. */
export function taskTypeLabel(t: TFunction, type: string): string {
  switch (type) {
    case 'call': return t('crm.tasks.type_call', 'Call')
    case 'email': return t('crm.tasks.type_email', 'Email')
    case 'whatsapp': return t('crm.tasks.type_whatsapp', 'WhatsApp')
    case 'sms': return t('crm.tasks.type_sms', 'SMS')
    case 'video_call': return t('crm.tasks.type_video_call', 'Video call')
    case 'meeting': return t('crm.tasks.type_meeting', 'Meeting')
    case 'site_visit': return t('crm.tasks.type_site_visit', 'Visit')
    case 'demo': return t('crm.tasks.type_demo', 'Demo')
    case 'send_proposal': return t('crm.tasks.type_send_proposal', 'Send a proposal')
    case 'contract': return t('crm.tasks.type_contract', 'Contract')
    case 'discovery': return t('crm.tasks.type_discovery', 'Discovery call')
    case 'follow_up': return t('crm.tasks.type_follow_up', 'Follow up')
    default: return t('crm.tasks.type_custom', 'Other')
  }
}

/** Each type's icon (looked up where it is drawn, a static map). */
export const TASK_ICONS: Record<TaskType, LucideIcon> = {
  call: Phone, email: Mail, whatsapp: MessageCircle, sms: MessageSquare, video_call: Video, meeting: CalendarDays,
  site_visit: Building2, demo: Sparkles, send_proposal: FileText, contract: FileSignature, discovery: HelpCircle,
  follow_up: ChevronRight, custom: ListChecks,
}

/** A tab's name. */
export function bucketLabel(t: TFunction, bucket: Bucket): string {
  switch (bucket) {
    case 'overdue': return t('crm.tasks.tab_overdue', 'Overdue')
    case 'today': return t('crm.tasks.tab_today', 'Today')
    case 'upcoming': return t('crm.tasks.tab_upcoming', 'Upcoming')
    default: return t('crm.tasks.tab_done', 'Done')
  }
}

/** A form problem in our words. */
export function taskProblem(t: TFunction, problem: string | undefined): string | undefined {
  switch (problem) {
    case 'required': return t('crm.tasks.problem_required', 'Give the task a title.')
    case 'too_long': return t('crm.tasks.problem_too_long', 'This is too long.')
    case 'invalid': return t('crm.tasks.problem_invalid', 'This is not a valid date or time.')
    case 'needs_date': return t('crm.tasks.problem_needs_date', 'Pick a day for this time.')
    default: return undefined
  }
}
