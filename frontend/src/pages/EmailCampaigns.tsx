import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Plus, X, Pencil, Trash2, Send, Mail, Loader2, CheckCircle, AlertCircle,
  Copy, Beaker, Sparkles, Users, FileText, AlertTriangle, MoreHorizontal,
  Blocks, Code2,
} from 'lucide-react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import { EmailBlockBuilder, renderBlocksToHtml, TEMPLATE_BLOCKS, type Block } from '../components/EmailBlockBuilder'

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
  body_blocks: Block[] | null
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

const emptyForm = {
  name: '',
  subject: '',
  body_html: '',
  body_text: '',
  segment_id: '' as string | number,
  body_blocks: [] as Block[],
}

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

function applyPreviewVariables(html: string): string {
  return Object.entries(PREVIEW_VARIABLES).reduce(
    (out, [token, value]) => out.replaceAll(token, value),
    html,
  )
}

export function EmailCampaigns() {
  const qc = useQueryClient()
  const { t } = useTranslation()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [statusFilter, setStatusFilter] = useState<'' | 'draft' | 'sent' | 'failed'>('')
  const [showPreview, setShowPreview] = useState(true)
  const [openMenuFor, setOpenMenuFor] = useState<number | null>(null)
  // 'visual' = block builder is the source of truth (body_html is regenerated from blocks)
  // 'code'   = raw HTML edit; blocks are decoupled. Legacy campaigns
  //           with no blocks open straight into 'code'.
  const [editorMode, setEditorMode] = useState<'visual' | 'code'>('visual')
  const codeBodyRef = useRef<HTMLTextAreaElement>(null)

  // Whenever blocks change in visual mode, regenerate the HTML output
  // so preview, save and send all see the latest.
  useEffect(() => {
    if (editorMode !== 'visual') return
    const html = renderBlocksToHtml(form.body_blocks)
    if (html !== form.body_html) {
      setForm(f => ({ ...f, body_html: html }))
    }
    // We only respond to block changes here; form.body_html will
    // diverge once the admin switches to 'code' mode, and that's fine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.body_blocks, editorMode])

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
        // Only persist blocks when the visual builder owns the HTML.
        // Code-edited campaigns clear blocks so reopening lands them
        // straight back in code view (lossless round-trip).
        body_blocks: editorMode === 'visual' ? form.body_blocks : null,
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

  const resetForm = () => {
    setShowForm(false)
    setEditId(null)
    setForm(emptyForm)
    setEditorMode('visual')
  }

  const startEdit = (c: Campaign) => {
    if (c.status !== 'draft') {
      toast.error('Only drafts can be edited.')
      return
    }
    setEditId(c.id)
    const hasBlocks = Array.isArray(c.body_blocks) && c.body_blocks.length > 0
    setForm({
      name: c.name,
      subject: c.subject,
      body_html: c.body_html,
      body_text: c.body_text ?? '',
      segment_id: c.segment_id ?? '',
      body_blocks: hasBlocks ? c.body_blocks! : [],
    })
    // Legacy campaigns with no blocks fall back to code view so the
    // admin's existing HTML stays untouched. Builder-edited campaigns
    // resume in builder mode.
    setEditorMode(hasBlocks ? 'visual' : 'code')
    setShowForm(true)
  }

  const applyTemplate = (key: string) => {
    const t = TEMPLATE_BLOCKS[key]
    if (!t) return
    setForm(f => ({
      ...f,
      subject: t.subject || f.subject,
      body_blocks: t.blocks.map(b => ({ ...b, id: Math.random().toString(36).slice(2, 9) })),
    }))
    setEditorMode('visual')
  }

  const insertVariableInCode = (token: string) => {
    const el = codeBodyRef.current
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

  /**
   * Switch from visual to code: detach blocks so further HTML edits
   * persist as-is. Switch from code to visual: warn before doing it
   * since the current HTML can't be parsed back into blocks.
   */
  const switchToCode = () => {
    setEditorMode('code')
    setForm(f => ({ ...f, body_blocks: [] }))
  }
  const switchToVisual = () => {
    if (form.body_html.trim() && form.body_blocks.length === 0) {
      if (!confirm('Switch to visual builder? Your current HTML will be replaced with an empty block list.')) return
      setForm(f => ({ ...f, body_html: '', body_blocks: [] }))
    }
    setEditorMode('visual')
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
          <h1 className="text-2xl font-bold text-white">{t('emailCampaigns.title', 'Email campaigns')}</h1>
          <p className="text-sm text-t-secondary mt-0.5">
            {t('emailCampaigns.subtitle', 'Compose, save, then send rich emails to a saved segment. Opted-out members are skipped automatically.')}
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 text-sm font-semibold shadow-sm">
          <Plus size={16} /> {t('emailCampaigns.new_campaign', 'New campaign')}
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
              <h2 className="text-sm font-semibold text-white">{editId ? t('emailCampaigns.form.edit_draft', 'Edit draft') : t('emailCampaigns.form.new_draft', 'New draft')}</h2>
              {editId && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-300">
                  {t('emailCampaigns.form.draft_saved', 'Draft saved')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPreview(p => !p)}
                className="text-xs text-t-secondary hover:text-white"
              >
                {showPreview ? t('emailCampaigns.form.hide_preview', 'Hide preview') : t('emailCampaigns.form.show_preview', 'Show preview')}
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
                  <Sparkles size={12} className="text-amber-300" /> {t('emailCampaigns.form.start_from_template', 'Start from a template')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(TEMPLATE_BLOCKS).map(([key, t]) => (
                    <button
                      key={key}
                      onClick={() => applyTemplate(key)}
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
                  <label className="block text-xs font-medium text-t-secondary mb-1">{t('emailCampaigns.form.internal_name', 'Internal name *')}</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder={t('emailCampaigns.form.internal_name_placeholder', 'e.g. June win-back to Gold tier')}
                    className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-t-secondary mb-1">{t('emailCampaigns.form.target_segment', 'Target segment')}</label>
                  <select value={form.segment_id} onChange={e => setForm(f => ({ ...f, segment_id: e.target.value }))}
                    className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="">{t('emailCampaigns.form.no_segment_option', '— No segment (pick recipients on send) —')}</option>
                    {segments.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.member_count_cached != null ? `(${t('emailCampaigns.form.members_count', { count: s.member_count_cached, defaultValue: '{{count}} members' })})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-t-secondary mb-1">{t('emailCampaigns.form.subject', 'Subject *')}</label>
                <input value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                  placeholder={t('emailCampaigns.form.subject_placeholder', 'Your exclusive offer inside')}
                  className="w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>

              {/* Visual / Code mode toggle */}
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-t-secondary">{t('emailCampaigns.form.email_body', 'Email body *')}</label>
                <div className="inline-flex bg-dark-surface2 border border-dark-border rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={switchToVisual}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                      editorMode === 'visual' ? 'bg-primary-500/20 text-primary-300' : 'text-t-secondary hover:text-white'
                    }`}
                  >
                    <Blocks size={12} /> {t('emailCampaigns.form.visual_mode', 'Visual')}
                  </button>
                  <button
                    type="button"
                    onClick={switchToCode}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                      editorMode === 'code' ? 'bg-primary-500/20 text-primary-300' : 'text-t-secondary hover:text-white'
                    }`}
                  >
                    <Code2 size={12} /> {t('emailCampaigns.form.code_mode', 'Code')}
                  </button>
                </div>
              </div>

              {editorMode === 'visual' ? (
                <EmailBlockBuilder
                  blocks={form.body_blocks}
                  onChange={next => setForm(f => ({ ...f, body_blocks: next }))}
                />
              ) : (
                <div>
                  <textarea
                    ref={codeBodyRef}
                    value={form.body_html}
                    onChange={e => setForm(f => ({ ...f, body_html: e.target.value }))}
                    rows={14}
                    placeholder="<h1>Hi {{member.name}}</h1><p>We've prepared a special offer just for you…</p>"
                    className="w-full font-mono text-xs bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <p className="text-[10px] text-[#636366] mt-1">{t('emailCampaigns.form.code_hint', 'Plain HTML. Inline styles render best across email clients.')}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <span className="text-[10px] text-t-secondary mr-1 self-center">{t('emailCampaigns.form.insert_at_cursor', 'Insert at cursor:')}</span>
                    {Object.keys(PREVIEW_VARIABLES).map(token => (
                      <button
                        key={token}
                        type="button"
                        onClick={() => insertVariableInCode(token)}
                        className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-primary-500/10 text-primary-300 hover:bg-primary-500/20 transition-colors"
                      >
                        {token.replace(/[{}]|member\./g, '')}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-t-secondary mb-1">{t('emailCampaigns.form.plain_text_fallback', 'Plain text fallback')} <span className="text-[#636366]">{t('emailCampaigns.form.plain_text_optional', '(optional)')}</span></label>
                <textarea value={form.body_text} onChange={e => setForm(f => ({ ...f, body_text: e.target.value }))}
                  rows={3}
                  placeholder={t('emailCampaigns.form.plain_text_placeholder', "Plain-text version for clients that can't render HTML")}
                  className="w-full text-xs bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
              </div>
            </div>

            {/* PREVIEW column */}
            {showPreview && (
              <div className="lg:sticky lg:top-4 self-start min-w-0">
                <p className="text-xs font-medium text-t-secondary mb-2 flex items-center gap-1.5">
                  <Mail size={12} /> {t('emailCampaigns.form.live_preview', 'Live preview')}
                </p>
                <div className="bg-dark-surface2 rounded-lg border border-dark-border overflow-hidden">
                  <div className="px-3 py-2 border-b border-dark-border bg-dark-surface3">
                    <p className="text-[10px] uppercase tracking-wide text-t-secondary">{t('emailCampaigns.form.preview_subject_label', 'Subject')}</p>
                    <p className="text-xs text-white truncate font-medium">
                      {applyPreviewVariables(form.subject) || <span className="text-t-secondary italic">{t('emailCampaigns.form.preview_no_subject', 'No subject yet')}</span>}
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
                  {t('emailCampaigns.form.preview_help', "Sample values shown for variables — actual sends substitute each recipient's data.")}
                </p>
              </div>
            )}
          </div>

          {/* Action row */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-t border-dark-border bg-dark-surface2">
            <p className="text-[11px] text-t-secondary">
              {!canSave
                ? t('emailCampaigns.form.fill_to_save', 'Fill name, subject, and HTML body to save.')
                : t('emailCampaigns.form.save_test_hint', 'Save the draft, then send a test to yourself before broadcasting.')}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={resetForm} className="px-3 py-1.5 text-sm text-[#a0a0a0] hover:text-white">{t('emailCampaigns.form.cancel', 'Cancel')}</button>
              {editId && (
                <button
                  onClick={() => testMutation.mutate(editId)}
                  disabled={testMutation.isPending}
                  className="flex items-center gap-1.5 bg-dark-surface3 hover:bg-dark-surface text-[#e0e0e0] text-sm font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50 border border-dark-border"
                >
                  {testMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Beaker size={14} />}
                  {t('emailCampaigns.form.send_test_to_me', 'Send test to me')}
                </button>
              )}
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !canSave}
                className="bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg flex items-center gap-1.5">
                {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                {editId ? t('emailCampaigns.form.update_draft', 'Update draft') : t('emailCampaigns.form.save_draft', 'Save draft')}
              </button>
              {editId && (
                <button
                  onClick={() => confirm(t('emailCampaigns.form.send_now_confirm', 'Send this campaign now? Recipients are locked in by the segment.')) && sendMutation.mutate(editId)}
                  disabled={sendMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg flex items-center gap-1.5"
                >
                  {sendMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  {t('emailCampaigns.form.send_now', 'Send now')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {[
          { val: '',       label: t('emailCampaigns.filters.all',    'All'),    count: statusCounts.all },
          { val: 'draft',  label: t('emailCampaigns.filters.drafts', 'Drafts'), count: statusCounts.draft },
          { val: 'sent',   label: t('emailCampaigns.filters.sent',   'Sent'),   count: statusCounts.sent },
          { val: 'failed', label: t('emailCampaigns.filters.failed', 'Failed'), count: statusCounts.failed },
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
          <p className="text-center text-[#636366] py-8 text-sm">{t('emailCampaigns.loading', 'Loading…')}</p>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-12">
            <Mail size={36} className="mx-auto text-[#636366] mb-3" />
            <p className="text-[#636366] text-sm">
              {statusFilter
                ? t('emailCampaigns.empty.filtered', { status: statusFilter, defaultValue: 'No {{status}} campaigns. Try a different filter.' })
                : t('emailCampaigns.empty.default', 'No campaigns yet. Click "New campaign" to draft your first broadcast.')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-t-secondary border-b border-dark-border bg-dark-surface2">
                  <th className="px-5 py-3 font-medium">{t('emailCampaigns.table.campaign', 'Campaign')}</th>
                  <th className="px-5 py-3 font-medium">{t('emailCampaigns.table.audience', 'Audience')}</th>
                  <th className="px-5 py-3 font-medium">{t('emailCampaigns.table.status', 'Status')}</th>
                  <th className="px-5 py-3 font-medium text-right">{t('emailCampaigns.table.sent_recipients', 'Sent / Recipients')}</th>
                  <th className="px-5 py-3 font-medium">{t('emailCampaigns.table.when', 'When')}</th>
                  <th className="px-5 py-3 text-right">{t('emailCampaigns.table.actions', 'Actions')}</th>
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
                        : <span className="text-[#636366]">{t('emailCampaigns.table.unsegmented', '— Unsegmented —')}</span>}
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
                        <div className="text-[10px] text-[#f59e0b] mt-0.5">{t('emailCampaigns.table.failed_count', { count: c.failed_count, defaultValue: '{{count}} failed' })}</div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-white font-semibold tabular-nums">
                      {c.status === 'draft'
                        ? '—'
                        : <>{c.sent_count.toLocaleString()} / {c.recipient_count.toLocaleString()}</>}
                    </td>
                    <td className="px-5 py-3 text-xs text-t-secondary">
                      {c.sent_at ? format(new Date(c.sent_at), 'MMM d, HH:mm') : t('emailCampaigns.table.drafted_on', { date: format(new Date(c.created_at), 'MMM d'), defaultValue: 'drafted {{date}}' })}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1 justify-end items-center">
                        {c.status === 'draft' && (
                          <>
                            <button
                              onClick={() => startEdit(c)}
                              className="flex items-center gap-1 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold px-2.5 py-1 rounded transition-colors"
                            >
                              <Pencil size={12} /> {t('emailCampaigns.table.edit', 'Edit')}
                            </button>
                            <button
                              onClick={() => confirm(t('emailCampaigns.table.send_confirm', { name: c.name, audience: c.segment ? t('emailCampaigns.table.send_confirm_audience', { name: c.segment.name, defaultValue: ' Audience: {{name}}.' }) : '', defaultValue: 'Send "{{name}}" now?{{audience}}' })) && sendMutation.mutate(c.id)}
                              className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-2.5 py-1 rounded transition-colors"
                            >
                              <Send size={12} /> {t('emailCampaigns.table.send', 'Send')}
                            </button>
                          </>
                        )}
                        {/* Row kebab — destructive + secondary actions */}
                        <div className="relative">
                          <button
                            onClick={() => setOpenMenuFor(openMenuFor === c.id ? null : c.id)}
                            onBlur={() => setTimeout(() => setOpenMenuFor(m => (m === c.id ? null : m)), 150)}
                            className="p-1.5 rounded hover:bg-dark-surface3 text-[#a0a0a0] hover:text-white"
                            title={t('emailCampaigns.table.more_tooltip', 'More')}
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
                                <Copy size={13} className="text-primary-400" /> {t('emailCampaigns.table.duplicate_as_draft', 'Duplicate as draft')}
                              </button>
                              {c.status === 'draft' && (
                                <button
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => testMutation.mutate(c.id)}
                                  disabled={testMutation.isPending}
                                  className="w-full px-3 py-2 text-left text-sm text-white hover:bg-dark-surface2 flex items-center gap-2 disabled:opacity-50"
                                >
                                  <Beaker size={13} className="text-amber-300" /> {t('emailCampaigns.table.send_test_to_me', 'Send test to me')}
                                </button>
                              )}
                              {c.status === 'draft' && (
                                <>
                                  <div className="border-t border-dark-border my-1" />
                                  <button
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => confirm(t('emailCampaigns.table.delete_confirm', { name: c.name, defaultValue: 'Delete draft "{{name}}"?' })) && deleteMutation.mutate(c.id)}
                                    className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                                  >
                                    <Trash2 size={13} /> {t('emailCampaigns.table.delete_draft', 'Delete draft')}
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
