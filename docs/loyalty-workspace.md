# HexaTech Loyalty — runbook

HexaTech Loyalty (`/loyalty`) is the loyalty programme as its own workspace beside the full admin, a sibling of
HexaTech Appointments and HexaTech Content, in Content's cards look. It is another shell over the same records —
`loyalty_members`, `loyalty_tiers`, `points_transactions`, `benefit_entitlements`, `rewards`, `special_offers`,
`earn_rate_events` — nothing is copied. Spec: `docs/superpowers/specs/2026-10-21-loyalty-workspace-design.md`.

## Who has it, and the ways in and back

- Every organisation has it by default (`Organization::WORKSPACE_DEFAULTS`). Organisations on the Appointments plan
  do not: the plan has no loyalty, and the access map refuses them (`not_in_plan`).
- `php artisan workspace:loyalty <organisation id> --on [--landing] | --off | --status`, and
  `php artisan workspace:loyalty --list` for the organisations that differ from the default. Off deletes nothing.
- An organisation lands in one workspace only: `--landing` here takes the landing from Appointments or Content.
- **The way in:** the full admin's menu shows **HexaTech Loyalty** first in "Members & Loyalty" to staff of every
  organisation that has it (`showsWorkspaceLink(user, 'loyalty')`, from the `/v1/auth/me` refresh).
- **The way back:** "Full admin" (Settings, at the side panel's foot) opens `/members`; a member's page has
  "Open in full admin" for what the workspace does not do (details, bookings, CRM).
- The full admin's member, programme and rewards screens stay as they were (owner, 2026-10-21): both interfaces
  work on the same rows.

## Who may do what

Decided on the server by `App\Services\Loyalty\LoyaltyAccess`; the bootstrap's `staff.can` mirrors it so the screens
never offer what the server refuses. A deactivated staff row counts for nothing; a platform admin passes every flag.

| Action | Who |
|---|---|
| Open the workspace, read every page, Scan, Find | every active staff member |
| Award points | `can_award_points` (Team, in the full admin) |
| Redeem points; fulfil or cancel a reward redemption | `can_redeem_points` |
| Reverse a line of a member's history | managers (`super_admin`, `manager`) |
| Approve, decline or mark done a benefit request | every active staff member |
| Change tiers, tier benefits, the benefit catalogue, boost events | managers |
| Change rewards and offers | `can_manage_offers` |

## The API

All under `/api/v1/admin/loyalty/`, behind the admin chain and `workspace:loyalty`. Every call the workspace makes
names `brand_id=all`: the programme is the organisation's, and the full admin's brand choice must not narrow it (a
staff member restricted to one brand is still held to it by the `brand` middleware).

| Area | Endpoints |
|---|---|
| Bootstrap | `GET bootstrap` |
| Members | `GET members?q&tier_id&state&sort&page` (50 a page, with `figures`), `GET find?q`, `GET members/{id}`, `GET members/{id}/history?page` (25 a page) |
| Points | `POST members/{id}/award`, `POST members/{id}/redeem` (`points`, `reason`, `idempotency_key`), `POST members/{id}/history/{line}/reverse` (`reason`) |
| Requests | `GET requests?state=waiting|approved|done&page`, `POST requests/{id}/approve`, `/done`, `/decline` (`reason`) |
| Scan | `POST scan` (`code`) |
| Program | `GET program`; `POST/PUT program/tiers[/{id}]`, `POST program/tiers/{id}/benefits`, `DELETE program/tiers/{id}/benefits/{tierBenefit}`, `POST/PUT program/benefits[/{id}]`, `POST/PUT/DELETE program/boosts[/{id}]` |
| Rewards | `GET/POST rewards`, `PUT rewards/{id}`; `GET redemptions?state=pending|done|all&page`, `POST redemptions/{id}/fulfil`, `/cancel`; `GET/POST offers`, `PUT offers/{id}`; `GET referrals?page` |

Refusals are `{error, message}`; the workspace shows its own words for each code (`lib/errors.ts`,
`program/errors.ts`, `rewards/errors.ts`), never the server's sentence. Codes: `not_found`, `manager_only`,
`not_allowed` (with `need`), `not_enough_points` (with `balance`), `cannot_reverse`, `already_reversed`, `wrong_state`
(with `state`), the scan's `not_found`, `expired`, `revoked`, `used_up`, `inactive`; a form's field errors are
Laravel's 422. With `ADMIN_ACCESS_MODE=enforce` the access middleware may refuse first (`not_allowed`,
`no_capability`); the workspace reads those as the same missing right.

## Rules the code keeps (and the tests that keep them)

All server tests are in `tests/Feature/LoyaltyWorkspace/` unless named otherwise.

- **Only this organisation.** Every member, line, request, tier, benefit, reward, offer and redemption a route names
  is read through the tenant scope (404 `not_found`); every id a body names (`benefit_id`, `tier_ids`) must be this
  organisation's (422 on the field) — the full admin's `exists:` rules do not check that (`MembersTest`, `ProgramTest`,
  `OffersTest`, …).
- **The ledger is the member's.** A member's history shows every brand's lines, still only this organisation's
  (`MembersTest`). Award and redeem are `LoyaltyService`'s, as the full admin's: an award is an `earn` line with the
  staff member on it. A retry with the same `idempotency_key` writes nothing new; the key is kept per organisation and
  member, so it can never name another member's line (`PointsTest`).
- **Redeem never goes below zero**: refused before writing (`not_enough_points`, with the balance), and again under
  the member's lock by the service.
- **A reversal** undoes one line through `LoyaltyService::reverseTransaction()` (balance, lifetime, qualifying points
  and the expiry buckets): the line must be the member's, not a reversal itself and not reversed already, checked
  under the line's lock — a double press reverses once (`PointsTest`). A reversal can leave a balance below zero when
  the points were spent meanwhile; the dialog says so before sending.
- **Requests move one way**: waiting (`pending`, `eligible`) → approved or declined; approved → done or declined; each
  step re-reads the row under its lock, so two people pressing at once act once and the second hears `wrong_state`
  (`RequestsTest`). Every step is audited (`benefit_request_*`). A decline's reason stays with the request; the member
  app does not show it.
- **Scan finds only this organisation's members.** A secure QR token carries no organisation, so one whose member is
  another organisation's reads as not found and is not used up; every scan is recorded in `scan_events` with the full
  admin's result words (`ScanTest`). The workspace's scan asks no AI for an upsell line.
- **Redemptions have one writer**, `App\Services\Loyalty\RedemptionActions`, called by the full admin and the
  workspace: a pending cancel gives the points back by reversing the debit and returns the stock; a cancel of a
  fulfilled one is bookkeeping only (`RedemptionsTest`; `tests/Feature/Admin/RewardRedemptionActionsTest.php` proves
  the full admin's answers did not change). The workspace offers Fulfil and Cancel on pending ones only.
- **Option lists come from the server** (`App\Services\Loyalty\LoyaltyForms`): benefit categories and how a benefit is
  given, offer types, discount types, what a discount applies to. The workspace names them; it keeps no copy.
- **A boost's times** sent as `YYYY-MM-DDTHH:mm` are the venue's wall clock; they are stored and answered as instants
  (`LoyaltyForms::instant`, `ProgramTest`).
- **Search words are literal** (`%`, `_`, `!` match themselves); a phone is found by its digits however it was
  stored; the SQL runs on PostgreSQL and on the tests' SQLite (no `ILIKE`, no `FILTER`) (`MembersTest`).

## The workspace (`/loyalty`, `frontend/src/loyalty/`)

- **Where it lives.** A lazily loaded app on the shared core (`src/workspace/`): own chunk, own shell, no full-admin
  copilot. The look is kept on the device under `loyalty:look` and `loyalty:brand-paint`.
- **The frame** is Content's cards frame (spec 2026-10-21 Content §4): the side-panel foot, the phone menu, the
  menus they open, the dialog, the page boundary and the page header now live in `src/workspace/` and both
  workspaces use them. The side panel shows Requests with the number waiting (`WorkspaceNavItem.count`).
- **Palette.** `theme/loyalty.css` under `[data-loyalty]`: the same navy as Content (`NAVY_SURFACES`; the
  `loyaltyContrast` test proves the values equal), plus a request's state tones, a ledger line's signs and the tier
  chip. A tier's chip wears the tier's own colour with white or dark ink by contrast (`theme/tierChip.ts`).
- **Members**: the numbers line, the tiers as chips with their counts, search, Show and Order; the choices live in the
  address (`members/membersQuery.ts`). **A member's page**: points and the way to the next tier, the tier's benefits,
  the requests that wait, Award and Redeem (A and R), the whole history with a manager's Reverse.
  **Requests**: Waiting, Approved, Done, read every 60 s. **Program** and **Rewards**: §4.5 and §4.6 of the spec.
  **Scan**: one field for a card reader or a typed member number; Enter sends; the field keeps the focus.
- **Find** (Ctrl/⌘ K or "/") searches members on the server from two letters; S opens Scan; ? lists the shortcuts.
- **Words.** `src/loyalty/i18n/loyalty.<lang>.json`, `program.<lang>.json`, `rewards.<lang>.json` in five languages,
  read under `loyalty.*`, `loyalty.program.*`, `loyalty.rewards.*`. `loyaltyLocales.test.ts` keeps the key sets
  equal, the `{{names}}` intact, every run-time family present, and the English equal to the code's fallbacks.
- **Rules on the source** (`loyalty/tokens.test.ts`): only `a-*` and `l-*` classes, only `/v1/admin/loyalty/…`
  (not `loyalty-presets`), nothing from another workspace, every CSS rule under `[data-loyalty]`.
- **Dialogs** focus their first field with `lib/useFirstFocus.ts`: `autoFocus` does not work inside the shared
  Dialog, which focuses its own box after React applies it. The shared Dialog's scrim carries `!m-0`: opened inside a
  `space-y-*` list it would otherwise take the list's top margin and leave a strip of the page uncovered.
- **Forms.** The fields and checks Program and Rewards share live in `ui/formParts.tsx` and `lib/forms.ts`; each
  screen's own rules stay in its pure `programMath.ts` / `rewardsMath.ts`, tested by string.

## What this release does not do

No campaigns, push or email; no wallet passes or member-app look; no analytics; no member import, duplicates, merge
or segments; no editing of a member's details; no image upload for rewards and offers; no brand choice. The full
admin keeps all of these.

## Known limits

- **Boost times made in the full admin.** The full admin's boost form sends the time it shows without an offset and
  it is stored as if it were UTC; the workspace reads stored instants in the venue's zone. A boost made in the full
  admin at 18:00 in Riga therefore shows here at 21:00 (the full admin's own list shows the same 21:00 in a Riga
  browser). Boosts made or saved in the workspace are right. A fix belongs to the full admin's form.
- **Amounts carry no currency sign.** A fixed-amount benefit, reward or offer shows "25 off", as the full admin does:
  the programme stores a bare number and the workspace does not guess the venue's currency.
- **New rows land on the default brand.** Rewards, offers and boosts created in the workspace go to the
  organisation's default brand, as in the full admin's "All brands".
- **`docs/appointments-workspace.md`** used to say points are reversed on the full admin's member page; the full admin
  has no such screen. Reversal is the workspace's, on the member's page.

## Deploying

- No migration, no queue or schedule change, no new public route. One new artisan command (`workspace:loyalty`).
- Ship by the source-patch recipe (`docs/landing-page-builder.md` §6): a worktree from `origin/main`, the change list
  with every deletion and rename (the shared-core move renames files under `frontend/src/content/` into
  `frontend/src/workspace/`), the suites on the artifact, a fresh build, then push. Never push the feature branch.
- Verify by content on the live site: `/api/v1/admin/loyalty/bootstrap` answers 401 when signed out (404 before); the
  `LoyaltyApp` chunk carries "Points history" and "Requests"; the index bundle does not; `/content` as before.

### After the deploy (owner, signed in)

- Open `/loyalty` as a manager and as a staff member; check the menu entry in the full admin's "Members & Loyalty".
- On a test member: award 1 point, then reverse it (the balance comes back, the line says Reversed).
- Approve one benefit request (or ask a test member to request one in the app first).
- Scan one member's QR code from the member app on a phone, and type one member number.
- On Program, check the tiers and their colours; on Rewards, the catalogue and pending redemptions.
- Reload admin tabs left open across the deploy.
