import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Save, Loader2, Sparkles, User, Wand2, AlertCircle, ArrowLeft } from 'lucide-react'
import { api } from '../lib/api'
import { useSettings } from '../lib/crmSettings'
import toast from 'react-hot-toast'

/**
 * Drawer for creating a new CRM customer (Guest). Two modes:
 *
 *   1. AI capture — paste a chunk of unstructured text (email signature,
 *      business card OCR, scraped contact page, WhatsApp blurb, manual
 *      note). POST to /v1/admin/crm-ai/capture-guest, preview the
 *      extracted fields, edit them, then save. Same UX shape as the
 *      existing Corporate capture flow.
 *
 *   2. Manual — type the fields in directly. Useful when admin is
 *      transcribing from a phone call or an in-person greeting.
 *
 * Replaces the broken /guests/new route that the Customers page was
 * linking to (no such page existed; GuestDetail's :id binding tried
 * to load a guest with id="new" and 500'd).
 */

type GuestPayload = {
  full_name: string
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  company?: string
  position_title?: string
  guest_type?: string
  nationality?: string
  country?: string
  city?: string
  vip_level?: string
  importance?: string
  notes?: string
}

type Mode = 'ai' | 'manual'
type Stage = 'pick' | 'pasting' | 'preview'

export function NewCustomerDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: (guestId: number) => void }) {
  const queryClient = useQueryClient()
  const settings = useSettings()
  // Field-visibility config from Settings → Pipelines & Fields → Customers
  // → "Add Customer form". `full_name` is always shown.
  const formCfg = settings.customer_fields.form
  const [mode, setMode] = useState<Mode>('ai')
  const [stage, setStage] = useState<Stage>('pick')
  const [text, setText] = useState('')
  const [form, setForm] = useState<GuestPayload>({ full_name: '' })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const extract = useMutation({
    mutationFn: (txt: string) =>
      api.post('/v1/admin/crm-ai/capture-guest', { text: txt }).then(r => r.data),
    onSuccess: (resp: any) => {
      if (resp?.success && resp.data) {
        setForm({ ...resp.data, full_name: resp.data.full_name ?? '' })
        setStage('preview')
      } else {
        toast.error(resp?.error || 'Could not extract a profile from that text.')
      }
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.error || 'AI capture failed')
    },
  })

  const create = useMutation({
    mutationFn: (payload: GuestPayload) =>
      api.post('/v1/admin/guests', payload).then(r => r.data),
    onSuccess: (resp: any) => {
      toast.success(`Customer ${resp.full_name ?? 'created'}`)
      queryClient.invalidateQueries({ queryKey: ['customers-list'] })
      onCreated(resp.id)
    },
    onError: (e: any) => {
      const errs = e?.response?.data?.errors
      const first = errs ? (Object.values(errs)[0] as string[])[0] : null
      toast.error(first || e?.response?.data?.message || 'Could not create customer')
    },
  })

  const set = (k: keyof GuestPayload, v: string) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const canSave = !!form.full_name?.trim() && !create.isPending

  const handleManualClick = () => {
    setMode('manual')
    setStage('preview')   // jump straight to the form
    setForm({ full_name: '' })
  }
  const handleAiClick = () => {
    setMode('ai')
    setStage('pasting')
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-screen w-full max-w-lg bg-dark-surface border-l border-dark-border shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-dark-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            {stage !== 'pick' && (
              <button onClick={() => { setStage('pick'); setText(''); setForm({ full_name: '' }) }}
                className="p-1.5 rounded hover:bg-white/5 text-gray-500 hover:text-white"
                title="Back"
              >
                <ArrowLeft size={14} />
              </button>
            )}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-t-secondary">New customer</div>
              <h2 className="text-base font-semibold text-white">
                {stage === 'pick'    && 'How would you like to capture?'}
                {stage === 'pasting' && 'AI Capture'}
                {stage === 'preview' && (mode === 'ai' ? 'Review & save' : 'Customer details')}
              </h2>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5 text-gray-500 hover:text-white">
            <X size={16} />
          </button>
        </div>

        {/* ── Stage 1: mode picker ────────────────────────────────── */}
        {stage === 'pick' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            <button
              onClick={handleAiClick}
              className="w-full text-left rounded-xl border border-primary-500/30 bg-primary-500/[0.06] hover:bg-primary-500/[0.10] p-4 transition group"
            >
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-lg bg-primary-500/15 flex items-center justify-center">
                  <Sparkles size={18} className="text-primary-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">AI capture</div>
                  <div className="text-[11px] text-t-secondary">Paste any text — email signature, business card, WhatsApp blurb</div>
                </div>
              </div>
              <div className="text-[11px] text-gray-500 mt-2 leading-relaxed pl-13">
                Fast for B2B contacts. AI extracts name · email · phone · company · position · location, then you review before saving.
              </div>
            </button>

            <button
              onClick={handleManualClick}
              className="w-full text-left rounded-xl border border-dark-border bg-dark-surface2/40 hover:bg-white/[0.03] p-4 transition group"
            >
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-lg bg-white/[0.04] flex items-center justify-center">
                  <User size={18} className="text-gray-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">Manual entry</div>
                  <div className="text-[11px] text-t-secondary">Type the fields directly</div>
                </div>
              </div>
              <div className="text-[11px] text-gray-500 mt-2 leading-relaxed pl-13">
                Useful when you're on a call or only have a name + phone to start with.
              </div>
            </button>
          </div>
        )}

        {/* ── Stage 2: AI paste ──────────────────────────────────── */}
        {stage === 'pasting' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            <div className="text-[12px] text-t-secondary leading-relaxed">
              Paste an email signature, business card text, scraped contact page, or any blurb that mentions a person. We'll extract the structured fields automatically. Nothing is saved until you confirm.
            </div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={10}
              autoFocus
              placeholder={'e.g.\n\nLīga Teterovska\nDirector of Sales · Acme Hotels Ltd\nlīga@acmehotels.lv\n+371 2222 3333\nRiga, Latvia'}
              className="w-full px-3 py-2.5 bg-dark-surface2 border border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 text-sm text-white placeholder-gray-600 font-mono"
            />
            <button
              onClick={() => extract.mutate(text)}
              disabled={!text.trim() || extract.isPending}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-primary-500 hover:bg-primary-400 text-black font-semibold text-sm disabled:opacity-50"
            >
              {extract.isPending ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
              Extract with AI
            </button>
            {extract.isError && (
              <div className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg p-2.5">
                <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                <span>Extraction failed. Either retry or switch to <button onClick={handleManualClick} className="underline">manual entry</button>.</span>
              </div>
            )}
          </div>
        )}

        {/* ── Stage 3: preview / manual form ─────────────────────── */}
        {stage === 'preview' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {mode === 'ai' && (
              <div className="text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2.5">
                Review the extracted fields. Edit anything that needs correcting before saving.
              </div>
            )}
            {/* Full name is required and always visible. The other rows
                are gated by `customer_fields.form.*` — admins toggle
                them in Settings → Pipelines & Fields → Customers. */}
            <Row>
              <Field label="Full name *" value={form.full_name} onChange={v => set('full_name', v)} required />
            </Row>
            {formCfg.first_last_names && (
              <Row>
                <Field label="First name" value={form.first_name ?? ''} onChange={v => set('first_name', v)} />
                <Field label="Last name"  value={form.last_name ?? ''}  onChange={v => set('last_name', v)} />
              </Row>
            )}
            {(formCfg.email || formCfg.phone) && (
              <Row>
                {formCfg.email && <Field label="Email" type="email" value={form.email ?? ''} onChange={v => set('email', v)} />}
                {formCfg.phone && <Field label="Phone" type="tel"   value={form.phone ?? ''} onChange={v => set('phone', v)} />}
              </Row>
            )}
            {(formCfg.company || formCfg.position_title) && (
              <Row>
                {formCfg.company        && <Field label="Company"  value={form.company ?? ''} onChange={v => set('company', v)} />}
                {formCfg.position_title && <Field label="Position" value={form.position_title ?? ''} onChange={v => set('position_title', v)} />}
              </Row>
            )}
            {(formCfg.guest_type || formCfg.vip_level) && (
              <Row>
                {formCfg.guest_type && (
                  <Select label="Guest type" value={form.guest_type ?? 'Individual'} onChange={v => set('guest_type', v)}
                    options={['Individual', 'Corporate']} />
                )}
                {formCfg.vip_level && (
                  <Select label="VIP level"  value={form.vip_level ?? 'Standard'}   onChange={v => set('vip_level', v)}
                    options={['Standard', 'VIP', 'VVIP', 'Platinum']} />
                )}
              </Row>
            )}
            {(formCfg.nationality || formCfg.country) && (
              <Row>
                {formCfg.nationality && <Field label="Nationality" value={form.nationality ?? ''} onChange={v => set('nationality', v)} />}
                {formCfg.country     && <Field label="Country"     value={form.country ?? ''}     onChange={v => set('country', v)} />}
              </Row>
            )}
            {(formCfg.city || formCfg.importance) && (
              <Row>
                {formCfg.city && <Field label="City" value={form.city ?? ''} onChange={v => set('city', v)} />}
                {formCfg.importance && (
                  <Select label="Importance" value={form.importance ?? 'Normal'} onChange={v => set('importance', v)}
                    options={['Normal', 'High', 'Critical']} />
                )}
              </Row>
            )}
            {formCfg.notes && (
              <label className="block">
                <span className="block text-[10px] uppercase tracking-wider text-t-secondary mb-1">Notes</span>
                <textarea
                  value={form.notes ?? ''}
                  onChange={e => set('notes', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-dark-surface2 border border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 text-sm text-white placeholder-gray-600"
                />
              </label>
            )}
          </div>
        )}

        {/* Footer */}
        {stage === 'preview' && (
          <div className="px-5 py-3 border-t border-dark-border flex items-center justify-end gap-2">
            <button onClick={onClose} className="px-3 py-2 rounded text-sm text-t-secondary hover:text-white">Cancel</button>
            <button
              onClick={() => create.mutate(form)}
              disabled={!canSave}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-500 hover:bg-primary-400 text-black font-semibold text-sm disabled:opacity-50"
            >
              {create.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Save customer
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
}

function Field({ label, value, onChange, type = 'text', required = false }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-t-secondary mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        className="w-full px-3 py-2 bg-dark-surface2 border border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 text-sm text-white placeholder-gray-600"
      />
    </label>
  )
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-t-secondary mb-1">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-dark-surface2 border border-dark-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 text-sm text-white"
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  )
}
