# Landing-Page Builder — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A published landing page renders at `https://sites.hexa-tech.uk/{slug}`, built from one designed template and the tenant's existing data, with no admin UI.

**Architecture:** A dedicated host serves server-rendered Blade. Routes live in a `Route::domain()` group so the admin SPA is never reachable there — that origin separation is the security control, not a nicety. Structured content (services, team, reviews, contact, hours) is queried live at render; bespoke copy and image choices are stored on the page row. A section with no data is omitted from the document entirely.

**Tech Stack:** Laravel 13, Blade, plain CSS (no build step, no libraries), Postgres in production / sqlite in tests, PHPUnit.

**Spec:** `docs/superpowers/specs/2026-08-21-landing-page-builder-design.md`
Appendices: `…-appendix-a-integration.md` (subsystem map, file:line), `…-appendix-b-templates.md` (template build spec).

---

## Global Constraints

- **No raw echoes.** Not one `{!! !!}` in any landing view. `resources/views` currently contains zero; keep it.
- **No external requests** except Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`). No CDN scripts, no libraries.
- **No build step.** Template CSS is a static file under `public/landing/`.
- **Colours** reaching CSS go through `App\Support\CssColor::safe()` — already shipped.
- **Tenancy** comes from `App\Traits\BelongsToOrganization` + `App\Traits\BelongsToBrand`. Never hand-roll an `organization_id` where clause on a model that has the trait.
- **Tests** use `DatabaseTransactions` + a `SetsUpMinimalSchema` composition. **Never `RefreshDatabase`** — the 137 production migrations do not run on sqlite.
- **Body text contrast ≥ 4.5:1.** Appendix B §4.2 gives measured ratios; `--brand` (#9B5C8F) is 4.49:1 and is therefore banned for text under 24px — use `--brand-deep` (#7E4874).
- **Two local hazards:** the full `php artisan test` run segfaults — run per-directory. And local PHP is 8.3.6 while `symfony/var-dumper` calls `ReflectionProperty::isVirtual()` (8.4+), so a *failing* test crashes the reporter instead of naming the failure. If a test fails and you see `Caster.php:198`, that is the reporter dying, not your test. Reproduce outside PHPUnit to see the real error.

### Corrections to Appendix B — apply these, they override it

Appendix B was written before two decisions and contains one unverified claim.

1. **Reviews filter on `is_featured`**, not "comment not null". Staff choose what appears (spec §5.3). Appendix B §3.1 predates that.
2. **Opening hours come from `ChatWidgetConfig.business_hours`**, not `Property.settings['opening_hours']`. Appendix B claims the latter is "verified against the repo"; `grep -rn opening_hours app/ database/` returns **nothing**. It does not exist.

---

## File Structure

| File | Responsibility |
|---|---|
| `database/migrations/…_create_landing_pages_table.php` | `landing_pages`, `landing_page_sections`, `landing_page_redirects` |
| `database/migrations/…_add_is_featured_to_review_submissions.php` | one column + index |
| `app/Models/LandingPage.php` | the page row, tenancy, status |
| `app/Models/LandingPageSection.php` | per-section toggle + copy |
| `app/Support/LandingSlug.php` | slug normalisation, validation, reserved words |
| `app/Landing/IndustryProfile.php` | per-industry vocabulary and defaults |
| `app/Landing/Profiles/BeautyProfile.php` | the `beauty` profile |
| `app/Landing/PageContent.php` | assembles the live view-model; owns `hasData()` |
| `app/Http/Controllers/Landing/LandingPageController.php` | public render + preview |
| `app/Http/Middleware/LandingPageSecurity.php` | CSP + headers, no session |
| `config/landing.php` | host, reserved slugs, cache TTL |
| `resources/views/landing/ruled_page/*.blade.php` | layout + one file per section |
| `public/landing/ruled_page.css` | the template's stylesheet |
| `tests/Feature/Landing/*` | routing, isolation, omission, headers |

---

## Task 1: Tables and models

**Files:**
- Create: `database/migrations/2026_08_21_100000_create_landing_pages_table.php`
- Create: `app/Models/LandingPage.php`, `app/Models/LandingPageSection.php`
- Create: `tests/Feature/Landing/LandingPageModelTest.php`
- Create: `tests/Concerns/SetsUpLandingSchema.php`

**Interfaces:**
- Produces: `LandingPage` with `$fillable` below, `scopePublished()`, `sections()` hasMany; `LandingPageSection` with `enabled`, `sort`, `content`.

- [ ] **Step 1: Write the failing test**

```php
<?php
namespace Tests\Feature\Landing;

use App\Models\LandingPage;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

class LandingPageModelTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
    }

    public function test_a_page_belongs_to_an_org_and_brand(): void
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1,
            'slug' => 'glamour-salon', 'template_key' => 'ruled_page',
            'industry' => 'beauty', 'status' => 'draft',
        ]);

        $this->assertSame('glamour-salon', $page->fresh()->slug);
        $this->assertSame('draft', $page->fresh()->status);
    }

    public function test_published_scope_excludes_drafts(): void
    {
        // A draft reachable at the public URL would publish work in progress.
        LandingPage::create(['organization_id' => 1, 'brand_id' => 1, 'slug' => 'draft-one',
            'template_key' => 'ruled_page', 'industry' => 'beauty', 'status' => 'draft']);
        LandingPage::create(['organization_id' => 1, 'brand_id' => 1, 'slug' => 'live-one',
            'template_key' => 'ruled_page', 'industry' => 'beauty', 'status' => 'published',
            'published_at' => now()]);

        $slugs = LandingPage::withoutGlobalScopes()->published()->pluck('slug')->all();

        $this->assertSame(['live-one'], $slugs);
    }

    public function test_json_columns_round_trip_as_arrays(): void
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1, 'slug' => 'json-test',
            'template_key' => 'ruled_page', 'industry' => 'beauty', 'status' => 'draft',
            'theme' => ['font_pair' => 'fraunces_inter', 'logo_media_id' => 12],
            'seo'   => ['title' => 'Glamour Salon'],
        ]);

        $this->assertSame('fraunces_inter', $page->fresh()->theme['font_pair']);
        $this->assertSame('Glamour Salon', $page->fresh()->seo['title']);
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `php artisan test tests/Feature/Landing/LandingPageModelTest.php`
Expected: FAIL — `Class "App\Models\LandingPage" not found`.

- [ ] **Step 3: Write the migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pages a tenant publishes at sites.hexa-tech.uk/{slug}.
 *
 * Only bespoke copy lives here. Services, staff, reviews, hours and contact
 * details are queried live from the tables that already hold them, so a price
 * change is correct on the website immediately and nothing has to be kept in
 * step by hand.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('landing_pages', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_id')->index();
            $table->unsignedBigInteger('brand_id')->nullable()->index();

            // Globally unique, not per-tenant: /{slug} is one shared namespace
            // across every tenant, so two salons cannot both own "glamour".
            $table->string('slug', 63)->unique();

            $table->string('template_key', 40);

            // Snapshot at creation rather than a live read of the org, so
            // switching industry later cannot silently re-word a live page.
            $table->string('industry', 32);

            $table->string('status', 16)->default('draft')->index();
            $table->timestamp('published_at')->nullable();
            $table->timestamp('first_published_at')->nullable();

            $table->json('theme')->nullable();
            $table->json('content')->nullable();
            $table->json('seo')->nullable();

            $table->timestamps();

            // One page per brand. A multi-brand tenant gets one each, which is
            // the natural unit; a second page per brand has no meaning yet.
            $table->unique(['organization_id', 'brand_id'], 'landing_pages_org_brand_unique');
        });

        Schema::create('landing_page_sections', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('landing_page_id')->index();
            $table->string('key', 32);
            $table->boolean('enabled')->default(true);

            // Stored rather than read from the template manifest, so revising a
            // template cannot reorder someone's already-published page.
            $table->integer('sort')->default(0);

            $table->json('content')->nullable();
            $table->timestamps();

            $table->unique(['landing_page_id', 'key']);
        });

        Schema::create('landing_page_redirects', function (Blueprint $table) {
            $table->id();
            $table->string('slug', 63)->unique();
            $table->unsignedBigInteger('landing_page_id')->index();
            $table->timestamp('expires_at')->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('landing_page_redirects');
        Schema::dropIfExists('landing_page_sections');
        Schema::dropIfExists('landing_pages');
    }
};
```

- [ ] **Step 4: Write the models**

```php
<?php
namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class LandingPage extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    public const STATUS_DRAFT     = 'draft';
    public const STATUS_PUBLISHED = 'published';

    protected $fillable = [
        'organization_id', 'brand_id', 'slug', 'template_key', 'industry',
        'status', 'published_at', 'first_published_at', 'theme', 'content', 'seo',
    ];

    protected $casts = [
        'theme'              => 'array',
        'content'            => 'array',
        'seo'                => 'array',
        'published_at'       => 'datetime',
        'first_published_at' => 'datetime',
    ];

    public function sections(): HasMany
    {
        return $this->hasMany(LandingPageSection::class)->orderBy('sort');
    }

    public function scopePublished($query)
    {
        return $query->where('status', self::STATUS_PUBLISHED);
    }

    public function isPublished(): bool
    {
        return $this->status === self::STATUS_PUBLISHED;
    }
}
```

```php
<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LandingPageSection extends Model
{
    protected $fillable = ['landing_page_id', 'key', 'enabled', 'sort', 'content'];

    protected $casts = [
        'enabled' => 'boolean',
        'sort'    => 'integer',
        'content' => 'array',
    ];

    public function page(): BelongsTo
    {
        return $this->belongsTo(LandingPage::class, 'landing_page_id');
    }
}
```

- [ ] **Step 5: Write the test schema concern**

`landing_pages` is not in `SetsUpMinimalSchema`. Add a sibling that composes it, matching the repo's existing pattern.

```php
<?php
namespace Tests\Concerns;

use Illuminate\Support\Facades\Schema;

/**
 * Landing-page tables on top of the minimal set.
 *
 * The repo builds tables per test rather than running the production
 * migrations, which use Postgres-only features and do not survive sqlite.
 */
trait SetsUpLandingSchema
{
    use SetsUpMinimalSchema;

    protected function setUpLandingSchema(): void
    {
        $this->setUpMinimalSchema();

        if (!Schema::hasTable('landing_pages')) {
            Schema::create('landing_pages', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('brand_id')->nullable();
                $table->string('slug', 63)->unique();
                $table->string('template_key', 40);
                $table->string('industry', 32);
                $table->string('status', 16)->default('draft');
                $table->timestamp('published_at')->nullable();
                $table->timestamp('first_published_at')->nullable();
                // TEXT, not json: sqlite has no jsonb, and the model's array
                // cast reads either identically.
                $table->text('theme')->nullable();
                $table->text('content')->nullable();
                $table->text('seo')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('landing_page_sections')) {
            Schema::create('landing_page_sections', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('landing_page_id');
                $table->string('key', 32);
                $table->boolean('enabled')->default(true);
                $table->integer('sort')->default(0);
                $table->text('content')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('landing_page_redirects')) {
            Schema::create('landing_page_redirects', function ($table) {
                $table->bigIncrements('id');
                $table->string('slug', 63)->unique();
                $table->unsignedBigInteger('landing_page_id');
                $table->timestamp('expires_at')->nullable();
                $table->timestamps();
            });
        }
    }
}
```

- [ ] **Step 6: Run the tests**

Run: `php artisan test tests/Feature/Landing/LandingPageModelTest.php`
Expected: PASS, 3 tests.

- [ ] **Step 7: Commit**

```bash
git add database/migrations/2026_08_21_100000_create_landing_pages_table.php \
        app/Models/LandingPage.php app/Models/LandingPageSection.php \
        tests/Concerns/SetsUpLandingSchema.php tests/Feature/Landing/LandingPageModelTest.php
git commit -m "Add landing page tables and models"
```

---

## Task 2: Slug rules

A slug is the tenant's public address and lives in a namespace shared with every other tenant and with our own routes. Getting this wrong means either a collision or a customer whose printed URL 404s.

**Files:**
- Create: `app/Support/LandingSlug.php`, `config/landing.php`
- Create: `tests/Unit/Support/LandingSlugTest.php`

**Interfaces:**
- Produces: `LandingSlug::normalise(string): string`, `LandingSlug::isReserved(string): bool`, `LandingSlug::isValid(string): bool`.

- [ ] **Step 1: Write the failing test**

```php
<?php
namespace Tests\Unit\Support;

use App\Support\LandingSlug;
use Tests\TestCase;

class LandingSlugTest extends TestCase
{
    public function test_it_normalises_what_a_person_would_type(): void
    {
        $this->assertSame('glamour-salon', LandingSlug::normalise('  Glamour Salon  '));
        $this->assertSame('cafe-mimi', LandingSlug::normalise('Café Mimi'));
        $this->assertSame('a-b', LandingSlug::normalise('a---b'));
    }

    public function test_it_rejects_shapes_that_break_a_url(): void
    {
        $this->assertFalse(LandingSlug::isValid('ab'));                 // too short
        $this->assertFalse(LandingSlug::isValid(str_repeat('a', 64)));  // too long
        $this->assertFalse(LandingSlug::isValid('-leading'));
        $this->assertFalse(LandingSlug::isValid('trailing-'));
        $this->assertFalse(LandingSlug::isValid('Has Spaces'));
        $this->assertFalse(LandingSlug::isValid('under_score'));
        $this->assertTrue(LandingSlug::isValid('glamour-salon'));
    }

    public function test_it_reserves_our_own_words(): void
    {
        // A tenant owning "admin" or "api" on the public host would shadow a
        // route we may need, and "beauty" would read as one of our brands.
        foreach (['api', 'admin', 'login', 'spa', 'assets', 'storage', 'www', 'sites', 'beauty', 'medical'] as $word) {
            $this->assertTrue(LandingSlug::isReserved($word), "{$word} should be reserved");
        }

        $this->assertFalse(LandingSlug::isReserved('glamour-salon'));
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `php artisan test tests/Unit/Support/LandingSlugTest.php`
Expected: FAIL — class not found.

- [ ] **Step 3: Write `config/landing.php`**

```php
<?php

return [
    /*
    | The host landing pages are served from. It must NEVER serve the admin
    | SPA: the admin keeps a non-expiring, all-abilities Sanctum token in
    | localStorage, which same-origin JavaScript can read. Separating the
    | origin is what reduces an XSS on customer content from a full tenant
    | compromise to a defaced page.
    */
    'host' => env('LANDING_HOST', 'sites.hexa-tech.uk'),

    /*
    | Words a tenant may not take. Our own path segments, plus every industry
    | id, which would otherwise read as one of our sub-brands.
    */
    'reserved_slugs' => [
        'api', 'admin', 'login', 'logout', 'register', 'spa', 'assets', 'storage',
        'www', 'sites', 'app', 'static', 'public', 'health', 'status', 'robots',
        'sitemap', 'favicon', 'preview', 'privacy', 'terms',
    ],

    /** Seconds a published page may be cached. Short, and revalidating. */
    'cache_ttl' => env('LANDING_CACHE_TTL', 300),
];
```

- [ ] **Step 4: Write `LandingSlug`**

```php
<?php
namespace App\Support;

use App\Models\Organization;
use Illuminate\Support\Str;

/**
 * A landing-page slug is the tenant's public address, in a namespace shared
 * with every other tenant and with our own route prefixes.
 */
final class LandingSlug
{
    public const MIN = 3;
    public const MAX = 63;

    public static function normalise(string $value): string
    {
        // Str::slug transliterates, so "Café Mimi" becomes "cafe-mimi" rather
        // than losing the word.
        return Str::slug(trim($value), '-');
    }

    public static function isValid(string $value): bool
    {
        if (strlen($value) < self::MIN || strlen($value) > self::MAX) {
            return false;
        }

        return (bool) preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $value);
    }

    public static function isReserved(string $value): bool
    {
        $reserved = array_map('strtolower', config('landing.reserved_slugs', []));

        // Industry ids come from the model rather than being copied here; a
        // second hand-maintained list is how the two drift apart.
        $industries = array_map('strtolower', Organization::INDUSTRIES);

        return in_array(strtolower($value), array_merge($reserved, $industries), true);
    }
}
```

- [ ] **Step 5: Run the tests**

Run: `php artisan test tests/Unit/Support/LandingSlugTest.php`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add app/Support/LandingSlug.php config/landing.php tests/Unit/Support/LandingSlugTest.php
git commit -m "Add landing slug rules and reserved words"
```

---

## Task 3: Review curation column

Reviews must not appear on a customer's website until someone chooses them. There is no approval concept in the codebase today, so this adds the smallest one that works.

**Files:**
- Create: `database/migrations/2026_08_21_101000_add_is_featured_to_review_submissions.php`
- Modify: `app/Models/ReviewSubmission.php`
- Create: `tests/Feature/Landing/FeaturedReviewTest.php`

**Interfaces:**
- Produces: `ReviewSubmission::scopeFeatured()`, cast `is_featured => bool`.

- [ ] **Step 1: Write the failing test**

```php
<?php
namespace Tests\Feature\Landing;

use App\Models\ReviewSubmission;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

class FeaturedReviewTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();

        if (!Schema::hasTable('review_submissions')) {
            Schema::create('review_submissions', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('form_id')->nullable();
                $table->integer('overall_rating')->nullable();
                $table->text('comment')->nullable();
                $table->string('anonymous_name')->nullable();
                $table->boolean('is_featured')->default(false);
                $table->timestamp('submitted_at')->nullable();
                $table->timestamps();
            });
        }
    }

    public function test_nothing_is_featured_by_default(): void
    {
        // The default must be off. A default of on would publish every past
        // review the moment the column ships.
        $review = ReviewSubmission::create([
            'organization_id' => 1, 'overall_rating' => 5,
            'comment' => 'Wonderful', 'submitted_at' => now(),
        ]);

        $this->assertFalse((bool) $review->fresh()->is_featured);
    }

    public function test_the_featured_scope_returns_only_chosen_reviews(): void
    {
        ReviewSubmission::create(['organization_id' => 1, 'overall_rating' => 5,
            'comment' => 'Chosen', 'is_featured' => true, 'submitted_at' => now()]);
        ReviewSubmission::create(['organization_id' => 1, 'overall_rating' => 1,
            'comment' => 'Waited 40 minutes', 'submitted_at' => now()]);

        $comments = ReviewSubmission::withoutGlobalScopes()->featured()->pluck('comment')->all();

        $this->assertSame(['Chosen'], $comments);
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `php artisan test tests/Feature/Landing/FeaturedReviewTest.php`
Expected: FAIL — `Call to undefined method …::featured()`.

- [ ] **Step 3: Write the migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which reviews a venue has chosen to show on its own website.
 *
 * Nothing here decides whether a review is good; it records that a human
 * picked it. Defaults to false so shipping this column publishes nothing.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('review_submissions', function (Blueprint $table) {
            $table->boolean('is_featured')->default(false);
            $table->index(['organization_id', 'is_featured'], 'review_submissions_org_featured_idx');
        });
    }

    public function down(): void
    {
        Schema::table('review_submissions', function (Blueprint $table) {
            $table->dropIndex('review_submissions_org_featured_idx');
            $table->dropColumn('is_featured');
        });
    }
};
```

- [ ] **Step 4: Update the model**

In `app/Models/ReviewSubmission.php`, add `'is_featured'` to `$fillable`, add `'is_featured' => 'boolean'` to `$casts`, and add:

```php
    /**
     * Reviews a venue has chosen to display publicly.
     *
     * Deliberately not "rating >= 4": presenting a filtered subset as though
     * it were all reviews is an unfair commercial practice under UK CMA and
     * EU consumer rules. A person chooses, and the page says so.
     */
    public function scopeFeatured($query)
    {
        return $query->where('is_featured', true);
    }
```

- [ ] **Step 5: Run the tests**

Run: `php artisan test tests/Feature/Landing/FeaturedReviewTest.php`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add database/migrations/2026_08_21_101000_add_is_featured_to_review_submissions.php \
        app/Models/ReviewSubmission.php tests/Feature/Landing/FeaturedReviewTest.php
git commit -m "Let venues choose which reviews appear publicly"
```

---

## Task 4: Industry profile

**Files:**
- Create: `app/Landing/IndustryProfile.php`, `app/Landing/Profiles/BeautyProfile.php`
- Create: `tests/Unit/Landing/IndustryProfileTest.php`

**Interfaces:**
- Produces: `IndustryProfile::for(string $industry): IndustryProfile`, with public readonly `servicesLabel`, `peopleLabel`, `primaryCta`, `accent`, `defaultSections` (array of section keys enabled by default).

- [ ] **Step 1: Write the failing test**

```php
<?php
namespace Tests\Unit\Landing;

use App\Landing\IndustryProfile;
use App\Models\Organization;
use Tests\TestCase;

class IndustryProfileTest extends TestCase
{
    public function test_beauty_uses_beauty_vocabulary(): void
    {
        $p = IndustryProfile::for('beauty');

        $this->assertSame('Treatments', $p->servicesLabel);
        $this->assertSame('Therapists', $p->peopleLabel);
        $this->assertSame('Book appointment', $p->primaryCta);
    }

    public function test_an_alias_resolves_to_its_canonical_industry(): void
    {
        // Organization::INDUSTRY_ALIASES already maps hospitality -> restaurant.
        // Resolving through the model keeps one taxonomy rather than two.
        $this->assertSame(
            IndustryProfile::for('restaurant')->servicesLabel,
            IndustryProfile::for('hospitality')->servicesLabel,
        );
    }

    public function test_an_unknown_industry_falls_back_rather_than_throwing(): void
    {
        // A page must render even if an org carries an industry we never
        // authored a profile for.
        $this->assertNotEmpty(IndustryProfile::for('nonsense')->servicesLabel);
    }

    public function test_every_profile_key_is_a_real_industry_id(): void
    {
        // The failure this prevents: a profile keyed "spa" or "salon" that no
        // organization can ever match, so it silently never applies.
        foreach (array_keys(IndustryProfile::all()) as $key) {
            $this->assertContains($key, Organization::INDUSTRIES,
                "'{$key}' is not in Organization::INDUSTRIES, so no org can ever resolve to it.");
        }
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `php artisan test tests/Unit/Landing/IndustryProfileTest.php`
Expected: FAIL — class not found.

- [ ] **Step 3: Write `IndustryProfile`**

```php
<?php
namespace App\Landing;

use App\Models\Organization;

/**
 * Per-industry vocabulary and defaults layered over a template.
 *
 * A template is a design; it does not know what a business calls the things it
 * sells. A spa and a clinic can choose the same template and get different
 * pages because this layer supplies the words.
 *
 * Keys are ids from Organization::INDUSTRIES. A profile keyed anything else
 * could never match an organization, so a test asserts that.
 */
final class IndustryProfile
{
    private function __construct(
        public readonly string $industry,
        public readonly string $servicesLabel,
        public readonly string $peopleLabel,
        public readonly string $primaryCta,
        public readonly string $accent,
        public readonly array  $defaultSections,
    ) {}

    /** @return array<string, array<string, mixed>> */
    public static function all(): array
    {
        return [
            'beauty' => [
                'servicesLabel' => 'Treatments',
                'peopleLabel'   => 'Therapists',
                'primaryCta'    => 'Book appointment',
                'accent'        => '#9B5C8F',
                'defaultSections' => ['hero', 'services', 'about', 'team', 'reviews', 'booking', 'contact'],
            ],
        ];
    }

    public static function for(?string $industry): self
    {
        // Normalising through the model means aliases such as "hospitality"
        // resolve the same way here as everywhere else in the platform.
        $id = Organization::normaliseIndustry($industry) ?: Organization::DEFAULT_INDUSTRY;

        $all = self::all();

        // Falling back to beauty rather than throwing: an org carrying an
        // industry we have not authored yet must still get a page.
        $data = $all[$id] ?? $all['beauty'];

        return new self(
            industry:        $id,
            servicesLabel:   $data['servicesLabel'],
            peopleLabel:     $data['peopleLabel'],
            primaryCta:      $data['primaryCta'],
            accent:          $data['accent'],
            defaultSections: $data['defaultSections'],
        );
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `php artisan test tests/Unit/Landing/IndustryProfileTest.php`
Expected: PASS, 4 tests.

**If `test_an_alias_resolves…` fails**, check `Organization::normaliseIndustry()` exists and is public; Appendix A confirms it, but confirm the signature before adapting.

- [ ] **Step 5: Commit**

```bash
git add app/Landing/ tests/Unit/Landing/IndustryProfileTest.php
git commit -m "Add industry profiles for landing templates"
```

---

## Task 5: The live content resolver

This is the heart of the feature and the place tenancy can leak. It assembles everything a template renders and owns the rule that an empty section is omitted.

**Files:**
- Create: `app/Landing/PageContent.php`
- Create: `tests/Feature/Landing/PageContentTest.php`

**Interfaces:**
- Consumes: `LandingPage`, `IndustryProfile` (Task 4).
- Produces: `PageContent::for(LandingPage $page): self` with public readonly `services`, `team`, `reviews`, `reviewStats`, `contact`, `hours`, `profile`; and `has(string $sectionKey): bool`.

- [ ] **Step 1: Write the failing test**

```php
<?php
namespace Tests\Feature\Landing;

use App\Landing\PageContent;
use App\Models\LandingPage;
use App\Models\ReviewSubmission;
use App\Models\Service;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

class PageContentTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();   // services, service_masters, review_submissions, properties
    }

    private function page(int $orgId = 1): LandingPage
    {
        return LandingPage::create([
            'organization_id' => $orgId, 'brand_id' => 1, 'slug' => 'org-' . $orgId,
            'template_key' => 'ruled_page', 'industry' => 'beauty', 'status' => 'published',
        ]);
    }

    public function test_it_never_returns_another_tenants_services(): void
    {
        // The worst failure available here: one salon's page listing another
        // salon's treatments and prices.
        Service::create(['organization_id' => 1, 'name' => 'Ours',   'is_active' => true, 'price' => 40]);
        Service::create(['organization_id' => 2, 'name' => 'Theirs', 'is_active' => true, 'price' => 50]);

        $content = PageContent::for($this->page(1));

        $this->assertSame(['Ours'], $content->services->pluck('name')->all());
    }

    public function test_inactive_services_are_not_advertised(): void
    {
        Service::create(['organization_id' => 1, 'name' => 'Live',    'is_active' => true,  'price' => 40]);
        Service::create(['organization_id' => 1, 'name' => 'Retired', 'is_active' => false, 'price' => 40]);

        $this->assertSame(['Live'], PageContent::for($this->page(1))->services->pluck('name')->all());
    }

    public function test_only_featured_reviews_are_shown(): void
    {
        ReviewSubmission::create(['organization_id' => 1, 'overall_rating' => 5,
            'comment' => 'Chosen', 'is_featured' => true, 'submitted_at' => now()]);
        ReviewSubmission::create(['organization_id' => 1, 'overall_rating' => 1,
            'comment' => 'Complaint', 'submitted_at' => now()]);

        $this->assertSame(['Chosen'], PageContent::for($this->page(1))->reviews->pluck('comment')->all());
    }

    public function test_the_aggregate_counts_every_review_not_only_featured_ones(): void
    {
        // Showing "4.9 from 2 reviews" while hiding thirty poor ones would be
        // a fabricated aggregate. The score is computed over everything.
        foreach ([5, 5, 4, 1, 2] as $i => $rating) {
            ReviewSubmission::create(['organization_id' => 1, 'overall_rating' => $rating,
                'comment' => 'c' . $i, 'is_featured' => $rating === 5, 'submitted_at' => now()]);
        }

        $stats = PageContent::for($this->page(1))->reviewStats;

        $this->assertSame(5, $stats['count']);
        $this->assertSame(3.4, round($stats['average'], 1));
    }

    public function test_the_aggregate_is_suppressed_below_four_reviews(): void
    {
        // A distribution drawn from three rows is misleading, and the first
        // week is exactly when the temptation to show one is strongest.
        foreach ([5, 5, 4] as $i => $rating) {
            ReviewSubmission::create(['organization_id' => 1, 'overall_rating' => $rating,
                'comment' => 'c' . $i, 'is_featured' => true, 'submitted_at' => now()]);
        }

        $this->assertNull(PageContent::for($this->page(1))->reviewStats);
    }

    public function test_a_section_with_no_data_reports_no_data(): void
    {
        $content = PageContent::for($this->page(1));

        $this->assertFalse($content->has('services'));
        $this->assertFalse($content->has('team'));
        $this->assertFalse($content->has('reviews'));
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `php artisan test tests/Feature/Landing/PageContentTest.php`
Expected: FAIL — `Class "App\Landing\PageContent" not found`.

You also need `setUpLandingContentSchema()`. Add it to `Tests\Concerns\SetsUpLandingSchema`:

```php
    /** The tables a landing page reads live. Columns follow each model's $fillable. */
    protected function setUpLandingContentSchema(): void
    {
        if (!Schema::hasTable('services')) {
            Schema::create('services', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('brand_id')->nullable();
                $table->unsignedBigInteger('category_id')->nullable();
                $table->string('name');
                $table->string('slug')->nullable();
                $table->text('description')->nullable();
                $table->text('short_description')->nullable();
                $table->integer('duration_minutes')->nullable();
                $table->decimal('price', 10, 2)->nullable();
                $table->string('currency', 8)->nullable();
                $table->string('image')->nullable();
                $table->text('gallery')->nullable();
                $table->integer('sort_order')->default(0);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('service_masters')) {
            Schema::create('service_masters', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('brand_id')->nullable();
                $table->string('name');
                $table->string('title')->nullable();
                $table->text('bio')->nullable();
                $table->string('avatar')->nullable();
                $table->text('specialties')->nullable();
                $table->integer('sort_order')->default(0);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('review_submissions')) {
            Schema::create('review_submissions', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('form_id')->nullable();
                $table->integer('overall_rating')->nullable();
                $table->text('comment')->nullable();
                $table->string('anonymous_name')->nullable();
                $table->boolean('is_featured')->default(false);
                $table->timestamp('submitted_at')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('properties')) {
            Schema::create('properties', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('brand_id')->nullable();
                $table->string('name');
                $table->string('email')->nullable();
                $table->string('phone')->nullable();
                $table->string('address')->nullable();
                $table->string('city')->nullable();
                $table->string('country')->nullable();
                $table->string('timezone')->nullable();
                $table->text('settings')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        // chat_widget_configs holds business_hours, the only customer-facing
        // opening hours the platform has. See the corrections at the top.
        if (!Schema::hasTable('chat_widget_configs')) {
            Schema::create('chat_widget_configs', function ($table) {
                $table->bigIncrements('id');
                $table->unsignedBigInteger('organization_id');
                $table->unsignedBigInteger('brand_id')->nullable();
                $table->text('business_hours')->nullable();
                $table->timestamps();
            });
        }
    }
```

- [ ] **Step 3: Write `PageContent`**

```php
<?php
namespace App\Landing;

use App\Models\ChatWidgetConfig;
use App\Models\LandingPage;
use App\Models\Property;
use App\Models\ReviewSubmission;
use App\Models\Service;
use App\Models\ServiceMaster;
use Illuminate\Support\Collection;

/**
 * Everything a landing template renders, assembled once per request.
 *
 * Templates never query. They receive this object, which is the only place
 * that knows where content lives — so moving a source touches one file, and a
 * template cannot accidentally read across a tenant boundary.
 */
final class PageContent
{
    private function __construct(
        public readonly LandingPage     $page,
        public readonly IndustryProfile $profile,
        public readonly Collection      $services,
        public readonly Collection      $team,
        public readonly Collection      $reviews,
        public readonly ?array          $reviewStats,
        public readonly ?Property       $contact,
        public readonly ?array          $hours,
    ) {}

    /** Fewer than this many reviews and no aggregate is shown at all. */
    public const MIN_REVIEWS_FOR_AGGREGATE = 4;

    public static function for(LandingPage $page): self
    {
        $orgId   = $page->organization_id;
        $brandId = $page->brand_id;

        $scope = fn ($query) => $query->withoutGlobalScopes()
            ->where('organization_id', $orgId);

        $services = $scope(Service::query())
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get();

        $team = $scope(ServiceMaster::query())
            ->where('is_active', true)
            ->orderBy('sort_order')
            ->get();

        $reviews = $scope(ReviewSubmission::query())
            ->where('is_featured', true)
            ->whereNotNull('comment')
            ->latest('submitted_at')
            ->limit(12)
            ->get();

        $contact = $scope(Property::query())->first();

        return new self(
            page:        $page,
            profile:     IndustryProfile::for($page->industry),
            services:    $services,
            team:        $team,
            reviews:     $reviews,
            reviewStats: self::aggregate($orgId),
            contact:     $contact,
            hours:       self::hours($orgId, $brandId),
        );
    }

    /**
     * Computed over EVERY review, not only the featured ones. Averaging the
     * chosen subset would be a fabricated score.
     */
    private static function aggregate(int $orgId): ?array
    {
        $rows = ReviewSubmission::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->whereNotNull('overall_rating')
            ->pluck('overall_rating');

        if ($rows->count() < self::MIN_REVIEWS_FOR_AGGREGATE) {
            return null;
        }

        return [
            'count'        => $rows->count(),
            'average'      => round($rows->avg(), 2),
            'distribution' => collect(range(1, 5))
                ->mapWithKeys(fn ($star) => [$star => $rows->filter(fn ($r) => (int) $r === $star)->count()])
                ->all(),
        ];
    }

    /**
     * Opening hours come from the chat widget's own business hours — the only
     * customer-facing hours the platform holds. crm_settings.business_hours_
     * profile is the STAFF WORKDAY and must never be published as opening
     * hours. Property.settings['opening_hours'] does not exist, despite what
     * Appendix B claims.
     */
    private static function hours(int $orgId, ?int $brandId): ?array
    {
        $config = ChatWidgetConfig::withoutGlobalScopes()
            ->where('organization_id', $orgId)
            ->when($brandId, fn ($q) => $q->where('brand_id', $brandId))
            ->first();

        $hours = $config?->business_hours;

        return is_array($hours) && $hours !== [] ? $hours : null;
    }

    /**
     * Whether a section has anything to show. A section that would render
     * empty is omitted from the document entirely — on a live customer site
     * that is the difference between considered and broken.
     */
    public function has(string $sectionKey): bool
    {
        return match ($sectionKey) {
            'services' => $this->services->isNotEmpty(),
            'team'     => $this->team->isNotEmpty(),
            'reviews'  => $this->reviews->isNotEmpty(),
            'contact'  => $this->contact !== null
                && (filled($this->contact->address) || filled($this->contact->phone)),
            'about'    => filled($this->page->content['about']['body'] ?? null),
            'hero', 'booking', 'footer' => true,
            default    => false,
        };
    }
}
```

- [ ] **Step 4: Run the tests**

Run: `php artisan test tests/Feature/Landing/PageContentTest.php`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add app/Landing/PageContent.php tests/Feature/Landing/PageContentTest.php tests/Concerns/SetsUpLandingSchema.php
git commit -m "Assemble landing page content from live tenant data"
```

---

## Task 6: Security headers middleware

**Files:**
- Create: `app/Http/Middleware/LandingPageSecurity.php`
- Modify: `bootstrap/app.php` (register the alias `landing.security`)
- Create: `tests/Feature/Landing/LandingSecurityHeadersTest.php`

**Interfaces:**
- Produces: middleware alias `landing.security`; a per-request nonce available to views as `$cspNonce`.

- [ ] **Step 1: Write the failing test**

```php
<?php
namespace Tests\Feature\Landing;

use Tests\TestCase;

class LandingSecurityHeadersTest extends TestCase
{
    private function host(): string
    {
        return config('landing.host');
    }

    public function test_the_page_carries_a_real_content_security_policy(): void
    {
        // The application ships no security-header middleware at all today,
        // and the only CSP in the repo is `frame-ancestors *` on widget
        // routes, which restricts nothing about script execution.
        $csp = $this->get('http://' . $this->host() . '/any-slug')->headers->get('Content-Security-Policy');

        $this->assertNotNull($csp, 'No CSP on the landing host.');
        $this->assertStringContainsString("default-src 'self'", $csp);
        $this->assertStringContainsString("frame-ancestors 'none'", $csp);
        $this->assertStringNotContainsString("'unsafe-eval'", $csp);
    }

    public function test_it_sets_the_other_headers_that_cost_nothing(): void
    {
        $res = $this->get('http://' . $this->host() . '/any-slug');

        $this->assertSame('nosniff', $res->headers->get('X-Content-Type-Options'));
        $this->assertSame('strict-origin-when-cross-origin', $res->headers->get('Referrer-Policy'));
    }

    public function test_it_sets_no_session_cookie(): void
    {
        // A public marketing page must not set cookies before consent, and
        // there is no session to keep: nobody signs in here.
        $res = $this->get('http://' . $this->host() . '/any-slug');

        foreach ($res->headers->getCookies() as $cookie) {
            $this->assertNotSame(config('session.cookie'), $cookie->getName(),
                'The landing host started a session.');
        }
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `php artisan test tests/Feature/Landing/LandingSecurityHeadersTest.php`
Expected: FAIL — no CSP header (null).

- [ ] **Step 3: Write the middleware**

```php
<?php
namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * Security headers for pages built from customer-supplied content.
 *
 * The application has no security-header middleware anywhere, and the only
 * CSP in the repo is `frame-ancestors *` on the widget routes, which exists
 * to defeat the platform's edge X-Frame-Options and restricts nothing about
 * script execution. A landing page is a destination rather than an embed, so
 * it refuses framing outright.
 *
 * Styles need a nonce because each template writes a small block of
 * tenant-derived custom properties. Scripts are same-origin only; templates
 * ship no inline script.
 */
class LandingPageSecurity
{
    public function handle(Request $request, Closure $next): Response
    {
        $nonce = Str::random(24);
        $request->attributes->set('csp_nonce', $nonce);
        view()->share('cspNonce', $nonce);

        $response = $next($request);

        $csp = implode('; ', [
            "default-src 'self'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'none'",
            "object-src 'none'",
            "script-src 'self'",
            "style-src 'self' 'nonce-{$nonce}' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data: https:",
            "connect-src 'self'",
        ]);

        $response->headers->set('Content-Security-Policy', $csp);
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('X-Frame-Options', 'DENY');

        return $response;
    }
}
```

- [ ] **Step 4: Register the alias**

In `bootstrap/app.php`, alongside the existing `'feature' => \App\Http\Middleware\RequireFeature::class`, add:

```php
            'landing.security' => \App\Http\Middleware\LandingPageSecurity::class,
```

- [ ] **Step 5: Run the tests**

Run: `php artisan test tests/Feature/Landing/LandingSecurityHeadersTest.php`
Expected: the header tests PASS. The cookie test also passes once Task 7 registers the routes without `StartSession`; if it fails now, it will pass after Task 7 — note it and continue.

- [ ] **Step 6: Commit**

```bash
git add app/Http/Middleware/LandingPageSecurity.php bootstrap/app.php \
        tests/Feature/Landing/LandingSecurityHeadersTest.php
git commit -m "Add security headers for the landing host"
```

---

## Task 7: Routing on the dedicated host

**Files:**
- Create: `routes/landing.php`
- Modify: `bootstrap/app.php` (load the route file)
- Modify: `routes/web.php` (constrain the SPA catch-all)
- Create: `app/Http/Controllers/Landing/LandingPageController.php`
- Create: `tests/Feature/Landing/LandingRoutingTest.php`

**Interfaces:**
- Consumes: `LandingPage` (Task 1), `PageContent` (Task 5), `landing.security` (Task 6).
- Produces: named routes `landing.show`, `landing.preview`.

- [ ] **Step 1: Write the failing test**

```php
<?php
namespace Tests\Feature\Landing;

use App\Models\LandingPage;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

class LandingRoutingTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();
    }

    private function host(): string
    {
        return config('landing.host');
    }

    private function make(string $slug, string $status): LandingPage
    {
        return LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1, 'slug' => $slug,
            'template_key' => 'ruled_page', 'industry' => 'beauty', 'status' => $status,
            'published_at' => $status === 'published' ? now() : null,
        ]);
    }

    public function test_a_published_page_renders(): void
    {
        $this->make('glamour-salon', 'published');

        $this->get('http://' . $this->host() . '/glamour-salon')->assertOk();
    }

    public function test_a_draft_is_not_reachable_publicly(): void
    {
        // Publishing work in progress by accident is the failure here.
        $this->make('not-ready', 'draft');

        $this->get('http://' . $this->host() . '/not-ready')->assertNotFound();
    }

    public function test_an_unknown_slug_is_a_404_not_an_error(): void
    {
        $this->get('http://' . $this->host() . '/nobody')->assertNotFound();
    }

    public function test_the_admin_spa_is_not_served_on_the_landing_host(): void
    {
        // This is the entire security control. If the SPA renders here, the
        // admin's non-expiring localStorage token becomes same-origin with
        // customer-supplied content.
        $body = $this->get('http://' . $this->host() . '/login')->getContent();

        $this->assertStringNotContainsString('id="root"', $body,
            'The admin SPA shell is being served on the landing host.');
    }

    public function test_the_landing_host_does_not_serve_the_api(): void
    {
        $this->get('http://' . $this->host() . '/api/v1/admin/me')->assertNotFound();
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `php artisan test tests/Feature/Landing/LandingRoutingTest.php`
Expected: FAIL — the published page 404s, and the SPA test fails because `/{any}` currently serves the shell on every host.

- [ ] **Step 3: Write `routes/landing.php`**

```php
<?php

use App\Http\Controllers\Landing\LandingPageController;
use Illuminate\Support\Facades\Route;

/*
 * Public landing pages, on their own host.
 *
 * The host separation is the security control: the admin SPA keeps a
 * non-expiring, all-abilities Sanctum token in localStorage, and localStorage
 * is per-origin. Nothing here may ever serve the admin.
 *
 * These routes deliberately do NOT run the `web` middleware group. No session
 * is started, so no cookie is set before a visitor has consented to anything,
 * and there is no session for an XSS to ride.
 */
Route::domain(config('landing.host'))
    ->middleware(['landing.security', 'throttle:120,1,landing-page'])
    ->group(function () {
        Route::get('/{slug}', [LandingPageController::class, 'show'])
            ->where('slug', '[a-z0-9-]+')
            ->name('landing.show');

        Route::get('/preview/{page}', [LandingPageController::class, 'preview'])
            ->middleware('signed')
            ->name('landing.preview');
    });
```

- [ ] **Step 4: Load the route file and constrain the SPA**

In `bootstrap/app.php`, in the routing configuration, add `then:` (or extend the existing `web:` registration) to load `routes/landing.php`.

Then in `routes/web.php`, constrain the SPA catch-all so it cannot answer on the landing host. Both the `/{any}` route (around line 565) and the `/` route get:

```php
})->where('any', '…existing regex…')->domain(config('app.admin_host', parse_url(config('app.url'), PHP_URL_HOST)));
```

**Simpler and safer alternative, preferred:** leave the catch-all alone and instead have it 404 when the request host matches `config('landing.host')`. One condition, no regex change:

```php
Route::get('/{any}', function (\Illuminate\Http\Request $request) {
    // The landing host serves customer content only. Serving the admin shell
    // here would put a non-expiring admin token on the same origin as
    // customer-supplied markup.
    abort_if($request->getHost() === config('landing.host'), 404);

    $spaPath = public_path('spa/index.html');
    // …unchanged…
```

- [ ] **Step 5: Write the controller**

```php
<?php
namespace App\Http\Controllers\Landing;

use App\Http\Controllers\Controller;
use App\Landing\PageContent;
use App\Models\LandingPage;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class LandingPageController extends Controller
{
    public function show(string $slug): Response
    {
        // withoutGlobalScopes: there is no authenticated tenant on a public
        // request, so the tenant scope would match nothing. The slug is the
        // lookup key and it is globally unique.
        $page = LandingPage::withoutGlobalScopes()
            ->published()
            ->where('slug', $slug)
            ->first();

        abort_if($page === null, 404);

        return $this->render($page)
            ->header('Cache-Control', 'public, max-age=' . config('landing.cache_ttl') . ', must-revalidate');
    }

    /** Signed URL, so a draft can be shown to its owner and nobody else. */
    public function preview(Request $request, int $page): Response
    {
        $model = LandingPage::withoutGlobalScopes()->find($page);

        abort_if($model === null, 404);

        return $this->render($model)
            ->header('Cache-Control', 'no-store')
            ->header('X-Robots-Tag', 'noindex');
    }

    private function render(LandingPage $page): Response
    {
        $content = PageContent::for($page);

        return response()->view('landing.' . $page->template_key . '.layout', [
            'page'     => $page,
            'content'  => $content,
            'profile'  => $content->profile,
            'sections' => $page->sections,
        ]);
    }
}
```

- [ ] **Step 6: Run the tests**

Run: `php artisan test tests/Feature/Landing/`
Expected: PASS. The template view does not exist yet, so `test_a_published_page_renders` will fail on a missing view — that is Task 8. Confirm the other four pass, then continue.

- [ ] **Step 7: Commit**

```bash
git add routes/landing.php bootstrap/app.php routes/web.php \
        app/Http/Controllers/Landing/LandingPageController.php \
        tests/Feature/Landing/LandingRoutingTest.php
git commit -m "Serve landing pages from their own host"
```

---

## Task 8: The `ruled_page` template — shell

Full design in Appendix B §4. This task builds the layout, tokens and section-omission wrapper; Task 9 fills the sections.

**Files:**
- Create: `resources/views/landing/ruled_page/layout.blade.php`
- Create: `public/landing/ruled_page.css`
- Create: `tests/Feature/Landing/RuledPageRenderTest.php`

**Interfaces:**
- Consumes: `$page`, `$content` (PageContent), `$profile`, `$sections`, `$cspNonce`.

- [ ] **Step 1: Write the failing test**

```php
<?php
namespace Tests\Feature\Landing;

use App\Models\LandingPage;
use App\Models\Service;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

class RuledPageRenderTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        $this->setUpLandingContentSchema();
    }

    private function published(): LandingPage
    {
        $page = LandingPage::create([
            'organization_id' => 1, 'brand_id' => 1, 'slug' => 'glamour-salon',
            'template_key' => 'ruled_page', 'industry' => 'beauty', 'status' => 'published',
            'published_at' => now(),
            'content' => ['hero' => ['headline' => 'The Art of Wellness']],
        ]);
        foreach (['hero', 'services', 'about', 'team', 'reviews', 'booking', 'contact'] as $i => $key) {
            $page->sections()->create(['key' => $key, 'enabled' => true, 'sort' => $i]);
        }
        return $page;
    }

    private function body(): string
    {
        return $this->get('http://' . config('landing.host') . '/glamour-salon')->getContent();
    }

    public function test_it_renders_the_customers_own_headline(): void
    {
        $this->published();

        $this->assertStringContainsString('The Art of Wellness', $this->body());
    }

    public function test_a_section_with_no_data_is_absent_not_empty(): void
    {
        // No services exist, so there must be no services section at all —
        // not a heading over blank space.
        $this->published();

        $this->assertStringNotContainsString('data-section="services"', $this->body());
    }

    public function test_a_section_with_data_appears(): void
    {
        $this->published();
        Service::create(['organization_id' => 1, 'name' => 'Signature Facial',
            'is_active' => true, 'price' => 65, 'duration_minutes' => 60]);

        $body = $this->body();

        $this->assertStringContainsString('data-section="services"', $body);
        $this->assertStringContainsString('Signature Facial', $body);
    }

    public function test_it_uses_the_industry_vocabulary(): void
    {
        $this->published();
        Service::create(['organization_id' => 1, 'name' => 'Facial', 'is_active' => true, 'price' => 65]);

        // A salon sells Treatments, not "Services".
        $this->assertStringContainsString('Treatments', $this->body());
    }

    public function test_the_template_contains_no_raw_echoes(): void
    {
        // Blade's {!! !!} on customer content is how this page would become an
        // XSS. resources/views contains zero today; keep it that way.
        foreach (glob(resource_path('views/landing/ruled_page/*.blade.php')) as $file) {
            $this->assertStringNotContainsString('{!!', file_get_contents($file),
                basename($file) . ' uses a raw echo.');
        }
    }
}
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `php artisan test tests/Feature/Landing/RuledPageRenderTest.php`
Expected: FAIL — `View [landing.ruled_page.layout] not found`.

- [ ] **Step 3: Write the layout**

```blade
<!doctype html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{{ $page->seo['title'] ?? $content->contact?->name ?? config('app.name') }}</title>
<meta name="description" content="{{ $page->seo['description'] ?? '' }}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,600&family=Inter:wght@400;500;600&display=swap">
<link rel="stylesheet" href="{{ asset('landing/ruled_page.css') }}">
{{-- Only tenant-derived custom properties are inline, and they carry the
     request nonce. Every colour is normalised by CssColor::safe first, so
     nothing here can close the declaration it sits in. --}}
<style nonce="{{ $cspNonce }}">
  :root{
    --brand: {{ \App\Support\CssColor::safe($page->theme['brand_color'] ?? null, $profile->accent) }};
  }
</style>
</head>
<body class="rp">

@foreach ($sections as $section)
  @continue(! $section->enabled)
  @continue(! $content->has($section->key))
  @include('landing.ruled_page.sections.' . $section->key, [
    'section' => $section,
    'copy'    => $page->content[$section->key] ?? [],
  ])
@endforeach

@include('landing.ruled_page.sections.footer')
</body>
</html>
```

- [ ] **Step 4: Write the stylesheet**

Create `public/landing/ruled_page.css` beginning with the token block copied **verbatim** from Appendix B §4.2 (reproduced at the top of this plan's Global Constraints for the contrast floors). Then the base rules:

```css
*,*::before,*::after{box-sizing:border-box}
body.rp{margin:0;background:var(--paper);color:var(--text);
  font-family:Inter,system-ui,sans-serif;font-size:17px;line-height:1.6}
h1,h2,h3{font-family:Fraunces,Georgia,serif;font-weight:300;
  font-variation-settings:'opsz' 144,'SOFT' 0,'WONK' 0;letter-spacing:-.01em;margin:0}
.rp section{padding:var(--pad) var(--gutter)}
.rp .wrap{max-width:var(--maxw);margin:0 auto}
/* Surface rhythm without a server pass: an ink band following an ink band
   collapses the seam. Appendix B 3.7. */
.band--ink{background:var(--ink);color:var(--on-ink)}
.band--ink + .band--ink{padding-top:var(--pad-seam)}
a{color:var(--brand-deep)}                    /* never --brand: 4.49:1 fails */
:focus-visible{outline:2px solid var(--focus-core);outline-offset:3px;
  box-shadow:0 0 0 6px var(--brand-halo)}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
```

- [ ] **Step 5: Create a minimal hero section so the layout renders**

`resources/views/landing/ruled_page/sections/hero.blade.php`:

```blade
<section data-section="hero" class="rp-hero">
  <div class="wrap">
    <h1>{{ $copy['headline'] ?? $content->contact?->name ?? '' }}</h1>
    @if (filled($copy['subtext'] ?? null))
      <p class="rp-hero__sub">{{ $copy['subtext'] }}</p>
    @endif
    <a class="rp-cta" href="#booking">{{ $profile->primaryCta }}</a>
  </div>
</section>
```

And a placeholder `footer.blade.php` containing only the legal line, so the layout's final include resolves.

- [ ] **Step 6: Run the tests**

Run: `php artisan test tests/Feature/Landing/RuledPageRenderTest.php`
Expected: the headline, omission and raw-echo tests PASS. The services and vocabulary tests fail until Task 9.

- [ ] **Step 7: Commit**

```bash
git add resources/views/landing/ruled_page/ public/landing/ruled_page.css \
        tests/Feature/Landing/RuledPageRenderTest.php
git commit -m "Add the ruled_page layout shell and tokens"
```

---

## Task 9: The `ruled_page` sections

Build the remaining sections one at a time, each in its own file under `resources/views/landing/ruled_page/sections/`. Take each section's layout, signature treatment and no-data behaviour from **Appendix B §4.5**, which specifies desktop and mobile for every one.

Order, and the data each consumes:

| Section | Data | Absent when |
|---|---|---|
| `services` | `$content->services` — `name`, `short_description ?? description`, `duration_minutes`, `price`, `currency`, `image` | no active services |
| `about` | `$copy['body']`, `$copy['image_id']` | body empty |
| `team` | `$content->team` — `name`, `title`, `avatar`, `specialties` | no active practitioners |
| `reviews` | `$content->reviews` + `$content->reviewStats` | no featured reviews |
| `booking` | the booking widget embed (Appendix A §4.2) | never |
| `contact` | `$content->contact`, `$content->hours` | no address and no phone |

For each section, one cycle:

- [ ] **Write a test** asserting it renders its data, and is absent without it
- [ ] **Run it, confirm it fails**
- [ ] **Write the Blade + its CSS block**
- [ ] **Run it, confirm it passes**
- [ ] **Commit**

### The worked example: `services`

Build this one first and copy its shape. It is the most complex section, and
every other one is a reduction of it.

`resources/views/landing/ruled_page/sections/services.blade.php`:

```blade
<section data-section="services" class="rp-services">
  <div class="wrap">
    {{-- The profile supplies the word. A salon sells Treatments, a clinic
         sells Procedures. The template hardcodes neither. --}}
    <h2 class="rp-services__title">{{ $copy['heading'] ?? $profile->servicesLabel }}</h2>

    <ul class="rp-services__list">
      @foreach ($content->services as $service)
        <li class="rp-service">
          <div class="rp-service__head">
            <h3 class="rp-service__name">{{ $service->name }}</h3>
            {{-- Dot leaders are drawn in CSS, never typed, so a long name
                 cannot break the alignment. --}}
            <span class="rp-service__leader" aria-hidden="true"></span>
            @if ($service->price !== null)
              <span class="rp-service__price">
                {{ number_format((float) $service->price, 2) }}
                {{ $service->currency ?? $content->contact?->currency }}
              </span>
            @endif
          </div>

          @if (filled($service->short_description ?: $service->description))
            <p class="rp-service__desc">{{ $service->short_description ?: $service->description }}</p>
          @endif

          @if ($service->duration_minutes)
            <p class="rp-service__meta">{{ $service->duration_minutes }} min</p>
          @endif
        </li>
      @endforeach
    </ul>
  </div>
</section>
```

Its tests:

```php
public function test_services_render_with_price_and_duration(): void
{
    $this->published();
    Service::create(['organization_id' => 1, 'name' => 'Signature Facial', 'is_active' => true,
        'price' => 65, 'currency' => 'EUR', 'duration_minutes' => 60,
        'short_description' => 'Sixty minutes of quiet']);

    $body = $this->body();

    $this->assertStringContainsString('Signature Facial', $body);
    $this->assertStringContainsString('65.00', $body);
    $this->assertStringContainsString('60 min', $body);
    $this->assertStringContainsString('Sixty minutes of quiet', $body);
}

public function test_a_service_without_a_price_still_renders(): void
{
    // Price on request is normal in this industry. A null price must not
    // print a zero or a bare currency code.
    $this->published();
    Service::create(['organization_id' => 1, 'name' => 'Consultation',
        'is_active' => true, 'price' => null]);

    $body = $this->body();

    $this->assertStringContainsString('Consultation', $body);
    $this->assertStringNotContainsString('0.00', $body);
}
```

Three rules that are easy to get wrong and matter commercially:

1. **The aggregate is suppressed below four reviews** — `$content->reviewStats` is already `null` there, so render the block only `@if($content->reviewStats)`. Do not print "0 reviews".
2. **The phone number is set at booking-heading weight**, with `tel:` in the mobile action bar. All three judges called this the sharpest commercial point in the batch.
3. **The chat launcher is repositioned, never restyled.** Its offsets are written inline by JS, so the rule needs `!important`:

```css
@media (max-width:600px){
  #htchat-launcher{bottom:calc(var(--bar-h) + 12px)!important}
}
```

---

## Task 10: SEO and structured data

**Files:**
- Modify: `resources/views/landing/ruled_page/layout.blade.php`
- Create: `tests/Feature/Landing/LandingSeoTest.php`

- [ ] **Step 1: Write the failing test**

```php
public function test_it_emits_local_business_structured_data(): void
{
    // Being findable is the entire point for a business with no website.
    $body = $this->body();

    $this->assertStringContainsString('"@type":"LocalBusiness"', $body);
    $this->assertStringContainsString('application/ld+json', $body);
}

public function test_a_preview_is_not_indexable(): void
{
    $url = \Illuminate\Support\Facades\URL::signedRoute('landing.preview', ['page' => $this->published()->id]);

    $this->get($url)->assertHeader('X-Robots-Tag', 'noindex');
}
```

- [ ] **Step 2: Run it, confirm it fails**
- [ ] **Step 3: Add to the layout `<head>`**

```blade
<meta property="og:title" content="{{ $page->seo['title'] ?? $content->contact?->name ?? '' }}">
<meta property="og:type" content="website">
<meta property="og:url" content="{{ url('/' . $page->slug) }}">
<script type="application/ld+json" nonce="{{ $cspNonce }}">
  @json([
    '@context' => 'https://schema.org',
    '@type'    => 'LocalBusiness',
    'name'     => $content->contact?->name,
    'address'  => array_filter([
        '@type'           => 'PostalAddress',
        'streetAddress'   => $content->contact?->address,
        'addressLocality' => $content->contact?->city,
        'addressCountry'  => $content->contact?->country,
    ]),
    'telephone' => $content->contact?->phone,
    'email'     => $content->contact?->email,
  ])
</script>
```

`@json` is the right tool here: it encodes with `JSON_HEX_TAG|HEX_APOS|HEX_AMP|HEX_QUOT`, so a business name containing `</script>` cannot break out. Never build this string by hand.

- [ ] **Step 4: Run the tests, confirm they pass**
- [ ] **Step 5: Commit**

---

## Task 11: Admin API and the Enterprise gate

Phase 1 has no admin UI; pages are created through the API, which still must be gated.

**Files:**
- Create: `app/Http/Controllers/Api/V1/Admin/LandingPageController.php`
- Modify: `routes/api.php`
- Create: `tests/Feature/Landing/LandingPageEntitlementTest.php`

- [ ] **Step 1: Write the failing test**

```php
public function test_the_admin_endpoints_require_the_enterprise_feature(): void
{
    $routes = collect(\Illuminate\Support\Facades\Route::getRoutes())
        ->filter(fn ($r) => str_starts_with($r->uri(), 'api/v1/admin/landing-pages'));

    $this->assertNotEmpty($routes, 'No landing-page admin routes exist.');

    foreach ($routes as $r) {
        $this->assertContains('feature:landing_pages', $r->gatherMiddleware(),
            "{$r->uri()} is reachable without the landing_pages entitlement.");
    }
}

public function test_the_public_renderer_is_not_gated(): void
{
    // A published page must not vanish because a card expired mid-month.
    $route = collect(\Illuminate\Support\Facades\Route::getRoutes())
        ->first(fn ($r) => $r->getName() === 'landing.show');

    $this->assertNotNull($route);
    $this->assertNotContains('feature:landing_pages', $route->gatherMiddleware());
}
```

- [ ] **Step 2: Run it, confirm it fails**
- [ ] **Step 3: Add the routes** inside the existing admin group in `routes/api.php`:

```php
            Route::middleware('feature:landing_pages')->prefix('landing-pages')->group(function () {
                Route::get('/',            [LandingPageController::class, 'show']);
                Route::post('/',           [LandingPageController::class, 'store']);
                Route::put('/',            [LandingPageController::class, 'update']);
                Route::post('publish',     [LandingPageController::class, 'publish']);
                Route::post('unpublish',   [LandingPageController::class, 'unpublish']);
                Route::post('preview-url', [LandingPageController::class, 'previewUrl']);
            });
```

- [ ] **Step 4: Write the controller**

```php
<?php
namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Landing\IndustryProfile;
use App\Models\LandingPage;
use App\Support\LandingSlug;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\URL;
use Illuminate\Validation\ValidationException;

class LandingPageController extends Controller
{
    /** One page per brand, so there is no index. */
    public function show(): JsonResponse
    {
        return response()->json(['page' => $this->current()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'slug'         => 'required|string|max:63',
            'template_key' => 'required|string|in:ruled_page',
        ]);

        $slug = $this->validatedSlug($data['slug']);
        $org  = $request->user()->organization;

        $page = LandingPage::create([
            'organization_id' => $org->id,
            'brand_id'        => app('current_brand_id'),
            'slug'            => $slug,
            'template_key'    => $data['template_key'],
            'industry'        => $org->resolved_industry,
            'status'          => LandingPage::STATUS_DRAFT,
        ]);

        // Seed section rows now so ordering is fixed at creation, and a later
        // template revision cannot silently reorder a published page.
        foreach (IndustryProfile::for($page->industry)->defaultSections as $i => $key) {
            $page->sections()->create(['key' => $key, 'enabled' => true, 'sort' => $i]);
        }

        return response()->json(['page' => $page->fresh('sections')], 201);
    }

    public function update(Request $request): JsonResponse
    {
        $page = $this->current();
        abort_if($page === null, 404);

        $data = $request->validate([
            'slug'    => 'sometimes|string|max:63',
            'theme'   => 'sometimes|array',
            'content' => 'sometimes|array',
            'seo'     => 'sometimes|array',
        ]);

        if (isset($data['slug'])) {
            $new = $this->validatedSlug($data['slug'], $page->id);

            if ($new !== $page->slug) {
                // The old address may be printed on a card or a shopfront, so
                // keep it working rather than 404ing it the moment it changes.
                DB::table('landing_page_redirects')->updateOrInsert(
                    ['slug' => $page->slug],
                    [
                        'landing_page_id' => $page->id,
                        'expires_at'      => now()->addDays(90),
                        'created_at'      => now(),
                        'updated_at'      => now(),
                    ],
                );
            }

            $data['slug'] = $new;
        }

        $page->update($data);

        return response()->json(['page' => $page->fresh('sections')]);
    }

    public function publish(): JsonResponse
    {
        $page = $this->current();
        abort_if($page === null, 404);

        $page->update([
            'status'             => LandingPage::STATUS_PUBLISHED,
            'published_at'       => now(),
            'first_published_at' => $page->first_published_at ?? now(),
        ]);

        return response()->json(['page' => $page->fresh()]);
    }

    public function unpublish(): JsonResponse
    {
        $page = $this->current();
        abort_if($page === null, 404);

        $page->update(['status' => LandingPage::STATUS_DRAFT]);

        return response()->json(['page' => $page->fresh()]);
    }

    /** Short-lived signed URL, so a draft is visible to its owner and nobody else. */
    public function previewUrl(): JsonResponse
    {
        $page = $this->current();
        abort_if($page === null, 404);

        return response()->json([
            'url' => URL::temporarySignedRoute('landing.preview', now()->addHours(2), ['page' => $page->id]),
        ]);
    }

    private function current(): ?LandingPage
    {
        // BelongsToOrganization scopes this. Do not add a where clause.
        return LandingPage::with('sections')->first();
    }

    private function validatedSlug(string $raw, ?int $ignoreId = null): string
    {
        $slug = LandingSlug::normalise($raw);

        if (!LandingSlug::isValid($slug)) {
            throw ValidationException::withMessages([
                'slug' => 'Use 3 to 63 letters, numbers and hyphens.',
            ]);
        }

        if (LandingSlug::isReserved($slug)) {
            throw ValidationException::withMessages(['slug' => 'That web address is reserved.']);
        }

        // Global uniqueness: /{slug} is one namespace across every tenant, so
        // this deliberately ignores tenancy scoping or it would miss clashes.
        $taken = LandingPage::withoutGlobalScopes()
            ->where('slug', $slug)
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->exists();

        if ($taken) {
            throw ValidationException::withMessages(['slug' => 'That web address is already taken.']);
        }

        return $slug;
    }
}
```

- [ ] **Step 5: Run the tests, confirm they pass**
- [ ] **Step 6: Commit**

**Do not forget:** the `landing_pages` key must also be added to the SaaS feature catalog, which is a **different repository not checked out here**, or every org will simply lack it and the gate will refuse everyone. Appendix A §3.2 has the checklist. Note also that the frontend `hasFeature` returns `true` on localhost before reading anything, so local testing proves nothing about gating.

---

## Task 12: Slug redirects

- [ ] **Step 1: Write a failing test** — after changing a slug, the old address 301s to the new one, and stops after `expires_at`.
- [ ] **Step 2: Run it, confirm it fails**
- [ ] **Step 3:** In `LandingPageController::show`, when no published page matches, look for a live `landing_page_redirects` row and `redirect()->to('/' . $target->slug, 301)`.
- [ ] **Step 4: Run it, confirm it passes**
- [ ] **Step 5: Commit**

---

## Task 13: Full verification

- [ ] **Step 1: Run every landing suite**

```bash
php artisan test tests/Feature/Landing tests/Unit/Landing tests/Unit/Support
```

- [ ] **Step 2: Run the suites this could have disturbed**

Chunked, because the full run segfaults:

```bash
for d in tests/Unit tests/Feature/Widget tests/Feature/Booking tests/Feature/Reviews \
         tests/Feature/Settings tests/Feature/Pwa tests/Feature/Security; do
  php artisan test "$d" || echo "FAILED: $d"
done
```

- [ ] **Step 3: Verify the origin separation by hand**

Start the app, then confirm `/login` on the landing host does **not** return the SPA shell, and that `Content-Security-Policy` and `X-Content-Type-Options` are present on a page response.

- [ ] **Step 4: Confirm no raw echoes anywhere**

```bash
grep -rn '{!!' resources/views/ && echo "RAW ECHO FOUND" || echo "clean"
```

- [ ] **Step 5: Commit and open the deploy branch**

Deploy via the repo's selective-deploy path: branch from `origin/main`, check out only this feature's files, verify, push. **Do not push local `main`** — it carries unshipped email work including an irreversible migration.

---

## What phase 1 deliberately does not do

No wizard, no editor, no media upload, no second or third template, no industry profile beyond `beauty`, no custom domains. Those are phases 2 to 4. Phase 1's job is to prove the risky half — origin isolation, tenancy in the public query layer, the CSP, and the section-omission contract — before any interface is built on top of it.
