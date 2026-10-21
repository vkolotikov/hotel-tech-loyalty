# HexaTech Loyalty — runbook

HexaTech Loyalty (`/loyalty`) is the loyalty programme as its own workspace beside the full admin, a sibling of
HexaTech Appointments and HexaTech Content, in Content's cards look. It is another shell over the same records —
`loyalty_members`, `loyalty_tiers`, `points_transactions`, `benefit_entitlements`, `rewards`, `special_offers`,
`earn_rate_events`, and since release 2 `member_segments`, `email_campaigns`, `wallet_configs` and the `mobile_app`
settings — nothing is copied. Specs: `docs/superpowers/specs/2026-10-21-loyalty-workspace-design.md` (release 1) and
`docs/superpowers/specs/2026-10-21-loyalty-release-2-design.md` (release 2: members complete, Insights, segments and
campaigns, card and app, pictures, currency).

## Who has it, and the ways in and back

- Every organisation has it by default (`Organization::WORKSPACE_DEFAULTS`). Organisations on the Appointments plan
  do not: the plan has no loyalty, and the access map refuses them (`not_in_plan`).
- `php artisan workspace:loyalty <organisation id> --on [--landing] | --off | --status`, and
  `php artisan workspace:loyalty --list` for the organisations that differ from the default. Off deletes nothing.
- An organisation lands in one workspace only: `--landing` here takes the landing from Appointments or Content.
- **The way in:** the full admin's menu shows **HexaTech Loyalty** first in "Members & Loyalty" to staff of every
  organisation that has it (`showsWorkspaceLink(user, 'loyalty')`, from the `/v1/auth/me` refresh).
- **The way back:** "Full admin" (Settings, at the side panel's foot) opens `/members`; a member's page has
  "Open in full admin" for what the workspace does not do (bookings, CRM).
- The full admin's member, programme and rewards screens stay as they were (owner, 2026-10-21): both interfaces
  work on the same rows. Release 2 changed three full-admin behaviours on the owner's word (R2-3, R2-4, R2-5): a merge
  keeps every row of history, a delete also clears the date of birth, an offer's edit checks its picture.

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
| Change rewards and offers, and their pictures | `can_manage_offers` |
| Add a member, edit details, show the card, resend the welcome email | every active staff member |
| Change a member's tier, deactivate or reactivate, delete; duplicates and merge; import; export | managers |
| Insights | managers and `can_view_analytics` (the full admin's Analytics rule) |
| Segments: read the list | every active staff member; build, change and preview them: managers |
| Campaigns: everything, reads included (drafts are unpublished words) | managers; with the plan's `campaigns` |
| Card & app: wallet pass (with the plan's `wallet`), the member app's look and logo | managers |

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
| Rewards | `GET/POST rewards`, `PUT rewards/{id}`; `GET redemptions?state=pending|done|all&page`, `POST redemptions/{id}/fulfil`, `/cancel`; `GET/POST offers`, `PUT offers/{id}`; `GET referrals?page`; `POST/DELETE rewards/{id}/image`, `POST/DELETE offers/{id}/image` |
| Members (release 2) | `POST members`, `PUT members/{id}`, `PUT members/{id}/tier`, `POST members/{id}/deactivate`, `/reactivate`, `/erase` (`confirm_name`), `GET members/{id}/card`, `POST members/{id}/welcome`; `GET members/duplicates`, `POST members/merge`; `GET/POST members/imports`, `GET members/imports/{batch}`, `POST members/imports/{batch}/run`, `/cancel`; `GET members/export` (CSV) |
| Insights | `GET insights?period=30d|90d|12m`, `GET insights/at-risk?days=` (7–365) |
| Segments | `GET segments`, `GET segments/options`, `POST segments/preview`, `POST segments`, `PUT/DELETE segments/{id}` |
| Campaigns (`feature:campaigns`) | `GET/POST campaigns`, `GET/PUT/DELETE campaigns/{id}`, `GET campaigns/{id}/audience`, `POST campaigns/{id}/test`, `/send` (`recipients`, `revision`), `/cancel`, `/duplicate` |
| Card & app | `GET/PUT wallet`, `POST wallet/apple-cert`, `/apple-wwdr`, `/google-service-account` (`feature:wallet`); `GET/PUT app-look`, `POST app-look/logo` |

Refusals are `{error, message}`; the workspace shows its own words for each code (`lib/errors.ts`,
`program/errors.ts`, `rewards/errors.ts`), never the server's sentence. Codes: `not_found`, `manager_only`,
`not_allowed` (with `need`), `not_enough_points` (with `balance`), `cannot_reverse`, `already_reversed`, `wrong_state`
(with `state`), the scan's `not_found`, `expired`, `revoked`, `used_up`, `inactive`; a form's field errors are
Laravel's 422. With `ADMIN_ACCESS_MODE=enforce` the access middleware may refuse first (`not_allowed`,
`no_capability`); the workspace reads those as the same missing right. Release 2 adds, each with its own words in the
area's `errors.ts`: members `member_limit` (402), `no_tier`, `bad_tier`, `name_mismatch`, `already_erased`, `too_soon`
(with `retry_after`), `no_email`, `email_failed`, and the import's `busy`, `no_rows`, `too_many_rows`,
`no_email_column`; campaigns `bad_rule` (with the rule's index), `in_use`, `no_audience`, `incomplete`,
`nobody_to_send_to`, `too_many`, `audience_changed`, `changed`, `already_started`, `not_started`, `not_a_draft`,
`not_sending`, `not_editable_here`, `suppressed`, `test_failed`; card & app's file checks (`not_pkcs12`,
`cert_unreadable`, `not_certificate`, `not_json`, `not_service_account`); `feature_locked` (402) without the plan's
feature.

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

### Release 2

- **One writer per member action**, shared with the full admin (`App\Services\Loyalty\Members\`): `MemberEnrolment`
  (add, resend the welcome email), `MemberDetails` (details, tier with "keep until" → `tier_override_until`, so the
  next review does not undo it), `MemberStatus` (deactivate and reactivate, idempotent), `MemberErasure` (delete:
  anonymise, and the date of birth goes too), `MemberImportRun` (the import's steps). `MemberAdminController` and
  `MemberImportController` call them; `tests/Feature/Admin/Member*EndpointsTest.php` pin the full admin's answers,
  written against the old code first. A deleted member is recognised by the stub address
  `deleted-member-{id}@deleted.local` and refused for everything but the history (`already_erased`).
- **A merge keeps everything** (`MemberMergeService`): `MEMBER_COLUMNS` lists every member column of the migrations
  and each is moved to the kept member before the other is deleted; `MemberMergeServiceTest` scans the migrations and
  fails on a member column the merge does not handle. Shared offers and referrals that would collide are de-duplicated
  first and kept in the merge's snapshot; QR tokens move and are revoked; an `AuditLog` `member_merged`. A deleted
  member cannot be merged.
- **Import runs one chunk at a time under `AdvisoryLock` `loyalty-import:{batch}`**; a second caller, or one whose
  view is stale (`from`), gets `busy` and nothing is imported twice. Batches are read for every brand; the stored file
  is deleted when a workspace batch ends.
- **Export** is CSV (UTF-8 with BOM) of the list's filters through `MemberDirectory::filtered()`, audited
  `loyalty.members_exported`; a cell that would start a spreadsheet formula is prefixed with an apostrophe.
- **Insights** (`App\Services\Loyalty\Insights\LoyaltyInsights`) counts on the venue's clock for the whole
  organisation, no cache, portable SQL. A reversed line and its reversal count nowhere; *issued* is the remaining
  positive lines except a cancelled redemption's refund; *redeemed* is `redeem` lines less refunds; *expired* is
  `expire` lines; the redemption rate is redeemed ÷ issued. New members count by `joined_at`, else `created_at` — the
  members list's "new this month" counts the same way.
- **Segments never match everyone by accident** (`Campaigns\SegmentRules`): every rule needs a known type, operator
  and value, an empty list is refused unless "Everyone" was chosen. The shared `MemberSegmentService` is unchanged.
- **A campaign is sent once, to the number confirmed** (`Campaigns\CampaignStart`): Send carries the count shown and
  the draft's revision; one conditional update starts it (`draft` → `sending`) and the job is handed exactly the
  members counted (`Campaigns\CampaignAudience`: consent, an address, not suppressed). Sending is the shared
  `SendEmailCampaignChunk`, unchanged. Bodies are blocks in the full admin builder's shape, rendered to HTML on the
  server with every text escaped (`Campaigns\CampaignBody`); a draft with blocks the workspace does not offer is
  read-only here. Test sends go to the sender's own address with "[TEST]".
- **Wallet settings have one writer**, `WalletSettings`, which `WalletConfigController` now calls
  (`tests/Feature/Admin/WalletConfigEndpointsTest.php`); secrets are never answered, logged or audited; uploads are
  checked by their content (`App\Services\Loyalty\App\WalletFiles`).
- **The member app's look** is written by `AppLook` to the same `mobile_app` settings in the same form as the full
  admin's settings page, so `GET /v1/theme` answers alike (`AppLookTest`). The logo is `company_logo`.
- **Pictures** for rewards and offers: the full admin's limits, `MediaService`; the old file is deleted only when it
  is this organisation's own in that folder (`App\Services\Loyalty\App\OwnMedia`). The browser asks for `/storage/…` at the API's host
  (`lib/api.ts` `mediaUrl`, the full admin's `resolveImage`).
- **Currency** is `PortalBootstrap::currency()` in both bootstraps; amounts show as `Intl` money ("€25 off").

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
- **Release 2's areas** each own a folder and a bundle: `membership/` (with additions to `members/` and `member/`),
  `insights/` (its own SVG charts and `theme/insights.css`), `campaigns/`, `app/`; words in
  `i18n/<area>.<lang>.json` under `loyalty.<area>`. `loyaltyLocales.test.ts` finds every area bundle and its
  `words.ts`/`errors.ts` by itself; `tokens.test.ts` checks every stylesheet in the folder.
- **Eight areas.** The side panel lists Campaigns, Insights and Card & app only to whoever may use them; on a phone
  the top bar keeps Members, Requests and Scan and the others are in the phone menu (`WorkspaceNavItem.phone`).

## What the workspace does not do

No push notifications, SMS or bulk messages from the members list; no merge tags or scheduling in campaigns; no
cohort retention or booking figures in Insights; no brand choice. The full admin keeps these.

## Known limits

- **Boost times made in the full admin.** The full admin's boost form sends the time it shows without an offset and
  it is stored as if it were UTC; the workspace reads stored instants in the venue's zone. A boost made in the full
  admin at 18:00 in Riga therefore shows here at 21:00 (the full admin's own list shows the same 21:00 in a Riga
  browser). Boosts made or saved in the workspace are right. A fix belongs to the full admin's form.
- **The currency** is the member portal's: `organizations.currency`, which defaults to USD, before the
  `services_currency` setting. A venue that never ran booking setup shows USD in both until its currency is set.
- **Campaign retries.** A retried chunk of the shared job can send to up to 100 members a second time, and an address
  suppressed after Send is skipped but counted as sent; both are the shared pipeline's, unchanged.
- **The full admin's wallet form clears the certificate password on every save** (it sends an empty password, which
  Laravel turns into "none"). Pinned as it is; the workspace's own save never touches the password, and its readiness
  says when the certificate no longer opens.
- **Wallet certificates** are kept unencrypted on the server's local disk (only the password is encrypted), as before.
- **Two logo writers.** The full admin's logo upload and the workspace's write `company_logo` in the same form; the
  full admin deletes the old file whatever it is, the workspace only its own.
- **Finding duplicates** loads the organisation's members into PHP (the shared service, unchanged).
- **New rows land on the default brand.** Rewards, offers and boosts created in the workspace go to the
  organisation's default brand, as in the full admin's "All brands".
- **`docs/appointments-workspace.md`** used to say points are reversed on the full admin's member page; the full admin
  has no such screen. Reversal is the workspace's, on the member's page.

## Deploying

- Release 1 is live (`main` 05f3ad1). Release 2: no migration, no queue or schedule change, no new public route, no
  new command. Its change list is `git diff --name-status 5895004 <tip>` (5895004 is the branch commit release 1 was
  built from); it changes full-admin files on purpose: `MemberAdminController`, `MemberImportController`,
  `MemberMergeService`, `WalletConfigController`, `OffersAdminController`, `PortalBootstrap` (the currency method).
- Release 1: no migration, no queue or schedule change, no new public route. One new artisan command (`workspace:loyalty`).
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

### After the release 2 deploy (owner, signed in)

- Members: add a test member (the welcome email arrives), edit their details, open their card and scan it in Scan;
  change their tier with "keep until"; delete them (the page then shows only the history).
- Duplicates: merge a known pair and check the kept member's history and points.
- Import a three-row CSV; Export the list and open it in a spreadsheet.
- Insights: the three periods; the numbers against what you know of the programme.
- Campaigns: build a segment, write a draft, send yourself a test; send a real one only to a segment you chose.
- Card & app: the wallet pass's readiness; the member app's colours (the native app shows them on its next start).
- Rewards: add a picture to a reward and see it on the catalogue.
