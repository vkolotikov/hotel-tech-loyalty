import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  X, MoreVertical, Trash2, Building2, ExternalLink,
  CalendarDays, DollarSign, Tag, UserCircle2, FileText, Sparkles, Mail, Phone, Globe,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import EditableField from './EditableField'
import DeleteConfirmModal from './DeleteConfirmModal'

/**
 * InquiryDrawer — left-side slide panel showing a single lead's full detail
 * with inline edit for both the lead AND the linked customer.
 *
 * Mirrors CustomerDrawer's pattern (TanStack Query for fetch, optimistic
 * inline saves, kebab + delete-impact modal) but slides from the LEFT so it
 * can coexist with the right-side CustomerDrawer when both are open.
 *
 * Lead tab — stage, priority, value, dates, source, owner, notes (all editable).
 * Customer tab — guest profile via inline EditableField + "Open customer drawer".
 * Activity tab — stub (Coming soon).
 *
 * Replaces the in-list accordion + the broken "Open full detail" link.
 */

interface Guest {
  id: number
  full_name?: string | null
  email?: string | null
  phone?: string | null
  mobile?: string | null
  company?: string | null
  position_title?: string | null
  vip_level?: string | null
  nationality?: string | null
  country?: string | null
  notes?: string | null
  member_id?: number | null
}

interface PipelineStage { kind?: string; color?: string | null; name?: string | null }

interface Inquiry {
  id: number
  status?: string | null
  priority?: string | null
  total_value?: number | null
  check_in?: string | null
  check_out?: string | null
  num_rooms?: number | null
  room_type_requested?: string | null
  inquiry_type?: string | null
  source?: string | null
  assigned_to?: string | null
  notes?: string | null
  next_task_type?: string | null
  next_task_due?: string | null
  next_task_notes?: string | null
  next_task_completed?: boolean | null
  pipeline_stage?: PipelineStage | null
  guest?: Guest | null
  property?: { id?: number; name?: string | null } | null
  brand_id?: number | null
  ai_win_probability?: number | null
  created_at?: string | null
  last_contacted_at?: string | null
}

interface DeleteImpact {
  activities?: number
  tasks?: number
  attachments?: number
  reservations?: number
  warnings?: string[]
}

interface Props {
  open: boolean
  /**
   * The lead row to display. Pass the inquiry directly from the
   * already-loaded list query — we deliberately do NOT re-fetch via
   * GET /v1/admin/inquiries/:id because that endpoint 404s in prod
   * (route binding issue) and we already have the data in cache.
   */
  inquiry: Inquiry | null | undefined
  onClose: () => void
  /** Called when any inquiry field is saved — caller invalidates list. */
  onInquiryUpdated?: (id: number) => void
  /** Called when this lead is deleted. */
  onInquiryDeleted?: (id: number) => void
  /** Called when the user clicks "Open customer drawer" inside the Customer tab. */
  onRequestCustomerDrawer?: (guestId: number) => void
}

type Tab = 'lead' | 'customer' | 'activity'

const STATUS_OPTIONS = [
  { value: 'New',           label: 'New' },
  { value: 'Responded',     label: 'Responded' },
  { value: 'Site Visit',    label: 'Site Visit' },
  { value: 'Proposal Sent', label: 'Proposal Sent' },
  { value: 'Negotiating',   label: 'Negotiating' },
  { value: 'Tentative',     label: 'Tentative' },
  { value: 'Confirmed',     label: 'Confirmed' },
  { value: 'Lost',          label: 'Lost' },
]

const PRIORITY_OPTIONS = [
  { value: 'Low',    label: 'Low' },
  { value: 'Medium', label: 'Medium' },
  { value: 'High',   label: 'High' },
]

const VIP_OPTIONS = [
  { value: 'Standard', label: 'Standard' },
  { value: 'Silver',   label: 'Silver' },
  { value: 'Gold',     label: 'Gold' },
  { value: 'Platinum', label: 'Platinum' },
  { value: 'Diamond',  label: 'Diamond' },
]

const STATUS_COLORS: Record<string, string> = {
  New:             'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Responded:       'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
  'Site Visit':    'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'Proposal Sent': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  Negotiating:     'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Tentative:       'bg-orange-500/20 text-orange-400 border-orange-500/30',
  Confirmed:       'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  Lost:            'bg-red-500/20 text-red-400 border-red-500/30',
}

export function InquiryDrawer({
  open, inquiry, onClose,
  onInquiryUpdated, onInquiryDeleted, onRequestCustomerDrawer,
}: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('lead')
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const kebabRef = useRef<HTMLButtonElement>(null)

  const inq = inquiry ?? null
  const inquiryId = inq?.id ?? null
  const loading = open && !inq // empty state when row is missing

  // Reset state when the drawer opens for a new inquiry.
  useEffect(() => {
    if (open) {
      setTab('lead')
      setMenuOpen(false)
      setConfirmDelete(false)
    }
  }, [open, inquiryId])

  // Best-effort blast-radius fetch — 404 is fine, modal just hides the list.
  const impactQuery = useQuery<DeleteImpact>({
    queryKey: ['inquiry-delete-impact', inquiryId],
    queryFn: async () => {
      try {
        const r = await api.get(`/v1/admin/inquiries/${inquiryId}/delete-impact`)
        return r.data?.data ?? r.data ?? {}
      } catch {
        return {}
      }
    },
    enabled: open && inquiryId != null && confirmDelete,
  })

  // ESC closes (unless we're loading or inside a sub-modal).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmDelete) setConfirmDelete(false)
        else if (!loading) onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, loading, confirmDelete, onClose])

  // Click-outside for the kebab menu.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (!kebabRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  // PUT one field at a time — partial-PUT contract verified for both
  // inquiries and guests endpoints. No need to send the full object.
  const updateInquiryMutation = useMutation({
    mutationFn: (patch: Partial<Inquiry>) =>
      api.put(`/v1/admin/inquiries/${inquiryId}`, patch).then(r => r.data),
    onSuccess: () => {
      // Invalidating the list query is enough — the drawer reads its
      // inquiry from the parent's already-loaded list, so the next
      // refetch will flow fresh data through the `inquiry` prop.
      qc.invalidateQueries({ queryKey: ['inquiries'] })
      qc.invalidateQueries({ queryKey: ['inquiries-today'] })
      qc.invalidateQueries({ queryKey: ['inquiries-kpis'] })
      if (inquiryId != null) onInquiryUpdated?.(inquiryId)
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || t('inquiryDrawer.toasts.save_failed', 'Save failed'))
    },
  })

  const updateGuestMutation = useMutation({
    mutationFn: (patch: Partial<Guest>) =>
      api.put(`/v1/admin/guests/${inq?.guest?.id}`, patch).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inquiries'] })
      qc.invalidateQueries({ queryKey: ['guest', inq?.guest?.id] })
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || t('inquiryDrawer.toasts.save_failed', 'Save failed'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/v1/admin/inquiries/${inquiryId}`).then(r => r.data),
    onSuccess: () => {
      toast.success(t('inquiryDrawer.toasts.deleted', 'Lead deleted'))
      qc.invalidateQueries({ queryKey: ['inquiries'] })
      if (inquiryId != null) onInquiryDeleted?.(inquiryId)
      setConfirmDelete(false)
      onClose()
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || t('inquiryDrawer.toasts.delete_failed', 'Delete failed'))
    },
  })

  const saveInq = (key: keyof Inquiry) => async (next: string | number | null) =>
    void await updateInquiryMutation.mutateAsync({ [key]: next as any } as Partial<Inquiry>)

  const saveGuest = (key: keyof Guest) => async (next: string | number | null) =>
    void await updateGuestMutation.mutateAsync({ [key]: next as any } as Partial<Guest>)

  if (!open) return null

  const guest = inq?.guest
  const name = guest?.full_name?.trim() || t('inquiryDrawer.unnamed', 'Unnamed lead')
  const initial = (name.match(/\b\w/g) || []).slice(0, 2).join('').toUpperCase() || 'L'
  const statusStr = inq?.status || ''
  const statusCls = STATUS_COLORS[statusStr] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  const stageColor = inq?.pipeline_stage?.color
  const customerHref = guest?.member_id
    ? `/members/${guest.member_id}?tab=crm`
    : guest?.id ? `/guests/${guest.id}` : null

  const impacts = impactQuery.data
    ? Object.entries(impactQuery.data)
        .filter(([k, v]) => k !== 'warnings' && Number(v) > 0)
        .map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`)
    : []

  return (
    <>
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex justify-end"
        onClick={() => { if (!confirmDelete) onClose() }}
      >
        <div
          className="bg-dark-surface border-l border-dark-border w-full max-w-2xl h-full flex flex-col shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header — layered gradient, larger avatar with glow */}
          <div
            className="relative flex items-start gap-4 p-5 border-b border-dark-border overflow-hidden"
            style={{
              background: stageColor
                ? `linear-gradient(135deg, ${stageColor}15 0%, transparent 60%), linear-gradient(180deg, rgba(255,255,255,0.025) 0%, transparent 100%)`
                : 'linear-gradient(180deg, rgba(255,255,255,0.025) 0%, transparent 100%)',
            }}
          >
            {/* decorative top accent line */}
            <div
              className="absolute top-0 left-0 right-0 h-px"
              style={{ background: stageColor ? `linear-gradient(90deg, transparent, ${stageColor}, transparent)` : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)' }}
            />
            <div className="relative flex-shrink-0">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold text-black"
                style={{ background: 'linear-gradient(135deg, #f5d782 0%, #c9a84c 100%)', boxShadow: '0 4px 16px rgba(201, 168, 76, 0.35)' }}
              >
                {initial}
              </div>
              {/* online ping if VIP */}
              {guest?.vip_level && guest.vip_level !== 'Standard' && (
                <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-400 border-2 border-dark-surface flex items-center justify-center">
                  <span className="text-[8px] font-black text-black">★</span>
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <h2 className="text-lg font-bold text-white truncate tracking-tight">
                  {name}
                </h2>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {statusStr && (
                  <span
                    className={`inline-flex items-center text-[10px] uppercase font-bold px-2.5 py-1 rounded-md border ${statusCls}`}
                    style={stageColor ? { background: `${stageColor}22`, color: stageColor, borderColor: `${stageColor}55` } : undefined}
                  >
                    {statusStr}
                  </span>
                )}
                {inq?.priority && inq.priority !== 'Medium' && (
                  <span className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-md border ${
                    inq.priority === 'High'
                      ? 'bg-red-500/15 text-red-300 border-red-500/40'
                      : 'bg-white/[0.04] text-gray-400 border-white/10'
                  }`}>
                    {inq.priority}
                  </span>
                )}
                {inq?.ai_win_probability != null && (
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold px-2.5 py-1 rounded-md border bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
                    <Sparkles size={9} /> {Math.round((inq.ai_win_probability ?? 0) * 100)}%
                  </span>
                )}
              </div>
              {(guest?.company || guest?.email) && (
                <div className="mt-2 flex items-center gap-3 text-xs text-t-secondary flex-wrap">
                  {guest?.company && <span className="inline-flex items-center gap-1.5"><Building2 size={11} className="text-gray-500" /> {guest.company}</span>}
                  {guest?.email && <span className="inline-flex items-center gap-1.5"><Mail size={11} className="text-gray-500" /> <span className="truncate max-w-[200px]">{guest.email}</span></span>}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 relative">
              <button
                ref={kebabRef}
                onClick={() => setMenuOpen(v => !v)}
                className="p-2 rounded-lg hover:bg-white/[0.06] text-gray-400 hover:text-white transition-colors"
                aria-label={t('inquiryDrawer.more_actions', 'More actions')}
              >
                <MoreVertical size={16} />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-1 w-60 bg-dark-bg border border-dark-border rounded-md shadow-xl z-10 py-1">
                  {guest?.id && (
                    <button
                      onClick={() => { setMenuOpen(false); onRequestCustomerDrawer?.(guest.id!) }}
                      className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 text-gray-300 hover:bg-white/[0.06]"
                    >
                      <UserCircle2 size={12} /> {t('inquiryDrawer.menu.edit_customer', 'Edit customer details')}
                    </button>
                  )}
                  {customerHref && (
                    <a
                      href={customerHref}
                      className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 text-gray-300 hover:bg-white/[0.06]"
                      onClick={() => setMenuOpen(false)}
                    >
                      <ExternalLink size={12} /> {t('inquiryDrawer.menu.open_customer_profile', 'Open full customer profile')}
                    </a>
                  )}
                  <div className="my-1 h-px bg-white/10" />
                  <button
                    onClick={() => { setMenuOpen(false); setConfirmDelete(true) }}
                    className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 size={12} /> {t('inquiryDrawer.menu.delete', 'Delete lead')}
                  </button>
                </div>
              )}
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-white/[0.06] text-gray-400 hover:text-white transition-colors"
                aria-label={t('inquiryDrawer.close', 'Close')}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Tabs — pill style, sticky to top of body */}
          <div className="px-5 py-3 border-b border-dark-border bg-dark-surface/95 backdrop-blur sticky top-0 z-10">
            <div className="inline-flex items-center gap-0.5 p-0.5 bg-dark-bg rounded-lg border border-dark-border">
              {([
                { key: 'lead' as const,     label: t('inquiryDrawer.tabs.lead', 'Lead'), icon: Tag },
                { key: 'customer' as const, label: t('inquiryDrawer.tabs.customer', 'Customer'), icon: UserCircle2 },
                { key: 'activity' as const, label: t('inquiryDrawer.tabs.activity', 'Activity'), icon: Sparkles },
              ]).map(x => {
                const active = tab === x.key
                const Icon = x.icon
                return (
                  <button
                    key={x.key}
                    onClick={() => setTab(x.key)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                      active
                        ? 'bg-primary-500 text-black shadow-sm'
                        : 'text-t-secondary hover:text-white hover:bg-white/[0.04]'
                    }`}
                  >
                    <Icon size={12} />
                    {x.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Body — generous padding + section cards */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            {!inq && (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-dark-bg border border-dark-border flex items-center justify-center mb-4">
                  <FileText size={28} className="text-gray-600" />
                </div>
                <p className="text-base font-bold text-white mb-1">
                  {t('inquiryDrawer.empty.title', 'Lead not available')}
                </p>
                <p className="text-xs text-gray-500 max-w-xs leading-relaxed">
                  {t('inquiryDrawer.empty.hint', 'The lead may have been deleted, archived, or filtered out of the current view.')}
                </p>
                <button
                  onClick={onClose}
                  className="mt-5 px-4 py-2 text-xs font-semibold rounded-lg bg-white/[0.04] border border-dark-border text-gray-300 hover:bg-white/[0.08] transition-colors"
                >
                  {t('inquiryDrawer.empty.close', 'Close panel')}
                </button>
              </div>
            )}

            {inq && tab === 'lead' && (
              <div className="space-y-4">
                {/* Pipeline / stage */}
                <Section title={t('inquiryDrawer.lead.pipeline', 'Pipeline')} icon={<Tag size={13} />} accent="#c9a84c">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t('inquiryDrawer.lead.status', 'Status')}>
                      <EditableField
                        value={inq.status ?? null}
                        variant="select"
                        options={STATUS_OPTIONS}
                        onSave={saveInq('status')}
                        label={t('inquiryDrawer.lead.status', 'Status')}
                      />
                    </Field>
                    <Field label={t('inquiryDrawer.lead.priority', 'Priority')}>
                      <EditableField
                        value={inq.priority ?? null}
                        variant="select"
                        options={PRIORITY_OPTIONS}
                        onSave={saveInq('priority')}
                        label={t('inquiryDrawer.lead.priority', 'Priority')}
                      />
                    </Field>
                  </div>
                </Section>

                {/* Stay / opportunity */}
                <Section title={t('inquiryDrawer.lead.opportunity', 'Opportunity')} icon={<DollarSign size={13} />} accent="#10b981">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t('inquiryDrawer.lead.value', 'Value')}>
                      <EditableField
                        value={inq.total_value ?? null}
                        variant="number"
                        onSave={saveInq('total_value')}
                        placeholder="0.00"
                        label={t('inquiryDrawer.lead.value', 'Value')}
                      />
                    </Field>
                    <Field label={t('inquiryDrawer.lead.source', 'Source')}>
                      <EditableField
                        value={inq.source ?? null}
                        variant="text"
                        onSave={saveInq('source')}
                        placeholder={t('inquiryDrawer.placeholders.source', 'Source…') as string}
                        label={t('inquiryDrawer.lead.source', 'Source')}
                      />
                    </Field>
                    <Field label={t('inquiryDrawer.lead.type', 'Inquiry type')}>
                      <EditableField
                        value={inq.inquiry_type ?? null}
                        variant="text"
                        onSave={saveInq('inquiry_type')}
                        placeholder={t('inquiryDrawer.placeholders.type', 'Type…') as string}
                        label={t('inquiryDrawer.lead.type', 'Inquiry type')}
                      />
                    </Field>
                    <Field label={t('inquiryDrawer.lead.owner', 'Owner')}>
                      <EditableField
                        value={inq.assigned_to ?? null}
                        variant="text"
                        onSave={saveInq('assigned_to')}
                        placeholder={t('inquiryDrawer.placeholders.owner', 'Assign…') as string}
                        label={t('inquiryDrawer.lead.owner', 'Owner')}
                      />
                    </Field>
                  </div>
                </Section>

                {/* Stay dates */}
                <Section title={t('inquiryDrawer.lead.stay', 'Stay')} icon={<CalendarDays size={13} />} accent="#3b82f6">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={t('inquiryDrawer.lead.check_in', 'Check-in')}>
                      <EditableField
                        value={inq.check_in ? inq.check_in.slice(0, 10) : null}
                        variant="date"
                        onSave={saveInq('check_in')}
                        label={t('inquiryDrawer.lead.check_in', 'Check-in')}
                      />
                    </Field>
                    <Field label={t('inquiryDrawer.lead.check_out', 'Check-out')}>
                      <EditableField
                        value={inq.check_out ? inq.check_out.slice(0, 10) : null}
                        variant="date"
                        onSave={saveInq('check_out')}
                        label={t('inquiryDrawer.lead.check_out', 'Check-out')}
                      />
                    </Field>
                    <Field label={t('inquiryDrawer.lead.num_rooms', 'Rooms')}>
                      <EditableField
                        value={inq.num_rooms ?? null}
                        variant="number"
                        onSave={saveInq('num_rooms')}
                        placeholder="1"
                        label={t('inquiryDrawer.lead.num_rooms', 'Rooms')}
                      />
                    </Field>
                    <Field label={t('inquiryDrawer.lead.room_type', 'Room type')}>
                      <EditableField
                        value={inq.room_type_requested ?? null}
                        variant="text"
                        onSave={saveInq('room_type_requested')}
                        placeholder={t('inquiryDrawer.placeholders.room_type', 'e.g. Deluxe Suite') as string}
                        label={t('inquiryDrawer.lead.room_type', 'Room type')}
                      />
                    </Field>
                  </div>
                </Section>

                {/* Notes */}
                <Section title={t('inquiryDrawer.lead.notes', 'Notes')} icon={<FileText size={13} />} accent="#a855f7">
                  <EditableField
                    value={inq.notes ?? null}
                    variant="textarea"
                    onSave={saveInq('notes')}
                    placeholder={t('inquiryDrawer.placeholders.notes', 'Anything the team should know about this lead…') as string}
                    label={t('inquiryDrawer.lead.notes', 'Notes')}
                  />
                </Section>

                {/* AI win probability — visual progress bar */}
                {inq.ai_win_probability != null && (
                  <Section title={t('inquiryDrawer.lead.ai_insight', 'AI insight')} icon={<Sparkles size={13} />} accent="#34d399">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-300">{t('inquiryDrawer.lead.ai_win_prob', 'Win probability')}</span>
                        <span className="text-white font-bold tabular-nums">{Math.round((inq.ai_win_probability ?? 0) * 100)}%</span>
                      </div>
                      <div className="h-1.5 bg-dark-bg rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.round((inq.ai_win_probability ?? 0) * 100)}%`,
                            background: 'linear-gradient(90deg, #10b981, #34d399)',
                          }}
                        />
                      </div>
                    </div>
                  </Section>
                )}
              </div>
            )}

            {inq && tab === 'customer' && (
              <div className="space-y-4">
                {!guest?.id && (
                  <div className="bg-dark-bg/40 border border-dark-border/60 rounded-xl p-6 text-center">
                    <UserCircle2 size={28} className="text-gray-700 mx-auto mb-2" />
                    <p className="text-sm text-gray-400 italic">
                      {t('inquiryDrawer.customer.no_guest', 'No customer linked to this lead.')}
                    </p>
                  </div>
                )}
                {guest?.id && (
                  <>
                    <Section title={t('inquiryDrawer.customer.profile', 'Customer profile')} icon={<UserCircle2 size={13} />} accent="#22d3ee">
                      <div className="-mt-1 flex justify-end">
                        <button
                          onClick={() => onRequestCustomerDrawer?.(guest.id!)}
                          className="text-[11px] text-primary-400 hover:text-primary-300 inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-primary-500/10 transition-colors"
                        >
                          <ExternalLink size={11} /> {t('inquiryDrawer.customer.open_full', 'Open in customer drawer')}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                      <Field label={t('inquiryDrawer.customer.full_name', 'Full name')}>
                        <EditableField
                          value={guest.full_name ?? null}
                          variant="text"
                          onSave={saveGuest('full_name')}
                          label={t('inquiryDrawer.customer.full_name', 'Full name')}
                        />
                      </Field>
                      <Field label={t('inquiryDrawer.customer.company', 'Company')}>
                        <EditableField
                          value={guest.company ?? null}
                          variant="text"
                          onSave={saveGuest('company')}
                          placeholder={t('inquiryDrawer.placeholders.company', 'Add company…') as string}
                          label={t('inquiryDrawer.customer.company', 'Company')}
                        />
                      </Field>
                      <Field label={t('inquiryDrawer.customer.email', 'Email')}>
                        <EditableField
                          value={guest.email ?? null}
                          variant="email"
                          onSave={saveGuest('email')}
                          placeholder="name@example.com"
                          label={t('inquiryDrawer.customer.email', 'Email')}
                        />
                      </Field>
                      <Field label={t('inquiryDrawer.customer.phone', 'Phone')}>
                        <EditableField
                          value={guest.phone ?? null}
                          variant="phone"
                          onSave={saveGuest('phone')}
                          placeholder="+1 555 0000"
                          label={t('inquiryDrawer.customer.phone', 'Phone')}
                        />
                      </Field>
                      <Field label={t('inquiryDrawer.customer.position', 'Position')}>
                        <EditableField
                          value={guest.position_title ?? null}
                          variant="text"
                          onSave={saveGuest('position_title')}
                          placeholder={t('inquiryDrawer.placeholders.position', 'Role…') as string}
                          label={t('inquiryDrawer.customer.position', 'Position')}
                        />
                      </Field>
                      <Field label={t('inquiryDrawer.customer.vip', 'VIP level')}>
                        <EditableField
                          value={guest.vip_level ?? null}
                          variant="select"
                          options={VIP_OPTIONS}
                          onSave={saveGuest('vip_level')}
                          label={t('inquiryDrawer.customer.vip', 'VIP level')}
                        />
                      </Field>
                      <Field label={t('inquiryDrawer.customer.country', 'Country')}>
                        <EditableField
                          value={guest.country ?? null}
                          variant="text"
                          onSave={saveGuest('country')}
                          placeholder={t('inquiryDrawer.placeholders.country', 'Country…') as string}
                          label={t('inquiryDrawer.customer.country', 'Country')}
                        />
                      </Field>
                      <Field label={t('inquiryDrawer.customer.nationality', 'Nationality')}>
                        <EditableField
                          value={guest.nationality ?? null}
                          variant="text"
                          onSave={saveGuest('nationality')}
                          placeholder={t('inquiryDrawer.placeholders.nationality', 'Nationality…') as string}
                          label={t('inquiryDrawer.customer.nationality', 'Nationality')}
                        />
                      </Field>
                    </div>

                    </Section>

                    <Section title={t('inquiryDrawer.customer.notes', 'Customer notes')} icon={<FileText size={13} />} accent="#a855f7">
                      <EditableField
                        value={guest.notes ?? null}
                        variant="textarea"
                        onSave={saveGuest('notes')}
                        placeholder={t('inquiryDrawer.placeholders.customer_notes', 'Preferences, allergies, history…') as string}
                        label={t('inquiryDrawer.customer.notes', 'Customer notes')}
                      />
                    </Section>

                    {/* Quick contact actions — modern button row */}
                    <div className="flex items-center gap-2">
                      {guest.email && (
                        <a href={`mailto:${guest.email}`} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-xs font-semibold text-blue-300 hover:bg-blue-500/20 transition-colors">
                          <Mail size={12} /> {t('inquiryDrawer.customer.email_btn', 'Email')}
                        </a>
                      )}
                      {guest.phone && (
                        <a href={`tel:${guest.phone}`} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-colors">
                          <Phone size={12} /> {t('inquiryDrawer.customer.call_btn', 'Call')}
                        </a>
                      )}
                      {customerHref && (
                        <a href={customerHref} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-xs font-semibold text-gray-300 hover:bg-white/[0.08] transition-colors">
                          <Globe size={12} /> {t('inquiryDrawer.customer.profile_btn', 'Profile')}
                        </a>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {inq && tab === 'activity' && (
              <div className="bg-dark-bg/40 border border-dark-border/60 rounded-xl py-12 px-6 flex flex-col items-center justify-center text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style={{ background: 'rgba(34, 211, 238, 0.12)', border: '1px solid rgba(34, 211, 238, 0.3)' }}>
                  <Sparkles size={22} className="text-cyan-400" />
                </div>
                <p className="text-sm font-bold text-white mb-1">
                  {t('inquiryDrawer.activity.coming_soon', 'Activity timeline coming soon')}
                </p>
                <span className="text-xs text-gray-500 max-w-xs leading-relaxed">
                  {t('inquiryDrawer.activity.hint', 'Calls, emails, notes and stage changes will show up here.')}
                </span>
              </div>
            )}
          </div>

          {/* Footer */}
          {inq && (
            <div className="border-t border-dark-border px-5 py-3 flex items-center justify-between text-[11px] text-gray-500 bg-dark-surface/50">
              <div className="flex items-center gap-3">
                {inq.last_contacted_at && (
                  <span className="inline-flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-gray-600" />
                    {t('inquiryDrawer.footer.last_contact', 'Last contact')}: <span className="text-gray-400">{new Date(inq.last_contacted_at).toLocaleDateString()}</span>
                  </span>
                )}
                {inq.created_at && (
                  <span className="inline-flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-gray-600" />
                    {t('inquiryDrawer.footer.created', 'Created')}: <span className="text-gray-400">{new Date(inq.created_at).toLocaleDateString()}</span>
                  </span>
                )}
              </div>
              <button
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-red-400 hover:text-red-300 hover:bg-red-500/10 font-semibold transition-colors"
              >
                <Trash2 size={11} /> {t('inquiryDrawer.footer.delete', 'Delete lead')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      <DeleteConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => { await deleteMutation.mutateAsync() }}
        title={t('inquiryDrawer.delete.title', 'Delete lead?')}
        entityName={name}
        impacts={impacts}
        mode="simple"
        confirmLabel={t('inquiryDrawer.delete.confirm', 'Delete lead')}
      />
    </>
  )
}

export default InquiryDrawer

/* ───────────────────────── helpers ───────────────────────── */

function Section({ title, icon, accent = '#64748b', children }: { title: string; icon?: React.ReactNode; accent?: string; children: React.ReactNode }) {
  return (
    <div className="bg-dark-bg/40 border border-dark-border/60 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        {icon && (
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: `${accent}1a`, color: accent, border: `1px solid ${accent}33` }}
          >
            {icon}
          </div>
        )}
        <h3 className="text-[11px] uppercase tracking-wider text-gray-400 font-bold">
          {title}
        </h3>
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">{label}</label>
      {children}
    </div>
  )
}
