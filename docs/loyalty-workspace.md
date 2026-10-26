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
| Ways to earn (release 7): read the options | every active staff member; change them, run or skip the setup wizard: managers |
| Check in a member, add a purchase at the desk | `can_award_points` (as Award) |
| Use a member's credit at the desk | `can_redeem_points` (as Redeem); correct a balance (adjust, with a reason): managers |
| Read a member's stamp card and credit lines | every active staff member |
| Places (release 8): read them and their entries | every active staff member; add, change, switch off: managers |
| Scan at a place or an event; sign a member up for an event or check one in by hand | every active staff member (an event's points are the event's) |
| Events: create, change, publish, cancel | managers and `can_manage_offers` (as offers) |
| A membership's end date: set, extend, remove | managers (as a tier change) |

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
| Scan | `POST scan` (`code`); release 5: `GET members/{id}/cards`, `POST members/{id}/cards` (`uid`), `POST members/{id}/cards/{card}/off` (AccessMap `admin/loyalty/members/{id}/cards`: every active staff member, as Edit details) |
| Program | `GET program`; `POST/PUT program/tiers[/{id}]`, `POST program/tiers/{id}/benefits`, `DELETE program/tiers/{id}/benefits/{tierBenefit}`, `POST/PUT program/benefits[/{id}]`, `POST/PUT/DELETE program/boosts[/{id}]`; release 6: `POST program/boosts/confirm-times` (`ids`), `brand` on the boost, reward and offer PUTs |
| Rewards | `GET/POST rewards`, `PUT rewards/{id}`; `GET redemptions?state=pending|done|all&page`, `POST redemptions/{id}/fulfil`, `/cancel`; `GET/POST offers`, `PUT offers/{id}`; `GET referrals?page`; `POST/DELETE rewards/{id}/image`, `POST/DELETE offers/{id}/image` |
| Members (release 2) | `POST members`, `PUT members/{id}`, `PUT members/{id}/tier`, `POST members/{id}/deactivate`, `/reactivate`, `/erase` (`confirm_name`), `GET members/{id}/card`, `POST members/{id}/welcome`; `GET members/duplicates`, `POST members/merge`; `GET/POST members/imports`, `GET members/imports/{batch}`, `POST members/imports/{batch}/run`, `/cancel`; `GET members/export` (CSV) |
| Insights | `GET insights?period=30d|90d|12m`, `GET insights/at-risk?days=` (7–365); release 4: `GET insights/cohorts`, `GET insights/money?period=` |
| Segments | `GET segments`, `GET segments/options`, `POST segments/preview`, `POST segments`, `PUT/DELETE segments/{id}` |
| Campaigns (`feature:campaigns`) | `GET/POST campaigns`, `GET/PUT/DELETE campaigns/{id}`, `GET campaigns/{id}/audience`, `POST campaigns/{id}/test`, `/send` (`recipients`, `revision`), `/cancel`, `/duplicate`; release 4: `/schedule` (`send_at` on the venue's clock, `YYYY-MM-DDTHH:mm`, and `revision`), `/unschedule` |
| Push messages (`feature:push_notifications`, release 3) | `GET/POST push`, `GET/PUT/DELETE push/{id}`, `GET push/{id}/audience`, `POST push/{id}/send` (`recipients`, `revision`), `/cancel`, `/duplicate`; release 4: `/schedule`, `/unschedule` |
| SMS (`feature:campaigns`, release 4) | `GET/POST sms`, `GET/PUT/DELETE sms/{id}`, `GET sms/{id}/audience`, `POST sms/{id}/test`, `/send` (`recipients`, `revision`), `/schedule`, `/unschedule`, `/cancel`, `/duplicate` |
| Card & app | `GET/PUT wallet`, `POST wallet/apple-cert`, `/apple-wwdr`, `/google-service-account` (`feature:wallet`); `GET/PUT app-look`, `POST app-look/logo`; release 4: `GET currency`, `PUT currency` (`currency`, `dry_run`) |
| Ways to earn (release 7) | `GET options`, `PUT options` (`options`: a partial change), `POST options/setup` (`preset`, `options`, `idempotency_key`), `POST options/setup/skip` |
| Visits (release 7) | `POST members/{id}/check-in` (`amount`, `note`, `idempotency_key`), `GET members/{id}/stamps` |
| Credit (release 7) | `GET members/{id}/credit?page` (25 a page), `POST members/{id}/credit/spend` (`amount`, `note`, `idempotency_key`), `POST members/{id}/credit/adjust` (`amount`, signed, `reason`, `idempotency_key`) |
| Places (release 8) | `GET places`, `POST places`, `PUT places/{id}` (`name`, `description`, `admits` all\|tiers, `tier_ids`, `is_active`, `sort_order`, `idempotency_key`), `DELETE places/{id}` (switched off instead once it has entries or an event names it), `GET places/{id}/entries?day=&page=` (50 a page); `POST scan` takes `place_id` or `event_id` |
| Membership (release 8) | `PUT members/{id}/validity` (`valid_until` Y-m-d\|null, or `extend` 1m\|3m\|6m\|1y; `idempotency_key`); `GET members?state=expiring\|expired` |
| Events (release 8) | `GET events?when=upcoming\|today\|past\|drafts&page=`, `POST events`, `GET/PUT/DELETE events/{id}`, `POST events/{id}/publish`, `/cancel` (`reason`), `GET events/{id}/people?page=`, `POST events/{id}/sign-ups` (`member_id`), `DELETE events/{id}/sign-ups/{memberId}`, `POST events/{id}/check-in` (`member_id`) |

Refusals are `{error, message}`; the workspace shows its own words for each code (`lib/errors.ts`,
`program/errors.ts`, `rewards/errors.ts`), never the server's sentence. Codes: `not_found`, `manager_only`,
`not_allowed` (with `need`), `not_enough_points` (with `balance`), `cannot_reverse`, `already_reversed`, `wrong_state`
(with `state`), the scan's `not_found`, `expired`, `revoked`, `used_up`, `inactive` (a switched-off card adds `card: "off"`), and since release 5 the cards' `card_in_use`, `card_elsewhere`, `bad_uid`; a form's field errors are
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
feature. Release 7 adds, each in its area's `errors.ts`: the options' `key_reused` (a setup key sent with another body) and
a preset's field error; the desk's `option_off` (neither check-in nor earning at the desk is on), `desk_earn_off`,
`amount_required`, `inactive` (a switched-off or deleted member) and `key_reused`; credit's `credit_short` (with
`balance`, `currency`), `bad_amount` (with `decimals`, `max`, `currency`), `reason_required`, `already_erased`,
`key_reused` and `bad_currency`. Release 8 adds: places' `name_taken` and `manager_only`; a scan at a place or event answers a verdict (`granted`,
`reason`: `welcome`, `member_erased`, `member_off`, `expired`, `place_off`, `tier_not_allowed`, `event_not_open`,
`event_full`, `not_signed_up`) rather than a refusal, and a place or event of another organisation is 404 with
`gone`; validity's field errors and `already_erased`; events' `event_ended`, `wrong_state` (with `state`),
`not_a_draft`, and sign-ups' `sign_up_closed`, `inactive`, `membership_expired`, `tier_not_allowed`,
`already_signed_up`, `already_in`, `event_full`, `not_signed_up`, `cancel_closed`.

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
- **One tolerant reader of codes** (release 5, `App\Services\Loyalty\Cards\CodeReader` through `CardLookup`; the full
  admin's `scan/qr` reads through it too, its answers unchanged). In order: a leading `#` and spaces dropped (the
  wallet pass shows `#LS-001001`); the app's v2 JSON; that JSON bent by a scanner's keyboard layout (German, Russian and,
  since release 6, French AZERTY and Spanish typed back key for key; otherwise the value after `member…number`); the v1 JSON's token; a link carrying a number or
  token; a secure token, then the legacy `qr_code_token` (the wallet pass's barcode); an NFC ID in hex with any
  separators; a member number in any case with or without its hyphen (an exact match first); the digits alone (four or
  more) when exactly one member's number ends with them, never a guess between two; a decimal NFC ID as keyboard-style
  readers type it (4- or 7-byte, both byte orders); last, a bare member number a layout bent (`LS)àà&àà&`, `LSß001001`), read
  back only when the code holds characters a number never has. Tests: `CodeReaderTest`, `ScanTest`, `ScanEndpointsTest`.
- **NFC cards** (`App\Services\Loyalty\Cards\NfcCards`): an ID is stored lower-case hex without separators (a decimal
  entry converted; 8, 14 or 20 digits read as hex, as printed on cards). `nfc_cards.uid` is unique across every
  organisation (`nfc_cards_uid_unique`), so a link compares normalised against every stored form: another
  organisation's card → `card_elsewhere` (409, never saying whose); active for another member here → `card_in_use`
  (409, naming nobody); already this member's → 200, nothing written; switched off here → the same row given again,
  never a second row. Linking leaves the member's QR code and wallet pass alone. Since release 6 the full admin links
  through it too — `nfc-cards`, `nfc/issue` and member creation with a card — so its IDs are stored the same way, its
  answers keep their messages (another organisation's card or member is now refused), and a card no longer replaces the
  member's `qr_code_token`; `scan/nfc` compares the normalised forms. Link and switch-off are audited
  (`nfc_card_linked`, `nfc_deactivated`).
- **Default brand** (release 6): `Organization::ensureDefaultBrand()` gives a new organisation its own default brand
  whatever tenant is bound; `php artisan brands:ensure-default [--org=<organisation id>] [--apply]` repairs any
  organisation without one (dry run by default).
- **Boost times confirmed together** (release 6): `POST program/boosts/confirm-times` (`ids`; AccessMap
  `admin/loyalty/program/boosts/confirm-times`, managers) stamps `times_venue_at` on each named boost still flagged, by
  a conditional update, never changing a time; audited `earn_rate_event_times_confirmed`; answers `{confirmed,
  unchanged}`. Program shows managers "These times are right" with the flagged boosts on the venue's clock.
- **Brand on edit** (release 6): with more than one brand, a reward's, offer's or boost's brand can be moved on edit
  (`brand` sent only when it changes, checked against `LoyaltyForms::brands()`).
- **Campaign tags in links** (release 6): inside an `href` a filled tag is URL-encoded (`rawurlencode`, `@` kept in a
  `mailto:`); elsewhere HTML-escaped as before; `{{current_year}}` follows the venue's clock.
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

### Release 7

Spec: `docs/superpowers/specs/2026-10-25-loyalty-release-7-design.md` (owner 2026-10-25: the stamp card, check-in and
earning at the desk, cashback credit spent at the desk only, the half-built parts finished, a setup wizard and an
options page). Visits, stamps and credit belong to the whole programme: the full admin's screens do not show them.

- **Options** (`Loyalty\Programme\ProgrammeOptions`, the one reader and writer): `hotel_settings` keys, the engine's
  existing ones under their old names, each answered typed with its default; a save validates (bounds, an active
  reward of this organisation for a full card), writes under the organisation named whatever tenant is bound, flushes
  the settings cache and audits `loyalty.options_changed` with the old and new values (a repeat writes no audit).
  `programme_setup_completed_at` is the wizard's only. `stamps_enabled` and `cashback_enabled` keep the venue day they
  were switched on (`*_since`, `onSince()`): **a booking's visit from before that day earns no stamp and no cashback**
  when it is touched later (a status change, Award points, the nightly stay sweep); switched off and on again, visits
  count from the new day (`OptionsTest`).
- **The wizard's apply** (`ProgrammeSetup`): a preset only on an organisation with no tier at all (one with tiers keeps
  them: `reason: has_tiers`); the options are checked before the preset is applied; one setup at a time per
  organisation (advisory lock `loyalty-setup:{org}`); the same `idempotency_key` answers the first outcome for a day
  (`SharedCache`), with another body `key_reused` (`OptionsSetupTest`).
- **A visit** (`Loyalty\Visits\VisitRecorder`, the one hook): a completed appointment (its venue day, `total_amount`),
  a finished stay (departure day, nights, `price_total`), a desk check-in or a desk purchase. Its effects — the stamp,
  cashback, referral qualification, tier counters — each run in their own transaction (a savepoint under a caller's),
  idempotent by the visit's reference; one that throws is logged, audited `loyalty.visit_effect_failed`, and never
  fails the others or the booking. It runs after the booking's own writes and also while points on bookings are off.
  A full refund (an appointment's at the desk, a stay's) takes the visit back — the stamp off an open card (a complete
  card stands, `loyalty.stamp_kept`), the cashback reversed, the counts taken back — with points on or off
  (`VisitRefundTest`).
- **The stamp card** (`Loyalty\Stamps\StampCards`, the only writer of `stamps` and `stamp_cards`): one stamp per member
  per venue day (unique index `stamps_member_day_unique`) and one per reference; the open card takes the number of
  stamps the option said when it opened; a card that fills completes in the same transaction. Points are written
  there (`awardPoints` key `stamp_card_{id}`, not qualifying). A free reward is given after the commit, with no member
  lock held (the member's own redeem locks the reward, then the member): `StampCards::settleRewards()` issues it
  (`RedemptionActions::issueFree`, a pending redemption at 0 points with its code) and stamps the card by a
  conditional update; a reward gone, off or out of stock gives the points instead (`loyalty.stamp_reward_missing`); a
  card left owed is settled by the member's next stamp. Then a push "Your card is full!" (type `stamp_card_full`, the
  points opt-out). An erased member gets no stamp (`StampCardsTest`, `StampMergeTest`).
- **At the desk** (`Loyalty\Visits\DeskVisit`, `POST members/{id}/check-in`): the day's first desk visit is its
  check-in (`checkin_points` once a day, a `bonus` line); an amount needs earning at the desk on and earns
  `pointsForSpend()` as a qualifying `earn` line with the amount spent; a second visit the same day answers
  `already_today` and still takes a purchase. Each request writes one `scan_events` row (`scan_type desk`,
  `action_taken check_in`; its `token_value` records the request's key, amount and note), the reference of its stamp
  and cashback. A replay with the same key answers the first result and writes nothing; with another amount or note,
  `key_reused`. Desk keys are their own (`loyalty-desk:{org}:{member}:{key}`), never an Award's. Reversing a desk visit's points line (Reverse on the
  member's history) takes its visit back too (`DeskVisitTest`).
- **Cashback credit** (`Loyalty\Credit\CreditLedger`, the only writer of `credit_transactions` and
  `loyalty_members.credit_balance`, which is not fillable): every line under the member row lock in its own
  transaction, in integer cents, with `balance_after` — **the latest line's `balance_after` is the member's balance
  after every write** (`CreditLedgerTest`). Earned at `cashback_percent` of a visit's spend, rounded down (a
  zero-decimal currency to the unit), once per reference (`cashback_{type}_{id}`), never on a visit without a
  reference or below the smallest unit. Spent at the desk only (R7-2), never above the balance (`credit_short`); a
  manager's adjust needs a reason. A reversal takes back what is left, never below zero; the shortfall is audited
  `credit.reverse_short` (what was spent stays spent). A merge adds the loser's balance to the winner's (two `adjust`
  lines); an erasure — the staff's or the member's own deletion — keeps the lines and forfeits the balance (an `adjust`
  to zero, `credit.forfeited_on_erasure`). Lines carry the venue's currency (`PortalBootstrap::currency()`).
- **Offers** (`Loyalty\Offers\OfferBonus`): a `bonus_points` offer pays its points when claimed (key
  `offer_bonus_{claim}`, the claim `used` at once); a claimed, live `points_multiplier` offer is a personal boost — the
  better of it and the running boosts, never both, capped at 10 — then the tier's multiplier as before. `free_night`,
  `upgrade` and `cashback` offers are perks staff give in person; the offer dialog and the portal say so
  (`OfferBonusClaimTest`, `OfferMultiplierEarnTest`).
- **Tier counters** (`Visits\TierCounters` through `LoyaltyService::countQualifyingVisit()`): a stay adds its nights,
  one stay and its spend; any visit with an amount adds its spend; once per reference (`tier_qualification_counts`); a
  reversal takes back exactly that. `assessTier()` then runs for members judged on nights, stays, spend or hybrid
  (`TierCountersTest`).
- **Expiry 0 = never**: a points bucket without `expires_at`, skipped by the expiry sweep and the liability report;
  dated buckets are spent first (`PointsNeverExpireTest`).
- **Referrals** (`Visits\ReferralRewards`): by default a referral pays at the friend's first visit (both bonuses once,
  keys `referral_{id}_referrer` / `_referee`, by a conditional update from `pending`); `referral_reward_on = signup`
  pays at sign-up as before; `referral_enabled = false` hides the link, ignores a code at sign-up and takes the field
  off the join page (`ReferralRewardsTest`).
- `stamps`, `stamp_cards`, `credit_transactions` and `tier_qualification_counts` are in
  `MemberMergeService::MEMBER_COLUMNS`.

### Release 8

Spec: `docs/superpowers/specs/2026-10-25-loyalty-release-8-design.md` (owner 2026-10-25: membership for every industry
— places that admit chosen tiers, an optional end date, events with portal sign-up and check-in, tiers by points,
visits or spend, and a scan screen that is easy on location).

- **Who gets in** is decided only by `Loyalty\Access\AccessDecision` (reads only), in this order: erased (staff's
  erasure or the member's own deletion), switched off, expired (`membership_valid_until` before the venue's today —
  the last day still lets in), place switched off, tier not admitted (`allowed_tiers` in ladder order), then for an
  event: not open (published, from two hours before the start until the end — the end itself shut —, compared as the venue's wall clock), full
  (a walk-in takes a place only while one is left after the standing sign-ups — as a sign-up does), not signed up
  (sign-up on, walk-ins off); else welcome. A member already checked in at the event is welcomed again
  (`AccessDecisionTest`).
- **Places** (`Access\AccessPlaces`, the only writer): a name unique per organisation, every member or chosen tiers,
  switched off instead of deleted once it has entries or an event names it; audited. A scan at a place writes one
  `scan_events` row (`scan_type access`, `access_place_id`, `result` granted/denied, `action_taken` the reason; never
  the raw code) and answers the verdict, the member and the tier's benefits; a code that names nobody is logged as a
  refusal with no member. A replay with the same key answers the first result (`ScanReplay`, 10 minutes; a kept success is never replaced by a
  refusal; a keyed scan at an event waits for a copy before it, or answers `409 in_progress`, which the scan screen
  shows as a grey "Try again" with "This scan is still being handled")
  (`PlacesTest`, `ScanAccessTest`). `CardLookup` names a switched-off member for a scan with a place or an event
  (`CardRead::namedMember()`); the desk scan and the full admin's scan behave as before.
- **A membership's end date** (`Members\MembershipValidity`, the only writer; stored as a plain `Y-m-d`): managers set
  a date, extend by 1/3/6/12 months from the later of today and the current end (a month without that day ends on its
  last day), or remove it; audited `member.validity_changed`; a changed date allows a new reminder. The member's state:
  `active`, `expiring` (≤ 30 days), `expired`, `off`. An expired member keeps earning and spending at the desk; only
  places and events refuse. `php artisan loyalty:membership-reminders` keeps an inbox message and a push 14 days
  before the end, once per end date, on each venue's clock — scheduled hourly with `--at-venue-hour=9`, so each venue
  is reminded in its own 9 o'clock hour (release 9; by hand without the option, every venue at once)
  (`ValidityTest`, `ValidityRemindersTest`).
  Add member and the import (`valid_until`, YYYY-MM-DD) take one too.
- **Tier progress** (`tier_progress_by`: points | visits | spend, a card on Ways to earn): a visit of any source —
  appointment, stay, check-in, purchase, event — adds one to `qualifying_visits`, once per member per venue day (every
  visit writes a `tier_qualification_counts` row, so a reversal can hand the day's visit to another that day);
  `assessTier()` judges every member by the programme's option (`min_visits`, `min_spend`; the member column
  `tier_qualification_model` is no longer read) with the window, grace, lock and soft-landing rules as for points;
  progress reads in those terms everywhere (`LoyaltyService::tierProgress()`) (`TierProgressTest`). Two presets:
  Members' club and Events & community (by visits); a preset adds no places.
- **Events** (`Events\EventEditor`, `EventSignUp`, `EventCheckIn`): times are the venue's wall clock, stored as written;
  draft → published → cancelled; a published event's change of time or place, and its cancellation, keep an inbox
  message for each member signed up (pushes 100 at a time). A sign-up needs the event published and not ended, sign-up
  on, the member's tier admitted, the membership standing and a place left; one per member per event. A check-in takes
  the member row lock, then the event row lock, then `AccessDecision`: one attendance per member per event, the event's
  points (`bonus`, key `event_{event}_{member}`), a scan row for every attempt, and — after the commit — the visit
  through `VisitRecorder` (stamp, referral, tier progress) (`EventsTest`, `EventSignUpTest`, `EventCheckInTest`).
- `loyalty_event_registrations` and `loyalty_event_attendances` are in `MemberMergeService::MEMBER_COLUMNS` (one per
  event survives, `EventMerge`); a merge adds the visits and keeps the later end date (a duplicate without one never
  lifts the winner's).

### Release 9

Owner 2026-10-25: "double review and fix … all user and admin flow … modern, easy to use, minimized copy, more icons,
no duplicated info". Four independent reviews (scan and access, tiers, the staff screens, the portal) and a redesign of
the scan screen, door mode, the member page and list, Program, Ways to earn, Events and the portal's loyalty screens.

- **Tier moves** (`LoyaltyService::assessTier()`): a move's direction is `compareOnLadder()` — the measure's floors,
  then the points floors, then `sort_order`; level on all three is no move (a staff-only tier with no visits floor no
  longer loses its member with no rule applied, logged as a downgrade). Soft landing steps one tier down the measure's
  own ladder (the highest active, non-invitation tier with a floor on the measure between the two), never by the list's
  order. The grace period runs from the first assessment that would drop the member: a move (automatic, the workspace's
  or the full admin's Change tier) no longer writes `tier_effective_until` a year ahead — that held every tier for a
  year after any move and then gave no grace at all — and qualifying again stops a running clock. "Keep until"
  (`tier_override_until`) is how staff hold a tier on purpose. Members moved before release 9 keep the year-ahead date
  they have (it runs out on its own) (`TierMovesTest`).
- **The nightly tier check** (owner 2026-10-26): `php artisan loyalty:assess-tiers [--org=<organisation id>]
  [--at-venue-hour=<hour 0-23>]` — scheduled hourly with `--at-venue-hour=5`, so each venue is checked in its own 5
  o'clock hour, clear of the hours clocks change; by hand without the option, every venue at once — re-assesses,
  through `assessTier()`'s own rules, each active member whose grace deadline has come, whose
  "keep until" ended in the last three days, and — on a windowed programme — every active member with a tier; each
  under the member row's lock, recorded as `scheduled` in the tier history. A tier that still stands is not touched,
  so a second run moves nobody twice. Points marked "not qualifying for tier" keep counting towards points tiers, as
  before (owner 2026-10-26: keep as it is).
- **Progress** never points at an invitation-only tier on any measure, and the points summary (portal, member app,
  full admin, `LoyaltyMember::getProgressToNextTier()`) goes through `tierProgress()` on the programme's basis.
- **The active tiers** are read once per request or job (at most a minute in a long one), never from the cache: on
  Laravel Cloud the default cache is each container's own files, which kept an old ladder for half an hour.
- **Events and the door**: at an event the membership is judged on the day the event begins, as its sign-up is — a
  night past midnight no longer refuses at 00:30 a member it let in at 23:00. `events?when=today` lists an event
  starting just after midnight once its doors are open (two hours before). A check-in answers `already_in_at` (the
  venue's wall clock with its day) beside `already_in`. The people answer carries `latest`: the last eight check-ins by
  their real time (the scan screen's "Today here"). An event scan's tier chip is the member's tier after the visit (a
  visit can move it), the one the benefits are read from. A deleted member's standing sign-ups for events not ended are
  cancelled (`EventSignUp::releaseAll()`, after a staff erasure and a member's own deletion); a member switched off keeps
  theirs (`EventSignUpTest`, `EventsTest`, `AccessDecisionTest`).
- **Benefits** carry their typed value (`value_type`, `value_amount`) to the scan answer and the member page: a benefit
  given no wording says "15% off"; one with wording says the wording only (Program shows the typed value as the chip's
  tip).
- **The scan screen**: two columns from a laptop (what to scan for and how, then the answer and today's list); one row
  of "Scanning for" chips (bell, door, calendar — no headings on screen); short way buttons; the band says "Welcome"
  and the member's name is written once beneath it, with their initials; a refusal shows no benefits; "Renew for 1
  year" on a run-out membership for a manager (then the member is scanned again by number); "Try again" on a scan that
  got no answer, which — like the same code scanned again within 10 minutes at the same place — reuses the scan's key,
  so the server replays what it already did instead of refusing a used QR code; a second code typed while the first is
  checked is kept. At an event without sign-up the screen says neither "Signed up" nor "Walk-in". Door mode lost its
  explanatory lines.
- **The member page**: each fact once (identity and contact in the header only), an icon and a short title per card,
  two columns from a laptop, the less used actions in the ⋯ menu; stamps from events say "Event" (every server source
  has a label, `visitsMath.test.ts` reads them from `StampCards.php`); Extend takes a new key after a refusal.
- **Program, Ways to earn, Events**: tiers as a numbered ladder, no "In use" pills or explanatory sentences, icon
  actions, compact figures; the event page's less used actions in a More menu; check-in by name says "has no tier".

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
  **Scan**: the field for a keyboard-style reader or a typed code (Enter sends; the field keeps the focus); since release 5
  also "Scan with camera" (any modern browser over https; the decoder loads only when used), "Tap NFC card" (Chrome on
  Android; elsewhere the page says so) and "USB reader" (Chrome or Edge on a desk computer, the full admin's WebHID hook).
  A card no member has offers "Link this card". **A member's page** lists their NFC cards: link (tap, USB reader or
  typed ID), switch off.
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
- **Ways to earn** (release 7, `options/`): one card per way — points on spend, expiry, welcome and birthday bonuses,
  referrals, the stamp card, check-in, earning at the desk, cashback credit — each with its switch, a sentence of what
  members get that follows the fields, and Save; then Tiers, Rewards, Offers and Boosts with their counts. Read-only to
  staff who are not managers. **The setup wizard** (`/loyalty/options/setup`): your business (the presets, the
  industry's first; a venue with tiers keeps them), choose, configure, review; a banner on Members and Ways to earn
  offers it to managers until it is applied or skipped. The cards and fields come from the server (`ways`, `fields`).
- **The stamp card and the desk** (`visits/`): a member's page shows the card (filled and empty circles), completed
  cards and recent stamps; the Scan result and a member's page offer Check in and Add a purchase while those options
  are on, and say what happened ("+1 stamp — 7 of 10", "+45 points", "+€2.25 credit", "Already checked in today").
- **Credit** (`credit/`): the balance on the Scan result and a member's page while cashback is on or the member has a
  balance; Use credit (Redeem's right) and, for managers, Adjust; the credit lines on the member's page. The Delete and
  Merge dialogs say what happens to credit and stamps.
- **Places** (release 8, `places/`): a section on Program — each place, who may enter (every member or tier chips),
  today's entries; managers add and change them. Each tier card says where it can enter.
- **The scan screen** (release 8, `scan/`): "Scanning for" — Desk, a place, or an event today — remembered on the
  device (or `?place=`, `?event=`, `?desk` in the address). At a place or event the answer is a verdict: green
  "Welcome, Ada", amber when the membership ends within 14 days, red "No access" with the reason in a sentence that
  names the facts, red "Card not recognised", grey "Try again" when the network fails (never "No access"); then the
  member, tier, end date and benefits, and "Today here". **Door mode** (`/loyalty/scan/door`): full screen for a tablet
  at the entrance — continuous camera or reader, a duplicate within 3 seconds ignored, the verdict clearing after 4
  seconds, an optional sound, the screen kept awake.
- **Events** (release 8, `events/`): upcoming, past and drafts; New event in one dialog; an event's page with its
  numbers and people, Start check-in and Door mode (the Scan page with the event chosen), check in by name, add a member.
- **Membership** (release 8): a member's page shows the end date with Extend / Set a date / Remove (managers); the
  members list shows Expiring soon and Expired; progress follows the programme's measure.
- **The Guide** (`/loyalty/guide`, `guide/`, owner 2026-10-26): the workspace's documentation for new staff, opened
  from Help & resources (side panel and phone menu) and from Find. A search over everything (accents and case aside);
  the quick start in five steps; a card per page, only the pages this person's menu has (`featuresFor()`, the same
  rights as the menu); "Try a scan", the door's four answers acted out through the scan screen's own `answerVerdict()`
  with the venue's lowest and highest tiers (nothing is sent); the questions by topic, one or two sentences each. It
  reads nothing beyond the bootstrap. Words in `i18n/guide.<lang>.json` (`guide/words.ts`); a new question is an entry
  in `FAQ` (`guideMath.ts`) and its `_q`/`_a` in all five bundles. `guide.test.tsx` checks every link the Guide opens
  against the routes in `LoyaltyApp.tsx`, so a renamed page fails it. The motion (`animate-a-sweep`, `animate-a-float`,
  in `tailwind.config.js`) is stilled under reduced motion like the rest.

## What the workspace does not do

No bulk message from the members list (the full admin's bulk message and segment send keep it); no SMS delivery
reports (Twilio's status callbacks); no receipts for the full admin's own push campaigns.

## Known limits

- **Boosts saved before release 4** say "check the time" (at a venue not on UTC) until a manager saves each one or
  confirms them together ("These times are right", release 6): one the full admin saved then was stored as if its
  wall-clock time were UTC and may be hours off; one the workspace saved is right but flagged too.
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
- **Scan** (release 5): NFC in a web page works only in Chrome on Android (an iPhone scans the QR code with the camera or
  types the number); a USB NFC reader needs Chrome or Edge on a desk computer. Keyboard layouts other than German, Russian,
  French AZERTY and Spanish are not typed back key for key; the generic member-number reading covers most of them. Decimal reader formats other than 4- and 7-byte IDs (e.g. Wiegand) are not
  read. The normalised and digits-alone lookups read the organisation's members without an index.
- **`docs/appointments-workspace.md`** used to say points are reversed on the full admin's member page; the full admin
  has no such screen. Reversal is the workspace's, on the member's page.
- **Release 7.** Credit never expires (no expiry in this release). A line keeps the currency it was written in; after
  a currency change the balance is shown in the new one (relabelled, never converted). The mobile apps are compiled
  bundles (`public/app`, `public/staff`; their source is not in this repository): they show neither stamps nor credit
  until their next build, which can read `GET /v1/member/stamps` and `GET /v1/member/credit`; the portal and the
  workspace show both. Pushes are in English, as every other push. (Release 8 judges every member by the programme's
  `tier_progress_by`.) A referral pending from before release 7 was already paid at sign-up.
- **Release 8.** A change to a published event's tiers that would leave out
  members who signed up is refused (`409 signed_up_outside`, naming them) until their sign-ups are cancelled; a member
  whose own tier changed after signing up keeps the sign-up and is refused at the door. A cancelled event's sign-ups
  stay as history. Two accounts of one person that both attended an event keep both points lines after a merge (the
  ledger is history; a manager reverses one by hand). On visits or spend, the member app's compiled bundle labels the
  progress number "points" until its next build. The two-tone sound and NFC in door mode were not tried on a real
  device.

- **Release 9.** Points that a line marks "not qualifying for tier" (check-in, event, birthday, welcome bonuses) count
  towards points tiers on the lifetime basis (`qualifyingPointsFor()` reads `lifetime_points`), as they always have
  (owner 2026-10-26: keep as it is). A member switched off keeps their event sign-ups (and the place
  they hold). The hourly reminder and tier-check runs act for a venue only in its own hour, so a scheduler down for
  that hour skips the venue for that day (the next day's run catches up: the reminder window is two weeks, and "keep
  until" ended is read three days back).

## Tests on PostgreSQL

The suites run on SQLite with hand-built schemas, which miss NOT NULL columns and indexes production has. Release 5
ran them against a PostgreSQL database built from every migration and found three live bugs (member erasure and a
member's own deletion wrote NULL into `loyalty_members.qr_code_token`; an extra of the legacy JSON setting had a text
id), all fixed. Release 6 (part T) gave the older tests data production's schema accepts: failures on PostgreSQL went
from 2384 to the ones listed below, and every suite still passes on SQLite.

**Running them.** Build a database from every migration, then:

```
set -a; . <file holding DB_HOST, DB_PORT, DB_USERNAME and DB_PASSWORD>; set +a
scripts/test-pg.sh <test database> [test paths …]
```

It runs one directory or top-level file at a time (never a bare `php artisan test`), prints
`<path> | exit <code> | <Tests: line>` and up to eight FAILED names per run, refuses a database whose name does not
contain "test", never prints the credentials, and gives up on a lock after a minute so a stuck run fails instead of
hanging. Its header says how to build or copy the database. Shared test helpers: `TestCase` moves PostgreSQL
sequences above 100000 so tests' fixed ids never collide; `StartsFromABlankDatabase` gives a migration test an empty
schema of its own; `ClearsTheMigrationsOrganisation`, `WritesRowsForeignKeysNeed` and `WritesHotelSettings` write the
rows production's foreign keys and NOT NULL columns need. A test that must see a unique index refuse an insert raises
that refusal just before the statement on PostgreSQL (a real failure would abort the test's own transaction, which
production never has); on SQLite the real index still runs.

**Environment for a full run.** Export `APP_ENV=testing` and the array drivers (`CACHE_STORE`, `CACHE_DRIVER`,
`SESSION_DRIVER` `array`, `QUEUE_CONNECTION=sync`, `MAIL_MAILER=array`) after sourcing the credentials file: a local
server's file cache and environment make the register throttle answer 429 across runs.

**Still failing on PostgreSQL, on purpose** (2026-10-24; the release 7 and release 8 runs of 2026-10-25 failed the
same 37 tests — 18 in `Feature/Landing`, 19 elsewhere — and nothing new, with 6822 and 6962 passing). Running the
SQLite and PostgreSQL suites at the same time in one working tree can fail `DurableFilesTest` (both write the same
files on disk): run them one after the other.

- **Application code, reported and not changed in release 6:**
  - Landing pages read a service's price `0` and duration `60` (the columns' NOT NULL defaults) as a real price and
    length, so a priceless menu prints €0 / 60 min instead of the author's priceless layout (`app/Landing/Money.php`;
    17 render tests of the Ember, MaisonVela, Forma, Luma, Ardea, Numa and Tempo templates). How "no price" should
    be stored and shown is the owner's call, and landing pages deploy by their own recipe.
- **Fixed in release 6** (their tests now pass on PostgreSQL): an emptied field in the full admin's extras, services
  and voice-agent forms, and an emptied tier colour in the workspace, wrote NULL into a NOT NULL column (a 500); a
  failed public services booking whose error text was longer than 255 characters left no submission row.
- **Test states production cannot hold** (20 tests, kept for SQLite): a member with no tier, no user or no referral
  code; a member's user with no email; a tier assessment with no old tier; an organisation with no currency; a widget
  config with no key; two organisations sharing a hold token; two default pipelines in one organisation; a landing
  redirect outliving its page; an extra or a voice config holding NULL in a NOT NULL column.

## Deploying

- Since 2026-10-26 a finished job is deployed without asking (the owner's standing word, `CLAUDE.md` "Git and
  deploy"); the recipe's checks still decide.
- The member portal's Help is live (`main` acced03, pushed 2026-10-26: `/portal/help`, `docs/member-portal.md`), built
  from branch commit fa7e83e: the next release's change list is `git diff --name-status fa7e83e <tip>`. 16 source
  files, no deletions, no migration; on the deploy tree PHP 7013 passed, 7 skipped, the frontend 5457 passed, tsc
  clean; checked by content (every source file on `main` equal to the branch, Help's English and Russian words in the
  built SPA).
- The Guide went out as `main` 3679c27 (`/loyalty/guide`, with the standing word in `CLAUDE.md`), built from branch
  commit fc76959. 21 source files, no deletions, no migration; on the deploy tree PHP 7013 passed, 7 skipped, the frontend 5440 passed,
  tsc clean; checked by content (every source file on `main` equal to the branch, the Guide's words and route in the
  `LoyaltyApp` chunk).
- Release 9b went out as `main` d775898 (the reminders and the tier check at each venue's own hour, the event dialog's
  single "Where", the deleted member's shorter notice), built from branch commit 12958a4. 15 source files, no deletions, no
  migration; on the deploy tree PHP 7013 passed, 7 skipped, the frontend 5423 passed, tsc clean; checked by content
  (every source file on `main` equal to the branch, both hourly schedule lines, the new notice in the `LoyaltyApp`
  chunk). Release 9 went out as `main` 34162f4 (the review's fixes, the redesign and the nightly tier check, with the
  two release 8 follow-ups), built from branch commit 9d610df. 189 source files, no deletions, no migration; on the deploy tree PHP
  7011 passed, 7 skipped, the frontend 5423 passed, tsc clean. It was checked by content (every source file on `main`
  equal to the branch, `loyalty:assess-tiers` and its schedule present, the `LoyaltyApp` chunk carrying the new scan
  screen); the live site could not be reached from the build environment. Release 8 went out as `main` 3ffe5c5 from 63651b8 (membership for every
  industry). Release 7
  went out as `main` ffabebf from 40ffdaf (ways to earn and reward). Release 6b went out as
  `main` 65b3415 from 8ac5a62 (campaigns and offers with no brand are every brand's), release 6 as 7835cf0 from
  1a37e68, release 5b as 5b481aa from ea8b364, release 5 as 8a04f86 from 6adf121, release 4 as 097432a from a7e87ae.
  Neither release 6 nor 6b could be checked on the live site from the build environment either (its network policy
  refuses `app.hexa-tech.uk`): `main` was checked by content instead (every source file equal to the branch, the
  built bundle carrying the new strings).
- **Release 9** (review fixes, redesign, nightly tier check; live as `main` 34162f4, 2026-10-26). No migration. One new
  scheduled command: `php artisan loyalty:assess-tiers [--org=<organisation id>]` (daily 02:47 UTC). No new route. The
  change to tiers takes effect for moves from now on: a member moved before keeps the year-ahead grace date they have.
- **Release 8** (membership for every industry; live as `main` 3ffe5c5, 2026-10-25).
  Three migrations, each tried on PostgreSQL with rollback, adding tables and defaulted or nullable columns only:
  `2026_10_25_140000_create_access_places` (`access_places`, `access_place_tiers`, `scan_events.access_place_id` and
  `loyalty_event_id`), `140100_add_membership_validity_and_visits` (`loyalty_members.membership_valid_until`,
  `membership_reminded_for`, `qualifying_visits`; `loyalty_tiers.min_visits`; `tier_qualification_counts.visits`,
  `venue_day`) and `150000_create_loyalty_events` (events, their tiers, sign-ups, check-ins). One new scheduled
  command: `php artisan loyalty:membership-reminders [--org=<organisation id>]` (daily 08:37). New workspace routes:
  `places` (GET, POST, PUT, DELETE, `{id}/entries`), `members/{id}/validity`, `events` (GET, POST, GET/PUT/DELETE
  `{id}`, `publish`, `cancel`, `people`, `sign-ups`, `check-in`); `POST scan` takes `place_id` / `event_id`. New member
  routes: `GET member/portal/events`, `POST/DELETE member/portal/events/{id}/sign-up`. Nothing changes for members
  until a venue adds a place, an end date or an event, or switches tier progress to visits or spend. Full-admin and
  shared files it changes on purpose: `LoyaltyService` (tier assessment by the programme's measure, `tierProgress()`,
  visits), `LoyaltyPresetService` (two presets — the full admin's preset picker lists them too), `MemberImportService`
  (the full admin's import reads `valid_until` too), `MemberEnrolment`, `MemberMergeService`, `CardLookup`/`CardRead`,
  `PortalBootstrap` (`capabilities.events`, `member.membership`), `routes/console.php`.
- **Release 7** (ways to earn and reward; live as `main` ffabebf, 2026-10-25). Four
  migrations, each tried on PostgreSQL with rollback, adding tables and defaulted or nullable columns only:
  `2026_10_25_100000_create_stamp_tables` (`stamp_cards`, `stamps`), `110000_create_credit_ledger`
  (`credit_transactions`, `loyalty_members.credit_balance` default 0), `120000_point_expiry_can_be_never`
  (`point_expiry_buckets.expires_at` nullable; its rollback refuses while a NULL exists) and
  `130000_create_tier_qualification_counts`. No new scheduled command or artisan command. New workspace routes:
  `options` (GET/PUT), `options/setup`, `options/setup/skip`, `members/{id}/check-in`, `members/{id}/stamps`,
  `members/{id}/credit` (GET), `members/{id}/credit/spend`, `members/{id}/credit/adjust`; new member routes:
  `GET /v1/member/stamps`, `/v1/member/credit`, `/v1/member/portal/stamps`, `/v1/member/portal/credit`. Every option
  starts as it was (stamps, check-in, earning at the desk and cashback off); referrals switch to "first visit" for new
  sign-ups. Full-admin and shared files it changes on purpose: `AuthController` (sign-up: referrals and expiry
  through the options), `PublicJoinController` (the welcome bonus 500 where it showed 0; `referrals`),
  `Admin/DiscountController::useOffer` (an unpaid bonus-points claim is paid once), the member `OfferController`,
  `ReferralController` and `MemberController` (self-deletion forfeits credit), `LoyaltyService` (multiplier offers,
  expiry 0, tier counters, `assessTier`'s direction on the model's floor), `ExpireLoyaltyPoints`,
  `BookingPointsService` and `BookingRefundService` (the visit hook), `AppointmentMoney::afterRefunds` (takes a visit
  back with points off too), `MemberMergeService`, `MemberErasure`, `MemberEnrolment`, `NotificationService` (the
  full card's push type), `RedemptionActions` (`issueFree`), `MemberLedger` (reversing a desk line), `LoyaltyPresetService`
  (each preset's recommended options), the portal's Join, offers and referral card.
- Release 6: one migration, `2026_10_23_160000_add_dispute_lost_amount_to_bookings` (a nullable column on
  `booking_mirror` and `service_bookings`); no new scheduled command. New commands
  `php artisan brands:ensure-default [--org=<organisation id>] [--apply]` and
  `php artisan portal:pay-at-venue <organisation id> --on|--off|--status`; new route
  `POST program/boosts/confirm-times` (workspace). Widget changes in it, all under the owner's "all remaining
  improvements": the stay widget's combination takes the room locks and re-checks under them; a stay confirm re-reads
  its payment under the hold's lock (a payment it cannot check: 503 "the booking was not made", the rescue and a staff
  enquiry); a failed services booking's long error text is cut to 255 characters so it is logged. Full-admin and
  shared files it changes on purpose: `BookingDetail.tsx` (a group's payment on every room) and the refund answers
  (409 `no_new_refund`, 504 `refund_outcome_unknown`), the extras, services and voice-agent controllers (an emptied
  field keeps its value), `NfcController`/`ScanController` (cards through `NfcCards`), `BookingRefundService`,
  `StripeService`, `BookingPublicController`, `BookingEngineService`, `MemberCancellation`, `PortalPaymentIntentGuard`,
  `CapturePendingPaymentIntents`. Owner decisions at deploy (2026-10-25): a landing page keeps showing a stored price
  0 and length 60 as they are; campaigns and offers saved for every brand stay every brand (built after the deploy,
  below).
- **Every brand, for campaigns and offers** (owner 2026-10-25, release 6b): a `NotificationCampaign`
  or `SpecialOffer` created with no brand keeps an empty `brand_id` — every brand's — instead of getting the default
  brand (`EVERY_BRAND_WHEN_EMPTY` on the model; `BelongsToBrand` fills nothing in for it), and a brand's own view lists
  those rows beside its own (`BrandScope`: that brand or none). Every other brand-scoped row still gets the default.
  Sending and members' offers never filtered by brand, so who receives a campaign or sees an offer is unchanged. The
  workspace's offer dialog offers "Every brand" (`brand: "every"`, `LoyaltyForms::brandOrEveryRule()`) to staff who
  work for every brand, and a new offer starts there; staff held to some brands put offers on those only.
- Release 5: no migration, no new scheduled command. New routes: `GET/POST members/{id}/cards`,
  `POST members/{id}/cards/{card}/off` (workspace). Full-admin and shared files it changes on purpose: the full admin's
  `ScanController::scanQr` (reads through `CardLookup`) and `pages/Scan.tsx` (the camera sends the whole code),
  `BookingAdminController::refund` (a room of a group defaults to its own remaining total), `BookingRefundService`,
  `CapturePendingPaymentIntents`, `BookingPublicController` (the payment webhooks; the widget's paid combination writes
  the payment on the lead room only), `BookingEngineService`, `MemberErasure` and the member `MemberController`
  (deletion writes a fresh QR token instead of null). Release 3 went out as `main` f344b74 from 763e1b0, release 2 as
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

### After the release 9 deploy (owner, signed in)

- Scan on a laptop: the answer sits beside the scanner. Scan a member whose membership ran out: red, then "Renew for 1
  year" turns it green.
- A member's page: email and phone in the header only; Edit, Card and the ⋯ menu in the top right.
- Program: the tiers read as a ladder; Events: open one and find Add a member, Edit and Cancel under More.
- Portal on a phone: the tier name is readable on the card, numbers have their separators, the tier's benefits sit
  under the progress bar.
- The next morning: Laravel Cloud's scheduler log shows `loyalty:assess-tiers --at-venue-hour=5` running each hour at
  :47 ("… moved of … checked"; "0 of 0" in the hours that are no venue's 5 o'clock).

### After the release 8 deploy (owner, signed in)

- Program → Places: add "Main entrance" (every member) and a lounge for your top tier. Each tier card says where it can
  enter.
- Scan: choose the lounge under "Scanning for" and scan a member of a lower tier (red, with the reason), then the
  entrance (green). Try Door mode on a tablet or phone.
- A member's page: Extend their membership by a month; the members list shows Expiring soon when it is within 30 days.
- Events: create one for today, publish it, Start check-in, scan a member (+points, "Already checked in" the second
  time); in the portal the member sees it under Events.
- Ways to earn: "How members move up" stays on Points unless you choose otherwise.

### After the release 7 deploy (owner, signed in)

- As a manager, open `/loyalty`: the banner offers the setup wizard. Run it on a test venue (or Not now on a real one,
  then open Ways to earn) and check the sentences say what members get.
- Switch on the stamp card (e.g. 3 stamps, 50 points), check-in and earning at the desk, and cashback (5%). On Scan,
  find a test member: Check in (+1 stamp), then Add a purchase of 10 (points and +0.50 credit); a second Check in the
  same day says "Already checked in today".
- On the member's page: the stamp card and the credit balance; Use credit 0.50, then try 1.00 more (refused: not
  enough credit). As a manager, Adjust +1.00 with a reason, then −1.00.
- In the portal as that member: Home shows the stamp card and "Credit: €0.00" (or the venue's currency).
- Switch the test options off again if the venue does not use them.

### After the release 5 deploy (owner, signed in)

- Scan on a phone: "Scan with camera" and a member's QR code from the app (and a wallet pass); type `#` and the number
  as the pass shows it. On an Android phone in Chrome: "Tap NFC card" with a card, then "Link this card" to a member;
  tap it again and the member opens. At the desk: a USB reader in Chrome, or a keyboard-style reader in the field.
- A member's page: the NFC cards section lists the card; switch it off and scan it again (it says switched off).
- The full admin's Scan → Start Camera reads the app's QR code again.
- Members: delete a test member (it now works); as a test member, delete the account in the portal's Profile.
- Portal (a hotel venue): a party too big for one room is offered rooms together; book a two-room stay with a test
  card; in the full admin the lead room shows the payment, both rooms are paid after capture; cancel it in the portal
  and check one refund in Stripe.

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
