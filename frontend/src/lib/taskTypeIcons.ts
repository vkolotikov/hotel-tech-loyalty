import {
  Building2, CalendarDays, ChevronRight, FileSignature, FileText, HelpCircle, ListChecks, Mail, MessageCircle,
  MessageSquare, Phone, Sparkles, Video, type LucideIcon,
} from 'lucide-react'
import type { TaskType } from './taskForm'

/** Each task type's icon, one map for HexaTech CRM and the full admin (looked up where it is drawn). */
export const TASK_ICONS: Record<TaskType, LucideIcon> = {
  call: Phone, email: Mail, whatsapp: MessageCircle, sms: MessageSquare, video_call: Video, meeting: CalendarDays,
  site_visit: Building2, demo: Sparkles, send_proposal: FileText, contract: FileSignature, discovery: HelpCircle,
  follow_up: ChevronRight, custom: ListChecks,
}
