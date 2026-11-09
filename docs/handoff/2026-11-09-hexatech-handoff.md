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
