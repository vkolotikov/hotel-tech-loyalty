# Content release 6, Plan 6-2: the portal (Website, Promote), release checks, deploy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The portal half of release 6: a Website section on the Brand page (address, Scan, company summary), a Promote page (articles and pages with their numbers, Show posts, Remove draft posts, choose and Promote…), the promote dialog with the server's preview, the running/finished promotion line (Promote page and Plan), the panel's "Promotes" line — in five languages — then the release checks and the deploy.

**Architecture:** One small server addition (a page's posts as cards). The portal reads `GET site` and `GET promotions/current` through two shared queries (polled every 4 s while a scan or a promotion runs); pure helpers in `promote/promoteMath.ts` hold every rule the screens show; components follow the Link-in-bio section's patterns (Notice, Button, Field, Dialog, `errorKey` families, words with English fallbacks).

**Tech Stack:** React 19, TanStack Query v5, react-router 6, lucide-react, vitest (node, `renderToStaticMarkup`), Laravel 13 for the one endpoint.

**Spec:** `docs/superpowers/specs/2026-10-20-content-release-6-design.md` (§5 what everyone sees, §6.2–§6.3, §7, §8). Server: Plan 6-1 (`docs/superpowers/plans/2026-10-20-content-release-6-1.md`), built on `feature/content-workspace`.

## Global Constraints

- Work in `C:\wamp64\www\Hexa-Tech-content` on `feature/content-workspace`; commit trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; never commit `frontend/dist` or `public/spa`.
- Frontend checks: `cd frontend && npx tsc -b && npx vitest run <paths>` (3 `plannerMeta` failures are pre-existing); PHP: `$WS/php.sh <path>` (8.4.20, one path at a time).
- Every new literal `t('content.…', 'English')` key goes into all five bundles in the same task (`node $WS/words.mjs $WS/tN-words.json`), as `src/i18n/localeCompleteness.test.ts` and `contentLocales.test.ts` require; counts stand after a colon or in brackets (no plural forms).
- Error families live in `lib/errors.ts` (`content.<family>.error.<code>`); the bundles carry each code in five languages.
- Every API call goes through `lib/api.ts` under `/v1/admin/content` (tokens.test.ts).
- Staff see everything but no tick boxes, no Scan, no Edit, no Remove, no Stop.
- Release checks as spec §7: every PHP suite folder by folder; `tsc -b`, vitest, lint at its baseline; build check; Appointments pixel comparison (no screen differs); Lighthouse on Promote and Brand; one browser pass on a temporary brand in local org 16 as manager and staff (a real scan of `https://hexa-tech.uk`, one real promotion of one page); eyes at 1440 and 390.
- Deploy by the source-patch recipe with the standing go (memory `deploy-without-asking`): change list since the last deployed feature tip `85156069d`; four additive migrations; verify by content (`GET /api/v1/admin/content/site` 404 → 401 on production).

## Review Focus

- A scan started on the Brand page while the Promote page is open in another tab — expect both to show "Reading your website…" within 4 s and the list to refresh when it ends (Task 3/4 test: `useSite` polls while scanning; render tests for the scanning state).
- A manager ticking more than 20 pages — expect the rest of the boxes disabled and the limit sentence (Task 4 test `test: a 21st page cannot be ticked`).
- A promotion finishing while the manager is on the Plan — expect the Plan to read again and say how many posts were added (Task 6 test `the Plan hears a promotion end`).
- A page whose posts were all removed — expect "Show posts" gone and the numbers back to "Not promoted yet" after Remove (Task 4 test on `pageNumbers` and the row).
- A very long article title or address on a 390 px phone — expect wrapping, no horizontal scroll (Task 8 eyes and the pass's `fits` checks).

## File map

| File | Responsibility |
|---|---|
| `app/Http/Controllers/Api/V1/Admin/Content/SiteController.php` (`pagePosts`), `routes/api.php` | `GET site/pages/{id}/posts` |
| `frontend/src/content/lib/types.ts`, `lib/api.ts`, `lib/errors.ts` | types, calls, refusal words (`site`, `promote`, `promotion`, `summary`, `drafts`) |
| `frontend/src/content/promote/promoteMath.ts` | pure rules: limits, first period, problems, body, numbers, status/run/preview lines |
| `frontend/src/content/promote/useSite.ts` | the shared site and promotion queries, the end watcher |
| `frontend/src/content/promote/WebsiteScan.tsx` | address, Scan, Update the summary, status line |
| `frontend/src/content/brand/sections/Website.tsx` | the Brand page's Website section and the company summary editor |
| `frontend/src/content/promote/PromotePage.tsx`, `PageRow.tsx`, `PromotionLine.tsx` | the Promote page |
| `frontend/src/content/promote/PromoteDialog.tsx` | the dialog with the preview |
| `frontend/src/content/panel/PromotesLine.tsx`, `panel/PostPanel.tsx` | "Promotes: …" |
| `frontend/src/content/plan/PlanPage.tsx` | the Plan's promotion line and end note |
| `frontend/src/content/ContentShell.tsx`, `ContentApp.tsx`, `brand/BrandPage.tsx` | menu item, route, section placement |
| `frontend/src/content/i18n/content.{en,ru,de,fr,es}.json`, `i18n/contentLocales.test.ts` | words |
| `docs/content-workspace.md` | the portal part of the runbook |

Workspace (`$WS`): `.superpowers/sdd/2026-10-20-content-release-6-2/` with `php.sh` (from 6-1), `words.mjs` (from the 3a archive), `extract.mjs`, `vt.sh` (`cd frontend && npx vitest run "$@"` printing the Tests line).

---

### Task 1: A page's posts, for "Show posts" (server)

**Files:**
- Modify: `app/Http/Controllers/Api/V1/Admin/Content/SiteController.php`, `routes/api.php`
- Test: `tests/Feature/Content/PromotionPagesTest.php`

**Interfaces:**
- Produces: `GET site/pages/{id}/posts` → `{posts: PostCard[]}` (the page's posts not archived, by day then time, undated last, at most 200; everyone; `not_found` 404 for a page not in this brand's list).

- [ ] **Step 1: Write the failing test** — add to `PromotionPagesTest`:

```php
    public function test_everyone_reads_a_pages_posts_by_day_without_archived_ones(): void
    {
        $later = $this->promoPost('draft');
        $later->update(['scheduled_date' => '2026-10-20']);
        $sooner = $this->promoPost('published');
        $sooner->update(['scheduled_date' => '2026-10-08']);
        $this->promoPost('archived');
        $this->promoPost('draft', $this->other);

        $ids = collect($this->asStaffMember()->getJson($this->api("site/pages/{$this->page->id}/posts"))->assertOk()->json('posts'))->pluck('id')->all();
        $this->assertSame([$sooner->id, $later->id], $ids);
        $this->asStaffMember()->getJson($this->api('site/pages/999999/posts'))->assertStatus(404)->assertJsonPath('error', 'not_found');
    }
```

- [ ] **Step 2: Run it to see it fail** — `$WS/php.sh tests/Feature/Content/PromotionPagesTest.php` → FAIL (405/404 on the route).

- [ ] **Step 3: Write the code** — in `SiteController` (imports `App\Services\Content\ContentPostPresenter`):

```php
    /** The posts that promote a page (spec §5, "Show posts"): not archived, by day, undated last; as cards. */
    public function pagePosts(int $id): JsonResponse
    {
        $profile = ContentContext::requireProfile();
        $site = ContentSites::of((int) $profile->id);
        $page = $site === null ? null : ContentSitePage::where('site_id', $site->id)->whereKey($id)->first();
        if ($page === null) {
            throw new ContentRefused('not_found', 'This page is no longer in the list.', 404);
        }
        $posts = ContentPlannerPost::with(PostController::WITH)->withReview()->where('site_page_id', $page->id)->where('status', '!=', 'archived')
            ->orderByRaw('scheduled_date is null')->orderBy('scheduled_date')->orderBy('scheduled_time')->orderBy('id')->limit(200)->get();

        return response()->json(['posts' => $posts->map(fn (ContentPlannerPost $post) => ContentPostPresenter::card($post))->values()]);
    }
```

and in `routes/api.php`, before the `site/pages/{id}/posts` delete route:

```php
                Route::get('site/pages/{id}/posts', [\App\Http\Controllers\Api\V1\Admin\Content\SiteController::class, 'pagePosts'])->whereNumber('id');
```

- [ ] **Step 4: Run it to see it pass** — `Tests: 6 passed`.

- [ ] **Step 5: Commit** — "Content website: a page's posts, for Show posts".

---

### Task 2: The data layer — types, calls, refusal words, the rules

**Files:**
- Modify: `frontend/src/content/lib/types.ts`, `lib/api.ts`, `lib/errors.ts`, `i18n/contentLocales.test.ts` (counted keys)
- Create: `frontend/src/content/promote/promoteMath.ts`
- Test: `frontend/src/content/promote/promoteMath.test.ts`
- Words: `$WS/t2-words.json` (the five error families)

**Interfaces:**
- Produces (types): `SiteStatus`, `Site`, `SitePageKind`, `SitePage`, `SitePayload`, `PromotionPreview`, `PromotionBody`, `PromotionPageStatus`, `PromotionPage`, `PromotionRun`; `PostDetail.promotes?: { id: number; title: string; url: string } | null`.
- Produces (api): `site()`, `saveSite({url?, summary?})`, `scanSite({url?, update_summary?})`, `pagePosts(id)`, `removePageDrafts(id)`, `previewPromotion(body)`, `promote(body)`, `promotion()`, `stopPromotion()`.
- Produces (errors): families `site`, `promote`, `promotion`, `summary`, `drafts`.
- Produces (promoteMath): `POLL_MS`, `MAX_PAGES`, `MAX_PER_PAGE`, `MAX_POSTS`, `MAX_DAYS`, `MAX_PER_WEEK`, `DEFAULT_PER_PAGE`, `DEFAULT_PER_WEEK`; `isScanning`, `isPromoting`, `promotionEnded`; `PromoteForm`; `defaultPeriod(today, total, perWeek)`; `newForm(today, pages, platforms)`; `PROBLEMS`, `PROBLEM_TEXT`, `promoteProblems(pages, form, today)`; `promotionBody(pageIds, form)`; `promotablePlatforms(channels)`; `pageNumbers(page, t)`; `siteLine(site, t, locale)`; `summaryNote(site, t)`; `runLine(run, t)`; `previewLine(preview, t, locale)`.

- [ ] **Step 1: Write the failing test** — `frontend/src/content/promote/promoteMath.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Channel, PromotionRun, Site, SitePage } from '../lib/types'
import {
  DEFAULT_PER_PAGE, DEFAULT_PER_WEEK, defaultPeriod, isPromoting, isScanning, newForm, pageNumbers, previewLine, promotablePlatforms,
  promoteProblems, promotionBody, promotionEnded, runLine, siteLine, summaryNote,
} from './promoteMath'

const t = (_key: string, fallback: string, vars?: Record<string, unknown>) => fallback.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
const site = (more: Partial<Site> = {}): Site => ({
  url: 'https://lumiere.example', status: 'ready', error: null, scanned_at: '2026-10-20T09:00:00.000000Z', articles_count: 42, pages_count: 12,
  summary: null, summary_updated_at: null, summary_edited: false, summary_note: null, ...more,
})
const page = (more: Partial<SitePage> = {}): SitePage => ({
  id: 1, kind: 'article', url: 'https://lumiere.example/blog/a', title: 'A', description: null, image_url: null, published_at: null,
  seen: true, posts: 0, published: 0, clicks: 0, last_promoted_at: null, ...more,
})
const finished = (more: Partial<Extract<PromotionRun, { status: 'finished' }>> = {}): PromotionRun => ({
  status: 'finished', batch: 'b', created_count: 4, wanted_count: 4, finished_at: '2026-10-20T10:00:00.000000Z',
  pages: [{ page_id: 1, title: 'A', status: 'done', posts_wanted: 2, posts_made: 2, error: null }], ...more,
})

describe('the promote rules (spec 2026-10-20 §4.2, §5)', () => {
  it('starts from tomorrow for as many weeks as the posts need at the pace, at most 183 days', () => {
    expect(defaultPeriod('2026-10-20', 30, 3)).toEqual({ from: '2026-10-21', to: '2026-12-29' })
    expect(defaultPeriod('2026-10-20', 2, 3)).toEqual({ from: '2026-10-21', to: '2026-10-27' })
    expect(defaultPeriod('2026-10-20', 200, 1)).toEqual({ from: '2026-10-21', to: '2027-04-21' })
    const form = newForm('2026-10-20', 3, ['instagram'])
    expect([form.perPage, form.perWeek, form.usePicture, form.instructions]).toEqual([DEFAULT_PER_PAGE, DEFAULT_PER_WEEK, true, ''])
    expect(form.from).toBe('2026-10-21')
  })

  it('names every problem before anything is sent', () => {
    const ok = newForm('2026-10-20', 2, ['instagram'])
    expect(promoteProblems(2, ok, '2026-10-20')).toEqual([])
    expect(promoteProblems(0, ok, '2026-10-20')).toEqual(['no_pages'])
    expect(promoteProblems(21, ok, '2026-10-20')).toContain('too_many_pages')
    expect(promoteProblems(2, { ...ok, platforms: [] }, '2026-10-20')).toEqual(['no_channels'])
    expect(promoteProblems(2, { ...ok, perPage: 16 }, '2026-10-20')).toEqual(['per_page'])
    expect(promoteProblems(2, { ...ok, perWeek: 0 }, '2026-10-20')).toEqual(['per_week'])
    expect(promoteProblems(14, { ...ok, perPage: 15 }, '2026-10-20')).toContain('too_many_posts')
    expect(promoteProblems(2, { ...ok, to: '2026-10-01' }, '2026-10-20')).toEqual(['order'])
    expect(promoteProblems(2, { ...ok, from: '2026-09-01', to: '2026-09-30' }, '2026-10-20')).toEqual(['past'])
    expect(promoteProblems(2, { ...ok, to: '2027-06-01' }, '2026-10-20')).toEqual(['too_long'])
  })

  it('sends the pages in order and leaves out empty instructions', () => {
    const form = { ...newForm('2026-10-20', 2, ['instagram', 'linkedin']), instructions: '  ' }
    expect(promotionBody([5, 3], form)).toEqual({ page_ids: [5, 3], posts_per_page: 10, platforms: ['instagram', 'linkedin'], from: form.from, to: form.to, per_week: 3, use_picture: true })
    expect(promotionBody([5], { ...form, instructions: ' Mention the offer ' }).instructions).toBe('Mention the offer')
  })

  it('offers the active channels once each, never the blog', () => {
    const channel = (platform: string, active = true) => ({ id: 1, platform, active } as unknown as Channel)
    expect(promotablePlatforms([channel('instagram'), channel('blog'), channel('instagram'), channel('linkedin', false), channel('facebook')])).toEqual(['instagram', 'facebook'])
  })

  it('says a page’s numbers, or that it is not promoted yet', () => {
    expect(pageNumbers(page(), t)).toBe('Not promoted yet')
    expect(pageNumbers(page({ posts: 10, published: 4, clicks: 37 }), t)).toBe('Posts: 10 · Published: 4 · Clicks: 37')
  })

  it('says how the website stands', () => {
    expect(siteLine(null, t, 'en-GB')).toBeNull()
    expect(siteLine(site({ status: 'new', scanned_at: null }), t, 'en-GB')).toBeNull()
    expect(siteLine(site({ status: 'scanning' }), t, 'en-GB')?.text).toContain('Reading your website')
    expect(siteLine(site(), t, 'en-GB')).toEqual({ tone: 'info', text: 'Scanned 20 Oct. Articles: 42 · Pages: 12' })
    expect(siteLine(site({ status: 'failed', error: 'site_blocked' }), t, 'en-GB')).toEqual({ tone: 'danger', text: "The website's robots.txt does not let Content read it." })
    expect(summaryNote(site({ summary_note: 'ai_budget_used_up' }), t)).toContain('budget')
    expect(summaryNote(site(), t)).toBeNull()
  })

  it('follows a promotion: running, then what it added and what failed', () => {
    const running: PromotionRun = { ...finished(), status: 'running', finished_at: null, pages: [
      { page_id: 1, title: 'A', status: 'done', posts_wanted: 2, posts_made: 2, error: null },
      { page_id: 2, title: 'B', status: 'writing', posts_wanted: 2, posts_made: 0, error: null },
    ] }
    expect(runLine({ status: 'idle' }, t)).toBeNull()
    expect(runLine(running, t)?.text).toBe('The AI is writing promotion posts. Pages done: 1 of 2')
    expect(runLine(finished(), t)).toEqual({ tone: 'success', text: 'Promotion posts added to your plan as drafts: 4', failures: [] })
    const mixed = finished({ created_count: 2, pages: [
      { page_id: 1, title: 'A', status: 'done', posts_wanted: 2, posts_made: 2, error: null },
      { page_id: 2, title: 'B', status: 'failed', posts_wanted: 2, posts_made: 0, error: 'ai_failed' },
      { page_id: 3, title: 'C', status: 'stopped', posts_wanted: 2, posts_made: 0, error: null },
    ] })
    expect(runLine(mixed, t)).toEqual({ tone: 'warning', text: 'Promotion posts added to your plan as drafts: 2',
      failures: ['B: The AI could not write these posts.', 'Pages not written after Stop: 1'] })
    expect(runLine(finished({ created_count: 0 }), t)?.text).toBe('No promotion posts were written.')
    expect(isPromoting(running)).toBe(true)
    expect(promotionEnded(running, finished())).toBe(true)
    expect(promotionEnded(finished(), finished())).toBe(false)
    expect(isScanning({ site: site({ status: 'scanning' }), suggested_url: null, pages: [] })).toBe(true)
  })

  it('says what the preview found', () => {
    expect(previewLine({ wanted: 30, fit: 30, first_date: '2026-10-21', last_date: '2026-12-28', weeks: 10 }, t, 'en-GB'))
      .toEqual({ fits: true, text: 'Posts: 30 · 21 Oct – 28 Dec' })
    expect(previewLine({ wanted: 30, fit: 18, first_date: '2026-10-21', last_date: '2026-11-30', weeks: 6 }, t, 'en-GB'))
      .toEqual({ fits: false, text: 'Posts that fit in these days: 18 of 30. Choose a longer period, a higher pace or fewer posts.' })
  })
})
```

- [ ] **Step 2: Run it to see it fail** — `$WS/vt.sh src/content/promote/promoteMath.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write the types** — append to `lib/types.ts`:

```ts
/** The brand's website as Content read it (spec 2026-10-20 §3, §6.2). */
export type SiteStatus = 'new' | 'scanning' | 'ready' | 'failed'
export interface Site {
  url: string | null
  status: SiteStatus
  /** Why the last scan failed (`content.site.error.*`). */
  error: string | null
  scanned_at: string | null
  articles_count: number
  pages_count: number
  summary: string | null
  summary_updated_at: string | null
  summary_edited: boolean
  /** Why the last scan did not update the summary (`content.summary.error.*`). */
  summary_note: string | null
}
export type SitePageKind = 'article' | 'page'
/** An article or page the scan found, with its promotion numbers (spec §4.6). */
export interface SitePage {
  id: number
  kind: SitePageKind
  url: string
  title: string
  description: string | null
  image_url: string | null
  published_at: string | null
  /** Found on the last scan (a promoted page that disappeared stays, with false). */
  seen: boolean
  posts: number
  published: number
  clicks: number
  last_promoted_at: string | null
}
export interface SitePayload { site: Site | null; suggested_url: string | null; pages: SitePage[] }
export interface PromotionPreview { wanted: number; fit: number; first_date: DateKey | null; last_date: DateKey | null; weeks: number }
export interface PromotionBody {
  page_ids: number[]
  posts_per_page: number
  platforms: Platform[]
  from: DateKey
  to: DateKey
  per_week: number
  use_picture?: boolean
  instructions?: string
}
export type PromotionPageStatus = 'queued' | 'writing' | 'done' | 'failed' | 'stopped'
export interface PromotionPage { page_id: number | null; title: string | null; status: PromotionPageStatus; posts_wanted: number; posts_made: number; error: string | null }
/** The brand's latest promotion (spec §4.5): idle, running, or finished (shown for an hour). */
export type PromotionRun =
  | { status: 'idle' }
  | { status: 'running' | 'finished'; batch: string; pages: PromotionPage[]; created_count: number; wanted_count: number; finished_at: string | null }
```

and in `PostDetail`, after `link?`:

```ts
  /** The website page a promotion post promotes (spec 2026-10-20 §4.7); null for any other post. */
  promotes?: { id: number; title: string; url: string } | null
```

- [ ] **Step 4: Write the calls** — in `lib/api.ts`, import the new types and add after `saveBio`:

```ts
    /** The brand's website (spec 2026-10-20 §6.2): everyone reads it and its pages; managers save it and scan it. */
    site: (): Promise<SitePayload> => watched(api.get(url('site'))),
    saveSite: (body: { url?: string | null; summary?: string | null }): Promise<SitePayload> => watched(api.put(url('site'), body)),
    /** Starts a scan: 202 while the queue worker reads (follow it with `site`), or — where the queue is sync — its result. */
    scanSite: (body: { url?: string; update_summary?: boolean }): Promise<SitePayload> => watched(api.post(url('site/scan'), body)),
    pagePosts: (id: number): Promise<{ posts: PostCard[] }> => watched(api.get(url(`site/pages/${id}/posts`))),
    /** Remove draft posts (spec §4.6): the page's promotion posts not yet approved. */
    removePageDrafts: (id: number): Promise<{ removed: number; kept: number; page: SitePage }> => watched(api.delete(url(`site/pages/${id}/posts`))),
    /** Promotions (spec §4.2, §4.5): the preview writes nothing; a promotion runs page by page on the queue worker. */
    previewPromotion: (body: PromotionBody): Promise<PromotionPreview> => watched(api.post(url('promotions/preview'), body)),
    promote: (body: PromotionBody): Promise<PromotionRun> => watched(api.post(url('promotions'), body)),
    promotion: (): Promise<PromotionRun> => watched(api.get(url('promotions/current'))),
    stopPromotion: (): Promise<PromotionRun> => watched(api.delete(url('promotions/current'))),
```

- [ ] **Step 5: Write the refusal words** — in `lib/errors.ts`, after `bio`:

```ts
  // Release 6 (spec 2026-10-20 §6.3). A scan's outcome reads through `site` too (its `error`).
  site: {
    bad_address: 'Enter the website address, starting with https:// — a public site.',
    already_scanning: 'The website is already being read.',
    too_many_scans: 'A website can be read at most 20 times a day. Try again tomorrow.',
    scan_running: 'The website is being read. Try again when it is done.',
    site_unreachable: 'The website could not be reached. Check the address and try again.',
    site_blocked: "The website's robots.txt does not let Content read it.",
    nothing_found: 'Nothing could be read on this website. Check the address and try again.',
    scan_failed: 'Reading the website stopped unexpectedly. Please try again.',
    manager_only: 'Only an owner or a manager can change the website.',
    no_profile: 'This brand is not set up yet.',
    invalid: 'Some fields need attention.',
    unknown: 'That did not work. Please try again.',
  },
  promote: {
    already_promoting: 'A promotion is already being written for this brand.',
    period_too_short: 'Not every post fits in these days: choose a longer period, a higher pace or fewer posts.',
    too_many_posts: 'One promotion writes at most 200 posts.',
    no_channels: 'None of these channels is active for this brand.',
    page_not_found: 'One of these pages is no longer in the list. Reload the page.',
    scan_running: 'The website is being read. Promote when it is done.',
    range_in_past: 'These days are already over.',
    ai_budget_used_up: "This month's AI budget is used up.",
    promotion_failed: 'The promotion could not start. Please try again.',
    manager_only: 'Only an owner or a manager can promote pages.',
    no_profile: 'This brand is not set up yet.',
    invalid: 'Check the pages, channels, days and numbers.',
    unknown: 'The promotion could not start. Please try again.',
  },
  // A page of a promotion that did not get all its posts (spec §4.5).
  promotion: {
    ai_failed: 'The AI could not write these posts.',
    ai_incomplete: 'The AI wrote fewer posts than asked.',
    ai_budget_used_up: "This month's AI budget ran out.",
    page_gone: 'This page is no longer in the list.',
    promotion_failed: 'Writing stopped unexpectedly.',
    unknown: 'These posts could not be written.',
  },
  // Why the last scan did not update the company summary (spec §3.6).
  summary: {
    ai_budget_used_up: "This month's AI budget is used up, so the company summary was not updated.",
    ai_failed: 'The AI could not write the company summary this time; the list of pages is up to date.',
    unknown: 'The company summary was not updated.',
  },
  // Remove draft posts (spec §4.6).
  drafts: {
    already_promoting: 'Wait until the promotion being written is done.',
    not_found: 'This page is no longer in the list.',
    manager_only: 'Only an owner or a manager can remove posts.',
    unknown: 'The posts could not be removed. Please try again.',
  },
```

- [ ] **Step 6: Write the rules** — `frontend/src/content/promote/promoteMath.ts`:

```ts
import { addDays, formatDate, isDateKey } from '../../workspace/lib/wallClock'
import { errorKey } from '../lib/errors'
import type { Channel, DateKey, Platform, PromotionBody, PromotionPreview, PromotionRun, Site, SitePage, SitePayload } from '../lib/types'

/** Release 6's numbers (spec 2026-10-20 §D8); the server holds them too. */
export const POLL_MS = 4000
export const MAX_PAGES = 20
export const MAX_PER_PAGE = 15
export const MAX_POSTS = 200
export const MAX_DAYS = 183
export const MAX_PER_WEEK = 21
export const DEFAULT_PER_PAGE = 10
export const DEFAULT_PER_WEEK = 3

type Translate = (key: string, fallback: string, vars?: Record<string, unknown>) => string

export const isScanning = (payload: SitePayload | undefined): boolean => payload?.site?.status === 'scanning'
export const isPromoting = (run: PromotionRun | undefined): boolean => run?.status === 'running'
/** A promotion seen running that has finished: the plan and the pages' numbers are read again. */
export const promotionEnded = (prev: PromotionRun | undefined, next: PromotionRun | undefined): boolean =>
  isPromoting(prev) && next?.status === 'finished'

export interface PromoteForm {
  perPage: number
  platforms: Platform[]
  from: DateKey
  to: DateKey
  perWeek: number
  usePicture: boolean
  instructions: string
}

/** The dialog's first period (spec §4.2): from tomorrow, as many weeks as the posts need at the pace, at most 183 days. */
export function defaultPeriod(today: DateKey, total: number, perWeek: number): { from: DateKey; to: DateKey } {
  const from = addDays(today, 1)
  const weeks = Math.max(1, Math.ceil(total / Math.max(1, perWeek)))
  return { from, to: addDays(from, Math.min(weeks * 7, MAX_DAYS) - 1) }
}

export function newForm(today: DateKey, pages: number, platforms: Platform[]): PromoteForm {
  const { from, to } = defaultPeriod(today, pages * DEFAULT_PER_PAGE, DEFAULT_PER_WEEK)
  return { perPage: DEFAULT_PER_PAGE, platforms, from, to, perWeek: DEFAULT_PER_WEEK, usePicture: true, instructions: '' }
}

export const PROBLEMS = ['no_pages', 'too_many_pages', 'no_channels', 'per_page', 'per_week', 'too_many_posts', 'order', 'too_long', 'past'] as const
export type PromoteProblem = (typeof PROBLEMS)[number]
export const PROBLEM_TEXT: Record<PromoteProblem, string> = {
  no_pages: 'Choose at least one page.',
  too_many_pages: 'Choose at most 20 pages.',
  no_channels: 'Choose at least one channel.',
  per_page: 'Posts per page: from 1 to 15.',
  per_week: 'At most per week: from 1 to 21.',
  too_many_posts: 'One promotion writes at most 200 posts.',
  order: 'The last day cannot be before the first.',
  too_long: 'The period can be at most 183 days.',
  past: 'These days are already over.',
}

const days = (from: DateKey, to: DateKey) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1

/** What stops the dialog before anything is sent (spec §4.2); the server checks again. */
export function promoteProblems(pages: number, form: PromoteForm, today: DateKey): PromoteProblem[] {
  const out: PromoteProblem[] = []
  if (pages < 1) out.push('no_pages')
  if (pages > MAX_PAGES) out.push('too_many_pages')
  if (form.platforms.length === 0) out.push('no_channels')
  const perPage = Number.isInteger(form.perPage) && form.perPage >= 1 && form.perPage <= MAX_PER_PAGE
  if (!perPage) out.push('per_page')
  if (!(Number.isInteger(form.perWeek) && form.perWeek >= 1 && form.perWeek <= MAX_PER_WEEK)) out.push('per_week')
  if (perPage && pages * form.perPage > MAX_POSTS) out.push('too_many_posts')
  if (!isDateKey(form.from) || !isDateKey(form.to) || form.to < form.from) out.push('order')
  else if (form.to < today) out.push('past')
  else if (days(form.from > today ? form.from : today, form.to) > MAX_DAYS) out.push('too_long')
  return out
}

/** The press as the server takes it: the pages in the order shown, instructions only when written. */
export function promotionBody(pageIds: number[], form: PromoteForm): PromotionBody {
  const instructions = form.instructions.trim()
  return {
    page_ids: pageIds, posts_per_page: form.perPage, platforms: form.platforms, from: form.from, to: form.to, per_week: form.perWeek,
    use_picture: form.usePicture, ...(instructions !== '' ? { instructions } : {}),
  }
}

/** The channels a promotion may use (spec §D9): the brand's active ones, once each, never the blog. */
export function promotablePlatforms(channels: Channel[]): Platform[] {
  const out: Platform[] = []
  for (const channel of channels) {
    if (channel.active && channel.platform !== 'blog' && !out.includes(channel.platform)) out.push(channel.platform)
  }
  return out
}

/** A page's numbers (spec §4.6). */
export function pageNumbers(page: SitePage, t: Translate): string {
  if (page.posts === 0 && page.clicks === 0) return t('content.promote.not_promoted', 'Not promoted yet')
  return t('content.promote.numbers', 'Posts: {{posts}} · Published: {{published}} · Clicks: {{clicks}}', { posts: page.posts, published: page.published, clicks: page.clicks })
}

/** The website's line (spec §5): reading, scanned (with its numbers), or why the scan failed; nothing before a scan. */
export function siteLine(site: Site | null, t: Translate, locale: string): { tone: 'info' | 'danger'; text: string } | null {
  if (site === null || site.status === 'new') return null
  if (site.status === 'scanning') return { tone: 'info', text: t('content.site.scanning', 'Reading your website… This takes a minute or two. You can leave this page.') }
  if (site.status === 'failed') {
    const [key, text] = errorKey('site', site.error ?? 'scan_failed')
    return { tone: 'danger', text: t(key, text) }
  }
  const date = site.scanned_at ? formatDate(site.scanned_at.slice(0, 10), locale, { day: 'numeric', month: 'short' }) : ''
  return { tone: 'info', text: t('content.site.scanned', 'Scanned {{date}}. Articles: {{articles}} · Pages: {{pages}}', { date, articles: site.articles_count, pages: site.pages_count }) }
}

/** Why the last scan did not update the company summary; null when it did (or was not asked to). */
export function summaryNote(site: Site | null, t: Translate): string | null {
  if (!site?.summary_note) return null
  const [key, text] = errorKey('summary', site.summary_note)
  return t(key, text)
}

/** The promotion's line (spec §5): while it writes, the pages done; when it finished, the posts added and what failed. */
export function runLine(run: PromotionRun, t: Translate): { tone: 'info' | 'success' | 'warning'; text: string; failures: string[] } | null {
  if (run.status === 'idle') return null
  const failures = run.pages.filter(p => p.status === 'failed' || p.error === 'ai_incomplete').map(p => {
    const [key, text] = errorKey('promotion', p.error ?? 'unknown')
    return t('content.promote.run.page_failed', '{{title}}: {{reason}}', { title: p.title ?? '—', reason: t(key, text) })
  })
  if (run.status === 'running') {
    const done = run.pages.filter(p => p.status !== 'queued' && p.status !== 'writing').length
    return { tone: 'info', text: t('content.promote.run.writing', 'The AI is writing promotion posts. Pages done: {{done}} of {{count}}', { done, count: run.pages.length }), failures }
  }
  const stopped = run.pages.filter(p => p.status === 'stopped').length
  if (stopped > 0) failures.push(t('content.promote.run.stopped', 'Pages not written after Stop: {{count}}', { count: stopped }))
  if (run.created_count === 0) return { tone: 'warning', text: t('content.promote.run.none', 'No promotion posts were written.'), failures }
  return {
    tone: failures.length > 0 ? 'warning' : 'success',
    text: t('content.promote.run.done', 'Promotion posts added to your plan as drafts: {{count}}', { count: run.created_count }),
    failures,
  }
}

/** What the preview found (spec §4.2): the posts and their days, or how many fit. */
export function previewLine(preview: PromotionPreview, t: Translate, locale: string): { fits: boolean; text: string } {
  if (preview.fit < preview.wanted || preview.first_date === null || preview.last_date === null) {
    return { fits: false, text: t('content.promote.dialog.short', 'Posts that fit in these days: {{fit}} of {{wanted}}. Choose a longer period, a higher pace or fewer posts.', { fit: preview.fit, wanted: preview.wanted }) }
  }
  const day = (date: DateKey) => formatDate(date, locale, { day: 'numeric', month: 'short' })
  return { fits: true, text: t('content.promote.dialog.fits', 'Posts: {{count}} · {{from}} – {{to}}', { count: preview.wanted, from: day(preview.first_date), to: day(preview.last_date) }) }
}
```

- [ ] **Step 7: Words** — write `$WS/t2-words.json` with every `site`, `promote`, `promotion`, `summary` and `drafts` error code of Step 5 (keys `site.error.<code>` …), each `{en, ru, de, fr, es}` (the English as above; the other four in the release's usual register: ru «вы», de «Sie», fr «vous», es «tú»), and merge: `node $WS/words.mjs $WS/t2-words.json`. Add to `COUNTED` in `contentLocales.test.ts`: `'promote.numbers', 'promote.selected', 'promote.removed', 'promote.tab_articles', 'promote.tab_pages', 'promote.dialog.pages', 'promote.dialog.more', 'promote.run.done', 'promote.run.writing', 'promote.run.stopped', 'site.scanned'` (their keys arrive in Tasks 3–6; the test reads `String(undefined)` until then, which never matches).

- [ ] **Step 8: Run the tests** — `$WS/vt.sh src/content/promote/promoteMath.test.ts src/content/lib src/content/i18n` and `cd frontend && npx tsc -b` → all pass, tsc clean.

- [ ] **Step 9: Commit** — "Content portal: release 6's data layer, refusal words and promote rules".

---

### Task 3: The Website section — address, Scan, company summary

**Files:**
- Create: `frontend/src/content/promote/useSite.ts`, `frontend/src/content/promote/WebsiteScan.tsx`, `frontend/src/content/brand/sections/Website.tsx`
- Modify: `frontend/src/content/brand/BrandPage.tsx` (the section first among the profile's sections, right after Readiness)
- Test: `frontend/src/content/brand/websiteSection.test.tsx`
- Words: `$WS/t3-words.json`

**Interfaces:**
- Consumes: Task 2 (`api.site/saveSite/scanSite`, `siteLine`, `summaryNote`, `isScanning`, `POLL_MS`, `errorKey('site')`).
- Produces: `useSite()` (query `['content', brand, 'site']`, polled while scanning); `usePromotionRun()` (query `['content', brand, 'promotion']`, polled while running); `usePromotionWatch(onEnd?)` (reads the plan and the site again when a run ends); `<WebsiteScan payload canManage />` (`data-website-scan`); `<WebsiteSection canEdit />` (`data-website`, heading `#content-website`).

- [ ] **Step 1: Write the failing test** — `frontend/src/content/brand/websiteSection.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en-GB' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

import { ContentContext } from '../ContentProvider'
import type { Site, SitePayload } from '../lib/types'
import { bootFor, brandWith, renderBrand } from './brandTesting'
import { WebsiteSection } from './sections/Website'

const site = (more: Partial<Site> = {}): Site => ({
  url: 'https://lumiere.example', status: 'ready', error: null, scanned_at: '2026-10-20T09:00:00.000000Z', articles_count: 42, pages_count: 12,
  summary: 'Lumière cuts and colours hair in Riga.', summary_updated_at: '2026-10-20T09:00:00.000000Z', summary_edited: false, summary_note: null, ...more,
})
const render = (payload: SitePayload, canManage: boolean) => {
  const client = new QueryClient()
  client.setQueryData(['content', 3, 'site'], payload)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ContentContext.Provider value={{ data: bootFor(canManage), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
          <WebsiteSection canEdit={canManage} />
        </ContentContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('the Website section (spec 2026-10-20 §5)', () => {
  it('sits on the Brand page right after Readiness, before Brand DNA', () => {
    const html = renderBrand(brandWith(), true)
    expect(html.indexOf('id="content-website"')).toBeGreaterThan(-1)
    expect(html.indexOf('id="content-website"')).toBeLessThan(html.indexOf('id="content-dna"'))
  })

  it('gives managers the address, Scan again, Update the company summary (ticked) and the status line', () => {
    const html = render({ site: site(), suggested_url: null, pages: [] }, true)
    expect(html).toContain('value="https://lumiere.example"')
    expect(html).toContain('Scan again')
    expect(html).toMatch(/<input type="checkbox" checked=""[^>]*>Update the company summary/)
    expect(html).toContain('Scanning again replaces the company summary.')
    expect(html).toContain('Scanned 20 Oct. Articles: 42 · Pages: 12')
    expect(html).toContain('Lumière cuts and colours hair in Riga.')
    expect(html).toContain('Edit summary')
    expect(html).toContain('href="/content/promote"')
  })

  it('leaves Update unticked for a summary edited by hand, and says it was', () => {
    const html = render({ site: site({ summary_edited: true }), suggested_url: null, pages: [] }, true)
    expect(html).not.toMatch(/<input type="checkbox" checked=""[^>]*>Update the company summary/)
    expect(html).toContain('Edited by hand')
  })

  it('starts from the suggested address and says Scan website before the first scan', () => {
    const html = render({ site: null, suggested_url: 'https://lumiere.example', pages: [] }, true)
    expect(html).toContain('value="https://lumiere.example"')
    expect(html).toContain('Scan website')
    expect(html).toContain('No summary yet. Scan the website to write one.')
  })

  it('shows a scan reading and a failed one in words, and why the summary was not updated', () => {
    expect(render({ site: site({ status: 'scanning' }), suggested_url: null, pages: [] }, true)).toContain('Reading your website…')
    expect(render({ site: site({ status: 'failed', error: 'site_unreachable' }), suggested_url: null, pages: [] }, true)).toContain('The website could not be reached.')
    expect(render({ site: site({ summary_note: 'ai_failed' }), suggested_url: null, pages: [] }, true)).toContain('The AI could not write the company summary this time')
  })

  it('shows staff the address and the summary, with nothing to change', () => {
    const html = render({ site: site(), suggested_url: null, pages: [] }, false)
    expect(html).toContain('href="https://lumiere.example"')
    expect(html).not.toContain('<input')
    expect(html).not.toContain('Edit summary')
    expect(html).toContain('Lumière cuts and colours hair in Riga.')
    expect(render({ site: null, suggested_url: null, pages: [] }, false)).toContain('Your manager has not added the website yet.')
  })
})
```

- [ ] **Step 2: Run it to see it fail** — `$WS/vt.sh src/content/brand/websiteSection.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Write the code**

`frontend/src/content/promote/useSite.ts`:

```ts
import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useApi, useBrandId } from '../ContentProvider'
import { refreshLists } from '../lib/planCache'
import type { PromotionRun, SitePayload } from '../lib/types'
import { POLL_MS, isPromoting, isScanning, promotionEnded } from './promoteMath'

/** The brand's website and its pages (spec 2026-10-20 §6.2), shared by the Brand page and Promote; read every 4 s while a scan runs. */
export function useSite() {
  const api = useApi()
  const brand = useBrandId()
  return useQuery({
    queryKey: ['content', brand, 'site'],
    queryFn: api.site,
    refetchInterval: (query) => (isScanning(query.state.data as SitePayload | undefined) ? POLL_MS : false),
  })
}

/** The brand's latest promotion (spec §4.5), shared by Promote, the dialog and the Plan; read every 4 s while it runs. */
export function usePromotionRun() {
  const api = useApi()
  const brand = useBrandId()
  return useQuery({
    queryKey: ['content', brand, 'promotion'],
    queryFn: api.promotion,
    refetchInterval: (query) => (isPromoting(query.state.data as PromotionRun | undefined) ? POLL_MS : false),
  })
}

/** The promotion, watched: when a run seen running finishes, the plan and the pages' numbers are read again. */
export function usePromotionWatch(onEnd?: (run: PromotionRun) => void) {
  const run = usePromotionRun()
  const queryClient = useQueryClient()
  const brand = useBrandId()
  const seen = useRef<PromotionRun | undefined>(run.data)
  useEffect(() => {
    if (promotionEnded(seen.current, run.data) && run.data) {
      void refreshLists(queryClient, brand)
      void queryClient.invalidateQueries({ queryKey: ['content', brand, 'site'] })
      onEnd?.(run.data)
    }
    seen.current = run.data
  }, [run.data, queryClient, brand, onEnd])
  return run
}
```

`frontend/src/content/promote/WebsiteScan.tsx`:

```tsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import type { SitePayload } from '../lib/types'
import { siteLine, summaryNote } from './promoteMath'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * The website's address and its scan (spec 2026-10-20 §3.1, §3.7, §5), on the Brand page and on Promote. Managers enter
 * the address (the organisation's website to start), choose whether the company summary is written again (unticked when
 * someone edited it by hand) and press Scan; everyone reads how the last scan went.
 */
export function WebsiteScan({ payload, canManage }: { payload: SitePayload; canManage: boolean }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const api = useApi()
  const brand = useBrandId()
  const queryClient = useQueryClient()
  const site = payload.site
  const [address, setAddress] = useState(site?.url ?? payload.suggested_url ?? '')
  const [update, setUpdate] = useState(!(site?.summary_edited ?? false))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scanning = site?.status === 'scanning'
  const line = siteLine(site, t, locale)
  const note = site?.status === 'ready' ? summaryNote(site, t) : null

  const scan = async () => {
    if (busy || scanning || address.trim() === '') return
    setBusy(true)
    setError(null)
    try {
      queryClient.setQueryData(['content', brand, 'site'], await api.scanSite({ url: address.trim(), update_summary: update }))
    } catch (e) {
      const [key, text] = errorKey('site', failureOf(e).code)
      setError(t(key, text))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-website-scan="" className="space-y-3">
      {canManage ? (
        <form onSubmit={(e) => { e.preventDefault(); void scan() }} className="space-y-3">
          <Field label={t('content.site.address', 'Website address')}
            hint={t('content.site.address_hint', 'For example https://example.com. A blog with its own address can be entered as it is, for example https://example.com/blog.')}>
            <input type="url" inputMode="url" autoComplete="url" value={address} onChange={(e) => setAddress(e.target.value)} disabled={scanning}
              placeholder="https://example.com" className={INPUT} />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={busy} disabled={scanning || address.trim() === ''}>
              {site?.scanned_at ? t('content.site.scan_again', 'Scan again') : t('content.site.scan', 'Scan website')}
            </Button>
            <label className="inline-flex items-center gap-2 text-sm text-a-text">
              <input type="checkbox" checked={update} onChange={(e) => setUpdate(e.target.checked)} disabled={scanning} />{t('content.site.update_summary', 'Update the company summary')}
            </label>
          </div>
          {update && site?.summary && <p className="text-xs text-a-text-2">{t('content.site.replaces', 'Scanning again replaces the company summary.')}</p>}
        </form>
      ) : site?.url ? (
        <p className="text-sm text-a-text">
          <span className="font-medium text-a-text-2">{t('content.site.address', 'Website address')}: </span>
          <a href={site.url} target="_blank" rel="noopener noreferrer" className="break-all text-a-accent-text hover:underline">{site.url}</a>
        </p>
      ) : (
        <p className="text-sm text-a-text-2">{t('content.site.none_staff', 'Your manager has not added the website yet.')}</p>
      )}
      {line && line.tone === 'danger' && <Notice tone="danger">{line.text}</Notice>}
      {line && line.tone !== 'danger' && (
        <p role="status" className="flex items-start gap-2 text-sm text-a-text-2">
          {scanning && <Loader2 size={14} aria-hidden className="mt-0.5 shrink-0 motion-safe:animate-spin" />}
          <span>{line.text}</span>
        </p>
      )}
      {note && <p className="text-xs text-a-text-2">{note}</p>}
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  )
}
```

`frontend/src/content/brand/sections/Website.tsx`:

```tsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Megaphone } from 'lucide-react'
import { Button } from '../../../workspace/ui/Button'
import { Notice } from '../../../workspace/ui/Notice'
import { useApi, useBrandId } from '../../ContentProvider'
import { failureOf } from '../../lib/api'
import { errorKey } from '../../lib/errors'
import type { SitePayload } from '../../lib/types'
import { useSite } from '../../promote/useSite'
import { WebsiteScan } from '../../promote/WebsiteScan'

const SUMMARY_MAX = 6000

/**
 * Website (spec 2026-10-20 §5), right after Readiness: the address and its scan, and the company summary every AI call
 * reads. Everyone reads it; managers scan, and edit the summary (an edit is kept by the next scan unless they ask).
 */
export function WebsiteSection({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation()
  const query = useSite()

  return (
    <section data-website="" aria-labelledby="content-website" className="space-y-4 rounded-xl border border-a-border bg-a-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-0.5">
          <h2 id="content-website" className="font-a-display text-lg font-normal text-a-text">{t('content.site.title', 'Website')}</h2>
          <p className="text-sm text-a-text-2">{t('content.site.intro', 'Content reads your website to learn about the company and to find articles and pages to promote.')}</p>
        </div>
        <Link to="/content/promote" className="inline-flex items-center gap-1.5 rounded-full border border-a-border px-3 py-1.5 text-sm font-semibold text-a-text hover:bg-a-surface-2">
          <Megaphone size={14} aria-hidden />{t('content.site.open_promote', 'Promote your articles and pages')}
        </Link>
      </div>
      {query.isLoading && <p role="status" className="text-sm text-a-text-2">{t('content.common.loading', 'Loading…')}</p>}
      {query.isError && !query.data && (
        <div className="space-y-2">
          <Notice tone="danger">{t('content.common.error', 'Something went wrong. Please try again.')}</Notice>
          <Button size="sm" variant="secondary" onClick={() => { void query.refetch() }}>{t('content.common.retry', 'Try again')}</Button>
        </div>
      )}
      {query.data && <WebsiteScan payload={query.data} canManage={canEdit} />}
      {query.data && <CompanySummary payload={query.data} canEdit={canEdit} />}
    </section>
  )
}

function CompanySummary({ payload, canEdit }: { payload: SitePayload; canEdit: boolean }) {
  const { t } = useTranslation()
  const api = useApi()
  const brand = useBrandId()
  const queryClient = useQueryClient()
  const site = payload.site
  const [draft, setDraft] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scanning = site?.status === 'scanning'

  const save = async () => {
    if (draft === null || busy) return
    setBusy(true)
    setError(null)
    try {
      queryClient.setQueryData(['content', brand, 'site'], await api.saveSite({ summary: draft }))
      setDraft(null)
    } catch (e) {
      const [key, text] = errorKey('site', failureOf(e).code)
      setError(t(key, text))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-company-summary="" className="space-y-2 border-t border-a-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-a-text">
          {t('content.site.summary_title', 'Company summary')}
          {site?.summary_edited && <span className="ml-2 text-xs font-normal text-a-text-2">{t('content.site.summary_edited', 'Edited by hand')}</span>}
        </h3>
        {canEdit && draft === null && (
          <Button size="sm" variant="secondary" disabled={scanning} onClick={() => { setDraft(site?.summary ?? ''); setError(null) }}>{t('content.site.summary_edit', 'Edit summary')}</Button>
        )}
      </div>
      <p className="text-xs text-a-text-2">{t('content.site.summary_intro', 'What the AI knows about your company from your website. Every post the AI writes reads it.')}</p>
      {draft === null ? (
        site?.summary
          ? <p className="whitespace-pre-line text-sm text-a-text">{site.summary}</p>
          : <p className="text-sm text-a-text-2">{t('content.site.summary_none', 'No summary yet. Scan the website to write one.')}</p>
      ) : (
        <div className="space-y-2">
          <label className="block">
            <span className="sr-only">{t('content.site.summary_title', 'Company summary')}</span>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={10} maxLength={SUMMARY_MAX}
              className="w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text" />
          </label>
          <div className="flex gap-2">
            <Button size="sm" loading={busy} onClick={() => { void save() }}>{t('content.site.summary_save', 'Save summary')}</Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setDraft(null)}>{t('content.common.cancel', 'Cancel')}</Button>
          </div>
        </div>
      )}
      {error && <Notice tone="danger">{error}</Notice>}
    </div>
  )
}
```

In `brand/BrandPage.tsx`: import `WebsiteSection` from `./sections/Website` and put `<WebsiteSection canEdit={canEdit} />` first inside `{brand.profile && (<> … </>)}` with the comment `{/* Spec 2026-10-20 §5: the website and its company summary, right after Readiness. */}`.

- [ ] **Step 4: Words** — `$WS/t3-words.json`: `site.title`, `site.intro`, `site.address`, `site.address_hint`, `site.scan`, `site.scan_again`, `site.update_summary`, `site.replaces`, `site.none_staff`, `site.empty`, `site.scanning`, `site.scanned`, `site.summary_title`, `site.summary_intro`, `site.summary_none`, `site.summary_edited`, `site.summary_edit`, `site.summary_save`, `site.open_promote` (English as in the code; `site.empty`: "Add your website address to find your blog articles and pages."), each in five languages; merge with `words.mjs`.

- [ ] **Step 5: Run the tests** — `$WS/vt.sh src/content/brand src/content/promote src/content/i18n src/i18n` → pass; `npx tsc -b` clean.

- [ ] **Step 6: Commit** — "Content portal: the Website section — address, scan and company summary".

---

### Task 4: The Promote page

**Files:**
- Create: `frontend/src/content/promote/PromotePage.tsx`, `frontend/src/content/promote/PageRow.tsx`, `frontend/src/content/promote/PromotionLine.tsx`
- Modify: `frontend/src/content/ContentShell.tsx` (menu item after Posts, icon `Megaphone`), `frontend/src/content/ContentApp.tsx` (route `promote`)
- Test: `frontend/src/content/promote/promotePage.test.tsx`
- Words: `$WS/t4-words.json`

**Interfaces:**
- Consumes: Tasks 2–3 (`useSite`, `usePromotionWatch`, `WebsiteScan`, `pageNumbers`, `runLine`, `isPromoting`, `MAX_PAGES`, `api.pagePosts/removePageDrafts/stopPromotion`); `usePanel().open`; `refreshLists`.
- Produces: `<PromotePage />` at `/content/promote` (`data-promote`); `<PageRow page canManage chosen full onToggle locale busy />` (`data-page={id}`); `<PromotionLine run canManage showPlanLink? />` (`data-promotion-line`); the menu item "Promote". `PromotePage` renders `<PromoteDialog pages onClose onStarted />` from Task 5 (until then, a stub that renders nothing is not needed: Task 5 lands before this page is reachable in a release).

- [ ] **Step 1: Write the failing test** — `frontend/src/content/promote/promotePage.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en-GB' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

import { ContentContext } from '../ContentProvider'
import { bootFor } from '../brand/brandTesting'
import type { PromotionRun, Site, SitePage, SitePayload } from '../lib/types'
import { PageRow } from './PageRow'
import { PromotePage } from './PromotePage'
import { PromotionLine } from './PromotionLine'

const site: Site = {
  url: 'https://lumiere.example', status: 'ready', error: null, scanned_at: '2026-10-20T09:00:00.000000Z', articles_count: 2, pages_count: 1,
  summary: null, summary_updated_at: null, summary_edited: false, summary_note: null,
}
const page = (more: Partial<SitePage> = {}): SitePage => ({
  id: 1, kind: 'article', url: 'https://lumiere.example/blog/autumn', title: 'Autumn colours', description: null, image_url: 'https://lumiere.example/a.jpg',
  published_at: '2026-09-01T00:00:00.000000Z', seen: true, posts: 0, published: 0, clicks: 0, last_promoted_at: null, ...more,
})
const payload = (pages: SitePage[], s: Site | null = site): SitePayload => ({ site: s, suggested_url: null, pages })
const render = (data: SitePayload, canManage: boolean, run: PromotionRun = { status: 'idle' }) => {
  const client = new QueryClient()
  client.setQueryData(['content', 3, 'site'], data)
  client.setQueryData(['content', 3, 'promotion'], run)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ContentContext.Provider value={{ data: bootFor(canManage), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
          <PromotePage />
        </ContentContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const row = (p: SitePage, canManage = true, chosen = false, full = false) => renderToStaticMarkup(
  <PageRow page={p} canManage={canManage} chosen={chosen} full={full} onToggle={() => {}} locale="en-GB" busy={false} />,
)

describe('the Promote page (spec 2026-10-20 §5)', () => {
  it('asks a manager for the address before the first scan, and tells staff the manager has not added it', () => {
    expect(render(payload([], null), true)).toContain('Add your website address to find your blog articles and pages.')
    const staff = render(payload([], null), false)
    expect(staff).toContain('Your manager has not added the website yet.')
    expect(staff).toContain('Only an owner or a manager can scan the website or promote pages.')
  })

  it('shows two tabs with their counts and the articles first', () => {
    const html = render(payload([page(), page({ id: 2, title: 'Winter care' }), page({ id: 3, kind: 'page', title: 'Prices', url: 'https://lumiere.example/prices' })]), true)
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Blog articles \(2\)</)
    expect(html).toMatch(/role="tab"[^>]*aria-selected="false"[^>]*>Other pages \(1\)</)
    expect(html).toContain('Autumn colours')
    expect(html).toContain('Winter care')
    expect(html).not.toContain('Prices')
  })

  it('says when no article was found, and how to point at the blog', () => {
    expect(render(payload([page({ kind: 'page', title: 'Prices' })]), true)).toContain('No blog articles were found. If your blog has its own address')
  })

  it('gives each row its picture, its link in a new tab, its date and numbers, and a tick box for managers only', () => {
    const promoted = row(page({ posts: 10, published: 4, clicks: 37 }))
    expect(promoted).toContain('src="https://lumiere.example/a.jpg"')
    expect(promoted).toMatch(/<a href="https:\/\/lumiere.example\/blog\/autumn" target="_blank" rel="noopener noreferrer"/)
    expect(promoted).toContain('1 Sept 2026 · Posts: 10 · Published: 4 · Clicks: 37')
    expect(promoted).toContain('aria-label="Choose Autumn colours"')
    expect(promoted).toContain('Show posts')
    expect(row(page(), false)).not.toContain('type="checkbox"')
    expect(row(page())).toContain('Not promoted yet')
    expect(row(page())).not.toContain('Show posts')
  })

  it('marks a page not found on the last scan, and a 21st page cannot be ticked', () => {
    expect(row(page({ seen: false, posts: 2 }))).toContain('Not found on the last scan')
    expect(row(page(), true, false, true)).toMatch(/type="checkbox"[^>]*disabled=""/)
    expect(row(page(), true, true, true)).not.toMatch(/type="checkbox"[^>]*disabled=""/)
  })

  it('follows a promotion: writing with Stop for managers, then what it added with the way to the Plan', () => {
    const running: PromotionRun = { status: 'running', batch: 'b', created_count: 2, wanted_count: 4, finished_at: null, pages: [
      { page_id: 1, title: 'Autumn colours', status: 'done', posts_wanted: 2, posts_made: 2, error: null },
      { page_id: 2, title: 'Winter care', status: 'writing', posts_wanted: 2, posts_made: 0, error: null },
    ] }
    const line = (run: PromotionRun, canManage: boolean) => renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ContentContext.Provider value={{ data: bootFor(canManage), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
            <PromotionLine run={run} canManage={canManage} />
          </ContentContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(line(running, true)).toContain('The AI is writing promotion posts. Pages done: 1 of 2')
    expect(line(running, true)).toContain('>Stop<')
    expect(line(running, false)).not.toContain('>Stop<')
    const done: PromotionRun = { ...running, status: 'finished', finished_at: '2026-10-20T10:00:00.000000Z', created_count: 4,
      pages: running.pages.map(p => ({ ...p, status: 'done' as const, posts_made: 2 })) }
    expect(line(done, true)).toContain('Promotion posts added to your plan as drafts: 4')
    expect(line(done, true)).toContain('href="/content"')
    expect(render(payload([page()]), true, done)).toContain('Promotion posts added to your plan as drafts: 4')
  })
})
```

- [ ] **Step 2: Run it to see it fail** — `$WS/vt.sh src/content/promote/promotePage.test.tsx` → FAIL.

- [ ] **Step 3: Write the code**

`frontend/src/content/promote/PromotionLine.tsx`:

```tsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import type { PromotionRun } from '../lib/types'
import { runLine } from './promoteMath'

/** A promotion as it stands (spec 2026-10-20 §5): writing (with Stop for managers), or what it added and what failed. */
export function PromotionLine({ run, canManage, showPlanLink = true }: { run: PromotionRun; canManage: boolean; showPlanLink?: boolean }) {
  const { t } = useTranslation()
  const api = useApi()
  const brand = useBrandId()
  const queryClient = useQueryClient()
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const line = runLine(run, t)
  if (line === null) return null

  const stop = async () => {
    setStopping(true)
    setError(null)
    try {
      queryClient.setQueryData(['content', brand, 'promotion'], await api.stopPromotion())
    } catch (e) {
      const [key, text] = errorKey('promote', failureOf(e).code)
      setError(t(key, text))
    } finally {
      setStopping(false)
    }
  }

  if (run.status === 'running') {
    return (
      <div data-promotion-line="" className="space-y-2 rounded-xl border border-a-border bg-a-surface p-3">
        <div className="flex flex-wrap items-center gap-3">
          <p role="status" className="flex min-w-0 flex-1 items-center gap-2 text-sm text-a-text">
            <Loader2 size={14} aria-hidden className="shrink-0 motion-safe:animate-spin" /><span>{line.text}</span>
          </p>
          {canManage && <Button size="sm" variant="secondary" loading={stopping} onClick={() => { void stop() }}>{t('content.promote.run.stop', 'Stop')}</Button>}
        </div>
        {line.failures.length > 0 && <ul className="list-disc pl-5 text-xs text-a-text-2">{line.failures.map(f => <li key={f}>{f}</li>)}</ul>}
        {error && <Notice tone="danger">{error}</Notice>}
      </div>
    )
  }
  return (
    <div data-promotion-line="">
      <Notice tone={line.tone}>
        <span className="block">{line.text}</span>
        {line.failures.length > 0 && <ul className="mt-1 list-disc pl-5">{line.failures.map(f => <li key={f}>{f}</li>)}</ul>}
        {showPlanLink && run.created_count > 0 && (
          <Link to="/content" className="mt-1 inline-block font-semibold text-a-accent-text hover:underline">{t('content.promote.run.open_plan', 'Open the Plan')}</Link>
        )}
      </Notice>
    </div>
  )
}
```

`frontend/src/content/promote/PageRow.tsx`:

```tsx
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ExternalLink, FileText } from 'lucide-react'
import { formatDate } from '../../workspace/lib/wallClock'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import { refreshLists } from '../lib/planCache'
import type { SitePage } from '../lib/types'
import { usePanel } from '../panel/PanelProvider'
import { PlatformMark } from '../ui/PlatformMark'
import { StatusPill } from '../ui/StatusDot'
import { pageNumbers } from './promoteMath'

/**
 * One article or page (spec 2026-10-20 §5): its picture, its title opening the page in a new tab, its date and numbers,
 * "Not found on the last scan" when so, a tick box for managers, and Show posts (each opens in the panel) with Remove
 * draft posts for managers.
 */
export function PageRow({ page, canManage, chosen, full, onToggle, locale, busy }: {
  page: SitePage; canManage: boolean; chosen: boolean; full: boolean; onToggle: () => void; locale: string; busy: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const date = page.published_at ? formatDate(page.published_at.slice(0, 10), locale, { day: 'numeric', month: 'short', year: 'numeric' }) : null

  return (
    <li data-page={page.id} className="rounded-xl border border-a-border bg-a-surface p-3">
      <div className="flex items-start gap-3">
        {canManage && (
          <input type="checkbox" checked={chosen} disabled={!chosen && full} onChange={onToggle}
            aria-label={t('content.promote.choose', 'Choose {{title}}', { title: page.title })} className="mt-1 h-4 w-4 shrink-0" />
        )}
        {page.image_url
          ? <img src={page.image_url} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
          : <div aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-a-surface-2 text-a-text-2"><FileText size={18} /></div>}
        <div className="min-w-0 flex-1 space-y-1">
          <a href={page.url} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-start gap-1 font-semibold text-a-text hover:underline">
            <span className="min-w-0 break-words">{page.title}</span><ExternalLink size={13} aria-hidden className="mt-1 shrink-0 text-a-text-2" />
          </a>
          <p className="text-xs text-a-text-2">{[date, pageNumbers(page, t)].filter(Boolean).join(' · ')}</p>
          {!page.seen && <p className="text-xs font-medium text-a-text-2">{t('content.promote.not_seen', 'Not found on the last scan')}</p>}
          {page.posts > 0 && (
            <button type="button" aria-expanded={open} aria-controls={`content-page-posts-${page.id}`} onClick={() => setOpen(o => !o)}
              className="text-xs font-semibold text-a-accent-text hover:underline">
              {open ? t('content.promote.hide_posts', 'Hide posts') : t('content.promote.show_posts', 'Show posts')}
            </button>
          )}
        </div>
      </div>
      {open && <PagePosts id={page.id} canManage={canManage} busy={busy} locale={locale} />}
    </li>
  )
}

function PagePosts({ id, canManage, busy, locale }: { id: number; canManage: boolean; busy: boolean; locale: string }) {
  const { t } = useTranslation()
  const api = useApi()
  const brand = useBrandId()
  const panel = usePanel()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['content', brand, 'page-posts', id], queryFn: () => api.pagePosts(id) })
  const [confirming, setConfirming] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [note, setNote] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null)

  const remove = async () => {
    setRemoving(true)
    setNote(null)
    try {
      const answer = await api.removePageDrafts(id)
      setNote({ tone: 'info', text: t('content.promote.removed', 'Draft posts removed: {{count}}', { count: answer.removed }) })
      await Promise.all([query.refetch(), queryClient.invalidateQueries({ queryKey: ['content', brand, 'site'] }), refreshLists(queryClient, brand)])
    } catch (e) {
      const [key, text] = errorKey('drafts', failureOf(e).code)
      setNote({ tone: 'danger', text: t(key, text) })
    } finally {
      setRemoving(false)
      setConfirming(false)
    }
  }

  const posts = query.data?.posts ?? []
  return (
    <div id={`content-page-posts-${id}`} className="mt-3 space-y-2 border-t border-a-border pt-3">
      {query.isLoading && <p role="status" className="text-sm text-a-text-2">{t('content.common.loading', 'Loading…')}</p>}
      {query.isError && <Notice tone="danger">{t('content.common.error', 'Something went wrong. Please try again.')}</Notice>}
      {query.data && posts.length === 0 && <p className="text-sm text-a-text-2">{t('content.promote.no_posts', 'No posts left for this page.')}</p>}
      {posts.length > 0 && (
        <ul className="space-y-1">
          {posts.map(post => (
            <li key={post.id}>
              <button type="button" onClick={() => panel.open(post.id)} className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-sm hover:bg-a-surface-2">
                <span className="w-20 shrink-0 text-xs text-a-text-2">
                  {post.scheduled_date ? formatDate(post.scheduled_date, locale, { day: 'numeric', month: 'short' }) : t('content.common.unscheduled', 'Unscheduled')}
                </span>
                <PlatformMark platform={post.platform} size="sm" />
                <span className="min-w-0 flex-1 truncate text-a-text">{post.hook ?? post.title ?? post.topic ?? ''}</span>
                <StatusPill status={post.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {canManage && posts.length > 0 && (confirming ? (
        <div role="group" className="space-y-2 rounded-lg bg-a-surface-2 p-2">
          <p className="text-sm text-a-text">{t('content.promote.remove_confirm', "Remove this page's posts that are still drafts? Approved and published posts stay.")}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="danger" loading={removing} onClick={() => { void remove() }}>{t('content.promote.remove_yes', 'Remove')}</Button>
            <Button size="sm" variant="secondary" disabled={removing} onClick={() => setConfirming(false)}>{t('content.common.cancel', 'Cancel')}</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirming(true)}>{t('content.promote.remove', 'Remove draft posts')}</Button>
      ))}
      {note && <Notice tone={note.tone}>{note.text}</Notice>}
    </div>
  )
}
```

`frontend/src/content/promote/PromotePage.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { useBoot } from '../ContentProvider'
import type { SitePageKind } from '../lib/types'
import { PageHeader } from '../ui/PageHeader'
import { PageRow } from './PageRow'
import { PromoteDialog } from './PromoteDialog'
import { MAX_PAGES, isPromoting } from './promoteMath'
import { PromotionLine } from './PromotionLine'
import { usePromotionWatch, useSite } from './useSite'
import { WebsiteScan } from './WebsiteScan'

/**
 * Promote (spec 2026-10-20 §5): the website line, the promotion as it stands, the articles and the other pages in two
 * tabs with their numbers; managers tick up to 20 (across both tabs) and press Promote…. Staff read everything.
 */
export function PromotePage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const canManage = boot.staff.can_manage
  const query = useSite()
  const run = usePromotionWatch()
  const [tab, setTab] = useState<SitePageKind>('article')
  const [chosen, setChosen] = useState<number[]>([])
  const [dialog, setDialog] = useState(false)
  const payload = query.data
  const pages = payload?.pages ?? []
  const articles = pages.filter(p => p.kind === 'article')
  const others = pages.filter(p => p.kind === 'page')
  const shown = tab === 'article' ? articles : others
  const promoting = isPromoting(run.data)
  const full = chosen.length >= MAX_PAGES
  const toggle = (id: number) => setChosen(c => (c.includes(id) ? c.filter(x => x !== id) : c.length >= MAX_PAGES ? c : [...c, id]))

  return (
    <div data-promote="" className="space-y-4 px-4 py-4 lg:px-6">
      <PageHeader title={t('content.promote.title', 'Promote')} />
      <p className="text-sm text-a-text-2">{t('content.promote.intro', 'Turn your blog articles and pages into posts that link to them.')}</p>
      {!canManage && <Notice tone="info">{t('content.promote.staff_note', 'Only an owner or a manager can scan the website or promote pages.')}</Notice>}
      {query.isLoading && <div role="status" aria-label={t('content.common.loading', 'Loading…')} className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-64" /></div>}
      {query.isError && !payload && (
        <div className="space-y-3">
          <Notice tone="danger">{t('content.common.error', 'Something went wrong. Please try again.')}</Notice>
          <Button variant="secondary" onClick={() => { void query.refetch() }}>{t('content.common.retry', 'Try again')}</Button>
        </div>
      )}
      {payload && (
        <section aria-labelledby="content-promote-site" className="space-y-3 rounded-xl border border-a-border bg-a-surface p-4">
          <h2 id="content-promote-site" className="font-a-display text-lg font-normal text-a-text">{t('content.site.title', 'Website')}</h2>
          {payload.site === null && canManage && <p className="text-sm text-a-text">{t('content.site.empty', 'Add your website address to find your blog articles and pages.')}</p>}
          <WebsiteScan payload={payload} canManage={canManage} />
        </section>
      )}
      {run.data && run.data.status !== 'idle' && <PromotionLine run={run.data} canManage={canManage} />}
      {payload && pages.length > 0 && (
        <section aria-label={t('content.promote.tabs', 'Kinds of pages')} className="space-y-3">
          <div role="tablist" aria-label={t('content.promote.tabs', 'Kinds of pages')} className="flex flex-wrap gap-2">
            {(['article', 'page'] as const).map(kind => (
              <button key={kind} type="button" role="tab" id={`content-promote-tab-${kind}`} aria-selected={tab === kind} aria-controls="content-promote-list"
                onClick={() => setTab(kind)}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${tab === kind ? 'border-a-accent-text bg-a-surface-2 text-a-text' : 'border-a-border text-a-text-2 hover:text-a-text'}`}>
                {kind === 'article'
                  ? t('content.promote.tab_articles', 'Blog articles ({{count}})', { count: articles.length })
                  : t('content.promote.tab_pages', 'Other pages ({{count}})', { count: others.length })}
              </button>
            ))}
          </div>
          <div id="content-promote-list" role="tabpanel" aria-labelledby={`content-promote-tab-${tab}`}>
            {shown.length === 0 ? (
              <p className="text-sm text-a-text-2">
                {tab === 'article'
                  ? t('content.promote.no_articles', 'No blog articles were found. If your blog has its own address, enter it — for example https://example.com/blog — and scan again.')
                  : t('content.promote.no_pages', 'No other pages were found.')}
              </p>
            ) : (
              <ul className="space-y-2">
                {shown.map(page => (
                  <PageRow key={page.id} page={page} canManage={canManage} chosen={chosen.includes(page.id)} full={full}
                    onToggle={() => toggle(page.id)} locale={locale} busy={promoting} />
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
      {canManage && chosen.length > 0 && (
        <div data-promote-bar="" className="sticky bottom-0 z-10 -mx-4 border-t border-a-border bg-a-surface px-4 py-3 shadow-a-lg lg:-mx-6 lg:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-a-text">{t('content.promote.selected', 'Selected: {{count}}', { count: chosen.length })}</span>
            {full && <span className="text-xs text-a-text-2">{t('content.promote.limit', 'You can choose up to 20 pages at a time.')}</span>}
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setChosen([])}>{t('content.promote.clear', 'Clear')}</Button>
              <Button size="sm" disabled={promoting} onClick={() => setDialog(true)}>{t('content.promote.start', 'Promote…')}</Button>
            </div>
          </div>
        </div>
      )}
      {dialog && (
        <PromoteDialog pages={pages.filter(p => chosen.includes(p.id))} onClose={() => setDialog(false)}
          onStarted={() => { setDialog(false); setChosen([]) }} />
      )}
    </div>
  )
}
```

In `ContentShell.tsx`: import `Megaphone` from lucide-react and add after the Posts item: `{ to: '/content/promote', end: false, icon: Megaphone, label: t('content.nav.promote', 'Promote') },`. In `ContentApp.tsx`: import `PromotePage` and add `<Route path="promote" element={<PromotePage />} />` after `posts/:id`.

This task's test imports `PromotePage`, which imports `PromoteDialog` (Task 5): write Task 5's `PromoteDialog.tsx` first if executing out of order — tasks run in order, so Task 4's code lands with a minimal `PromoteDialog.tsx` exporting `export function PromoteDialog(_: { pages: SitePage[]; onClose: () => void; onStarted: () => void }) { return null }` that Task 5 replaces (ledger it).

- [ ] **Step 4: Words** — `$WS/t4-words.json`: `nav.promote`, `promote.title`, `promote.intro`, `promote.staff_note`, `promote.tabs`, `promote.tab_articles`, `promote.tab_pages`, `promote.no_articles`, `promote.no_pages`, `promote.choose`, `promote.not_promoted`, `promote.numbers`, `promote.not_seen`, `promote.show_posts`, `promote.hide_posts`, `promote.no_posts`, `promote.remove`, `promote.remove_confirm`, `promote.remove_yes`, `promote.removed`, `promote.selected`, `promote.clear`, `promote.start`, `promote.limit`, `promote.run.writing`, `promote.run.stop`, `promote.run.done`, `promote.run.none`, `promote.run.open_plan`, `promote.run.page_failed`, `promote.run.stopped`, each in five languages; merge.

- [ ] **Step 5: Run the tests** — `$WS/vt.sh src/content/promote src/content/ContentShell.test.tsx src/content/i18n src/i18n src/content/tokens.test.ts` → pass; `npx tsc -b` clean.

- [ ] **Step 6: Commit** — "Content portal: the Promote page — the website, two tabs of pages with their numbers, Show posts, Remove draft posts".

---

### Task 5: The promote dialog with the server's preview

**Files:**
- Create (replace the stub): `frontend/src/content/promote/PromoteDialog.tsx`
- Test: `frontend/src/content/promote/promoteDialog.test.tsx`
- Words: `$WS/t5-words.json`

**Interfaces:**
- Consumes: Task 2 (`newForm`, `defaultPeriod`, `promoteProblems`, `PROBLEM_TEXT`, `promotionBody`, `promotablePlatforms`, `previewLine`, `api.brand/previewPromotion/promote`), `refreshLists`, `Dialog`.
- Produces: `<PromoteDialog pages onClose onStarted />`; preview query key `['content', brand, 'promotion-preview', JSON.stringify(body)]`.

- [ ] **Step 1: Write the failing test** — `frontend/src/content/promote/promoteDialog.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en-GB' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

import { ContentContext } from '../ContentProvider'
import { bootFor, brandWith } from '../brand/brandTesting'
import type { Channel, PromotionPreview, SitePage } from '../lib/types'
import { PromoteDialog } from './PromoteDialog'
import { newForm, promotionBody } from './promoteMath'

const page = (id: number, title: string): SitePage => ({
  id, kind: 'article', url: `https://lumiere.example/blog/${id}`, title, description: null, image_url: null, published_at: null,
  seen: true, posts: 0, published: 0, clicks: 0, last_promoted_at: null,
})
const channel = (platform: string, active = true) => ({ id: platform.length, platform, label: platform, active } as unknown as Channel)
const render = (pages: SitePage[], preview?: PromotionPreview, channels = [channel('instagram'), channel('linkedin'), channel('blog')]) => {
  const client = new QueryClient()
  client.setQueryData(['content', 3, 'brand'], brandWith({ channels }))
  if (preview) {
    const body = promotionBody(pages.map(p => p.id), newForm('2026-10-07', pages.length, ['instagram', 'linkedin']))
    client.setQueryData(['content', 3, 'promotion-preview', JSON.stringify(body)], preview)
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ContentContext.Provider value={{ data: bootFor(true), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
        <PromoteDialog pages={pages} onClose={() => {}} onStarted={() => {}} />
      </ContentContext.Provider>
    </QueryClientProvider>,
  )
}

describe('the promote dialog (spec 2026-10-20 §4.2)', () => {
  it('starts from 10 posts a page, 3 a week, every active channel but the blog, from tomorrow, with the picture', () => {
    const html = render([page(1, 'Autumn colours'), page(2, 'Winter care')])
    expect(html).toContain('Pages chosen: 2')
    expect(html).toContain('Autumn colours')
    expect(html).toMatch(/Posts per page[\s\S]*?value="10"/)
    expect(html).toMatch(/At most per week[\s\S]*?value="3"/)
    expect(html).toMatch(/type="checkbox" checked=""[^>]*>(?:<[^>]+>)*Instagram/)
    expect(html).toMatch(/type="checkbox" checked=""[^>]*>(?:<[^>]+>)*LinkedIn/)
    expect(html).not.toContain('>Blog<')
    expect(html).toContain('value="2026-10-08"')
    expect(html).toMatch(/type="checkbox" checked=""[^>]*>Use the page’s picture/)
    expect(html).toContain('The posts land on your plan as drafts.')
  })

  it('says the preview: posts and days, and Promote is on', () => {
    const html = render([page(1, 'A'), page(2, 'B')], { wanted: 20, fit: 20, first_date: '2026-10-08', last_date: '2026-12-15', weeks: 10 })
    expect(html).toContain('Posts: 20 · 8 Oct – 15 Dec')
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Promote<\/button>/)
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Promote<\/button>/)
  })

  it('says how many fit when not all do, and Promote is off', () => {
    const html = render([page(1, 'A')], { wanted: 10, fit: 6, first_date: '2026-10-08', last_date: '2026-10-20', weeks: 2 })
    expect(html).toContain('Posts that fit in these days: 6 of 10.')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Promote<\/button>/)
  })

  it('names more than five pages by count, and says when the brand has no channel to post on', () => {
    expect(render([1, 2, 3, 4, 5, 6, 7].map(i => page(i, `Page ${i}`)))).toContain('More: 2')
    expect(render([page(1, 'A')], undefined, [channel('blog')])).toContain('This brand has no active channel to post on.')
  })
})
```

- [ ] **Step 2: Run it to see it fail** — `$WS/vt.sh src/content/promote/promoteDialog.test.tsx` → FAIL (the stub renders nothing).

- [ ] **Step 3: Write the code** — `frontend/src/content/promote/PromoteDialog.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import { refreshLists } from '../lib/planCache'
import type { Platform, SitePage } from '../lib/types'
import { Dialog } from '../ui/Dialog'
import { PlatformMark } from '../ui/PlatformMark'
import {
  DEFAULT_PER_PAGE, DEFAULT_PER_WEEK, MAX_PER_PAGE, MAX_PER_WEEK, PROBLEM_TEXT, defaultPeriod, newForm, previewLine, promotablePlatforms,
  promoteProblems, promotionBody, type PromoteForm,
} from './promoteMath'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'
const SHOWN = 5

/**
 * Promote… (spec 2026-10-20 §4.2): posts per page, channels, the period, the pace, the picture and instructions; under
 * them the server's preview (no AI, nothing written) says the posts and their days, or how many fit. Promote is on only
 * when they all fit. The period follows the numbers until the manager changes a date.
 */
export function PromoteDialog({ pages, onClose, onStarted }: { pages: SitePage[]; onClose: () => void; onStarted: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const api = useApi()
  const brand = useBrandId()
  const boot = useBoot()
  const queryClient = useQueryClient()
  const today = boot.venue.today
  const brandInfo = useQuery({ queryKey: ['content', brand, 'brand'], queryFn: api.brand, staleTime: 300_000 })
  const channels = useMemo(() => promotablePlatforms(brandInfo.data?.channels ?? []), [brandInfo.data])
  const [form, setForm] = useState<PromoteForm>(() => newForm(today, pages.length, []))
  const [off, setOff] = useState<Platform[]>([])
  const [datesTouched, setDatesTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current: PromoteForm = { ...form, platforms: channels.filter(p => !off.includes(p)) }
  const problems = promoteProblems(pages.length, current, today)
  const body = promotionBody(pages.map(p => p.id), current)
  const preview = useQuery({
    queryKey: ['content', brand, 'promotion-preview', JSON.stringify(body)],
    queryFn: () => api.previewPromotion(body),
    enabled: problems.length === 0,
    staleTime: 30_000,
    retry: false,
  })
  const words = preview.data ? previewLine(preview.data, t, locale) : null
  const previewError = preview.error ? errorKey('promote', failureOf(preview.error).code) : null

  /** A number changed: the period follows it until a date is changed by hand. */
  const numbers = (next: Partial<PromoteForm>) => setForm(f => {
    const merged = { ...f, ...next }
    if (datesTouched) return merged
    const { from, to } = defaultPeriod(today, pages.length * (merged.perPage || DEFAULT_PER_PAGE), merged.perWeek || DEFAULT_PER_WEEK)
    return { ...merged, from, to }
  })

  const submit = async () => {
    if (busy || problems.length > 0 || !words?.fits) return
    setBusy(true)
    setError(null)
    try {
      const run = await api.promote(body)
      queryClient.setQueryData(['content', brand, 'promotion'], run)
      if (run.status === 'finished') {
        void refreshLists(queryClient, brand)
        void queryClient.invalidateQueries({ queryKey: ['content', brand, 'site'] })
      }
      onStarted()
    } catch (e) {
      const [key, text] = errorKey('promote', failureOf(e).code)
      setError(t(key, text))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title={t('content.promote.dialog.title', 'Promote pages')} onClose={onClose} busy={busy}>
      <div className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-a-text">{t('content.promote.dialog.pages', 'Pages chosen: {{count}}', { count: pages.length })}</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-a-text-2">
            {pages.slice(0, SHOWN).map(p => <li key={p.id} className="break-words">{p.title}</li>)}
          </ul>
          {pages.length > SHOWN && <p className="mt-1 text-xs text-a-text-2">{t('content.promote.dialog.more', 'More: {{count}}', { count: pages.length - SHOWN })}</p>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('content.promote.dialog.per_page', 'Posts per page')}>
            <input type="number" min={1} max={MAX_PER_PAGE} value={form.perPage} onChange={(e) => numbers({ perPage: Number(e.target.value) })} className={INPUT} />
          </Field>
          <Field label={t('content.promote.dialog.per_week', 'At most per week')}>
            <input type="number" min={1} max={MAX_PER_WEEK} value={form.perWeek} onChange={(e) => numbers({ perWeek: Number(e.target.value) })} className={INPUT} />
          </Field>
        </div>
        {brandInfo.data && channels.length === 0 ? (
          <Notice tone="warning">{t('content.promote.dialog.no_channels', 'This brand has no active channel to post on. Add one on the Brand page.')}</Notice>
        ) : (
          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-a-text-2">{t('content.promote.dialog.channels', 'Channels')}</legend>
            <div className="flex flex-wrap gap-3">
              {channels.map(p => (
                <label key={p} className="inline-flex items-center gap-1.5 text-sm text-a-text">
                  <input type="checkbox" checked={!off.includes(p)} onChange={() => setOff(o => (o.includes(p) ? o.filter(x => x !== p) : [...o, p]))} />
                  <PlatformMark platform={p} size="sm" />{t(`content.platform.${p}`, p)}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('content.promote.dialog.from', 'From')}>
            <input type="date" value={form.from} min={today} onChange={(e) => { setDatesTouched(true); setForm(f => ({ ...f, from: e.target.value })) }} className={INPUT} />
          </Field>
          <Field label={t('content.promote.dialog.to', 'To')}>
            <input type="date" value={form.to} min={form.from} onChange={(e) => { setDatesTouched(true); setForm(f => ({ ...f, to: e.target.value })) }} className={INPUT} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-a-text">
          <input type="checkbox" checked={form.usePicture} onChange={(e) => setForm(f => ({ ...f, usePicture: e.target.checked }))} />{t('content.promote.dialog.picture', 'Use the page’s picture')}
        </label>
        <Field label={t('content.promote.dialog.instructions', 'Instructions for the AI (optional)')}>
          <textarea value={form.instructions} onChange={(e) => setForm(f => ({ ...f, instructions: e.target.value }))} rows={3} maxLength={2000} className={INPUT} />
        </Field>
        {problems.length > 0 && channels.length > 0 && (
          <ul className="space-y-1 text-xs text-a-danger">
            {problems.map(p => <li key={p}>{t(`content.promote.dialog.problem.${p}`, PROBLEM_TEXT[p])}</li>)}
          </ul>
        )}
        {problems.length === 0 && preview.isFetching && !words && <p role="status" className="text-sm text-a-text-2">{t('content.promote.dialog.checking', 'Checking the days…')}</p>}
        {words && <Notice tone={words.fits ? 'info' : 'warning'}>{words.text}</Notice>}
        {previewError && <Notice tone="danger">{t(previewError[0], previewError[1])}</Notice>}
        <p className="text-xs text-a-text-2">{t('content.promote.dialog.drafts_note', 'The posts land on your plan as drafts. You can change, move or delete each one.')}</p>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>{t('content.common.cancel', 'Cancel')}</Button>
          <Button type="button" onClick={() => { void submit() }} loading={busy} disabled={problems.length > 0 || !words?.fits}>{t('content.promote.dialog.submit', 'Promote')}</Button>
        </div>
      </div>
    </Dialog>
  )
}
```

Add to `FAMILIES` in `contentLocales.test.ts`: `'promote.dialog.problem': ['no_pages', 'too_many_pages', 'no_channels', 'per_page', 'per_week', 'too_many_posts', 'order', 'too_long', 'past'],`.

- [ ] **Step 4: Words** — `$WS/t5-words.json`: `promote.dialog.title`, `.pages`, `.more`, `.per_page`, `.channels`, `.no_channels`, `.from`, `.to`, `.per_week`, `.picture`, `.instructions`, `.checking`, `.fits`, `.short`, `.drafts_note`, `.submit`, and `promote.dialog.problem.<each>` (the `PROBLEM_TEXT` English), in five languages; merge.

- [ ] **Step 5: Run the tests** — `$WS/vt.sh src/content/promote src/content/i18n src/i18n` → pass; `npx tsc -b` clean.

- [ ] **Step 6: Commit** — "Content portal: the promote dialog with the server's preview".

---

### Task 6: The Plan's promotion line and the panel's "Promotes"

**Files:**
- Create: `frontend/src/content/panel/PromotesLine.tsx`
- Modify: `frontend/src/content/panel/PostPanel.tsx`, `frontend/src/content/plan/PlanPage.tsx`
- Test: `frontend/src/content/panel/promotesLine.test.tsx`, `frontend/src/content/promote/planPromotion.test.tsx`
- Words: `$WS/t6-words.json`

**Interfaces:**
- Consumes: `usePromotionWatch`, `isPromoting` (Tasks 2–3), `PostDetail.promotes`.
- Produces: `<PromotesLine page />` (`data-promotes`); `<PromotingLine run />` (exported from `PromotesLine.tsx`'s sibling `promote/PromotingLine.tsx`); the Plan's note when a promotion ends.

- [ ] **Step 1: Write the failing tests**

`frontend/src/content/panel/promotesLine.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key, i18n: { language: 'en-GB' } }),
}))

import { PromotesLine } from './PromotesLine'

describe('the panel’s Promotes line (spec 2026-10-20 §4.7)', () => {
  it('names the page and opens it in a new tab', () => {
    const html = renderToStaticMarkup(<PromotesLine page={{ id: 4, title: 'Autumn colours', url: 'https://lumiere.example/blog/autumn' }} />)
    expect(html).toContain('Promotes:')
    expect(html).toMatch(/<a href="https:\/\/lumiere.example\/blog\/autumn" target="_blank" rel="noopener noreferrer"[^>]*>Autumn colours<\/a>/)
  })
})
```

`frontend/src/content/promote/planPromotion.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key, i18n: { language: 'en-GB' } }),
}))

import type { PromotionRun } from '../lib/types'
import { PromotingLine } from './PromotingLine'

const running: PromotionRun = { status: 'running', batch: 'b', created_count: 0, wanted_count: 4, finished_at: null, pages: [] }

describe('the Plan hears a promotion (spec 2026-10-20 §5)', () => {
  it('shows a line while the AI writes promotion posts, and nothing otherwise', () => {
    expect(renderToStaticMarkup(<PromotingLine run={running} />)).toContain('The AI is writing promotion posts…')
    expect(renderToStaticMarkup(<PromotingLine run={{ status: 'idle' }} />)).toBe('')
    expect(renderToStaticMarkup(<PromotingLine run={undefined} />)).toBe('')
  })
})
```

- [ ] **Step 2: Run them to see them fail** — `$WS/vt.sh src/content/panel/promotesLine.test.tsx src/content/promote/planPromotion.test.tsx` → FAIL.

- [ ] **Step 3: Write the code**

`frontend/src/content/panel/PromotesLine.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Megaphone } from 'lucide-react'

/** The page a promotion post promotes (spec 2026-10-20 §4.7), opening in a new tab. */
export function PromotesLine({ page }: { page: { id: number; title: string; url: string } }) {
  const { t } = useTranslation()
  return (
    <p data-promotes="" className="flex flex-wrap items-center gap-1.5 text-sm text-a-text-2">
      <Megaphone size={14} aria-hidden className="shrink-0" />
      <span>{t('content.panel.promotes', 'Promotes:')}</span>
      <a href={page.url} target="_blank" rel="noopener noreferrer" className="min-w-0 break-words font-medium text-a-accent-text hover:underline">{page.title}</a>
    </p>
  )
}
```

`frontend/src/content/promote/PromotingLine.tsx`:

```tsx
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import type { PromotionRun } from '../lib/types'
import { isPromoting } from './promoteMath'

/** The Plan's line while a promotion writes on the queue worker (spec 2026-10-20 §5); nothing otherwise. */
export function PromotingLine({ run }: { run: PromotionRun | undefined }) {
  const { t } = useTranslation()
  if (!isPromoting(run)) return null
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-a-text-2">
      <Loader2 size={14} aria-hidden className="motion-safe:animate-spin" />
      {t('content.plan.promoting', 'The AI is writing promotion posts…')}
    </p>
  )
}
```

In `panel/PostPanel.tsx`: import `PromotesLine` and render `{post?.promotes && <PromotesLine page={post.promotes} />}` right after `{post && <ReviewBar … />}`.

In `plan/PlanPage.tsx`: import `useCallback` (if not imported), `usePromotionWatch` from `../promote/useSite`, `PromotingLine` from `../promote/PromotingLine`; after the generation watcher add:

```tsx
  // A promotion finishing on the queue worker (spec 2026-10-20 §5): the plan is read again (the watcher does it) and says so.
  const onPromoted = useCallback((run: PromotionRun) => {
    if (run.status === 'finished') {
      setNote({ tone: 'info', text: t('content.promote.run.done', 'Promotion posts added to your plan as drafts: {{count}}', { count: run.created_count }), undo: null })
    }
  }, [t])
  const promotion = usePromotionWatch(onPromoted)
```

and beside the Generate line: `{isPromoting(promotion.data) && <div className="px-4 pb-3 lg:px-6"><PromotingLine run={promotion.data} /></div>}` (import `isPromoting` from `../promote/promoteMath` and the `PromotionRun` type).

- [ ] **Step 4: Words** — `$WS/t6-words.json`: `panel.promotes` ("Promotes:"), `plan.promoting`, in five languages; merge.

- [ ] **Step 5: Run the tests** — `$WS/vt.sh src/content` (the whole Content suite) → pass; `npx tsc -b` clean.

- [ ] **Step 6: Commit** — "Content portal: the Plan follows a promotion; the panel names the page a post promotes".

---

### Task 7: The runbook — release 6's portal

**Files:**
- Modify: `docs/content-workspace.md` (the portal section)

- [ ] **Step 1:** In "The portal (`/content`, `frontend/src/content/`)", add a paragraph: the Promote page (`/content/promote`, `promote/`), its two shared queries (`['content', brand, 'site']`, `['content', brand, 'promotion']`, read every 4 s while a scan or a promotion runs; `usePromotionWatch` reads the plan and the pages' numbers again when a run ends), the Website section on the Brand page (first after Readiness), the dialog's preview (`POST promotions/preview`, keyed by the request), Remove draft posts, the panel's "Promotes" line and the Plan's line; error families `site`, `promote`, `promotion`, `summary`, `drafts`.
- [ ] **Step 2: Commit** — "Content runbook: release 6's portal".

---

### Task 8: The release checks

Every check of spec §7 on the finished branch, before the final whole-branch review's fix pass is closed and before the deploy. This task writes to `$WS` (git-ignored), to the local database (a temporary brand and staff member, removed at the end) and, for each defect a check finds, to the branch: each fix test-first, ledgered `Task 8: fixed <what> — <test> RED→GREEN`, its own commit.

**Files:**
- Create under `$WS`: `tools/` (a copy of `.superpowers/sdd/archive/2026-10-19-content-release-5b-2/tools/` without its `node_modules`), new `tools/pass.mjs` and `tools/lh.mjs`, `pass-seed.php`, `pass-unseed.php`, the outputs `final-vitest.txt`, `final-php.txt`, `build.txt`, `lighthouse.md`, `eyes.md`, `pass.txt`.
- Temporary: base worktree `C:\wamp64\www\Hexa-Tech-content-base` (origin/main) with a `node_modules` junction; local servers :8012 (API), :5173 (Vite), :8099 (Lighthouse sign-in) — all undone at the end.

- [ ] **Step 1: Frontend suites** — `cd frontend && npx tsc -b && echo TSC-CLEAN`; `npx vitest run > $WS/final-vitest.txt 2>&1` (expect only the 3 `plannerMeta` failures); `npx eslint src/content src/workspace src/App.tsx src/lib/api.ts` (expect the baseline count ledgered before Task 2, no new problem in `src/content/promote`).
- [ ] **Step 2: Every PHP suite by folder** — as 5B-2 Task 6 Step 2: `{ ls -d tests/Feature/*/ tests/Unit/*/; ls tests/Feature/*.php tests/Unit/*.php; } > $WS/php-paths.txt`; run `$WS/php.sh` over them in batches of 10 (tee to `final-php.txt`), `tests/Feature/Landing/` alone in the background; every line `exit 0`. A failing path in this release's change list (`git diff --name-only 85156069d HEAD`) is ours: fix test-first. Otherwise run it again alone; still failing → ledger `pre-existing`.
- [ ] **Step 3: Build check** — `npx vite build --outDir $WS/build --emptyOutDir`; exit 0; the words `Blog articles`, `Promotion posts added` appear only in `ContentApp-*.js`; nothing in `index-*.js`; restore `frontend/dist/stats.html`, remove `$WS/build`, `git status --short` empty.
- [ ] **Step 4: Appointments, pixel for pixel** — as 5B-2 Task 6 Step 4 with `assertTree` checking `/src/content/promote/PromotePage.tsx` and `TOKEN_NAME = 'content-r6-pixels'`; expected `46 screens, 0 differ` and keys the same.
- [ ] **Step 5: The browser pass, for real** — `pass-seed.php` makes a set-up brand "Release check 6: promote" on org 16 (approvals off; Instagram every day, LinkedIn Tue/Thu, Facebook every day) and a temporary staff member `release-check-6-staff@example.test`; `pass.mjs` (Playwright, as 5B-2's) checks, as the manager: Brand page Website section → enter `https://hexa-tech.uk`, untick nothing, Scan → "Reading your website…" then "Scanned …" within 3 minutes (the local queue is sync, so the request itself waits); the company summary appears; the Promote page lists articles (≥ 1, e.g. "How to reduce no-shows") and other pages; tick one article; Promote… → 2 posts per page, one channel (Instagram), the next two weeks; the preview says "Posts: 2 · …"; Promote → the finished line "Promotion posts added to your plan as drafts: 2"; Show posts lists 2 posts; one opens in the panel with "Promotes: …", its short link and the article's picture; the Plan shows the posts; Remove draft posts → "Draft posts removed: 2"; as staff: the Promote page read-only (no boxes), the Brand page's summary without Edit; phones at 390: the Promote page and the dialog fit (`scrollWidth <= innerWidth`). Expected: every check PASS, console errors 0. A real scan and one real promotion spend a few cents of AI.
- [ ] **Step 6: Lighthouse** — `lh.mjs` audits `/content/promote` (with the list), the dialog open, and `/content/brand` (Website section): no failing audit the portal can fix; each other one ruled.
- [ ] **Step 7: Eyes** — read every screenshot of the pass at 1440 and 390; one line each in `eyes.md`; anything a person would find wrong is fixed.
- [ ] **Step 8:** If anything was fixed, Steps 1–2 again for the touched paths.
- [ ] **Step 9: Clean up** — `pass-unseed.php` (the brand, its site, pages, promotions, posts, links, the staff member); tokens 0; jobs as before; servers stopped (ports free); base worktree removed (junction first with `cmd /c rmdir`); `git status --short` empty.
- [ ] **Step 10: Ledger** — `Task 8: note: vitest …; PHP <n> paths green; build clean; Appointments 46/0; Lighthouse …; pass <n> checks 0 failed; eyes ok`.

---

### Task 9: The deploy (source-patch recipe)

Run after the final whole-branch review and its fix pass. Standing go (memory `deploy-without-asking`): once the artifact is proven, push without asking; stop on a tripped guard, a failing check, or a migration that is not additive.

- [ ] **Step 1: Worktree** — `git fetch origin && git worktree add -b deploy/content-release-6 ../Hexa-Tech-content-deploy origin/main`; confirm `git log -1 origin/main` is `504166b3c` (or the ledger names why not); robocopy `vendor` (PowerShell: `robocopy C:\wamp64\www\Hexa-Tech-content\vendor C:\wamp64\www\Hexa-Tech-content-deploy\vendor /E /NFL /NDL /NJH /NJS /NP`), copy `.env`, junction `frontend/node_modules`.
- [ ] **Step 2: Change list** — `git diff --name-status 85156069d <feature tip> > $WS/deploy-list.txt`; guard: every path under `app/`, `database/migrations/2026_10_20_*`, `routes/api.php`, `tests/`, `frontend/src/content/`, `docs/`, `resources/`? (expected: none), `config/`? (expected: none); any path outside `app/ database/ routes/ tests/ frontend/src/ docs/` stops the deploy. Exclude `frontend/dist`, `public/spa`.
- [ ] **Step 3: Apply** — `git -C ../Hexa-Tech-content-deploy checkout <feature tip> -- <each path>`; deletions with `git rm`; then `git reset` and commit the source ("Content release 6: promote your website — the scan, the company summary, promotions (source)").
- [ ] **Step 4: Parity** — `git diff <feature tip> HEAD -- <each path>` in the deploy worktree prints nothing.
- [ ] **Step 5: Tests on the artifact** — every PHP path of `$WS/php-paths.txt` in the deploy worktree (`php-deploy.sh` pointing at it) and `npx tsc -b && npx vitest run` there; all green (3 `plannerMeta`).
- [ ] **Step 6: Build** — `npm run build` in the deploy worktree; commit `frontend/dist` and `public/spa` ("Content release 6: build").
- [ ] **Step 7: Push** — `git push origin deploy/content-release-6:main`.
- [ ] **Step 8: Verify by content** — poll `https://app.hexa-tech.uk/spa/` (or the app host) until the new index bundle name appears; `curl -s -o /dev/null -w '%{http_code}' https://app.hexa-tech.uk/api/v1/admin/content/site` → `401` (404 before); Laravel Cloud's latest deployment for the pushed commit `succeeded` (`GET /environments/{env}/deployments`); `php artisan migrate:status` via `cloud-cmd.sh` lists the four `2026_10_20_1000*` migrations as Ran.
- [ ] **Step 9: Clean up** — remove the deploy worktree (junction first), keep the branch; update memory `content-workspace.md` and `MEMORY.md`; report.
