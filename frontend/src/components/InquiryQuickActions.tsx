import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Phone, Mail, MessageCircle, MessageSquare, Trophy, XCircle } from 'lucide-react'
import { api } from '../lib/api'
import toast from 'react-hot-toast'

interface Props {
  inquiry: any
  onStatus?: (id: number, status: string) => void
}

/**
 * Inline contact-action row for an inquiry.
 *
 * Each touch button does TWO things in one click:
 *   1. opens the external app (tel:, mailto:, sms:, https://wa.me/)
 *   2. POSTs to /log-contact so we increment the channel counter,
 *      bump last_contacted_at, and mirror the event to the guest's
 *      activity timeline.
 *
 * Buttons are disabled when the contact field is missing — no point
 * wasting a click on a tel: link with no number. Won/Lost are status
 * shortcuts that go through the parent's status handler so the
 * existing "auto-create reservation on Confirmed" flow still fires.
 */
export function InquiryQuickActions({ inquiry, onStatus }: Props) {
  const qc = useQueryClient()
  const phone = inquiry.guest?.phone || inquiry.guest?.mobile
  const email = inquiry.guest?.email
  const phoneDigits = phone ? phone.replace(/[^\d+]/g, '') : null
  const waDigits    = phone ? phone.replace(/[^\d+]/g, '').replace(/^\+/, '') : null

  const log = useMutation({
    mutationFn: (channel: 'call' | 'email' | 'sms' | 'whatsapp') =>
      api.post(`/v1/admin/inquiries/${inquiry.id}/log-contact`, { channel }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inquiries'] })
      qc.invalidateQueries({ queryKey: ['inquiries-today'] })
      qc.invalidateQueries({ queryKey: ['inquiries-insights'] })
    },
    onError: () => toast.error('Could not log contact'),
  })

  // Keep the click handler tight: open the external action via a
  // synthetic anchor (so popup blockers treat it as user-initiated)
  // and fire the log call in parallel.
  const openAndLog = (href: string, channel: 'call' | 'email' | 'sms' | 'whatsapp', external = false) => {
    const a = document.createElement('a')
    a.href = href
    if (external) { a.target = '_blank'; a.rel = 'noopener noreferrer' }
    document.body.appendChild(a)
    a.click()
    a.remove()
    log.mutate(channel)
  }

  const won  = inquiry.status === 'Confirmed'
  const lost = inquiry.status === 'Lost'

  const btn = 'inline-flex items-center justify-center w-7 h-7 rounded-lg border transition-all disabled:opacity-25 disabled:cursor-not-allowed'

  return (
    <div className="flex items-center gap-1">
      <button onClick={() => phoneDigits && openAndLog(`tel:${phoneDigits}`, 'call')}
        disabled={!phoneDigits}
        title={phoneDigits ? `Call · ${phone}` : 'No phone number'}
        className={`${btn} text-emerald-300 bg-emerald-500/10 border-emerald-500/25 hover:bg-emerald-500/25`}>
        <Phone size={12} />
      </button>
      <button onClick={() => email && openAndLog(`mailto:${email}`, 'email')}
        disabled={!email}
        title={email ? `Email · ${email}` : 'No email'}
        className={`${btn} text-blue-300 bg-blue-500/10 border-blue-500/25 hover:bg-blue-500/25`}>
        <Mail size={12} />
      </button>
      <button onClick={() => waDigits && openAndLog(`https://wa.me/${waDigits}`, 'whatsapp', true)}
        disabled={!waDigits}
        title={waDigits ? `WhatsApp · ${phone}` : 'No phone for WhatsApp'}
        className={`${btn} text-[#25D366] bg-[#25D366]/10 border-[#25D366]/25 hover:bg-[#25D366]/25`}>
        <MessageCircle size={12} />
      </button>
      <button onClick={() => phoneDigits && openAndLog(`sms:${phoneDigits}`, 'sms')}
        disabled={!phoneDigits}
        title={phoneDigits ? `SMS · ${phone}` : 'No phone for SMS'}
        className={`${btn} text-violet-300 bg-violet-500/10 border-violet-500/25 hover:bg-violet-500/25`}>
        <MessageSquare size={12} />
      </button>
      <div className="w-px h-4 bg-white/10 mx-1" />
      <button onClick={() => onStatus && onStatus(inquiry.id, 'Confirmed')}
        disabled={won || !onStatus}
        title={won ? 'Already Won' : 'Mark as Won (creates reservation)'}
        className={`${btn} ${won ? 'text-emerald-400 bg-emerald-500/30 border-emerald-500/50' : 'text-emerald-300 bg-emerald-500/10 border-emerald-500/25 hover:bg-emerald-500/30'}`}>
        <Trophy size={12} />
      </button>
      <button onClick={() => onStatus && onStatus(inquiry.id, 'Lost')}
        disabled={lost || !onStatus}
        title={lost ? 'Already Lost' : 'Mark as Lost'}
        className={`${btn} ${lost ? 'text-red-400 bg-red-500/30 border-red-500/50' : 'text-red-300 bg-red-500/10 border-red-500/25 hover:bg-red-500/30'}`}>
        <XCircle size={12} />
      </button>
    </div>
  )
}

/**
 * Compact "Touches" badge cluster for the table — at-a-glance summary
 * of how often this inquiry has been contacted across channels, plus
 * a relative timestamp of the most recent touch.
 */
export function InquiryTouchSummary({ inquiry }: { inquiry: any }) {
  const calls = (inquiry.phone_calls_made ?? 0) | 0
  const emails = (inquiry.emails_sent ?? 0) | 0
  const last = inquiry.last_contacted_at
  const lastRel = (() => {
    if (!last) return null
    const diff = Date.now() - new Date(last).getTime()
    if (diff < 60_000) return 'just now'
    const m = Math.floor(diff / 60_000)
    if (m < 60) return `${m}m`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h`
    const d = Math.floor(h / 24)
    return `${d}d`
  })()
  if (calls === 0 && emails === 0 && !last) {
    return <span className="text-[10px] text-gray-700">no contact</span>
  }
  return (
    <div className="flex items-center gap-2 text-[10px] text-gray-400">
      {calls > 0 && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300">
          <Phone size={9} />{calls}
        </span>
      )}
      {emails > 0 && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-300">
          <Mail size={9} />{emails}
        </span>
      )}
      {lastRel && <span className="text-gray-600">{lastRel} ago</span>}
    </div>
  )
}
