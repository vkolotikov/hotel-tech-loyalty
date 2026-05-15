import { Phone, Mail, Trophy, XCircle } from 'lucide-react'
// Phone + Mail are still used by InquiryTouchSummary below.

interface Props {
  inquiry: any
  onStatus?: (id: number, status: string) => void
}

/**
 * Won / Lost shortcuts for the inquiry row.
 *
 * Contact actions (call / email / WhatsApp / SMS) live in the Guest
 * cell's ContactActions component — we used to render them here too,
 * which duplicated the icons on every row. Keep this strictly for the
 * stage shortcuts so the row stays clean.
 */
export function InquiryQuickActions({ inquiry, onStatus }: Props) {
  const won  = inquiry.status === 'Confirmed'
  const lost = inquiry.status === 'Lost'

  const btn = 'inline-flex items-center justify-center w-7 h-7 rounded-lg border transition-all disabled:opacity-25 disabled:cursor-not-allowed'

  return (
    <div className="flex items-center gap-1">
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
