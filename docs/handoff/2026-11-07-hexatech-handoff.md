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

## Checks (this container, 7 Nov)

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
2. **This application**: merge the branch by the source-patch recipe (`docs/landing-page-builder.md` §6). It has no
   migration. **Not deployed by this session**: the session's git rules forbid pushing anywhere but its branch without
   the owner's word, and the change is large and visible — on deploy every full customer gets `/crm` and a menu entry
   (off per organisation with `workspace:crm <organisation id> --off`). Until step 1, `/crm/register` says the product
   cannot be bought online yet.

## Decisions for the owner

- The packages' limits (team 2 / 5 / 15, AI 10 / 25 / 60 $) are Claude's proposal; billing's Plans page can change them.
- Server issues found, not changed (`docs/crm-workspace.md`, "Server issues found while building it"): staff can teach
  the assistant through the inbox's feedback endpoint; the widget key cannot be rotated; three AI helpers skip the
  allowance; task due times with an offset; inquiry sorts and bulk stage changes; **guest tags unique across
  organisations and `tag_ids.*` not limited to the organisation** (worth fixing soon: a cross-tenant id); contact fields
  cannot be emptied; `.doc` uploads.

## Container notes (added this session)

- PHP 8.5.12 built natively at `/opt/php85` (`php85`, also `php8.5`) from the official image's verified source
  tarball, every extension the suites need; Composer cache pre-filled from shallow fetches (both repositories).
- The demo backend's scripts (reset and seed, start / stop, tokens, SPA sign-in envelope) were in the session's
  scratchpad; the container is reclaimed, so rebuild them from `docs/crm-workspace.md` if needed. The repository's
  gitignored `.env` held local-only lines (PostgreSQL `hexa_demo`, unreachable SaaS / AI addresses); nothing tracked.
