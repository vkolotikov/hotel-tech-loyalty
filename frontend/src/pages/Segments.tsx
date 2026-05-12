import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Pencil, Trash2, Send, Sparkles, Users, Filter, Loader2, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { api } from '../lib/api'
import { Card } from '../components/ui/Card'

/**
 * Saved member segments + campaign sender.
 *
 * The builder is a stack of filter rows. AND/OR combines them.
 * Live "Preview" button re-evaluates against /segments/preview
 * (no save) so admins can see the count + sample before committing.
 */

type FilterRow = { type: string; op: string; value: any }
type Definition = { operator: 'AND' | 'OR'; filters: FilterRow[] }

interface Segment {
  id: number
  name: string
  description: string | null
  definition: Definition
  member_count_cached: number | null
  member_count_computed_at: string | null
  last_sent_at: string | null
  total_sent_count: number
  created_by?: { id: number; name: string } | null
}

const FILTER_TYPES = [
  { value: 'tier',            label: 'Tier' },
  { value: 'activity',        label: 'Activity' },
  { value: 'current_points',  label: 'Current points' },
  { value: 'lifetime_points', label: 'Lifetime points' },
  { value: 'joined',          label: 'Joined date' },
  { value: 'redemptions',     label: 'Reward redemptions' },
  { value: 'earn',            label: 'Earn transactions' },
]

const OPS_BY_TYPE: Record<string, { value: string; label: string }[]> = {
  tier:            [{ value: 'in', label: 'is one of' }, { value: 'not_in', label: 'is not one of' }],
  activity:        [{ value: 'active_within', label: 'active within (days)' }, { value: 'inactive_over', label: 'inactive for over (days)' }],
  current_points:  [{ value: 'min', label: 'at least' }, { value: 'max', label: 'at most' }],
  lifetime_points: [{ value: 'min', label: 'at least' }, { value: 'max', label: 'at most' }],
  joined:          [{ value: 'after', label: 'on or after' }, { value: 'before', label: 'before' }],
  redemptions:     [{ value: 'any', label: 'has at least one' }, { value: 'none', label: 'has none' }],
  earn:            [{ value: 'any', label: 'has at least one' }, { value: 'none', label: 'has none' }],
}

const emptyDef: Definition = { operator: 'AND', filters: [] }

export function Segments() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<{ name: string; description: string; definition: Definition }>({
    name: '', description: '', definition: emptyDef,
  })
  const [previewResult, setPreviewResult] = useState<{ count: number; sample: any[] } | null>(null)

  const [sendingSegment, setSendingSegment] = useState<Segment | null>(null)
  const [sendForm, setSendForm] = useState({ title: '', body: '', send_email: false, category: 'transactional' as const })

  const { data: segmentsData, isLoading } = useQuery({
    queryKey: ['admin-segments'],
    queryFn: () => api.get('/v1/admin/segments').then(r => r.data),
  })
  const segments: Segment[] = segmentsData?.segments ?? []

  const { data: tiersData } = useQuery({
    queryKey: ['admin-tiers'],
    queryFn: () => api.get('/v1/admin/tiers').then(r => r.data),
  })
  const tiers: { id: number; name: string }[] = tiersData?.tiers ?? []

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { name: form.name, description: form.description || null, definition: form.definition }
      return editId
        ? api.put(`/v1/admin/segments/${editId}`, payload).then(r => r.data)
        : api.post('/v1/admin/segments', payload).then(r => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-segments'] })
      toast.success(editId ? 'Segment updated' : 'Segment created')
      resetForm()
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Save failed'),
  })

  const previewMutation = useMutation({
    mutationFn: () => api.post('/v1/admin/segments/preview', { definition: form.definition }).then(r => r.data),
    onSuccess: (res) => setPreviewResult(res),
    onError: (e: any) => toast.error(e.response?.data?.message || 'Preview failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/segments/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-segments'] }); toast.success('Segment deleted') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Delete failed'),
  })

  const sendMutation = useMutation({
    mutationFn: () => api.post(`/v1/admin/segments/${sendingSegment!.id}/send`, sendForm).then(r => r.data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin-segments'] })
      toast.success(`Sent — push: ${res.push_sent}, email: ${res.email_sent}, skipped: ${res.skipped}`)
      setSendingSegment(null)
      setSendForm({ title: '', body: '', send_email: false, category: 'transactional' })
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Send failed'),
  })

  useEffect(() => { setPreviewResult(null) }, [form.definition])

  const resetForm = () => {
    setShowForm(false); setEditId(null)
    setForm({ name: '', description: '', definition: emptyDef })
    setPreviewResult(null)
  }

  const startEdit = (s: Segment) => {
    setEditId(s.id)
    setForm({
      name: s.name,
      description: s.description ?? '',
      definition: s.definition ?? emptyDef,
    })
    setPreviewResult(null)
    setShowForm(true)
  }

  const addFilter = () => {
    setForm(f => ({
      ...f,
      definition: { ...f.definition, filters: [...f.definition.filters, { type: 'tier', op: 'in', value: [] }] },
    }))
  }

  const updateFilter = (i: number, patch: Partial<FilterRow>) => {
    setForm(f => {
      const next = [...f.definition.filters]
      next[i] = { ...next[i], ...patch }
      // Reset op + value when type changes since the valid op set differs
      if ('type' in patch) {
        next[i].op = OPS_BY_TYPE[patch.type as string]?.[0]?.value ?? ''
        next[i].value = ['tier'].includes(patch.type as string) ? [] : ''
      }
      return { ...f, definition: { ...f.definition, filters: next } }
    })
  }

  const removeFilter = (i: number) => {
    setForm(f => ({
      ...f,
      definition: { ...f.definition, filters: f.definition.filters.filter((_, idx) => idx !== i) },
    }))
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Member segments</h1>
          <p className="text-sm text-t-secondary mt-0.5">
            Save reusable target lists for push + email campaigns. Edit a definition and the list re-evaluates on the fly.
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 text-sm font-semibold">
          <Plus size={16} /> New segment
        </button>
      </div>

      {/* Builder */}
      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">{editId ? 'Edit segment' : 'New segment'}</h2>
            <button onClick={resetForm} className="text-t-secondary hover:text-white"><X size={18} /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs font-medium text-t-secondary mb-1">Name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Gold tier, quiet 60+ days"
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-t-secondary mb-1">Description</label>
              <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional one-liner"
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white" />
            </div>
          </div>

          <div className="border border-dark-border rounded-xl p-3 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs font-medium text-t-secondary">
                <Filter size={13} /> Filters
                <select
                  value={form.definition.operator}
                  onChange={e => setForm(f => ({ ...f, definition: { ...f.definition, operator: e.target.value as 'AND' | 'OR' } }))}
                  className="ml-2 bg-dark-bg border border-dark-border rounded px-2 py-0.5 text-[11px] text-white"
                >
                  <option value="AND">match all (AND)</option>
                  <option value="OR">match any (OR)</option>
                </select>
              </div>
              <button onClick={addFilter}
                className="flex items-center gap-1 bg-dark-surface2 border border-dark-border text-[#a0a0a0] hover:text-white text-xs px-2 py-1 rounded">
                <Plus size={12} /> Add filter
              </button>
            </div>

            {form.definition.filters.length === 0 ? (
              <p className="text-xs text-[#636366] py-4 text-center">
                No filters yet. Click "Add filter" to start. An empty segment matches every active member.
              </p>
            ) : (
              <div className="space-y-2">
                {form.definition.filters.map((f, i) => (
                  <FilterRowEditor
                    key={i}
                    row={f}
                    tiers={tiers}
                    onChange={(patch) => updateFilter(i, patch)}
                    onRemove={() => removeFilter(i)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Preview result */}
          {previewResult && (
            <div className="rounded-lg border border-dark-border bg-[#1a1a1a] p-3 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Users size={14} className="text-primary-400" />
                <span className="text-sm text-white font-semibold">{previewResult.count.toLocaleString()} matching members</span>
                <span className="text-[11px] text-[#636366]">· first {previewResult.sample.length} shown</span>
              </div>
              {previewResult.sample.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-xs">
                  {previewResult.sample.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 py-1">
                      <span className="text-white">{m.name}</span>
                      {m.tier && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                          style={{ backgroundColor: (m.tier_color || '#666') + '22', color: m.tier_color || '#a0a0a0' }}>
                          {m.tier}
                        </span>
                      )}
                      <span className="text-[#636366] ml-auto">{(m.current_points ?? 0).toLocaleString()} pts</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-between items-center pt-3 border-t border-dark-border">
            <button
              onClick={() => previewMutation.mutate()}
              disabled={previewMutation.isPending}
              className="flex items-center gap-1.5 bg-dark-surface2 border border-dark-border text-white text-sm font-semibold px-3 py-1.5 rounded-lg">
              {previewMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
              Preview
            </button>
            <div className="flex gap-2">
              <button onClick={resetForm} className="px-3 py-1.5 text-sm text-[#a0a0a0] hover:text-white">Cancel</button>
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !form.name.trim()}
                className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
                {saveMutation.isPending ? 'Saving…' : (editId ? 'Update' : 'Create')}
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Segments list */}
      <Card>
        {isLoading ? (
          <p className="text-center text-[#636366] py-8 text-sm">Loading…</p>
        ) : segments.length === 0 ? (
          <p className="text-center text-[#636366] py-8 text-sm">
            No saved segments yet. Click "New segment" to create your first.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-t-secondary border-b border-dark-border">
                  <th className="pb-3 font-medium">Name</th>
                  <th className="pb-3 font-medium">Filters</th>
                  <th className="pb-3 font-medium text-right">Audience</th>
                  <th className="pb-3 font-medium">Last sent</th>
                  <th className="pb-3 font-medium text-right">Total sent</th>
                  <th className="pb-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border">
                {segments.map(s => (
                  <tr key={s.id} className="hover:bg-dark-surface2">
                    <td className="py-3">
                      <div className="text-white font-medium">{s.name}</div>
                      {s.description && <div className="text-[11px] text-[#636366] mt-0.5">{s.description}</div>}
                    </td>
                    <td className="py-3 text-xs text-[#a0a0a0]">
                      {(s.definition?.filters ?? []).length} filter{(s.definition?.filters ?? []).length === 1 ? '' : 's'} · {s.definition?.operator ?? 'AND'}
                    </td>
                    <td className="py-3 text-right font-semibold text-white">
                      {s.member_count_cached != null ? s.member_count_cached.toLocaleString() : '—'}
                    </td>
                    <td className="py-3 text-xs text-t-secondary">
                      {s.last_sent_at ? format(new Date(s.last_sent_at), 'MMM d, HH:mm') : 'Never'}
                    </td>
                    <td className="py-3 text-right text-xs text-[#a0a0a0]">{s.total_sent_count.toLocaleString()}</td>
                    <td className="py-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => { setSendingSegment(s); setSendForm({ title: '', body: '', send_email: false, category: 'transactional' }) }}
                          className="flex items-center gap-1 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold px-2.5 py-1 rounded">
                          <Send size={12} /> Send
                        </button>
                        <button onClick={() => startEdit(s)} className="p-1.5 rounded hover:bg-dark-surface3 text-[#a0a0a0]" title="Edit"><Pencil size={13} /></button>
                        <button onClick={() => confirm(`Delete segment "${s.name}"?`) && deleteMutation.mutate(s.id)}
                          className="p-1.5 rounded hover:bg-dark-surface3 text-red-400" title="Delete"><Trash2 size={13} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Send campaign modal */}
      {sendingSegment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-surface rounded-2xl border border-dark-border w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-dark-border">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Sparkles size={16} className="text-primary-400" />
                  Send to "{sendingSegment.name}"
                </h2>
                <p className="text-[11px] text-[#636366] mt-0.5">
                  Audience: ~{sendingSegment.member_count_cached?.toLocaleString() ?? '?'} members
                </p>
              </div>
              <button onClick={() => setSendingSegment(null)} className="text-[#636366] hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#a0a0a0] mb-1">Category</label>
                <select
                  value={sendForm.category}
                  onChange={e => setSendForm(s => ({ ...s, category: e.target.value as any }))}
                  className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="transactional">Transactional (always delivered)</option>
                  <option value="offers">Offers</option>
                  <option value="points">Points</option>
                  <option value="tier">Tier</option>
                  <option value="stays">Stays</option>
                </select>
                <p className="text-[11px] text-[#636366] mt-1">Members opted-out of this category will be skipped (transactional ignores opt-outs).</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#a0a0a0] mb-1">Title</label>
                <input value={sendForm.title} onChange={e => setSendForm(s => ({ ...s, title: e.target.value }))}
                  maxLength={120} placeholder="A surprise for our Gold members"
                  className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#a0a0a0] mb-1">Message</label>
                <textarea value={sendForm.body} onChange={e => setSendForm(s => ({ ...s, body: e.target.value }))}
                  maxLength={500} rows={4} placeholder="Double points this weekend on every stay."
                  className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white" />
              </div>
              <label className="flex items-center gap-2 text-sm text-[#e0e0e0] cursor-pointer">
                <input type="checkbox" checked={sendForm.send_email} onChange={e => setSendForm(s => ({ ...s, send_email: e.target.checked }))} />
                Also send as email
              </label>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-dark-border">
              <button onClick={() => setSendingSegment(null)} className="px-3 py-1.5 text-sm text-[#a0a0a0] hover:text-white">Cancel</button>
              <button
                onClick={() => sendMutation.mutate()}
                disabled={sendMutation.isPending || !sendForm.title.trim() || !sendForm.body.trim()}
                className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
                {sendMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Send campaign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FilterRowEditor({
  row, tiers, onChange, onRemove,
}: { row: FilterRow; tiers: { id: number; name: string }[]; onChange: (patch: Partial<FilterRow>) => void; onRemove: () => void }) {
  const opOptions = OPS_BY_TYPE[row.type] ?? []
  const needsValue = !['any', 'none'].includes(row.op)

  return (
    <div className="flex flex-wrap items-center gap-2 bg-[#1a1a1a] border border-dark-border rounded-lg p-2">
      <select value={row.type} onChange={e => onChange({ type: e.target.value })}
        className="bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-white">
        {FILTER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <select value={row.op} onChange={e => onChange({ op: e.target.value })}
        className="bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-white">
        {opOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {needsValue && row.type === 'tier' ? (
        <select
          multiple
          value={(row.value ?? []).map(String)}
          onChange={e => onChange({ value: Array.from(e.target.selectedOptions).map(o => Number(o.value)) })}
          className="bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-white min-w-[160px]"
        >
          {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      ) : needsValue && row.type === 'joined' ? (
        <input type="date" value={row.value ?? ''} onChange={e => onChange({ value: e.target.value })}
          className="bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-white" />
      ) : needsValue ? (
        <input
          type="number"
          min={0}
          value={row.value ?? ''}
          onChange={e => onChange({ value: e.target.value === '' ? '' : Number(e.target.value) })}
          placeholder={row.type === 'activity' ? 'days' : 'points'}
          className="bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-white w-28"
        />
      ) : null}
      <button onClick={onRemove}
        className="ml-auto text-[#636366] hover:text-red-400">
        <X size={14} />
      </button>
    </div>
  )
}
