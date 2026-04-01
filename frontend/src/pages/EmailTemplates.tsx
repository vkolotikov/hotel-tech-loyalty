import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import toast from 'react-hot-toast'

interface Template {
  id: number
  name: string
  subject: string
  html_body: string
  merge_tags: string[]
  category: string
  is_active: boolean
  created_at: string
  updated_at: string
}

const CATEGORIES = [
  { value: 'campaign', label: 'Campaign' },
  { value: 'transactional', label: 'Transactional' },
  { value: 'welcome', label: 'Welcome' },
]

const DEFAULT_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; background: #f4f4f7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .wrapper { max-width: 600px; margin: 0 auto; background: #ffffff; }
    .header { background: #1c1c1e; padding: 32px 40px; text-align: center; }
    .header h1 { color: #c9a84c; margin: 0; font-size: 22px; letter-spacing: 2px; }
    .body { padding: 40px; }
    .body h2 { color: #1c1c1e; margin: 0 0 16px; font-size: 20px; }
    .body p { color: #4a4a4a; line-height: 1.6; margin: 0 0 16px; font-size: 15px; }
    .cta { display: inline-block; background: #c9a84c; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 15px; }
    .footer { background: #f4f4f7; padding: 24px 40px; text-align: center; }
    .footer p { color: #9ca3af; font-size: 12px; margin: 0; line-height: 1.5; }
    .points-box { background: #fef9ee; border: 1px solid #f0dca0; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
    .points-box .number { font-size: 36px; font-weight: 800; color: #c9a84c; }
    .points-box .label { font-size: 13px; color: #6b7280; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>{{hotel_name}}</h1>
    </div>
    <div class="body">
      <h2>Hello {{first_name}},</h2>
      <p>We have exciting news for you! As a valued {{tier_name}} member, you have access to exclusive offers.</p>
      <div class="points-box">
        <div class="number">{{points_balance}}</div>
        <div class="label">Your Points Balance</div>
      </div>
      <p>Don't miss out on the latest rewards and benefits available to you.</p>
      <p style="text-align: center; margin-top: 32px;">
        <a href="#" class="cta">View My Rewards</a>
      </p>
    </div>
    <div class="footer">
      <p>&copy; {{current_year}} {{hotel_name}}. All rights reserved.</p>
      <p>Member #{{member_number}} &middot; {{tier_name}} Tier</p>
    </div>
  </div>
</body>
</html>`

export function EmailTemplates() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Template | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewSubject, setPreviewSubject] = useState('')
  const editorRef = useRef<HTMLTextAreaElement>(null)

  const [form, setForm] = useState({
    name: '',
    subject: '',
    html_body: DEFAULT_TEMPLATE,
    category: 'campaign',
  })

  const { data, isLoading } = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => api.get('/v1/admin/email-templates').then(r => r.data),
  })

  const { data: tagsData } = useQuery({
    queryKey: ['merge-tags'],
    queryFn: () => api.get('/v1/admin/email-templates/merge-tags').then(r => r.data),
  })

  const saveMutation = useMutation({
    mutationFn: (payload: any) =>
      editing
        ? api.put(`/v1/admin/email-templates/${editing.id}`, payload)
        : api.post('/v1/admin/email-templates', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-templates'] })
      toast.success(editing ? 'Template updated' : 'Template created')
      closeEditor()
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Save failed'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/email-templates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['email-templates'] })
      toast.success('Template deleted')
    },
  })

  const closeEditor = () => {
    setEditing(null)
    setShowCreate(false)
    setForm({ name: '', subject: '', html_body: DEFAULT_TEMPLATE, category: 'campaign' })
  }

  const openEdit = (t: Template) => {
    setEditing(t)
    setForm({ name: t.name, subject: t.subject, html_body: t.html_body, category: t.category })
    setShowCreate(true)
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', subject: '', html_body: DEFAULT_TEMPLATE, category: 'campaign' })
    setShowCreate(true)
  }

  const insertTag = (tag: string) => {
    const el = editorRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const before = form.html_body.slice(0, start)
    const after = form.html_body.slice(end)
    const newBody = before + tag + after
    setForm(f => ({ ...f, html_body: newBody }))
    setTimeout(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = start + tag.length
    }, 0)
  }

  const handlePreview = async (templateId: number) => {
    try {
      const { data } = await api.get(`/v1/admin/email-templates/${templateId}/preview`)
      setPreviewHtml(data.html)
      setPreviewSubject(data.subject)
      setShowPreview(true)
    } catch {
      toast.error('Preview failed — make sure at least one member exists')
    }
  }

  const templates: Template[] = data?.templates ?? []
  const mergeTags: Record<string, string> = tagsData?.tags ?? {}

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Email Templates</h1>
          <p className="text-sm text-t-secondary mt-1">
            Build HTML email templates with merge tags for personalized campaigns
          </p>
        </div>
        <button
          onClick={openCreate}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors"
        >
          + New Template
        </button>
      </div>

      {/* Templates Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-[#636366]">Loading templates...</div>
      ) : templates.length === 0 ? (
        <div className="bg-dark-surface rounded-xl border border-dark-border p-12 text-center">
          <div className="text-4xl mb-3">&#9993;</div>
          <p className="text-t-secondary font-medium">No email templates yet</p>
          <p className="text-sm text-[#636366] mt-1">Create your first template to start sending email campaigns</p>
          <button
            onClick={openCreate}
            className="mt-4 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-700"
          >
            Create Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map(t => (
            <div key={t.id} className="bg-dark-surface rounded-xl border border-dark-border overflow-hidden group">
              {/* Card preview strip */}
              <div className="h-32 bg-[#1a1a1a] overflow-hidden relative">
                <iframe
                  srcDoc={t.html_body}
                  title={t.name}
                  className="w-[600px] h-[400px] origin-top-left pointer-events-none"
                  style={{ transform: 'scale(0.35)', transformOrigin: 'top left' }}
                  sandbox=""
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#1c1c1e]" />
              </div>

              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <h3 className="font-semibold text-white text-sm">{t.name}</h3>
                    <p className="text-xs text-[#636366] truncate mt-0.5">{t.subject}</p>
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    t.is_active
                      ? 'bg-[#32d74b]/15 text-[#32d74b]'
                      : 'bg-dark-surface3 text-t-secondary'
                  }`}>
                    {t.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap mb-3">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary-500/15 text-primary-400">
                    {t.category}
                  </span>
                  {(t.merge_tags ?? []).length > 0 && (
                    <span className="text-[10px] text-[#636366]">
                      {t.merge_tags.length} tag{t.merge_tags.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => openEdit(t)}
                    className="flex-1 text-xs font-semibold text-primary-400 hover:text-primary-300 bg-primary-500/10 hover:bg-primary-500/20 rounded-lg py-1.5 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handlePreview(t.id)}
                    className="flex-1 text-xs font-semibold text-t-secondary hover:text-white bg-dark-surface2 hover:bg-dark-surface3 rounded-lg py-1.5 transition-colors"
                  >
                    Preview
                  </button>
                  <button
                    onClick={() => { if (confirm('Delete this template?')) deleteMutation.mutate(t.id) }}
                    className="text-xs font-semibold text-[#ff375f] hover:text-[#ff6680] bg-[#ff375f]/10 hover:bg-[#ff375f]/20 rounded-lg py-1.5 px-3 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-dark-surface rounded-2xl border border-dark-border w-full max-w-5xl my-8">
            {/* Modal Header */}
            <div className="p-6 border-b border-dark-border flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">
                {editing ? 'Edit Template' : 'Create Email Template'}
              </h2>
              <button onClick={closeEditor} className="text-[#636366] hover:text-white text-lg">&times;</button>
            </div>

            <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: Editor */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-[#a0a0a0] mb-1">Template Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Monthly Newsletter"
                    className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-[#a0a0a0] mb-1">Subject Line</label>
                    <input
                      type="text"
                      value={form.subject}
                      onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                      placeholder="e.g. {{first_name}}, you have {{points_balance}} points!"
                      className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#a0a0a0] mb-1">Category</label>
                    <select
                      value={form.category}
                      onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                      className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      {CATEGORIES.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Merge Tags */}
                <div>
                  <label className="block text-sm font-semibold text-[#a0a0a0] mb-2">
                    Insert Merge Tag <span className="font-normal text-[#636366]">(click to insert at cursor)</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(mergeTags).map(([tag, desc]) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => insertTag(tag)}
                        title={desc}
                        className="px-2.5 py-1 rounded-lg text-xs font-mono bg-primary-500/10 text-primary-400 hover:bg-primary-500/25 border border-primary-500/20 transition-colors"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                {/* HTML Editor */}
                <div>
                  <label className="block text-sm font-semibold text-[#a0a0a0] mb-1">HTML Body</label>
                  <textarea
                    ref={editorRef}
                    value={form.html_body}
                    onChange={e => setForm(f => ({ ...f, html_body: e.target.value }))}
                    rows={20}
                    spellCheck={false}
                    className="w-full bg-[#111] border border-dark-border rounded-lg px-3 py-2 text-xs text-[#e0e0e0] font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y leading-relaxed"
                  />
                </div>
              </div>

              {/* Right: Live Preview */}
              <div className="flex flex-col">
                <label className="block text-sm font-semibold text-[#a0a0a0] mb-1">Live Preview</label>
                <div className="flex-1 bg-white rounded-lg overflow-hidden border border-dark-border min-h-[400px]">
                  <iframe
                    srcDoc={form.html_body}
                    title="Preview"
                    className="w-full h-full min-h-[400px]"
                    sandbox=""
                  />
                </div>
                <p className="text-[10px] text-[#636366] mt-2">
                  Merge tags shown as-is in preview. Use &quot;Preview with Data&quot; after saving to see rendered output.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-dark-border flex gap-3">
              <button
                onClick={closeEditor}
                className="flex-1 border border-dark-border text-[#a0a0a0] py-2.5 rounded-lg text-sm font-semibold hover:bg-dark-surface2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => saveMutation.mutate(form)}
                disabled={!form.name || !form.subject || !form.html_body || saveMutation.isPending}
                className="flex-1 bg-primary-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saveMutation.isPending ? 'Saving...' : editing ? 'Update Template' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-surface rounded-2xl border border-dark-border w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-5 border-b border-dark-border flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Email Preview</h2>
                <p className="text-xs text-[#636366] mt-0.5">Subject: {previewSubject}</p>
              </div>
              <button onClick={() => setShowPreview(false)} className="text-[#636366] hover:text-white text-lg">&times;</button>
            </div>
            <div className="flex-1 overflow-auto bg-white">
              <iframe
                srcDoc={previewHtml}
                title="Rendered Preview"
                className="w-full min-h-[500px] h-full"
                sandbox=""
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
