import type { TFunction } from 'i18next'
import type { LucideIcon } from 'lucide-react'
import { ArrowRightLeft, CheckCircle2, Mail, MessageCircle, NotebookPen, Paperclip, Phone, Sparkles, Users } from 'lucide-react'

/** A timeline line's icon (the types CrmActivityFeed::TYPES lists; anything else is the system's). */
export function activityIcon(type: string): LucideIcon {
  switch (type) {
    case 'note': return NotebookPen
    case 'call': return Phone
    case 'email': return Mail
    case 'meeting': return Users
    case 'chat': return MessageCircle
    case 'status_change': return ArrowRightLeft
    case 'task_completed': return CheckCircle2
    case 'file': return Paperclip
    default: return Sparkles
  }
}

/** A timeline line's kind, in the person's language. */
export function activityLabel(t: TFunction, type: string): string {
  switch (type) {
    case 'note': return t('crm.today.kind.note', 'Note')
    case 'call': return t('crm.today.kind.call', 'Call')
    case 'email': return t('crm.today.kind.email', 'Email')
    case 'meeting': return t('crm.today.kind.meeting', 'Meeting')
    case 'chat': return t('crm.today.kind.chat', 'Chat')
    case 'status_change': return t('crm.today.kind.status_change', 'Stage changed')
    case 'task_completed': return t('crm.today.kind.task_completed', 'Task done')
    case 'file': return t('crm.today.kind.file', 'File')
    default: return t('crm.today.kind.system', 'Update')
  }
}
