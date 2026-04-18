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

  return (
    <div className="flex items-center gap-1 p-1 rounded-2xl w-fit"
      style={{ background: 'rgba(22,40,35,0.6)', border: '1px solid rgba(255,255,255,0.06)' }}>
      {tabs.map(tab => {
        const active = location.pathname === tab.to || location.pathname.startsWith(tab.to + '/')
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
  { to: '/bookings',          label: 'Reservations' },
  { to: '/service-bookings',  label: 'Service Bookings' },
]

export const CATALOG_TABS: Tab[] = [
  { to: '/booking-rooms', label: 'Rooms' },
  { to: '/services',      label: 'Services' },
]

export const EXTRAS_TABS: Tab[] = [
  { to: '/booking-extras', label: 'Extras' },
  { to: '/service-extras', label: 'Add-ons' },
]
