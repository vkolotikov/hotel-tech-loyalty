# HexaTech handoff — 9 November 2026

Read CLAUDE.md, then `2026-11-08-hexatech-handoff.md` (HexaTech CRM round 3, deployed) and the earlier handoffs it
names. This session adds **HexaTech Time Planner**, the sixth workspace. Runbook: `docs/time-planner-workspace.md`.

## The owner's request

"We do before portals for loyalty, crm and AI chat widget, booking and content planner. Now lets make a separate portal
for time planner. Use all data which we have before, style, settings, features etc., build a powerful AI powered …
planner, additional features AI plan and analyse employees day depends on employees knowledge etc., ai capture data, ai
voice inputs in planner and any other improvements to make it more effective. Interactive, modern, easy to use
something really powerful to manage, analyse and optimize day."

## What was built (branch `ccr-e74852c3-mco7tm`)

- **The workspace** `/time` (`frontend/src/time/`, the shared frame, Dark by default, five locales): My day, Planner
  (day lanes per person and a week grid, drag and drop), Backlog & pool, Team & skills, Insights, Settings; Find (⌘K),
  keys N / A / P / B. A **HexaTech Time Planner** entry beside Planner in the full admin's Operations menu.
- **On the full admin's own data**: tasks, subtasks, templates, day notes, the backlog and pool, task types, tasks,
  employee preferences, skills — through the full admin's own `planner/*`, `crm-settings` and `team/{id}` endpoints.
- **New server** (`App\Services\Time\*`, `admin/time/*`, behind `workspace:time` and the plan's `time_management`):
  the day board and its signals, the week, people with their planner profile and shown experience, insights, duration
  estimates, task clocks, AI plan (checked line by line, the rules when the AI cannot), apply, AI review, AI capture,
  voice transcription. `php artisan workspace:time`. Migration `2026_11_09_100000` (three nullable columns).
- **Shared rules moved, not changed**: the planner's work window (`WorkWindow`), the inbox's transcription
  (`SpeechToText`); `Staff::user()` typed for Larastan.

## Decisions for the owner

- **Who has it**: every full customer by default, behind the Enterprise `time_management` like the full admin's
  Planner; it is not sold as a module. Selling it on its own (packages, prices, a `/time/register`) needs the owner's
  prices and a billing patch, as HexaTech CRM had.
- **Planning others' days is a manager's** (AI or rules), as are planner profiles and skills; everyone plans their own
  day and takes pool work their skills allow.
- The AI uses the venue's month allowance (`time_plan`, `time_review`, `time_capture`).

## Checks (this container, 9 November)

- **PHP**, every `tests/Feature` and `tests/Unit` directory and top-level file, one run each (80 runs): 7,518 passed,
  24 skipped, 1 failed — `Security/NestedThrottleBucketsTest`: the three AI routes shared one throttle bucket; each has
  its own now (`time-plan`, `time-review`, `time-capture`) and the directory passes. New: `tests/Feature/TimeWorkspace`
  (34 tests, SQLite and PostgreSQL 16).
- **PostgreSQL 16** (`hexa_test`, every migration): `TimeWorkspace` 34, `Planner` 59, `CrmWorkspace` 72, `AdminAccess`
  85, `Appointments` 412, `Admin` 117 passed. One earlier `Admin` run had a single failure that did not repeat (117 of
  117 on the rerun; its summary did not name the test): worth watching.
- **Larastan**: no errors (`Staff::user()` typed at the cause).
- **Frontend**: `tsc -b` clean; **453 Vitest files, 6,710 tests** passed (438 / 6,449 before); lint baseline passed
  (1,398 legacy, none new); `npm run build` succeeded (`TimeApp` chunk 214 kB).
- **Real browser** against a local backend on PostgreSQL seeded as a hotel in Riga (five people with skills,
  knowledge and hours, an outside cleaner, today's board, overdue work, a pool, 30 days of history): every page at
  1440 and 390 px, Dark and Light, in English, and samples in Russian and German: no horizontal scroll, no raw key, no
  console error or failed request. Read by eye; found and fixed that way: AI buttons in the accent instead of the AI
  violet, the week bars not drawn, team-level warnings in My day, the review button squeezing its card in Russian,
  a plan handing work to a name without an account, an outside cleaner's capacity inflating the team's, task
  categories written as labels where the full admin writes keys. The AI and the microphone could not be exercised for
  real (no provider keys in the container): with a fake key the plan falls back to the rules and says so.
- The production build served by Laravel (the deploy checkout): `/time` and `/time/plan` render, no errors.

## Deploy (8 Nov, 11:54 UTC; the container's clock — the work is dated 9 Nov in the docs)

Production **6df3f35**, by the source-patch recipe (`docs/landing-page-builder.md` §6) on `origin/main` c90cb86: source
patch **2a76ede** (186 files of the branch at **0ac5106**: 161 added, 25 changed, none deleted; whole-tree parity with
the tip, built paths aside), fresh build **6df3f35** (`frontend/dist`, `public/spa`, `resources/spa-shell` only). **Next
source-patch baseline: 0ac5106** (later documentation commits on the branch are not the baseline). One migration,
`2026_11_09_100000_add_time_planner_columns` (three nullable columns).

- Artifact checks (the deploy checkout, before the push): the full PHP sweep, 80 runs, **7,519 passed, 0 failed, 24
  skipped**; `tsc -b` clean; Vitest **453 files / 6,710 tests** passed; `npm run build` succeeded; the built SPA served
  by Laravel renders `/time` and `/time/plan` on the demo with no error.
- Live, verified by content: `https://app.hexa-tech.uk/` serves `index-D1uMCjpa.js` (before: `index-Bid0an0a.js`), which
  loads `TimeApp-BphqRGsC.js` holding "HexaTech Time Planner", `time/bootstrap` and `time:look`; the index holds the
  menu's `time_workspace` entry; `/time` and `/time/plan` answer 200; `api/v1/admin/time/bootstrap` and `time/plan`
  answer 401 unauthenticated (before this release the bootstrap was a 404). Landing continuity:
  `https://sites.hexa-tech.uk/hexa-academy` 200, its kit stylesheet (64 kB) with zero `rp-` markers.
- Post-deploy CI: https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/42477802749 — **every job green**
  (Larastan, the SPA on Node 24 and 26, PHP on SQLite in three shards, PHP on PostgreSQL 18, the dependency audit).

## What the owner does by hand

1. Nothing is needed for the release itself. Organisations without `time_management` (Starter, Growth) see the menu
   entry locked, as the full admin's Planner; Enterprise organisations have the workspace at once.
2. Optional: an organisation that should not see it yet: `php artisan workspace:time <organisation id> --off`; one that
   should land there after sign-in: `php artisan workspace:time <organisation id> --on --landing`.
3. To check the AI for real: production has the Anthropic and OpenAI keys the CRM uses; in the workspace, "Plan my day
   with AI" should answer with an AI summary (`source: ai`) and the microphone should write a voice note down.

## Round 2: sold as a module, and who plans whose day

The owner: "Make it a module sold separately like CRM and also includes in enterprise plan, lets make an option in
settings, for some companies all team can add to others in some companies only each user can plan their day, lets make 2
options which can be configured in settings of planner. after done, please deploy".

- **The module** (`docs/plan-modules.md`): `PlanModules::MODULES['time']`, billing product `time_planner`, Lite /
  Standard / Pro at CRM's prices (49 / 85 / 149 €, 15 % less yearly), alone and in every pair (105 module plans now);
  every package carries `time_management`, and they differ by team (3 / 10 / 25 — Claude's proposal, the owner may
  change them in billing's Plans) and the AI allowance (5 / 15 / 40 $). `/time/register`, `/time/login`, Plan &
  products, landing on `/time`. AccessMap product `time` (`admin/time*`, `admin/planner*`, `admin/planner-presets`);
  the workspace's settings moved off `crm-settings` onto its own `admin/time/settings` (the same rows, the planner's keys
  only, a manager's change), so a Time-only organisation needs nothing of the CRM. Enterprise keeps it as before;
  `workspace:time` refuses to switch it off for an organisation that bought it and on for one on other modules.
- **The planning mode** (`docs/time-planner-workspace.md`, "Who plans whose day"): Settings → Who plans, two options —
  *The whole team plans together* (`team`, the default: as the planner always was) and *Each person plans their own
  day* (`own`: a staff member adds, changes, moves, clocks, finishes and deletes only their own and unassigned tasks,
  gives work only to themselves, plans only their own day; everyone still sees the team's days). **Managers plan for
  anyone in both modes** (they are the ones who choose it). One server rule, `App\Services\Time\PlanningMode`, asked by
  the full admin's `PlannerController` and every Time Planner writer; refusal 403 `own_day_only`. In `team` mode staff
  may now also plan a colleague's or the team's day with AI in the workspace (it was a manager's) — that is what "all
  team can add to others" asks.

### Decisions for the owner (round 2)

- The team limits (3 / 10 / 25) and AI allowances (5 / 15 / 40 $) are proposals; prices are "like CRM".
- Managers are never limited by the planning mode. If a company wants managers held to their own day too, that is a
  third option, not built.
- The option lives in the Time Planner's Settings; the full admin's Planner obeys it but has no switch of its own.

### Checks (round 2)

- PHP: new `tests/Feature/TimeWorkspace/PlanningModeTest.php` (10), `SettingsTest.php` (4),
  `tests/Feature/AdminAccess/TimeModuleAccessTest.php` (6); updated `PlanTest`, `GateAndBootstrapTest`,
  `PlanModulesTest`, `PlanModulesControllerTest` (105 plans). PostgreSQL 16 (`hexa_test`): TimeWorkspace 48, Planner 59,
  AdminAccess 91, Auth 60 passed. Larastan: no errors.
- Frontend: `tsc -b` clean; Vitest 454 files / 6,718 tests; lint baseline passed (1,398 legacy, none new).
- Real browser (the Riga demo): Settings → Who plans at 1440 and 390, Dark and Light; in `own` mode as a staff member
  the Planner hides "Plan the team with AI", a colleague's task opens read-only (dimmed, Close only, the reason said,
  copy to one's own day kept), the people list is oneself; the API refuses a staff member's change of the setting (403);
  `/time/login` and `/time/register` render in English and Russian with no overflow.
- Billing (`hotel-tech-saas`, PostgreSQL 16, fresh and seeded): `ModulePlansTest` 10 passed, the whole suite 24 passed /
  3 skipped, the migration idempotent, the 105 plans identical to `PlanModules`.

### Deploy (round 2)

Production **ddf1d04**, by the source-patch recipe on `origin/main` 08e2225 (which had moved on since this session's first
deploy: another session's delivery-availability release; none of its files overlap this one's): source patch
**9e51421** (the branch from **0ac5106** to **3ced302**, 71 files: 10 added, 61 changed, none deleted; per-file parity
with the tip), fresh build **ddf1d04** (built paths only). No migration. **Next source-patch baseline: 3ced302.**

- Artifact checks (the deploy checkout): the full PHP sweep, 80 runs, **7,539 passed, 0 failed, 24 skipped**; `tsc -b`
  clean; Vitest **454 files / 6,719 tests** passed; `npm run build` succeeded (main's newer `package.json` adds a
  dev-only minimatch override; the checkout used this container's `node_modules`, and Laravel Cloud builds with its own).
- Live, verified by content: `https://app.hexa-tech.uk/` serves `index-oaaGWQY2.js` (before: `index-Bitprh8x.js`), which
  holds the `/time/login` words ("HexaTech Time Planner — Sign in") and loads `TimeApp-BJaOFOdz.js` (`time/settings`,
  `own_day_only`, no `crm-settings`) and `SettingsPage-CE-8e_JH.js` ("Who plans whose day", `planner_planning_mode`);
  `/time`, `/time/register` and `/time/login` answer 200; `api/v1/admin/time/settings` answers 401 unauthenticated (a
  missing route answers 404). Landing continuity: `https://sites.hexa-tech.uk/hexa-academy` 200, its kit stylesheet
  (64,577 bytes) with zero `rp-` markers.
- Post-deploy CI: https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/42504508569 — **green** (success).

### The owner's answer, and what was left (8 Nov, 17:50 UTC)

"Agree as you suggest, do all remaining steps and deploy, and let me know what you can't do": the proposals stand as
built (3 / 10 / 25 people, 5 / 15 / 40 $ AI, managers never limited, the switch only in the Time Planner). Everything of
this application is deployed (above). The billing push was asked for again and refused again by the session's
permissions, so billing stays the owner's (below). Found on the way, worth the owner's look: production's
`GET /api/v1/modules` answers every module plan — Loyalty's and CRM's too — with `source: built_in` and
`available: true`, which happens only when this application cannot read billing's `GET /billing/plans` (not
configured, unreachable, or an error). While that is so, Plan & products and the sign-up pages show the built-in
prices, and a module sign-up does not get billing's "not sold yet" refusal. This container cannot reach billing
(`saas.hotel-tech.ai` is outside its network), so the cause was not looked into: check `SAAS_API_URL` in Laravel Cloud
and that billing answers `GET <billing URL>/api/billing/plans`.

**9 Nov, the owner again ("can you do these steps for me")**: push access was granted on the third request; billing's
patch is on billing `main` as **41fec6a** (on 9ca597d), pushed after billing's suite passed on PostgreSQL 16 (24
passed, 3 skipped; `ModulePlansTest` 10 on a seeded database); billing's CI on it is green
(https://github.com/vkolotikov/hotel-tech-saas/actions/runs/42580761951: PHP on PostgreSQL 18, the SPA on Node 24 and
26, the dependency audit). Laravel Cloud deploys it and runs
`2026_11_09_120000_add_time_planner_packages`. Left to the owner: `stripe:sync` (step 2 below) and billing's plan list
being unread in production (above) — this container reaches neither Laravel Cloud nor billing.

### What the owner does by hand (round 2)

1. **Billing** — the patch is pushed (41fec6a, above). In billing's Commands tab (Laravel Cloud) once the deploy has
   finished: `php artisan stripe:sync --module-plans --publish`. Steps and two
   checking queries: `docs/plan-modules.md`, "Billing handover, 2026-11-09". Until then `/time/register` says the Time
   Planner cannot be bought online yet; Enterprise customers have it already.
2. Nothing else: every organisation starts in `team` mode, exactly as before.

## Round 3: adding tasks, the week, and a usability pass (9 Nov)

The owner (after running `stripe:sync`: "plans are published"): "Lets improve task adding options, make it easier to
add, make something like we have before with icons and when tasks shown after type selection as a grids 2. in week view
add task on calendar not work with click only with double click please fix. And check other usability and design
features and do necessary improvements".

- **The task form** has the full admin's drawer's pickers: a grid of types with icons and colours, then the chosen
  type's tasks as a grid, amber dots for the chosen person's preferred work, templates as an opening list. A picked task
  fills an empty title; Enter in the title adds; **Add & next** keeps the panel open for the next task of the same day,
  person and type; "Who" sits under the title (the hints depend on it).
- **The week**: one press on a cell's empty space adds a task for that person and day (it was a double click); each cell
  has a "+ Add" (on hover and focus with a mouse, always on a touch screen), the "Nobody yet" row too.
- **Found in the pass and fixed**: no planned time read "—" ("Planned —", "has room: — planned of 8 h", "— of 8 h" on
  Team) — now "0 h" (`format.planned`; a capacity that is unknown keeps its dash); Insights said "2 h of 0 h" for a name
  without an account — now "2 h planned"; an empty "My week" says so; task cards wrap a long title to two lines at every
  width (the pool's narrow column cut "Steam-clean the…"); the week's hint no longer says "double-click".
- Checks: Vitest 456 files / 6,727 tests, `tsc -b` clean, lint baseline (1,398 legacy, none new); in a real browser on the
  Riga demo at 1440 and 390, Dark and Light: the pickers, the template list, Add & next (two tasks saved, the panel kept
  its type, person and day), Enter to add, one-press add in the week (cell and "+ Add"), no horizontal scroll, no raw
  key, no failed request. No server change in this round.

## Left open

- The full admin's own Planner does not show clocked time; its Stats count planned minutes as before.
- Renaming a task type does not rename it on tasks, templates or preferences (as in the full admin).
- Selling the Time Planner on its own: built (round 2); billing's patch waits for the owner (above).

## HexaTech CRM round 4 and the full admin's task drawer (another session, branch `ccr-3e2c59ed-nvr08a`)

The owner (9 Nov), with a screenshot of the full admin's New task drawer: improve its design and logic, organised in
clear steps, with the type grid they like; and choose which brand of the organisation the CRM shows. Details:
`docs/crm-workspace.md`, "Round 4". In short: one task form in four steps for the CRM and the full admin
(`src/lib/taskForm.ts`); a task's priority, length and repeat are saved at last (migration `2026_11_09_140000`; before,
they went into `custom_data` and were dropped), and completing a repeating task adds the next one; the drawer's words
exist in all five languages; a brand switcher in the CRM's header (`Crm\CrmBrands`, `crm/lib/brand.ts`).

Checked before the deploy:
- All 80 PHP suite runs pass on SQLite.
- On PostgreSQL, a fresh database built from every migration including `2026_11_09_140000`: CrmWorkspace, Crm,
  CrmTasks, Admin, Planner and TimeWorkspace pass. `BrandSwitchTest`'s brands needed production's NOT NULL `slug` and
  `widget_token`.
- Frontend: `tsc -b` is clean and every vitest test passes.
- In a browser, on the local demo:
  - the CRM form (dark, light, phone): a saved task shows its start and end, High and Every week in the list;
  - the brand switcher: All brands showed 9 open leads, Old Town Studio 3;
  - the full admin's drawer (Glass, Clean light, phone): the saved row holds `priority`, `duration_minutes` and
    `recurring_rule`, with `custom_data` empty.
- Seen in passing, not from this round: the full admin's `components/BrandSwitcher.tsx` logs React's "Cannot update a
  component while rendering a different component" on load, in development builds only.
- After the deploy, CI's Larastan job found one new finding: `TaskController::nextOccurrence()` reads
  `Task::$custom_data`, a column whose migration adds it in a loop that the analyser cannot follow. The model now
  declares it (`@property`). This shipped as a second, small source patch, and Larastan is clean again. Run
  `vendor/bin/phpstan analyse` (PHP 8.5, 2 GB of memory) before a deploy: the test sweep does not include it.

## Loyalty prelaunch rehearsal (9 November, Windows workstation)

Owner authorised all remaining prelaunch work and test messages to their own contacts. One SMTP test was sent; the
owner confirmed inbox arrival. No SMS or customer campaign was sent. Detailed evidence and outstanding external
gates: `docs/audits/2026-11-09-loyalty-launch-rehearsal.md`. Reproduction: `frontend/e2e/LAUNCH-REHEARSAL.md`.

- Fixed sign-in/recovery label and autofill associations. The member portal now hides wallet actions until its own
  organisation's provider setup, plan and membership eligibility allow them; issuance checks remain authoritative.
- Added `php artisan loyalty:launch-audit` (safe observations, read-only by default), with an explicit bounded
  `--queue-probe` option. It sends no messages or provider requests. A processed probe proves one asynchronous job,
  not continuous worker health. Use Cloud **hotel-tech-loyalty**, not the billing project.
- Real isolated PostgreSQL 18 staff/member journey: **72 checks**, zero JavaScript errors/server failures, including
  registration, level upgrade, rewards, benefits, permissions, reversal/deactivation, report reconciliation,
  captured immediate/scheduled campaigns, worker probe, password reset/session revocation, desktop/mobile.
- Full SQLite sweep before final additions: **7,538 passed / 25 skipped / zero failed**, 80 scoped runs. Affected
  wallet scopes rechecked: SQLite **383**, PostgreSQL **322** passed. New diagnostic tests **5** passed on each DB.
  PostgreSQL critical sweep: **1,330 passed**, the known NOT NULL-conflicting ReferralLink test remains documented.
- Larastan clean with 2 GB memory. Native member type compatibility checked through a read-only compiler overlay,
  **41 tests** passed; no native release. Final artifact/frontend evidence follows the release below.
- User's production status at 11:03:25 Riga: no campaign failures or email/loyalty delays; wallet **Not verified**.
  Authenticated browser access was stopped by Windows URL verification. Do not bypass it or claim Cloud runtime,
  media recovery, physical wallet/reader or push acceptance. DNS/provider/device gates remain in the audit report.

Feature: `feature/loyalty-launch-readiness-20261109`, based on fresh main, merged Time Planner round 3 without overlap.
No migrations. Release source **a9f22c006**, fresh build **db0673f64** on main **690b2961d**, pushed by the source-patch
recipe. Exact 22-file allowlist and whole-source parity with feature **1c60c26f7** (next source-patch baseline; later
documentation is not the baseline). Artifact: **2,369 scoped PHP tests** (the required 2,042 plus 327 affected tests),
**457 Vitest files / 6,733 tests**, TypeScript, lint baseline (1,398 legacy), Larastan and fresh build all passed.
The exact artifact's real-backend browser journey passed **72 checks**, zero runtime errors or unexpected 5xx.
Feature build outputs were not deployed. Live content verified at **09:42:27 UTC / 11:42 Riga** on
`loyalty.hotel-tech.ai`, then `app.hexa-tech.uk`: `index-BlKjKFiG.js`, `PortalApp-CWPBeOFf.js`, all six new auth input
IDs and member wallet availability gating present; protected bootstrap/portal/wallet endpoints remain 401.
After deploy, public landing continuity passed (Nocturne CSS, zero `rp-` markers, retired CSS 404, all three Poppins
font files with expected bytes). Owned HTTP/proxy services and PostgreSQL cluster stopped; verified release
worktree and only its dependency junction removed, private evidence retained. Owner's production diagnostic at
**09:45:26 / 09:46:31 UTC**: scheduler heartbeats 21/27 seconds old, database shared cache and asynchronous queue;
the same probe processed at 09:45:26, zero ready jobs and failed jobs in the second reading. SMTP configuration
present, From domain `hotel-tech.ai`. This verifies one worker execution, not continuous monitoring or Cloud mail
delivery. Owner then ran `media:check-recovery`: fresh status at **09:47:42 UTC is attention**, no recovery marker.
Versioning is not Enabled. Prepared `docs/audits/2026-11-09-media-recovery-plan.md`; **owner approved 30-day noncurrent
retention**. The owner could not find resource details and requested direct inspection. A fresh CUA check found
native computer pipe and browser access host unavailable; no usable Cloud connector or CLI session was found.
Reconnection requested. Do not ask for the policy choice again. Database backup observations and verified production
target/provider access remain pending. Local storage configuration did not match the documented production target;
inspection refused that path, no provider request/change was made. Physical provider/device acceptance remains
external and optional channels stay on hold until accepted.

Release CI `42594935207`: Larastan, dependency audit, both Node builds and all three SQLite shards green; PostgreSQL
was still running when concurrent CRM round 4 **b20ef451e** superseded the run (cancelled, not failed). That release
preserves these Loyalty/auth sources byte-for-byte. Its replacement CI is `42596640691`; do not claim the cancelled
run completed PostgreSQL. Local affected PostgreSQL checks above passed. Replacement CI passed both Node builds,
dependency audit and all SQLite shards, but Larastan found `App\\Models\\Task::$custom_data` undefined in the concurrent
CRM change; PostgreSQL subsequently passed, leaving only that static finding. Upstream **c69b0db7e** fixes the model
annotation; adopt that version, not a duplicate local model edit. The guarded `media:recovery-policy` operator command
is being added for the approved 30-day policy, with explicit bucket/host checks, default preview, shared recovery lock,
unmanaged-rule refusal, noncurrent-only expiration, provider read-back and idempotence. Nine policy tests plus existing
Wallet and diagnostic tests pass (**31 total**); static analysis is clean. Deployment/artifact evidence follows.

Owner confirmed the current target through Cloud: disk `do`, `hotel-tech-assets`, `lon1.digitaloceanspaces.com`, region
lon1; PostgreSQL `hotel_loyalty`. Local storage credentials are unavailable; do not ask for them to be pasted. Existing
`docs/audits/2026-10-30-restore-rehearsal.md` already proves a seven-day PITR configuration and isolated recovery of
`hotel_loyalty` on cluster `hotel_tech_loyalty`. Cloud labels its attachment `main`; preserve the application's database
name override. Only a fresh current-window observation is missing, not a new paid restore. The same report records
production queue email inbox receipt on 29 October; avoid another send merely to repeat passing evidence.

### Latest production follow-up and owner direction

- Guarded policy release: sources **02af77050 / 1b80e5dcc**, fresh build **f275699a4** on **c69b0db7e**; whole-source
  parity with feature **cc4a29688** (next source-patch code baseline). Artifact **2,074 PHP tests**, **461 frontend
  files / 6,760 tests**, TypeScript, lint (1,393 legacy), Larastan and fresh build passed. Actual AWS SDK XML payloads
  validated with a transport mock. CI **42602197110 is success**, including its PostgreSQL known-failure gate.
- Owner executed the deployed command. Apply and preview stopped; safe read-only diagnosis returned
  `GetBucketLifecycleConfiguration`, HTTP **403**, **AccessDenied**. The runtime's limited Spaces key lacks bucket
  management access. No successful policy application or media byte-recovery check is recorded.
- Owner found the current Cloud backup section and confirmed **PITR enabled for the last seven days**. This plus
  the 30 October isolated restore evidence closes the database backup checks for this review.
- Owner approved a temporary full-access Spaces operator key then questioned the extra provider before reporting
  a key created. After research, explicitly chose **Move media to Laravel Cloud**. Do not pursue the DigitalOcean
  admin-key setup for this migration; retain the existing source read connection and data through verification.
  No key was reported created. If one was created, only that new temporary key needs revocation.
- Cloud Object Storage is Cloudflare R2: bucket-level visibility (no mixed ACLs), no S3 versioning. Prepare public
  media plus private 30-day backups and a real restore check, preserving old URLs/source during the copy. Current
  MediaService uses storePublicly and a DO-specific delete resolver, so a disk toggle alone is unsafe. No Cloud
  buckets, migration copies, URL rewrites, cutover or source deletion have been performed yet.
- Browser/Computer Use remains unavailable after the owner's reconnect attempt; DevTools' shared profile is busy.
  doctl exists but has no authentication; no local DigitalOcean or Laravel Cloud management token is configured.
  Never request key values in chat. Cloud resource creation may need the owner's dashboard action when the concrete
  bucket plan is ready. Continue prelaunch work with the selected Cloud media migration.

## The full admin's menu and dashboards for every portal (9 Nov, branch `claude/portal-dashboard-redesign-jpxojc`)

The owner, with screenshots of the full admin's menu and dashboard: "we make all portals for our apps, now need better
logic for main portal, better menu structure. And I think we need to make more engaging, interesting, maybe animated
dashboard with grids to all portals, KPI, main graphs, maybe weather info, time or smth, make really powerful
dashboards." Runbook: `docs/dashboards.md`; rules in CLAUDE.md ("Full admin menu and dashboards").

- **The menu**: the five HexaTech workspaces gathered in a **Workspaces** launcher of tiles under the Dashboard (each still
  hides with the group it came from: `home`); Scan in Members & Loyalty (still hidden with Operations); groups as an
  accordion (open: Overview, Workspaces, the page's own group, and whatever the person opened; a fresh storage key) that
  slides and shows each closed group's page count; **Find in menu**; the one item whose address matches longest is lit
  (Payments no longer lights Reservations); Brands and Billing have icons of their own. Settings → Sidebar Menu lists
  Workspaces.
- **The full admin's dashboard**: a grid of ten widgets the person may hide and reorder (Customize, kept in the browser):
  the venue's clock, greeting and weather under a sky that follows its part of the day, Live now, the industry's tiles and
  the period's figures (7/30/90 days) counting up with change and sparkline, a day-by-day chart with tabs, the pipeline as
  a ring, today's schedule, members & tiers (birthdays, close to the next tier), your workspaces, follow-ups, recent
  activity. SVG charts of our own (no chart library in the first bundle); motion stops for reduced motion.
- **Every workspace**: the shared `PulseCard` (clock, weather, next hours, sun) — CRM Today, Time Planner My day, Loyalty
  Overview, Appointments Insights, and a one-line strip on Content's plan.
- **Server (reads only, no migration)**: `App\Services\Dashboard\VenuePulse` at `admin/dashboard/pulse` and each
  workspace's `…/pulse` (zone, day, currency, place = first location's city or the zone's city, Open-Meteo weather cached
  in SharedCache, failures remembered 5 min); `App\Services\Dashboard\DashboardTrends` at `admin/dashboard/trends`
  (aligned daily series with the previous period). New config `services.weather` (`WEATHER_ENABLED`, default on).

### Checks (this container, 9 Nov)

- PHP: new `tests/Feature/Dashboard` (VenuePulse 8, DashboardTrends 5) on SQLite and on PostgreSQL 16 (`hexa_test`, every
  migration: 11 passed, 2 skipped by design — the two cases that need the test's own SQLite tables; a PostgreSQL-only
  case checks that every measure reads). AdminAccess 91, CrmWorkspace 82 on PostgreSQL. Larastan: no errors.
- Frontend: `tsc -b` clean; Vitest 463 files / 6,814 tests; lint baseline passed (1,383 legacy, none new — fewer than
  before, the old dashboard's went with it).
- Real browser (Vite, every API answer a local fixture): the full admin's dashboard at 1440 and 390 in Glass and Clean
  light and in Russian, the chart's crosshair, Customize, the menu (open, icon-only, a Bookings page), CRM Today at 1440
  and 390, Content's plan strip — no horizontal scroll, no raw key, no new console error (the known BrandSwitcher
  warning remains). Found and fixed that way: the chart's tabs squeezing its title on a phone, the last day label off the
  edge, a seventh figure alone on its row, workspace names cut, light-sky clouds too pale, figures repeated on CRM Today.
- Not exercised for real: Open-Meteo (this container's network refuses it; tested with recorded answers).

## Cloud media migration preparation (Windows workstation, 9 November)

Owner selected Laravel Cloud rather than provisioning a temporary DigitalOcean administrator key. Complete source
inventory: **209 objects / 202,034,601 bytes**. Architecture and resource evidence:
`docs/audits/2026-11-09-cloud-media-architecture.md`; commands: `docs/wallet-and-media-operations.md`.

The owner is using Codex **inside VS Code**. Native Computer Use and browser host are unavailable. Existing Chrome
was successfully connected through the official Chrome DevTools MCP `--autoConnect` route after the owner enabled
`chrome://inspect/#remote-debugging` and accepted Chrome's connection consent. Two EU-jurisdiction Cloud buckets
were created and attached: public disk **media**, private/default **media_private**. Cloud requires the first
attached disk to be default, so private was attached first. Existing commit **a455e01** redeployed successfully as
Cloud deployment **1150**, only to load those resource connections. App-cluster safe metadata read saw both Cloud
disks and **active media still do**. No credentials extracted, no files copied, no source deletion or URL rewrite.

Feature `feature/loyalty-cloud-media-20261109`: provider-neutral URL resolution; R2 ACL-free bounded object I/O;
private byte-verified recovery copies and durable manifests; current copies kept, retired copies retained 30 days;
guarded resumable copy, explicit preparation/backup/restore and reviewed URL migration commands; Cloud health requires
backup plus recent isolated restore; member avatars use the shared durable writer and save before releasing only
their owned predecessor. Operations wording updated in five languages. Source baseline **6fc522b14** was deployed
by source patch as **b695fdaa7** after final artifact checks. Live content verified at **13:44 UTC** on both
loyalty.hotel-tech.ai and app.hexa-tech.uk: `index-P6hPd3aU.js` loads `SystemStatus-DIfxctLq.js` with the new generic
Media recovery/Cloud backup-and-restore wording, no old native-versioning-only hint. Six sign-in/recovery IDs and
wallet capability gating remain present. Protected loyalty/member/wallet/operations endpoints answer 401.
Landing continuity passes: 200 kit page/styles, zero `rp-` markers, retired stylesheet 404, three exact Poppins fonts.
CI: https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/42627493492 — **success**, all eight jobs including
PostgreSQL's known-failure gate passed.

Feature checks so far: required Support/Landing scopes **2,058 passed**, Wallet **27**, member avatar **3**,
LoyaltyWorkspace **660 passed / one skipped**, **2,748 total / zero failed**. Two additional archive failure/health
tests and two reference migration tests subsequently passed. Actual SDK transport mock proves no object ACL header,
If-Match source reads, paginated listing, bounded/no-retry calls and missing-bucket refusal. Static analysis was
clean before the last small command/reference changes; rerun on final source/artifact. One operations locale render
test passed. Final artifact checks are now complete: **2,102 distinct PHP tests** across required and affected scopes,
**60 PostgreSQL tests**, TypeScript, **464 Vitest files / 6,823 tests**, lint baseline (1,383 legacy diagnostics,
none new), Larastan and fresh build passed. The exact final artifact completed **74 real-backend browser checks**,
including multipart avatar upload and actual image retrieval, with zero browser errors or unexpected 5xx responses.
Source patch has whole-tree source parity with **6fc522b14**, excluding only the three built roots. This remains the
next source-patch code baseline; subsequent documentation evidence is not a new code release. Artifact source
commits end at **5c5d8fb35**, build/deploy **b695fdaa7**. No source media was copied or removed by deployment.

The deployment killed the first console (exit 137); a fresh session then disconnected (1006). A later read-only ACL
inventory was typed into the terminated console and **never ran**. The task browser connector was restarted to filter
excessive debug output and now awaits renewed Chrome connection consent. Do not claim source ACL classification or
Cloud recovery acceptance. The earlier native-version policy route is superseded; keep source DO files/settings
through copy, delta verification, URL checks, cutover and any legacy-link review. New upstream weather/location
release **f11a4e950** was adopted before artifact parity/deploy. Native PC access subsequently returned through
cua_repl (the standalone node_repl helper still fails). Chrome visibly has an **Allow remote debugging?** modal.
Stopped only the task-owned debugging connector, but its prompt remained. Owner was asked to close it with Cancel
so work can continue through direct PC access. Do not act on the permission prompt automatically.

Task-owned loopback API/SPA services and PostgreSQL 18 were stopped after evidence collection. The deployment
worktree was removed after validating/unlinking its two owned junctions; shared dependencies and private rehearsal
evidence remain. Next production action, after the owner closes Chrome's prompt: start a fresh App-cluster console,
confirm active `do` and the verified Cloud bucket identities, then run the **read-only**
`php artisan media:cloud-migrate` preview. Continue copy/recovery/URL/cutover acceptance from the Cloud architecture
and operations runbook, preserving DigitalOcean files/settings throughout. Do not treat the code release or empty
provisioned buckets as completed migration.

**Continuation:** the Chrome prompt closed and direct native controls worked. Fresh App-cluster read confirms
active disk `do`, database `hotel_loyalty`, new migration command loaded. Complete read-only migration preview:
**209 objects / 202,034,601 bytes; 202 public / seven private review**. Source ACL reads all succeeded.
Guarded apply stopped with TypeError after partial copying; a read-only listing saw **one public / three private
objects**. Guarded diagnostic resume identified Migration.php:66 `fclose`: the SDK closed the caller's snapshot.
Two new real-SDK tests reproduced the ownership bug, then passed with a retained/detached PSR-7 wrapper in ObjectStore.
Prepare/deploy this correction by the source-patch recipe before continuing the idempotent migration. No URL or
active-disk change, no source deletion, and no completed recovery acceptance.

The stream correction has now passed artifact checks and was deployed as **079e7feb1** (source **6fb748979**;
whole-source parity with feature code baseline **cce6e479c**, next source-patch baseline). Artifact **2,104 PHP tests**,
TypeScript, **464 / 6,823** frontend tests, lint baseline, Larastan and fresh build passed. Its normalized-LF
ObjectStore hash is `f6241ea8c0b02c95d55837bf02f6fc242313088bbf3b7c789e0497dea9c009af`; verify in a fresh
App-cluster console after the rolling deploy before resuming migration. CI run **42632156397** passed all jobs.
One pre-existing local `/storage/` avatar is absent on production local, DO and Cloud. No profile data was cleared;
check local project copies before asking for a replacement image. See the Cloud audit for counts and evidence.

**Current production continuation:** Cloud deploy **1153 / 079e7feb1** completed and its fresh App-cluster source
hash matches the correction. Resumed guarded migration **completed: 209 objects / 202,034,601 bytes; 202 public /
seven private review**, source intact. Created one controlled 68-byte PNG via the real Cloud writer (no profile row
change); receipt `SharedCache::store()->get('ops:cloud-media-launch-20261109')` holds URL/key/SHA/bytes. Anonymous
workstation GET at **14:29:29 UTC** passed, exact bytes/image/png. Full guarded backup preparation is currently
running in the existing native Cloud Commands console. Next: finish that sweep, perform exact receipt-based
`media:verify-cloud --apply`, check private unsigned access denial, preview reviewed URLs and resolve counts,
apply URLs, then set MEDIA_DISK=media/redeploy and verify persistence/health/deltas. Keep probe until after redeploy.
No active-disk or DB URL change yet. Legacy avatar is also absent from all 23 project worktrees; original needed.

**Recovery accepted on continuation:** full backup **203 objects / 201,805,975 bytes**, completed 14:35:38 UTC;
isolated private restore **verified/exit 0** at **14:41:30 UTC**, exact 68-byte SHA match and cleanup, health **ok**,
marker false. Provider UI explicitly confirms private EU bucket, runtime has no public URL. Public media-domain
requests for backup payload and manifest both 404. Raw unsigned S3 returns 400/InvalidArgument and unconfigured
private hostname 530; those errors alone were not treated as privacy proof.

URL preview completed: **159 mapped rows/references**, **six private-review references** (KnowledgeDocument DOCX),
**four local-legacy references** (one user, three widget configs), zero unmapped. Source review confirmed all seven
DOCX already public, registered Word MIME, valid OOXML package parts, no macros. A strict DOCX MIME/extension
compatibility patch and regression fixture are being prepared for source-patch deployment so current knowledge
documents can retain their working access after the move. Private ACLs and disguised/credential/zip files remain
private. MEDIA_DISK remains do; URL apply and cutover remain to be completed.

**Next continuation:** the guarded URL apply updated **159 rows / 159 references**, zero stale/unmapped; six DOCX
references still await publication. All four local-legacy images (user 109/org 23; widget configs 7/org 16,
10/org 12, 22/org 35) are absent from production local, DO, Cloud and local project checkouts. Preserve their
references; original images need re-uploading. DOCX compatibility deployed as **cb7b69fe3**, Cloud **1154**, from
feature source baseline **65bd74c8c**. Artifact 2,105 PHP tests, full 6,823 frontend tests, TypeScript, lint,
Larastan and fresh build passed. Fresh production Migration hash matches the Cloud audit. Guarded 209-object
migration resume is running in the App console.

That deployment erased shared database-cache receipts: Composer's post-install `optimize:clear` also clears the
default database cache. A minimal follow-up adds `--except=cache`, preserving compiled-cache cleanup and operational
state. A regression executes the configured command with real database cache; receipt loss reproduced before
the fix, then passed with an active lock preserved. Verify/deploy by the source-patch recipe, refresh backup and
restore acceptance, complete six DOCX URLs, switch MEDIA_DISK to media and verify receipts survive the redeploy.

## Dashboard deploy (9 Nov, 11:53 UTC)

Production **a455e01**, by the source-patch recipe on `origin/main` f275699 (another session's media-recovery release, no
overlapping file): source patch **d0b8b90** (62 files of the branch at 30f4e7d: 25 added, 37 changed, none deleted;
whole-tree parity with the tip, built paths aside), fresh build **7c15358** (`frontend/dist`, `public/spa`,
`resources/spa-shell` only), and follow-up **a455e01** (the Time Planner's `pulse` moved behind `time_management`, which
`GateAndBootstrapTest` requires — found on PostgreSQL before the push). No migration. **Next source-patch baseline:
9992d5e.**

- Artifact checks (the deploy checkout): the full PHP sweep, 81 runs, **7,578 passed, 0 failed, 25 skipped**; after the
  follow-up AdminAccess, Dashboard, Security, TimeWorkspace and the route tests again (164 passed, 1 skipped); Larastan no
  errors; `tsc -b` clean; Vitest **463 files / 6,814 tests**; `npm run build` succeeded (the first bundle grew 35 kB raw,
  about 10 kB gzipped); the built SPA served like Laravel renders the dashboard and CRM Today with no console error.
- Live, verified by content: `https://app.hexa-tech.uk/` serves `index-12Wrra6-.js`, holding `loyalty-nav-groups-v2`,
  `hx-dashboard-layout-v1`, `dashboard/pulse`, `dashboard/trends`, `nav-app-tile` and "Find in menu"; `admin/dashboard/pulse`,
  `admin/dashboard/trends` and the `pulse` of crm, loyalty, appointments, content and time answer 401 unauthenticated (a
  missing route answers 404). Landing continuity: `https://sites.hexa-tech.uk/hexa-academy` 200, its kit stylesheet
  (64,577 bytes) with zero `rp-` markers.
- Post-deploy CI: https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/42612548439 (in progress at recording).

### What the owner does by hand

1. Nothing for the release. To see the weather, a location (Locations / Properties) needs its city; otherwise the zone's
   city is used (Europe/Riga → Riga). A venue on UTC with no city sees the clock alone and, as a manager, "Add a city".
2. Worth a look once signed in: that the weather shows (Laravel Cloud must reach `api.open-meteo.com` and
   `geocoding-api.open-meteo.com`; if it cannot, the card shows the clock alone and the log has
   `dashboard.pulse.weather_unavailable`). `WEATHER_ENABLED=false` in Laravel Cloud switches the weather off.
3. Everyone's menu starts folded the new way (only Overview, Workspaces and the page's own group open); each person's own
   opening and closing is kept from then on.
