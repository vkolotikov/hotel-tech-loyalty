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

1. **Billing, the code: done 8 Nov, 16:12 UTC.** At the owner's request this session pushed the CRM packages commit to
   `hotel-tech-saas` `main` (7607211 → **89cf5d2**, identical to `docs/billing/2026-11-07-hotel-tech-saas-crm-packages.patch`;
   `ModulePlansTest` on PostgreSQL 16, fresh and seeded databases: 9 passed each). Laravel Cloud deploys it and runs the
   migration. Billing CI: https://github.com/vkolotikov/hotel-tech-saas/actions/runs/42498705791 (its previous run, on
   7607211, had already failed).
2. **Billing, the sync: done by the owner, 8 Nov.** `php artisan stripe:sync --module-plans --publish` in billing's
   Commands tab: the 15 Loyalty / Content plans reused their Stripe products and prices; the 21 Appointments and 30 CRM
   plans got new products and prices and were published. Checked live afterwards: `GET /api/v1/modules` answers all 66
   plans from billing (`source: billing`, available), CRM at 4900 / 8500 / 14900 cents a month, 49980 / 86700 / 151980
   a year, trial 7 days, AI allowance 1000 / 2500 / 6000 cents, chatbot on; pairs at the sum (for example
   `content_pro-crm_pro` 29800, AI 11000). **Billing's security update, done 8 Nov at the owner's word:** its CI's
   dependency audit had failed since 4 Nov (every test job passed): six advisories in `symfony/http-foundation`,
   `http-kernel` and `routing` 8.1.10. Billing `main` **3214b44** moves the three to 8.1.11 (`composer.lock` only);
   checked before the push: `composer validate`, `composer audit` (none), the tests on PostgreSQL 16 (23 passed, 3
   skipped) and on SQLite, the production caches build. Billing CI green on 3214b44 (every job: https://github.com/vkolotikov/hotel-tech-saas/actions/runs/42499859041); its npm audit still lists 10 moderate advisories in build tools (`minimatch`), below the CI's `high` bar. Run composer in billing with `php85` (the PATH's PHP 8.3
   cannot resolve its `php ^8.4`). Before the sync, the text was:
   once billing's deployment of 89cf5d2
   has finished, in the billing application's **Commands** tab, `php artisan stripe:sync --module-plans --publish`.
   Live `GET /api/v1/modules` on 8 Nov after the push: billing sells 15 plans (Loyalty and Content); the 21 Appointments
   plans of 4 Nov were never published either, so this one sync prices and publishes Appointments' 21 and CRM's 30
   together. Afterwards `GET /api/v1/modules` lists 66 plans from billing (`source: billing`), and `/crm/register`
   offers the three packages. Until then `/crm/register` says HexaTech CRM cannot be bought online yet; full
   customers already have `/crm`.
3. Optional: an organisation that should not see the CRM yet: `php artisan workspace:crm <organisation id> --off`.

## Loyalty: delivery setup and app design availability (8 Nov)

Owner asked whether each organisation can send email/SMS/push, whether Card & app can really control client
designs, and whether wallet accounts need more than uploaded data. Audit and limits:
`docs/loyalty-redesign/28-DELIVERY-AND-APP-AVAILABILITY.md`.

- Email delivery exists through the platform mail transport/queue. Organisations use the platform From address
  with their sender name/reply-to. Self-service sending domains/SMTP are **On hold**. SMS already uses each
  organisation's Twilio account. Push needs native app credentials, registered devices and consent. These setup
  dependencies are now explicit in Campaigns; a list read no longer implies email/push delivery readiness.
- The current member app uses the portal bootstrap's venue accent/heading face, not `AppLook`'s separate mobile
  palette/card settings. The member app and desktop designers are **On hold**, including `?tab=app`. The former
  desktop view was illustrative; browser/Windows staff app layouts cannot be controlled there. No backend settings
  or full-admin writers were removed. No native app build was made.
- Wallet settings/uploads and currency remain. Both wallet entry points explain business-owner/manager setup,
  Apple Developer signing credentials and Google issuer/publishing/service-account approval. Members add their
  own cards after setup. Saved credentials mean **Ready to test**, not provider approval or verified delivery.
- All five locales, both themes, mobile/desktop. No real message or member pass was sent/issued in this task.

Feature: `feature/delivery-readiness-20261108`; **next source-patch baseline 314e52985** (source c60b8b119, refreshed
with production's minimatch security update). Production release pushed: **08e222562**, source patch **d3ccb385e**
on **5888c7a8b** and a fresh build. Exactly 25 source paths, whole-source parity excluding the three build roots.
The earlier local release build 3eb1e71e8 was discarded when main advanced; it was never pushed.

Checks on the separate C: artifact with a physical vendor copy and node_modules junction: pinned PHP 8.5.12,
OPENSSL_CONF set; **2,042 PHP tests passed**, zero skipped/failed (189 Support, 118 Unit/Landing, 1,735
Feature/Landing). After the security refresh all PHP inputs were byte-identical to that tested artifact.
Fresh dependencies resolve minimatch 11.0.5, npm audit zero vulnerabilities. TypeScript and targeted lint clean;
**453 Vitest files / 6,711 tests passed**, repeated after the dependency refresh; fresh build passed. Browser:
**46 Card & app + 43 Campaigns checks** on dev and compiled fixtures, then **12 final compiled checks** after the
dependency refresh. Screenshots reviewed at 1440 and 390; widths 320–1440, languages, permissions, plan gates,
wallet read errors and retained settings/upload paths covered. Local logs/evidence: `C:/wamp64/tmp/delivery-*20261108*`.

Live verified **16:58 UTC**: entry `index-Bitprh8x.js`; all new design/status/prerequisite markers and scoped styles
present, referenced chunks 200, wallet/app-look/campaigns/push/SMS unauthenticated reads 401. Public landing still
serves its Nocturne stylesheet with zero `rp-` markers, retired stylesheet 404, all three Poppins files unchanged.
CI is still running: https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/42502244845.
Provider delivery/approval remains a separate acceptance task: platform
mail transport/queue/domain, an organisation's approved Twilio sender, native push build/credentials/device, and
real-device wallet add/update/disable. Credentials were neither printed nor changed.
