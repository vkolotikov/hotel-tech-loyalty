# Content release 6, Plan 6-1: the server (scan the website, promote its pages)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Content can read a brand's website (articles and pages, a company summary) and write promotion posts for chosen pages, spread over a period, each with its own tracked short link — all on the `ai` queue worker.

**Architecture:** Small pure readers under `App\Services\Content\Web` (addresses, robots, sitemaps/feeds, HTML) and a fetcher that only reaches public addresses; a discovery + scan service and its job write `content_sites` / `content_site_pages`; a pure schedule spreads posts; a writer (one AI call per page) and its chained job write posts through the release-5b link service; controllers answer the portal.

**Tech Stack:** Laravel 13 / PHP 8.4, ext-dom (DOMDocument), Laravel HTTP client (Guzzle, curl `CURLOPT_RESOLVE`), PHPUnit 11 on SQLite, Mockery-free fakes bound in the container.

**Spec:** `docs/superpowers/specs/2026-10-20-content-release-6-design.md`

## Global Constraints

- PHP: always `/c/wamp64/bin/php/php8.4.20/php.exe`; never a bare `php artisan test` — run each test path alone (`$WS/php.sh PATH…`).
- Work in `C:\wamp64\www\Hexa-Tech-content` on `feature/content-workspace`; commit with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; never commit `frontend/dist` or `public/spa`.
- Migrations are additive and guarded (`Schema::hasTable` / `hasColumn`), as every Content migration; foreign keys on an existing table are added on PostgreSQL only (as `poster_id`).
- Content refusals are `ContentRefused(code, English sentence, status[, extra])`; managers-only actions call `ContentAccess::requireManager` first.
- The long jobs: `tries = 1`, `timeout = 600`, `$this->onQueue('ai')` in the constructor; they bind `current_organization_id` / `current_brand_id` (and the presser with `Auth::setUser`) and restore them in `finally`.
- Fetching: `GET` only, `User-Agent: HexaTechContentBot/1.0 (+{app.url})`, 10 s per request (5 s connect), ≤ 4 redirects each checked again, public addresses only, pinned with `CURLOPT_RESOLVE`; HTML ≤ 3 MB, XML ≤ 10 MB, pictures ≤ 5 MB.
- Caps (spec D8, §3.3, §3.5): 100 articles, 30 pages, 12 sitemap files, 5,000 addresses, 420 s of reading, 20 scans per organisation per day; posts per page 1–15, pace 1–21, ≤ 20 pages and ≤ 200 posts per press, period ≤ 183 days.
- Run states: a scan runs while queued ≤ 1,800 s or started ≤ 660 s ago; a promotion row `writing` ≤ 660 s; a batch without progress for 1,800 s reads failed; a finished batch is shown for 3,600 s.
- Tests fake DNS (`HostResolver` bound in the container) and HTTP (`Http::fake` + `Http::preventStrayRequests()`); AI services are not-final classes replaced in the container by anonymous subclasses — no test reaches the network or the AI.

## Review Focus

- A site that answers HTML (a "soft 404") for `robots.txt` or `/sitemap.xml` — expect: no rules / not a sitemap, and the scan goes on from the home page (Task 5 test `test_html_answered_for_robots_and_sitemap_is_not_taken_for_them`).
- A home page that redirects to `www.` or to `https` — expect the redirected host to count as the site, and links on a third-party host never listed (Task 5 test `test_the_redirected_home_host_is_the_site`).
- Two presses of Promote at once (two tabs) — expect one batch; the second answers `already_promoting` (Task 9 test `test_a_second_promotion_while_one_runs_is_refused`).
- Channels that post on different weekdays (Instagram Mon/Wed/Fri, LinkedIn Tue/Thu) — expect each page's posts on both channels (Task 7 test `test_channels_take_turns_even_on_different_weekdays`).
- A promoted page that disappears from the site — expect it kept with `seen: false` and its numbers, not deleted by the next scan (Task 5 test `test_a_new_scan_replaces_the_list_but_keeps_promoted_pages`).

## File map

| File | Responsibility |
|---|---|
| `database/migrations/2026_10_20_1000{00,100,200,300}_*.php` | the four additive migrations (spec §6.1) |
| `app/Models/ContentSite.php`, `ContentSitePage.php`, `ContentPromotion.php` | the three tables |
| `app/Services/Content/Web/Urls.php` | absolute / normal addresses (pure) |
| `app/Services/Content/Web/PublicAddress.php`, `HostResolver.php` | which addresses may be read; DNS |
| `app/Services/Content/Web/UrlRules.php` | same site, never kept, article vs page, ranking (pure) |
| `app/Services/Content/Web/RobotsRules.php`, `SitemapReader.php`, `PageReader.php` | robots, sitemaps/feeds, HTML (pure) |
| `app/Services/Content/Web/WebFetcher.php`, `WebResponse.php` | the safe GET |
| `app/Services/Content/ContentSiteDiscovery.php` | robots → sitemaps → feed → blog page → candidates |
| `app/Services/Content/ContentSiteScan.php` | reads candidates, saves pages, the summary, the outcome |
| `app/Services/Content/ContentSiteSummarizer.php` | the company summary AI call (prompt + answer pure) |
| `app/Services/Content/ContentSites.php` | site state, `GET site` payload, page numbers |
| `app/Jobs/ScanContentWebsite.php` | the scan on the `ai` queue |
| `app/Http/Controllers/Api/V1/Admin/Content/SiteController.php` | `GET/PUT site`, `POST site/scan`, `DELETE site/pages/{id}/posts` |
| `app/Services/Content/PromotionSchedule.php` | spreading the posts (pure) |
| `app/Services/Content/PromotionWriter.php` | one AI call per page (prompt + answer pure) |
| `app/Services/Content/ContentPromotionPosts.php` | one page's posts: text, picture, posts, links, briefs |
| `app/Services/Content/ContentPromotions.php` | checks + plan, batch state, stop, stale, `promotes` |
| `app/Jobs/WritePromotionPosts.php` | one page per job, chained |
| `app/Http/Controllers/Api/V1/Admin/Content/PromotionController.php` | preview, start, current, stop |
| modified: `ContentLinks.php` (campaign), `ContextBuilder.php` (website section), `ContentKnowledgeService.php` (website fallback), `ContentPostPresenter.php` (`promotes`), `ContentVersions.php` / `ContentRepeat.php` (`site_page_id` copied), `ContentPlannerPost.php` (fillable), `routes/api.php`, `tests/Concerns/SetsUpContentSchema.php`, `tests/Feature/QueueRetryAfterTest.php`, `docs/content-workspace.md` |
| `tests/Concerns/FakesWebsite.php` | fake DNS + fake site for tests |

Workspace (`$WS`): `.superpowers/sdd/2026-10-20-content-release-6-1/` with `php.sh` (copied from the small-fixes archive: runs each path alone and prints `<path> | <Tests: line> | exit <code>`).

---

### Task 1: The tables and models

**Files:**
- Create: `database/migrations/2026_10_20_100000_create_content_sites_table.php`, `2026_10_20_100100_create_content_site_pages_table.php`, `2026_10_20_100200_create_content_promotions_table.php`, `2026_10_20_100300_add_site_page_id_to_content_planner_posts.php`
- Create: `app/Models/ContentSite.php`, `app/Models/ContentSitePage.php`, `app/Models/ContentPromotion.php`
- Modify: `app/Models/ContentPlannerPost.php` (fillable `site_page_id`), `tests/Concerns/SetsUpContentSchema.php`
- Test: `tests/Feature/Content/SiteTablesTest.php`

**Interfaces:**
- Produces: `ContentSite` (casts: the four timestamps, `summary_edited` bool), `ContentSitePage` (`published_at`, `last_seen_at` datetimes; `campaignName(): string`), `ContentPromotion` (`slots` array, `use_picture` bool, `started_at`/`finished_at`; `page(): BelongsTo`), `ContentPlannerPost::$fillable` gains `site_page_id`. The test schema has all four migrations and `organizations.website`.

- [ ] **Step 1: Write the failing test**

`tests/Feature/Content/SiteTablesTest.php`:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentPromotion;
use App\Models\ContentSite;
use App\Models\ContentSitePage;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Release 6's tables (spec 2026-10-20 §6.1): a site per profile, its pages, its promotions, and a post's page. */
class SiteTablesTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function site(): ContentSite
    {
        return ContentSite::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'url' => 'https://lumiere.example']);
    }

    public function test_a_site_its_pages_and_a_promotion_keep_their_values(): void
    {
        $site = $this->site();
        $page = ContentSitePage::create([
            'site_id' => $site->id, 'brand_id' => $this->brandId, 'url' => 'https://lumiere.example/blog/autumn-colours',
            'url_hash' => hash('sha256', 'https://lumiere.example/blog/autumn-colours'), 'kind' => 'article', 'title' => 'Autumn colours',
            'published_at' => '2026-09-01 10:00:00', 'last_seen_at' => now(),
        ]);
        $promotion = ContentPromotion::create([
            'planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'site_page_id' => $page->id, 'batch' => 'b-1',
            'status' => 'queued', 'posts_wanted' => 2, 'slots' => [['platform' => 'instagram', 'date' => '2026-10-07', 'time' => '18:00']],
        ]);
        $post = $this->makePost(['site_page_id' => $page->id]);

        $site->refresh();
        $this->assertSame('new', $site->status);
        $this->assertFalse($site->summary_edited);
        $this->assertSame($this->org->id, (int) $site->organization_id);
        $this->assertSame('2026-09-01', $page->fresh()->published_at->format('Y-m-d'));
        $this->assertSame('instagram', $promotion->fresh()->slots[0]['platform']);
        $this->assertTrue($promotion->fresh()->use_picture);
        $this->assertSame(0, $promotion->fresh()->posts_made);
        $this->assertSame($page->id, $promotion->fresh()->page->id);
        $this->assertSame($page->id, (int) $post->fresh()->site_page_id);
    }

    public function test_one_site_per_profile_and_one_row_per_address(): void
    {
        $site = $this->site();
        $row = ['site_id' => $site->id, 'brand_id' => $this->brandId, 'url' => 'https://lumiere.example/', 'url_hash' => hash('sha256', 'https://lumiere.example/'), 'kind' => 'page', 'title' => 'Home'];
        ContentSitePage::create($row);

        $this->expectException(QueryException::class);
        ContentSitePage::create($row);
    }

    public function test_a_second_site_for_the_same_profile_is_refused(): void
    {
        $this->site();
        $this->expectException(QueryException::class);
        $this->site();
    }

    public function test_the_campaign_name_comes_from_the_address_else_the_title(): void
    {
        $page = new ContentSitePage(['url' => 'https://lumiere.example/blog/How-To_Choose%20Colour.html', 'title' => 'Ignored']);
        $this->assertSame('promote-how-to-choose-colour', $page->campaignName());
        $this->assertSame('promote-our-prices', (new ContentSitePage(['url' => 'https://lumiere.example/', 'title' => 'Our prices']))->campaignName());
        $this->assertSame('promote-website', (new ContentSitePage(['url' => 'https://lumiere.example/', 'title' => '']))->campaignName());
        $long = (new ContentSitePage(['url' => 'https://lumiere.example/' . str_repeat('a-', 40), 'title' => '']))->campaignName();
        $this->assertLessThanOrEqual(58, strlen($long));
        $this->assertStringEndsNotWith('-', $long);
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `$WS/php.sh tests/Feature/Content/SiteTablesTest.php`
Expected: FAIL — `Class "App\Models\ContentSite" not found` (or the migration file missing).

- [ ] **Step 3: Write the migrations**

`database/migrations/2026_10_20_100000_create_content_sites_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Content release 6 (spec 2026-10-20 §3, §6.1): the brand's website as Content reads it — its address, its scan (a
 * token per scan, so a late job cannot write over a newer one) and the company summary every AI call reads.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('content_sites')) {
            return;
        }
        Schema::create('content_sites', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('planner_profile_id')->constrained('content_planner_profiles')->cascadeOnDelete();
            $table->string('url', 2000)->nullable();
            $table->string('status', 12)->default('new');
            $table->string('error', 40)->nullable();
            $table->string('scan_token', 36)->nullable();
            $table->timestamp('scan_queued_at')->nullable();
            $table->timestamp('scan_started_at')->nullable();
            $table->timestamp('scanned_at')->nullable();
            $table->unsignedInteger('articles_count')->default(0);
            $table->unsignedInteger('pages_count')->default(0);
            $table->text('summary')->nullable();
            $table->timestamp('summary_updated_at')->nullable();
            $table->boolean('summary_edited')->default(false);
            $table->string('summary_note', 40)->nullable();
            $table->timestamps();
            $table->unique('planner_profile_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_sites');
    }
};
```

`database/migrations/2026_10_20_100100_create_content_site_pages_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Content release 6 (spec 2026-10-20 §3.4, §6.1): the articles and pages a scan found. One row per address (its sha-256,
 * because a 2,000-character address cannot be a unique index everywhere); `picture_url` is the page's picture copied
 * into Content's media store (`picture_source` the address it was copied from).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('content_site_pages')) {
            return;
        }
        Schema::create('content_site_pages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('site_id')->constrained('content_sites')->cascadeOnDelete();
            $table->string('url', 2000);
            $table->char('url_hash', 64);
            $table->string('kind', 8);
            $table->string('title', 300);
            $table->string('description', 1000)->nullable();
            $table->string('image_url', 2000)->nullable();
            $table->string('picture_url', 2000)->nullable();
            $table->string('picture_source', 2000)->nullable();
            $table->timestamp('published_at')->nullable();
            $table->string('language', 12)->nullable();
            $table->text('body')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();
            $table->unique(['site_id', 'url_hash']);
            $table->index(['site_id', 'kind']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_site_pages');
    }
};
```

`database/migrations/2026_10_20_100200_create_content_promotions_table.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Content release 6 (spec 2026-10-20 §4.5, §6.1): one row per page of a promotion; the rows of one press share `batch`.
 * `slots` holds the page's planned days and channels; a job writes one row's posts and queues the next row.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('content_promotions')) {
            return;
        }
        Schema::create('content_promotions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('planner_profile_id')->constrained('content_planner_profiles')->cascadeOnDelete();
            $table->foreignId('site_page_id')->nullable()->constrained('content_site_pages')->nullOnDelete();
            $table->string('batch', 36)->index();
            $table->string('status', 10);
            $table->string('error', 40)->nullable();
            $table->unsignedSmallInteger('posts_wanted');
            $table->unsignedSmallInteger('posts_made')->default(0);
            $table->json('slots');
            $table->text('instructions')->nullable();
            $table->boolean('use_picture')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
            $table->index(['planner_profile_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_promotions');
    }
};
```

`database/migrations/2026_10_20_100300_add_site_page_id_to_content_planner_posts.php`:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Content release 6 (spec 2026-10-20 §4.4, §6.1): the website page a post promotes. Its foreign key (null on delete) is
 * added on PostgreSQL; SQLite cannot add one to a table that exists, as with `poster_id`.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('content_planner_posts', 'site_page_id')) {
            return;
        }
        Schema::table('content_planner_posts', function (Blueprint $table) {
            $table->unsignedBigInteger('site_page_id')->nullable()->index();
            if (DB::getDriverName() === 'pgsql') {
                $table->foreign('site_page_id')->references('id')->on('content_site_pages')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasColumn('content_planner_posts', 'site_page_id')) {
            return;
        }
        Schema::table('content_planner_posts', function (Blueprint $table) {
            if (DB::getDriverName() === 'pgsql') {
                $table->dropForeign(['site_page_id']);
            }
            $table->dropColumn('site_page_id');
        });
    }
};
```

- [ ] **Step 4: Write the models**

`app/Models/ContentSite.php`:

```php
<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** The brand's website as Content reads it (spec 2026-10-20 §3): one per profile. */
class ContentSite extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id', 'brand_id', 'planner_profile_id', 'url', 'status', 'error', 'scan_token', 'scan_queued_at',
        'scan_started_at', 'scanned_at', 'articles_count', 'pages_count', 'summary', 'summary_updated_at', 'summary_edited',
        'summary_note',
    ];

    protected $casts = [
        'scan_queued_at'     => 'datetime',
        'scan_started_at'    => 'datetime',
        'scanned_at'         => 'datetime',
        'summary_updated_at' => 'datetime',
        'summary_edited'     => 'boolean',
        'articles_count'     => 'integer',
        'pages_count'        => 'integer',
    ];

    protected $attributes = ['status' => 'new', 'summary_edited' => false, 'articles_count' => 0, 'pages_count' => 0];

    public function pages(): HasMany
    {
        return $this->hasMany(ContentSitePage::class, 'site_id');
    }
}
```

`app/Models/ContentSitePage.php`:

```php
<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

/** An article or page a scan found (spec 2026-10-20 §3.4). */
class ContentSitePage extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id', 'brand_id', 'site_id', 'url', 'url_hash', 'kind', 'title', 'description', 'image_url',
        'picture_url', 'picture_source', 'published_at', 'language', 'body', 'last_seen_at',
    ];

    protected $casts = ['published_at' => 'datetime', 'last_seen_at' => 'datetime'];

    /** A promotion post's `utm_campaign` (spec §D11): `promote-` and the address's last part, else the title. */
    public function campaignName(): string
    {
        $segments = array_values(array_filter(explode('/', (string) parse_url((string) $this->url, PHP_URL_PATH)), fn (string $s) => $s !== ''));
        $last = $segments === [] ? '' : (string) preg_replace('/\.(html?|php|aspx?)$/i', '', rawurldecode($segments[count($segments) - 1]));
        $slug = Str::slug($last) ?: Str::slug((string) $this->title) ?: 'website';

        return 'promote-' . rtrim(mb_substr($slug, 0, 50), '-');
    }
}
```

`app/Models/ContentPromotion.php`:

```php
<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One page of a promotion (spec 2026-10-20 §4.5): queued → writing → done | failed, or stopped. */
class ContentPromotion extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id', 'brand_id', 'planner_profile_id', 'site_page_id', 'batch', 'status', 'error', 'posts_wanted',
        'posts_made', 'slots', 'instructions', 'use_picture', 'created_by', 'started_at', 'finished_at',
    ];

    protected $casts = [
        'slots'        => 'array',
        'use_picture'  => 'boolean',
        'posts_wanted' => 'integer',
        'posts_made'   => 'integer',
        'started_at'   => 'datetime',
        'finished_at'  => 'datetime',
    ];

    protected $attributes = ['posts_made' => 0, 'use_picture' => true];

    public function page(): BelongsTo
    {
        return $this->belongsTo(ContentSitePage::class, 'site_page_id');
    }
}
```

In `app/Models/ContentPlannerPost.php`, add `'site_page_id',` to `$fillable` after `'poster_id',`.

- [ ] **Step 5: Add them to the test schema**

In `tests/Concerns/SetsUpContentSchema.php`, add to the `$columns` map (after `'logo_url'`):

```php
            // The website's suggested address (spec 2026-10-20 §3.1) and the readiness check read it.
            'website'           => fn (Blueprint $t) => $t->string('website')->nullable(),
```

and after the `content_bio_buttons` block:

```php
        // Release 6 (spec 2026-10-20 §6.1): the website, its pages, promotions, and the page a post promotes.
        if (!Schema::hasTable('content_sites')) {
            (require database_path('migrations/2026_10_20_100000_create_content_sites_table.php'))->up();
        }
        if (!Schema::hasTable('content_site_pages')) {
            (require database_path('migrations/2026_10_20_100100_create_content_site_pages_table.php'))->up();
        }
        if (!Schema::hasTable('content_promotions')) {
            (require database_path('migrations/2026_10_20_100200_create_content_promotions_table.php'))->up();
        }
        if (!Schema::hasColumn('content_planner_posts', 'site_page_id')) {
            (require database_path('migrations/2026_10_20_100300_add_site_page_id_to_content_planner_posts.php'))->up();
        }
```

- [ ] **Step 6: Run it to see it pass**

Run: `$WS/php.sh tests/Feature/Content/SiteTablesTest.php`
Expected: `Tests: 4 passed`.

- [ ] **Step 7: Commit**

```bash
git add database/migrations/2026_10_20_1000*_*.php app/Models/ContentSite.php app/Models/ContentSitePage.php app/Models/ContentPromotion.php app/Models/ContentPlannerPost.php tests/Concerns/SetsUpContentSchema.php tests/Feature/Content/SiteTablesTest.php
git commit -m "Content release 6: tables for the website, its pages and promotions; a post's page"
```

---

### Task 2: Addresses — normal forms, public hosts, the site's rules

**Files:**
- Create: `app/Services/Content/Web/Urls.php`, `app/Services/Content/Web/PublicAddress.php`, `app/Services/Content/Web/HostResolver.php`, `app/Services/Content/Web/UrlRules.php`
- Test: `tests/Unit/Content/Web/UrlsTest.php`, `tests/Unit/Content/Web/PublicAddressTest.php`, `tests/Unit/Content/Web/UrlRulesTest.php`

**Interfaces:**
- Produces:
  - `Urls::absolute(string $href, string $base): ?string`, `Urls::normalize(string $url): ?string`, `Urls::origin(string $url): ?string`, `Urls::path(string $url): string`, `Urls::pathAndQuery(string $url): string`
  - `PublicAddress::clean(mixed $value): ?string`, `PublicAddress::isPublicIp(string $ip): bool`
  - `HostResolver::resolve(string $host): list<string>` (not final; tests subclass it)
  - `UrlRules::BLOG_FOLDERS`, `siteHost(string): string`, `sameSite(string $url, string $siteHost): bool`, `skipped(string): bool`, `looksLikeArticle(string $url, ?string $blogPath): bool`, `isBlogIndex(string $url, ?string $blogPath): bool`, `sitemapHint(string): ?string` (`article`|`page`|`skip`|null), `pageRank(string): int`, `lastPart(string): string`

- [ ] **Step 1: Write the failing tests**

`tests/Unit/Content/Web/UrlsTest.php`:

```php
<?php

namespace Tests\Unit\Content\Web;

use App\Services\Content\Web\Urls;
use PHPUnit\Framework\TestCase;

/** Addresses as the scan compares them (spec 2026-10-20 §3.2–§3.4). */
class UrlsTest extends TestCase
{
    public function test_relative_addresses_are_read_against_their_page(): void
    {
        $this->assertSame('https://ex.com/a/b', Urls::absolute('/a/b', 'https://ex.com/x/y'));
        $this->assertSame('https://ex.com/x/c', Urls::absolute('c', 'https://ex.com/x/y'));
        $this->assertSame('https://ex.com/x/c', Urls::absolute('../c', 'https://ex.com/x/y/z'));
        $this->assertSame('https://cdn.ex.com/i.png', Urls::absolute('//cdn.ex.com/i.png', 'https://ex.com/'));
        $this->assertSame('https://ex.com/blog/?p=5', Urls::absolute('?p=5', 'https://ex.com/blog/'));
        $this->assertSame('https://ex.com/A', Urls::absolute('HTTPS://EX.com:443/A#frag', 'https://other.com/'));
    }

    public function test_fragments_and_other_schemes_are_no_address(): void
    {
        $this->assertNull(Urls::absolute('#top', 'https://ex.com/'));
        $this->assertNull(Urls::absolute('mailto:ann@ex.com', 'https://ex.com/'));
        $this->assertNull(Urls::absolute('javascript:void(0)', 'https://ex.com/'));
        $this->assertNull(Urls::absolute('', 'https://ex.com/'));
    }

    public function test_the_normal_form_lowercases_drops_default_ports_fragments_and_dot_segments(): void
    {
        $this->assertSame('https://ex.com/', Urls::normalize('https://Ex.com'));
        $this->assertSame('http://ex.com/a/c?q=1', Urls::normalize('http://ex.com:80/a/./b/../c?q=1#x'));
        $this->assertSame('https://ex.com:8443/', Urls::normalize('https://ex.com:8443/'));
        $this->assertSame('https://ex.com/x', Urls::normalize('https://ex.com/../x'));
        $this->assertNull(Urls::normalize('ftp://ex.com/'));
        $this->assertNull(Urls::normalize('not an address'));
    }

    public function test_origin_path_and_query(): void
    {
        $this->assertSame('https://ex.com', Urls::origin('https://ex.com/a/b?x'));
        $this->assertSame('/a', Urls::path('https://ex.com/a?b=1'));
        $this->assertSame('/a?b=1', Urls::pathAndQuery('https://ex.com/a?b=1'));
        $this->assertSame('/', Urls::pathAndQuery('https://ex.com'));
    }
}
```

`tests/Unit/Content/Web/PublicAddressTest.php`:

```php
<?php

namespace Tests\Unit\Content\Web;

use App\Services\Content\Web\PublicAddress;
use PHPUnit\Framework\TestCase;

/** Only public addresses are read (spec 2026-10-20 §3.1, §3.5). */
class PublicAddressTest extends TestCase
{
    public function test_a_website_address_is_accepted(): void
    {
        foreach (['https://example.com', 'http://example.com/blog', 'https://example.com:443/x', ' https://example.com/a ', 'https://93.184.216.34/'] as $address) {
            $this->assertNotNull(PublicAddress::clean($address), $address);
        }
        $this->assertSame('https://example.com/a', PublicAddress::clean(' https://example.com/a '));
    }

    public function test_anything_else_is_refused(): void
    {
        $refused = [
            'ftp://example.com', 'https://localhost', 'https://intranet', 'https://shop.local', 'https://db.internal',
            'https://10.0.0.1', 'https://127.0.0.1/', 'https://[::1]/', 'https://example.com:8080', 'https://user:pw@example.com',
            'https://exa mple.com', '', 'example.com', 'https://' . str_repeat('a', 1990) . '.com', 'javascript:alert(1)',
        ];
        foreach ($refused as $address) {
            $this->assertNull(PublicAddress::clean($address), $address);
        }
        $this->assertNull(PublicAddress::clean(null));
        $this->assertNull(PublicAddress::clean(['https://example.com']));
    }

    public function test_private_reserved_and_mapped_ips_are_not_public(): void
    {
        $blocked = [
            '10.1.2.3', '172.16.0.1', '192.168.1.1', '127.0.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1',
            '255.255.255.255', '192.0.2.10', '198.18.0.1', '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1',
            '::ffff:10.0.0.1', '::ffff:127.0.0.1', '64:ff9b::a00:1', '2001:db8::1', '2002:a00:1::1', 'not an ip',
        ];
        foreach ($blocked as $ip) {
            $this->assertFalse(PublicAddress::isPublicIp($ip), $ip);
        }
    }

    public function test_public_ips_are_public(): void
    {
        foreach (['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111', '::ffff:8.8.8.8'] as $ip) {
            $this->assertTrue(PublicAddress::isPublicIp($ip), $ip);
        }
    }
}
```

`tests/Unit/Content/Web/UrlRulesTest.php`:

```php
<?php

namespace Tests\Unit\Content\Web;

use App\Services\Content\Web\UrlRules;
use PHPUnit\Framework\TestCase;

/** Which addresses belong to the site, which are articles, which are never kept (spec 2026-10-20 §3.3). */
class UrlRulesTest extends TestCase
{
    public function test_the_site_is_its_host_with_or_without_www(): void
    {
        $this->assertSame('ex.com', UrlRules::siteHost('https://www.Ex.com/a'));
        $this->assertTrue(UrlRules::sameSite('https://ex.com/x', 'ex.com'));
        $this->assertTrue(UrlRules::sameSite('https://www.ex.com/x', 'ex.com'));
        $this->assertFalse(UrlRules::sameSite('https://blog.ex.com/x', 'ex.com'));
        $this->assertFalse(UrlRules::sameSite('https://ex.com.evil.io/x', 'ex.com'));
    }

    public function test_lists_feeds_admin_shop_pages_files_and_queries_are_never_kept(): void
    {
        foreach (['/tag/x', '/category/news', '/author/ann', '/blog/page/2', '/feed', '/wp-json/wp/v2', '/cart', '/my-account',
            '/file.pdf', '/img/photo.JPG', '/sitemap.xml', '/a?utm_source=x', '/search'] as $path) {
            $this->assertTrue(UrlRules::skipped('https://ex.com' . $path), $path);
        }
        foreach (['/blog/how-to', '/?p=12', '/?page_id=4', '/services', '/'] as $path) {
            $this->assertFalse(UrlRules::skipped('https://ex.com' . $path), $path);
        }
    }

    public function test_articles_sit_below_a_blog_folder_or_under_a_year_and_month(): void
    {
        foreach (['/blog/how-to', '/en/blog/how-to', '/news/2024-update', '/2024/05/my-post', '/Блог/статья'] as $path) {
            $this->assertSame($path !== '/Блог/статья', UrlRules::looksLikeArticle('https://ex.com' . $path, null), $path);
        }
        foreach (['/blog', '/2024/05/', '/services/hair', '/insights-hub/x'] as $path) {
            $this->assertFalse(UrlRules::looksLikeArticle('https://ex.com' . $path, null), $path);
        }
        $this->assertTrue(UrlRules::looksLikeArticle('https://ex.com/stuff/post-1', '/stuff'));
        $this->assertFalse(UrlRules::looksLikeArticle('https://ex.com/stuff', '/stuff'));
        $this->assertTrue(UrlRules::looksLikeArticle('https://ex.com/a/b/c', '/a/b'));
    }

    public function test_the_blog_page_itself_is_not_an_article(): void
    {
        $this->assertTrue(UrlRules::isBlogIndex('https://ex.com/blog', null));
        $this->assertTrue(UrlRules::isBlogIndex('https://ex.com/en/blog/', null));
        $this->assertFalse(UrlRules::isBlogIndex('https://ex.com/blog/how-to', null));
        $this->assertTrue(UrlRules::isBlogIndex('https://ex.com/stuff', '/stuff'));
        $this->assertFalse(UrlRules::isBlogIndex('https://ex.com/', null));
    }

    public function test_a_child_sitemap_says_what_it_holds_by_its_name(): void
    {
        $hints = [
            'post-sitemap.xml' => 'article', 'page-sitemap.xml' => 'page', 'wp-sitemap-posts-post-1.xml' => 'article',
            'wp-sitemap-posts-page-1.xml' => 'page', 'wp-sitemap-taxonomies-category-1.xml' => 'skip', 'wp-sitemap-users-1.xml' => 'skip',
            'category-sitemap.xml' => 'skip', 'sitemap-news.xml' => 'article', 'sitemap-pages.xml' => 'page',
            'product_cat-sitemap.xml' => 'skip', 'product-sitemap.xml' => null, 'sitemap.xml' => null,
        ];
        foreach ($hints as $name => $hint) {
            $this->assertSame($hint, UrlRules::sitemapHint('https://ex.com/' . $name), $name);
        }
    }

    public function test_pages_rank_home_then_key_pages_then_shallow_ones(): void
    {
        $this->assertSame(0, UrlRules::pageRank('https://ex.com/'));
        $this->assertSame(11, UrlRules::pageRank('https://ex.com/about-us'));
        $this->assertSame(12, UrlRules::pageRank('https://ex.com/services/hair-colour'));
        $this->assertSame(11, UrlRules::pageRank('https://ex.com/o-nas'));
        $this->assertSame(26, UrlRules::pageRank('https://ex.com/some/deep/page'));
        $this->assertLessThan(UrlRules::pageRank('https://ex.com/gallery'), UrlRules::pageRank('https://ex.com/kontakt'));
    }

    public function test_a_page_without_a_title_is_named_by_its_address(): void
    {
        $this->assertSame('How to choose colour', UrlRules::lastPart('https://ex.com/blog/how-to-choose_colour.html'));
        $this->assertSame('ex.com', UrlRules::lastPart('https://ex.com/'));
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `$WS/php.sh tests/Unit/Content/Web/UrlsTest.php tests/Unit/Content/Web/PublicAddressTest.php tests/Unit/Content/Web/UrlRulesTest.php`
Expected: each FAIL — `Class "App\Services\Content\Web\Urls" not found` (and the other two).

- [ ] **Step 3: Write the code**

`app/Services/Content/Web/Urls.php`:

```php
<?php

namespace App\Services\Content\Web;

/** Addresses as the scan compares them (spec 2026-10-20 §3): absolute, http(s), without #fragment, in one normal form. */
final class Urls
{
    /** An absolute http(s) address for $href found on $base, without its #fragment; null for other schemes or none. */
    public static function absolute(string $href, string $base): ?string
    {
        $href = trim(html_entity_decode($href, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        if ($href === '' || str_starts_with($href, '#')) {
            return null;
        }
        $href = explode('#', $href, 2)[0];
        if (preg_match('#^([a-z][a-z0-9+.-]*):#i', $href, $m) === 1) {
            return in_array(strtolower($m[1]), ['http', 'https'], true) ? self::normalize($href) : null;
        }
        $b = parse_url($base);
        if ($b === false || !isset($b['scheme'], $b['host'])) {
            return null;
        }
        $scheme = strtolower($b['scheme']);
        if (str_starts_with($href, '//')) {
            return self::normalize($scheme . ':' . $href);
        }
        $origin = $scheme . '://' . $b['host'] . (isset($b['port']) ? ':' . $b['port'] : '');
        $basePath = $b['path'] ?? '/';
        if (str_starts_with($href, '?')) {
            return self::normalize($origin . $basePath . $href);
        }
        if (str_starts_with($href, '/')) {
            return self::normalize($origin . $href);
        }
        $dir = substr($basePath, 0, (int) strrpos($basePath, '/') + 1);

        return self::normalize($origin . ($dir === '' ? '/' : $dir) . $href);
    }

    /** Lowercase scheme and host, no default port, no fragment, dot segments resolved, an empty path as "/". */
    public static function normalize(string $url): ?string
    {
        $p = parse_url(trim($url));
        if ($p === false || !isset($p['scheme'], $p['host']) || $p['host'] === '') {
            return null;
        }
        $scheme = strtolower($p['scheme']);
        if (!in_array($scheme, ['http', 'https'], true)) {
            return null;
        }
        $port = isset($p['port']) && !(($scheme === 'http' && $p['port'] === 80) || ($scheme === 'https' && $p['port'] === 443))
            ? ':' . $p['port'] : '';
        $query = isset($p['query']) && $p['query'] !== '' ? '?' . $p['query'] : '';

        return $scheme . '://' . strtolower($p['host']) . $port . self::dots($p['path'] ?? '/') . $query;
    }

    public static function origin(string $url): ?string
    {
        $normal = self::normalize($url);
        if ($normal === null) {
            return null;
        }
        $p = parse_url($normal);

        return $p['scheme'] . '://' . $p['host'] . (isset($p['port']) ? ':' . $p['port'] : '');
    }

    public static function path(string $url): string
    {
        $path = (string) parse_url($url, PHP_URL_PATH);

        return $path === '' ? '/' : $path;
    }

    /** What robots.txt rules are matched against. */
    public static function pathAndQuery(string $url): string
    {
        $query = (string) parse_url($url, PHP_URL_QUERY);

        return self::path($url) . ($query === '' ? '' : '?' . $query);
    }

    private static function dots(string $path): string
    {
        $out = [];
        foreach (explode('/', $path) as $segment) {
            if ($segment === '..') {
                if (count($out) > 1) {
                    array_pop($out);
                }
                continue;
            }
            if ($segment !== '.') {
                $out[] = $segment;
            }
        }
        $result = implode('/', $out);
        if (str_ends_with($path, '/..') || str_ends_with($path, '/.')) {
            $result .= '/';
        }
        if ($result === '') {
            return '/';
        }

        return str_starts_with($result, '/') ? $result : '/' . $result;
    }
}
```

`app/Services/Content/Web/HostResolver.php`:

```php
<?php

namespace App\Services\Content\Web;

/** The addresses a host name resolves to (spec 2026-10-20 §3.5). Not final: tests put their own in the container. */
class HostResolver
{
    /** @return list<string> its IPv4 and IPv6 addresses; [] when it resolves to none */
    public function resolve(string $host): array
    {
        $ips = [];
        foreach ([DNS_A => 'ip', DNS_AAAA => 'ipv6'] as $type => $key) {
            foreach (@dns_get_record($host, $type) ?: [] as $record) {
                if (isset($record[$key]) && is_string($record[$key])) {
                    $ips[] = $record[$key];
                }
            }
        }
        if ($ips === []) {
            $ips = @gethostbynamel($host) ?: [];
        }

        return array_values(array_unique($ips));
    }
}
```

`app/Services/Content/Web/PublicAddress.php`:

```php
<?php

namespace App\Services\Content\Web;

/**
 * Which addresses the scan may read (spec 2026-10-20 §3.1, §3.5): a web address on a public host only, so a manager can
 * never point Content at a private network, the cloud's metadata service or the server itself.
 */
final class PublicAddress
{
    /** Ranges no scan connects to, beyond PHP's private and reserved flags. */
    private const BLOCKED = [
        '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24',
        '192.0.2.0/24', '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4',
        '::/128', '::1/128', 'fc00::/7', 'fe80::/10', 'ff00::/8', '2001:db8::/32', '2001::/32', '2002::/16', '100::/64',
    ];

    /**
     * The address as typed (trimmed) when a scan may read it: http or https, a host with a dot (or a public IP), no
     * user or password, port 80, 443 or none, no spaces, up to 2,000 characters. Null otherwise.
     */
    public static function clean(mixed $value): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        $value = trim($value);
        if ($value === '' || mb_strlen($value) > 2000 || preg_match('/[\s\x00-\x1F\x7F]/u', $value) === 1) {
            return null;
        }
        $parts = parse_url($value);
        if ($parts === false || !in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true)) {
            return null;
        }
        $host = strtolower(trim((string) ($parts['host'] ?? ''), '[]'));
        if ($host === '' || isset($parts['user']) || isset($parts['pass'])) {
            return null;
        }
        if (isset($parts['port']) && !in_array((int) $parts['port'], [80, 443], true)) {
            return null;
        }
        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            return self::isPublicIp($host) ? $value : null;
        }
        if ($host === 'localhost' || !str_contains($host, '.') || preg_match('/\.(localhost|local|internal|lan|home|corp)$/', $host) === 1) {
            return null;
        }

        return $value;
    }

    public static function isPublicIp(string $ip): bool
    {
        if (filter_var($ip, FILTER_VALIDATE_IP) === false) {
            return false;
        }
        if (str_contains($ip, ':')) {
            $packed = (string) inet_pton($ip);
            // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d) reach the IPv4 address inside.
            if (str_starts_with($packed, str_repeat("\0", 10) . "\xff\xff") || str_starts_with($packed, "\x00\x64\xff\x9b" . str_repeat("\0", 8))) {
                return self::isPublicIp((string) inet_ntop(substr($packed, 12)));
            }
        }
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
            return false;
        }
        foreach (self::BLOCKED as $cidr) {
            if (self::inRange($ip, $cidr)) {
                return false;
            }
        }

        return true;
    }

    private static function inRange(string $ip, string $cidr): bool
    {
        [$network, $bits] = explode('/', $cidr);
        $address = @inet_pton($ip);
        $net = @inet_pton($network);
        if ($address === false || $net === false || strlen($address) !== strlen($net)) {
            return false;
        }
        $bits = (int) $bits;
        $bytes = intdiv($bits, 8);
        if (substr($address, 0, $bytes) !== substr($net, 0, $bytes)) {
            return false;
        }
        $rest = $bits % 8;
        if ($rest === 0) {
            return true;
        }
        $mask = (0xFF << (8 - $rest)) & 0xFF;

        return (ord($address[$bytes]) & $mask) === (ord($net[$bytes]) & $mask);
    }
}
```

`app/Services/Content/Web/UrlRules.php`:

```php
<?php

namespace App\Services\Content\Web;

/** The scan's rules for addresses (spec 2026-10-20 §3.3): the site, what is never kept, articles vs pages, ranking. */
final class UrlRules
{
    /** Folders whose children are articles. */
    public const BLOG_FOLDERS = [
        'blog', 'news', 'articles', 'article', 'posts', 'post', 'insights', 'stories', 'journal', 'magazine', 'guides',
        'resources', 'aktuelles', 'nachrichten', 'noticias', 'actualites', 'articulos', 'novosti', 'stati',
    ];

    private const NEVER = [
        'tag', 'tags', 'category', 'categories', 'author', 'authors', 'search', 'feed', 'rss', 'wp-json', 'wp-admin',
        'wp-content', 'wp-includes', 'wp-login.php', 'cart', 'basket', 'checkout', 'account', 'my-account', 'login', 'signin',
        'sign-in', 'register', 'signup', 'sign-up', 'cdn-cgi',
    ];

    private const FILES = '/\.(pdf|jpe?g|png|gif|webp|svg|ico|mp4|mov|avi|webm|mp3|wav|zip|rar|gz|tgz|7z|xml|json|txt|csv|docx?|xlsx?|pptx?)$/i';

    /** Pages a company summary needs first: about, services, prices, contact, team, FAQ, products, booking. */
    private const KEY_PAGES = [
        'about', 'about-us', 'services', 'service', 'pricing', 'prices', 'price', 'contact', 'contacts', 'contact-us', 'team',
        'faq', 'products', 'booking', 'book', 'menu',
        'o-nas', 'onas', 'uslugi', 'ceny', 'tseny', 'kontakty', 'komanda',
        'ueber-uns', 'uber-uns', 'leistungen', 'preise', 'kontakt',
        'a-propos', 'apropos', 'tarifs', 'prestations', 'equipe',
        'sobre-nosotros', 'servicios', 'precios', 'contacto', 'equipo', 'reservas',
    ];

    private const SKIP_SITEMAPS = ['category', 'categories', 'tag', 'tags', 'author', 'authors', 'attachment', 'attachments', 'format', 'formats', 'taxonomy', 'taxonomies', 'user', 'users'];
    private const PAGE_SITEMAPS = ['page', 'pages'];
    private const ARTICLE_SITEMAPS = ['post', 'posts', 'blog', 'blogs', 'article', 'articles', 'news', 'journal', 'story', 'stories', 'insights'];

    public static function siteHost(string $url): string
    {
        $host = strtolower((string) parse_url($url, PHP_URL_HOST));

        return str_starts_with($host, 'www.') ? substr($host, 4) : $host;
    }

    public static function sameSite(string $url, string $siteHost): bool
    {
        return $siteHost !== '' && self::siteHost($url) === $siteHost;
    }

    /** Tag, category, author, search and paginated lists; feeds and admin; shop accounts; files; queries other than a page id. */
    public static function skipped(string $url): bool
    {
        $query = (string) parse_url($url, PHP_URL_QUERY);
        if ($query !== '' && preg_match('/^(p|page_id)=\d+$/', $query) !== 1) {
            return true;
        }
        if (preg_match(self::FILES, (string) parse_url($url, PHP_URL_PATH)) === 1) {
            return true;
        }
        $segments = self::segments($url);
        foreach ($segments as $i => $segment) {
            if (in_array($segment, self::NEVER, true)) {
                return true;
            }
            if ($segment === 'page' && isset($segments[$i + 1]) && ctype_digit($segments[$i + 1])) {
                return true;
            }
        }

        return false;
    }

    /** One level or more below a blog folder (or the address's own path, spec §3.1), or under /yyyy/mm/. */
    public static function looksLikeArticle(string $url, ?string $blogPath): bool
    {
        if (preg_match('#/(19|20)\d{2}/(0[1-9]|1[0-2])/[^/]+#', (string) parse_url($url, PHP_URL_PATH)) === 1) {
            return true;
        }
        $segments = self::segments($url);
        $prefix = self::folder($blogPath);
        if ($prefix !== [] && array_slice($segments, 0, count($prefix)) === $prefix && count($segments) > count($prefix)) {
            return true;
        }
        foreach ($segments as $i => $segment) {
            if (in_array($segment, self::BLOG_FOLDERS, true) && count($segments) > $i + 1) {
                return true;
            }
        }

        return false;
    }

    /** The blog page itself: its last part is a blog folder, or it is the address's own path. */
    public static function isBlogIndex(string $url, ?string $blogPath): bool
    {
        $segments = self::segments($url);
        $prefix = self::folder($blogPath);
        if ($prefix !== [] && $segments === $prefix) {
            return true;
        }

        return $segments !== [] && in_array($segments[count($segments) - 1], self::BLOG_FOLDERS, true);
    }

    /** What a child sitemap holds, by its file name: `skip` (taxonomies, users), `page`, `article`, or null (unknown). */
    public static function sitemapHint(string $url): ?string
    {
        $name = strtolower(basename((string) parse_url($url, PHP_URL_PATH)));
        if (str_contains($name, 'product_cat') || str_contains($name, 'product_tag')) {
            return 'skip';
        }
        $tokens = preg_split('/[-_.]+/', $name) ?: [];
        foreach ([[self::SKIP_SITEMAPS, 'skip'], [self::PAGE_SITEMAPS, 'page'], [self::ARTICLE_SITEMAPS, 'article']] as [$words, $hint]) {
            if (array_intersect($tokens, $words) !== []) {
                return $hint;
            }
        }

        return null;
    }

    /** Lower is read first: the home page, then key pages, then the shallowest. */
    public static function pageRank(string $url): int
    {
        $segments = self::segments($url);
        if ($segments === []) {
            return 0;
        }
        foreach ($segments as $segment) {
            if (in_array($segment, self::KEY_PAGES, true)) {
                return 10 + count($segments);
            }
        }

        return 20 + 2 * count($segments);
    }

    /** The address's last part as words, for a page without a title; the host for the home page. */
    public static function lastPart(string $url): string
    {
        $host = (string) parse_url($url, PHP_URL_HOST);
        $segments = self::segments($url);
        if ($segments === []) {
            return $host;
        }
        $last = (string) preg_replace('/\.(html?|php|aspx?)$/i', '', $segments[count($segments) - 1]);
        $words = trim((string) preg_replace('/[-_]+/', ' ', $last));

        return $words === '' ? $host : mb_strtoupper(mb_substr($words, 0, 1)) . mb_substr($words, 1);
    }

    /** @return list<string> the path's parts, decoded and lowercased */
    private static function segments(string $url): array
    {
        $parts = array_map(fn (string $s) => mb_strtolower(rawurldecode($s)), explode('/', (string) parse_url($url, PHP_URL_PATH)));

        return array_values(array_filter($parts, fn (string $s) => $s !== ''));
    }

    /** @return list<string> */
    private static function folder(?string $blogPath): array
    {
        return $blogPath === null ? [] : self::segments('http://x' . $blogPath);
    }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `$WS/php.sh tests/Unit/Content/Web/UrlsTest.php tests/Unit/Content/Web/PublicAddressTest.php tests/Unit/Content/Web/UrlRulesTest.php`
Expected: `Tests: 4 passed`, `Tests: 4 passed`, `Tests: 7 passed`.

- [ ] **Step 5: Commit**

```bash
git add app/Services/Content/Web/Urls.php app/Services/Content/Web/PublicAddress.php app/Services/Content/Web/HostResolver.php app/Services/Content/Web/UrlRules.php tests/Unit/Content/Web/UrlsTest.php tests/Unit/Content/Web/PublicAddressTest.php tests/Unit/Content/Web/UrlRulesTest.php
git commit -m "Content website scan: addresses in one form, public hosts only, the site's article and page rules"
```

---

### Task 3: Robots, sitemaps and feeds, HTML pages

**Files:**
- Create: `app/Services/Content/Web/RobotsRules.php`, `app/Services/Content/Web/SitemapReader.php`, `app/Services/Content/Web/PageReader.php`
- Test: `tests/Unit/Content/Web/RobotsRulesTest.php`, `tests/Unit/Content/Web/SitemapReaderTest.php`, `tests/Unit/Content/Web/PageReaderTest.php`

**Interfaces:**
- Consumes: `Urls::absolute`, `Urls::normalize` (Task 2).
- Produces:
  - `RobotsRules::parse(string $text, string $agent): RobotsRules`, `RobotsRules::allowAll(): RobotsRules`, `->allows(string $pathAndQuery): bool`, `->sitemaps: list<string>`
  - `SitemapReader::MAX_ENTRIES = 5000`, `SitemapReader::read(string $body): array{kind: 'index'|'urlset'|'feed'|'none', entries: list<array{url: string, date: ?string, title: ?string, description: ?string}>}` (dates as UTC ATOM strings)
  - `PageReader::TEXT_MAX = 20000`, `PageReader::read(string $html, string $url, string $contentType = ''): array{title: ?string, description: ?string, image: ?string, published_at: ?string, language: ?string, article: bool, text: string, links: list<string>, feeds: list<string>}`

- [ ] **Step 1: Write the failing tests**

`tests/Unit/Content/Web/RobotsRulesTest.php`:

```php
<?php

namespace Tests\Unit\Content\Web;

use App\Services\Content\Web\RobotsRules;
use PHPUnit\Framework\TestCase;

/** robots.txt as the scan obeys it (spec 2026-10-20 §3.5). */
class RobotsRulesTest extends TestCase
{
    private const AGENT = 'HexaTechContentBot';

    public function test_the_star_group_applies_and_the_longest_rule_wins(): void
    {
        $rules = RobotsRules::parse("User-agent: *\nDisallow: /private\nAllow: /private/open\n\nUser-agent: Googlebot\nDisallow: /\n\nSitemap: https://ex.com/sitemap.xml", self::AGENT);

        $this->assertTrue($rules->allows('/x'));
        $this->assertFalse($rules->allows('/private/a'));
        $this->assertTrue($rules->allows('/private/open/b'));
        $this->assertSame(['https://ex.com/sitemap.xml'], $rules->sitemaps);
    }

    public function test_a_group_naming_our_robot_replaces_the_star_group(): void
    {
        $this->assertTrue(RobotsRules::parse("User-agent: *\nDisallow: /\n\nUser-agent: HexaTechContentBot\nAllow: /\n", self::AGENT)->allows('/a'));
        $mine = RobotsRules::parse("User-agent: *\nDisallow:\n\nUser-agent: hexatechcontentbot\nDisallow: /blog\n", self::AGENT);
        $this->assertFalse($mine->allows('/blog/x'));
        $this->assertTrue($mine->allows('/x'));
    }

    public function test_wildcards_and_the_end_anchor(): void
    {
        $rules = RobotsRules::parse("User-agent: *\nDisallow: /*.pdf$\nDisallow: /search*", self::AGENT);

        $this->assertFalse($rules->allows('/a/b.pdf'));
        $this->assertTrue($rules->allows('/a/b.pdf?x=1'));
        $this->assertFalse($rules->allows('/searching'));
        $this->assertTrue($rules->allows('/x'));
    }

    public function test_an_allow_wins_a_tie_and_an_empty_disallow_allows_everything(): void
    {
        $this->assertTrue(RobotsRules::parse("User-agent: *\nAllow: /a\nDisallow: /a", self::AGENT)->allows('/a'));
        $this->assertTrue(RobotsRules::parse("User-agent: *\nDisallow:", self::AGENT)->allows('/'));
        $this->assertFalse(RobotsRules::parse("User-agent: *\nDisallow: /", self::AGENT)->allows('/'));
    }

    public function test_comments_line_ends_and_shared_groups(): void
    {
        $this->assertFalse(RobotsRules::parse("User-agent: * # all\r\nDisallow: /x # no\r\n", self::AGENT)->allows('/x'));
        $this->assertFalse(RobotsRules::parse("User-agent: other\nUser-agent: *\nDisallow: /z", self::AGENT)->allows('/z'));
        $this->assertTrue(RobotsRules::parse('<html><body>Not found</body></html>', self::AGENT)->allows('/anything'));
        $this->assertTrue(RobotsRules::allowAll()->allows('/anything'));
    }
}
```

`tests/Unit/Content/Web/SitemapReaderTest.php`:

```php
<?php

namespace Tests\Unit\Content\Web;

use App\Services\Content\Web\SitemapReader;
use PHPUnit\Framework\TestCase;

/** Sitemaps, sitemap indexes and feeds (spec 2026-10-20 §3.2). */
class SitemapReaderTest extends TestCase
{
    private const URLSET = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        . '<url><loc>https://ex.com/blog/a</loc><lastmod>2026-09-01</lastmod></url>'
        . '<url><loc> https://ex.com/about </loc></url></urlset>';

    public function test_a_urlset_lists_its_addresses_with_their_dates_in_utc(): void
    {
        $read = SitemapReader::read(self::URLSET);

        $this->assertSame('urlset', $read['kind']);
        $this->assertSame([
            ['url' => 'https://ex.com/blog/a', 'date' => '2026-09-01T00:00:00+00:00', 'title' => null, 'description' => null],
            ['url' => 'https://ex.com/about', 'date' => null, 'title' => null, 'description' => null],
        ], $read['entries']);
    }

    public function test_an_index_lists_its_sitemaps(): void
    {
        $read = SitemapReader::read('<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://ex.com/post-sitemap.xml</loc><lastmod>2026-09-02T10:00:00+02:00</lastmod></sitemap></sitemapindex>');

        $this->assertSame('index', $read['kind']);
        $this->assertSame('https://ex.com/post-sitemap.xml', $read['entries'][0]['url']);
        $this->assertSame('2026-09-02T08:00:00+00:00', $read['entries'][0]['date']);
    }

    public function test_a_gzip_sitemap_and_a_byte_order_mark_are_read(): void
    {
        $this->assertSame('urlset', SitemapReader::read((string) gzencode(self::URLSET))['kind']);
        $this->assertSame('urlset', SitemapReader::read("\xEF\xBB\xBF" . self::URLSET)['kind']);
    }

    public function test_an_rss_feed_gives_titles_dates_and_plain_descriptions(): void
    {
        $read = SitemapReader::read('<?xml version="1.0"?><rss version="2.0"><channel><title>Blog</title>'
            . '<item><title> Autumn colours </title><link>https://ex.com/blog/autumn</link><pubDate>Tue, 01 Sep 2026 10:00:00 +0200</pubDate>'
            . '<description>&lt;p&gt;Three &lt;b&gt;warm&lt;/b&gt; tones&lt;/p&gt;</description></item></channel></rss>');

        $this->assertSame('feed', $read['kind']);
        $this->assertSame(['url' => 'https://ex.com/blog/autumn', 'date' => '2026-09-01T08:00:00+00:00', 'title' => 'Autumn colours', 'description' => 'Three warm tones'], $read['entries'][0]);
    }

    public function test_an_atom_feed_gives_its_alternate_links(): void
    {
        $read = SitemapReader::read('<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Post</title>'
            . '<link rel="edit" href="https://ex.com/edit/1"/><link rel="alternate" href="https://ex.com/blog/post"/>'
            . '<published>2026-09-03T09:00:00Z</published><summary>Short</summary></entry></feed>');

        $this->assertSame('feed', $read['kind']);
        $this->assertSame('https://ex.com/blog/post', $read['entries'][0]['url']);
        $this->assertSame('2026-09-03T09:00:00+00:00', $read['entries'][0]['date']);
        $this->assertSame('Short', $read['entries'][0]['description']);
    }

    public function test_html_entities_and_garbage_are_not_a_sitemap(): void
    {
        $this->assertSame('none', SitemapReader::read('<html><body>Not found</body></html>')['kind']);
        $this->assertSame('none', SitemapReader::read('<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><urlset><url><loc>&a;</loc></url></urlset>')['kind']);
        $this->assertSame('none', SitemapReader::read('')['kind']);
        $this->assertSame('none', SitemapReader::read("\x1f\x8bnot gzip")['kind']);
    }

    public function test_at_most_five_thousand_entries(): void
    {
        $urls = str_repeat('<url><loc>https://ex.com/p</loc></url>', 5100);
        $this->assertCount(SitemapReader::MAX_ENTRIES, SitemapReader::read('<urlset>' . $urls . '</urlset>')['entries']);
    }
}
```

`tests/Unit/Content/Web/PageReaderTest.php`:

```php
<?php

namespace Tests\Unit\Content\Web;

use App\Services\Content\Web\PageReader;
use PHPUnit\Framework\TestCase;

/** What the scan keeps from a page (spec 2026-10-20 §3.3, §3.4). */
class PageReaderTest extends TestCase
{
    private const ARTICLE = <<<'HTML'
<!doctype html><html lang="en-GB"><head><title>Autumn colours | Lumière</title>
<meta property="og:title" content="  Autumn   colours ">
<meta property="og:description" content="Three warm tones for October.">
<meta property="og:image" content="/img/autumn.jpg">
<meta property="og:type" content="article">
<meta property="article:published_time" content="2026-09-01T10:00:00+02:00">
<link rel="alternate" type="application/rss+xml" href="/feed/">
</head><body>
<nav><a href="/">Home</a><a href="/services#top">Services</a></nav>
<header>Site header</header>
<article><h1>Autumn colours</h1><p>Copper suits warm skin.</p><ul><li><p>Chestnut</p></li><li>Honey</li></ul>
<script>var tracking = 1;</script><a href="mailto:hi@lumiere.example">Mail us</a><a href="https://other.example/x">Other</a></article>
<footer>© Lumière</footer></body></html>
HTML;

    public function test_an_article_gives_its_title_description_picture_date_language_and_kind(): void
    {
        $read = PageReader::read(self::ARTICLE, 'https://lumiere.example/blog/autumn');

        $this->assertSame('Autumn colours', $read['title']);
        $this->assertSame('Three warm tones for October.', $read['description']);
        $this->assertSame('https://lumiere.example/img/autumn.jpg', $read['image']);
        $this->assertSame('2026-09-01T08:00:00+00:00', $read['published_at']);
        $this->assertSame('en-GB', $read['language']);
        $this->assertTrue($read['article']);
        $this->assertSame(['https://lumiere.example/feed/'], $read['feeds']);
    }

    public function test_the_text_is_the_article_without_navigation_scripts_or_repeats(): void
    {
        $text = PageReader::read(self::ARTICLE, 'https://lumiere.example/blog/autumn')['text'];

        $this->assertSame("Autumn colours\nCopper suits warm skin.\nChestnut\nHoney", $text);
    }

    public function test_links_are_absolute_without_fragments_or_mail(): void
    {
        $links = PageReader::read(self::ARTICLE, 'https://lumiere.example/blog/autumn')['links'];

        $this->assertSame(['https://lumiere.example/', 'https://lumiere.example/services', 'https://other.example/x'], $links);
    }

    public function test_a_plain_page_falls_back_to_title_h1_meta_description_and_its_body(): void
    {
        $read = PageReader::read('<html><head><meta name="description" content="Prices"></head><body><h1>Our prices</h1><main><p>Cut 40 €</p></main></body></html>', 'https://lumiere.example/prices');

        $this->assertSame('Our prices', $read['title']);
        $this->assertSame('Prices', $read['description']);
        $this->assertFalse($read['article']);
        $this->assertNull($read['image']);
        $this->assertNull($read['published_at']);
        $this->assertSame('Cut 40 €', $read['text']);
    }

    public function test_json_ld_marks_an_article_with_its_date_and_picture(): void
    {
        $html = '<html><head><title>T</title><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},'
            . '{"@type":["BlogPosting"],"datePublished":"2026-08-30","image":{"url":"https://cdn.example/p.jpg"},"headline":"H"}]}</script></head><body><p>x</p></body></html>';
        $read = PageReader::read($html, 'https://lumiere.example/a');

        $this->assertTrue($read['article']);
        $this->assertSame('2026-08-30T00:00:00+00:00', $read['published_at']);
        $this->assertSame('https://cdn.example/p.jpg', $read['image']);
    }

    public function test_a_picture_must_be_https_and_a_time_element_gives_the_date(): void
    {
        $read = PageReader::read('<html><head><meta property="og:image" content="http://lumiere.example/a.jpg"></head><body><time datetime="2026-07-01">1 July</time></body></html>', 'https://lumiere.example/x');

        $this->assertNull($read['image']);
        $this->assertSame('2026-07-01T00:00:00+00:00', $read['published_at']);
    }

    public function test_a_windows_1251_page_is_read_as_utf8(): void
    {
        $html = (string) mb_convert_encoding('<html><head><meta charset="windows-1251"><title>Привет, осень</title></head><body><p>Тёплые тона</p></body></html>', 'Windows-1251', 'UTF-8');
        $read = PageReader::read($html, 'https://lumiere.example/ru');

        $this->assertSame('Привет, осень', $read['title']);
        $this->assertSame('Тёплые тона', $read['text']);
    }

    public function test_a_base_element_moves_relative_addresses_and_text_is_cut(): void
    {
        $html = '<html><head><base href="https://cdn.lumiere.example/site/"></head><body><a href="page">P</a><p>' . str_repeat('word ', 6000) . '</p></body></html>';
        $read = PageReader::read($html, 'https://lumiere.example/');

        $this->assertSame(['https://cdn.lumiere.example/site/page'], $read['links']);
        $this->assertSame(PageReader::TEXT_MAX, mb_strlen($read['text']));
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `$WS/php.sh tests/Unit/Content/Web/RobotsRulesTest.php tests/Unit/Content/Web/SitemapReaderTest.php tests/Unit/Content/Web/PageReaderTest.php`
Expected: each FAIL — class not found.

- [ ] **Step 3: Write the code**

`app/Services/Content/Web/RobotsRules.php`:

```php
<?php

namespace App\Services\Content\Web;

/**
 * robots.txt as the scan obeys it (spec 2026-10-20 §3.5): the group naming our robot, else `*`; `Allow`/`Disallow`
 * with `*` and `$`; the longest matching rule wins and an `Allow` wins a tie. `Sitemap:` lines are kept for discovery.
 */
final class RobotsRules
{
    /**
     * @param list<array{0: bool, 1: string}> $rules [allow, pattern]
     * @param list<string> $sitemaps
     */
    private function __construct(private readonly array $rules, public readonly array $sitemaps)
    {
    }

    public static function allowAll(): self
    {
        return new self([], []);
    }

    public static function parse(string $text, string $agent): self
    {
        $agent = strtolower($agent);
        $groups = [];
        $sitemaps = [];
        $lastWasAgent = false;
        foreach (preg_split('/\r\n|\r|\n/', $text) ?: [] as $line) {
            $line = trim((string) preg_replace('/#.*$/', '', $line));
            if ($line === '' || !str_contains($line, ':')) {
                continue;
            }
            [$key, $value] = array_map('trim', explode(':', $line, 2));
            $key = strtolower($key);
            if ($key === 'sitemap') {
                if ($value !== '') {
                    $sitemaps[] = $value;
                }
                continue;
            }
            if ($key === 'user-agent') {
                if (!$lastWasAgent) {
                    $groups[] = ['agents' => [], 'rules' => []];
                }
                $groups[count($groups) - 1]['agents'][] = strtolower($value);
                $lastWasAgent = true;
                continue;
            }
            $lastWasAgent = false;
            if (($key === 'allow' || $key === 'disallow') && $groups !== []) {
                $groups[count($groups) - 1]['rules'][] = [$key === 'allow', $value];
            }
        }
        $mine = [];
        $any = [];
        $named = false;
        foreach ($groups as $group) {
            foreach ($group['agents'] as $name) {
                if ($name === '*') {
                    array_push($any, ...$group['rules']);
                } elseif ($name !== '' && str_contains($agent, $name)) {
                    $named = true;
                    array_push($mine, ...$group['rules']);
                }
            }
        }

        return new self($named ? $mine : $any, $sitemaps);
    }

    public function allows(string $pathAndQuery): bool
    {
        $best = -1;
        $allowed = true;
        foreach ($this->rules as [$allow, $pattern]) {
            if ($pattern === '' || !self::matches($pattern, $pathAndQuery)) {
                continue;
            }
            $length = strlen($pattern);
            if ($length > $best || ($length === $best && $allow)) {
                $best = $length;
                $allowed = $allow;
            }
        }

        return $allowed;
    }

    private static function matches(string $pattern, string $path): bool
    {
        $anchored = str_ends_with($pattern, '$');
        $core = $anchored ? substr($pattern, 0, -1) : $pattern;
        $regex = '#^' . implode('.*', array_map(fn (string $part) => preg_quote($part, '#'), explode('*', $core))) . ($anchored ? '$' : '') . '#';

        return preg_match($regex, $path) === 1;
    }
}
```

`app/Services/Content/Web/SitemapReader.php`:

```php
<?php

namespace App\Services\Content\Web;

/**
 * Sitemaps, sitemap indexes, RSS and Atom feeds (spec 2026-10-20 §3.2): addresses with their dates (UTC), and for feeds
 * their titles and plain descriptions. Gzip is read; a document declaring entities is not (no entity expansion).
 */
final class SitemapReader
{
    public const MAX_ENTRIES = 5000;

    /** @return array{kind: string, entries: list<array{url: string, date: ?string, title: ?string, description: ?string}>} */
    public static function read(string $body): array
    {
        $none = ['kind' => 'none', 'entries' => []];
        if (str_starts_with($body, "\x1f\x8b")) {
            $body = function_exists('gzdecode') ? (string) (@gzdecode($body, 10_485_760) ?: '') : '';
        }
        if (str_starts_with($body, "\xEF\xBB\xBF")) {
            $body = substr($body, 3);
        }
        $body = trim($body);
        if ($body === '' || stripos($body, '<!ENTITY') !== false) {
            return $none;
        }
        $doc = new \DOMDocument();
        $previous = libxml_use_internal_errors(true);
        $ok = $doc->loadXML($body, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING | LIBXML_COMPACT);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
        if (!$ok || $doc->documentElement === null) {
            return $none;
        }

        return match (strtolower($doc->documentElement->localName)) {
            'sitemapindex' => ['kind' => 'index', 'entries' => self::locations($doc, 'sitemap')],
            'urlset'       => ['kind' => 'urlset', 'entries' => self::locations($doc, 'url')],
            'rss', 'rdf'   => ['kind' => 'feed', 'entries' => self::rss($doc)],
            'feed'         => ['kind' => 'feed', 'entries' => self::atom($doc)],
            default        => $none,
        };
    }

    /** @return list<array{url: string, date: ?string, title: null, description: null}> */
    private static function locations(\DOMDocument $doc, string $item): array
    {
        $out = [];
        foreach (self::elements($doc, $item) as $node) {
            $url = trim((string) self::child($node, 'loc'));
            if ($url !== '') {
                $out[] = ['url' => $url, 'date' => self::date(self::child($node, 'lastmod')), 'title' => null, 'description' => null];
            }
            if (count($out) >= self::MAX_ENTRIES) {
                break;
            }
        }

        return $out;
    }

    /** @return list<array{url: string, date: ?string, title: ?string, description: ?string}> */
    private static function rss(\DOMDocument $doc): array
    {
        $out = [];
        foreach (self::elements($doc, 'item') as $node) {
            $url = trim((string) self::child($node, 'link'));
            if ($url !== '') {
                $out[] = [
                    'url'         => $url,
                    'date'        => self::date(self::child($node, 'pubDate') ?? self::child($node, 'date')),
                    'title'       => self::plain(self::child($node, 'title'), 300),
                    'description' => self::plain(self::child($node, 'description'), 1000),
                ];
            }
            if (count($out) >= self::MAX_ENTRIES) {
                break;
            }
        }

        return $out;
    }

    /** @return list<array{url: string, date: ?string, title: ?string, description: ?string}> */
    private static function atom(\DOMDocument $doc): array
    {
        $out = [];
        foreach (self::elements($doc, 'entry') as $node) {
            $url = null;
            foreach ($node->childNodes as $child) {
                if ($child instanceof \DOMElement && $child->localName === 'link' && in_array($child->getAttribute('rel'), ['', 'alternate'], true)) {
                    $url = trim($child->getAttribute('href'));
                    break;
                }
            }
            if ($url !== null && $url !== '') {
                $out[] = [
                    'url'         => $url,
                    'date'        => self::date(self::child($node, 'published') ?? self::child($node, 'updated')),
                    'title'       => self::plain(self::child($node, 'title'), 300),
                    'description' => self::plain(self::child($node, 'summary') ?? self::child($node, 'content'), 1000),
                ];
            }
            if (count($out) >= self::MAX_ENTRIES) {
                break;
            }
        }

        return $out;
    }

    private static function child(\DOMElement $node, string $name): ?string
    {
        foreach ($node->childNodes as $child) {
            if ($child instanceof \DOMElement && $child->localName === $name) {
                return $child->textContent;
            }
        }

        return null;
    }

    private static function plain(?string $value, int $max): ?string
    {
        if ($value === null) {
            return null;
        }
        $text = trim((string) preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags($value), ENT_QUOTES | ENT_HTML5, 'UTF-8')));

        return $text === '' ? null : mb_substr($text, 0, $max);
    }

    /** A date as UTC ATOM, or null when it is not one. */
    public static function date(?string $value): ?string
    {
        $value = trim((string) $value);
        if ($value === '') {
            return null;
        }
        try {
            // A date without its own offset is UTC, whatever the server's zone.
            return (new \DateTimeImmutable($value, new \DateTimeZone('UTC')))->setTimezone(new \DateTimeZone('UTC'))->format(DATE_ATOM);
        } catch (\Throwable) {
            return null;
        }
    }

    /** @return \Generator<\DOMElement> the elements with this local name, in any namespace or none */
    private static function elements(\DOMDocument $doc, string $name): \Generator
    {
        foreach ($doc->getElementsByTagName('*') as $node) {
            if ($node instanceof \DOMElement && $node->localName === $name) {
                yield $node;
            }
        }
    }
}
```

`app/Services/Content/Web/PageReader.php`:

```php
<?php

namespace App\Services\Content\Web;

/**
 * What the scan keeps from an HTML page (spec 2026-10-20 §3.3, §3.4): title, description, picture (https), date,
 * language, whether it says it is an article, its main text, its links and its feeds.
 */
final class PageReader
{
    public const TEXT_MAX = 20000;

    private const ARTICLE_TYPES = ['article', 'blogposting', 'newsarticle', 'techarticle', 'report'];
    private const DROP = ['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'nav', 'header', 'footer', 'aside', 'form'];
    private const BLOCKS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'td', 'dd', 'figcaption'];

    /**
     * @return array{title: ?string, description: ?string, image: ?string, published_at: ?string, language: ?string,
     *     article: bool, text: string, links: list<string>, feeds: list<string>}
     */
    public static function read(string $html, string $url, string $contentType = ''): array
    {
        $doc = new \DOMDocument();
        $previous = libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="UTF-8">' . self::utf8($html, $contentType), LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING | LIBXML_COMPACT);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);
        $xpath = new \DOMXPath($doc);

        $base = $url;
        $baseHref = self::first($xpath, '//base[@href]')?->getAttribute('href');
        if ($baseHref !== null && $baseHref !== '') {
            $base = Urls::absolute($baseHref, $url) ?? $url;
        }
        $meta = [];
        foreach ($xpath->query('//meta[@content]') ?: [] as $node) {
            $key = strtolower(trim($node->getAttribute('property') ?: $node->getAttribute('name')));
            if ($key !== '' && !isset($meta[$key])) {
                $meta[$key] = trim($node->getAttribute('content'));
            }
        }
        $ld = self::jsonLd($xpath);

        $title = self::fold($meta['og:title'] ?? null, 300)
            ?? self::fold(self::first($xpath, '//title')?->textContent, 300)
            ?? self::fold(self::first($xpath, '//h1')?->textContent, 300)
            ?? self::fold($ld['headline'], 300);
        $image = null;
        foreach ([$meta['og:image'] ?? null, $meta['og:image:url'] ?? null, $meta['twitter:image'] ?? null, $ld['image']] as $candidate) {
            $absolute = is_string($candidate) && trim($candidate) !== '' ? Urls::absolute($candidate, $base) : null;
            if ($absolute !== null && str_starts_with($absolute, 'https://')) {
                $image = $absolute;
                break;
            }
        }
        $links = [];
        foreach ($xpath->query('//a[@href]') ?: [] as $node) {
            $link = Urls::absolute($node->getAttribute('href'), $base);
            if ($link !== null && !in_array($link, $links, true)) {
                $links[] = $link;
            }
            if (count($links) >= 300) {
                break;
            }
        }
        $feeds = [];
        foreach ($xpath->query('//link[@href]') ?: [] as $node) {
            $rel = strtolower($node->getAttribute('rel'));
            $type = strtolower($node->getAttribute('type'));
            if (str_contains($rel, 'alternate') && in_array($type, ['application/rss+xml', 'application/atom+xml'], true)) {
                $feed = Urls::absolute($node->getAttribute('href'), $base);
                if ($feed !== null && !in_array($feed, $feeds, true)) {
                    $feeds[] = $feed;
                }
            }
        }

        return [
            'title'        => $title,
            'description'  => self::fold($meta['og:description'] ?? $meta['description'] ?? null, 1000),
            'image'        => $image,
            'published_at' => SitemapReader::date($meta['article:published_time'] ?? null)
                ?? SitemapReader::date($ld['date'])
                ?? SitemapReader::date(self::first($xpath, '//time[@datetime]')?->getAttribute('datetime')),
            'language'     => self::fold(self::first($xpath, '//html[@lang]')?->getAttribute('lang'), 12),
            'article'      => strtolower($meta['og:type'] ?? '') === 'article' || isset($meta['article:published_time']) || $ld['article'],
            'text'         => self::text($doc, $xpath),
            'links'        => $links,
            'feeds'        => $feeds,
        ];
    }

    /** The page as UTF-8, its own charset declaration rewritten so libxml cannot decode it twice. */
    private static function utf8(string $html, string $contentType): string
    {
        $charset = '';
        if (preg_match('/charset=["\']?([\w-]+)/i', $contentType, $m) === 1) {
            $charset = $m[1];
        } elseif (preg_match('/<meta[^>]+charset=["\']?([\w-]+)/i', substr($html, 0, 4096), $m) === 1) {
            $charset = $m[1];
        }
        $charset = strtoupper($charset);
        if ($charset !== '' && !in_array($charset, ['UTF-8', 'UTF8'], true)
            && in_array($charset, array_map('strtoupper', mb_list_encodings()), true)) {
            $converted = @mb_convert_encoding($html, 'UTF-8', $charset);
            $html = is_string($converted) ? $converted : $html;
        }

        return (string) preg_replace('/(<meta[^>]+charset=["\']?)[\w-]+/i', '${1}utf-8', $html, 1);
    }

    private static function first(\DOMXPath $xpath, string $query): ?\DOMElement
    {
        $node = $xpath->query($query)?->item(0);

        return $node instanceof \DOMElement ? $node : null;
    }

    private static function fold(?string $value, int $max): ?string
    {
        $text = trim((string) preg_replace('/\s+/u', ' ', (string) $value));

        return $text === '' ? null : mb_substr($text, 0, $max);
    }

    /** @return array{article: bool, date: ?string, image: ?string, headline: ?string} */
    private static function jsonLd(\DOMXPath $xpath): array
    {
        $out = ['article' => false, 'date' => null, 'image' => null, 'headline' => null];
        foreach ($xpath->query('//script[@type="application/ld+json"]') ?: [] as $node) {
            $stack = [json_decode(trim($node->textContent), true)];
            while ($stack !== []) {
                $item = array_pop($stack);
                if (!is_array($item)) {
                    continue;
                }
                if (array_is_list($item)) {
                    array_push($stack, ...$item);
                    continue;
                }
                if (isset($item['@graph'])) {
                    $stack[] = $item['@graph'];
                }
                $types = array_map(fn ($type) => strtolower((string) $type), (array) ($item['@type'] ?? []));
                if (array_intersect($types, self::ARTICLE_TYPES) === []) {
                    continue;
                }
                $out['article'] = true;
                $out['date'] ??= is_string($item['datePublished'] ?? null) ? $item['datePublished'] : null;
                $out['headline'] ??= is_string($item['headline'] ?? null) ? $item['headline'] : null;
                $image = $item['image'] ?? null;
                if (is_array($image)) {
                    $image = array_is_list($image) ? ($image[0] ?? null) : ($image['url'] ?? null);
                }
                if (is_array($image)) {
                    $image = $image['url'] ?? null;
                }
                $out['image'] ??= is_string($image) ? $image : null;
            }
        }

        return $out;
    }

    /** The `<article>` (the longest), else `<main>`, else the body, without navigation, header, footer, aside, forms or scripts. */
    private static function text(\DOMDocument $doc, \DOMXPath $xpath): string
    {
        foreach (self::DROP as $tag) {
            foreach (iterator_to_array($doc->getElementsByTagName($tag)) as $node) {
                $node->parentNode?->removeChild($node);
            }
        }
        $root = null;
        $best = -1;
        foreach ($xpath->query('//article') ?: [] as $node) {
            $length = mb_strlen(trim($node->textContent));
            if ($length > $best) {
                $best = $length;
                $root = $node;
            }
        }
        $root ??= self::first($xpath, '//main') ?? self::first($xpath, '//*[@role="main"]') ?? self::first($xpath, '//body');
        if ($root === null) {
            return '';
        }
        $blocks = './/' . implode('|.//', self::BLOCKS);
        $parts = [];
        foreach ($xpath->query($blocks, $root) ?: [] as $node) {
            // A block holding other blocks (li > p) is read through them, once.
            if (($xpath->query($blocks, $node)?->length ?? 0) > 0) {
                continue;
            }
            $line = self::fold($node->textContent, self::TEXT_MAX);
            if ($line !== null) {
                $parts[] = $line;
            }
        }
        $text = $parts === [] ? (string) self::fold($root->textContent, self::TEXT_MAX) : implode("\n", $parts);

        return mb_substr($text, 0, self::TEXT_MAX);
    }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `$WS/php.sh tests/Unit/Content/Web/RobotsRulesTest.php tests/Unit/Content/Web/SitemapReaderTest.php tests/Unit/Content/Web/PageReaderTest.php`
Expected: `Tests: 5 passed`, `Tests: 7 passed`, `Tests: 8 passed`.

- [ ] **Step 5: Commit**

```bash
git add app/Services/Content/Web/RobotsRules.php app/Services/Content/Web/SitemapReader.php app/Services/Content/Web/PageReader.php tests/Unit/Content/Web/RobotsRulesTest.php tests/Unit/Content/Web/SitemapReaderTest.php tests/Unit/Content/Web/PageReaderTest.php
git commit -m "Content website scan: robots rules, sitemaps and feeds, and what a page says about itself"
```

---

### Task 4: The safe fetcher

**Files:**
- Create: `app/Services/Content/Web/WebResponse.php`, `app/Services/Content/Web/WebFetcher.php`, `tests/Concerns/FakesWebsite.php`
- Test: `tests/Feature/Content/WebFetcherTest.php`

**Interfaces:**
- Consumes: `PublicAddress`, `HostResolver`, `Urls` (Task 2).
- Produces:
  - `WebResponse` (readonly `url` final address, `type` lowercased media type, `body`, `contentType` header)
  - `WebFetcher` (not final): `AGENT = 'HexaTechContentBot'`, `HTML_TYPES`, `HTML_BYTES = 3_145_728`, `XML_BYTES = 10_485_760`, `IMAGE_BYTES = 5_242_880`, `userAgent(): string`, `get(string $url, int $maxBytes, array $types = [], ?string &$why = null): ?WebResponse` — `$why` ∈ `bad_address` | `unreachable` | `not_found` | `wrong_type` | `too_big`
  - `Tests\Concerns\FakesWebsite::fakeWebsite(array $pages, array $ips = []): void` — every host resolves to `93.184.216.34` unless `$ips[$host]` says otherwise; each address answers its page (`body` or `[body, status, headers]`, type by address), anything else 404.

- [ ] **Step 1: Write the fake-site helper and the failing test**

`tests/Concerns/FakesWebsite.php`:

```php
<?php

namespace Tests\Concerns;

use App\Services\Content\Web\HostResolver;
use Illuminate\Support\Facades\Http;

/**
 * A website for the scan's tests (spec 2026-10-20 §3): DNS and HTTP both faked, nothing reaches the network. Every host
 * resolves to a public address unless `$ips` says otherwise; each address answers its page; anything else is a 404.
 */
trait FakesWebsite
{
    /**
     * @param array<string, string|array{0: string, 1?: int, 2?: array<string, string>}> $pages address => body, or [body, status, headers]
     * @param array<string, list<string>> $ips host => the addresses it resolves to
     */
    protected function fakeWebsite(array $pages, array $ips = []): void
    {
        $this->app->instance(HostResolver::class, new class($ips) extends HostResolver {
            /** @param array<string, list<string>> $ips */
            public function __construct(private array $ips)
            {
            }

            public function resolve(string $host): array
            {
                return $this->ips[$host] ?? ['93.184.216.34'];
            }
        });
        Http::preventStrayRequests();
        $stubs = [];
        foreach ($pages as $url => $page) {
            [$body, $status, $headers] = is_array($page) ? [$page[0], $page[1] ?? 200, $page[2] ?? []] : [$page, 200, []];
            $stubs[$url] = Http::response($body, $status, $headers + ['Content-Type' => self::fakeTypeOf($url)]);
        }
        $stubs['*'] = Http::response('<html><body>Not found</body></html>', 404, ['Content-Type' => 'text/html']);
        Http::fake($stubs);
    }

    private static function fakeTypeOf(string $url): string
    {
        $path = strtolower((string) parse_url($url, PHP_URL_PATH));

        return match (true) {
            str_ends_with($path, 'robots.txt')                                 => 'text/plain; charset=utf-8',
            str_ends_with($path, '.gz')                                        => 'application/gzip',
            str_ends_with($path, '.xml') || str_contains($path, '/feed')       => 'application/xml; charset=utf-8',
            (bool) preg_match('/\.(png)$/', $path)                             => 'image/png',
            (bool) preg_match('/\.(jpe?g)$/', $path)                           => 'image/jpeg',
            default                                                            => 'text/html; charset=utf-8',
        };
    }

    /** A 1×1 PNG, a picture the media store accepts. */
    protected static function pngBytes(): string
    {
        return (string) base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
    }
}
```

`tests/Feature/Content/WebFetcherTest.php`:

```php
<?php

namespace Tests\Feature\Content;

use App\Services\Content\Web\HostResolver;
use App\Services\Content\Web\WebFetcher;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\FakesWebsite;
use Tests\TestCase;

/** The scan's GET (spec 2026-10-20 §3.5): public hosts only, redirects checked again, sizes and types capped. */
class WebFetcherTest extends TestCase
{
    use FakesWebsite;

    private function fetcher(): WebFetcher
    {
        return app(WebFetcher::class);
    }

    public function test_a_page_is_read_as_the_robot_names_itself(): void
    {
        $this->fakeWebsite(['https://lumiere.example/' => '<html><title>Hi</title></html>']);

        $page = $this->fetcher()->get('https://lumiere.example/', WebFetcher::HTML_BYTES, WebFetcher::HTML_TYPES);

        $this->assertSame('https://lumiere.example/', $page->url);
        $this->assertSame('text/html', $page->type);
        $this->assertStringContainsString('<title>Hi</title>', $page->body);
        Http::assertSent(fn (Request $request) => str_starts_with($request->header('User-Agent')[0] ?? '', 'HexaTechContentBot/1.0 (+'));
    }

    public function test_redirects_are_followed_and_the_final_address_is_kept(): void
    {
        $this->fakeWebsite([
            'http://lumiere.example/' => ['', 301, ['Location' => 'https://www.lumiere.example/']],
            'https://www.lumiere.example/' => '<html>ok</html>',
        ]);

        $this->assertSame('https://www.lumiere.example/', $this->fetcher()->get('http://lumiere.example/', WebFetcher::HTML_BYTES)->url);
    }

    public function test_a_redirect_to_a_private_address_or_port_is_refused(): void
    {
        $this->fakeWebsite([
            'https://lumiere.example/a' => ['', 302, ['Location' => 'http://10.0.0.1/admin']],
            'https://lumiere.example/b' => ['', 302, ['Location' => 'https://lumiere.example:8080/']],
        ]);

        $why = null;
        $this->assertNull($this->fetcher()->get('https://lumiere.example/a', 1000, [], $why));
        $this->assertSame('bad_address', $why);
        $this->assertNull($this->fetcher()->get('https://lumiere.example/b', 1000, [], $why));
        $this->assertSame('bad_address', $why);
    }

    public function test_a_host_resolving_to_a_private_address_is_never_asked(): void
    {
        $this->fakeWebsite(['https://intranet.example/' => 'secret'], ['intranet.example' => ['93.184.216.34', '192.168.1.10']]);

        $why = null;
        $this->assertNull($this->fetcher()->get('https://intranet.example/', 1000, [], $why));
        $this->assertSame('bad_address', $why);
        Http::assertNothingSent();
    }

    public function test_a_host_that_does_not_resolve_is_unreachable(): void
    {
        $this->fakeWebsite([], ['gone.example' => []]);

        $why = null;
        $this->assertNull($this->fetcher()->get('https://gone.example/', 1000, [], $why));
        $this->assertSame('unreachable', $why);
    }

    public function test_answers_other_than_200_say_why(): void
    {
        $this->fakeWebsite(['https://lumiere.example/down' => ['oops', 500]]);

        $why = null;
        $this->assertNull($this->fetcher()->get('https://lumiere.example/missing', 1000, [], $why));
        $this->assertSame('not_found', $why);
        $this->assertNull($this->fetcher()->get('https://lumiere.example/down', 1000, [], $why));
        $this->assertSame('unreachable', $why);
    }

    public function test_the_wrong_type_and_too_big_bodies_are_skipped(): void
    {
        $this->fakeWebsite([
            'https://lumiere.example/file' => ['%PDF', 200, ['Content-Type' => 'application/pdf']],
            'https://lumiere.example/big' => [str_repeat('a', 2000), 200, ['Content-Length' => '2000']],
            'https://lumiere.example/sneaky' => [str_repeat('a', 2000)],
        ]);

        $why = null;
        $this->assertNull($this->fetcher()->get('https://lumiere.example/file', 1000, WebFetcher::HTML_TYPES, $why));
        $this->assertSame('wrong_type', $why);
        $this->assertNull($this->fetcher()->get('https://lumiere.example/big', 1000, [], $why));
        $this->assertSame('too_big', $why);
        $this->assertNull($this->fetcher()->get('https://lumiere.example/sneaky', 1000, [], $why));
        $this->assertSame('too_big', $why);
    }

    public function test_a_redirect_loop_is_unreachable(): void
    {
        $this->fakeWebsite(['https://lumiere.example/loop' => ['', 302, ['Location' => '/loop']]]);
        $why = null;
        $this->assertNull($this->fetcher()->get('https://lumiere.example/loop', 1000, [], $why));
        $this->assertSame('unreachable', $why);
    }

    public function test_a_dead_connection_is_unreachable(): void
    {
        // Its own fake: stubs add up and the first registered wins, so fakeWebsite's catch-all would answer first.
        $this->app->instance(HostResolver::class, new class extends HostResolver {
            public function resolve(string $host): array
            {
                return ['93.184.216.34'];
            }
        });
        Http::fake(fn () => throw new ConnectionException('Connection refused'));

        $why = null;
        $this->assertNull($this->fetcher()->get('https://lumiere.example/', 1000, [], $why));
        $this->assertSame('unreachable', $why);
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `$WS/php.sh tests/Feature/Content/WebFetcherTest.php`
Expected: FAIL — `Class "App\Services\Content\Web\WebFetcher" not found`.

- [ ] **Step 3: Write the code**

`app/Services/Content/Web/WebResponse.php`:

```php
<?php

namespace App\Services\Content\Web;

/** A page the scan read: its final address (after redirects), its media type, its body and its Content-Type header. */
final class WebResponse
{
    public function __construct(
        public readonly string $url,
        public readonly string $type,
        public readonly string $body,
        public readonly string $contentType,
    ) {
    }
}
```

`app/Services/Content/Web/WebFetcher.php`:

```php
<?php

namespace App\Services\Content\Web;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Psr\Http\Message\StreamInterface;

/**
 * The scan's GET (spec 2026-10-20 §3.5): it names itself, reaches public hosts only — every address a host resolves to
 * is checked and the connection pinned to the checked one, so a second lookup cannot point it elsewhere — follows at
 * most four redirects, each checked again, and stops reading past the size it was given.
 */
class WebFetcher
{
    public const AGENT = 'HexaTechContentBot';
    public const HTML_TYPES = ['text/html', 'application/xhtml+xml'];
    public const HTML_BYTES = 3_145_728;
    public const XML_BYTES = 10_485_760;
    public const IMAGE_BYTES = 5_242_880;
    private const MAX_REDIRECTS = 4;

    public function __construct(private HostResolver $resolver)
    {
    }

    public static function userAgent(): string
    {
        return self::AGENT . '/1.0 (+' . rtrim((string) config('app.url'), '/') . ')';
    }

    /**
     * @param list<string> $types accepted media types, by prefix ([] = any)
     * @param-out ?string $why bad_address | unreachable | not_found | wrong_type | too_big, when null is answered
     */
    public function get(string $url, int $maxBytes, array $types = [], ?string &$why = null): ?WebResponse
    {
        $why = null;
        for ($hop = 0; $hop <= self::MAX_REDIRECTS; $hop++) {
            $pin = $this->pin($url, $why);
            if ($pin === null) {
                return null;
            }
            try {
                $response = Http::withOptions(['stream' => true, 'allow_redirects' => false, 'curl' => $pin])
                    ->withHeaders(['User-Agent' => self::userAgent(), 'Accept' => '*/*'])
                    ->timeout(10)
                    ->connectTimeout(5)
                    ->get($url);
            } catch (ConnectionException) {
                $why = 'unreachable';

                return null;
            }
            $status = $response->status();
            if ($status >= 300 && $status < 400 && $response->header('Location') !== '') {
                $next = Urls::absolute($response->header('Location'), $url);
                if ($next === null) {
                    $why = 'unreachable';

                    return null;
                }
                $url = $next;
                continue;
            }
            if ($status !== 200) {
                $why = in_array($status, [404, 410], true) ? 'not_found' : 'unreachable';

                return null;
            }
            $header = $response->header('Content-Type');
            $type = strtolower(trim(explode(';', $header)[0]));
            if ($types !== [] && !self::accepts($type, $types)) {
                $why = 'wrong_type';

                return null;
            }
            if ((int) $response->header('Content-Length') > $maxBytes) {
                $why = 'too_big';

                return null;
            }
            $body = self::read($response->toPsrResponse()->getBody(), $maxBytes);
            if ($body === null) {
                $why = 'too_big';

                return null;
            }

            return new WebResponse($url, $type, $body, $header);
        }
        $why = 'unreachable';

        return null;
    }

    /** The curl options pinning the connection to a checked public address; null (and $why) when it may not be read. @return array<int, mixed>|null */
    private function pin(string $url, ?string &$why): ?array
    {
        if (PublicAddress::clean($url) === null) {
            $why = 'bad_address';

            return null;
        }
        $parts = (array) parse_url($url);
        $host = strtolower(trim((string) ($parts['host'] ?? ''), '[]'));
        if (filter_var($host, FILTER_VALIDATE_IP) !== false) {
            return [];
        }
        $ips = $this->resolver->resolve($host);
        if ($ips === []) {
            $why = 'unreachable';

            return null;
        }
        foreach ($ips as $ip) {
            if (!PublicAddress::isPublicIp($ip)) {
                $why = 'bad_address';

                return null;
            }
        }
        $port = (int) ($parts['port'] ?? (strtolower((string) ($parts['scheme'] ?? '')) === 'https' ? 443 : 80));
        $ip = str_contains($ips[0], ':') ? '[' . $ips[0] . ']' : $ips[0];

        return [CURLOPT_RESOLVE => ["{$host}:{$port}:{$ip}"]];
    }

    /** @param list<string> $types */
    private static function accepts(string $type, array $types): bool
    {
        foreach ($types as $accepted) {
            if (str_starts_with($type, $accepted)) {
                return true;
            }
        }

        return false;
    }

    private static function read(StreamInterface $stream, int $maxBytes): ?string
    {
        $body = '';
        while (!$stream->eof()) {
            $body .= $stream->read(65536);
            if (strlen($body) > $maxBytes) {
                $stream->close();

                return null;
            }
        }

        return $body;
    }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `$WS/php.sh tests/Feature/Content/WebFetcherTest.php`
Expected: `Tests: 9 passed`.

- [ ] **Step 5: Commit**

```bash
git add app/Services/Content/Web/WebResponse.php app/Services/Content/Web/WebFetcher.php tests/Concerns/FakesWebsite.php tests/Feature/Content/WebFetcherTest.php
git commit -m "Content website scan: a GET that reaches public hosts only, checks every redirect and caps what it reads"
```

---

### Task 5: Discovery, the scan and the company summary

**Files:**
- Create: `app/Services/Content/ContentSiteDiscovery.php`, `app/Services/Content/ContentSiteScan.php`, `app/Services/Content/ContentSiteSummarizer.php`
- Modify: `tests/Concerns/FakesWebsite.php` (start from a fresh HTTP fake each call)
- Test: `tests/Feature/Content/SiteScanTest.php`, `tests/Unit/Content/ContentSiteSummarizerTest.php`

**Interfaces:**
- Consumes: Task 2–4 (`Urls`, `UrlRules`, `RobotsRules`, `SitemapReader`, `PageReader`, `WebFetcher`), `ContentAiGate::allow`, `ContentKnowledgeService::readinessFor`.
- Produces:
  - `ContentSiteDiscovery::find(string $address): array{failure: ?string, robots: RobotsRules, home: ?WebResponse, site_host: string, blog_path: ?string, candidates: list<array{url: string, kind: string, date: ?string}>}` (pages first, home first; `failure` ∈ `bad_address` | `site_blocked` | `site_unreachable`); `ContentSiteDiscovery::blogPath(string): ?string`
  - `ContentSiteScan::run(ContentSite $site, string $token, bool $updateSummary): void` — writes pages and the outcome only while `$token` is the site's; public `?\Closure $clock` (seconds) for tests; constants `MAX_ARTICLES = 100`, `MAX_PAGES = 30`, `READ_SECONDS = 420`, `SUMMARY_CHARS = 12000`, `SUMMARY_MAX = 6000`
  - `ContentSiteSummarizer` (not final): `summarize(ContentPlannerProfile $profile, array $pages): array{summary: string, brand_summary: ?string, usp: ?string, mission: ?string}`; static `prompt(array $pages, string $language): string`, `answer(array $data): array` (throws `\RuntimeException` without a summary)

- [ ] **Step 1: Make the fake site re-armable**

In `tests/Concerns/FakesWebsite.php`, at the start of `fakeWebsite()` (before binding the resolver):

```php
        // A test that scans twice gives the second site its own fake: stubs add up and the first registered wins.
        Http::swap(new \Illuminate\Http\Client\Factory($this->app->make('events')));
```

- [ ] **Step 2: Write the failing tests**

`tests/Unit/Content/ContentSiteSummarizerTest.php`:

```php
<?php

namespace Tests\Unit\Content;

use App\Services\Content\ContentSiteSummarizer;
use PHPUnit\Framework\TestCase;

/** The company summary's request and answer (spec 2026-10-20 §3.6), without the AI. */
class ContentSiteSummarizerTest extends TestCase
{
    public function test_the_request_carries_every_page_the_language_and_the_facts_only_rule(): void
    {
        $prompt = ContentSiteSummarizer::prompt([
            ['url' => 'https://lumiere.example/', 'title' => 'Lumière', 'text' => 'Hair and colour in Riga.'],
            ['url' => 'https://lumiere.example/services', 'title' => 'Services', 'text' => 'Cuts from 40 €.'],
        ], 'ru');

        $this->assertStringContainsString('Use only facts the pages state', $prompt);
        $this->assertStringContainsString('"ru"', $prompt);
        $this->assertStringContainsString("### Lumière (https://lumiere.example/)\nHair and colour in Riga.", $prompt);
        $this->assertStringContainsString("### Services (https://lumiere.example/services)\nCuts from 40 €.", $prompt);
        $this->assertStringContainsString('"brand_summary"', $prompt);
    }

    public function test_the_answer_is_trimmed_cut_and_empty_fields_become_null(): void
    {
        $answer = ContentSiteSummarizer::answer(['summary' => '  A salon.  ', 'brand_summary' => str_repeat('b', 700), 'usp' => '', 'mission' => ['not text']]);

        $this->assertSame('A salon.', $answer['summary']);
        $this->assertSame(600, mb_strlen($answer['brand_summary']));
        $this->assertNull($answer['usp']);
        $this->assertNull($answer['mission']);
    }

    public function test_an_answer_without_a_summary_is_a_failure(): void
    {
        $this->expectException(\RuntimeException::class);
        ContentSiteSummarizer::answer(['brand_summary' => 'x']);
    }
}
```

`tests/Feature/Content/SiteScanTest.php`:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentPlannerProfile;
use App\Models\ContentSite;
use App\Models\ContentSitePage;
use App\Services\Content\ContentSiteScan;
use App\Services\Content\ContentSiteSummarizer;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\Concerns\FakesWebsite;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** The scan end to end (spec 2026-10-20 §3.2–§3.6): DNS and HTTP faked, the AI replaced. */
class SiteScanTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema, FakesWebsite;

    private const SITE = 'https://lumiere.example';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function site(string $url = self::SITE, string $token = 'token-1'): ContentSite
    {
        return ContentSite::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'url' => $url,
            'status' => 'scanning', 'scan_token' => $token, 'scan_queued_at' => now()]);
    }

    private function scan(ContentSite $site, bool $summary = false, string $token = 'token-1', ?\Closure $clock = null): ContentSite
    {
        $scan = app(ContentSiteScan::class);
        $scan->clock = $clock;
        $scan->run($site, $token, $summary);

        return $site->fresh();
    }

    /** @return list<string> */
    private function listed(ContentSite $site, string $kind): array
    {
        return ContentSitePage::where('site_id', $site->id)->where('kind', $kind)->orderBy('id')->pluck('url')->all();
    }

    private function fakeSummary(?array $answer = null, ?\Throwable $error = null): object
    {
        $fake = new class($answer, $error) extends ContentSiteSummarizer {
            /** @var list<array> */
            public array $calls = [];

            public function __construct(private ?array $answer, private ?\Throwable $error)
            {
            }

            public function summarize(ContentPlannerProfile $profile, array $pages): array
            {
                $this->calls[] = $pages;
                if ($this->error !== null) {
                    throw $this->error;
                }

                return $this->answer ?? ['summary' => 'Lumière is a salon.', 'brand_summary' => null, 'usp' => null, 'mission' => null];
            }
        };
        $this->app->instance(ContentSiteSummarizer::class, $fake);

        return $fake;
    }

    private static function html(string $title, string $body = '<p>Text</p>', array $meta = []): string
    {
        $tags = '';
        foreach ($meta as $property => $content) {
            $tags .= '<meta property="' . $property . '" content="' . $content . '">';
        }

        return '<html lang="en"><head><title>' . $title . '</title>' . $tags . '</head><body><main>' . $body . '</main></body></html>';
    }

    /** @param array<string, ?string> $urls address => lastmod */
    private static function urlset(array $urls): string
    {
        $out = '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
        foreach ($urls as $url => $date) {
            $out .= '<url><loc>' . $url . '</loc>' . ($date ? '<lastmod>' . $date . '</lastmod>' : '') . '</url>';
        }

        return $out . '</urlset>';
    }

    /** @param list<string> $sitemaps */
    private static function index(array $sitemaps): string
    {
        return '<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            . implode('', array_map(fn (string $url) => '<sitemap><loc>' . $url . '</loc></sitemap>', $sitemaps)) . '</sitemapindex>';
    }

    private function wordpressSite(): void
    {
        $this->fakeWebsite([
            self::SITE . '/robots.txt' => "User-agent: *\nDisallow: /blog/secret\nSitemap: " . self::SITE . '/sitemap_index.xml',
            self::SITE . '/' => self::html('Lumière Salon', '<p>Hair and colour in Riga.</p>'),
            self::SITE . '/sitemap_index.xml' => self::index([self::SITE . '/post-sitemap.xml', self::SITE . '/page-sitemap.xml', self::SITE . '/category-sitemap.xml']),
            self::SITE . '/post-sitemap.xml' => self::urlset([self::SITE . '/autumn-colours/' => '2026-09-01', self::SITE . '/blog/secret/x' => '2026-09-02', self::SITE . '/winter-care/' => '2026-09-20']),
            self::SITE . '/page-sitemap.xml' => self::urlset([self::SITE . '/' => null, self::SITE . '/services/' => null]),
            self::SITE . '/autumn-colours/' => self::html('Autumn colours', '<p>Copper suits warm skin.</p>', ['og:image' => self::SITE . '/a.jpg']),
            self::SITE . '/winter-care/' => self::html('Winter care'),
            self::SITE . '/services/' => self::html('Services', '<p>Cuts and colour.</p>'),
        ]);
    }

    public function test_a_sitemap_site_lists_its_articles_newest_first_and_its_pages(): void
    {
        $this->wordpressSite();
        $site = $this->scan($this->site());

        $this->assertSame('ready', $site->status);
        $this->assertNull($site->error);
        $this->assertSame(2, $site->articles_count);
        $this->assertSame(2, $site->pages_count);
        $this->assertNotNull($site->scanned_at);
        $this->assertSame([self::SITE . '/', self::SITE . '/services/'], $this->listed($site, 'page'));
        $this->assertEqualsCanonicalizing([self::SITE . '/autumn-colours/', self::SITE . '/winter-care/'], $this->listed($site, 'article'));
        $autumn = ContentSitePage::where('url', self::SITE . '/autumn-colours/')->first();
        $this->assertSame('Autumn colours', $autumn->title);
        $this->assertSame(self::SITE . '/a.jpg', $autumn->image_url);
        $this->assertSame('2026-09-01', $autumn->published_at->format('Y-m-d'));
        $this->assertSame('Copper suits warm skin.', $autumn->body);
        $this->assertSame($this->org->id, (int) $autumn->organization_id);
        // The category sitemap is never asked for; robots.txt keeps the disallowed article out.
        Http::assertNotSent(fn (Request $request) => str_contains($request->url(), 'category-sitemap'));
        Http::assertNotSent(fn (Request $request) => str_contains($request->url(), '/blog/secret'));
    }

    public function test_a_site_with_only_a_feed_lists_the_feeds_articles(): void
    {
        $this->fakeWebsite([
            self::SITE . '/' => '<html><head><title>Lumière</title><link rel="alternate" type="application/rss+xml" href="/feed/"></head><body><a href="/prices">Prices</a></body></html>',
            self::SITE . '/feed/' => '<?xml version="1.0"?><rss version="2.0"><channel><item><title>Autumn</title><link>' . self::SITE . '/2026/09/autumn/</link><pubDate>Tue, 01 Sep 2026 10:00:00 +0000</pubDate></item></channel></rss>',
            self::SITE . '/2026/09/autumn/' => self::html('Autumn colours'),
            self::SITE . '/prices' => self::html('Prices'),
        ]);
        $site = $this->scan($this->site());

        $this->assertSame('ready', $site->status);
        $this->assertSame([self::SITE . '/2026/09/autumn/'], $this->listed($site, 'article'));
        $this->assertSame([self::SITE . '/', self::SITE . '/prices'], $this->listed($site, 'page'));
    }

    public function test_a_site_with_only_a_blog_page_lists_the_articles_it_links(): void
    {
        $this->fakeWebsite([
            self::SITE . '/' => self::html('Lumière', '<p><a href="/blog">Blog</a> <a href="/about">About</a></p>'),
            self::SITE . '/blog' => self::html('Blog', '<p><a href="/blog/a">A</a> <a href="/blog/b">B</a> <a href="/blog/page/2">Older</a></p>'),
            self::SITE . '/blog/a' => self::html('Post A'),
            self::SITE . '/blog/b' => self::html('Post B'),
            self::SITE . '/about' => self::html('About us'),
        ]);
        $site = $this->scan($this->site());

        $this->assertEqualsCanonicalizing([self::SITE . '/blog/a', self::SITE . '/blog/b'], $this->listed($site, 'article'));
        $this->assertSame([self::SITE . '/', self::SITE . '/about'], $this->listed($site, 'page'));
    }

    public function test_html_answered_for_robots_and_sitemap_is_not_taken_for_them(): void
    {
        $this->fakeWebsite([
            self::SITE . '/robots.txt' => ['<html><body>Welcome</body></html>', 200, ['Content-Type' => 'text/html']],
            self::SITE . '/sitemap.xml' => ['<html><body>Welcome</body></html>', 200, ['Content-Type' => 'text/html']],
            self::SITE . '/' => self::html('Lumière', '<p><a href="/blog/a">A</a></p>'),
            self::SITE . '/blog/a' => self::html('Post A'),
        ]);
        $site = $this->scan($this->site());

        $this->assertSame('ready', $site->status);
        $this->assertSame([self::SITE . '/blog/a'], $this->listed($site, 'article'));
    }

    public function test_the_redirected_home_host_is_the_site(): void
    {
        $this->fakeWebsite([
            self::SITE . '/' => ['', 301, ['Location' => 'https://www.lumiere.example/']],
            'https://www.lumiere.example/' => self::html('Lumière', '<p><a href="/blog/a">A</a> <a href="https://other.example/blog/x">X</a></p>'),
            'https://www.lumiere.example/blog/a' => self::html('Post A'),
        ]);
        $site = $this->scan($this->site());

        $this->assertSame(['https://www.lumiere.example/blog/a'], $this->listed($site, 'article'));
        Http::assertNotSent(fn (Request $request) => str_contains($request->url(), 'other.example'));
    }

    public function test_a_site_that_forbids_robots_is_blocked_and_nothing_else_is_asked(): void
    {
        $this->fakeWebsite([self::SITE . '/robots.txt' => "User-agent: *\nDisallow: /"]);
        $site = $this->scan($this->site());

        $this->assertSame('failed', $site->status);
        $this->assertSame('site_blocked', $site->error);
        Http::assertSentCount(1);
    }

    public function test_a_host_that_does_not_answer_is_unreachable_and_a_private_one_a_bad_address(): void
    {
        $this->fakeWebsite([], ['lumiere.example' => []]);
        $this->assertSame('site_unreachable', $this->scan($this->site())->error);

        $this->fakeWebsite([], ['private.example' => ['10.0.0.5']]);
        $site = ContentSite::where('planner_profile_id', $this->profile->id)->first();
        $site->forceFill(['url' => 'https://private.example', 'status' => 'scanning'])->save();
        $this->assertSame('bad_address', $this->scan($site)->error);
    }

    public function test_a_site_where_nothing_can_be_read_has_nothing_found(): void
    {
        $this->fakeWebsite([self::SITE . '/sitemap.xml' => self::urlset([self::SITE . '/tag/hair' => null])]);
        $site = $this->scan($this->site());

        $this->assertSame('failed', $site->status);
        $this->assertSame('nothing_found', $site->error);
    }

    public function test_at_most_the_hundred_newest_articles_and_thirty_pages(): void
    {
        $articles = [];
        $pages = [self::SITE . '/' => self::html('Home')];
        $entries = [];
        for ($i = 0; $i < 150; $i++) {
            $url = self::SITE . "/blog/p{$i}";
            $entries[$url] = date('Y-m-d', strtotime('2026-01-01 +' . $i . ' days'));
            $articles[$url] = self::html("Post {$i}");
        }
        $pageEntries = [];
        for ($i = 0; $i < 40; $i++) {
            $pageEntries[self::SITE . "/page-{$i}"] = null;
            $pages[self::SITE . "/page-{$i}"] = self::html("Page {$i}");
        }
        $this->fakeWebsite([
            self::SITE . '/robots.txt' => 'Sitemap: ' . self::SITE . '/sitemap_index.xml',
            self::SITE . '/sitemap_index.xml' => self::index([self::SITE . '/post-sitemap.xml', self::SITE . '/page-sitemap.xml']),
            self::SITE . '/post-sitemap.xml' => self::urlset($entries),
            self::SITE . '/page-sitemap.xml' => self::urlset($pageEntries),
        ] + $articles + $pages);
        $site = $this->scan($this->site());

        $listed = $this->listed($site, 'article');
        $this->assertCount(ContentSiteScan::MAX_ARTICLES, $listed);
        $this->assertContains(self::SITE . '/blog/p149', $listed);
        $this->assertNotContains(self::SITE . '/blog/p49', $listed);
        $this->assertCount(ContentSiteScan::MAX_PAGES, $this->listed($site, 'page'));
        $this->assertContains(self::SITE . '/', $this->listed($site, 'page'));
    }

    public function test_a_new_scan_replaces_the_list_but_keeps_promoted_pages(): void
    {
        $this->fakeWebsite([
            self::SITE . '/' => self::html('Lumière', '<p><a href="/blog/a">A</a> <a href="/blog/b">B</a> <a href="/blog/d">D</a></p>'),
            self::SITE . '/blog/a' => self::html('A'), self::SITE . '/blog/b' => self::html('B'), self::SITE . '/blog/d' => self::html('D'),
        ]);
        $site = $this->scan($this->site());
        $b = ContentSitePage::where('url', self::SITE . '/blog/b')->first();
        $this->makePost(['site_page_id' => $b->id]);

        $this->travel(1)->days();
        $this->fakeWebsite([
            self::SITE . '/' => self::html('Lumière', '<p><a href="/blog/a">A again</a> <a href="/blog/c">C</a></p>'),
            self::SITE . '/blog/a' => self::html('A, updated'), self::SITE . '/blog/c' => self::html('C'),
        ]);
        $site->forceFill(['status' => 'scanning', 'scan_token' => 'token-2'])->save();
        $site = $this->scan($site, false, 'token-2');

        $this->assertEqualsCanonicalizing([self::SITE . '/blog/a', self::SITE . '/blog/b', self::SITE . '/blog/c'], $this->listed($site, 'article'));
        $this->assertSame('A, updated', ContentSitePage::where('url', self::SITE . '/blog/a')->value('title'));
        $this->assertTrue($b->fresh()->last_seen_at->lt($site->scanned_at));
        $this->assertSame(2, $site->articles_count);
    }

    public function test_the_summary_is_written_and_fills_only_empty_brand_fields(): void
    {
        $this->wordpressSite();
        $this->profile->update(['usp' => 'Our own USP']);
        $fake = $this->fakeSummary(['summary' => 'Lumière cuts and colours hair in Riga.', 'brand_summary' => 'A salon in Riga.', 'usp' => 'Colour experts', 'mission' => null]);
        $site = $this->scan($this->site(), true);

        $this->assertSame('Lumière cuts and colours hair in Riga.', $site->summary);
        $this->assertNotNull($site->summary_updated_at);
        $this->assertFalse($site->summary_edited);
        $this->assertNull($site->summary_note);
        $this->assertSame('A salon in Riga.', $this->profile->fresh()->brand_summary);
        $this->assertSame('Our own USP', $this->profile->fresh()->usp);
        // The pages, home first; never the articles.
        $this->assertSame([self::SITE . '/', self::SITE . '/services/'], array_column($fake->calls[0], 'url'));
        $this->assertSame('Hair and colour in Riga.', $fake->calls[0][0]['text']);
    }

    public function test_a_used_up_budget_or_a_failing_ai_keeps_the_list_and_says_why(): void
    {
        $this->wordpressSite();
        $this->setAiCap(100, 100);
        $fake = $this->fakeSummary();
        $site = $this->scan($this->site(), true);
        $this->assertSame('ready', $site->status);
        $this->assertSame('ai_budget_used_up', $site->summary_note);
        $this->assertSame([], $fake->calls);

        $this->setAiCap(100000, 0);
        $this->fakeSummary(null, new \RuntimeException('provider down'));
        $site->forceFill(['status' => 'scanning'])->save();
        $this->assertSame('ai_failed', $this->scan($site, true)->summary_note);
    }

    public function test_without_update_summary_the_ai_is_not_asked(): void
    {
        $this->wordpressSite();
        $fake = $this->fakeSummary();
        $site = $this->scan($this->site(), false);

        $this->assertSame([], $fake->calls);
        $this->assertNull($site->summary);
    }

    public function test_the_reading_stops_after_its_time(): void
    {
        $pages = [self::SITE . '/' => self::html('Home')];
        foreach (['about', 'services', 'prices', 'contact', 'team'] as $page) {
            $pages[self::SITE . '/' . $page] = self::html(ucfirst($page));
        }
        $this->fakeWebsite([self::SITE . '/sitemap.xml' => self::urlset(array_fill_keys(array_keys($pages), null))] + $pages);
        $seconds = 0;
        $site = $this->scan($this->site(), false, 'token-1', function () use (&$seconds) {
            return $seconds += 100;
        });

        $this->assertSame(4, $site->pages_count);
    }

    public function test_a_scan_whose_token_is_no_longer_the_sites_writes_nothing(): void
    {
        $this->wordpressSite();
        $site = $this->site(self::SITE, 'token-2');
        $this->scan($site, false, 'token-1');

        $this->assertSame(0, ContentSitePage::where('site_id', $site->id)->count());
        $this->assertSame('scanning', $site->fresh()->status);
        $this->assertSame('token-2', $site->fresh()->scan_token);
    }
}
```

- [ ] **Step 3: Run them to see them fail**

Run: `$WS/php.sh tests/Unit/Content/ContentSiteSummarizerTest.php tests/Feature/Content/SiteScanTest.php`
Expected: FAIL — `Class "App\Services\Content\ContentSiteSummarizer" not found` / `ContentSiteScan` not found.

- [ ] **Step 4: Write the code**

`app/Services/Content/ContentSiteSummarizer.php`:

```php
<?php

namespace App\Services\Content;

use App\Models\ContentPlannerProfile;
use App\Services\ContentPlanner\AiClient;

/**
 * The company summary (spec 2026-10-20 §3.6): one AI call with the site's own pages, facts only, in the brand's
 * language. Not final, so tests replace it.
 */
class ContentSiteSummarizer
{
    public function __construct(protected AiClient $ai)
    {
    }

    /**
     * @param list<array{url: string, title: string, text: string}> $pages
     * @return array{summary: string, brand_summary: ?string, usp: ?string, mission: ?string}
     */
    public function summarize(ContentPlannerProfile $profile, array $pages): array
    {
        $prompt = self::prompt($pages, (string) ($profile->default_language ?: 'en'));

        return self::answer($this->ai->generateJson($profile, 'website_summary', $prompt, 3000));
    }

    /** @param list<array{url: string, title: string, text: string}> $pages */
    public static function prompt(array $pages, string $language): string
    {
        $blocks = array_map(fn (array $page) => "### {$page['title']} ({$page['url']})\n{$page['text']}", $pages);

        return "You read a company's own website and write what a social media writer must know about the company.\n"
            . 'Use only facts the pages state: no invented services, prices, numbers, awards or quotes. '
            . "Write in the language with the code \"{$language}\".\n\n"
            . "## THE PAGES\n" . implode("\n\n", $blocks) . "\n\n"
            . 'Return ONLY JSON: {"summary": "...", "brand_summary": "...", "usp": "...", "mission": "..."}' . "\n"
            . "- summary: up to 400 words of plain text in short labelled lines: What we do; Services or products; Who it is for; Where; Proof points; Tone of voice.\n"
            . "- brand_summary: one paragraph, up to 600 characters.\n"
            . "- usp: what makes the company different, up to 300 characters; an empty string when the pages do not say.\n"
            . '- mission: up to 300 characters; an empty string when the pages do not say.';
    }

    /**
     * @param array<string, mixed> $data
     * @return array{summary: string, brand_summary: ?string, usp: ?string, mission: ?string}
     */
    public static function answer(array $data): array
    {
        $summary = self::text($data['summary'] ?? null, ContentSiteScan::SUMMARY_MAX);
        if ($summary === null) {
            throw new \RuntimeException('The website summary came back without a summary.');
        }

        return [
            'summary'       => $summary,
            'brand_summary' => self::text($data['brand_summary'] ?? null, 600),
            'usp'           => self::text($data['usp'] ?? null, 300),
            'mission'       => self::text($data['mission'] ?? null, 300),
        ];
    }

    private static function text(mixed $value, int $max): ?string
    {
        if (!is_string($value)) {
            return null;
        }
        $value = trim($value);

        return $value === '' ? null : mb_substr($value, 0, $max);
    }
}
```

`app/Services/Content/ContentSiteDiscovery.php`:

```php
<?php

namespace App\Services\Content;

use App\Services\Content\Web\PageReader;
use App\Services\Content\Web\RobotsRules;
use App\Services\Content\Web\SitemapReader;
use App\Services\Content\Web\UrlRules;
use App\Services\Content\Web\Urls;
use App\Services\Content\Web\WebFetcher;
use App\Services\Content\Web\WebResponse;

/**
 * Finding a site's articles and pages (spec 2026-10-20 §3.2, §3.3): robots.txt, then the sitemaps it names (else the
 * usual addresses), else the home page's feed, its links and its blog page. Answers the candidates to read — pages
 * first (the home page first), then articles newest first — or why there are none.
 */
class ContentSiteDiscovery
{
    public const MAX_SITEMAPS = 12;
    private const DEFAULT_SITEMAPS = ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml', '/sitemap-index.xml'];

    public function __construct(private WebFetcher $web)
    {
    }

    /** The folder the address names (spec §3.1): `https://ex.com/blog` → `/blog`; none for the bare site. */
    public static function blogPath(string $address): ?string
    {
        $path = rtrim(Urls::path($address), '/');

        return $path === '' ? null : $path;
    }

    /**
     * @return array{failure: ?string, robots: RobotsRules, home: ?WebResponse, site_host: string, blog_path: ?string,
     *     candidates: list<array{url: string, kind: string, date: ?string}>}
     */
    public function find(string $address): array
    {
        $origin = (string) Urls::origin($address);
        $blogPath = self::blogPath($address);
        $result = ['failure' => null, 'robots' => RobotsRules::allowAll(), 'home' => null, 'site_host' => UrlRules::siteHost($origin), 'blog_path' => $blogPath, 'candidates' => []];

        $why = null;
        $robotsFile = $this->web->get($origin . '/robots.txt', 512 * 1024, [], $why);
        if ($robotsFile === null && $why === 'bad_address') {
            return ['failure' => 'bad_address'] + $result;
        }
        $robots = $robotsFile !== null ? RobotsRules::parse($robotsFile->body, WebFetcher::AGENT) : RobotsRules::allowAll();
        $result['robots'] = $robots;
        if (!$robots->allows('/')) {
            return ['failure' => 'site_blocked'] + $result;
        }

        $home = $this->web->get($origin . '/', WebFetcher::HTML_BYTES, WebFetcher::HTML_TYPES);
        $siteHost = UrlRules::siteHost($home?->url ?? $origin);
        $result['home'] = $home;
        $result['site_host'] = $siteHost;

        $entries = $this->sitemaps($origin, $robots->sitemaps, $siteHost);
        if ($entries === [] && $home !== null) {
            $entries = $this->fromHome($home, $siteHost, $blogPath, $robots);
        }
        if ($entries === [] && $home === null) {
            return ['failure' => 'site_unreachable'] + $result;
        }
        $result['candidates'] = self::classify($entries, $siteHost, $blogPath, $home === null ? null : Urls::normalize($home->url));

        return $result;
    }

    /**
     * @param list<string> $named the sitemaps robots.txt names
     * @return list<array{url: string, date: ?string, hint: ?string}>
     */
    private function sitemaps(string $origin, array $named, string $siteHost): array
    {
        $queue = [];
        foreach ($named as $url) {
            $absolute = Urls::absolute($url, $origin . '/');
            if ($absolute !== null && UrlRules::sameSite($absolute, $siteHost)) {
                $queue[] = [$absolute, UrlRules::sitemapHint($absolute), false];
            }
        }
        if ($queue === []) {
            foreach (self::DEFAULT_SITEMAPS as $path) {
                $queue[] = [$origin . $path, null, true];
            }
        }
        $entries = [];
        $seen = [];
        $files = 0;
        $defaultFound = false;
        while ($queue !== [] && $files < self::MAX_SITEMAPS && count($entries) < SitemapReader::MAX_ENTRIES) {
            [$url, $hint, $isDefault] = array_shift($queue);
            if (isset($seen[$url]) || ($isDefault && $defaultFound)) {
                continue;
            }
            $seen[$url] = true;
            $files++;
            $file = $this->web->get($url, WebFetcher::XML_BYTES);
            $read = $file === null ? ['kind' => 'none', 'entries' => []] : SitemapReader::read($file->body);
            if ($read['kind'] === 'none') {
                continue;
            }
            $defaultFound = $defaultFound || $isDefault;
            foreach ($read['entries'] as $entry) {
                if ($read['kind'] === 'index') {
                    $childHint = UrlRules::sitemapHint($entry['url']);
                    if ($childHint !== 'skip' && UrlRules::sameSite($entry['url'], $siteHost)) {
                        $queue[] = [$entry['url'], $childHint ?? $hint, false];
                    }
                    continue;
                }
                $entries[] = ['url' => $entry['url'], 'date' => $entry['date'], 'hint' => $read['kind'] === 'feed' ? 'article' : $hint];
            }
        }

        return array_slice($entries, 0, SitemapReader::MAX_ENTRIES);
    }

    /** @return list<array{url: string, date: ?string, hint: ?string}> */
    private function fromHome(WebResponse $home, string $siteHost, ?string $blogPath, RobotsRules $robots): array
    {
        $page = PageReader::read($home->body, $home->url, $home->contentType);
        $entries = [];
        foreach (array_slice($page['feeds'], 0, 2) as $feedUrl) {
            if (!UrlRules::sameSite($feedUrl, $siteHost) || !$robots->allows(Urls::pathAndQuery($feedUrl))) {
                continue;
            }
            $feed = $this->web->get($feedUrl, WebFetcher::XML_BYTES);
            $read = $feed === null ? ['kind' => 'none', 'entries' => []] : SitemapReader::read($feed->body);
            if ($read['kind'] === 'feed') {
                foreach ($read['entries'] as $entry) {
                    $entries[] = ['url' => $entry['url'], 'date' => $entry['date'], 'hint' => 'article'];
                }
            }
        }
        foreach ($page['links'] as $link) {
            $entries[] = ['url' => $link, 'date' => null, 'hint' => null];
        }
        $blog = $blogPath !== null ? Urls::origin($home->url) . $blogPath : null;
        if ($blog === null) {
            foreach ($page['links'] as $link) {
                if (UrlRules::sameSite($link, $siteHost) && UrlRules::isBlogIndex($link, null)) {
                    $blog = $link;
                    break;
                }
            }
        }
        if ($blog !== null && $robots->allows(Urls::pathAndQuery($blog))) {
            $index = $this->web->get($blog, WebFetcher::HTML_BYTES, WebFetcher::HTML_TYPES);
            if ($index !== null) {
                $folder = rtrim(Urls::path($index->url), '/');
                foreach (PageReader::read($index->body, $index->url, $index->contentType)['links'] as $link) {
                    if (UrlRules::looksLikeArticle($link, $folder === '' ? null : $folder)) {
                        $entries[] = ['url' => $link, 'date' => null, 'hint' => 'article'];
                    }
                }
            }
        }

        return $entries;
    }

    /**
     * @param list<array{url: string, date: ?string, hint: ?string}> $entries
     * @return list<array{url: string, kind: string, date: ?string}>
     */
    private static function classify(array $entries, string $siteHost, ?string $blogPath, ?string $homeUrl): array
    {
        $articles = [];
        $pages = [];
        $seen = [];
        $hasHome = false;
        foreach ($entries as $entry) {
            $url = Urls::normalize($entry['url']);
            if ($url === null || isset($seen[$url]) || !UrlRules::sameSite($url, $siteHost) || UrlRules::skipped($url)) {
                continue;
            }
            $seen[$url] = true;
            $isHome = Urls::path($url) === '/';
            if ($isHome && $hasHome) {
                continue;
            }
            $hasHome = $hasHome || $isHome;
            if (!$isHome && UrlRules::isBlogIndex($url, $blogPath)) {
                continue;
            }
            if (!$isHome && ($entry['hint'] === 'article' || UrlRules::looksLikeArticle($url, $blogPath))) {
                $articles[] = ['url' => $url, 'kind' => 'article', 'date' => $entry['date']];
            } else {
                $pages[] = ['url' => $url, 'kind' => 'page', 'date' => $entry['date']];
            }
        }
        if ($homeUrl !== null && !$hasHome) {
            $pages[] = ['url' => $homeUrl, 'kind' => 'page', 'date' => null];
        }
        // Newest first; undated last, in the file's order (usort is stable).
        usort($articles, fn (array $a, array $b) => [$b['date'] !== null, (string) $b['date']] <=> [$a['date'] !== null, (string) $a['date']]);
        usort($pages, fn (array $a, array $b) => [UrlRules::pageRank($a['url']), strlen($a['url'])] <=> [UrlRules::pageRank($b['url']), strlen($b['url'])]);

        return array_merge(array_slice($pages, 0, ContentSiteScan::MAX_PAGES), array_slice($articles, 0, ContentSiteScan::MAX_ARTICLES));
    }
}
```

`app/Services/Content/ContentSiteScan.php`:

```php
<?php

namespace App\Services\Content;

use App\Models\ContentPlannerProfile;
use App\Models\ContentSite;
use App\Models\ContentSitePage;
use App\Models\Organization;
use App\Services\Content\Web\PageReader;
use App\Services\Content\Web\UrlRules;
use App\Services\Content\Web\Urls;
use App\Services\Content\Web\WebFetcher;
use App\Services\ContentKnowledgeService;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * One scan (spec 2026-10-20 §3.2–§3.6): finds the candidates, reads them one at a time for up to READ_SECONDS (pages
 * before articles), replaces the site's list, writes the company summary when asked, and records the outcome — only
 * while `$token` is still the site's scan, so a late job never writes over a newer one.
 */
class ContentSiteScan
{
    public const MAX_ARTICLES = 100;
    public const MAX_PAGES = 30;
    public const READ_SECONDS = 420;
    public const SUMMARY_CHARS = 12000;
    public const SUMMARY_MAX = 6000;

    /** Seconds, for tests; the wall clock otherwise. */
    public ?\Closure $clock = null;

    public function __construct(
        private ContentSiteDiscovery $discovery,
        private WebFetcher $web,
        private ContentSiteSummarizer $summarizer,
        private ContentAiGate $gate,
    ) {
    }

    public function run(ContentSite $site, string $token, bool $updateSummary): void
    {
        $started = $this->now();
        $found = $this->discovery->find((string) $site->url);
        if ($found['failure'] !== null) {
            self::finish($site, $token, ['status' => 'failed', 'error' => $found['failure']]);

            return;
        }
        $home = $found['home'];
        $homeUrl = $home === null ? null : Urls::normalize($home->url);
        $rows = [];
        foreach ($found['candidates'] as $candidate) {
            if ($this->now() - $started > self::READ_SECONDS) {
                break;
            }
            if (!$found['robots']->allows(Urls::pathAndQuery($candidate['url']))) {
                continue;
            }
            $response = $home !== null && $candidate['url'] === $homeUrl
                ? $home
                : $this->web->get($candidate['url'], WebFetcher::HTML_BYTES, WebFetcher::HTML_TYPES);
            if ($response === null) {
                continue;
            }
            $rows[] = self::row($candidate, PageReader::read($response->body, $response->url, $response->contentType));
        }
        if ($rows === []) {
            self::finish($site, $token, ['status' => 'failed', 'error' => 'nothing_found']);

            return;
        }
        if (!self::current($site, $token)) {
            return;
        }
        $now = CarbonImmutable::now()->startOfSecond();
        $counts = DB::transaction(fn () => self::save($site, $rows, $now));
        [$summary, $note] = $updateSummary ? $this->summary($site, $rows) : [[], null];
        self::finish($site, $token, [
            'status' => 'ready', 'error' => null, 'scanned_at' => $now,
            'articles_count' => $counts['articles'], 'pages_count' => $counts['pages'], 'summary_note' => $note,
        ] + $summary);
    }

    private function now(): float
    {
        return $this->clock !== null ? (float) ($this->clock)() : microtime(true);
    }

    /**
     * @param array{url: string, kind: string, date: ?string} $candidate
     * @param array<string, mixed> $read
     * @return array<string, mixed>
     */
    private static function row(array $candidate, array $read): array
    {
        $isHome = Urls::path($candidate['url']) === '/';

        return [
            'url'          => $candidate['url'],
            'kind'         => !$isHome && ($candidate['kind'] === 'article' || $read['article']) ? 'article' : 'page',
            'title'        => $read['title'] ?? UrlRules::lastPart($candidate['url']),
            'description'  => $read['description'],
            'image_url'    => $read['image'],
            'published_at' => $read['published_at'] ?? $candidate['date'],
            'language'     => $read['language'],
            'body'         => $read['text'] === '' ? null : $read['text'],
        ];
    }

    /**
     * @param list<array<string, mixed>> $rows
     * @return array{articles: int, pages: int}
     */
    private static function save(ContentSite $site, array $rows, CarbonImmutable $now): array
    {
        $kept = [];
        foreach ($rows as $row) {
            $page = ContentSitePage::withoutGlobalScopes()->firstOrNew(['site_id' => $site->id, 'url_hash' => hash('sha256', $row['url'])]);
            $page->fill($row + ['organization_id' => $site->organization_id, 'brand_id' => $site->brand_id, 'last_seen_at' => $now])->save();
            $kept[] = (int) $page->id;
        }
        // Not found again: removed, unless posts promote them (spec §3.4).
        ContentSitePage::withoutGlobalScopes()->where('site_id', $site->id)->whereNotIn('id', $kept)
            ->whereNotExists(fn ($query) => $query->selectRaw('1')->from('content_planner_posts')
                ->whereColumn('content_planner_posts.site_page_id', 'content_site_pages.id'))
            ->delete();
        $articles = count(array_filter($rows, fn (array $row) => $row['kind'] === 'article'));

        return ['articles' => $articles, 'pages' => count($rows) - $articles];
    }

    /**
     * The new summary fields (and the empty brand fields filled), or why there are none (spec §3.6).
     *
     * @param list<array<string, mixed>> $rows
     * @return array{0: array<string, mixed>, 1: ?string}
     */
    private function summary(ContentSite $site, array $rows): array
    {
        $pages = [];
        $left = self::SUMMARY_CHARS;
        foreach ($rows as $row) {
            if ($row['kind'] !== 'page' || $row['body'] === null || $left <= 0) {
                continue;
            }
            $text = mb_substr((string) $row['body'], 0, $left);
            $pages[] = ['url' => (string) $row['url'], 'title' => (string) $row['title'], 'text' => $text];
            $left -= mb_strlen($text);
        }
        if ($pages === []) {
            return [[], null];
        }
        try {
            $this->gate->allow(Organization::findOrFail($site->organization_id));
        } catch (ContentRefused) {
            return [[], 'ai_budget_used_up'];
        }
        $profile = ContentPlannerProfile::withoutGlobalScopes()->findOrFail($site->planner_profile_id);
        try {
            $answer = $this->summarizer->summarize($profile, $pages);
        } catch (\Throwable $e) {
            report($e);

            return [[], 'ai_failed'];
        }
        $fill = [];
        foreach (['brand_summary', 'usp', 'mission'] as $field) {
            if (trim((string) $profile->{$field}) === '' && ($answer[$field] ?? null) !== null) {
                $fill[$field] = $answer[$field];
            }
        }
        if ($fill !== []) {
            $profile->update($fill);
            app(ContentKnowledgeService::class)->readinessFor($profile);
        }

        return [['summary' => mb_substr($answer['summary'], 0, self::SUMMARY_MAX), 'summary_updated_at' => now(), 'summary_edited' => false], null];
    }

    private static function current(ContentSite $site, string $token): bool
    {
        return ContentSite::withoutGlobalScopes()->whereKey($site->id)->value('scan_token') === $token;
    }

    /** @param array<string, mixed> $fields */
    private static function finish(ContentSite $site, string $token, array $fields): void
    {
        ContentSite::withoutGlobalScopes()->whereKey($site->id)->where('scan_token', $token)->where('status', 'scanning')->update($fields);
    }
}
```

- [ ] **Step 5: Run them to see them pass**

Run: `$WS/php.sh tests/Unit/Content/ContentSiteSummarizerTest.php tests/Feature/Content/SiteScanTest.php`
Expected: `Tests: 3 passed`, `Tests: 15 passed`.

- [ ] **Step 6: Commit**

```bash
git add app/Services/Content/ContentSiteDiscovery.php app/Services/Content/ContentSiteScan.php app/Services/Content/ContentSiteSummarizer.php tests/Concerns/FakesWebsite.php tests/Unit/Content/ContentSiteSummarizerTest.php tests/Feature/Content/SiteScanTest.php
git commit -m "Content website scan: find the articles and pages, read them, keep the list and the company summary"
```

---

### Task 6: The site endpoints, the scan job and the AI's context

**Files:**
- Create: `app/Services/Content/ContentSites.php`, `app/Jobs/ScanContentWebsite.php`, `app/Http/Controllers/Api/V1/Admin/Content/SiteController.php`
- Modify: `routes/api.php`, `app/Services/ContentPlanner/ContextBuilder.php`, `app/Services/ContentKnowledgeService.php`, `tests/Feature/QueueRetryAfterTest.php`
- Test: `tests/Feature/Content/SiteEditTest.php`, `tests/Feature/Content/SiteScanEndpointTest.php`, `tests/Feature/Content/WebsiteContextTest.php`

**Interfaces:**
- Consumes: `ContentSiteScan::run` (Task 5), `PublicAddress::clean` (Task 2).
- Produces:
  - `ContentSites::QUEUED_SECONDS = 1800`, `RUN_SECONDS = 660`, `SCANS_PER_DAY = 20`; `of(int $profileId): ?ContentSite`; `ensure(ContentPlannerProfile): ContentSite`; `scanning(ContentSite): bool`; `payload(?ContentSite): array` (the `GET site` answer); `facts(ContentSite): array`; `page(ContentSitePage, ?array $stats, ContentSite): array`; `stats(list<int>): array<int, array{posts: int, published: int, clicks: int, last_promoted_at: ?string}>`
  - `ScanContentWebsite(int $siteId, string $token, bool $updateSummary, int $userId)` on `ai`; static `fail(int $siteId, string $token, string $code): void`
  - Routes `GET site`, `PUT site`, `POST site/scan`
  - `ContextBuilder::build` gains "## FROM THE BRAND'S WEBSITE (scanned Y-m-d)"; `ContentKnowledgeService::buildForBrand()['organization']['website']` falls back to the site's address.

- [ ] **Step 1: Write the failing tests**

`tests/Feature/Content/SiteEditTest.php`:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentSite;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Reading and editing the website (spec 2026-10-20 §3.1, §6.2). */
class SiteEditTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    public function test_without_a_site_everyone_reads_the_suggested_address(): void
    {
        $this->org->forceFill(['website' => 'https://lumiere.example'])->save();

        $this->asStaffMember()->getJson($this->api('site'))->assertOk()
            ->assertJsonPath('site', null)
            ->assertJsonPath('suggested_url', 'https://lumiere.example')
            ->assertJsonPath('pages', []);
    }

    public function test_a_manager_saves_the_address_and_a_bad_one_is_refused(): void
    {
        $this->asManager()->putJson($this->api('site'), ['url' => ' https://lumiere.example/blog '])->assertOk()
            ->assertJsonPath('site.url', 'https://lumiere.example/blog')
            ->assertJsonPath('site.status', 'new');

        $this->asManager()->putJson($this->api('site'), ['url' => 'http://10.0.0.1/'])
            ->assertStatus(422)->assertJsonPath('error', 'bad_address');
    }

    public function test_an_edited_summary_is_marked_and_an_empty_one_clears_it(): void
    {
        $this->asManager()->putJson($this->api('site'), ['summary' => 'Lumière cuts hair.'])->assertOk()
            ->assertJsonPath('site.summary', 'Lumière cuts hair.')
            ->assertJsonPath('site.summary_edited', true);

        $this->asManager()->putJson($this->api('site'), ['summary' => '  '])->assertOk()
            ->assertJsonPath('site.summary', null)
            ->assertJsonPath('site.summary_edited', false);
    }

    public function test_staff_cannot_edit_and_nothing_changes_while_a_scan_runs(): void
    {
        $this->asStaffMember()->putJson($this->api('site'), ['url' => 'https://lumiere.example'])
            ->assertStatus(403)->assertJsonPath('error', 'manager_only');

        ContentSite::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'url' => 'https://lumiere.example',
            'status' => 'scanning', 'scan_token' => 't', 'scan_queued_at' => now()]);
        $this->asManager()->putJson($this->api('site'), ['summary' => 'x'])
            ->assertStatus(409)->assertJsonPath('error', 'scan_running');
    }
}
```

`tests/Feature/Content/SiteScanEndpointTest.php`:

```php
<?php

namespace Tests\Feature\Content;

use App\Jobs\ScanContentWebsite;
use App\Models\ContentPlannerProfile;
use App\Models\ContentSite;
use App\Models\ContentSitePage;
use App\Services\Content\ContentSiteScan;
use App\Services\Content\ContentSiteSummarizer;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\RateLimiter;
use Tests\Concerns\FakesWebsite;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Starting a scan and its job (spec 2026-10-20 §3.7); the queue is sync in tests, so the scan finishes in the request. */
class SiteScanEndpointTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema, FakesWebsite;

    /** @var list<array> */
    private array $summaries = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        $this->fakeWebsite([
            'https://lumiere.example/' => '<html><head><title>Lumière</title></head><body><main><p>Hair in Riga.</p><a href="/blog/autumn">Autumn</a></main></body></html>',
            'https://lumiere.example/blog/autumn' => '<html><head><title>Autumn colours</title></head><body><article><p>Copper.</p></article></body></html>',
        ]);
        $test = $this;
        $this->app->instance(ContentSiteSummarizer::class, new class($test) extends ContentSiteSummarizer {
            public function __construct(private SiteScanEndpointTest $test)
            {
            }

            public function summarize(ContentPlannerProfile $profile, array $pages): array
            {
                $this->test->record($pages);

                return ['summary' => 'Lumière cuts hair in Riga.', 'brand_summary' => null, 'usp' => null, 'mission' => null];
            }
        });
    }

    public function record(array $pages): void
    {
        $this->summaries[] = $pages;
    }

    private function siteRow(array $attributes = []): ContentSite
    {
        return ContentSite::create($attributes + ['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'url' => 'https://lumiere.example']);
    }

    public function test_a_manager_scans_an_address_and_reads_the_result(): void
    {
        $this->asManager()->postJson($this->api('site/scan'), ['url' => 'https://lumiere.example'])->assertOk()
            ->assertJsonPath('site.status', 'ready')
            ->assertJsonPath('site.articles_count', 1)
            ->assertJsonPath('site.pages_count', 1)
            ->assertJsonPath('site.summary', 'Lumière cuts hair in Riga.')
            ->assertJsonPath('pages.0.kind', 'article')
            ->assertJsonPath('pages.0.title', 'Autumn colours')
            ->assertJsonPath('pages.0.seen', true)
            ->assertJsonPath('pages.0.posts', 0)
            ->assertJsonPath('pages.1.kind', 'page');
        $this->assertCount(1, $this->summaries);
    }

    public function test_staff_cannot_scan_and_a_site_without_an_address_cannot_be_scanned(): void
    {
        $this->asStaffMember()->postJson($this->api('site/scan'), ['url' => 'https://lumiere.example'])->assertStatus(403);
        $this->asManager()->postJson($this->api('site/scan'))->assertStatus(422)->assertJsonPath('error', 'bad_address');
    }

    public function test_one_scan_at_a_time_until_it_is_stale(): void
    {
        $site = $this->siteRow(['status' => 'scanning', 'scan_token' => 'old', 'scan_queued_at' => now()]);
        $this->asManager()->postJson($this->api('site/scan'))->assertStatus(409)->assertJsonPath('error', 'already_scanning');

        $site->forceFill(['scan_queued_at' => now()->subMinutes(31)])->save();
        $this->asManager()->postJson($this->api('site/scan'))->assertOk()->assertJsonPath('site.status', 'ready');
    }

    public function test_a_scan_whose_job_died_reads_as_failed(): void
    {
        $this->siteRow(['status' => 'scanning', 'scan_token' => 't', 'scan_queued_at' => now()->subMinutes(12), 'scan_started_at' => now()->subMinutes(11)]);

        $this->asStaffMember()->getJson($this->api('site'))->assertOk()
            ->assertJsonPath('site.status', 'failed')
            ->assertJsonPath('site.error', 'scan_failed');
    }

    public function test_at_most_twenty_scans_a_day(): void
    {
        for ($i = 0; $i < 20; $i++) {
            RateLimiter::hit('content:site-scan:' . $this->org->id, 86400);
        }
        $this->asManager()->postJson($this->api('site/scan'), ['url' => 'https://lumiere.example'])
            ->assertStatus(429)->assertJsonPath('error', 'too_many_scans');
    }

    public function test_an_edited_summary_is_kept_unless_the_manager_asks_for_a_new_one(): void
    {
        $this->siteRow(['summary' => 'My words.', 'summary_edited' => true]);
        $this->asManager()->postJson($this->api('site/scan'))->assertOk()->assertJsonPath('site.summary', 'My words.');
        $this->assertCount(0, $this->summaries);

        $this->asManager()->postJson($this->api('site/scan'), ['update_summary' => true])->assertOk()
            ->assertJsonPath('site.summary', 'Lumière cuts hair in Riga.')
            ->assertJsonPath('site.summary_edited', false);
    }

    public function test_a_late_job_does_nothing_and_a_killed_job_marks_the_scan_failed(): void
    {
        $site = $this->siteRow(['status' => 'scanning', 'scan_token' => 'new', 'scan_queued_at' => now()]);
        (new ScanContentWebsite($site->id, 'old', true, $this->manager->id))->handle(app(ContentSiteScan::class));
        $this->assertSame(0, ContentSitePage::where('site_id', $site->id)->count());
        $this->assertSame('scanning', $site->fresh()->status);

        (new ScanContentWebsite($site->id, 'new', true, $this->manager->id))->failed(new \RuntimeException('killed'));
        $this->assertSame('failed', $site->fresh()->status);
        $this->assertSame('scan_failed', $site->fresh()->error);
    }

    public function test_the_job_works_for_the_sites_organisation_and_leaves_nothing_bound(): void
    {
        $site = $this->siteRow(['status' => 'scanning', 'scan_token' => 't', 'scan_queued_at' => now()]);
        app()->forgetInstance('current_organization_id');
        app()->forgetInstance('current_brand_id');

        (new ScanContentWebsite($site->id, 't', false, $this->manager->id))->handle(app(ContentSiteScan::class));

        $this->assertFalse(app()->bound('current_organization_id'));
        // Nothing is bound now, so the tenant scope would match nothing: read past it.
        $after = ContentSite::withoutGlobalScopes()->find($site->id);
        $this->assertSame('ready', $after->status);
        $this->assertNotNull($after->scan_started_at);
        $this->assertSame([$this->org->id], ContentSitePage::withoutGlobalScopes()->where('site_id', $site->id)->pluck('organization_id')->map(fn ($id) => (int) $id)->unique()->values()->all());
    }
}
```

`tests/Feature/Content/WebsiteContextTest.php`:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentSite;
use App\Services\ContentKnowledgeService;
use App\Services\ContentPlanner\ContextBuilder;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Every Content AI call reads what the website says (spec 2026-10-20 §3.6). */
class WebsiteContextTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function siteRow(array $attributes): ContentSite
    {
        return ContentSite::create($attributes + ['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'url' => 'https://lumiere.example']);
    }

    public function test_the_context_carries_the_website_summary_with_its_date(): void
    {
        $this->siteRow(['summary' => 'Lumière cuts and colours hair in Riga.', 'summary_updated_at' => '2026-10-04 10:00:00']);

        $this->assertStringContainsString("## FROM THE BRAND'S WEBSITE (scanned 2026-10-04)\nLumière cuts and colours hair in Riga.", app(ContextBuilder::class)->build($this->profile));
    }

    public function test_no_summary_no_section(): void
    {
        $this->siteRow([]);

        $this->assertStringNotContainsString("FROM THE BRAND'S WEBSITE", app(ContextBuilder::class)->build($this->profile));
    }

    public function test_the_readiness_counts_the_sites_address_as_the_company_website(): void
    {
        // The real knowledge service also reads the chat widget's settings; the content schema has no table for them.
        if (!Schema::hasTable('chat_widget_configs')) {
            Schema::create('chat_widget_configs', function (Blueprint $t) {
                $t->id();
                $t->unsignedBigInteger('organization_id')->nullable();
                $t->unsignedBigInteger('brand_id')->nullable();
                $t->boolean('is_active')->default(true);
                $t->string('company_name')->nullable();
                $t->text('welcome_message')->nullable();
                $t->string('header_title')->nullable();
                $t->text('suggestions')->nullable();
                $t->text('canned_responses')->nullable();
                $t->timestamps();
            });
        }
        $this->siteRow([]);
        $knowledge = new ContentKnowledgeService();

        $this->assertSame('https://lumiere.example', $knowledge->buildForBrand($this->org->id, $this->brandId)['organization']['website']);
        $company = collect($knowledge->readinessOf($this->profile)['sections'])->firstWhere('key', 'company');
        $this->assertNotContains('company_website', $company['missing']);
    }
}
```

In `tests/Feature/QueueRetryAfterTest.php`, add to `$jobs` in `test_the_long_ai_jobs_run_on_their_own_queue`:

```php
            new \App\Jobs\ScanContentWebsite(1, 'token', true, 1),
```

- [ ] **Step 2: Run them to see them fail**

Run: `$WS/php.sh tests/Feature/Content/SiteEditTest.php tests/Feature/Content/SiteScanEndpointTest.php tests/Feature/Content/WebsiteContextTest.php tests/Feature/QueueRetryAfterTest.php`
Expected: the first two FAIL with 404s (no route), the third FAIL on the missing section / website, the fourth FAIL — `Class "App\Jobs\ScanContentWebsite" not found`.

- [ ] **Step 3: Write the code**

`app/Services/Content/ContentSites.php`:

```php
<?php

namespace App\Services\Content;

use App\Models\ContentPlannerProfile;
use App\Models\ContentSite;
use App\Models\ContentSitePage;
use App\Models\Organization;
use App\Services\Content\Web\UrlRules;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/** A brand's website as the portal reads it (spec 2026-10-20 §3.7, §4.6, §6.2): its state, its pages and their numbers. */
final class ContentSites
{
    /** A scan may wait this long for the worker… */
    public const QUEUED_SECONDS = 1800;
    /** …and run this long once its job started (its timeout is 600 s). */
    public const RUN_SECONDS = 660;
    public const SCANS_PER_DAY = 20;

    public static function of(int $profileId): ?ContentSite
    {
        return ContentSite::where('planner_profile_id', $profileId)->first();
    }

    public static function ensure(ContentPlannerProfile $profile): ContentSite
    {
        return self::of((int) $profile->id) ?? ContentSite::createOrFirst(
            ['planner_profile_id' => $profile->id],
            ['organization_id' => $profile->organization_id, 'brand_id' => $profile->brand_id],
        );
    }

    /** Is its scan still running: queued for at most QUEUED_SECONDS, or started at most RUN_SECONDS ago. */
    public static function scanning(ContentSite $site): bool
    {
        if ($site->status !== 'scanning') {
            return false;
        }
        if ($site->scan_started_at !== null) {
            return $site->scan_started_at->copy()->addSeconds(self::RUN_SECONDS)->isFuture();
        }

        return $site->scan_queued_at !== null && $site->scan_queued_at->copy()->addSeconds(self::QUEUED_SECONDS)->isFuture();
    }

    /** `GET site`: the site, the suggested address, its pages (articles newest first, then pages by rank). */
    public static function payload(?ContentSite $site): array
    {
        $suggested = Organization::find(ContentContext::orgId())?->website;
        if ($site === null) {
            return ['site' => null, 'suggested_url' => $suggested ?: null, 'pages' => []];
        }
        $pages = ContentSitePage::where('site_id', $site->id)->get()->sort(function (ContentSitePage $a, ContentSitePage $b) {
            if ($a->kind !== $b->kind) {
                return $a->kind === 'article' ? -1 : 1;
            }
            if ($a->kind === 'article') {
                return [$b->published_at?->getTimestamp() ?? PHP_INT_MIN, $a->id] <=> [$a->published_at?->getTimestamp() ?? PHP_INT_MIN, $b->id];
            }

            return [UrlRules::pageRank($a->url), strlen($a->url), $a->id] <=> [UrlRules::pageRank($b->url), strlen($b->url), $b->id];
        })->values();
        $stats = self::stats($pages->pluck('id')->map(fn ($id) => (int) $id)->all());

        return [
            'site'          => self::facts($site),
            'suggested_url' => $suggested ?: null,
            'pages'         => $pages->map(fn (ContentSitePage $page) => self::page($page, $stats[(int) $page->id] ?? null, $site))->all(),
        ];
    }

    /** The site as the portal shows it; a scan that lost its job reads as failed. */
    public static function facts(ContentSite $site): array
    {
        $lost = $site->status === 'scanning' && !self::scanning($site);

        return [
            'url'                => $site->url,
            'status'             => $lost ? 'failed' : (string) $site->status,
            'error'              => $lost ? 'scan_failed' : $site->error,
            'scanned_at'         => $site->scanned_at?->toISOString(),
            'articles_count'     => (int) $site->articles_count,
            'pages_count'        => (int) $site->pages_count,
            'summary'            => $site->summary,
            'summary_updated_at' => $site->summary_updated_at?->toISOString(),
            'summary_edited'     => (bool) $site->summary_edited,
            'summary_note'       => $site->summary_note,
        ];
    }

    /** @param array{posts: int, published: int, clicks: int, last_promoted_at: ?string}|null $stats */
    public static function page(ContentSitePage $page, ?array $stats, ContentSite $site): array
    {
        return [
            'id'               => (int) $page->id,
            'kind'             => (string) $page->kind,
            'url'              => (string) $page->url,
            'title'            => (string) $page->title,
            'description'      => $page->description,
            'image_url'        => $page->picture_url ?? $page->image_url,
            'published_at'     => $page->published_at?->toISOString(),
            'seen'             => $site->scanned_at === null || ($page->last_seen_at !== null && $page->last_seen_at->gte($site->scanned_at)),
            'posts'            => $stats['posts'] ?? 0,
            'published'        => $stats['published'] ?? 0,
            'clicks'           => $stats['clicks'] ?? 0,
            'last_promoted_at' => $stats['last_promoted_at'] ?? null,
        ];
    }

    /**
     * Each page's promotion posts (not archived), how many are published, their links' clicks, the newest one's date.
     *
     * @param list<int> $ids
     * @return array<int, array{posts: int, published: int, clicks: int, last_promoted_at: ?string}>
     */
    public static function stats(array $ids): array
    {
        if ($ids === []) {
            return [];
        }
        $out = [];
        $blank = ['posts' => 0, 'published' => 0, 'clicks' => 0, 'last_promoted_at' => null];
        $rows = DB::table('content_planner_posts')->whereIn('site_page_id', $ids)->where('status', '!=', 'archived')
            ->groupBy('site_page_id')
            ->selectRaw("site_page_id, count(*) as posts, sum(case when status = 'published' then 1 else 0 end) as published, max(created_at) as last_at")
            ->get();
        foreach ($rows as $row) {
            $out[(int) $row->site_page_id] = [
                'posts'            => (int) $row->posts,
                'published'        => (int) $row->published,
                'clicks'           => 0,
                'last_promoted_at' => $row->last_at ? CarbonImmutable::parse($row->last_at)->toISOString() : null,
            ];
        }
        $clicks = DB::table('content_link_clicks')
            ->join('content_links', 'content_links.id', '=', 'content_link_clicks.link_id')
            ->join('content_planner_posts', 'content_planner_posts.id', '=', 'content_links.post_id')
            ->whereIn('content_planner_posts.site_page_id', $ids)
            ->groupBy('content_planner_posts.site_page_id')
            ->selectRaw('content_planner_posts.site_page_id as page_id, sum(content_link_clicks.clicks) as clicks')
            ->get();
        foreach ($clicks as $row) {
            $out[(int) $row->page_id] ??= $blank;
            $out[(int) $row->page_id]['clicks'] = (int) $row->clicks;
        }

        return $out;
    }
}
```

`app/Jobs/ScanContentWebsite.php`:

```php
<?php

namespace App\Jobs;

use App\Models\ContentSite;
use App\Models\User;
use App\Services\Content\ContentSites;
use App\Services\Content\ContentSiteScan;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Auth;

/**
 * A website scan on the `ai` queue (spec 2026-10-20 §3.7): reading a site takes minutes. It runs only while its token is
 * the site's scan and the scan has not been called lost, for the site's organisation and brand, as the manager who
 * pressed Scan (the summary's AI usage is theirs), and leaves nothing bound.
 */
class ScanContentWebsite implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** A scan is a long read and one AI call: never tried twice on its own. */
    public int $tries = 1;

    /** Under ContentSites::RUN_SECONDS and every queue connection's retry_after (660 s). */
    public int $timeout = 600;

    public function __construct(public int $siteId, public string $token, public bool $updateSummary, public int $userId)
    {
        $this->onQueue('ai');
    }

    public function handle(ContentSiteScan $scan): void
    {
        $site = ContentSite::withoutGlobalScopes()->find($this->siteId);
        if ($site === null || $site->scan_token !== $this->token || !ContentSites::scanning($site)) {
            return;
        }
        $priorOrg = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        $priorBrand = app()->bound('current_brand_id') ? app('current_brand_id') : null;
        app()->instance('current_organization_id', (int) $site->organization_id);
        app()->instance('current_brand_id', (int) $site->brand_id);
        try {
            if ($user = User::find($this->userId)) {
                Auth::setUser($user);
            }
            ContentSite::withoutGlobalScopes()->whereKey($site->id)->where('scan_token', $this->token)->update(['scan_started_at' => now()]);
            $scan->run($site->fresh(), $this->token, $this->updateSummary);
        } catch (\Throwable $e) {
            report($e);
            self::fail($this->siteId, $this->token, 'scan_failed');
        } finally {
            Auth::forgetGuards();
            $priorOrg === null ? app()->forgetInstance('current_organization_id') : app()->instance('current_organization_id', $priorOrg);
            $priorBrand === null ? app()->forgetInstance('current_brand_id') : app()->instance('current_brand_id', $priorBrand);
        }
    }

    /** Killed by the worker (its timeout) before handle() could say so. */
    public function failed(?\Throwable $e): void
    {
        self::fail($this->siteId, $this->token, 'scan_failed');
    }

    public static function fail(int $siteId, string $token, string $code): void
    {
        ContentSite::withoutGlobalScopes()->whereKey($siteId)->where('scan_token', $token)->where('status', 'scanning')
            ->update(['status' => 'failed', 'error' => $code]);
    }
}
```

`app/Http/Controllers/Api/V1/Admin/Content/SiteController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Jobs\ScanContentWebsite;
use App\Models\ContentSite;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentSites;
use App\Services\Content\Web\PublicAddress;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

/**
 * The brand's website (spec 2026-10-20 §3, §6.2): everyone reads it and its pages; managers save the address and the
 * company summary, and start a scan (a queued job, a minute or two). One scan at a time per brand.
 */
class SiteController extends Controller
{
    public function show(): JsonResponse
    {
        $profile = ContentContext::profile();

        return response()->json(ContentSites::payload($profile ? ContentSites::of((int) $profile->id) : null));
    }

    public function update(Request $request): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $data = $request->validate([
            'url'     => 'sometimes|nullable|string|max:2000',
            'summary' => 'sometimes|nullable|string|max:6000',
        ]);
        $site = ContentSites::ensure(ContentContext::requireProfile());
        DB::transaction(function () use ($site, $data) {
            $site = ContentSite::whereKey($site->id)->lockForUpdate()->firstOrFail();
            if (ContentSites::scanning($site)) {
                throw self::scanRunning();
            }
            $fields = [];
            if (array_key_exists('url', $data)) {
                $fields['url'] = trim((string) $data['url']) === '' ? null : (PublicAddress::clean($data['url']) ?? throw self::badAddress());
            }
            if (array_key_exists('summary', $data)) {
                $text = trim((string) $data['summary']);
                $fields += ['summary' => $text === '' ? null : $text, 'summary_edited' => $text !== '', 'summary_updated_at' => now(), 'summary_note' => null];
            }
            $site->update($fields);
        });

        return response()->json(ContentSites::payload($site->fresh()));
    }

    public function scan(Request $request): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $data = $request->validate([
            'url'            => 'sometimes|nullable|string|max:2000',
            'update_summary' => 'sometimes|boolean',
        ]);
        $org = $request->attributes->get('workspace_org');
        $site = ContentSites::ensure(ContentContext::requireProfile());
        $limit = 'content:site-scan:' . $org->id;
        [$token, $update] = DB::transaction(function () use ($site, $data, $limit) {
            $site = ContentSite::whereKey($site->id)->lockForUpdate()->firstOrFail();
            if (ContentSites::scanning($site)) {
                throw new ContentRefused('already_scanning', 'The website is already being read.', 409);
            }
            $url = trim((string) ($data['url'] ?? '')) !== '' ? (PublicAddress::clean($data['url']) ?? throw self::badAddress()) : $site->url;
            if ($url === null) {
                throw self::badAddress();
            }
            if (RateLimiter::tooManyAttempts($limit, ContentSites::SCANS_PER_DAY)) {
                throw new ContentRefused('too_many_scans', 'A website can be read at most ' . ContentSites::SCANS_PER_DAY . ' times a day. Try again tomorrow.', 429);
            }
            RateLimiter::hit($limit, 86400);
            $token = (string) Str::uuid();
            $update = array_key_exists('update_summary', $data) ? (bool) $data['update_summary'] : !$site->summary_edited;
            $site->update(['url' => $url, 'status' => 'scanning', 'error' => null, 'scan_token' => $token, 'scan_queued_at' => now(), 'scan_started_at' => null]);

            return [$token, $update];
        });
        try {
            ScanContentWebsite::dispatch((int) $site->id, $token, $update, (int) $request->user()->id);
        } catch (\Throwable $e) {
            report($e);
            ScanContentWebsite::fail((int) $site->id, $token, 'scan_failed');
            throw new ContentRefused('scan_failed', 'The website could not be read. Please try again.', 500);
        }
        $site = $site->fresh();

        return response()->json(ContentSites::payload($site), ContentSites::scanning($site) ? 202 : 200);
    }

    private static function badAddress(): ContentRefused
    {
        return new ContentRefused('bad_address', 'Enter the website address, starting with https:// — a public site, not a private network.', 422);
    }

    private static function scanRunning(): ContentRefused
    {
        return new ContentRefused('scan_running', 'The website is being read. Try again when it is done.', 409);
    }
}
```

In `routes/api.php`, inside the Content group after the `bio` routes:

```php
                // Release 6 (spec 2026-10-20 §6.2): the brand's website, its scan and its pages.
                Route::get('site', [\App\Http\Controllers\Api\V1\Admin\Content\SiteController::class, 'show']);
                Route::put('site', [\App\Http\Controllers\Api\V1\Admin\Content\SiteController::class, 'update']);
                Route::post('site/scan', [\App\Http\Controllers\Api\V1\Admin\Content\SiteController::class, 'scan']);
```

In `app/Services/ContentPlanner/ContextBuilder.php`: add `use App\Models\ContentSite;`, put `$this->websiteSection($profile),` right after `$this->brandProfileSection($profile),` in `build()`, and add:

```php
    /** What the brand's own website says (spec 2026-10-20 §3.6): the company summary of its last scan, or the manager's. */
    private function websiteSection(ContentPlannerProfile $profile): ?string
    {
        $site = ContentSite::withoutGlobalScopes()->where('planner_profile_id', $profile->id)->first(['summary', 'summary_updated_at', 'scanned_at']);
        $summary = trim((string) $site?->summary);
        if ($summary === '') {
            return null;
        }
        $date = ($site->summary_updated_at ?? $site->scanned_at)?->format('Y-m-d');

        return "## FROM THE BRAND'S WEBSITE" . ($date ? " (scanned {$date})" : '') . "\n" . mb_substr($summary, 0, 6000);
    }
```

In `app/Services/ContentKnowledgeService.php`: add `use App\Models\ContentSite;`; in `buildForBrand()`, after `$org = Organization::find($orgId);`:

```php
        // The address Content scans counts as the company website when the organisation has none (spec 2026-10-20 §3.6).
        $website = $org?->website ?: ContentSite::withoutGlobalScopes()->where('brand_id', $brandId)->value('url');
```

use `'website' => $website,` in the `organization` array, and pass it on: `'missing_fields' => $this->detectMissingFields($faq, $chatbot, $services, $org, $website),`. Change `detectMissingFields` to `private function detectMissingFields($faq, $chatbot, $services, $org, ?string $website = null): array` and its website check to `if (!$website) {`. In `scoreCompany`, nothing changes (it reads `$knowledge['organization']['website']`).

- [ ] **Step 4: Run them to see them pass**

Run: `$WS/php.sh tests/Feature/Content/SiteEditTest.php tests/Feature/Content/SiteScanEndpointTest.php tests/Feature/Content/WebsiteContextTest.php tests/Feature/QueueRetryAfterTest.php`
Expected: `Tests: 4 passed`, `Tests: 8 passed`, `Tests: 3 passed`, `Tests: 4 passed`.

- [ ] **Step 5: Commit**

```bash
git add app/Services/Content/ContentSites.php app/Jobs/ScanContentWebsite.php app/Http/Controllers/Api/V1/Admin/Content/SiteController.php routes/api.php app/Services/ContentPlanner/ContextBuilder.php app/Services/ContentKnowledgeService.php tests/Feature/Content/SiteEditTest.php tests/Feature/Content/SiteScanEndpointTest.php tests/Feature/Content/WebsiteContextTest.php tests/Feature/QueueRetryAfterTest.php
git commit -m "Content website: read and edit it, scan it on the ai queue, and every AI call reads its summary"
```

---

### Task 7: Spreading a promotion's posts

**Files:**
- Create: `app/Services/Content/PromotionSchedule.php`
- Test: `tests/Unit/Content/PromotionScheduleTest.php`

**Interfaces:**
- Produces: `PromotionSchedule::plan(array $pages, int $perPage, array $channels, string $from, string $to, int $perWeek, array $taken = []): array{wanted: int, fit: int, posts: list<array{page: int, round: int, date: string, time: ?string, platform: string}>}` — `$channels`: `list<array{platform: string, days: list<string> (mon…sun; [] = every day), time: ?string}>` in the ticked order; `$taken`: `"Y-m-d|platform" => true`; posts sorted by day, then the ticked order.

- [ ] **Step 1: Write the failing test**

`tests/Unit/Content/PromotionScheduleTest.php`:

```php
<?php

namespace Tests\Unit\Content;

use App\Services\Content\PromotionSchedule;
use PHPUnit\Framework\TestCase;

/** Spreading a promotion's posts (spec 2026-10-20 §4.3). Monday 5 October 2026 starts the weeks below. */
class PromotionScheduleTest extends TestCase
{
    private const EVERY_DAY = [];

    private static function channel(string $platform, array $days = self::EVERY_DAY, ?string $time = null): array
    {
        return ['platform' => $platform, 'days' => $days, 'time' => $time];
    }

    public function test_channels_take_turns_even_on_different_weekdays(): void
    {
        $plan = PromotionSchedule::plan([1, 2], 3, [self::channel('instagram', ['mon', 'wed', 'fri']), self::channel('linkedin', ['tue', 'thu'])], '2026-10-05', '2026-10-18', 3);

        $this->assertSame(6, $plan['wanted']);
        $this->assertSame(6, $plan['fit']);
        foreach ([1, 2] as $page) {
            $platforms = array_column(array_filter($plan['posts'], fn ($post) => $post['page'] === $page), 'platform');
            $this->assertCount(3, $platforms);
            $this->assertContains('instagram', $platforms, "page {$page}");
            $this->assertContains('linkedin', $platforms, "page {$page}");
        }
        $weeks = array_count_values(array_map(fn ($post) => date('o-W', strtotime($post['date'])), $plan['posts']));
        $this->assertSame([3, 3], array_values($weeks));
        foreach ($plan['posts'] as $post) {
            $weekday = strtolower(date('D', strtotime($post['date'])));
            $this->assertContains($weekday, $post['platform'] === 'instagram' ? ['mon', 'wed', 'fri'] : ['tue', 'thu']);
        }
    }

    public function test_posts_are_spaced_evenly_over_the_whole_period(): void
    {
        $plan = PromotionSchedule::plan([1], 4, [self::channel('facebook')], '2026-10-05', '2026-11-29', 3);

        $this->assertSame(['2026-10-12', '2026-10-26', '2026-11-09', '2026-11-23'], array_column($plan['posts'], 'date'));
    }

    public function test_the_pace_limits_how_many_fit(): void
    {
        $plan = PromotionSchedule::plan([1], 10, [self::channel('facebook')], '2026-10-05', '2026-10-18', 3);

        $this->assertSame(10, $plan['wanted']);
        $this->assertSame(6, $plan['fit']);
        $this->assertCount(6, $plan['posts']);
    }

    public function test_never_two_posts_on_one_channel_on_one_day(): void
    {
        $plan = PromotionSchedule::plan([1], 10, [self::channel('instagram'), self::channel('facebook')], '2026-10-05', '2026-10-11', 21);

        $this->assertSame(10, $plan['fit']);
        $keys = array_map(fn ($post) => $post['date'] . '|' . $post['platform'], $plan['posts']);
        $this->assertSame($keys, array_values(array_unique($keys)));
    }

    public function test_no_page_twice_on_a_day_while_another_page_can_take_the_place(): void
    {
        $plan = PromotionSchedule::plan([1, 2], 7, [self::channel('instagram'), self::channel('facebook')], '2026-10-05', '2026-10-11', 14);

        $this->assertSame(14, $plan['fit']);
        $byDay = [];
        foreach ($plan['posts'] as $post) {
            $byDay[$post['date']][] = $post['page'];
        }
        $this->assertCount(7, $byDay);
        foreach ($byDay as $day => $pages) {
            $this->assertEqualsCanonicalizing([1, 2], $pages, $day);
        }
    }

    public function test_pages_come_round_by_round_and_times_are_the_channels(): void
    {
        $plan = PromotionSchedule::plan([10, 20, 30], 2, [self::channel('facebook', self::EVERY_DAY, '18:00')], '2026-10-05', '2026-10-10', 7);

        $this->assertSame([10, 20, 30, 10, 20, 30], array_column($plan['posts'], 'page'));
        $this->assertSame([0, 0, 0, 1, 1, 1], array_column($plan['posts'], 'round'));
        $this->assertSame(['18:00'], array_values(array_unique(array_column($plan['posts'], 'time'))));
    }

    public function test_a_channel_without_days_posts_on_sundays_too(): void
    {
        $plan = PromotionSchedule::plan([1], 1, [self::channel('facebook')], '2026-10-11', '2026-10-11', 3);

        $this->assertSame([['page' => 1, 'round' => 0, 'date' => '2026-10-11', 'time' => null, 'platform' => 'facebook']], $plan['posts']);
    }

    public function test_nothing_fits_without_channels_or_days(): void
    {
        $this->assertSame(['wanted' => 2, 'fit' => 0, 'posts' => []], PromotionSchedule::plan([1, 2], 1, [], '2026-10-05', '2026-10-11', 3));
        $this->assertSame(0, PromotionSchedule::plan([1], 1, [self::channel('facebook')], '2026-10-12', '2026-10-05', 3)['fit']);
    }

    public function test_off_turn_it_prefers_a_channel_without_another_post_that_day(): void
    {
        $plan = PromotionSchedule::plan([1], 1, [self::channel('linkedin', ['sun']), self::channel('instagram'), self::channel('facebook')],
            '2026-10-05', '2026-10-07', 3, ['2026-10-06|instagram' => true]);

        $this->assertSame([['page' => 1, 'round' => 0, 'date' => '2026-10-06', 'time' => null, 'platform' => 'facebook']], $plan['posts']);
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `$WS/php.sh tests/Unit/Content/PromotionScheduleTest.php`
Expected: FAIL — `Class "App\Services\Content\PromotionSchedule" not found`.

- [ ] **Step 3: Write the code**

`app/Services/Content/PromotionSchedule.php`:

```php
<?php

namespace App\Services\Content;

use Carbon\CarbonImmutable;

/**
 * Spreading a promotion's posts (spec 2026-10-20 §4.3). Round by round over the pages; a slot is a day a ticked channel
 * posts on, holding one post; each ISO week holds at most the pace. Each post takes the free slot nearest its ideal day
 * (the posts spaced evenly over the whole period), scoring 2 days against a channel that is not its turn's, 1 against a
 * day this promotion already uses and ½ against a channel the brand already posts on that day; the same page goes twice
 * on one day only when nothing else is free; ties go to the earlier day, then the ticked order. Pure.
 */
final class PromotionSchedule
{
    private const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    /**
     * @param list<int> $pages
     * @param list<array{platform: string, days: list<string>, time: ?string}> $channels
     * @param array<string, true> $taken
     * @return array{wanted: int, fit: int, posts: list<array{page: int, round: int, date: string, time: ?string, platform: string}>}
     */
    public static function plan(array $pages, int $perPage, array $channels, string $from, string $to, int $perWeek, array $taken = []): array
    {
        $wanted = count($pages) * max(0, $perPage);
        $slots = [];
        $days = 0;
        if ($channels !== [] && $from <= $to) {
            for ($day = CarbonImmutable::parse($from); $day->format('Y-m-d') <= $to; $day = $day->addDay()) {
                $weekday = self::WEEKDAYS[$day->dayOfWeekIso - 1];
                foreach ($channels as $channel) {
                    if ($channel['days'] === [] || in_array($weekday, $channel['days'], true)) {
                        $slots[] = ['date' => $day->format('Y-m-d'), 'platform' => $channel['platform'], 'week' => $day->format('o-W'), 'day' => $days];
                    }
                }
                $days++;
            }
        }
        $room = [];
        foreach ($slots as $slot) {
            $room[$slot['week']] = ($room[$slot['week']] ?? 0) + 1;
        }
        $capacity = 0;
        foreach ($room as $week => $count) {
            $room[$week] = min($perWeek, $count);
            $capacity += $room[$week];
        }
        $fit = min($wanted, $capacity);

        $queue = [];
        for ($round = 0; $round < $perPage; $round++) {
            foreach (array_values($pages) as $index => $page) {
                $queue[] = ['page' => (int) $page, 'index' => $index, 'round' => $round];
            }
        }
        $order = array_column($channels, 'platform');
        $times = [];
        foreach ($channels as $channel) {
            $times[$channel['platform']] ??= $channel['time'];
        }

        $used = [];
        $inWeek = [];
        $onDay = [];
        $pageOnDay = [];
        $posts = [];
        for ($k = 0; $k < $fit; $k++) {
            $item = $queue[$k];
            $ideal = (int) floor(($k + 0.5) * $days / $fit);
            $turn = $order[($item['index'] + $item['round']) % count($order)];
            $best = null;
            $bestScore = INF;
            $fallback = null;
            $fallbackScore = INF;
            foreach ($slots as $i => $slot) {
                $key = $slot['date'] . '|' . $slot['platform'];
                if (isset($used[$key]) || ($inWeek[$slot['week']] ?? 0) >= $room[$slot['week']]) {
                    continue;
                }
                $score = abs($slot['day'] - $ideal)
                    + ($slot['platform'] === $turn ? 0 : 2)
                    + (isset($onDay[$slot['date']]) ? 1 : 0)
                    + (isset($taken[$key]) ? 0.5 : 0);
                if (isset($pageOnDay[$item['page'] . '|' . $slot['date']])) {
                    if ($score < $fallbackScore) {
                        $fallbackScore = $score;
                        $fallback = $i;
                    }
                    continue;
                }
                if ($score < $bestScore) {
                    $bestScore = $score;
                    $best = $i;
                }
            }
            $chosen = $best ?? $fallback;
            if ($chosen === null) {
                break;
            }
            $slot = $slots[$chosen];
            $used[$slot['date'] . '|' . $slot['platform']] = true;
            $inWeek[$slot['week']] = ($inWeek[$slot['week']] ?? 0) + 1;
            $onDay[$slot['date']] = true;
            $pageOnDay[$item['page'] . '|' . $slot['date']] = true;
            $posts[] = ['page' => $item['page'], 'round' => $item['round'], 'date' => $slot['date'], 'time' => $times[$slot['platform']] ?? null, 'platform' => $slot['platform']];
        }
        usort($posts, fn (array $a, array $b) => [$a['date'], array_search($a['platform'], $order, true)] <=> [$b['date'], array_search($b['platform'], $order, true)]);

        return ['wanted' => $wanted, 'fit' => count($posts), 'posts' => $posts];
    }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `$WS/php.sh tests/Unit/Content/PromotionScheduleTest.php`
Expected: `Tests: 9 passed`.

- [ ] **Step 5: Commit**

```bash
git add app/Services/Content/PromotionSchedule.php tests/Unit/Content/PromotionScheduleTest.php
git commit -m "Content promotions: spread the posts evenly, channels taking turns, within the weekly pace"
```

---

### Task 8: Writing one page's posts

**Files:**
- Create: `app/Services/Content/PromotionWriter.php`, `app/Services/Content/ContentPromotionPosts.php`
- Modify: `app/Services/Content/ContentPlatformRules.php` (`NO_LINKS`), `app/Services/Content/ContentLinks.php` (`tagsFor`: the page's campaign)
- Test: `tests/Unit/Content/PromotionWriterTest.php`, `tests/Feature/Content/PromotionPostsTest.php`

**Interfaces:**
- Consumes: `ContentSitePage::campaignName()` (Task 1), `WebFetcher`, `PageReader` (Tasks 3–4), `ContentLinks::set/ofPost/shortUrl`, `MediaService::putRaw`, `PostController::ATTEMPTS`.
- Produces:
  - `ContentPlatformRules::NO_LINKS = ['instagram', 'tiktok']`
  - `PromotionWriter` (not final): `ANGLES`, `POST_TYPES`, `TEXT_CHARS = 8000`; `write(ContentPlannerProfile $profile, array $page, array $slots, array $earlierHooks, ?string $instructions): list<array|null>`; static `prompt(array $page, array $slots, string $language, string $context, array $earlierHooks, ?string $instructions): string`, `posts(array $data, array $slots): list<array|null>` — `$page`: `{url, title, description, published_at, text}`; `$slots`: `list<{platform, date, time?}>`; each answer `{platform, angle, topic, hook, main_copy, short_copy, cta, hashtags, post_type, visual_idea}` or null
  - `ContentPromotionPosts::write(ContentPromotion $row): void` — the row must be `writing`; ends it `done` (`posts_made`, `ai_incomplete` when short) or `failed` (`ai_failed`, `page_gone`)
  - `ContentLinks::tagsFor()` → `utm_campaign` = the campaign's name, else the page's `promote-…`, else `content-plan`

- [ ] **Step 1: Write the failing tests**

`tests/Unit/Content/PromotionWriterTest.php`:

```php
<?php

namespace Tests\Unit\Content;

use App\Services\Content\ContentPlatformRules;
use App\Services\Content\PromotionWriter;
use PHPUnit\Framework\TestCase;

/** One page's promotion posts: the request and the answer (spec 2026-10-20 §4.4), without the AI. */
class PromotionWriterTest extends TestCase
{
    private const PAGE = ['url' => 'https://lumiere.example/blog/autumn', 'title' => 'Autumn colours', 'description' => 'Three warm tones.', 'published_at' => '2026-09-01', 'text' => 'Copper suits warm skin.'];
    private const SLOTS = [['platform' => 'linkedin', 'date' => '2026-10-06'], ['platform' => 'instagram', 'date' => '2026-10-07'], ['platform' => 'linkedin', 'date' => '2026-10-13']];

    public function test_the_request_names_the_slots_rules_page_language_and_angles(): void
    {
        $prompt = PromotionWriter::prompt(self::PAGE, self::SLOTS, 'de', 'A salon in Riga.', ['Old hook'], 'Mention the offer.');

        $this->assertStringContainsString('Write 3 posts', $prompt);
        $this->assertStringContainsString('"de"', $prompt);
        $this->assertStringContainsString("1. linkedin — 2026-10-06\n2. instagram — 2026-10-07\n3. linkedin — 2026-10-13", $prompt);
        $this->assertSame(1, substr_count($prompt, ContentPlatformRules::for('linkedin')));
        $this->assertStringContainsString(ContentPlatformRules::for('instagram') . ' Links cannot be clicked here', $prompt);
        $this->assertStringContainsString('Do not write the web address', $prompt);
        $this->assertStringContainsString("Address: https://lumiere.example/blog/autumn\nTitle: Autumn colours", $prompt);
        $this->assertStringContainsString('Copper suits warm skin.', $prompt);
        $this->assertStringContainsString("## HOOKS ALREADY USED FOR THIS PAGE (do not repeat them)\n- Old hook", $prompt);
        $this->assertStringContainsString("## EXTRA INSTRUCTIONS FROM THE USER\nMention the offer.", $prompt);
        $this->assertStringContainsString('myth vs fact', $prompt);
        $this->assertStringContainsString('A salon in Riga.', $prompt);
    }

    public function test_without_earlier_hooks_or_instructions_their_sections_are_left_out_and_long_text_is_cut(): void
    {
        $prompt = PromotionWriter::prompt(['text' => str_repeat('x', 9000)] + self::PAGE, self::SLOTS, 'en', '', [], null);

        $this->assertStringNotContainsString('HOOKS ALREADY USED', $prompt);
        $this->assertStringNotContainsString('EXTRA INSTRUCTIONS', $prompt);
        $this->assertStringContainsString(str_repeat('x', PromotionWriter::TEXT_CHARS) . "\n", $prompt);
        $this->assertStringNotContainsString(str_repeat('x', PromotionWriter::TEXT_CHARS + 1), $prompt);
    }

    public function test_each_slot_takes_its_answer_cut_to_the_columns(): void
    {
        $posts = PromotionWriter::posts(['posts' => [
            ['platform' => 'x', 'angle' => 'question', 'topic' => 'T', 'hook' => str_repeat('h', 600), 'main_copy' => ' Copy ', 'cta' => 'Read', 'hashtags' => ['#a', ' ', ['x'], '#b'], 'post_type' => 'how_to', 'visual_idea' => 'V'],
            ['hook' => null, 'main_copy' => ''],
        ]], self::SLOTS);

        $this->assertCount(3, $posts);
        $this->assertSame('linkedin', $posts[0]['platform']);
        $this->assertSame(500, mb_strlen($posts[0]['hook']));
        $this->assertSame('Copy', $posts[0]['main_copy']);
        $this->assertSame(['#a', '#b'], $posts[0]['hashtags']);
        $this->assertSame('how_to', $posts[0]['post_type']);
        $this->assertNull($posts[1]);
        $this->assertNull($posts[2]);
    }

    public function test_a_post_type_outside_the_list_is_dropped_and_a_hook_alone_is_enough(): void
    {
        $posts = PromotionWriter::posts(['posts' => [['hook' => 'Only a hook', 'post_type' => 'meme']]], [self::SLOTS[0]]);

        $this->assertSame('Only a hook', $posts[0]['hook']);
        $this->assertNull($posts[0]['main_copy']);
        $this->assertNull($posts[0]['post_type']);
        $this->assertSame([null], PromotionWriter::posts(['nothing' => true], [self::SLOTS[0]]));
    }
}
```

`tests/Feature/Content/PromotionPostsTest.php`:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentLink;
use App\Models\ContentPlannerCampaign;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Models\ContentPromotion;
use App\Models\ContentSite;
use App\Models\ContentSitePage;
use App\Services\Content\ContentLinks;
use App\Services\Content\ContentPromotionPosts;
use App\Services\Content\PromotionWriter;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Tests\Concerns\FakesWebsite;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Writing one page's promotion posts (spec 2026-10-20 §4.4): the AI replaced, the page and its picture faked. */
class PromotionPostsTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema, FakesWebsite;

    private const URL = 'https://lumiere.example/blog/autumn-colours';
    private const IMAGE = 'https://lumiere.example/a.png';

    private ContentSitePage $page;
    /** @var list<array> */
    public array $calls = [];
    /** @var (\Closure(array, array): list<array|null>)|null */
    public ?\Closure $answer = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        config(['filesystems.media_disk' => 'public']);
        Storage::fake('public');
        $site = ContentSite::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'url' => 'https://lumiere.example', 'status' => 'ready']);
        $this->page = ContentSitePage::create(['site_id' => $site->id, 'brand_id' => $this->brandId, 'url' => self::URL, 'url_hash' => hash('sha256', self::URL),
            'kind' => 'article', 'title' => 'Autumn colours', 'description' => 'Three warm tones.', 'image_url' => self::IMAGE, 'body' => 'Kept text.']);
        $this->fakeWebsite([
            self::URL => '<html><head><title>Autumn colours</title></head><body><article><p>Fresh text.</p></article></body></html>',
            self::IMAGE => [self::pngBytes()],
        ]);
        $test = $this;
        $this->app->instance(PromotionWriter::class, new class($test) extends PromotionWriter {
            public function __construct(private PromotionPostsTest $test)
            {
            }

            public function write(ContentPlannerProfile $profile, array $page, array $slots, array $earlierHooks, ?string $instructions): array
            {
                $this->test->calls[] = compact('page', 'slots', 'earlierHooks', 'instructions');
                if ($this->test->answer !== null) {
                    return ($this->test->answer)($page, $slots);
                }

                return array_map(fn (array $slot) => ['platform' => $slot['platform'], 'angle' => 'question', 'topic' => 'Warm tones',
                    'hook' => 'Hook ' . $slot['date'], 'main_copy' => 'Copy.', 'short_copy' => null, 'cta' => 'Read more',
                    'hashtags' => ['#hair'], 'post_type' => 'how_to', 'visual_idea' => 'A warm still life.'], $slots);
            }
        });
    }

    private function row(array $attributes = []): ContentPromotion
    {
        return ContentPromotion::create($attributes + [
            'planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'site_page_id' => $this->page->id, 'batch' => 'b-1',
            'status' => 'writing', 'started_at' => now(), 'posts_wanted' => 2, 'created_by' => $this->manager->id, 'instructions' => 'Mention the offer.',
            'slots' => [['platform' => 'linkedin', 'date' => '2026-10-06', 'time' => '09:00'], ['platform' => 'instagram', 'date' => '2026-10-07', 'time' => '18:00']],
        ]);
    }

    private function write(ContentPromotion $row): ContentPromotion
    {
        app(ContentPromotionPosts::class)->write($row);

        return $row->fresh();
    }

    public function test_each_slot_becomes_a_draft_that_promotes_the_page(): void
    {
        $row = $this->write($this->row());

        $this->assertSame('done', $row->status);
        $this->assertSame(2, $row->posts_made);
        $this->assertNull($row->error);
        $this->assertNotNull($row->finished_at);
        $posts = ContentPlannerPost::where('site_page_id', $this->page->id)->orderBy('scheduled_date')->get();
        $this->assertSame(['linkedin', 'instagram'], $posts->pluck('platform')->all());
        $first = $posts[0];
        $this->assertSame('2026-10-06', $first->scheduled_date->format('Y-m-d'));
        $this->assertSame('09:00', substr((string) $first->scheduled_time, 0, 5));
        $this->assertSame('draft', $first->status);
        $this->assertSame('promotion', $first->generated_by);
        $this->assertSame($this->manager->id, (int) $first->created_by);
        $this->assertSame('Promote: Autumn colours', $first->goal);
        $this->assertSame('Promotes ' . self::URL . ' — question', $first->strategic_reason);
        $this->assertSame(['kind' => 'promotion', 'page_id' => $this->page->id, 'angle' => 'question'], $first->source_context);
        $this->assertSame('consideration', $first->funnel_stage);
        $this->assertSame('how_to', $first->post_type);
        $this->assertSame(['#hair'], $first->hashtags);
        $this->assertSame('en', $first->language);
        $this->assertSame('Warm tones', $first->topic);
    }

    public function test_each_post_has_its_own_tracked_link_and_link_friendly_text_carries_it(): void
    {
        $this->write($this->row());
        [$linkedin, $instagram] = ContentPlannerPost::where('site_page_id', $this->page->id)->orderBy('scheduled_date')->get()->all();

        $linkedinLink = ContentLink::withoutGlobalScopes()->where('post_id', $linkedin->id)->first();
        $this->assertSame(self::URL, $linkedinLink->destination);
        $this->assertSame('promote-autumn-colours', $linkedinLink->utm['utm_campaign']);
        $this->assertSame('linkedin', $linkedinLink->utm['utm_source']);
        $this->assertSame("Copy.\n\n" . ContentLinks::shortUrl($linkedinLink->code), $linkedin->main_copy);
        $this->assertNotSame($linkedinLink->code, ContentLink::withoutGlobalScopes()->where('post_id', $instagram->id)->value('code'));
        $this->assertSame('Copy.', $instagram->main_copy);
    }

    public function test_the_pages_picture_is_copied_once_and_shared(): void
    {
        $this->write($this->row());
        $this->write($this->row(['batch' => 'b-2', 'slots' => [['platform' => 'linkedin', 'date' => '2026-10-13', 'time' => null]], 'posts_wanted' => 1]));

        $images = ContentPlannerPost::where('site_page_id', $this->page->id)->with('visualBrief')->get()->map(fn ($post) => $post->visualBrief?->image_url)->unique()->values();
        $this->assertCount(1, $images);
        $this->assertStringStartsWith('/storage/', $images[0]);
        $this->assertSame($images[0], $this->page->fresh()->picture_url);
        $this->assertSame(self::IMAGE, $this->page->fresh()->picture_source);
        $this->assertSame('ready', ContentPlannerPost::where('site_page_id', $this->page->id)->first()->visualBrief->image_status);
        $this->assertSame('A warm still life.', ContentPlannerPost::where('site_page_id', $this->page->id)->first()->visualBrief->description);
        $this->assertCount(1, Http::recorded(fn (Request $request) => $request->url() === self::IMAGE));
    }

    public function test_without_the_picture_switch_no_picture_is_used(): void
    {
        $this->write($this->row(['use_picture' => false]));

        $this->assertNull(ContentPlannerPost::where('site_page_id', $this->page->id)->first()->visualBrief->image_url);
        $this->assertCount(0, Http::recorded(fn (Request $request) => $request->url() === self::IMAGE));
    }

    public function test_the_writer_reads_the_page_again_with_the_instructions_and_earlier_hooks(): void
    {
        $this->makePost(['site_page_id' => $this->page->id, 'hook' => 'Old hook']);
        $this->write($this->row());

        $this->assertSame('Fresh text.', $this->calls[0]['page']['text']);
        $this->assertSame('Fresh text.', $this->page->fresh()->body);
        $this->assertSame(['Old hook'], $this->calls[0]['earlierHooks']);
        $this->assertSame('Mention the offer.', $this->calls[0]['instructions']);
        $this->assertSame([['platform' => 'linkedin', 'date' => '2026-10-06', 'time' => '09:00'], ['platform' => 'instagram', 'date' => '2026-10-07', 'time' => '18:00']], $this->calls[0]['slots']);
    }

    public function test_a_page_that_cannot_be_read_again_uses_its_kept_text(): void
    {
        $this->fakeWebsite([]);
        $this->write($this->row(['use_picture' => false]));

        $this->assertSame('Kept text.', $this->calls[0]['page']['text']);
    }

    public function test_a_failing_writer_partial_and_empty_answers_and_a_gone_page(): void
    {
        $this->answer = fn () => throw new \RuntimeException('provider down');
        $failed = $this->write($this->row());
        $this->assertSame(['failed', 'ai_failed', 0], [$failed->status, $failed->error, $failed->posts_made]);
        $this->assertSame(0, ContentPlannerPost::where('site_page_id', $this->page->id)->count());

        $this->answer = fn (array $page, array $slots) => [['platform' => 'linkedin', 'angle' => null, 'topic' => null, 'hook' => 'H', 'main_copy' => 'C', 'short_copy' => null, 'cta' => null, 'hashtags' => [], 'post_type' => null, 'visual_idea' => null], null];
        $partial = $this->write($this->row(['batch' => 'b-2']));
        $this->assertSame(['done', 'ai_incomplete', 1], [$partial->status, $partial->error, $partial->posts_made]);
        $this->assertSame('Autumn colours', ContentPlannerPost::where('site_page_id', $this->page->id)->value('topic'));

        $this->answer = fn () => [null, null];
        $empty = $this->write($this->row(['batch' => 'b-3']));
        $this->assertSame(['failed', 'ai_failed'], [$empty->status, $empty->error]);

        $gone = $this->write($this->row(['batch' => 'b-4', 'site_page_id' => null]));
        $this->assertSame(['failed', 'page_gone'], [$gone->status, $gone->error]);
    }

    public function test_the_campaign_tag_is_the_campaign_then_the_page_then_the_plan(): void
    {
        $campaign = ContentPlannerCampaign::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'name' => 'Autumn Sale']);
        $this->assertSame('autumn-sale', ContentLinks::tagsFor($this->makePost(['campaign_id' => $campaign->id, 'site_page_id' => $this->page->id]))['utm_campaign']);
        $this->assertSame('promote-autumn-colours', ContentLinks::tagsFor($this->makePost(['site_page_id' => $this->page->id]))['utm_campaign']);
        $this->assertSame('content-plan', ContentLinks::tagsFor($this->makePost())['utm_campaign']);
    }
}
```

- [ ] **Step 2: Run them to see them fail**

Run: `$WS/php.sh tests/Unit/Content/PromotionWriterTest.php tests/Feature/Content/PromotionPostsTest.php`
Expected: FAIL — `Class "App\Services\Content\PromotionWriter" not found`.

- [ ] **Step 3: Write the code**

In `app/Services/Content/ContentPlatformRules.php`, add inside the class:

```php
    /** Platforms whose posts cannot carry a clickable link: they point to the link in bio (spec 2026-10-20 §D9). */
    public const NO_LINKS = ['instagram', 'tiktok'];
```

In `app/Services/Content/ContentLinks.php`, add `use App\Models\ContentSitePage;` and replace `tagsFor()` with:

```php
    /** The post's tags as it is now (§5.2): its campaign's name, else the page it promotes (spec 2026-10-20 §D11). @return array<string, string> */
    public static function tagsFor(ContentPlannerPost $post): array
    {
        $campaign = $post->campaign_id
            ? ContentPlannerCampaign::withoutGlobalScopes()->whereKey($post->campaign_id)->value('name')
            : null;
        if (($campaign === null || trim((string) $campaign) === '') && $post->site_page_id) {
            $campaign = ContentSitePage::withoutGlobalScopes()->whereKey($post->site_page_id)->first(['id', 'url', 'title'])?->campaignName();
        }

        return self::postTags((string) $post->platform, $campaign, (int) $post->id);
    }
```

`app/Services/Content/PromotionWriter.php`:

```php
<?php

namespace App\Services\Content;

use App\Models\ContentPlannerProfile;
use App\Services\ContentPlanner\AiClient;
use App\Services\ContentPlanner\ContextBuilder;

/**
 * One page's promotion posts (spec 2026-10-20 §4.4): one AI call writes a post per slot, each from a different angle,
 * facts only from the page, in the brand's language and each platform's own form. Not final, so tests replace it.
 */
class PromotionWriter
{
    public const TEXT_CHARS = 8000;

    public const ANGLES = [
        'key takeaway', 'question', 'surprising fact from the page', 'how-to tip', 'myth vs fact', 'quote from the page',
        'checklist', 'mistake to avoid', 'story', 'behind the page', 'number from the page', 'poll', 'carousel outline',
        'short video script', 'recap',
    ];

    /** The calendar's post types (ContentCalendarGenerationService), so a promotion post reads like any other. */
    public const POST_TYPES = [
        'problem_aware', 'myth_busting', 'how_to', 'checklist', 'mistakes', 'comparison', 'story', 'before_after',
        'faq_answer', 'behind_the_scenes', 'case_study', 'soft_offer', 'founder_opinion', 'trend_reaction', 'poll_question',
        'carousel', 'video_script', 'product_demo',
    ];

    public function __construct(protected AiClient $ai, protected ContextBuilder $context)
    {
    }

    /**
     * @param array{url: string, title: string, description: ?string, published_at: ?string, text: string} $page
     * @param list<array{platform: string, date: string, time?: ?string}> $slots
     * @param list<string> $earlierHooks
     * @return list<array<string, mixed>|null>
     */
    public function write(ContentPlannerProfile $profile, array $page, array $slots, array $earlierHooks, ?string $instructions): array
    {
        $prompt = self::prompt($page, $slots, (string) ($profile->default_language ?: 'en'), $this->context->build($profile), $earlierHooks, $instructions);

        return self::posts($this->ai->generateJson($profile, 'promotion', $prompt, 12000), $slots);
    }

    /**
     * @param array<string, mixed> $page
     * @param list<array{platform: string, date: string}> $slots
     * @param list<string> $earlierHooks
     */
    public static function prompt(array $page, array $slots, string $language, string $context, array $earlierHooks, ?string $instructions): string
    {
        $lines = [];
        $rules = [];
        foreach (array_values($slots) as $i => $slot) {
            $platform = (string) $slot['platform'];
            $lines[] = ($i + 1) . ". {$platform} — {$slot['date']}";
            $rules[$platform] ??= "- {$platform}: " . ContentPlatformRules::for($platform)
                . (in_array($platform, ContentPlatformRules::NO_LINKS, true)
                    ? ' Links cannot be clicked here: end the text by pointing readers to the link in bio.'
                    : ' Do not write the web address: the link is added on its own line after the text.');
        }
        $hooks = $earlierHooks === [] ? '' : "## HOOKS ALREADY USED FOR THIS PAGE (do not repeat them)\n- "
            . implode("\n- ", array_map(fn (string $hook) => mb_substr($hook, 0, 200), $earlierHooks)) . "\n\n";
        $extra = trim((string) $instructions) === '' ? '' : "## EXTRA INSTRUCTIONS FROM THE USER\n" . trim((string) $instructions) . "\n\n";
        $count = count($slots);

        return "You write social media posts that promote one page of the brand's own website.\n"
            . "Write {$count} posts, one for each slot below, in this order, in the language with the code \"{$language}\".\n"
            . 'Use only facts the page states: no invented numbers, prices, quotes or claims. Give each post a different angle, chosen from: '
            . implode(', ', self::ANGLES) . ".\n"
            . "Every post makes the reader want to open the page. A post on x keeps main_copy within 250 characters.\n\n"
            . "## THE BRAND\n{$context}\n\n"
            . "## THE PAGE\nAddress: {$page['url']}\nTitle: {$page['title']}\n"
            . (!empty($page['description']) ? "Description: {$page['description']}\n" : '')
            . (!empty($page['published_at']) ? "Published: {$page['published_at']}\n" : '')
            . "Text:\n" . mb_substr((string) ($page['text'] ?? ''), 0, self::TEXT_CHARS) . "\n\n"
            . "## SLOTS\n" . implode("\n", $lines) . "\n\n"
            . "## PLATFORM RULES\n" . implode("\n", $rules) . "\n\n"
            . $hooks . $extra
            . 'Allowed post_type values: ' . implode(', ', self::POST_TYPES) . "\n\n"
            . 'Return ONLY JSON: {"posts": [{"platform": "...", "angle": "...", "topic": "...", "hook": "...", "main_copy": "...", "short_copy": "...", "cta": "...", "hashtags": ["#..."], "post_type": "...", "visual_idea": "..."}]}';
    }

    /**
     * The answer for each slot, in order, cut to the columns; null where the AI gave neither a hook nor a text.
     *
     * @param array<string, mixed> $data
     * @param list<array{platform: string, date: string}> $slots
     * @return list<array<string, mixed>|null>
     */
    public static function posts(array $data, array $slots): array
    {
        $items = is_array($data['posts'] ?? null) && array_is_list($data['posts']) ? $data['posts'] : [];
        $out = [];
        foreach (array_values($slots) as $i => $slot) {
            $item = $items[$i] ?? null;
            $main = is_array($item) ? self::text($item['main_copy'] ?? null, null) : null;
            $hook = is_array($item) ? self::text($item['hook'] ?? null, 500) : null;
            if ($main === null && $hook === null) {
                $out[] = null;
                continue;
            }
            $type = self::text($item['post_type'] ?? null, 50);
            $tags = [];
            foreach ((array) ($item['hashtags'] ?? []) as $tag) {
                $tag = is_scalar($tag) ? mb_substr(trim((string) $tag), 0, 100) : '';
                if ($tag !== '' && count($tags) < 30) {
                    $tags[] = $tag;
                }
            }
            $out[] = [
                'platform'    => (string) $slot['platform'],
                'angle'       => self::text($item['angle'] ?? null, 60),
                'topic'       => self::text($item['topic'] ?? null, 255),
                'hook'        => $hook,
                'main_copy'   => $main,
                'short_copy'  => self::text($item['short_copy'] ?? null, 2000),
                'cta'         => self::text($item['cta'] ?? null, 255),
                'hashtags'    => $tags,
                'post_type'   => $type !== null && in_array($type, self::POST_TYPES, true) ? $type : null,
                'visual_idea' => self::text($item['visual_idea'] ?? null, 2000),
            ];
        }

        return $out;
    }

    private static function text(mixed $value, ?int $max): ?string
    {
        if (!is_scalar($value)) {
            return null;
        }
        $value = trim((string) $value);
        if ($value === '') {
            return null;
        }

        return $max === null ? $value : mb_substr($value, 0, $max);
    }
}
```

`app/Services/Content/ContentPromotionPosts.php`:

```php
<?php

namespace App\Services\Content;

use App\Http\Controllers\Api\V1\Admin\Content\PostController;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Models\ContentPlannerVisualBrief;
use App\Models\ContentPromotion;
use App\Models\ContentSitePage;
use App\Services\Content\Web\PageReader;
use App\Services\Content\Web\WebFetcher;
use App\Services\MediaService;
use Illuminate\Support\Facades\DB;

/**
 * One page of a promotion (spec 2026-10-20 §4.4): reads the page again, copies its picture once, has the AI write a
 * post per slot, and saves each post with its short link (and, on link-friendly platforms, the link after the text)
 * and its visual brief, in one transaction each. The row ends `done` or `failed`.
 */
final class ContentPromotionPosts
{
    public function __construct(private WebFetcher $web, private PromotionWriter $writer)
    {
    }

    public function write(ContentPromotion $row): void
    {
        $page = $row->site_page_id ? ContentSitePage::withoutGlobalScopes()->find($row->site_page_id) : null;
        $profile = ContentPlannerProfile::withoutGlobalScopes()->find($row->planner_profile_id);
        if ($page === null || $profile === null) {
            self::end($row, 'failed', 0, 'page_gone');

            return;
        }
        $slots = array_values((array) $row->slots);
        $text = $this->text($page);
        $picture = $row->use_picture ? $this->picture($page) : null;
        $hooks = ContentPlannerPost::withoutGlobalScopes()->where('site_page_id', $page->id)->whereNotNull('hook')
            ->orderByDesc('id')->limit(30)->pluck('hook')->map(fn ($hook) => (string) $hook)->all();
        try {
            $answers = $this->writer->write($profile, [
                'url'          => (string) $page->url,
                'title'        => (string) $page->title,
                'description'  => $page->description,
                'published_at' => $page->published_at?->format('Y-m-d'),
                'text'         => $text,
            ], $slots, $hooks, $row->instructions);
        } catch (\Throwable $e) {
            report($e);
            self::end($row, 'failed', 0, 'ai_failed');

            return;
        }
        $strategyId = $profile->strategies()->active()->recent()->value('id');
        $made = 0;
        foreach ($slots as $i => $slot) {
            if (($answers[$i] ?? null) === null) {
                continue;
            }
            $this->post($row, $profile, $page, $slot, $answers[$i], $picture, $strategyId === null ? null : (int) $strategyId);
            $made++;
        }
        if ($made === 0) {
            self::end($row, 'failed', 0, 'ai_failed');

            return;
        }
        self::end($row, 'done', $made, $made < count($slots) ? 'ai_incomplete' : null);
    }

    /** The page's main text as it is now, kept on the page; the kept text, else its title and description, when it cannot be read. */
    private function text(ContentSitePage $page): string
    {
        $response = $this->web->get((string) $page->url, WebFetcher::HTML_BYTES, WebFetcher::HTML_TYPES);
        if ($response !== null) {
            $text = PageReader::read($response->body, $response->url, $response->contentType)['text'];
            if ($text !== '') {
                $page->forceFill(['body' => $text])->save();

                return $text;
            }
        }

        return (string) ($page->body ?: trim($page->title . "\n" . $page->description));
    }

    /** The page's picture in Content's media store: copied once, again only when the page's picture address changed. */
    private function picture(ContentSitePage $page): ?string
    {
        if ($page->image_url === null) {
            return null;
        }
        if ($page->picture_url !== null && $page->picture_source === $page->image_url) {
            return $page->picture_url;
        }
        $response = $this->web->get((string) $page->image_url, WebFetcher::IMAGE_BYTES);
        $info = $response === null ? false : @getimagesizefromstring($response->body);
        $extension = is_array($info) ? match ($info['mime'] ?? '') {
            'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif', default => null,
        } : null;
        if ($extension === null) {
            return null;
        }
        $url = MediaService::putRaw($response->body, 'content-planner/images', $extension);
        $page->forceFill(['picture_url' => $url, 'picture_source' => $page->image_url])->save();

        return $url;
    }

    /**
     * @param array{platform: string, date: string, time?: ?string} $slot
     * @param array<string, mixed> $answer
     */
    private function post(ContentPromotion $row, ContentPlannerProfile $profile, ContentSitePage $page, array $slot, array $answer, ?string $picture, ?int $strategyId): void
    {
        DB::transaction(function () use ($row, $profile, $page, $slot, $answer, $picture, $strategyId) {
            $post = ContentPlannerPost::create([
                'organization_id'    => $profile->organization_id,
                'brand_id'           => $profile->brand_id,
                'planner_profile_id' => $profile->id,
                'strategy_id'        => $strategyId,
                'site_page_id'       => $page->id,
                'platform'           => $slot['platform'],
                'scheduled_date'     => $slot['date'],
                'scheduled_time'     => $slot['time'] ?? null,
                'language'           => $profile->default_language ?: 'en',
                'topic'              => $answer['topic'] ?? mb_substr((string) $page->title, 0, 255),
                'hook'               => $answer['hook'],
                'main_copy'          => $answer['main_copy'],
                'short_copy'         => $answer['short_copy'],
                'cta'                => $answer['cta'],
                'hashtags'           => $answer['hashtags'],
                'post_type'          => $answer['post_type'],
                'funnel_stage'       => 'consideration',
                'goal'               => mb_substr('Promote: ' . $page->title, 0, 250),
                'strategic_reason'   => 'Promotes ' . $page->url . ($answer['angle'] ? ' — ' . $answer['angle'] : ''),
                'source_context'     => ['kind' => 'promotion', 'page_id' => (int) $page->id, 'angle' => $answer['angle']],
                'status'             => 'draft',
                'generated_by'       => 'promotion',
                'created_by'         => $row->created_by,
            ]);
            ContentLinks::set($post, (string) $page->url);
            if (!in_array($slot['platform'], ContentPlatformRules::NO_LINKS, true)) {
                $short = ContentLinks::shortUrl((string) ContentLinks::ofPost($post)?->code);
                $post->update(['main_copy' => trim(rtrim((string) $post->main_copy) . "\n\n" . $short)]);
            }
            if ($answer['visual_idea'] !== null || $picture !== null) {
                ContentPlannerVisualBrief::create(['post_id' => $post->id, 'description' => $answer['visual_idea']]
                    + ($picture !== null ? ['image_url' => $picture, 'image_status' => 'ready'] : []));
            }
        }, PostController::ATTEMPTS);
    }

    private static function end(ContentPromotion $row, string $status, int $made, ?string $error): void
    {
        ContentPromotion::withoutGlobalScopes()->whereKey($row->id)->where('status', 'writing')
            ->update(['status' => $status, 'posts_made' => $made, 'error' => $error, 'finished_at' => now()]);
    }
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `$WS/php.sh tests/Unit/Content/PromotionWriterTest.php tests/Feature/Content/PromotionPostsTest.php tests/Unit/Content/ContentLinksTest.php`
Expected: `Tests: 4 passed`, `Tests: 8 passed`, and ContentLinksTest still green.

- [ ] **Step 5: Commit**

```bash
git add app/Services/Content/PromotionWriter.php app/Services/Content/ContentPromotionPosts.php app/Services/Content/ContentPlatformRules.php app/Services/Content/ContentLinks.php tests/Unit/Content/PromotionWriterTest.php tests/Feature/Content/PromotionPostsTest.php
git commit -m "Content promotions: write a page's posts with their own short links and the page's picture"
```

---

### Task 9: Starting, following and stopping a promotion

**Files:**
- Create: `app/Services/Content/ContentPromotions.php`, `app/Jobs/WritePromotionPosts.php`, `app/Http/Controllers/Api/V1/Admin/Content/PromotionController.php`
- Modify: `routes/api.php`, `tests/Feature/QueueRetryAfterTest.php`
- Test: `tests/Feature/Content/PromotionTest.php`

**Interfaces:**
- Consumes: `PromotionSchedule::plan` (Task 7), `ContentPromotionPosts::write` (Task 8), `ContentSites::of/scanning` (Task 6), `BestTimes::usual`, `VenueClock::today`, `ContentRules::days`.
- Produces:
  - `ContentPromotions` constants (`MAX_PAGES` 20, `MAX_PER_PAGE` 15, `MAX_POSTS` 200, `MAX_DAYS` 183, `MAX_PER_WEEK` 21, `RUN_SECONDS` 660, `IDLE_SECONDS` 1800, `RESULT_SECONDS` 3600, `DRAFTS`); `platforms(): list<string>`; `prepare(Request, ContentPlannerProfile, ContentSite): array{pages: list<ContentSitePage>, per_page: int, from: string, to: string, plan: array, use_picture: bool, instructions: ?string}`; `describe(int $profileId): array`; `running(int $profileId): bool`; `markStale(int $profileId): void`; `stop(int $profileId): void`
  - `WritePromotionPosts(int $promotionId)` on `ai`; static `next(string $batch): void`
  - Routes `POST promotions/preview`, `POST promotions`, `GET promotions/current`, `DELETE promotions/current`

- [ ] **Step 1: Write the failing test**

`tests/Feature/Content/PromotionTest.php`:

```php
<?php

namespace Tests\Feature\Content;

use App\Jobs\WritePromotionPosts;
use App\Models\ContentPlannerChannel;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Models\ContentPromotion;
use App\Models\ContentSite;
use App\Models\ContentSitePage;
use App\Services\Content\ContentPromotionPosts;
use App\Services\Content\PromotionWriter;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\FakesWebsite;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** A promotion from the press to its last page (spec 2026-10-20 §4.2, §4.5); the queue is sync, the AI replaced. */
class PromotionTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema, FakesWebsite;

    private ContentSite $site;
    /** @var list<ContentSitePage> */
    private array $pages = [];
    /** @var list<string> */
    public array $written = [];
    /** @var (\Closure(array): void)|null */
    public ?\Closure $onWrite = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        $this->fakeWebsite([]);
        $this->site = ContentSite::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'url' => 'https://lumiere.example', 'status' => 'ready', 'scanned_at' => now()]);
        foreach ([1, 2, 3] as $i) {
            $url = "https://lumiere.example/blog/post-{$i}";
            $this->pages[] = ContentSitePage::create(['site_id' => $this->site->id, 'brand_id' => $this->brandId, 'url' => $url, 'url_hash' => hash('sha256', $url),
                'kind' => 'article', 'title' => "Post {$i}", 'body' => "Body {$i}", 'last_seen_at' => now()]);
        }
        $test = $this;
        $this->app->instance(PromotionWriter::class, new class($test) extends PromotionWriter {
            public function __construct(private PromotionTest $test)
            {
            }

            public function write(ContentPlannerProfile $profile, array $page, array $slots, array $earlierHooks, ?string $instructions): array
            {
                $this->test->written[] = $page['title'];
                if ($this->test->onWrite !== null) {
                    ($this->test->onWrite)($page);
                }

                return array_map(fn (array $slot) => ['platform' => $slot['platform'], 'angle' => 'tip', 'topic' => 'T', 'hook' => 'H ' . $slot['date'],
                    'main_copy' => 'C', 'short_copy' => null, 'cta' => null, 'hashtags' => [], 'post_type' => null, 'visual_idea' => null], $slots);
            }
        });
    }

    /** @return array<string, mixed> */
    private function body(array $overrides = []): array
    {
        return $overrides + [
            'page_ids' => [$this->pages[0]->id, $this->pages[1]->id], 'posts_per_page' => 2, 'platforms' => ['instagram', 'linkedin'],
            'from' => '2026-10-05', 'to' => '2026-10-18', 'per_week' => 3,
        ];
    }

    private function queuedRow(array $attributes = []): ContentPromotion
    {
        return ContentPromotion::create($attributes + ['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'site_page_id' => $this->pages[0]->id,
            'batch' => 'old', 'status' => 'queued', 'posts_wanted' => 1, 'slots' => [['platform' => 'instagram', 'date' => '2026-10-07', 'time' => null]]]);
    }

    public function test_the_preview_says_how_many_fit_without_writing(): void
    {
        $this->asManager()->postJson($this->api('promotions/preview'), $this->body())->assertOk()
            ->assertExactJson(['wanted' => 4, 'fit' => 4, 'first_date' => '2026-10-05', 'last_date' => '2026-10-16', 'weeks' => 2]);
        $this->asManager()->postJson($this->api('promotions/preview'), $this->body(['posts_per_page' => 15]))->assertOk()
            ->assertJsonPath('wanted', 30)->assertJsonPath('fit', 6);
        $this->assertSame(0, ContentPlannerPost::count());
        $this->assertSame([], $this->written);
    }

    public function test_the_checks_refuse_what_cannot_be_promoted(): void
    {
        $this->asStaffMember()->postJson($this->api('promotions/preview'), $this->body())->assertStatus(403);
        $this->asManager()->postJson($this->api('promotions/preview'), $this->body(['page_ids' => [999999]]))->assertStatus(404)->assertJsonPath('error', 'page_not_found');
        $this->asManager()->postJson($this->api('promotions/preview'), $this->body(['platforms' => ['blog']]))->assertStatus(422);
        $this->asManager()->postJson($this->api('promotions/preview'), $this->body(['platforms' => ['tiktok']]))->assertStatus(422)->assertJsonPath('error', 'no_channels');
        $this->asManager()->postJson($this->api('promotions/preview'), $this->body(['posts_per_page' => 15, 'page_ids' => array_fill(0, 14, $this->pages[0]->id)]))->assertStatus(422);
        $this->asManager()->postJson($this->api('promotions/preview'), $this->body(['from' => '2026-09-01', 'to' => '2026-09-30']))->assertStatus(422)->assertJsonPath('error', 'range_in_past');
        $this->asManager()->postJson($this->api('promotions/preview'), $this->body(['to' => '2027-06-01']))->assertStatus(422);
    }

    public function test_too_many_posts_in_one_press_are_refused(): void
    {
        foreach (range(4, 14) as $i) {
            $url = "https://lumiere.example/blog/post-{$i}";
            $this->pages[] = ContentSitePage::create(['site_id' => $this->site->id, 'brand_id' => $this->brandId, 'url' => $url, 'url_hash' => hash('sha256', $url), 'kind' => 'article', 'title' => "Post {$i}"]);
        }
        $this->asManager()->postJson($this->api('promotions/preview'), $this->body(['posts_per_page' => 15, 'page_ids' => array_map(fn ($page) => $page->id, $this->pages)]))
            ->assertStatus(422)->assertJsonPath('error', 'too_many_posts');
    }

    public function test_a_manager_promotes_and_every_page_gets_its_posts(): void
    {
        $this->asManager()->postJson($this->api('promotions'), $this->body())->assertOk()
            ->assertJsonPath('status', 'finished')
            ->assertJsonPath('created_count', 4)
            ->assertJsonPath('wanted_count', 4)
            ->assertJsonPath('pages.0.status', 'done')
            ->assertJsonPath('pages.0.title', 'Post 1')
            ->assertJsonPath('pages.1.status', 'done');
        $this->assertSame(['Post 1', 'Post 2'], $this->written);
        $this->assertSame(2, ContentPlannerPost::where('site_page_id', $this->pages[0]->id)->count());
        $this->assertSame([$this->manager->id], ContentPlannerPost::where('generated_by', 'promotion')->pluck('created_by')->map(fn ($id) => (int) $id)->unique()->values()->all());
    }

    public function test_posts_that_do_not_fit_refuse_the_press(): void
    {
        $this->asManager()->postJson($this->api('promotions'), $this->body(['posts_per_page' => 15]))
            ->assertStatus(422)->assertJsonPath('error', 'period_too_short')->assertJsonPath('fit', 6)->assertJsonPath('wanted', 30);
    }

    public function test_a_second_promotion_while_one_runs_is_refused(): void
    {
        $this->queuedRow();
        $this->asManager()->postJson($this->api('promotions'), $this->body())->assertStatus(409)->assertJsonPath('error', 'already_promoting');
    }

    public function test_a_stale_promotion_gives_way_and_is_marked_failed(): void
    {
        $old = $this->queuedRow(['status' => 'writing', 'started_at' => now()->subMinutes(11)]);
        $this->asManager()->postJson($this->api('promotions'), $this->body())->assertOk();
        $this->assertSame(['failed', 'promotion_failed'], [$old->fresh()->status, $old->fresh()->error]);
    }

    public function test_nothing_is_promoted_while_the_site_is_scanned_or_the_budget_is_used_up(): void
    {
        $this->site->forceFill(['status' => 'scanning', 'scan_token' => 't', 'scan_queued_at' => now()])->save();
        $this->asManager()->postJson($this->api('promotions'), $this->body())->assertStatus(409)->assertJsonPath('error', 'scan_running');

        $this->site->forceFill(['status' => 'ready'])->save();
        $this->setAiCap(100, 100);
        $this->asManager()->postJson($this->api('promotions'), $this->body())->assertStatus(403)->assertJsonPath('error', 'ai_budget_used_up');
    }

    public function test_the_budget_running_out_midway_stops_the_rest(): void
    {
        $this->onWrite = fn () => $this->setAiCap(100, 100);
        $this->asManager()->postJson($this->api('promotions'), $this->body(['page_ids' => [$this->pages[0]->id, $this->pages[1]->id, $this->pages[2]->id]]))
            ->assertOk()
            ->assertJsonPath('pages.0.status', 'done')
            ->assertJsonPath('pages.1.status', 'failed')
            ->assertJsonPath('pages.1.error', 'ai_budget_used_up')
            ->assertJsonPath('pages.2.error', 'ai_budget_used_up');
        $this->assertSame(['Post 1'], $this->written);
    }

    public function test_one_failing_page_does_not_stop_the_others(): void
    {
        $this->onWrite = function (array $page) {
            if ($page['title'] === 'Post 2') {
                throw new \RuntimeException('provider down');
            }
        };
        $this->asManager()->postJson($this->api('promotions'), $this->body(['page_ids' => [$this->pages[0]->id, $this->pages[1]->id, $this->pages[2]->id], 'to' => '2026-10-25']))
            ->assertOk()
            ->assertJsonPath('pages.0.status', 'done')
            ->assertJsonPath('pages.1.status', 'failed')
            ->assertJsonPath('pages.1.error', 'ai_failed')
            ->assertJsonPath('pages.2.status', 'done');
    }

    public function test_stop_leaves_the_queued_pages_unwritten(): void
    {
        $this->queuedRow(['batch' => 'b-1']);
        $this->queuedRow(['batch' => 'b-1', 'site_page_id' => $this->pages[1]->id]);

        $this->asManager()->deleteJson($this->api('promotions/current'))->assertOk()
            ->assertJsonPath('status', 'finished')
            ->assertJsonPath('pages.0.status', 'stopped')
            ->assertJsonPath('pages.1.status', 'stopped');
        $this->asStaffMember()->deleteJson($this->api('promotions/current'))->assertStatus(403);
    }

    public function test_the_current_promotion_reads_idle_then_finished_then_idle_again(): void
    {
        $this->asStaffMember()->getJson($this->api('promotions/current'))->assertOk()->assertExactJson(['status' => 'idle']);
        $this->asManager()->postJson($this->api('promotions'), $this->body())->assertOk();
        $this->asStaffMember()->getJson($this->api('promotions/current'))->assertOk()->assertJsonPath('status', 'finished');

        $this->travel(61)->minutes();
        $this->asStaffMember()->getJson($this->api('promotions/current'))->assertOk()->assertExactJson(['status' => 'idle']);
    }

    public function test_a_late_job_does_nothing_and_a_killed_job_moves_on_to_the_next_page(): void
    {
        $stopped = $this->queuedRow(['batch' => 'b-1', 'status' => 'stopped']);
        (new WritePromotionPosts($stopped->id))->handle(app(ContentPromotionPosts::class), app(\App\Services\Content\ContentAiGate::class));
        $this->assertSame([], $this->written);

        $writing = $this->queuedRow(['batch' => 'b-2', 'status' => 'writing', 'started_at' => now(), 'created_by' => $this->manager->id]);
        $next = $this->queuedRow(['batch' => 'b-2', 'site_page_id' => $this->pages[1]->id, 'created_by' => $this->manager->id]);
        (new WritePromotionPosts($writing->id))->failed(new \RuntimeException('killed'));

        $this->assertSame(['failed', 'promotion_failed'], [$writing->fresh()->status, $writing->fresh()->error]);
        $this->assertSame('done', $next->fresh()->status);
        $this->assertSame(['Post 2'], $this->written);
    }

    public function test_an_inactive_channel_is_not_used(): void
    {
        ContentPlannerChannel::where('planner_profile_id', $this->profile->id)->where('platform', 'linkedin')->update(['active' => false]);

        $this->asManager()->postJson($this->api('promotions'), $this->body())->assertOk();
        $this->assertSame(['instagram'], ContentPlannerPost::where('generated_by', 'promotion')->pluck('platform')->unique()->values()->all());
    }
}
```

In `tests/Feature/QueueRetryAfterTest.php`, add to `$jobs`:

```php
            new \App\Jobs\WritePromotionPosts(1),
```

- [ ] **Step 2: Run it to see it fail**

Run: `$WS/php.sh tests/Feature/Content/PromotionTest.php tests/Feature/QueueRetryAfterTest.php`
Expected: FAIL — 404s on `promotions/…`; `Class "App\Jobs\WritePromotionPosts" not found`.

- [ ] **Step 3: Write the code**

`app/Services/Content/ContentPromotions.php`:

```php
<?php

namespace App\Services\Content;

use App\Models\ContentPlannerChannel;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Models\ContentPromotion;
use App\Models\ContentSite;
use App\Models\ContentSitePage;
use App\Models\Organization;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Promotions (spec 2026-10-20 §4): a press checked and planned, a batch's state as the portal reads it (a row whose job
 * died reads failed), stopping a batch, and the page a post promotes.
 */
final class ContentPromotions
{
    public const MAX_PAGES = 20;
    public const MAX_PER_PAGE = 15;
    public const MAX_POSTS = 200;
    public const MAX_DAYS = 183;
    public const MAX_PER_WEEK = 21;
    /** A page's job may run this long (its timeout is 600 s)… */
    public const RUN_SECONDS = 660;
    /** …and a batch may go this long without any progress before its queued pages read failed. */
    public const IDLE_SECONDS = 1800;
    /** A finished batch is shown this long. */
    public const RESULT_SECONDS = 3600;
    /** What "Remove draft posts" removes (spec §D12). */
    public const DRAFTS = ['idea', 'draft', 'needs_review', 'needs_visual'];
    private const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

    /** Every channel but the blog (spec §D9). @return list<string> */
    public static function platforms(): array
    {
        return array_values(array_diff(ContentRules::PLATFORMS, ['blog']));
    }

    /**
     * The press checked (spec §4.5) and planned (§4.3); `plan.fit` below `plan.wanted` is the caller's to refuse.
     *
     * @return array{pages: list<ContentSitePage>, per_page: int, from: string, to: string, plan: array, use_picture: bool, instructions: ?string}
     */
    public static function prepare(Request $request, ContentPlannerProfile $profile, ContentSite $site): array
    {
        $data = $request->validate([
            'page_ids'       => 'required|array|min:1|max:' . self::MAX_PAGES,
            'page_ids.*'     => 'integer|distinct',
            'posts_per_page' => 'required|integer|min:1|max:' . self::MAX_PER_PAGE,
            'platforms'      => 'required|array|min:1',
            'platforms.*'    => ['string', 'distinct', Rule::in(self::platforms())],
            'from'           => 'required|date_format:Y-m-d',
            'to'             => 'required|date_format:Y-m-d|after_or_equal:from',
            'per_week'       => 'required|integer|min:1|max:' . self::MAX_PER_WEEK,
            'use_picture'    => 'sometimes|boolean',
            'instructions'   => 'nullable|string|max:2000',
        ]);
        $ids = array_map('intval', $data['page_ids']);
        $perPage = (int) $data['posts_per_page'];
        if (count($ids) * $perPage > self::MAX_POSTS) {
            throw new ContentRefused('too_many_posts', 'One promotion writes at most ' . self::MAX_POSTS . ' posts.', 422);
        }
        $from = max($data['from'], VenueClock::today((int) $profile->organization_id));
        if ($from > $data['to']) {
            throw new ContentRefused('range_in_past', 'These days are already over — choose days from today on.', 422);
        }
        if (ContentRules::days($from, $data['to']) > self::MAX_DAYS) {
            throw ValidationException::withMessages(['to' => 'The period can be at most ' . self::MAX_DAYS . ' days.']);
        }
        $found = ContentSitePage::where('site_id', $site->id)->whereIn('id', $ids)->get()->keyBy('id');
        if ($found->count() !== count($ids)) {
            throw new ContentRefused('page_not_found', 'One of these pages is no longer in the list. Reload the page.', 404);
        }
        $channels = self::channels($profile, $data['platforms']);
        if ($channels === []) {
            throw new ContentRefused('no_channels', 'None of these channels is active for this brand.', 422);
        }

        return [
            'pages'        => array_map(fn (int $id) => $found[$id], $ids),
            'per_page'     => $perPage,
            'from'         => $from,
            'to'           => $data['to'],
            'plan'         => PromotionSchedule::plan($ids, $perPage, $channels, $from, $data['to'], (int) $data['per_week'], self::taken($profile, $from, $data['to'])),
            'use_picture'  => $request->boolean('use_picture', true),
            'instructions' => isset($data['instructions']) && trim((string) $data['instructions']) !== '' ? trim((string) $data['instructions']) : null,
        ];
    }

    /**
     * The ticked channels that are active, in the ticked order, with their posting days and usual time.
     *
     * @param list<string> $platforms
     * @return list<array{platform: string, days: list<string>, time: ?string}>
     */
    private static function channels(ContentPlannerProfile $profile, array $platforms): array
    {
        $industry = Organization::find($profile->organization_id)?->resolved_industry;
        $active = ContentPlannerChannel::where('planner_profile_id', $profile->id)->where('active', true)
            ->whereIn('platform', $platforms)->orderBy('id')->get()->groupBy('platform');
        $out = [];
        foreach (array_values(array_unique($platforms)) as $platform) {
            $channel = $active->get($platform)?->first();
            if ($channel === null) {
                continue;
            }
            $days = [];
            foreach ((array) ($channel->frequency ?? []) as $day => $on) {
                $key = substr(strtolower((string) $day), 0, 3);
                if ($on && in_array($key, self::WEEKDAYS, true) && !in_array($key, $days, true)) {
                    $days[] = $key;
                }
            }
            $out[] = ['platform' => $platform, 'days' => $days, 'time' => BestTimes::usual($channel->post_time, $platform, $industry)];
        }

        return $out;
    }

    /** @return array<string, true> "Y-m-d|platform" of the brand's other posts in the period */
    private static function taken(ContentPlannerProfile $profile, string $from, string $to): array
    {
        $taken = [];
        ContentPlannerPost::where('planner_profile_id', $profile->id)->whereBetween('scheduled_date', [$from, $to])
            ->where('status', '!=', 'archived')->get(['scheduled_date', 'platform'])
            ->each(function (ContentPlannerPost $post) use (&$taken) {
                if ($post->scheduled_date !== null) {
                    $taken[$post->scheduled_date->format('Y-m-d') . '|' . $post->platform] = true;
                }
            });

        return $taken;
    }

    /** `GET promotions/current` (spec §4.5). */
    public static function describe(int $profileId): array
    {
        $batch = ContentPromotion::where('planner_profile_id', $profileId)->orderByDesc('id')->value('batch');
        if ($batch === null) {
            return ['status' => 'idle'];
        }
        $rows = ContentPromotion::with('page:id,title')->where('batch', $batch)->orderBy('id')->get();
        $last = $rows->map(fn (ContentPromotion $row) => $row->finished_at ?? $row->started_at ?? $row->created_at)->max();
        $running = false;
        $pages = [];
        foreach ($rows as $row) {
            [$status, $error] = self::statusOf($row, $last);
            $running = $running || in_array($status, ['queued', 'writing'], true);
            $pages[] = [
                'page_id'      => $row->site_page_id === null ? null : (int) $row->site_page_id,
                'title'        => $row->page?->title,
                'status'       => $status,
                'posts_wanted' => (int) $row->posts_wanted,
                'posts_made'   => (int) $row->posts_made,
                'error'        => $error,
            ];
        }
        $finished = $running ? null : ($rows->max('finished_at') ?? $last);
        if ($finished !== null && CarbonImmutable::parse($finished)->addSeconds(self::RESULT_SECONDS)->isPast()) {
            return ['status' => 'idle'];
        }

        return [
            'status'        => $running ? 'running' : 'finished',
            'batch'         => $batch,
            'pages'         => $pages,
            'created_count' => (int) $rows->sum('posts_made'),
            'wanted_count'  => (int) $rows->sum('posts_wanted'),
            'finished_at'   => $finished === null ? null : CarbonImmutable::parse($finished)->toISOString(),
        ];
    }

    public static function running(int $profileId): bool
    {
        return self::describe($profileId)['status'] === 'running';
    }

    /** Before a new batch: rows of earlier batches still queued or writing have lost their jobs (the batch is not running). */
    public static function markStale(int $profileId): void
    {
        ContentPromotion::where('planner_profile_id', $profileId)->whereIn('status', ['queued', 'writing'])
            ->update(['status' => 'failed', 'error' => 'promotion_failed', 'finished_at' => now()]);
    }

    /** Stop: the latest batch's queued pages are not written; the page being written finishes. */
    public static function stop(int $profileId): void
    {
        $batch = ContentPromotion::where('planner_profile_id', $profileId)->orderByDesc('id')->value('batch');
        if ($batch !== null) {
            ContentPromotion::where('batch', $batch)->where('status', 'queued')->update(['status' => 'stopped', 'finished_at' => now()]);
        }
    }

    /** @return array{0: string, 1: ?string} */
    private static function statusOf(ContentPromotion $row, mixed $last): array
    {
        if ($row->status === 'writing' && $row->started_at !== null && $row->started_at->copy()->addSeconds(self::RUN_SECONDS)->isPast()) {
            return ['failed', 'promotion_failed'];
        }
        if ($row->status === 'queued' && $last !== null && CarbonImmutable::parse($last)->addSeconds(self::IDLE_SECONDS)->isPast()) {
            return ['failed', 'promotion_failed'];
        }

        return [(string) $row->status, $row->error];
    }
}
```

`app/Jobs/WritePromotionPosts.php`:

```php
<?php

namespace App\Jobs;

use App\Models\ContentPromotion;
use App\Models\Organization;
use App\Models\User;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentPromotionPosts;
use App\Services\Content\ContentRefused;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Auth;

/**
 * One page of a promotion on the `ai` queue (spec 2026-10-20 §4.5). It starts only by taking its row from `queued` to
 * `writing` (a stopped or stale row does nothing), works as the manager who pressed Promote, checks the AI budget
 * (used up: this and the batch's queued pages fail), writes the page's posts, then queues the batch's next page.
 */
class WritePromotionPosts implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /** One AI call per page: never tried twice on its own. */
    public int $tries = 1;

    /** Under ContentPromotions::RUN_SECONDS and every queue connection's retry_after (660 s). */
    public int $timeout = 600;

    public function __construct(public int $promotionId)
    {
        $this->onQueue('ai');
    }

    public function handle(ContentPromotionPosts $posts, ContentAiGate $gate): void
    {
        $taken = ContentPromotion::withoutGlobalScopes()->whereKey($this->promotionId)->where('status', 'queued')
            ->update(['status' => 'writing', 'started_at' => now()]);
        $row = ContentPromotion::withoutGlobalScopes()->find($this->promotionId);
        if ($taken === 0 || $row === null) {
            return;
        }
        $priorOrg = app()->bound('current_organization_id') ? app('current_organization_id') : null;
        $priorBrand = app()->bound('current_brand_id') ? app('current_brand_id') : null;
        app()->instance('current_organization_id', (int) $row->organization_id);
        app()->instance('current_brand_id', (int) $row->brand_id);
        try {
            if ($row->created_by && ($user = User::find($row->created_by))) {
                Auth::setUser($user);
            }
            try {
                $gate->allow(Organization::findOrFail($row->organization_id));
            } catch (ContentRefused) {
                ContentPromotion::withoutGlobalScopes()->where('batch', $row->batch)
                    ->where(fn ($query) => $query->whereKey($row->id)->orWhere('status', 'queued'))
                    ->whereIn('status', ['queued', 'writing'])
                    ->update(['status' => 'failed', 'error' => 'ai_budget_used_up', 'finished_at' => now()]);

                return;
            }
            $posts->write($row);
        } catch (\Throwable $e) {
            report($e);
            self::end($row->id);
        } finally {
            Auth::forgetGuards();
            $priorOrg === null ? app()->forgetInstance('current_organization_id') : app()->instance('current_organization_id', $priorOrg);
            $priorBrand === null ? app()->forgetInstance('current_brand_id') : app()->instance('current_brand_id', $priorBrand);
            self::next((string) $row->batch);
        }
    }

    /** Killed by the worker (its timeout): its page fails, the next one goes on. */
    public function failed(?\Throwable $e): void
    {
        self::end($this->promotionId);
        $batch = ContentPromotion::withoutGlobalScopes()->whereKey($this->promotionId)->value('batch');
        if ($batch !== null) {
            self::next((string) $batch);
        }
    }

    /** The batch's next page, on the queue. */
    public static function next(string $batch): void
    {
        $next = ContentPromotion::withoutGlobalScopes()->where('batch', $batch)->where('status', 'queued')->orderBy('id')->value('id');
        if ($next !== null) {
            self::dispatch((int) $next);
        }
    }

    private static function end(int $id): void
    {
        ContentPromotion::withoutGlobalScopes()->whereKey($id)->where('status', 'writing')
            ->update(['status' => 'failed', 'error' => 'promotion_failed', 'finished_at' => now()]);
    }
}
```

`app/Http/Controllers/Api/V1/Admin/Content/PromotionController.php`:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Jobs\WritePromotionPosts;
use App\Models\ContentPromotion;
use App\Models\ContentSite;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentAiGate;
use App\Services\Content\ContentContext;
use App\Services\Content\ContentPromotions;
use App\Services\Content\ContentRefused;
use App\Services\Content\ContentSites;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Promoting pages (spec 2026-10-20 §4.2, §4.5): managers preview and start a promotion (one job per page on the `ai`
 * queue) and stop it; everyone reads how it stands. One promotion at a time per brand.
 */
class PromotionController extends Controller
{
    public function __construct(private ContentAiGate $gate)
    {
    }

    public function preview(Request $request): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $profile = ContentContext::requireProfile();
        $plan = ContentPromotions::prepare($request, $profile, self::site((int) $profile->id))['plan'];
        $dates = array_column($plan['posts'], 'date');

        return response()->json([
            'wanted'     => $plan['wanted'],
            'fit'        => $plan['fit'],
            'first_date' => $dates === [] ? null : min($dates),
            'last_date'  => $dates === [] ? null : max($dates),
            'weeks'      => count(array_unique(array_map(fn (string $date) => CarbonImmutable::parse($date)->format('o-W'), $dates))),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $this->gate->allow($request->attributes->get('workspace_org'));
        $profile = ContentContext::requireProfile();
        $site = self::site((int) $profile->id);
        $prepared = ContentPromotions::prepare($request, $profile, $site);
        $plan = $prepared['plan'];
        if ($plan['fit'] < $plan['wanted']) {
            throw new ContentRefused('period_too_short', "Only {$plan['fit']} of {$plan['wanted']} posts fit in these days.", 422, ['fit' => $plan['fit'], 'wanted' => $plan['wanted']]);
        }
        $userId = (int) $request->user()->id;
        $first = DB::transaction(function () use ($site, $profile, $prepared, $userId) {
            $locked = ContentSite::whereKey($site->id)->lockForUpdate()->firstOrFail();
            if (ContentSites::scanning($locked)) {
                throw new ContentRefused('scan_running', 'The website is being read. Promote when it is done.', 409);
            }
            if (ContentPromotions::running((int) $profile->id)) {
                throw new ContentRefused('already_promoting', 'A promotion is already being written for this brand.', 409);
            }
            ContentPromotions::markStale((int) $profile->id);
            $batch = (string) Str::uuid();
            $first = null;
            foreach ($prepared['pages'] as $page) {
                $slots = array_values(array_map(
                    fn (array $post) => ['platform' => $post['platform'], 'date' => $post['date'], 'time' => $post['time']],
                    array_filter($prepared['plan']['posts'], fn (array $post) => $post['page'] === (int) $page->id),
                ));
                $row = ContentPromotion::create([
                    'brand_id' => $profile->brand_id, 'planner_profile_id' => $profile->id, 'site_page_id' => $page->id,
                    'batch' => $batch, 'status' => 'queued', 'posts_wanted' => count($slots), 'slots' => $slots,
                    'instructions' => $prepared['instructions'], 'use_picture' => $prepared['use_picture'], 'created_by' => $userId,
                ]);
                $first ??= $row;
            }

            return $first;
        });
        try {
            WritePromotionPosts::dispatch((int) $first->id);
        } catch (\Throwable $e) {
            report($e);
            ContentPromotion::where('batch', $first->batch)->where('status', 'queued')
                ->update(['status' => 'failed', 'error' => 'promotion_failed', 'finished_at' => now()]);
            throw new ContentRefused('promotion_failed', 'The promotion could not start. Please try again.', 500);
        }
        $state = ContentPromotions::describe((int) $profile->id);

        return response()->json($state, $state['status'] === 'running' ? 202 : 200);
    }

    public function current(): JsonResponse
    {
        $profile = ContentContext::profile();

        return response()->json($profile ? ContentPromotions::describe((int) $profile->id) : ['status' => 'idle']);
    }

    public function stop(Request $request): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $profile = ContentContext::requireProfile();
        ContentPromotions::stop((int) $profile->id);

        return response()->json(ContentPromotions::describe((int) $profile->id));
    }

    private static function site(int $profileId): ContentSite
    {
        return ContentSites::of($profileId) ?? throw new ContentRefused('page_not_found', 'Scan the website first.', 404);
    }
}
```

In `routes/api.php`, after the `site/scan` route:

```php
                Route::post('promotions/preview', [\App\Http\Controllers\Api\V1\Admin\Content\PromotionController::class, 'preview']);
                Route::post('promotions', [\App\Http\Controllers\Api\V1\Admin\Content\PromotionController::class, 'store']);
                Route::get('promotions/current', [\App\Http\Controllers\Api\V1\Admin\Content\PromotionController::class, 'current']);
                Route::delete('promotions/current', [\App\Http\Controllers\Api\V1\Admin\Content\PromotionController::class, 'stop']);
```

- [ ] **Step 4: Run it to see it pass**

Run: `$WS/php.sh tests/Feature/Content/PromotionTest.php tests/Feature/QueueRetryAfterTest.php`
Expected: `Tests: 14 passed`, `Tests: 4 passed`.

- [ ] **Step 5: Commit**

```bash
git add app/Services/Content/ContentPromotions.php app/Jobs/WritePromotionPosts.php app/Http/Controllers/Api/V1/Admin/Content/PromotionController.php routes/api.php tests/Feature/Content/PromotionTest.php tests/Feature/QueueRetryAfterTest.php
git commit -m "Content promotions: preview, start one page per job on the ai queue, follow and stop"
```

---

### Task 10: Each page's numbers, removing drafts, the panel's "Promotes", copies

**Files:**
- Modify: `app/Http/Controllers/Api/V1/Admin/Content/SiteController.php` (`destroyPagePosts`), `routes/api.php`, `app/Services/Content/ContentPostPresenter.php` (`promotes`), `app/Services/Content/ContentPromotions.php` (`promotes()`), `app/Services/Content/ContentVersions.php` / `app/Services/Content/ContentRepeat.php` (`site_page_id` in `COPIED`)
- Test: `tests/Feature/Content/PromotionPagesTest.php`

**Interfaces:**
- Consumes: `ContentSites::stats/page` (Task 6), `ContentPromotions::DRAFTS/running` (Task 9), `ContentVersions::unlink`, `PostController::ATTEMPTS`.
- Produces: `DELETE site/pages/{id}/posts` → `{removed, kept, page}`; `ContentPromotions::promotes(ContentPlannerPost): ?array{id, title, url}`; `GET posts/{id}` → `promotes`.

- [ ] **Step 1: Write the failing test**

`tests/Feature/Content/PromotionPagesTest.php`:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentLink;
use App\Models\ContentPlannerPost;
use App\Models\ContentPromotion;
use App\Models\ContentSite;
use App\Models\ContentSitePage;
use App\Services\Content\ContentLinks;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** What each page shows, undoing a promotion, and posts that keep their page (spec 2026-10-20 §4.6, §4.7). */
class PromotionPagesTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    private ContentSitePage $page;
    private ContentSitePage $other;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
        $site = ContentSite::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'url' => 'https://lumiere.example', 'status' => 'ready', 'scanned_at' => now()]);
        foreach (['autumn', 'winter'] as $slug) {
            $url = "https://lumiere.example/blog/{$slug}";
            $pages[] = ContentSitePage::create(['site_id' => $site->id, 'brand_id' => $this->brandId, 'url' => $url, 'url_hash' => hash('sha256', $url),
                'kind' => 'article', 'title' => ucfirst($slug), 'last_seen_at' => now()]);
        }
        [$this->page, $this->other] = $pages;
    }

    private function promoPost(string $status, ?ContentSitePage $page = null): ContentPlannerPost
    {
        $post = $this->makePost(['site_page_id' => ($page ?? $this->page)->id, 'status' => $status, 'generated_by' => 'promotion']);
        ContentLinks::set($post, ($page ?? $this->page)->url);

        return $post;
    }

    public function test_each_page_shows_its_posts_published_clicks_and_last_promotion(): void
    {
        $published = $this->promoPost('published');
        $this->promoPost('draft');
        $this->promoPost('archived');
        $link = ContentLink::withoutGlobalScopes()->where('post_id', $published->id)->first();
        DB::table('content_link_clicks')->insert([
            ['link_id' => $link->id, 'day' => '2026-10-04', 'via' => 'direct', 'clicks' => 5],
            ['link_id' => $link->id, 'day' => '2026-10-05', 'via' => 'bio', 'clicks' => 2],
        ]);

        $pages = collect($this->asStaffMember()->getJson($this->api('site'))->assertOk()->json('pages'))->keyBy('id');
        $this->assertSame(2, $pages[$this->page->id]['posts']);
        $this->assertSame(1, $pages[$this->page->id]['published']);
        $this->assertSame(7, $pages[$this->page->id]['clicks']);
        $this->assertNotNull($pages[$this->page->id]['last_promoted_at']);
        $this->assertSame(0, $pages[$this->other->id]['posts']);
    }

    public function test_remove_draft_posts_deletes_only_the_pages_unfinished_promotion_posts(): void
    {
        $drafts = [$this->promoPost('draft'), $this->promoPost('idea'), $this->promoPost('needs_review'), $this->promoPost('needs_visual')];
        $approved = $this->promoPost('approved');
        $this->promoPost('published');
        $otherPage = $this->promoPost('draft', $this->other);

        $this->asManager()->deleteJson($this->api("site/pages/{$this->page->id}/posts"))->assertOk()
            ->assertJsonPath('removed', 4)
            ->assertJsonPath('kept', 2)
            ->assertJsonPath('page.id', $this->page->id)
            ->assertJsonPath('page.posts', 2);
        foreach ($drafts as $post) {
            $this->assertNull(ContentPlannerPost::find($post->id));
            // Its short link keeps working (release 5b): the row stays, without its post.
            $this->assertNotNull(ContentLink::withoutGlobalScopes()->where('destination', $this->page->url)->whereNull('post_id')->first());
        }
        $this->assertNotNull($approved->fresh());
        $this->assertNotNull($otherPage->fresh());
    }

    public function test_only_managers_remove_drafts_and_not_while_a_promotion_runs(): void
    {
        $this->asStaffMember()->deleteJson($this->api("site/pages/{$this->page->id}/posts"))->assertStatus(403);
        $this->asManager()->deleteJson($this->api('site/pages/999999/posts'))->assertStatus(404)->assertJsonPath('error', 'not_found');

        ContentPromotion::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'site_page_id' => $this->page->id,
            'batch' => 'b', 'status' => 'queued', 'posts_wanted' => 1, 'slots' => []]);
        $this->asManager()->deleteJson($this->api("site/pages/{$this->page->id}/posts"))->assertStatus(409)->assertJsonPath('error', 'already_promoting');
    }

    public function test_the_panel_says_which_page_a_post_promotes(): void
    {
        $post = $this->promoPost('draft');

        $this->asStaffMember()->getJson($this->api("posts/{$post->id}"))->assertOk()
            ->assertJsonPath('post.promotes', ['id' => $this->page->id, 'title' => 'Autumn', 'url' => 'https://lumiere.example/blog/autumn']);
        $this->asStaffMember()->getJson($this->api('posts/' . $this->makePost()->id))->assertOk()->assertJsonPath('post.promotes', null);
    }

    public function test_versions_repeat_copies_and_duplicates_keep_the_page(): void
    {
        $post = $this->promoPost('draft');

        $versions = $this->asManager()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin'], 'ai' => false])->assertCreated()->json('versions');
        $this->assertSame($this->page->id, (int) ContentPlannerPost::find($versions[0]['id'])->site_page_id);

        $copies = $this->asManager()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-21', 'ai_rewrite' => false])->assertCreated()->json('copies');
        $this->assertSame($this->page->id, (int) ContentPlannerPost::find($copies[0]['id'])->site_page_id);

        $duplicate = $this->asManager()->postJson($this->api("posts/{$post->id}/duplicate"))->assertCreated()->json('post');
        $this->assertSame($this->page->id, (int) ContentPlannerPost::find($duplicate['id'])->site_page_id);
        $this->assertSame('promote-autumn', ContentLink::withoutGlobalScopes()->where('post_id', $duplicate['id'])->first()->utm['utm_campaign']);
    }
}
```

- [ ] **Step 2: Run it to see it fail**

Run: `$WS/php.sh tests/Feature/Content/PromotionPagesTest.php`
Expected: FAIL — the delete route 404s (method not allowed / not found), `promotes` missing, versions and repeat copies without `site_page_id`.

- [ ] **Step 3: Write the code**

In `app/Services/Content/ContentPromotions.php`, add:

```php
    /** The page a post promotes, for the panel (spec §4.7); null for any other post. @return array{id: int, title: string, url: string}|null */
    public static function promotes(ContentPlannerPost $post): ?array
    {
        if (!$post->site_page_id) {
            return null;
        }
        $page = ContentSitePage::withoutGlobalScopes()->whereKey($post->site_page_id)->first(['id', 'title', 'url']);

        return $page === null ? null : ['id' => (int) $page->id, 'title' => (string) $page->title, 'url' => (string) $page->url];
    }
```

In `app/Services/Content/ContentPostPresenter.php` `detail()`, after `'link' => ContentLinks::describe($post),`:

```php
            // The website page a promotion post promotes (spec 2026-10-20 §4.7).
            'promotes'          => ContentPromotions::promotes($post),
```

In `app/Services/Content/ContentVersions.php` and `app/Services/Content/ContentRepeat.php`, add `'site_page_id',` at the end of `COPIED` (after `'poster_id',`).

In `app/Http/Controllers/Api/V1/Admin/Content/SiteController.php`, add the imports `App\Models\ContentPlannerPost`, `App\Models\ContentSitePage`, `App\Services\Content\ContentPromotions`, `App\Services\Content\ContentVersions` and the action:

```php
    /** Remove draft posts (spec §4.6, §D12): the page's promotion posts not yet approved, deleted as one post is. */
    public function destroyPagePosts(Request $request, int $id): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $profile = ContentContext::requireProfile();
        $site = ContentSites::of((int) $profile->id);
        $page = $site === null ? null : ContentSitePage::where('site_id', $site->id)->whereKey($id)->first();
        if ($page === null) {
            throw new ContentRefused('not_found', 'This page is no longer in the list.', 404);
        }
        if (ContentPromotions::running((int) $profile->id)) {
            throw new ContentRefused('already_promoting', 'Wait until the promotion being written is done.', 409);
        }
        $removed = 0;
        foreach (ContentPlannerPost::where('site_page_id', $page->id)->whereIn('status', ContentPromotions::DRAFTS)->get() as $post) {
            try {
                // As deleting one post: out of its group first (its short link stays, release 5b).
                DB::transaction(function () use ($post) {
                    ContentVersions::unlink($post);
                    $post->delete();
                }, PostController::ATTEMPTS);
                $removed++;
            } catch (ContentRefused) {
                // Deleted meanwhile.
            }
        }
        $kept = ContentPlannerPost::where('site_page_id', $page->id)->where('status', '!=', 'archived')->count();
        $stats = ContentSites::stats([(int) $page->id]);

        return response()->json(['removed' => $removed, 'kept' => $kept, 'page' => ContentSites::page($page, $stats[(int) $page->id] ?? null, $site)]);
    }
```

In `routes/api.php`, after the `site/scan` route:

```php
                Route::delete('site/pages/{id}/posts', [\App\Http\Controllers\Api\V1\Admin\Content\SiteController::class, 'destroyPagePosts'])->whereNumber('id');
```

- [ ] **Step 4: Run it to see it pass**

Run: `$WS/php.sh tests/Feature/Content/PromotionPagesTest.php tests/Feature/Content/VersionsTest.php tests/Feature/Content/RepeatTest.php`
Expected: `Tests: 5 passed`, and the versions and repeat suites still green. (If a suite file is named differently, run `ls tests/Feature/Content | grep -i -E "version|repeat"` and use those.)

- [ ] **Step 5: Commit**

```bash
git add app/Http/Controllers/Api/V1/Admin/Content/SiteController.php routes/api.php app/Services/Content/ContentPostPresenter.php app/Services/Content/ContentPromotions.php app/Services/Content/ContentVersions.php app/Services/Content/ContentRepeat.php tests/Feature/Content/PromotionPagesTest.php
git commit -m "Content promotions: each page's numbers, remove its draft posts, the panel's page, copies keep it"
```

---

### Task 11: The runbook and the regression run

**Files:**
- Modify: `docs/content-workspace.md`

- [ ] **Step 1: Document release 6 in the runbook**

In `docs/content-workspace.md`, add rows to the endpoint table for `GET/PUT site`, `POST site/scan`, `DELETE site/pages/{id}/posts`, `POST promotions/preview`, `POST promotions`, `GET/DELETE promotions/current`, and a section before "What this release does not do":

```markdown
## Release 6: promote your website (2026-10-20)

- **The scan** (`POST site/scan`, managers; `ScanContentWebsite` on the `ai` queue, `tries` 1, `timeout` 600): robots.txt
  (`HexaTechContentBot`), then its sitemaps or the usual ones, else the home page's feed, links and blog page; reads up to
  30 pages and the 100 newest articles, one at a time, for at most 420 s; public addresses only (every DNS answer checked,
  the connection pinned with `CURLOPT_RESOLVE`, each redirect checked again); HTML 3 MB, XML 10 MB, pictures 5 MB; 20 scans
  per organisation a day (`RateLimiter` key `content:site-scan:{org}`). A scan token per press: a late job writes nothing.
- **The company summary** (one AI call, feature `content`, type `website_summary`): kept on `content_sites.summary`, read by
  `ContextBuilder` ("FROM THE BRAND'S WEBSITE") in every Content AI call; fills `brand_summary`, `usp`, `mission` only where
  empty. A manager's edit (`PUT site`) sets `summary_edited`, and a scan then keeps it unless `update_summary` is sent.
- **Promotions** (`POST promotions`, managers): `PromotionSchedule` spreads the posts (ideal day + nearest free slot,
  channels taking turns, the weekly pace); one `content_promotions` row per page, one `WritePromotionPosts` job per row
  (chained, `ai` queue); each post is a draft with `generated_by = promotion`, `site_page_id`, its own short link
  (`utm_campaign = promote-{page}`), the link after the text except on Instagram and TikTok, and the page's picture copied
  once into the media store. A batch reads failed after 660 s of one job or 1,800 s without progress.
- **Undo:** `DELETE site/pages/{id}/posts` removes the page's promotion posts in idea, draft, needs review, needs visual.
- **Checks:** `php artisan tinker --execute="App\Models\ContentSite::count()"`; a stuck scan reads failed on its own; a
  stuck promotion too (the next press marks its rows failed).
```

Add to "After the deploy (owner, signed in)":

```markdown
- Release 6: on the Brand page, enter the website and Scan; check the article list and the company summary on the
  Promote page; promote one article with 2 posts on one channel for the next two weeks; open a post (Promotes line, short
  link, picture); then Remove draft posts on that article.
```

- [ ] **Step 2: Run every Content suite folder by folder**

Run: `$WS/php.sh tests/Feature/Content tests/Unit/Content tests/Unit/Content/Web tests/Feature/QueueRetryAfterTest.php`
Expected: every line `Tests: N passed` (no failures).

- [ ] **Step 3: Commit**

```bash
git add docs/content-workspace.md
git commit -m "Content runbook: release 6 — the website scan, the company summary and promotions"
```

---

### Task 12: One language, and the untyped addresses read (found on the owner's site)

A read-only discovery run on `https://hexa-tech.uk` (2026-10-20) found 180 sitemap addresses, 30 per language
(`/`, `/fr/`, `/de/`, `/it/`, `/es/`, `/ru/`), articles at the root without a blog folder (`/how-to-reduce-no-shows`,
which declares `og:type=article` and JSON-LD `BlogPosting`), and the 30-page budget spent on language copies, so no
article was found. Spec §3.3 now says: keep the given address's language; read the home and key pages (≤ 30), then the
100 newest articles, then the other addresses newest first, up to 130 reads; a page that says it is an article is one.

**Files:**
- Modify: `app/Services/Content/Web/UrlRules.php` (`languagePrefix`), `app/Services/Content/ContentSiteDiscovery.php` (`blogPath`, `find`, `classify`, `oneLanguage`), `app/Services/Content/ContentSiteScan.php` (`MAX_READS`)
- Test: `tests/Unit/Content/Web/UrlRulesTest.php`, `tests/Feature/Content/SiteScanTest.php`

**Interfaces:**
- Produces: `UrlRules::languagePrefix(string $url): ?string` (the first path segment when it is a language code, `xx` or `xx-yy`); `ContentSiteDiscovery::blogPath()` answers null for a language folder alone; `ContentSiteScan::MAX_READS = 130`.

- [ ] **Step 1: Write the failing tests** — in `UrlRulesTest`, `test_a_language_folder_is_known_by_its_code` (`/fr/about` → `fr`, `/pt-BR/` → `pt-br`, `/about`, `/`, `/xx/page` → null); in `SiteScanTest`, `test_language_copies_are_skipped_and_untyped_addresses_say_what_they_are` (a sitemap with `/`, `/about-us`, `/how-to-reduce-no-shows` and their `/fr/` copies; the article page declares `og:type=article`: listed article `/how-to-reduce-no-shows` dated from its page, pages `/` and `/about-us`, nothing under `/fr/` asked for), `test_an_address_naming_a_language_scans_that_language` (address `…/fr/`: pages `/fr/` and `/fr/about-us` only), `test_untyped_addresses_fill_the_reads_left_after_pages_and_articles` (home + 140 dated untyped addresses: 130 listed, the newest kept, the oldest not).

- [ ] **Step 2: Run them to see them fail** — `$WS/php.sh tests/Unit/Content/Web/UrlRulesTest.php tests/Feature/Content/SiteScanTest.php`.

- [ ] **Step 3: Write the code** — `UrlRules::LANGUAGES` (ISO 639-1 codes) and `languagePrefix()`; `blogPath()` null for a language folder alone; `find()` passes `UrlRules::languagePrefix($address)` to `classify()`; `classify()` first keeps one language (`oneLanguage()`: the given folder's addresses, or for the bare site those without a folder when any exist besides the home page; otherwise all), adds the home page only for the bare site, then answers the key pages (rank < 20, ≤ 30), the 100 newest articles, and the other addresses newest first in the reads left of `ContentSiteScan::MAX_READS` (130).

- [ ] **Step 4: Run them to see them pass, then the Content folders** — `Tests: 8 passed`, `Tests: 18 passed`; `$WS/php.sh tests/Feature/Content tests/Unit/Content` green; the read-only discovery against `https://hexa-tech.uk` (scratchpad `discover.php`) lists the 30 unprefixed addresses.

- [ ] **Step 5: Commit** — "Content website scan: one language per scan; untyped addresses read and typed by their own page".

