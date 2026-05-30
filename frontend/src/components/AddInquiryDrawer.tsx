import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  X, ArrowLeft, Loader2, Search, User as UserIcon, Plus, Mail, Phone,
  Building2, Bed, Banknote, FileText, Sparkles, ChevronDown, ChevronRight,
  CheckCircle2, AlertCircle,
} from 'lucide-react'
import { api } from '../lib/api'
import { CustomFieldsForm, extractCustomFieldErrors } from './CustomFields'
import toast from 'react-hot-toast'

/**
 * AddInquiryDrawer — left-side slide drawer for creating a new lead.
 *
 * Replaces the old centered modal. Key UX differences:
 *
 *  - Left-side drawer (creation flow). The detail drawers (Customer /
 *    InquiryDrawer) live on the right; left/right gives the user a
 *    consistent mental model — "new things in, existing things out".
 *  - Sectioned design with colored icon tiles mirroring InquiryDrawer:
 *    Customer → Stay → Deal → Event (MICE) → Notes & custom fields.
 *  - Customer section has a two-pill toggle: Existing | New. Existing
 *    runs an inline search against /v1/admin/guests. New collects
 *    name/email/phone/company and creates the guest as part of the
 *    submit flow so the user never leaves the drawer.
 *  - Deal section collapsed by default (Advanced) since most leads get
 *    captured with just customer + property + stay details.
 *
 * Submit flow:
 *   1. If "New customer" path → POST /v1/admin/guests, get id.
 *   2. POST /v1/admin/inquiries with that guest_id (or the picked one).
 * Errors from either step surface as a toast; custom-field errors land
 * inline via extractCustomFieldErrors().
 */

const MICE_TYPES = ['Event/MICE', 'Conference', 'Wedding']

export type AddInquirySettings = {
  inquiry_statuses: string[]
  priorities: string[]
  inquiry_types: string[]
  room_types: string[]
  function_spaces: string[]
  lead_sources: string[]
  lead_owners: string[]
  currency_symbol: string
}

export type AddInquiryFieldCfg = {
  form: {
    check_in?: boolean
    check_out?: boolean
    num_rooms?: boolean
    inquiry_type?: boolean
    source?: boolean
    room_type?: boolean
    rate_offered?: boolean
    total_value?: boolean
    status?: boolean
    priority?: boolean
    assigned_to?: boolean
    special_requests?: boolean
    notes?: boolean
  }
}

interface Property {
  id: number
  name: string
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated: () => void
  properties: Property[]
  settings: AddInquirySettings
  fieldCfg: AddInquiryFieldCfg
}

type CustomerMode = 'existing' | 'new'

const EMPTY_INQUIRY = {
  property_id: '', inquiry_type: '', check_in: '', check_out: '',
  num_rooms: '', num_adults: '', num_children: '', room_type_requested: '',
  rate_offered: '', total_value: '', status: 'New', priority: 'Medium',
  assigned_to: '', source: '', special_requests: '', notes: '',
  event_name: '', event_pax: '', function_space: '', catering_required: false, av_required: false,
  custom_data: {} as Record<string, any>,
}

const EMPTY_NEW_CUSTOMER = { full_name: '', email: '', phone: '', company: '' }

export function AddInquiryDrawer({ open, onClose, onCreated, properties, settings, fieldCfg }: Props) {
  const qc = useQueryClient()

  // Customer side: which path + state
  const [customerMode, setCustomerMode] = useState<CustomerMode>('existing')
  const [pickedGuestId, setPickedGuestId] = useState<string>('')
  const [search, setSearch] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [newCustomer, setNewCustomer] = useState({ ...EMPTY_NEW_CUSTOMER })

  // Inquiry side
  const [form, setForm] = useState({ ...EMPTY_INQUIRY })
  const [cfErrors, setCfErrors] = useState<Record<string, string[]>>({})

  // Section collapse — keep stay open, deal collapsed by default
  const [dealOpen, setDealOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)

  const showMice = MICE_TYPES.includes(form.inquiry_type)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Reset state every time the drawer opens fresh
  useEffect(() => {
    if (!open) return
    setCustomerMode('existing')
    setPickedGuestId('')
    setSearch('')
    setSearchOpen(false)
    setNewCustomer({ ...EMPTY_NEW_CUSTOMER })
    setForm({ ...EMPTY_INQUIRY })
    setCfErrors({})
    setDealOpen(false)
    setNotesOpen(false)
  }, [open])

  // Existing-customer search
  const { data: guestSearch, isLoading: searching } = useQuery({
    queryKey: ['add-inquiry-guest-search', search],
    queryFn: () => api.get('/v1/admin/guests', { params: { search, per_page: 8 } }).then(r => r.data),
    enabled: open && customerMode === 'existing' && search.length >= 2,
  })
  const searchResults: any[] = guestSearch?.data ?? []

  const { data: pickedGuest } = useQuery({
    queryKey: ['add-inquiry-guest', pickedGuestId],
    queryFn: () => api.get(`/v1/admin/guests/${pickedGuestId}`).then(r => r.data),
    enabled: open && !!pickedGuestId,
  })

  const createCustomer = useMutation({
    mutationFn: (payload: typeof EMPTY_NEW_CUSTOMER) =>
      api.post('/v1/admin/guests', {
        full_name: payload.full_name.trim(),
        email: payload.email.trim() || null,
        phone: payload.phone.trim() || null,
        company: payload.company.trim() || null,
      }).then(r => r.data),
  })

  const createInquiry = useMutation({
    mutationFn: (body: any) => api.post('/v1/admin/inquiries', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inquiries'] })
      qc.invalidateQueries({ queryKey: ['customers-list'] })
      toast.success('Inquiry created')
      onCreated()
      onClose()
    },
    onError: (e: any) => {
      const fieldErrors = extractCustomFieldErrors(e)
      setCfErrors(fieldErrors)
      if (Object.keys(fieldErrors).length === 0) {
        toast.error(e?.response?.data?.message || 'Could not create inquiry')
      }
    },
  })

  const canSubmit = useMemo(() => {
    if (!form.property_id) return false
    if (customerMode === 'existing' && !pickedGuestId) return false
    if (customerMode === 'new' && !newCustomer.full_name.trim()) return false
    return true
  }, [form.property_id, customerMode, pickedGuestId, newCustomer.full_name])

  const submitting = createCustomer.isPending || createInquiry.isPending

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    try {
      let guestId = pickedGuestId
      if (customerMode === 'new') {
        const created = await createCustomer.mutateAsync(newCustomer)
        guestId = String(created?.id ?? created?.guest?.id ?? '')
        if (!guestId) {
          toast.error('Created customer but no id returned')
          return
        }
      }
      const body: any = {
        ...form,
        guest_id: guestId ? parseInt(guestId) : undefined,
        property_id: form.property_id ? parseInt(form.property_id) : undefined,
        num_rooms: form.num_rooms ? parseInt(form.num_rooms) : undefined,
        num_adults: form.num_adults ? parseInt(form.num_adults) : undefined,
        num_children: form.num_children ? parseInt(form.num_children) : undefined,
        rate_offered: form.rate_offered ? parseFloat(form.rate_offered) : undefined,
        total_value: form.total_value ? parseFloat(form.total_value) : undefined,
        event_pax: form.event_pax ? parseInt(form.event_pax) : undefined,
      }
      if (!showMice) {
        delete body.event_name; delete body.event_pax; delete body.function_space
        delete body.catering_required; delete body.av_required
      }
      createInquiry.mutate(body)
    } catch (err: any) {
      const errs = err?.response?.data?.errors
      const first = errs ? (Object.values(errs)[0] as string[])[0] : null
      toast.error(first || err?.response?.data?.message || 'Could not create customer')
    }
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop — pinned full screen, click to close */}
      <div
        className="fixed inset-0 z-40 bg-black/75 backdrop-blur-md"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel — pinned to RIGHT edge, matching CustomerDrawer +
          InquiryDrawer so every drawer in the leads flow opens from the
          same side. fixed right-0 top-0 + full-height keeps the drawer
          locked to the right regardless of parent layout. */}
      <aside
        role="dialog"
        aria-modal="true"
        className="fixed right-0 top-0 h-screen w-full max-w-2xl bg-[#0f0f0f] border-l border-white/10 shadow-2xl z-50 flex flex-col overflow-hidden">
        {/* Header — gradient hero with primary CTA echo */}
        <div className="relative px-5 pt-5 pb-4 border-b border-white/10"
          style={{ background: 'linear-gradient(180deg, rgba(201,168,76,0.10) 0%, rgba(201,168,76,0.02) 100%)' }}
        >
          <div className="absolute left-0 right-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, #c9a84c, transparent)' }} />
          <div className="flex items-start gap-3">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] text-t-secondary hover:text-white transition-colors flex-shrink-0"
              title="Close (Esc)"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-[#c9a84c]/85">New lead</div>
              <h2 className="text-xl font-bold text-white leading-tight mt-0.5">Add inquiry</h2>
              <p className="text-xs text-t-secondary mt-1">Capture a new lead — customer + stay details in one go.</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] text-t-secondary hover:text-white transition-colors flex-shrink-0"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scroll body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">

          {/* ── Customer ─────────────────────────────────────────── */}
          <Section icon={UserIcon} accent="#22d3ee" title="Customer" subtitle="Who is this lead for?">
            {/* Mode toggle */}
            <div className="inline-flex p-0.5 rounded-lg bg-white/[0.04] border border-white/10 mb-3 self-start">
              {([
                { v: 'existing' as CustomerMode, label: 'Existing customer', icon: Search },
                { v: 'new'      as CustomerMode, label: 'New customer',      icon: Plus   },
              ]).map(({ v, label, icon: Icon }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setCustomerMode(v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${customerMode === v ? 'bg-[#22d3ee]/15 text-[#22d3ee] border border-[#22d3ee]/30' : 'text-t-secondary hover:text-white border border-transparent'}`}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>

            {customerMode === 'existing' && (
              <div className="space-y-2">
                {pickedGuestId && pickedGuest ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-[#22d3ee]/[0.06] border border-[#22d3ee]/25">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#22d3ee] to-[#0891b2] flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {(pickedGuest.full_name || '?').slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">{pickedGuest.full_name}</div>
                      <div className="text-[11px] text-t-secondary truncate">
                        {[pickedGuest.email, pickedGuest.phone].filter(Boolean).join(' · ') || 'No contact info'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setPickedGuestId(''); setSearch(''); setSearchOpen(false) }}
                      className="p-1.5 rounded-md hover:bg-white/[0.08] text-t-secondary hover:text-white"
                      title="Pick a different customer"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-t-secondary" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setSearchOpen(true) }}
                      onFocus={() => setSearchOpen(true)}
                      placeholder="Search by name, email, phone…"
                      className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-t-secondary focus:outline-none focus:border-[#22d3ee]/50 focus:ring-1 focus:ring-[#22d3ee]/30"
                    />
                    {searching && (
                      <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-t-secondary animate-spin" />
                    )}
                    {searchOpen && search.length >= 2 && (
                      <div className="absolute z-10 mt-1 left-0 right-0 bg-[#171717] border border-white/10 rounded-lg shadow-2xl max-h-72 overflow-y-auto">
                        {searchResults.length === 0 && !searching && (
                          <div className="px-3 py-4 text-center text-xs text-t-secondary">
                            No matches.
                            <button
                              type="button"
                              onClick={() => { setCustomerMode('new'); setNewCustomer(c => ({ ...c, full_name: search })) }}
                              className="block mx-auto mt-2 text-[#c9a84c] hover:text-[#e8c869] font-semibold"
                            >
                              + Add as new customer
                            </button>
                          </div>
                        )}
                        {searchResults.map((g: any) => (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => { setPickedGuestId(String(g.id)); setSearchOpen(false); setSearch('') }}
                            className="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-white/[0.04] border-b border-white/[0.04] last:border-b-0"
                          >
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#22d3ee] to-[#0891b2] flex items-center justify-center text-white font-bold text-xs flex-shrink-0">
                              {(g.full_name || '?').slice(0, 1).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-white truncate">{g.full_name}</div>
                              <div className="text-[11px] text-t-secondary truncate">
                                {[g.email, g.phone].filter(Boolean).join(' · ') || 'No contact info'}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <p className="text-[11px] text-t-secondary">Type to search — pick from the list or switch to <button type="button" onClick={() => setCustomerMode('new')} className="text-[#22d3ee] hover:underline">create new</button>.</p>
              </div>
            )}

            {customerMode === 'new' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Full name" required>
                  <div className="relative">
                    <UserIcon size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-t-secondary" />
                    <input
                      value={newCustomer.full_name}
                      onChange={(e) => setNewCustomer(c => ({ ...c, full_name: e.target.value }))}
                      placeholder="Jane Doe"
                      className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-t-secondary focus:outline-none focus:border-[#22d3ee]/50"
                      required
                    />
                  </div>
                </Field>
                <Field label="Email">
                  <div className="relative">
                    <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-t-secondary" />
                    <input
                      type="email"
                      value={newCustomer.email}
                      onChange={(e) => setNewCustomer(c => ({ ...c, email: e.target.value }))}
                      placeholder="jane@example.com"
                      className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-t-secondary focus:outline-none focus:border-[#22d3ee]/50"
                    />
                  </div>
                </Field>
                <Field label="Phone">
                  <div className="relative">
                    <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-t-secondary" />
                    <input
                      value={newCustomer.phone}
                      onChange={(e) => setNewCustomer(c => ({ ...c, phone: e.target.value }))}
                      placeholder="+1 555 123 4567"
                      className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-t-secondary focus:outline-none focus:border-[#22d3ee]/50"
                    />
                  </div>
                </Field>
                <Field label="Company">
                  <div className="relative">
                    <Building2 size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-t-secondary" />
                    <input
                      value={newCustomer.company}
                      onChange={(e) => setNewCustomer(c => ({ ...c, company: e.target.value }))}
                      placeholder="Acme Ltd"
                      className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-t-secondary focus:outline-none focus:border-[#22d3ee]/50"
                    />
                  </div>
                </Field>
                <div className="sm:col-span-2 text-[11px] text-t-secondary flex items-center gap-1.5">
                  <Sparkles size={11} className="text-[#22d3ee]" />
                  Customer will be created in your CRM when you submit.
                </div>
              </div>
            )}
          </Section>

          {/* ── Stay details ───────────────────────────────────── */}
          <Section icon={Bed} accent="#3b82f6" title="Stay details" subtitle="Where & when">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Property" required>
                <select
                  value={form.property_id}
                  onChange={(e) => setForm(f => ({ ...f, property_id: e.target.value }))}
                  className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3b82f6]/50"
                  required
                >
                  <option value="">— Select property —</option>
                  {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </Field>
              {fieldCfg.form.inquiry_type !== false && (
                <Field label="Inquiry type">
                  <select
                    value={form.inquiry_type}
                    onChange={(e) => setForm(f => ({ ...f, inquiry_type: e.target.value }))}
                    className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3b82f6]/50"
                  >
                    <option value="">— Select —</option>
                    {settings.inquiry_types.map(t => <option key={t}>{t}</option>)}
                  </select>
                </Field>
              )}
              {fieldCfg.form.check_in !== false && (
                <Field label="Check-in">
                  <input
                    type="date"
                    value={form.check_in}
                    onChange={(e) => setForm(f => ({ ...f, check_in: e.target.value }))}
                    className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3b82f6]/50"
                  />
                </Field>
              )}
              {fieldCfg.form.check_out !== false && (
                <Field label="Check-out">
                  <input
                    type="date"
                    value={form.check_out}
                    onChange={(e) => setForm(f => ({ ...f, check_out: e.target.value }))}
                    className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3b82f6]/50"
                  />
                </Field>
              )}
              {fieldCfg.form.num_rooms !== false && (
                <Field label="Rooms">
                  <input
                    type="number"
                    min={1}
                    value={form.num_rooms}
                    onChange={(e) => setForm(f => ({ ...f, num_rooms: e.target.value }))}
                    placeholder="1"
                    className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#3b82f6]/50"
                  />
                </Field>
              )}
              <Field label="Adults / Children">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={0}
                    value={form.num_adults}
                    onChange={(e) => setForm(f => ({ ...f, num_adults: e.target.value }))}
                    placeholder="Adults"
                    className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-t-secondary focus:outline-none focus:border-[#3b82f6]/50"
                  />
                  <input
                    type="number"
                    min={0}
                    value={form.num_children}
                    onChange={(e) => setForm(f => ({ ...f, num_children: e.target.value }))}
                    placeholder="Children"
                    className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-t-secondary focus:outline-none focus:border-[#3b82f6]/50"
                  />
                </div>
              </Field>
            </div>
          </Section>

          {/* ── MICE/Event block (auto-shows for Event/Wedding/Conference) */}
          {showMice && (
            <Section icon={Sparkles} accent="#a855f7" title="Event details" subtitle="MICE / Wedding / Conference">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Event name">
                  <input
                    value={form.event_name}
                    onChange={(e) => setForm(f => ({ ...f, event_name: e.target.value }))}
                    placeholder="Summer gala"
                    className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-t-secondary focus:outline-none focus:border-[#a855f7]/50"
                  />
                </Field>
                <Field label="Expected pax">
                  <input
                    type="number"
                    value={form.event_pax}
                    onChange={(e) => setForm(f => ({ ...f, event_pax: e.target.value }))}
                    placeholder="50"
                    className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-t-secondary focus:outline-none focus:border-[#a855f7]/50"
                  />
                </Field>
                <Field label="Function space">
                  <select
                    value={form.function_space}
                    onChange={(e) => setForm(f => ({ ...f, function_space: e.target.value }))}
                    className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#a855f7]/50"
                  >
                    <option value="">— Select —</option>
                    {settings.function_spaces.map(s => <option key={s}>{s}</option>)}
                  </select>
                </Field>
                <div className="flex items-center gap-4 sm:items-end pb-2">
                  <label className="flex items-center gap-2 text-xs text-t-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.catering_required}
                      onChange={(e) => setForm(f => ({ ...f, catering_required: e.target.checked }))}
                      className="accent-[#a855f7]"
                    />
                    Catering
                  </label>
                  <label className="flex items-center gap-2 text-xs text-t-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.av_required}
                      onChange={(e) => setForm(f => ({ ...f, av_required: e.target.checked }))}
                      className="accent-[#a855f7]"
                    />
                    AV equipment
                  </label>
                </div>
              </div>
            </Section>
          )}

          {/* ── Deal & pipeline (collapsible) ───────────────────── */}
          {(fieldCfg.form.source || fieldCfg.form.room_type || fieldCfg.form.rate_offered
            || fieldCfg.form.total_value || fieldCfg.form.status || fieldCfg.form.priority
            || fieldCfg.form.assigned_to) && (
            <CollapsibleSection
              icon={Banknote} accent="#10b981"
              title="Deal & pipeline"
              subtitle="Rate, ownership, status — optional"
              open={dealOpen}
              onToggle={() => setDealOpen(o => !o)}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {fieldCfg.form.source && (
                  <Field label="Source">
                    <select
                      value={form.source}
                      onChange={(e) => setForm(f => ({ ...f, source: e.target.value }))}
                      className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#10b981]/50"
                    >
                      <option value="">— None —</option>
                      {settings.lead_sources.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </Field>
                )}
                {fieldCfg.form.room_type && (
                  <Field label="Room type">
                    <select
                      value={form.room_type_requested}
                      onChange={(e) => setForm(f => ({ ...f, room_type_requested: e.target.value }))}
                      className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#10b981]/50"
                    >
                      <option value="">— Select —</option>
                      {settings.room_types.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </Field>
                )}
                {fieldCfg.form.rate_offered && (
                  <Field label={`Rate (${settings.currency_symbol})`}>
                    <input
                      type="number"
                      step="0.01"
                      value={form.rate_offered}
                      onChange={(e) => setForm(f => ({ ...f, rate_offered: e.target.value }))}
                      placeholder="0.00"
                      className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-t-secondary focus:outline-none focus:border-[#10b981]/50"
                    />
                  </Field>
                )}
                {fieldCfg.form.total_value && (
                  <Field label={`Total value (${settings.currency_symbol})`}>
                    <input
                      type="number"
                      step="0.01"
                      value={form.total_value}
                      onChange={(e) => setForm(f => ({ ...f, total_value: e.target.value }))}
                      placeholder="0.00"
                      className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-t-secondary focus:outline-none focus:border-[#10b981]/50"
                    />
                  </Field>
                )}
                {fieldCfg.form.status && (
                  <Field label="Status">
                    <select
                      value={form.status}
                      onChange={(e) => setForm(f => ({ ...f, status: e.target.value }))}
                      className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#10b981]/50"
                    >
                      {settings.inquiry_statuses.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </Field>
                )}
                {fieldCfg.form.priority && (
                  <Field label="Priority">
                    <select
                      value={form.priority}
                      onChange={(e) => setForm(f => ({ ...f, priority: e.target.value }))}
                      className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#10b981]/50"
                    >
                      {settings.priorities.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </Field>
                )}
                {fieldCfg.form.assigned_to && (
                  <Field label="Assigned to">
                    <select
                      value={form.assigned_to}
                      onChange={(e) => setForm(f => ({ ...f, assigned_to: e.target.value }))}
                      className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#10b981]/50"
                    >
                      <option value="">— Unassigned —</option>
                      {settings.lead_owners.map(o => <option key={o}>{o}</option>)}
                    </select>
                  </Field>
                )}
              </div>
            </CollapsibleSection>
          )}

          {/* ── Notes / custom fields (collapsible) ─────────────── */}
          <CollapsibleSection
            icon={FileText} accent="#a78bfa"
            title="Notes & extras"
            subtitle="Special requests, internal notes, custom fields"
            open={notesOpen}
            onToggle={() => setNotesOpen(o => !o)}
          >
            <div className="space-y-3">
              {fieldCfg.form.special_requests !== false && (
                <Field label="Special requests">
                  <textarea
                    value={form.special_requests}
                    onChange={(e) => setForm(f => ({ ...f, special_requests: e.target.value }))}
                    rows={2}
                    placeholder="Allergies, room preferences, anniversary surprise…"
                    className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-t-secondary focus:outline-none focus:border-[#a78bfa]/50 resize-none"
                  />
                </Field>
              )}
              {fieldCfg.form.notes !== false && (
                <Field label="Internal notes">
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    placeholder="Visible to staff only…"
                    className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-t-secondary focus:outline-none focus:border-[#a78bfa]/50 resize-none"
                  />
                </Field>
              )}
              <CustomFieldsForm
                entity="inquiry"
                values={form.custom_data}
                onChange={(next) => setForm(f => ({ ...f, custom_data: next }))}
                errors={cfErrors}
                inputClassName="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-t-secondary focus:outline-none focus:border-[#a78bfa]/50"
              />
            </div>
          </CollapsibleSection>

          {/* Validation hint */}
          {!canSubmit && (
            <div className="flex items-start gap-2 text-[11px] text-amber-300/90 px-3 py-2 rounded-lg bg-amber-500/[0.06] border border-amber-500/20">
              <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
              <span>
                {!form.property_id && 'Pick a property. '}
                {customerMode === 'existing' && !pickedGuestId && 'Pick an existing customer or switch to "New". '}
                {customerMode === 'new' && !newCustomer.full_name.trim() && 'Enter the customer\'s name. '}
              </span>
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 bg-[#0a0a0a]/80 backdrop-blur flex items-center justify-between gap-3">
          <div className="text-[11px] text-t-secondary hidden sm:block">
            <kbd className="px-1.5 py-0.5 text-[10px] bg-white/[0.06] border border-white/10 rounded">Esc</kbd> to cancel
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-t-secondary hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#c9a84c] to-[#b8983e] hover:from-[#d4b358] hover:to-[#c2a247] text-black font-bold text-xs rounded-lg shadow-lg shadow-[#c9a84c]/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {submitting ? 'Creating…' : 'Create inquiry'}
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

// ─── Section helpers ─────────────────────────────────────────────────

function Section({
  icon: Icon, accent, title, subtitle, children,
}: {
  icon: any
  accent: string
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <section
      className="rounded-2xl border border-white/[0.06] bg-white/[0.015] p-4 flex flex-col"
      style={{ boxShadow: `inset 0 1px 0 ${accent}10` }}
    >
      <div className="flex items-center gap-3 mb-3">
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, ${accent}28, ${accent}10)`,
            border: `1px solid ${accent}40`,
          }}
        >
          <Icon size={15} style={{ color: accent }} />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-white leading-tight">{title}</h3>
          {subtitle && <p className="text-[11px] text-t-secondary leading-tight mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div>{children}</div>
    </section>
  )
}

function CollapsibleSection({
  icon: Icon, accent, title, subtitle, open, onToggle, children,
}: {
  icon: any
  accent: string
  title: string
  subtitle?: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section
      className="rounded-2xl border border-white/[0.06] bg-white/[0.015] overflow-hidden"
      style={{ boxShadow: `inset 0 1px 0 ${accent}10` }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 hover:bg-white/[0.02] transition-colors"
      >
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, ${accent}28, ${accent}10)`,
            border: `1px solid ${accent}40`,
          }}
        >
          <Icon size={15} style={{ color: accent }} />
        </span>
        <div className="flex-1 min-w-0 text-left">
          <h3 className="text-sm font-bold text-white leading-tight">{title}</h3>
          {subtitle && <p className="text-[11px] text-t-secondary leading-tight mt-0.5">{subtitle}</p>}
        </div>
        {open ? <ChevronDown size={14} className="text-t-secondary" /> : <ChevronRight size={14} className="text-t-secondary" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  )
}

function Field({
  label, required, children,
}: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-t-secondary mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  )
}
