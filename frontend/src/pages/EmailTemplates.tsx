import { useState, useRef, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import toast from 'react-hot-toast'
import {
  PRESETS,
  renderEmailHtml,
  embedContent,
  extractContent,
  blankContent,
  type EmailContent,
  type Block,
  type Preset,
} from '../lib/emailBuilder'

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
  { value: 'birthday', label: 'Birthday' },
  { value: 're-engagement', label: 'Re-engagement' },
]

type Mode = 'gallery' | 'design' | 'html'

const BLOCK_LIBRARY: { type: Block['type']; label: string; make: () => Block }[] = [
  { type: 'heading', label: 'Heading', make: () => ({ type: 'heading', content: 'Your headline here', align: 'left' }) },
  { type: 'text', label: 'Paragraph', make: () => ({ type: 'text', content: 'Write your message here. Use merge tags like {{first_name}} to personalize.', align: 'left' }) },
  { type: 'pointsBox', label: 'Points Box', make: () => ({ type: 'pointsBox', value: '{{points_balance}}', label: 'Your Points' }) },
  { type: 'tierBadge', label: 'Tier Badge', make: () => ({ type: 'tierBadge', label: '{{tier_name}}' }) },
  { type: 'cta', label: 'Button', make: () => ({ type: 'cta', label: 'Take Action', url: '#' }) },
  { type: 'divider', label: 'Divider', make: () => ({ type: 'divider' }) },
  { type: 'image', label: 'Image', make: () => ({ type: 'image', url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=600', alt: '' }) },
  { type: 'quote', label: 'Quote', make: () => ({ type: 'quote', content: 'A thoughtful line worth emphasising.', author: '' }) },
  { type: 'spacer', label: 'Spacer', make: () => ({ type: 'spacer', size: 'md' }) },
  { type: 'hero', label: 'Hero Image', make: () => ({ type: 'hero', imageUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=1200&q=80', headline: 'Your headline', subheadline: '', overlay: 'dark' }) },
  { type: 'twoColumn', label: 'Two Columns', make: () => ({ type: 'twoColumn', leftHeading: 'Left', leftText: 'Left column copy.', rightHeading: 'Right', rightText: 'Right column copy.' }) },
  { type: 'voucher', label: 'Voucher', make: () => ({ type: 'voucher', title: 'Gift', value: '€100', code: 'GIFT-CODE', terms: '' }) },
  { type: 'stats', label: 'Stats Row', make: () => ({ type: 'stats', items: [ { value: '19:30', label: 'Arrival' }, { value: 'Black Tie', label: 'Attire' }, { value: 'RSVP', label: 'By Friday' } ] }) },
]

export function EmailTemplates() {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<Template | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewSubject, setPreviewSubject] = useState('')

  const [mode, setMode] = useState<Mode>('gallery')
  const [content, setContent] = useState<EmailContent>(blankContent())
  const [rawHtml, setRawHtml] = useState<string>('')
  const [meta, setMeta] = useState({ name: '', subject: '', category: 'campaign' })
  const htmlRef = useRef<HTMLTextAreaElement>(null)

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
    setMode('gallery')
    setContent(blankContent())
    setRawHtml('')
    setMeta({ name: '', subject: '', category: 'campaign' })
  }

  const openCreate = () => {
    setEditing(null)
    setMeta({ name: '', subject: '', category: 'campaign' })
    setContent(blankContent())
    setRawHtml('')
    setMode('gallery')
    setShowCreate(true)
  }

  const openEdit = (t: Template) => {
    setEditing(t)
    setMeta({ name: t.name, subject: t.subject, category: t.category })
    const parsed = extractContent(t.html_body)
    if (parsed) {
      setContent(parsed)
      setRawHtml(t.html_body)
      setMode('design')
    } else {
      setRawHtml(t.html_body)
      setContent(blankContent())
      setMode('html')
    }
    setShowCreate(true)
  }

  const applyPreset = (p: Preset) => {
    setContent(JSON.parse(JSON.stringify(p.content)))
    setMeta(m => ({
      ...m,
      subject: m.subject || p.defaultSubject,
      category: m.category && m.category !== 'campaign' ? m.category : p.category,
    }))
    setMode('design')
  }

  useEffect(() => {
    if (mode !== 'html') {
      setRawHtml(renderEmailHtml(content))
    }
  }, [content, mode])

  const previewSrc = useMemo(() => {
    if (mode === 'html') return rawHtml
    return renderEmailHtml(content)
  }, [mode, rawHtml, content])

  const handleSave = () => {
    let bodyToSave: string
    if (mode === 'html') {
      bodyToSave = rawHtml
    } else {
      bodyToSave = embedContent(renderEmailHtml(content), content)
    }
    saveMutation.mutate({ ...meta, html_body: bodyToSave })
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

  const updateBlock = (i: number, patch: Partial<Block>) => {
    setContent(c => {
      const blocks = [...c.blocks]
      blocks[i] = { ...blocks[i], ...patch } as Block
      return { ...c, blocks }
    })
  }
  const moveBlock = (i: number, dir: -1 | 1) => {
    setContent(c => {
      const blocks = [...c.blocks]
      const j = i + dir
      if (j < 0 || j >= blocks.length) return c
      ;[blocks[i], blocks[j]] = [blocks[j], blocks[i]]
      return { ...c, blocks }
    })
  }
  const removeBlock = (i: number) => {
    setContent(c => ({ ...c, blocks: c.blocks.filter((_, idx) => idx !== i) }))
  }
  const addBlock = (type: Block['type']) => {
    const maker = BLOCK_LIBRARY.find(b => b.type === type)
    if (!maker) return
    setContent(c => ({ ...c, blocks: [...c.blocks, maker.make()] }))
  }

  const insertTagIntoHtml = (tag: string) => {
    const el = htmlRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const next = rawHtml.slice(0, start) + tag + rawHtml.slice(end)
    setRawHtml(next)
    setTimeout(() => {
      el.focus()
      el.selectionStart = el.selectionEnd = start + tag.length
    }, 0)
  }

  const templates: Template[] = data?.templates ?? []
  const mergeTags: Record<string, string> = tagsData?.tags ?? {}

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Email Templates</h1>
          <p className="text-sm text-t-secondary mt-1">
            Craft modern, luxury email campaigns with a visual builder and curated presets
          </p>
        </div>
        <button
          onClick={openCreate}
          className="bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors"
        >
          + New Template
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-[#636366]">Loading templates...</div>
      ) : templates.length === 0 ? (
        <div className="bg-dark-surface rounded-xl border border-dark-border p-12 text-center">
          <div className="text-4xl mb-3">&#9993;</div>
          <p className="text-t-secondary font-medium">No email templates yet</p>
          <p className="text-sm text-[#636366] mt-1">Pick a luxury preset and start your first campaign in minutes</p>
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

      {showCreate && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-dark-surface rounded-2xl border border-dark-border w-full max-w-6xl my-8">
            <div className="p-5 border-b border-dark-border flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white">
                  {editing ? 'Edit Template' : 'New Email Template'}
                </h2>
                <p className="text-xs text-[#636366] mt-0.5">Luxury presets · visual builder · live preview</p>
              </div>
              <div className="flex items-center gap-1 bg-dark-surface2 rounded-lg p-1 border border-dark-border">
                {(['gallery', 'design', 'html'] as Mode[]).map(m => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      mode === m ? 'bg-primary-600 text-white' : 'text-t-secondary hover:text-white'
                    }`}
                  >
                    {m === 'gallery' ? 'Gallery' : m === 'design' ? 'Design' : 'Advanced HTML'}
                  </button>
                ))}
              </div>
              <button onClick={closeEditor} className="text-[#636366] hover:text-white text-xl leading-none px-2">&times;</button>
            </div>

            <div className="px-5 py-4 border-b border-dark-border grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-[#a0a0a0] mb-1 uppercase tracking-wide">Template Name</label>
                <input
                  type="text"
                  value={meta.name}
                  onChange={e => setMeta(m => ({ ...m, name: e.target.value }))}
                  placeholder="e.g. Monthly Newsletter"
                  className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#a0a0a0] mb-1 uppercase tracking-wide">Subject Line</label>
                <input
                  type="text"
                  value={meta.subject}
                  onChange={e => setMeta(m => ({ ...m, subject: e.target.value }))}
                  placeholder="{{first_name}}, a message from {{hotel_name}}"
                  className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[#a0a0a0] mb-1 uppercase tracking-wide">Category</label>
                <select
                  value={meta.category}
                  onChange={e => setMeta(m => ({ ...m, category: e.target.value }))}
                  className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {mode === 'gallery' && (
              <div className="p-5">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {PRESETS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => applyPreset(p)}
                      className={`text-left bg-dark-surface2 rounded-xl border overflow-hidden group transition-all ${
                        content.styleId === p.id
                          ? 'border-primary-500 ring-2 ring-primary-500/40'
                          : 'border-dark-border hover:border-primary-500/60'
                      }`}
                    >
                      <div className="h-44 bg-white overflow-hidden relative">
                        <iframe
                          srcDoc={renderEmailHtml(p.content)}
                          title={p.name}
                          className="w-[600px] h-[800px] origin-top-left pointer-events-none"
                          style={{ transform: 'scale(0.4)', transformOrigin: 'top left' }}
                          sandbox=""
                        />
                      </div>
                      <div className="p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="inline-block w-3 h-3 rounded-full" style={{ background: p.accentSwatch }} />
                          <h3 className="font-semibold text-white text-sm">{p.name}</h3>
                        </div>
                        <p className="text-xs text-[#a0a0a0]">{p.tagline}</p>
                        <p className="text-[10px] text-[#636366] mt-2 uppercase tracking-wide">{p.category}</p>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-[#636366] mt-4 text-center">
                  Pick a preset to continue in Design mode, or go straight to Advanced HTML.
                </p>
              </div>
            )}

            {(mode === 'design' || mode === 'html') && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
                <div className="p-5 border-r border-dark-border max-h-[70vh] overflow-y-auto">
                  {mode === 'design' && (
                    <DesignPane
                      content={content}
                      setContent={setContent}
                      updateBlock={updateBlock}
                      moveBlock={moveBlock}
                      removeBlock={removeBlock}
                      addBlock={addBlock}
                    />
                  )}
                  {mode === 'html' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#a0a0a0] mb-2 uppercase tracking-wide">
                          Merge Tags <span className="font-normal text-[#636366] normal-case tracking-normal">— click to insert</span>
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {Object.entries(mergeTags).map(([tag, desc]) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => insertTagIntoHtml(tag)}
                              title={desc}
                              className="px-2.5 py-1 rounded-lg text-xs font-mono bg-primary-500/10 text-primary-400 hover:bg-primary-500/25 border border-primary-500/20 transition-colors"
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#a0a0a0] mb-1 uppercase tracking-wide">HTML Body</label>
                        <textarea
                          ref={htmlRef}
                          value={rawHtml}
                          onChange={e => setRawHtml(e.target.value)}
                          rows={24}
                          spellCheck={false}
                          className="w-full bg-[#0b0b0b] border border-dark-border rounded-lg px-3 py-2 text-xs text-[#e0e0e0] font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y leading-relaxed"
                        />
                        <p className="text-[11px] text-[#636366] mt-2">
                          Editing raw HTML disconnects the visual builder for this template. Switch back to Design to regenerate from scratch.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-[11px] font-semibold text-[#a0a0a0] uppercase tracking-wide">Live Preview</label>
                    <span className="text-[10px] text-[#636366]">Merge tags shown as-is</span>
                  </div>
                  <div className="bg-white rounded-lg overflow-hidden border border-dark-border" style={{ height: 'calc(70vh - 40px)' }}>
                    <iframe
                      srcDoc={previewSrc}
                      title="Preview"
                      className="w-full h-full"
                      sandbox=""
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="p-5 border-t border-dark-border flex gap-3">
              <button
                onClick={closeEditor}
                className="flex-1 border border-dark-border text-[#a0a0a0] py-2.5 rounded-lg text-sm font-semibold hover:bg-dark-surface2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!meta.name || !meta.subject || saveMutation.isPending || (mode === 'gallery' && !editing)}
                className="flex-1 bg-primary-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saveMutation.isPending ? 'Saving...' : editing ? 'Update Template' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}

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

interface DesignPaneProps {
  content: EmailContent
  setContent: (updater: (c: EmailContent) => EmailContent) => void
  updateBlock: (i: number, patch: Partial<Block>) => void
  moveBlock: (i: number, dir: -1 | 1) => void
  removeBlock: (i: number) => void
  addBlock: (type: Block['type']) => void
}

function DesignPane({ content, setContent, updateBlock, moveBlock, removeBlock, addBlock }: DesignPaneProps) {
  const setField = <K extends keyof EmailContent>(k: K, v: EmailContent[K]) =>
    setContent(c => ({ ...c, [k]: v }))

  const setPalette = (key: keyof EmailContent['palette'], v: string) =>
    setContent(c => ({ ...c, palette: { ...c.palette, [key]: v } }))

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Brand</h3>
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-[#a0a0a0] mb-1">Logo Text / Hotel Name</label>
            <input
              type="text"
              value={content.logoText}
              onChange={e => setField('logoText', e.target.value)}
              className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#a0a0a0] mb-1">Preheader <span className="text-[#636366] font-normal">(inbox preview text)</span></label>
            <input
              type="text"
              value={content.preheader ?? ''}
              onChange={e => setField('preheader', e.target.value)}
              className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SwatchInput label="Accent Color" value={content.palette.accent} onChange={v => setPalette('accent', v)} />
            <SwatchInput label="Header Background" value={content.palette.headerBg} onChange={v => setPalette('headerBg', v)} />
            <SwatchInput label="Page Background" value={content.palette.page} onChange={v => setPalette('page', v)} />
            <SwatchInput label="Header Text" value={content.palette.headerText} onChange={v => setPalette('headerText', v)} />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#a0a0a0] mb-1">Typeface</label>
            <div className="flex gap-2">
              {(['sans', 'serif', 'mixed'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setField('font', f)}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    content.font === f
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-dark-surface2 text-t-secondary border-dark-border hover:border-primary-500'
                  }`}
                >
                  {f === 'sans' ? 'Modern Sans' : f === 'serif' ? 'Classic Serif' : 'Editorial'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">Content Blocks</h3>
          <span className="text-[10px] text-[#636366]">{content.blocks.length} block{content.blocks.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="space-y-2">
          {content.blocks.map((b, i) => (
            <BlockEditor
              key={i}
              block={b}
              onChange={patch => updateBlock(i, patch)}
              onUp={i > 0 ? () => moveBlock(i, -1) : undefined}
              onDown={i < content.blocks.length - 1 ? () => moveBlock(i, 1) : undefined}
              onRemove={() => removeBlock(i)}
            />
          ))}
          {content.blocks.length === 0 && (
            <div className="text-xs text-[#636366] text-center py-6 border border-dashed border-dark-border rounded-lg">
              No blocks yet — add one below.
            </div>
          )}
        </div>
        <div className="mt-3">
          <label className="block text-[11px] font-semibold text-[#a0a0a0] mb-2 uppercase tracking-wide">Add Block</label>
          <div className="flex flex-wrap gap-1.5">
            {BLOCK_LIBRARY.map(b => (
              <button
                key={b.type}
                onClick={() => addBlock(b.type)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-dark-surface2 text-t-secondary border border-dark-border hover:border-primary-500 hover:text-white transition-colors"
              >
                + {b.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">Footer</h3>
        <textarea
          value={content.footerText}
          onChange={e => setField('footerText', e.target.value)}
          rows={2}
          className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </section>
    </div>
  )
}

function SwatchInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-[#a0a0a0] mb-1">{label}</label>
      <div className="flex items-center gap-2 bg-[#1e1e1e] border border-dark-border rounded-lg pr-2">
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-10 h-9 rounded-l-lg border-0 bg-transparent cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 bg-transparent py-2 text-xs text-white font-mono focus:outline-none"
        />
      </div>
    </div>
  )
}

interface BlockEditorProps {
  block: Block
  onChange: (patch: Partial<Block>) => void
  onUp?: () => void
  onDown?: () => void
  onRemove: () => void
}

function BlockEditor({ block, onChange, onUp, onDown, onRemove }: BlockEditorProps) {
  const typeLabel = BLOCK_LIBRARY.find(b => b.type === block.type)?.label ?? block.type

  return (
    <div className="bg-dark-surface2 border border-dark-border rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-primary-400 uppercase tracking-wider">{typeLabel}</span>
        <div className="flex items-center gap-1">
          <IconBtn onClick={onUp} disabled={!onUp} title="Move up">&uarr;</IconBtn>
          <IconBtn onClick={onDown} disabled={!onDown} title="Move down">&darr;</IconBtn>
          <IconBtn onClick={onRemove} title="Remove" danger>&times;</IconBtn>
        </div>
      </div>
      <BlockFields block={block} onChange={onChange} />
    </div>
  )
}

function BlockFields({ block, onChange }: { block: Block; onChange: (patch: Partial<Block>) => void }) {
  const cls = 'w-full bg-[#111] border border-dark-border rounded-md px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary-500'

  switch (block.type) {
    case 'heading':
    case 'text':
      return (
        <div className="space-y-2">
          <textarea
            value={block.content}
            onChange={e => onChange({ content: e.target.value } as Partial<Block>)}
            rows={block.type === 'heading' ? 1 : 3}
            className={cls + ' resize-y'}
          />
          <div className="flex gap-2">
            {(['left', 'center'] as const).map(a => (
              <button
                key={a}
                onClick={() => onChange({ align: a } as Partial<Block>)}
                className={`px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-wide ${
                  (block.align ?? 'left') === a
                    ? 'bg-primary-600 text-white'
                    : 'bg-[#111] text-t-secondary border border-dark-border'
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      )
    case 'pointsBox':
      return (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={block.value}
            onChange={e => onChange({ value: e.target.value } as Partial<Block>)}
            placeholder="Value"
            className={cls}
          />
          <input
            type="text"
            value={block.label}
            onChange={e => onChange({ label: e.target.value } as Partial<Block>)}
            placeholder="Label"
            className={cls}
          />
        </div>
      )
    case 'tierBadge':
      return (
        <input
          type="text"
          value={block.label}
          onChange={e => onChange({ label: e.target.value } as Partial<Block>)}
          className={cls}
        />
      )
    case 'cta':
      return (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={block.label}
            onChange={e => onChange({ label: e.target.value } as Partial<Block>)}
            placeholder="Button text"
            className={cls}
          />
          <input
            type="text"
            value={block.url}
            onChange={e => onChange({ url: e.target.value } as Partial<Block>)}
            placeholder="https://..."
            className={cls}
          />
        </div>
      )
    case 'image':
      return (
        <div className="space-y-2">
          <input
            type="text"
            value={block.url}
            onChange={e => onChange({ url: e.target.value } as Partial<Block>)}
            placeholder="Image URL"
            className={cls}
          />
          <input
            type="text"
            value={block.alt ?? ''}
            onChange={e => onChange({ alt: e.target.value } as Partial<Block>)}
            placeholder="Alt text"
            className={cls}
          />
        </div>
      )
    case 'quote':
      return (
        <div className="space-y-2">
          <textarea
            value={block.content}
            onChange={e => onChange({ content: e.target.value } as Partial<Block>)}
            rows={2}
            className={cls + ' resize-y'}
          />
          <input
            type="text"
            value={block.author ?? ''}
            onChange={e => onChange({ author: e.target.value } as Partial<Block>)}
            placeholder="Author (optional)"
            className={cls}
          />
        </div>
      )
    case 'spacer':
      return (
        <div className="flex gap-2">
          {(['sm', 'md', 'lg'] as const).map(s => (
            <button
              key={s}
              onClick={() => onChange({ size: s } as Partial<Block>)}
              className={`flex-1 px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-wide ${
                (block.size ?? 'md') === s
                  ? 'bg-primary-600 text-white'
                  : 'bg-[#111] text-t-secondary border border-dark-border'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )
    case 'divider':
      return <div className="text-[11px] text-[#636366] italic">Thin horizontal line in divider color</div>
    case 'hero':
      return (
        <div className="space-y-2">
          <input
            type="text"
            value={block.imageUrl}
            onChange={e => onChange({ imageUrl: e.target.value } as Partial<Block>)}
            placeholder="Background image URL"
            className={cls}
          />
          <input
            type="text"
            value={block.headline}
            onChange={e => onChange({ headline: e.target.value } as Partial<Block>)}
            placeholder="Headline"
            className={cls}
          />
          <input
            type="text"
            value={block.subheadline ?? ''}
            onChange={e => onChange({ subheadline: e.target.value } as Partial<Block>)}
            placeholder="Subheadline (optional)"
            className={cls}
          />
          <div className="flex gap-2">
            {(['dark', 'light', 'none'] as const).map(o => (
              <button
                key={o}
                onClick={() => onChange({ overlay: o } as Partial<Block>)}
                className={`flex-1 px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-wide ${
                  (block.overlay ?? 'dark') === o
                    ? 'bg-primary-600 text-white'
                    : 'bg-[#111] text-t-secondary border border-dark-border'
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      )
    case 'twoColumn':
      return (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={block.leftHeading ?? ''}
            onChange={e => onChange({ leftHeading: e.target.value } as Partial<Block>)}
            placeholder="Left heading"
            className={cls}
          />
          <input
            type="text"
            value={block.rightHeading ?? ''}
            onChange={e => onChange({ rightHeading: e.target.value } as Partial<Block>)}
            placeholder="Right heading"
            className={cls}
          />
          <textarea
            value={block.leftText}
            onChange={e => onChange({ leftText: e.target.value } as Partial<Block>)}
            rows={3}
            className={cls + ' resize-y'}
          />
          <textarea
            value={block.rightText}
            onChange={e => onChange({ rightText: e.target.value } as Partial<Block>)}
            rows={3}
            className={cls + ' resize-y'}
          />
        </div>
      )
    case 'voucher':
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={block.title}
              onChange={e => onChange({ title: e.target.value } as Partial<Block>)}
              placeholder="Title (e.g. Member Gift)"
              className={cls}
            />
            <input
              type="text"
              value={block.value}
              onChange={e => onChange({ value: e.target.value } as Partial<Block>)}
              placeholder="Value (e.g. €100)"
              className={cls}
            />
          </div>
          <input
            type="text"
            value={block.code}
            onChange={e => onChange({ code: e.target.value } as Partial<Block>)}
            placeholder="Voucher code"
            className={cls}
          />
          <input
            type="text"
            value={block.terms ?? ''}
            onChange={e => onChange({ terms: e.target.value } as Partial<Block>)}
            placeholder="Terms (optional)"
            className={cls}
          />
        </div>
      )
    case 'stats':
      return (
        <div className="space-y-2">
          {block.items.map((it, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <input
                type="text"
                value={it.value}
                onChange={e => {
                  const items = [...block.items]
                  items[idx] = { ...items[idx], value: e.target.value }
                  onChange({ items } as Partial<Block>)
                }}
                placeholder="Value"
                className={cls}
              />
              <input
                type="text"
                value={it.label}
                onChange={e => {
                  const items = [...block.items]
                  items[idx] = { ...items[idx], label: e.target.value }
                  onChange({ items } as Partial<Block>)
                }}
                placeholder="Label"
                className={cls}
              />
              <button
                onClick={() => {
                  const items = block.items.filter((_, i) => i !== idx)
                  onChange({ items } as Partial<Block>)
                }}
                className="w-6 h-6 rounded text-xs text-[#ff6680] hover:bg-[#ff375f]/15"
                title="Remove"
              >
                &times;
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              const items = [...block.items, { value: '', label: '' }]
              onChange({ items } as Partial<Block>)
            }}
            className="text-[11px] font-semibold text-primary-400 hover:text-primary-300"
          >
            + Add stat
          </button>
        </div>
      )
  }
}

function IconBtn({ children, onClick, disabled, title, danger }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; title: string; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-6 h-6 rounded text-xs flex items-center justify-center transition-colors ${
        disabled
          ? 'text-[#444] cursor-not-allowed'
          : danger
            ? 'text-[#ff6680] hover:bg-[#ff375f]/15'
            : 'text-t-secondary hover:text-white hover:bg-dark-surface3'
      }`}
    >
      {children}
    </button>
  )
}
