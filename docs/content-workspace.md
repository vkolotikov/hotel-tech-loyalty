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
  `approvals_off`, `wrong_status` and `not_yours`, from release 5a `version_exists`, and from release 5b `bad_link`,
  `bio_name_invalid`, `bio_name_taken` and `too_many_buttons`.
- Generate never writes days already gone on the venue's clock; a range wholly in the past answers `range_in_past`.
  Making a strategy active switches the active pillars to its own; archiving the active one retires them.

| Area | Endpoints | Who |
|---|---|---|
| Bootstrap | `GET bootstrap` | everyone |
| Plan | `GET plan?from&to` (≤ 62 days) | everyone |
| Posts | `GET posts`, `GET find`, `POST posts`, `GET/PUT/DELETE posts/{id}`, `POST posts/{id}/move`, `/duplicate`, `/mark-ready`, `/mark-published` | everyone |
| AI on a post | `POST posts/{id}/write`, `/rewrite`, `/quality`, `/visual-brief`, `/image`, `POST slots/fill` | everyone |
| Generate | `POST generate` (202 while the queued run writes) | managers |
| How the Generate run stands | `GET generate` | everyone |
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

## Rules the code keeps (and the tests that keep them)

- **Brands never mix.** Every list and read stays inside the pinned brand, and every id a request names must belong
  to this organisation and that brand (`PostRulesTest`, `BrandTest`).
- **Stale saves are refused.** A save or move must send back the `updated_at` it read; a newer one answers 409
  `changed_elsewhere` with the post as it is now. Versions compare to the second (`PostRulesTest`).
- **A published post keeps its date.**
- **Reads write nothing.** Reading the brand never saves its readiness; a change does (`BrandTest`).
- **Brand edits happen in place.** Audiences, channels and the voice keep their ids. Removing an audience that posts
  use needs `?confirm=1` (`BrandTest`).
- **AI spend counts.** Every planner text call and image lands in `ai_usage_logs` as feature `content`; images are
  priced per picture (`AiUsageService::IMAGE_PRICING`). At 100 % of the monthly cap every AI action answers 403
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
- **Spend needs a price.** An overridden `CONTENT_PLANNER_AI_MODEL` must be in `AiUsageService::MODEL_PRICING`, or its
  spend is logged at 0.
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
  (`ApprovalRuleTest`, `ApprovalActionsTest`). "Written by" shows only for posts a person wrote here
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

## The portal (`/content`, `frontend/src/content/`)

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

## What this release does not do

No email notices other than the opt-in morning email, no mentions or attachments (approvals, comments, reminders and the bell live in the app), no publishing to social networks, no campaigns or media-library screens, no plan limits, and no AI
model allowlist for Content. The old AI Content Planner is gone: its `/v1/admin/content-planner/*` routes answer 404
and its screens are removed; a browser tab left open across the deploy must be reloaded.

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
  Fill with AI (about 12 s), Write with AI and pictures still run inside their request.
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
- Release 2 (and every release): open `/content` as a manager and as a staff member; generate one week on a real brand;
  check Settings → AI Usage for the `content` line; reload admin tabs left open across the deploy.
