import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  X, MoreVertical, Trash2, Loader2, Building2, ExternalLink,
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
  inquiryId: number | null
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
  open, inquiryId, onClose,
  onInquiryUpdated, onInquiryDeleted, onRequestCustomerDrawer,
}: Props) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('lead')
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const kebabRef = useRef<HTMLButtonElement>(null)

  // Reset state when the drawer opens for a new inquiry.
  useEffect(() => {
    if (open) {
      setTab('lead')
      setMenuOpen(false)
      setConfirmDelete(false)
    }
  }, [open, inquiryId])

  // Fetch the inquiry payload. We re-use the list row shape (server returns
  // the same eager-loaded relations on show).
  const inquiryQuery = useQuery<Inquiry>({
    queryKey: ['inquiry', inquiryId],
    queryFn: () => api.get(`/v1/admin/inquiries/${inquiryId}`).then(r => r.data?.data ?? r.data),
    enabled: open && inquiryId != null,
    staleTime: 30_000,
  })

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

  const inq = inquiryQuery.data
  const loading = inquiryQuery.isLoading

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
      qc.invalidateQueries({ queryKey: ['inquiry', inquiryId] })
      qc.invalidateQueries({ queryKey: ['inquiries'] })
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
      qc.invalidateQueries({ queryKey: ['inquiry', inquiryId] })
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
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex justify-start"
        onClick={() => { if (!loading && !confirmDelete) onClose() }}
      >
        <div
          className="bg-dark-surface border-r border-dark-border w-full max-w-2xl h-full flex flex-col shadow-2xl animate-in slide-in-from-left duration-150"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 p-4 border-b border-dark-border">
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center text-base font-bold text-black flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #f5d782 0%, #c9a84c 100%)' }}
            >
              {loading ? <Loader2 size={16} className="animate-spin text-black/70" /> : initial}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-white truncate">
                  {loading ? t('inquiryDrawer.loading', 'Loading…') : name}
                </h2>
                {statusStr && (
                  <span
                    className={`inline-flex items-center text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${statusCls}`}
                    style={stageColor ? { background: `${stageColor}22`, color: stageColor, borderColor: `${stageColor}55` } : undefined}
                  >
                    {statusStr}
                  </span>
                )}
                {inq?.priority && inq.priority !== 'Medium' && (
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                    inq.priority === 'High'
                      ? 'bg-red-500/15 text-red-300 border-red-500/40'
                      : 'bg-white/[0.04] text-gray-400 border-white/10'
                  }`}>
                    {inq.priority}
                  </span>
                )}
              </div>
              {(guest?.company || guest?.email) && (
                <p className="text-xs text-t-secondary truncate mt-0.5 flex items-center gap-2">
                  {guest?.company && <span className="inline-flex items-center gap-1"><Building2 size={11} /> {guest.company}</span>}
                  {guest?.email && <span className="inline-flex items-center gap-1"><Mail size={11} /> {guest.email}</span>}
                </p>
              )}
            </div>

            <div className="relative">
              <button
                ref={kebabRef}
                onClick={() => setMenuOpen(v => !v)}
                className="p-2 rounded-md hover:bg-white/[0.06] text-t-secondary hover:text-white"
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
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-md hover:bg-white/[0.06] text-t-secondary hover:text-white"
              aria-label={t('inquiryDrawer.close', 'Close')}
            >
              <X size={16} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 px-4 pt-3 border-b border-dark-border">
            {([
              { key: 'lead' as const,     label: t('inquiryDrawer.tabs.lead', 'Lead') },
              { key: 'customer' as const, label: t('inquiryDrawer.tabs.customer', 'Customer') },
              { key: 'activity' as const, label: t('inquiryDrawer.tabs.activity', 'Activity') },
            ]).map(x => {
              const active = tab === x.key
              return (
                <button
                  key={x.key}
                  onClick={() => setTab(x.key)}
                  className={`px-3 py-2 text-xs font-semibold rounded-t -mb-px border-b-2 transition-colors ${
                    active
                      ? 'text-white border-primary-500'
                      : 'text-t-secondary border-transparent hover:text-white'
                  }`}
                >
                  {x.label}
                </button>
              )
            })}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading && (
              <div className="flex items-center justify-center py-10 text-t-secondary text-sm">
                <Loader2 size={18} className="animate-spin mr-2" /> {t('inquiryDrawer.loading', 'Loading…')}
              </div>
            )}

            {!loading && inq && tab === 'lead' && (
              <div className="space-y-5">
                {/* Pipeline / stage */}
                <Section title={t('inquiryDrawer.lead.pipeline', 'Pipeline')} icon={<Tag size={12} />}>
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
                <Section title={t('inquiryDrawer.lead.opportunity', 'Opportunity')} icon={<DollarSign size={12} />}>
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
                <Section title={t('inquiryDrawer.lead.stay', 'Stay')} icon={<CalendarDays size={12} />}>
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
                <Section title={t('inquiryDrawer.lead.notes', 'Notes')} icon={<FileText size={12} />}>
                  <EditableField
                    value={inq.notes ?? null}
                    variant="textarea"
                    onSave={saveInq('notes')}
                    placeholder={t('inquiryDrawer.placeholders.notes', 'Anything the team should know about this lead…') as string}
                    label={t('inquiryDrawer.lead.notes', 'Notes')}
                  />
                </Section>

                {/* AI win probability — read-only badge if present */}
                {inq.ai_win_probability != null && (
                  <Section title={t('inquiryDrawer.lead.ai_insight', 'AI insight')} icon={<Sparkles size={12} />}>
                    <p className="text-sm text-gray-300">
                      {t('inquiryDrawer.lead.ai_win_prob', 'Win probability')}:{' '}
                      <span className="text-white font-semibold">{Math.round((inq.ai_win_probability ?? 0) * 100)}%</span>
                    </p>
                  </Section>
                )}
              </div>
            )}

            {!loading && inq && tab === 'customer' && (
              <div className="space-y-5">
                {!guest?.id && (
                  <div className="text-sm text-t-secondary italic">
                    {t('inquiryDrawer.customer.no_guest', 'No customer linked to this lead.')}
                  </div>
                )}
                {guest?.id && (
                  <>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white">
                        {t('inquiryDrawer.customer.profile', 'Customer profile')}
                      </h3>
                      <button
                        onClick={() => onRequestCustomerDrawer?.(guest.id!)}
                        className="text-[11px] text-primary-400 hover:text-primary-300 inline-flex items-center gap-1"
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

                    {/* Customer notes — full width */}
                    <Field label={t('inquiryDrawer.customer.notes', 'Customer notes')}>
                      <EditableField
                        value={guest.notes ?? null}
                        variant="textarea"
                        onSave={saveGuest('notes')}
                        placeholder={t('inquiryDrawer.placeholders.customer_notes', 'Preferences, allergies, history…') as string}
                        label={t('inquiryDrawer.customer.notes', 'Customer notes')}
                      />
                    </Field>

                    {/* Quick contact actions */}
                    <div className="flex items-center gap-2 pt-2">
                      {guest.email && (
                        <a href={`mailto:${guest.email}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-dark-bg border border-dark-border text-xs text-gray-300 hover:bg-white/[0.06]">
                          <Mail size={12} /> {t('inquiryDrawer.customer.email_btn', 'Email')}
                        </a>
                      )}
                      {guest.phone && (
                        <a href={`tel:${guest.phone}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-dark-bg border border-dark-border text-xs text-gray-300 hover:bg-white/[0.06]">
                          <Phone size={12} /> {t('inquiryDrawer.customer.call_btn', 'Call')}
                        </a>
                      )}
                      {customerHref && (
                        <a href={customerHref} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-dark-bg border border-dark-border text-xs text-gray-300 hover:bg-white/[0.06]">
                          <Globe size={12} /> {t('inquiryDrawer.customer.profile_btn', 'Profile')}
                        </a>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {!loading && tab === 'activity' && (
              <div className="text-sm text-t-secondary italic flex flex-col items-center justify-center py-12">
                <Sparkles size={20} className="text-primary-500/60 mb-2" />
                {t('inquiryDrawer.activity.coming_soon', 'Activity timeline coming soon')}
                <span className="text-[11px] text-gray-600 mt-1">
                  {t('inquiryDrawer.activity.hint', 'Calls, emails, notes and stage changes will show up here.')}
                </span>
              </div>
            )}
          </div>

          {/* Footer */}
          {!loading && inq && (
            <div className="border-t border-dark-border px-4 py-2.5 flex items-center justify-between text-[11px] text-t-secondary">
              <div className="flex items-center gap-3">
                {inq.last_contacted_at && (
                  <span>{t('inquiryDrawer.footer.last_contact', 'Last contact')}: {new Date(inq.last_contacted_at).toLocaleDateString()}</span>
                )}
                {inq.created_at && (
                  <span>{t('inquiryDrawer.footer.created', 'Created')}: {new Date(inq.created_at).toLocaleDateString()}</span>
                )}
              </div>
              <button
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1 text-red-400 hover:text-red-300"
              >
                <Trash2 size={12} /> {t('inquiryDrawer.footer.delete', 'Delete lead')}
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

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold flex items-center gap-1.5">
        {icon} {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}
