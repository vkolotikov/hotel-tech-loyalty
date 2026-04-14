import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Star, X } from 'lucide-react'
import { api } from '../lib/api'

interface Form {
  id: number
  name: string
  type: 'basic' | 'custom'
  is_default: boolean
  is_active: boolean
}

type Target =
  | { memberId: number }
  | { guestId: number }
  | { email: string; name?: string }

interface Props {
  target: Target
  className?: string
  label?: string
}

export function SendReviewButton({ target, className, label = 'Request review' }: Props) {
  const [open, setOpen] = useState(false)
  const [formId, setFormId] = useState<number | null>(null)
  const [subject, setSubject] = useState('')

  const { data } = useQuery<{ forms: Form[] }>({
    queryKey: ['review-forms-lite'],
    queryFn: () => api.get('/v1/admin/reviews/forms').then(r => r.data),
    enabled: open,
  })

  const forms = (data?.forms ?? []).filter(f => f.is_active)
  const selected = formId ?? forms.find(f => f.is_default)?.id ?? forms[0]?.id ?? null

  const sendMut = useMutation({
    mutationFn: () => api.post('/v1/admin/reviews/invitations', {
      form_id: selected,
      ...('memberId' in target ? { member_id: target.memberId } : {}),
      ...('guestId'  in target ? { guest_id:  target.guestId  } : {}),
      ...('email'    in target ? { email: target.email, name: target.name } : {}),
      subject: subject || undefined,
    }),
    onSuccess: () => {
      toast.success('Review invitation sent')
      setOpen(false)
      setFormId(null)
      setSubject('')
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to send'),
  })

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={className ?? 'flex items-center gap-1.5 border border-dark-border text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-dark-surface2'}
      >
        <Star size={14} /> {label}
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-dark-surface border border-dark-border rounded-xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Request a review</h3>
              <button onClick={() => setOpen(false)} className="text-[#a0a0a0] hover:text-white"><X size={18} /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#a0a0a0] uppercase tracking-wider mb-2">Form</label>
                {forms.length === 0 ? (
                  <div className="text-sm text-[#a0a0a0]">No active forms available.</div>
                ) : (
                  <select
                    value={selected ?? ''}
                    onChange={e => setFormId(Number(e.target.value))}
                    className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {forms.map(f => (
                      <option key={f.id} value={f.id}>
                        {f.name} {f.is_default ? '(default)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#a0a0a0] uppercase tracking-wider mb-2">Subject (optional)</label>
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="How was your stay?"
                  className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  onClick={() => setOpen(false)}
                  className="border border-dark-border text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-dark-surface2"
                >
                  Cancel
                </button>
                <button
                  onClick={() => sendMut.mutate()}
                  disabled={!selected || sendMut.isPending}
                  className="bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-600 disabled:opacity-50"
                >
                  {sendMut.isPending ? 'Sending…' : 'Send email'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
