import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  X, Phone, Mail, Calendar as CalendarIcon, FileText, ChevronRight,
  Building2, ListChecks, MessageCircle, MessageSquare, Video,
  Sparkles, Pen, HelpCircle, Flag, Clock, Repeat,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import { CustomFieldsForm } from './CustomFields'

/**
 * Shared task editor drawer. Used by:
 *   • the lead-detail Open Tasks panel
 *   • the Inquiries page row "+ Add task" / Edit
 *   • the Lead Detail TaskDrawer
 *
 * Drawer style mirrors the Planner's task drawer: chunky icon-grid
 * type picker → title → priority chips → date chips → start-time
 * slot grid → duration chips → repeat chips → notes. Priority,
 * start_time, duration_minutes and recurring persist into the task's
 * `custom_data` jsonb so we don't need a schema migration on `tasks`.
 */

export interface TaskDrawerTask {
  id: number
  type: string
  title: string
  description: string | null
  due_at: string | null
  inquiry_id: number | null
  custom_data?: Record<string, any> | null
}

interface Props {
  task: TaskDrawerTask | null
  defaultInquiryId?: number
  onClose: () => void
  onSaved: () => void
}

// Expanded type catalog — matches TaskController validation list.
// Order: communication channels first, then sales rituals, then catch-all.
const TASK_TYPES: Record<string, { label: string; icon: any; color: string }> = {
  call:           { label: 'Call',          icon: Phone,         color: '#22d3ee' },
  email:          { label: 'Email',         icon: Mail,          color: '#a78bfa' },
  whatsapp:       { label: 'WhatsApp',      icon: MessageCircle, color: '#25D366' },
  sms:            { label: 'SMS',           icon: MessageSquare, color: '#8b5cf6' },
  video_call:     { label: 'Video',         icon: Video,         color: '#06b6d4' },
  meeting:        { label: 'Meeting',       icon: CalendarIcon,  color: '#fbbf24' },
  site_visit:     { label: 'Site visit',    icon: Building2,     color: '#f472b6' },
  demo:           { label: 'Demo',          icon: Sparkles,      color: '#fb923c' },
  send_proposal:  { label: 'Proposal',      icon: FileText,      color: '#34d399' },
  contract:       { label: 'Contract',      icon: Pen,           color: '#10b981' },
  discovery:      { label: 'Discovery',     icon: HelpCircle,    color: '#60a5fa' },
  follow_up:      { label: 'Follow-up',     icon: ChevronRight,  color: '#94a3b8' },
  custom:         { label: 'Custom',        icon: ListChecks,    color: '#9ca3af' },
}

const PRIORITIES: { key: 'low' | 'normal' | 'high'; label: string; tone: string }[] = [
  { key: 'low',    label: 'Low',    tone: 'bg-gray-500/15 text-gray-300 border-gray-500/30' },
  { key: 'normal', label: 'Normal', tone: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
  { key: 'high',   label: 'High',   tone: 'bg-red-500/15 text-red-300 border-red-500/40' },
]

const DURATIONS: { mins: number; label: string }[] = [
  { mins: 15,  label: '15m' }, { mins: 30,  label: '30m' }, { mins: 45,  label: '45m' },
  { mins: 60,  label: '1h'  }, { mins: 90,  label: '1.5h' }, { mins: 120, label: '2h' },
  { mins: 240, label: '4h'  },
]

const REPEAT_OPTIONS: { key: 'none' | 'daily' | 'weekly' | 'monthly'; label: string }[] = [
  { key: 'none',    label: 'No repeat' },
  { key: 'daily',   label: 'Daily' },
  { key: 'weekly',  label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
]

// 30-min slot grid 06:00 → 22:00. Mirrors Planner.tsx.
const TIME_SLOTS: string[] = (() => {
  const slots: string[] = []
  for (let h = 6; h <= 22; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`)
    if (h < 22) slots.push(`${String(h).padStart(2, '0')}:30`)
  }
  return slots
})()

const pad = (n: number) => String(n).padStart(2, '0')
const fmtDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const formatSlotLabel = (slot: string) => {
  const [h, m] = slot.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const hh = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${hh}${ampm}` : `${hh}:${pad(m)}${ampm}`
}

/** Parse an existing due_at (ISO or local datetime-local) → date + slot. */
function splitDueAt(dueAt: string | null): { date: string; slot: string } {
  if (!dueAt) return { date: '', slot: '' }
  const d = new Date(dueAt)
  if (isNaN(d.getTime())) return { date: '', slot: '' }
  return { date: fmtDateInput(d), slot: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
}

/** Combine a date + slot back into a local datetime-local string. */
function joinDueAt(date: string, slot: string): string | null {
  if (!date) return null
  if (!slot) return `${date}T00:00`
  return `${date}T${slot}`
}

export function TaskDrawer({ task, defaultInquiryId, onClose, onSaved }: Props) {
  const { t } = useTranslation()
  const isNew = !task
  const initialSplit = splitDueAt(task?.due_at ?? null)

  const [type, setType]             = useState(task?.type ?? 'follow_up')
  const [title, setTitle]           = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [date, setDate]             = useState(initialSplit.date)
  const [slot, setSlot]             = useState(initialSplit.slot)
  const [priority, setPriority]     = useState<'low' | 'normal' | 'high'>(
    (task?.custom_data?.priority as any) ?? 'normal',
  )
  const [duration, setDuration]     = useState<number | null>(
    (task?.custom_data?.duration_minutes as number) ?? null,
  )
  const [repeat, setRepeat]         = useState<'none' | 'daily' | 'weekly' | 'monthly'>(
    (task?.custom_data?.recurring as any) ?? 'none',
  )
  const [customData, setCustomData] = useState<Record<string, any>>(
    () => {
      const cd = { ...(task?.custom_data ?? {}) }
      delete cd.priority; delete cd.duration_minutes; delete cd.recurring
      return cd
    },
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const setDateOffset = (days: number) => {
    const d = new Date(); d.setDate(d.getDate() + days)
    setDate(fmtDateInput(d))
  }

  const save = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        type,
        title,
        description: description || null,
        due_at: joinDueAt(date, slot),
        custom_data: {
          ...customData,
          priority,
          duration_minutes: duration,
          recurring: repeat === 'none' ? null : repeat,
        },
      }
      if (isNew && defaultInquiryId) payload.inquiry_id = defaultInquiryId
      return isNew
        ? api.post('/v1/admin/tasks', payload)
        : api.put(`/v1/admin/tasks/${task!.id}`, payload)
    },
    onSuccess: () => {
      toast.success(isNew ? t('taskDrawer.toasts.created', 'Task created') : t('taskDrawer.toasts.updated', 'Task updated'))
      onSaved()
    },
    onError: () => toast.error(t('taskDrawer.toasts.save_failed', 'Save failed')),
  })

  const submit = () => {
    if (!title.trim()) {
      toast.error(t('taskDrawer.toasts.title_required', 'Title is required'))
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
          <h2 className="text-lg font-bold text-white">{isNew ? t('taskDrawer.title_new', 'New task') : t('taskDrawer.title_edit', 'Edit task')}</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-dark-surface2 text-t-secondary hover:text-white">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Type icon grid */}
          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1.5 block">
              {t('taskDrawer.labels.type', 'Type')}
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
              {Object.entries(TASK_TYPES).map(([key, m]) => {
                const active = type === key
                const Icon = m.icon
                return (
                  <button
                    key={key} type="button"
                    onClick={() => setType(key)}
                    className={`flex flex-col items-center gap-1 p-2 rounded-md border text-[11px] font-bold transition ${
                      active ? 'text-black' : 'text-t-secondary border-dark-border hover:bg-dark-surface2'
                    }`}
                    style={active ? { background: m.color, borderColor: m.color } : {}}
                  >
                    <Icon size={14} />
                    {t(`tasks.types.${key}`, m.label)}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1.5 block">
              {t('taskDrawer.labels.title', 'Title')}
            </label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t('taskDrawer.placeholders.title', 'Send proposal · Follow up after site visit · …')}
              autoFocus={isNew}
              className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm placeholder-t-secondary outline-none focus:border-accent"
            />
          </div>

          {/* Priority */}
          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1.5 flex items-center gap-1.5">
              <Flag size={11} /> {t('taskDrawer.labels.priority', 'Priority')}
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {PRIORITIES.map(p => {
                const active = priority === p.key
                return (
                  <button key={p.key} type="button" onClick={() => setPriority(p.key)}
                    className={`px-3 py-2 rounded-md text-xs font-semibold border transition ${
                      active ? p.tone : 'bg-dark-bg border-dark-border text-t-secondary hover:bg-dark-surface2'
                    }`}>
                    {t(`taskDrawer.priority.${p.key}`, p.label)}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1.5 flex items-center gap-1.5">
              <CalendarIcon size={11} /> {t('taskDrawer.labels.date', 'Date')}
            </label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <div className="flex gap-1.5 mt-2 flex-wrap">
              <button type="button" onClick={() => setDateOffset(0)} className="text-[11px] px-2 py-1 rounded bg-dark-bg border border-dark-border text-t-secondary hover:text-white">{t('taskDrawer.date_quick.today', 'Today')}</button>
              <button type="button" onClick={() => setDateOffset(1)} className="text-[11px] px-2 py-1 rounded bg-dark-bg border border-dark-border text-t-secondary hover:text-white">{t('taskDrawer.date_quick.tomorrow', 'Tomorrow')}</button>
              <button type="button" onClick={() => setDateOffset(2)} className="text-[11px] px-2 py-1 rounded bg-dark-bg border border-dark-border text-t-secondary hover:text-white">{t('taskDrawer.date_quick.in_2_days', 'In 2 days')}</button>
              <button type="button" onClick={() => setDateOffset(7)} className="text-[11px] px-2 py-1 rounded bg-dark-bg border border-dark-border text-t-secondary hover:text-white">{t('taskDrawer.date_quick.next_week', 'Next week')}</button>
            </div>
          </div>

          {/* Start time slot grid */}
          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1.5 flex items-center gap-1.5">
              <Clock size={11} /> {t('taskDrawer.labels.start_time', 'Start time')}
            </label>
            <div className="bg-dark-bg border border-dark-border rounded-md p-2 max-h-40 overflow-y-auto">
              <div className="grid grid-cols-6 gap-1">
                {TIME_SLOTS.map(s => {
                  const active = slot === s
                  return (
                    <button key={s} type="button" onClick={() => setSlot(active ? '' : s)}
                      className={`px-1.5 py-1 rounded text-[11px] font-medium transition ${
                        active ? 'bg-primary-600 text-white' : 'text-t-secondary hover:bg-dark-surface2'
                      }`}>
                      {formatSlotLabel(s)}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1.5 block">
              {t('taskDrawer.labels.duration', 'Duration')}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DURATIONS.map(d => {
                const active = duration === d.mins
                return (
                  <button key={d.mins} type="button" onClick={() => setDuration(active ? null : d.mins)}
                    className={`px-3 py-1.5 rounded-md border text-xs font-semibold transition ${
                      active ? 'bg-accent text-black border-accent' : 'bg-dark-bg border-dark-border text-t-secondary hover:text-white'
                    }`}>
                    {d.label}
                  </button>
                )
              })}
              <button type="button" onClick={() => setDuration(null)}
                className="px-2 py-1.5 text-[11px] text-t-secondary hover:text-white">
                {t('taskDrawer.duration_clear', 'Clear')}
              </button>
            </div>
          </div>

          {/* Repeat */}
          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1.5 flex items-center gap-1.5">
              <Repeat size={11} /> {t('taskDrawer.labels.repeat', 'Repeat')}
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {REPEAT_OPTIONS.map(r => {
                const active = repeat === r.key
                return (
                  <button key={r.key} type="button" onClick={() => setRepeat(r.key)}
                    className={`px-2 py-1.5 rounded-md border text-[11px] font-semibold transition ${
                      active ? 'bg-accent/15 border-accent/50 text-accent' : 'bg-dark-bg border-dark-border text-t-secondary hover:bg-dark-surface2'
                    }`}>
                    {t(`taskDrawer.repeat.${r.key}`, r.label)}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1.5 block">
              {t('taskDrawer.labels.notes', 'Notes (optional)')}
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder={t('taskDrawer.placeholders.notes', 'Anything the staff picking this up should know.')}
              className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm placeholder-t-secondary outline-none focus:border-accent resize-none"
            />
          </div>

          <CustomFieldsForm
            entity="task"
            values={customData}
            onChange={setCustomData}
            inputClassName="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm placeholder-t-secondary outline-none focus:border-accent"
            layout="stack"
          />

          {(task?.inquiry_id ?? defaultInquiryId) && (
            <div className="bg-dark-bg border border-dark-border rounded-md p-3 text-xs text-t-secondary">
              <p className="font-semibold text-white mb-1">{t('taskDrawer.linked_inquiry', 'Linked inquiry')}</p>
              <Link
                to={`/inquiries/${task?.inquiry_id ?? defaultInquiryId}`}
                className="text-accent hover:underline"
                onClick={onClose}
              >
                {t('taskDrawer.open_inquiry', { id: task?.inquiry_id ?? defaultInquiryId, defaultValue: 'Open inquiry #{{id}} →' })}
              </Link>
            </div>
          )}
        </div>

        <div className="border-t border-dark-border p-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-t-secondary hover:text-white">
            {t('taskDrawer.actions.cancel', 'Cancel')}
          </button>
          <button
            onClick={submit}
            disabled={save.isPending || !title.trim()}
            className="bg-accent text-black font-bold rounded-md px-4 py-2 text-sm disabled:opacity-50 hover:bg-accent/90"
          >
            {save.isPending ? t('taskDrawer.actions.saving', 'Saving…')
              : isNew ? t('taskDrawer.actions.create', 'Create')
              : t('taskDrawer.actions.save', 'Save')}
          </button>
        </div>
      </div>
    </div>
  )
}
