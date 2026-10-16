# HexaTech Content — Release 3: Fast Wins — Design

Status: approved in conversation, section by section (2026-10-15). Follows release 2 (live as prod main `a9483b428`).
Earlier spec: `docs/superpowers/specs/2026-10-14-content-workspace-design.md` (its rules still bind).

## 1. Purpose

HexaTech Content plans and writes a venue's social posts with AI. Release 3 makes daily planning faster and keeps owners
posting regularly, using ideas from Buffer and Zoho Social that need **no connection to the social networks**, and it
clears everything left open by release 2.

- **For whom:** venue owners and managers (beauty, medical, fitness, hotels, restaurants, services…); staff write posts.
- **Success:** a post is started from any day in one click; times are sensible without thinking; hashtags and recurring
  lines are one click away; owners see how they keep up with their own weekly targets; evergreen posts repeat without
  rework; no known release-2 item remains open.

## 2. Decisions (owner, 2026-10-15)

| # | Decision |
|---|---|
| D1 | **Planning first.** No connected social accounts and no auto-publishing in releases 3–5; publishing becomes its own later project. |
| D2 | **Three releases.** 3 = fast wins (this spec); 4 = planning together (key dates, ideas board, templates, approvals and comments); 5 = reach and results (versions per platform, reminder to post, tracked links and bookings, link-in-bio). CSV import/export: not planned. Each release has its own spec, plan, review and deploy. |
| D3 | **Do all remaining release-2 items**, including the three owner items: Appointments' phone menu, the two platform marks under 4.5:1, Find's "Nothing matches" while searching. Release 3 may change Appointments on purpose, only where §3.1 says. |
| D4 | **Click-to-add:** clicking empty space in a day, or its "+", opens a new post for that day (§4). |
| D5 | Features in release 3: click-to-add, best-time hints with a channel's usual time, hashtag groups and snippets, posting goals and streaks, repeat posts. |

## 3. Leftovers and fixes

### 3.1 Owner items

1. **Phone menu sizes to its content in both workspaces.** `WorkspaceShell`'s fitted phone menu (`w-max min-w-56
   max-w-[calc(100vw-2rem)]`, today opt-in as `menuFits`) becomes the only behaviour; the `menuFits` prop goes.
   Appointments' three phone-menu screens change on purpose (English ~6 px wider, Russian no longer 10 px past the
   screen). The Appointments pixel comparison must show exactly `phone-menu-light`, `phone-menu-dark` and
   `phone-menu-ru` differing, and nothing else.
2. **Platform marks reach 4.5:1 in Content.** In `theme/content.css` four fills deepen slightly, white ink stays:

   | Platform | Was (white) | Becomes (white) |
   |---|---|---|
   | Facebook | `#1877F2` (4.23:1) | `#1870E8` (4.64:1) |
   | Instagram | `#E1306C` (4.34:1) | `#D72864` (4.80:1) |
   | YouTube | `#FF0000` (4.00:1) | `#E60000` (4.81:1) |
   | Email | `#8B5CF6` (4.23:1) | `#8252F0` (4.76:1) |

   LinkedIn (5.69:1) and X (18.5:1) keep white; TikTok and Blog keep their dark ink (12.7:1, 8.3:1). The colour test's
   mark rule becomes "a mark's ink reads at least 4.5:1 on its fill" (it was 3:1).
3. **Find shows no "Nothing matches" while a search is on its way.** In the shared `FindFrame`, the empty line shows
   only when nothing is waiting. Appointments' client Find gets the same behaviour.

### 3.2 Server

- A post never stores a time without a day: on create and on update, when the resulting `scheduled_date` is null,
  `scheduled_time` is null (today only a request that names `scheduled_date: null` clears it).
- Search terms are literal: `%`, `_` and `\` in Find and in the Posts search are escaped (`ContentPlan::search`).
- The strategy job's AI usage rows carry the strategy's brand (today `brand_id` is null for them).
- One list of manager roles: `AccessMap::MANAGER_ROLES` is the single definition; `ContentAccess` and
  `SetupAccess` use it.
- Quick setup re-checks "already set up" after taking its lock (refuses `already_set_up` if a run just finished).
- A failed strategy job stores a fixed sentence in its summary ("The strategy could not be made. Please try again.");
  the exception stays in the log.
- `StrategyTest`'s lock test binds a strategy-service mock that must not be called.
- Missing tests are added for the image and visual-brief endpoints (gate, isolation, budget, usage recorded).

### 3.3 Portal

- **Unscheduled tray over 100 posts** says so ("Showing 100 of N") with "See all" opening Posts filtered to
  Unscheduled. The plan endpoint returns the total of unscheduled posts beside the 100 it lists.
- **Brand changes mid-flight:** a Fill that finishes after a brand switch opens nothing (the post belongs to the
  brand it was made in); a mid-session fallback to another brand closes the panel and reads the plan fresh.
- **Post links:** `/content/posts/:id` links carry the brand (`?brand_id=`), and the panel gets **Copy link**.
- **Keyboard:** Shift+→ on Sunday (Shift+← on Monday) moves the card to the next (previous) week and shows that week
  with the card focused.
- **Strategy:** a finished generation refreshes the detail of every strategy in the cache; "stuck" is judged on the
  server's clock (the list answer carries the server's now); removing an audience posts use asks once (the second,
  in-use question is the only one); a failed `default_tone` sync after a Voice save is reported with the portal's
  words instead of passing silently.
- **Panel:** the post panel sits in its own `ContentErrorBoundary`.
- **Focus:** after a Brand save the server refuses, the keyboard goes to the first marked field (else Save).
- **Switched off:** an organisation with Content switched off that opens `/content` sees the calm notice of spec
  §8.2 (with the way back to the full admin), not a silent redirect to the dashboard.

## 4. Click-to-add

- **Week view:** clicking empty space in a day (not a card, a slot or a button) opens a new post for that day. A "+"
  button sits at the foot of each day: shown on hover and keyboard focus, always shown where hovering is not possible
  (`@media (hover: none)`). Its name: "New post on {{day}}".
- **Month view:** the date number keeps opening that week; empty space in a cell, or its corner "+", opens a new post.
- **List view:** a "+" at the end of each day's header.
- **Past days** (before the venue's today) have no "+" and ignore clicks. The panel's date field still takes any date.
- **What the new post starts with:** the platform of the day's first open slot; else the brand's first active channel;
  else the first platform. The time is that channel's usual time (§5). Nothing is saved until Save. A click that ends
  a drag does not count (existing `consumeClick`).
- **Who:** everyone.
- Release 4 will turn the "+" into a small menu (post, note, key date); release 3 keeps it a single action.

## 5. Best-time hints and a channel's usual time

- **Suggested times** live in one table in code (`content/lib/bestTimes.ts`, mirrored server-side in
  `App\Services\Content\BestTimes` for Generate and Fill): per platform, with industry overrides. The first time is
  the default usual time.

| Platform | Default | Overrides |
|---|---|---|
| instagram | 11:00, 19:00 | fitness 06:30, 18:00 · restaurant 11:00, 17:00 · hotel 10:00, 20:00 · medical 12:00, 19:00 |
| facebook | 09:00, 13:00 | beauty 10:00, 19:00 · fitness 06:30, 18:00 · restaurant 11:00, 17:00 · hotel 10:00, 20:00 · medical 09:00, 12:00 |
| linkedin | 08:00, 12:00 | — |
| tiktok | 18:00, 21:00 | — |
| x | 09:00, 12:00 | — |
| youtube | 15:00, 18:00 | — |
| blog | 10:00 | — |
| email | 10:00 | — |

  These are research-based starting points (as Buffer offers before it has data), not learned from the venue.
- **Usual posting time per channel:** new optional column `content_planner_channels.post_time` (`HH:MM`). The channel
  editor shows it with the suggested times as chips; empty means "the first suggested time".
- **Where it shows:** an empty slot reads "Best around {{time}}"; Write, Fill with AI and the "+" preset the channel's
  usual time; the panel's time field offers the platform's suggested times as one-click chips; posts made by Generate
  or Fill that come back without a time get the channel's usual time.

## 6. Hashtag groups and snippets

- **Brand page section "Hashtags and snippets":** hashtag groups (name + hashtags) and snippets (name + text: call to
  action, sign-off, address line). Everyone reads; managers add, edit, remove (`manager_only` otherwise).
- **Table `content_planner_snippets`:** `id`, `organization_id`, `brand_id`, `planner_profile_id`, `kind`
  (`hashtags` | `text`), `name` (≤ 60), `body` (≤ 2000), `sort_order`, timestamps. Brand isolation as every Content
  table; at most 50 of each kind per brand.
- **Endpoints:** `POST brand/snippets`, `PUT brand/snippets/{id}`, `DELETE brand/snippets/{id}` (managers); snippets
  come with `GET brand`. `POST brand/snippets/suggest` (managers): one AI call proposing 3–5 hashtag groups from the
  brand's pillars, audiences and industry; answers suggestions only, nothing saved; counts as feature `content`;
  refused at the budget cap like every AI action.
- **Post panel:** an **Insert** button beside Hashtags lists the groups; picking one adds its tags, skips ones already
  there (ignoring case), and warns past the platform's limit (Instagram 30; others: none). **Insert snippet** beside
  Text and Call to action puts the snippet at the cursor (at the end when the field has no cursor).

## 7. Posting goals and streaks

- **Target:** each active channel's `posts_per_week` (existing). Channels without a target are not counted. Posts carry
  a platform, not a channel, so progress is per platform: two active channels on one platform add their targets.
- **Progress (current venue week, Monday–Sunday):** per channel, posts **marked published** with `published_at` in the
  week, and "planned" = posts dated in the week, not published, not archived. Shown on the Plan under the This week
  strip: "Instagram: 2 of 3 published · 1 planned"; a tooltip says only posts marked published count.
- **Streak:** the number of consecutive completed weeks, newest first, in which every channel with a target met it;
  the current week adds one as soon as it is met. Weeks before the brand had any target do not break it. Look-back:
  52 weeks. A channel's target is read as it is now (history of targets is not kept).
- **At risk:** from Friday 00:00 on the venue's clock, while a streak of at least one week runs and the current week
  is not met: "{{count}} more posts by Sunday keep your {{weeks}}-week streak". Portal only.
- **Endpoint:** `GET goals` (everyone) → `{ week: {from, to}, platforms: [{platform, target, published, planned}],
  streak: {weeks, current_met, at_risk, short_by} }`, computed from posts on the venue's clock. No table.

## 8. Repeat posts

- **Panel:** on a saved post with a day, **Repeat**: every week / every 2 weeks / every month, until a date (≤ 12
  months after the post's day, ≤ 26 copies), and "Let the AI rewrite each copy".
- **Copies:** on the matching future dates (same weekday; same day of month, or the month's last day), with the post's
  platform, time, text, hashtags, call to action, pillar, audience, language, topic and hook. Status: the original's,
  except published or archived originals give `draft`. Each copy is an ordinary post; editing one changes only it.
- **Series:** new optional column `content_planner_posts.series_id` (the original's id). The panel shows "Repeats
  {{every}} until {{date}} · {{count}} more". **Stop repeating** deletes the series' future unpublished copies (asks
  with the count); published posts and the original stay.
- **Endpoints:** `POST posts/{id}/repeat` `{every: week|2weeks|month, until, ai_rewrite: bool}` → the copies made;
  `DELETE posts/{id}/repeat` → how many were removed. Everyone (everyone writes posts). A post already in a series
  answers `already_repeating`; a post without a day answers `no_day`; a range over the caps answers 422.
- **AI rewording:** a queued job rewrites each copy's text (one call per copy, at most 12 with AI; above 12 the
  request answers 422 for `ai_rewrite`). The budget is checked before each call; at the cap the job stops and keeps
  what is done. The Plan refreshes while the series rewrites (the same polling pattern as strategy generation).

## 9. Words, errors, accessibility

All new words in English, Russian, German, French and Spanish; every new refusal (`already_repeating`, `no_day`,
caps) has the portal's own sentence. The "+" buttons and chips are real buttons with names; goal pills have text, not
colour alone; contrast as in release 2 (tests on tokens).

## 10. Tests and release checks

- **Server** (`tests/Feature/Content/`): every new endpoint with the gate, brand and organisation isolation, manager
  rules, the budget refusal and usage recorded for AI; caps (26 copies, 12 months, 12 AI copies, 50 snippets);
  Stop repeating keeping published posts and the original; goals and streak maths on the venue's clock (week edges,
  weeks without targets, Friday at-risk); `post_time` defaulting in Generate and Fill; every §3.2 item.
- **Frontend:** click-to-add (past days, platform and time choice, nothing saved before Save, drag-click ignored);
  snippet insertion (de-duplication, cursor, the 30-tag warning); goals line and streak badge; repeat control and
  series line; every §3.1/§3.3 item; words in all five bundles.
- **Release checks:** every suite folder by folder; the build check; Appointments pixels against production with
  exactly the three intended phone-menu differences; Lighthouse on Plan, panel and Brand; one browser pass that writes
  on a temporary brand (click-to-add, a usual time, snippets, goals, a repeat series with Stop, the switched-off
  notice).

## 11. Rollout

Feature branch `feature/content-workspace` (worktree `../Hexa-Tech-content`). Plan **3A**: the leftovers (§3) and
the server for §4–§8. Plan **3B**: the portal for §4–§8, the release checks, the deploy. One deploy at the end, by the
source-patch recipe, after the owner's "yes, deploy". Three additive migrations (`post_time`, `content_planner_snippets`,
`series_id`) run with `migrate --force`; no existing row changes.

## 12. Later releases (for orientation, not designed here)

- **Release 4 — planning together:** key dates (notes, events, holidays) and the "+" menu; ideas board (the tray in
  stages, quick capture); templates per industry and pillar; approvals and comments.
- **Release 5 — reach and results:** versions per platform as linked posts with previews; reminder to post (email and
  in-app, copy-and-post, mark published); tracked links with clicks and bookings per post; link-in-bio page.
