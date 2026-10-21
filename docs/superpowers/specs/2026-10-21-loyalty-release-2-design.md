# HexaTech Loyalty, release 2 — members complete, insights, campaigns, card & app (design)

Status: owner's answers of 2026-10-21. Builds on release 1 (`2026-10-21-loyalty-workspace-design.md`, live since
`main` 05f3ad1). Runbook: `docs/loyalty-workspace.md`.

## 1. Owner decisions

| # | Question | Answer |
|---|---|---|
| R2-1 | What release 2 covers | **Members, complete**; **Insights**; **Segments & campaigns**; **Wallet & member-app look**. |
| R2-2 | Small fixes | **Currency on amounts** and **images for rewards and offers**. The full admin's boost form is **not** changed. |
| R2-3 | Merge | **Fix the shared merge** so it keeps all history; the full admin's merge gets the fix too. |
| R2-4 | Delete | Deleting a member **also clears the date of birth**, in the workspace and the full admin. |
| R2-5 | Offer image | The full admin's offer **edit** gets the image check its create already has. |

Everything else in the full admin stays as it is (release 1, D3). Where the workspace needs logic the full admin holds
inside a controller, that logic moves into one shared service which the full admin's controller then calls — the
release 1 pattern (`RedemptionActions`) — and a test pins the full admin's answer on the old code and on the new.

## 2. Non-goals

- No push notifications, SMS or in-app messages from the workspace; campaigns are **email only**, through the existing
  email-campaign pipeline. No bulk message from the members list.
- No merge tags in campaign bodies (the shared pipeline substitutes none; adding them would change the full admin's
  campaigns). No scheduling (the pipeline has none).
- No cohort retention chart; no booking, revenue or CRM figures in Insights (loyalty only).
- No change to the member portal, the member API, the native apps' theme endpoint (`GET /v1/theme`) or the public
  join page: the workspace writes the same settings they already read.

## 3. Side panel and roles

Areas, in order: **Members**, **Requests**, **Program**, **Rewards**, **Campaigns**, **Insights**, **Scan**,
**Card & app**. On a phone the top bar keeps Members, Requests and Scan; the others move into the phone menu
(`WorkspaceNavItem.phone = false`; the shared shell lists them at the top of the menu panel).

| Who | Sees | Does |
|---|---|---|
| Staff | Members, Requests, Program, Rewards, Scan | Add a member, edit details, show the card, resend the welcome email; release 1's rights |
| Staff with `can_view_analytics` | + Insights | Read Insights |
| Manager (`super_admin`, `manager`) | All eight | + change tier, deactivate/reactivate, delete, duplicates & merge, import, export; segments, campaigns (send is theirs); wallet and the member app's look |

`staff.can` in the bootstrap gains `manage_members`, `view_insights`, `manage_campaigns`, `manage_app`; the bootstrap
gains `features: {campaigns, wallet}` (`Organization::hasFeature`) and `venue.currency`. The server decides every
right (`LoyaltyAccess`); the client only hides what it cannot use. `config/admin_access.php` runs AccessMap in
`report` mode, so every controller also checks `LoyaltyAccess` itself.

## 4. Members, complete

### 4.1 Screens

- **Members list**: "Add member" for everyone; for managers a toolbar with Import, Export (the list's current filters)
  and Duplicates.
- **Add member** (dialog): name, email, phone, "send the welcome email" (on). The member starts on the programme's
  default tier and gets the welcome bonus, as in the full admin. No tier choice: the full admin's starting tier is
  undone by the welcome bonus's tier assessment, and the workspace does not offer what does not hold. On success the
  member's page opens.
- **The member's page** gains: details (email, phone, language, nationality, date of birth, marketing consent, member
  number, joined); **Edit details**; **Card** (the member's QR, member number, Print); a **More** menu with Resend the
  welcome email, and for managers Change tier (with "keep until"), Deactivate / Reactivate, Delete.
- **Delete** (manager): a dialog that says what goes (name, email, phone, date of birth, push token, cards, sign-in) and
  what stays (member number and the points history), and asks to type the member's name.
- **Duplicates** (`/loyalty/members/duplicates`, manager): pairs with why they match (same email, same phone), which
  one is kept (the oldest, changeable), a reason, Merge; a dialog lists what moves. The kept member's page opens.
- **Import** (`/loyalty/members/import`, manager): choose a CSV → preview (rows, new, existing, problems up to 100,
  five sample rows) → Import, driven in chunks with progress and Cancel → the result with each refused row; past imports
  below. The accepted columns are the full admin's (`MemberImportService` aliases).

### 4.2 API (`/v1/admin/loyalty/…`)

| Method, path | Rule | Does |
|---|---|---|
| `POST members` | staff | Enrol. `{name, email, phone?, send_welcome}` → 201 `{member}`. Refusals: field errors (`email` taken: the users table is shared by every organisation), `member_limit` 402 |
| `PUT members/{id}` | staff | Details `{name, email, phone, language, nationality, date_of_birth, marketing_consent}` → `{member}` |
| `PUT members/{id}/tier` | manager | `{tier_id, keep_until?}` → `{member}` |
| `POST members/{id}/deactivate`, `…/reactivate` | manager | Idempotent; → `{member}` |
| `POST members/{id}/erase` | manager | Delete (anonymise); `{confirm_name}` must equal the member's name → `{member}` |
| `GET members/{id}/card` | staff | `{member_number, qr_svg}` (an SVG data URI; never a 500 without GD) |
| `POST members/{id}/welcome` | staff | Resend; at most once per member per 10 minutes → `too_soon` 429 `{retry_after}` |
| `GET members/duplicates` | manager | `{pairs: [{a, b, reasons, keep}]}` |
| `POST members/merge` | manager | `{keep_id, merge_id, reason}` → `{member}` |
| `GET members/imports` | manager | Past imports (every brand) |
| `POST members/imports` | manager | Multipart `file` → preview, a pending batch |
| `POST members/imports/{batch}/run` | manager | One chunk (`AdvisoryLock` `loyalty-import:{batch}`; a second caller gets `busy` 409) |
| `GET members/imports/{batch}`, `POST …/{batch}/cancel` | manager | Progress; stop |
| `GET members/export` | manager | CSV of the filters `GET members` takes; audited `loyalty.members_exported` |

### 4.3 Server

- `App\Services\Loyalty\Members\MemberEnrolment` — `enrol()` and `resendWelcome()`, moved out of
  `MemberAdminController@store` / `@resendWelcomeEmail`, which call it and keep their answers.
- `MemberDetails` — `update()` and `changeTier()`, out of `MemberAdminController@update` (which keeps its avatar
  upload and its answer).
- `MemberStatus` — `deactivate()` / `reactivate()` (the full admin keeps its toggle).
- `MemberErasure` — out of `MemberAdminController@destroy`, which calls it; **also clears `date_of_birth`** (R2-4).
- `MemberMergeService::merge()` **keeps history** (R2-3): before the merged member is deleted, every row that names it
  moves to the kept member — reward redemptions, referrals (as referrer and as referred), push notifications (the list
  named `notifications`; the table is `push_notifications`), service bookings, booking mirrors, reservations, and every
  other table with a member column; a test fails if a member column exists that the merge does not move. An
  `AuditLog` row `member_merged` beside the `member_merges` snapshot.
- Import: `MemberImportService` as it is; the workspace controller adds the per-batch lock and reads batches for the
  whole organisation (no brand scope).
- Export: `MemberDirectory`'s portable filters, streamed.

## 5. Insights (`/loyalty/insights`)

Managers and `can_view_analytics`. A period: 30 days, 90 days, 12 months (buckets: day, week, month), counted on the
venue's clock (`VenueClock`), for the whole organisation (no brand scope), no cache.

- **Tiles**: members (and new in the period), active members (activity in the last 90 days), points issued, redeemed,
  expired, outstanding, and the redemption rate.
- **Charts**: members over time (new per bucket and the running total); points issued / redeemed / expired per bucket;
  reward redemptions per bucket; members by tier; tier movement (up, down, and the flows); points due to expire in the
  next six months and those already overdue; engagement (active, new, at risk, dormant); balances by band.
- **At risk**: members with no activity for 60 days (changeable), linked to their page.

Definitions, pinned by tests: *issued* is the sum of positive lines that are not reversed and are not the refund of a
cancelled redemption; *redeemed* is the points of `redeem` lines not reversed, less refunds; *expired* is the points of
`expire` lines; *outstanding* is the sum of current balances. A reversal removes its line from every figure.

API: `GET insights?period=30d|90d|12m` and `GET insights/at-risk?days=` (`admin/loyalty/insights`:
`can_view_analytics` for read). Server: `App\Services\Loyalty\Insights\LoyaltyInsights`, written like Appointments'
`InsightsReport` (rows fetched with plain queries, counted in PHP), so it runs the same on PostgreSQL and the tests'
SQLite. The full admin's `/analytics/*` endpoints are not reused: four of them fail on SQLite and all count in UTC.

Charts are the workspace's own small SVG components (bars, stacked bars, a line), coloured with `l-*` tokens, each
with a table for screen readers; no chart library (they render to a string in tests, and the chunk stays small).

## 6. Segments & campaigns (`/loyalty/campaigns`, managers)

Two tabs, **Campaigns** and **Segments**.

- **Segments**: name, description, rules (`MemberSegmentService`'s format: `{operator: AND|OR, filters: [{type, op,
  value}]}` with types tier, activity, current_points, lifetime_points, joined, redemptions, earn), a live count with
  ten sample members. The options come from the server. **A segment never matches everyone by accident**: every rule
  needs a known type, a known operator and a value; "Everyone" is a choice of its own, saved as no rules. The shared
  service fails open on a bad rule; the workspace refuses one (`bad_rule` with the rule's index).
- **Campaigns**: name, subject, the audience (a segment), the body as blocks — heading, text, button (label and link),
  divider — in the block format of the full admin's `EmailBlockBuilder`, so either side can edit a draft. The server
  renders the email from the blocks, escaping every text, and stores `body_blocks` and `body_html`; the client never
  sends HTML. A preview of that rendering; **Send me a test**; **Send** with a confirmation that names how many members
  it will reach (those who agreed to marketing, are not unsubscribed and not suppressed); Cancel while sending;
  Duplicate; Delete a draft. A list with status (draft, sending, sent, failed, cancelled) and counts.
- **Sending** goes through the existing pipeline (`SendEmailCampaignChunk`: consent, suppression, rate limits, the
  venue's sender name). The workspace's Send starts a campaign with one conditional update (`draft` → `sending`), so two
  presses cannot start it twice. Without the plan's `campaigns` feature the Campaigns tab says so (the routes answer
  402 `feature_locked`); Segments still work.

API (`admin/loyalty/segments` staff/manager, `admin/loyalty/campaigns` staff/manager): `GET|POST segments`,
`PUT|DELETE segments/{id}`, `POST segments/preview`, `GET segments/options`; `GET|POST campaigns`,
`GET|PUT|DELETE campaigns/{id}`, `GET campaigns/{id}/audience`, `POST campaigns/{id}/test`, `…/send`, `…/cancel`,
`…/duplicate`.

## 7. Card & app (`/loyalty/app`, managers)

- **Wallet pass** (plan feature `wallet`): whether Apple and Google are ready, the fields the full admin edits (pass
  type id, team id, organisation name, the three colours, Google issuer and class suffix, on/off), the three uploads.
  Secrets are never shown — only whether each is set. `App\Services\Loyalty\WalletSettings`, out of
  `WalletConfigController`, which calls it; new tests pin the full admin's endpoints first (none exist).
- **Member app**: the native app's colours and styles (`hotel_settings` group `mobile_app`: the `mobile_*_color` keys,
  card style, radius, button style, accent intensity, preset), the logo (as the full admin's logo upload: `MediaService`
  folder `logos`, the old file deleted), and a phone preview of the member card. Colours must be `#rrggbb`; styles come
  from server option lists. `App\Services\Loyalty\AppLook` writes the same keys the full admin's settings page writes.
- **Images for rewards and offers** (R2-2): `POST|DELETE rewards/{id}/image`, `POST|DELETE offers/{id}/image`
  (`can_manage_offers`), the full admin's limits (JPEG, PNG or WebP; rewards 5 MB, offers 2 MB; the dimension rule),
  `MediaService` folders `rewards` / `offers`, the old file deleted on replace and remove. The full admin's
  `OffersAdminController@update` gets create's `image` rule (R2-5).

## 8. Currency (R2-2)

`PortalBootstrap::currency($org)` — the rule the member portal already shows (`organizations.currency`, else
`services_currency`, else EUR) — becomes a method both bootstraps call. The workspace formats fixed amounts with
`Intl.NumberFormat` (`lib/format.ts` `money()`): "€25 off".

## 9. How it is built

Each area owns its folder and its words: `frontend/src/loyalty/{membership,insights,campaigns,app}/` with
`i18n/{membership,insights,campaigns,app}.<lang>.json` under `loyalty.<area>`; server controllers under
`App\Http\Controllers\Api\V1\Admin\Loyalty\`; tests under `tests/Feature/LoyaltyWorkspace/`, each area's extra tables
in its own schema trait. The shared files — routes, AccessMap, the bootstrap, the app's routes, the side panel, the
bundle registration — are wired first, with the API above. Rules from release 1 hold: only `a-*`/`l-*` classes and
`/v1/admin/loyalty/…`, `brand_id=all`, five languages, decisions in pure functions tested by string, no SQL that
SQLite cannot run, every id checked against the organisation, the server's words never shown.

## 10. Rollout and risks

One deploy by the source-patch recipe after the owner's "yes, deploy"; no migration expected (a builder that needs one
says so first).

| Risk | Answer |
|---|---|
| A moved controller method answers differently. | A test of the full admin's endpoint written against the old code first, run on both. |
| A campaign reaches members who did not agree. | Only the existing pipeline sends, and it filters on consent, unsubscribe and suppression; the confirmation names the number it will reach. |
| A retried chunk re-sends to up to 100 members. | Known, in the shared job; recorded as a limit, not changed here. |
| Wallet certificates live on the server's local disk, unencrypted (only the password is encrypted). | Known, shared with the full admin; recorded for the owner. |
| A merge loses history. | Fixed (R2-3), with a test per table and one that fails on an unmoved member column. |
