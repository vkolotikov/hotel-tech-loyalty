# HexaTech Content, release 4: planning together

Status: approved in conversation, section by section (2026-10-16). Follows release 3 (live as prod main `7b4b96191`,
feature tip `d11056743`). Release 4 ships in two halves, **4a "plan and create"** and **4b "the team"**, each with its
own plans, final review and deploy.

## 1. Summary

Release 4 makes the Content workspace a place a team plans in together:

- **4a — plan and create:** key dates on the Plan (built-in public holidays for nine countries, marketing and
  industry days, the brand's own events, the team's notes) and the day's "+" as a menu; an **Ideas** page, a board of
  the posts without a day in stages, with quick capture; **templates** with blanks, the team's own plus AI
  suggestions, used from the "+" menu and the post panel.
- **4b — the team:** **approvals** behind a per-brand switch (staff send for approval, managers approve or send
  back); **comments** on posts in one timeline with the approval history; a **"For you"** bell in the Content header.

Still planning only: no connected social accounts, no auto-publishing, no email notices (release-3 spec D1).

## 2. Decisions (owner, 2026-10-16)

| # | Decision |
|---|---|
| D1 | **Two deploys.** 4a = key dates + "+" menu, ideas board, templates (nothing changes in what staff may do). 4b = approvals and comments, the rule change, and the bell. One spec; each half has its own plans, review and deploy. |
| D2 | **Holidays are built in:** public holidays of the brand's country, a short list of marketing days, a few real international days by industry. The team adds its own events and notes on top. |
| D3 | **Countries:** United Kingdom (England and Wales bank holidays), Ireland, Germany, France, Spain (national holidays only), Latvia, Lithuania, Estonia, United States (federal holidays). |
| D4 | **Ideas board = posts without a day**, in columns by the statuses posts already have. Quick capture makes an idea post. |
| D5 | **Templates = the team's own + AI suggestions.** No built-in library. |
| D6 | **Approvals = a switch per brand**, off by default. While on, staff cannot approve, mark ready or publish; managers approve or send back. Managers' own posts need no approval. |
| D7 | **Notices live in the workspace:** a "For you" bell; no email. |
| D8 | **Holiday dates come from our own rule table** (no library, no yearly data files); tests hold every country against the official lists for 2026–2028. |
| D9 | Clicking a day's empty space still opens a new post (release-3 D4); only the "+" button opens the menu. |

## 3. Key dates and the "+" menu (4a)

### 3.1 Three kinds

| Kind | Source | Who adds | AI sees it |
|---|---|---|---|
| **Holiday / special day** | built in (§3.2, Appendix A and B) | nobody — computed | yes |
| **Event** — "Spring sale", "Open day" | the brand's own | anyone on the team | yes (title and details) |
| **Note** — "Photographer comes at 10" | the team's own | anyone on the team | **no** |

An event has a title (≤ 120 characters), optional details (≤ 1,000) and a first and last day; it lasts at most
31 days (last − first ≤ 30). A note has a title, optional details and one day. A brand keeps at most 1,000 events
and notes together. Anyone on the team may add, edit and delete events and notes (shared planning, like posts). Their
dates may be any day, past included (an event already running); only the Plan's "+" is limited to today and later.

### 3.2 Built-in days

- **Public holidays** of the brand's holiday country (Appendix A), including the substitute days the law sets
  (United Kingdom, United States "observed", Latvia's 4 May and 18 November).
- **Marketing days** (Appendix B.1), shown while the brand's "marketing days" switch is on (default on). Mother's and
  Father's Day follow the holiday country's date; a marketing day that is already a public holiday there (Lithuania's
  Mother's and Father's Day, Germany's Father's Day = Ascension) shows once, as the holiday.
- **Industry days** (Appendix B.2) for the organisation's industry, shown with the marketing days (same switch).
- The service computes any year; the Plan asks only for the dates it shows.
- One-off holidays (a coronation bank holiday, Latvia's day after a Song Festival) are not predicted; adding one is a
  one-line rule change.

### 3.3 Setup (Brand page, managers)

A new **Key dates** section on the Brand page (after Channels):

- **Holidays for:** one of the nine countries, or *None*. A brand that has never chosen gets a guess, shown as
  "United Kingdom — guessed from the venue's time zone · Change": the organisation's `country` when it is one of the
  nine, else the venue's time zone (`PortalBootstrap::timezone`): `Europe/London`→GB, `Europe/Dublin`→IE,
  `Europe/Berlin`→DE, `Europe/Paris`→FR, `Europe/Madrid`→ES, `Europe/Riga`→LV, `Europe/Vilnius`→LT,
  `Europe/Tallinn`→EE, a United States zone (`America/New_York`, `America/Chicago`, `America/Denver`,
  `America/Phoenix`, `America/Los_Angeles`, `America/Anchorage`, `America/Detroit`, `America/Indiana/*`,
  `America/Kentucky/*`, `Pacific/Honolulu`)→US; anything else (UTC included) → no holidays until chosen.
- **Marketing and industry days:** a switch, on by default.
- Staff see the section read-only.

### 3.4 On the Plan

- In the week, month and list views each day shows its key dates as small chips above its posts, each kind with its
  own icon (holiday, special day, event, note). An event shows on every day it covers. The month cell shows the first
  chip and "+N". The list view shows them in the day's header row.
- A **Key dates** toggle in the Plan's toolbar hides the layer; it is remembered on the device (per-viewer
  convenience, browser storage, wrapped in try/catch).
- Clicking a chip:
  - holiday or special day: a small card with its name, its kind and **Write a post for it**, which opens a new post on
    that day with the day's name (in the interface language) as its topic;
  - event or note: its editor (edit, delete).
- Key dates show on past days too; only the "+" (and so the menu) is limited to today and later (§3.1).

### 3.5 The "+" menu

The day's "+" (release 3) becomes a menu: **New post · From a template… · Note · Event**. "From a template…" shows
only when the brand has templates (§5). A day's empty space still opens a new post at once (D9). Past days have no
"+" (unchanged). The menu follows the Insert menu's behaviour (release 3 final review): real buttons; closes on a press
or focus outside it and on Escape (claimed, so an open panel stays open); after a keyboard choice the focus goes where
the choice leads (the panel, the editor) or back to the "+". The pattern becomes one shared Content component used by
the "+" menu, the Template menu, Insert and the bell; it lives in `frontend/src/content/ui/`, not in the shared
workspace core, so Appointments does not change.

### 3.6 AI

Generate (a week or month) and Fill with AI are told the period's key dates — holidays, special days (while shown)
and the brand's events with their details — so they can plan around them. Write the text on one post is told the key
dates of the post's day. Notes are never sent. The words sent are English names (server table, §9.3) with the date;
the AI still writes in the brand's language.

## 4. Ideas board (4a)

### 4.1 The page

A new **Ideas** page at `/content/ideas`, in the menu between Plan and Posts. It shows every post **without a day**
in four columns:

| Column | Statuses it holds | A card dropped here gets |
|---|---|---|
| **Idea** | `idea` | `idea` |
| **Draft** | `draft` | `draft` |
| **In review** | `needs_review`, `needs_visual` (a chip says which) | `needs_review` |
| **Ready** | `approved`, `ready_to_publish` | `ready_to_publish` |

`published`, `skipped` and `archived` posts without a day stay off the board (the Posts page lists them). Each column
shows its 50 most recently changed posts and its total; past 50, **See all** opens the Posts page filtered to that
stage and "without a day". Filters on the page: platform, pillar.

### 4.2 Cards and moves

- A card shows the platform mark, the topic (or the hook), the pillar, and how long ago it changed. A click opens the
  post panel (all AI tools as today).
- Drag a card to another column; on a keyboard, Shift + ← / → moves the focused card one column (the Plan's
  Shift + arrow pattern). On a phone the columns become one view at a time with a switch (Idea · Draft · In review ·
  Ready) and each card has **Move to…** instead of dragging.
- **Schedule** on a card asks for a day (today or later) and offers the channel's usual time (release 3); the post
  goes to the Plan, leaves the board, and an **Undo** line puts it back.
- The Plan's tray still lists the posts without a day; dragging from the tray onto the calendar works as today.

### 4.3 Quick capture

- An **Add an idea…** line at the top of the Idea column: type, press Enter → a post with status `idea`, no day, the
  text as its topic (≤ 255), on the brand's first active channel (else the first platform). The line clears and keeps
  the focus for the next idea.
- The same capture: **Add an idea** in Find, and the shortcut **I** anywhere in Content (opens a small capture box;
  listed in the shortcuts sheet).

### 4.4 Who

Everyone. While 4b's approval switch is on (§6), staff cannot drop cards into Ready, and dropping into In review is
"Send for approval".

## 5. Templates (4a)

### 5.1 What a template is

A name (≤ 80), an optional platform, an optional pillar, and the post's topic (≤ 255), hook (≤ 500), text (≤ 5,000),
call to action (≤ 255) and hashtags (≤ 30). Words in square brackets are **blanks**: `[treatment]`, `[date]` — a
blank is `[` + 1–40 characters without brackets or a line break + `]`. A brand keeps at most 100 templates.

A template stores its pillar by **name**: a new strategy makes new pillars (new ids), so when the template is used it
takes the active strategy's pillar of that name, else none.

### 5.2 Managing them (Brand page)

A new **Templates** section after Hashtags and snippets. Everyone sees the list (name, platform, pillar); managers
add, edit and remove. **Save as template** in the post panel (managers) opens the template editor filled from the
post (name = the topic, else the hook, cut to 80). **Suggest templates with AI** (managers) writes up to five for the
organisation's industry and the active pillars, in the brand's language, each with blanks; each is **Added** or left,
as with hashtag suggestions. It uses the AI budget and waits when the budget is used up.

### 5.3 Using one

- **"+" menu → From a template…** opens a short picker (name, platform, pillar). Two actions per template:
  - **Use** — a new post on that day, filled with the template: its platform (else the day's first open slot's
    platform, else the brand's first channel), its pillar (by name), its fields; the channel's usual time.
  - **Write with AI** — the same new post is created, then single-post AI writes it following the template's shape
    and filling the blanks from the brand's knowledge (counted in the AI budget; the panel shows it working; the
    post's status ends as Write the text leaves it today).
- **Post panel → Template** (a menu beside Insert): fills the fields from a template; when that would replace text
  already written in the topic, hook, text or call to action, it asks first.
- **Blanks left:** while any blank remains in the topic, hook, text or call to action, a quiet line under the fields
  says "2 blanks to fill: [treatment], [date]". It never blocks saving or any action.

## 6. Approvals (4b)

### 6.1 The switch

A new **Approvals** section on the Brand page: **Posts need a manager's approval**, on or off per brand, default off,
managers only. Switching changes no existing post's status. A **manager** is a staff member whose role is in
`AccessMap::MANAGER_ROLES` (`super_admin`, `manager`) — the rule Content already uses (`ContentAccess::canManage`).

### 6.2 While it is on

| Who | May | May not |
|---|---|---|
| Staff | write and edit; set Idea, Draft, Needs visual, Needs review; **Send for approval**; schedule and move days; repeat; comment | set **Approved**, **Ready**, **Published**; Mark ready; Mark published |
| Managers | everything, as today; **Approve**; **Send back** (with a comment) | — |

- The server refuses the three statuses for staff (update, mark ready, mark published, the board's moves, a new post's
  status) with code `needs_approval` (HTTP 403) and the sentence "Only a manager can approve posts while approvals are
  on for this brand." — an old tab cannot get around the rule.
- **Send for approval** (staff, on a post in Idea, Draft, Needs visual or Needs review) → `needs_review`. A staff
  member who sets Needs review another way (the status list, a drop into In review) sends it for approval too: the
  same event is recorded. On a post already in Needs review it does nothing: no second step, no new bell item
  (owner, 2026-10-20).
- **Approve** (manager, on a post in Needs review) → `approved`. **Send back** (manager, on a post in Needs review,
  with a note of 1–2,000 characters) → `draft`.
- A staff change to the **words** of an `approved` or `ready_to_publish` post — topic, hook, text, call to action,
  hashtags, platform — sets it back to `needs_review` and records it. Moving its day or time does not.
- **Repeat:** copies that are not reworded keep the original's status (release 3); copies the AI rewords go to
  `needs_review` while the switch is on.
- Duplicate makes a draft (unchanged). AI-written single posts land in `needs_review` (unchanged), so they wait for a
  manager like any other.
- The portal hides what staff may not do: the status list stops at Needs review; Mark ready and Mark published are not
  shown; the board's Ready column refuses drops.

### 6.3 What everyone sees

- Cards: **Waiting for approval** (status `needs_review` while the switch is on) and **Sent back** (status `draft`
  whose latest approval event is a send-back with no change to the post after it). A change is someone working on the
  post — a save, a move, Write with AI, a new picture or visual brief; a quality check, or joining or leaving a repeat
  series, is not one (owner, 2026-10-20).
- The post panel: **Send for approval** (staff), **Approve** / **Send back** (managers, on a post in review), and the
  timeline (§7.1) with the history lines.

### 6.4 History

Every approval step is recorded in `content_planner_post_events` (post, user, kind, note, created_at). Kinds:
`sent_for_approval`, `approved`, `sent_back` (with its note), `changed_after_approval`. The timeline shows them as
grey lines with who and when; the bell (§8) reads them.

## 7. Comments (4b)

### 7.1 One timeline

The post panel gets **Comments and history** at its foot: the comments (author's name, time, text) and the history
lines (§6.4) in time order, oldest first, the newest 200. A box adds a comment: Enter sends, Shift + Enter adds a
line; plain text, lines kept, 1–2,000 characters. No mentions, no attachments.

- Everyone with access to Content can comment on any of the brand's posts.
- You edit or delete your own comments (an edited one says "edited"); managers delete anyone's.
- A comment whose author was removed shows "Former team member". A deactivated team member is not removed: their
  name stays on what they wrote and did, so the record of who said what stays true; only a deleted user shows "Former
  team member" (owner, 2026-10-20).
- Cards show a small comment count.
- The panel also says who wrote the post: "Written by Anna" (`created_by`, already stored, not yet sent to the
  portal); an AI-generated post with no author shows nothing.

## 8. The "For you" bell (4b)

A bell in the Content header, with a count; it opens a list (the shared menu component, §3.5) for the **current
brand**, newest first, up to 50 items:

| For | Items | Leaves the list |
|---|---|---|
| Managers, while the brand's approval switch is on | each post waiting for approval (`needs_review`) | when it is approved, sent back or otherwise leaves review |
| The post's writer (`created_by`) | "approved" and "sent back" (with the note) on their posts | once seen |
| Everyone | new comments by others on posts they wrote or commented on | once seen |

- **Seen:** opening the list marks the approval news and comments as seen (`content_planner_reads`: user, brand,
  `seen_at`); waiting approvals stay until acted on. New items are highlighted until then.
- The count = waiting approvals + items newer than `seen_at`. It refreshes every 60 seconds while Content is open and
  when the tab comes back into view; the list loads when opened.
- Each item opens its post in the panel.
- One brand at a time: a manager of several brands sees each brand's bell after switching to it.

## 9. Data, endpoints, words

### 9.1 Migrations (all additive)

**4a (3):**
1. `content_planner_key_dates`: `id`, `planner_profile_id` (FK, cascade), `kind` (`note` | `event`), `title`
   varchar(120), `details` text null, `start_date` date, `end_date` date null (events only), `created_by` (FK users,
   null on delete), timestamps; index (`planner_profile_id`, `start_date`).
2. `content_planner_profiles`: `holiday_country` varchar(4) null (null = never chosen → guessed; one of `GB IE DE FR ES
   LV LT EE US`; or `none`), `marketing_days` boolean default true.
3. `content_planner_templates`: `id`, `planner_profile_id` (FK, cascade), `name` varchar(80), `platform` varchar(20)
   null, `pillar_name` varchar(255) null, `topic` varchar(255) null, `hook` varchar(500) null, `main_copy` text null,
   `cta` varchar(255) null, `hashtags` json null, `created_by` (FK users, null on delete), timestamps.

**4b (4):**
1. `content_planner_profiles.requires_approval` boolean default false.
2. `content_planner_post_events`: `id`, `post_id` (FK, cascade), `user_id` (FK users, null on delete), `kind`
   varchar(30), `note` text null, `created_at`; index (`post_id`, `created_at`).
3. `content_planner_post_comments`: `id`, `post_id` (FK, cascade), `user_id` (FK users, null on delete), `body` text,
   `edited_at` null, timestamps; index (`post_id`, `created_at`).
4. `content_planner_reads`: `id`, `user_id` (FK, cascade), `planner_profile_id` (FK, cascade), `seen_at`; unique
   (`user_id`, `planner_profile_id`).

The unused `content_planner_campaigns` table stays unused.

### 9.2 Endpoints (under `/api/v1/admin/content`, brand in the query as today)

**4a:**
- `GET plan` gains `key_dates`: built-in days (`id` such as `gb.early_may` or `mothers_day`, `kind` holiday |
  marketing | industry, `date`, `substitute` true/false, `name_en`) and the brand's events and notes (`id`, `kind`
  event | note, `title`, `details`, `start`, `end`) overlapping the range.
- `POST key-dates`, `PUT key-dates/{id}`, `DELETE key-dates/{id}` — anyone on the team.
- `PUT brand/profile` accepts `holiday_country` and `marketing_days` (managers, as today); the brand payload carries
  them plus `holiday_country_guess`.
- `GET ideas?platform&pillar_id` → the four columns, each `{posts, total}`.
- `POST posts` accepts `status` `idea` or `draft` (default `draft`) and no day.
- `POST brand/templates`, `PUT brand/templates/{id}`, `DELETE brand/templates/{id}`, `POST brand/templates/suggest`
  (managers); the brand payload carries `templates`.
- `POST posts/{id}/write` accepts `template_id`.

**4b:**
- `POST posts/{id}/send-for-approval`, `POST posts/{id}/approve`, `POST posts/{id}/send-back` (`note`).
- The rule checks of §6.2 in `PUT posts/{id}`, `POST posts`, `mark-ready`, `mark-published`, repeat.
- `GET posts/{id}` gains `author`, `comments_count`, `timeline`, `sent_back`; card payloads (plan, ideas, posts) gain
  `comments_count` and `sent_back`.
- `POST posts/{id}/comments`, `PUT comments/{id}`, `DELETE comments/{id}`.
- `GET inbox` (items), `GET inbox/count`, `POST inbox/seen`.
- The bootstrap carries the brand's `requires_approval`.

### 9.3 Words

- Every new word in the five bundles (en, ru, de, fr, es), with the release-3 bundle tests (same key set, `{{…}}`
  kept, counts that never need a plural form).
- Built-in day names: one key per day id in the portal bundles; the server keeps the English names for the AI. A test
  ties the two lists (every server id has a portal key, none extra), as release 2C tied `content.brand.gap` to `GAPS`.
- New error families with codes and sentences in five languages: `keydate`, `idea`, `template`, `approval`, `comment`,
  `inbox`. The portal checks limits first (31 days, 1,000 key dates, 100 templates, 2,000 characters), so a refusal
  names the limit.

## 10. Testing and release checks

- **PHP:** a feature test per endpoint and rule; staff and manager under the switch on and off; the word change that
  sends an approved post back; repeat with rewording; the inbox for each role. **Holiday tests:** every country's
  public holidays for 2026, 2027 and 2028 against the official lists (Appendix A), including the substitute days
  (GB Boxing Day 2026 → Mon 28 Dec; GB Christmas 2027 → Mon 27 and Tue 28 Dec; GB New Year 2028 → Mon 3 Jan; US New
  Year 2028 observed Fri 31 Dec 2027; LV 18 Nov 2028 → Mon 20 Nov), and the marketing days by country.
- **Frontend (vitest, node, no DOM):** pure helpers for the menu, the board's moves and columns, blanks, key-date
  chips per day, the bell's count; render tests for the new sections and panels; the bundle tests.
- **Release checks (each half):** every PHP suite folder by folder; the frontend suite (`tsc -b`, vitest, lint at its
  baseline); the build check; the Appointments pixel comparison (expected: **no screen differs**); Lighthouse on the
  Plan, Ideas, Brand and the panel; one browser pass on a temporary brand in local org 16 (4b signs in as a manager
  and as a staff member); eyes on every screenshot at 1440 and at 390.

## 11. Rollout

Feature branch `feature/content-workspace` (worktree `../Hexa-Tech-content`).

- **4a:** Plan **4A-1** (server: key dates and the holiday rule table, the plan endpoint, ideas, idea posts, templates
  and their AI, key dates in the AI's context), Plan **4A-2** (portal: the "+" menu, chips and cards, the Key dates and
  Templates sections, the Ideas page, quick capture and **I**, the panel's Template menu and blanks line; release
  checks; deploy). Three migrations.
- **4b:** Plan **4B-1** (server: the approval rule and events, comments, the inbox and reads), Plan **4B-2** (portal:
  the Approvals section, Send for approval / Approve / Send back, chips, the timeline, the bell; release checks;
  deploy). Four migrations.

Each half: final whole-branch review with one fix pass, then one deploy by the source-patch recipe after the owner's
"yes, deploy", verified by content. 4b starts after 4a is live.

## 12. Not in release 4

Connected social accounts and auto-publishing; email notices; mentions and attachments; regional holidays (German
states, Spanish regions, Scotland and Northern Ireland); a bell across brands; a built-in template library; holidays
for countries beyond the nine.

## Appendix A — Public holidays (rule table)

Easter Sunday: 5 April 2026, 28 March 2027, 16 April 2028 (Gregorian computus). "E±n" = n days from Easter Sunday.
"Substitute" = when the day falls on a Saturday or Sunday, the next weekday not already a holiday is a holiday.

| Country | Holidays |
|---|---|
| **GB** (England and Wales) | New Year's Day 1 Jan (substitute); Good Friday E−2; Easter Monday E+1; Early May bank holiday — first Mon of May; Spring bank holiday — last Mon of May; Summer bank holiday — last Mon of Aug; Christmas Day 25 Dec (substitute); Boxing Day 26 Dec (substitute) |
| **IE** | New Year's Day 1 Jan; St Brigid's Day — first Mon of Feb, or 1 Feb when that is a Friday; St Patrick's Day 17 Mar; Easter Monday E+1; May bank holiday — first Mon of May; June bank holiday — first Mon of Jun; August bank holiday — first Mon of Aug; October bank holiday — last Mon of Oct; Christmas Day 25 Dec; St Stephen's Day 26 Dec |
| **DE** (national) | New Year's Day 1 Jan; Good Friday E−2; Easter Monday E+1; Labour Day 1 May; Ascension Day E+39; Whit Monday E+50; Day of German Unity 3 Oct; Christmas Day 25 Dec; Second Day of Christmas 26 Dec |
| **FR** | New Year's Day 1 Jan; Easter Monday E+1; Labour Day 1 May; Victory in Europe Day 8 May; Ascension Day E+39; Whit Monday E+50; Bastille Day 14 Jul; Assumption 15 Aug; All Saints' Day 1 Nov; Armistice Day 11 Nov; Christmas Day 25 Dec |
| **ES** (national) | New Year's Day 1 Jan; Epiphany 6 Jan; Good Friday E−2; Labour Day 1 May; Assumption 15 Aug; National Day of Spain 12 Oct; All Saints' Day 1 Nov; Constitution Day 6 Dec; Immaculate Conception 8 Dec; Christmas Day 25 Dec |
| **LV** | New Year's Day 1 Jan; Good Friday E−2; Easter Sunday E+0; Easter Monday E+1; Labour Day 1 May; Restoration of Independence Day 4 May (substitute); Whitsunday E+49; Midsummer Eve (Līgo) 23 Jun; Midsummer Day (Jāņi) 24 Jun; Proclamation Day 18 Nov (substitute); Christmas Eve 24 Dec; Christmas Day 25 Dec; Second Day of Christmas 26 Dec; New Year's Eve 31 Dec |
| **LT** | New Year's Day 1 Jan; Restoration of the State Day 16 Feb; Restoration of Independence Day 11 Mar; Easter Sunday E+0; Easter Monday E+1; Labour Day 1 May; Mother's Day — first Sun of May; Father's Day — first Sun of Jun; St John's Day 24 Jun; Statehood Day 6 Jul; Assumption 15 Aug; All Saints' Day 1 Nov; All Souls' Day 2 Nov; Christmas Eve 24 Dec; Christmas Day 25 Dec; Second Day of Christmas 26 Dec |
| **EE** | New Year's Day 1 Jan; Independence Day 24 Feb; Good Friday E−2; Easter Sunday E+0; Spring Day 1 May; Pentecost E+49; Victory Day 23 Jun; Midsummer Day 24 Jun; Restoration of Independence Day 20 Aug; Christmas Eve 24 Dec; Christmas Day 25 Dec; Second Day of Christmas 26 Dec |
| **US** (federal) | New Year's Day 1 Jan; Martin Luther King Jr. Day — third Mon of Jan; Washington's Birthday — third Mon of Feb; Memorial Day — last Mon of May; Juneteenth 19 Jun; Independence Day 4 Jul; Labor Day — first Mon of Sep; Columbus Day — second Mon of Oct; Veterans Day 11 Nov; Thanksgiving Day — fourth Thu of Nov; Christmas Day 25 Dec. **Observed:** a fixed-date holiday on a Saturday is observed the Friday before, on a Sunday the Monday after (New Year's Day on a Saturday is observed on 31 Dec of the year before). |

GB's substitute rule applies to the days marked; when Christmas Day and Boxing Day both fall on a weekend, they take
the Monday and Tuesday after. Substitute and observed days show as their own chip ("Boxing Day (substitute day)").

## Appendix B — Marketing and industry days

### B.1 Marketing days (all nine countries unless a country is named)

| Day | Date |
|---|---|
| Valentine's Day | 14 Feb |
| International Women's Day | 8 Mar |
| Mother's Day | GB, IE: E−21 (Mothering Sunday); US, DE, LV, EE: second Sun of May; ES: first Sun of May; FR: last Sun of May, or the first Sun of June when Pentecost (E+49) falls on it; LT: public holiday (Appendix A) |
| Father's Day | GB, IE, US, FR: third Sun of June; ES: 19 Mar; LV: second Sun of Sep; EE: second Sun of Nov; LT: public holiday; DE: none (Ascension Day) |
| Easter Sunday | where it is not a public holiday (GB, IE, US, DE, FR, ES) |
| Halloween | 31 Oct |
| Black Friday | the day after the fourth Thu of Nov |
| Christmas Eve | 24 Dec, where it is not a public holiday |
| New Year's Eve | 31 Dec, where it is not a public holiday |

### B.2 Industry days (by the organisation's industry, `Organization::INDUSTRIES`)

| Day | Date | Industries |
|---|---|---|
| World Health Day | 7 Apr | medical, fitness |
| World Heart Day | 29 Sep | medical, fitness |
| World Mental Health Day | 10 Oct | medical |
| International Day of Yoga | 21 Jun | fitness, beauty |
| Global Wellness Day | second Sat of Jun | beauty, fitness, hotel |
| Global Running Day | first Wed of Jun | fitness |
| World Tourism Day | 27 Sep | hotel, restaurant |
| World Food Day | 16 Oct | restaurant |
| World Book and Copyright Day (UNESCO; not the UK and Irish "World Book Day" in March) | 23 Apr | education |
| International Literacy Day | 8 Sep | education |
| World Teachers' Day | 5 Oct | education |
| World Intellectual Property Day | 26 Apr | legal |
| Human Rights Day | 10 Dec | legal |
| World Habitat Day | first Mon of Oct | real_estate |
| Micro, Small and Medium-sized Enterprises Day | 27 Jun | services, legal, other |
