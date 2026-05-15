import { Phone, Mail, MessageCircle } from 'lucide-react'

interface Props {
  email?: string | null
  phone?: string | null
  /** Optional WhatsApp number — falls back to `phone` if not given. */
  whatsapp?: string | null
  /** Compact mode renders icon-only chips for tight headers. */
  compact?: boolean
}

/**
 * Quick-action chips for reaching a contact: tel:, mailto:, sms:, wa.me/.
 *
 * The phone-derived links normalise to digits-only because tel: and the
 * WhatsApp click-to-chat URL both reject spaces, parens, and dashes — but
 * the leading + is preserved so international format works on mobile.
 *
 * Renders nothing when no contact details are available so the consumer
 * can drop it in unconditionally.
 */
export function ContactActions({ email, phone, whatsapp, compact = false }: Props) {
  const wa = whatsapp || phone
  const phoneDigits = phone ? phone.replace(/[^\d+]/g, '') : null
  const waDigits = wa ? wa.replace(/[^\d+]/g, '').replace(/^\+/, '') : null

  const items: Array<{ key: string; href: string; label: string; icon: any; tone: string; ext?: boolean }> = []
  if (email) {
    items.push({ key: 'email', href: `mailto:${email}`, label: 'Email', icon: Mail, tone: 'bg-blue-500/15 text-blue-300 border-blue-500/25 hover:bg-blue-500/25' })
  }
  if (phoneDigits) {
    items.push({ key: 'call', href: `tel:${phoneDigits}`, label: 'Call', icon: Phone, tone: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25 hover:bg-emerald-500/25' })
  }
  if (waDigits) {
    items.push({ key: 'whatsapp', href: `https://wa.me/${waDigits}`, label: 'WhatsApp', icon: MessageCircle, tone: 'bg-[#25D366]/15 text-[#25D366] border-[#25D366]/25 hover:bg-[#25D366]/25', ext: true })
  }

  if (items.length === 0) return null

  return (
    <div className={`flex flex-wrap gap-2 ${compact ? '' : 'mt-3'}`}>
      {items.map(it => {
        const Icon = it.icon
        return (
          <a key={it.key} href={it.href}
            {...(it.ext ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${it.tone}`}
            title={it.label}>
            <Icon size={12} />
            {!compact && <span>{it.label}</span>}
          </a>
        )
      })}
    </div>
  )
}
