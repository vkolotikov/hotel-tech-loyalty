# HexaTech handoff — 7 November 2026

Read CLAUDE.md, then `2026-11-06-hexatech-handoff.md` and `2026-11-02-hexatech-handoff.md` for production, the native
apps and the environment. This session adds **HexaTech CRM**, the fourth workspace and the fourth product sold on its
own. Runbooks: `docs/crm-workspace.md` (the workspace), `docs/plan-modules.md` (packages, prices, billing).

## The owner's request

"We make a separate portals for loyalty, booking and content planner. Now I want to make seperate portal for AI chat
widget + CRM it will be one portal which combine these 2 features. And also will be sold separately as a module.
Please develope this seperate portal. With all existing features and maybe additional new features."

## What was built (branch `ccr-3e2c59ed-nvr08a`, pushed; not merged, not deployed)

- **Server.** Module `crm` in `App\Support\PlanModules` (billing product `crm_chat`, never the full suite's `crm` /
  `chat`, so Starter and Growth stay full customers); Lite / Standard / Pro at 49 / 85 / 149 € a month with `chatbot`,
  `engagement` and a 10 / 25 / 60 $ AI allowance (two products' allowances add up). `AccessMap::MODULE_PRODUCTS`: the
  crm module reaches the full admin's `crm` and `chat` endpoints. Workspace `crm` on by default
  (`php artisan workspace:crm <organisation id> --on|--off|--landing|--status`, `--list`). Its own endpoints
  `admin/crm/*`: bootstrap, today, start, bot-gaps, conversations/{id}/draft (the AI reply draft).
- **Portal** `/crm` (`frontend/src/crm/`, the shared workspace frame, five locales): Today, Get started, Inbox,
  Visitors, Leads, Pipeline, Contacts, Tasks, AI assistant, Chat widget, Insights, Settings — the full admin's chat and
  CRM features on its own endpoints, plus Today, the setup steps, AI-drafted replies, "Answers to fix" (teach the
  assistant from wrong answers) and the AI allowance in view. `/crm/login`, `/crm/register`; Plan & products; a
  "HexaTech CRM" entry in the full admin's CRM & Marketing menu.
- **Fixed on the way:** the full admin's Chat inbox "Transfer to agent" (sent `agent_id`, the server takes `user_id`).
- **Billing:** `docs/billing/2026-11-07-hotel-tech-saas-crm-packages.patch` (push to `hotel-tech-saas` was refused
  again; read access only). It applies with `git am` on billing `main` 7607211 and gives the branch's tree.

## Round 2 (same day, same branch)

The owner: "Ok, lets do all fixes and do all necessary improvements. Improve and modernize a design as well, make more
logicaly and easy to use, structured sections. Make sumilar functionality in crm leads and deals like we have in main
platform leads, also add dark theme and make it as a default theme."

- **Design**: Dark by default (Light one press away), a new palette (`CRM_SURFACES`, contrast-tested), the side panel
  in groups (Conversations, Sales, Reports, Set up), every page in one shape (figures, section cards, a toolbar with
  filter chips, content in described cards; tables that become cards on a phone). Rules in CLAUDE.md, "Round 2".
- **Leads and Deals at the main platform's level**: List / Board / Team; search, filters, saved views shared with the
  full admin, column choices, custom fields in the list, stage in place, AI signal, row menu, bulk won / lost with a
  reason, AI capture from a message (plans with `admin_ai` only), send a template, a lead page in sections. A Deals
  page of its own (`/crm/deals`; `/crm/pipeline` redirects). Tasks by day. The parity table and what was left out on
  purpose are in `docs/crm-workspace.md` ("The areas").
- **Server fixes, each with a test** (list in `docs/crm-workspace.md`, "Server issues found while building it"):
  teaching the assistant is a manager's (staff suggest), the widget key can be rotated, the AI helpers and the AI
  capture keep the allowance, task times are instants, contact fields can be emptied, guest tags unique per
  organisation, another organisation's ids refused wherever the CRM links records, the inbox's figures match its
  list, chatbot analytics and the leads' date filters on the venue's days, empty values sort last, **an email
  template sent to a lead no longer carries the first active member's name, points and codes** (a privacy leak).
  Two migrations: `2026_11_08_100000` (a nullable column) and `2026_11_08_100100` (the guest tag index per
  organisation, PostgreSQL).

## Checks (this container, 7 Nov)

Round 2 (after its last commit): PHP sweep of every `tests/` directory and top-level file, one run each: **79 runs, all
green**; PostgreSQL 16 (fresh database from every migration): `CrmWorkspace` 62, `Crm` 268, `CrmTasks` 18, `Chatbot`
48, `Notifications` 73, `AdminAccess` 85, all passed. Frontend: `tsc -b` clean, **438 Vitest files, 6,448 tests**
(the CRM's 32 / 569), lint baseline passed (1,398 legacy, none new), `vite build` succeeded (CRM chunk 471 kB). Real
browser on the seeded demo, every page at 1440 Dark and Light, 390 Dark and 360 Light: no console error, failed
request, overflow or untranslated key; screenshots read by eye (a table spilling out of its card, raw task codes,
"chatbot" for Website chat, a cut tile title and "1 unread messages" were found that way and fixed). A fresh device
opens Dark. The browser must open the dev SPA at `http://localhost:5173` (any other host makes it call `/api` as in
production).

Round 1:

- PHP sweep, every directory and top-level file of `tests/` one run each: **7,440 passed, 16 skipped, 4 failed** on the
  first pass; all 4 were this work's (3 exact sign-in payloads now naming `crm`, and the draft's rate limit sharing the
  admin group's counter, which `NestedThrottleBucketsTest` caught) and are fixed and green again.
- PostgreSQL 16 (a database built from every migration, `scripts/test-pg.sh`): `tests/Feature/CrmWorkspace` 23 passed
  (the draft with the real knowledge search), `tests/Feature/AdminAccess` 85, `PlanModulesControllerTest` 22,
  `CrmModuleAccessTest` 7.
- Billing, PostgreSQL 16, fresh and seeded databases: `ModulePlansTest` **9 passed**; the migration is idempotent and a
  script found no difference between its 30 plans and `PlanModules`.
- Frontend: `tsc -b` clean; **430 Vitest files, 6,286 tests passed** (406 / 5,872 before); lint baseline passed (1,399
  legacy diagnostics, none new); `vite build` succeeded (CRM entry chunk 364 kB, smaller than Content's and Loyalty's).
- **Real browser** (Playwright Chromium) against a local backend on PostgreSQL seeded as a small clinic (8 chats, 12
  leads, 12 contacts, tasks, knowledge, a wrongly rated answer), every page at 1440, dark and 390, plus `/crm/login` and
  `/crm/register`: no console error, no failed request, no horizontal overflow, no untranslated key; screenshots
  reviewed by eye (a stay card on clinic leads, the phone's quick-setup card, a restaurant sample in the widget preview
  and "1 leads" were found that way and fixed).

## To go live (the owner)

1. **Billing first**: apply the patch to `hotel-tech-saas` `main` and deploy (steps and a two-query pre-check in
   `docs/plan-modules.md`, "Billing handover, 2026-11-07"), then in billing's Commands tab
   `php artisan stripe:sync --module-plans --publish`.
2. **This application**: merge the branch by the source-patch recipe (`docs/landing-page-builder.md` §6). It has two
   small migrations (above). **Not deployed by this session**: the session's git rules forbid pushing anywhere but its branch without
   the owner's word, and the change is large and visible — on deploy every full customer gets `/crm` and a menu entry
   (off per organisation with `workspace:crm <organisation id> --off`). Until step 1, `/crm/register` says the product
   cannot be bought online yet.

## Decisions for the owner

- The packages' limits (team 2 / 5 / 15, AI 10 / 25 / 60 $) are Claude's proposal; billing's Plans page can change them.
- Round 1's server issues are fixed (round 2). Still open, for the owner or a later pass (`docs/crm-workspace.md`,
  "Still open"): any staff member may write any `crm-settings` key (a full-admin access decision); `deals/kpis`
  `awaiting_payment` and the Deals pill count different things; the loyalty and booking controllers' bare `exists`
  rules (another organisation's id passes validation; reads stay tenant-scoped); bulk `mark_won` makes no draft
  reservation; tasks saved before the fix keep their shifted times.

## Container notes (added this session)

- PHP 8.5.12 built natively at `/opt/php85` (`php85`, also `php8.5`) from the official image's verified source
  tarball, every extension the suites need; Composer cache pre-filled from shallow fetches (both repositories).
- The demo backend's scripts (reset and seed, start / stop, tokens, SPA sign-in envelope) were in the session's
  scratchpad; the container is reclaimed, so rebuild them from `docs/crm-workspace.md` if needed. The repository's
  gitignored `.env` held local-only lines (PostgreSQL `hexa_demo`, unreachable SaaS / AI addresses); nothing tracked.
