# HexaTech handoff — 8 November 2026

Read CLAUDE.md, then `2026-11-07-hexatech-handoff.md` (HexaTech CRM, rounds 1 and 2) and the earlier handoffs it names.
This session finishes HexaTech CRM (round 3) and deploys it. Runbooks: `docs/crm-workspace.md`, `docs/plan-modules.md`.

## The owner's word (8 Nov)

"1. Lets add ai capture in leads and deals for any staff member 2. Yes it is ok, any can change 3. Do as you suggest
4. Deploy and let me know what you cant do i eil do manualy these steps"

## Round 3 (branch `ccr-3e2c59ed-nvr08a`)

1. **The AI capture is every staff member's**, in Leads and in Deals. `crm-ai/capture-*` left `feature:admin_ai` for
   their own gate `ai.capture` (`App\Http\Middleware\RequireAiCapture`): an organisation with the CRM workspace on (every
   CRM customer, every full customer that has not switched it off), or a plan with `admin_ai`. The month's AI
   allowance still stops it; the rest of `crm-ai/*` keeps `feature:admin_ai`. The bootstrap's `features.ai_capture`
   (was `admin_ai`) is the middleware's answer. Deals gained **Add a deal** and **From a message**: the lead form in its
   deal mode makes the lead, then closes it through the server's own `inquiries/{id}/won`. No billing change: the
   packages need no `admin_ai`.
2. **`crm-settings`**: any staff member may write any key (the owner's decision); recorded in `docs/crm-workspace.md`.
3. **The small open items**, each with a test (`docs/crm-workspace.md`, "Round 3"): bulk won closes each lead as `/won`
   does (`closeAsWon`: timeline line and a hotel's draft reservation); "Not assigned" in the leads' owner filter
   (`inquiries?unassigned=1`); `deals/kpis` adds `payment_pending` so the "Awaiting payment" pill counts its own step
   (the CRM's and the full admin's); a failed capture answers our sentence, the provider's text is logged; every id a
   staff request names is this organisation's (42 bare `exists:` rules in 12 controllers: 38 are `OwnRows::rule()`, the
   four on endpoints that read the id again under the tenant scope — the merge, a member's tier change, a campaign's
   recipients — keep their own refusals; `OwnIdsTest` refuses a bare rule); the
   widget's cached config lives in `SharedCache`, so a save or a key rotation reaches every container at once.
   Left open: tasks saved before 7 Nov with shifted times (no row says which ones).

## Checks (this container, 8 Nov, before the deploy)

- PHP sweep, every `tests/Feature` and `tests/Unit` directory and top-level file, one run each (79 runs): 7,489 passed,
  17 skipped, 3 failed — three `tests/Feature/Admin` tests that pinned the refusals of the merge, the member tier change
  and the campaign send; those endpoints keep their old answers (see above) and the directory passes again (117).
  The suites that call them (`AdminAccess`, `CrmWorkspace`, `LoyaltyWorkspace`, `Mail`, `Middleware`) passed again after.
- Frontend: `tsc -b` clean; **438 Vitest files, 6,449 tests** passed; lint baseline passed (1,398 legacy, none new).
- Real browser on the local demo, as a staff member, 1440 Dark and Light and 390 Dark: Deals shows From a message and
  Add a deal; a deal added by hand opens as won and is listed in Deals; From a message says our sentence when the AI
  cannot be reached; Leads' "Not assigned" lists the unowned lead; no console error, failed request or overflow.

## Deploy (8 Nov, 09:12 UTC)

Production **a55d1f4**, by the source-patch recipe (`docs/landing-page-builder.md` §6) on `origin/main` f828dbf: source
patch **0c345ac** (359 files of the branch at **25610e2**, 284 added, 75 changed, none deleted; whole-tree parity with
the tip, built paths aside), fresh build **a55d1f4** (`frontend/dist`, `public/spa`, `resources/spa-shell` only). **Next
source-patch baseline: 25610e2** (later documentation commits on the branch are not the baseline). Rounds 1 and 2 went
out with it (nothing of HexaTech CRM had been deployed before).

- Artifact checks (the deploy checkout, before the push): PHP `CrmWorkspace` 71 (+1 skipped), `AdminAccess` 85, `Admin`
  117, `Crm` 268, `Widget` 75, `Chatbot` 48, `Auth` 57 (+3 skipped), `Unit/Support` 189, all passed; `tsc -b` clean;
  Vitest 438 files / 6,449 tests passed; `npm run build` succeeded.
- Branch checks: the full PHP sweep (79 runs, 7,492 passed and 17 skipped once the three `Admin` tests above were
  answered); PostgreSQL 16 (`hexa_crm_r2_test`, every migration): `CrmWorkspace` 72, `Admin` 117, `Crm` 268, `Widget` 75,
  `Booking` 597, `Knowledge` 24, `LoyaltyWorkspace` 661, `Notifications` 73, `Reviews` 10 passed; `Loyalty` 377 passed and
  6 failed, all six of the documented "test states production cannot hold" (`docs/loyalty-workspace.md`: a member with
  no tier, no user or no referral code; an assessment with no old tier), in services this release does not touch.
- Live, verified by content: `https://app.hexa-tech.uk/` serves `index-Bid0an0a.js` (the previous release served
  `index-DjwDxAMD.js`), which loads `CrmApp-Ce96hZ70.js`; `DealsPage-CyxukW4-.js` holds `crm.deals.new` and `ai_capture`,
  `LeadForm-DdPNfU23.js` "A deal from a message" and the `/won` call, `LeadsPage-CbPkubQO.js` the `_nobody` / `unassigned`
  filter; `/crm/login` and `/crm/register` answer 200; `api/v1/admin/crm/bootstrap` and `crm-ai/capture-lead` answer 401
  unauthenticated (the routes exist; before this release the first was a 404). Landing continuity:
  `https://sites.hexa-tech.uk/hexa-academy` 200, its kit stylesheet with zero `rp-` markers.
- Post-deploy CI: https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/42466176460 — every test job green
  (PHP on SQLite in three shards, PHP on PostgreSQL 18 with only the known failures, the SPA on Node 24 and 26, the
  dependency audit); **Larastan failed with 33 new findings**, all in this release's code. Fixed at the cause in a
  follow-up (below): relation methods with their related model typed (`ChatMessage::senderUser`,
  `ChatMessageFeedback::user`, `ChatConversation::assignedAgent`, `Inquiry::guest` / `reservations`, `Task::inquiry`),
  `Inquiry`'s `organization_id` / `brand_id` documented, `RequireAiCapture` reads the organisation as a typed model,
  checks that can never fail removed. Typing `Inquiry::guest` showed an old bug: the staff voice assistant's lead
  lookups answered the guest's `name`, a column guests do not have (always empty); they now answer `full_name`.
  Larastan clean locally (`vendor/bin/phpstan analyse`).
- **Follow-up deploy: production c90cb86** (source patch on a55d1f4, 13 PHP and documentation files of the branch at
  **5f7d88d**, whole-tree parity; the SPA unchanged, so no build commit). **Next source-patch baseline: 5f7d88d.**
  Artifact: Larastan 0 findings; `CrmWorkspace` 71, `Crm` 268, `Ai` 101, `Admin` 117, `AdminAccess` 85 passed.
  Post-deploy CI green on every job (Larastan, PHP on SQLite in three shards, PHP on PostgreSQL 18 with only the known
  failures, the SPA on Node 24 and 26, the dependency audit):
  https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/42468285480 (finished 09:58 UTC).
- The container's network: the live hosts were refused by the Default environment; the owner approved a personal
  environment **HexaTech** (the Default's hosts plus `app.hexa-tech.uk` and `sites.hexa-tech.uk`) and this session moved
  onto it. It has no variables: a session that needs `EXPO_TOKEN` or the Stripe test keys uses the Default.

## What the owner does by hand

1. **Billing** (this session was refused push access to `hotel-tech-saas` again): apply
   `docs/billing/2026-11-07-hotel-tech-saas-crm-packages.patch` to billing `main` and push (steps and a two-query
   pre-check in `docs/plan-modules.md`, "Billing handover, 2026-11-07"); then, in the billing application's Commands
   tab on Laravel Cloud, `php artisan stripe:sync --module-plans --publish`. Until then `/crm/register` says HexaTech
   CRM cannot be bought online yet; full customers already have `/crm`.
2. Optional: an organisation that should not see the CRM yet: `php artisan workspace:crm <organisation id> --off`.
