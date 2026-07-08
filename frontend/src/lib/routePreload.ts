/**
 * Route chunk preloading.
 *
 * Every admin page is `React.lazy`-loaded, so the JS chunk is only fetched
 * the first time you navigate to it — and on HTTP/1.1 that request can queue
 * behind the app's polling API calls (engagement feed, realtime events, KPIs),
 * which is why a tab sometimes takes several seconds to "open" after a click.
 *
 * `preloadRoute(path)` starts that fetch EARLY — on sidebar hover / focus /
 * pointer-down — so by the time the click commits the chunk is already in
 * flight or cached. Calling `import('…')` here warms the exact same chunk the
 * `lazy(() => import('…'))` render path uses (the module registry dedupes by
 * resolved module, so pointing at the same file from a different folder is
 * fine), so there's no double-fetch.
 *
 * For the multi-tab CRM/loyalty hubs we warm BOTH the hub shell chunk AND the
 * most-likely first content chunk (e.g. `/leads` → LeadsHub + Inquiries), so
 * the common "open Leads, click Leads & Inquiries" flow no longer waterfalls
 * two sequential downloads. Missing paths are a no-op — preloading is purely
 * best-effort and never throws.
 */

type Importer = () => Promise<unknown>

const ROUTE_CHUNKS: Record<string, Importer[]> = {
  '/analytics':         [() => import('../pages/Analytics')],
  '/ai':                [() => import('../pages/AiInsights')],
  '/engagement':        [() => import('../pages/Engagement')],
  '/chatbot-setup':     [() => import('../pages/ChatbotSetup')],
  '/members':           [() => import('../pages/hubs/MembersHub'), () => import('../pages/Members')],
  '/program':           [() => import('../pages/hubs/ProgramHub'), () => import('../pages/Tiers')],
  '/rewards':           [() => import('../pages/hubs/RewardsHub'), () => import('../pages/Rewards')],
  '/campaigns':         [() => import('../pages/hubs/CampaignsHub'), () => import('../pages/EmailCampaigns')],
  '/bookings':          [() => import('../pages/Bookings')],
  '/service-bookings':  [() => import('../pages/ServiceBookings')],
  '/booking-rooms':     [() => import('../pages/BookingRooms')],
  '/service-masters':   [() => import('../pages/ServiceMasters')],
  '/booking-extras':    [() => import('../pages/BookingExtras')],
  '/bookings/payments': [() => import('../pages/BookingPayments')],
  '/leads':             [() => import('../pages/hubs/LeadsHub'), () => import('../pages/Inquiries')],
  '/deals':             [() => import('../pages/hubs/DealsHub'), () => import('../pages/Deals')],
  '/marketing':         [() => import('../pages/hubs/MarketingHub'), () => import('../pages/Notifications')],
  '/planner':           [() => import('../pages/Planner')],
  '/brands':            [() => import('../pages/Brands')],
  '/properties':        [() => import('../pages/Properties')],
  '/scan':              [() => import('../pages/Scan')],
  '/billing':           [() => import('../pages/Billing')],
  '/audit-log':         [() => import('../pages/AuditLog')],
  '/settings':          [() => import('../pages/Settings')],
}

const warmed = new Set<string>()

/** Warm the chunk(s) for a route. Idempotent + best-effort. */
export function preloadRoute(path: string): void {
  if (!path || warmed.has(path)) return
  const importers = ROUTE_CHUNKS[path]
  if (!importers) return
  warmed.add(path)
  for (const load of importers) {
    try { load() } catch { /* preload is best-effort — never break navigation */ }
  }
}
