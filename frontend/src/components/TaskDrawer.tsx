import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import {
  X, Phone, Mail, Calendar as CalendarIcon, FileText, ChevronRight,
  Building2, ListChecks,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../lib/api'

/**
 * Shared task editor drawer. Used by:
 *   • the standalone /tasks page (full create + edit)
 *   • the lead-detail Open Tasks panel (Plus button — create scoped to
 *     the current inquiry)
 *   • potentially the planner / corporate detail later
 *
 * Props:
 *   task            — existing task to edit (null = new)
 *   defaultInquiryId — preselect this inquiry on a fresh task (used
 *                      when opening from a lead-detail page)
 *   onClose          — close + cancel
 *   onSaved          — fired on successful create/update; host should
 *                      invalidate any task queries
 */

export interface TaskDrawerTask {
  id: number
  type: string
  title: string
  description: string | null
  due_at: string | null
  inquiry_id: number | null
}

interface Props {
  task: TaskDrawerTask | null
  defaultInquiryId?: number
  onClose: () => void
  onSaved: () => void
}

const TASK_TYPES: Record<string, { label: string; icon: any; color: string }> = {
  call:           { label: 'Call',           icon: Phone,        color: '#22d3ee' },
  email:          { label: 'Email',          icon: Mail,         color: '#a78bfa' },
  meeting:        { label: 'Meeting',        icon: CalendarIcon, color: '#fbbf24' },
  send_proposal:  { label: 'Send proposal',  icon: FileText,     color: '#34d399' },
  follow_up:      { label: 'Follow-up',      icon: ChevronRight, color: '#94a3b8' },
  site_visit:     { label: 'Site visit',     icon: Building2,    color: '#f472b6' },
  custom:         { label: 'Custom',         icon: ListChecks,   color: '#94a3b8' },
}

export function TaskDrawer({ task, defaultInquiryId, onClose, onSaved }: Props) {
  const isNew = !task
  const [type, setType] = useState(task?.type ?? 'follow_up')
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [dueAt, setDueAt] = useState(task?.due_at ? task.due_at.slice(0, 16) : '')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        type,
        title,
        description: description || null,
        due_at: dueAt || null,
      }
      if (isNew && defaultInquiryId) payload.inquiry_id = defaultInquiryId
      return isNew
        ? api.post('/v1/admin/tasks', payload)
        : api.put(`/v1/admin/tasks/${task!.id}`, payload)
    },
    onSuccess: () => {
      toast.success(isNew ? 'Task created' : 'Task updated')
      onSaved()
    },
    onError: () => toast.error('Save failed'),
  })

  const submit = () => {
    if (!title.trim()) {
      toast.error('Title is required')
      return
    }
    save.mutate()
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex justify-end"
      onClick={onClose}
    >
      <div
        className="bg-dark-surface border-l border-dark-border w-full max-w-md h-full flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-dark-border">
          <h2 className="text-lg font-bold text-white">{isNew ? 'New task' : 'Edit task'}</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-dark-surface2 text-t-secondary hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1.5 block">
              Type
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {Object.entries(TASK_TYPES).map(([key, m]) => {
                const active = type === key
                const Icon = m.icon
                return (
                  <button
                    key={key}
                    onClick={() => setType(key)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-md border text-[11px] font-bold transition ${
                      active ? 'text-black' : 'text-t-secondary border-dark-border hover:bg-dark-surface2'
                    }`}
                    style={active ? { background: m.color, borderColor: m.color } : {}}
                  >
                    <Icon size={14} />
                    {m.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1.5 block">
              Title
            </label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Send proposal · Follow up after site visit · …"
              autoFocus={isNew}
              className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm placeholder-t-secondary outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1.5 block">
              Notes (optional)
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              placeholder="Anything the agent picking this up should know."
              className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm placeholder-t-secondary outline-none focus:border-accent resize-none"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1.5 block">
              Due
            </label>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={e => setDueAt(e.target.value)}
              className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {QUICK_DUES.map(qd => (
                <button
                  key={qd.label}
                  onClick={() => setDueAt(qd.compute())}
                  className="text-[11px] px-2 py-1 rounded bg-dark-bg border border-dark-border text-t-secondary hover:text-white hover:border-dark-border/80"
                >
                  {qd.label}
                </button>
              ))}
            </div>
          </div>

          {(task?.inquiry_id ?? defaultInquiryId) && (
            <div className="bg-dark-bg border border-dark-border rounded-md p-3 text-xs text-t-secondary">
              <p className="font-semibold text-white mb-1">Linked inquiry</p>
              <Link
                to={`/inquiries/${task?.inquiry_id ?? defaultInquiryId}`}
                className="text-accent hover:underline"
                onClick={onClose}
              >
                Open inquiry #{task?.inquiry_id ?? defaultInquiryId} →
              </Link>
            </div>
          )}
        </div>

        <div className="border-t border-dark-border p-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-t-secondary hover:text-white">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={save.isPending || !title.trim()}
            className="bg-accent text-black font-bold rounded-md px-4 py-2 text-sm disabled:opacity-50 hover:bg-accent/90"
          >
            {save.isPending ? 'Saving…' : isNew ? 'Create' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

const QUICK_DUES = [
  {
    label: 'In 1h',
    compute: () => {
      const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); return toLocalDt(d)
    },
  },
  {
    label: 'Today 5pm',
    compute: () => {
      const d = new Date(); d.setHours(17, 0, 0, 0); return toLocalDt(d)
    },
  },
  {
    label: 'Tomorrow 9am',
    compute: () => {
      const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return toLocalDt(d)
    },
  },
  {
    label: 'In 1 week',
    compute: () => {
      const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(9, 0, 0, 0); return toLocalDt(d)
    },
  },
]

function toLocalDt(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
