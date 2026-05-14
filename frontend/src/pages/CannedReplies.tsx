import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { Plus, Trash2, Save, GripVertical } from 'lucide-react'
import toast from 'react-hot-toast'

type Canned = { label: string; text: string }

export function CannedReplies() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [items, setItems] = useState<Canned[]>([])
  const [dirty, setDirty] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['chat-inbox-canned'],
    queryFn: () => api.get('/v1/admin/chat-inbox-canned').then(r => r.data),
  })

  useEffect(() => {
    if (data?.canned_responses) {
      setItems(data.canned_responses)
      setDirty(false)
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: (payload: Canned[]) =>
      api.put('/v1/admin/chat-inbox-canned', { canned_responses: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-inbox-canned'] })
      setDirty(false)
      toast.success(t('canned_replies.toasts.saved', 'Canned replies saved'))
    },
    onError: (e: any) => toast.error(e.response?.data?.message || t('canned_replies.toasts.save_failed', 'Save failed')),
  })

  const update = (i: number, patch: Partial<Canned>) => {
    setItems(prev => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
    setDirty(true)
  }

  const remove = (i: number) => {
    setItems(prev => prev.filter((_, idx) => idx !== i))
    setDirty(true)
  }

  const add = () => {
    if (items.length >= 50) {
      toast.error(t('canned_replies.toasts.max_reached', 'Maximum 50 canned replies'))
      return
    }
    setItems(prev => [...prev, { label: '', text: '' }])
    setDirty(true)
  }

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= items.length) return
    const next = items.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    setItems(next)
    setDirty(true)
  }

  const save = () => {
    const cleaned = items
      .map(it => ({ label: it.label.trim(), text: it.text.trim() }))
      .filter(it => it.label && it.text)
    if (cleaned.length !== items.length) {
      toast.error(t('canned_replies.toasts.empty_removed', 'Empty entries will be removed'))
    }
    saveMutation.mutate(cleaned)
  }

  if (isLoading) {
    return <div className="text-center text-[#636366] py-12">{t('canned_replies.loading', 'Loading...')}</div>
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">{t('canned_replies.title', 'Canned Replies')}</h2>
          <p className="text-sm text-t-secondary mt-0.5">
            {t('canned_replies.subtitle', 'Pre-written responses agents can insert with one click from the inbox. Org-wide, max 50.')}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={add}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-dark-card border border-dark-border rounded-lg text-white hover:bg-dark-hover">
            <Plus size={14} /> {t('canned_replies.add', 'Add')}
          </button>
          <button
            onClick={save}
            disabled={!dirty || saveMutation.isPending}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-primary-500 text-black rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
            <Save size={14} /> {saveMutation.isPending ? t('canned_replies.saving', 'Saving...') : t('canned_replies.save', 'Save')}
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center text-[#636366] py-12 border border-dashed border-dark-border rounded-lg">
          {t('canned_replies.empty', 'No canned replies yet. Click "Add" to create one.')}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it, i) => (
            <div key={i} className="bg-dark-card border border-dark-border rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="flex flex-col gap-1 pt-1">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="text-t-secondary hover:text-white disabled:opacity-30"
                    title={t('canned_replies.move_up_title', 'Move up')}>
                    <GripVertical size={14} />
                  </button>
                </div>
                <div className="flex-1 space-y-2">
                  <input
                    type="text"
                    value={it.label}
                    onChange={e => update(i, { label: e.target.value })}
                    maxLength={80}
                    placeholder={t('canned_replies.label_placeholder', 'Label (e.g. Greeting)')}
                    className="w-full px-3 py-2 text-sm bg-dark-bg border border-dark-border rounded text-white placeholder-[#636366] focus:border-primary-500 outline-none"
                  />
                  <textarea
                    value={it.text}
                    onChange={e => update(i, { text: e.target.value })}
                    maxLength={2000}
                    rows={3}
                    placeholder={t('canned_replies.text_placeholder', 'Reply text — what gets inserted into the message box')}
                    className="w-full px-3 py-2 text-sm bg-dark-bg border border-dark-border rounded text-white placeholder-[#636366] focus:border-primary-500 outline-none resize-y"
                  />
                  <div className="text-xs text-[#636366] text-right">{it.text.length} / 2000</div>
                </div>
                <button
                  onClick={() => remove(i)}
                  className="text-red-400 hover:text-red-300 p-1"
                  title={t('canned_replies.delete_title', 'Delete')}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {dirty && (
        <div className="text-xs text-amber-400">{t('canned_replies.unsaved_warning', 'You have unsaved changes.')}</div>
      )}
    </div>
  )
}
