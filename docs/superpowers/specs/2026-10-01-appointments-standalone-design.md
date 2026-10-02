# HexaTech Appointments — Part C: sell it on its own

Status: design approved by the owner in conversation on 2026-10-01 (three sections, each "Looks right"). This
document was approved on 2026-10-02 ("approved, proceed") and corrected by planning rulings R1 and R2 in
`docs/superpowers/plans/2026-10-02-appointments-standalone.md`. Part C of the owner's roadmap (A one clock — live as main `0a5665585`;
B Setup in the workspace — live as main `3dcd6a6a4`; C this; D client messages; E money at the desk;
F calendar power; G insights).

## 1. Goal

HexaTech Appointments can be sold as its own, cheaper plan. A customer on that plan gets the appointments
workspace and the public booking page, and nothing else: no full admin, no loyalty, CRM or chat screens, and no
API behind them. Their staff sign in straight to the workspace. Customers on the existing plans keep everything
they have.

To sell it safely, the server has to say no where today only the menu does. So this part also gives every
organisation one written rule for who may call which admin endpoint, taken from the menu that already exists.

Success looks like this:

- A venue on the Appointments plan signs in, lands in the workspace, and cannot reach a single full-admin screen
  or endpoint, even by typing the address.
- On every plan, a staff member who is not a manager cannot do through the API what the menu does not show them.
- A deactivated team member is refused.
- Nobody on an existing plan notices a difference on the day this ships.

## 2. Owner decisions (2026-10-01)

1. **What "on its own" means.** It is a separate, cheaper plan. Those customers get only the workspace, and their
   staff sign in to it. Existing plans keep everything.
2. **What the plan holds.** The workspace (calendar, clients, Setup) plus the online booking page. It has no
   loyalty and no billing self-service.
3. **How it is switched on.** A billing product decides it, and an operator can override that per organisation.
4. **Roles, for every organisation.** The server mirrors the menu's manager-only pages.
5. **Approach.** One access map and one middleware.
6. **Rollout.** The appointments-only lock is enforced from the first day. The role and deactivation rules start
   in report mode: they record what they would refuse and let the call through. A Cloud setting turns them on
   after about a week of evidence.

## 3. What exists (verified on feature/appointments-workspace at `1f48ad1c5`, the source live as main `3dcd6a6a4`)

- **Admin routes.** `/v1/admin/*` has 610 routes in 86 areas (the first path segment after `admin/`). All of
  them run `Route::prefix('admin')->middleware(['admin', 'check.subscription'])` inside the authenticated group
  (`saas.auth, auth:sanctum, tenant, brand`).
  - `AdminMiddleware` checks only `user_type === 'staff'`. A role is checked only where a route names one:
    `admin:super_admin` on `diag`.
  - Its role lookup is `Staff::withoutGlobalScopes()->where('user_id')->first()`, which is not tenant-scoped.
- **Manager-only pages are guarded in the browser only.** The full admin hides them through `canAccess(gate,
  staff)`, where gate `admin` means owner or manager. The server answers any staff member, so a receptionist's
  token can invite team members, change settings, create API tokens or edit services.
- **Deactivation.** `PATCH admin/team/{id}/deactivate` sets `staff.is_active = false`, and nothing reads it except
  Part B's `SetupAccess`. Sign-in stays open, tokens stay valid, and every endpoint still answers.
- **Capabilities.** `staff.can:<capability>` (RequireStaffCapability) guards:
  - analytics (31 GET);
  - offer and reward changes (`can_manage_offers`);
  - member discounts at the desk (`can_redeem_points`);
  - the reporting key (`can_view_analytics`).

  The Reports page's 5 GET routes (`admin/reporting/*`) check nothing, although the menu shows Reports only with
  `can_view_analytics`. Points award and redeem are checked inside `MemberAdminController`.
- **Role names.**
  - The Team screen sets `super_admin`, `manager` or `staff`.
  - SaaS sign-in maps OWNER → `super_admin`, ADMIN → `manager` and anything else → `receptionist`, and
    reconciles the role on every sign-in.
  - "Manager" in this document means `super_admin` or `manager`, as in `SetupAccess::MANAGER_ROLES`.
- **Products.**
  - Billing (a separate application) sends `entitled_product_slugs`. These are cached as
    `organizations.entitled_products` (today `crm`, `loyalty`, `booking`, `chat`) and `plan_slug`, refreshed by
    `SaasAuthMiddleware` every 5 minutes and at once by the `internal/entitlements/bust` webhook.
  - `Organization::hasProduct()` is used only by the frontend's `GatedRoute product=`. No server check reads it.
  - When billing cannot be reached, `AuthController::getPlanProducts()` falls back to: starter → crm, loyalty;
    growth and enterprise → crm, loyalty, booking, chat.
  - The sign-up page lists the plans billing returns (`GET /v1/plans` proxies `billing/plans`).
- **Staff routes outside `/admin`:**
  - `POST auth/billing/{checkout,activate,portal,refresh,start-trial}`;
  - `POST auth/apply-industry`, which changes the organisation's industry and its presets;
  - `POST integrations/leads` (leads sent with an API token; `auth:sanctum` and `tenant` only);
  - `POST mcp` (the ChatGPT and Claude connector, behind its own plugin token);
  - `GET auth/subscription` and `GET auth/me`, which every screen reads.

  `POST chatbot/message` is authenticated but is not called by the staff admin.
- **Loyalty switch.** `PortalBootstrap::loyaltyOn($orgId)` is true when the organisation has an active tier and
  an industry with loyalty. It gates:
  - the member portal;
  - points for completed visits (`BookingPointsService`);
  - member pricing;
  - the workspace's loyalty card and Setup's "Points for completed visits" switch (`programme_on`).

  Separately, `Guest::created` calls `GuestMemberLinkService::ensureMemberForGuest()`, which makes every new guest
  with an email a member. The public services widget and the workspace's new-client form both create guests.
- **Workspace.**
  - The workspace calls only `/v1/admin/appointments/*` (`tokens.test.ts` refuses any other path in that folder).
  - It links to the full admin in four places: the shell's "Full admin" item (sidebar and phone menu), the
    "Open the full admin" button under a refusal notice, and the service editor's "edited in the full admin" note.
  - Its lapsed-subscription notice says an administrator can restore access "under Billing in the full admin".
- **Workspace settings.**
  - `Organization::workspace('appointments')` reads `settings.workspaces.appointments` (`enabled`, `landing`,
    defaulting to enabled).
  - `setWorkspace()` rewrites that row with exactly those two keys.
  - The sign-in answer and `/auth/me` carry `workspaces.appointments` (`landing`, `has_services`).

## 4. Architecture

```
request ─> saas.auth, auth:sanctum, tenant, brand ─> admin ─> admin.access ─> check.subscription ─> (route's own
                                                               │              middleware: staff.can, feature,
                                                               │              workspace, admin:role …)
                                                               ▼
                                     AccessMap (one PHP class: area → read rule, change rule, product)
                                                               │
                                     Organization::appointmentsOnly()   AccessRecorder → admin_access_refusals
```

New units:

| Unit | Responsibility |
|---|---|
| `App\Support\AdminAccess\AccessMap` | The map as a class constant, and `ruleFor(Route): Rule` (longest matching key; a fixed manager-only rule when none matches). |
| `App\Http\Middleware\AdminAccess` (alias `admin.access`) | Decides each call in the order of §5.3. Answers 403, or passes, by mode. |
| `App\Support\AdminAccess\AccessRecorder` | Upserts one row per day, person, rule, method and reason. It never throws into the request. |
| `config/admin_access.php` | `mode` from `ADMIN_ACCESS_MODE` (`report` by default, or `enforce`). |
| `admin_access_refusals` table | The evidence for switching to enforce. Additive migration; this is the only one in Part C. |
| `php artisan admin-access:report` | Summarises that table. |
| `Organization::appointmentsOnly()`, `appointmentsOnlySource()` | Whether an organisation is on the Appointments plan, and who decided it. |

Changed units:

- `routes/api.php`: the admin group gains `admin.access`, as do the four outside routes in §5.5.
- `PortalBootstrap::loyaltyOn()` and `GuestMemberLinkService::ensureMemberForGuest()`.
- The member sign-up path.
- `Organization::workspace()`, `setWorkspace()` and `workspacesPayload()`.
- The `workspace:appointments` command.
- `AuthController::getPlanProducts()`.
- Frontend: `appointments/lib/landing.ts`, `App.tsx` route guards, `AppointmentsShell`, `ServiceEditor`, the shared
  API client and the login page's notice, plus copy in five locales.

## 5. C1: the access map (every organisation)

### 5.1 Rules

Each map entry has three parts: a **read** rule (GET and HEAD), a **change** rule (every other method), and a
**product**. A rule is one of three values:

- `staff`: any active staff member of this organisation;
- `manager`: an active staff member whose role is `super_admin` or `manager`;
- a capability name (`can_view_analytics`, `can_manage_offers`): a manager, or a staff member whose flag is set.
  This matches the menu, which shows these pages to managers and to flagged staff.

The product is `appointments`, `account` (the caller's own profile and device), or one of the full-admin products:
`admin`, `booking`, `loyalty`, `crm` or `chat`. In this part, products matter only for appointments-only
organisations (§6). The finer full-admin labels are recorded for the future and enforce nothing for the existing
plans.

`account` holds three areas: `admin/me`, `admin/push-token` and `admin/branding`. `admin/branding` is the
read-only theme that the app reads on every page, the workspace included (planning ruling R1). In conversation the
list also named `notifications` and `realtime`. Reading the routes showed that the first sends a push campaign and
the second is the full admin's live poll, so neither belongs to the caller.

### 5.2 Matching

Keys are route URI templates relative to `api/v1/`, such as `admin/services`. They match on whole path segments
against the route's template (`admin/services/{service}`), never against the request path, so ids never matter.
The longest matching key wins, so an override can be one sub-path.

A route that matches no key gets a fixed rule: manager to read, manager to change, product `admin`. Its refusals
are recorded with the rule `unmapped:<uri>`. The completeness test (§9) keeps this from happening in practice.

### 5.3 Decision order

In the admin group, `admin.access` runs after `admin` (the caller is staff) and before `check.subscription`. That
way a lapsed appointments-only workspace still reaches its own `subscription_required` notice. On the four routes
outside `/admin`, it runs after their authentication and `tenant`.

1. A platform admin (`User::isPlatformAdmin()`) passes. This is the same operator escape hatch that
   `RequireStaffCapability` and `RequireFeature` use.
2. The rule for the route is found.
3. **Plan.** If the organisation is appointments-only and the rule's product is not `appointments` or `account`,
   the call gets 403 `not_in_plan`. This step is enforced in both modes.
4. **Active staff.** The caller needs a staff row in this organisation with `is_active = true`. The lookup is
   tenant-scoped: `Staff::where('user_id', …)` under the bound organisation, the same as
   `SetupAccess::activeStaff()`. Otherwise the result is `staff_inactive`.
5. **Role.** The read or change rule must be met. Otherwise the result is `not_allowed`.

Steps 4 and 5 depend on the mode:

- In **report** mode they record the refusal and let the call through.
- In **enforce** mode they record it and answer 403.

Answers use the codebase's error shape:

| Code | Body |
|---|---|
| `not_in_plan` | `{"error":"not_in_plan","message":"This is not part of your organisation's HexaTech plan."}` |
| `staff_inactive` | `{"error":"staff_inactive","message":"Your access to this organisation has been switched off. Ask an owner or a manager."}` |
| `not_allowed` | `{"error":"not_allowed","message":"Only an owner or a manager can do this."}` (for a capability rule: `"Your account does not have permission for this."`) |

The route's own middleware is unchanged and still runs after `admin.access`: `staff.can:*`, `feature:*`,
`workspace:appointments` and `admin:super_admin`. So do the controllers' own checks: points capabilities and
Part B's `SetupAccess`.

### 5.4 Report mode, the record and the report

- `config('admin_access.mode')` reads `ADMIN_ACCESS_MODE`. `enforce` enforces; any other value or none means
  report.
- **The record.** `AccessRecorder` keeps one row per (day, organization_id, user_id, rule, method, reason) in
  `admin_access_refusals`. The columns are `role`, `enforced` (bool), `hits`, `first_seen_at` and
  `last_seen_at`. A repeat call increments `hits`.
  - It stores no request body, query or response.
  - A failure to record is logged as a warning and never changes the answer.
  - `not_in_plan` refusals are recorded too, with `enforced = true`.
- **The report.** `php artisan admin-access:report {--days=7} {--org=}` prints the current mode, then one line per
  rule and method: reason, hits, number of people, number of organisations, and last seen. It also gives totals
  that separate "would refuse" from "refused".

### 5.5 The map

**First cut.** Manager where the menu's page is manager-only. Changes are manager-only there; reads are
manager-only only for sensitive data, because other screens read the catalogues. Route counts are from
`route:list`.

| Area | Routes (read / change) | Read | Change | Product | Why |
|---|---|---|---|---|---|
| `admin/appointments` | 7 / 14 | staff | staff | appointments | The workspace; Setup keeps its own manager rule (SetupAccess) |
| `admin/me` | 1 / 1 | staff | staff | account | The caller's own profile |
| `admin/push-token` | 0 / 1 | staff | staff | account | The caller's own device |
| `admin/ai-usage` | 3 / 0 | manager | manager | admin | AI usage and cost (Settings, manager) |
| `admin/analytics` | 31 / 0 | can_view_analytics | can_view_analytics | admin | Analytics (menu: can_view_analytics; the routes check it too) |
| `admin/api-tokens` | 1 / 2 | manager | manager | admin | API tokens (Settings, manager) |
| `admin/audit-logs` | 3 / 0 | manager | manager | admin | Audit log (menu: manager) |
| `admin/branding` | 1 / 0 | staff | manager | account | Theme every page reads, the workspace included (ruling R1) |
| `admin/brands` | 3 / 4 | staff | manager | admin | Brands (menu: manager); the brand switcher reads them |
| `admin/business-reporting-key` | 0 / 1 | can_view_analytics | can_view_analytics | admin | Reporting key (the route checks can_view_analytics) |
| `admin/content-planner` | 10 / 26 | staff | staff | admin | Content planner (menu: everyone) |
| `admin/dashboard` | 20 / 0 | staff | staff | admin | Dashboard (menu: everyone) |
| `admin/diag` | 1 / 0 | manager | manager | admin | Operator diagnostics (route already needs super_admin) |
| `admin/documentation` | 2 / 0 | staff | staff | admin | Help pages |
| `admin/industry-presets` | 1 / 1 | staff | manager | admin | Industry presets (Pipelines admin) |
| `admin/integrations` | 2 / 8 | manager | manager | admin | Integrations and their secrets (Settings, manager) |
| `admin/landing-pages` | 3 / 12 | staff | manager | admin | Landing page (menu: manager) |
| `admin/planner` | 7 / 20 | staff | staff | admin | Planner (menu: everyone) |
| `admin/planner-presets` | 1 / 1 | staff | manager | admin | Planner presets (Settings, manager) |
| `admin/realtime` | 1 / 0 | staff | staff | admin | The full admin's live poll |
| `admin/reporting` | 5 / 0 | can_view_analytics | can_view_analytics | admin | Reports (menu: can_view_analytics; the routes do not check it today) |
| `admin/reviews` | 12 / 14 | staff | manager | admin | Reviews (menu: manager); asking for a review is overridden below |
| `admin/search` | 1 / 0 | staff | staff | admin | Global search |
| `admin/settings` | 2 / 3 | staff | manager | admin | Settings (menu: manager); screens read display settings, secrets are masked |
| `admin/setup` | 1 / 1 | staff | staff | admin | First-run wizard, shown to any staff member until it is done (final review) |
| `admin/team` | 1 / 5 | staff | manager | admin | Team (Settings, manager); the Planner lists team members for everyone |
| `admin/booking-extras` | 2 / 3 | staff | manager | booking | Room extras (menu: manager) |
| `admin/booking-rooms` | 2 / 6 | staff | manager | booking | Rooms (menu: manager); booking screens read them |
| `admin/bookings` | 8 / 10 | staff | staff | booking | Room bookings (menu: everyone); submissions overridden below |
| `admin/properties` | 3 / 5 | staff | manager | booking | Properties (menu: manager) |
| `admin/reservations` | 3 / 5 | staff | staff | booking | Reservations |
| `admin/service-bookings` | 7 / 5 | staff | staff | booking | Service bookings (menu: everyone) |
| `admin/service-categories` | 2 / 4 | staff | manager | booking | Service categories (Services page) |
| `admin/service-extras` | 2 / 3 | staff | manager | booking | Service extras (menu: manager) |
| `admin/service-masters` | 2 / 5 | staff | manager | booking | Team members who perform services (menu: manager) |
| `admin/services` | 2 / 5 | staff | manager | booking | Services (menu: manager); booking forms read them |
| `admin/venues` | 3 / 6 | staff | manager | booking | Venues (menu: manager) |
| `admin/benefits` | 1 / 4 | staff | manager | loyalty | Benefits (Program, manager) |
| `admin/campaigns` | 2 / 2 | staff | manager | loyalty | Campaigns (menu: manager) |
| `admin/discounts` | 1 / 2 | staff | staff | loyalty | Member discounts at the desk: routes already need can_redeem_points |
| `admin/earn-rate-events` | 2 / 3 | staff | manager | loyalty | Earn-rate events (Program, manager) |
| `admin/entitlements` | 1 / 1 | staff | staff | loyalty | Members' benefit entitlements, used at the desk |
| `admin/loyalty-presets` | 1 / 2 | staff | staff | loyalty | Members onboarding wizard, shown to every staff member on Members (final review) |
| `admin/member-portal` | 1 / 0 | staff | staff | loyalty | Member portal tab of Members (read only) |
| `admin/members` | 9 / 11 | staff | staff | loyalty | Members (menu: everyone); points routes keep their capabilities |
| `admin/nfc` | 0 / 2 | staff | staff | loyalty | NFC |
| `admin/nfc-cards` | 0 / 1 | staff | staff | loyalty | NFC cards |
| `admin/notifications` | 0 / 1 | staff | manager | loyalty | Sends a push campaign (Campaigns, manager) |
| `admin/offers` | 2 / 4 | staff | can_manage_offers | loyalty | Offers (changes: the routes check can_manage_offers) |
| `admin/points` | 0 / 3 | staff | staff | loyalty | Points: the controller checks can_award_points / can_redeem_points |
| `admin/referrals` | 2 / 0 | staff | staff | loyalty | Referrals |
| `admin/rewards` | 3 / 6 | staff | can_manage_offers | loyalty | Rewards (changes: the routes check can_manage_offers) |
| `admin/scan` | 0 / 2 | staff | staff | loyalty | Scan (menu: everyone) |
| `admin/segments` | 2 / 5 | staff | staff | loyalty | Segments tab of Members (menu: everyone) |
| `admin/tier-benefits` | 0 / 2 | staff | manager | loyalty | Tier benefits (Program, manager) |
| `admin/tiers` | 2 / 3 | staff | manager | loyalty | Tiers (Program, manager) |
| `admin/wallet-config` | 1 / 4 | manager | manager | loyalty | Wallet passes and certificates (menu: manager) |
| `admin/corporate-accounts` | 2 / 3 | staff | staff | crm | Corporate accounts |
| `admin/crm-ai` | 1 / 8 | staff | staff | crm | CRM AI helpers |
| `admin/crm-settings` | 1 / 1 | staff | staff | crm | Everyone saves column choices on Leads and Deals here |
| `admin/custom-fields` | 2 / 5 | staff | manager | crm | Custom fields (Pipelines admin) |
| `admin/deals` | 3 / 2 | staff | staff | crm | Deals (menu: everyone) |
| `admin/email-campaigns` | 3 / 8 | staff | manager | crm | Email campaigns (Marketing, manager) |
| `admin/email-templates` | 4 / 4 | staff | manager | crm | Email templates (Marketing, manager); sending one is overridden below |
| `admin/guests` | 11 / 13 | staff | staff | crm | Guests and clients |
| `admin/inquiries` | 10 / 14 | staff | staff | crm | Leads (menu: everyone) |
| `admin/inquiry-lost-reasons` | 1 / 3 | staff | manager | crm | Lost reasons (Pipelines admin) |
| `admin/inquiry-lost-reasons-admin` | 1 / 0 | manager | manager | crm | Lost reasons admin list (Pipelines admin) |
| `admin/lead-forms` | 3 / 4 | staff | staff | crm | Lead forms tab of Leads, a page for everyone (final review) |
| `admin/pipeline-stages` | 0 / 2 | staff | manager | crm | Pipeline stages (Pipelines admin) |
| `admin/pipelines` | 1 / 6 | staff | manager | crm | Pipelines (Pipelines admin) |
| `admin/saved-views` | 1 / 3 | staff | staff | crm | A person's saved views |
| `admin/tasks` | 1 / 5 | staff | staff | crm | Tasks |
| `admin/visitors` | 2 / 2 | staff | staff | crm | Visitors |
| `admin/chat-inbox` | 5 / 10 | staff | staff | chat | Chat inbox |
| `admin/chat-inbox-agents` | 1 / 0 | staff | staff | chat | Chat agents |
| `admin/chat-inbox-canned` | 1 / 1 | staff | manager | chat | Canned replies |
| `admin/chatbot` | 1 / 0 | staff | staff | chat | Chatbot analytics (read only) |
| `admin/chatbot-config` | 2 / 5 | staff | manager | chat | Chatbot setup (menu: manager) |
| `admin/chatbot-onboarding` | 1 / 2 | manager | manager | chat | Chatbot onboarding (Chatbot setup, manager) |
| `admin/engagement` | 4 / 1 | staff | staff | chat | Engagement (menu: everyone) |
| `admin/knowledge` | 3 / 11 | staff | manager | chat | Chatbot knowledge |
| `admin/popup-rules` | 1 / 3 | staff | manager | chat | Pop-up rules |
| `admin/training` | 3 / 3 | staff | manager | chat | Chatbot training |
| `admin/voice-agent` | 1 / 1 | staff | manager | chat | Voice agent |
| `admin/widget-config` | 2 / 3 | staff | manager | chat | Widget config |

**Overrides.** These are longer keys, used where a page for everyone calls a sub-path of a manager area, or the
reverse. Each one was found by reading the frontend's calls.

| Key | Read | Change | Product | Why |
|---|---|---|---|---|
| `admin/bookings/submissions` | manager | manager | booking | Website booking submissions (menu: manager) |
| `admin/email-templates/{template}/send` | staff | staff | crm | "Send template" on member and lead pages (pages for everyone) |
| `admin/reviews/invitations` | staff | staff | admin | "Ask for a review" on booking, guest and member pages (pages for everyone) |

**Outside `/admin`.** These four routes gain `admin.access` too.

| Key | Routes | Read | Change | Product | Why |
|---|---|---|---|---|---|
| `auth/billing` | 0 / 5 | manager | manager | admin | Checkout, activation, Stripe portal, refresh, trial (Billing, manager) |
| `auth/apply-industry` | 0 / 1 | manager | manager | admin | Changes the organisation's industry and presets (Settings, manager) |
| `integrations/leads` | 0 / 1 | staff | staff | crm | Leads sent with an API token |
| `mcp` | 0 / 1 | staff | staff | admin | The ChatGPT / Claude connector; its tools keep their own checks |

Not mapped, and left as they are:

- `GET auth/me`, `GET auth/subscription`, `POST auth/push-token` and `DELETE auth/logout` (every screen needs them);
- `auth/plugin-connections` (the caller's own connector sign-ins);
- `POST chatbot/message` (not a staff-admin call; members may use it).

### 5.6 Frontend (every organisation)

- Menus already hide manager pages, so nothing changes there.
- In enforce mode, the shared API client answers a 403 `staff_inactive` by signing out. The login page then says:
  "Your access to this organisation has been switched off. Ask an owner or a manager to turn it back on."
  (`common.json`, five locales).
- Every other refusal reaches the page that made the call, as any 403 does today.

## 6. C2: appointments-only organisations

### 6.1 Who is appointments-only

`Organization::appointmentsOnly()` decides in this order:

1. **Operator mark.** If `settings.workspaces.appointments.only` is set to true or false, that value decides.
2. **Billing.** Otherwise, if `entitled_products` is not empty, the organisation is appointments-only when the list
   contains `appointments` and nothing outside `{appointments, booking}`. A customer who has `appointments` along
   with `crm` or `loyalty` is a full customer.
3. **Fallback.** If `entitled_products` is empty (billing could not be reached, or the organisation is legacy),
   it is appointments-only when `plan_slug === 'appointments'`.

`appointmentsOnlySource()` returns `operator`, `plan` or null for the command's status lines.

No existing organisation has the `appointments` product or plan slug, so none changes.

### 6.2 What changes for them

- **The workspace is always on and is where they land.** `workspace('appointments')` reports `enabled` and
  `landing` as true whatever the stored row says. `--off` is refused while the organisation is appointments-only
  (§6.4).
- **The rest of the admin API refuses them.** Every route whose rule product is not `appointments` or `account`
  answers 403 `not_in_plan`. This includes billing self-service, industry changes, API-token lead intake and the
  connector (§5.5).
- **The public booking page, the services widget and the chat widget are unchanged.** That includes their
  confirmation emails.
- **Loyalty is off, whatever tiers exist.**
  - `PortalBootstrap::loyaltyOn()` returns false for an appointments-only organisation. As a result:
    - no member portal;
    - no points for completed visits;
    - no member pricing;
    - no loyalty card in the workspace;
    - no "Points for completed visits" switch in Setup.

    Each of these already follows `loyaltyOn`.
  - `ensureMemberForGuest()` returns null for them, so a new client or a widget booking creates a guest and no
    member, and no membership-welcome email is sent.
  - Member sign-up for the organisation (`POST auth/register`, which the portal's join page uses) answers the
    422 that an organisation without a programme gets today: "Loyalty program is not configured…".
- **The sign-in answer and `/auth/me`** carry `workspaces.appointments.only: true`. It is `false` for everyone
  else, and the key is always present when the workspace entry is.
- **Browser behaviour.**
  - `isAppointmentsOnly(user)` sends every path outside `/appointments` to `/appointments`: the landing after
    sign-in, `safeRedirect` targets, and the full admin's guarded routes (`ProtectedRoute` and `FullscreenRoute`
    redirect before the full admin's setup check runs).
  - A session that signed in before its organisation became appointments-only is moved too (planning ruling R2).
    The SPA never re-reads `/auth/me`, so the shared API client answers a 403 `not_in_plan` outside
    `/appointments`: it marks the stored user appointments-only and opens `/appointments`.
  - The workspace drops its four links to the full admin.
  - The lapsed-subscription notice reads: "Your organisation's subscription is not active, so the workspace
    cannot open. Your bookings are unchanged. Contact HexaTech to restore it." There is no button.
  - These strings are in five locales.

### 6.3 What does not change for them

Signup provisioning stays as it is. It may still seed industry presets: tiers, chatbot and pipelines. These stay
dormant, because nothing they could reach reads them.

### 6.4 The operator's override

`php artisan workspace:appointments <org>` gains:

- `--only`: marks the organisation appointments-only.
- `--not-only`: marks it a full customer whatever billing says.
- `--plan-decides`: removes the mark, so billing decides again.

Before it changes anything, `--only` prints what will stop:

- the active loyalty members who lose the portal and points;
- whether a loyalty programme is on;
- the staff accounts who lose the full admin.

It then asks for confirmation; `--force` skips the question.

`--off` refuses while the organisation is appointments-only and names `--not-only`. `--status` and `--list` show
`only` and its source.

`setWorkspace()` keeps the `only` key when it rewrites the row. `workspaceIsException()` counts a set `only` as an
exception.

## 7. C3: billing handover and rollout

### 7.1 Billing handover (the owner, in the billing application)

- A product with slug `appointments`.
- A plan "Appointments" (slug `appointments`) with products `[appointments, booking]`. The owner sets its price,
  trial and limits (`max_team_members` and the rest) in billing.
- The sign-up page shows the plan as soon as billing lists it, because the page reads billing's plan list.
- Moving an existing customer onto this plan in billing closes their full admin and stops their loyalty on the next
  entitlement sync: within 5 minutes, or at once through the bust webhook. Billing is where that move should be
  warned about; this repository does not add a warning of its own.

This repository's part:

- `getPlanProducts('appointments')` returns `['appointments', 'booking']` for when billing cannot be reached.
- `getTrialFeatures()` keeps its starter default for the new slug.
- `billingStartTrial` keeps its three plans. An appointments-only organisation cannot call it (`not_in_plan`).

### 7.2 Rollout

1. **Deploy** with `ADMIN_ACCESS_MODE` unset, which means report mode.
   - From then on every decision is made and recorded.
   - Only `not_in_plan` refuses, and it affects nobody until an organisation is appointments-only.
2. **Billing.** The owner adds the product and plan. An operator may mark a pilot organisation with `--only` before
   that.
3. **After about a week, run `php artisan admin-access:report --days=7` on Cloud.**
   - Every "would refuse" line that a real page needs becomes a map fix, each with its test, and ships before
     enforcement.
   - The owner then sets `ADMIN_ACCESS_MODE=enforce` in Laravel Cloud.
   - Setting `report` again, or removing the variable, undoes it.

## 8. Edge cases

| Case | Behaviour |
|---|---|
| Someone signs in, then is deactivated | Report mode records `staff_inactive` and passes. Enforce mode refuses every mapped call and the SPA signs them out. Sign-in itself is unchanged. |
| A user with staff rows in two organisations | Only the row in the bound organisation counts. A manager in one is not a manager in the other, and a missing row reads as `staff_inactive`. |
| A member's token calls a mapped outside route (`integrations/leads`) | No staff row, so `staff_inactive` (refused in enforce mode). |
| A platform admin acting for a tenant | Passes every step, including `not_in_plan`. |
| A route added later with no map key | Manager-only and recorded as `unmapped:<uri>`. The completeness test fails the build first. |
| An appointments-only organisation's subscription lapses | `admin.access` passes the workspace's calls. `check.subscription` answers `subscription_required`, and the notice says "Contact HexaTech". |
| Billing sends an empty product list for an Appointments-plan customer | `plan_slug` decides (§6.1). If both are empty, the organisation is treated as a full customer. The operator mark (`--only`) covers that gap. |
| `--only` on an organisation with loyalty members | The command lists them and asks first. After it runs, their portal shows what it shows today when an organisation has no programme. |
| Recording fails (database error) | A warning is logged. The answer is decided as if the record had been written. |

## 9. Testing

Backend (PHPUnit, sqlite, scoped runs as CLAUDE.md requires):

- **Completeness.**
  - Every route under `api/v1/admin/` carries `admin.access`.
  - Every route carrying `admin.access` matches a map key.
  - Every map key matches at least one route.
  - Every rule value is `staff`, `manager` or a capability `RequireStaffCapability` knows.
  - Every product is a known one.
- **Role matrix, in enforce mode,** for super_admin, manager, staff, receptionist, an inactive manager, a user whose
  only staff row is in another organisation, and a platform admin. Samples:
  - a manager change: `PUT admin/settings`, `POST admin/team/invite`;
  - a manager read: `GET admin/audit-logs`;
  - a staff change: `POST admin/guests`;
  - each override: `GET admin/bookings/submissions`, `POST admin/email-templates/{template}/send`,
    `POST admin/reviews/invitations`;
  - a capability read: `GET admin/reporting/forecast`, with the flag on and off;
  - `POST auth/billing/checkout`;
  - `POST integrations/leads` with a member token.
- **Report mode.** The same calls pass, and each writes or increments one row with the right rule, method, reason
  and `enforced = false`. No body is stored. An unmapped route's refusal is recorded as `unmapped:…`.
- **Appointments-only.**
  - Products `[appointments, booking]` give `admin/appointments/bootstrap` 200 and `admin/members` 403
    `not_in_plan`, in both modes.
  - The same organisation is refused `auth/billing/checkout`, `auth/apply-industry`, `integrations/leads` and `mcp`.
  - These are full customers: `[crm, loyalty, booking, chat]`, `[appointments, crm]`, and `[]` with plan `growth`.
  - `[]` with plan `appointments` is appointments-only.
  - The operator marks `--only`, `--not-only` and `--plan-decides` each decide over billing.
  - `--off` is refused while appointments-only.
- **Loyalty off.**
  - `loyaltyOn` is false with an active tier present.
  - A public service booking creates a guest and no member.
  - The workspace's new client creates no member.
  - Member sign-up answers 422.
  - The points preview gives `programme_off`.
- **Payload.** The sign-in answer and `/auth/me` carry `only: true`, with `enabled` and `landing` true even when the
  stored row says off. A full customer carries `only: false`.
- **Commands.** `--only` prints the counts and stops without confirmation unless `--force` is given. `--status`
  names the source. `admin-access:report` prints the mode and the summary lines.
- **Fallback.** `getPlanProducts('appointments')`.

Frontend (Vitest, static render):

- `landing.test.ts`: an appointments-only user goes to `/appointments` from `/`, `/members` and a `safeRedirect`
  target. Everyone else is unchanged.
- Route guard: the decision function used by `ProtectedRoute` and `FullscreenRoute` sends an appointments-only user
  to `/appointments`.
- `AppointmentsShell.test.tsx`: an appointments-only user sees no "Full admin" link, and the lapsed notice says
  "Contact HexaTech" with no button. A full customer is unchanged.
- `ServiceEditor`: no full-admin note for an appointments-only user.
- API client: `staff_inactive` signs out and lands on the login notice. `not_in_plan` outside the workspace marks
  the stored user appointments-only and opens `/appointments` (ruling R2).
- Locale parity for the new keys in all five bundles.

Browser check, local, at 1440 and 390 px:

- An appointments-only organisation signs in, lands in the workspace, finds no full-admin link, and typing
  `/members` lands back in the workspace.
- A widget booking makes no member.
- A full customer's manager and receptionist see what they saw before.
- With `ADMIN_ACCESS_MODE=enforce` set locally, the receptionist's manager-only calls are refused and a deactivated
  account is signed out.

## 10. Documentation

- `docs/appointments-workspace.md` gains two runbook sections:
  - "Selling Appointments on its own": the plan, the operator flags, what an appointments-only organisation gets,
    and the billing handover.
  - "Admin access map": how to read a rule, how to run the report, and how to switch modes.
- `CLAUDE.md` gains one rule: every new admin route needs an `AccessMap` entry; the completeness test enforces it.

## 11. Not in this part

- **Service photos, gallery and long description** are edited only in the full admin, so an appointments-only venue
  cannot change them. Its public page shows what exists, which for a new venue is nothing. Bringing them into Setup
  would be a later part.
- **Billing self-service for the Appointments plan.** Plan and payment changes go through HexaTech.
- **Product enforcement for the existing plans.** A Starter organisation's API still answers booking routes, as
  today. The product labels are recorded for when that is wanted.
- **Finer roles inside a page for everyone.** Today's menu lets every staff member do some sensitive things, and
  the map keeps that:
  - send to a segment;
  - refund a room booking;
  - edit leads in bulk.
- **`POST chatbot/message`** and the member API are not touched.

## 12. Owner to-do

1. Review this spec.
2. After deployment, create the product and plan in billing (§7.1).
3. After about a week of report mode, read `admin-access:report` with me, then set `ADMIN_ACCESS_MODE=enforce` in
   Laravel Cloud.
