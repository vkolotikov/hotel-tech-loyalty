# HexaTech Loyalty — runbook

Manual memberships and partner access (10 November 2026): [customer setup guide](loyalty-memberships-and-partners.md),
[API additions](api/loyalty-membership-partners.md) and [verification audit](audits/2026-11-10-loyalty-membership-partners.md).
Assign an existing level and dates under Members → Manage membership; Settings → Partner access invites staff to
scan/check in only at their selected places. These rights are enforced on the server, including access report mode.
The first distribution is the web scanner `/loyalty/partner`; it does not update installed native staff apps.
Assigned/start-dated terms restrict level benefits, queued fulfillment, level offers and earning privileges to their
term; switching back to earned preserves dates. Legacy end-only records retain their previous rules. Physical Card QR
follows the reusable card ID; personal QR and Wallet credentials stay with their member.

Guided setup preview (10 November 2026): the right side is fully expanded in normal page flow, with coloured
industry icons, a Join → Earn points → Use rewards journey and separate membership/reward, earning, bonus and rule
sections. Selecting a template or editing a draft updates the canonical explanation immediately; existing levels
and rewards remain the actual catalogue. Review and explicit Apply are unchanged. Five languages, both themes,
mobile wrapping and reduced motion are covered. See `audits/2026-11-10-loyalty-setup-preview.md` and the current handoff.

Setup and catalogue follow-up (9 November 2026): industry templates are selectable for existing programmes and propose earning rules for explicit review; existing tiers, benefits and rewards are retained. Setup is available from Settings and Overview's real first-steps checklist. Member fields have explicit spacing and native place radios keep their native geometry. Offers default to a compact read view with Edit. RewardManagement owns enable/disable and deletion in both admin interfaces; deletion refuses any redemption history or stamp-card reference. ProgrammeOptions saves and reward deletion share the organisation setup lock. Wizard template metadata cannot be set by a general option update. See [the implementation and email authentication audit](audits/2026-11-09-loyalty-setup-polish.md).

Launch rehearsal (9 November 2026): see [the audit report](audits/2026-11-09-loyalty-launch-rehearsal.md) for real-backend journeys, delivery evidence and outstanding production/device gates. `php artisan loyalty:launch-audit` reads safe platform observations. Its explicit `--queue-probe` queues one harmless infrastructure job at most once per 15 minutes; run the default command afterwards to observe completion. No messages are sent. A processed probe proves one job ran, not continuous worker monitoring. Wallet actions now follow the member bootstrap's provider availability flags.

Rewards & benefits simplification (6 November 2026): RB-B01/02/03 (`308:10648`, `308:10947`, `308:11226`) group filters with catalogue rows, align costs/assignments/statuses, add original coloured icons and compact shortcuts, separate reward details/claim settings and consolidate offer actions in a save footer. The benefits catalogue follows the same compact composition. Actual all-member/code eligibility, typed discounts, media writes, server offer state/date contracts, per-level benefit assignments, permissions and unsaved guards remain. No backend/API/Places change. See `loyalty-redesign/27-REWARDS-SIMPLIFICATION-REPORT.md` and the current handoff for release evidence.

Ways to earn simplification (6 November 2026): WE-B01/02/03 (`303:10169`, `303:10436`, `303:10701`) group filters with the earning list, align rates/statuses, add original coloured artwork and compact bonus/rules shortcuts, and simplify the purchase, bonus and shared-rule editors. All six server methods and explicit validated partial saves remain; booking points and stamp cards are separate. Copy is translated in all five languages. No earning engine/API/backend/Places change. Production `c8c89119f`, deployed feature source/next source-patch baseline `0b2cff75d`, live content verified at 06/11/2026, 17:20:11 Riga. Artifact: 5,872 frontend tests, 2,042 required PHP tests, 227 compiled browser checks and ten language/theme combinations. See `loyalty-redesign/26-WAYS-TO-EARN-SIMPLIFICATION-REPORT.md` and the current handoff.

Program simplification (6 November 2026): current frames are PG-B01/02/03/06/07 (`295:9118`, `295:9407`, `295:9686`, `295:10623`, `295:10897`) and the Places directory PL-01 `326:13875`. Membership benefits have one catalogue under Rewards; old Program benefit URLs redirect with filters/selection preserved. Level-specific assignments remain in level editors. Program has compact level cards/details, a searchable boost schedule/preview and refined guided setup. Places changes cover its main directory only, using real place/active/allowed-today figures and existing dialogs/Scan; entrance hierarchy, overrides, hours and other future Places functions remain unimplemented pending owner review. Existing APIs and writers are unchanged. Production `e7bd314a9`, deployed feature source/next source-patch baseline `c01daf41a`, live content verified at 16:46 Riga. Artifact: 5,869 frontend tests, 2,042 required PHP tests, 248 compiled browser checks and ten language/theme combinations. See `loyalty-redesign/25-PROGRAM-SIMPLIFICATION-REPORT.md` and the current handoff.

Members simplification (6 November 2026): current frames are MB-B1 `277:8616`, MB-B2 `277:8893` and MB-B3 `277:9078`. The directory groups search/filters with the table, adds tinted summary cards, zebra rows and explicit status badges. Profiles and desktop points dialogs use shorter copy and exact design icons. Custom tier text and status colours meet 4.5:1 contrast in both themes; native dropdown options have explicit colours. Financial details and history audit metadata remain in Details/full history. Dedicated mobile review flows, permission gates and all writers are unchanged. Production `e576c9085`, deployed feature source/next source-patch baseline `dd1766e58`, live content verified at 15:24 Riga. Artifact: 5,859 frontend tests, 2,042 required PHP tests, 127 compiled browser checks and ten language/theme combinations. See `loyalty-redesign/24-MEMBERS-SIMPLIFICATION-REPORT.md` and the current handoff for evidence.

Overview simplification (6 November 2026): the current design is OV-B1 `268:8579`, with first setup `268:8800` and progress reference `268:8991`; the old main frame `29:365` was removed. The page now places review issues first, shows compact program facts, adds metric/activity icons and reduces repeated copy. All real data, permission checks, existing dialogs and workflow links remain. The dedicated mobile Home remains its own composition. Setup progress uses the server's existing checklist, not Figma's sample wizard step. See `loyalty-redesign/23-OVERVIEW-SIMPLIFICATION-REPORT.md` and the current handoff for evidence.

Wallet updates, media recovery and Windows reader (30 October 2026): see `wallet-and-media-operations.md` for
the protocol, scheduler, recovery commands and outstanding physical acceptance.

Production acceptance follow-up (29 October 2026): the full admin's email send now uses `CampaignStart`,
including its explicit-member/HTML compatibility path. Recipient counts reflect eligibility, invalid segment
rules fail closed, and queue refusal restores the draft. Scheduler reporting is registered through
`ScheduleServiceProvider`; missing task observations show unobserved in System status. See
`docs/audits/2026-10-29-production-acceptance.md` for live infrastructure evidence and remaining acceptance.

HexaTech Loyalty (`/loyalty`) is the loyalty programme as its own workspace beside the full admin, a sibling of
HexaTech Appointments and HexaTech Content, in Content's cards look. It is another shell over the same records —
`loyalty_members`, `loyalty_tiers`, `points_transactions`, `benefit_entitlements`, `rewards`, `special_offers`,
`earn_rate_events`, and since release 2 `member_segments`, `email_campaigns`, `wallet_configs` and the `mobile_app`
settings — nothing is copied. Specs: `docs/superpowers/specs/2026-10-21-loyalty-workspace-design.md` (release 1) and
`docs/superpowers/specs/2026-10-21-loyalty-release-2-design.md` (release 2: members complete, Insights, segments and
campaigns, card and app, pictures, currency).

Campaigns Figma redesign (28 October 2026): see `loyalty-redesign/19-CAMPAIGNS-REPORT.md` for CM-01–04, the two-step email editor, server list filters, saved audience copies, Push/SMS/Segments layouts and verification. Existing route names and delivery writers are unchanged.

Insights layout refinement (29 October 2026, live verified): populated membership levels stay beside the donut;
empty levels remain in an expandable list. Long lists are bounded and keyboard-scrollable, and the activity chart
no longer stretches with them. All report data, routes and interactions are retained. See
`loyalty-redesign/20-INSIGHTS-LAYOUT-REPORT.md` for Figma comparison, responsive checks and release evidence.

## Who has it, and the ways in and back

Insights filters (6 November 2026, alignment follow-up): four matching dropdowns for reporting period, membership level, status and email preferences sit in one desktop row, followed by a **Compare with previous period** checkbox. They wrap into two columns on tablets and stack on phones. Native dropdown options have explicit foreground/background colours in both themes. The date range opens only the custom-date window; member filters are inline. Every valid selection applies automatically. Custom dates wait 350 ms for complete, valid input; invalid dates leave the previous report standing. There is no Save or Apply step. Selected member filters appear as removable chips; Clear member filters preserves dates/comparison, while Reset restores all defaults. Charts remain visible with an updating state during filter changes, scoped to the same organisation, staff member and permissions; export waits for the current response. Rapid choices merge against the last selection even while Router transitions are pending; browser Back restores its URL rather than reapplying stale date input. Visibility stays on this device. Presets use completed venue days (7/28/90/365, last calendar month), with explicit custom dates. `GET insights/report` accepts `state=all|active|inactive`, `consent=all|yes|no` (current email marketing consent) and `without_tier=1` (mutually exclusive with `tier_id`). Its `filter_options` supplies the status and consent choices. `InsightsAudience` supplies one population to activity, comparisons, levels, rewards, cohorts and direct/guest-linked member sales. Reports cover all places; defaults and legacy detailed endpoints are unchanged. See `handoff/2026-11-06-hexatech-handoff.md` for verification and deployment.

Dedicated mobile web (29 October 2026): at widths up to 767px, Loyalty uses the Figma Home/Members/Requests/Scan/
More navigation and compact task screens. Members and requests have separate details, with existing writers behind
review sheets. More retains secondary tools; Settings prioritises personal preferences and currency. Desktop layouts
remain from 768px. See `loyalty-redesign/22-MOBILE-WEB-REPORT.md` for exact frames, API adaptations and release evidence.

Guided setup and Settings style refinement (29 October 2026): `/loyalty/options/setup` uses the shared Figma frame,
progress banner, four-step editor and actual draft preview. Existing tiers, validation, idempotent Apply and Skip
remain; edited drafts warn before leaving. Sidebar Settings retains quick preferences and adds **All settings**
at `/loyalty/settings`, with staged language/theme choices and the existing manager-only currency dry run and writer.
Get started, Guide, Import and Duplicates also use the shared frame. Thirty other routes/tabs were audited on desktop
and mobile. See `loyalty-redesign/21-SETTINGS-SETUP-REPORT.md` for exact Figma nodes, data integration and verification.

Scan redesign (28 October, deployed and live verified): `/loyalty/scan` now follows the exact desktop/mobile
Figma scanner, manual lookup, member actions and access-result screens. Normal scanning pauses after one
result; camera/NFC/USB activation remains explicit. Existing continuous `/loyalty/scan/door`, linking,
renewal, visits, credit and point writers remain available. Place/Event context, balances and permissions
come from the existing APIs; manual desk lookup is read-only. Five languages and both themes are supported.
See `docs/loyalty-redesign/18-SCAN-REPORT.md` for design comparison, integration, tests and deployment evidence.

Card & app availability (8 November): the member app and desktop designers are **On hold**, including the old
`?tab=app` bookmark. The current native app uses portal venue accent/heading-face branding, not the separate
mobile palette editor; the former Desktop view was illustrative. Wallet settings/uploads and currency remain
available to authorised managers, with provider-account/approval requirements explained. Email and push cards
state their setup dependencies; SMS retains per-organisation Twilio setup. Own sending-domain/SMTP connections
are on hold. See `loyalty-redesign/28-DELIVERY-AND-APP-AVAILABILITY.md` for the audit and acceptance limits;
`loyalty-redesign/17-CARD-APP-REPORT.md` describes the earlier design.

Requests/Insights redesign (28 October, deployed and live verified): `/loyalty/requests` combines benefit
requests, reward redemptions and referral activity through `GET requests/inbox`. Existing writers and legacy
benefit bookmarks are retained. `/loyalty/insights` reads `GET insights/report?from&to&compare&tier_id`; defaults
to 28 completed venue days, with equal preceding comparison. Current level filtering applies to current member
records across all places; place attribution is not consistently available. Charts/tables, cohort inspection,
metric definitions and scoped CSV export are live reads. Existing detailed reports and `?period`/`?quiet`
bookmarks remain accessible. See redesign reports 15 and 16 for precise metric definitions and verification.
Production `f5edeb363`, deployed feature source/next source-delta baseline `e21e92582`, live verified at
16:22 Europe/Riga. Backend: 7,084 passed/7 skipped; frontend: 5,651 passed; compiled browser: 139 passed.
Final TypeScript, Loyalty lint, fresh build, live assets/fonts/API authentication and landing checks passed.

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
| Program | `GET program`; `POST/PUT program/tiers[/{id}]`, `POST program/tiers/{id}/benefits`, `DELETE program/tiers/{id}/benefits/{tierBenefit}`, `POST/PUT program/benefits[/{id}]`, `POST/PUT/DELETE program/boosts[/{id}]`; release 6: `POST program/boosts/confirm-times` (`ids`), `brand` on the boost, reward and offer PUTs; release 11: `GET program/tiers/{id}/removal`, `DELETE program/tiers/{id}` (`move_to`), `GET program/benefits/{id}/removal`, `DELETE program/benefits/{id}` |
| Rewards | `GET/POST rewards`, `PUT rewards/{id}`; `GET redemptions?state=pending|done|all&page`, `POST redemptions/{id}/fulfil`, `/cancel`; `GET/POST offers`, `PUT offers/{id}`; `GET referrals?page`; `POST/DELETE rewards/{id}/image`, `POST/DELETE offers/{id}/image` |
| Members (release 2) | `POST members`, `PUT members/{id}`, `PUT members/{id}/tier`, `POST members/{id}/deactivate`, `/reactivate`, `/erase` (`confirm_name`), `GET members/{id}/card`, `POST members/{id}/welcome`; `GET members/duplicates`, `POST members/merge`; `GET/POST members/imports`, `GET members/imports/{batch}`, `POST members/imports/{batch}/run`, `/cancel`; `GET members/export` (CSV) |
| Insights | `GET insights?period=30d|90d|12m`, `GET insights/at-risk?days=` (7–365); release 4: `GET insights/cohorts`, `GET insights/money?period=` |
| Segments | `GET segments`, `GET segments/options`, `POST segments/preview`, `POST segments`, `PUT/DELETE segments/{id}` |
| Campaigns (`feature:campaigns`) | `GET/POST campaigns`, `GET/PUT/DELETE campaigns/{id}`, `GET campaigns/{id}/audience`, `POST campaigns/{id}/test`, `/send` (`recipients`, `revision`), `/cancel`, `/duplicate`; release 4: `/schedule` (`send_at` on the venue's clock, `YYYY-MM-DDTHH:mm`, and `revision`), `/unschedule` |
| Push messages (`feature:push_notifications`, release 3) | `GET/POST push`, `GET/PUT/DELETE push/{id}`, `GET push/{id}/audience`, `POST push/{id}/send` (`recipients`, `revision`), `/cancel`, `/duplicate`; release 4: `/schedule`, `/unschedule` |
| SMS (`feature:campaigns`, release 4) | `GET/POST sms`, `GET/PUT/DELETE sms/{id}`, `GET sms/{id}/audience`, `POST sms/{id}/test`, `/send` (`recipients`, `revision`), `/schedule`, `/unschedule`, `/cancel`, `/duplicate` |
| Card & app | `GET/PUT wallet`, `POST wallet/apple-cert`, `/apple-wwdr`, `/google-service-account` (`feature:wallet`); `GET/PUT app-look`, `POST app-look/logo`; release 4: `GET currency`, `PUT currency` (`currency`, `dry_run`) |
| Ways to earn (release 7) | `GET options`, `PUT options` (`options`: a partial change), `POST options/setup` (`preset`, `options`, `idempotency_key`), `POST options/setup/skip` |
| Start here (release 10) | `GET start` (SetupProgress: `steps` — `key`, `done`, `count` — `done`, `total`; every staff member); `GET program` also answers `advice` (TierAdvice) |
| Visits (release 7) | `POST members/{id}/check-in` (`amount`, `note`, `idempotency_key`), `GET members/{id}/stamps` |
| Credit (release 7) | `GET members/{id}/credit?page` (25 a page), `POST members/{id}/credit/spend` (`amount`, `note`, `idempotency_key`), `POST members/{id}/credit/adjust` (`amount`, signed, `reason`, `idempotency_key`) |
| Places (release 8) | `GET places`, `POST places`, `PUT places/{id}` (`name`, `description`, `admits` all\|tiers, `tier_ids`, `is_active`, `sort_order`, `idempotency_key`), `DELETE places/{id}` (switched off instead once it has entries or an event names it), `GET places/{id}/entries?day=&page=` (50 a page); `POST scan` takes `place_id` or `event_id` |
| Membership (release 8) | `PUT members/{id}/validity` (`valid_until` Y-m-d\|null, or `extend` 1m\|3m\|6m\|1y; `idempotency_key`); `GET members?state=expiring\|expired` |
| Events (release 8; design pass 2026-10-28) | `GET events?when=upcoming\|today\|past\|drafts&q=&place_id=&location=&tier_id=&sort=soonest\|latest&page=`, `GET events/options` (places, tiers, tenant custom locations), `POST events`, `GET/PUT/DELETE events/{id}`, `POST events/{id}/publish`, `/cancel` (`reason`), `GET events/{id}/people?q=&attendance=all\|not_checked_in\|checked_in\|walk_in\|cancelled&per_page=5..200&page=`, `POST events/{id}/sign-ups` (`member_id`), `DELETE events/{id}/sign-ups/{memberId}`, `POST events/{id}/check-in` (`member_id`) |

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
- **Events** (release 8; design pass 2026-10-28, `events/`): upcoming, past and drafts in the Overview shell,
  server search/location/level filters, selected event details; full editors at `/events/new` and `/events/:id/edit`
  with member preview, draft save and review/publish. An event's existing page contains attendance counts,
  searchable/filterable people, actual historical points, confirmation, member profile and signup cancellation.
  Scan and Door mode retain event context; by-name check-in, add a member, edit/publish/cancel/delete remain available.
  Counts distinguish registrations waiting to arrive from walk-ins. Read filters precede pagination; writes,
  permissions, venue wall times, notifications and idempotency retain existing server contracts.
- **Membership** (release 8): a member's page shows the end date with Extend / Set a date / Remove (managers); the
  members list shows Expiring soon and Expired; progress follows the programme's measure.
- **Colour families** (design pass, owner 2026-10-26: "colours, icons … not to lose in the app"): `theme/loyalty.css`
  has five hues — earn green, bonus rose, rule violet, gift amber, offer blue, plus `off` grey — named on an element with
  `data-hue` and painted by `.l-hue-tile`, `-text`, `-wash`, `-edge`, `-bar`, `-fade`; each reads at 4.5:1 on the
  surfaces and over its 12 % tint (`loyaltyContrast.test.ts`). A new page reuses a family for the same kind of thing.
- **Ways to earn, design pass**: the cards sit in three sections (`options/groups.ts`: earn, bonuses, rules; a way
  the workspace does not know goes under More — `groups.test.ts` fails until a new server way is placed), each with its
  colour and "x of y on". A card says On or Off beside its switch and what members
  get; its numbers open with Change (or by themselves once the switch or a number changed) and close on Save or
  Cancel, so the grid stays short.
- **Ways to earn, tabs and checks** (owner 2026-10-26: "easier to manage … in industry … better logic"): tabs —
  Overview, Earn points, Bonuses, Rules — with each section's "on/all" and the Overview's warning count; the tab and an
  opened card live in the address (`?tab=earn&way=check_in`, or `?way=…` alone). The **checks**
  (`App\Services\Loyalty\Programme\ProgrammeAdvice`, in the options answer as `advice`: `nothing_earns`,
  `visits_without_source`, `spend_without_source`, `stamp_reward_missing`, `referrals_give_nothing`, `no_rewards`
  as warnings, `expiry_short` and `checkin_counts_only` as tips) each name the card to open and, but for
  `no_rewards` (which opens Rewards), carry a **one-press fix** — `fix`, the options that clear it (switch on the
  missing source, give points instead of a reward no longer offered, the referral defaults, 12 months' expiry, 10
  points a check-in) — which a manager's Fix saves like any change. A fix names only options the server has
  (`ProgrammeAdviceTest`), and each one saved as sent clears its own check (`OptionsTest`). **Recommended for <the
  industry's preset>** means the ways that preset switches on and this venue has off, each with Turn on (one save
  of that way's switch and numbers from the preset, `suggestionsOf()`). The **Overview** (`options/Overview.tsx`, owner 2026-10-26:
  "easier to navigate … build a logic") reads top down: a status line ("All set" or "To fix: n", then ways on,
  tiers, rewards, tips and the preset's recommendations); the checks; then **your members' journey**
  (`options/journey.ts`): a map of seven steps — joins, visits and spends, celebrates, brings a friend, moves up,
  spends points, stays active — coloured when the step gives members something today (`stepLive()`), each a button
  that scrolls to its step below (never a `#…` link: under `<base href="/">` that leaves the workspace, and the
  sweep in `tokens.test.ts` refuses one), and the timeline of those steps with their ways (Off, Not used here,
  Recommended with Turn on) and the parts they lead to (boosts, tiers, rewards, offers, each opening its page).
  Every server way has a step (`journey.test.ts` fails until a new one is placed). The **earn rate**
  is a card of its own, always on (`earn_rate`, `points_per_currency`): it serves completed bookings and purchases at
  the desk alike, while "Points on bookings" (`points_on_bookings`) only switches the bookings — so a venue without
  bookings still sets its desk rate. `not_used` names the ways that do nothing at this venue (points on bookings where
  nothing can be booked: no bookable service and no room), and their card says so. A new check is a code in
  ProgrammeAdvice (pure `read()`, unit-tested by value) and its sentence in `options/words.ts` `ADVICE_WORDS` and the
  five bundles; a code without words is not shown. **Rewards, design pass**: tabs with icons and counts (the codes waiting at the desk
  in the waiting colour; the four first-page answers fetched once and shared with the tabs), the catalogue filtered
  by All / Offered / Switched off, its cards one shape (picture or its stand-in with the cost on it, the four figures
  as icon tiles), offers with their kind's icon, redemption codes as chips, referral figures with icons.
- **The Guide** (`/loyalty/guide`, `guide/`, owner 2026-10-26): the workspace's documentation for new staff, opened
  from Help & resources (side panel and phone menu) and from Find. A search over everything (accents and case aside);
  the quick start in five steps; a card per page, only the pages this person's menu has (`featuresFor()`, the same
  rights as the menu); "Try a scan", the door's four answers acted out through the scan screen's own `answerVerdict()`
  with the venue's lowest and highest tiers (nothing is sent); the questions by topic, one or two sentences each. It
  reads nothing beyond the bootstrap. Words in `i18n/guide.<lang>.json` (`guide/words.ts`); a new question is an entry
  in `FAQ` (`guideMath.ts`) and its `_q`/`_a` in all five bundles. `guide.test.tsx` checks every link the Guide opens
  against the routes in `LoyaltyApp.tsx`, so a renamed page fails it. The motion (`animate-a-sweep`, `animate-a-float`,
  in `tailwind.config.js`) is stilled under reduced motion like the rest.
- **Release 10, the frame from the owner's Figma** (`docs/superpowers/specs/2026-10-26-loyalty-release-10-design.md`;
  Figma file `5MtOVFZKvXk5x0mJ8Trm6g`, page Prototype): "easy to manage … for non-experienced users … sections a bit
  contrast one to another". The parts, and where a new page takes them from:
  - *Palette.* Loyalty's own `LOYALTY_SURFACES` (`workspace/theme/accent.ts`): in Dark the drafts' navy — canvas
    `#182231`, cards `#29384b`, edges `#45576e`, side panel `#111b29`, text `#f5f7fb` / `#b8c7dc`; Light as before with
    the deeper side panel. Content keeps `NAVY_SURFACES`. The shell, the door and tier chips compute the accent against
    it; `loyaltyContrast.test.ts` proves the tokens, every pair, every family on its fill, and the shared tones.
  - *Colour families* (`data-hue`, `ui/sections.ts` `Hue`): earn green, bonus rose, rule violet, gift amber, offer sky,
    and since release 10 tier blue and place teal. Each has a tone (`--l-hue-*`) and a fill (`--l-hue-*-bg`; in Dark
    the drafts' own `#203a5f`, `#352b4a`, `#183e3c`, `#493a20`); `.l-hue-card` is the chosen section, `.l-hue-panel`
    a section's opening line and a Get started panel.
  - *Sections as cards* (`ui/SectionCards.tsx`, the drafts' 171:401): icon in the colour, title, count, a line of what
    it holds; a tab list with one tab stop (`sectionAfter`). Program (Tiers blue, Benefits violet, Places teal, Boost
    events gold — `?tab=`, and the old `#places` still opens Places), Ways to earn (Overview blue, then its sections),
    Rewards (catalogue amber, codes teal, offers sky, referrals rose), Campaigns (emails blue, segments violet, push
    rose, SMS green), Card & app (wallet amber, app blue, currency green). Filters (Events, Requests) stay pills.
  - *A page says what it is for*: `PageHeader stacked` puts its line under the title (other workspaces unchanged);
    each Program section opens with its line in its colour (`SectionIntro`).
  - *Figures as tiles* (`ui/FigureTiles.tsx`): Members (active, joined this month, average points; expiring and
    expired stay buttons that filter), Tiers (tiers, members in a tier, benefits — the last leads to Benefits).
  - *An empty list teaches* (`ui/GetStarted.tsx`, the drafts' 163:322 and 163:400): chip, heading, three numbered
    steps, the one action (the header's add button is hidden while the list is empty, so there is never a second),
    an example in figures where it helps (boosts: 100 → 200 points). On tiers, benefits, places, boosts, rewards,
    offers, email campaigns, segments, push messages, SMS and upcoming events (New event stays in the header).
  - *Benefits say where they are used* ("Given by Silver · Gold", or that no tier gives one yet).
  - Spanish addresses staff as *usted*, as the rest of the workspace does (Campaigns, Push and Insights test it).
- **Release 10, guidance** (the second part of the same spec):
  - *Start here* (`/loyalty/start`, `start/`): how far the programme is set up and each step in order — the wizard,
    a tier in use, Ways to earn without warnings, a reward offered, the logo on the card, a member, a scan — done (a
    tick) or the page that does it, the next one first in its colour with "Do this next". The steps and whether each is
    done are `App\Services\Loyalty\Setup\SetupProgress`'s (reads only; `GET start`, every staff member); the list ticks
    itself as staff work. A manager sees "Set up your programme: n of 7 done · Next: …" on Members until every step is
    done (it replaces the wizard's banner there; the wizard is the first step, and its banner stays on Ways to earn);
    the Guide's quick start and Find lead to it too. A new step is a key in `SetupProgress::STEPS` and its page in
    `start/startMath.ts` `STEP_TO` (`start.test.tsx` fails until it is placed) with its words in all five bundles.
  - *Program's checks* (`App\Services\Loyalty\Programme\TierAdvice`, reads only, in the program answer as `advice`):
    `tiers_share_threshold` (warn) when two or more tiers members reach by earning start at the same figure on the
    programme's measure — only one of them is ever reached by earning (LoyaltyService picks one per figure); a
    switched-off, invitation-only or floorless tier does not count — as the owner's amber banner with each tier to
    open, and the Tiers card's waiting count; `benefit_unused` (tip) for benefits switched on that no tier in use gives,
    on Benefits with "Go to Tiers".
  - *The tier form shows the member's side* (the owner's 163:166): the earn rate in figures as it is typed ("100 base
    points become 125 points") and "What members see" — the chip, the rate in words, the tier's benefits; a boost's
    multiplier says the same ("100 points become 200").
- **Release 11, rename and delete** (owner 2026-10-26: "an option for users to delete or rename tiers and benefits, so
  they can customise the system for their needs"; `docs/superpowers/specs/2026-10-26-loyalty-release-11-design.md`):
  - *Rename* is its own small dialog on each tier card and benefit row (the name alone; Edit keeps the rest). A tier's
    name is the organisation's own among the tiers not deleted, whatever its case (`name_taken`), and a renamed tier's
    name follows to its members' guest records (`guests.loyalty_tier`, 30 characters) through `Members\TierHolders`.
  - *Delete* reads first what it would do (`GET …/removal`) and says it before the confirm. A deleted tier or benefit
    is soft-deleted (`deleted_at`, the models are SoftDeletes): gone from every list and ladder — the full admin's,
    the portal's and the app's too — while the history that names it keeps its name (`TierAssessment` old/new tier,
    a member's tier and `BenefitEntitlement::benefit()` read it `withTrashed()`).
  - A tier is deleted only by `App\Services\Loyalty\Programme\TierRemoval`, under the organisation's `tiers:{org}`
    lock: gone from the ladder first, then its members (switched on and off) move to the tier the manager chose —
    suggested: the nearest below that members can earn, else above — each with a `tier_deleted` assessment, their
    kept-until day and grace clock cleared (`Members\TierHolders`, not told); its benefits are taken off it; places
    and events stop naming it (one that let in only it then lets in no tier until staff choose); boosts and offers
    stop naming it, and one for it alone is switched off (an empty tier list there means every tier); a segment rule
    loses it only where it names other tiers too — one naming it alone stays, refused at send (`unknown_tier`) until
    staff change it, never emptied into "everyone". The last tier switched on is never deleted (`last_tier`, 409); a
    tier with members needs `move_to` (`move_to_required`, `move_to_unknown`, 422). After the commit it moves anyone a
    review put on it meanwhile.
  - A benefit is deleted only by `Programme\BenefitRemoval`: off every tier (the links switched off), out of the
    catalogue; members' requests keep its name and the waiting ones stay in Requests for staff to decide.
  - The database keeps a tier's name and a benefit's code once among the rows not deleted (partial unique indexes,
    migration `2026_10_26_120000`), so a deleted "Silver" never stops a new one. Presets applied again never bring back
    a tier or benefit a manager deleted (its name or code still counts); the forms refuse a deleted id
    (`OwnRows::rule(...)->whereNull('deleted_at')`); unscoped tier queries that build a ladder drop only the tenant
    scope (`withoutGlobalScope(TenantScope::class)`), so the soft delete still holds there.

## Request alerts on staff phones (2026-10-31)

Owner, 2026-10-31: "go ahead with push notifications for new requests" — for the HexaTech Staff app
(`apps/loyalty-staff`, `docs/loyalty-staff-app/00-PLAN.md`).

- **Phones.** `staff_devices` (migration `2026_10_31_120000`), one row per phone: an Expo push token is unique across
  every organisation and belongs to whoever signed in on that phone last. The app sends `PUT devices` (`token`,
  `platform`, `language`, `alerts`) after signing in and on every start, which keeps `last_seen_at` fresh, and
  `DELETE devices` (`token`, only the caller's own) before signing out. A field not sent keeps its value.
  `staff.expo_push_token` stays the Hotel Staff app's own single token; nothing here reads or writes it.
- **Who hears what** (`Loyalty\Staff\StaffAlerts`, the only sender): a member's new benefit request
  (`POST /v1/member/benefits/{id}/request`, the member app and the portal alike) goes to every active staff member's
  phone, since any of them may approve it; a claimed reward (`POST /v1/member/rewards/{id}/redeem`) only to managers and
  staff with `can_redeem_points`, who may hand it over. Only while the organisation has HexaTech Loyalty (workspace on,
  in its plan), only phones with alerts on that the app reported within 60 days, each in the phone's language
  (`lang/<lang>/staff_alerts.php`). The push data is `{type: 'staff_request', kind, id, organization_id}`; the app
  opens Requests when it is tapped.
- **The member never waits and never fails.** The two endpoints dispatch `AlertStaffOfRequest` after the response
  (`dispatchAfterResponse`, no queue worker needed); its failures are logged (`Staff request alert failed`, or
  `Push batch failed` from `NotificationService::pushMany()`). Each request is alerted at most once (a
  `SharedCache` key per kind and id, one day). A phone Expo calls `DeviceNotRegistered` is deleted at once.
- **What it does not do:** no alert for free rewards the programme issues itself (`RedemptionActions::issueFree()`),
  for events or for anything a member did not ask for; no receipts round (Expo's later receipts are not read for staff
  phones); no badge count on the app icon.
- Tests: `tests/Feature/LoyaltyWorkspace/StaffAlertsTest.php` (SQLite and PostgreSQL).

## Security review before the public launch (2026-11-04)

Owner, 2026-11-04: "check … all other potential issues which could be before we launch loyalty public". Four holes,
each closed with a test that fails on the code before the fix.

- **A membership's account is its organisation's own member account** (`Loyalty\Members\OwnAccount`). `users` has no
  tenant scope, and every new guest with an email, from any path (the booking widget, the chatbot, an import, staff),
  is enrolled by `GuestMemberLinkService::ensureMemberForGuest()`. That used to wrap ANY account with the same address
  in a membership: another venue's member, or a staff login of any organisation, its owner's included. The venue could
  then change that account's email in Edit details, send a reset and sign in as that person; deleting the member
  anonymised and signed out the other account; a merge deleted it, and the cascade deleted the other venue's
  membership with it. Now:
  - a guest is linked only to this organisation's own member account; any other account with the address leaves the
    guest a guest (`linkGuestToMember()` too);
  - `MemberDetails::update()` refuses a member's name, email, phone or photo on an account that is not its own (409
    `account_elsewhere`); tier, consent and status still change;
  - `MemberErasure::erase()` first gives such a membership an account of its own (`detach()`), then anonymises that;
    the other account is not touched;
  - `MemberMergeService` deletes the loser's account only when it was the loser's own and no other membership names it.
  - Links made before the fix: `php artisan loyalty:foreign-accounts` lists them (read only, `--org=<organisation id>`
    for one venue); `php artisan loyalty:foreign-accounts --detach` gives each its own account (named from the venue's
    own guest record, address `unlinked-member-<member id>@unlinked.local`, no known password). The membership keeps
    its number, points and history; nobody signs in to it until staff set an address in Edit details (one no other member
    account has: a member's address is unique across all organisations, `users_email_member_unique`). The migration
    `2026_11_05_090000_detach_foreign_member_accounts` ran the repair once on deploy (owner, 2026-11-05: nothing typed
    by hand), each audited `member.account_detached` with the old account id (undo: point `user_id` back); its count
    is in the deploy's log line `detach_foreign_member_accounts`. Nobody could use such a membership: the members' app
    and the portal sign in members only, and a member sees only their own venue's membership.
- **The CRM assistant asks the person's own rights** (`CrmAiToolset`, `CrmVoiceToolset`). Its routes let every staff
  member of a CRM organisation in, and its tools wrote with no rights of their own: anyone could have it award or redeem
  points (up to 100,000 a call by chat, 1,000,000 by voice), read every secret setting raw (Stripe, Twilio, mail, PMS)
  and change any setting. Points now need `can_award_points` / `can_redeem_points` (`LoyaltyAccess`, as the workspace
  and the staff app) and are written in the person's name; `get_settings` answers a secret only as `(set)` or
  `(not set)`; `update_setting` is a manager's and never takes a secret.
- **The members' chat is the member's own** (`MemberChatController`). A caller without a membership (a staff token)
  matched every website visitor's chat of the venue (`member_id = null`) on `GET/POST member/chat/{id}/messages`, to
  read it and to write in it as the visitor; it now answers 404.
- **A switched-off member spends and earns nothing on their own** (`MemberStatus::assertActive()`): redeeming a reward,
  claiming an offer and asking for a benefit answer 403 `member_inactive`, as the desk refuses them. Card, points and
  history stay readable.
- **Points at the desk and the door are told to the member** (`Loyalty\Visits\PointsNotice`). The owner's report that
  started the review: points changed in the staff app did not show in the members' app. An Award pushes "You earned N
  points"; a desk check-in or purchase (`DeskVisit`) and an event check-in (`EventCheckIn`) wrote the points and sent
  nothing, so the app kept its old balance until it next asked. They now send the same notice after their transaction,
  once per new line (never for a request sent again); the push also makes the members' app refresh. Since 2026-11-05
  a Redeem at the desk (`Admin\Loyalty\PointsController::redeem()`, the staff app's) sends "You used N points"
  (`points_redeemed`, the points category) the same way, because the members' app 2.0.0 refreshes on a push but not on
  its own. A manager's Reverse still sends nothing: the members' app from 2.0.1 and the portal ask again on their own
  (every 30 s on the app's Home, 60 s on the portal, and on return to either).
- Tests: `ForeignAccountsTest`, `CrmAiRightsTest`, `SwitchedOffMemberTest` (`tests/Feature/LoyaltyWorkspace/`),
  `tests/Feature/Member/MemberChatAccessTest.php`; the notices in `DeskVisitTest` and `EventCheckInTest`.

Second batch, the same day (smaller holes):

- **Pushes carry the platform's Expo access token** (`NotificationService::expo()`, `services.expo.access_token` from
  `EXPO_ACCESS_TOKEN`). The Settings field `expo_access_token` was stored and tested but never sent, so a project with
  Expo's "Enhanced push security" on would have every push refused. Empty sends as before; receipts are read the same
  way. Checked 2026-11-05 through Expo's API: push security is **off** on both projects (`@hoteltechai/hotel-loyalty`,
  `@hoteltechai/hexatech-loyalty-staff`), so nothing is to be set. Should it be switched on, set `EXPO_ACCESS_TOKEN` in
  Laravel Cloud first.
- **A tier notice goes after the commit** (`LoyaltyService::assessTier()`, `DB::afterCommit`): it waited on Expo
  inside the points write, under the member row's lock, and a write that rolled back still announced the new tier.
- **A member cancels a benefit request only while it is open**: one conditional update, so staff approving it at the
  same moment is never overwritten with "cancelled".
- **Claim and reset codes: ten wrong codes an hour per address** (`Auth\AccountRecovery::FAILURES`, in `SharedCache`,
  per purpose). The routes' limits are per IP, and a six-digit code could be guessed from many. The sign-up code's five
  attempts are counted in `SharedCache` too (the default cache is each container's own, so it was five per replica).
- Tests: `PushPlumbingTest` (`tests/Feature/LoyaltyWorkspace/`), `ClaimAccountTest`'s per-address limit.

Open, the owner's to decide (not changed):

- The CRM assistant's other writing tools (guests, enquiries, reservations, PMS bookings, review invitations) still
  follow only the route's rule, every staff member of a CRM organisation; points and settings now ask the person's own
  rights. Whether those should ask the screens' rights too is a product call.
- The venue's portal switch (`portal_enabled`, `member.only`) closes only `member/portal/*`; the members' app's
  endpoints stay open when a venue switches its portal off. One switch for both, or two, is the owner's.
- Production settings to confirm in Laravel Cloud: the scheduler runs on one instance (`loyalty:send-scheduled`,
  `loyalty:assess-tiers`), queue workers run, and `CACHE_SHARED_STORE` is unset or `database` (the limits above count
  there; a per-container store would split them).

## What the workspace does not do

No bulk message from the members list (the full admin's bulk message and segment send keep it); no SMS delivery
reports (Twilio's status callbacks); no receipts for the full admin's own push campaigns.

## Known limits

- **Deleted tiers and the full admin's own forms** (release 11): the full admin's validators (`exists:loyalty_tiers`)
  still accept a deleted tier's id from a page loaded before the delete; a member put on one that way keeps its name
  (the relation reads it `withTrashed()`) and the next tier review moves them on. The full admin's legacy segments
  (`campaign_segments`, `notification_campaigns.segment_rules`) that name a deleted tier match nobody by it; they are
  not rewritten.
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

**CI (since 2026-10-31).** `.github/workflows/ci.yml` runs every suite on PostgreSQL 18 and fails on any failure not
listed in `tests/pgsql-known-failures.txt` (`scripts/pg-known-failures.py`); its run of 2026-10-31 had 33 failures,
all in the groups below. Six of them are `LeadIntakeApiTest`, which runs only on its own database
`hexa_leadintake_test`: CI runs it there separately, where all six pass. Four are `ContactsFeedTest` (listed
2026-11-02): it builds its own tables and refuses any database but SQLite's `:memory:`, so it runs only in the SQLite
shards, where it passes. A new entry in the list needs its reason here.

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

- Overview simplification, 2026-11-06: production **3a1f51908**, source patch **972ff5c7d** from feature source and **next source-patch baseline 5cbfc823c** (`feature/overview-cleanup-20261106`), 32 allowlisted frontend/asset/documentation files on `863ad5a55`; whole source parity passed. Updated Figma OV-B1/B2: less copy, review notice first, compact facts, native design icons and cleaner request/activity rows. Artifact: **5,852 frontend tests**, **19 Overview scenarios + 73 mobile checks + 10 language/theme combinations**, TypeScript, focused lint, fresh build and **2,042 PHP passed / three scopes**. PHP/API/database source is unchanged. Live content verified **14:30 Riga**: `index-Di5Zn79H.js`, `LoyaltyApp-1qP910E1.js`, `OverviewPage-DFmfBbeG.js`, `OverviewPage-CpGm_uas.css`; new markup/CSS, authentication, fonts and landing continuity passed. Details: `loyalty-redesign/23-OVERVIEW-SIMPLIFICATION-REPORT.md` and current handoff.

- Filter alignment follow-up, 2026-11-06: production **863ad5a55**, source patch **a2ed5c6e6** from feature source and **next source-patch baseline b34f677e7** (`feature/insights-filter-alignment-20261106`), 11 allowlisted frontend/documentation paths on `de0999437`; whole source parity passed. Four aligned inline dropdowns, comparison checkbox, native popup contrast fixes and responsive wrapping; automatic selection remains. Artifact: **5,849 frontend tests**, **93 compiled interaction checks + 10 language/theme combinations**, TypeScript, focused ESLint, fresh build and **2,042 PHP passed / three recipe scopes**. PHP/API/database source is identical to the previously fully verified release. Live content verified **13:01 Europe/Riga**: `index-D07iBFyy.js`, `LoyaltyApp-BSjBMUUq.js`, `InsightsPage-CAWRoVFL.js`; new checkbox markers, authentication, fonts and landing continuity passed. Full record: `handoff/2026-11-06-hexatech-handoff.md`.

- Instant filter follow-up, 2026-11-06: production **de0999437**, source patch **4b5e63763** from feature source and next source-patch baseline **ce4cbcb35** (`feature/insights-instant-filters-20261106`), 14 allowlisted frontend/documentation paths on `aeda71eeb`; whole source parity passed. Automatic filter selections, compact date/comparison toolbar, focused member/date windows, removable chips and safe in-flight updates. Artifact: **7,407 PHP passed / 23 existing skips / 78 scopes**, **5,849 frontend tests**, **90 compiled interaction checks + 10 localized-window checks**, TypeScript, focused ESLint and fresh build. Live content verified **11:55 Europe/Riga**: `index-BFWYm4Ml.js`, `LoyaltyApp-C1yeKncq.js`, `InsightsPage-CAdBCH7k.js`; new automatic-filter markers, report authentication and public landing continuity passed. PHP/API/database contracts are unchanged. Full record: `handoff/2026-11-06-hexatech-handoff.md`.

- Insights filters, 2026-11-06: production **aeda71eeb**; final feature source and next source-patch baseline **4c13cc211** (`feature/insights-filters-current-20261106`). 22 allowlisted source/documentation/test files on `2cc80c492`, no source deletions; whole source parity passed. Isolated artifact: **7,407 PHP passed / 23 existing skips / 78 scopes**, **5,848 frontend tests**, **12 PostgreSQL report tests / 129 assertions**, **69 compiled browser checks**, TypeScript, lint, Larastan and fresh build. Windows certificate fixtures use the bundled OpenSSL configuration; the only extra source change normalizes an existing test's Windows paths. Live content verified **6 November, 10:57 Europe/Riga**: `index-BxfLTW5P.js`, `LoyaltyApp-Dr_EZecR.js`, `InsightsPage-OiBpnEOL.js`, new filter markers and report authentication. Full record: `handoff/2026-11-06-hexatech-handoff.md`.

- Security review, second batch (2026-11-04): production **70d52cbde** on **983572728**, a source patch only (the
  fresh SPA build is identical to main's). Feature source **12c536293** on `fix/pre-launch-batch-2`. 11 paths (1 added,
  10 changed), none deleted, no migration: the section's "Second batch" above, and the runbook and handoff entries.
  - **Checks:** parity, the whole source tree equal to the tip; artifact: `tsc -b`, Vitest 404 files / 5,845 tests;
    PHP 8.5.12 LoyaltyWorkspace 646 passed with the same 10 picture and file failures, Member 364, Loyalty 383,
    Auth 57, AdminAccess 78, Booking 591 passed; CI green on all 8 jobs, PostgreSQL included (run 41931008604, on
    52ca0df5a; the two commits after it are docs only).
  - Verified by content on `origin/main` (each fix's line); not on the live site.
  - **After it:** nothing (Expo push security is off on both projects, checked 2026-11-05).
  - The next source delta starts at **12c536293**.

- Security review before the public launch, and members see their points move (owner, 2026-11-04): production
  **983572728** on **a8b45e629**, source patch **66bc96753** plus its SPA build. Feature source **50abe6993** on
  `fix/cross-organisation-accounts`. 33 paths (7 added, 26 changed), none deleted, no migration.
  - **The change:** the section "Security review before the public launch (2026-11-04)" above (its first batch); the
    member portal's refresh (`docs/member-portal.md`); Symfony routing, yaml, filesystem, http-foundation and
    http-kernel 8.1.11.
  - **Checks:**
    - parity: the whole source tree, builds aside, equals the tip;
    - artifact: `tsc -b` clean, Vitest 404 files / 5,845 tests; PHP 8.5.12 (this container: no gd, zip, intl) on
      LoyaltyWorkspace 644 passed, 10 failed (the 10 picture and file tests that need gd and zip, as on main),
      Member 364, Loyalty 383, Auth 56, AdminAccess 78 passed;
    - CI on the tip green on all 8 jobs, PostgreSQL included (run 41930983814). Its first runs had found three test
      fixtures that production's schema refuses and Larastan findings; both fixed on the branch before the deploy.
  - Verified by content on `origin/main`: the new files, each fix's line, the portal chunk's `refetchInterval:6e4`
    (absent from a8b45e629's), the five Symfony versions. Not on the live site (this container cannot reach
    `app.hexa-tech.uk`).
  - **After it, once:** the repair of links made before (done by the next deploy's migration, 2026-11-05).
  - The next source delta starts at **50abe6993**.

- CRM assistant on the Anthropic SDK (stack plan follow-up, owner "do next", 2026-11-02): production **33d4f74** on
  **b67ed20**, a source patch only (the fresh SPA build is identical to main's). Feature source **1bea54f** on
  `claude/stack-audit-upgrade-plan-9hdkkv`. 7 paths (1 added, 6 changed), none deleted.
  - **The change:** `CrmAiService` (the admin AI chat and the five extractions, the website chat's lead capture among
    them) goes through `AnthropicSdk::client()`: API version 2026-10-21, the key as a bearer token, no sampling
    fields. Model, `max_tokens` and fallback texts are unchanged.
  - **Retries:** three attempts. The SDK retries the HTTP statuses; the service retries a dropped connection.
  - **Forced tool choice:** kept where the model takes it. On Fable 5.1, Mythos 5.1, Opus 5.5 and Sonnet 5.5 the tool
    is asked for in the prompt, with one more attempt.
  - No call in `app/` sends API version 2023-06-01 any more. No migration.
  - **Checks:**
    - parity: the whole source equals the tip;
    - artifact: PHP 8.5.12, **78 scopes, 7,322 passed / 16 skipped / 0 failed**; frontend **5,790 tests / 399 files**;
    - CI on the tip green (8 jobs);
    - one chat round trip over a socket against a local mock.
  - Verified by content on `origin/main`.
  - The next source delta starts at **1bea54f**.

- Level editor on phones, binding test widened (stack plan follow-ups, 2026-11-01): production **b67ed20** on
  **08027a1** (source patch **39d87b13e** plus the SPA build). Feature source **8db4787** on
  `claude/stack-audit-upgrade-plan-9hdkkv`. 5 paths (2 code, 3 records), none deleted.
  - **The fix:** the loyalty level form's first row (`.l-rd-basics-row`) uses `minmax(0,1fr)` columns. At 390px it had
    been 399px wide and the page scrolled sideways; the browser suite's "edit-level no horizontal overflow at 390"
    check had failed since before Tailwind 4.
  - **The test:** `RouteBindingTenantTest` also requires every route that binds a `TenantScope` model to have the
    organisation (a scan found 36, all fine).
  - **Checks:**
    - parity: the whole source equals the tip;
    - artifact: PHP 8.5.12, **78 scopes, 7,301 passed / 16 skipped / 0 failed**; frontend tsc, **5,790 tests / 399
      files**;
    - the CSS differs from 08027a1's only by the two rules;
    - the whole loyalty browser suite passes on a production build;
    - CI on the tip green (8 jobs).
  - Verified by content on `origin/main`.
  - The next source delta starts at **8db4787**.

- Tailwind 4 and admin model bindings (owner, 2026-11-01): production **08027a1** on **915f9c6** (source patch
  **1c2ceaed2**, the SPA build **c455efd18**, a test fix **08027a130**). Feature source **91a9631** on
  `claude/stack-audit-upgrade-plan-9hdkkv`. 286 paths (13 added, 272 changed, 1 deleted: `frontend/postcss.config.js`).
  - **The admin SPA on Tailwind 4.3** through `@tailwindcss/vite`, with Tailwind 3's look kept: the owner's decisions,
    the trial's compatibility layer, and v3's form-control font longhands (WebKit's date fields).
  - **Screenshot checks:** every route on seeded demo data, before and after, 748 screens and about 1,980 captures per
    run (`frontend/e2e/full-coverage/`).
    - Chromium: the only changes are the chatbot chips (a `/12` tint that v3 ignored) and one chart label's
      wrapping, which also varies between two v3 runs.
    - WebKit: the same, plus capture races that both builds show.
  - **Admin routes with a model parameter** (`{inquiry}`, `{pipeline}`, `{task}`…) answered 404 for the organisation's
    own rows. `bootstrap/app.php` now resolves them after `TenantMiddleware`; `RouteBindingTenantTest` pins it.
  - **One flaky test** (`NotificationServiceSendTest`'s `sent_at` to the second) now freezes the clock.
  - No migration.
  - Parity: every listed file and the whole source equal the tip.
  - Artifact: PHP 8.5.12, **78 scopes, 7,300 passed / 16 skipped / 0 failed**; frontend tsc, **5,790 tests / 399
    files**. The fresh build is byte-identical (every asset hash) to the screenshot-tested one.
  - CI on the tip green (8 jobs; the first run's only failure was that flaky test).
  - Verified by content on `origin/main`: the whole source, the deletion, and the bundle (`tailwindcss v4.3.3`, the
    date-field rule). The live host is not reachable from the cloud container.
  - The next source delta starts at **91a9631**.

- Chat widget models (owner, 2026-11-01): production **915f9c6** on **eb52525**, feature source **19a565b** on
  `claude/stack-audit-upgrade-plan-9hdkkv`. 21 paths (4 added, 17 changed, none deleted): the short current model list
  (`frontend/src/lib/aiModels.ts`: GPT-5.6 Terra / Luna / GPT-5.5, Claude Haiku 5.5 / Sonnet 5.5, Gemini 3.5
  Flash-Lite; a venue's saved model kept and still sent), Claude calls on the official SDK at API version 2026-10-21
  (`App\Services\Ai\AnthropicSdk`, `LaravelHttpTransport`), no temperature for Claude or Gemini 3, chat effort low and
  thinking off where the model allows it, the model check through Anthropic's Models API, prices for the new models.
  No migration. Parity: every listed file and the whole source equal the tip. Artifact: PHP 8.5.12, **78 scopes, 7,298
  passed / 16 skipped / 0 failed**; frontend tsc, **5,790 tests / 399 files**; the page checked in Chromium. CI on the
  tip green (8 jobs; the first run's one Larastan finding fixed in 19a565b). Verified by content on `origin/main`
  (21/21, the bundle carries the new list). The next source delta starts at **19a565b**.

- Empty permission tables dropped, PHP 8.5 everywhere (owner's decisions, 2026-11-01): production **eb52525** on
  **38b0f24**, feature source **b333c82** on `claude/stack-audit-upgrade-plan-9hdkkv`. 11 paths (2 added, 9 changed,
  none deleted): migration `2026_11_01_100000_drop_unused_permission_tables` (drops `roles`, `permissions`,
  `model_has_roles`, `model_has_permissions`, `role_has_permissions`; refuses if any holds a row; `down()` rebuilds
  them, schema identical on PostgreSQL), `composer.json` `php ^8.5` (lock: platform and hash only), CI and the test
  scripts on 8.5, CLAUDE.md naming the WAMP 8.5 build, and the hotel-tech-saas records. Parity: every listed file and
  the whole source equal the tip. Artifact: PHP 8.5.12, **78 scopes, 7,256 passed / 16 skipped / 0 failed**; frontend
  tsc, **5,780 tests / 399 files**; fresh build identical to main's. CI on the tip green (8 jobs). Verified by content
  on `origin/main` (11/11). The next source delta starts at **b333c82**.

- Permissions package removed, SPA on TypeScript 6 and lucide-react 1.66 (stack plan, after 4f; phase 5 steps 1 and
  2), 2026-10-31: production **38b0f24** (source patch **2166918** plus the SPA build) on **b7dfa6a**, feature source
  **85e80c5** on `claude/stack-audit-upgrade-plan-9hdkkv`. 12 paths (1 added, 10 changed, 1 deleted:
  `config/permission.php`): `spatie/laravel-permission` and `spatie/laravel-package-tools` removed, the `HasRoles`
  trait gone from `User`, the five permission tables kept (empty, no migration runs; their `2026_03_17` migration
  spells out the same schema, identical on PostgreSQL); TypeScript 6.0.3 and lucide-react 1.66 in the SPA (the
  Messenger panel's Facebook icon kept as an identical local icon). Parity: every listed file and the whole source
  equal the tip. Artifact: PHP 8.4.27, **77 scopes, 7,254 passed / 16 skipped / 0 failed** (the landing shell test
  re-run once the build was in place: it skips while `frontend/dist` is being rebuilt); frontend tsc, **5,780 tests /
  399 files**; fresh build committed (it differs from the screenshot-tested build only in one import's order in the
  Scan chunk). 235 screenshots before and after: no design change. CI on the tip green (11 jobs). Verified by content
  on `origin/main` (12/12, the whole source, the lock, the bundle). The next source delta starts
  at **85e80c5**.

- Permissions package and planner release fix (stack plan phase 4f), 2026-10-31: production **b7dfa6a** on
  **ebe5c4f**, feature source **e6d1a7f** on `claude/stack-audit-upgrade-plan-9hdkkv`. 11 paths (1 added, 10 changed,
  no deletions): `spatie/laravel-permission` 8.3.2 (no migration, no table change; rehearsed on PostgreSQL), the
  planner's `releaseTask` asks the staff role for managers (it asked Spatie's `hasRole()`, always false here), Larastan
  baseline 2,182 → 2,028. Parity: every listed file and the whole source equal the tip. Artifact: PHP 8.4.27, **77
  scopes, 7,254 passed / 16 skipped / 0 failed**; frontend tsc, **5,778 tests / 399 files**; fresh build identical to
  main's bundle. CI on the tip green (11 jobs). Verified by content on `origin/main` (11/11). The next source delta
  starts at **e6d1a7f**.

- Library upgrades (stack plan phase 4a-4e), 2026-10-31: production **ebe5c4f** on **c46e8da**, feature source
  **379ff18** on `claude/stack-audit-upgrade-plan-9hdkkv`. 21 paths changed, none added or deleted: PHPUnit 13 (dev),
  `anthropic-ai/sdk` 1.3 (Content Planner on API `2026-10-21`), `openai-php` 0.21, `laravel/mcp` 1.1 (MCP `2026-07-28`
  plus the older handshake; `PluginCors` allows `Mcp-Method`/`Mcp-Name`), `endroid/qr-code` 6 (`QrCodeService` on the v6
  builder, same codes), CI on PHP 8.5 for PostgreSQL and Larastan. No migration. Parity: every listed file and the
  whole source equal the tip. Artifact: PHP 8.4.27, **77 scopes, 7,251 passed / 16 skipped / 0 failed**; frontend tsc,
  **5,778 tests / 399 files**; fresh build identical to main's bundle. CI on the same application source green (one
  PostgreSQL failure on a first attempt, `MembersTest` newest first, passed on re-run and locally). Verified by
  content on `origin/main` (21/21). Worth a real ChatGPT connection test (MCP library major). The next source delta
  starts at **379ff18**.

- Stack upgrade phases 0 and 1, 2026-10-31: production **c46e8da** on **48b12f0**, feature source **a8a573f** on
  `claude/stack-audit-upgrade-plan-9hdkkv` (plan `docs/audits/2026-10-31-stack-audit-and-upgrade-plan.md`). 29 paths
  (10 added, 19 changed, no deletions): CI (`.github/workflows/ci.yml`, never deploys), Larastan/Rector (dev only),
  test scripts, root build tools (Vite 8) and SPA ESLint 10, `phpunit.xml` pins `APP_URL`; production code:
  `media:verify-version --version-id` (it could not start before) and no `dall-e-3` image fallback. No migration, no
  production package change. Parity: every listed file and the whole source equal the tip. Artifact: PHP 8.4.27,
  **77 scopes, 7,249 passed / 16 skipped / 0 failed**; frontend tsc, lint baseline, **5,778 tests / 399 files**,
  fresh build (identical to a build of main's own source). CI run 3 on the tip green (11 jobs). Verified by content on
  `origin/main` (29/29); no live check (the production host is not reachable from the cloud container). The next
  source delta starts at **a8a573f**.

- Members' app server part, 2026-10-31: production **4c59696c2** on **54d61cd8c**, feature source **4a1494c62** on
  `feature/loyalty-member-app`. 18 paths (4 added, 14 changed, no deletions); `apps/loyalty-member` stays on the branch
  (EAS, not Cloud). `DELETE /v1/auth/push-token` (a member's phone forgets its own push token at sign-out),
  `member` in `config/apps.php` (Laravel Cloud variables `MEMBER_APP_MIN_VERSION`, `MEMBER_APP_LATEST_VERSION`,
  `MEMBER_APP_IOS_URL`, `MEMBER_APP_ANDROID_URL`; defaults 2.0.0 and the existing store pages), the portal's event,
  stamp and credit types and industry nouns moved into framework-free files (no behaviour change), docs. No migration.
  Parity: every listed file and the whole source outside the apps equal the tip. Artifact: PHP **77 scopes, 7,245
  passed / 16 skipped / 0 failed**; frontend tsc, **5,768 tests / 399 files**, fresh build committed. Verified by
  content on `origin/main` (18/18); no live check (the production host is not reachable from the cloud container).

- Native apps' minimum version, 2026-10-31: production **54d61cd8c** on **a199f1f8c**, feature source **bb56e5355** on
  `feature/loyalty-staff-app`. 8 paths (3 added, 5 changed): public `GET /api/v1/apps/{app}/version`
  (`AppVersionController`, `config/apps.php`, Laravel Cloud variables `STAFF_APP_MIN_VERSION`,
  `STAFF_APP_LATEST_VERSION`, `STAFF_APP_IOS_URL`, `STAFF_APP_ANDROID_URL`), its test and docs. No migration. Parity:
  every listed file and the whole source outside the app equal the tip. Artifact: PHP **77 scopes, 7,240 passed / 16
  skipped / 0 failed**; frontend tsc, **5,766 tests / 399 files**, build. Verified by content on `origin/main` (8/8);
  no live check (the production host is not reachable from the cloud container). The next source delta starts at
  **bb56e5355** (the app folder excepted; the members' app plan of 9719cddf1 is documentation only).

- Request alerts on staff phones, 2026-10-31: production **a199f1f8c** on **f0c30c739**, feature source **91f0d1e72**
  on `feature/loyalty-staff-app`. 22 paths (13 added, 9 changed, no deletions); the app `apps/loyalty-staff` stays on
  the branch (EAS, not Cloud). Migration `2026_10_31_120000_create_staff_devices` (new table only; up, down, up on
  PostgreSQL). It also made three tests that were red on main green: `operations-status` got its own throttle bucket,
  `config/landing.php` reserves `downloads` (`public/downloads`), and `AiUsageLogFactory::lastMonth()` no longer
  overflows on the 29th to 31st. Parity: every listed file and the whole source outside the app equal the tip.
  Artifact: PHP **76 scopes, 7,233 passed / 16 skipped** plus the three fixed scopes green again (38, 11, 184), Landing
  1,735 + 118 again; frontend tsc, **5,766 tests / 399 files**, build. Verified by content on `origin/main` (22/22
  files equal the tip); the production host is not reachable from the cloud container, so no live check was made.
  The next source delta starts at **91f0d1e72** (the app folder excepted).

- Guided setup and Settings, 2026-10-29: production **ce1f55e0f**, deployed source and next source-patch baseline
  **43382945207c44ae6a6ce952272121e32e6a1d10**, feature `feature/loyalty-settings-setup-20261029`. Isolated parent
  **8f7c18159**, final source patch **56c9049de**, whole-source parity across 152 allowed paths. Final artifact:
  **5,717 frontend tests / 394 files**, **69 PHP tests / 719 assertions**, TypeScript, ESLint and build passed.
  Compiled Chrome: **79 setup/settings checks + 60 style-audit views**, no runtime errors. Live content verified
  **29 October, 11:03 Europe/Riga**: `index-CKJuCZ7B.js`, `LoyaltyApp-DVccFo2K.js` / `LoyaltyApp-CTQS2Qab.css`,
  new/existing markers, three fonts, currency/options/start authentication, landing kit and retired CSS 404.
  See `loyalty-redesign/21-SETTINGS-SETUP-REPORT.md`. Later documentation commits are not the source baseline.

- Card & app, 2026-10-28: production **5eaffd69c**, feature source **f594c16d3** on
  `feature/loyalty-card-app-20261028`. Final source patch **711deccf4** was applied to **f5edeb363**;
  whole-source parity passed across 53 explicit paths. Backend **7,085 passed / 7 skipped / 45,393 assertions /
  75 scopes**, frontend **5,668 passed / 392 files**, final focused **344 passed**. TypeScript, Loyalty ESLint,
  fresh build and **90 compiled-browser checks** passed. Live content verified **28 October, 18:01 Europe/Riga**:
  entry `index-CYWy-VPW.js`, Loyalty `LoyaltyApp-li05agYL.js` / `LoyaltyApp-CN3NTzf2.css`, three fonts,
  appearance/wallet/currency authentication (401), public landing kit and retired stylesheet (404).
  The next source delta starts at **f594c16d366db189c397b7180ec01db2014ff301**, not post-deployment docs.

- Events, 2026-10-28: production **ab5f25bdd**, feature source **27baa2935** on
  `feature/loyalty-events-20261028`. Final source patch **6ba19561a** was applied to **56ddb2d2b**;
  whole source parity passed across 49 explicit paths. Three connected Figma frames cover the overview,
  full create/edit page and attendees. Existing scanner, door mode, signup and lifecycle actions remain.
  Tenant-scoped read filters and historical attendance reward display extend existing APIs; writers,
  permissions, notifications and idempotency remain unchanged. No migrations or dependencies changed.
  Artifact checks: PHP **7,074 passed / 7 skipped / 45,264 assertions / 75 scopes**, frontend **5,619 passed / 389 files**,
  TypeScript/ESLint/build passed, **83 compiled-browser checks passed**, zero runtime errors. All three views
  fit 1440/1280/1024/768/390/320px; light mode, five languages, permissions, retries and workflow actions passed.
  Compiled renders were visually compared with exact Figma references; 18 SVG exports matched local hashes.
  Live content verified **28 October, 14:26 Europe/Riga**: entry `index-DPUoSWOd.js`, Loyalty
  `LoyaltyApp-4CAHf0Ws.js` / `LoyaltyApp-DH-yoI5b.css`, three fonts, Events authentication (401),
  public landing kit and retired stylesheet (404). The next source delta starts at **27baa2935**.
  Full report: `docs/loyalty-redesign/14-EVENTS-REPORT.md`.

- Rewards & benefits, 2026-10-28: production **56ddb2d2b**, feature source **b7e5e3a5a** on
  `feature/loyalty-rewards-benefits-20261028`. Final source patch **1860ce52a** was applied to **1fcdcbb6b**;
  whole source parity passed across 70 explicit source/evidence paths. Four connected Figma frames cover
  Points rewards, Edit reward, Offers and Membership benefits. Existing activity/Program routes and data
  contracts remain. No backend, migration or dependency changes.
  Artifact checks: PHP **7,071 passed / 7 skipped / 45,224 assertions / 75 scopes**, frontend **5,606 passed / 388 files**,
  TypeScript/ESLint/build passed, **82 compiled-browser checks passed**. All four views fit 1440/1024/768/390/320px;
  light mode, all five languages, permissions, CRUD, retry and per-level assignments were verified.
  Live content verified **28 October, 13:12 Europe/Riga**: entry `index-DKsE4bbC.js`, Loyalty
  `LoyaltyApp-EEnCshva.js` / `LoyaltyApp-qoyibfIz.css`, three local fonts, authenticated APIs (401),
  public landing kit and retired stylesheet (404). The next source delta starts at **b7e5e3a5a**.
  Full report: `docs/loyalty-redesign/13-REWARDS-BENEFITS-REPORT.md`.

- Ways to earn, 2026-10-28: production **1fcdcbb6b**, feature source **d45a44be1** on
  `feature/loyalty-ways-to-earn-20261028`. Source patch **8e3157d39** plus **9ac7dca0a** was applied to
  **0f59ddab1** using 58 explicit paths; whole source parity passed. Three final Figma frames cover the earning
  list, purchase settings and bonuses, with shared rules, all existing methods and the existing partial options API.
  Checks/journey remains `?tab=overview`; the wizard and method bookmarks remain available.
  Artifact checks: PHP **7,071 passed / 7 skipped / 45,224 assertions / 75 scopes**, frontend **5,588 passed / 387 files**,
  TypeScript/ESLint/build passed, **71 compiled-browser checks passed**. Desktop/mobile, light/Russian, permissions,
  retry, partial saves and independent drafts were verified. Live content verified **28 October, 11:33 Europe/Riga**:
  entry `index-BtSDK41H.js`, Loyalty `LoyaltyApp-CCG_p63r.js` / `LoyaltyApp-COCRVuhl.css`, three local fonts,
  options authentication (401), landing kit and retired stylesheet (404) checks passed.
  The next source delta starts at **d45a44be1**. Later feature commits contain deployment records/evidence and
  the CLAUDE.md handoff pointer. Full report: `docs/loyalty-redesign/12-WAYS-TO-EARN-REPORT.md`.

- Members and Program, 2026-10-27: production **0f59ddab1**, source-patch **9bead854f**, feature source
  **2d6e03d81** on `feature/loyalty-members-program-20261027`. Six completed Figma frames cover Members, profile,
  Award points, Levels, Edit level and Add benefit. Existing routes/actions remain; no migrations, dependencies,
  financial writers or authorization changes. The directory accepts bounded `per_page=10|25|50` (old default 50),
  history accepts a whitelisted optional `type` before pagination, and member benefits include existing scope and
  fulfillment metadata. Benefit assignments save separately without resetting the level draft.
  All 81 explicit source paths matched. The isolated artifact passed 75 PHP scopes (**7071 passed, 7 existing
  skips, 45224 assertions**), all **5553 frontend tests**, TypeScript/lint/build, and **50 browser assertions**
  against compiled assets. The extra scope is the existing 18-test Concerns suite omitted by the old loop; two
  Members tests are new. Six desktop screens were compared with Figma; responsive, light/Russian, permissions,
  error/retry and transactional UI flows were checked locally. Cloud content, all three font payloads, API
  authentication and landing kit/retired-file checks passed at **21:51 Europe/Riga**.
  Evidence: `docs/loyalty-redesign/11-MEMBERS-PROGRAM-REPORT.md`. The **next** source change list starts at
  **2d6e03d81**: `git diff --name-status --no-renames 2d6e03d81 <tip>`. Post-deployment records follow on the
  feature branch; do not push its built assets or merge it directly to `main`.

- Overview milestone, 2026-10-27, is live (`main` **4c13e2d1f**, source-patch **89846e822**, feature source
  **5706903b1** on `feature/loyalty-overview-20261027`). New `/loyalty/overview`, approved Figma desktop/mobile,
  scoped read-only summaries/checks/metrics/queues/activity, exact request links and all five locales; `/loyalty`
  stays Members. Explicit change list: 118 added/modified paths and one deletion (the Windows helper rename), no
  migrations. On the isolated deploy tree: PHP **7051 passed, 7 expected skips** across 74 scopes; frontend **5538
  passed**, TypeScript/lint/build clean; six browser checks against the compiled assets passed in addition to the
  implementation's 20 scenarios. Source parity includes deletions; vendor was copied, not junctioned. Live Cloud
  content and three font payloads verified, new API route returns the expected 401, landing kit/retired stylesheet
  checks passed. See `docs/loyalty-redesign/10-IMPLEMENTATION-REPORT.md` and its evidence. Its source baseline was
  **5706903b1**, superseded by the Members/Program release above. Release-record docs are pushed on the working
  branch afterward.

- Since 2026-10-26 a finished job is deployed without asking (the owner's standing word, `CLAUDE.md` "Git and
  deploy"); the recipe's checks still decide.
- Release 11, rename and delete, is live (`main` b2cecde, pushed 2026-10-26: Rename and Delete on each tier and
  benefit, the delete's preview, `TierRemoval`, `BenefitRemoval`, `TierHolders`, soft deletes and the migration
  `2026_10_26_120000_tiers_and_benefits_can_be_deleted`), built from branch commit 535e3ba: the next release's change
  list is `git diff --name-status 535e3ba <tip>`. 55 source files and docs (8 new), no deletions, one migration; on
  the deploy tree PHP 7040 passed, 7 skipped, the frontend 5519 passed, tsc clean; the new tests and the migration
  (up, down, up) also pass on PostgreSQL, whose other failures are the listed ones; in a browser a rename, a refused
  rename, a delete with nobody on the tier and one moving four members were done on the local data; checked by
  content (every source file on `main` equal to the branch, the services and the partial index in the source, the
  dialogs' words and the Guide question in the built SPA).
- Release 10b, the guidance, is live (`main` e3c7f0b, pushed 2026-10-26: Start here behind `GET start` from
  `SetupProgress`, the Members card, Program's checks from `TierAdvice`, the tier form's earn-rate figures and "What
  members see", the boost multiplier in figures), built from branch commit 5eedb5a: the next release's change list is
  `git diff --name-status 5eedb5a <tip>`. 48 source files and docs (16 new), no deletions, no migration; on the deploy
  tree PHP 7032 passed, 7 skipped, the frontend 5511 passed, tsc clean; the new server tests also pass on PostgreSQL;
  checked by content (every source file on `main` equal to the branch, `TierAdvice`, `SetupProgress` and the
  `admin/loyalty/start` map key in the source, the Start and check words in the built SPA).
- Release 10a, the frame from the owner's Figma, is live (`main` d5b3ccb, pushed 2026-10-26: Loyalty's palette, the
  colour families with their fills, section cards on five pages, Program in sections, Get started panels, figure
  tiles), built from branch commit 7cc2a0b: the next release's change list is `git diff --name-status 7cc2a0b <tip>`.
  106 source files and docs, no deletions, no migration, no server code; on the deploy tree PHP 7022 passed, 7 skipped,
  the frontend 5496 passed, tsc clean; checked by content (every source file on `main` equal to the branch,
  `LOYALTY_SURFACES` in the source, the panels' and cards' words and the navy in the built SPA).
- Ways to earn's Overview went out as `main` d905343 (the status line, each check's one-press fix,
  the members' journey with its map and timeline, the no-`#…`-link rule), built from branch commit 80ff815.
  18 source files, no deletions, no migration; on the
  deploy tree PHP 7022 passed, 7 skipped, the frontend 5474 passed, tsc clean; the options and checks tests also pass
  on PostgreSQL; in a browser a real check's Fix saved its one option and the check went, and a map step scrolled
  without leaving the page; checked by content (every source file on `main` equal to the branch, the fix constants and
  the hash-link rule in the source, the journey and fix words in the built SPA).
- Ways to earn's tabs and checks went out as `main` a6c06e8 (ProgrammeAdvice, the earn rate card,
  Overview / Earn points / Bonuses / Rules, Turn on from the industry's preset), built from branch commit aabd384.
  28 source files, no deletions, no migration;
  on the deploy tree PHP 7020 passed, 7 skipped, the frontend 5467 passed, tsc clean (its first run caught a raw-accent
  ring the workspace's line rule refuses — fixed in aabd384 before the build); the options and checks tests also pass
  on PostgreSQL; checked by content (every source file on `main` equal to the branch, `earn_rate` in ProgrammeOptions,
  the Overview's words in the built SPA).
- The Ways to earn and Rewards design pass went out as `main` d827fcb (colour families, sections, Change, tab counts,
  catalogue filter and cards), built from branch commit 410fec7. 29 source files, no deletions, no migration; on the deploy tree PHP 7013
  passed, 7 skipped, the frontend 5464 passed, tsc clean; checked by content (every source file on `main` equal to the
  branch, the colour classes and the new words in the built SPA).
- The member portal's Help went out as `main` acced03 (`/portal/help`, `docs/member-portal.md`), built from branch
  commit fa7e83e. 16 source
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

### After the release 11 deploy (owner, signed in)

- On Program → Tiers, open Delete on a tier and read what it says (nothing changes until Delete is pressed); press Keep
  it. Rename a benefit and rename it back.
- The migration ran (`2026_10_26_120000_tiers_and_benefits_can_be_deleted`): adding a tier with a name another tier has
  is refused in words, not with an error page.

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

## Administration UX pass — 10 November 2026

The eight management screens follow Figma page353:8135, with original local SVGs and a common list/detail layout.
Asset provenance, hashes, intrinsic dimensions and consumers are in `docs/loyalty-redesign/28-ADMIN-UX-ASSETS.json`.
These screens keep the same tenant-scoped APIs, saved records and permissions. No payment setup or new migration.

- Program: **Levels & tiers**, **Places & access**. Qualification is in Levels; **Guided setup** and **Readiness checks**
  are actions there. Setup's canonical address is `/loyalty/program/setup`.
- Ways to earn: **Earning rules**, **Bonuses & boosts**. **Points settings** in Earning rules owns expiry. The purchase
  rate is still `points_per_currency`; booking and desk switches are independent. An unavailable/off trigger's example
  gives zero while showing its configured inherited rate.
- Rewards & benefits: **Points rewards**, **Tier perks**, **Offers**. Redemptions is linked from Points rewards;
  referral activity from Bonuses & boosts. Existing activity routes stay valid.

`management/navigation.ts` resolves old rules/rule, expiry, qualification, benefits, boosts, readiness and setup links.
Selection IDs and applicable filters survive. Direct record editors keep their canonical writers and deletion guards.
Unknown server ways remain available under advanced More. Do not recreate a benefit catalogue in Program.

`TierAdvice` adds `tiers_missing_threshold`: on the programme's measure, later active non-invitation tiers with a null
floor are named; the first active non-invitation entry tier is excluded. Existing duplicate floors and unused benefits
remain canonical server advice. Correction links open the named tier or perk. Perks assigned only to inactive tiers
still need an active tier; the page uses the server advice and previews the explicitly selected assignment's own value.

`TierAssignmentEditor` is shared by Levels, the tier editor and Tier perks. It composes `TierBenefitDialog` and `TakeOff`.
Cancelling removal retains the mounted form's unsaved values. Assignment defaults to a real option even when all tiers
are off. Deletion, detach, points, options, offers and redemption writers have not been duplicated.

Promotion math is unchanged: highest eligible timed boost or claimed offer once, with existing independent tier rate
and standing tier multiplier. Milestones, automatic schedules and member-claimed offers are separate presentations.
Offer counts use the returned venue-day state; a reached usage cap is displayed separately. Setup's reward example
reads the actual redeemable catalogue and effective draft, without inventing a reward cost or enabled booking source.

Places show the real tier access rules and today's granted/refused entries; no entrance/hour model is implied.
Supported secure Web NFC is preferred and still needs a user press. QR and member lookup are visible fallbacks with
the place preserved. General NFC keeps NDEF member-record precedence and namespaces the serial fallback as HTCARD.
The partner scanner's explicit physical-card behavior remains as documented in `loyalty-memberships-and-partners.md`.
Physical NFC/camera acceptance still requires devices; this release does not configure Wallet issuers or push providers.

Local acceptance: `frontend/e2e/loyalty-admin-ux.mjs` and `loyalty-admin-ux-regression.mjs`, using the isolated launch
environment in `frontend/e2e/LAUNCH-REHEARSAL.md`. A frozen rehearsal clock also freezes limiter time, so the full
screenshot runner clears only its disposable demo's cache counters between batches. Production throttles are unchanged.
