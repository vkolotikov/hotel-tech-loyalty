import { useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, X, Pencil, Trash2, Send, Mail, Loader2, CheckCircle, AlertCircle,
  Copy, Beaker, Sparkles, Users, FileText, AlertTriangle, MoreHorizontal,
} from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { api } from '../lib/api'

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

interface CampaignStats {
  sent_this_month: number
  campaigns_this_month: number
  drafts: number
  total_reached: number
  failed_this_month: number
}

const emptyForm = { name: '', subject: '', body_html: '', body_text: '', segment_id: '' as string | number }

/**
 * Starter HTML templates. Inline styles only — Outlook + Apple Mail
 * still treat <style> blocks unreliably. Tokens like {{member.name}}
 * are previewed with sample values and substituted server-side at send.
 */
const TEMPLATES: { key: string; label: string; description: string; subject: string; html: string }[] = [
  {
    key: 'newsletter',
    label: 'Newsletter',
    description: 'Monthly update with header image + three story blocks',
    subject: 'What\'s new this month at our hotel',
    html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;color:#1a1a1a;">
  <div style="background:#0e0e0e;padding:32px 24px;text-align:center;">
    <h1 style="color:#c9a84c;margin:0;font-size:28px;letter-spacing:0.5px;">Monthly Update</h1>
  </div>
  <div style="padding:24px;">
    <p style="font-size:16px;line-height:1.5;">Hi {{member.name}},</p>
    <p style="font-size:14px;line-height:1.6;color:#555;">A quick look at what's been happening at your favourite stay this month, plus a few things on the horizon you'll want to know about.</p>
    <h2 style="font-size:18px;margin-top:32px;border-bottom:1px solid #e5e5e5;padding-bottom:8px;">Story one</h2>
    <p style="font-size:14px;line-height:1.6;color:#555;">Your copy here…</p>
    <h2 style="font-size:18px;margin-top:24px;border-bottom:1px solid #e5e5e5;padding-bottom:8px;">Story two</h2>
    <p style="font-size:14px;line-height:1.6;color:#555;">Your copy here…</p>
    <div style="margin-top:32px;text-align:center;">
      <a href="#" style="background:#c9a84c;color:#0e0e0e;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">View on our site</a>
    </div>
  </div>
  <div style="background:#f5f5f5;padding:16px;text-align:center;font-size:11px;color:#888;">
    You're receiving this as a member of our loyalty programme.
  </div>
</div>`,
  },
  {
    key: 'winback',
    label: 'Win-back',
    description: 'Re-engagement for members who haven\'t stayed in a while',
    subject: 'We miss you, {{member.name}}',
    html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;color:#1a1a1a;">
  <div style="padding:32px 24px;text-align:center;">
    <h1 style="margin:0;font-size:32px;color:#1a1a1a;">It's been a while</h1>
  </div>
  <div style="padding:0 24px 24px;">
    <p style="font-size:16px;line-height:1.5;">Hi {{member.name}},</p>
    <p style="font-size:14px;line-height:1.6;color:#555;">We noticed it's been a few months. As a {{member.tier}} member, you've earned <strong>{{member.points}}</strong> points so far — here's a little bonus to bring you back.</p>
    <div style="background:#fff8e1;border:1px solid #c9a84c;padding:20px;border-radius:8px;text-align:center;margin:24px 0;">
      <p style="margin:0;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:1px;">Special offer</p>
      <p style="margin:8px 0 0;font-size:28px;font-weight:bold;color:#c9a84c;">+500 bonus points</p>
      <p style="margin:8px 0 0;font-size:12px;color:#888;">On your next booking, this month only</p>
    </div>
    <div style="text-align:center;">
      <a href="#" style="background:#1a1a1a;color:#fff;padding:14px 28px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Book your next stay</a>
    </div>
  </div>
</div>`,
  },
  {
    key: 'offer',
    label: 'Offer spotlight',
    description: 'Single hero offer with big CTA',
    subject: 'Exclusive for {{member.tier}} members',
    html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;color:#1a1a1a;">
  <div style="background:linear-gradient(135deg,#1a1a1a 0%,#3a3a3a 100%);padding:48px 24px;text-align:center;color:#fff;">
    <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#c9a84c;">Members only</p>
    <h1 style="margin:8px 0 0;font-size:36px;">Your exclusive offer</h1>
  </div>
  <div style="padding:32px 24px;">
    <p style="font-size:16px;line-height:1.5;">Hi {{member.name}},</p>
    <p style="font-size:15px;line-height:1.6;color:#555;">As a thank you for being one of our most loyal guests, we'd like to share something special with you.</p>
    <div style="background:#f9f9f9;padding:24px;border-radius:8px;margin:24px 0;text-align:center;">
      <h2 style="margin:0;font-size:24px;">25% off your next stay</h2>
      <p style="margin:8px 0 16px;color:#888;font-size:13px;">Valid for bookings made before the end of this month.</p>
      <a href="#" style="background:#c9a84c;color:#0e0e0e;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Claim now</a>
    </div>
  </div>
</div>`,
  },
  {
    key: 'tier',
    label: 'Tier promotion',
    description: 'Congratulate a member on tier upgrade',
    subject: 'Welcome to {{member.tier}}, {{member.name}}',
    html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#ffffff;color:#1a1a1a;">
  <div style="background:#c9a84c;padding:48px 24px;text-align:center;color:#0e0e0e;">
    <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:2px;">Tier upgrade</p>
    <h1 style="margin:8px 0 0;font-size:36px;">Welcome to {{member.tier}}</h1>
  </div>
  <div style="padding:32px 24px;">
    <p style="font-size:16px;line-height:1.5;">Congratulations, {{member.name}}!</p>
    <p style="font-size:15px;line-height:1.6;color:#555;">You've reached a new tier in our loyalty programme. From now on, every stay earns you more, and you'll enjoy these new benefits:</p>
    <ul style="font-size:14px;line-height:2;color:#555;padding-left:20px;">
      <li>Priority room upgrades</li>
      <li>Complimentary breakfast</li>
      <li>Late checkout when available</li>
    </ul>
    <p style="font-size:14px;color:#888;text-align:center;margin-top:24px;">Current balance: <strong>{{member.points}}</strong> points</p>
  </div>
</div>`,
  },
  {
    key: 'blank',
    label: 'Blank',
    description: 'Start from scratch',
    subject: '',
    html: '',
  },
]

/**
 * Variable tokens that get substituted at send time. Preview pane uses
 * sample values so the admin can see what the email will look like
 * to the recipient.
 */
const PREVIEW_VARIABLES: Record<string, string> = {
  '{{member.name}}':          'Sarah Johnson',
  '{{member.first_name}}':    'Sarah',
  '{{member.tier}}':          'Gold',
  '{{member.points}}':        '4,750',
  '{{member.member_number}}': 'HL-2026-000123',
}

const VARIABLE_CHIPS = [
  { token: '{{member.name}}',          label: 'Name' },
  { token: '{{member.first_name}}',    label: 'First name' },
  { token: '{{member.tier}}',          label: 'Tier' },
  { token: '{{member.points}}',        label: 'Points' },
  { token: '{{member.member_number}}', label: 'Member #' },
]

function applyPreviewVariables(html: string): string {
  return Object.entries(PREVIEW_VARIABLES).reduce(
    (out, [token, value]) => out.replaceAll(token, value),
    html,
  )
}

export function EmailCampaigns() {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [statusFilter, setStatusFilter] = useState<'' | 'draft' | 'sent' | 'failed'>('')
  const [showPreview, setShowPreview] = useState(true)
  const [openMenuFor, setOpenMenuFor] = useState<number | null>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const { data: statsData } = useQuery<CampaignStats>({
    queryKey: ['email-campaigns-stats'],
    queryFn: () => api.get('/v1/admin/email-campaigns/stats').then(r => r.data),
    staleTime: 30_000,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['email-campaigns', statusFilter],
    queryFn: () => api.get('/v1/admin/email-campaigns', { params: { status: statusFilter || undefined } }).then(r => r.data),
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
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['email-campaigns'] })
      qc.invalidateQueries({ queryKey: ['email-campaigns-stats'] })
      toast.success(editId ? 'Draft updated' : 'Draft created')
      // After create, keep the form open in edit mode so admins can
      // send a test or send it for real without losing context.
      if (!editId && res?.campaign?.id) {
        setEditId(res.campaign.id)
      } else {
        resetForm()
      }
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Save failed'),
  })

  const sendMutation = useMutation({
    mutationFn: (id: number) => api.post(`/v1/admin/email-campaigns/${id}/send`).then(r => r.data),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['email-campaigns'] })
      qc.invalidateQueries({ queryKey: ['email-campaigns-stats'] })
      toast.success(`Sent — ${res.sent} delivered, ${res.failed} failed, of ${res.recipients} recipients`)
      resetForm()
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Send failed'),
  })

  const testMutation = useMutation({
    mutationFn: (id: number) => api.post(`/v1/admin/email-campaigns/${id}/test`).then(r => r.data),
    onSuccess: (res: any) => toast.success(res?.message ?? 'Test email sent'),
    onError: (e: any) => toast.error(e.response?.data?.message || 'Test failed'),
  })

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => api.post(`/v1/admin/email-campaigns/${id}/duplicate`).then(r => r.data),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['email-campaigns'] })
      qc.invalidateQueries({ queryKey: ['email-campaigns-stats'] })
      toast.success('Campaign duplicated as draft')
      // Auto-open the new draft for immediate edit.
      if (res?.campaign) {
        startEdit(res.campaign)
      }
      setOpenMenuFor(null)
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Duplicate failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/email-campaigns/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-campaigns'] })
      qc.invalidateQueries({ queryKey: ['email-campaigns-stats'] })
      toast.success('Draft deleted')
    },
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

  const applyTemplate = (key: string) => {
    const t = TEMPLATES.find(x => x.key === key)
    if (!t) return
    setForm(f => ({
      ...f,
      subject: t.subject || f.subject,
      body_html: t.html,
    }))
  }

  const insertVariable = (token: string) => {
    const el = bodyRef.current
    if (!el) {
      setForm(f => ({ ...f, body_html: f.body_html + token }))
      return
    }
    const start = el.selectionStart ?? form.body_html.length
    const end   = el.selectionEnd ?? form.body_html.length
    const next  = form.body_html.slice(0, start) + token + form.body_html.slice(end)
    setForm(f => ({ ...f, body_html: next }))
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = start + token.length
    })
  }

  const previewHtml = useMemo(() => {
    const body = form.body_html.trim()
      ? applyPreviewVariables(form.body_html)
      : '<div style="font-family:sans-serif;color:#888;padding:48px 24px;text-align:center;">Your email preview will appear here.</div>'
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f0f0f0;padding:16px;">${body}</body></html>`
  }, [form.body_html])

  const statusCounts = useMemo(() => {
    const counts = { all: 0, draft: 0, sent: 0, failed: 0 } as Record<string, number>
    counts.all = campaigns.length
    for (const c of campaigns) {
      if (c.status in counts) counts[c.status]++
    }
    return counts
  }, [campaigns])

  const canSave = form.name.trim() && form.subject.trim() && form.body_html.trim()

  const kpis = [
    {
      key: 'sent_month',
      label: 'Sent this month',
      value: statsData?.sent_this_month?.toLocaleString() ?? '—',
      sub: statsData ? `${statsData.campaigns_this_month} campaign${statsData.campaigns_this_month === 1 ? '' : 's'}` : '',
      icon: Send,
      tint: 'text-blue-400',
    },
    {
      key: 'drafts',
      label: 'Active drafts',
      value: statsData?.drafts?.toLocaleString() ?? '—',
      sub: 'Waiting to send',
      icon: FileText,
      tint: 'text-amber-400',
    },
    {
      key: 'reached',
      label: 'Total reached',
      value: statsData?.total_reached?.toLocaleString() ?? '—',
      sub: 'Lifetime emails delivered',
      icon: Users,
      tint: 'text-emerald-400',
    },
    {
      key: 'failed',
      label: 'Failed this month',
      value: statsData?.failed_this_month?.toLocaleString() ?? '—',
      sub: statsData?.failed_this_month ? 'Investigate bounces' : 'All clear',
      icon: AlertTriangle,
      tint: statsData?.failed_this_month ? 'text-red-400' : 'text-emerald-400',
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Email campaigns</h1>
          <p className="text-sm text-t-secondary mt-0.5">
            Compose, save, then send rich emails to a saved segment. Opted-out members are skipped automatically.
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 text-sm font-semibold shadow-sm">
          <Plus size={16} /> New campaign
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(k => (
          <div key={k.key} className="bg-dark-surface rounded-xl border border-dark-border px-4 py-3 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg bg-dark-surface2 flex items-center justify-center ${k.tint}`}>
              <k.icon size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-t-secondary truncate">{k.label}</p>
              <p className="text-lg font-bold text-white truncate">{k.value}</p>
              {k.sub && <p className="text-[10px] text-t-secondary truncate">{k.sub}</p>}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="bg-dark-surface rounded-xl border border-dark-border overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white">{editId ? 'Edit draft' : 'New draft'}</h2>
              {editId && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300">
                  Draft saved
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPreview(p => !p)}
                className="text-xs text-t-secondary hover:text-white"
              >
                {showPreview ? 'Hide preview' : 'Show preview'}
              </button>
              <button onClick={resetForm} className="text-t-secondary hover:text-white"><X size={18} /></button>
            </div>
          </div>

          <div className={`grid gap-5 p-5 ${showPreview ? 'lg:grid-cols-2' : 'lg:grid-cols-1'}`}>
            {/* COMPOSE column */}
            <div className="space-y-4 min-w-0">
              {/* Template picker */}
              <div>
                <p className="text-xs font-medium text-t-secondary mb-2 flex items-center gap-1.5">
                  <Sparkles size={12} className="text-amber-300" /> Start from a template
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {TEMPLATES.map(t => (
                    <button
                      key={t.key}
                      onClick={() => applyTemplate(t.key)}
                      title={t.description}
                      className="px-3 py-1.5 rounded-full text-xs font-semibold bg-dark-surface2 hover:bg-dark-surface3 text-[#d0d0d0] hover:text-white border border-dark-border transition-colors"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Meta row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-t-secondary mb-1">Internal name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. June win-back to Gold tier"
                    className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-t-secondary mb-1">Target segment</label>
                  <select value={form.segment_id} onChange={e => setForm(f => ({ ...f, segment_id: e.target.value }))}
                    className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="">— No segment (pick recipients on send) —</option>
                    {segments.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.member_count_cached != null ? `(${s.member_count_cached.toLocaleString()} members)` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-t-secondary mb-1">Subject *</label>
                <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                  placeholder="Your exclusive offer inside"
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>

              {/* Variable chips */}
              <div>
                <p className="text-[11px] text-t-secondary mb-1.5">Insert at cursor:</p>
                <div className="flex flex-wrap gap-1">
                  {VARIABLE_CHIPS.map(v => (
                    <button
                      key={v.token}
                      type="button"
                      onClick={() => insertVariable(v.token)}
                      className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-primary-500/10 text-primary-300 hover:bg-primary-500/20 transition-colors"
                      title={v.token}
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-t-secondary mb-1">HTML body *</label>
                <textarea
                  ref={bodyRef}
                  value={form.body_html}
                  onChange={e => setForm(f => ({ ...f, body_html: e.target.value }))}
                  rows={14}
                  placeholder="<h1>Hi {{member.name}}</h1><p>We've prepared a special offer just for you…</p>"
                  className="w-full font-mono text-xs bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-[10px] text-[#636366] mt-1">Plain HTML. Inline styles render best across email clients.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-t-secondary mb-1">Plain text fallback <span className="text-[#636366]">(optional)</span></label>
                <textarea value={form.body_text} onChange={e => setForm(f => ({ ...f, body_text: e.target.value }))}
                  rows={3}
                  placeholder="Plain-text version for clients that can't render HTML"
                  className="w-full text-xs bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
            </div>

            {/* PREVIEW column */}
            {showPreview && (
              <div className="lg:sticky lg:top-4 self-start min-w-0">
                <p className="text-xs font-medium text-t-secondary mb-2 flex items-center gap-1.5">
                  <Mail size={12} /> Live preview
                </p>
                <div className="bg-dark-surface2 rounded-lg border border-dark-border overflow-hidden">
                  <div className="px-3 py-2 border-b border-dark-border bg-dark-surface3">
                    <p className="text-[10px] uppercase tracking-wide text-t-secondary">Subject</p>
                    <p className="text-xs text-white truncate font-medium">
                      {applyPreviewVariables(form.subject) || <span className="text-t-secondary italic">No subject yet</span>}
                    </p>
                  </div>
                  <iframe
                    title="Email preview"
                    sandbox=""
                    srcDoc={previewHtml}
                    className="w-full bg-white"
                    style={{ height: 540 }}
                  />
                </div>
                <p className="text-[10px] text-t-secondary mt-2">
                  Sample values shown for variables — actual sends substitute each recipient's data.
                </p>
              </div>
            )}
          </div>

          {/* Action row */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-t border-dark-border bg-dark-surface2">
            <p className="text-[11px] text-t-secondary">
              {!canSave ? 'Fill name, subject, and HTML body to save.' : 'Save the draft, then send a test to yourself before broadcasting.'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={resetForm} className="px-3 py-1.5 text-sm text-[#a0a0a0] hover:text-white">Cancel</button>
              {editId && (
                <button
                  onClick={() => testMutation.mutate(editId)}
                  disabled={testMutation.isPending}
                  className="flex items-center gap-1.5 bg-dark-surface3 hover:bg-dark-surface text-[#e0e0e0] text-sm font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 border border-dark-border"
                >
                  {testMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Beaker size={14} />}
                  Send test to me
                </button>
              )}
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !canSave}
                className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg flex items-center gap-1.5">
                {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                {editId ? 'Update draft' : 'Save draft'}
              </button>
              {editId && (
                <button
                  onClick={() => confirm('Send this campaign now? Recipients are locked in by the segment.') && sendMutation.mutate(editId)}
                  disabled={sendMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg flex items-center gap-1.5"
                >
                  {sendMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Send now
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {[
          { val: '',       label: 'All',    count: statusCounts.all },
          { val: 'draft',  label: 'Drafts', count: statusCounts.draft },
          { val: 'sent',   label: 'Sent',   count: statusCounts.sent },
          { val: 'failed', label: 'Failed', count: statusCounts.failed },
        ].map(opt => (
          <button
            key={opt.val || 'all'}
            onClick={() => setStatusFilter(opt.val as any)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
              statusFilter === opt.val
                ? 'bg-primary-500/15 text-primary-300 border-primary-500/40'
                : 'bg-dark-surface2 text-t-secondary border-dark-border hover:text-white'
            }`}
          >
            {opt.label}
            <span className="text-[10px] text-t-secondary font-normal">{opt.count}</span>
          </button>
        ))}
      </div>

      <div className="bg-dark-surface rounded-xl border border-dark-border overflow-hidden">
        {isLoading ? (
          <p className="text-center text-[#636366] py-8 text-sm">Loading…</p>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-12">
            <Mail size={36} className="mx-auto text-[#636366] mb-3" />
            <p className="text-[#636366] text-sm">
              {statusFilter
                ? `No ${statusFilter} campaigns. Try a different filter.`
                : 'No campaigns yet. Click "New campaign" to draft your first broadcast.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-t-secondary border-b border-dark-border bg-dark-surface2">
                  <th className="px-5 py-3 font-medium">Campaign</th>
                  <th className="px-5 py-3 font-medium">Audience</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Sent / Recipients</th>
                  <th className="px-5 py-3 font-medium">When</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-border">
                {campaigns.map(c => (
                  <tr key={c.id} className="hover:bg-dark-surface2 group">
                    <td className="px-5 py-3">
                      <div className="text-white font-medium">{c.name}</div>
                      <div className="text-[11px] text-[#a0a0a0] truncate max-w-md">{c.subject}</div>
                    </td>
                    <td className="px-5 py-3 text-xs text-[#a0a0a0]">
                      {c.segment?.name
                        ? <span className="inline-flex items-center gap-1"><Users size={11} /> {c.segment.name}</span>
                        : <span className="text-[#636366]">— Unsegmented —</span>}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        c.status === 'sent'    ? 'bg-[#32d74b]/15 text-[#32d74b]' :
                        c.status === 'sending' ? 'bg-[#5ac8fa]/15 text-[#5ac8fa]' :
                        c.status === 'failed'  ? 'bg-[#ef4444]/15 text-[#ef4444]' :
                                                 'bg-amber-500/15 text-amber-300'
                      }`}>
                        {c.status === 'sent'    && <CheckCircle size={11} />}
                        {c.status === 'sending' && <Loader2 size={11} className="animate-spin" />}
                        {c.status === 'failed'  && <AlertCircle size={11} />}
                        {c.status === 'draft'   && <FileText size={11} />}
                        {c.status}
                      </span>
                      {c.failed_count > 0 && c.status === 'sent' && (
                        <div className="text-[10px] text-[#f59e0b] mt-0.5">{c.failed_count} failed</div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-white font-semibold tabular-nums">
                      {c.status === 'draft'
                        ? '—'
                        : <>{c.sent_count.toLocaleString()} / {c.recipient_count.toLocaleString()}</>}
                    </td>
                    <td className="px-5 py-3 text-xs text-t-secondary">
                      {c.sent_at ? format(new Date(c.sent_at), 'MMM d, HH:mm') : `drafted ${format(new Date(c.created_at), 'MMM d')}`}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1 justify-end items-center">
                        {c.status === 'draft' && (
                          <>
                            <button
                              onClick={() => startEdit(c)}
                              className="flex items-center gap-1 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold px-2.5 py-1 rounded transition-colors"
                            >
                              <Pencil size={12} /> Edit
                            </button>
                            <button
                              onClick={() => confirm(`Send "${c.name}" now?${c.segment ? ` Audience: ${c.segment.name}.` : ''}`) && sendMutation.mutate(c.id)}
                              className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-2.5 py-1 rounded transition-colors"
                            >
                              <Send size={12} /> Send
                            </button>
                          </>
                        )}
                        {/* Row kebab — destructive + secondary actions */}
                        <div className="relative">
                          <button
                            onClick={() => setOpenMenuFor(openMenuFor === c.id ? null : c.id)}
                            onBlur={() => setTimeout(() => setOpenMenuFor(m => (m === c.id ? null : m)), 150)}
                            className="p-1.5 rounded hover:bg-dark-surface3 text-[#a0a0a0] hover:text-white"
                            title="More"
                          >
                            <MoreHorizontal size={14} />
                          </button>
                          {openMenuFor === c.id && (
                            <div className="absolute right-0 top-full mt-1 w-44 bg-dark-surface border border-dark-border rounded-lg shadow-2xl z-30 py-1">
                              <button
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => duplicateMutation.mutate(c.id)}
                                disabled={duplicateMutation.isPending}
                                className="w-full px-3 py-2 text-left text-sm text-white hover:bg-dark-surface2 flex items-center gap-2 disabled:opacity-50"
                              >
                                <Copy size={13} className="text-primary-400" /> Duplicate as draft
                              </button>
                              {c.status === 'draft' && (
                                <button
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => testMutation.mutate(c.id)}
                                  disabled={testMutation.isPending}
                                  className="w-full px-3 py-2 text-left text-sm text-white hover:bg-dark-surface2 flex items-center gap-2 disabled:opacity-50"
                                >
                                  <Beaker size={13} className="text-amber-300" /> Send test to me
                                </button>
                              )}
                              {c.status === 'draft' && (
                                <>
                                  <div className="border-t border-dark-border my-1" />
                                  <button
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => confirm(`Delete draft "${c.name}"?`) && deleteMutation.mutate(c.id)}
                                    className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                                  >
                                    <Trash2 size={13} /> Delete draft
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
