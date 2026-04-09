import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { BookOpen, Plus, Pencil, Trash2, Upload, FileText, FolderOpen, Search, X, Save, RotateCcw, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'

type Tab = 'items' | 'categories' | 'documents'

const emptyItem = { question: '', answer: '', keywords: [] as string[], priority: 0, category_id: null as number | null, is_active: true }
const emptyCategory = { name: '', description: '', priority: 0, is_active: true }

export function KnowledgeBase() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('items')
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<string>('')

  // ─── Items ───
  const [showItemForm, setShowItemForm] = useState(false)
  const [editItemId, setEditItemId] = useState<number | null>(null)
  const [itemForm, setItemForm] = useState(emptyItem)
  const [newKeyword, setNewKeyword] = useState('')

  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ['knowledge-items', search, filterCat],
    queryFn: () => api.get('/v1/admin/knowledge/items', { params: { search: search || undefined, category_id: filterCat || undefined } }).then(r => r.data),
  })

  const saveItem = useMutation({
    mutationFn: (data: any) => editItemId ? api.put(`/v1/admin/knowledge/items/${editItemId}`, data) : api.post('/v1/admin/knowledge/items', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge-items'] })
      setShowItemForm(false)
      setEditItemId(null)
      setItemForm(emptyItem)
      toast.success(editItemId ? 'Item updated' : 'Item created')
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  })

  const deleteItem = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/knowledge/items/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['knowledge-items'] }); toast.success('Deleted') },
  })

  // Asks the AI for suggested search keywords for the current question/answer
  // and merges them into the item's keyword list (dedupes against existing).
  const suggestKeywords = useMutation({
    mutationFn: (payload: { question: string; answer: string }) =>
      api.post('/v1/admin/chatbot-config/suggest-keywords', payload).then(r => r.data),
    onSuccess: (data: any) => {
      const fresh: string[] = Array.isArray(data?.keywords) ? data.keywords : []
      if (fresh.length === 0) { toast('No keywords suggested'); return }
      setItemForm(prev => {
        const seen = new Set(prev.keywords.map(k => k.toLowerCase()))
        const merged = [...prev.keywords]
        for (const k of fresh) {
          if (!seen.has(k.toLowerCase())) { merged.push(k); seen.add(k.toLowerCase()) }
        }
        return { ...prev, keywords: merged }
      })
      toast.success(`Added ${fresh.length} suggested keywords`)
    },
    onError: () => toast.error('AI suggestion failed'),
  })

  // ─── Categories ───
  const [showCatForm, setShowCatForm] = useState(false)
  const [editCatId, setEditCatId] = useState<number | null>(null)
  const [catForm, setCatForm] = useState(emptyCategory)

  const { data: categories = [], isLoading: loadingCats } = useQuery({
    queryKey: ['knowledge-categories'],
    queryFn: () => api.get('/v1/admin/knowledge/categories').then(r => r.data),
  })

  const saveCat = useMutation({
    mutationFn: (data: any) => editCatId ? api.put(`/v1/admin/knowledge/categories/${editCatId}`, data) : api.post('/v1/admin/knowledge/categories', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['knowledge-categories'] })
      setShowCatForm(false)
      setEditCatId(null)
      setCatForm(emptyCategory)
      toast.success(editCatId ? 'Category updated' : 'Category created')
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  })

  const deleteCat = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/knowledge/categories/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['knowledge-categories'] }); toast.success('Deleted') },
  })

  // ─── Documents ───
  const { data: documents = [], isLoading: loadingDocs } = useQuery({
    queryKey: ['knowledge-documents'],
    queryFn: () => api.get('/v1/admin/knowledge/documents').then(r => r.data),
  })

  const uploadDoc = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return api.post('/v1/admin/knowledge/documents', fd)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['knowledge-documents'] }); toast.success('Document uploaded') },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Upload failed'),
  })

  const deleteDoc = useMutation({
    mutationFn: (id: number) => api.delete(`/v1/admin/knowledge/documents/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['knowledge-documents'] }); toast.success('Deleted') },
  })

  const reprocessDoc = useMutation({
    mutationFn: (id: number) => api.post(`/v1/admin/knowledge/documents/${id}/reprocess`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['knowledge-documents'] }); toast.success('Reprocessing started') },
  })

  // ─── AI FAQ Generator ───
  const [showAiGen, setShowAiGen] = useState(false)
  const [aiSourceText, setAiSourceText] = useState('')
  const [aiCategoryId, setAiCategoryId] = useState<number | null>(null)
  const [aiPreview, setAiPreview] = useState<Array<{ question: string; answer: string; keywords: string[]; selected: boolean }>>([])

  const extractFaqs = useMutation({
    mutationFn: () => api.post('/v1/admin/knowledge/extract-faqs', { source_text: aiSourceText }).then(r => r.data),
    onSuccess: (data) => {
      const items = (data.items || []).map((it: any) => ({ ...it, keywords: it.keywords || [], selected: true }))
      setAiPreview(items)
      if (items.length === 0) toast.error(data.message || 'AI returned no items')
      else toast.success(`Extracted ${items.length} draft FAQ items — review and import`)
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Extraction failed'),
  })

  const importFaqs = useMutation({
    mutationFn: () => {
      const picked = aiPreview.filter(i => i.selected).map(({ selected, ...rest }) => rest)
      return api.post('/v1/admin/knowledge/bulk-import-faqs', {
        category_id: aiCategoryId,
        items: picked,
      })
    },
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['knowledge-items'] })
      qc.invalidateQueries({ queryKey: ['knowledge-categories'] })
      toast.success(`Imported ${r.data?.created_count ?? 0} FAQ items`)
      setAiPreview([])
      setAiSourceText('')
      setShowAiGen(false)
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Import failed'),
  })

  const addKeyword = () => {
    if (!newKeyword.trim()) return
    setItemForm(prev => ({ ...prev, keywords: [...prev.keywords, newKeyword.trim()] }))
    setNewKeyword('')
  }

  const removeKeyword = (i: number) => {
    setItemForm(prev => ({ ...prev, keywords: prev.keywords.filter((_, idx) => idx !== i) }))
  }

  const editItem = (item: any) => {
    setEditItemId(item.id)
    setItemForm({ question: item.question, answer: item.answer, keywords: item.keywords || [], priority: item.priority, category_id: item.category_id, is_active: item.is_active })
    setShowItemForm(true)
  }

  const editCat = (cat: any) => {
    setEditCatId(cat.id)
    setCatForm({ name: cat.name, description: cat.description || '', priority: cat.priority, is_active: cat.is_active })
    setShowCatForm(true)
  }

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-500/20 text-yellow-400',
      processing: 'bg-blue-500/20 text-blue-400',
      completed: 'bg-green-500/20 text-green-400',
      failed: 'bg-red-500/20 text-red-400',
    }
    return <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[status] || styles.pending}`}>{status}</span>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <BookOpen className="text-primary-500" size={28} />
        <div>
          <h1 className="text-2xl font-bold text-white">Knowledge Base</h1>
          <p className="text-sm text-t-secondary">Manage FAQ items, categories, and documents that power the AI assistant</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-surface border border-dark-border rounded-lg p-1 w-fit">
        {[
          { key: 'items' as Tab, label: 'FAQ Items', icon: FileText, count: items.length },
          { key: 'categories' as Tab, label: 'Categories', icon: FolderOpen, count: categories.length },
          { key: 'documents' as Tab, label: 'Documents', icon: Upload, count: documents.length },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-primary-600 text-white' : 'text-t-secondary hover:text-white'
            }`}
          >
            <t.icon size={16} />
            {t.label}
            <span className="text-xs opacity-60">({t.count})</span>
          </button>
        ))}
      </div>

      {/* ═══ FAQ ITEMS TAB ═══ */}
      {tab === 'items' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-border2" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-dark-surface border border-dark-border rounded-lg pl-9 pr-3 py-2 text-white text-sm"
                placeholder="Search questions or answers..."
              />
            </div>
            <select
              value={filterCat}
              onChange={e => setFilterCat(e.target.value)}
              className="bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
            >
              <option value="">All Categories</option>
              {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button
              onClick={() => setShowAiGen(v => !v)}
              className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm"
            >
              <Sparkles size={16} /> AI Generate
            </button>
            <button
              onClick={() => { setShowItemForm(true); setEditItemId(null); setItemForm(emptyItem) }}
              className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 text-sm"
            >
              <Plus size={16} /> Add FAQ
            </button>
          </div>

          {/* AI FAQ Generator panel */}
          {showAiGen && (
            <div className="bg-purple-900/10 border border-purple-500/30 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-purple-400" />
                  <h3 className="text-white font-semibold">AI FAQ Generator</h3>
                </div>
                <button onClick={() => { setShowAiGen(false); setAiPreview([]); setAiSourceText('') }} className="text-t-secondary hover:text-white"><X size={18} /></button>
              </div>
              <p className="text-xs text-t-secondary -mt-2">
                Paste any source material — hotel description, brochure copy, policy doc, fact sheet — and the AI will draft FAQ Q&amp;A pairs for you. Review the result, untick anything you don't want, then import.
              </p>

              <div>
                <label className="block text-sm text-t-secondary mb-1">Source text</label>
                <textarea
                  value={aiSourceText}
                  onChange={e => setAiSourceText(e.target.value)}
                  rows={8}
                  className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
                  placeholder="Paste hotel info, policies, services, room descriptions, etc..."
                />
                <div className="text-[10px] text-t-secondary mt-1">{aiSourceText.length} characters · max 20,000</div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-t-secondary mb-1">Save into category</label>
                  <select
                    value={aiCategoryId ?? ''}
                    onChange={e => setAiCategoryId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
                  >
                    <option value="">Auto-create "AI Generated"</option>
                    {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => extractFaqs.mutate()}
                    disabled={extractFaqs.isPending || aiSourceText.trim().length < 50}
                    className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm disabled:opacity-50"
                  >
                    <Sparkles size={14} /> {extractFaqs.isPending ? 'Generating...' : 'Generate FAQ Drafts'}
                  </button>
                </div>
              </div>

              {aiPreview.length > 0 && (
                <div className="space-y-2 border-t border-dark-border pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-white">Preview ({aiPreview.filter(i => i.selected).length}/{aiPreview.length} selected)</h4>
                    <div className="flex gap-2">
                      <button onClick={() => setAiPreview(p => p.map(i => ({ ...i, selected: true })))} className="text-xs text-t-secondary hover:text-white">Select all</button>
                      <button onClick={() => setAiPreview(p => p.map(i => ({ ...i, selected: false })))} className="text-xs text-t-secondary hover:text-white">Select none</button>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {aiPreview.map((it, i) => (
                      <div key={i} className={`bg-dark-surface border rounded-lg p-3 ${it.selected ? 'border-purple-500/40' : 'border-dark-border opacity-50'}`}>
                        <div className="flex items-start gap-3">
                          <input type="checkbox" checked={it.selected} onChange={e => setAiPreview(p => p.map((x, idx) => idx === i ? { ...x, selected: e.target.checked } : x))} className="mt-1" />
                          <div className="flex-1 min-w-0">
                            <input
                              type="text"
                              value={it.question}
                              onChange={e => setAiPreview(p => p.map((x, idx) => idx === i ? { ...x, question: e.target.value } : x))}
                              className="w-full bg-transparent text-white text-sm font-medium border-b border-transparent focus:border-purple-500 focus:outline-none mb-1"
                            />
                            <textarea
                              value={it.answer}
                              onChange={e => setAiPreview(p => p.map((x, idx) => idx === i ? { ...x, answer: e.target.value } : x))}
                              rows={2}
                              className="w-full bg-transparent text-t-secondary text-xs border-b border-transparent focus:border-purple-500 focus:outline-none resize-none"
                            />
                            {it.keywords.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {it.keywords.map((kw, ki) => (
                                  <span key={ki} className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">{kw}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={() => setAiPreview([])} className="px-4 py-2 text-sm text-t-secondary hover:text-white">Discard</button>
                    <button
                      onClick={() => importFaqs.mutate()}
                      disabled={importFaqs.isPending || aiPreview.filter(i => i.selected).length === 0}
                      className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm disabled:opacity-50"
                    >
                      <Save size={14} /> {importFaqs.isPending ? 'Importing...' : `Import ${aiPreview.filter(i => i.selected).length} items`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Item Form */}
          {showItemForm && (
            <div className="bg-dark-surface border border-dark-border rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-semibold">{editItemId ? 'Edit FAQ Item' : 'New FAQ Item'}</h3>
                <button onClick={() => { setShowItemForm(false); setEditItemId(null); setItemForm(emptyItem) }} className="text-t-secondary hover:text-white"><X size={18} /></button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-t-secondary mb-1">Category</label>
                  <select
                    value={itemForm.category_id || ''}
                    onChange={e => setItemForm(p => ({ ...p, category_id: e.target.value ? Number(e.target.value) : null }))}
                    className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
                  >
                    <option value="">None</option>
                    {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-t-secondary mb-1">Priority</label>
                  <input type="number" min={0} value={itemForm.priority} onChange={e => setItemForm(p => ({ ...p, priority: Number(e.target.value) }))} className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-sm text-t-secondary mb-1">Question</label>
                <input type="text" value={itemForm.question} onChange={e => setItemForm(p => ({ ...p, question: e.target.value }))} className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm" placeholder="What is the check-in time?" />
              </div>

              <div>
                <label className="block text-sm text-t-secondary mb-1">Answer</label>
                <textarea value={itemForm.answer} onChange={e => setItemForm(p => ({ ...p, answer: e.target.value }))} rows={4} className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm" placeholder="Check-in time is 3:00 PM..." />
              </div>

              <div>
                <label className="block text-sm text-t-secondary mb-1">Keywords</label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {itemForm.keywords.map((kw, i) => (
                    <span key={i} className="flex items-center gap-1 bg-primary-500/20 text-primary-400 px-2 py-0.5 rounded text-xs">
                      {kw}
                      <button onClick={() => removeKeyword(i)}><X size={12} /></button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input type="text" value={newKeyword} onChange={e => setNewKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addKeyword())} className="flex-1 bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm" placeholder="Add keyword..." />
                  <button onClick={addKeyword} className="bg-dark-surface4 text-white px-3 py-2 rounded-lg text-sm hover:bg-dark-border2"><Plus size={14} /></button>
                  <button
                    type="button"
                    disabled={!itemForm.question.trim() || suggestKeywords.isPending}
                    onClick={() => suggestKeywords.mutate({ question: itemForm.question, answer: itemForm.answer })}
                    className="flex items-center gap-1 bg-primary-600/20 text-primary-400 px-3 py-2 rounded-lg text-xs hover:bg-primary-600/30 disabled:opacity-50"
                    title="Let AI suggest keywords from question + answer">
                    <Sparkles size={14} /> {suggestKeywords.isPending ? '...' : 'AI'}
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button onClick={() => { setShowItemForm(false); setEditItemId(null); setItemForm(emptyItem) }} className="px-4 py-2 text-sm text-t-secondary hover:text-white">Cancel</button>
                <button onClick={() => saveItem.mutate(itemForm)} disabled={saveItem.isPending} className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 text-sm disabled:opacity-50">
                  <Save size={14} /> {saveItem.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {/* Items List */}
          {loadingItems ? (
            <div className="text-center text-t-secondary py-12">Loading...</div>
          ) : items.length === 0 ? (
            <div className="text-center text-t-secondary py-12">
              <BookOpen size={40} className="mx-auto mb-3 opacity-30" />
              <p>No FAQ items yet. Add your first one to help the AI answer questions.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item: any) => (
                <div key={item.id} className="bg-dark-surface border border-dark-border rounded-xl p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-white font-medium text-sm">{item.question}</span>
                        {item.category && <span className="text-xs bg-dark-surface4 text-t-secondary px-2 py-0.5 rounded">{item.category.name}</span>}
                        {!item.is_active && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">Inactive</span>}
                      </div>
                      <p className="text-sm text-t-secondary line-clamp-2">{item.answer}</p>
                      {item.keywords?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {item.keywords.map((kw: string, i: number) => (
                            <span key={i} className="text-xs bg-primary-500/10 text-primary-400 px-1.5 py-0.5 rounded">{kw}</span>
                          ))}
                        </div>
                      )}
                      <div className="text-xs text-dark-border2 mt-1">Used {item.use_count} times | Priority: {item.priority}</div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => editItem(item)} className="p-2 text-t-secondary hover:text-white"><Pencil size={14} /></button>
                      <button onClick={() => { if (confirm('Delete this FAQ item?')) deleteItem.mutate(item.id) }} className="p-2 text-t-secondary hover:text-red-400"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ CATEGORIES TAB ═══ */}
      {tab === 'categories' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => { setShowCatForm(true); setEditCatId(null); setCatForm(emptyCategory) }}
              className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 text-sm"
            >
              <Plus size={16} /> Add Category
            </button>
          </div>

          {showCatForm && (
            <div className="bg-dark-surface border border-dark-border rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-semibold">{editCatId ? 'Edit Category' : 'New Category'}</h3>
                <button onClick={() => { setShowCatForm(false); setEditCatId(null) }} className="text-t-secondary hover:text-white"><X size={18} /></button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-t-secondary mb-1">Name</label>
                  <input type="text" value={catForm.name} onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))} className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm" placeholder="Category name" />
                </div>
                <div>
                  <label className="block text-sm text-t-secondary mb-1">Priority</label>
                  <input type="number" min={0} value={catForm.priority} onChange={e => setCatForm(p => ({ ...p, priority: Number(e.target.value) }))} className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-t-secondary mb-1">Description</label>
                <textarea value={catForm.description} onChange={e => setCatForm(p => ({ ...p, description: e.target.value }))} rows={2} className="w-full bg-dark-surface border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => { setShowCatForm(false); setEditCatId(null) }} className="px-4 py-2 text-sm text-t-secondary hover:text-white">Cancel</button>
                <button onClick={() => saveCat.mutate(catForm)} disabled={saveCat.isPending} className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 text-sm disabled:opacity-50">
                  <Save size={14} /> {saveCat.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          )}

          {loadingCats ? (
            <div className="text-center text-t-secondary py-12">Loading...</div>
          ) : categories.length === 0 ? (
            <div className="text-center text-t-secondary py-12">
              <FolderOpen size={40} className="mx-auto mb-3 opacity-30" />
              <p>No categories yet. Create one to organize your FAQ items.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {categories.map((cat: any) => (
                <div key={cat.id} className="bg-dark-surface border border-dark-border rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{cat.name}</span>
                      <span className="text-xs text-t-secondary">({cat.items_count || 0} items)</span>
                      {!cat.is_active && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">Inactive</span>}
                    </div>
                    {cat.description && <p className="text-sm text-t-secondary mt-1">{cat.description}</p>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => editCat(cat)} className="p-2 text-t-secondary hover:text-white"><Pencil size={14} /></button>
                    <button onClick={() => { if (confirm('Delete this category?')) deleteCat.mutate(cat.id) }} className="p-2 text-t-secondary hover:text-red-400"><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ DOCUMENTS TAB ═══ */}
      {tab === 'documents' && (
        <div className="space-y-4">
          {/* Upload Area */}
          <div className="bg-dark-surface border-2 border-dashed border-dark-border rounded-xl p-8 text-center">
            <Upload size={32} className="mx-auto mb-3 text-dark-border2" />
            <p className="text-sm text-t-secondary mb-3">Upload PDF, DOCX, or TXT files to extend the AI's knowledge</p>
            <label className="inline-flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 text-sm cursor-pointer">
              <Upload size={16} />
              Choose File
              <input
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) uploadDoc.mutate(file)
                  e.target.value = ''
                }}
              />
            </label>
            {uploadDoc.isPending && <p className="text-sm text-primary-400 mt-2">Uploading and processing...</p>}
          </div>

          {/* Documents List */}
          {loadingDocs ? (
            <div className="text-center text-t-secondary py-12">Loading...</div>
          ) : documents.length === 0 ? (
            <div className="text-center text-t-secondary py-8">
              <p>No documents uploaded yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc: any) => (
                <div key={doc.id} className="bg-dark-surface border border-dark-border rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText size={20} className="text-primary-400" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-medium text-sm">{doc.file_name}</span>
                          {statusBadge(doc.processing_status)}
                        </div>
                        <div className="text-xs text-dark-border2 mt-0.5">
                          {doc.size_bytes ? `${(doc.size_bytes / 1024).toFixed(1)} KB` : ''}
                          {doc.chunks_count > 0 && ` | ${doc.chunks_count} chunks`}
                          {doc.mime_type && ` | ${doc.mime_type}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {doc.processing_status === 'failed' && (
                        <button onClick={() => reprocessDoc.mutate(doc.id)} className="p-2 text-t-secondary hover:text-primary-400" title="Reprocess"><RotateCcw size={14} /></button>
                      )}
                      <button onClick={() => { if (confirm('Delete this document?')) deleteDoc.mutate(doc.id) }} className="p-2 text-t-secondary hover:text-red-400"><Trash2 size={14} /></button>
                    </div>
                  </div>
                  {doc.extracted_text && (
                    <details className="mt-2">
                      <summary className="text-xs text-t-secondary cursor-pointer hover:text-white">Preview extracted text</summary>
                      <pre className="text-xs text-t-secondary mt-2 bg-dark-surface rounded-lg p-3 max-h-40 overflow-auto whitespace-pre-wrap">{doc.extracted_text.substring(0, 1000)}{doc.extracted_text.length > 1000 ? '...' : ''}</pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
