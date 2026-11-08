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

## Left open

- The full admin's own Planner does not show clocked time; its Stats count planned minutes as before.
- Renaming a task type does not rename it on tasks, templates or preferences (as in the full admin).
- Selling the Time Planner on its own (packages and prices) is the owner's decision; nothing of billing changed.
