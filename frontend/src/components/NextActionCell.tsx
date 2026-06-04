/**
 * Single-line "next action" cell for the leads list.
 *
 * Replaces the boxed `NextTaskCard` chrome with a clean icon + title +
 * relative-due trio. Empty rows collapse to a tiny `+ Add` ghost link
 * that only appears on row hover — kills the dashed-bordered placeholder
 * that previously took ~30px of vertical room on every row.
 *
 * Due styling:
 *   • overdue → red
 *   • today   → amber
 *   • future  → gray
 *
 * Hover-reveal `+ Add` only renders when there is no task; once a task
 * exists the cell is non-interactive (click handlers belong on the row
 * itself to open the inquiry drawer).
 */

import React from 'react'
import {
  Phone, Mail, MessageCircle, Video, Calendar, ClipboardList,
  CheckSquare, Plus,
} from 'lucide-react'

type RelTone = 'red' | 'amber' | 'gray'

interface NextTaskShape {
  next_task_type?: string | null
  next_task_due?: string | null
  next_task_notes?: string | null
  next_task_completed?: boolean | null
}

export interface NextActionCellProps {
  inquiry: NextTaskShape
  onAdd?: () => void
  /** Optional t() so the cell can be localised; falls back to English. */
  t?: (key: string, opts?: any) => string
}

const TYPE_ICON_MAP: Record<string, React.ComponentType<any>> = {
  call: Phone,
  email: Mail,
  meeting: Calendar,
  whatsapp: MessageCircle,
  sms: MessageCircle,
  video_call: Video,
  follow_up: ClipboardList,
  send_proposal: ClipboardList,
  contract: ClipboardList,
  discovery: ClipboardList,
  demo: Video,
  site_visit: Calendar,
}

function iconFor(typeOrTitle?: string | null): React.ComponentType<any> {
  if (!typeOrTitle) return CheckSquare
  const k = typeOrTitle.toLowerCase().trim()
  // Map type slug straight if it matches; otherwise look for common verbs in
  // free-text titles ("Call Maria…", "Email Bob…").
  if (TYPE_ICON_MAP[k]) return TYPE_ICON_MAP[k]
  if (k.startsWith('call'))    return Phone
  if (k.startsWith('email'))   return Mail
  if (k.startsWith('meeting')) return Calendar
  if (k.includes('whatsapp'))  return MessageCircle
  if (k.includes('sms'))       return MessageCircle
  return CheckSquare
}

function relativeDue(due: string | null | undefined): { label: string; tone: RelTone } | null {
  if (!due) return null
  const ts = new Date(due).getTime()
  if (!Number.isFinite(ts)) return null
  const now = Date.now()
  const diffMs = ts - now
  const diffMin = Math.round(diffMs / 60_000)
  const diffH = Math.round(diffMs / 3_600_000)
  const diffD = Math.round(diffMs / 86_400_000)
  const absD = Math.abs(diffD)

  if (diffMs < 0) {
    // Overdue
    if (-diffMs < 3_600_000) return { label: `${-diffMin}m late`, tone: 'red' }
    if (-diffMs < 86_400_000) return { label: `${-diffH}h late`, tone: 'red' }
    return { label: `${absD}d late`, tone: 'red' }
  }
  if (diffH < 24) {
    if (diffH < 1) return { label: `in ${Math.max(1, diffMin)}m`, tone: 'amber' }
    return { label: `in ${diffH}h`, tone: 'amber' }
  }
  if (diffD < 7) return { label: `in ${diffD}d`, tone: 'gray' }
  return { label: `in ${diffD}d`, tone: 'gray' }
}

const toneClass: Record<RelTone, string> = {
  red: 'text-red-400',
  amber: 'text-amber-400',
  gray: 'text-gray-500',
}

export default function NextActionCell({ inquiry, onAdd, t }: NextActionCellProps) {
  const tr = t ?? ((_k: string, opts?: any) => opts?.defaultValue ?? '')

  // Completed state — explicit chip so the row reads "this is done, on
  // to the next" rather than ambiguous emptiness.
  if (inquiry.next_task_completed && inquiry.next_task_type) {
    return (
      <div className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400/80">
        <CheckSquare size={12} />
        <span className="truncate">{tr('inquiries.next_action.completed', { defaultValue: 'Task complete' })}</span>
      </div>
    )
  }

  // No task yet — hover-reveal `+ Add` ghost link.
  if (!inquiry.next_task_type) {
    if (!onAdd) return <span className="text-gray-700 text-xs">—</span>
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onAdd() }}
        data-row-noopen
        className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-primary-300 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all"
        title={tr('inquiries.next_action.add_tooltip', { defaultValue: 'Add a follow-up task' })}
      >
        <Plus size={12} />
        {tr('inquiries.next_action.add', { defaultValue: 'Add task' })}
      </button>
    )
  }

  const Icon = iconFor(inquiry.next_task_type)
  const rel = relativeDue(inquiry.next_task_due ?? null)

  return (
    <div className="inline-flex items-center gap-2 min-w-0 max-w-full">
      <Icon size={13} className="text-gray-400 flex-shrink-0" />
      <div className="min-w-0 flex flex-col">
        <span className="text-[12px] font-semibold text-gray-200 truncate leading-tight">
          {inquiry.next_task_type}
        </span>
        {rel && (
          <span className={`text-[10.5px] font-semibold leading-tight ${toneClass[rel.tone]}`}>
            {rel.label}
          </span>
        )}
      </div>
    </div>
  )
}
