# HexaTech Content, release 6: promote your website

Status: owner's answers in conversation (2026-10-20), then "do all necessary steps, no need approval, add all necessary
features" — the defaults below (D6–D14) are mine under that instruction and are listed in the final report. Follows the
production-queue release (prod main `504166b3c`, feature tip `85156069d`). One release, two plans (6-1 server, 6-2
portal, release checks and deploy), one final review, one deploy.

## 1. Summary

A brand's team can let Content read the brand's own website, then promote its pages on social channels:

- **The scan** reads the site (its sitemap, else its RSS feed, else its blog page), lists the **blog articles** and the
  **other pages** (services, prices, about…) with title, date, picture and summary, and writes a **company summary**
  that every AI call then reads (and fills the brand's empty summary, USP and mission).
- **Promote:** tick articles or pages, choose how many posts each, which channels, the period and the pace; Content
  spreads the posts over the channels' posting days, mixing the pages, and the AI writes each post from a different
  angle. Each post links to its page through its own **tracked short link** (release 5b) and carries the page's
  picture. The posts land on the Plan as **drafts**.
- **Each page shows** how many posts promote it, how many are published and how many clicks they brought, and offers
  **Remove draft posts** to undo a promotion.

Still planning only: no connected social accounts, no auto-publishing.

## 2. Decisions

| # | Decision | By |
|---|---|---|
| D1 | **Pages are found automatically**: the site's sitemap or blog page; the manager ticks the pages to promote. | owner |
| D2 | **Days by period and pace**: the manager picks a period and "at most N promotion posts a week"; Content spreads the posts over the channels' posting days, mixing the pages; they land on the Plan as drafts and move by drag, as any post. | owner |
| D3 | **One channel per post, taking turns** among the ticked channels; the Versions button makes more. | owner |
| D4 | **Scan in the background and keep the list** (approach 1): Content's own tables for the site, its pages and its promotions; both the scan and the writing run on the `ai` queue worker. | owner |
| D5 | **Other pages too**: the owner asked for posts "with links to our website relevant pages", so the list has two tabs, Blog articles and Other pages, and both promote the same way. | owner |
| D6 | **Where:** a new **Promote** page in Content's menu (after Posts) and a **Website** section on the Brand page (address, scan, company summary). Everyone sees both; managers scan, edit and promote. | default |
| D7 | **Company summary** goes into the AI's context for every Content AI call (a new "From the brand's website" section) and fills the brand's `brand_summary`, `usp` and `mission` **only where they are empty**. Managers can edit the summary; a new scan replaces it only when "Update the company summary" is ticked (ticked by default unless the summary was edited by hand). | default |
| D8 | **Posts per page 1–15 (10 to start), pace 1–21 a week (3 to start), up to 20 pages and 200 posts per press, a period of up to 183 days.** | default |
| D9 | **Links:** link-friendly platforms (Facebook, LinkedIn, X, YouTube, email) get the short link added after the text; Instagram and TikTok cannot click links, so their text points to the link in bio and the post still carries its short link (the bio page's latest posts link to it once published). The `blog` channel is not offered. | default |
| D10 | **Pictures:** the page's main picture (`og:image`) is copied once into Content's media store and becomes every promotion post's picture (on by default, a switch in the dialog). | default |
| D11 | **UTM:** a promotion post's short link carries `utm_campaign=promote-{page}` (its campaign's name when it has one, as before). | default |
| D12 | **Undo:** per page, **Remove draft posts** deletes its promotion posts still in Idea, Draft, Needs review or Needs visual; approved, ready and published posts stay. | default |
| D13 | **Manners:** the scan obeys robots.txt, names itself (`HexaTechContentBot`), reads one page at a time, at most about 130 pages per scan, public addresses only (no private networks), at most 20 scans per organisation a day. | default |
| D14 | **Re-promoting** a page is allowed any time; the AI is shown the hooks already written for it so it does not repeat them. | default |

## 3. The website and the scan

### 3.1 The address

- One website per brand profile (`content_sites`). It starts empty; the Website section and the Promote page suggest
  the organisation's `website` setting.
- The address is `http` or `https` with a host, up to 2,000 characters, no port other than 80/443, not an IP address in
  a private or reserved range, not `localhost` or a name without a dot (`bad_address`, 422). A host is plain letters,
  digits, dots and hyphens (an international name is kept in its ASCII form), lowercase, and no label of it is a number
  (`127.1`, `0x7f.1` are addresses in disguise) — final review: curl decodes `%`-escapes in a host before it applies the
  pin.
- **A path marks where the blog lives:** `https://example.com/blog` scans `https://example.com` and treats addresses
  under `/blog/` as articles and `/blog` as the blog page to read when the sitemap does not say.
- Changing the address keeps the list until the next scan, which replaces it (§3.4).

### 3.2 What the scan reads, in order

1. `robots.txt` on the site's origin: its rules for `HexaTechContentBot` (else `*`) and its `Sitemap:` lines.
2. **Sitemaps:** those `robots.txt` names (on the same site), else `/sitemap.xml`, `/sitemap_index.xml`,
   `/wp-sitemap.xml`, `/sitemap-index.xml`, the first that parses. A sitemap index is followed one level down; child
   sitemaps for categories, tags, authors, attachments and formats are skipped. At most 12 sitemap files and 5,000
   addresses are looked at. Gzip sitemaps are read.
3. **Without a sitemap:** the home page; its RSS or Atom feed (`<link rel="alternate">`), whose items are articles with
   title, date and description; its internal links; and, when one of them (or the address's path, §3.1) is a blog page,
   that page's internal links below it.
4. **Each kept address is read** (§3.3, §3.5) for its title, description, picture, date, language and main text.

### 3.3 Articles and pages

- **Article** when any of: the sitemap it came from names posts, blog, articles, news, journal or stories; the feed
  listed it; its path sits under a blog folder (`blog`, `news`, `articles`, `article`, `posts`, `post`, `insights`,
  `stories`, `journal`, `magazine`, `guides`, `resources`, `aktuelles`, `nachrichten`, `noticias`, `actualites`,
  `articulos`, `novosti`, `stati`, or the path from §3.1) one level or more below it; its path has a year and month
  (`/2024/05/…`); or, once read, it says so (`og:type=article`, `article:published_time`, or JSON-LD `Article`,
  `BlogPosting`, `NewsArticle`).
- **Page** otherwise. The blog page itself (`/blog`, `/blog/page/2`) is neither.
- **Never kept:** other hosts (the home page's final host and its `www.` twin count as the site); tag, category,
  author, search and paginated lists; feeds, `wp-json`, `wp-admin`, `wp-login`, cart, checkout, account, login and
  register pages; files (`.pdf`, images, video, archives, `.xml`, `.json`); addresses with `?` query strings other than
  a page id (`?p=`, `?page_id=`).
- **One language:** a multilingual site lists each page once per language (`/fr/…`, `/de/…`, `/ru/…`). The scan keeps
  the language of the address it was given: the bare site keeps the addresses without a language folder (when it has
  any besides the home page), `https://example.com/ru/` keeps the `/ru/` ones. A language folder alone is not a blog
  path (§3.1).
- **Which are read** (at most 130 in all, in this order): the home page and the key pages — paths naming about,
  services, prices, contact, team, FAQ, products or booking (and their usual Russian, German, French and Spanish
  words) — up to 30, by rank; then the 100 newest articles (by the sitemap's `lastmod` or the feed's date; undated last,
  in the file's order); then the other addresses, newest first, in the reads left. An address the sitemap does not type
  becomes an article when its page says so (owner's site, 2026-10-20: its articles sit at the root, without a blog
  folder, and declare `og:type=article`).

### 3.4 What is kept

- Per page (`content_site_pages`): address, kind, title (`og:title`, else `<title>`, else the first `<h1>`, else the
  address's last part), description (`og:description`, else the meta description), picture address (`og:image`, else
  `twitter:image`, made absolute; `https` only), date (`article:published_time`, else JSON-LD `datePublished`, else the
  first `<time datetime>`, else the sitemap's `lastmod` or feed date), language (`<html lang>`), and the main text (the
  `<article>`, else `<main>`, else the body without navigation, header, footer, aside, forms and scripts; whitespace
  folded; at most 20,000 characters).
- An address that cannot be read (or that robots.txt disallows) is not listed. The home page and the other pages are
  read before the articles, so the time limit (§3.5) never costs the company summary its sources.
- **A new scan replaces the list:** pages found again are updated; pages not found again are removed, except pages that
  have promotion posts, which stay with "Not found on the last scan".

### 3.5 Limits and manners

- Requests: `GET` only, one at a time, `User-Agent: HexaTechContentBot/1.0 (+{app url})`, 10 s each (5 s to connect),
  at most 4 redirects, each one checked again.
- **Public addresses only:** every host is resolved first and every address it resolves to must be public (no private,
  loopback, link-local, carrier-grade NAT, multicast or reserved IPv4/IPv6 ranges, no IPv4-mapped forms of them); the
  connection is pinned to the checked address, so a second lookup cannot point it elsewhere.
- Sizes: HTML up to 3 MB, sitemaps and feeds up to 10 MB (after gzip), pictures up to 5 MB; anything bigger is skipped.
  HTML must be `text/html` or `application/xhtml+xml`; pictures must be JPEG, PNG, WebP or GIF by their bytes.
- Pages are decoded to UTF-8 from the header's or the page's charset.
- `robots.txt`: `Allow`/`Disallow` with `*` and `$`, the longest match wins, an `Allow` wins a tie; a missing file (4xx)
  allows everything; a site that disallows `/` for us answers `site_blocked`.
- The reading stops after 420 seconds of the run; what was read is kept.
- At most 20 scans per organisation per day (`too_many_scans`, 429).

### 3.6 The company summary

- After the reading, when "Update the company summary" is ticked (§D7) and the AI budget is not used up: one AI call
  with the home page and the best-ranked other pages' text (at most 12,000 characters in all) and the brand's language.
- It asks for facts from the pages only: a summary of up to 400 words (what the company does, its services or products,
  who they are for, where, proof points, its tone), and a one-paragraph `brand_summary`, a `usp` and a `mission`.
- The summary is kept on the site (up to 6,000 characters); `brand_summary`, `usp` and `mission` are written to the
  profile only where they are empty; the brand's readiness is computed again.
- The budget used up, or the AI failing, does not fail the scan: the list is kept and the site says why the summary was
  not updated (`summary_note`: `ai_budget_used_up` | `ai_failed`).
- `ContextBuilder::build` gains a section "FROM THE BRAND'S WEBSITE (scanned {date})" with the summary, after the brand
  profile; every Content AI call reads it. The readiness check counts the site's address as the company website when
  the organisation has none.

### 3.7 Running the scan

- `POST site/scan` (managers; optional `url` saves the address first; `update_summary`). In one transaction with the
  site row locked: a scan already running answers `already_scanning` (409); the daily cap `too_many_scans` (429);
  otherwise the site becomes `scanning` with a new scan token and `scan_queued_at`, and `ScanContentWebsite` is queued
  on the `ai` queue (`tries` 1, `timeout` 600). Answers 202 with the site (where the queue is `sync`, the result).
- The job starts only if the token is still the site's; it sets `scan_started_at`, reads, saves, summarises, and sets
  `ready` (with counts and `scanned_at`) or `failed` with a code: `bad_address` (the host is not public),
  `site_unreachable` (neither a sitemap nor the home page could be read), `site_blocked`, `nothing_found`,
  `scan_failed` (anything else, reported).
- A scan reads as running while it waits (up to 1,800 s from `scan_queued_at`) and while its job runs (up to 660 s from
  `scan_started_at`); past either it reads as failed `scan_failed` and a new scan may start.
- While a scan runs, the address and the summary cannot be changed and nothing can be promoted (`scan_running`, 409).

## 4. Promoting pages

### 4.1 Choosing

On the Promote page a manager ticks articles and pages (both tabs), up to 20, and presses **Promote…**.

### 4.2 The dialog

- **Posts per page** (1–15, 10 to start); **channels** (the brand's active channels except `blog`, all ticked to start;
  at least one); **from** (tomorrow to start, never before the venue's today) and **to** (to start: as many weeks as
  the posts need at the pace, at most 183 days); **at most N a week** (1–21, 3 to start); **use the page's picture**
  (on); **instructions for the AI** (optional, up to 2,000 characters).
- Under the fields, the server's **preview** (`POST promotions/preview`, no AI, no writes) says
  "30 posts from 22 Oct to 30 Nov, at most 3 a week" or, when they do not fit, "Only 18 of 30 posts fit in these days:
  choose a longer period, a higher pace or fewer posts." Promote is disabled until they fit.

### 4.3 Spreading the posts (pure, `PromotionSchedule::plan`)

1. **Order:** round by round over the pages in the order shown (newest first): page 1's first post, page 2's first
   post, …, then the second posts, and so on.
2. **Slots:** every day of the period from the later of `from` and the venue's today, on every ticked channel that posts
   on that weekday (its `frequency`; a channel with no ticked day posts every day). A slot holds one post.
3. **Room:** each ISO week holds at most the pace; the posts that fit are the sum over the weeks of the smaller of the
   pace and the week's slots. When fewer fit than wanted, the preview says how many fit and Promote is refused
   (`period_too_short`, 422, with `fit`).
4. **Ideal day and turn:** post *k* of the *n* that fit has the ideal day `from + ⌊(k + ½) × days / n⌋`, so the posts are
   spaced evenly over the whole period; its turn's channel is channel number (page index + round) in the ticked order.
5. **Its slot:** the free slot (not taken in this promotion, its week under the pace) with the lowest score: days away
   from the ideal day, plus 3 when the slot's channel is not the turn's, plus 1 when this promotion already has a post
   that day, plus ½ when the brand already has another post on that channel that day. A slot on a day that already has
   a post for the same page is used only when no other slot is free. Ties go to the earlier day, then the ticked order.
   So the channels take turns even when they post on different weekdays.
6. **Time:** the channel's usual time (`BestTimes::usual`), as Generate gives.

### 4.4 Writing the posts (`PromotionWriter`, one AI call per page)

- The prompt carries the brand context (`ContextBuilder::build`, including the website summary), the page (address,
  title, description, date, main text up to 8,000 characters — read again at writing time, falling back to the kept
  text, then to the title and description), the brand's language, the slots in order (platform and day) with each
  platform's rules (`ContentPlatformRules::for`), the hooks of the page's earlier promotion posts (up to 30, "do not
  repeat"), the manager's instructions, and a list of angles to vary: key takeaway, question, surprising fact from the
  page, how-to tip, myth vs fact, quote from the page, checklist, mistake to avoid, story, behind the page, number from
  the page, poll, carousel outline, short video script, recap.
- Rules in the prompt: facts only from the page; one angle per post, each different; never write a web address (the
  link is added after the text) — except Instagram and TikTok, whose text ends by pointing to the link in bio; X text
  at most 250 characters.
- It answers `{"posts": [{"platform", "angle", "topic", "hook", "main_copy", "short_copy", "cta", "hashtags",
  "post_type", "visual_idea"}]}`, one per slot in order. Strings are cut to their columns; `post_type` outside the
  allowed list is dropped; an item missing or without text leaves its slot unwritten (`ai_incomplete`).
- **Each post:** `status` draft, `generated_by` `promotion`, the slot's platform, day and time, the brand's language,
  `topic`, `hook`, `main_copy`, `short_copy`, `cta`, `hashtags`, `post_type`, `funnel_stage` `consideration`, `goal`
  "Promote: {page title}" (250), `strategic_reason` "Promotes {address} — {angle}", `source_context`
  `{kind: promotion, page_id, angle}`, `site_page_id`, `strategy_id` the active strategy, `created_by` who pressed.
  Then its **Link** = the page's address (its short link made as release 5b makes it); for link-friendly platforms
  (§D9) the short link is added on its own line after `main_copy`. Its visual brief: `description` = the visual idea;
  with the picture switch on and a picture copied (§D10), `image_url` = the copy, `image_status` `ready`. Each post,
  its brief and its link are saved in one transaction.
- The page's picture is copied once (`MediaService::putRaw` into `content-planner/images`) and reused while the
  page's picture address is unchanged (`picture_url`, `picture_source`).

### 4.5 Running a promotion

- `POST promotions` (managers): checks the AI budget, the site (exists, not scanning), the pages (this site's, 1–20,
  distinct; `page_not_found` 404 otherwise), the channels (active, not `blog`; `no_channels` 422 when none), the numbers
  (D8; `too_many_posts` 422 above 200 in all), the period (`range_in_past`, 183 days), and the plan (`period_too_short`).
  In one transaction with the site row locked: a promotion still running answers `already_promoting` (409); an earlier
  promotion's leftover queued or writing rows that read as stale are marked failed; one `content_promotions` row per
  page (its slots, the batch id, `queued`) is created. Then `WritePromotionPosts` for the batch's first row is queued.
  Answers 202 with the promotion (200 with its result where the queue is `sync`).
- `WritePromotionPosts` (`ai` queue, `tries` 1, `timeout` 600): starts only by turning its row from `queued` to
  `writing` (a row stopped or marked stale meanwhile does nothing); binds the tenant and the manager who pressed (the
  posts and the AI usage are theirs); checks the budget (used up: this row and the batch's other queued rows fail with
  `ai_budget_used_up`); writes the page's posts (§4.4); sets `done` with `posts_made` (and `ai_incomplete` when fewer
  than wanted) or `failed` (`ai_failed`, `page_gone`); then queues the batch's next `queued` row. `failed()` (a killed
  job) marks its row `failed` (`promotion_failed`) and queues the next.
- **Stop** (`DELETE promotions/current`, managers): the batch's queued rows become `stopped`; the page being written
  finishes.
- **How it reads** (`GET promotions/current`): the brand's latest batch while any row is running, and for an hour after
  its last row finished; otherwise `idle`. A `writing` row whose job started more than 660 s ago, or a `queued` row of
  a batch with no progress for 1,800 s, reads as failed (`promotion_failed`). The answer: `status` (`idle` | `running`
  | `finished`), `batch`, `pages` (`page_id`, `title`, `status`, `posts_wanted`, `posts_made`, `error`),
  `created_count`, `wanted_count`, `finished_at`.

### 4.6 What each page shows; removing drafts

- Each listed page carries: `posts` (its non-archived promotion posts), `published`, `clicks` (all clicks of their
  short links), `last_promoted_at`.
- **Remove draft posts** (`DELETE site/pages/{id}/posts`, managers, refused while a promotion runs): deletes the page's
  promotion posts in `idea`, `draft`, `needs_review` or `needs_visual` as deleting one post does (out of its group
  first; its short link keeps working, release 5b); answers `{removed, kept, page}`.

### 4.7 The panel and copies

- `GET posts/{id}` gains `promotes` (`{id, title, url}` or null); the panel shows "Promotes: {title}" linking to the
  page (new tab).
- Versions, repeat copies and duplicates copy `site_page_id`, so they count for the page and their links carry its
  campaign.

## 5. What everyone sees

- **Menu:** "Promote" after Posts (icon: megaphone). Find lists it with the other pages.
- **Promote page:** the website line (address, last scan "Scanned 20 Oct: 42 articles, 12 pages", **Scan again**; while
  scanning, "Reading your website… This takes a minute or two. You can leave this page."); the running or finished
  promotion line ("The AI is writing promotion posts: 2 of 5 pages done" with **Stop**; "30 promotion posts were added
  to your plan as drafts" with **Open the Plan**; per page failures in words); two tabs with counts; each row: tick box
  (managers), picture, title (opens the page in a new tab), date, "Not promoted yet" or "10 posts · 4 published · 37
  clicks", "Not found on the last scan" when so, and **Show posts** (day, platform, status; a click opens the post) with
  **Remove draft posts** (managers, confirmed). A bar at the bottom while ticked: "3 selected · Promote…".
- **Empty states:** no address ("Add your website address to find your blog articles and pages." with the field and
  **Scan**; staff: "Your manager has not added the website yet."); a failed scan (its words, **Try again**); no articles
  found ("No blog articles were found. If your blog has its own address, enter it — for example
  https://example.com/blog — and scan again.").
- **Brand page:** a **Website** section after Readiness: the address and Scan (managers), the status line, the company
  summary (managers edit and save; staff read), "Update the company summary" next to Scan, and "Scanning again replaces
  this summary" when ticked.
- **Plan:** while a promotion runs, a line "The AI is writing promotion posts…" (as Generate's); when it ends, the plan
  is read again.
- **Staff** see the Promote page, its lists and numbers and the posts; no tick boxes, no scan, no remove; a line says
  "Only an owner or a manager can scan the website or promote pages."

## 6. Data, endpoints, words

### 6.1 Migrations (all additive)

1. `content_sites`: `id`, `organization_id` (FK cascade), `brand_id` (FK cascade), `planner_profile_id` (FK cascade,
   unique), `url` varchar(2000) null, `status` varchar(12) default `new` (`new` | `scanning` | `ready` | `failed`),
   `error` varchar(40) null, `scan_token` varchar(36) null, `scan_queued_at`, `scan_started_at`, `scanned_at`
   timestamps null, `articles_count`, `pages_count` unsigned integer default 0, `summary` text null,
   `summary_updated_at` timestamp null, `summary_edited` boolean default false, `summary_note` varchar(40) null,
   timestamps.
2. `content_site_pages`: `id`, `organization_id` (FK cascade), `brand_id` (FK cascade), `site_id` (FK cascade), `url`
   varchar(2000), `url_hash` char(64), `kind` varchar(8), `title` varchar(300), `description` varchar(1000) null,
   `image_url`, `picture_url`, `picture_source` varchar(2000) null, `published_at` timestamp null, `language`
   varchar(12) null, `body` text null, `last_seen_at` timestamp null, timestamps; unique (`site_id`, `url_hash`);
   index (`site_id`, `kind`).
3. `content_promotions`: `id`, `organization_id` (FK cascade), `brand_id` (FK cascade), `planner_profile_id` (FK
   cascade), `site_page_id` (FK, null on delete) null, `batch` varchar(36) indexed, `status` varchar(10), `error`
   varchar(40) null, `posts_wanted`, `posts_made` unsigned small integer (default 0), `slots` json, `instructions`
   text null, `use_picture` boolean default true, `created_by` (FK users, null on delete) null, `started_at`,
   `finished_at` timestamps null, timestamps; index (`planner_profile_id`, `id`).
4. `content_planner_posts.site_page_id`: unsigned big integer null, indexed; its foreign key (null on delete) on
   PostgreSQL, as `poster_id`.

### 6.2 Endpoints (under `/api/v1/admin/content`, brand in the query as today)

- `GET site` → `{site: {url, status, error, scanned_at, articles_count, pages_count, summary, summary_updated_at,
  summary_edited, summary_note} | null, suggested_url, pages: [{id, kind, url, title, description, image_url,
  published_at, seen, posts, published, clicks, last_promoted_at}]}`.
- `PUT site` (managers): `url` and/or `summary` (up to 6,000; saving it sets `summary_edited`) → as `GET site`.
- `POST site/scan` (managers): `url?`, `update_summary?` → 202 (or 200) as `GET site`.
- `POST promotions/preview` (managers): `page_ids`, `posts_per_page`, `platforms`, `from`, `to`, `per_week` →
  `{wanted, fit, first_date, last_date, weeks}`.
- `POST promotions` (managers): the same and `use_picture`, `instructions` → 202 (or 200) the promotion (§4.5).
- `GET promotions/current` → the promotion; `DELETE promotions/current` (managers) → the promotion.
- `DELETE site/pages/{id}/posts` (managers) → `{removed, kept, page}`.
- `GET posts/{id}` gains `promotes`.

### 6.3 Words

- Every new portal word in the five bundles (en, ru, de, fr, es) with the bundle tests: the menu item, the Promote page,
  the dialog and preview, the running and finished lines, the Website section, the panel's "Promotes", the Plan's line.
- New error families with codes and sentences in five languages: `site` (`bad_address`, `already_scanning`,
  `too_many_scans`, `scan_running`, `site_unreachable`, `site_blocked`, `nothing_found`, `scan_failed`,
  `manager_only`, `no_profile`, `invalid`), `promote` (`already_promoting`, `period_too_short`, `too_many_posts`,
  `no_channels`, `page_not_found`, `scan_running`, `range_in_past`, `ai_budget_used_up`, `manager_only`, `no_profile`,
  `invalid`) and the per-page run errors (`ai_failed`, `ai_incomplete`, `ai_budget_used_up`, `page_gone`,
  `promotion_failed`) and summary notes (`ai_budget_used_up`, `ai_failed`).

## 7. Testing and release checks

- **PHP unit (pure):** the address guard (every blocked range, IPv6 and mapped forms, ports, names); robots rules;
  sitemap, sitemap index, gzip, RSS and Atom parsing; the HTML reader (title/description/picture/date/language/text,
  charset, relative addresses, article signals, links, feeds); the address rules (same site, never-kept, article vs
  page, ranking, the blog path); the schedule (order, pace, even weeks, days, channel turns and fallbacks, one per
  channel a day, no page twice a day, fit when it does not fit, channels without days, today clamp); the writer's
  prompt and its answer handling; the summariser's prompt and answer; UTM `promote-…`.
- **PHP feature (HTTP faked, DNS faked, AI mocked):** the scan end to end (sitemap site, feed-only site, blog-page-only
  site, robots blocking, unreachable, nothing found, redirects re-checked, a private address refused, size and type
  caps, the 100/30 caps, replace keeps promoted pages, the summary written and empty profile fields filled, budget used
  up keeps the list, one scan at a time, the daily cap, stale scans, a late job with an old token); site editing
  (manager only, address rules, summary edit marks it, refused while scanning); promotions (preview numbers, refusals,
  one at a time, posts written with links, short link in the text, pictures copied once, Instagram without the link in
  the text, created_by, budget running out midway, AI failing for one page, incomplete answers, stop, stale batches, a
  late job); page numbers; remove drafts; `promotes` in the detail; copies keep `site_page_id`; the context section.
- **Frontend (vitest, node, no DOM):** pure helpers (default period, the preview words, the run line, the page row's
  numbers, the tabs' sorting, what staff see); render tests for the Promote page states, the dialog, the Website
  section, the panel line and the Plan line; the bundle tests; the error families.
- **Release checks:** every PHP suite folder by folder; the frontend suite (`tsc -b`, vitest, lint at its baseline);
  the build check; the Appointments pixel comparison (expected: no screen differs); Lighthouse on the Promote page and
  the Brand page; one browser pass on a temporary brand in local org 16 as a manager and as a staff member (a real scan
  of a public site, one real promotion of one page), eyes at 1440 and 390.

## 8. Rollout

Feature branch `feature/content-workspace` (worktree `../Hexa-Tech-content`). Plan **6-1** (server: migrations and
models, the web reader, the scan and its job, the summary and the context section, the schedule, the writer and its
job, the endpoints, copies and UTM, the runbook), Plan **6-2** (portal: the Promote page, the dialog, the Website
section, the panel and Plan lines, words; release checks; deploy). Four additive migrations. One final whole-branch
review with one fix pass; one deploy by the source-patch recipe (standing go, memory `deploy-without-asking`), verified
by content (`GET site` 404→401 on production).

## 9. Not in release 6

Connected social accounts and auto-publishing; scanning on a schedule; reading pages behind a login or rendered only by
JavaScript; other websites than the brand's own as a feature (a manager can type any public address; robots and caps
apply); per-page campaigns in the Strategy; images other than the page's main picture; editing the scanned list by
hand (adding an address the scan missed).
