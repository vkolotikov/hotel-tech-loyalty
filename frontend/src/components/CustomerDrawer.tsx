import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  X, MoreVertical, ExternalLink, Trash2, Mail, Phone, Building2, Crown,
  Loader2, Check, AlertTriangle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { formatDistanceToNow } from 'date-fns'
import { api } from '../lib/api'

/**
 * Right-side drawer for viewing AND editing a guest's full CRM profile,
 * opened from the /leads inquiries list (and anywhere else that surfaces
 * a guest_id). Reuses TaskDrawer's slide pattern: fixed full-height
 * panel, backdrop-blur overlay, ESC + backdrop close.
 *
 * Field edits diff-PUT against /v1/admin/guests/:id — the controller's
 * partial-PUT contract (nullable validation + array_filter) makes this
 * safe to send one key at a time.
 */

export interface CustomerDrawerGuest {
  id: number
  full_name?: string | null
  email?: string | null
  phone?: string | null
  mobile?: string | null
  company?: string | null
  position_title?: string | null
  country?: string | null
  nationality?: string | null
  vip_level?: string | null
  notes?: string | null
  status?: string | null
  member_id?: number | null
  corporate_account_id?: number | null
  corporate_account?: { id: number; name: string } | null
  last_seen_at?: string | null
  created_at?: string | null
}

interface Props {
  open: boolean
  guestId: number | null
  onClose: () => void
  onGuestUpdated?: (guest: CustomerDrawerGuest) => void
  onGuestDeleted?: (id: number) => void
}

type Tab = 'profile' | 'company' | 'activity'

const VIP_LEVELS: { key: string; label: string }[] = [
  { key: 'Standard', label: 'Standard' },
  { key: 'Silver',   label: 'Silver' },
  { key: 'Gold',     label: 'Gold' },
  { key: 'Diamond',  label: 'Diamond' },
]

// ---------------------------------------------------------------------------
// EditableField — click-to-edit row used across the Profile tab.
// Renders a static row by default; switching to edit mode swaps the value
// for an input/textarea/select. Save fires the parent's diff-PUT mutation.
// ---------------------------------------------------------------------------

type EditableType = 'text' | 'email' | 'tel' | 'textarea' | 'select'

interface EditableFieldProps {
  label: string
  value: string | null | undefined
  type?: EditableType
  options?: { key: string; label: string }[]
  placeholder?: string
  icon?: React.ComponentType<{ size?: number; className?: string }>
  saving?: boolean
  onSave: (next: string | null) => void | Promise<void>
}

function EditableField({
  label, value, type = 'text', options, placeholder, icon: Icon, saving, onSave,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(value ?? '')

  useEffect(() => { setDraft(value ?? '') }, [value])

  const commit = async () => {
    const trimmed = (draft ?? '').trim()
    const next: string | null = trimmed === '' ? null : trimmed
    if ((value ?? '') === (next ?? '')) { setEditing(false); return }
    await onSave(next)
    setEditing(false)
  }

  const cancel = () => { setDraft(value ?? ''); setEditing(false) }

  return (
    <div className="group">
      <div className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1 flex items-center gap-1.5">
        {Icon && <Icon size={11} className="text-t-secondary" />}
        {label}
      </div>
      {editing ? (
        <div className="flex items-start gap-2">
          {type === 'textarea' ? (
            <textarea
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={3}
              placeholder={placeholder}
              className="flex-1 bg-dark-bg border border-accent rounded-md px-3 py-2 text-sm placeholder-t-secondary outline-none resize-none"
            />
          ) : type === 'select' ? (
            <select
              autoFocus
              value={draft}
              onChange={e => setDraft(e.target.value)}
              className="flex-1 bg-dark-bg border border-accent rounded-md px-3 py-2 text-sm outline-none"
            >
              {(options ?? []).map(o => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
          ) : (
            <input
              autoFocus
              type={type}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') commit()
                if (e.key === 'Escape') cancel()
              }}
              placeholder={placeholder}
              className="flex-1 bg-dark-bg border border-accent rounded-md px-3 py-2 text-sm placeholder-t-secondary outline-none"
            />
          )}
          <button
            onClick={commit}
            disabled={saving}
            className="p-2 rounded-md bg-accent text-black hover:bg-accent/90 disabled:opacity-50"
            aria-label="Save"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          </button>
          <button
            onClick={cancel}
            disabled={saving}
            className="p-2 rounded-md text-t-secondary hover:text-white hover:bg-dark-surface2"
            aria-label="Cancel"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-full text-left text-sm text-white bg-dark-bg border border-dark-border rounded-md px-3 py-2 hover:border-accent/60 transition min-h-[38px]"
        >
          {value && String(value).trim() !== ''
            ? <span className="whitespace-pre-wrap">{value}</span>
            : <span className="text-t-secondary italic">{placeholder ?? 'Add…'}</span>}
        </button>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// DeleteConfirmModal — high-blast confirm with optional impact list.
// ---------------------------------------------------------------------------

interface DeleteImpact {
  inquiries?: number
  reservations?: number
  activities?: number
  tasks?: number
  attachments?: number
  [k: string]: any
}

function DeleteConfirmModal({
  guestName, impact, loading, onCancel, onConfirm,
}: {
  guestName: string
  impact: DeleteImpact | null
  loading: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const [confirmText, setConfirmText] = useState('')
  const required = 'DELETE'

  const items = impact
    ? Object.entries(impact).filter(([, v]) => typeof v === 'number' && v > 0)
    : []

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-dark-surface border border-red-500/40 rounded-lg w-full max-w-md p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="p-2 rounded-md bg-red-500/15 text-red-400">
            <AlertTriangle size={18} />
          </div>
          <h3 className="text-base font-bold text-white">Delete customer?</h3>
        </div>

        <p className="text-sm text-t-secondary mb-3">
          <span className="font-semibold text-white">{guestName}</span> will be permanently removed.
          This cannot be undone.
        </p>

        {items.length > 0 && (
          <div className="bg-dark-bg border border-dark-border rounded-md p-3 mb-3">
            <div className="text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1.5">
              Also affected
            </div>
            <ul className="text-xs text-white space-y-1">
              {items.map(([k, v]) => (
                <li key={k} className="flex justify-between">
                  <span className="capitalize text-t-secondary">{k.replace(/_/g, ' ')}</span>
                  <span className="font-mono">{v}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <label className="block text-[10px] uppercase tracking-wide font-bold text-t-secondary mb-1.5">
          Type <span className="font-mono text-red-400">{required}</span> to confirm
        </label>
        <input
          autoFocus
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm outline-none focus:border-red-500 mb-4"
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm text-t-secondary hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || confirmText !== required}
            className="bg-red-500 hover:bg-red-600 text-white font-bold rounded-md px-4 py-2 text-sm disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Delete customer
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CustomerDrawer
// ---------------------------------------------------------------------------

export function CustomerDrawer({ open, guestId, onClose, onGuestUpdated, onGuestDeleted }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('profile')
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const kebabRef = useRef<HTMLButtonElement>(null)

  // Reset state when drawer opens for a new guest.
  useEffect(() => {
    if (open) {
      setTab('profile')
      setMenuOpen(false)
      setConfirmDelete(false)
    }
  }, [open, guestId])

  // Fetch full guest profile when drawer opens.
  const guestQuery = useQuery<CustomerDrawerGuest>({
    queryKey: ['guest', guestId],
    queryFn: () => api.get(`/v1/admin/guests/${guestId}`).then(r => r.data?.data ?? r.data),
    enabled: open && guestId != null,
    staleTime: 30_000,
  })

  // Best-effort blast-radius fetch — 404 is fine, modal just hides the list.
  const impactQuery = useQuery<DeleteImpact>({
    queryKey: ['guest-delete-impact', guestId],
    queryFn: async () => {
      try {
        const r = await api.get(`/v1/admin/guests/${guestId}/delete-impact`)
        return r.data?.data ?? r.data ?? {}
      } catch {
        return {}
      }
    },
    enabled: open && guestId != null && confirmDelete,
  })

  const guest = guestQuery.data
  const loading = guestQuery.isLoading

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

  // Diff-PUT a single field.
  const updateMutation = useMutation({
    mutationFn: (patch: Partial<CustomerDrawerGuest>) =>
      api.put(`/v1/admin/guests/${guestId}`, patch).then(r => r.data),
    onSuccess: (resp: any) => {
      const updated: CustomerDrawerGuest = resp?.data ?? resp ?? guest
      queryClient.setQueryData(['guest', guestId], updated)
      queryClient.invalidateQueries({ queryKey: ['customers-list'] })
      queryClient.invalidateQueries({ queryKey: ['inquiries'] })
      onGuestUpdated?.(updated)
      toast.success(t('customerDrawer.toasts.saved', 'Saved'))
    },
    onError: (e: any) => {
      const errs = e?.response?.data?.errors
      const first = errs ? (Object.values(errs)[0] as string[])[0] : null
      toast.error(first || e?.response?.data?.message || t('customerDrawer.toasts.save_failed', 'Save failed'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/v1/admin/guests/${guestId}`).then(r => r.data),
    onSuccess: () => {
      toast.success(t('customerDrawer.toasts.deleted', 'Customer deleted'))
      queryClient.invalidateQueries({ queryKey: ['customers-list'] })
      queryClient.invalidateQueries({ queryKey: ['inquiries'] })
      if (guestId != null) onGuestDeleted?.(guestId)
      setConfirmDelete(false)
      onClose()
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || t('customerDrawer.toasts.delete_failed', 'Delete failed'))
    },
  })

  const saveField = (key: keyof CustomerDrawerGuest) => (next: string | null) =>
    updateMutation.mutateAsync({ [key]: next } as Partial<CustomerDrawerGuest>)

  if (!open) return null

  const name = guest?.full_name?.trim() || t('customerDrawer.unnamed', 'Unnamed customer')
  const initial = name.charAt(0).toUpperCase()
  const vip = guest?.vip_level && guest.vip_level !== 'Standard' ? guest.vip_level : null
  const status = guest?.status
  const fullProfileHref = guest?.member_id
    ? `/members/${guest.member_id}?tab=crm`
    : `/guests/${guest?.id ?? guestId}`

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-50 flex justify-end"
        onClick={() => { if (!loading && !confirmDelete) onClose() }}
      >
        <div
          className="bg-dark-surface border-l border-dark-border w-full max-w-2xl h-full flex flex-col shadow-2xl"
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
                  {loading ? t('customerDrawer.loading', 'Loading…') : name}
                </h2>
                {vip && (
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/40">
                    <Crown size={10} /> {vip}
                  </span>
                )}
                {status && (
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                    {status}
                  </span>
                )}
              </div>
              {guest?.company && (
                <p className="text-xs text-t-secondary truncate mt-0.5 flex items-center gap-1">
                  <Building2 size={11} /> {guest.company}
                </p>
              )}
            </div>

            <div className="relative">
              <button
                ref={kebabRef}
                onClick={() => setMenuOpen(v => !v)}
                disabled={loading}
                className="p-1.5 rounded hover:bg-dark-surface2 text-t-secondary hover:text-white disabled:opacity-50"
                aria-label={t('customerDrawer.actions.menu', 'More actions')}
              >
                <MoreVertical size={16} />
              </button>
              {menuOpen && guest && (
                <div className="absolute right-0 mt-1 w-56 bg-dark-bg border border-dark-border rounded-md shadow-xl z-10 py-1">
                  <Link
                    to={fullProfileHref}
                    onClick={() => { setMenuOpen(false); onClose() }}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-white hover:bg-dark-surface2"
                  >
                    <ExternalLink size={13} />
                    {t('customerDrawer.actions.open_full', 'Open full profile')}
                  </Link>
                  <button
                    onClick={() => { setMenuOpen(false); setConfirmDelete(true) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 text-left"
                  >
                    <Trash2 size={13} />
                    {t('customerDrawer.actions.delete', 'Delete customer')}
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              disabled={loading}
              className="p-1.5 rounded hover:bg-dark-surface2 text-t-secondary hover:text-white disabled:opacity-50"
              aria-label={t('actions.close', 'Close')}
            >
              <X size={16} />
            </button>
          </div>

          {/* Tabs */}
          <div className="px-4 pt-3 pb-1 border-b border-dark-border flex gap-1.5">
            {[
              { key: 'profile' as const,  label: t('customerDrawer.tabs.profile', 'Profile') },
              { key: 'company' as const,  label: t('customerDrawer.tabs.company', 'Company') },
              { key: 'activity' as const, label: t('customerDrawer.tabs.activity', 'Activity') },
            ].map(p => {
              const active = tab === p.key
              return (
                <button
                  key={p.key}
                  onClick={() => setTab(p.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                    active
                      ? 'bg-accent text-black'
                      : 'text-t-secondary hover:text-white hover:bg-dark-surface2'
                  }`}
                >
                  {p.label}
                </button>
              )
            })}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="space-y-3 animate-pulse">
                {[0, 1, 2, 3, 4].map(i => (
                  <div key={i}>
                    <div className="h-3 w-20 bg-dark-surface2 rounded mb-2" />
                    <div className="h-9 bg-dark-surface2 rounded" />
                  </div>
                ))}
              </div>
            ) : !guest ? (
              <div className="text-center text-t-secondary text-sm py-12">
                {t('customerDrawer.not_found', 'Customer not found.')}
              </div>
            ) : tab === 'profile' ? (
              <div className="space-y-4">
                <EditableField
                  label={t('customerDrawer.fields.full_name', 'Full name')}
                  value={guest.full_name}
                  placeholder={t('customerDrawer.placeholders.full_name', 'Jane Doe')}
                  saving={updateMutation.isPending}
                  onSave={saveField('full_name')}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <EditableField
                    label={t('customerDrawer.fields.email', 'Email')}
                    value={guest.email}
                    type="email"
                    icon={Mail}
                    placeholder="jane@example.com"
                    saving={updateMutation.isPending}
                    onSave={saveField('email')}
                  />
                  <EditableField
                    label={t('customerDrawer.fields.phone', 'Phone')}
                    value={guest.phone}
                    type="tel"
                    icon={Phone}
                    placeholder="+1 555 0123"
                    saving={updateMutation.isPending}
                    onSave={saveField('phone')}
                  />
                  <EditableField
                    label={t('customerDrawer.fields.mobile', 'Mobile')}
                    value={guest.mobile}
                    type="tel"
                    icon={Phone}
                    placeholder="+1 555 0124"
                    saving={updateMutation.isPending}
                    onSave={saveField('mobile')}
                  />
                  <EditableField
                    label={t('customerDrawer.fields.company', 'Company')}
                    value={guest.company}
                    icon={Building2}
                    placeholder={t('customerDrawer.placeholders.company', 'Acme Corp')}
                    saving={updateMutation.isPending}
                    onSave={saveField('company')}
                  />
                  <EditableField
                    label={t('customerDrawer.fields.position', 'Position')}
                    value={guest.position_title}
                    placeholder={t('customerDrawer.placeholders.position', 'Operations Manager')}
                    saving={updateMutation.isPending}
                    onSave={saveField('position_title')}
                  />
                  <EditableField
                    label={t('customerDrawer.fields.vip_level', 'VIP level')}
                    value={guest.vip_level || 'Standard'}
                    type="select"
                    options={VIP_LEVELS}
                    icon={Crown}
                    saving={updateMutation.isPending}
                    onSave={saveField('vip_level')}
                  />
                  <EditableField
                    label={t('customerDrawer.fields.country', 'Country')}
                    value={guest.country}
                    placeholder="US"
                    saving={updateMutation.isPending}
                    onSave={saveField('country')}
                  />
                  <EditableField
                    label={t('customerDrawer.fields.nationality', 'Nationality')}
                    value={guest.nationality}
                    placeholder="American"
                    saving={updateMutation.isPending}
                    onSave={saveField('nationality')}
                  />
                </div>
                <EditableField
                  label={t('customerDrawer.fields.notes', 'Notes')}
                  value={guest.notes}
                  type="textarea"
                  placeholder={t('customerDrawer.placeholders.notes', 'Anything the team should know about this customer.')}
                  saving={updateMutation.isPending}
                  onSave={saveField('notes')}
                />
              </div>
            ) : tab === 'company' ? (
              <div className="space-y-4">
                {guest.corporate_account_id && guest.corporate_account ? (
                  <Link
                    to={`/corporate?account=${guest.corporate_account_id}`}
                    onClick={onClose}
                    className="flex items-center justify-between p-4 bg-dark-bg border border-dark-border rounded-md hover:border-accent/60 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-md bg-purple-500/15 text-purple-300">
                        <Building2 size={16} />
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wide font-bold text-t-secondary">
                          {t('customerDrawer.company.linked', 'Linked to')}
                        </div>
                        <div className="text-sm font-bold text-white">
                          {guest.corporate_account.name}
                        </div>
                      </div>
                    </div>
                    <ExternalLink size={14} className="text-t-secondary" />
                  </Link>
                ) : (
                  <div className="text-center py-8">
                    <Building2 size={28} className="text-t-secondary mx-auto mb-2 opacity-60" />
                    <p className="text-sm text-t-secondary mb-3">
                      {t('customerDrawer.company.none', 'No company linked')}
                    </p>
                    <button
                      disabled
                      className="px-4 py-2 text-xs font-semibold rounded-md bg-dark-bg border border-dark-border text-t-secondary opacity-60 cursor-not-allowed"
                    >
                      {t('customerDrawer.company.link_cta', 'Link company (coming soon)')}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-sm text-t-secondary">
                {t('customerDrawer.activity.coming_soon', 'Activity timeline coming soon.')}
              </div>
            )}
          </div>

          {/* Footer */}
          {guest && (
            <div className="border-t border-dark-border px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-t-secondary">
              {guest.last_seen_at && (
                <span>
                  {t('customerDrawer.footer.last_seen', { defaultValue: 'Last seen {{when}} ago', when: formatDistanceToNow(new Date(guest.last_seen_at)) })}
                </span>
              )}
              {guest.created_at && (
                <span>
                  {t('customerDrawer.footer.created', { defaultValue: 'Created {{when}} ago', when: formatDistanceToNow(new Date(guest.created_at)) })}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {confirmDelete && guest && (
        <DeleteConfirmModal
          guestName={guest.full_name || 'this customer'}
          impact={impactQuery.data ?? null}
          loading={deleteMutation.isPending}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => deleteMutation.mutate()}
        />
      )}
    </>
  )
}
