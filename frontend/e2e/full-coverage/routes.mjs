// Every screen the full-coverage run visits, from frontend/src/App.tsx and the workspace and portal route tables
// (portal/PortalApp.tsx, appointments/AppointmentsApp.tsx, content/ContentApp.tsx, loyalty/LoyaltyApp.tsx).
// A redirect route is listed by the screen it lands on (/tiers is /program?tab=tiers), and every tab a hub or
// settings page opens by `?tab=` is a screen of its own. `:id` routes name a lookup (see ids in shoot.mjs); a
// route whose lookup finds nothing is reported as skipped.
//
// group:   admin   the full admin, shot in every admin style (Glass, Classic, Clean light)
//          work    a workspace (appointments, content, loyalty), shot in its light and dark themes
//          portal  the member portal, signed in as a member, shot in the device's light and dark schemes
//          public  signed out
// SKIPPED lists the routes left out and why.

const tabs = (base, keys) => keys.map(k => ({ name: `${base.replace(/^\//, '') || 'dashboard'}-${k}`, path: `${base}?tab=${k}` }))

export const ADMIN = [
  { name: 'dashboard', path: '/' },
  { name: 'scan', path: '/scan' },
  { name: 'members', path: '/members' },
  ...tabs('/members', ['duplicates', 'segments', 'portal']),
  { name: 'member-detail', path: '/members/:member' },
  { name: 'program', path: '/program' },
  ...tabs('/program', ['benefits', 'boost-events']),
  { name: 'rewards', path: '/rewards' },
  ...tabs('/rewards', ['offers', 'referrals']),
  { name: 'campaigns', path: '/campaigns' },
  ...tabs('/campaigns', ['history']),
  { name: 'wallet-config', path: '/wallet-config' },
  { name: 'analytics', path: '/analytics' },
  ...tabs('/analytics', ['planner', 'marketing', 'chat', 'leads', 'deals', 'members', 'bookings', 'venues']),
  { name: 'ai-insights', path: '/ai' },
  { name: 'chatbot-setup', path: '/chatbot-setup' },
  ...tabs('/chatbot-setup', ['config', 'knowledge', 'widget', 'canned', 'popups', 'training', 'test']),
  { name: 'landing-pages', path: '/landing-pages' },
  { name: 'chat-inbox', path: '/chat-inbox' },
  { name: 'engagement', path: '/engagement' },
  { name: 'engagement-live', path: '/engagement/live' },
  { name: 'inbox', path: '/inbox' },
  { name: 'visitors', path: '/visitors' },
  { name: 'legacy-visitors', path: '/legacy/visitors' },
  { name: 'notification-detail', path: '/notifications/:pushCampaign' },
  { name: 'review-form', path: '/reviews/forms/:reviewForm' },
  { name: 'review-submission', path: '/reviews/submissions/:reviewSubmission' },
  { name: 'properties', path: '/properties' },
  { name: 'brands', path: '/brands' },
  { name: 'guest-detail', path: '/guests/:guest' },
  { name: 'leads', path: '/leads' },
  ...tabs('/leads', ['customers', 'companies', 'duplicates', 'lead-forms']),
  { name: 'inquiry-detail', path: '/inquiries/:inquiry' },
  { name: 'deals', path: '/deals' },
  { name: 'marketing', path: '/marketing' },
  ...tabs('/marketing', ['email-templates', 'reviews', 'content']),
  { name: 'planner', path: '/planner' },
  { name: 'venues', path: '/venues' },
  { name: 'bookings', path: '/bookings' },
  { name: 'booking-rooms', path: '/booking-rooms' },
  { name: 'booking-extras', path: '/booking-extras' },
  { name: 'calendar', path: '/calendar' },
  { name: 'bookings-calendar', path: '/bookings/calendar' },
  { name: 'bookings-payments', path: '/bookings/payments' },
  { name: 'bookings-submissions', path: '/bookings/submissions' },
  { name: 'booking-detail', path: '/bookings/:booking' },
  { name: 'services', path: '/services' },
  { name: 'service-masters', path: '/service-masters' },
  { name: 'service-extras', path: '/service-extras' },
  { name: 'service-bookings', path: '/service-bookings' },
  { name: 'service-bookings-calendar', path: '/service-bookings/calendar' },
  { name: 'billing', path: '/billing' },
  { name: 'audit-log', path: '/audit-log' },
  { name: 'system-status', path: '/system-status' },
  { name: 'settings', path: '/settings' },
  ...tabs('/settings', ['general', 'industry', 'branding', 'loyalty', 'notifications', 'integrations', 'booking', 'pipelines',
    'planner', 'menu', 'team', 'mobile_app', 'documentation', 'ai_usage', 'ai_system']),
  { name: 'account-connections', path: '/account/connections' },
]

export const WORKSPACES = [
  { name: 'appointments-calendar', path: '/appointments' },
  { name: 'appointments-clients', path: '/appointments/clients' },
  { name: 'appointments-client', path: '/appointments/clients/:appointmentsClient' },
  { name: 'appointments-setup', path: '/appointments/setup' },
  { name: 'appointments-takings', path: '/appointments/takings' },
  { name: 'appointments-insights', path: '/appointments/insights' },
  { name: 'content-plan', path: '/content' },
  { name: 'content-ideas', path: '/content/ideas' },
  { name: 'content-posts', path: '/content/posts' },
  { name: 'content-post', path: '/content/posts/:contentPost' },
  { name: 'content-promote', path: '/content/promote' },
  { name: 'content-strategy', path: '/content/strategy' },
  { name: 'content-brand', path: '/content/brand' },
  { name: 'loyalty-members', path: '/loyalty' },
  { name: 'loyalty-overview', path: '/loyalty/overview' },
  { name: 'loyalty-more', path: '/loyalty/more' },
  { name: 'loyalty-duplicates', path: '/loyalty/members/duplicates' },
  { name: 'loyalty-import', path: '/loyalty/members/import' },
  { name: 'loyalty-member', path: '/loyalty/members/:member' },
  { name: 'loyalty-requests', path: '/loyalty/requests' },
  { name: 'loyalty-program', path: '/loyalty/program' },
  { name: 'loyalty-options', path: '/loyalty/options' },
  { name: 'loyalty-options-setup', path: '/loyalty/options/setup' },
  { name: 'loyalty-settings', path: '/loyalty/settings' },
  { name: 'loyalty-rewards', path: '/loyalty/rewards' },
  { name: 'loyalty-events', path: '/loyalty/events' },
  { name: 'loyalty-event-new', path: '/loyalty/events/new' },
  { name: 'loyalty-event', path: '/loyalty/events/:loyaltyEvent' },
  { name: 'loyalty-event-edit', path: '/loyalty/events/:loyaltyEvent/edit' },
  { name: 'loyalty-campaigns', path: '/loyalty/campaigns' },
  { name: 'loyalty-campaign', path: '/loyalty/campaigns/:loyaltyCampaign' },
  { name: 'loyalty-insights', path: '/loyalty/insights' },
  { name: 'loyalty-scan', path: '/loyalty/scan' },
  { name: 'loyalty-door', path: '/loyalty/scan/door' },
  { name: 'loyalty-app', path: '/loyalty/app' },
  { name: 'loyalty-guide', path: '/loyalty/guide' },
  { name: 'loyalty-start', path: '/loyalty/start' },
]

export const PORTAL = [
  { name: 'portal-home', path: '/portal' },
  { name: 'portal-book', path: '/portal/book' },
  { name: 'portal-book-appointment', path: '/portal/book/appointment' },
  { name: 'portal-book-stay', path: '/portal/book/stay' },
  { name: 'portal-rewards', path: '/portal/rewards' },
  { name: 'portal-bookings', path: '/portal/bookings' },
  { name: 'portal-activity', path: '/portal/activity' },
  { name: 'portal-profile', path: '/portal/profile' },
  { name: 'portal-inbox', path: '/portal/inbox' },
  { name: 'portal-events', path: '/portal/events' },
  { name: 'portal-help', path: '/portal/help' },
]

export const PUBLIC = [
  { name: 'login', path: '/login' },
  { name: 'register', path: '/register' },
  { name: 'forgot-password', path: '/forgot-password' },
  { name: 'reset-password', path: '/reset-password' },
  { name: 'activate', path: '/activate' },
  { name: 'portal-join', path: '/portal/join' },
  { name: 'portal-claim', path: '/portal/claim' },
]

export const SKIPPED = [
  ['/portal/book/return', 'Stripe\'s return address after a bank redirect: needs a real PaymentIntent from Stripe'],
  ['/portal/bookings/:kind/:id', 'a member booking needs a portal stay or appointment, which takes a Stripe payment or the venue\'s Smoobu account'],
]
