import { Link, useLocation } from 'react-router-dom'

interface Tab {
  to: string
  label: string
  count?: number | null
}

/**
 * Small two-tab nav used at the top of paired pages (Reservations / Service
 * Bookings, Rooms / Services, Extras / Add-ons). Purely visual — each tab is
 * a <Link>, so routing works normally.
 */
export function PairTabs({ tabs }: { tabs: Tab[] }) {
  const location = useLocation()

  // Longest-matching-prefix wins so /bookings/calendar lights the
  // "Calendar" tab and not the parent "Reservations" tab. Ties (exact
  // match) trump prefix matches.
  const sorted = [...tabs].sort((a, b) => b.to.length - a.to.length)
  const matched = sorted.find(t =>
    location.pathname === t.to || location.pathname.startsWith(t.to + '/')
  )

  return (
    <div className="flex items-center gap-1 p-1 rounded-2xl w-fit"
      style={{ background: 'rgba(22,40,35,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
      {tabs.map(tab => {
        const active = matched?.to === tab.to
        return (
          <Link key={tab.to} to={tab.to}
            className="px-4 py-1.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-2"
            style={active ? {
              background: 'linear-gradient(135deg, #74c895, #5ab4b2)',
              color: '#fff',
              boxShadow: '0 6px 14px rgba(116,200,149,0.2)',
            } : { color: '#8e8e93' }}>
            {tab.label}
            {typeof tab.count === 'number' && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-white/[0.04]'}`}>
                {tab.count}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}

export const BOOKINGS_TABS: Tab[] = [
  { to: '/bookings',                  label: 'Reservations' },
  { to: '/bookings/calendar',         label: 'Calendar' },
  { to: '/service-bookings',          label: 'Service Bookings' },
  { to: '/service-bookings/calendar', label: 'Service Calendar' },
]

export const CATALOG_TABS: Tab[] = [
  { to: '/booking-rooms', label: 'Rooms' },
  { to: '/services',      label: 'Services' },
]

export const EXTRAS_TABS: Tab[] = [
  { to: '/booking-extras', label: 'Extras' },
  { to: '/service-extras', label: 'Add-ons' },
]

export const CAMPAIGNS_TABS: Tab[] = [
  { to: '/notifications',   label: 'Push Campaigns' },
  { to: '/email-templates', label: 'Email Templates' },
]

export const LOCATIONS_TABS: Tab[] = [
  { to: '/properties', label: 'Properties' },
  { to: '/venues',     label: 'Venues' },
]
