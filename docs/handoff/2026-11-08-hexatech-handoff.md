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

- PHP sweep, every `tests/Feature` and `tests/Unit` directory and top-level file, one run each: the only failures were
  three `tests/Feature/Admin` tests that pinned the refusals of the merge, the member tier change and the campaign send;
  those endpoints keep their old answers (see above) and the directory passes again (119). Final numbers below.
- Frontend: `tsc -b` clean; **438 Vitest files, 6,449 tests** passed; lint baseline passed (1,398 legacy, none new).
- Real browser on the local demo, as a staff member, 1440 Dark and Light and 390 Dark: Deals shows From a message and
  Add a deal; a deal added by hand opens as won and is listed in Deals; From a message says our sentence when the AI
  cannot be reached; Leads' "Not assigned" lists the unowned lead; no console error, failed request or overflow.

## Deploy

By the source-patch recipe (`docs/landing-page-builder.md` §6), from `origin/main` f828dbf (the branch's own base, so
the source delta is the branch's whole diff, built assets excluded). Results are recorded below once it is out.

## What the owner does by hand

1. **Billing** (this session was refused push access to `hotel-tech-saas` again): apply
   `docs/billing/2026-11-07-hotel-tech-saas-crm-packages.patch` to billing `main` and push (steps and a two-query
   pre-check in `docs/plan-modules.md`, "Billing handover, 2026-11-07"); then, in the billing application's Commands
   tab on Laravel Cloud, `php artisan stripe:sync --module-plans --publish`. Until then `/crm/register` says HexaTech
   CRM cannot be bought online yet; full customers already have `/crm`.
2. Optional: an organisation that should not see the CRM yet: `php artisan workspace:crm <organisation id> --off`.
