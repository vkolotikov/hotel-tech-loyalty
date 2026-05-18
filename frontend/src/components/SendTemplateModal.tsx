import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Mail, Send, X, Loader2, Search } from 'lucide-react'
import { api } from '../lib/api'
import toast from 'react-hot-toast'

/**
 * Quick-send an existing email template to a single recipient. Mounted
 * wherever staff want to fire off a templated email in two clicks —
 * inquiry detail, customer detail, member detail.
 *
 * The template is rendered server-side with merge tags substituted
 * against the recipient member (when known). If no member is provided
 * the tags ship unsubstituted — the staff has the chance to spot that
 * in the preview before sending.
 */

type Template = {
  id: number
  name: string
  subject: string
  html_body: string
  category: string | null
}

export type SendTemplateModalProps = {
  /** Pre-fill the To: field (e.g. inquiry.guest.email). */
  defaultTo?: string | null
  /** When the recipient is a loyalty member, pass id for merge-tag rendering. */
  memberId?: number | null
  /** Context label shown above the form (e.g. "Send to John Smith"). */
  context?: string
  onClose: () => void
  /** Fired after a successful send. */
  onSent?: () => void
}

export function SendTemplateModal({ defaultTo, memberId, context, onClose, onSent }: SendTemplateModalProps) {
  const [to, setTo] = useState(defaultTo ?? '')
  const [subjectOverride, setSubjectOverride] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const { data, isLoading } = useQuery<{ templates: Template[] }>({
    queryKey: ['email-templates-list'],
    queryFn: () => api.get('/v1/admin/email-templates').then(r => r.data),
  })

  const templates = data?.templates ?? []
  const filtered = filter.trim()
    ? templates.filter(t => t.name.toLowerCase().includes(filter.toLowerCase()) || t.subject.toLowerCase().includes(filter.toLowerCase()))
    : templates
  const selected = templates.find(t => t.id === selectedId) ?? null

  const sendMutation = useMutation({
    mutationFn: () =>
      api.post(`/v1/admin/email-templates/${selectedId}/send`, {
        to,
        member_id: memberId ?? undefined,
        subject:   subjectOverride.trim() || undefined,
      }).then(r => r.data),
    onSuccess: () => {
      toast.success(`Email sent to ${to}`)
      onSent?.()
      onClose()
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.message || 'Send failed')
    },
  })

  const canSend = !!selectedId && /^\S+@\S+\.\S+$/.test(to.trim()) && !sendMutation.isPending

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 pointer-events-none">
        <div className="bg-dark-surface border border-dark-border rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col pointer-events-auto shadow-2xl">
          {/* Header */}
          <div className="px-5 py-4 border-b border-dark-border flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-t-secondary">Quick send</div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2"><Mail size={15} /> Send template</h2>
              {context && <p className="text-[11px] text-t-secondary mt-0.5">{context}</p>}
            </div>
            <button onClick={onClose} className="p-1.5 rounded hover:bg-white/5 text-gray-500 hover:text-white">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-0 flex-1 overflow-hidden">
            {/* Template picker */}
            <div className="border-r border-dark-border bg-dark-surface2/40 flex flex-col">
              <div className="p-3 border-b border-dark-border">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    placeholder="Filter templates…"
                    className="w-full pl-8 pr-2 py-1.5 bg-dark-surface border border-dark-border rounded text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary-500/30"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {isLoading ? (
                  <div className="text-center py-6 text-xs text-t-secondary"><Loader2 size={13} className="inline animate-spin" /></div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-6 text-xs text-t-secondary">No templates.</div>
                ) : (
                  filtered.map(t => (
                    <button
                      key={t.id}
                      onClick={() => { setSelectedId(t.id); setSubjectOverride('') }}
                      className={`w-full text-left px-2.5 py-2 rounded transition-colors ${
                        selectedId === t.id
                          ? 'bg-primary-500/15 border border-primary-500/30'
                          : 'border border-transparent hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="text-xs font-semibold text-white truncate">{t.name}</div>
                      <div className="text-[10px] text-t-secondary truncate">{t.subject}</div>
                      {t.category && (
                        <div className="text-[9px] uppercase tracking-wider text-gray-500 mt-0.5">{t.category}</div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Form + preview */}
            <div className="flex flex-col overflow-hidden">
              <div className="p-4 border-b border-dark-border space-y-3">
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wider text-t-secondary mb-1">To</span>
                  <input
                    type="email"
                    value={to}
                    onChange={e => setTo(e.target.value)}
                    placeholder="recipient@example.com"
                    className="w-full px-3 py-2 bg-dark-surface2 border border-dark-border rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wider text-t-secondary mb-1">Subject {selected && <span className="text-gray-600 normal-case">(leave blank to use template default)</span>}</span>
                  <input
                    type="text"
                    value={subjectOverride}
                    onChange={e => setSubjectOverride(e.target.value)}
                    placeholder={selected?.subject ?? 'Pick a template first…'}
                    className="w-full px-3 py-2 bg-dark-surface2 border border-dark-border rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500"
                  />
                </label>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {selected ? (
                  <>
                    <div className="text-[10px] uppercase tracking-wider text-t-secondary mb-2">Preview</div>
                    <div
                      className="prose prose-invert prose-sm max-w-none bg-white/[0.02] border border-dark-border rounded-lg p-3 text-xs text-gray-200"
                      dangerouslySetInnerHTML={{ __html: selected.html_body }}
                    />
                    <p className="text-[10px] text-gray-600 mt-2">
                      Merge tags like <code className="text-primary-300">{'{{name}}'}</code> are substituted server-side when sending. Preview shows the raw template.
                    </p>
                  </>
                ) : (
                  <div className="text-center text-xs text-t-secondary py-12">
                    Pick a template on the left to preview it.
                  </div>
                )}
              </div>

              <div className="px-4 py-3 border-t border-dark-border flex items-center justify-end gap-2">
                <button onClick={onClose} className="px-3 py-2 rounded text-sm text-t-secondary hover:text-white">Cancel</button>
                <button
                  onClick={() => sendMutation.mutate()}
                  disabled={!canSend}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary-500 hover:bg-primary-400 text-black font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sendMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  Send email
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
