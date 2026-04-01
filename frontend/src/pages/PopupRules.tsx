import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Zap, Plus, Pencil, Trash2, Save, X, Eye, MousePointer } from 'lucide-react'
import toast from 'react-hot-toast'

const TRIGGER_TYPES = [
  { value: 'page_load', label: 'Page Load', desc: 'Triggers when the page loads' },
  { value: 'time_delay', label: 'Time Delay', desc: 'Triggers after X seconds' },
  { value: 'scroll_depth', label: 'Scroll Depth', desc: 'Triggers at X% scroll' },
  { value: 'exit_intent', label: 'Exit Intent', desc: 'Triggers when mouse leaves viewport' },
]

const URL_MATCH_TYPES = [
  { value: 'contains', label: 'Contains' },
  { value: 'exact', label: 'Exact Match' },
  { value: 'starts_with', label: 'Starts With' },
  { value: 'regex', label: 'Regex' },
]

const VISITOR_TYPES = [
  { value: 'all', label: 'All Visitors' },
  { value: 'new', label: 'New Visitors' },
  { value: 'returning', label: 'Returning Visitors' },
]

const emptyForm = {
  name: '', trigger_type: 'time_delay', trigger_value: '5', url_match_type: 'contains',
  url_match_value: '', visitor_type: 'all', language_targets: [] as string[],
  message: '', quick_replies: [] as string[], priority: 0, is_active: true,
}

export function PopupRules() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [newReply, setNewReply] = useState('')

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['popup-rules'],
    queryFn: () => api.get('/v1/admin/popup-rules').then(r => r.data),
  })

  const saveMutation = useMutation({
    mutationFn: (data: any) => editId ? api.put(`/v1/admin/popup-rules/${editId}`, data) : api.post('/v1/admin/popup-rules', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['popup-rules'] })
      setShowForm(false)
      setEditId(null)
      setForm(emptyForm)
      toast.success(editId ? 'Rule updated' : 'Rule created')
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/popup-rules/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['popup-rules'] }); toast.success('Deleted') },
  })

  const editRule = (rule: any) => {
    setEditId(rule.id)
    setForm({
      name: rule.name, trigger_type: rule.trigger_type, trigger_value: rule.trigger_value || '',
      url_match_type: rule.url_match_type || 'contains', url_match_value: rule.url_match_value || '',
      visitor_type: rule.visitor_type || 'all', language_targets: rule.language_targets || [],
      message: rule.message, quick_replies: rule.quick_replies || [], priority: rule.priority, is_active: rule.is_active,
    })
    setShowForm(true)
  }

  const addReply = () => {
    if (!newReply.trim()) return
    setForm(p => ({ ...p, quick_replies: [...p.quick_replies, newReply.trim()] }))
    setNewReply('')
  }

  const removeReply = (i: number) => {
    setForm(p => ({ ...p, quick_replies: p.quick_replies.filter((_, idx) => idx !== i) }))
  }

  const triggerLabel = (type: string) => TRIGGER_TYPES.find(t => t.value === type)?.label || type

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap className="text-primary-500" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-white">Popup Automation Rules</h1>
            <p className="text-sm text-[#8e8e93]">Configure when the chat widget auto-opens with a message</p>
          </div>
        </div>
        <button onClick={() => { setShowForm(true); setEditId(null); setForm(emptyForm) }}
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 text-sm">
          <Plus size={16} /> Add Rule
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-dark-surface border border-dark-border rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold">{editId ? 'Edit Rule' : 'New Popup Rule'}</h3>
            <button onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm) }} className="text-[#8e8e93] hover:text-white"><X size={18} /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-[#8e8e93] mb-1">Rule Name</label>
              <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-[#1c1c1e] border border-dark-border rounded-lg px-3 py-2 text-white text-sm" placeholder="Welcome popup" />
            </div>
            <div>
              <label className="block text-sm text-[#8e8e93] mb-1">Priority</label>
              <input type="number" min={0} value={form.priority} onChange={e => setForm(p => ({ ...p, priority: Number(e.target.value) }))}
                className="w-full bg-[#1c1c1e] border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
            </div>
          </div>

          {/* Trigger */}
          <div>
            <label className="block text-sm text-[#8e8e93] mb-2">Trigger Type</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {TRIGGER_TYPES.map(t => (
                <button key={t.value} onClick={() => setForm(p => ({ ...p, trigger_type: t.value }))}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    form.trigger_type === t.value ? 'border-primary-500 bg-primary-500/10' : 'border-dark-border hover:border-[#555]'
                  }`}>
                  <div className="text-sm font-medium text-white">{t.label}</div>
                  <div className="text-xs text-[#8e8e93] mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {(form.trigger_type === 'time_delay' || form.trigger_type === 'scroll_depth') && (
            <div>
              <label className="block text-sm text-[#8e8e93] mb-1">
                {form.trigger_type === 'time_delay' ? 'Delay (seconds)' : 'Scroll Depth (%)'}
              </label>
              <input type="text" value={form.trigger_value} onChange={e => setForm(p => ({ ...p, trigger_value: e.target.value }))}
                className="w-32 bg-[#1c1c1e] border border-dark-border rounded-lg px-3 py-2 text-white text-sm" placeholder={form.trigger_type === 'time_delay' ? '5' : '50'} />
            </div>
          )}

          {/* URL Matching */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-[#8e8e93] mb-1">URL Match Type</label>
              <select value={form.url_match_type} onChange={e => setForm(p => ({ ...p, url_match_type: e.target.value }))}
                className="w-full bg-[#1c1c1e] border border-dark-border rounded-lg px-3 py-2 text-white text-sm">
                {URL_MATCH_TYPES.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-[#8e8e93] mb-1">URL Pattern (optional)</label>
              <input type="text" value={form.url_match_value} onChange={e => setForm(p => ({ ...p, url_match_value: e.target.value }))}
                className="w-full bg-[#1c1c1e] border border-dark-border rounded-lg px-3 py-2 text-white text-sm" placeholder="/booking, /rooms, etc." />
            </div>
          </div>

          {/* Visitor Type */}
          <div>
            <label className="block text-sm text-[#8e8e93] mb-1">Visitor Type</label>
            <select value={form.visitor_type} onChange={e => setForm(p => ({ ...p, visitor_type: e.target.value }))}
              className="w-48 bg-[#1c1c1e] border border-dark-border rounded-lg px-3 py-2 text-white text-sm">
              {VISITOR_TYPES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm text-[#8e8e93] mb-1">Popup Message</label>
            <textarea value={form.message} onChange={e => setForm(p => ({ ...p, message: e.target.value }))} rows={3}
              className="w-full bg-[#1c1c1e] border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
              placeholder="Hi! Looking for the perfect room? I can help you find one..." />
          </div>

          {/* Quick Replies */}
          <div>
            <label className="block text-sm text-[#8e8e93] mb-1">Quick Reply Buttons</label>
            <div className="flex flex-wrap gap-1 mb-2">
              {form.quick_replies.map((r, i) => (
                <span key={i} className="flex items-center gap-1 bg-primary-500/20 text-primary-400 px-2 py-1 rounded text-xs">
                  {r}
                  <button onClick={() => removeReply(i)}><X size={12} /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input type="text" value={newReply} onChange={e => setNewReply(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addReply())}
                className="flex-1 bg-[#1c1c1e] border border-dark-border rounded-lg px-3 py-2 text-white text-sm" placeholder="Add quick reply..." />
              <button onClick={addReply} className="bg-[#333] text-white px-3 py-2 rounded-lg text-sm hover:bg-[#444]"><Plus size={14} /></button>
            </div>
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))}
              className="w-4 h-4 rounded border-dark-border bg-[#1c1c1e] text-primary-500" />
            <span className="text-sm text-white">Active</span>
          </label>

          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowForm(false); setEditId(null); setForm(emptyForm) }} className="px-4 py-2 text-sm text-[#8e8e93] hover:text-white">Cancel</button>
            <button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}
              className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 text-sm disabled:opacity-50">
              <Save size={14} /> {saveMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Rules List */}
      {isLoading ? (
        <div className="text-center text-[#8e8e93] py-12">Loading...</div>
      ) : rules.length === 0 ? (
        <div className="text-center text-[#8e8e93] py-12">
          <Zap size={40} className="mx-auto mb-3 opacity-30" />
          <p>No popup rules yet. Create one to auto-engage visitors.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule: any) => (
            <div key={rule.id} className="bg-dark-surface border border-dark-border rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white font-medium">{rule.name}</span>
                    <span className="text-xs bg-[#333] text-[#8e8e93] px-2 py-0.5 rounded">{triggerLabel(rule.trigger_type)}</span>
                    {rule.trigger_value && <span className="text-xs text-[#555]">({rule.trigger_value}{rule.trigger_type === 'scroll_depth' ? '%' : 's'})</span>}
                    {!rule.is_active && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">Inactive</span>}
                  </div>
                  <p className="text-sm text-[#8e8e93] line-clamp-1">{rule.message}</p>
                  <div className="flex items-center gap-4 mt-1 text-xs text-[#555]">
                    {rule.url_match_value && <span>URL: {rule.url_match_type} "{rule.url_match_value}"</span>}
                    <span>Visitor: {rule.visitor_type}</span>
                    <span className="flex items-center gap-1"><Eye size={10} /> {rule.impressions_count}</span>
                    <span className="flex items-center gap-1"><MousePointer size={10} /> {rule.clicks_count}</span>
                    <span>Priority: {rule.priority}</span>
                  </div>
                  {rule.quick_replies?.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {rule.quick_replies.map((r: string, i: number) => (
                        <span key={i} className="text-xs bg-primary-500/10 text-primary-400 px-1.5 py-0.5 rounded">{r}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 ml-4">
                  <button onClick={() => editRule(rule)} className="p-2 text-[#8e8e93] hover:text-white"><Pencil size={14} /></button>
                  <button onClick={() => { if (confirm('Delete this rule?')) deleteMutation.mutate(rule.id) }}
                    className="p-2 text-[#8e8e93] hover:text-red-400"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
