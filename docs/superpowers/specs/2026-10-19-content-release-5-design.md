# HexaTech Content, release 5: post it and measure it

Status: approved in conversation, section by section (2026-10-19). Follows release 4 (4b live as prod main
`2fe1d4dba`, feature tip `8a05dade1`). Release 5 ships in two halves, **5a "post it"** and **5b "measure it"**, each
with its own plans, final review and deploy.

## 1. Summary

Release 5 helps a team put a planned post out, and shows whether it worked:

- **5a — post it:** **versions per platform** (one click makes linked sibling posts for other platforms, the text
  adapted by AI or copied); **who posts it** on every post; **reminders** in the "For you" bell on the post's day and
  for posts not marked as posted; an opt-in **morning email** with the day's posts.
- **5b — measure it:** **tracked links** (a post's Link becomes a short link on the public host that adds UTM tags and
  counts clicks by day); a **link-in-bio page** per brand with the manager's buttons and the latest posts that have a
  link.

Still planning only: no connected social accounts, no auto-publishing.

## 2. Decisions (owner, 2026-10-19)

| # | Decision |
|---|---|
| D1 | **Two deploys.** 5a = versions per platform, who posts it, reminders, morning email. 5b = tracked links and the link-in-bio page. One spec; each half has its own plans, review and deploy. 5b starts after 5a is live. |
| D2 | **Versions are linked sibling posts.** Each version is a normal post with its own day, status, approvals and comments; a group id ties them together. |
| D3 | **Reminders reach people in the bell and by an opt-in morning email** (8 am venue time). This replaces release 3's "no email notices" (release-3 spec D1, release-4 D7) for this one email only. No push notifications. |
| D4 | **A "Who posts it" field.** The reminder goes to that person; when nobody is set, to the brand's managers. |
| D5 | **Short link + clicks.** A post's Link becomes a short link that adds UTM tags and counts clicks; no cookies, no IP addresses, bots skipped. |
| D6 | **Link-in-bio = buttons + latest posts**, one public page per brand. |
| D7 | **Content owns small, separate pieces** (approach A): a group id and a poster on posts, reminders built from the posts themselves, Content's own links table with daily counters, a small Blade page on the public host. No platform-wide link service, no landing-builder page type, no per-click records. |
| D8 | **Rule change from release 4b:** while approvals are on, a post's own poster may mark it published once it is Approved or Ready to publish (§4.4). |
| D9 | **Bio address `sites.hexa-tech.uk/links/{name}`**, its own namespace; `links` joins the reserved landing names. |

## 3. Versions per platform (5a)

### 3.1 Making versions

- The post panel gets a **Versions** section. **Make versions…** opens a dialog: tick platforms (the brand's
  platforms, `boot.platforms`, minus those already in the group, the post's own included) and choose **Adapt with
  AI** (the default while the AI budget is not used up; unavailable when it is) or **Copy as is**.
- One new post per ticked platform is created at once, in one transaction. Each version:
  - starts as **Draft**, on the original's day and time (no day if the original has none);
  - copies `pillar_id`, `audience_id`, `campaign_id`, `strategy_id`, `language`, `topic`, `title`, `goal`, `format`,
    `cta`, `funnel_stage`, `post_type`, `weekday_role`, `strategic_reason`, the text (`hook`, `main_copy`,
    `short_copy`, `hashtags`), the **poster** (§4.1) and, from 5b, the **Link** address (§5.1, with its own code);
  - gets its own copy of the original's visual brief and picture, so a later change to one does not change the other;
  - does not copy status, `published_url`, `published_at`, `series_id`, comments or events;
  - has `created_by` = the person who made it and `generated_by` = `version`.
- **Who:** anyone who can edit the post (staff and managers). Versions are drafts, so approvals do not stop them.

### 3.2 The group

- `content_planner_posts.group_id` holds the original post's id, as `series_id` does for repeats (no foreign key).
  Making the first versions sets the original's `group_id` to its own id.
- **One version per platform** in a group: a platform already in it is refused (`version_exists`, 409).
- **Unlink** (`DELETE posts/{id}/group`) clears that post's `group_id`; when one post is left, its `group_id` is
  cleared too.
- **Deleting a post** leaves the others grouped; the group id stays as an opaque key even when the original is gone.
- **Duplicate** does not copy `group_id`; repeat copies do not carry it (it is not in `ContentRepeat::COPIED`).
- A post can be in a group and in a repeat series at once.

### 3.3 AI adapting

- Runs in the background, as rewording repeat copies does (`RewriteRepeatCopies`): the versions appear at once with
  the original's text, and the panel says "Adapting for LinkedIn…" on each one not yet adapted. A queued job adapts
  one version per run and dispatches itself for the rest.
- Before each AI call the job checks the budget (`ContentAiGate::allow`); when it is used up, the versions not yet
  adapted keep the copied text and the panel says so ("The AI budget ran out; this version keeps the original text").
- The job saves a version only if nobody has edited it meanwhile (`updated_at` unchanged).
- A new adapter (`adapt(ContentPlannerPost $source, string $platform)`, mirroring `ContentRepeatRewriter`) asks for
  `hook`, `main_copy`, `short_copy`, `cta`, `hashtags` in the post's language, with the target platform's rules and
  the brand context (`ContextBuilder`), and trims the answer to the column limits.
- The platform rules move out of `ContentPostGenerationService::getPlatformRules` (protected) into one shared place
  used by both the generator and the adapter; the text of the rules does not change.
- Each adaptation is one AI call, charged to the organisation's `content` usage like every other.

### 3.4 What everyone sees

- **Panel:** the Versions section lists one chip per post in the group (platform, status, day); this post is marked;
  a chip opens that version in the panel. Under it, Make versions… and Unlink. A group of one is not shown.
- **Cards** (Plan, Ideas, Posts) carry `group_size`; from 2, a small mark says "1 of 3 versions" (screen readers hear
  the whole phrase).
- Each version is a normal post everywhere else: its own day, status, approvals, comments and repeat. Sending one for
  approval does not send the others.

## 4. Who posts it and reminders (5a)

### 4.1 The field

- `content_planner_posts.poster_id` (FK users, null on delete), optional, starts empty.
- Shown in the panel's field grid beside Status, as a select: "Not set" + the team. The schedule dialog (Ideas →
  Schedule) asks for it too.
- The team comes from `GET team`: active staff (`Staff.is_active`) of the organisation who can use this brand (no brand
  rows on the user, or a row for this brand), each `{id, name, role}` (`manager` | `staff`), sorted by name. No email,
  no phone.
- Anyone who can edit the post may set or clear it, to anyone on that list; any other id is refused (422).
- **Not a change of words:** changing who posts it never sends an approved post back to review.
- A poster who has left (user deleted → null) or whose staff row is inactive counts as **not set** everywhere: the
  panel shows "Not set" and the reminders go to the managers.

### 4.2 Who is reminded

For each post: its poster when set (and active); otherwise every manager (`ContentAccess::canManage`) who can use the
brand.

### 4.3 Reminders in the bell

Two new kinds in the "For you" bell (release-4 spec §8), built from the posts on each read, with no new table:

| Kind | Which posts | Appears | Words |
|---|---|---|---|
| `to_post` | `scheduled_date` = venue today, status not `published`/`skipped`/`archived` | from the start of the day, or from its `scheduled_time`, venue time | "To post today: {post}", below it the time ("at 18:00") and, when the status is not Approved or Ready to publish, the status ("Still a draft") |
| `not_posted` | `scheduled_date` in the 7 days before today, same statuses | at once | "Not marked as posted: {post}", below it the day it was due |

- For the person §4.2 names, for the current brand, as the other kinds are.
- They stay until the post is marked published, skipped, archived or moved to another day (a move to today or later
  turns `not_posted` into `to_post` or removes it until its day). Like "Waiting for approval", they count toward the
  bell's number while they last, and are highlighted when newer than `seen_at`.
- `at` = the moment the item appears (the day's start or its time, as an ISO timestamp in venue time); items sort with
  the others, newest first, inside the 50-item cut.
- Each line opens its post in the panel.

### 4.4 Marking published (rule change from 4b)

While the brand's approvals are on, a staff member may mark a post published **only when they are its poster and its
status is `approved` or `ready_to_publish`**. Every other staff case keeps release 4b's refusal (`needs_approval`,
403). Managers are unchanged. The panel shows Mark published to the poster in those two statuses; the publish URL stays
optional.

### 4.5 Morning email

- **Opt-in** per person, off by default: `users.wants_content_morning_email` with
  `users.content_morning_email_last_sent_at`, as the loyalty and engagement digests store theirs. A switch in Content's
  menu ("Morning email: today's posts"); the bootstrap carries its state; the full-admin preferences endpoint
  (`PUT admin/me/preferences`) accepts it too.
- **Sending:** `content:send-morning-email`, hourly, `withoutOverlapping`. For each opted-in staff user with an email
  and an active staff row: skip unless it is 8 am in the venue's time zone (the same clock as Content's "today",
  `VenueClock`), and skip if already sent today (venue day). The email is queued (`ShouldQueue`); the stamp is set when
  it is queued.
- **Contents:** for each brand the person can use, the `to_post` posts §4.2 gives them (time, platform, title or hook,
  status), each linking to the post in Content (switching to its brand), and one line per brand counting their
  `not_posted` posts ("2 earlier posts are not marked as posted"). A button opens Content. The footer says where to
  switch the email off.
- **Nothing due → no email** (and no stamp).
- **Language:** the user's `language` when it is one of en, ru, de, fr, es; otherwise English.

## 5. Tracked links (5b)

### 5.1 The Link and its short link

- Posts get an optional **Link** (the address readers should go to) next to CTA: `http` or `https` only, up to 2,000
  characters (`bad_link`, 422, otherwise).
- Saving a post with a Link creates its short link once: `sites.hexa-tech.uk/go/{code}`, `code` = 7 characters from
  `abcdefghijkmnpqrstuvwxyz23456789` (no 0/o, 1/l), random, unique (retry on a clash).
- **Changing the address keeps the code**, so a link already posted leads to the new place. **Clearing it switches the
  code off**; the short link then answers 404 with a plain page saying "This link is no longer active" (§5.3).
  Entering an address again switches the same code back on.
- **Each post its own code:** versions, repeat copies and duplicates copy the address and get their own code, so
  clicks are counted per platform and per post.
- **Deleting a post keeps its short link working** (the link row loses its post, keeps its address), because the link
  may already be out in the world.
- **A change of words:** changing the Link of an approved post counts like changing its CTA (release-4 spec §6.2).

### 5.2 UTM tags

Worked out when the link is saved, and again when the post's platform or campaign changes:

| Tag | Value |
|---|---|
| `utm_source` | the post's platform (`instagram`, …); `link-in-bio` for bio buttons |
| `utm_medium` | `social` |
| `utm_campaign` | the post's campaign name as a slug when it has one; otherwise `content-plan` |
| `utm_content` | `post-{id}`; `button` for bio buttons |

A tag the address already carries is never overwritten; the address's own query and `#fragment` are kept.

### 5.3 The redirect

- `GET /go/{code}` on the public host (`config('landing.host')`), in the landing route group: no session, no cookies,
  the landing security headers, the host's limit of 120 a minute. `LandingHostGuard::ALLOWED` gains
  `#^go/[a-z2-9]{7}$#`.
- A live code answers **302** to the address with its UTM tags, `Cache-Control: no-store`. A switched-off code (its
  address cleared, its button removed) answers 404 with a plain page, "This link is no longer active", in the brand's
  Content language (§6.2's rule). An unknown code answers the host's normal 404.
- `?via=bio` marks a tap from the bio page (§6.2); anything else counts as direct.

### 5.4 Counting

- `content_link_clicks`: one row per link, venue day (the link's organisation) and source (`direct` | `bio`), raised by
  one in a single upsert (`ON CONFLICT … DO UPDATE`).
- **Not counted** (still redirected): HEAD requests, and user agents that match the bot list — link-preview robots
  (`facebookexternalhit`, `Facebot`, `Twitterbot`, `LinkedInBot`, `WhatsApp`, `TelegramBot`, `Slackbot`,
  `Discordbot`, `Pinterest`, `Applebot`) and anything with `bot`, `crawl`, `spider`, `preview` or `headless`.
- **Never stored:** IP addresses, cookies, user agents, referrers. Counts are taps, not people: the portal says
  "clicks", never "people" or "visitors".

### 5.5 What everyone sees

- **Panel:** under the Link field, the short link with **Copy**, the total clicks and how many came from the bio page,
  and a row of bars for the last 14 venue days (each bar labelled for screen readers with its day and count).
- **Cards** carry `clicks` (total); from 1, a small click count.
- Before the first save, the panel says the short link appears once the post is saved.

## 6. The link-in-bio page (5b)

### 6.1 Address

- `sites.hexa-tech.uk/links/{name}`, one page per brand. `LandingHostGuard::ALLOWED` gains `#^links/[a-z0-9-]+$#`;
  `links` joins `config('landing.reserved_slugs')`.
- **Default name:** the brand's landing-page slug when it has one and the name is free, otherwise one made from the
  brand's name (`brands.slug`, with `-2`, `-3`… on a clash).
- **Rules:** `LandingSlug::isValid` (3–63 lowercase letters, digits, single hyphens), not reserved
  (`LandingSlug::isReserved`), unique among bio pages (`bio_name_invalid` 422, `bio_name_taken` 409).
- **Changing the name:** the old address stops working (no redirect); the editor warns before saving.

### 6.2 The page

- Mobile first, at most 480 px wide, centred on wider screens.
- **Head:** the brand's logo (`brands.logo_url`, then `organizations.logo_url`, then the title's initials), the title
  (the brand's name by default, up to 60 characters) and an optional line (up to 160 characters).
- **Buttons:** up to 8 (`too_many_buttons`, 422), each a label (up to 40 characters) and an address, at least 48 px
  tall, in the brand colour (`brands.primary_color`, then Content's accent) with white text when its contrast is at
  least 3:1, otherwise the ink colour (the owner's admin button rule). Each button is a tracked link (§5) with
  `utm_source=link-in-bio`.
- **Latest posts** (a switch, on by default): up to 12 posts with status `published` whose short link is on, newest
  `published_at` first, **one per version group** (the newest published in it). A tile shows the post's picture when
  its visual brief has a ready image, otherwise its title or hook, with the date it was published; it links to the
  post's short link with `?via=bio`.
- **Words** ("Latest posts", alt texts) in the brand's Content language when it is one of the five, otherwise English.
- `<title>` = the title; meta description = the line; `og:title`, `og:image` (the logo).
- **Off by default.** While off, the address answers the host's normal 404.

### 6.3 How it is served

- A Blade page with its own same-origin stylesheet; the brand colour goes in through a nonce'd `<style>` block (the
  landing CSP: `style-src 'self' 'nonce-…'`). No scripts, no session, no cookies; `{{ }}` only.
- `Cache-Control: public, max-age=300`, as landing pages: a newly published post appears within five minutes.
- Read across tenants by name, as `LandingPageController::show` does.

### 6.4 Editing it (Brand page)

- A **Link-in-bio** section on the Brand page, after Channels.
- **Managers:** on/off; name, with the full address and **Copy**; title; line; buttons (add, edit, move up and down,
  remove); "Show latest posts"; each button's clicks for the last 30 venue days; **Open page** while it is on.
- **Staff:** the address with Copy, while it is on; nothing to edit.
- One save sends the page and its buttons; a button keeps its code across saves while it exists. Removing a button
  switches its code off.

## 7. Data, endpoints, words

### 7.1 Migrations (all additive)

**5a (2):**
1. `content_planner_posts`: `group_id` unsigned big integer null, indexed (no FK); `poster_id` (FK users, null on
   delete) null, indexed.
2. `users`: `wants_content_morning_email` boolean default false; `content_morning_email_last_sent_at` timestamp null.

**5b (4):**
1. `content_links`: `id`, `organization_id` (FK), `brand_id` (FK, null on delete) null, `post_id` (FK posts, null on
   delete) null and unique, `code` varchar(7) unique, `destination` varchar(2000) null (null = off), `utm` json null,
   timestamps.
2. `content_link_clicks`: `link_id` (FK, cascade), `day` date, `via` varchar(6), `clicks` unsigned integer; unique
   (`link_id`, `day`, `via`).
3. `content_bio_pages`: `id`, `organization_id` (FK), `brand_id` (FK), `planner_profile_id` (FK, cascade) unique,
   `slug` varchar(63) unique, `is_on` boolean default false, `title` varchar(60) null, `line` varchar(160) null,
   `show_posts` boolean default true, timestamps.
4. `content_bio_buttons`: `id`, `bio_page_id` (FK, cascade), `link_id` (FK links, cascade), `label` varchar(40),
   `position` small integer; index (`bio_page_id`, `position`).

### 7.2 Endpoints (under `/api/v1/admin/content`, brand in the query as today)

**5a:**
- `POST posts/{id}/versions` (`platforms` 1–7, `ai` boolean) → 201 `{post, versions: [card]}`; `version_exists`,
  `ai_budget_used_up` when `ai` and the budget is used up.
- `DELETE posts/{id}/group` → `{post}`.
- `GET posts/{id}` gains `group` (`{id, posts: [{id, platform, status, scheduled_date, scheduled_time}], adapting:
  [id], kept_original: [id]}` or null) and `poster` (`{id, name}` or null); cards gain `group_size` and `poster_id`.
- `POST posts`, `PUT posts/{id}` and the schedule call (`PUT posts/{id}/move`) accept `poster_id`.
- `GET team` → `[{id, name, role}]`.
- `GET inbox`, `GET inbox/count` include `to_post` and `not_posted`.
- `POST posts/{id}/mark-published`: the poster rule (§4.4).
- `PUT me/morning-email` (`on` boolean); the bootstrap's `staff` gains `morning_email`; `PUT admin/me/preferences`
  accepts `wants_content_morning_email`.

**5b:**
- `POST posts`, `PUT posts/{id}` accept `link` (address or null); `GET posts/{id}` gains `link` (`{code, short_url,
  destination, on, clicks, clicks_bio, days: [{day, clicks}]}` or null); cards gain `clicks`.
- `GET bio` → `{page, buttons: [{id, label, destination, short_url, clicks_30d}], url, suggested_name}`; `PUT bio`
  (managers) with `is_on`, `slug`, `title`, `line`, `show_posts`, `buttons: [{id?, label, destination}]` in order.
- Public host: `GET /go/{code}`, `GET /links/{name}`.

### 7.3 Words

- Every new portal word in the five bundles (en, ru, de, fr, es), with the bundle tests (same key set, `{{…}}` kept,
  counts that never need a plural form). The bell's kinds join `BELL_TEXT` and `content.bell.kind.*`.
- The morning email and the bio page use the server's `lang/{en,ru,de,fr,es}` files.
- New error families with codes and sentences in five languages: `version` (`version_exists`), `link` (`bad_link`),
  `bio` (`bio_name_taken`, `bio_name_invalid`, `too_many_buttons`); `changed_elsewhere`, `ai_budget_used_up`,
  `needs_approval` keep their words.

## 8. Testing and release checks

- **PHP (feature tests per endpoint and rule):** versions with AI on and off, the budget running out halfway, an
  edited version not overwritten, one per platform, unlink and delete; poster and team (inactive and departed staff,
  brand rows); the bell's `to_post` and `not_posted` for poster and managers, appearing at the time, ending on publish,
  skip and move; the poster marking published under approvals and everyone else still refused; the morning email
  (8 am venue time only, once a day, opt-in only, nothing due → none, poster vs managers, language); links (create,
  change keeps the code, clear switches off, copies get their own code, deleting the post keeps the link, UTM rules);
  bio editing (name rules, eight buttons, codes kept across saves).
- **Public host:** routing through `LandingHostGuard` for `/go/…` and `/links/…`; security headers and no cookies;
  302 and `no-store`; bots and HEAD not counted; an unknown code 404, a switched-off code 404 with "This link is no
  longer active"; direct vs bio counts; a bio page
  off → 404, on → buttons and one tile per group, only published posts with a live link.
- **Frontend (vitest, node, no DOM):** pure helpers for the versions dialog and chips, the poster select, the bell's
  new kinds, the click bars, the bio editor's limits; render tests for the new sections; the bundle tests.
- **Release checks (each half):** every PHP suite folder by folder; the frontend suite (`tsc -b`, vitest, lint at its
  baseline); the build check; the Appointments pixel comparison (expected: **no screen differs**); Lighthouse on the
  Plan, Ideas, Brand and the panel, and for 5b the public bio page; one browser pass on a temporary brand in local org
  16 as a manager and as a staff member; eyes on every screenshot at 1440 and 390, and the bio page at 360.

## 9. Rollout

Feature branch `feature/content-workspace` (worktree `../Hexa-Tech-content`).

- **5a:** Plan **5A-1** (server: versions and the adapter job, the shared platform rules, poster and team, the bell's
  new kinds, the poster rule, the morning email and its switch), Plan **5A-2** (portal: the Versions section and
  dialog, card marks, the poster select in the panel and the schedule dialog, the bell's words, the email switch;
  release checks; deploy). Two migrations.
- **5b:** Plan **5B-1** (server: links and UTM, the redirect and counting, the bio page and its editor endpoints, the
  host guard), Plan **5B-2** (portal: the Link field and its clicks, card counts, the Link-in-bio section; release
  checks; deploy). Four migrations.

Each half: final whole-branch review with one fix pass, then one deploy by the source-patch recipe after the owner's
"yes, deploy", verified by content (5b also by `/go/` and `/links/` answers on the public host).

**Checked while planning:** that copying a visual brief cannot let one post's deletion remove a picture the other
still uses; where the brand's Content language lives for the bio page; that a post link in the email switches Content
to the post's brand; which fields `ContentApproval` treats as a change of words (poster no, Link yes).

## 10. Not in release 5

Connected social accounts and auto-publishing; push notifications; per-click records; custom short-link domains; QR
codes; bio page themes; an unsubscribe link in the morning email (it says where to switch it off); sending all versions
for approval at once.
