# Content Release 6 — the deferred minors (fixes batch) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every minor deferred by release 6's two final reviews and its release check (owner, 2026-10-21: "Lets do all your mentioned small issues, so we can finish this part finaly"), then deploy.

**Architecture:** Fourteen small, independent fixes to code that is live (prod main 37c887e26): five on the server (Remove draft posts, a scan stopped during its summary, robots.txt, page clicks, page dates), nine in the portal's Promote and Website screens. No migration. Three new words (five bundles each).

**Tech Stack:** Laravel 13 / PHP 8.4 (PHPUnit, SQLite in memory), React 19 + TanStack Query v5 (vitest, node, `renderToStaticMarkup`).

**Spec:** `docs/superpowers/specs/2026-10-20-content-release-6-design.md` (release 6, approved 2026-10-20). The deferred minors are listed in the archived ledgers `.superpowers/sdd/archive/2026-10-20-content-release-6-1/progress.md` and `…-6-2/progress.md` (`Final: minor (deferred)` lines).

## Global Constraints

- PHP: `/c/wamp64/bin/php/php8.4.20/php.exe`; never a bare `artisan test` — scope by path, read the `Tests:` line.
- Frontend: `cd frontend && npx tsc -b && npx vitest run` (3 `plannerMeta` failures are pre-existing).
- Words: every new key in all five bundles (`frontend/src/content/i18n/content.{en,ru,de,fr,es}.json`) through `words.mjs`; error words also in `lib/errors.ts`.
- Counts only after a colon or in brackets (no plural forms).
- No migration in this batch. Production deploy by the source-patch recipe (change list since the deployed feature tip e8620ee26).
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A site whose robots.txt names our robot with a version (`HexaTechContentBot/1.0`) — still ours.
2. A robots.txt that times out while the home page loads — the scan says robots_unreachable, not "the website could not be reached".
3. A brand whose venue is west of UTC and a page dated with a date only (`2026-10-16`) — still shows the 16th.
4. A page's clicks when one link's post promotes it and its destination is the same page — counted once.
5. A cleared number field that is then left empty — Promote stays off with no preview request.

---

### Task 1: Remove draft posts re-checks each post under its lock (6-1 minor)

**Files:** Modify `app/Http/Controllers/Api/V1/Admin/Content/SiteController.php` (`destroyPagePosts`); Test `tests/Feature/Content/PromotionPagesTest.php`.

- [ ] **Step 1: Failing test** — another tab approves one of the page's drafts right after the list is read:

```php
// Final review (6-1), deferred minor: a post approved in another tab while Remove draft posts ran was still removed.
public function test_remove_draft_posts_keeps_a_post_approved_meanwhile(): void
{
    $draft = $this->promoPost('draft');
    $meanwhile = $this->promoPost('draft');
    $done = false;
    DB::listen(function (QueryExecuted $query) use ($meanwhile, &$done) {
        if ($done || !str_starts_with(strtolower(ltrim($query->sql)), 'select')
            || !str_contains($query->sql, 'from "content_planner_posts"') || !str_contains($query->sql, '"site_page_id"')) {
            return;
        }
        $done = true;
        DB::table('content_planner_posts')->where('id', $meanwhile->id)->update(['status' => 'approved', 'updated_at' => now()->addSeconds(5)]);
    });
    $this->asManager()->deleteJson($this->api("site/pages/{$this->page->id}/posts"))->assertOk()->assertJsonPath('removed', 1);
    $this->assertNull(ContentPlannerPost::find($draft->id));
    $this->assertSame('approved', $meanwhile->fresh()->status);
}
```

- [ ] **Step 2:** `php.sh tests/Feature/Content/PromotionPagesTest.php` — Expected: FAIL (`removed` 2).
- [ ] **Step 3: Fix** — each post: in one transaction lock the group key then the post (`ContentVersions::lockGroup`, `PostController::lockRow`), re-check it is still this page's draft, then unlink and delete; a post deleted meanwhile (`ContentRefused` or `ModelNotFoundException`) is skipped:

```php
$gone = DB::transaction(function () use ($post, $page) {
    ContentVersions::lockGroup($post);
    PostController::lockRow($post);
    if ((int) $post->site_page_id !== (int) $page->id || !in_array($post->status, ContentPromotions::DRAFTS, true)) {
        return false;
    }
    ContentVersions::unlink($post);
    $post->delete();

    return true;
}, PostController::ATTEMPTS);
```

- [ ] **Step 4:** the test file — Expected: PASS. **Step 5:** commit "Promote: Remove draft posts re-checks each post under its lock".

### Task 2: A scan stopped during its summary keeps its new list (6-1 minor)

**Files:** Modify `app/Services/Content/ContentSiteScan.php` (`run`), `app/Jobs/ScanContentWebsite.php` (`fail`), `app/Services/Content/ContentSites.php` (`facts`, new `listSaved`); Test `tests/Feature/Content/SiteScanTest.php`.

- [ ] **Step 1: Failing tests**
  - `test_a_scan_stopped_during_the_summary_keeps_its_new_list`: the WordPress site, a summarizer that records the site row, calls `(new ScanContentWebsite($site->id, 'token-1', true, $this->manager->id))->failed(null)` (the worker's timeout) and throws. Expected: while the AI was asked the row was `scanning` with `scanned_at` and the new counts; afterwards `ready`, `error` null, `summary_note` `ai_failed`.
  - `test_a_lost_scan_reads_ready_once_its_new_list_was_saved`: a site `scanning` queued 25 min and started 20 min ago reads `failed`/`scan_failed`; with `scanned_at` 15 min ago it reads `ready`, error null (`ContentSites::facts`).
- [ ] **Step 2:** `php.sh tests/Feature/Content/SiteScanTest.php` — Expected: both FAIL.
- [ ] **Step 3: Fix**
  - `run()`: right after `save()`, write `scanned_at`, the counts and `summary_note` (`ai_failed` when the summary is asked, else null) while the scan is still `scanning` (the private `finish` becomes `write`: it updates only while the token is current and the scan running).
  - `ContentSites::listSaved($site)`: `scanned_at` and `scan_queued_at` set and `scanned_at >= scan_queued_at`.
  - `ScanContentWebsite::fail()`: a scan whose list was saved goes `ready` (error null; its note says why the summary did not change); otherwise `failed` with the code.
  - `facts()`: a lost scan whose list was saved reads `ready`.
- [ ] **Step 4:** Expected: PASS (the whole file). **Step 5:** commit.

### Task 3: robots.txt — our name only, a server error reads nothing, matching without PCRE (6-1 minor)

**Files:** Modify `app/Services/Content/Web/RobotsRules.php`, `app/Services/Content/Web/WebFetcher.php` (status reasons), `app/Services/Content/ContentSiteDiscovery.php` (`find`), `frontend/src/content/lib/errors.ts` (site family), the five bundles (`site.error.robots_unreachable`); Tests `tests/Unit/Content/Web/RobotsRulesTest.php`, `tests/Feature/Content/WebFetcherTest.php`, `tests/Feature/Content/SiteScanTest.php`.

- [ ] **Step 1: Failing tests**
  - Robots: `User-agent: bot` / `User-agent: Content` (a part of our name) are not ours; `User-agent: HexaTechContentBot/1.0` is.
  - Robots: with `pcre.backtrack_limit` at 100, `Disallow: /*a*a*a*a*a*.pdf$` still refuses `/` + 3000 `a` + `.pdf`, allows `.pdfx`; `/x*y` and `/x*y$` behave.
  - Fetcher: 500 and 429 say `server_error`, 403 says `refused`, 404 `not_found`.
  - Scan: robots.txt 503 with a working home → failed `robots_unreachable`; robots.txt 403 → read as if there were none (ready).
- [ ] **Step 2:** run the three files — Expected: FAIL.
- [ ] **Step 3: Fix**
  - `RobotsRules::parse`: a group is ours when its name, lowercased and cut at `/` or a space, equals our robot's name (RFC 9309 §2.2.1).
  - `RobotsRules::matches`: glob matching with `strpos` (the first part a prefix, each middle part found left to right, the last part at the end when anchored with `$`).
  - `WebFetcher`: 404/410 `not_found`; 429 or ≥ 500 `server_error`; other 4xx `refused`.
  - `ContentSiteDiscovery::find`: robots.txt null with `server_error` or `unreachable` → read the home; no home → `site_unreachable`, else `robots_unreachable` (RFC 9309 §2.3.1.4: unreachable means read nothing); `not_found`/`refused`/other → allow all.
  - Words: `site.error.robots_unreachable` (`t3-words.json`) and the errors.ts line.
- [ ] **Step 4:** Expected: PASS (+ `src/content/i18n` vitest). **Step 5:** commit.

### Task 4: A page's clicks are every visit through its short links (6-1 minor)

**Files:** Modify `app/Services/Content/ContentSites.php` (`stats`); Test `tests/Feature/Content/PromotionPagesTest.php`.

- [ ] **Step 1: Failing test** `test_a_pages_clicks_count_every_visit_also_through_removed_posts`: published (5 clicks), draft (3), archived (2) promotion posts; Remove draft posts; the page reads `posts` 1 and `clicks` 10.
- [ ] **Step 2:** Expected: FAIL (clicks 7).
- [ ] **Step 3: Fix** — clicks join `content_site_pages` on the same brand and (`url = content_links.destination` or `id = the link's post's site_page_id`), so the links of removed posts (post_id null) and of archived posts count once each.
- [ ] **Step 4:** Expected: PASS. **Step 5:** commit.

### Task 5: A page's date is the day the site wrote; route spacing (6-2 M5 server half, M14)

**Files:** Modify `app/Services/Content/Web/SitemapReader.php` (`date`), `routes/api.php`; Tests `tests/Unit/Content/Web/SitemapReaderTest.php`, `tests/Unit/Content/Web/PageReaderTest.php`.

- [ ] **Step 1: Failing test** `test_a_date_keeps_the_day_and_time_the_site_wrote`: `2026-10-16T00:30:00+03:00` → `2026-10-16T00:30:00+00:00`; `2026-10-15T23:30:00-05:00` → `2026-10-15T23:30:00+00:00`; `2026-10-16` → `2026-10-16T00:00:00+00:00`; RFC 822 `Tue, 01 Sep 2026 10:00:00 +0200` → `2026-09-01T10:00:00+00:00`; nonsense → null. The existing expectations that encoded the UTC conversion change with it (10:00+02:00 → 10:00).
- [ ] **Step 2:** Expected: FAIL. **Step 3: Fix** — `date()` keeps the wall-clock day and time and drops the offset (`format('Y-m-d\TH:i:s') . '+00:00'`); the portal's `published_at.slice(0, 10)` is then the site's own day for every venue. Route: the missing space after the comma.
- [ ] **Step 4:** Expected: PASS (both reader files + SiteScanTest). **Step 5:** commit.

### Task 6: Website — the scan's day is the venue's; Try again; the address line (6-2 M5 portal half, M13, M8)

**Files:** Modify `frontend/src/content/promote/promoteMath.ts` (`siteLine(site, t, locale, timeZone)`), `promote/WebsiteScan.tsx`, `promote/PromotePage.tsx`; Tests `promote/promoteMath.test.ts`, `brand/websiteSection.test.tsx`, `promote/promotePage.test.tsx`.

- [ ] **Step 1: Failing tests** — `siteLine` with `scanned_at` 2026-10-20T23:30Z says 21 October in Europe/Riga and 20 October in America/New_York; a failed scan's button says "Try again"; a site row without an address (a summary saved first) still shows managers "Add your website address…".
- [ ] **Step 2:** Expected: FAIL. **Step 3: Fix** — `siteLine` takes the venue's time zone and formats `venueNow(timeZone, new Date(scanned_at)).date`; `WebsiteScan` reads `useBoot().venue.timezone`; its button: failed → `content.common.retry`, scanned → Scan again, else Scan website; Promote's line shows while `site === null || !site.url`.
- [ ] **Step 4:** Expected: PASS. **Step 5:** commit.

### Task 7: Promote page — Promote… waits for the scan; tabs follow the arrow keys (6-2 M3, M11)

**Files:** Modify `promote/promoteMath.ts` (`tabAfter`), `promote/PromotePage.tsx` (exported `PromoteBar`, tabs); Tests `promote/promoteMath.test.ts`, `promote/promotePage.test.tsx`.

- [ ] **Step 1: Failing tests** — `tabAfter('article','ArrowRight')` → `page`, ArrowLeft wraps, Home/End, other keys null; the page's tabs carry `tabindex` 0 (chosen) and -1; `PromoteBar` with `blocked: 'scanning'` has Promote… disabled and says "The website is being read. Promote when it is done.".
- [ ] **Step 2:** Expected: FAIL. **Step 3: Fix** — roving tabindex and `onKeyDown` (setTab + focus the new tab by id); `PromoteBar({ count, full, blocked, onClear, onStart })` with `blocked` = promoting / scanning / null; the scanning words reuse `content.promote.error.scan_running`.
- [ ] **Step 4:** Expected: PASS. **Step 5:** commit.

### Task 8: Promote dialog — a cleared number says nothing yet; channels loading; the link-in-bio note; drafts no_profile (6-2 M10, release-check minor, 6-1 IG/TikTok minor, 6-2 M6)

**Files:** Modify `promote/promoteMath.ts` (`shownProblems`, `bioNote`), `promote/PromoteDialog.tsx`, `lib/errors.ts` (drafts `no_profile`), the five bundles (`promote.dialog.bio_note`, `drafts.error.no_profile`); Tests `promote/promoteMath.test.ts`, `promote/promoteDialog.test.tsx`.

- [ ] **Step 1: Failing tests**
  - `shownProblems(['per_page','order'], {perPage: true, perWeek: false})` → `['order']`.
  - `bioNote(['instagram'], bio without page)` true; with page on and show_posts true → false; LinkedIn only → false; bio undefined → false.
  - Dialog markup: without the brand loaded the Channels fieldset says "Loading…"; with Instagram ticked and no link-in-bio page the note shows; with the page on and showing posts it does not.
  - `errorKey('drafts','no_profile')` → `content.drafts.error.no_profile`.
- [ ] **Step 2:** Expected: FAIL. **Step 3: Fix** — number fields keep their typed text (`value` is the text; the form gets `Number(text)`); problems shown through `shownProblems` (Promote still off); the bio query (`['content', brand, 'bio']`, `api.bio`, staleTime 60 s) feeds `bioNote`; words via `t8-words.json`.
- [ ] **Step 4:** Expected: PASS (+ `src/content/i18n`). **Step 5:** commit.

### Task 9: Docs, final review, release checks, deploy

- [ ] `docs/content-workspace.md`: the scan's new failure code and robots rules, what a page's Clicks count, the page date rule, the Remove drafts re-check.
- [ ] Final whole-branch review (fresh reviewer, most capable model) on `e8620ee26..HEAD`; Critical/Important fixed test first; minors ledgered.
- [ ] Release checks: every PHP folder (`php-paths.txt`), `tsc -b`, full vitest, lint baseline, build check; a browser pass on a temporary brand in org 16 (scan, Promote page tabs by keyboard, the dialog's note and blank field, Remove drafts); phones at 390.
- [ ] Deploy by the source-patch recipe (change list since e8620ee26; guard: `app/ routes/ tests/ frontend/src/content/ docs/` only, no migration); verify by content; memory; report.
