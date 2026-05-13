import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Briefcase, Plus, Pencil, Trash2, X, Upload, Check, Star, Globe, MessageSquare, Calendar, Inbox } from 'lucide-react'
import toast from 'react-hot-toast'
import { api, resolveImage } from '../lib/api'
import { useBrandStore, type BrandSummary } from '../stores/brandStore'

interface BrandStats {
  inquiries: number
  bookings: number
  chats: number
}

function BrandStat({ icon: Icon, value, label }: { icon: any; value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 text-center">
      <div className="flex items-center gap-1 text-t-secondary">
        <Icon size={11} />
        <span className="text-[9px] uppercase tracking-wide font-bold">{label}</span>
      </div>
      <div className="text-base font-bold text-white">{value}</div>
    </div>
  )
}

/**
 * Settings → Brands
 *
 * Phase 1 of the multi-brand rollout — full plan in
 * apps/loyalty/MULTI_BRAND_PLAN.md.
 *
 * Org admins manage their brand portfolio here. Single-brand orgs see only
 * the auto-created default brand and an "Add brand" button. Adding a 2nd
 * brand makes the BrandSwitcher visible in the top bar.
 */
export function Brands() {
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const setStoreBrands = useBrandStore(s => s.setBrands)

  const [showCreate, setShowCreate] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState({ name: '', slug: '', description: '', primary_color: '' })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-brands'],
    queryFn: () => api.get<{ data: BrandSummary[] }>('/v1/admin/brands').then(r => r.data),
  })

  const { data: statsData } = useQuery({
    queryKey: ['admin-brand-stats'],
    queryFn: () => api.get<{ data: Record<number, BrandStats> }>('/v1/admin/brands/stats').then(r => r.data),
    staleTime: 60_000,
  })

  const brands: BrandSummary[] = data?.data ?? []
  const stats: Record<number, BrandStats> = statsData?.data ?? {}

  // Keep the global brand store in sync so the top-bar switcher reflects
  // creates/renames/deletes immediately without a separate refetch.
  useEffect(() => {
    if (data?.data) setStoreBrands(data.data)
  }, [data, setStoreBrands])

  // Honour `?new=1` from the BrandSwitcher's "New brand" link.
  useEffect(() => {
    if (params.get('new') === '1') {
      openCreate()
      params.delete('new')
      setParams(params, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params])

  function openCreate() {
    setEditId(null)
    setForm({ name: '', slug: '', description: '', primary_color: '' })
    setLogoFile(null); setLogoPreview(null)
    setShowCreate(true)
  }

  function openEdit(b: BrandSummary) {
    setShowCreate(false)
    setEditId(b.id)
    setForm({
      name: b.name,
      slug: b.slug,
      description: b.description ?? '',
      primary_color: b.primary_color ?? '',
    })
    setLogoFile(null); setLogoPreview(b.logo_url ? resolveImage(b.logo_url) : null)
  }

  function closeForm() {
    setShowCreate(false); setEditId(null)
    setLogoFile(null); setLogoPreview(null)
  }

  function pickFile(file: File | null) {
    if (!file) return
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData()
      fd.append('name', form.name)
      if (form.slug) fd.append('slug', form.slug)
      if (form.description) fd.append('description', form.description)
      if (form.primary_color) fd.append('primary_color', form.primary_color)
      if (logoFile) fd.append('logo', logoFile)

      if (editId) {
        fd.append('_method', 'PUT')
        return api.post(`/v1/admin/brands/${editId}`, fd).then(r => r.data)
      }
      return api.post('/v1/admin/brands', fd).then(r => r.data)
    },
    onSuccess: (_data, _vars) => {
      qc.invalidateQueries({ queryKey: ['admin-brands'] })
      qc.invalidateQueries({ queryKey: ['brands'] })
      // First-brand-creation case: an org that just went from 1 brand to 2.
      // Brand-scoped pages (popup rules, KB, chatbot config) were caching
      // results under "All brands" / single-brand context — now they need
      // to refetch under whichever brand the admin lands on next. Blanket
      // invalidate so no stale data lingers anywhere.
      if (!editId) {
        qc.invalidateQueries()
      }
      toast.success(editId ? 'Brand updated' : 'Brand created')
      closeForm()
    },
    onError: (e: any) => {
      const validation = e?.response?.data?.errors
      const firstField = validation ? (Object.values(validation)[0] as string[])[0] : undefined
      toast.error(firstField || e?.response?.data?.message || 'Failed to save brand')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/brands/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-brands'] })
      qc.invalidateQueries({ queryKey: ['brands'] })
      toast.success('Brand deleted')
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || 'Failed to delete brand')
    },
  })

  const setDefaultMutation = useMutation({
    mutationFn: (id: number) => api.post(`/v1/admin/brands/${id}/set-default`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-brands'] })
      qc.invalidateQueries({ queryKey: ['brands'] })
      toast.success('Default brand updated')
    },
    onError: () => toast.error('Failed to update default brand'),
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2.5">
            <Briefcase size={22} className="text-accent" />
            Brands
          </h1>
          <p className="text-sm text-t-secondary mt-1 max-w-2xl">
            Sub-divisions inside your organization. Each brand has its own AI chatbot,
            chat widget, knowledge base, booking engine and theme. Loyalty members,
            CRM data and tier program stay unified across every brand.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="bg-accent text-black font-bold px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-accent/90 transition-colors self-start"
        >
          <Plus size={16} />
          New brand
        </button>
      </div>

      {/* Create / edit form */}
      {(showCreate || editId !== null) && (
        <div className="bg-dark-surface border border-dark-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">
              {editId ? 'Edit brand' : 'New brand'}
            </h2>
            <button onClick={closeForm} className="text-t-secondary hover:text-white">
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Logo */}
            <div className="md:col-span-1">
              <label className="text-[10px] uppercase font-bold tracking-wide text-t-secondary mb-2 block">
                Logo
              </label>
              <div
                onClick={() => fileRef.current?.click()}
                className="aspect-square w-full bg-dark-bg border border-dashed border-dark-border rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-accent transition-colors overflow-hidden"
              >
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo preview" className="w-full h-full object-contain" />
                ) : (
                  <>
                    <Upload size={24} className="text-t-secondary mb-2" />
                    <p className="text-xs text-t-secondary">PNG / JPG / SVG · 5MB max</p>
                  </>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => pickFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {/* Fields */}
            <div className="md:col-span-2 space-y-3">
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wide text-t-secondary mb-1.5 block">
                  Name *
                </label>
                <input
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. The Grand"
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm focus:border-accent outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wide text-t-secondary mb-1.5 block">
                  Slug <span className="text-t-secondary/70 font-normal normal-case">(auto-generated when blank)</span>
                </label>
                <input
                  value={form.slug}
                  onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                  placeholder="the-grand"
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm font-mono focus:border-accent outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wide text-t-secondary mb-1.5 block">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  placeholder="Short marketing line — shown in the brand switcher"
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm focus:border-accent outline-none resize-none"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase font-bold tracking-wide text-t-secondary mb-1.5 block">
                  Primary colour
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.primary_color || '#c9a84c'}
                    onChange={e => setForm({ ...form, primary_color: e.target.value })}
                    className="w-12 h-9 rounded-lg cursor-pointer bg-dark-bg border border-dark-border"
                  />
                  <input
                    value={form.primary_color}
                    onChange={e => setForm({ ...form, primary_color: e.target.value })}
                    placeholder="#c9a84c"
                    className="flex-1 bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm font-mono focus:border-accent outline-none"
                  />
                  {form.primary_color && (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, primary_color: '' })}
                      className="text-xs text-t-secondary hover:text-white"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-5">
            <button
              onClick={closeForm}
              className="px-4 py-2 text-sm text-t-secondary hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!form.name || saveMutation.isPending}
              className="bg-accent text-black font-bold px-4 py-2 rounded-lg text-sm disabled:opacity-50 hover:bg-accent/90 transition-colors"
            >
              {saveMutation.isPending ? 'Saving…' : (editId ? 'Save changes' : 'Create brand')}
            </button>
          </div>
        </div>
      )}

      {/* Brand list */}
      {isLoading ? (
        <div className="text-center py-8 text-t-secondary text-sm">Loading…</div>
      ) : brands.length === 0 ? (
        <div className="text-center py-12 text-t-secondary text-sm">
          No brands yet. Create your first to get started.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {brands.map(b => (
            <div
              key={b.id}
              className="bg-dark-surface border border-dark-border rounded-xl p-5 hover:border-accent/40 transition-colors"
            >
              <div className="flex items-start gap-4">
                {/* Logo / colour swatch */}
                {b.logo_url ? (
                  <img
                    src={resolveImage(b.logo_url) ?? undefined}
                    alt=""
                    className="w-14 h-14 rounded-xl object-cover flex-shrink-0 bg-dark-bg"
                  />
                ) : (
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: b.primary_color ?? 'rgba(255,255,255,0.06)' }}
                  >
                    <Briefcase size={22} className="text-white" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold truncate">{b.name}</h3>
                    {b.is_default && (
                      <span className="text-[9px] font-bold uppercase tracking-wide text-amber-300 bg-amber-300/10 border border-amber-300/30 px-2 py-0.5 rounded">
                        <Star size={9} className="inline-block -mt-px mr-1" />
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-t-secondary font-mono mt-0.5">/{b.slug}</p>
                  {b.description && (
                    <p className="text-sm text-t-secondary mt-2 line-clamp-2">{b.description}</p>
                  )}

                  <div className="flex items-center gap-1.5 mt-3 text-[11px] text-t-secondary">
                    <Globe size={11} />
                    <span className="font-mono truncate">/widget/{b.widget_token.slice(0, 12)}…</span>
                  </div>
                </div>
              </div>

              {/* Last-30-day activity strip */}
              {stats[b.id] && (
                <div className="grid grid-cols-3 gap-3 mt-4 pt-3 border-t border-dark-border">
                  <BrandStat icon={Inbox} value={stats[b.id].inquiries} label="Inquiries" />
                  <BrandStat icon={Calendar} value={stats[b.id].bookings} label="Bookings" />
                  <BrandStat icon={MessageSquare} value={stats[b.id].chats} label="Chats" />
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-dark-border">
                <button
                  onClick={() => openEdit(b)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-dark-surface2 text-t-secondary hover:text-white hover:bg-dark-bg transition-colors"
                >
                  <Pencil size={12} />
                  Edit
                </button>

                {!b.is_default && (
                  <button
                    onClick={() => {
                      if (confirm(`Make "${b.name}" the default brand?`)) {
                        setDefaultMutation.mutate(b.id)
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-dark-surface2 text-t-secondary hover:text-white hover:bg-dark-bg transition-colors"
                  >
                    <Check size={12} />
                    Set as default
                  </button>
                )}

                {!b.is_default && (
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${b.name}"? This cannot be undone.`)) {
                        deleteMutation.mutate(b.id)
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 hover:bg-red-400/10 transition-colors ml-auto"
                  >
                    <Trash2 size={12} />
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
