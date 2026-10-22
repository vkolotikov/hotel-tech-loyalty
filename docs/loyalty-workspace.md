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
  work on the same rows. Release 2 changed four full-admin behaviours on the owner's word (R2-3 to R2-6): a merge
  keeps every row of history, a delete also clears the date of birth, an offer's edit checks its picture, and saving
  the wallet settings with the password left blank keeps the stored certificate password.

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
| Insights | `GET insights?period=30d|90d|12m`, `GET insights/at-risk?days=` (7–365); release 4: `GET insights/cohorts`, `GET insights/money?period=` |
| Segments | `GET segments`, `GET segments/options`, `POST segments/preview`, `POST segments`, `PUT/DELETE segments/{id}` |
| Campaigns (`feature:campaigns`) | `GET/POST campaigns`, `GET/PUT/DELETE campaigns/{id}`, `GET campaigns/{id}/audience`, `POST campaigns/{id}/test`, `/send` (`recipients`, `revision`), `/cancel`, `/duplicate`; release 4: `/schedule` (`send_at` on the venue's clock, `YYYY-MM-DDTHH:mm`, and `revision`), `/unschedule` |
| Push messages (`feature:push_notifications`, release 3) | `GET/POST push`, `GET/PUT/DELETE push/{id}`, `GET push/{id}/audience`, `POST push/{id}/send` (`recipients`, `revision`), `/cancel`, `/duplicate`; release 4: `/schedule`, `/unschedule` |
| SMS (`feature:campaigns`, release 4) | `GET/POST sms`, `GET/PUT/DELETE sms/{id}`, `GET sms/{id}/audience`, `POST sms/{id}/test`, `/send` (`recipients`, `revision`), `/schedule`, `/unschedule`, `/cancel`, `/duplicate` |
| Card & app | `GET/PUT wallet`, `POST wallet/apple-cert`, `/apple-wwdr`, `/google-service-account` (`feature:wallet`); `GET/PUT app-look`, `POST app-look/logo`; release 4: `GET currency`, `PUT currency` (`currency`, `dry_run`) |

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
`not_sending`, `not_editable_here`, `suppressed`, `test_failed`; push messages (release 3) the same start codes plus
`no_category`; release 4: SMS the same start codes plus `not_ready` (the venue's Twilio account is not set up) and
`no_phone` (a test SMS to a sender with no phone number), and send later's `bad_time` (not 2 minutes to a year ahead,
or a time a clock change skips) and `not_scheduled`; card & app's file checks (`not_pkcs12`,
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
  `SendEmailCampaignChunk` (since release 3 once per member, with tags filled — below). Bodies are blocks in the full admin builder's shape, rendered to HTML on the
  server with every text escaped (`Campaigns\CampaignBody`); a draft with blocks the workspace does not offer is
  read-only here. Test sends go to the sender's own address with "[TEST]".
- **Wallet settings have one writer**, `WalletSettings`, which `WalletConfigController` now calls
  (`tests/Feature/Admin/WalletConfigEndpointsTest.php`); a blank certificate password keeps the stored one (the full
  admin's form sends one on every save, which used to clear it); secrets are never answered, logged or audited; uploads are
  checked by their content (`App\Services\Loyalty\App\WalletFiles`); since release 3 their contents are kept in the
  database, encrypted (below).
- **The member app's look** is written by `AppLook` to the same `mobile_app` settings in the same form as the full
  admin's settings page, so `GET /v1/theme` answers alike (`AppLookTest`). The logo is `company_logo`.
- **Pictures** for rewards and offers: the full admin's limits, `MediaService`; the old file is deleted only when it
  is this organisation's own in that folder (`App\Services\Loyalty\App\OwnMedia`). The browser asks for `/storage/…` at the API's host
  (`lib/api.ts` `mediaUrl`, the full admin's `resolveImage`).
- **Currency** is `PortalBootstrap::currency()` in both bootstraps; amounts show as `Intl` money ("€25 off").

### Release 3

Spec: `docs/superpowers/specs/2026-10-22-loyalty-release-3-design.md`.

- **Files that must survive a deploy are in the database.** Laravel Cloud keeps neither the server's disk between
  deployments nor one disk across replicas. `wallet_configs` keeps the three wallet files (base64 under the
  `encrypted` cast; read only through `WalletConfig::fileBytes()`); signing writes 0600 temp files and deletes them in
  `finally`; a file still on a disk from before is taken in on the first read. `member_import_batches.file_content`
  keeps an import's file (gzip + base64) from the preview to the end of the batch, then clears it. The answers of both
  admins are unchanged (flags only). Apple passes are signed with the signature part only (`smimeToDer`; they never
  worked before).
- **The member inbox.** A `push_notifications` row is a notification kept for the member's inbox; its only writer is
  `NotificationService::keep()`, which writes it for every member who did not switch that kind off, app or no app,
  and marks it sent; the push itself still needs push switched on and a device. The app's inbox and the portal's
  unread count read every row (no `is_sent` filter, so a row the code before release 3 wrote during the deploy still
  shows). The migration `2026_10_22_110100` marked every earlier row sent and read.
- **Email campaigns go once per member, with tags.** `SendEmailCampaignChunk` writes the member's
  `email_campaign_deliveries` row before the send (`insertOrIgnore`); a retried chunk passes over anyone with a row
  (pending, sent, failed or suppressed) — at most once. A send the suppression listener cancels counts as neither sent
  nor failed. The full admin's Reset clears the campaign's rows, so its warning ("sending again emails them a second
  time") stays true. Tags (`EmailTemplate::AVAILABLE_TAGS`, `{{member.name}}`, `{{member.tier}}`,
  `{{member.points}}`) are filled per member by `App\Services\Email\CampaignTags` after rendering, escaped in the body,
  one plain line in the subject; an unknown tag stays as written and the workspace names it before Send. Test emails
  and the preview fill them with the sender's own name and made-up figures.
- **Push messages** (`Loyalty\Push\*`, `SendPushMessageChunk`): rows of `notification_campaigns` with
  `source = 'loyalty'` (the full admin's own push campaigns are not listed), a category (offers, points, tier, stays:
  the member's own opt-outs) and a `member_segment_id`. They reach members with push switched on, a device and the
  kind switched on; Send starts once (`draft` → `sending`) with the confirmed count; each member is recorded once in
  `push_message_deliveries` with the inbox row, in one transaction, before the push. Managers only.
- **Time zones on any PHP.** `App\Support\TimeZones` maps the IANA legacy names (`US/Eastern`, `GB`, …) to their
  current zones; `PortalBootstrap::namedZone()` reads every zone through it, so a venue with a legacy name gets its
  real zone whether or not this PHP still knows the old name. Valid zones are unchanged.
- **One logo writer.** The full admin's logo upload calls `AppLook::setLogo()`; its answer is unchanged.
- **A new member column** (`email_campaign_deliveries`, `push_message_deliveries`) is in
  `MemberMergeService::MEMBER_COLUMNS`; a merge keeps the `sent` row (email) or the kept member's (push) where both
  members have one.

### Release 4

Spec: `docs/superpowers/specs/2026-10-22-loyalty-release-4-design.md` (the member portal's part is in
`docs/member-portal.md`).

- **SMS** (`App\Services\Sms\{TwilioSms,PhoneNumber,SmsText}`, `Loyalty\Sms\{SmsMessage,SmsAudience,SmsStart}`,
  `SendSmsCampaignChunk`): its own tables, `sms_campaigns` and `sms_campaign_deliveries` (unique campaign + member,
  written before the send, at most once). It reaches active members of the segment with `loyalty_members.sms_consent`
  on (off until the member turns it on in the portal's Profile, R4-4) and a phone that reads as E.164 (spaces and
  dashes dropped, `00` read as `+`); members sharing a number get one SMS. It goes only through the venue's own Twilio
  account (Settings → Integrations: Account SID, Auth Token, and an E.164 number, a Messaging Service SID `MG…` or a
  sender name), never the platform's `TWILIO_*` environment values; the token is read from its row for the request's
  authentication and never answered, logged or audited. Length: GSM-7 160 for one SMS, 153 a part; UCS-2 70 and 67
  (server and screen follow one rule, tested against one cases file); the confirmation counts every member's copy with
  their own tags filled. Chunks of 50; a 429 puts the member back and retries a minute later; a 401/403 fails the
  campaign; Twilio's STOP error (21610) switches the member's consent off. "Sent" means Twilio accepted it.
  `sms_campaign_deliveries` is in `MemberMergeService::MEMBER_COLUMNS` (a merge keeps the sent row). The portal offers
  the switch only where the venue's Twilio account is set up (`PortalBootstrap` sends `member.sms_consent` then).
- **Send later** (`Campaigns\SendLater`) for email campaigns, push messages and SMS: a time on the venue's clock, stored
  as an instant, 2 minutes to a year ahead (a time a clock change skips is refused). The confirmation says "about N
  now"; `php artisan loyalty:send-scheduled` (every minute) starts each due one through its own start service with one
  conditional update (`scheduled` → `sending`), to whoever is eligible then, once however many runs overlap. A
  scheduled one cannot be edited or deleted until it is taken back to a draft; it can be moved. One that cannot start
  (plan or workspace off, nobody eligible, over the cap, its segment gone or broken, Twilio not set) is marked failed
  with the reason and sends nothing.
- **Expo receipts** (`Loyalty\Push\ExpoReceipts`): each push stores Expo's ticket id and a SHA-256 of the device token on
  its `push_message_deliveries` row; `php artisan loyalty:push-receipts` (every 15 minutes) reads the receipts of tickets
  15 minutes to 24 hours old, marks refusals failed and recounts `sent_count`; on `DeviceNotRegistered` it clears the
  member's `expo_push_token` only if it is still that device.
- **Inbox rows from the full admin's sends.** The full admin's bulk message and segment send keep an inbox row
  (`NotificationService::keep()`) for every member they reach who did not switch that kind off, app or no app; the
  push still needs push on and a device. Their answers mean what they meant: `push_sent` counts members with push on
  and a token; `skipped`, `total`, `email_sent`, `email_skipped` unchanged.
- **Insights**: cohort retention (members by the venue month they joined; "active" in a month = a ledger line Insights
  already counts as issued or redeemed — reversals, expiries, deductions and refunds of cancelled redemptions do not
  count; the last twelve months) and the money members bring (stays and appointments booked in the period by a member
  of this organisation, by `member_id` or a linked guest, never by email alone: a stay's `price_paid − refunded_amount`
  without mock-mode stays, an appointment's `AppointmentMoney` taken less returned; only the venue's currency is
  summed, others counted). The ledger's reads have an index, `points_transactions_org_created_index`, built
  `CONCURRENTLY` on PostgreSQL.
- **Brand choice**: with more than one brand, a new reward, offer or boost names its brand (`brand` in the body; this
  organisation's brands the staff member may use, from `LoyaltyForms::brands()`); editing shows it, does not change it.
- **Currency in Card & app** (R4-5): writes through `BookingRules::write` (the setting booking setup writes), audited
  `loyalty.currency_changed`; a dry run first warns about online payments in another currency, appointments booked in
  another, stays priced apart and the prices relabelled (never converted). Managers.
- **Boost times** (R4-6): the full admin's boost save reads a time without an offset as the venue's wall clock
  (`LoyaltyForms::instant`) and its form and list show venue times; every save from either side stamps
  `earn_rate_events.times_venue_at`. A boost without it, at a venue not on UTC and not yet ended, says "check the time"
  until saved again (every boost saved before release 4 is flagged: nothing records who saved it).
- **Duplicates** group in the database (lowercased email; phone digits by the nested `REPLACE` chain), then load only
  the members in groups of two or more; the same pairs and suggested keeper as before.

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

No bulk message from the members list (the full admin's bulk message and segment send keep it); no SMS delivery
reports (Twilio's status callbacks); no receipts for the full admin's own push campaigns.

## Known limits

- **Boosts saved before release 4** say "check the time" until a manager opens and saves each one (at a venue not on
  UTC): one the full admin saved then was stored as if its wall-clock time were UTC and may be hours off; one the
  workspace saved is right but flagged too, since nothing recorded who saved it.
- **The currency** is the member portal's: `organizations.currency`, which defaults to USD, before the
  `services_currency` setting. A venue that never ran booking setup shows USD until its currency is set (Card & app →
  Currency, or booking setup). Changing it relabels prices; it never converts them.
- **SMS**: "sent" is Twilio's acceptance, not delivery (no status callbacks). Deleting a segment a scheduled send uses
  makes that send fail (`no_audience`) when it is due. If a member's number changes after Send, two members who then
  share it could both be texted. The Twilio Auth Token is stored as Settings → Integrations has always stored it, in
  plain text in `hotel_settings` (not in `HotelSetting::ENCRYPTED_KEYS`).
- **Send later** needs the scheduler (every minute) and a queue worker running; a full-admin duplicate of a scheduled
  email copies its `scheduled_at` (harmless: the copy is a draft until scheduled). The full admin's email and
  notification lists show status `scheduled`; their Send refuses one, their Delete allows it.
- **At most once means a stopped worker can drop a member.** A member whose email or push was under way when a worker
  died keeps a `pending` delivery row and is not tried again. A Reset in the full admin right after a Cancel, while a
  chunk is still running, could email that chunk's members again on the next Send.
- **Tags** are escaped but not URL-encoded inside a link; `{{current_year}}` follows the server's clock (UTC).
- **Push messages reach app users only** (the inbox row reaches everyone who did not switch the kind off). The full
  admin's Notifications list shows the workspace's push messages without their recipients.
- **A wallet certificate password cleared before release 2** stays cleared: the full admin's form used to wipe it on
  every save (fixed in release 2, below). Card & app's readiness then says the certificate does not open; upload the
  .p12 again with its password.
- **Wallet files depend on `APP_KEY`.** They are encrypted with it; changing the key without `APP_PREVIOUS_KEYS` makes
  them unreadable (Card & app then says they are gone; upload them again). A WWDR certificate uploaded as DER through
  the full admin still does not sign (the workspace converts it to PEM). Old files left on a server's disk are never
  deleted; an import previewed but never run or cancelled keeps its file in its row.
- **Finding duplicates**: a phone written with characters outside the separators the `REPLACE` chain strips (letters,
  `#`, …) is compared in PHP; if nearly every phone is written that way, that step loads them all.
- **A brand is chosen only on create.** With one brand nothing shows; editing a reward, offer or boost shows its brand
  but does not move it.
- **`docs/appointments-workspace.md`** used to say points are reversed on the full admin's member page; the full admin
  has no such screen. Reversal is the workspace's, on the member's page.

## Deploying

- Release 4 is live (`main` 097432a, pushed 2026-10-22), built from branch commit a7e87ae: the next release's change
  list is `git diff --name-status a7e87ae <tip>`. Release 3 went out as `main` f344b74 from 763e1b0, release 2 as
  7549f28 from 22b99d0, release 1 as 05f3ad1 from 5895004.
- Release 4 runs six migrations, each tried on PostgreSQL with rollback: `2026_10_23_140000` (the
  index `points_transactions_org_created_index`, built `CONCURRENTLY` outside a transaction; a failed half-built index is
  dropped and built again on the next run), `140100` (`earn_rate_events.times_venue_at`, nullable), `150000`
  (`loyalty_members.sms_consent`, default false), `150010` (the tables `sms_campaigns`, `sms_campaign_deliveries`),
  `150100` (`email_campaigns.scheduled_at`, nullable), `150200` (three nullable columns on `push_message_deliveries`).
  Two new scheduled commands: `php artisan loyalty:send-scheduled` (every minute) and `php artisan loyalty:push-receipts`
  (every 15 minutes). New member-facing route: `GET /api/v1/member/portal/payments/{paymentIntent}`. Full-admin files it
  changes on purpose: `EarnRateEventController` and `pages/EarnRateEvents.tsx` (boost times), `MemberAdminController`
  (bulk message) and `SegmentAdminController` (segment send) (inbox rows), `pages/BookingExtras.tsx` (how each extra is
  charged), `MemberMergeService` (duplicates, a new member column), `NotificationService` (`pushMany()` returns Expo's
  ticket), the member `MemberController` (`sms_consent`), and the booking files of `docs/member-portal.md`'s release-4
  section.
- Release 3 runs five migrations, each tried on PostgreSQL with rollback: `2026_10_22_100000` and `100100` (nullable
  columns for the wallet files and an import's file), `110000` (four nullable columns on `notification_campaigns`, the
  table `push_message_deliveries`), `110100` (one `UPDATE` marking earlier notifications sent and read), `120000` (the
  table `email_campaign_deliveries`). Before the deploy, finish or cancel imports in progress (a batch previewed before
  it fails as `file_unreadable`). After it, upload the three wallet files again (they were on the server's disk and
  are gone). Full-admin files it changes on purpose: `SendEmailCampaignChunk`, `EmailCampaignController`,
  `NotificationService`, the member `NotificationController`, `SettingsController` (logo), `WalletConfigController`,
  `MemberImportController`, `AppleWalletService`, `GoogleWalletService`, `MemberImportService`, `MemberMergeService`,
  `PortalBootstrap` (zones, unread count), `AppointmentClock`, `HolidayCountry`.
- Release 2: no migration, no queue or schedule change, no new public route, no new command. It changed full-admin
  files on purpose: `MemberAdminController`, `MemberImportController`,
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

### After the release 4 deploy (owner, signed in)

- Settings → Integrations → Twilio (a super admin): the Account SID, the Auth Token and the number SMS go from (with +
  and the country code) or a Messaging Service SID. In Twilio: Geo permissions for the countries you text; a trial
  account sends only to numbers verified in Twilio.
- Campaigns → SMS: the tab no longer says Twilio is missing; send yourself a test (your staff profile needs a phone);
  turn on "Offers by SMS" as a test member in the portal's Profile and send a real one to a one-member segment.
- Send later: schedule a test email to yourself five minutes ahead; it goes out at that minute.
- Program: boosts saved before the deploy say "check the time"; open each, check its times on the venue's clock, save.
- Insights: the cohort table and "Money members bring" against what you know.
- Card & app → Currency: it shows the venue's currency (do not change it unless it is wrong).
- Portal (as a member): the bell opens the inbox; Profile's message switches; a stay or appointment booked and paid.

### After the release 3 deploy (owner, signed in)

- Card & app → Wallet pass: upload the Apple certificate (with its password), the WWDR certificate and the Google key
  again; readiness should then say ready. Add a pass to a phone from the member app.
- Campaigns: in a draft, use a tag from the tag bar and send yourself a test (your own name is filled in).
- Push messages: write one to a small segment; the confirmation names who has the app; send it and check a phone.
- Member app: the notifications inbox shows what was sent. (The web portal has its own inbox since release 4.)

### After the release 2 deploy (owner, signed in)

- Members: add a test member (the welcome email arrives), edit their details, open their card and scan it in Scan;
  change their tier with "keep until"; delete them (the page then shows only the history).
- Duplicates: merge a known pair and check the kept member's history and points.
- Import a three-row CSV; Export the list and open it in a spreadsheet.
- Insights: the three periods; the numbers against what you know of the programme.
- Campaigns: build a segment, write a draft, send yourself a test; send a real one only to a segment you chose.
- Card & app: the wallet pass's readiness; the member app's colours (the native app shows them on its next start).
- Rewards: add a picture to a reward and see it on the catalogue.
