import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Pencil, Trash2, Send, Mail, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import { Card } from '../components/ui/Card'

/**
 * Email broadcast campaigns. Distinct from the segment quick-message
 * because campaigns carry a subject + full HTML body + persistent
 * history (sent / failed counts, status, sent-at).
 *
 * v1 send is synchronous and capped at 5000 recipients (the same
 * cap the segment service enforces). Future: queue + retry on the
 * failed_count for a proper retry-loop.
 */

interface Campaign {
  id: number
  name: string
  subject: string
  body_html: string
  body_text: string | null
  status: 'draft' | 'sending' | 'sent' | 'failed'
  segment_id: number | null
  segment?: { id: number; name: string }
  recipient_count: number
  sent_count: number
  failed_count: number
  sent_at: string | null
  error_message: string | null
  created_at: string
  created_by?: { id: number; name: string } | null
  sent_by?: { id: number; name: string } | null
}

const emptyForm = { name: '', subject: '', body_html: '', body_text: '', segment_id: '' as string | number }

export function EmailCampaigns() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)

  const { data, isLoading } = useQuery({
    queryKey: ['email-campaigns'],
    queryFn: () => api.get('/v1/admin/email-campaigns').then(r => r.data),
  })
  const campaigns: Campaign[] = data?.data ?? []

  const { data: segmentsData } = useQuery({
    queryKey: ['admin-segments'],
    queryFn: () => api.get('/v1/admin/segments').then(r => r.data),
  })
  const segments: { id: number; name: string; member_count_cached: number | null }[] = segmentsData?.segments ?? []

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        name: form.name,
        subject: form.subject,
        body_html: form.body_html,
        body_text: form.body_text || null,
        segment_id: form.segment_id ? Number(form.segment_id) : null,
      }
      return editId
        ? api.put(`/v1/admin/email-campaigns/${editId}`, payload).then(r => r.data)
        : api.post('/v1/admin/email-campaigns', payload).then(r => r.data)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-campaigns'] })
      toast.success(editId ? 'Draft updated' : 'Draft created')
      resetForm()
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Save failed'),
  })

  const sendMutation = useMutation({
    mutationFn: (id: number) => api.post(`/v1/admin/email-campaigns/${id}/send`).then(r => r.data),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['email-campaigns'] })
      toast.success(`Sent — ${res.sent} delivered, ${res.failed} failed, of ${res.recipients} recipients`)
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Send failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/email-campaigns/${id}`).then(r => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['email-campaigns'] }); toast.success('Draft deleted') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Delete failed'),
  })

  const resetForm = () => { setShowForm(false); setEditId(null); setForm(emptyForm) }

  const startEdit = (c: Campaign) => {
    if (c.status !== 'draft') {
      toast.error('Only drafts can be edited.')
      return
    }
    setEditId(c.id)
    setForm({
      name: c.name,
      subject: c.subject,
      body_html: c.body_html,
      body_text: c.body_text ?? '',
      segment_id: c.segment_id ?? '',
    })
    setShowForm(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Email campaigns</h1>
          <p className="text-sm text-t-secondary mt-0.5">
            Compose, save, then send rich emails to a saved segment. Members opted out of email are skipped automatically.
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 text-sm font-semibold">
          <Plus size={16} /> New campaign
        </button>
      </div>

      {showForm && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">{editId ? 'Edit draft' : 'New draft'}</h2>
            <button onClick={resetForm} className="text-t-secondary hover:text-white"><X size={18} /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-medium text-t-secondary mb-1">Internal name *</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. June win-back to Gold tier"
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white" />
            </div>
            <div>
              <label className="block text-xs font-medium text-t-secondary mb-1">Target segment</label>
              <select value={form.segment_id} onChange={e => setForm(f => ({ ...f, segment_id: e.target.value }))}
                className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white">
                <option value="">— No segment (pick recipients on send) —</option>
                {segments.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.member_count_cached != null ? `(${s.member_count_cached.toLocaleString()} members)` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-xs font-medium text-t-secondary mb-1">Subject *</label>
            <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
              placeholder="Your exclusive offer inside"
              className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white" />
          </div>

          <div className="mb-3">
            <label className="block text-xs font-medium text-t-secondary mb-1">HTML body *</label>
            <textarea value={form.body_html} onChange={e => setForm(f => ({ ...f, body_html: e.target.value }))}
              rows={10}
              placeholder="<h1>Hi there</h1><p>We've prepared a special offer just for you…</p>"
              className="w-full font-mono text-xs bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white" />
            <p className="text-[10px] text-[#636366] mt-1">Plain HTML. Inline styles render best across email clients.</p>
          </div>

          <div className="mb-4">
            <label className="block text-xs font-medium text-t-secondary mb-1">Plain text fallback <span className="text-[#636366]">(optional)</span></label>
            <textarea value={form.body_text} onChange={e => setForm(f => ({ ...f, body_text: e.target.value }))}
              rows={3}
              className="w-full text-xs bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white" />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-dark-border">
            <button onClick={resetForm} className="px-3 py-1.5 text-sm text-[#a0a0a0] hover:text-white">Cancel</button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.name.trim() || !form.subject.trim() || !form.body_html.trim()}
              className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg">
              {saveMutation.isPending ? 'Saving…' : (editId ? 'Update draft' : 'Save draft')}
            </button>
          </div>
        </Card>
      )}

      <Card>
        {isLoading ? (
          <p className="text-center text-[#636366] py-8 text-sm">Loading…</p>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-12">
            <Mail size={36} className="mx-auto text-[#636366] mb-3" />
            <p className="text-[#636366] text-sm">No campaigns yet. Click "New campaign" to draft your first broadcast.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-t-secondary border-b border-dark-border">
                  <th className="pb-3 font-medium">Campaign</th>
                  <th className="pb-3 font-medium">Audience</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium text-right">Sent / Recipients</th>
                  <th className="pb-3 font-medium">When</th>
                  <th className="pb-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border">
                {campaigns.map(c => (
                  <tr key={c.id} className="hover:bg-dark-surface2">
                    <td className="py-3">
                      <div className="text-white font-medium">{c.name}</div>
                      <div className="text-[11px] text-[#a0a0a0]">{c.subject}</div>
                    </td>
                    <td className="py-3 text-xs text-[#a0a0a0]">
                      {c.segment?.name ?? <span className="text-[#636366]">— Unsegmented —</span>}
                    </td>
                    <td className="py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        c.status === 'sent'    ? 'bg-[#32d74b]/15 text-[#32d74b]' :
                        c.status === 'sending' ? 'bg-[#5ac8fa]/15 text-[#5ac8fa]' :
                        c.status === 'failed'  ? 'bg-[#ef4444]/15 text-[#ef4444]' :
                                                 'bg-dark-surface3 text-[#a0a0a0]'
                      }`}>
                        {c.status === 'sent'    && <CheckCircle size={11} />}
                        {c.status === 'sending' && <Loader2 size={11} className="animate-spin" />}
                        {c.status === 'failed'  && <AlertCircle size={11} />}
                        {c.status}
                      </span>
                      {c.failed_count > 0 && c.status === 'sent' && (
                        <div className="text-[10px] text-[#f59e0b] mt-0.5">{c.failed_count} failed</div>
                      )}
                    </td>
                    <td className="py-3 text-right text-white font-semibold">
                      {c.status === 'sent'
                        ? <>{c.sent_count.toLocaleString()} / {c.recipient_count.toLocaleString()}</>
                        : c.status === 'draft' ? '—' : `${c.sent_count.toLocaleString()} / ${c.recipient_count.toLocaleString()}`}
                    </td>
                    <td className="py-3 text-xs text-t-secondary">
                      {c.sent_at ? format(new Date(c.sent_at), 'MMM d, HH:mm') : `drafted ${format(new Date(c.created_at), 'MMM d')}`}
                    </td>
                    <td className="py-3">
                      <div className="flex gap-1 justify-end">
                        {c.status === 'draft' && (
                          <button
                            onClick={() => confirm(`Send "${c.name}" now?${c.segment ? ` Audience: ${c.segment.name}.` : ''}`) && sendMutation.mutate(c.id)}
                            className="flex items-center gap-1 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold px-2.5 py-1 rounded">
                            <Send size={12} /> Send
                          </button>
                        )}
                        {c.status === 'draft' && (
                          <>
                            <button onClick={() => startEdit(c)} className="p-1.5 rounded hover:bg-dark-surface3 text-[#a0a0a0]" title="Edit"><Pencil size={13} /></button>
                            <button onClick={() => confirm(`Delete draft "${c.name}"?`) && deleteMutation.mutate(c.id)}
                              className="p-1.5 rounded hover:bg-dark-surface3 text-red-400" title="Delete"><Trash2 size={13} /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
