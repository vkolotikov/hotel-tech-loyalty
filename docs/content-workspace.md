# HexaTech Content — runbook

HexaTech Content (`/content`) is the AI Content Planner as its own workspace beside the full admin, a sibling of
HexaTech Appointments. Spec: `docs/superpowers/specs/2026-10-14-content-workspace-design.md`. This page covers the
server, the portal, the way in from the full admin and what release 2 retired.

## Who has it, and switching it

- Every organisation has it by default (`Organization::WORKSPACE_DEFAULTS`). Organisations on the Appointments plan
  do not: it is not part of that plan, and the access map refuses them (`not_in_plan`).
- `php artisan workspace:content <org> --on [--landing] | --off | --status`, and `--list` for the organisations that
  differ from the default.
- An organisation lands in one workspace only: `--landing` here takes the landing from Appointments, and the other
  way round.
- Sign-in (`user.workspaces.content`) and `/auth/me` (`workspaces.content`) carry `{landing}` for staff.
- **The way in:** the full admin's menu shows **HexaTech Content** first in "CRM & Marketing" to staff of every
  organisation that has it (`showsWorkspaceLink(user, 'content')`, from the `/v1/auth/me` refresh), and the Marketing
  hub's tile opens `/content`. An old `/marketing?tab=content-planner` link lands on `/content`. An organisation that
  chose Content (`workspace:content <org> --on --landing`) lands there after sign-in when no other page was asked for.
  A sign-in that runs out on a Content page comes back to it.
- **The way back:** "Full admin" in the portal opens `/marketing` for managers and `/` for staff (the Marketing hub is
  manager-only).

## The API

All under `/api/v1/admin/content/`, behind the admin chain, `workspace:content` and `content.brand`.

- `content.brand` pins every call to exactly one brand: the one named in `?brand_id=` when the person may use it,
  otherwise their default brand. `brand_id` is read from the query string only. A restricted member asking for
  another brand gets 403 from the shared `brand` middleware: `error` and `message` keep the sentence every admin
  screen shows, and `code` is `brand_not_allowed`, so the portal can drop a stored brand and ask again without one.
- Refusals are `{error, message}`. The codes are `no_brand`, `no_profile`, `manager_only`, `not_found`,
  `ai_budget_used_up`, `already_generating`, `changed_elsewhere`, `published_cannot_move`, `slot_not_open`,
  `no_channels`, `range_in_past`, `ai_failed`, `audience_in_use`, `already_set_up`, `not_ready`,
  `generation_failed`, `already_repeating`, `no_day`, `too_many_snippets`, from release 4b `needs_approval`,
  `approvals_off`, `wrong_status` and `not_yours`, from release 5a `version_exists`, from release 5b `bad_link`,
  `bio_name_invalid`, `bio_name_taken` and `too_many_buttons`, and from release 6 `bad_address`, `already_scanning`,
  `too_many_scans`, `scan_running`, `scan_failed`, `robots_unreachable`, `already_promoting`, `period_too_short`, `too_many_posts`,
  `page_not_found` and `promotion_failed`.
- Generate never writes days already gone on the venue's clock; a range wholly in the past answers `range_in_past`.
  Making a strategy active switches the active pillars to its own; archiving the active one retires them.

| Area | Endpoints | Who |
|---|---|---|
| Bootstrap | `GET bootstrap` | everyone |
| Plan | `GET plan?from&to` (≤ 62 days) | everyone |
| Posts | `GET posts`, `GET find`, `POST posts`, `GET/PUT/DELETE posts/{id}`, `POST posts/{id}/move`, `/duplicate`, `/mark-ready`, `/mark-published` | everyone |
| AI on a post | `POST posts/{id}/write`, `/rewrite`, `/quality`, `/visual-brief`, `/image`, `POST slots/fill` | everyone |
| Queued AI | `POST work`, `GET work/{id}`, `GET work?post_id=`, `DELETE work/{id}` | read/start: everyone; cancel: requester or manager |
| Generate | `POST generate` (202 while the queued run writes) | managers |
| How the Generate run stands | `GET generate` | everyone |
| Cancel Generate | `DELETE generate` | requester or manager |
| Strategy | `GET strategies`, `GET strategies/{id}` (everyone); `POST strategies`, `/activate`, `/archive` (managers) | |
| Brand | `GET brand` (everyone); `PUT brand/profile`, `PUT brand/voice`, audiences and channels `POST/PUT/DELETE`, `POST brand/quick-setup`, `POST brand/setup`, `POST brand/refresh-knowledge` (managers) | |
| Goals | `GET goals` (this week per platform, the streak) | everyone |
| Repeat | `POST posts/{id}/repeat`, `DELETE posts/{id}/repeat` | everyone |
| Snippets | `brand/snippets` `POST`, `PUT/DELETE brand/snippets/{id}`, `POST brand/snippets/suggest` (AI) | managers (everyone reads them in `GET brand`) |
| Approvals | `POST posts/{id}/send-for-approval` (everyone); `POST posts/{id}/approve` (with the `updated_at` read), `POST posts/{id}/send-back` (`note`) (managers); only while the brand's switch (`requires_approval`) is on | |
| Comments | `POST posts/{id}/comments`; `PUT comments/{id}` (your own); `DELETE comments/{id}` (your own, or any as a manager) | everyone |
| For you | `GET inbox`, `GET inbox/count`, `POST inbox/seen` (`at`: the list's `read_at`) | everyone |
| Versions | `POST posts/{id}/versions` (`platforms`, `ai`), `DELETE posts/{id}/group` | everyone |
| Team | `GET team` (the brand's active staff: names and roles); `poster_id` on `POST posts`, `PUT posts/{id}`, `POST posts/{id}/move` | everyone |
| Morning email | `PUT me/morning-email` (`on`); also `wants_content_morning_email` in `PUT admin/me/preferences` | each person, for themselves |
| Links | `link` (an address or null) on `POST posts` and `PUT posts/{id}`; `GET posts/{id}` carries `link`, cards carry `clicks` | everyone |
| Link-in-bio | `GET bio`; `PUT bio` (`is_on`, `slug`, `title`, `line`, `show_posts`, `buttons: [{id?, label, destination}]`) | read: everyone; save: owners and managers |
| Public host | `GET /go/{code}` (302; `?via=bio`), `GET /links/{name}` | visitors |
| Website | `GET site` (the site, its pages with their numbers, the suggested address); `PUT site` (`url`, `summary`), `POST site/scan` (`url?`, `update_summary?`; 202 while the queued scan reads), `DELETE site/pages/{id}/posts` (remove draft posts) | read: everyone; the rest: managers |
| Promotions | `POST promotions/preview`, `POST promotions` (`page_ids`, `posts_per_page`, `platforms`, `from`, `to`, `per_week`, `use_picture?`, `instructions?`; 202 while queued), `DELETE promotions/current` (stop) (managers); `GET promotions/current` (everyone); `GET posts/{id}` carries `promotes` | |

## Rules the code keeps (and the tests that keep them)

- **Brands never mix.** Every list and read stays inside the pinned brand, and every id a request names must belong
  to this organisation and that brand (`PostRulesTest`, `BrandTest`).
- **Stale saves are refused.** A save or move must send back the `updated_at` it read; a newer one answers 409
  `changed_elsewhere` with the post as it is now. `updated_at` stays the ISO revision token with six fractional
  digits; meaningful writes advance at least one microsecond even if the clock stands still or moves backwards.
  Group/series bookkeeping, quality checks and comments keep their existing no-version semantics (`ReliableWritesTest`).
  Mark ready and Mark published also require the complete `updated_at` actually viewed by the caller (missing:
  422 validation; changed: 409 `changed_elsewhere` with the current post). They compare under the same post lock
  before status, publication metadata or approval history changes. An assigned staff poster still has the existing
  permission to publish an Approved/Ready post, with that revision. Clients must not fetch a new unseen revision
  immediately before marking it.
- **AI results commit against the post they read.** Provider calls hold no post transaction. Write, Rewrite, Quality,
  Brief, Image and queued version/repeat results lock and compare the captured revision before committing; a newer
  edit, publication, platform change or deletion wins. Words, brief and approval history commit together. Images and
  briefs invalidate staff approval just as words do. Old and new image failures expose only safe local errors.
- **Published is one transition.** Create, Save and Mark published stamp `published_at`; repeated marking keeps it,
  and leaving Published clears publication metadata. The launch migration repairs legacy Published rows without a
  timestamp from their saved planning day/time in the venue zone (midnight without a time), otherwise their saved
  `updated_at` (or `created_at` when unavailable), leaving every known timestamp unchanged (`ReliableWritesTest`).
- **A published post keeps its date.**
- **Reads write nothing.** Reading the brand never saves its readiness; a change does (`BrandTest`).
- **Brand edits happen in place.** Audiences, channels and the voice keep their ids. Removing an audience that posts
  use needs `?confirm=1` (`BrandTest`).
- **AI spend counts.** Every planner text call and image lands in `ai_usage_logs` as feature `content`; images are
  priced from current token usage or a conservative estimate (`AiUsageService::imageCost`). At 100 % of the monthly cap every AI action answers 403
  before calling the provider (`AiLedgerTest`, `AiGateTest`).
- **One generation at a time per brand.** It is a cache lock of 300 s; a strategy counts as running for 15 minutes
  at most (`GenerateTest`, `StrategyTest`).
- **Open slots** are each active channel's ticked weekdays, from the venue's today on, without a non-archived post on
  that day and platform (`ContentSlotsTest`, `PlanTest`).
- **Quick setup cuts AI strings** to their PostgreSQL columns (`ContentBrandEditor::*_LIMITS`).
- **One strategy and one quick setup at a time per brand.** Starting a strategy holds the cache lock
  `content:strategy:{org}:{brand}` for its check and placeholder (10 s); a quick setup holds
  `content:quick-setup:{org}:{brand}` for its AI call (600 s). Like the calendar's lock, these need a cache store every
  server shares (database or redis — not `file` on several servers).
- **AI failures are said in our words.** An `ai_failed` answer never carries the provider's text; it is in the log
  (`report()`).
- **Spend needs a price.** Content refuses an unsupported/unpriced text or image model locally with
  `ai_model_unpriced` before any paid call, including missing-image-brief prerequisites and repair/fallback attempts.
- **A time needs a day.** A post with no day stores no time, however it was saved (`PostsTest`).
- **Search words are literal.** `%`, `_` and `\` in Find and Posts search match themselves (`PostsTest`).
- **A channel's usual time** (`post_time`, `HH:MM`) is what Generate and Fill give a post the AI left without a time;
  empty means the first suggested time for its platform and the organisation's industry (`BestTimes`, the same table
  as `frontend/src/content/lib/bestTimes.json`; `BestTimesTest`).
- **Snippets:** at most 50 hashtag groups and 50 text snippets per brand; suggestions are one AI call and save nothing
  (`SnippetsTest`).
- **Goals** count only posts marked published, in the venue's week (Monday–Sunday); targets are the channels'
  `posts_per_week` as they are now, summed per platform; "planned" leaves published, archived and skipped posts out;
  the streak looks back 52 weeks, no further than the week the oldest channel with a target was added (target history
  is not kept); "at risk" from Friday 00:00 on the venue's clock (`GoalsTest`).
- **Repeat posts:** up to 26 copies within 12 months of the post's day, from today on; the AI rewords at most 12, one
  call each, stops at the budget cap and never rewrites a copy a person changed (also not one saved while the AI wrote);
  Stop repeating removes the unpublished copies from today on, and the post's `series.removable` is that count
  (`RepeatTest`). The rewording runs on the queue (`RewriteRepeatCopies`), one copy per run (80 s timeout, under the
  queue connections' `retry_after` of 90 s), each run handing the rest to the next.
- **The strategy job** counts its AI use for its brand and stores a fixed sentence when it fails (`StrategyTest`).
- **Approvals** (release 4b; per brand, default off; `ContentApproval`): while on, staff cannot set Approved, Ready or
  Published by any write — save, new post, Mark ready, Mark published — and get 403 `needs_approval` with nothing of
  the save kept; a staff change to the words (topic, hook, text, call to action, hashtags, platform) of an approved or
  ready post sends it back to review, moving its day or time does not; repeat copies the AI rewords wait for approval;
  Approve refuses a post changed since the manager read it (`changed_elsewhere`). Write with AI or a new image that
  puts a staff member's post into review records the step too, and a manager taking a post from review to Approved,
  Ready or Published by any way records `approved`. Every step is a row in `content_planner_post_events`
  (`ApprovalRuleTest`, `ApprovalActionsTest`). Events capture the post's exact revision in internal `post_updated_at`
  for "Sent back"; event `created_at` remains the wall clock for the bell. Legacy events fall back to `created_at`.
  "Written by" shows only for posts a person wrote here
  (`generated_by` `manual`): calendar posts and repeat copies show none (`PostReviewTest`).
- **Comments** are plain text of 1–2,000 characters and do not touch their post (no stale saves, "sent back" stays);
  a post's timeline is its comments and approval steps, the newest 200, oldest first; a removed member's comments and
  steps stay with no name (`CommentsTest`, `PostReviewTest`).
- **The bell** is per brand: the posts waiting for approval (managers, while the switch is on; they stay until acted
  on), then the news since `seen_at` in `content_planner_reads` — approved and sent back on your posts, comments by
  others on posts you wrote or commented on (after your own first comment) — at most 30 days old, the newest 50.
  "Seen" takes the list's `read_at`, so news that came in while the list was open stays new (`InboxTest`).
- **Versions** (release 5a; `ContentVersions`): `group_id` holds the original's id. A version is a draft on the
  original's day and time with its words, poster and its own copy of the visual brief (the same picture file: Content
  never deletes pictures); one per platform in a group (`version_exists`); joining or leaving a group never changes a
  post's `updated_at`; a group of one is not shown. With `ai`, the budget is checked before anything is made, then
  `AdaptPostVersions` adapts one version per run with the platform's rules (`ContentPlatformRules`, shared with the
  post writer); at the cap or on an AI failure the rest keep the original's words and the panel says so
  (`kept_original`, `kept_reason`); a version a person changed keeps their words (`VersionsTest`, `VersionsAdaptTest`).
- **Who posts it** (`ContentTeam`): a member of the brand's team — active staff with no brand rows or a row for the
  brand. Someone who left or was switched off counts as nobody (the panel shows nobody; their post still saves with
  them sent again). It is not a change of words. While approvals are on, the post's own poster may Mark published an
  Approved or Ready post; every other staff case is refused as before (`PosterTest`).
- **Reminders** (`ContentReminders`): in the bell, "to post today" from the day's start or the post's time (venue
  clock) and "not marked as posted" for the seven days after, for the poster — or, when nobody on the team posts it,
  the brand's managers — until the post is published, skipped, archived or moved; they count while they last
  (`RemindersTest`).
- **The morning email** (`content:send-morning-email`, hourly): opted-in staff with an email and an active staff row,
  in organisations with Content (not switched off, not Appointments-only), at 8 am venue time, once a venue day, only
  when they have posts today or posts not marked as posted; words in the person's language from
  `lang/*/content_morning.php`, links open the post on its brand (`?brand_id=`) (`MorningEmailTest`).
- **Tracked links** (release 5b; `ContentLinks`, `ContentLinkClicks`): a post's Link becomes a short link on the public
  host, `/go/{code}` (7 characters, no 0/o/1/l). Changing the address keeps the code; clearing it switches the code off
  (the row stays: a link already out answers 404 "This link is no longer active" in the brand's Content language);
  versions, repeat copies and duplicates get their own code; deleting a post keeps its link working. The UTM tags
  (`utm_source` the platform or `link-in-bio`, `utm_medium` social — referral for email and blog posts (owner,
  2026-10-20) —, `utm_campaign` the campaign's slug or `content-plan`, `utm_content` `post-{id}` or `button`) are worked
  out at save and when the platform or campaign changes, and never replace a tag the address carries. A new Link is a
  change of words under approvals and moves the post's version on; the save, its Link and its approval step are one
  write. Clicks: one row per link, venue day and source (`direct` | `bio`), raised by one upsert; HEAD requests,
  prefetches (`Sec-Purpose`/`Purpose`/`X-Purpose`/`X-Moz`) and robots (`ContentLinkClicks::ROBOTS`: preview robots by
  name, Pinterest's crawler but not people in Pinterest's app, anything calling itself a bot) are not counted; no IP
  address, cookie, user agent or referrer is stored (`LinkRedirectTest`, `LinksTest`, `LinkCopiesTest`). Any account's
  staff can make short links that redirect from the shared host: accepted by the owner (2026-10-20).
- **Link-in-bio** (`ContentBio`, `ContentBioPublic`): one page per brand at `/links/{name}` on the public host, off
  (404) until a manager switches it on. The name follows the landing-page rules, is not reserved (`links` is, now) and
  is unique among bio pages; the default is the brand's landing-page name, else the brand's slug with `-2`, `-3`…. Up
  to eight buttons, each a tracked link that keeps its code across saves (removed: switched off); up to twelve latest
  published posts with a live link, one per group of versions. A Blade page with its own stylesheet
  (`public/landing/content-public.css`) and the brand colour in one nonce'd block; no scripts, no session, cached five
  minutes (`BioPageTest`, `BioEditorTest`).

## Launch: asynchronous work and fresh allowance (2026-11-13)

- `POST work` takes `{action, request_key, post_id?, instructions?, type?, guidance?, template_id?, date?, platform?}`;
  actions are `write`, `rewrite`, `quality`, `brief`, `image`, `fill`. It answers 202
  `{work:{id,action,status,post_id,started_at,finished_at,error,result,can_cancel}}`. The id endpoints use that same envelope;
  `GET work?post_id=` returns the latest work for that post, or `{work:null}`. Successful Fill also sets `post_id`.
  Results carry `{post_id?,variation?,quality?}`; read the current post separately. Rewrite's variation is
  `{id,type,copy}`. States are `queued`, `running`, `succeeded`, `failed`, `cancelled`; errors are local codes only.
  Input, request key, captured revision, requester and ownership token are never in the DTO.
  `can_cancel` is the current viewer's server-decided capability: true only for queued/running work requested by them
  or managed by them. Another staff member can read the work but cannot cancel it; terminal work always says false.
- A request key identifies one request per requester/tenant/brand; identical retries return it. Different input with
  the same key answers `request_key_used`. One active work per post; overlapping provider attempts for one organisation
  answer `ai_busy`. Neither refusal silently retries a paid request. A new deliberate attempt needs a new request key.
- `RunContentWork` uses the existing `ai` queue, one attempt, 110 s timeout, a 100 s shared transport deadline, and
  120 s ownership. Queue wait expires after 1,800 s. Polling expires abandoned work; failures release post ownership.
  Cancellation is idempotent and takes the same work row lock as each result transaction, including Fill creation.
  Already committed changes stay; after cancellation commits, later provider results cannot write. A stale post
  captured at enqueue fails before a provider call, and changes during a call keep Task 2's atomic revision guard.
- Every Content text/image provider attempt (including JSON repair and image fallback) takes a shared organisation
  allowance lease for 120 s, reads the current plan cap and uncached whole-organisation ledger, and records spend before
  releasing it. It holds no database row lock across the provider. The lease is shared across brands/workers via
  `cache.shared` (database/Redis in production). Calendar budget exhaustion keeps earlier drafts and reports
  `ai_budget_used_up` on the unfinished window. Version, promotion and summary paths keep their existing budget reasons.
- Every queued action rechecks the current requester, active seat, brand restriction, organisation subscription and
  Content workspace/module. Manager actions recheck the manager role. `ContentExecution` restores worker context and
  rechecks access before each provider attempt and result commit. Removed access ends with a safe local refusal.
- Calendar execution clips its start to the venue's current day and checks today again at each insert. Its existing
  run owner gates every provider attempt and insert; `DELETE generate` serializes cancellation with inserts and state
  changes and releases that owner's brand lease. Earlier drafts remain on the plan. Cancelled state stays cancelled
  even when the old worker returns, fails or another generation starts.
- Legacy action routes retain their responses and share a 45 s provider deadline, below Cloud's 60 s web limit.
  Queued image work can use up to 90 s for an image attempt within its 100 s total deadline; a preceding brief,
  repair, fallback or download uses the same remaining time. Provider SDK/HTTP automatic retries are disabled.
  Image fallback only follows an explicit OpenAI HTTP 400/403/404 access refusal, never an ambiguous timeout.
- Migration `2026_11_13_110000_create_content_work.php` is additive. The queue connections keep `retry_after=660` and
  require no new worker. Tests: `AsyncWorkTest`, `SharedAllowanceProcessTest` (independent PostgreSQL workers and the
  database cache), existing Content/calendar suites and `QueueRetryAfterTest`.

## Launch: current image providers and usage prices (2026-11-13)

- Default `CONTENT_PLANNER_IMAGE_MODEL=gpt-image-2.6-sunburst`; current alternative `gpt-image-2.6-flare`.
  `CONTENT_PLANNER_IMAGE_FALLBACK_MODEL` stays empty unless explicitly configured. Legacy primary overrides
  `gpt-image-1`, `gpt-image-1.5`, `gpt-image-1.5-2025-12-16`, `chatgpt-image-latest`, `dall-e-2`, `dall-e-3`
  map to Sunburst; `gpt-image-1-mini` maps to Flare. All those legacy fallback values map to Flare.
  Canonicalized duplicates are never attempted twice. Existing saved media and model history are unchanged.
- Direct Images API requests explicitly ask for one PNG (`output_format=png`), high quality and a fixed size:
  square 1024x1024, portrait 1024x1536, landscape 1536x1024. The SDK returns base64 without `response_format`.
  Fallback requires a definite model-access/organisation-verification error with HTTP400/403/404.
  Moderation, invalid parameters/prompts, quota, server errors and ambiguous transport failures never start it.
  Both attempts retain the existing fresh allowance, cancellation and deadline checks.
- Both current image models cost USD5 per million text-input tokens, USD8 per million image-input tokens,
  USD30 per million output tokens. Complete positive usage and its breakdown are used directly. If incomplete,
  malformed or zero, retain valid counts; missing text adds the UTF-8 prompt byte count (minimum1) to known image
  input. Total input is at least the UTF-8 prompt byte count (minimum1), known category
  sum and reported input; output is at least1756 for square or1372 for portrait/landscape. Unclassified input costs
  USD8 per million. This deliberately overestimates missing data. Positive ledger costs round up to whole cents.
  `ImageUsageTransport` normalizes only optional usage fields before the installed SDK's typed parser, so bad usage
  cannot discard a returned image; missing/invalid counts use a negative sentinel that activates the estimator.
  An absent optional total is derived only from validated complete component counts for the SDK's required integer;
  an explicitly malformed or contradictory total still activates the conservative estimator. The installed SDK to
  ledger regression proves tiny complete usage stays an exact one-cent debit, with one provider transport call.
  The generation diagnostic keeps parsed usage plus the accounted breakdown and exact USD calculation; its existing
  decimal column rounds for display. Ledger and diagnostic share `imageCost`. No historical rows are rewritten.
- Content text keeps `claude-sonnet-5`. Shared new-usage prices: Sonnet5 USD2/10, Fable5 USD10/50,
  Opus4.6/4.7 (including4.7[1m]) USD5/25 input/output per million. Haiku5.5 is USD0.10/0.50 through100000
  input tokens and USD0.50/2.50 above100000. Other mapped rates remain unchanged. Text diagnostics use the same
  `costUsd` calculation as the ledger. Unknown-model best-effort accounting remains available to other products.
- Safe API contract: legacy Write/Image/Fill refusal is HTTP502 `{error:ai_model_unpriced,message:<fixed sentence>}`;
  queued work ends `failed` with `work.error=ai_model_unpriced`, including Fill's calendar-result mapping.
  Calendar `failed_windows[].reason`, promotion page `error`, website `summary_note` and post group `kept_reason`
  retain the same code. Strategy/repeat retain their fixed safe failures (they have no error-code field).
  No provider/configuration detail is in these errors.
  The frontend should translate this code and suggest asking an administrator to check AI configuration, without
  automatically retrying. Provider credentials/access and paid output quality still need operational verification.
- Official sources checked13November2026: [lifecycle](https://developers.openai.com/api/docs/deprecations),
  [Sunburst](https://developers.openai.com/api/docs/models/gpt-image-2.6-sunburst),
  [Flare](https://developers.openai.com/api/docs/models/gpt-image-2.6-flare),
  [image options/calculator](https://developers.openai.com/api/docs/guides/image-generation),
  [Claude prices](https://platform.claude.com/docs/en/about-claude/pricing).
  `CurrentProviderTest` uses the actual installed SDK HTTP serializer/parser with local PSR responses;
  `ImageFallbackTest`, `AsyncWorkTest` and AI ledger tests cover refusal, fallback and fresh allowance.

## Launch: planning settings and purchased locations (2026-11-13)

- `GET settings` answers `{timezone, timezone_named, timezones, locations_limit, locations_used}`. The zone list is
  `BookingRules::zones()`; `locations_limit` is an integer or null (unlimited), `locations_used` counts every existing
  organisation Property across brands, including inactive locations. Staff may read; managers `PUT settings`
  with `{timezone}` and receive the same shape. Save requires a supported named IANA zone; UTC, abbreviations and
  offsets are refused. Reading saves nothing and never guesses a zone from a location.
- **Explain before Save:** this changes the shared account setting `hotel_timezone` through `BookingRules::write`,
  used by Content planning/reminders/morning email, appointment and member-portal clocks, and other dashboards.
  Existing post/appointment/event wall-clock digits are not converted or moved. It is not a per-brand or
  per-location setting. Choosing or editing a location never changes it.
  A retained clean settings form adopts refreshed account authority, including changes saved from another brand.
  Actual unsaved choices remain retained through refetch/navigation and keep their existing session/brand identity.
- Content's `GET pulse` uses exactly bootstrap/reminders' saved planning zone, including UTC when none is named.
  It adds `timezone_named` (false on UTC), keeps `timezone_source: venue`, and its `now`/`today` use that zone.
  Location and weather data remain available; forecasts are requested in the planning zone too. The UI can offer
  managers zone setup when `timezone_named` is false. Other workspace/full-admin pulse fallback behavior is unchanged.
- `GET locations` answers `{locations:[...]}` for this organisation and current brand only, including inactive rows.
  `POST locations` (201) and `PUT locations/{id}` (200) answer `{location}`; both require a manager. A location is
  `{id,name,address,city,country,timezone,email,phone,website,is_active}` only. The body allows those fields except id;
  unknown keys (including PMS, booking, code or ownership fields) answer validation errors and are never persisted.
  The usual query `brand_id` chooses the brand; body ownership overrides are refused. There is no delete endpoint.
- Name is required at create (255 characters maximum); address max 2,000, city/country max 100, email max 255,
  phone max 20, website max 250 with http/https. Optional address/contact fields may be null. A location's zone may be
  UTC or a supported named zone; new locations default to UTC and active. Updates may deactivate/reactivate an
  existing row, including at the quota. Deactivation preserves history and still consumes the purchased location.
- Property creates in Content and the full admin take the same organisation row lock before checking the existing
  `PlanLimitGuard` property cap and inserting. The shared guard now counts across brands. Content refuses the next
  create with `402 {error:plan_limit,message,limit,limit_key:max_properties}`; full-admin refusal keeps its existing
  response. Full-admin images use a fast quota precheck, upload outside the lock, then the authoritative locked
  recheck/insert. A new upload that loses the race or fails to insert is retired outside the transaction; cleanup
  failure is logged without replacing the original response/error. Existing or user-supplied images are untouched.
  Existing PMS/booking fields are neither exposed nor accepted by Content. Only active locations owned by
  the profile's organisation/brand join AI context, including jobs running under another ambient brand.
- Coverage: `PlanningSettingsTest`, `LocationsTest`, `LocationsQuotaProcessTest` (independent PostgreSQL processes
  exercise both property writers at the last location), `PropertyImageQuotaTest` (fake storage and real autocommit
  depth0 upload/cleanup), existing Content/calendar, dashboard, access/module and clock scopes.

## The portal (`/content`, `frontend/src/content/`)

### Launch draft ownership (2026-11-13)

- `PostEditorProvider` in `panel/PostPanel.tsx` owns the one live editor above Content's routes. Panel and full
  writing views consume `usePostEditor()`; they must not create a second form or Save implementation. Its
  `editing`, `setEditing`, `save`, `saving`, `dirty`, `post`, `adopt`, `actions` and read/conflict state are shared.
- Create changes the target identity with `panel.identify(id, owner, seq)` without changing its opening. Save/Create
  acknowledge the submitted snapshot, preserving typing and intentional undo after the click. Pending undo counts
  as dirty even when it equals the old loaded base. A retained opening reconnects to an unfinished acknowledgement
  after browser Back; account, brand and opening checks prevent another editor receiving it. `panel.capture()`
  captures an ownership check for asynchronous work started outside the editor, such as Fill.
  Duplicate caches its saved copy independently. If the originating opening gained unsaved edits while the response
  waited, it stays on that original with the typing intact; a clean opening still follows the copy in panel/full view.
- Brand sections, summary, bio, website address and list forms use `drafts/useRetainedState`: tab memory scoped by
  session, brand and editor key. Internal navigation, Find and section changes retain these drafts; full-admin and
  sign-out guard all retained drafts of the current session, and unload uses the browser's confirmation. Clearing a
  draft invalidates its generation ticket so an old completion cannot close a newly opened form. No draft is stored
  on disk or handed to another account/brand. List creation fields remain disabled while pending, including after
  navigation/remount. Editable bio saves match submitted row keys to returned button IDs before the next Save.
- The shared `modalScope` traps visible focus only in the topmost dialog, makes covered branches inert, and supports
  nested dialogs and dock/overlay resizing. The desktop panel remains nonmodal. Workspace navigation has an optional
  `onNavigate(to)` guard; absent it, sibling behavior is unchanged. `stickyRail` is unchanged.
- Delayed-response browser regression: `node frontend/scripts/content-draft-regression/run.mjs`. It uses production
  React components with an isolated local API fixture and blocks external hosts; its ignored receipts/screenshots
  are behavioral evidence. The final application frame still needs the integrated browser checks.

- **Where it lives.** A lazily loaded app on the shared workspace core (`src/workspace/`), beside Appointments: own chunk, own shell, no full-admin copilot.
- **Look.** Kept on the device under `content:look` and `content:brand-paint`.
- **Brand.** Every call names its brand in the address (`?brand_id=`), so the full admin's request hook leaves it alone. The device remembers the brand under `content:brand`; on a first visit it takes the full admin's choice, else the person's default. A remembered brand the person may no longer use (the server's `code: brand_not_allowed`) is forgotten, and the default is asked for instead. Switching brand clears every Content query and asks first about unsaved edits.
- **Plan.**
  - Week, month or list. Below 1024 px only the list.
  - Read every 60 s and on focus.
  - The This week strip comes from the server's figures for the shown range.
  - Empty slots offer Write (a new post for that day and platform) and Fill with AI (one post, through the server's one-day generation).
  - The Unscheduled tray. A card is moved by drag (mouse and pen after 4 px; a finger after a still 400 ms) or by Shift+← / → on a focused card. A move saves at once with the version it read, shows on the plan as soon as the server answers (`lib/planCache.ts`, so the next move sends the new version), and an Undo shows for 8 s that puts back the day and the time. A second move of a card whose first is still on its way is not sent. A refused move says why and reads the plan again.
  - Published posts do not move.
  - Generate is for managers only. It covers ≤ 62 days, and days already gone are never written (the server's `range_in_past`).
- **Post panel.**
  - App-level: it stays open across pages.
  - A save sends only what changed, with the `updated_at` it read. A save from a stale copy offers "Load their version".
  - Closing it, opening another post, switching brand, "Full admin", Sign out or leaving the site with unsaved edits asks first. The browser's Back out of the portal cannot ask: the edits are kept in the tab's memory (`panel/kept.ts`, same session and brand only) and come back with a notice when the person returns.
  - AI tools that write into the post wait while it has unsaved edits; a rewrite only offers text to use. Every answer (AI, actions, Save) lands under anything typed while it was on its way: fields the person changed keep their text (`rebase`). The person's own move of the open post takes the new day the same way; another device's change still waits for Save, which then offers their version.
  - A post started from the New post button opens on the brand's first active channel.
  - Post links: `/content/posts/<id>` opens the post's week with the panel.
- **Find** (Ctrl/⌘ K or "/") searches the brand's posts on the server from two letters (up to 8), plus the actions.
- **Posts** (`/content/posts`): every post of the brand, newest scheduled first and those with no day last, 50 a page (`GET posts`). The search and the filters (status, platform, pillar, from–to, only posts with no day) live in the address, so a list can be shared; a value the address holds that cannot be used falls back to none. Archived posts show only when their status is chosen. A post's own link opens here when it has no day.
- **Strategy** (`/content/strategy`): the active strategy as a document, and this month's posts per pillar against the pillars' target weights (the server's `balance`). `?id=` shows a past one. Managers make a new one (a queued job: the list is read every 5 s while one is being made; after 15 minutes the page calls it stuck, when the server also lets a new one start), make a past one active, or archive one. Locally the job needs a queue worker (`php artisan queue:work`), and the local queue may hold other jobs, such as mails, that a worker would also run.
- **Brand** (`/content/brand`):
  - Readiness shows what is missing by code (`readiness.sections[].missing`, from `ContentKnowledgeService::GAPS`); `BrandTest` keeps the portal's words (`content.brand.gap.*`) and the codes equal. Refresh knowledge re-reads the organisation's FAQ, chatbot and services.
  - Sections — Brand DNA, Audiences, Voice, Positioning, Channels, Rhythm and goals — are read by everyone and edited by managers one at a time. Each section reads any stored shape, edits its own draft and saves only its own fields that changed; parts it does not show go back as they came. `name`, `default_language` and `trend_mode` are never sent empty (the server refuses null there).
  - Audiences and channels keep their ids. Removing an audience that posts use asks first with their number (`?confirm=1`); any channel change reads the Plan again, so its slots follow.
  - A brand with no profile: managers choose Quick setup (one AI call, minutes; the AI's assumptions are shown) or Guided setup (the sections in turn; each step saves as it goes; the device keeps the step reached under `content:setup-draft:{brand}`; Finish sends `POST brand/setup`). Staff are told their manager has not set it up yet.
- **Option lists** (tones, roles, mix categories, …) live in `content/lib/options.ts`, moved from the old planner; stored values are kept as they are and named under `content.options.*`.
- **Shortcuts:**
  - N new post, T this week, ← → back and forward, W M L views, ? the list.
  - The Cyrillic layouts reach the same keys by their places.
- **Words.**
  - Five languages in `src/content/i18n/content.{en,ru,de,fr,es}.json`, under `content.*`. `contentLocales.test.ts` keeps the key sets equal and the `{{names}}` intact.
  - Every refusal is shown in the portal's own words (`lib/errors.ts`).
- **Colours.** `theme/content.css`, under `[data-content]`. Each platform's fill takes white ink while white reads 4.5:1 on it, else dark ink (release 3). Each status's tone reads 4.5:1 over its own tint (`contentCss.test.ts`).
- **Click-to-add** (release 3): a day's empty space, or its "+" (week: at the day's foot; month: the corner; list: the
  day's header), opens a new post on that day from the venue's today on; past days take no clicks. The post starts on
  the day's first open slot, else the brand's first active channel, at that channel's usual time; nothing is saved
  before Save; the click a drag's release fires opens nothing (`plan/addMath.ts`).
- **Best times**: a slot reads "Best around {{time}}", the panel's time field offers the platform's suggested times, a
  channel keeps a usual time (Brand → Channels); one table for server and portal (`lib/bestTimes.json`).
- **Hashtags and snippets**: Brand → Hashtags and snippets (managers keep them, everyone reads them; AI suggestions
  save nothing until Add); in the panel, Insert beside Hashtags (no double tags, ignoring case and #) and Insert snippet
  beside Text and Call to action (at the cursor, else at the end); Instagram is warned about past 30 tags.
- **Goals**: under the This week strip on the current week: per platform "published of target · planned", a met goal
  in words, the streak, and from Friday the nudge. Read with the plan and after every post change.
- **Repeat**: in the panel of a saved post with a day; the limits (26 copies, 12 months, 12 AI copies) are checked
  before sending (`panel/repeatMath.ts` mirrors `ContentRepeat`); the panel reads its post every 5 s while the AI
  rewords the series, and the Plan with it.
- **Key dates** (release 4a): each day's chips above its posts (week, list; the month shows the first and "+N"); a
  holiday's card offers "Write a post for it" from today on; an event or note opens its editor (anyone on the team; an
  event lasts 31 days at most). The toolbar's Key dates switch is remembered on the device (`content:plan`). Day names
  come from the bundles under `keydates.day.<id>`; `tests/Unit/Content/DayWordsTest.php` ties them to `DayNames::EN`.
  A United States substitute day says "observed", elsewhere "day off in lieu". Brand → Key dates: the country (or none,
  or the guess) and the marketing switch, managers only.
- **The day's "+"** is a menu — New post · From a template… (when the brand has templates) · Note · Event — on one
  shared component (`ui/PopMenu.tsx`, also Insert, the Template menu and "Move to…"); a day's empty space still starts
  a post at once.
- **Ideas** (`/content/ideas`): the posts without a day by stage (Idea, Draft, In review, Ready); a card moves by drag,
  Shift + ← / → or "Move to…"; Schedule puts it on the Plan with Undo; past 50 a stage links to the Posts page. Quick
  capture: the Idea stage's line, Find's "Add an idea" and the I key.
- **Templates**: Brand → Templates (managers keep them; everyone reads them; AI suggestions save nothing until Add);
  the panel's Template menu beside Topic (asks before replacing written words), the blanks line, managers' "Save as
  template"; "+ → From a template…" with Use and Write with AI (the panel shows the AI working).
- **Approvals** (release 4b): Brand → Approvals switches them per brand (managers; everyone reads it). While on, a
  staff member's status list stops before Approved, Mark ready and Mark published are not offered, and the Ideas
  board's Ready column takes no card (`lib/approval.ts`). The panel's review bar says who wrote the post, "Waiting for
  approval" or "Sent back", and offers Send for approval (staff, from Idea, Draft or Needs visual — not again on a post
  already in review) or Approve and Send back with a note (managers, on a post in review). Approve sends the version
  the panel holds: a post changed since is refused and shown as it now is. Cards on the Plan, Ideas and Posts carry the
  same flags and their comment count.
- **Comments and history** at the panel's foot: comments and approval steps, oldest first, the newest 200; Enter sends,
  Shift + Enter adds a line; 2,000 characters at most, said before sending; edit or delete your own, managers delete
  anyone's; "Former team member" where the user is gone. A comment never touches the post.
- **The "For you" bell** beside New post (`bell/ForYouBell.tsx`, on `ui/PopMenu.tsx`): its count read every 60 s while
  the tab is shown and when the tab comes back into view; the list read when opened, news marked, then marked seen up
  to that read (`read_at`); a line opens its post. One brand at a time.
- **Versions** (release 5a): the panel's Versions section lists the post's group as chips (platform, status, day; this
  post marked; a chip opens that version), Make versions… for the brand's platforms not yet in the group — "Adapt with
  AI" (unavailable at the AI budget cap) or "Copy as is" — and Unlink. While the AI adapts, the panel reads the post
  every 5 s and says "Adapting for …"; a version it did not adapt says why. Cards carry "Versions: N".
- **Who posts it** after Date and Time in the panel, and in Ideas → Schedule (`ui/PosterSelect.tsx`, the team from
  `GET team`; "Loading…" until the team is read): someone who left shows as Not set. While approvals are on, a staff
  member who posts an Approved or Ready post sees Mark published with "You post this one…".
- **The bell's reminders** ("To post today", with the time and a status not yet ready; "Not marked as posted", with the
  day it was due) and, at its foot, **the morning email switch** (each person's own).
- **Tracked links** (release 5b): the panel's **Link** field after the call to action; under it the short link with
  Copy, "Clicks: N" (and those from the link-in-bio page) and 14 bars, each named for screen readers. Before a save the
  panel says what it will do: make the short link, keep it for a new address, switch it off when the field is emptied,
  switch it back on. A refused Link marks the field (`link` refusals). Cards say "Clicks: N" from 1.
- **Link-in-bio** on the Brand page, after Channels (`brand/sections/LinkInBio.tsx`): staff see the address with Copy
  while the page is on; managers edit the switch, the name (lowercase as typed; the full address shown; a warning when
  a saved page is renamed), title, line, "Show latest posts" and up to eight buttons (add, move up and down, remove),
  saved in one call; each button's clicks for the last 30 days; Open page while it is on.
- **Release 6 — Promote** (`/content/promote`, `promote/`; menu item after Posts). Two shared queries:
  `['content', brand, 'site']` (`GET site`, read every 4 s while a scan runs) and `['content', brand, 'promotion']`
  (`GET promotions/current`, every 4 s while a promotion runs); `usePromotionWatch` reads the plan and the pages'
  numbers again when a run ends (the Promote page and the Plan both watch; the Plan says "Promotion posts added…").
  The page: the website line (`WebsiteScan`: address, Scan, "Update the company summary", the status line), the running
  or finished promotion (`PromotionLine`, Stop for managers), two tabs (Blog articles, Other pages) of `PageRow`s
  (picture, title opening the page, date and numbers, "Not found on the last scan", Show posts — the page's posts,
  each opens in the panel — and Remove draft posts with a confirmation); managers tick up to 20 pages and press
  Promote…. The dialog (`PromoteDialog`) asks the server's preview (`POST promotions/preview`, keyed by the request) and
  enables Promote only when every post fits; the period follows the numbers until a date is changed. The Brand page's
  **Website** section (first after Readiness) holds the same scan control and the company summary (managers edit it;
  an edit is kept by the next scan unless "Update the company summary" is ticked). The panel shows "Promotes: …" on a
  promotion post. Refusal families: `site`, `promote`, `promotion` (per page), `summary`, `drafts`.

## Small-fixes batch (2026-10-20)

The deferred minors of releases 5a and 5b and the owner's answers of 2026-10-20, in one deploy (no migration):

- Copy buttons say "Copied" for two seconds, then their own words again; the short link's button reads "Copy short
  link", the panel's admin-address button "Copy link for the team".
- The link-in-bio editor names the rule that failed (the name's 3 to 63 characters, the address rule, a missing label),
  keeps each mark on its row through a move, keeps the caret in place while the name is rewritten, shows an example in
  each button label, and warns beside Copy address while the page is off. Two managers saving the first page at the
  same moment both succeed (the second as an update).
- Sending a post already in review for approval again does nothing. "Sent back" survives a quality check and starting
  or stopping repeats (none moves the post's version); a new picture or visual brief ends it, as a save does. A poster
  whose staff row was switched off cannot mark their post published.
- A version cannot be saved onto a platform its group already has (`version_exists`, Platform marked); Make versions
  from two posts of one group waits on one lock; deleting the post whose id keys a group re-keys the rest to the oldest
  one (as Unlink does); each version the AI kept as written keeps its own reason.
- Undo after Schedule gives back the poster only when Schedule changed it, and never a poster who has left the team.
- The panel's fields: Date beside Time, then Who posts it. The morning email switch shows its saved state at once; a
  manager's hint says the email also lists the posts nobody is set to post. Unlink and a Plan move have their own
  refusal words. Other versions refresh after Make versions or Unlink.
- The bell's count and list read who manages and the team once per call (5–6 staff reads before, at most 3).
- Two requests on one post at the same moment (follow-up, same day): approval steps, saves, moves, Mark ready and Mark
  published lock the post's row and check it again first — a double Send for approval records once, a second Approve or
  Send back on a post that moved on is refused (409 `wrong_status`), Approve/save/move refuse a post changed after their
  check (409 `changed_elsewhere`), a platform change racing Make versions is refused, a post deleted meanwhile answers
  `not_found`. Writes that change a group take the group's key post first, then the post (Make versions, Unlink, a
  platform save); Stop repeating takes removed copies out of their groups; a deadlock abort is retried (3 tries).
  `ConcurrentWritesTest` stages the other request right after the post is read.

## Release 6: promote your website (2026-10-20)

Spec `docs/superpowers/specs/2026-10-20-content-release-6-design.md`.

- **The scan** (`POST site/scan`, managers; `ScanContentWebsite` on the `ai` queue, `tries` 1, `timeout` 600): robots.txt
  (the group naming `HexaTechContentBot` by its whole name, any case or version, else `*`; a robots.txt answering 5xx,
  429 or nothing stops the scan with `robots_unreachable`, a 4xx one reads as none — RFC 9309; patterns matched without
  the regex engine), then its sitemaps or the usual ones, else the home page's feed, links and blog page; reads up to
  30 pages (home first) and then the 100 newest articles, one at a time, for at most 420 s. Public addresses only: every
  DNS answer is checked and the connection pinned with `CURLOPT_CONNECT_TO` and the reached IP checked again (on curl — a
  streamed Guzzle request would go through PHP's stream handler and ignore the pin); each redirect is checked again; HTML 3 MB, XML 10 MB, pictures 5 MB.
  20 scans per organisation a day (`RateLimiter` key `content:site-scan:{org}`). A token per press: a late job writes
  nothing. A scan reads failed 1,800 s after it was queued, or 660 s after its job started — ready instead once it has
  saved its new list (the list, its day and numbers are written before the summary call; a scan stopped during that
  call keeps them, its `summary_note` saying the summary did not change). A page's date is the day and time the site
  wrote, its offset dropped, so the day shown is the site's own (pages read before 2026-10-21 keep their UTC day until
  the next scan reads them again; a page no longer found keeps it).
- **The company summary** (one AI call, feature `content`, type `website_summary`): kept on `content_sites.summary`, read
  by `ContextBuilder` ("FROM THE BRAND'S WEBSITE") in every Content AI call; it fills `brand_summary`, `usp` and `mission`
  only where they are empty. A manager's edit (`PUT site`) sets `summary_edited`, and a scan then keeps it unless
  `update_summary` is sent. The readiness check counts the scanned address as the company website.
- **Promotions** (`POST promotions`, managers): `PromotionSchedule` spreads the posts (an evenly spaced ideal day, the
  nearest free slot, channels taking turns at a cost of 3 days, the weekly pace); one `content_promotions` row per page
  and one `WritePromotionPosts` job per row, chained on the `ai` queue. Each post is a draft with `generated_by =
  promotion`, `site_page_id`, its own short link (`utm_campaign = promote-{page}`), the link after the text except on
  Instagram and TikTok (the dialog says they need the link-in-bio page on with its latest posts), and the page's picture
  copied once into the media store. A page's Posts and Published count its promotion posts not archived; its Clicks
  count every visit through the brand's short links to its address (also from posts since archived or removed) or
  through the link of a post promoting it, once each. A batch's page reads failed 660 s after
  its job started, or after 1,800 s without progress in the batch; the next press marks such rows failed.
- **Undo:** `DELETE site/pages/{id}/posts` removes the page's promotion posts in idea, draft, needs review or needs visual,
  as deleting one post does (versions unlinked first; short links keep working); each post is read again under its
  lock first and kept when another tab approved it meanwhile.
- **Copies:** versions, repeat copies and duplicates keep `site_page_id`.

## Release 7a: the owner's look (2026-10-21)

Spec `docs/superpowers/specs/2026-10-21-content-release-7-design.md` (§3–§7, §9); the writing view (§8) is release 7b.
No migration, no new route; Appointments is unchanged (the shared shell's new options are off unless passed).

- **Palette and accent:** `[data-content]` gives Content its own navy (Dark) and blue-grey (Light) surfaces (`content.css`;
  the side panel stays navy in Light). `accentTokens(brand, theme, surfaces)` takes the surfaces, so the accent text,
  rail mark and outline rules hold on navy; `cardFill` mixes the accent 18 % into `--a-surface-2` (Dark) or 10 % into
  `--a-surface` (Light) for `--c-card`, lowered in 2-point steps until `--a-text` and `--c-card-text-2` read ≥ 4.5:1.
  `--c-ai` (violet, white ink) fills Generate and the key-date chip; `--c-ai-text` is the violet as text (the fill reads
  2.6:1 on navy). `contentContrast.test.ts` pins every pair.
- **The frame** (`WorkspaceShell` options `variant: 'cards'`, `railLabel`, `footer`, `phoneMenu`, `crumbs`, `card`): the
  areas as cards under "Workspace"; the foot is Settings (a panel: theme, language, full admin), Help & resources
  (shortcuts, Find) and the person with their role (Collapse, Sign out) — `shell/SideMenu.tsx` opens them, claims Escape
  (an open post panel stays open) and closes on a press or focus outside. The top bar starts with the breadcrumb
  (`shell/BrandCrumb.tsx`: the brand's logo or initials, its name, a brand menu from two brands up, "/", the page);
  New post moved to the page header (`ui/PageHeader.tsx`, `ui/NewPostButton.tsx`). Below 640 px the breadcrumb has
  its own row above Find (the top bar holds the six area buttons, the bell and the menu).
- **Plan:** the header's numbers line (Planned · Ready · Published · Empty slots: the server's figures for the week or
  list, the month's own days in Month view — `monthFigures`); the filter row above the calendar (channel chips ticked
  while their channel shows — pressing one hides or shows it, the last one stays — a Status menu, Unscheduled as a chip
  that takes a dropped card off its day and opens the list of posts without a day, which lets a dragged card through to
  the days under it, and the Key dates switch); the calendar bar (month title, ‹ ›, Today, Generate beside the Month ·
  Week · List control); month cards filled with `--c-card` (the open post with the accent), a status word on each (it
  goes under the mark and time in a narrow day), the Today circle, key dates at a day's foot, and the legend under the
  grid.
- **The post panel:** docked beside the page from 1280 px (`role="complementary"`; `<main>` gets `xl:pr-[400px]`), over
  the page from 640 px, the whole screen below (`usePanelMode`). Header "Post details" with the day, ⋯ (Duplicate, Copy
  text, Copy link, Save as template, Delete — `PanelMore`, sharing `usePostActions` with `ProgressActions`) and ✕. Above
  the tabs, so every tab shows them: loading, a failed read, kept edits, a conflict, and what ⋯ answered (`MoreOutcome`:
  the delete confirmation, "Copied", a refusal, the template editor). Tabs Content · AI tools · Activity (a new post
  opens on Content, a post the AI is writing on AI tools, any other on the tab last used; the tab and each folding
  section's state are remembered per device in `panelPrefs.ts`).
  The Content tab: the hook as the large serif line, Date · Time, Status · Who posts it with the progress actions under
  them, Post text with its toolbar (`TextToolbar`: Emoji picker searched in English, Insert link — the short link while
  it is on, else the Link field's address, else a box asks —, Insert snippet, Insert hashtag group), Call to action with
  "Add destination URL" (opens the Link field in place), then the folding sections Targeting & language, Link & hashtags
  and Versions & repeat (a section opens by itself for a refused field, the too-many-hashtags warning, or a hashtag group
  just added). Footer: Create post, Save draft for a draft, else Save.
- **`logo_url`:** `GET bootstrap` gives each brand's `logo_url` (null without one) for the breadcrumb's chip.

## Publishing and notifications

Staff publish manually: copy the prepared caption, obtain its assets, open the saved channel and explicitly record
publication. The launch includes campaigns, media, explicit mentions and optional review/mention email; each person's
review-email consent starts off and remains separate from morning-email consent. Content uses the server's configured
AI models and price guard. The retired AI Content Planner's `/v1/admin/content-planner/*` routes answer 404 and its
screens are removed. Reload Content/admin tabs left open across a deployment before saving.

## Deploying

- Release 3 brings three additive migrations (`content_planner_channels.post_time`, `content_planner_snippets`,
  `content_planner_posts.series_id`); nothing existing changes, and every profile, strategy, post and image carries
  over as it is.
- Queue: `retry_after` is 660 s on the database, redis and beanstalkd connections (`DB_QUEUE_RETRY_AFTER`,
  `REDIS_QUEUE_RETRY_AFTER`, `BEANSTALKD_QUEUE_RETRY_AFTER`), longer than the longest job may run
  (`GenerateContentStrategy`, 600 s), so a long run is never handed to a second worker; `QueueRetryAfterTest` keeps it
  so. A job whose worker died is retried after 11 minutes. Production (checked 2026-10-20 through the Cloud API) sets
  none of those variables and no `QUEUE_CONNECTION`: the config falls back to `database` (it fell back to `sync`, which
  ran strategy generation, AI-adapted versions, reworded repeats and campaigns inside the web request), the Worker
  cluster runs two workers — `default` (mail, campaigns, client messages) and `ai` (the long AI jobs) — see
  `QUEUE_WORKER_SETUP.md`, and the request timeout is 60 s (Cloud's maximum; it was 20 s). **Generate** is a queued
  job too (`GenerateContentCalendar`, a week took 65.7 s locally): `POST generate` answers 202 while it runs, `GET
  generate` says how it stands (the dialog and the Plan read it every 4 s while it runs), the brand's lock and the
  run's state live in the shared cache and belong to the run, a run waits at most 30 minutes in the queue and runs at
  most 11 minutes (540 s of AI time) before it reads as failed, and the posts are the manager's who pressed Generate.
  Legacy Fill, Write and picture endpoints remain bounded synchronous requests; the launch `work` endpoints run
  these actions on the same `ai` worker (see the asynchronous work contract above).
- Verify release 3 by content on the live site: the `ContentApp` chunk carries "Best around", "Hashtags and snippets"
  and "Repeats every week until"; `/api/v1/admin/content/goals` answers 401 when signed out (404 before release 3).
- Release 4a (server, Plan 4A-1): three additive migrations (`content_planner_profiles.holiday_country` and
  `marketing_days`, `content_planner_key_dates`, `content_planner_templates`); nothing existing changes. Built-in days
  come from our own rule table in `app/Services/Content/Days/`: the public holidays of GB, IE, DE, FR, ES, LV, LT, EE
  and US with their substitute and observed days, marketing days by country, international days by industry. A brand
  that never chose a country gets a guess (the organisation's country, else the venue time zone's own country, legacy
  names such as `GB` and `US/Eastern` included); `none` means no
  holidays. A one-off holiday (a coronation bank holiday, Latvia's day after a Song Festival) is one rule line in
  `PublicHolidays::RULES`, its English name in `DayNames::EN` and its words in the five bundles.
- Key dates reach the AI (Generate, Fill with AI, Write the text): holidays, special days and the brand's events with
  their details; notes never do. Templates and their AI suggestions are counted in the AI budget like every other call.
- Verify release 4a by content (after Plan 4A-2's deploy): `/api/v1/admin/content/ideas` answers 401 when signed out
  (404 before release 4a); the `ContentApp` chunk carries the Ideas page's and the Key dates section's words.
- Release 4b (server, Plan 4B-1): four additive migrations (`content_planner_profiles.requires_approval`,
  `content_planner_post_events`, `content_planner_post_comments`, `content_planner_reads`). The switch starts off for
  every brand, so nothing changes for anyone until a manager turns it on.
- Verify release 4b by content (after Plan 4B-2's deploy): `/api/v1/admin/content/inbox/count` answers 401 when signed
  out (404 before release 4b); the `ContentApp` chunk carries "Comments and history", "Waiting for approval" and
  "Nothing new for you".
- Release 5a (server, Plan 5A-1): two additive migrations (`content_planner_posts.group_id` and `poster_id`;
  `users.wants_content_morning_email` and `content_morning_email_last_sent_at`) and one hourly scheduled command,
  `content:send-morning-email`. The email is off for everyone until they switch it on. The queue must be running for
  versions adapted by AI (`AdaptPostVersions`, one AI call per run, 80 s) and for the email (`ContentMorningEmail`).
- Verify release 5a by content (after Plan 5A-2's deploy): `/api/v1/admin/content/team` answers 401 when signed out
  (404 before release 5a); `php artisan schedule:list` lists `content:send-morning-email`; the `ContentApp` chunk carries
  "Make versions", "Who posts it", "To post today" and "Morning email".
- Release 5b (server, Plan 5B-1): four additive migrations (`content_links`, `content_link_clicks`,
  `content_bio_pages`, `content_bio_buttons`); two public routes on the landing host, `/go/{code}` and
  `/links/{name}`, both in `routes/landing.php` (outside the `web` group) and in `LandingHostGuard::ALLOWED`; one new
  reserved landing name, `links`; one new static file, `public/landing/content-public.css`. No queue or schedule change.
- Verify release 5b by content (after Plan 5B-2's deploy): `/api/v1/admin/content/bio` answers 401 when signed out
  (404 before release 5b); `https://sites.hexa-tech.uk/landing/content-public.css` answers 200 (404 before);
  `https://sites.hexa-tech.uk/go/zzzz222` and `https://sites.hexa-tech.uk/links/zzzz-none` answer 404 without a cookie;
  the `ContentApp` chunk carries "Link-in-bio", "Short link" and "Clicks per day".
- Ship by the source-patch recipe (`docs/landing-page-builder.md` §6): a worktree from `origin/main`, the change list
  since the last deployed feature tip with every deletion, the suites on the artifact, a fresh build, then push. Never
  push the feature branch.
- Verify by content on the live site: the `ContentApp` chunk carries the portal's words and the index bundle does not;
  `/api/v1/admin/content/bootstrap` answers 401 when signed out (404 before release 2);
  `/api/v1/admin/content-planner/profile` answers 404; the Appointments chunk is as before.

### After the deploy (owner, signed in)

Every check that needs no account is done at each deploy, by content on the live site. These need a person signed in
to a real brand, and stay the owner's:

- Release 3: on a real brand, give a channel a usual time, add one hashtag group, start a post with a day's "+", repeat
  one post weekly for a month and stop it; check the goals line on the Plan.
- Release 4a: on a real brand, check the guessed country on Brand → Key dates, add one event, capture one idea with I
  and schedule it, add one template and use it from a day's "+"; reload admin tabs left open.
- Release 4b: on a real brand, switch Approvals on, send one post for approval as a staff member, approve one and send
  one back as a manager, add a comment, and look at both bells; switch Approvals off again if the team does not want
  them yet; reload admin tabs left open.
- Release 5a: on a real brand, make one version as a copy and one adapted by AI, set "Who posts it" on a post for today
  and look at that person's bell, switch the morning email on for yourself and read it the next morning at 8; tell the
  team that a manager's bell lists today's and the last seven days' unpublished posts nobody posts until "Who posts it"
  is set or the posts are marked published; reload admin tabs left open.
- Release 5b: on a real brand, give one post a Link, save it, open its short link on a phone (the visit counts by the
  next panel read), and look at the card's click count; on the Brand page, set up the link-in-bio page, switch it on,
  add two buttons, open it, and put its address in one profile's bio; open your own landing page once (the public host's
  list of paths changed); reload admin tabs left open.
- Release 6: on the Brand page, enter the website and Scan; check the article list on the Promote page and the company
  summary on the Brand page (edit it if something is wrong); promote one article with 2 posts on one channel over the
  next two weeks; open one of its posts (the Promotes line, the short link, the picture); then Remove draft posts on that
  article.
- Release 2 (and every release): open `/content` as a manager and as a staff member; generate one week on a real brand;
  check Settings → AI Usage for the `content` line; reload admin tabs left open across the deploy.

## Content launch composer and media (2026-11-13)

### Guide, feedback and personal notifications (launch Task 7)

Help & resources opens `/content/guide`: task search and group filters cover setup, the account planning zone,
first week, approvals, media, versions/repeats, website/tracked links, manual publishing, AI failures/cancellation
and exports. Manager setup actions respect the bootstrap role; no profile, no channels and no scanned pages have
useful next steps. Guide reads never start AI or a scan. Upload guidance uses the media API's `max_upload_bytes`.
Posts and Plan supply authenticated export controls (CSV includes filtered undated rows; ICS scheduled only).

`POST posts/{id}/comments` accepts plain `body` plus optional `media_id` (or null) and `mentioned_user_ids`
(distinct, at most 50 active users from this brand's team). Typed @names are ordinary text. The post is locked
while attachment membership and ownership are checked; a foreign or unattached asset answers validation errors.
Comment responses and timeline comments add `media: {id,name,mime,url}|null` and `mentions: [{id,name}]`.
The media context is a server-captured immutable snapshot, so detaching or archiving does not erase old feedback.
`PUT comments/{id}` changes `body` only; supplied `media_id` or `mentioned_user_ids` are refused, even null.
Comments still never touch the post revision. Text, asset and mention drafts (and pending submissions) use the
existing session/brand/post-scoped tab registry across full editor, panel and internal navigation. A rejected
selection retains the words, refreshes choices and offers correction. Pending fields remain disabled.

`PUT me/collaboration-email {on:boolean}` changes only the caller's personal consent, default false for existing
and new users. Bootstrap adds `staff.collaboration_email`; the switch is in Content settings. Morning email
remains separate. No save/upload/preview email is sent unless an actual semantic approval event or explicit
mention occurs. `ContentApproval::record()` supplies the approval events, including Create/Save into review and
staff changes after approval. Recipients follow the inbox: own-brand active managers for `sent_for_approval` and
`changed_after_approval`; the post's `created_by` for `approved` and `sent_back`; explicitly selected people for
mentions. The actor is excluded. `poster_id` is not an approval-email recipient rule. A mention on an already
followed comment appears once in the bell as `mention`, not as a duplicate comment and mention.

`content_notifications` keeps one recipient/source-type/source-id identity. Only recipients opted in when the
event is made get `SendContentNotification` queued after commit. Delivery rechecks active staff, organization,
subscription/module/workspace, brand access, consent, and reviewer role for a review request. Deleted posts or
source comments/events send nothing. Recipient locale, `MailIdentityService` sender/reply-to and shared
suppression rules apply. The job atomically claims `email_attempted_at` before transport, with one attempt:
duplicate jobs cannot deliver twice, and an ambiguous transport failure is not retried. This is at-most-once
attempt semantics; a failed transport may leave an undelivered message. No provider runs under a database lock.

Migration `2026_11_13_130000_content_collaboration.php` preserves timestamp(6) wall-clock precision on comment
created/updated/edited times, approval event `created_at`, read `seen_at`, and notification creation/attempt times.
Their models use `Y-m-d H:i:s.u`; inbox SQL cutoffs explicitly format all six digits rather than letting the
connection grammar truncate a Carbon binding. The existing `read_at` / `POST inbox/seen {at}` API is unchanged:
earlier same-second news stays seen, later news stays unread after a delayed acknowledgement. Approval events'
logical `post_updated_at` remains separate. The rollback keeps precision, consent and historical context.

Checks: `CollaborationTest` on SQLite and migrated PostgreSQL, existing Content/mail/access suites, five-locale
array-transport render/suppression tests, and browser regression with `CONTENT_COLLABORATION_CHECKS=1` alongside
`CONTENT_FIX_CHECKS=1 CONTENT_LAUNCH_CHECKS=1`. The original 71 checks remain, with retained feedback cases added.

`/content/write/new` and `/content/write/:id` use the one `PostEditorProvider` already mounted by `ContentShell`.
The full page and dock share the same opening, baseline, draft, safe Save, conflict and retained-request state.
Create replaces the new route with its saved ID without reopening it. Later typing is rebased by the shared controller.
Explicit entry into Published says **Save and mark published** and records a manual publication; copying or previewing
never publishes. The final caption includes the opted-in destination, with platform limits used only as warnings.

Media API, behind the existing Content tenant/brand access middleware:

- `GET admin/content/media?brand_id=...&q=...`: `{media, max_upload_bytes}`. The capability is calculated in the web
  request from the 20 MiB application bound and current PHP upload/request bounds (64 KiB multipart allowance).
- `POST admin/content/media?brand_id=...`: multipart `file`; verified JPEG/PNG/WebP, MP4/WebM or PDF. Uses the existing
  `MediaService` and configured media disk; the filename in storage is generated, not the original filename.
- `PUT admin/content/media/:id?brand_id=...`: manager-only `{archived: boolean}`. Archive/restore never deletes bytes.
- Media DTO: `id,name,mime,size,url,archived,usage_count`. Post detail adds ordered `media`; create/update accept ordered
  `media_ids` (distinct, maximum 10, same organization and brand). New selections must be unarchived. Existing archived
  references can remain/reorder, and duplicate/version/repeat copy references, including archived history.
- Attachment changes and reordering advance the post revision and reset staff approval under the post write lock.
  Identical lists are no-ops. A stale or invalid save changes neither post fields nor attachments. Attachment changes
  cannot piggyback a staff Ready/Published transition using old approval.

The media library provides upload, search, usage, archive/restore and honest **Open asset** links. The composer supports
ordered attachment/detachment and falls back to the saved AI image when it has no library assets. Do not add destructive
file deletion while posts or history can refer to an asset. The next comments increment can accept optional `media_id`
only after checking attachment membership under the same locked post boundary; keep historical media metadata available
for the timeline even when an attachment is later removed or archived. Commenting itself must not change post revision.

Write, Rewrite, Quality, Brief, Image and Fill use the queued `/work` API. `useContentWork` retains the original
`request_key` and submitted input before transport; uncertain starts reconnect with that same request. Terminal retry
is an intentional new key, cancellation uses the returned `can_cancel`, and rewrite text requires explicit application.
Per-post work is recovered through the latest-work endpoint; retained Fill results have an explicit opening action.
Template AI writing joins the same retained work slot. Draft and attempt retention remains tab memory, scoped by session
and brand; no draft/provider data is written to browser storage.

Brand's URL `section` selects twelve groups: Overview, Website, Identity, Audiences, Voice, Positioning, Channels,
Locations, Links, Dates & approvals, Reusable content, Rhythm. All thirteen original areas remain; Dates & approvals
combines two and Reusable content combines snippets/templates. Strategy exposes only sections present in its saved
output. Section switches and browser Back retain form drafts. Media and Content settings use the existing phone menu
overflow so the icon bar remains within the viewport.

Content settings distinguish an unset UTC planning clock from weather city. A manager explicitly selects a supported
account zone; save explains shared Content/reminder/appointment/portal/dashboard consequences and invalidates all query
caches. Stored wall-clock digits are not converted. Brand Locations use the existing settings/location API and purchased
allowance; changing a location never chooses the planning zone. Plan reserves pulse, hints, filter, goals and calendar
space while queries load. `PulseCard.clockLabel` is optional and leaves sibling workspace defaults intact.

Browser regression command: `CONTENT_LAUNCH_CHECKS=1 node frontend/scripts/content-draft-regression/run.mjs` (set the
environment variable using the host shell). This preserves all original 41 draft/focus assertions and adds full-page,
queued-work, explicit rewrite, retry/cancel and retained list-opening checks. Real-app screenshots, runtime media-byte
checks and cold-load CLS are separate acceptance evidence, not substitutes for this deterministic delayed-response host.

### Stable Plan loading (16 November 2026 follow-up)

Content's desktop rail follows the viewport, independently of a dense calendar's document height. Navigation alone
scrolls on short screens, so Settings, Help and the person remain reachable and their menus can extend outside the
rail. The shared frame's optional `navScroll` observer is enabled by Content only: a scrolling slim nav uses native
hover titles; when it fits, the existing custom tips remain. Sibling workspaces keep their previous defaults.

Plan figures have their own full-width row, so translated numbers cannot move New post into another header row.
Platform filters occupy a reserved single chip strip, alongside a separate Status/Unscheduled/Key dates group
(stacked on phones). Narrow strips scroll horizontally with a visible scrollbar, touch and wheel support; keyboard
focus brings each whole chip into view. The strip's positioned container also contains the platform marks' hidden
accessible names, preventing those absolute spans from creating document overflow.

Run `node frontend/scripts/content-layout-regression/run.mjs` for the isolated actual-component loading fixture.
It delays bootstrap and then Plan/brand/goals/pulse, waits for the real self-hosted fonts, and checks the sanitized
five-platform/14-slot dense week in all five locales, both themes and 390/1024/1440px layouts. It also checks footer
menu hit testing, native Tab/touch/wheel access, page scrolling and 600px full/slim rails. This does not replace the
existing combined 110-check draft regression or the release executor's actual authenticated live measurements.


### Campaigns and schedule exports (launch Task 8)

`/content/campaigns` reuses `content_planner_campaigns`; no new migration. Managers create/edit/archive;
all authorized brand staff read, assign and filter campaigns. `GET campaigns` returns `{campaigns}`;
`POST campaigns` and `PUT campaigns/{id}` return `{campaign}`. The DTO is
`id,name,goal,brief,start_date,end_date,status`; `brief` maps the existing `notes` column. Name is required on
create (255 characters); goal is nullable (5,000), brief nullable (10,000); dates are nullable calendar dates
with end >= start when both exist. Status is draft/active/paused/completed/archived. Dates inform the brief,
not a scheduling constraint. Archiving retains posts, associations and links; archived campaigns remain readable
and assignable. Editing does not bulk-retag old links. Assignment/clearing uses existing safe post Save and retag
rules, preserving link codes and explicit destination UTM parameters; duplicate/version/repeat keep association.

Campaign selection is part of the one shared post form, normalization/diff/rebase and retained Create/Save state.
Posts keeps `?campaign=<id>` in its URL and sends `campaign_id`. Generate accepts optional `campaign_id`, carries
it through its queued job, includes its own-brand/profile goal/dates/brief in the AI context, and saves it on
new posts. Post writing includes that same campaign context. The AI does not choose arbitrary campaign IDs.

`GET exports/csv` and `GET exports/ics` use the same validated filters as Posts: q, status, platform, pillar_id,
campaign_id, from, to, unscheduled. Additive `platforms[]` and `exclude_archived=1` preserve Plan's multi-platform
selection and archived exclusion. Export ignores pagination. Plan exports the visible calendar date range,
not its separate undated tray. All endpoints keep Content's tenant/brand/workspace/AccessMap chain. Downloads
use the authenticated API Blob pattern; no credential query parameter, public feed or token.

The actual exportable selection is limited to 5,000 posts: 422 `export_too_many` asks to refine filters;
422 `export_empty` means no rows. ICS excludes undated posts before counting. Scalar IDs freeze membership;
50-row scalar queries reapply authorization/filters while spooling to a temporary disk file before headers.
New matching posts cannot exceed the cap, and removed/no-longer-matching rows are omitted. No thousands of
Eloquent graphs are loaded. Disk preparation failure is safe 503 `export_failed`; temporary files close after
streaming. Files have private/no-store cache headers and fixed content-schedule.csv/.ics names.

CSV is UTF-8 with a BOM for Excel's normal-open encoding detection, every cell double-quoted, embedded quotes
doubled, CRLF rows; multiline copy remains intact. Programmatic importers may strip the initial three BOM bytes.
Columns: id, platform, status, scheduled_date, scheduled_time, campaign_id, language, topic, hook, main_copy,
cta, hashtags (stored JSON). Date/time are saved wall-clock digits, empty when absent. Formula prefixes
including leading whitespace/control characters and full-width variants receive a tab inside the quoted cell.
This is an OWASP human-spreadsheet mitigation: programmatic imports can retain that tab, and safety is not
promised through arbitrary spreadsheet save/re-import cycles.

ICS follows RFC5545: stable `content-{org}-{brand}-{post}@hexa-tech` UID, UTC DTSTAMP, escaped TEXT/newlines,
CRLF and folding at 75 UTF-8 octets (continuation space counts). An untimed dated post uses DTSTART;VALUE=DATE,
with no invented time or duration. Timed posts convert only for export through the saved VenueClock zone and
emit UTC DTSTART, no undefined TZID. Repeated DST wall times choose their first occurrence; nonexistent times
use the pre-gap offset (RFC5545 section3.3.5). No stored planning digits change. Summary uses topic/hook/platform;
description includes hook, copy, CTA, platform and status. No guest, staff contact, credential or private provider
fields are exported. Tests read actual bytes on SQLite/PostgreSQL and browser downloads, including Unicode,
injection, winter/summer/DST, date-only/undated, brand boundaries and exact5,000/5,001 limits.
