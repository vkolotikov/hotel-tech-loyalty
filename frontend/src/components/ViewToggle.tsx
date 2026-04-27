import { Link, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'

interface ViewOption {
  to: string
  label: string
  icon?: ReactNode
}

/**
 * Two- or three-way pill toggle for switching between views of the same
 * resource (e.g. List ↔ Calendar). Each option is a real <Link> so the
 * URL drives state — refreshes land you on the right view, browser back
 * works, and deep links share cleanly.
 *
 * Replaces the old BOOKINGS_TABS PairTabs which mixed *resources*
 * (Reservations vs Service Bookings) with *views* (table vs calendar)
 * into a single 4-tab control. Resources now belong in the sidebar;
 * views belong here.
 */
export function ViewToggle({ options }: { options: ViewOption[] }) {
  const location = useLocation()

  // Longest-matching-prefix wins so /bookings/calendar lights its own
  // option and not the parent /bookings entry.
  const sorted = [...options].sort((a, b) => b.to.length - a.to.length)
  const matched = sorted.find(o =>
    location.pathname === o.to || location.pathname.startsWith(o.to + '/')
  )

  return (
    <div className="flex items-center gap-1 p-1 rounded-2xl w-fit"
      style={{ background: 'rgba(22,40,35,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
      {options.map(opt => {
        const active = matched?.to === opt.to
        return (
          <Link key={opt.to} to={opt.to}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl transition-all"
            style={active ? {
              background: 'linear-gradient(135deg, #74c895, #5ab4b2)',
              color: '#fff',
              boxShadow: '0 6px 14px rgba(116,200,149,0.2)',
            } : { color: '#8e8e93' }}>
            {opt.icon}{opt.label}
          </Link>
        )
      })}
    </div>
  )
}
