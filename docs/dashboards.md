# Dashboards and the full admin menu (2026-11-09)

The owner (9 Nov, with screenshots of the full admin's menu and dashboard): "we make all portals for our apps, now need
better logic for main portal, better menu structure. And I think we need to make more engaging, interesting, maybe
animated dashboard with grids to all portals, KPI, main graphs, maybe weather info, time or smth, make really powerful
dashboards."

## The full admin's menu (`frontend/src/components/Layout.tsx`, `navMenu.ts`)

- **Workspaces** is a group of its own under Overview, drawn as a launcher of tiles: HexaTech Loyalty, Appointments,
  CRM, Content and Time Planner. They used to sit one per group further down. Each tile keeps its gates (`product`,
  `feature`, `workspace`) and a `home`: the group it came from (`Members & Loyalty`, `Bookings`, `CRM & Marketing` twice,
  `Operations`). Sidebar Menu's hidden groups, a staff member's allowed groups and the industry's hidden groups are asked
  about the `home`, so every tile hides exactly where it hid before. The launcher can also be hidden whole (Settings →
  Sidebar Menu, `Workspaces`); it is not subject to a staff member's allowed groups (old lists do not name it).
- **Scan** moved to Members & Loyalty, with `home: 'Operations'`.
- **Accordion**: a group is open when the person opened it, otherwise only Overview, Workspaces and the group of the page
  one is on (`navMenu.isGroupOpen`). Choices are kept under `loyalty-nav-groups-v2` (a new key: the old one held every
  group the old auto-open had opened). A closed group shows how many pages it holds; it keeps its items in the page,
  `inert`, so it slides open.
- **Find in menu** narrows every group to the items whose label or group label holds every typed word (accents and case
  ignored); Escape or opening a page clears it.
- **One lit item**: the item whose address matches longest (`navMenu.activeItemOf`) — Payments (`/bookings/payments`) no
  longer lights Reservations (`/bookings`) as well.
- Brands (`Tags`) and Billing (`Receipt`) have icons of their own; `navMenu.test.ts` refuses two items with one icon.
- Group accents live in `theme/navAccents.ts`; `GLASS_NAV_ACCENT_TEXT` and `LIGHT_NAV_ACCENT_TEXT` are keyed by them (the
  new teal has a line in both).
- `components/visibleMenu.ts`: the menu as this person sees it (Layout provides it around every page), so the dashboard's
  Workspaces card offers exactly what the menu offers.

## The full admin's dashboard (`frontend/src/pages/Dashboard.tsx`, `pages/dashboard/*`)

A grid of widgets the person may hide and reorder (Customize; kept in this browser, `hx-dashboard-layout-v1:<user id>`;
the period under `hx-dashboard-period-v1`):

| Widget | Reads | Shown when |
|---|---|---|
| Clock & weather | `dashboard/pulse` | always |
| Live now | `dashboard/live-ops`, `dashboard/kpis` | always (chat and booking rows by product) |
| Key figures | `dashboard/kpis` (the industry's tiles), `dashboard/trends?days=7\|30\|90` | a tile per product held |
| Main chart | `dashboard/trends` | revenue / bookings (booking), points (loyalty), leads & chats |
| Pipeline | `dashboard/inquiries-by-status` | always |
| Today's schedule | `dashboard/arrivals-today`, `departures-today`, `service-bookings/calendar` | booking |
| Members & tiers | `dashboard/kpis` tiers, `birthdays-today`, `tier-up-candidates` | loyalty |
| Your workspaces | the menu's Workspaces group | the menu offers one |
| Follow-ups due | `dashboard/tasks-due` | always |
| Recent activity | `dashboard/recent-activity` | always |

- Charts are SVG of our own (`charts.tsx`): the dashboard is the first page after sign-in and stays out of recharts'
  chunk. Lines draw in, bars grow, rings sweep, figures count up (`useCountUp`); all of it stops for reduced motion.
- Colours: `theme/dashboardPalette.ts` — `ink(hue)` for text, `fill(hue, alpha)` for fills. Each hue's `hx()` call is
  written out there, so `hxColours.ts` registers it and Clean light deepens it. A new hue gets a line in both tables.
- Money reads in the venue's currency (`pulse.currency`, `PortalBootstrap::currency()`).
- Today's services are taken by the venue's day (`pulse.today`), the browser's day until the pulse arrives.

## The venue's pulse (`App\Services\Dashboard\VenuePulse`)

`GET` `admin/dashboard/pulse`, and `pulse` under `admin/appointments`, `admin/content`, `admin/loyalty`, `admin/crm` and
`admin/time` (`PulseController`; each under its area's AccessMap prefix and workspace middleware, so every workspace keeps
to its own area). Reads only:

- `timezone`, `now`, `today`: the venue's (`AppointmentClock::zoneFor()`), never the browser's.
- `currency`: `PortalBootstrap::currency()`.
- `place`: the first location (`properties`) with a city, active ones first; otherwise the city a named zone carries
  (`Europe/Riga` → Riga, `source: timezone`); UTC names no place.
- `weather`: Open-Meteo (no key; only a city's name and coordinates leave the server), in the venue's wall clock, °F and
  mph for the United States and a few others. Geocoding is kept 30 days and the forecast 20 minutes in `SharedCache`; a
  failure is remembered for 5 minutes, so a provider that is down costs one short wait. Null whenever unknown — the
  dashboards then show the clock alone. `WEATHER_ENABLED=false` switches it off; `WEATHER_FORECAST_URL` and
  `WEATHER_GEOCODING_URL` override the hosts (`config/services.php`).
- A manager sees "Add a city" (to Locations) when there is no place.

## Day-by-day figures (`App\Services\Dashboard\DashboardTrends`)

`GET admin/dashboard/trends?days=7|14|30|90` (anything else: 30): `dates` and one aligned series per measure — `revenue`
and `bookings` (bookings by the day they were made), `services` and `service_revenue` (appointments on their own day,
without cancelled and no-show ones), `members` (joined), `points_earned`, `points_redeemed` (unreversed lines), `leads`,
`chats` — with each measure's `totals` (`current`, `previous` period, `change` in %, null when the period before had
none). Under the request's tenant and brand scopes; cached five minutes per organisation, brand and period. A measure
whose table cannot be read answers null and the others stand. `tests/Feature/Dashboard` runs on SQLite and on
PostgreSQL (`scripts/test-pg.sh`), where a case checks that every measure reads.

## The workspaces (`frontend/src/workspace/pulse/PulseCard.tsx`)

One card for every workspace, in the shared frame: the venue's clock ticking in its own zone, a greeting (or not, where
the page's title already greets), the weather now, the next hours and the sun, under a sky that follows the venue's part
of the day; `variant="strip"` is one line. Each workspace reads its own `…/pulse` through its own client:

- HexaTech CRM — Today, under the setup banner (`greet={false}`).
- HexaTech Time Planner — My day, with what is up next (`greet={false}`).
- HexaTech Loyalty — Overview, under its heading.
- HexaTech Appointments — Insights, under the title (the calendar stays as it was).
- HexaTech Content — the plan, the strip under the header.

The clock and weather logic is `lib/venuePulse.ts`, the icon `components/WeatherIcon.tsx` (`weatherIcon.css`), the
ticking clock `hooks/useNow.ts` — shared by the full admin and the workspaces. The card's words are the shared frame's
own (`workspace.pulse.*`, five languages); its styles are scoped under `[data-workspace]` (`pulse.css`).

## Left open

- The industry tiles' labels (`dashboard.kpis.<key>`) have no translations in any language, as before: the same key
  carries different English per industry ("Patient enquiries" for a clinic), so one translation per key would flatten it.
- The weather could not be checked against Open-Meteo from the build container (its network refuses the host); the
  server code is tested with recorded answers. Production reaches it unless Laravel Cloud's egress refuses it, in which
  case the dashboards show the clock alone.
