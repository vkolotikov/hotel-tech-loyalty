# HexaTech Appointments Part C — Sell it on its own — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An organisation on a new "Appointments" plan reaches only the appointments workspace and the public
booking page, with loyalty off. Every organisation's admin API refuses what the menu does not show the caller. The
role and deactivation rules start in report mode.

**Architecture:**
- One class, `App\Support\AdminAccess\AccessMap`, says who may call each staff route: a read rule, a change rule
  and a product per URI-template key.
- One middleware, `admin.access` (`App\Http\Middleware\AdminAccess`), runs on every `/v1/admin` route and on four
  staff routes outside it. It decides in the spec's order and records every refusal in `admin_access_refusals`.
- `Organization::appointmentsOnly()` decides the plan (operator mark, then billing's products, then the plan slug).
  The loyalty switch, guest enrolment, member sign-up, the workspace switch and the sign-in payload all ask it.
- The SPA sends appointments-only staff to `/appointments` from every full-admin route and drops the workspace's
  links to the full admin. The shared API client answers `staff_inactive` and `not_in_plan` for every page.

**Tech Stack:** Laravel 13 / PHP 8.4, PHPUnit on sqlite with the repo's schema traits; React 19, react-router 7,
zustand, axios, i18next (five bundles), Vitest static render (node env).

**Spec:** `docs/superpowers/specs/2026-10-01-appointments-standalone-design.md` (approved by the owner on
2026-10-02). It is corrected by planning rulings R1 and R2 below, in the same commit as this plan.

## Global Constraints

- PHP is `/c/wamp64/bin/php/php8.4.20/php.exe`. Run one test path (or a few named files) per `artisan test` call;
  never a bare `php artisan test`. Read the `Tests:` line yourself. Helper:
  `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh <path> [<path> …]` from the feature worktree
  `C:\wamp64\www\Hexa-Tech-appointments` (branch `feature/appointments-workspace`).
- Frontend checks: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/fe.sh [vitest paths]` (vitest,
  `tsc -b`, eslint on `src/appointments`). Files changed outside `src/appointments` also get
  `cd frontend && npx eslint <files>`. In the whole-suite run, the 3 `plannerMeta` failures are pre-existing.
- One migration, additive: `admin_access_refusals`. Local PostgreSQL is shared: never run `artisan migrate`
  locally. Tests build the table in sqlite (`MakesAdminCaller`).
- Mode: `config('admin_access.mode')` from `ADMIN_ACCESS_MODE`. Only `enforce` enforces; anything else, or nothing,
  means report. `not_in_plan` is enforced in both modes.
- Refusal bodies, exactly:
  - `{"error":"not_in_plan","message":"This is not part of your organisation's HexaTech plan."}`
  - `{"error":"staff_inactive","message":"Your access to this organisation has been switched off. Ask an owner or a manager."}`
  - `{"error":"not_allowed","message":"Only an owner or a manager can do this."}`
  - for a capability rule: `{"error":"not_allowed","message":"Your account does not have permission for this."}`
- A manager is `staff.role` `super_admin` or `manager`. "Active" is `staff.is_active = true`. The staff lookup is
  tenant-scoped: `Staff::where('user_id', …)`, never `withoutGlobalScopes()`.
- The public booking page, the services widget and the chat widget are not edited. Only the guests they create in
  an appointments-only organisation stop becoming members, through `GuestMemberLinkService`.
- No existing organisation has the `appointments` product or plan slug. Nothing changes for them except the access
  map, which starts in report mode.
- `frontend/src/appointments/` uses only `a-*` colour tokens and only `/v1/admin/appointments/…` API paths
  (`tokens.test.ts`). Every visible string is `t('…', 'English fallback')` and exists in all five bundles.
- Never commit `frontend/dist`, `public/spa` or `resources/spa-shell` on the feature branch. Stage files by name.
  Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push, no deploy.

## Review Focus

1. **A session that signed in before its organisation became appointments-only.** Its stored user has no `only`,
   and the SPA never re-reads `/auth/me`. The person must land in the workspace on their next full-admin call, not
   sit in a full admin where every call answers `not_in_plan`. (Ruling R2; Task 11 tests it.)
2. **The theme every page reads.** `GET admin/branding/theme` runs on every page, the workspace included. An
   appointments-only organisation must be allowed it, or every workspace page records a refusal and loses its
   colours. (Ruling R1; Task 4 tests it.)
3. **A manager whose capability flag is off.** `MakesAdminCaller` and SaaS sign-up can give a manager every flag
   false. A capability rule must still admit them, as the menu does. (Task 4 tests it.)
4. **HEAD is a read.** A HEAD request to a staff-readable area must pass for staff in enforce mode. (Task 4 tests
   it.)
5. **An organisation switched off earlier that later becomes appointments-only.** Its stored `enabled: false` must
   not leave it with nothing: the workspace is on and is where its staff land. (Task 2 tests it.)

## Planning rulings (deviations from the spec, found while reading the code)

- **R1.** `admin/branding` has product `account`, not `admin`. The app root's `ThemeLoader` reads
  `GET admin/branding/theme` on every page, the workspace included. The area is read-only (1 GET, no change
  routes). Cost if wrong: an appointments-only organisation can read its own colour theme. The spec's §5.1 and §5.5
  are corrected in this commit.
- **R2.** The shared API client answers a 403 `not_in_plan` outside `/appointments`: it marks the stored user
  appointments-only and opens `/appointments`. Without this, a session signed in before the plan changed stays in a
  full admin where every call fails, until the person signs out. The spec's §6.2 and §9 are corrected in this
  commit. Cost if wrong: one extra redirect on a refusal the spec already makes.
- **R3.** `RequireStaffCapability::CAPABILITIES` becomes `public`, so the completeness test checks the map against
  the one list (spec §9: "a capability RequireStaffCapability knows"). Cost if wrong: none.
- **R4.** The `mcp` refusal is tested by calling the middleware with the real `mcp` route matched from the route
  table, not over HTTP: the MCP endpoint needs a plugin OAuth token. A separate assertion checks that the route runs
  `admin.access`. Cost if wrong: the order of the connector's own middleware is not exercised.
- **R5.** The role matrix calls `AdminAccess::handle()` with the route production would dispatch to, matched from
  the route table, and a `$next` that answers "passed". Going through each controller would need every area's
  tables. HTTP tests in Task 5 prove the wiring. Cost if wrong: none for the decision itself.
- **R6.** The `enforced` flag is part of the record's key, beside the day, organisation, person, rule, method and
  reason. A mode switch mid-day starts new rows instead of relabelling old ones. Cost if wrong: a few more rows.
- **R7.** `--only` counts every `loyalty_members` row of the organisation as "loyalty members who lose the portal
  and points" (the test fixture has no active flag on that table). Cost if wrong: the number can include members
  who were already inactive.
- **R8.** The existing tests that pin the exact `workspaces` payload gain `'only' => false` (spec §6.2: the key is
  always present). Cost if wrong: none.

## File map

| File | Change |
|---|---|
| `app/Support/AdminAccess/Rule.php` | new: one route's rule (key, read, change, product) |
| `app/Support/AdminAccess/AccessMap.php` | new: the map, matching, fallback |
| `app/Support/AdminAccess/AccessRecorder.php` | new: upserts refusals |
| `app/Http/Middleware/AdminAccess.php` | new: the decision |
| `app/Http/Middleware/RequireStaffCapability.php` | `CAPABILITIES` public (R3) |
| `config/admin_access.php` | new: `mode` |
| `database/migrations/2026_10_02_100000_create_admin_access_refusals.php` | new |
| `bootstrap/app.php` | alias `admin.access` |
| `routes/api.php`, `routes/ai.php` | the middleware on the admin group and four outside routes |
| `app/Models/Organization.php` | the Appointments plan; workspace forcing; payload `only` |
| `app/Http/Controllers/Api/V1/Auth/AuthController.php` | `getPlanProducts('appointments')`; member sign-up refusal |
| `app/Services/Portal/PortalBootstrap.php` | `loyaltyOn()` false on the plan |
| `app/Services/GuestMemberLinkService.php` | no enrolment on the plan |
| `app/Console/Commands/AppointmentsWorkspace.php` | `--only`, `--not-only`, `--plan-decides`, `--force` |
| `app/Console/Commands/AdminAccessReport.php` | new: `admin-access:report` |
| `tests/Concerns/MakesAdminCaller.php`, `tests/Concerns/SetsUpAppointmentsSchema.php` | fixture: refusals table; plan columns |
| `tests/Feature/AdminAccess/*.php` | new tests |
| `tests/Feature/Appointments/WorkspaceGateTest.php`, `SignInWorkspacesTest.php` | `'only' => false` (R8) |
| `tests/Feature/Auth/PublicRegisterTenantIsolationTest.php` | one test added |
| `frontend/src/appointments/lib/landing.ts` (+ test) | `isAppointmentsOnly`, `fullAdminRedirect`, `withAppointmentsOnly`, `landingPath` |
| `frontend/src/appointments/lib/useAppointmentsOnly.ts` | new hook |
| `frontend/src/stores/authStore.ts` | type `only` |
| `frontend/src/App.tsx` | route guards |
| `frontend/src/appointments/AppointmentsShell.tsx`, `setup/ServiceEditor.tsx` (+ tests) | no full-admin links on the plan |
| `frontend/src/lib/accessOff.ts`, `frontend/src/lib/api.ts` (+ test) | the two refusals |
| `frontend/src/components/AccessOffNotice.tsx` (+ test), `frontend/src/pages/Login.tsx` | the sign-in notice |
| five `appointments.<lang>.json`, five `common.json` | two strings |
| `docs/appointments-workspace.md`, `CLAUDE.md` | runbook and rule |

## Before you start

- [ ] Run `../subagent-driven-development/scripts/sdd-workspace docs/superpowers/plans/2026-10-02-appointments-standalone.md`
  (the executing skill's path) and use the directory it prints as `<ws>`. It should be
  `.superpowers/sdd/2026-10-02-appointments-standalone/`. Create `<ws>/tools/` there.
- [ ] Record a baseline before Task 1, so that Task 12 can tell new failures from old ones. From the feature
  worktree, run:

```bash
for d in tests/Feature/*/ tests/Unit/*/; do echo "$d $(bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh "$d" | tail -n 1)"; done > <ws>/baseline.txt
bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/RouteControllersExistTest.php tests/Feature/RouteUniquenessTest.php tests/Feature/LeadIntakeApiTest.php tests/Feature/BusinessOutcomeReportTest.php tests/Feature/GalleryUploadValidationTest.php tests/Feature/ExampleTest.php tests/Unit/ExampleTest.php | tail -n 1 >> <ws>/baseline.txt
```

  Ledger any directory that does not end `exit=0` as `Baseline: <dir> <line>`.

---

### Task 1: The access map

**Files:**
- Create: `app/Support/AdminAccess/Rule.php`, `app/Support/AdminAccess/AccessMap.php`
- Modify: `app/Http/Middleware/RequireStaffCapability.php` (`private const CAPABILITIES` → `public const CAPABILITIES`)
- Test: `tests/Feature/AdminAccess/AccessMapTest.php`

**Interfaces:**
- Produces:
  - `final class Rule { public readonly string $key, $read, $change, $product; public function forMethod(string $method): string }`
  - `AccessMap::MAP` (array<string, array{0: string, 1: string, 2: string}>), `AccessMap::MANAGER_ROLES = ['super_admin', 'manager']`
  - `AccessMap::PLAN_PRODUCTS = ['appointments', 'account']`, `AccessMap::PRODUCTS`
  - `AccessMap::FALLBACK = ['manager', 'manager', 'admin']`
  - `AccessMap::uriOf(Route $route): string` (the URI template without `api/v1/`)
  - `AccessMap::keyFor(Route $route): ?string`
  - `AccessMap::ruleFor(Route $route): Rule` (key `unmapped:<uri>` when no key matches)
  - `RequireStaffCapability::CAPABILITIES` (public)

- [ ] **Step 1: Write the failing test** `tests/Feature/AdminAccess/AccessMapTest.php`:

```php
<?php

namespace Tests\Feature\AdminAccess;

use App\Http\Middleware\RequireStaffCapability;
use App\Support\AdminAccess\AccessMap;
use Illuminate\Http\Request;
use Illuminate\Routing\Route as RoutingRoute;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class AccessMapTest extends TestCase
{
    /** The route production would dispatch this request to. */
    private function route(string $method, string $uri): RoutingRoute
    {
        return Route::getRoutes()->match(Request::create('/' . $uri, $method));
    }

    /** @return Collection<int, RoutingRoute> */
    private function routes(): Collection
    {
        return collect(Route::getRoutes()->getRoutes());
    }

    public function test_an_area_reads_for_staff_and_changes_for_managers(): void
    {
        $rule = AccessMap::ruleFor($this->route('PUT', 'api/v1/admin/services/5'));

        $this->assertSame(['admin/services', 'staff', 'manager', 'booking'], [$rule->key, $rule->read, $rule->change, $rule->product]);
        $this->assertSame('staff', $rule->forMethod('GET'));
        $this->assertSame('staff', $rule->forMethod('head'));
        $this->assertSame('manager', $rule->forMethod('PUT'));
        $this->assertSame('manager', $rule->forMethod('DELETE'));
    }

    public function test_the_longest_key_wins(): void
    {
        $this->assertSame('admin/bookings', AccessMap::ruleFor($this->route('GET', 'api/v1/admin/bookings'))->key);

        $submissions = AccessMap::ruleFor($this->route('GET', 'api/v1/admin/bookings/submissions'));
        $this->assertSame(['admin/bookings/submissions', 'manager'], [$submissions->key, $submissions->read]);

        $send = AccessMap::ruleFor($this->route('POST', 'api/v1/admin/email-templates/7/send'));
        $this->assertSame(['admin/email-templates/{template}/send', 'staff'], [$send->key, $send->change]);
        $this->assertSame('manager', AccessMap::ruleFor($this->route('PUT', 'api/v1/admin/email-templates/7'))->change);

        $this->assertSame('staff', AccessMap::ruleFor($this->route('POST', 'api/v1/admin/reviews/invitations'))->change);
        $this->assertSame('manager', AccessMap::ruleFor($this->route('POST', 'api/v1/admin/reviews/forms'))->change);
    }

    public function test_the_staff_routes_outside_admin_have_keys(): void
    {
        $checkout = AccessMap::ruleFor($this->route('POST', 'api/v1/auth/billing/checkout'));
        $this->assertSame(['auth/billing', 'manager', 'admin'], [$checkout->key, $checkout->change, $checkout->product]);
        $this->assertSame('auth/apply-industry', AccessMap::ruleFor($this->route('POST', 'api/v1/auth/apply-industry'))->key);
        $leads = AccessMap::ruleFor($this->route('POST', 'api/v1/integrations/leads'));
        $this->assertSame(['integrations/leads', 'staff', 'crm'], [$leads->key, $leads->change, $leads->product]);
        $this->assertSame('mcp', AccessMap::ruleFor($this->route('POST', 'mcp'))->key);
    }

    public function test_the_theme_and_the_callers_own_account_are_in_every_plan(): void
    {
        foreach (['GET api/v1/admin/branding/theme', 'GET api/v1/admin/me/preferences', 'PUT api/v1/admin/me/preferences', 'POST api/v1/admin/push-token'] as $call) {
            [$method, $uri] = explode(' ', $call);
            $this->assertContains(AccessMap::ruleFor($this->route($method, $uri))->product, AccessMap::PLAN_PRODUCTS, $call);
        }
        $this->assertSame('appointments', AccessMap::ruleFor($this->route('GET', 'api/v1/admin/appointments/bootstrap'))->product);
        $this->assertNotContains(AccessMap::ruleFor($this->route('GET', 'api/v1/admin/members'))->product, AccessMap::PLAN_PRODUCTS);
    }

    public function test_a_route_no_key_matches_is_manager_only_and_named(): void
    {
        // Keys match whole segments: admin/team is not admin/teamwork.
        $rule = AccessMap::ruleFor(new RoutingRoute(['GET'], 'api/v1/admin/teamwork', fn () => null));

        $this->assertSame(['unmapped:admin/teamwork', 'manager', 'manager', 'admin'], [$rule->key, $rule->read, $rule->change, $rule->product]);
        $this->assertNull(AccessMap::keyFor(new RoutingRoute(['GET'], 'api/v1/admin/teamwork', fn () => null)));
    }

    public function test_every_admin_route_has_a_key_and_every_key_a_route(): void
    {
        $admin = $this->routes()->filter(fn (RoutingRoute $r) => str_starts_with($r->uri(), 'api/v1/admin/'));
        $this->assertGreaterThan(600, $admin->count());

        $unmapped = $admin->filter(fn (RoutingRoute $r) => AccessMap::keyFor($r) === null)->map(fn (RoutingRoute $r) => $r->uri())->values()->all();
        $this->assertSame([], $unmapped, 'Every admin route needs an AccessMap key.');

        $used = $this->routes()->map(fn (RoutingRoute $r) => AccessMap::keyFor($r))->filter()->unique()->values()->all();
        $this->assertSame([], array_values(array_diff(array_keys(AccessMap::MAP), $used)), 'A key no route uses.');
    }

    public function test_every_rule_is_a_role_or_a_known_capability_and_every_product_is_known(): void
    {
        $rules = array_merge(['staff', 'manager'], RequireStaffCapability::CAPABILITIES);

        foreach (AccessMap::MAP as $key => [$read, $change, $product]) {
            $this->assertContains($read, $rules, $key);
            $this->assertContains($change, $rules, $key);
            $this->assertContains($product, AccessMap::PRODUCTS, $key);
        }
    }
}
```

- [ ] **Step 2: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/AdminAccess/AccessMapTest.php`
  - Expected: FAIL — `Class "App\Support\AdminAccess\AccessMap" not found`.

- [ ] **Step 3: Make `RequireStaffCapability::CAPABILITIES` public.** In `app/Http/Middleware/RequireStaffCapability.php`
  change `    private const CAPABILITIES = [` to `    public const CAPABILITIES = [`. Leave the rest as it is.

- [ ] **Step 4: Implement** `app/Support/AdminAccess/Rule.php`:

```php
<?php

namespace App\Support\AdminAccess;

/** One staff route's rule in the access map (see AccessMap). */
final class Rule
{
    public function __construct(
        public readonly string $key,
        public readonly string $read,
        public readonly string $change,
        public readonly string $product,
    ) {
    }

    /** GET and HEAD read; every other method changes. */
    public function forMethod(string $method): string
    {
        return in_array(strtoupper($method), ['GET', 'HEAD'], true) ? $this->read : $this->change;
    }
}
```

- [ ] **Step 5: Implement** `app/Support/AdminAccess/AccessMap.php`:

```php
<?php

namespace App\Support\AdminAccess;

use Illuminate\Routing\Route;

/**
 * Who may call which staff endpoint, in one place (Part C spec §5). Every
 * /v1/admin route, and four staff routes outside it, run the `admin.access`
 * middleware, which asks here for the route's rule:
 *
 *   key => [read, change, product]
 *
 * - The key is the route's URI template without `api/v1/`, matched on whole
 *   segments. The longest matching key wins, so a sub-path can differ from
 *   its area.
 * - `read` applies to GET and HEAD, `change` to every other method. A rule is
 *   `staff` (any active staff member of the organisation), `manager`
 *   (`super_admin` or `manager`) or a capability column of `staff`
 *   (managers, and staff whose flag is set — as the menu shows those pages).
 * - `product` says what an organisation on the Appointments plan may reach:
 *   `appointments` and `account`. The others (`admin`, `booking`, `loyalty`,
 *   `crm`, `chat`) are recorded for the day the existing plans are enforced
 *   too; today they enforce nothing for them.
 *
 * Manager exactly where the menu's page is manager-only. Changes there are
 * manager-only; reads are manager-only only for sensitive data, because
 * other screens read the catalogues. A route no key matches is manager-only
 * (FALLBACK) and is recorded as `unmapped:<uri>`; AccessMapTest fails the
 * build first. Every new staff route needs a key here.
 */
final class AccessMap
{
    public const MANAGER_ROLES = ['super_admin', 'manager'];

    /** What an organisation on the Appointments plan may reach (spec §6.2). */
    public const PLAN_PRODUCTS = ['appointments', 'account'];

    public const PRODUCTS = ['appointments', 'account', 'admin', 'booking', 'loyalty', 'crm', 'chat'];

    /** @var array{0: string, 1: string, 2: string} */
    public const FALLBACK = ['manager', 'manager', 'admin'];

    /** @var array<string, array{0: string, 1: string, 2: string}> */
    public const MAP = [
        // ── The workspace (Setup keeps its own manager rule, SetupAccess)
        'admin/appointments'                    => ['staff',              'staff',              'appointments'],  // The workspace; Setup keeps its own manager rule (SetupAccess)

        // ── The caller's own account
        'admin/branding'                        => ['staff',              'manager',            'account'],       // The theme every page reads, the workspace included (ruling R1)
        'admin/me'                              => ['staff',              'staff',              'account'],       // The caller's own profile
        'admin/push-token'                      => ['staff',              'staff',              'account'],       // The caller's own device

        // ── The full admin: everyday pages, settings and sensitive data
        'admin/ai-usage'                        => ['manager',            'manager',            'admin'],         // AI usage and cost (Settings, manager)
        'admin/analytics'                       => ['can_view_analytics', 'can_view_analytics', 'admin'],         // Analytics (menu: can_view_analytics; the routes check it too)
        'admin/api-tokens'                      => ['manager',            'manager',            'admin'],         // API tokens (Settings, manager)
        'admin/audit-logs'                      => ['manager',            'manager',            'admin'],         // Audit log (menu: manager)
        'admin/brands'                          => ['staff',              'manager',            'admin'],         // Brands (menu: manager); the brand switcher reads them
        'admin/business-reporting-key'          => ['can_view_analytics', 'can_view_analytics', 'admin'],         // Reporting key (the route checks can_view_analytics)
        'admin/content-planner'                 => ['staff',              'staff',              'admin'],         // Content planner (menu: everyone)
        'admin/dashboard'                       => ['staff',              'staff',              'admin'],         // Dashboard (menu: everyone)
        'admin/diag'                            => ['manager',            'manager',            'admin'],         // Operator diagnostics (route already needs super_admin)
        'admin/documentation'                   => ['staff',              'staff',              'admin'],         // Help pages
        'admin/industry-presets'                => ['staff',              'manager',            'admin'],         // Industry presets (Pipelines admin)
        'admin/integrations'                    => ['manager',            'manager',            'admin'],         // Integrations and their secrets (Settings, manager)
        'admin/landing-pages'                   => ['staff',              'manager',            'admin'],         // Landing page (menu: manager)
        'admin/planner'                         => ['staff',              'staff',              'admin'],         // Planner (menu: everyone)
        'admin/planner-presets'                 => ['staff',              'manager',            'admin'],         // Planner presets (Settings, manager)
        'admin/realtime'                        => ['staff',              'staff',              'admin'],         // The full admin's live poll
        'admin/reporting'                       => ['can_view_analytics', 'can_view_analytics', 'admin'],         // Reports (menu: can_view_analytics; the routes do not check it today)
        'admin/reviews'                         => ['staff',              'manager',            'admin'],         // Reviews (menu: manager); asking for a review is overridden below
        'admin/search'                          => ['staff',              'staff',              'admin'],         // Global search
        'admin/settings'                        => ['staff',              'manager',            'admin'],         // Settings (menu: manager); screens read display settings, secrets are masked
        'admin/setup'                           => ['staff',              'manager',            'admin'],         // Organisation first-run wizard
        'admin/team'                            => ['staff',              'manager',            'admin'],         // Team (Settings, manager); the Planner lists team members for everyone

        // ── Bookings, rooms and services
        'admin/booking-extras'                  => ['staff',              'manager',            'booking'],       // Room extras (menu: manager)
        'admin/booking-rooms'                   => ['staff',              'manager',            'booking'],       // Rooms (menu: manager); booking screens read them
        'admin/bookings'                        => ['staff',              'staff',              'booking'],       // Room bookings (menu: everyone); submissions overridden below
        'admin/properties'                      => ['staff',              'manager',            'booking'],       // Properties (menu: manager)
        'admin/reservations'                    => ['staff',              'staff',              'booking'],       // Reservations
        'admin/service-bookings'                => ['staff',              'staff',              'booking'],       // Service bookings (menu: everyone)
        'admin/service-categories'              => ['staff',              'manager',            'booking'],       // Service categories (Services page)
        'admin/service-extras'                  => ['staff',              'manager',            'booking'],       // Service extras (menu: manager)
        'admin/service-masters'                 => ['staff',              'manager',            'booking'],       // Team members who perform services (menu: manager)
        'admin/services'                        => ['staff',              'manager',            'booking'],       // Services (menu: manager); booking forms read them
        'admin/venues'                          => ['staff',              'manager',            'booking'],       // Venues (menu: manager)

        // ── Loyalty
        'admin/benefits'                        => ['staff',              'manager',            'loyalty'],       // Benefits (Program, manager)
        'admin/campaigns'                       => ['staff',              'manager',            'loyalty'],       // Campaigns (menu: manager)
        'admin/discounts'                       => ['staff',              'staff',              'loyalty'],       // Member discounts at the desk: routes already need can_redeem_points
        'admin/earn-rate-events'                => ['staff',              'manager',            'loyalty'],       // Earn-rate events (Program, manager)
        'admin/entitlements'                    => ['staff',              'staff',              'loyalty'],       // Members' benefit entitlements, used at the desk
        'admin/loyalty-presets'                 => ['staff',              'manager',            'loyalty'],       // Programme presets (Members onboarding configures tiers)
        'admin/member-portal'                   => ['staff',              'staff',              'loyalty'],       // Member portal tab of Members (read only)
        'admin/members'                         => ['staff',              'staff',              'loyalty'],       // Members (menu: everyone); points routes keep their capabilities
        'admin/nfc'                             => ['staff',              'staff',              'loyalty'],       // NFC
        'admin/nfc-cards'                       => ['staff',              'staff',              'loyalty'],       // NFC cards
        'admin/notifications'                   => ['staff',              'manager',            'loyalty'],       // Sends a push campaign (Campaigns, manager)
        'admin/offers'                          => ['staff',              'can_manage_offers',  'loyalty'],       // Offers (changes: the routes check can_manage_offers)
        'admin/points'                          => ['staff',              'staff',              'loyalty'],       // Points: the controller checks can_award_points / can_redeem_points
        'admin/referrals'                       => ['staff',              'staff',              'loyalty'],       // Referrals
        'admin/rewards'                         => ['staff',              'can_manage_offers',  'loyalty'],       // Rewards (changes: the routes check can_manage_offers)
        'admin/scan'                            => ['staff',              'staff',              'loyalty'],       // Scan (menu: everyone)
        'admin/segments'                        => ['staff',              'staff',              'loyalty'],       // Segments tab of Members (menu: everyone)
        'admin/tier-benefits'                   => ['staff',              'manager',            'loyalty'],       // Tier benefits (Program, manager)
        'admin/tiers'                           => ['staff',              'manager',            'loyalty'],       // Tiers (Program, manager)
        'admin/wallet-config'                   => ['manager',            'manager',            'loyalty'],       // Wallet passes and certificates (menu: manager)

        // ── CRM
        'admin/corporate-accounts'              => ['staff',              'staff',              'crm'],           // Corporate accounts
        'admin/crm-ai'                          => ['staff',              'staff',              'crm'],           // CRM AI helpers
        'admin/crm-settings'                    => ['staff',              'staff',              'crm'],           // Everyone saves column choices on Leads and Deals here
        'admin/custom-fields'                   => ['staff',              'manager',            'crm'],           // Custom fields (Pipelines admin)
        'admin/deals'                           => ['staff',              'staff',              'crm'],           // Deals (menu: everyone)
        'admin/email-campaigns'                 => ['staff',              'manager',            'crm'],           // Email campaigns (Marketing, manager)
        'admin/email-templates'                 => ['staff',              'manager',            'crm'],           // Email templates (Marketing, manager); sending one is overridden below
        'admin/guests'                          => ['staff',              'staff',              'crm'],           // Guests and clients
        'admin/inquiries'                       => ['staff',              'staff',              'crm'],           // Leads (menu: everyone)
        'admin/inquiry-lost-reasons'            => ['staff',              'manager',            'crm'],           // Lost reasons (Pipelines admin)
        'admin/inquiry-lost-reasons-admin'      => ['manager',            'manager',            'crm'],           // Lost reasons admin list (Pipelines admin)
        'admin/lead-forms'                      => ['staff',              'manager',            'crm'],           // Lead forms
        'admin/pipeline-stages'                 => ['staff',              'manager',            'crm'],           // Pipeline stages (Pipelines admin)
        'admin/pipelines'                       => ['staff',              'manager',            'crm'],           // Pipelines (Pipelines admin)
        'admin/saved-views'                     => ['staff',              'staff',              'crm'],           // A person's saved views
        'admin/tasks'                           => ['staff',              'staff',              'crm'],           // Tasks
        'admin/visitors'                        => ['staff',              'staff',              'crm'],           // Visitors

        // ── Chat and the chatbot
        'admin/chat-inbox'                      => ['staff',              'staff',              'chat'],          // Chat inbox
        'admin/chat-inbox-agents'               => ['staff',              'staff',              'chat'],          // Chat agents
        'admin/chat-inbox-canned'               => ['staff',              'manager',            'chat'],          // Canned replies
        'admin/chatbot'                         => ['staff',              'staff',              'chat'],          // Chatbot analytics (read only)
        'admin/chatbot-config'                  => ['staff',              'manager',            'chat'],          // Chatbot setup (menu: manager)
        'admin/chatbot-onboarding'              => ['manager',            'manager',            'chat'],          // Chatbot onboarding (Chatbot setup, manager)
        'admin/engagement'                      => ['staff',              'staff',              'chat'],          // Engagement (menu: everyone)
        'admin/knowledge'                       => ['staff',              'manager',            'chat'],          // Chatbot knowledge
        'admin/popup-rules'                     => ['staff',              'manager',            'chat'],          // Pop-up rules
        'admin/training'                        => ['staff',              'manager',            'chat'],          // Chatbot training
        'admin/voice-agent'                     => ['staff',              'manager',            'chat'],          // Voice agent
        'admin/widget-config'                   => ['staff',              'manager',            'chat'],          // Widget config

        // ── Sub-paths that differ from their area (the longest key wins)
        'admin/bookings/submissions'            => ['manager',            'manager',            'booking'],       // Website booking submissions (menu: manager)
        'admin/email-templates/{template}/send' => ['staff',              'staff',              'crm'],           // "Send template" on member and lead pages (pages for everyone)
        'admin/reviews/invitations'             => ['staff',              'staff',              'admin'],         // "Ask for a review" on booking, guest and member pages (pages for everyone)

        // ── Staff routes outside /admin
        'auth/billing'                          => ['manager',            'manager',            'admin'],         // Checkout, activation, Stripe portal, refresh, trial (Billing, manager)
        'auth/apply-industry'                   => ['manager',            'manager',            'admin'],         // Changes the organisation's industry and presets (Settings, manager)
        'integrations/leads'                    => ['staff',              'staff',              'crm'],           // Leads sent with an API token
        'mcp'                                   => ['staff',              'staff',              'admin'],         // The ChatGPT / Claude connector; its tools keep their own checks
    ];

    /** The route's URI template without `api/v1/` (`admin/services/{service}`, `mcp`). */
    public static function uriOf(Route $route): string
    {
        return (string) preg_replace('#^api/v1/#', '', $route->uri());
    }

    /** The longest key whose segments begin the route's template, or null. */
    public static function keyFor(Route $route): ?string
    {
        $segments = explode('/', self::uriOf($route));
        $best = null;
        $bestLength = 0;
        foreach (array_keys(self::MAP) as $key) {
            $keySegments = explode('/', $key);
            $length = count($keySegments);
            if ($length > $bestLength && array_slice($segments, 0, $length) === $keySegments) {
                $best = $key;
                $bestLength = $length;
            }
        }

        return $best;
    }

    public static function ruleFor(Route $route): Rule
    {
        $key = self::keyFor($route);
        [$read, $change, $product] = $key === null ? self::FALLBACK : self::MAP[$key];

        return new Rule($key ?? 'unmapped:' . self::uriOf($route), $read, $change, $product);
    }
}
```

- [ ] **Step 6: Run it.**
  - Run: same command as Step 2.
  - Expected: PASS (7 tests).
  - If `test_the_longest_key_wins` reports `admin/bookings` for `bookings/submissions`, the route table dispatches
    that path to `bookings/{id}`. Ledger it; that would be a bug in the routes, not in the map.

- [ ] **Step 7: Commit.** Write `<ws>/tools/commit-1.txt` with the subject "Write down who may call which admin
  endpoint", a short body and the trailer. Then:

```bash
git add app/Support/AdminAccess/Rule.php app/Support/AdminAccess/AccessMap.php app/Http/Middleware/RequireStaffCapability.php tests/Feature/AdminAccess/AccessMapTest.php
git commit -F <ws>/tools/commit-1.txt
```

---

### Task 2: Who is on the Appointments plan

**Files:**
- Modify: `app/Models/Organization.php` (the workspace section), `app/Http/Controllers/Api/V1/Auth/AuthController.php` (`getPlanProducts`)
- Modify: `tests/Concerns/SetsUpAppointmentsSchema.php` (organizations columns)
- Modify: `tests/Feature/Appointments/WorkspaceGateTest.php`, `tests/Feature/Appointments/SignInWorkspacesTest.php` (R8)
- Test: `tests/Feature/AdminAccess/AppointmentsPlanTest.php`

**Interfaces:**
- Produces:
  - `Organization::APPOINTMENTS_PLAN_PRODUCTS = ['appointments', 'booking']`
  - `Organization::appointmentsOnly(): bool`
  - `Organization::appointmentsOnlySource(): ?string` (`'operator'`, `'plan'` or null)
  - `Organization::isAppointmentsOnly(?int $orgId): bool` (static)
  - `Organization::setAppointmentsOnly(?bool $only): void` (null removes the mark)
  - `workspace('appointments')` is `['enabled' => true, 'landing' => true]` for an appointments-only organisation.
  - `workspacesPayload()['appointments']` = `['landing' => bool, 'has_services' => bool, 'only' => bool]`, in that
    order.
  - Fixture: `organizations.entitled_products` (text) and `organizations.plan_slug` (string).

- [ ] **Step 1: Extend the fixture.** In `tests/Concerns/SetsUpAppointmentsSchema.php`, add two entries to the
  `organizations` block of `setUpAppointments()`:

```php
        $this->addColumnsIfMissing('organizations', [
            'settings'          => fn (Blueprint $t) => $t->text('settings')->nullable(),
            'timezone'          => fn (Blueprint $t) => $t->string('timezone', 64)->nullable(),
            'currency'          => fn (Blueprint $t) => $t->string('currency', 10)->nullable(),
            'entitled_products' => fn (Blueprint $t) => $t->text('entitled_products')->nullable(),
            'plan_slug'         => fn (Blueprint $t) => $t->string('plan_slug', 64)->nullable(),
        ]);
```

- [ ] **Step 2: Write the failing test** `tests/Feature/AdminAccess/AppointmentsPlanTest.php`:

```php
<?php

namespace Tests\Feature\AdminAccess;

use App\Http\Controllers\Api\V1\Auth\AuthController;
use App\Models\Organization;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class AppointmentsPlanTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    public function test_billing_decides_from_the_products_then_the_plan_slug(): void
    {
        $cases = [
            [['appointments', 'booking'], null, true],
            [['appointments'], null, true],
            [['crm', 'loyalty', 'booking', 'chat'], null, false],
            [['appointments', 'crm'], null, false],
            [['booking'], null, false],
            [[], 'appointments', true],
            [[], 'growth', false],
            [[], null, false],
            [['crm', 'loyalty'], 'appointments', false], // a product list decides over the slug
        ];

        foreach ($cases as [$products, $slug, $only]) {
            $this->org->forceFill(['entitled_products' => $products, 'plan_slug' => $slug])->save();
            $org = $this->org->fresh();
            $this->assertSame($only, $org->appointmentsOnly(), json_encode([$products, $slug]));
            $this->assertSame($only ? 'plan' : null, $org->appointmentsOnlySource(), json_encode([$products, $slug]));
            $this->assertSame($only, Organization::isAppointmentsOnly($this->org->id));
        }
        $this->assertFalse(Organization::isAppointmentsOnly(null));
    }

    public function test_an_operator_mark_decides_over_billing_and_can_be_removed(): void
    {
        $this->org->forceFill(['entitled_products' => ['crm', 'loyalty', 'booking', 'chat']])->save();
        $this->org->setAppointmentsOnly(true);
        $this->assertTrue($this->org->fresh()->appointmentsOnly());
        $this->assertSame('operator', $this->org->fresh()->appointmentsOnlySource());

        $this->org->forceFill(['entitled_products' => ['appointments', 'booking']])->save();
        $this->org->setAppointmentsOnly(false);
        $this->assertFalse($this->org->fresh()->appointmentsOnly());
        $this->assertSame('operator', $this->org->fresh()->appointmentsOnlySource());

        $this->org->setAppointmentsOnly(null);
        $this->assertTrue($this->org->fresh()->appointmentsOnly());
        $this->assertSame('plan', $this->org->fresh()->appointmentsOnlySource());
        $this->assertNull(data_get($this->org->fresh()->settings, 'workspaces.appointments.only'));
    }

    public function test_the_workspace_is_on_and_where_they_land_whatever_was_stored(): void
    {
        // Switched off before it became appointments-only: the workspace is still all it has.
        $this->org->setWorkspace('appointments', false);
        $this->org->forceFill(['entitled_products' => ['appointments', 'booking']])->save();
        $org = $this->org->fresh();

        $this->assertSame(['enabled' => true, 'landing' => true], $org->workspace('appointments'));
        $this->assertTrue($org->workspaceEnabled('appointments'));
        $this->assertTrue($org->workspaceIsException('appointments'));
        $this->assertSame(['appointments' => ['landing' => true, 'has_services' => true, 'only' => true]], $org->workspacesPayload());
    }

    public function test_switching_the_workspace_keeps_the_operator_mark(): void
    {
        $this->org->setAppointmentsOnly(false);
        $this->org->setWorkspace('appointments', true, landing: true);

        $this->assertFalse(data_get($this->org->fresh()->settings, 'workspaces.appointments.only'));
        $this->assertSame(['enabled' => true, 'landing' => true], $this->org->fresh()->workspace('appointments'));

        // A mark alone makes an exception for --list, even with the default switch.
        $this->org->setWorkspace('appointments', true);
        $this->assertTrue($this->org->fresh()->workspaceIsException('appointments'));
    }

    public function test_a_full_customer_is_told_only_false_and_is_otherwise_unchanged(): void
    {
        $this->assertSame(['appointments' => ['landing' => false, 'has_services' => true, 'only' => false]], $this->org->fresh()->workspacesPayload());
        $this->assertSame(['enabled' => true, 'landing' => false], $this->org->fresh()->workspace('appointments'));
        $this->assertFalse($this->org->fresh()->workspaceIsException('appointments'));
    }

    public function test_the_sign_in_answer_carries_only(): void
    {
        $this->org->forceFill(['entitled_products' => ['appointments', 'booking']])->save();

        $this->actingAs($this->staff, 'sanctum')->getJson('/api/v1/auth/me')->assertOk()
            ->assertJsonPath('workspaces.appointments.only', true)
            ->assertJsonPath('workspaces.appointments.landing', true);
    }

    public function test_billing_unreachable_falls_back_to_the_plans_products(): void
    {
        $products = new \ReflectionMethod(AuthController::class, 'getPlanProducts');
        $controller = app(AuthController::class);

        $this->assertSame(['appointments', 'booking'], $products->invoke($controller, 'appointments'));
        $this->assertSame(['crm', 'loyalty', 'booking', 'chat'], $products->invoke($controller, 'growth'));
        $this->assertSame(['crm', 'loyalty'], $products->invoke($controller, 'starter'));
    }
}
```

- [ ] **Step 3: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/AdminAccess/AppointmentsPlanTest.php`
  - Expected: FAIL — `Call to undefined method App\Models\Organization::appointmentsOnly()` (and
    `setAppointmentsOnly()`).

- [ ] **Step 4: Implement in `app/Models/Organization.php`.** In the `// ─── Workspaces ───` section:
  - Add the constant below `WORKSPACE_DEFAULTS`:

```php
    /** Products an organisation on the Appointments plan holds (Part C spec §6.1). */
    public const APPOINTMENTS_PLAN_PRODUCTS = ['appointments', 'booking'];
```

  - Replace `workspace()`, `workspaceIsException()` and `setWorkspace()` with:

```php
    /** @return array{enabled: bool, landing: bool} */
    public function workspace(string $name): array
    {
        // The Appointments plan IS the workspace: always on, and where its staff land.
        if ($name === 'appointments' && $this->appointmentsOnly()) {
            return ['enabled' => true, 'landing' => true];
        }

        $row = (array) data_get($this->settings ?? [], "workspaces.{$name}", []);
        $enabled = (bool) ($row['enabled'] ?? (self::WORKSPACE_DEFAULTS[$name] ?? false));

        return [
            'enabled' => $enabled,
            // Landing means nothing while the workspace is off.
            'landing' => $enabled && (bool) ($row['landing'] ?? false),
        ];
    }
```

```php
    /** Whether this organisation's setting differs from the default (off, landing on the workspace, or an appointments-only mark). */
    public function workspaceIsException(string $name): bool
    {
        if ($name === 'appointments' && $this->appointmentsOnlyMark() !== null) {
            return true;
        }

        return $this->workspace($name) !== ['enabled' => self::WORKSPACE_DEFAULTS[$name] ?? false, 'landing' => false];
    }

    public function setWorkspace(string $name, bool $enabled, bool $landing = false): void
    {
        $settings = $this->settings ?? [];
        $row = ['enabled' => $enabled, 'landing' => $enabled && $landing];
        // The operator's appointments-only mark is not this switch's to drop.
        $only = data_get($settings, "workspaces.{$name}.only");
        if (is_bool($only)) {
            $row['only'] = $only;
        }
        data_set($settings, "workspaces.{$name}", $row);
        $this->forceFill(['settings' => $settings])->save();
    }
```

  - In `workspacesPayload()`, after the `has_services` line inside `if ($name === 'appointments') { … }`, add:

```php
                $out[$name]['only'] = $this->appointmentsOnly();
```

    Update its docblock's `@return` to `array<string, array{landing: bool, has_services?: bool, only?: bool}>|null`.
  - Add after `workspacesPayload()`:

```php
    // ─── The Appointments plan (Part C) ────────────────────────
    // A cheaper plan with only the appointments workspace and the public
    // booking page: its staff reach nothing else (the `admin.access`
    // middleware answers 403 not_in_plan), they sign in to the workspace,
    // and loyalty is off whatever tiers exist.

    /**
     * Whether this organisation is on the Appointments plan. An operator's
     * mark decides first (`workspace:appointments --only` / `--not-only`);
     * otherwise billing's product list: `appointments` and nothing outside
     * APPOINTMENTS_PLAN_PRODUCTS; when that list is empty (billing could not
     * be reached, or a legacy organisation), the plan slug.
     */
    public function appointmentsOnly(): bool
    {
        $mark = $this->appointmentsOnlyMark();
        if ($mark !== null) {
            return $mark;
        }

        $products = (array) ($this->entitled_products ?: []);
        if ($products !== []) {
            return in_array('appointments', $products, true)
                && array_diff($products, self::APPOINTMENTS_PLAN_PRODUCTS) === [];
        }

        return $this->plan_slug === 'appointments';
    }

    /** 'operator' when an operator's mark decides, 'plan' when billing makes it appointments-only, null otherwise. */
    public function appointmentsOnlySource(): ?string
    {
        if ($this->appointmentsOnlyMark() !== null) {
            return 'operator';
        }

        return $this->appointmentsOnly() ? 'plan' : null;
    }

    /** For callers that hold only an id: the loyalty switch, guest enrolment, member sign-up, the access map. */
    public static function isAppointmentsOnly(?int $orgId): bool
    {
        return $orgId ? (bool) self::withoutGlobalScopes()->find($orgId)?->appointmentsOnly() : false;
    }

    /** true or false: an operator decides; null: billing decides again. */
    public function setAppointmentsOnly(?bool $only): void
    {
        $settings = $this->settings ?? [];
        $row = (array) data_get($settings, 'workspaces.appointments', []);
        if ($only === null) {
            unset($row['only']);
        } else {
            $row['only'] = $only;
        }
        data_set($settings, 'workspaces.appointments', $row);
        $this->forceFill(['settings' => $settings])->save();
    }

    private function appointmentsOnlyMark(): ?bool
    {
        $mark = data_get($this->settings ?? [], 'workspaces.appointments.only');

        return is_bool($mark) ? $mark : null;
    }
```

- [ ] **Step 5: Add the fallback** in `AuthController::getPlanProducts()`, after the `'enterprise'` line:

```php
            'appointments' => ['appointments', 'booking'],
```

- [ ] **Step 6: Update the payload tests (R8).**
  - In `tests/Feature/Appointments/WorkspaceGateTest.php`, `test_the_workspace_is_on_unless_an_organisation_is_switched_off`:
    each of the three `workspacesPayload()` expectations gains `, 'only' => false` after `has_services`. Example:
    `['appointments' => ['landing' => false, 'has_services' => false, 'only' => false]]`.
  - In `tests/Feature/Appointments/SignInWorkspacesTest.php`: the two `assertJsonPath('workspaces', [...])`
    expectations gain `, 'only' => false` the same way.

- [ ] **Step 7: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/AdminAccess/AppointmentsPlanTest.php`
  - Expected: PASS (7 tests).
  - Then run `tests/Feature/Appointments`.
  - Expected: every test passes. `test_the_key_costs_no_extra_read_of_the_organisation` still reads the
    organisation once.

- [ ] **Step 8: Commit** with the subject "Know which organisations are on the Appointments plan":

```bash
git add app/Models/Organization.php app/Http/Controllers/Api/V1/Auth/AuthController.php tests/Concerns/SetsUpAppointmentsSchema.php tests/Feature/AdminAccess/AppointmentsPlanTest.php tests/Feature/Appointments/WorkspaceGateTest.php tests/Feature/Appointments/SignInWorkspacesTest.php
git commit -F <ws>/tools/commit-2.txt
```

---

### Task 3: The record of refusals

**Files:**
- Create: `config/admin_access.php`, `database/migrations/2026_10_02_100000_create_admin_access_refusals.php`, `app/Support/AdminAccess/AccessRecorder.php`
- Modify: `tests/Concerns/MakesAdminCaller.php` (`staffUser()` builds the table)
- Test: `tests/Feature/AdminAccess/AccessRecorderTest.php`

**Interfaces:**
- Produces:
  - `config('admin_access.mode')` (`report` by default)
  - `AccessRecorder::TABLE = 'admin_access_refusals'`
  - `AccessRecorder::record(?int $orgId, int $userId, ?string $role, string $rule, string $method, string $reason, bool $enforced): void`
  - Table columns: `id, day, organization_id, user_id, role, rule, method, reason, enforced, hits, first_seen_at, last_seen_at`
  - Every test that calls `staffUser()` has the table.

- [ ] **Step 1: Write the failing test** `tests/Feature/AdminAccess/AccessRecorderTest.php`:

```php
<?php

namespace Tests\Feature\AdminAccess;

use App\Support\AdminAccess\AccessRecorder;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class AccessRecorderTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function record(string $method = 'PUT', bool $enforced = false, ?int $orgId = -1): void
    {
        app(AccessRecorder::class)->record($orgId === -1 ? $this->org->id : $orgId, $this->staff->id, 'staff', 'admin/settings', $method, 'not_allowed', $enforced);
    }

    public function test_one_row_per_day_person_rule_method_reason_and_mode_counted_up(): void
    {
        $this->record('put');
        $this->record('PUT');
        $this->record('POST');
        $this->record('PUT', enforced: true);
        $this->travel(1)->days();
        $this->record('PUT');

        $rows = DB::table('admin_access_refusals')->orderBy('id')->get();
        $this->assertCount(4, $rows);
        $this->assertSame(['2026-10-05', 'PUT', 2, 0], [(string) $rows[0]->day, $rows[0]->method, (int) $rows[0]->hits, (int) $rows[0]->enforced]);
        $this->assertSame(['POST', 1], [$rows[1]->method, (int) $rows[1]->hits]);
        $this->assertSame(['PUT', 1, 1], [$rows[2]->method, (int) $rows[2]->hits, (int) $rows[2]->enforced]);
        $this->assertSame(['2026-10-06', 1], [(string) $rows[3]->day, (int) $rows[3]->hits]);
        $this->assertSame(['staff', 'admin/settings', 'not_allowed', $this->org->id, $this->staff->id], [$rows[0]->role, $rows[0]->rule, $rows[0]->reason, (int) $rows[0]->organization_id, (int) $rows[0]->user_id]);
    }

    public function test_a_caller_with_no_organisation_is_counted_too(): void
    {
        $this->record(orgId: null);
        $this->record(orgId: null);

        $this->assertSame(2, (int) DB::table('admin_access_refusals')->whereNull('organization_id')->value('hits'));
    }

    public function test_the_migration_builds_the_table_the_recorder_writes(): void
    {
        Schema::drop('admin_access_refusals');
        (require base_path('database/migrations/2026_10_02_100000_create_admin_access_refusals.php'))->up();

        $this->record();

        $this->assertSame(
            ['id', 'day', 'organization_id', 'user_id', 'role', 'rule', 'method', 'reason', 'enforced', 'hits', 'first_seen_at', 'last_seen_at'],
            Schema::getColumnListing('admin_access_refusals'),
        );
        $this->assertSame(1, DB::table('admin_access_refusals')->count());
    }

    public function test_a_failure_to_record_is_a_warning_and_nothing_else(): void
    {
        Schema::drop('admin_access_refusals');
        Log::spy();

        $this->record();

        Log::shouldHaveReceived('warning')->once()->withArgs(fn (string $message) => str_contains($message, 'could not record a refusal'));
    }
}
```

- [ ] **Step 2: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/AdminAccess/AccessRecorderTest.php`
  - Expected: FAIL — `Class "App\Support\AdminAccess\AccessRecorder" not found`.

- [ ] **Step 3: Write** `config/admin_access.php`:

```php
<?php

/*
 * The admin access map's mode (Part C spec §5.4). `report` (the default, and
 * any value but `enforce`): the role and deactivation rules record what they
 * would refuse and let the call through. `enforce`: they refuse. The
 * Appointments plan's lock (not_in_plan) refuses in both. Switched in
 * Laravel Cloud with ADMIN_ACCESS_MODE; `php artisan admin-access:report`
 * shows the evidence first.
 */
return [
    'mode' => env('ADMIN_ACCESS_MODE', 'report'),
];
```

- [ ] **Step 4: Write** `database/migrations/2026_10_02_100000_create_admin_access_refusals.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What the admin access map refused, or would have refused in report mode:
 * one row per day, organisation, person, rule, method, reason and mode, with
 * a hit count (AccessRecorder). No request body, query or answer is kept.
 * Read by `php artisan admin-access:report`. Additive and reversible.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('admin_access_refusals')) {
            return;
        }

        Schema::create('admin_access_refusals', function (Blueprint $table) {
            $table->id();
            $table->date('day');
            $table->unsignedBigInteger('organization_id')->nullable();
            $table->unsignedBigInteger('user_id');
            $table->string('role', 32)->nullable();
            $table->string('rule', 191);
            $table->string('method', 10);
            $table->string('reason', 32);
            $table->boolean('enforced')->default(false);
            $table->unsignedInteger('hits')->default(1);
            $table->timestamp('first_seen_at');
            $table->timestamp('last_seen_at');
            $table->index(['day', 'organization_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_access_refusals');
    }
};
```

- [ ] **Step 5: Implement** `app/Support/AdminAccess/AccessRecorder.php`:

```php
<?php

namespace App\Support\AdminAccess;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * The evidence for switching the access map from report to enforce: one row
 * per (day, organisation, person, rule, method, reason, enforced) in
 * admin_access_refusals, its `hits` counted up. Never the request's body,
 * query or answer. Recording never changes an answer: a failure is a
 * warning in the log and nothing more.
 */
final class AccessRecorder
{
    public const TABLE = 'admin_access_refusals';

    public function record(?int $orgId, int $userId, ?string $role, string $rule, string $method, string $reason, bool $enforced): void
    {
        try {
            $now = now();
            $key = [
                'day'             => $now->toDateString(),
                'organization_id' => $orgId,
                'user_id'         => $userId,
                'rule'            => mb_substr($rule, 0, 191),
                'method'          => strtoupper($method),
                'reason'          => $reason,
                'enforced'        => $enforced,
            ];

            $updated = DB::table(self::TABLE)->where($key)->update([
                'hits'         => DB::raw('hits + 1'),
                'role'         => $role,
                'last_seen_at' => $now,
            ]);
            if ($updated === 0) {
                DB::table(self::TABLE)->insert($key + [
                    'role'          => $role,
                    'hits'          => 1,
                    'first_seen_at' => $now,
                    'last_seen_at'  => $now,
                ]);
            }
        } catch (\Throwable $e) {
            Log::warning('admin access: could not record a refusal', [
                'rule' => $rule, 'method' => $method, 'reason' => $reason, 'error' => $e->getMessage(),
            ]);
        }
    }
}
```

- [ ] **Step 6: Build the table in the shared fixture.** In `tests/Concerns/MakesAdminCaller.php`, inside
  `staffUser()`, after the `foreach` that adds the capability columns, add:

```php
        // The admin access map's record (AccessRecorder). Production builds it
        // with the 2026_10_02 migration; every admin call may write to it.
        if (!Schema::hasTable('admin_access_refusals')) {
            Schema::create('admin_access_refusals', function ($table) {
                $table->bigIncrements('id');
                $table->date('day');
                $table->unsignedBigInteger('organization_id')->nullable();
                $table->unsignedBigInteger('user_id');
                $table->string('role', 32)->nullable();
                $table->string('rule', 191);
                $table->string('method', 10);
                $table->string('reason', 32);
                $table->boolean('enforced')->default(false);
                $table->unsignedInteger('hits')->default(1);
                $table->timestamp('first_seen_at');
                $table->timestamp('last_seen_at');
            });
        }
```

  Also add one line to the trait's docblock: "…and the `admin_access_refusals` table the `admin.access` middleware
  writes."

- [ ] **Step 7: Run it.**
  - Run: same command as Step 2.
  - Expected: PASS (4 tests).

- [ ] **Step 8: Commit** with the subject "Keep a record of what the access map refuses":

```bash
git add config/admin_access.php database/migrations/2026_10_02_100000_create_admin_access_refusals.php app/Support/AdminAccess/AccessRecorder.php tests/Concerns/MakesAdminCaller.php tests/Feature/AdminAccess/AccessRecorderTest.php
git commit -F <ws>/tools/commit-3.txt
```

---

### Task 4: The decision

**Files:**
- Create: `app/Http/Middleware/AdminAccess.php`
- Modify: `bootstrap/app.php` (alias `'admin.access' => \App\Http\Middleware\AdminAccess::class,` after `'admin'`)
- Test: `tests/Feature/AdminAccess/AdminAccessDecisionTest.php`

**Interfaces:**
- Consumes:
  - `AccessMap::ruleFor()`, `Rule::forMethod()`, `AccessMap::PLAN_PRODUCTS`, `AccessMap::MANAGER_ROLES` (Task 1)
  - `Organization::isAppointmentsOnly()` (Task 2)
  - `AccessRecorder::record()` (Task 3)
- Produces:
  - middleware `admin.access`
  - `AdminAccess::enforcing(): bool`

- [ ] **Step 1: Write the failing test** `tests/Feature/AdminAccess/AdminAccessDecisionTest.php`:

```php
<?php

namespace Tests\Feature\AdminAccess;

use App\Http\Middleware\AdminAccess;
use App\Models\User;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Request;
use Illuminate\Routing\Route as RoutingRoute;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Symfony\Component\HttpFoundation\Response;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

/**
 * The access map's decision, called with the route production would
 * dispatch to and a next step that answers "passed" (planning ruling R5).
 * Enforce mode unless a test says otherwise.
 */
class AdminAccessDecisionTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        config(['admin_access.mode' => 'enforce']);
    }

    private function decide(User $user, string $method, string $uri, ?RoutingRoute $route = null): Response
    {
        $request = Request::create('/' . ltrim($uri, '/'), $method);
        $route ??= Route::getRoutes()->match($request);
        $request->setRouteResolver(fn () => $route);
        $request->setUserResolver(fn () => $user);

        return app(AdminAccess::class)->handle($request, fn () => response('passed'));
    }

    private function as(string $role, array $more = []): User
    {
        return $this->staffUser($this->org, array_merge(['role' => $role], $more));
    }

    private function assertPassed(Response $response, string $why = ''): void
    {
        $this->assertSame('passed', $response->getContent(), $why . ' ' . $response->getContent());
    }

    private function assertRefused(string $code, Response $response, string $why = ''): void
    {
        $this->assertSame(403, $response->getStatusCode(), $why . ' ' . $response->getContent());
        $this->assertSame($code, json_decode($response->getContent(), true)['error'], $why);
    }

    private function onTheAppointmentsPlan(): void
    {
        $this->org->forceFill(['entitled_products' => ['appointments', 'booking']])->save();
    }

    public function test_managers_change_settings_and_everyone_else_may_only_read_them(): void
    {
        foreach (['super_admin', 'manager'] as $role) {
            $this->assertPassed($this->decide($this->as($role), 'PUT', 'api/v1/admin/settings'), $role);
        }
        foreach (['staff', 'receptionist'] as $role) {
            $this->assertRefused('not_allowed', $this->decide($this->as($role), 'PUT', 'api/v1/admin/settings'), $role);
        }

        $refused = $this->decide($this->as('staff'), 'POST', 'api/v1/admin/team/invite');
        $this->assertSame(['error' => 'not_allowed', 'message' => 'Only an owner or a manager can do this.'], json_decode($refused->getContent(), true));

        $this->assertPassed($this->decide($this->as('staff'), 'GET', 'api/v1/admin/settings'));
    }

    public function test_head_is_a_read(): void
    {
        $this->assertPassed($this->decide($this->as('staff'), 'HEAD', 'api/v1/admin/settings'));
    }

    public function test_sensitive_reads_are_for_managers(): void
    {
        $this->assertRefused('not_allowed', $this->decide($this->as('staff'), 'GET', 'api/v1/admin/audit-logs'));
        $this->assertPassed($this->decide($this->staff, 'GET', 'api/v1/admin/audit-logs'));
    }

    public function test_pages_for_everyone_stay_open_and_the_overrides_hold(): void
    {
        $staff = $this->as('staff');

        $this->assertPassed($this->decide($staff, 'POST', 'api/v1/admin/guests'), 'guests');
        $this->assertPassed($this->decide($staff, 'GET', 'api/v1/admin/bookings'), 'bookings');
        $this->assertPassed($this->decide($staff, 'GET', 'api/v1/admin/team'), 'team list for the Planner');
        $this->assertPassed($this->decide($staff, 'POST', 'api/v1/admin/email-templates/7/send'), 'send a template');
        $this->assertPassed($this->decide($staff, 'POST', 'api/v1/admin/reviews/invitations'), 'ask for a review');

        $this->assertRefused('not_allowed', $this->decide($staff, 'GET', 'api/v1/admin/bookings/submissions'), 'submissions');
        $this->assertRefused('not_allowed', $this->decide($staff, 'PUT', 'api/v1/admin/email-templates/7'), 'edit a template');
    }

    public function test_a_capability_rule_admits_managers_and_staff_whose_flag_is_set(): void
    {
        $refused = $this->decide($this->as('staff'), 'GET', 'api/v1/admin/reporting/forecast');
        $this->assertRefused('not_allowed', $refused);
        $this->assertSame('Your account does not have permission for this.', json_decode($refused->getContent(), true)['message']);

        $this->assertPassed($this->decide($this->as('staff', ['can_view_analytics' => true]), 'GET', 'api/v1/admin/reporting/forecast'));
        // The fixture's manager has every flag off: managers meet every rule, as the menu shows them every page.
        $this->assertPassed($this->decide($this->staff, 'GET', 'api/v1/admin/reporting/forecast'));
    }

    public function test_a_deactivated_or_foreign_account_is_refused_and_the_operator_is_not(): void
    {
        $this->assertRefused('staff_inactive', $inactive = $this->decide($this->as('manager', ['is_active' => false]), 'GET', 'api/v1/admin/dashboard'));
        $this->assertSame(
            ['error' => 'staff_inactive', 'message' => 'Your access to this organisation has been switched off. Ask an owner or a manager.'],
            json_decode($inactive->getContent(), true),
        );

        // A manager of another organisation only: no staff row here.
        $foreign = $this->staffUser($this->otherOrganization());
        $this->assertRefused('staff_inactive', $this->decide($foreign, 'GET', 'api/v1/admin/dashboard'));

        config(['services.saas.platform_admin_emails' => $foreign->email]);
        $this->assertPassed($this->decide($foreign, 'PUT', 'api/v1/admin/settings'));
    }

    public function test_billing_and_the_industry_are_for_managers(): void
    {
        $this->assertRefused('not_allowed', $this->decide($this->as('staff'), 'POST', 'api/v1/auth/billing/checkout'));
        $this->assertRefused('not_allowed', $this->decide($this->as('staff'), 'POST', 'api/v1/auth/apply-industry'));
        $this->assertPassed($this->decide($this->staff, 'POST', 'api/v1/auth/billing/checkout'));
    }

    public function test_a_member_token_on_lead_intake_is_refused(): void
    {
        $this->assertRefused('staff_inactive', $this->decide(User::findOrFail($this->member->user_id), 'POST', 'api/v1/integrations/leads'));
    }

    public function test_a_route_no_key_matches_is_for_managers_and_named_in_the_record(): void
    {
        $probe = new RoutingRoute(['GET'], 'api/v1/admin/zz-unmapped-probe', fn () => null);

        $this->assertRefused('not_allowed', $this->decide($this->as('staff'), 'GET', 'api/v1/admin/zz-unmapped-probe', $probe));
        $this->assertPassed($this->decide($this->staff, 'GET', 'api/v1/admin/zz-unmapped-probe', $probe));
        $this->assertTrue(DB::table('admin_access_refusals')->where('rule', 'unmapped:admin/zz-unmapped-probe')->exists());
    }

    public function test_report_mode_records_what_it_would_refuse_and_lets_it_through(): void
    {
        config(['admin_access.mode' => 'report']);
        $staff = $this->as('staff');

        $this->assertPassed($this->decide($staff, 'PUT', 'api/v1/admin/settings'));
        $this->assertPassed($this->decide($staff, 'PUT', 'api/v1/admin/settings'));
        $this->assertPassed($this->decide($this->as('manager', ['is_active' => false]), 'GET', 'api/v1/admin/dashboard'));
        $this->assertPassed($this->decide($this->staff, 'PUT', 'api/v1/admin/settings')); // a manager: nothing to record

        $row = DB::table('admin_access_refusals')->where('reason', 'not_allowed')->first();
        $this->assertSame(['admin/settings', 'PUT', 'staff', 2, 0], [$row->rule, $row->method, $row->role, (int) $row->hits, (int) $row->enforced]);
        $this->assertSame(1, DB::table('admin_access_refusals')->where('reason', 'staff_inactive')->where('rule', 'admin/dashboard')->count());
        $this->assertSame(2, DB::table('admin_access_refusals')->count());
    }

    public function test_enforce_mode_records_what_it_refuses(): void
    {
        $this->decide($this->as('staff'), 'PUT', 'api/v1/admin/settings');

        $this->assertSame(1, (int) DB::table('admin_access_refusals')->where('rule', 'admin/settings')->value('enforced'));
    }

    public function test_the_appointments_plan_reaches_the_workspace_and_the_callers_own_account_only(): void
    {
        $this->onTheAppointmentsPlan();

        foreach (['GET api/v1/admin/appointments/bootstrap', 'GET api/v1/admin/me/preferences', 'GET api/v1/admin/branding/theme', 'POST api/v1/admin/push-token'] as $call) {
            [$method, $uri] = explode(' ', $call);
            $this->assertPassed($this->decide($this->staff, $method, $uri), $call);
        }

        $refused = $this->decide($this->staff, 'GET', 'api/v1/admin/members');
        $this->assertSame(['error' => 'not_in_plan', 'message' => "This is not part of your organisation's HexaTech plan."], json_decode($refused->getContent(), true));
        foreach (['POST api/v1/auth/billing/checkout', 'POST api/v1/auth/apply-industry', 'POST api/v1/integrations/leads', 'POST mcp', 'GET api/v1/admin/service-bookings'] as $call) {
            [$method, $uri] = explode(' ', $call);
            $this->assertRefused('not_in_plan', $this->decide($this->staff, $method, $uri), $call);
        }

        $this->assertSame(1, (int) DB::table('admin_access_refusals')->where('reason', 'not_in_plan')->where('rule', 'admin/members')->value('enforced'));
    }

    public function test_the_plans_lock_holds_in_report_mode_and_for_nobody_but_the_operator(): void
    {
        config(['admin_access.mode' => 'report']);
        $this->onTheAppointmentsPlan();

        $this->assertRefused('not_in_plan', $this->decide($this->staff, 'GET', 'api/v1/admin/members'));

        $operator = $this->staffUser($this->otherOrganization());
        config(['services.saas.platform_admin_emails' => $operator->email]);
        $this->assertPassed($this->decide($operator, 'GET', 'api/v1/admin/members'));
    }

    public function test_a_customer_with_appointments_and_more_is_a_full_customer(): void
    {
        $this->org->forceFill(['entitled_products' => ['appointments', 'crm']])->save();

        $this->assertPassed($this->decide($this->staff, 'GET', 'api/v1/admin/members'));
    }
}
```

- [ ] **Step 2: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/AdminAccess/AdminAccessDecisionTest.php`
  - Expected: FAIL — `Class "App\Http\Middleware\AdminAccess" does not exist` (from the container).

- [ ] **Step 3: Implement** `app/Http/Middleware/AdminAccess.php`:

```php
<?php

namespace App\Http\Middleware;

use App\Models\Organization;
use App\Models\Staff;
use App\Support\AdminAccess\AccessMap;
use App\Support\AdminAccess\AccessRecorder;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Routing\Route;
use Symfony\Component\HttpFoundation\Response;

/**
 * Says no on the server where only the menu said it before (Part C spec §5).
 * Runs on every /v1/admin route, after `admin` and before
 * `check.subscription`, and on four staff routes outside it. It decides in
 * this order:
 *
 *   1. a platform admin passes (the operator escape hatch RequireFeature and
 *      RequireStaffCapability already have);
 *   2. the route's rule comes from AccessMap;
 *   3. an organisation on the Appointments plan reaches only the workspace
 *      and the caller's own account: anything else is 403 not_in_plan, in
 *      every mode;
 *   4. the caller needs an active staff row in THIS organisation, else
 *      staff_inactive;
 *   5. the rule for the method (GET/HEAD read, anything else change) must be
 *      met, else not_allowed.
 *
 * Steps 4 and 5 refuse only when config('admin_access.mode') is `enforce`.
 * In report mode (the default) they record and let the call through. Every
 * refusal, made or not, is recorded (AccessRecorder). The route's own
 * middleware (staff.can, feature, workspace, admin:role) and the
 * controllers' own checks still run after this one.
 */
class AdminAccess
{
    private const MESSAGES = [
        'not_in_plan'    => "This is not part of your organisation's HexaTech plan.",
        'staff_inactive' => 'Your access to this organisation has been switched off. Ask an owner or a manager.',
        'not_allowed'    => 'Only an owner or a manager can do this.',
        'no_capability'  => 'Your account does not have permission for this.',
    ];

    public function __construct(private readonly AccessRecorder $recorder)
    {
    }

    /** Whether the role and deactivation rules refuse (enforce) or only record (report, the default). */
    public static function enforcing(): bool
    {
        return config('admin_access.mode') === 'enforce';
    }

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        $route = $request->route();
        // Authentication already refused an anonymous caller; a platform admin is the operator.
        if (!$user || !$route instanceof Route || $user->isPlatformAdmin()) {
            return $next($request);
        }

        $rule = AccessMap::ruleFor($route);
        $method = $request->method();
        $need = $rule->forMethod($method);
        $bound = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        $orgId = $bound ? (int) $bound : null;

        if (!in_array($rule->product, AccessMap::PLAN_PRODUCTS, true) && Organization::isAppointmentsOnly($orgId)) {
            $this->recorder->record($orgId, (int) $user->id, null, $rule->key, $method, 'not_in_plan', true);

            return $this->refusal('not_in_plan', 'not_in_plan');
        }

        // Tenant-scoped (TenantScope): this organisation's row, never another one's; an active one first.
        $staff = Staff::where('user_id', $user->id)->orderByDesc('is_active')->first();
        $reason = match (true) {
            $staff === null || !$staff->is_active => 'staff_inactive',
            !self::meets($staff, $need)           => 'not_allowed',
            default                               => null,
        };
        if ($reason === null) {
            return $next($request);
        }

        $enforce = self::enforcing();
        $this->recorder->record($orgId, (int) $user->id, $staff?->role, $rule->key, $method, $reason, $enforce);
        if (!$enforce) {
            return $next($request);
        }

        return $this->refusal($reason, $reason === 'not_allowed' && !in_array($need, ['staff', 'manager'], true) ? 'no_capability' : $reason);
    }

    /** Managers meet every rule; anyone active meets `staff`; a capability rule also admits staff whose flag is set. */
    private static function meets(Staff $staff, string $need): bool
    {
        if ($need === 'staff' || in_array($staff->role, AccessMap::MANAGER_ROLES, true)) {
            return true;
        }

        return $need !== 'manager' && (bool) $staff->getAttribute($need);
    }

    private function refusal(string $code, string $message): Response
    {
        return response()->json(['error' => $code, 'message' => self::MESSAGES[$message]], 403);
    }
}
```

- [ ] **Step 4: Register the alias** in `bootstrap/app.php`, in `$middleware->alias([...])` after the `'admin'` line:

```php
            'admin.access'       => \App\Http\Middleware\AdminAccess::class,
```

- [ ] **Step 5: Run it.**
  - Run: same command as Step 2.
  - Expected: PASS (14 tests).

- [ ] **Step 6: Commit** with the subject "Decide each admin call against the access map":

```bash
git add app/Http/Middleware/AdminAccess.php bootstrap/app.php tests/Feature/AdminAccess/AdminAccessDecisionTest.php
git commit -F <ws>/tools/commit-4.txt
```

---

### Task 5: On every admin route and four outside it

**Files:**
- Modify: `routes/api.php`:
  - the admin group (`Route::prefix('admin')->middleware(['admin', 'check.subscription'])`);
  - the five `auth/billing/*` routes and `auth/apply-industry`;
  - the `integrations` group.
- Modify: `routes/ai.php` (the `mcp` route's middleware list)
- Test: `tests/Feature/AdminAccess/AdminAccessWiringTest.php`

**Interfaces:**
- Consumes: `admin.access` (Task 4), `AccessMap::keyFor()` (Task 1), `Organization` plan columns (Task 2)
- Produces: the middleware in the route table at these places:
  - every `api/v1/admin/*` route, after `admin` and before `check.subscription`;
  - `POST api/v1/auth/billing/{checkout,activate,portal,refresh,start-trial}`, `POST api/v1/auth/apply-industry`,
    `POST api/v1/integrations/leads` and `POST mcp`.

- [ ] **Step 1: Write the failing test** `tests/Feature/AdminAccess/AdminAccessWiringTest.php`:

```php
<?php

namespace Tests\Feature\AdminAccess;

use App\Support\AdminAccess\AccessMap;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Routing\Route as RoutingRoute;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class AdminAccessWiringTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    private const OUTSIDE = [
        'api/v1/auth/billing/checkout', 'api/v1/auth/billing/activate', 'api/v1/auth/billing/portal',
        'api/v1/auth/billing/refresh', 'api/v1/auth/billing/start-trial', 'api/v1/auth/apply-industry',
        'api/v1/integrations/leads', 'mcp',
    ];

    /** @return Collection<int, RoutingRoute> */
    private function routes(): Collection
    {
        return collect(Route::getRoutes()->getRoutes());
    }

    public function test_every_admin_route_runs_the_map_between_admin_and_the_subscription_check(): void
    {
        $admin = $this->routes()->filter(fn (RoutingRoute $r) => str_starts_with($r->uri(), 'api/v1/admin/'));
        $this->assertGreaterThan(600, $admin->count());

        foreach ($admin as $route) {
            $middleware = $route->gatherMiddleware();
            $at = array_search('admin.access', $middleware, true);
            $this->assertNotFalse($at, "{$route->uri()} does not run admin.access");
            $this->assertGreaterThan(array_search('admin', $middleware, true), $at, "{$route->uri()}: admin.access runs before admin");
            $subscription = array_search('check.subscription', $middleware, true);
            if ($subscription !== false) {
                $this->assertLessThan($subscription, $at, "{$route->uri()}: admin.access runs after check.subscription");
            }
        }
    }

    public function test_the_staff_routes_outside_admin_run_it_and_the_callers_own_routes_do_not(): void
    {
        foreach (self::OUTSIDE as $uri) {
            $route = $this->routes()->first(fn (RoutingRoute $r) => $r->uri() === $uri && in_array('POST', $r->methods(), true));
            $this->assertNotNull($route, $uri);
            $this->assertContains('admin.access', $route->gatherMiddleware(), $uri);
        }

        foreach (['api/v1/auth/me', 'api/v1/auth/subscription', 'api/v1/auth/logout', 'api/v1/auth/push-token', 'api/v1/chatbot/message', 'api/v1/member/profile'] as $uri) {
            foreach ($this->routes()->filter(fn (RoutingRoute $r) => $r->uri() === $uri) as $route) {
                $this->assertNotContains('admin.access', $route->gatherMiddleware(), $uri);
            }
        }
    }

    public function test_every_route_that_runs_it_has_a_key(): void
    {
        $unmapped = $this->routes()
            ->filter(fn (RoutingRoute $r) => in_array('admin.access', $r->gatherMiddleware(), true))
            ->filter(fn (RoutingRoute $r) => AccessMap::keyFor($r) === null)
            ->map(fn (RoutingRoute $r) => $r->uri())->values()->all();

        $this->assertSame([], $unmapped);
    }

    public function test_in_report_mode_a_full_customer_works_as_before_and_is_recorded(): void
    {
        $this->setUpAppointments();
        config(['admin_access.mode' => 'report']);
        $receptionist = $this->staffUser($this->org, ['role' => 'receptionist']);

        $this->asStaff()->getJson($this->api('bootstrap'))->assertOk();
        $answer = $this->actingAs($receptionist, 'sanctum')->getJson('/api/v1/admin/audit-logs');

        $this->assertNotContains($answer->json('error'), ['not_allowed', 'staff_inactive', 'not_in_plan']);
        $this->assertSame(1, DB::table('admin_access_refusals')->where('rule', 'admin/audit-logs')->where('enforced', false)->count());
    }

    public function test_enforced_a_receptionist_is_refused_before_the_controller(): void
    {
        $this->setUpAppointments();
        config(['admin_access.mode' => 'enforce']);
        $receptionist = $this->staffUser($this->org, ['role' => 'receptionist']);

        $this->actingAs($receptionist, 'sanctum')->getJson('/api/v1/admin/audit-logs')
            ->assertStatus(403)
            ->assertExactJson(['error' => 'not_allowed', 'message' => 'Only an owner or a manager can do this.']);
        $this->actingAs($receptionist, 'sanctum')->getJson($this->api('bootstrap'))->assertOk();
    }

    public function test_an_appointments_only_organisation_reaches_the_workspace_and_nothing_else(): void
    {
        $this->setUpAppointments();
        $this->org->forceFill(['entitled_products' => ['appointments', 'booking']])->save();

        $this->asStaff()->getJson($this->api('bootstrap'))->assertOk();
        $this->asStaff()->getJson('/api/v1/admin/members')->assertStatus(403)->assertJsonPath('error', 'not_in_plan');
        $this->asStaff()->postJson('/api/v1/auth/billing/checkout', [])->assertStatus(403)->assertJsonPath('error', 'not_in_plan');
    }

    public function test_a_lapsed_appointments_only_workspace_still_gets_its_own_notice(): void
    {
        $this->setUpAppointments();
        $this->org->forceFill(['entitled_products' => ['appointments', 'booking'], 'subscription_status' => 'EXPIRED'])->save();

        $this->asStaff()->getJson($this->api('bootstrap'))->assertStatus(403)->assertJsonPath('error', 'subscription_required');
    }
}
```

- [ ] **Step 2: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/AdminAccess/AdminAccessWiringTest.php`
  - Expected: FAIL. The first two tests name routes that do not run `admin.access`. The appointments-only test
    gets something other than `not_in_plan`.

- [ ] **Step 3: Wire it.**
  - `routes/api.php`, the admin group:
    `Route::prefix('admin')->middleware(['admin', 'admin.access', 'check.subscription'])->group(function () {`
  - `routes/api.php`, the auth group. Each of the five billing routes and `apply-industry` takes `admin.access`
    beside its throttle. For example:

```php
            Route::post('billing/checkout',    [AuthController::class, 'billingCheckout'])->middleware(['throttle:30,1', 'admin.access']);
            Route::post('billing/activate',    [AuthController::class, 'billingActivate'])->middleware(['throttle:30,1', 'admin.access']);
            Route::post('billing/portal',      [AuthController::class, 'billingPortal'])->middleware(['throttle:30,1', 'admin.access']);
            Route::post('billing/refresh',     [AuthController::class, 'billingRefresh'])->middleware(['throttle:60,1', 'admin.access']);
            Route::post('billing/start-trial', [AuthController::class, 'billingStartTrial'])->middleware(['throttle:30,1', 'admin.access']);
```

```php
            Route::post('apply-industry',     [AuthController::class, 'applyIndustry'])->middleware(['throttle:5,1', 'admin.access']);
```

    Add one comment line above the billing routes: `// admin.access: billing and the industry are for owners and
    managers (Part C), and not part of the Appointments plan.`
  - `routes/api.php`, the integrations group:
    `Route::middleware(['auth:sanctum', 'tenant', 'admin.access', 'throttle:60,1'])`
  - `routes/ai.php`: in the `mcp` route's `->middleware([...])`, add `'admin.access',` right after `'admin',`.

- [ ] **Step 4: Run it.**
  - Run: same command as Step 2.
  - Expected: PASS (7 tests).
  - Then run, one call each:
    - `tests/Feature/AdminAccess`
    - `tests/Feature/Appointments`
    - `tests/Feature/Admin`
    - `tests/Feature/Middleware`
    - `tests/Feature/ChatGptTransport`
    - `tests/Feature/ChatGptTools`
    - `tests/Feature/LeadIntakeApiTest.php`
    - `tests/Feature/RouteControllersExistTest.php`
  - Expected: every one passes, or fails only as it did in the baseline. A test that counts queries on an admin
    route may count the one new staff lookup. Ledger a ruling if you change such a count.

- [ ] **Step 5: Commit** with the subject "Run the access map on every admin route and four staff routes":

```bash
git add routes/api.php routes/ai.php tests/Feature/AdminAccess/AdminAccessWiringTest.php
git commit -F <ws>/tools/commit-5.txt
```

---

### Task 6: No loyalty on the Appointments plan

**Files:**
- Modify: `app/Services/Portal/PortalBootstrap.php` (`loyaltyOn`)
- Modify: `app/Services/GuestMemberLinkService.php` (`ensureMemberForGuest`)
- Modify: `app/Http/Controllers/Api/V1/Auth/AuthController.php` (`register`)
- Test: `tests/Feature/AdminAccess/AppointmentsPlanLoyaltyTest.php`, one test added to
  `tests/Feature/Auth/PublicRegisterTenantIsolationTest.php`

**Interfaces:**
- Consumes: `Organization::appointmentsOnly()`, `Organization::isAppointmentsOnly()` (Task 2)
- Produces:
  - `PortalBootstrap::loyaltyOn($orgId)` is false for an appointments-only organisation;
  - `GuestMemberLinkService::ensureMemberForGuest()` returns null for one, and writes nothing;
  - `POST /v1/auth/register` for one answers 422 with the no-programme message.

- [ ] **Step 1: Write the failing test** `tests/Feature/AdminAccess/AppointmentsPlanLoyaltyTest.php`:

```php
<?php

namespace Tests\Feature\AdminAccess;

use App\Models\Guest;
use App\Models\User;
use App\Services\Loyalty\BookingPointsService;
use App\Services\Portal\PortalBootstrap;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class AppointmentsPlanLoyaltyTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function onTheAppointmentsPlan(): void
    {
        $this->org->forceFill(['entitled_products' => ['appointments', 'booking']])->save();
    }

    public function test_the_programme_is_off_whatever_tiers_exist(): void
    {
        $this->assertTrue(PortalBootstrap::loyaltyOn($this->org->id)); // the fixture's active Gold tier

        $this->onTheAppointmentsPlan();

        $this->assertFalse(PortalBootstrap::loyaltyOn($this->org->id));
        $this->asStaff()->getJson($this->api('bootstrap'))->assertOk()->assertJsonPath('loyalty.programme_on', false);
    }

    public function test_a_visit_earns_no_points(): void
    {
        $booking = $this->seedBooking(['member_id' => $this->member->id]);
        $this->assertNotSame('programme_off', app(BookingPointsService::class)->previewForServiceBooking($booking)['reason']);

        $this->onTheAppointmentsPlan();

        $this->assertSame(['points' => 0, 'reason' => 'programme_off'], app(BookingPointsService::class)->previewForServiceBooking($booking->fresh()));
    }

    public function test_a_new_client_with_an_email_stays_a_client(): void
    {
        // On a full plan Guest::created starts a membership, the member's sign-in first.
        Guest::create(['organization_id' => $this->org->id, 'full_name' => 'Full Plan', 'first_name' => 'Full', 'email' => 'full-plan@example.test']);
        $this->assertTrue(User::withoutGlobalScopes()->where('email', 'full-plan@example.test')->exists());

        $this->onTheAppointmentsPlan();

        // The widgets and the workspace both create guests; neither makes a member now.
        $guest = Guest::create(['organization_id' => $this->org->id, 'full_name' => 'Plan Only', 'first_name' => 'Plan', 'email' => 'plan-only@example.test']);
        $this->assertNull($guest->fresh()->member_id);
        $this->assertFalse(User::withoutGlobalScopes()->where('email', 'plan-only@example.test')->exists());

        $this->asStaff()->postJson($this->api('clients'), ['name' => 'Desk Client', 'email' => 'desk-client@example.test'])->assertSuccessful();
        $this->assertFalse(User::withoutGlobalScopes()->where('email', 'desk-client@example.test')->exists());
    }
}
```

- [ ] **Step 2: Add the sign-up test** to `tests/Feature/Auth/PublicRegisterTenantIsolationTest.php`, after
  `test_valid_org_token_enrols_caller_into_the_correct_organization_and_brand`:

```php
    // ─── The Appointments plan has no programme to join (Part C) ──────

    public function test_an_organisation_on_the_appointments_plan_takes_no_member_sign_ups(): void
    {
        if (!Schema::hasColumn('organizations', 'entitled_products')) {
            Schema::table('organizations', fn ($table) => $table->text('entitled_products')->nullable());
        }
        $org = $this->tenantWithLoyaltyProgram('Appointments Only Studio');
        $org->forceFill(['entitled_products' => ['appointments', 'booking']])->save();
        $email = 'plan_' . uniqid('', true) . '@example.test';

        $this->postJson(self::REGISTER, $this->payload([
            'email'     => $email,
            'org_token' => $this->defaultBrandOf($org)->widget_token,
        ]))
            ->assertStatus(422)
            ->assertJsonPath('message', 'Loyalty program is not configured for this hotel yet. Please contact reception.');

        $this->assertFalse(User::withoutGlobalScopes()->where('email', $email)->exists(), 'A refused sign-up wrote a user.');
    }
```

- [ ] **Step 3: Run them.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/AdminAccess/AppointmentsPlanLoyaltyTest.php tests/Feature/Auth/PublicRegisterTenantIsolationTest.php`
  - Expected: FAIL. `loyaltyOn` is still true, `previewForServiceBooking` gives points, the plan's guests make
    users, and the sign-up answers 201.
  - If the full-plan control in `test_a_new_client_with_an_email_stays_a_client` fails, the fixture cannot enrol.
    Ledger a ruling, and replace that control by asserting that `ensureMemberForGuest()` creates the member's user
    for a full customer.

- [ ] **Step 4: Implement.**
  - `PortalBootstrap::loyaltyOn()`: replace `if (!$org) { return false; }` with:

```php
        // The Appointments plan has no programme, whatever tiers its industry presets seeded (Part C).
        if (!$org || $org->appointmentsOnly()) {
            return false;
        }
```

  - `GuestMemberLinkService::ensureMemberForGuest()`: make this the first statement, and add
    `use App\Models\Organization;`:

```php
        // The Appointments plan has no programme: a client stays a client (Part C).
        if (Organization::isAppointmentsOnly((int) $guest->organization_id)) {
            return null;
        }
```

  - `AuthController::register()`: right after the `if (!app()->bound('current_organization_id')) { … }` block that
    follows the "Fail here, clearly" check, and before `// Resolve default tier up-front`, add:

```php
        // The Appointments plan has no programme to join (Part C), whatever tiers exist.
        if (\App\Models\Organization::isAppointmentsOnly((int) $orgId)) {
            return response()->json([
                'message' => 'Loyalty program is not configured for this hotel yet. Please contact reception.',
            ], 422);
        }
```

- [ ] **Step 5: Run them.**
  - Run: same command as Step 3.
  - Expected: PASS. The new file has 3 tests, and the register file's earlier tests still pass.
  - Then run `tests/Feature/Member` and `tests/Feature/Loyalty`.
  - Expected: as in the baseline.

- [ ] **Step 6: Commit** with the subject "Switch loyalty off for the Appointments plan":

```bash
git add app/Services/Portal/PortalBootstrap.php app/Services/GuestMemberLinkService.php app/Http/Controllers/Api/V1/Auth/AuthController.php tests/Feature/AdminAccess/AppointmentsPlanLoyaltyTest.php tests/Feature/Auth/PublicRegisterTenantIsolationTest.php
git commit -F <ws>/tools/commit-6.txt
```

---

### Task 7: The operator's override

**Files:**
- Modify: `app/Console/Commands/AppointmentsWorkspace.php`
- Test: `tests/Feature/AdminAccess/AppointmentsPlanCommandTest.php`; `tests/Feature/Appointments/WorkspaceGateTest.php`
  must stay green unchanged.

**Interfaces:**
- Consumes:
  - `Organization::setAppointmentsOnly()`, `appointmentsOnly()`, `appointmentsOnlySource()` (Task 2)
  - `PortalBootstrap::loyaltyOn()` (Task 6)
- Produces:
  - `workspace:appointments <org> --only [--force] | --not-only | --plan-decides`
  - The status line ends `, appointments-only: <yes|no>[ (<operator|plan>)]`.
  - `--list` gains an `appointments-only` column.

- [ ] **Step 1: Write the failing test** `tests/Feature/AdminAccess/AppointmentsPlanCommandTest.php`:

```php
<?php

namespace Tests\Feature\AdminAccess;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class AppointmentsPlanCommandTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    public function test_only_says_what_stops_and_asks_first(): void
    {
        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--only' => true])
            ->expectsOutputToContain('loyalty programme: on, and it will be off')
            ->expectsOutputToContain('loyalty members who lose the member portal and points: 1')
            ->expectsOutputToContain('active staff accounts who lose the full admin (they keep the workspace): 1')
            ->expectsConfirmation('Mark it appointments-only?', 'no')
            ->expectsOutputToContain('Nothing changed.')
            ->assertSuccessful();
        $this->assertFalse($this->org->fresh()->appointmentsOnly());

        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--only' => true, '--force' => true])
            ->expectsOutputToContain('appointments workspace ON, landing on, appointments-only: yes (operator)')
            ->assertSuccessful();
        $this->assertTrue($this->org->fresh()->appointmentsOnly());
    }

    public function test_not_only_and_plan_decides_set_and_clear_the_mark(): void
    {
        $this->org->forceFill(['entitled_products' => ['appointments', 'booking']])->save();

        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--status' => true])
            ->expectsOutputToContain('appointments workspace ON, landing on, appointments-only: yes (plan)')
            ->assertSuccessful();

        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--not-only' => true])
            ->expectsOutputToContain('appointments-only: no (operator)')
            ->assertSuccessful();
        $this->assertFalse($this->org->fresh()->appointmentsOnly());

        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--plan-decides' => true])
            ->expectsOutputToContain('appointments-only: yes (plan)')
            ->assertSuccessful();
        $this->assertNull(data_get($this->org->fresh()->settings, 'workspaces.appointments.only'));
    }

    public function test_a_full_customer_says_no(): void
    {
        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--status' => true])
            ->expectsOutputToContain('appointments workspace ON, landing off, appointments-only: no')
            ->assertSuccessful();
    }

    public function test_the_workspace_of_an_appointments_only_organisation_cannot_be_switched_off(): void
    {
        $this->org->setAppointmentsOnly(true);

        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--off' => true])
            ->expectsOutputToContain('--not-only')
            ->assertFailed();
        $this->assertTrue($this->org->fresh()->workspaceEnabled('appointments'));
    }

    public function test_two_marks_at_once_or_only_with_off_are_refused(): void
    {
        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--only' => true, '--not-only' => true])->assertFailed();
        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--not-only' => true, '--plan-decides' => true])->assertFailed();
        $this->artisan('workspace:appointments', ['org' => $this->org->id, '--only' => true, '--off' => true, '--force' => true])->assertFailed();
        $this->assertFalse($this->org->fresh()->appointmentsOnly());
    }

    public function test_the_list_shows_who_is_appointments_only_and_why(): void
    {
        $other = $this->otherOrganization();
        $other->forceFill(['entitled_products' => ['appointments']])->save();
        $this->org->setAppointmentsOnly(false);

        $this->artisan('workspace:appointments', ['--list' => true])
            ->expectsOutputToContain('appointments-only')
            ->expectsOutputToContain('yes (plan)')
            ->expectsOutputToContain('no (operator)')
            ->assertSuccessful();
    }
}
```

- [ ] **Step 2: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/AdminAccess/AppointmentsPlanCommandTest.php`
  - Expected: FAIL — `The "--only" option does not exist.`

- [ ] **Step 3: Implement.** Replace `app/Console/Commands/AppointmentsWorkspace.php` with:

```php
<?php

namespace App\Console\Commands;

use App\Models\LoyaltyMember;
use App\Models\Organization;
use App\Models\Staff;
use App\Services\Portal\PortalBootstrap;
use Illuminate\Console\Command;

/**
 * Switches the appointments workspace on or off for one organisation. Every
 * organisation has it by default (Organization::WORKSPACE_DEFAULTS), signing
 * in to the full admin; --off takes one out, --on --landing sends its staff
 * to the workspace after signing in, --list shows the organisations that
 * differ from the default.
 *
 * Off deletes nothing: the API answers 403, /appointments sends staff back
 * to the full admin and sign-in lands on the dashboard. It does not undo a
 * booking, a status change or a points award made while it was on.
 *
 * The Appointments plan (Part C): billing decides who is on it; --only and
 * --not-only override billing for one organisation, --plan-decides hands it
 * back. An appointments-only organisation has the workspace and nothing
 * else: no full admin, no loyalty. --only says what stops and asks first.
 */
class AppointmentsWorkspace extends Command
{
    protected $signature = 'workspace:appointments
                            {org? : Organization id}
                            {--on : Switch the workspace on}
                            {--off : Switch the workspace off}
                            {--landing : With --on: staff land on the workspace after signing in}
                            {--only : Mark the organization as on the Appointments plan (workspace only, no loyalty), whatever billing says}
                            {--not-only : Mark the organization as a full customer, whatever billing says}
                            {--plan-decides : Remove the mark: billing decides again}
                            {--force : With --only: do not ask for confirmation}
                            {--status : Show the current setting}
                            {--list : List the organizations that differ from the default (switched off, landing on the workspace, or marked)}';

    protected $description = 'Switch the appointments workspace on or off for an organization, and mark who is on the Appointments plan.';

    public function handle(): int
    {
        if ($this->option('list')) {
            $rows = Organization::query()->orderBy('id')->get()
                ->filter(fn (Organization $o) => $o->workspaceIsException('appointments'))
                ->map(fn (Organization $o) => [
                    $o->id,
                    $o->name,
                    $o->workspaceEnabled('appointments') ? 'on' : 'off',
                    $o->workspace('appointments')['landing'] ? 'workspace' : 'full admin',
                    self::onlyLabel($o),
                ])
                ->values()->all();

            if ($rows === []) {
                $this->line('Every organization has the appointments workspace on, landing on the full admin.');
            } else {
                $this->line('Every other organization has the appointments workspace on, landing on the full admin.');
                $this->table(['id', 'name', 'workspace', 'lands on', 'appointments-only'], $rows);
            }

            return self::SUCCESS;
        }

        $org = $this->argument('org') ? Organization::find((int) $this->argument('org')) : null;
        if (!$org) {
            $this->error('Name an existing organization: workspace:appointments <id> --on|--off|--only|--not-only|--plan-decides|--status (or --list).');

            return self::FAILURE;
        }
        if ($this->option('on') && $this->option('off')) {
            $this->error('Choose one of --on and --off.');

            return self::FAILURE;
        }
        if (count(array_filter([$this->option('only'), $this->option('not-only'), $this->option('plan-decides')])) > 1) {
            $this->error('Choose one of --only, --not-only and --plan-decides.');

            return self::FAILURE;
        }
        if ($this->option('only') && $this->option('off')) {
            $this->error('An appointments-only organization always has the workspace: --only cannot go with --off.');

            return self::FAILURE;
        }
        if ($this->option('off') && $org->appointmentsOnly()) {
            $this->error(sprintf(
                'org %d (%s) is on the Appointments plan (%s): the workspace is all it has and cannot be switched off. Run --not-only first if it should have the full admin.',
                $org->id,
                $org->name,
                $org->appointmentsOnlySource(),
            ));

            return self::FAILURE;
        }

        if ($this->option('only') && !$this->markOnly($org)) {
            return self::SUCCESS;
        }
        if ($this->option('not-only')) {
            $org->setAppointmentsOnly(false);
        }
        if ($this->option('plan-decides')) {
            $org->setAppointmentsOnly(null);
        }

        if ($this->option('on')) {
            $org->setWorkspace('appointments', true, (bool) $this->option('landing'));
        } elseif ($this->option('off')) {
            $org->setWorkspace('appointments', false);
        }

        $fresh = $org->fresh();
        $state = $fresh->workspace('appointments');
        $this->line(sprintf(
            'org %d (%s): appointments workspace %s%s, appointments-only: %s',
            $org->id,
            $org->name,
            $state['enabled'] ? 'ON' : 'off',
            $state['enabled'] ? ', landing ' . ($state['landing'] ? 'on' : 'off') : '',
            self::onlyLabel($fresh),
        ));

        return self::SUCCESS;
    }

    /** Says what stops, asks, then marks. False when the operator said no. */
    private function markOnly(Organization $org): bool
    {
        $members = LoyaltyMember::withoutGlobalScopes()->where('organization_id', $org->id)->count();
        $staff = Staff::withoutGlobalScopes()->where('organization_id', $org->id)->where('is_active', true)->count();

        $this->line(sprintf('Marking org %d (%s) appointments-only. What stops:', $org->id, $org->name));
        $this->line('  - loyalty programme: ' . (PortalBootstrap::loyaltyOn($org->id) ? 'on, and it will be off' : 'already off'));
        $this->line("  - loyalty members who lose the member portal and points: {$members}");
        $this->line("  - active staff accounts who lose the full admin (they keep the workspace): {$staff}");

        if (!$this->option('force') && !$this->confirm('Mark it appointments-only?', false)) {
            $this->line('Nothing changed.');

            return false;
        }

        $org->setAppointmentsOnly(true);

        return true;
    }

    private static function onlyLabel(Organization $org): string
    {
        $source = $org->appointmentsOnlySource();

        return ($org->appointmentsOnly() ? 'yes' : 'no') . ($source ? " ({$source})" : '');
    }
}
```

- [ ] **Step 4: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/AdminAccess/AppointmentsPlanCommandTest.php tests/Feature/Appointments/WorkspaceGateTest.php`
  - Expected: PASS. The new file has 6 tests, and every `WorkspaceGateTest` test passes unchanged, its command test
    included.

- [ ] **Step 5: Commit** with the subject "Let an operator mark an organisation appointments-only":

```bash
git add app/Console/Commands/AppointmentsWorkspace.php tests/Feature/AdminAccess/AppointmentsPlanCommandTest.php
git commit -F <ws>/tools/commit-7.txt
```

---

### Task 8: The report

**Files:**
- Create: `app/Console/Commands/AdminAccessReport.php`
- Test: `tests/Feature/AdminAccess/AdminAccessReportTest.php`

**Interfaces:**
- Consumes: `AccessRecorder::TABLE`, `AccessRecorder::record()` (Task 3), `AdminAccess::enforcing()` (Task 4)
- Produces: `php artisan admin-access:report {--days=7} {--org=}`

- [ ] **Step 1: Write the failing test** `tests/Feature/AdminAccess/AdminAccessReportTest.php`:

```php
<?php

namespace Tests\Feature\AdminAccess;

use App\Support\AdminAccess\AccessRecorder;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class AdminAccessReportTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function seedRecord(): void
    {
        $r = app(AccessRecorder::class);
        $colleague = $this->staffUser($this->org, ['role' => 'staff']);
        $r->record($this->org->id, $this->staff->id, 'staff', 'admin/settings', 'PUT', 'not_allowed', false);
        $r->record($this->org->id, $this->staff->id, 'staff', 'admin/settings', 'PUT', 'not_allowed', false);
        $r->record($this->org->id, $colleague->id, 'staff', 'admin/settings', 'PUT', 'not_allowed', false);
        $r->record($this->org->id, $colleague->id, null, 'admin/members', 'GET', 'not_in_plan', true);

        $this->travelTo(CarbonImmutable::parse('2026-09-20 09:00:00'));
        $r->record($this->org->id, $this->staff->id, 'staff', 'admin/settings', 'PUT', 'not_allowed', false);
        $this->travelTo(CarbonImmutable::parse('2026-10-05 06:00:00'));

        $other = $this->otherOrganization();
        $r->record($other->id, $this->staff->id, 'staff', 'admin/team', 'POST', 'not_allowed', false);
    }

    public function test_it_says_the_mode_and_sums_by_rule_method_and_outcome(): void
    {
        $this->seedRecord();

        $this->artisan('admin-access:report', ['--org' => $this->org->id])
            ->expectsOutputToContain('Mode: report')
            ->expectsOutputToContain('admin/settings')
            ->expectsOutputToContain('would refuse')
            ->expectsOutputToContain('Would refuse: 3 call(s) by 2 person(s) in 1 organization(s).')
            ->expectsOutputToContain('Refused: 1 call(s) by 1 person(s) in 1 organization(s).')
            ->doesntExpectOutputToContain('admin/team')
            ->assertSuccessful();

        $this->artisan('admin-access:report', ['--org' => $this->org->id, '--days' => 30])
            ->expectsOutputToContain('Would refuse: 4 call(s) by 2 person(s) in 1 organization(s).')
            ->assertSuccessful();

        $this->artisan('admin-access:report')
            ->expectsOutputToContain('admin/team')
            ->expectsOutputToContain('Would refuse: 4 call(s) by 2 person(s) in 2 organization(s).')
            ->assertSuccessful();
    }

    public function test_it_names_enforce_mode_and_an_empty_record(): void
    {
        config(['admin_access.mode' => 'enforce']);

        $this->artisan('admin-access:report')
            ->expectsOutputToContain('Mode: enforce')
            ->expectsOutputToContain('Nothing refused or recorded in the last 7 day(s).')
            ->assertSuccessful();
    }
}
```

- [ ] **Step 2: Run it.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/t.sh tests/Feature/AdminAccess/AdminAccessReportTest.php`
  - Expected: FAIL — `The command "admin-access:report" does not exist.`

- [ ] **Step 3: Implement** `app/Console/Commands/AdminAccessReport.php`:

```php
<?php

namespace App\Console\Commands;

use App\Http\Middleware\AdminAccess;
use App\Support\AdminAccess\AccessRecorder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * What the admin access map refused, or would have refused in report mode
 * (Part C spec §5.4): one line per rule, method, reason and outcome, then
 * the totals. Read it before setting ADMIN_ACCESS_MODE=enforce: every
 * "would refuse" line a real page needs is a map fix first.
 */
class AdminAccessReport extends Command
{
    protected $signature = 'admin-access:report
                            {--days=7 : How many days back, today included}
                            {--org= : Only this organization id}';

    protected $description = 'Summarise what the admin access map refused, or would have refused in report mode.';

    public function handle(): int
    {
        $days = max(1, (int) $this->option('days'));
        $this->line(AdminAccess::enforcing()
            ? 'Mode: enforce (ADMIN_ACCESS_MODE=enforce): roles and deactivated accounts are refused.'
            : 'Mode: report (ADMIN_ACCESS_MODE is not "enforce"): roles and deactivated accounts are recorded and let through.');

        $query = DB::table(AccessRecorder::TABLE)->where('day', '>=', now()->subDays($days - 1)->toDateString());
        if ($this->option('org') !== null) {
            $query->where('organization_id', (int) $this->option('org'));
        }

        $lines = (clone $query)
            ->selectRaw('rule, method, reason, enforced, SUM(hits) AS hits, COUNT(DISTINCT user_id) AS people, COUNT(DISTINCT organization_id) AS orgs, MAX(last_seen_at) AS last_seen')
            ->groupBy('rule', 'method', 'reason', 'enforced')
            ->orderByDesc('hits')
            ->get();

        if ($lines->isEmpty()) {
            $this->line("Nothing refused or recorded in the last {$days} day(s).");

            return self::SUCCESS;
        }

        $this->table(
            ['rule', 'method', 'reason', 'outcome', 'calls', 'people', 'organizations', 'last seen'],
            $lines->map(fn ($l) => [
                $l->rule, $l->method, $l->reason, $l->enforced ? 'refused' : 'would refuse',
                (int) $l->hits, (int) $l->people, (int) $l->orgs, (string) $l->last_seen,
            ])->all(),
        );

        foreach (['Would refuse' => false, 'Refused' => true] as $label => $enforced) {
            $total = (clone $query)->where('enforced', $enforced)
                ->selectRaw('COALESCE(SUM(hits), 0) AS hits, COUNT(DISTINCT user_id) AS people, COUNT(DISTINCT organization_id) AS orgs')
                ->first();
            $this->line(sprintf('%s: %d call(s) by %d person(s) in %d organization(s).', $label, $total->hits, $total->people, $total->orgs));
        }

        return self::SUCCESS;
    }
}
```

- [ ] **Step 4: Run it.**
  - Run: same command as Step 2.
  - Expected: PASS (2 tests).

- [ ] **Step 5: Commit** with the subject "Report what the access map refused":

```bash
git add app/Console/Commands/AdminAccessReport.php tests/Feature/AdminAccess/AdminAccessReportTest.php
git commit -F <ws>/tools/commit-8.txt
```

---

### Task 9: From every full-admin page to the workspace

**Files:**
- Modify: `frontend/src/appointments/lib/landing.ts` (whole file below), `frontend/src/appointments/lib/landing.test.ts`
- Modify: `frontend/src/stores/authStore.ts` (the `workspaces` type)
- Modify: `frontend/src/App.tsx` (`ProtectedRoute`, `FullscreenRoute`, one import)

**Interfaces:**
- Consumes: `workspaces.appointments.only` from sign-in and `/auth/me` (Task 2)
- Produces (from `appointments/lib/landing.ts`):
  - `isAppointmentsOnly(user): boolean`
  - `fullAdminRedirect(user): string | null` (`'/appointments'` or null)
  - `withAppointmentsOnly<T extends LandingUser>(user: T): T`
  - `landingPath(user, fallback)` sends an appointments-only user to `/appointments` unless the fallback is already a
    workspace path.

- [ ] **Step 1: Write the failing tests.** Add to `frontend/src/appointments/lib/landing.test.ts`. Extend the import
  to `import { fullAdminPathFor, fullAdminRedirect, isAppointmentsOnly, landingPath, loginPath, loginPathAfterExpiry, safeRedirect, showsAppointmentsLink, withAppointmentsOnly } from './landing'`,
  then append:

```ts
describe('the Appointments plan', () => {
  const only = { user_type: 'staff', workspaces: { appointments: { landing: true, has_services: true, only: true } } }

  it('lands in the workspace from every other path, and keeps a workspace path it was sent to', () => {
    expect(landingPath(only, '/')).toBe('/appointments')
    expect(landingPath(only, '/members')).toBe('/appointments')
    expect(landingPath(only, safeRedirect('/leads?tab=customers'))).toBe('/appointments')
    expect(landingPath(only, '/appointmentsx')).toBe('/appointments')
    expect(landingPath(only, '/appointments/clients/5')).toBe('/appointments/clients/5')
    expect(landingPath(only, '/appointments?open=12')).toBe('/appointments?open=12')
  })

  it('sends its staff from the full admin to the workspace, and nobody else', () => {
    expect(fullAdminRedirect(only)).toBe('/appointments')
    expect(fullAdminRedirect({ user_type: 'staff', workspaces: { appointments: { landing: true, only: false } } })).toBeNull()
    expect(fullAdminRedirect({ user_type: 'staff' })).toBeNull()
    expect(fullAdminRedirect(null)).toBeNull()
    expect(fullAdminRedirect({ user_type: 'member', workspaces: { appointments: { only: true } } })).toBeNull()
  })

  it('marks a stored user appointments-only without losing what it knew', () => {
    const before = { id: 3, user_type: 'staff', workspaces: { appointments: { landing: false, has_services: true } } }
    expect(withAppointmentsOnly(before)).toEqual({ id: 3, user_type: 'staff', workspaces: { appointments: { landing: true, has_services: true, only: true } } })
    expect(isAppointmentsOnly(withAppointmentsOnly({ user_type: 'staff' }))).toBe(true)
    expect(isAppointmentsOnly(before)).toBe(false)
  })
})
```

- [ ] **Step 2: Run them.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/fe.sh src/appointments/lib/landing.test.ts`
  - Expected: FAIL — `fullAdminRedirect`, `isAppointmentsOnly` and `withAppointmentsOnly` are not exported (tsc
    fails too).

- [ ] **Step 3: Implement.** Replace `frontend/src/appointments/lib/landing.ts` with the following. Every existing
  function is kept; the stray doc comment above `safeRedirect` moves back to `landingPath`.

```ts
interface LandingUser {
  user_type?: string
  workspaces?: { appointments?: { landing?: boolean; has_services?: boolean; only?: boolean } }
}

const WORKSPACE_PATH = /^\/appointments(\/|\?|$)/

/**
 * Whether the full admin shows its way into HexaTech Appointments (the menu
 * item and the button on the service-booking pages): staff of an
 * organisation that has the workspace and at least one active service.
 * The address itself works for every organisation that has it.
 */
export function showsAppointmentsLink(user: LandingUser | null | undefined): boolean {
  return user?.user_type !== 'member' && user?.workspaces?.appointments?.has_services === true
}

/**
 * Staff of an organisation on the Appointments plan: the workspace is all
 * they have, no full admin (Part C). The server refuses the rest of the
 * admin API (`not_in_plan`); this keeps the screens from asking.
 */
export function isAppointmentsOnly(user: LandingUser | null | undefined): boolean {
  return user?.user_type !== 'member' && user?.workspaces?.appointments?.only === true
}

/** Where the full admin sends a user it does not serve; null for everyone it does. */
export function fullAdminRedirect(user: LandingUser | null | undefined): string | null {
  return isAppointmentsOnly(user) ? '/appointments' : null
}

/** The same user, known from now on to be appointments-only: a session that signed in before the plan changed. */
export function withAppointmentsOnly<T extends LandingUser>(user: T): T {
  return {
    ...user,
    workspaces: { ...user.workspaces, appointments: { ...user.workspaces?.appointments, landing: true, only: true } },
  }
}

/**
 * Where a sign-in that ran out sends the user: back to the same workspace
 * page after signing in again; every other page keeps the plain sign-in it
 * always had.
 */
export function loginPathAfterExpiry(pathname: string, search: string): string {
  return /^\/appointments(\/|$)/.test(pathname) ? loginPath({ pathname, search }) : '/login'
}

/** "Full admin" from the workspace opens the same tool there. */
export function fullAdminPathFor(pathname: string): string {
  if (/^\/appointments\/?$/.test(pathname)) return '/service-bookings/calendar'
  if (/^\/appointments\/clients(\/|$)/.test(pathname)) return '/leads?tab=customers'
  return '/'
}

/**
 * A `?redirect=` the sign-in screen may follow: a path on this site, or the
 * dashboard. `//host` and `/\host` are other sites to a browser.
 */
export function safeRedirect(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '/'
}

/** The sign-in screen, set to bring the visitor back to where they were (see safeRedirect). */
export function loginPath(location: { pathname: string; search: string }): string {
  return `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`
}

/**
 * Where a user goes right after signing in. `fallback` is what the sign-in
 * screen would have used anyway ('/' or an explicit ?redirect=): the
 * workspace is chosen only when nothing else was asked for and the
 * organisation chose it (`--landing`); everyone else lands where they always
 * did. On the Appointments plan the workspace is all there is, whatever
 * the link asked for.
 */
export function landingPath(user: LandingUser | null | undefined, fallback: string): string {
  if (user?.user_type === 'member') return '/portal'
  if (isAppointmentsOnly(user)) return WORKSPACE_PATH.test(fallback) ? fallback : '/appointments'
  if (fallback === '/' && user?.workspaces?.appointments?.landing === true) return '/appointments'
  return fallback
}
```

- [ ] **Step 4: The stored user's type.** In `frontend/src/stores/authStore.ts`:
  - The `workspaces` field becomes
    `workspaces?: { appointments?: { landing?: boolean; has_services?: boolean; only?: boolean } }`.
  - Its comment gains: "`only` marks an organisation on the Appointments plan: no full admin (Part C)."

- [ ] **Step 5: The route guards.** In `frontend/src/App.tsx`:
  - Add the import `import { fullAdminRedirect } from './appointments/lib/landing'` beside the other imports.
  - In `ProtectedRoute`, after `const forceRerun = …`, add:

```tsx
  // The Appointments plan has no full admin: its staff go to the workspace before anything here asks the server.
  const toWorkspace = fullAdminRedirect(user)
```

  - In its `useEffect`, the first condition becomes
    `if (!token || user?.user_type !== 'staff' || toWorkspace) {` (comment: `// members and appointments-only
    staff skip the setup check`), and the dependency list becomes `[token, user, forceRerun, toWorkspace]`.
  - After `if (user?.user_type === 'member') return <Navigate to="/portal" replace />`, add:

```tsx
  if (toWorkspace) return <Navigate to={toWorkspace} replace />
```

  - In `FullscreenRoute`, `const { token } = useAuthStore()` becomes `const { token, user } = useAuthStore()`.
    After its `if (!token) …` line, add:

```tsx
  const toWorkspace = fullAdminRedirect(user)
  if (toWorkspace) return <Navigate to={toWorkspace} replace />
```

- [ ] **Step 6: Run them.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/fe.sh src/appointments/lib/landing.test.ts`,
    then `cd frontend && npx eslint src/App.tsx src/stores/authStore.ts`.
  - Expected: vitest PASS (every `landing.test.ts` test, the 3 new ones included); tsc 0; eslint 0.

- [ ] **Step 7: Commit** with the subject "Send appointments-only staff to the workspace from every full-admin page":

```bash
git add frontend/src/appointments/lib/landing.ts frontend/src/appointments/lib/landing.test.ts frontend/src/stores/authStore.ts frontend/src/App.tsx
git commit -F <ws>/tools/commit-9.txt
```

---

### Task 10: A workspace with nothing behind it

**Files:**
- Create: `frontend/src/appointments/lib/useAppointmentsOnly.ts`
- Create: `<ws>/tools/add-partc-strings.cjs` (used here and in Task 11)
- Modify: `frontend/src/appointments/AppointmentsShell.tsx`, `frontend/src/appointments/setup/ServiceEditor.tsx`
- Modify: the five `frontend/src/appointments/i18n/appointments.<lang>.json` (`shell.subscription_required_plan`)
- Test: `frontend/src/appointments/AppointmentsShell.test.tsx`, `frontend/src/appointments/setup/servicesTab.test.tsx`

**Interfaces:**
- Consumes: `isAppointmentsOnly()` (Task 9)
- Produces:
  - `useAppointmentsOnly(): boolean`;
  - the shell and the service editor show no link to the full admin on the plan;
  - the lapsed notice reads "Contact HexaTech to restore it." on the plan.

- [ ] **Step 1: Write the failing tests.**
  - `frontend/src/appointments/AppointmentsShell.test.tsx`: add `afterEach` to the vitest import. Below the
    existing `vi.mock(...)` lines, add:

```ts
const auth = vi.hoisted(() => ({ user: null as unknown }))
vi.mock('../stores/authStore', () => ({
  useAuthStore: (select?: (s: { user: unknown }) => unknown) => (select ? select({ user: auth.user }) : { user: auth.user }),
}))
```

    and append:

```ts
describe('AppointmentsShell on the Appointments plan', () => {
  const planUser = { user_type: 'staff', workspaces: { appointments: { landing: true, has_services: true, only: true } } }
  afterEach(() => { auth.user = null })

  it('has no way into the full admin', () => {
    auth.user = planUser
    const html = render({})
    expect(html).not.toContain('Full admin')
    expect(html).not.toContain('href="/service-bookings/calendar"')
    expect(html).toContain('page body')
  })

  it('says HexaTech puts a lapsed subscription right, with no button to the full admin', () => {
    auth.user = planUser
    const html = render({ data: undefined, isError: true, error: refused('subscription_required') })
    expect(html).toContain('Contact HexaTech to restore it.')
    expect(html).not.toContain('Billing')
    expect(html).not.toContain('Open the full admin')
    expect(html).not.toContain('href="/"')
  })

  it('leaves a full customer as it was', () => {
    auth.user = { user_type: 'staff', workspaces: { appointments: { landing: false, has_services: true, only: false } } }
    expect(render({})).toContain('Full admin')
  })
})
```

  - `frontend/src/appointments/setup/servicesTab.test.tsx`: below the existing `vi.mock('../lib/api', …)` line,
    add:

```ts
const auth = vi.hoisted(() => ({ user: null as unknown }))
vi.mock('../../stores/authStore', () => ({
  useAuthStore: (select?: (s: { user: unknown }) => unknown) => (select ? select({ user: auth.user }) : { user: auth.user }),
}))
```

    and add inside `describe('ServiceEditor', …)`:

```ts
  it('has no note pointing to the full admin on the Appointments plan', () => {
    auth.user = { user_type: 'staff', workspaces: { appointments: { only: true } } }
    try {
      const html = render(<ServiceEditor service={data.services[0]} data={data} onClose={() => {}} onSaved={() => {}} />)
      expect(html).not.toContain('href="/services"')
      expect(html).not.toContain('edited in the full admin')
      expect(html).toContain('Save')
    } finally {
      auth.user = null
    }
  })
```

- [ ] **Step 2: Run them.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/fe.sh src/appointments/AppointmentsShell.test.tsx src/appointments/setup/servicesTab.test.tsx`
  - Expected: FAIL. The plan user still sees "Full admin", the lapsed notice says "Billing", and the editor note is
    there.

- [ ] **Step 3: The hook** `frontend/src/appointments/lib/useAppointmentsOnly.ts`:

```ts
import { useAuthStore } from '../../stores/authStore'
import { isAppointmentsOnly } from './landing'

/** Whether the signed-in user's organisation is on the Appointments plan: there is no full admin to point to. */
export function useAppointmentsOnly(): boolean {
  return useAuthStore((s) => isAppointmentsOnly(s.user))
}
```

- [ ] **Step 4: The shell.** In `frontend/src/appointments/AppointmentsShell.tsx`:
  - Import `useAppointmentsOnly` from `./lib/useAppointmentsOnly`, and add
    `const appointmentsOnly = useAppointmentsOnly()` after `const { data, … } = useAppointments()`.
  - Wrap both "Full admin" `<Link to={fullAdmin} …>` elements (the rail's and the phone menu's) in
    `{!appointmentsOnly && ( … )}`.
  - In the `stopped` block, the notice's text becomes:

```tsx
              {lapsed
                ? (appointmentsOnly
                  ? t('appointments.shell.subscription_required_plan', 'Your organisation\'s subscription is not active, so the workspace cannot open. Your bookings are unchanged. Contact HexaTech to restore it.')
                  : t('appointments.shell.subscription_required', 'Your organisation\'s subscription is not active, so the workspace cannot open. Your bookings are unchanged. An administrator can restore access under Billing in the full admin.'))
                : t('appointments.shell.switched_off', 'The appointments workspace has been switched off for your organisation. Your bookings are unchanged and remain in the full admin.')}
```

  - The "Open the full admin" `<Link to="/" …>` below it is wrapped in `{!appointmentsOnly && ( … )}`.
  - The component's doc comment's last sentence becomes: "Nothing here links into the full admin except the one
    'Full admin' entry in the secondary area, and not even that on the Appointments plan, which has no full admin."

- [ ] **Step 5: The service editor.** In `frontend/src/appointments/setup/ServiceEditor.tsx`:
  - Import `useAppointmentsOnly` from `../lib/useAppointmentsOnly`, and add
    `const appointmentsOnly = useAppointmentsOnly()` after `const vocab = useVocab()`.
  - Wrap the `<p className="text-xs text-a-text-2">` that holds the `appointments.setup.services.full_admin` note
    and its `<Link to="/services">` in `{!appointmentsOnly && ( … )}`.

- [ ] **Step 6: The string in five languages.** Write `<ws>/tools/add-partc-strings.cjs` with the Write tool, not a
  heredoc:

```js
// node <ws>/tools/add-partc-strings.cjs plan|access — run from the feature worktree root.
// Inserts Part C's strings into the hand-formatted bundles as text, after a known line, keeping each file's line
// endings, then proves the file still parses. `plan`: shell.subscription_required_plan in the workspace bundles.
// `access`: auth.access_off in the app's common.json bundles.
const fs = require('fs')
const which = process.argv[2]
const strings = {
  en: {
    plan: "Your organisation's subscription is not active, so the workspace cannot open. Your bookings are unchanged. Contact HexaTech to restore it.",
    access: 'Your access to this organisation has been switched off. Ask an owner or a manager to turn it back on.',
  },
  ru: {
    plan: 'Подписка вашей организации не активна, поэтому рабочее место записей не открывается. Записи не изменились. Чтобы восстановить доступ, свяжитесь с HexaTech.',
    access: 'Ваш доступ к этой организации отключён. Попросите владельца или менеджера включить его снова.',
  },
  de: {
    plan: 'Das Abonnement Ihrer Organisation ist nicht aktiv, daher lässt sich der Arbeitsbereich nicht öffnen. Ihre Buchungen sind unverändert. Wenden Sie sich an HexaTech, um den Zugang wiederherzustellen.',
    access: 'Ihr Zugang zu dieser Organisation wurde abgeschaltet. Bitten Sie einen Inhaber oder Manager, ihn wieder einzuschalten.',
  },
  fr: {
    plan: "L'abonnement de votre organisation n'est pas actif : l'espace ne peut pas s'ouvrir. Vos réservations sont inchangées. Contactez HexaTech pour le rétablir.",
    access: "Votre accès à cette organisation a été désactivé. Demandez à un propriétaire ou à un responsable de le réactiver.",
  },
  es: {
    plan: 'La suscripción de su organización no está activa, por lo que el espacio no puede abrirse. Sus reservas no han cambiado. Póngase en contacto con HexaTech para restablecerlo.',
    access: 'Su acceso a esta organización se ha desactivado. Pida a un propietario o a un responsable que lo vuelva a activar.',
  },
}
function insertAfter(file, anchor, key, value, indent) {
  let raw = fs.readFileSync(file, 'utf8')
  if (raw.includes(`"${key}":`)) { console.log(`${file}: ${key} already there`); return }
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  const m = raw.match(anchor)
  if (!m) throw new Error(`${file}: the anchor line is not where it was`)
  raw = raw.replace(m[0], m[0] + `${indent}"${key}": ${JSON.stringify(value)},${eol}`)
  JSON.parse(raw)
  fs.writeFileSync(file, raw)
  console.log(`${file}: ${key} added`)
}
for (const [lang, s] of Object.entries(strings)) {
  if (which === 'plan') {
    insertAfter(`frontend/src/appointments/i18n/appointments.${lang}.json`, /\r?\n    "subscription_required": "[^"\r\n]*",\r?\n/, 'subscription_required_plan', s.plan, '    ')
  } else if (which === 'access') {
    insertAfter(`frontend/src/i18n/locales/${lang}/common.json`, /\r?\n  "auth": \{\r?\n/, 'access_off', s.access, '    ')
  } else {
    throw new Error('say plan or access')
  }
}
```

  Run `node <ws>/tools/add-partc-strings.cjs plan` from the feature worktree root.
  Expected: five "subscription_required_plan added" lines.

- [ ] **Step 7: Run them.**
  - Run: `bash .superpowers/sdd/2026-09-30-appointments-workspace/tools/fe.sh` (the default paths: the whole
    workspace folder and the locale sweep).
  - Expected: vitest PASS, including the 4 new tests and `appointmentsLocales.test.ts` finding the new key in all
    five bundles; tsc 0; eslint 0.
  - The shell and the editor now read the auth store. If another test that renders either one now fails while
    loading the real store, give that test the same `vi.mock` of the store (user `null`), and ledger it.

- [ ] **Step 8: Commit** with the subject "Keep the workspace from pointing appointments-only staff at the full
  admin":

```bash
git add frontend/src/appointments/lib/useAppointmentsOnly.ts frontend/src/appointments/AppointmentsShell.tsx frontend/src/appointments/AppointmentsShell.test.tsx frontend/src/appointments/setup/ServiceEditor.tsx frontend/src/appointments/setup/servicesTab.test.tsx frontend/src/appointments/i18n/appointments.en.json frontend/src/appointments/i18n/appointments.ru.json frontend/src/appointments/i18n/appointments.de.json frontend/src/appointments/i18n/appointments.fr.json frontend/src/appointments/i18n/appointments.es.json
git commit -F <ws>/tools/commit-10.txt
```

---

### Task 11: The two refusals every page shares, and the sign-in notice

**Files:**
- Create: `frontend/src/lib/accessOff.ts`, `frontend/src/lib/api.refusals.test.ts`
- Create: `frontend/src/components/AccessOffNotice.tsx`, `frontend/src/components/AccessOffNotice.test.tsx`
- Modify: `frontend/src/lib/api.ts` (the response interceptor), `frontend/src/pages/Login.tsx` (one import, one
  line)
- Modify: the five `frontend/src/i18n/locales/<lang>/common.json` (`auth.access_off`)

**Interfaces:**
- Consumes: `withAppointmentsOnly()` (Task 9), `<ws>/tools/add-partc-strings.cjs` (Task 10)
- Produces:
  - `ACCESS_OFF_REASON = 'access_off'`, `ACCESS_OFF_LOGIN = '/login?reason=access_off'`
  - `refusalOf(error): 'staff_inactive' | 'not_in_plan' | null`
  - `<AccessOffNotice reason={string | null} />`

- [ ] **Step 1: Write the failing tests.**
  - `frontend/src/lib/api.refusals.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The shared API client's answer to the two refusals of Part C, for every
 * page: a deactivated account is signed out and told why; a session that
 * signed in before its organisation moved to the Appointments plan is
 * marked appointments-only and taken to the workspace (planning ruling R2).
 */
const store = vi.hoisted(() => ({
  state: { user: { id: 3, user_type: 'staff', workspaces: { appointments: { landing: false, has_services: true, only: false } } } as Record<string, unknown> | null },
}))
vi.mock('./logout', () => ({ logoutAndRedirect: vi.fn(async () => {}) }))
vi.mock('../stores/authStore', () => ({
  useAuthStore: {
    getState: () => store.state,
    setState: (next: Record<string, unknown>) => { store.state = { ...store.state, ...next } },
  },
}))

const location = { pathname: '/members', search: '', href: '', hostname: 'app.test' }
;(globalThis as unknown as { window: unknown }).window = { location, dispatchEvent: () => true }

const { api } = await import('./api')
const { logoutAndRedirect } = await import('./logout')
const { refusalOf } = await import('./accessOff')

type Handler = { rejected: (error: unknown) => Promise<unknown> }
const onError = (api.interceptors.response as unknown as { handlers: Handler[] }).handlers[0].rejected
const refused = (code: string) => ({ response: { status: 403, data: { error: code } }, config: { url: '/v1/admin/members' } })
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('the shared API client', () => {
  afterEach(() => {
    vi.mocked(logoutAndRedirect).mockClear()
    location.href = ''
    location.pathname = '/members'
  })

  it('reads only the two refusals it acts on', () => {
    expect(refusalOf(refused('staff_inactive'))).toBe('staff_inactive')
    expect(refusalOf(refused('not_in_plan'))).toBe('not_in_plan')
    expect(refusalOf(refused('not_allowed'))).toBeNull()
    expect(refusalOf({ response: { status: 401, data: { error: 'staff_inactive' } } })).toBeNull()
    expect(refusalOf(null)).toBeNull()
  })

  it('signs out a deactivated account and says why on the sign-in screen', async () => {
    await expect(onError(refused('staff_inactive'))).rejects.toBeTruthy()
    await vi.waitFor(() => expect(logoutAndRedirect).toHaveBeenCalledWith('/login?reason=access_off'))
  })

  it('takes a session that predates the Appointments plan to the workspace, marked appointments-only', async () => {
    await expect(onError(refused('not_in_plan'))).rejects.toBeTruthy()
    await vi.waitFor(() => expect(location.href).toBe('/appointments'))
    expect(store.state?.user).toMatchObject({ workspaces: { appointments: { only: true, landing: true, has_services: true } } })
    expect(logoutAndRedirect).not.toHaveBeenCalled()
  })

  it('never reloads the workspace itself, and leaves every other refusal to the page', async () => {
    location.pathname = '/appointments/clients'
    await expect(onError(refused('not_in_plan'))).rejects.toBeTruthy()
    location.pathname = '/members'
    await expect(onError(refused('not_allowed'))).rejects.toBeTruthy()
    await settle()
    expect(location.href).toBe('')
    expect(logoutAndRedirect).not.toHaveBeenCalled()
  })
})
```

  - `frontend/src/components/AccessOffNotice.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import fs from 'node:fs'
import path from 'node:path'

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }))

const { AccessOffNotice } = await import('./AccessOffNotice')

describe('AccessOffNotice', () => {
  it('says why only when the API client sent the visitor here for that reason', () => {
    expect(renderToStaticMarkup(<AccessOffNotice reason="access_off" />)).toContain('Your access to this organisation has been switched off.')
    expect(renderToStaticMarkup(<AccessOffNotice reason={null} />)).toBe('')
    expect(renderToStaticMarkup(<AccessOffNotice reason="expired" />)).toBe('')
  })

  it('is said in all five languages', () => {
    for (const lang of ['en', 'ru', 'de', 'fr', 'es']) {
      const bundle = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../i18n/locales/${lang}/common.json`), 'utf8'))
      expect(typeof bundle.auth.access_off, lang).toBe('string')
    }
  })

  it('is shown on the sign-in screen', () => {
    const login = fs.readFileSync(path.resolve(__dirname, '../pages/Login.tsx'), 'utf8')
    expect(login).toContain("<AccessOffNotice reason={searchParams.get('reason')} />")
  })
})
```

- [ ] **Step 2: Run them.**
  - Run: `cd frontend && npx vitest run src/lib/api.refusals.test.ts src/components/AccessOffNotice.test.tsx`
  - Expected: FAIL — `Failed to load url ./accessOff` and `./AccessOffNotice`.

- [ ] **Step 3: Implement** `frontend/src/lib/accessOff.ts`:

```ts
/**
 * Two refusals the shared API client answers for every page (Part C):
 * - 403 `staff_inactive`: this sign-in's access to the organisation was
 *   switched off. It is signed out, and the sign-in screen says why.
 * - 403 `not_in_plan`: the organisation is on the Appointments plan, which
 *   has no full admin. A session that signed in before the plan changed is
 *   marked appointments-only and taken to the workspace.
 */
export const ACCESS_OFF_REASON = 'access_off'
export const ACCESS_OFF_LOGIN = `/login?reason=${ACCESS_OFF_REASON}`

type Refusal = { response?: { status?: number; data?: { error?: unknown } } }

export function refusalOf(error: unknown): 'staff_inactive' | 'not_in_plan' | null {
  const response = (error as Refusal | null)?.response
  if (response?.status !== 403) return null
  const code = response.data?.error
  return code === 'staff_inactive' || code === 'not_in_plan' ? code : null
}
```

- [ ] **Step 4: The interceptor.** In `frontend/src/lib/api.ts`:
  - The import line becomes `import { loginPathAfterExpiry, withAppointmentsOnly } from '../appointments/lib/landing'`.
  - Add `import { ACCESS_OFF_LOGIN, refusalOf } from './accessOff'`.
  - In the response interceptor's error handler, after the 401 block and before the `subscription_required` block,
    add:

```ts
    // Part C. A deactivated account is signed out and told why. A session that signed in before its organisation
    // moved to the Appointments plan is marked appointments-only and taken to the workspace (never from inside it).
    const refusal = refusalOf(error)
    if (refusal === 'staff_inactive') {
      import('./logout').then(({ logoutAndRedirect }) => { void logoutAndRedirect(ACCESS_OFF_LOGIN) })
    }
    if (refusal === 'not_in_plan' && !/^\/appointments(\/|$)/.test(window.location.pathname)) {
      import('../stores/authStore').then(({ useAuthStore }) => {
        const { user } = useAuthStore.getState()
        if (user) useAuthStore.setState({ user: withAppointmentsOnly(user) })
        window.location.href = `${APP_BASE}/appointments`
      })
    }
```

- [ ] **Step 5: The notice** `frontend/src/components/AccessOffNotice.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { ACCESS_OFF_REASON } from '../lib/accessOff'

/** What the sign-in screen tells someone whose access was switched off (the API client sent them here). */
export function AccessOffNotice({ reason }: { reason: string | null }) {
  const { t } = useTranslation()
  if (reason !== ACCESS_OFF_REASON) return null
  return (
    <div role="status" className="bg-amber-500/10 border border-amber-500/20 text-amber-300 px-4 py-3 rounded-lg mb-4 text-sm">
      {t('auth.access_off', 'Your access to this organisation has been switched off. Ask an owner or a manager to turn it back on.')}
    </div>
  )
}
```

  In `frontend/src/pages/Login.tsx`, import it (`import { AccessOffNotice } from '../components/AccessOffNotice'`).
  Add the following line directly above the `{error && (` block that sits above `{/* ── Login ── */}`:

```tsx
          {view === 'login' && <AccessOffNotice reason={searchParams.get('reason')} />}
```

- [ ] **Step 6: The string in five languages.** Run `node <ws>/tools/add-partc-strings.cjs access` from the feature
  worktree root.
  Expected: five "access_off added" lines.

- [ ] **Step 7: Run them.**
  - Run: `cd frontend && npx vitest run src/lib/api.refusals.test.ts src/components/AccessOffNotice.test.tsx src/i18n/localeCompleteness.test.ts src/lib/localisedCopy.test.ts && npx tsc -b && npx eslint src/lib/api.ts src/lib/accessOff.ts src/components/AccessOffNotice.tsx src/pages/Login.tsx`
  - Expected: vitest PASS (the 7 new tests among them); tsc 0; eslint 0. An eslint finding in `Login.tsx` that is
    also on `main` is pre-existing: ledger it, do not fix it here.

- [ ] **Step 8: Commit** with the subject "Sign out a deactivated account and move a stale session to the workspace":

```bash
git add frontend/src/lib/accessOff.ts frontend/src/lib/api.ts frontend/src/lib/api.refusals.test.ts frontend/src/components/AccessOffNotice.tsx frontend/src/components/AccessOffNotice.test.tsx frontend/src/pages/Login.tsx frontend/src/i18n/locales/en/common.json frontend/src/i18n/locales/ru/common.json frontend/src/i18n/locales/de/common.json frontend/src/i18n/locales/fr/common.json frontend/src/i18n/locales/es/common.json
git commit -F <ws>/tools/commit-11.txt
```

---

### Task 12: The runbook, the rule, the whole branch and the browser

**Files:**
- Modify: `docs/appointments-workspace.md`, `CLAUDE.md`

- [ ] **Step 1: The runbook.** In `docs/appointments-workspace.md`:
  - In "Who has it, and the two ways in", add a last paragraph: "**On the Appointments plan** (Part C) the workspace
    is all an organisation has: its staff sign in to it, and it has no way into the full admin. See 'Selling
    Appointments on its own'."
  - In the "Switching it on and off" table, add three rows: `--only` (say what stops, ask, mark), `--not-only` and
    `--plan-decides`. Add one sentence: "`--off` is refused while an organisation is appointments-only."
  - Replace the section "Before it is sold on its own" with the two sections below.
  - In "Deploying it", replace "There is no migration." with "Part C adds one additive migration
    (`admin_access_refusals`)." Then add these bullets:
    - (Part C) every `/v1/admin` route, billing, the industry switch, lead intake and the connector run the access
      map; in report mode (no `ADMIN_ACCESS_MODE`) it refuses only `not_in_plan`;
    - (Part C) sign-in and `/auth/me` carry `workspaces.appointments.only`;
    - (Part C) a deactivated account is signed out on its next refused call once enforced.

  The two new sections:

```markdown
## Selling Appointments on its own (Part C, 2026-10-02)

An organisation on the **Appointments plan** has the workspace and the public booking page, and nothing else:

- its staff sign in straight to the workspace, and every full-admin address sends them back to it;
- every other admin endpoint answers 403 `not_in_plan`: billing self-service, the industry switch, lead intake
  with an API token and the ChatGPT / Claude connector included;
- loyalty is off whatever tiers exist: no member portal, no points, no member pricing, no loyalty card in the
  workspace; a new client (from the widget or the desk) is not made a member, and member sign-up is refused;
- the public booking page and the widgets are unchanged.

**Who is on it** (`Organization::appointmentsOnly()`), in this order:

1. an operator's mark (`--only`, `--not-only`);
2. billing's products: `appointments` and nothing outside `appointments` and `booking`;
3. when billing sent no products, the plan slug `appointments`.

| To | Run |
|---|---|
| Mark an organisation appointments-only (it says what stops and asks first) | `php artisan workspace:appointments <org id> --only` (add `--force` to skip the question) |
| Mark it a full customer whatever billing says | `php artisan workspace:appointments <org id> --not-only` |
| Let billing decide again | `php artisan workspace:appointments <org id> --plan-decides` |
| See who is on it and why | `--status` for one organisation, `--list` for all that differ from the default |

**Billing handover (the owner, in the billing application):**

- a product with slug `appointments`;
- a plan "Appointments" (slug `appointments`) with products `appointments` and `booking`, and its price, trial and
  limits;
- the sign-up page lists the plan as soon as billing does;
- moving an existing customer onto it closes their full admin and stops their loyalty within 5 minutes, or at once
  through the entitlement webhook;
- when billing cannot be reached, the plan's fallback products are `appointments` and `booking`.

**Not on the plan yet:** editing service photos, the gallery and the long description (full admin only); billing
self-service (plan and payment changes go through HexaTech).

## Admin access map (every organisation)

`App\Support\AdminAccess\AccessMap` says who may call each staff route. Each key is a URI template without
`api/v1/`, matched on whole segments, and the longest key wins. A key gives:

- a **read** rule (GET, HEAD) and a **change** rule (other methods): `staff`, `manager` (`super_admin` or
  `manager`), or a capability (`can_view_analytics`, `can_manage_offers`: managers and flagged staff);
- a **product**: the Appointments plan reaches `appointments` and `account` only.

The middleware `admin.access` runs on every `/v1/admin` route (after `admin`, before `check.subscription`) and on
billing, the industry switch, lead intake and the connector. A platform admin always passes. The route's own checks
(`staff.can`, `feature`, `workspace`, `admin:super_admin`, Setup's manager rule) still apply after it.

| `ADMIN_ACCESS_MODE` (Laravel Cloud) | Roles and deactivated accounts | The Appointments plan's lock |
|---|---|---|
| unset, or anything but `enforce` (report) | recorded, let through | refused (`not_in_plan`) |
| `enforce` | refused (`not_allowed`, `staff_inactive`) | refused |

**Before switching to enforce:**

- run `php artisan admin-access:report --days=7` (add `--org=<id>` for one organisation);
- every "would refuse" line that a real page needs becomes a map fix with its test, shipped first;
- then set `ADMIN_ACCESS_MODE=enforce` in Laravel Cloud;
- removing it, or setting `report`, undoes it.

The record (`admin_access_refusals`) keeps who, which organisation, which rule, which method and why, per day, and
never a request's contents.

**A new admin route** needs a key in `AccessMap::MAP`, mirroring the menu's gate for its page.
`tests/Feature/AdminAccess/AccessMapTest.php` and `AdminAccessWiringTest.php` fail the build without one.
```

- [ ] **Step 2: The rule.** In `CLAUDE.md`, add this section before "## Landing-page code rules":

```markdown
## Admin API rules

- Every staff endpoint is decided by `App\Support\AdminAccess\AccessMap` (middleware `admin.access`). A new route
  under `/v1/admin` needs a map key with its read rule, change rule and product, mirroring the menu's gate for its
  page; `tests/Feature/AdminAccess/AccessMapTest.php` and `AdminAccessWiringTest.php` fail otherwise.
- Organisations on the Appointments plan reach only products `appointments` and `account` (runbook:
  `docs/appointments-workspace.md`).
```

- [ ] **Step 3: Commit** with the subject "Document selling Appointments on its own":

```bash
git add docs/appointments-workspace.md CLAUDE.md
git commit -F <ws>/tools/commit-12.txt
```

- [ ] **Step 4: The whole branch, backend.** Run the baseline loop from "Before you start" again, writing to
  `<ws>/after.txt`.
  - Expected: every directory ends `exit=0` except those already failing in `<ws>/baseline.txt`, which fail in
    the same tests.
  - A new failure is fixed (RED→GREEN), or ledgered as a ruling with its reason.

- [ ] **Step 5: The whole branch, frontend.** Run `cd frontend && npx vitest run > node_modules/.tmp/partc-all.log 2>&1; tail -n 30 node_modules/.tmp/partc-all.log` and `npx tsc -b`.
  - Expected: only the 3 pre-existing `plannerMeta` failures; tsc 0.

- [ ] **Step 6: The browser** (local; never migrate). Start the two servers:

```bash
cd /c/wamp64/www/Hexa-Tech-appointments && MAIL_MAILER=log QUEUE_CONNECTION=sync CORS_ALLOWED_ORIGINS=http://localhost:5180 /c/wamp64/bin/php/php8.4.20/php.exe artisan serve --host=127.0.0.1 --port=8010
cd /c/wamp64/www/Hexa-Tech-appointments/frontend && VITE_API_URL=http://127.0.0.1:8010/api npx vite --port 5180
```

  Open `http://localhost:5180/login`, as `localhost`, at 1440 px. Use the tester sign-in from
  `.superpowers/sdd/2026-09-30-appointments-workspace/task-14-brief.md` (organisation 16). Do not echo its password.
  Check, in order, and save screenshots as `.superpowers/shots/appointments/partC-*.png` in the main checkout:
  1. **Report mode, full customer.**
     - The full admin and the workspace look and work as before (dashboard, Members, Settings, the workspace
       calendar).
     - The server log shows the "could not record a refusal" warning only for calls the map would refuse. Local
       PostgreSQL has no `admin_access_refusals`; the answers are unchanged. That proves the failure path.
  2. **Appointments-only.** Run `php artisan workspace:appointments 16 --only` (read what it says stops; answer yes).
     Then sign out and in.
     - You land on `/appointments`.
     - There is no "Full admin" in the rail or the phone menu (390 px).
     - Typing `/members` and `/settings` lands back in the workspace.
     - Setup's service editor has no full-admin note.
     - The loyalty card and Setup's points switch are gone.
     - A booking on the public page `/services/{widget token}` makes a guest and no member (check
       `loyalty_members` for its email).
  3. **A stale session.** In a second browser profile signed in before step 2 (or with its stored user's `only`
     removed in devtools), open `/members`. It ends on `/appointments`.
  4. **Back.** Run `php artisan workspace:appointments 16 --plan-decides`. Sign in again: the full admin is back,
     and so is loyalty.
  5. **Enforce, locally.** Stop the API server and start it again with `ADMIN_ACCESS_MODE=enforce` added before
     `MAIL_MAILER`. As the staff-role user `setup-staff@example.test` (local only, from the Part B ledger), opening
     Settings → Team or saving Settings answers 403 `not_allowed`, while the Planner, Members and the workspace
     work. Deactivate that user through the full admin's Team screen as the tester. The staff user's next call
     signs them out, and the sign-in screen says why. Reactivate them afterwards.
  6. Stop both servers.

  Ledger what was seen, as earlier parts did (one line per check, the screenshots named). A defect found here is
  fixed RED→GREEN with a test and re-checked.

- [ ] **Step 7: Done.** All twelve tasks are complete in the ledger. Hand over to the final whole-branch review
  (executing skill).
