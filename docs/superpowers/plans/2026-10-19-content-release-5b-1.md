# HexaTech Content — Release 5b, Plan 1: the Server for Tracked Links and the Link-in-Bio Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server half of release 5b "measure it" (spec §5, §6, §7 for 5b): a post's Link as a tracked short link on the public host that adds UTM tags and counts clicks by venue day, and a link-in-bio page per brand with the manager's buttons and the latest posts that have a link, plus its editor endpoints.

**Architecture:**
- **Short links:** Content's own `content_links` table (one row per post Link or bio button: a 7-character code, the address, the UTM tags; `destination` null = switched off) and `content_link_clicks` (one row per link, venue day and source, raised by one upsert). `ContentLinks` cleans addresses, makes codes, works out tags and the address a code sends to; `ContentLinkClicks` counts and sums. `GET /go/{code}` (`ContentPublic\GoController`) is served from `routes/landing.php` on the public host, listed in `LandingHostGuard::ALLOWED`.
- **The Link on a post:** `link` on `POST posts` / `PUT posts/{id}`, read beside the post's columns (it is not one). Saving makes the short link once; changing the address keeps the code; clearing switches it off; a new address is a change of words under approvals and moves the post's version on. Versions, repeat copies and duplicates get their own code. The panel gets `link` (code, address, clicks, the last 14 days); cards get `clicks`.
- **Link-in-bio:** `content_bio_pages` (one per Content profile) and `content_bio_buttons` (label + a tracked link). `GET /links/{name}` (`ContentPublic\BioPageController`, `ContentBioPublic`) draws a Blade page with its own same-origin stylesheet and the brand colour through the landing CSP's nonce; `GET bio` / `PUT bio` (`BioController`, `ContentBio`) read and save it. Four additive migrations. Plan 5B-2 builds the portal, runs the release checks and deploys; nothing is deployed by this plan.

**Tech Stack:** Laravel 13 on PHP 8.4.20 (tests on SQLite in memory with foreign keys on, production PostgreSQL), PHPUnit through `artisan test`, Blade, Playwright (headless shell) for one look at the public page.

**Spec:** `docs/superpowers/specs/2026-10-19-content-release-5-design.md` (approved 2026-10-19), §5, §6, §7 (5b), §8, §9. Earlier specs, still binding: `docs/superpowers/specs/2026-10-14-content-workspace-design.md`, `2026-10-15-content-release-3-design.md`, `2026-10-16-content-release-4-design.md`.

**Where things stand:** branch `feature/content-workspace` in worktree `C:\wamp64\www\Hexa-Tech-content`, tip `ceda0c4aa`. Production is release 5a: prod main `afbacf056` = the source of `670a65bed` (feature tip `ceda0c4aa`) + a build. Release 5a's ledgers and tools: `.superpowers/sdd/archive/2026-10-19-content-release-5a-1/` and `…-5a-2/`.

**The spec's "checked while planning" (§9), resolved for 5b:**
- **The brand's Content language** (switched-off link page, bio page) is `content_planner_profiles.default_language`, first two letters, when one of `en ru de fr es`; otherwise English (`ContentPublicLanguage::of`).
- **The Link is a change of words:** `ContentApproval::WORDS` holds post columns only; `beforeSave()` gains `bool $otherWords = false`, which `PostController::update` sets when the Link changes.
- **Logo and colour:** `brands.logo_url` → `organizations.logo_url` → initials; `brands.primary_color` → Content's accent (`AppointmentsBootstrap::accent`, the `primary_color` hotel setting) → `CssColor::FALLBACK` (`#2d6a4f`). Both columns exist in production; the test schema gains them in Task 4.
- **Static files on the public host:** anything under `public/` is served there before PHP, and `/landing` is already a reserved name for exactly that reason (`config/landing.php`). The pages' stylesheet is `public/landing/content-public.css`, linked with `asset()` and `AssetVersion::query()` as the kits link theirs. `docs/landing-page-builder.md`'s kit rules (stylesheets shipped verbatim, per-template tests) are about kit files; this file is not a kit.

**Design calls beyond the spec** (each pinned by a test or a comment):
- `link` is read beside `ContentRules::postFields()`, never filled into the post. A Link-only change sets the post's `updated_at`, so a panel holding the old Link is refused as `changed_elsewhere` instead of saving it back.
- An address has no spaces or control characters (nothing can break the `Location` header). The redirect's `Location` is ASCII: a non-ASCII host goes out as punycode (`idn_to_ascii`), every other non-ASCII byte percent-encoded, as a browser sends it.
- The tags are stored with the link (spec §7.1 `utm`) and worked out again only when the post's platform or campaign changes (spec §5.2): a campaign renamed later keeps its tag, so a campaign's numbers are not split halfway.
- A failed count is logged and the visitor is still sent on. Buttons link to `/go/{code}` without `?via=bio` (every tap on them comes from the page anyway); tiles add `?via=bio`. `clicks_30d` counts both sources.
- A picture or logo is used only when the landing CSP lets the page show it (`img-src 'self' data: https:`): https, or a path on the host. Otherwise the next fallback.
- A tile's date is `published_at` on the venue's calendar, else `updated_at` (a post set to Published by a plain save has no `published_at`); the order uses the same value.
- A soft-deleted brand's page answers 404. No Content-workspace check on the public host: short links and landing pages keep working too.
- A button id the page does not have (removed in another tab), or an id sent twice, is a new button. `GET bio` before the first save answers `page: null, url: null`.
- Public controllers live in `App\Http\Controllers\ContentPublic\` (not under `app/Landing`); their routes go in the existing landing group in `routes/landing.php` (no `web` group, no session) and their paths in `LandingHostGuard::ALLOWED`.

## Global Constraints

- **Branch:** never push the feature branch; never commit built `frontend/dist`, `public/spa` or `resources/spa-shell`. This plan pushes nothing and changes no frontend file.
- **Ledger and tools:** `.superpowers/sdd/2026-10-19-content-release-5b-1/`, called `$R` below (absolute: `/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-1`). Shell state does not survive between tool calls: start every command that uses it with `R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-1`. Task 1, Step 1 sets it up with `php.sh` (each PHP path alone, honest exit code) and `extract.mjs` (copies a plan code block into a file: `node $R/extract.mjs $R/task-N-brief.md "<line naming the file>" <path>`) from 5A-1's archive.
- **PHP commands:** `/c/wamp64/bin/php/php8.4.20/php.exe` only, scoped by path, in the foreground, through `$R/php.sh <paths…>`. Never a bare `php artisan test`. Any `artisan tinker` call gets `< /dev/null`. Run `artisan view:clear` after every Blade change, before testing.
- **Landing code:** read `docs/landing-page-builder.md` §1–§3 and the `LandingHostGuard` docblock before Task 1 (CLAUDE.md). Landing tests run by file only (the whole `tests/Feature/Landing/` folder takes about 28 minutes): `LandingHostIsolationTest.php`, `LandingRoutingTest.php`, `LandingSecurityHeadersTest.php`, and `tests/Unit/Support/`.
- **Public host:** routes only inside the `Route::domain(config('landing.host'))->middleware(['landing.security', 'throttle:120,1,landing-page'])` group, each path also in `LandingHostGuard::ALLOWED`. No session, no cookies. Blade `{{ }}` only; no `style="…"` attributes, no scripts; the one inline block is a `<style nonce="{{ $cspNonce }}">` carrying values from `CssColor::safe` only.
- **Migrations:** additive, SQLite-safe, guarded with `Schema::hasTable`. Tests build the tables by requiring the real migrations in `tests/Concerns/SetsUpContentSchema.php`, each behind its own guard.
- **Tenancy:** `ContentLink` and `ContentBioPage` carry `organization_id` and `brand_id` with `BelongsToOrganization` (it forces the bound organisation on create) and `BelongsToBrand`. A public request has no tenant: public code reads with `withoutGlobalScopes()`, as `LandingPageController::show` does. Another brand's row never exists in the portal (404 `not_found` as today).
- **Who is a manager:** `ContentAccess::requireManager($user)` (`manager_only`, 403).
- **Venue time:** `VenueClock::today($orgId)` and `VenueClock::zone($orgId)`, the clock Content's "today" already uses.
- **Refusals:** `ContentRefused($code, $sentence, $status)`; validation through Laravel's validator (422 with `errors`). Codes added by this plan: `bad_link` (422, "The link must be a web address that starts with http:// or https://, up to 2,000 characters."), `bio_name_invalid` (422), `bio_name_taken` (409), `too_many_buttons` (422). `changed_elsewhere`, `needs_approval`, `manager_only`, `no_profile`, `not_found` as today.
- **Words:** the public pages' words live in `lang/{en,ru,de,fr,es}/content_public.php`, same keys and placeholders in all five (pinned by `ContentPublicWordsTest`).
- **Privacy:** never store an IP address, cookie, user agent or referrer. The portal will say "clicks", never "people" or "visitors".
- **No facade mocks** (`Cache::shouldReceive`, `Queue::shouldReceive` …). The test queue is `sync`.
- **Escapes:** shell heredocs collapse `\\` and turn `\b` into a backspace. Write code holding backslashes (PHP namespaces!) with the Write or Edit tool or `extract.mjs`, never through a heredoc, `sed` or `node -e`.
- **Disk:** report `ENOSPC` instead of deleting things.
- **Commits:** every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A Cyrillic (or any non-ASCII) address:** the `Location` header leaves in ASCII: punycode host, percent-encoded path, query and fragment.
   - Pinned by Task 1's `test_a_non_ascii_address_leaves_in_ascii`.
2. **An address that already carries a tag, a query or a `#fragment`:** its tag stays, its query and fragment stay, only the missing tags are added. A key that merely ends like a tag (`xutm_source`) is not that tag.
   - Pinned by Task 1's `test_a_tag_the_address_carries_is_kept_and_so_are_its_query_and_fragment`.
3. **The venue's day is not UTC's:** a click at 01:00 on Tuesday in Auckland (still Monday in UTC) counts for Tuesday.
   - Pinned by Task 1's `test_a_click_counts_on_the_venues_day`.
4. **A panel open while someone else changes only the Link:** its save is refused as `changed_elsewhere` rather than putting the old Link back.
   - Pinned by Task 2's `test_a_new_link_is_a_change_of_words_and_of_the_post`.
5. **A button id from another tab, or sent twice:** it becomes a new button with its own code; the button that owns the id keeps its code; a removed button's code says "no longer active".
   - Pinned by Task 5's `test_a_button_keeps_its_code_across_saves_and_a_removed_button_is_switched_off`.

---

## File map

- **Task 1 (short links and the redirect):** migrations `database/migrations/2026_10_19_100200_create_content_links_table.php`, `2026_10_19_100300_create_content_link_clicks_table.php`; new `app/Models/ContentLink.php`, `app/Services/Content/ContentLinks.php`, `app/Services/Content/ContentLinkClicks.php`, `app/Services/Content/ContentPublicLanguage.php`, `app/Http/Controllers/ContentPublic/GoController.php`, `resources/views/content-public/link-off.blade.php`, `public/landing/content-public.css`, `lang/{en,ru,de,fr,es}/content_public.php`; `routes/landing.php`, `app/Http/Middleware/LandingHostGuard.php`, `tests/Concerns/SetsUpContentSchema.php`; tests new `tests/Unit/Content/ContentLinksTest.php`, `tests/Unit/Content/ContentPublicWordsTest.php`, `tests/Feature/Content/LinkRedirectTest.php`.
- **Task 2 (the Link on a post):** `ContentLinks.php`, `ContentLinkClicks.php`, `app/Http/Controllers/Api/V1/Admin/Content/PostController.php`, `app/Services/Content/ContentApproval.php`, `app/Services/Content/ContentPostPresenter.php`, `app/Models/ContentPlannerPost.php`; tests new `tests/Feature/Content/LinksTest.php`.
- **Task 3 (copies get their own code):** `ContentLinks.php`, `app/Services/Content/ContentVersions.php`, `app/Services/Content/ContentRepeat.php`, `PostController.php`; tests new `tests/Feature/Content/LinkCopiesTest.php`.
- **Task 4 (the link-in-bio page on the public host):** migrations `2026_10_19_100400_create_content_bio_pages_table.php`, `2026_10_19_100500_create_content_bio_buttons_table.php`; new `app/Models/ContentBioPage.php`, `app/Models/ContentBioButton.php`, `app/Services/Content/ContentBioPublic.php`, `app/Http/Controllers/ContentPublic/BioPageController.php`, `resources/views/content-public/bio.blade.php`; `public/landing/content-public.css`, `lang/*/content_public.php`, `config/landing.php`, `routes/landing.php`, `LandingHostGuard.php`, `SetsUpContentSchema.php`; tests new `tests/Feature/Content/BioPageTest.php`; eyes tools in `$R`.
- **Task 5 (editing the link-in-bio page):** new `app/Services/Content/ContentBio.php`, `app/Http/Controllers/Api/V1/Admin/Content/BioController.php`; `ContentLinks.php`, `ContentLinkClicks.php`, `routes/api.php`, `SetsUpContentSchema.php`; tests new `tests/Feature/Content/BioEditorTest.php`.
- **Task 6 (runbook and regression):** `docs/content-workspace.md`, `docs/landing-page-builder.md` (§2's line on `routes/landing.php`).

---

### Task 1: Short links and the redirect

**Files:**
- Create: `database/migrations/2026_10_19_100200_create_content_links_table.php`, `database/migrations/2026_10_19_100300_create_content_link_clicks_table.php`, `app/Models/ContentLink.php`, `app/Services/Content/ContentLinks.php`, `app/Services/Content/ContentLinkClicks.php`, `app/Services/Content/ContentPublicLanguage.php`, `app/Http/Controllers/ContentPublic/GoController.php`, `resources/views/content-public/link-off.blade.php`, `public/landing/content-public.css`, `lang/en/content_public.php`, `lang/ru/content_public.php`, `lang/de/content_public.php`, `lang/fr/content_public.php`, `lang/es/content_public.php`
- Modify: `routes/landing.php`, `app/Http/Middleware/LandingHostGuard.php`, `tests/Concerns/SetsUpContentSchema.php`
- Test: create `tests/Unit/Content/ContentLinksTest.php`, `tests/Unit/Content/ContentPublicWordsTest.php`, `tests/Feature/Content/LinkRedirectTest.php`

**Interfaces:**
- Produces: tables `content_links` (`id`, `organization_id`, `brand_id` null, `post_id` null unique, `code` varchar(7) unique, `destination` varchar(2000) null, `utm` json null, timestamps) and `content_link_clicks` (`link_id`, `day` date, `via` varchar(6), `clicks`; unique (`link_id`, `day`, `via`)). Model `App\Models\ContentLink` (fillable `organization_id, brand_id, post_id, code, destination, utm`; `utm` cast array). `ContentLinks::ALPHABET`, `LENGTH` (7), `MAX` (2000), `BUTTON_TAGS` (array<string,string>); `ContentLinks::clean(mixed $value): ?string` (throws `bad_link`); `ContentLinks::postTags(string $platform, ?string $campaign, int $postId): array<string,string>`; `ContentLinks::target(string $destination, array $tags): string`; `ContentLinks::freshCode(?callable $draw = null): string`; `ContentLinks::make(int $orgId, ?int $brandId, ?int $postId, string $destination, array $tags): ContentLink`; `ContentLinks::shortUrl(string $code): string` (route `content.go`). `ContentLinkClicks::ROBOTS`, `ContentLinkClicks::isRobot(?string $userAgent): bool`, `ContentLinkClicks::count(ContentLink $link, string $via): void`. `ContentPublicLanguage::LANGUAGES`, `ContentPublicLanguage::of(?int $brandId): string`. Route `GET /go/{code}` named `content.go` on the public host. Lang key `content_public.link_off`. Stylesheet `public/landing/content-public.css` (tokens `--cp-*`, `body.cp`, `.cp-off`).

- [ ] **Step 1: Set up the ledger and read the landing rules**

```bash
cd /c/wamp64/www/Hexa-Tech-content
R=$(bash /c/Users/user6399/.claude/plugins/cache/claude-plugins-official/superpowers/6.4.1/skills/subagent-driven-development/scripts/sdd-workspace docs/superpowers/plans/2026-10-19-content-release-5b-1.md)
cp .superpowers/sdd/archive/2026-10-19-content-release-5a-1/php.sh .superpowers/sdd/archive/2026-10-19-content-release-5a-1/extract.mjs "$R/"
chmod +x "$R/php.sh"
echo "# SDD ledger — plan: docs/superpowers/plans/2026-10-19-content-release-5b-1.md" > "$R/progress.md"
echo "$R"; ls "$R"; grep -n "^cd " "$R/php.sh"
```

Expected: `$R` ends in `.superpowers/sdd/2026-10-19-content-release-5b-1`; the listing shows `extract.mjs php.sh plan-path progress.md`; `php.sh` runs in `/c/wamp64/www/Hexa-Tech-content`.

Then read `docs/landing-page-builder.md` §1–§3 and the docblocks of `app/Http/Middleware/LandingHostGuard.php` (the class and `ALLOWED`) and `routes/landing.php`.

- [ ] **Step 2: Write the failing tests**

Write `tests/Unit/Content/ContentLinksTest.php` with the Write tool:

```php
<?php

namespace Tests\Unit\Content;

use App\Services\Content\ContentLinks;
use App\Services\Content\ContentRefused;
use PHPUnit\Framework\TestCase;

/** The pure parts of tracked links (spec 2026-10-19 §5.1, §5.2). */
class ContentLinksTest extends TestCase
{
    private const TAGS = ['utm_source' => 'instagram', 'utm_medium' => 'social', 'utm_campaign' => 'content-plan', 'utm_content' => 'post-5'];
    private const ADDED = 'utm_source=instagram&utm_medium=social&utm_campaign=content-plan&utm_content=post-5';

    public function test_a_plain_address_gets_every_tag(): void
    {
        $this->assertSame('https://lumiere.example/autumn?' . self::ADDED, ContentLinks::target('https://lumiere.example/autumn', self::TAGS));
        $this->assertSame('https://lumiere.example?' . self::ADDED, ContentLinks::target('https://lumiere.example', self::TAGS));
    }

    // Review Focus 2
    public function test_a_tag_the_address_carries_is_kept_and_so_are_its_query_and_fragment(): void
    {
        $this->assertSame(
            'https://lumiere.example/book?utm_source=newsletter&ref=7&utm_medium=social&utm_campaign=content-plan&utm_content=post-5#prices',
            ContentLinks::target('https://lumiere.example/book?utm_source=newsletter&ref=7#prices', self::TAGS),
        );
        // A tag without a value is still the address's own.
        $this->assertSame(
            'https://lumiere.example/?utm_campaign&utm_source=instagram&utm_medium=social&utm_content=post-5',
            ContentLinks::target('https://lumiere.example/?utm_campaign', self::TAGS),
        );
        // A key that only ends like a tag is not that tag.
        $this->assertSame('https://lumiere.example/?xutm_source=1&' . self::ADDED, ContentLinks::target('https://lumiere.example/?xutm_source=1', self::TAGS));
    }

    // Review Focus 1: the Location header stays ASCII.
    public function test_a_non_ascii_address_leaves_in_ascii(): void
    {
        if (!function_exists('idn_to_ascii')) {
            $this->markTestSkipped('intl is not loaded');
        }
        $this->assertSame(
            'https://xn--e1afmkfd.xn--p1ai/' . rawurlencode('путь') . '?q=' . rawurlencode('да') . '&' . self::ADDED . '#' . rawurlencode('якорь'),
            ContentLinks::target('https://пример.рф/путь?q=да#якорь', self::TAGS),
        );
        $this->assertSame('https://lumiere.example/caf%C3%A9?' . self::ADDED, ContentLinks::target('https://lumiere.example/café', self::TAGS));
    }

    public function test_the_campaign_tag_is_the_campaign_name_as_a_slug_or_content_plan(): void
    {
        $this->assertSame(
            ['utm_source' => 'linkedin', 'utm_medium' => 'social', 'utm_campaign' => 'autumn-offer-2026', 'utm_content' => 'post-7'],
            ContentLinks::postTags('linkedin', 'Autumn Offer 2026!', 7),
        );
        $this->assertSame('content-plan', ContentLinks::postTags('x', null, 7)['utm_campaign']);
        $this->assertSame('content-plan', ContentLinks::postTags('x', '!!!', 7)['utm_campaign']);
        $cyrillic = ContentLinks::postTags('x', 'Осенняя акция', 7)['utm_campaign'];
        $this->assertMatchesRegularExpression('/^[a-z0-9-]+$/', $cyrillic);
        $this->assertNotSame('content-plan', $cyrillic);
    }

    public function test_only_web_addresses_up_to_2000_characters_are_links(): void
    {
        $this->assertSame('https://lumiere.example/a', ContentLinks::clean('  https://lumiere.example/a  '));
        $this->assertNull(ContentLinks::clean(''));
        $this->assertNull(ContentLinks::clean('   '));
        $this->assertNull(ContentLinks::clean(null));
        $longest = 'https://lumiere.example/' . str_repeat('a', 2000 - 24);
        $this->assertSame($longest, ContentLinks::clean($longest));
        $bad = [
            'ftp://lumiere.example', 'javascript:alert(1)', 'lumiere.example/a', 'https://', 'https:lumiere.example',
            "https://lumiere.example/a\nb", 'https://lumiere .example', 'mailto:hello@lumiere.example', $longest . 'a',
            ['https://lumiere.example'],
        ];
        foreach ($bad as $value) {
            try {
                ContentLinks::clean($value);
                $this->fail('accepted: ' . json_encode($value));
            } catch (ContentRefused $e) {
                $this->assertSame('bad_link', $e->errorCode);
                $this->assertSame(422, $e->status);
            }
        }
    }
}
```

Write `tests/Unit/Content/ContentPublicWordsTest.php` with the Write tool:

```php
<?php

namespace Tests\Unit\Content;

use Tests\TestCase;

/** The public pages' words (spec 2026-10-19 §5.3, §6.2, §7.3): five languages with the same keys and placeholders. */
class ContentPublicWordsTest extends TestCase
{
    public function test_every_language_has_every_english_word_and_keeps_its_placeholders(): void
    {
        $en = require lang_path('en/content_public.php');
        foreach (['ru', 'de', 'fr', 'es'] as $locale) {
            $words = require lang_path("{$locale}/content_public.php");
            $this->assertSame(array_keys($en), array_keys($words), $locale);
            foreach ($en as $key => $text) {
                preg_match_all('/:[a-z]+/', $text, $want);
                preg_match_all('/:[a-z]+/', $words[$key], $got);
                $this->assertSame($want[0], $got[0], "{$locale} {$key}");
            }
        }
    }
}
```

Write `tests/Feature/Content/LinkRedirectTest.php` with the Write tool:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentLink;
use App\Services\Content\ContentLinks;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** A tracked short link on the public host (spec 2026-10-19 §5.1, §5.3, §5.4). Today is Monday 5 October 2026, 06:00 UTC. */
class LinkRedirectTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function go(string $code, string $query = ''): string
    {
        return 'http://' . config('landing.host') . '/go/' . $code . $query;
    }

    private function link(string $destination = 'https://lumiere.example/autumn?ref=ig#book'): ContentLink
    {
        $post = $this->makePost();

        return ContentLinks::make($this->org->id, $this->brandId, (int) $post->id, $destination, ContentLinks::postTags('instagram', null, (int) $post->id));
    }

    /** @return array<string, int> "day via" => clicks */
    private function clicks(ContentLink $link): array
    {
        return DB::table('content_link_clicks')->where('link_id', $link->id)->orderBy('day')->orderBy('via')->get()
            ->mapWithKeys(fn ($row) => [substr((string) $row->day, 0, 10) . ' ' . $row->via => (int) $row->clicks])->all();
    }

    public function test_a_live_code_sends_the_visitor_on_with_its_tags_and_is_never_cached(): void
    {
        $link = $this->link();
        $this->assertMatchesRegularExpression('/^[abcdefghijkmnpqrstuvwxyz23456789]{7}$/', $link->code);

        $response = $this->get($this->go($link->code))->assertStatus(302)
            ->assertHeader('Location', "https://lumiere.example/autumn?ref=ig&utm_source=instagram&utm_medium=social&utm_campaign=content-plan&utm_content=post-{$link->post_id}#book");
        $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
    }

    public function test_the_public_host_keeps_its_rules_on_a_short_link(): void
    {
        $link = $this->link();
        $dir = storage_path('framework/testing/sessions-' . uniqid());
        mkdir($dir, 0777, true);
        config(['session.driver' => 'file', 'session.files' => $dir]);
        try {
            $response = $this->get($this->go($link->code))->assertStatus(302);
            $this->assertSame([], $response->headers->getCookies());
            $this->assertStringContainsString("default-src 'self'", (string) $response->headers->get('Content-Security-Policy'));
            $response->assertHeader('X-Frame-Options', 'DENY');
            $this->assertSame([], array_values(array_diff(scandir($dir), ['.', '..'])), 'a short link allocated a session');
        } finally {
            array_map('unlink', glob($dir . '/*'));
            @rmdir($dir);
        }
        // Only the code's own shape reaches the route; anything else is the host's refusal.
        foreach (['/go/ABCDEFG', '/go/abc234', '/go/abc23456', '/go/' . $link->code . '/x'] as $path) {
            $this->get('http://' . config('landing.host') . $path)->assertNotFound();
        }
    }

    public function test_clicks_count_by_venue_day_and_source_one_row_each(): void
    {
        $link = $this->link();
        $this->get($this->go($link->code))->assertStatus(302);
        $this->get($this->go($link->code))->assertStatus(302);
        $this->get($this->go($link->code, '?via=bio'))->assertStatus(302);
        $this->get($this->go($link->code, '?via=email'))->assertStatus(302);
        $this->assertSame(['2026-10-05 bio' => 1, '2026-10-05 direct' => 3], $this->clicks($link));
        // `via` is never passed on.
        $this->get($this->go($link->code, '?via=bio'))->assertHeader('Location', ContentLinks::target($link->destination, $link->utm));
    }

    // Review Focus 3: the venue's day, not UTC's.
    public function test_a_click_counts_on_the_venues_day(): void
    {
        $this->org->forceFill(['timezone' => 'Pacific/Auckland'])->save();
        app()->forgetScopedInstances();
        $this->travelTo(CarbonImmutable::parse('2026-10-05 12:00:00')); // 01:00 on Tuesday 6 October in Auckland (NZDT, UTC+13)
        $link = $this->link();
        $this->get($this->go($link->code))->assertStatus(302);
        $this->assertSame(['2026-10-06 direct' => 1], $this->clicks($link));
    }

    public function test_robots_and_head_requests_are_sent_on_but_not_counted(): void
    {
        $link = $this->link();
        $this->call('HEAD', $this->go($link->code), [], [], [], ['HTTP_USER_AGENT' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0'])->assertStatus(302);
        $robots = [
            'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'Facebot', 'Twitterbot/1.0',
            'LinkedInBot/1.0 (compatible; Mozilla/5.0)', 'WhatsApp/2.23.20.0', 'TelegramBot (like TwitterBot)',
            'Slackbot-LinkExpanding 1.0', 'Mozilla/5.0 (compatible; Discordbot/2.0)', 'Pinterest/0.2', 'Applebot/0.1',
            'Mozilla/5.0 (compatible; Googlebot/2.1)', 'SomeCrawler/3.0', 'web spider', 'Link Preview Fetcher',
            'Mozilla/5.0 HeadlessChrome/120.0',
        ];
        foreach ($robots as $agent) {
            $this->withHeaders(['User-Agent' => $agent])->get($this->go($link->code))->assertStatus(302);
        }
        $this->assertSame([], $this->clicks($link));

        $this->withHeaders(['User-Agent' => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram'])
            ->get($this->go($link->code))->assertStatus(302);
        $this->assertSame(['2026-10-05 direct' => 1], $this->clicks($link));
    }

    public function test_a_switched_off_code_says_so_in_the_brands_content_language_and_an_unknown_code_is_the_hosts_404(): void
    {
        $link = $this->link();
        $link->update(['destination' => null]);
        $this->get($this->go($link->code))->assertNotFound()->assertSee('<html lang="en">', false)->assertSee('This link is no longer active');
        $this->profile->update(['default_language' => 'ru']);
        $response = $this->get($this->go($link->code))->assertNotFound()->assertSee('<html lang="ru">', false)->assertSee('Эта ссылка больше не действует');
        $this->assertStringContainsString('no-store', (string) $response->headers->get('Cache-Control'));
        $this->profile->update(['default_language' => 'it']);
        $this->get($this->go($link->code))->assertNotFound()->assertSee('This link is no longer active');
        $this->assertSame([], $this->clicks($link));

        $this->get($this->go('zzzz222'))->assertNotFound()->assertDontSee('This link is no longer active');
    }

    public function test_a_clash_draws_the_code_again(): void
    {
        $taken = $this->link();
        $draws = [$taken->code, 'abc2346'];
        $this->assertSame('abc2346', ContentLinks::freshCode(function () use (&$draws): string {
            return array_shift($draws);
        }));
    }
}
```

- [ ] **Step 3: Run them to see them fail**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-1; "$R/php.sh" tests/Unit/Content/ContentLinksTest.php tests/Unit/Content/ContentPublicWordsTest.php tests/Feature/Content/LinkRedirectTest.php
```

Expected: three lines, each `exit 1` — `ContentLinks` does not exist, `lang/en/content_public.php` does not exist, and there is no `content_links` table.

- [ ] **Step 4: The tables and the model**

Write `database/migrations/2026_10_19_100200_create_content_links_table.php` with the Write tool:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * HexaTech Content's tracked links (spec 2026-10-19 §5, §7.1): a post's Link or a link-in-bio button as a short code on
 * the public host. `destination` null = the code is switched off (the Link was cleared, the button removed); the row
 * stays, because the short link may already be out in the world — also when its post is deleted (null on delete).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('content_links')) {
            return;
        }
        Schema::create('content_links', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->nullable()->constrained('brands')->nullOnDelete();
            $table->foreignId('post_id')->nullable()->constrained('content_planner_posts')->nullOnDelete();
            $table->string('code', 7)->unique();
            $table->string('destination', 2000)->nullable();
            $table->json('utm')->nullable();
            $table->timestamps();
            $table->unique('post_id');
            $table->index('brand_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_links');
    }
};
```

Write `database/migrations/2026_10_19_100300_create_content_link_clicks_table.php` with the Write tool:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Clicks on HexaTech Content's tracked links (spec 2026-10-19 §5.4, §7.1): one row per link, venue day and source
 * (`direct` | `bio`), raised by one in a single upsert. Nothing about the visitor is stored.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('content_link_clicks')) {
            return;
        }
        Schema::create('content_link_clicks', function (Blueprint $table) {
            $table->foreignId('link_id')->constrained('content_links')->cascadeOnDelete();
            $table->date('day');
            $table->string('via', 6);
            $table->unsignedInteger('clicks')->default(0);
            $table->unique(['link_id', 'day', 'via']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_link_clicks');
    }
};
```

Write `app/Models/ContentLink.php` with the Write tool:

```php
<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

/**
 * A tracked short link (spec 2026-10-19 §5): a post's Link or a link-in-bio button. `destination` null = switched off.
 * A public request has no tenant: the public host reads it with withoutGlobalScopes(), by code.
 */
class ContentLink extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = ['organization_id', 'brand_id', 'post_id', 'code', 'destination', 'utm'];

    protected $casts = ['utm' => 'array'];
}
```

In `tests/Concerns/SetsUpContentSchema.php`, replace:

```php
        if (!Schema::hasColumn('users', 'wants_content_morning_email')) {
            (require database_path('migrations/2026_10_19_100100_add_content_morning_email_to_users.php'))->up();
        }
```

with:

```php
        if (!Schema::hasColumn('users', 'wants_content_morning_email')) {
            (require database_path('migrations/2026_10_19_100100_add_content_morning_email_to_users.php'))->up();
        }
        if (!Schema::hasTable('content_links')) {
            (require database_path('migrations/2026_10_19_100200_create_content_links_table.php'))->up();
        }
        if (!Schema::hasTable('content_link_clicks')) {
            (require database_path('migrations/2026_10_19_100300_create_content_link_clicks_table.php'))->up();
        }
```

- [ ] **Step 5: Links, clicks and the language**

Write `app/Services/Content/ContentLinks.php` with the Write tool:

```php
<?php

namespace App\Services\Content;

use App\Models\ContentLink;
use Illuminate\Support\Str;

/**
 * Tracked links (spec 2026-10-19 §5): a post's Link, or a link-in-bio button, as a short link on the public host,
 * `/go/{code}`, that adds UTM tags on the way out and counts clicks (ContentLinkClicks). The code is made once and kept:
 * changing the address keeps it, clearing it switches it off (`destination` null; the row stays, because the short link
 * may already be out in the world), entering one again switches the same code back on.
 */
final class ContentLinks
{
    /** No 0/o and no 1/l, so a code read aloud or copied by hand stays right (§5.1). */
    public const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
    public const LENGTH = 7;
    public const MAX = 2000;
    /** A link-in-bio button's tags (§5.2). */
    public const BUTTON_TAGS = ['utm_source' => 'link-in-bio', 'utm_medium' => 'social', 'utm_campaign' => 'content-plan', 'utm_content' => 'button'];

    /**
     * The address as sent, trimmed; null or '' is none. A link is http or https with a host, without spaces or control
     * characters (nothing can break the Location header), up to 2,000 characters (`bad_link`).
     */
    public static function clean(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        if (!is_string($value)) {
            self::refuse();
        }
        $value = trim($value);
        if ($value === '') {
            return null;
        }
        if (mb_strlen($value) > self::MAX || preg_match('/[\s\x00-\x1F\x7F]/u', $value) !== 0) {
            self::refuse();
        }
        $parts = parse_url($value);
        if ($parts === false || !in_array(strtolower($parts['scheme'] ?? ''), ['http', 'https'], true) || ($parts['host'] ?? '') === '') {
            self::refuse();
        }

        return $value;
    }

    /** A post's tags (§5.2): its platform, social, its campaign's name as a slug (else content-plan), post-{id}. @return array<string, string> */
    public static function postTags(string $platform, ?string $campaign, int $postId): array
    {
        $slug = Str::slug((string) $campaign);

        return [
            'utm_source'   => $platform,
            'utm_medium'   => 'social',
            'utm_campaign' => $slug !== '' ? $slug : 'content-plan',
            'utm_content'  => 'post-' . $postId,
        ];
    }

    /**
     * Where a live code sends the visitor (§5.2): the address with each tag it does not carry yet, its own query and
     * #fragment kept. The Location header is ASCII: a non-ASCII host goes out as punycode, any other non-ASCII byte
     * percent-encoded, as a browser sends it.
     *
     * @param array<string, string> $tags
     */
    public static function target(string $destination, array $tags): string
    {
        [$rest, $fragment] = array_pad(explode('#', $destination, 2), 2, null);
        [$base, $query] = array_pad(explode('?', $rest, 2), 2, null);
        $query = (string) $query;
        $missing = array_filter(
            $tags,
            fn (string $key) => preg_match('/(?:^|&)' . preg_quote($key, '/') . '(?:=|&|$)/', $query) !== 1,
            ARRAY_FILTER_USE_KEY,
        );
        $added = http_build_query($missing, '', '&', PHP_QUERY_RFC3986);
        $query = $query === '' ? $added : ($added === '' ? $query : $query . '&' . $added);
        $url = self::asciiHost($base) . ($query === '' ? '' : '?' . $query) . ($fragment === null ? '' : '#' . $fragment);

        return preg_replace_callback('/[^\x21-\x7E]/', fn (array $byte) => rawurlencode($byte[0]), $url);
    }

    /** A free code, drawn again on a clash (§5.1). `$draw` makes one random code; the default draws from ALPHABET. */
    public static function freshCode(?callable $draw = null): string
    {
        $draw ??= static function (): string {
            $code = '';
            for ($i = 0; $i < self::LENGTH; $i++) {
                $code .= self::ALPHABET[random_int(0, strlen(self::ALPHABET) - 1)];
            }

            return $code;
        };
        for ($try = 0; $try < 10; $try++) {
            $code = $draw();
            if (!ContentLink::withoutGlobalScopes()->where('code', $code)->exists()) {
                return $code;
            }
        }

        throw new \RuntimeException('No free short-link code in 10 draws.');
    }

    /** A new live short link with its own code. @param array<string, string> $tags */
    public static function make(int $orgId, ?int $brandId, ?int $postId, string $destination, array $tags): ContentLink
    {
        return ContentLink::create([
            'organization_id' => $orgId,
            'brand_id'        => $brandId,
            'post_id'         => $postId,
            'code'            => self::freshCode(),
            'destination'     => $destination,
            'utm'             => $tags,
        ]);
    }

    /** The short link's address on the public host. */
    public static function shortUrl(string $code): string
    {
        return route('content.go', ['code' => $code]);
    }

    /** `https://пример.рф/…` → `https://xn--e1afmkfd.xn--p1ai/…`; left as it is without intl (target() then percent-encodes it). */
    private static function asciiHost(string $base): string
    {
        return preg_replace_callback('#^(https?://(?:[^@/]*@)?)([^/:]+)#i', function (array $m): string {
            if (preg_match('/[^\x00-\x7F]/', $m[2]) !== 1 || !function_exists('idn_to_ascii')) {
                return $m[0];
            }
            $ascii = idn_to_ascii($m[2], IDNA_DEFAULT, INTL_IDNA_VARIANT_UTS46);

            return $m[1] . ($ascii === false ? $m[2] : $ascii);
        }, $base, 1);
    }

    private static function refuse(): never
    {
        throw new ContentRefused('bad_link', 'The link must be a web address that starts with http:// or https://, up to 2,000 characters.', 422);
    }
}
```

Write `app/Services/Content/ContentLinkClicks.php` with the Write tool:

```php
<?php

namespace App\Services\Content;

use App\Models\ContentLink;
use App\Services\Appointments\VenueClock;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Clicks on tracked links (spec 2026-10-19 §5.4): one row per link, venue day and source (`direct` | `bio`), raised by
 * one in a single upsert. HEAD requests and robots are not counted. Nothing about the visitor is stored: no IP address,
 * cookie, user agent or referrer. Counts are taps, not people.
 */
final class ContentLinkClicks
{
    /** Link-preview robots by name, and anything that calls itself a robot (§5.4). */
    public const ROBOTS = '/facebookexternalhit|facebot|twitterbot|linkedinbot|whatsapp|telegrambot|slackbot|discordbot|pinterest|applebot|bot|crawl|spider|preview|headless/i';

    public static function isRobot(?string $userAgent): bool
    {
        return preg_match(self::ROBOTS, (string) $userAgent) === 1;
    }

    /** One more click on the link's venue day. A counting failure is logged and never stops the visitor. */
    public static function count(ContentLink $link, string $via): void
    {
        try {
            DB::table('content_link_clicks')->upsert(
                [['link_id' => $link->id, 'day' => VenueClock::today((int) $link->organization_id), 'via' => $via, 'clicks' => 1]],
                ['link_id', 'day', 'via'],
                // Qualified: PostgreSQL calls a bare `clicks` ambiguous inside ON CONFLICT … DO UPDATE.
                ['clicks' => DB::raw('content_link_clicks.clicks + 1')],
            );
        } catch (\Throwable $e) {
            Log::warning('content link: a click was not counted', ['link' => $link->id, 'error' => $e->getMessage()]);
        }
    }
}
```

Write `app/Services/Content/ContentPublicLanguage.php` with the Write tool:

```php
<?php

namespace App\Services\Content;

use App\Models\ContentPlannerProfile;

/**
 * The language of Content's pages on the public host (spec 2026-10-19 §5.3, §6.2): the brand's Content language when it
 * is one of the five, otherwise English. Read across tenants (a public request has none).
 */
final class ContentPublicLanguage
{
    public const LANGUAGES = ['en', 'ru', 'de', 'fr', 'es'];

    public static function of(?int $brandId): string
    {
        $language = $brandId === null ? null
            : ContentPlannerProfile::withoutGlobalScopes()->where('brand_id', $brandId)->value('default_language');
        $language = strtolower(substr((string) $language, 0, 2));

        return in_array($language, self::LANGUAGES, true) ? $language : 'en';
    }
}
```

- [ ] **Step 6: The redirect, its page, its words and the host's list**

Write `app/Http/Controllers/ContentPublic/GoController.php` with the Write tool:

```php
<?php

namespace App\Http\Controllers\ContentPublic;

use App\Http\Controllers\Controller;
use App\Models\ContentLink;
use App\Services\Content\ContentLinkClicks;
use App\Services\Content\ContentLinks;
use App\Services\Content\ContentPublicLanguage;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * A tracked short link on the public host (spec 2026-10-19 §5.3, §5.4). A live code answers 302 to its address with
 * its tags, never cached; a switched-off code a plain "no longer active" page (404) in the brand's Content language; an
 * unknown code the host's normal 404. Read across tenants by code (a public request has no tenant), as
 * LandingPageController::show reads a page by slug. Served from routes/landing.php: no `web` group, no session.
 */
class GoController extends Controller
{
    public function show(Request $request, string $code): Response
    {
        $link = ContentLink::withoutGlobalScopes()->where('code', $code)->first();
        abort_if($link === null, 404);
        if ($link->destination === null) {
            $language = ContentPublicLanguage::of($link->brand_id === null ? null : (int) $link->brand_id);

            return response()->view('content-public.link-off', ['lang' => $language], 404)->header('Cache-Control', 'no-store');
        }
        if (!$request->isMethod('HEAD') && !ContentLinkClicks::isRobot($request->userAgent())) {
            ContentLinkClicks::count($link, $request->query('via') === 'bio' ? 'bio' : 'direct');
        }

        return new RedirectResponse(ContentLinks::target($link->destination, (array) $link->utm), 302, ['Cache-Control' => 'no-store']);
    }
}
```

Write `resources/views/content-public/link-off.blade.php` with the Write tool:

```blade
{{-- A switched-off short link (spec 2026-10-19 §5.3): its Link was cleared or its button removed. --}}
<!doctype html>
<html lang="{{ $lang }}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>{{ __('content_public.link_off', [], $lang) }}</title>
<link rel="stylesheet" href="{{ asset('landing/content-public.css') }}{{ \App\Support\AssetVersion::query('landing/content-public.css') }}">
</head>
<body class="cp">
<main class="cp-off">
  <h1>{{ __('content_public.link_off', [], $lang) }}</h1>
</main>
</body>
</html>
```

Write `public/landing/content-public.css` with the Write tool:

```css
/*
 * HexaTech Content on the public host (spec 2026-10-19 §5.3, §6): the switched-off short link and the link-in-bio page.
 * Same-origin under the landing CSP. The brand colour comes in as --cp-brand / --cp-on-brand from the page's one
 * nonce'd <style> block; everything else is here.
 */
:root {
  --cp-ink: #14161a;
  --cp-muted: #5b616b;
  --cp-paper: #f6f6f4;
  --cp-card: #ffffff;
  --cp-line: #e2e3e0;
  --cp-brand: #2d6a4f;
  --cp-on-brand: #ffffff;
  color-scheme: light;
}

* { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; }

body.cp {
  margin: 0;
  min-height: 100vh;
  background: var(--cp-paper);
  color: var(--cp-ink);
  font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

.cp-off { max-width: 480px; margin: 0 auto; padding: 96px 24px; text-align: center; }
.cp-off h1 { margin: 0; font-size: 1.375rem; line-height: 1.3; font-weight: 600; }
```

Write `lang/en/content_public.php` with the Write tool:

```php
<?php

// The words of HexaTech Content's pages on the public host (spec 2026-10-19 §5.3, §6.2), in the brand's Content language.
return [
    'link_off' => 'This link is no longer active',
];
```

Write `lang/ru/content_public.php` with the Write tool:

```php
<?php

// The words of HexaTech Content's pages on the public host (spec 2026-10-19 §5.3, §6.2), in the brand's Content language.
return [
    'link_off' => 'Эта ссылка больше не действует',
];
```

Write `lang/de/content_public.php` with the Write tool:

```php
<?php

// The words of HexaTech Content's pages on the public host (spec 2026-10-19 §5.3, §6.2), in the brand's Content language.
return [
    'link_off' => 'Dieser Link ist nicht mehr aktiv',
];
```

Write `lang/fr/content_public.php` with the Write tool:

```php
<?php

// The words of HexaTech Content's pages on the public host (spec 2026-10-19 §5.3, §6.2), in the brand's Content language.
return [
    'link_off' => 'Ce lien n’est plus actif',
];
```

Write `lang/es/content_public.php` with the Write tool:

```php
<?php

// The words of HexaTech Content's pages on the public host (spec 2026-10-19 §5.3, §6.2), in the brand's Content language.
return [
    'link_off' => 'Este enlace ya no está activo',
];
```

In `routes/landing.php`, replace:

```php
use App\Http\Controllers\Landing\LandingPageController;
use Illuminate\Support\Facades\Route;
```

with:

```php
use App\Http\Controllers\ContentPublic\GoController;
use App\Http\Controllers\Landing\LandingPageController;
use Illuminate\Support\Facades\Route;
```

and replace:

```php
            ->middleware('signed')
            ->name('landing.preview');
    });
```

with:

```php
            ->middleware('signed')
            ->name('landing.preview');

        // HexaTech Content's tracked short links (spec 2026-10-19 §5.3). Two segments, so never a landing slug; keep
        // the pattern in step with LandingHostGuard::ALLOWED.
        Route::get('/go/{code}', [GoController::class, 'show'])
            ->where('code', '[a-z2-9]{7}')
            ->name('content.go');
    });
```

In `app/Http/Middleware/LandingHostGuard.php`, replace:

```php
     * Keep the first two in step with routes/landing.php. They are repeated
```

with:

```php
     * Keep the route patterns (landing.*, content.*) in step with routes/landing.php. They are repeated
```

and replace:

```php
        '#^preview/[0-9]+$#',  // landing.preview
```

with:

```php
        '#^preview/[0-9]+$#',  // landing.preview
        '#^go/[a-z2-9]{7}$#',  // content.go: HexaTech Content's short links (routes/landing.php, outside `web`)
```

- [ ] **Step 7: Run the tests, then the Content folders and the host's own tests**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-1; cd /c/wamp64/www/Hexa-Tech-content && /c/wamp64/bin/php/php8.4.20/php.exe artisan view:clear < /dev/null && "$R/php.sh" tests/Unit/Content/ContentLinksTest.php tests/Unit/Content/ContentPublicWordsTest.php tests/Feature/Content/LinkRedirectTest.php tests/Feature/Content/ tests/Unit/Content/ tests/Feature/Landing/LandingHostIsolationTest.php tests/Feature/Landing/LandingRoutingTest.php
```

Expected: `ContentLinksTest | Tests:    5 passed`, `ContentPublicWordsTest | Tests:    1 passed`, `LinkRedirectTest | Tests:    7 passed`; every line `exit 0` (Feature Content 225 at release 5a + 7 = 232; Unit Content 76 + 6 = 82; if release 5a's counts differ, ledger the real baseline as a note and carry it).

- [ ] **Step 8: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add database/migrations/2026_10_19_100200_create_content_links_table.php database/migrations/2026_10_19_100300_create_content_link_clicks_table.php app/Models/ContentLink.php app/Services/Content/ContentLinks.php app/Services/Content/ContentLinkClicks.php app/Services/Content/ContentPublicLanguage.php app/Http/Controllers/ContentPublic/GoController.php resources/views/content-public/link-off.blade.php public/landing/content-public.css lang/en/content_public.php lang/ru/content_public.php lang/de/content_public.php lang/fr/content_public.php lang/es/content_public.php routes/landing.php app/Http/Middleware/LandingHostGuard.php tests/Concerns/SetsUpContentSchema.php tests/Unit/Content/ContentLinksTest.php tests/Unit/Content/ContentPublicWordsTest.php tests/Feature/Content/LinkRedirectTest.php && git commit -q -m "Content: tracked short links on the public host — /go/{code} adds UTM tags and counts clicks by venue day" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 2: The Link on a post

**Files:**
- Modify: `app/Services/Content/ContentLinks.php`, `app/Services/Content/ContentLinkClicks.php`, `app/Http/Controllers/Api/V1/Admin/Content/PostController.php`, `app/Services/Content/ContentApproval.php`, `app/Services/Content/ContentPostPresenter.php`, `app/Models/ContentPlannerPost.php`
- Test: create `tests/Feature/Content/LinksTest.php`

**Interfaces:**
- Consumes: Task 1's `ContentLink`, `ContentLinks::make`, `postTags`, `shortUrl`, `clean`, `target`; route `content.go`.
- Produces: `ContentLinks::ofPost(ContentPlannerPost $post): ?ContentLink`; `ContentLinks::tagsFor(ContentPlannerPost $post): array<string,string>`; `ContentLinks::changes(ContentPlannerPost $post, ?string $destination): bool`; `ContentLinks::set(ContentPlannerPost $post, ?string $destination): void`; `ContentLinks::retag(ContentPlannerPost $post): void`; `ContentLinks::describe(ContentPlannerPost $post): ?array{code, short_url, destination, on, clicks, clicks_bio, days}`. `ContentLinkClicks::DAYS` (14); `ContentLinkClicks::summary(ContentLink $link): array{clicks:int, clicks_bio:int, days:list<array{day:string, clicks:int}>}`. `ContentApproval::beforeSave(…, bool $otherWords = false)`. `POST posts` and `PUT posts/{id}` accept `link`; details carry `link`; cards carry `clicks` (the list's query reads `link_clicks` through `withReview()`).

- [ ] **Step 1: Write the failing test**

Write `tests/Feature/Content/LinksTest.php` with the Write tool:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentLink;
use App\Models\ContentPlannerCampaign;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerPostEvent;
use App\Services\Content\ContentLinks;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** A post's Link and its short link (spec 2026-10-19 §5.1, §5.2, §5.5, §7.2). Today is Monday 5 October 2026. */
class LinksTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function go(string $code): string
    {
        return 'http://' . config('landing.host') . '/go/' . $code;
    }

    public function test_a_link_saved_with_a_post_becomes_its_short_link_and_a_new_address_keeps_the_code(): void
    {
        $created = $this->asManager()->postJson($this->api('posts'), ['platform' => 'instagram', 'topic' => 'Autumn', 'link' => '  https://lumiere.example/autumn  '])
            ->assertCreated();
        $code = $created->json('post.link.code');
        $this->assertMatchesRegularExpression('/^[abcdefghijkmnpqrstuvwxyz23456789]{7}$/', (string) $code);
        $created->assertJsonPath('post.link.short_url', route('content.go', ['code' => $code]))
            ->assertJsonPath('post.link.destination', 'https://lumiere.example/autumn')
            ->assertJsonPath('post.link.on', true)
            ->assertJsonPath('post.link.clicks', 0)
            ->assertJsonPath('post.link.clicks_bio', 0)
            ->assertJsonCount(14, 'post.link.days')
            ->assertJsonPath('post.link.days.13', ['day' => '2026-10-05', 'clicks' => 0])
            ->assertJsonPath('post.link.days.0', ['day' => '2026-09-22', 'clicks' => 0])
            ->assertJsonPath('post.clicks', 0);

        $this->asManager()->putJson($this->api("posts/{$created->json('post.id')}"), ['link' => 'https://lumiere.example/winter', 'updated_at' => $created->json('post.updated_at')])
            ->assertOk()->assertJsonPath('post.link.code', $code)->assertJsonPath('post.link.destination', 'https://lumiere.example/winter');
        $this->assertSame(1, ContentLink::count());
        // A post saved without a Link has none.
        $this->asManager()->postJson($this->api('posts'), ['platform' => 'instagram', 'topic' => 'Plain'])->assertCreated()->assertJsonPath('post.link', null);
    }

    public function test_clearing_the_link_switches_its_code_off_and_a_new_address_switches_the_same_code_on(): void
    {
        $post = $this->makePost();
        ContentLinks::set($post, 'https://lumiere.example/autumn');
        $code = ContentLinks::ofPost($post)->code;
        $save = fn (?string $link) => $this->asManager()->putJson($this->api("posts/{$post->id}"), ['link' => $link, 'updated_at' => $post->fresh()->updated_at->toISOString()])->assertOk();

        $save(null)->assertJsonPath('post.link.on', false)->assertJsonPath('post.link.destination', null)->assertJsonPath('post.link.code', $code);
        $this->get($this->go($code))->assertNotFound()->assertSee('This link is no longer active');
        $save('')->assertJsonPath('post.link.on', false);
        $save('https://lumiere.example/winter')->assertJsonPath('post.link.on', true)->assertJsonPath('post.link.code', $code);
        $this->get($this->go($code))->assertStatus(302);
        $this->assertSame(1, ContentLink::count());
    }

    public function test_a_bad_link_is_refused_and_nothing_of_the_save_is_kept(): void
    {
        $this->asManager()->postJson($this->api('posts'), ['platform' => 'instagram', 'topic' => 'New', 'link' => 'ftp://lumiere.example'])
            ->assertStatus(422)->assertJsonPath('error', 'bad_link');
        $this->assertSame(0, ContentPlannerPost::where('topic', 'New')->count());

        $post = $this->makePost(['hook' => 'Old hook']);
        $this->asManager()->putJson($this->api("posts/{$post->id}"), ['hook' => 'New hook', 'link' => 'javascript:alert(1)', 'updated_at' => $post->updated_at->toISOString()])
            ->assertStatus(422)->assertJsonPath('error', 'bad_link');
        $this->assertSame('Old hook', $post->fresh()->hook);
        $this->assertSame(0, ContentLink::count());
    }

    public function test_the_tags_follow_the_posts_platform_and_campaign(): void
    {
        $post = $this->makePost();
        $save = fn (array $fields) => $this->asManager()->putJson($this->api("posts/{$post->id}"), $fields + ['updated_at' => $post->fresh()->updated_at->toISOString()])->assertOk();
        $save(['link' => 'https://lumiere.example/autumn']);
        $this->assertSame(
            ['utm_source' => 'instagram', 'utm_medium' => 'social', 'utm_campaign' => 'content-plan', 'utm_content' => "post-{$post->id}"],
            ContentLinks::ofPost($post)->utm,
        );

        $campaign = ContentPlannerCampaign::create(['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'name' => 'Autumn Offer', 'status' => 'draft']);
        $save(['campaign_id' => $campaign->id]);
        $this->assertSame('autumn-offer', ContentLinks::ofPost($post)->utm['utm_campaign']);
        $save(['platform' => 'linkedin']);
        $link = ContentLinks::ofPost($post);
        $this->assertSame('linkedin', $link->utm['utm_source']);
        $this->get($this->go($link->code))
            ->assertHeader('Location', "https://lumiere.example/autumn?utm_source=linkedin&utm_medium=social&utm_campaign=autumn-offer&utm_content=post-{$post->id}");
    }

    public function test_deleting_a_post_keeps_its_short_link_working(): void
    {
        $post = $this->makePost();
        ContentLinks::set($post, 'https://lumiere.example/autumn');
        $link = ContentLinks::ofPost($post);
        $this->asManager()->deleteJson($this->api("posts/{$post->id}"))->assertOk();

        $link->refresh();
        $this->assertNull($link->post_id);
        $this->assertSame('https://lumiere.example/autumn', $link->destination);
        $this->get($this->go($link->code))->assertStatus(302);
    }

    // Review Focus 4: a Link-only change moves the post's version on; under approvals it is a change of words.
    public function test_a_new_link_is_a_change_of_words_and_of_the_post(): void
    {
        $this->profile->forceFill(['requires_approval' => true])->save();
        $post = $this->makePost(['status' => 'approved']);
        ContentLinks::set($post, 'https://lumiere.example/a');
        $seen = $post->fresh()->updated_at->toISOString();
        $this->travel(5)->minutes();

        // The same address again changes nothing.
        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['link' => 'https://lumiere.example/a', 'updated_at' => $seen])
            ->assertOk()->assertJsonPath('post.status', 'approved')->assertJsonPath('post.updated_at', $seen);
        // A new one sends the approved post back to review.
        $this->asStaffMember()->putJson($this->api("posts/{$post->id}"), ['link' => 'https://lumiere.example/b', 'updated_at' => $seen])
            ->assertOk()->assertJsonPath('post.status', 'needs_review')->assertJsonPath('post.link.destination', 'https://lumiere.example/b');
        $this->assertSame(['changed_after_approval'], ContentPlannerPostEvent::where('post_id', $post->id)->pluck('kind')->all());
        // A panel still holding the old version cannot put the old Link back.
        $this->asManager()->putJson($this->api("posts/{$post->id}"), ['link' => 'https://lumiere.example/a', 'updated_at' => $seen])
            ->assertStatus(409)->assertJsonPath('error', 'changed_elsewhere');
        $this->assertSame('https://lumiere.example/b', ContentLinks::ofPost($post)->destination);

        // A manager's new Link keeps an approved post approved.
        $approved = $this->makePost(['status' => 'approved']);
        $this->asManager()->putJson($this->api("posts/{$approved->id}"), ['link' => 'https://lumiere.example/d', 'updated_at' => $approved->updated_at->toISOString()])
            ->assertOk()->assertJsonPath('post.status', 'approved');
    }

    public function test_cards_carry_their_clicks_and_the_panel_its_last_fourteen_days(): void
    {
        $post = $this->makePost();
        $plain = $this->makePost(['topic' => 'No link']);
        ContentLinks::set($post, 'https://lumiere.example/autumn');
        $linkId = ContentLinks::ofPost($post)->id;
        DB::table('content_link_clicks')->insert([
            ['link_id' => $linkId, 'day' => '2026-10-05', 'via' => 'direct', 'clicks' => 3],
            ['link_id' => $linkId, 'day' => '2026-10-05', 'via' => 'bio', 'clicks' => 2],
            ['link_id' => $linkId, 'day' => '2026-09-22', 'via' => 'direct', 'clicks' => 1],
            ['link_id' => $linkId, 'day' => '2026-09-21', 'via' => 'direct', 'clicks' => 7],
        ]);

        $this->asManager()->getJson($this->api("posts/{$post->id}"))->assertOk()
            ->assertJsonPath('post.link.clicks', 13)
            ->assertJsonPath('post.link.clicks_bio', 2)
            ->assertJsonPath('post.link.days.0', ['day' => '2026-09-22', 'clicks' => 1])
            ->assertJsonPath('post.link.days.12', ['day' => '2026-10-04', 'clicks' => 0])
            ->assertJsonPath('post.link.days.13', ['day' => '2026-10-05', 'clicks' => 5])
            ->assertJsonPath('post.clicks', 13);
        $cards = collect($this->asManager()->getJson($this->api('posts'))->assertOk()->json('data'))->keyBy('id');
        $this->assertSame(13, $cards[$post->id]['clicks']);
        $this->assertSame(0, $cards[$plain->id]['clicks']);
    }
}
```

- [ ] **Step 2: Run it to see it fail**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-1; "$R/php.sh" tests/Feature/Content/LinksTest.php
```

Expected: `exit 1` — `ContentLinks::set` and `ofPost` do not exist, and posts answer without `link`.

- [ ] **Step 3: The post's link, its numbers, the save and the shapes**

In `app/Services/Content/ContentLinks.php`, replace:

```php
use App\Models\ContentLink;
use Illuminate\Support\Str;
```

with:

```php
use App\Models\ContentLink;
use App\Models\ContentPlannerCampaign;
use App\Models\ContentPlannerPost;
use Illuminate\Support\Str;
```

and replace:

```php
        return route('content.go', ['code' => $code]);
    }
```

with:

```php
        return route('content.go', ['code' => $code]);
    }

    /** The post's short link, live or switched off; null when it never had a Link. */
    public static function ofPost(ContentPlannerPost $post): ?ContentLink
    {
        return ContentLink::withoutGlobalScopes()->where('post_id', $post->id)->first();
    }

    /** The post's tags as it is now (§5.2). @return array<string, string> */
    public static function tagsFor(ContentPlannerPost $post): array
    {
        $campaign = $post->campaign_id
            ? ContentPlannerCampaign::withoutGlobalScopes()->whereKey($post->campaign_id)->value('name')
            : null;

        return self::postTags((string) $post->platform, $campaign, (int) $post->id);
    }

    /** Would this address change the post's Link? A new Link is a change of words under approvals (§5.1). */
    public static function changes(ContentPlannerPost $post, ?string $destination): bool
    {
        return self::ofPost($post)?->destination !== $destination;
    }

    /** Sets the post's Link (§5.1): its short link is made once, changed in place, switched off by null and on again by an address. */
    public static function set(ContentPlannerPost $post, ?string $destination): void
    {
        $link = self::ofPost($post);
        if ($link !== null) {
            $link->update(['destination' => $destination, 'utm' => self::tagsFor($post)]);
        } elseif ($destination !== null) {
            self::make((int) $post->organization_id, (int) $post->brand_id, (int) $post->id, $destination, self::tagsFor($post));
        }
    }

    /** After the post's platform or campaign changed, its tags are worked out again (§5.2). */
    public static function retag(ContentPlannerPost $post): void
    {
        self::ofPost($post)?->update(['utm' => self::tagsFor($post)]);
    }

    /**
     * The panel's facts (§5.5, §7.2), or null for a post that never had a Link.
     *
     * @return array{code: string, short_url: string, destination: ?string, on: bool, clicks: int, clicks_bio: int, days: list<array{day: string, clicks: int}>}|null
     */
    public static function describe(ContentPlannerPost $post): ?array
    {
        $link = self::ofPost($post);
        if ($link === null) {
            return null;
        }

        return [
            'code'        => (string) $link->code,
            'short_url'   => self::shortUrl((string) $link->code),
            'destination' => $link->destination,
            'on'          => $link->destination !== null,
        ] + ContentLinkClicks::summary($link);
    }
```

In `app/Services/Content/ContentLinkClicks.php`, replace:

```php
use App\Models\ContentLink;
use App\Services\Appointments\VenueClock;
```

with:

```php
use App\Models\ContentLink;
use App\Services\Appointments\VenueClock;
use Carbon\CarbonImmutable;
```

and replace:

```php
            Log::warning('content link: a click was not counted', ['link' => $link->id, 'error' => $e->getMessage()]);
        }
    }
}
```

with:

```php
            Log::warning('content link: a click was not counted', ['link' => $link->id, 'error' => $e->getMessage()]);
        }
    }

    /** The panel's bars: the last 14 venue days (§5.5). */
    public const DAYS = 14;

    /**
     * The panel's numbers (§5.5): every click, those from the bio page, and the last DAYS venue days, oldest first, a
     * day without clicks included.
     *
     * @return array{clicks: int, clicks_bio: int, days: list<array{day: string, clicks: int}>}
     */
    public static function summary(ContentLink $link): array
    {
        $rows = DB::table('content_link_clicks')->where('link_id', $link->id)->get(['day', 'via', 'clicks']);
        $byDay = [];
        foreach ($rows as $row) {
            $day = substr((string) $row->day, 0, 10);
            $byDay[$day] = ($byDay[$day] ?? 0) + (int) $row->clicks;
        }
        $today = CarbonImmutable::parse(VenueClock::today((int) $link->organization_id));
        $days = [];
        for ($back = self::DAYS - 1; $back >= 0; $back--) {
            $day = $today->subDays($back)->toDateString();
            $days[] = ['day' => $day, 'clicks' => $byDay[$day] ?? 0];
        }

        return [
            'clicks'     => (int) $rows->sum('clicks'),
            'clicks_bio' => (int) $rows->where('via', 'bio')->sum('clicks'),
            'days'       => $days,
        ];
    }
}
```

In `app/Services/Content/ContentApproval.php`, replace:

```php
    public static function beforeSave(ContentPlannerPost $post, string $before, User $user, ?ContentPlannerProfile $profile): ?string
    {
        if (!self::isOn($profile)) {
            return null;
        }
        $manager = ContentAccess::canManage($user);
        if (!$manager && $post->status === $before && in_array($before, ['approved', 'ready_to_publish'], true) && $post->isDirty(self::WORDS)) {
```

with:

```php
    public static function beforeSave(ContentPlannerPost $post, string $before, User $user, ?ContentPlannerProfile $profile, bool $otherWords = false): ?string
    {
        if (!self::isOn($profile)) {
            return null;
        }
        $manager = ContentAccess::canManage($user);
        // $otherWords: a change of words that is not a post column — the Link (spec 2026-10-19 §5.1).
        if (!$manager && $post->status === $before && in_array($before, ['approved', 'ready_to_publish'], true) && ($post->isDirty(self::WORDS) || $otherWords)) {
```

In `app/Http/Controllers/Api/V1/Admin/Content/PostController.php`, replace:

```php
use App\Services\Content\ContentContext;
use App\Services\Content\ContentPlan;
```

with:

```php
use App\Services\Content\ContentContext;
use App\Services\Content\ContentLinks;
use App\Services\Content\ContentPlan;
```

replace:

```php
            ['platform' => ['required', Rule::in(ContentRules::PLATFORMS)]] + Arr::except(ContentRules::postFields(), ['platform'])
        );
        ContentTeam::assertPoster($data['poster_id'] ?? null, null, (int) $profile->brand_id);
```

with:

```php
            ['platform' => ['required', Rule::in(ContentRules::PLATFORMS)]] + Arr::except(ContentRules::postFields(), ['platform'])
        );
        // The Link (spec 2026-10-19 §5.1) is not a post column: its short link lives in content_links.
        $link = ContentLinks::clean($request->input('link'));
        ContentTeam::assertPoster($data['poster_id'] ?? null, null, (int) $profile->brand_id);
```

replace:

```php
        if ($kind = ContentApproval::onCreate($post, $request->user(), $profile)) {
```

with:

```php
        if ($link !== null) {
            ContentLinks::set($post, $link);
        }
        if ($kind = ContentApproval::onCreate($post, $request->user(), $profile)) {
```

replace:

```php
        $data = $request->validate(['updated_at' => 'required|string'] + ContentRules::postFields());
        self::assertFresh($post, $data['updated_at']);
```

with:

```php
        $data = $request->validate(['updated_at' => 'required|string'] + ContentRules::postFields());
        self::assertFresh($post, $data['updated_at']);
        // The Link (spec 2026-10-19 §5.1): refused whole before anything is saved; a new address is a change of the post.
        $link = $request->has('link') ? ContentLinks::clean($request->input('link')) : null;
        $linkChanges = $request->has('link') && ContentLinks::changes($post, $link);
```

and replace:

```php
        $kind = ContentApproval::beforeSave($post, $before, $request->user(), $profile);
        $post->save();
```

with:

```php
        if ($linkChanges) {
            // Its version moves on, so a panel still holding the old Link cannot save it back (F3).
            $post->updated_at = $post->freshTimestamp();
        }
        $kind = ContentApproval::beforeSave($post, $before, $request->user(), $profile, $linkChanges);
        $post->save();
        if ($linkChanges) {
            ContentLinks::set($post, $link);
        } elseif ($post->wasChanged(['platform', 'campaign_id'])) {
            ContentLinks::retag($post);
        }
```

In `app/Services/Content/ContentPostPresenter.php`, replace:

```php
use Carbon\CarbonImmutable;
```

with:

```php
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
```

replace:

```php
            'poster_id'      => $post->poster_id === null ? null : (int) $post->poster_id,
        ];
    }
```

with:

```php
            'poster_id'      => $post->poster_id === null ? null : (int) $post->poster_id,
            // Its short link's clicks in all (spec 2026-10-19 §5.5; read in the list's query by withReview()).
            'clicks'         => self::clicks($post),
        ];
    }

    /** Its short link's clicks in all; 0 for a post without a Link. */
    private static function clicks(ContentPlannerPost $post): int
    {
        if (array_key_exists('link_clicks', $post->getAttributes())) {
            return (int) $post->getAttribute('link_clicks');
        }

        return (int) DB::table('content_link_clicks')
            ->join('content_links', 'content_links.id', '=', 'content_link_clicks.link_id')
            ->where('content_links.post_id', $post->id)
            ->sum('content_link_clicks.clicks');
    }
```

and replace:

```php
            'poster'            => ContentTeam::poster($post->poster_id === null ? null : (int) $post->poster_id, (int) $post->brand_id),
```

with:

```php
            'poster'            => ContentTeam::poster($post->poster_id === null ? null : (int) $post->poster_id, (int) $post->brand_id),
            // Its tracked short link (spec 2026-10-19 §5.5), or null for a post that never had a Link.
            'link'              => ContentLinks::describe($post),
```

In `app/Models/ContentPlannerPost.php`, replace:

```php
            'group_size'      => DB::table('content_planner_posts as same_group')->selectRaw('count(*)')
                ->whereColumn('same_group.group_id', 'content_planner_posts.group_id'),
        ]);
```

with:

```php
            'group_size'      => DB::table('content_planner_posts as same_group')->selectRaw('count(*)')
                ->whereColumn('same_group.group_id', 'content_planner_posts.group_id'),
            // Spec 2026-10-19 §5.5: its short link's clicks in all.
            'link_clicks'     => DB::table('content_link_clicks')
                ->join('content_links', 'content_links.id', '=', 'content_link_clicks.link_id')
                ->selectRaw('coalesce(sum(content_link_clicks.clicks), 0)')
                ->whereColumn('content_links.post_id', 'content_planner_posts.id'),
        ]);
```

- [ ] **Step 4: Run the test, then the Content folders**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-1; "$R/php.sh" tests/Feature/Content/LinksTest.php tests/Feature/Content/ tests/Unit/Content/
```

Expected: `LinksTest | Tests:    7 passed`; both folders `exit 0` (Feature Content 232 + 7 = 239; Unit Content 82).

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app/Services/Content/ContentLinks.php app/Services/Content/ContentLinkClicks.php app/Http/Controllers/Api/V1/Admin/Content/PostController.php app/Services/Content/ContentApproval.php app/Services/Content/ContentPostPresenter.php app/Models/ContentPlannerPost.php tests/Feature/Content/LinksTest.php && git commit -q -m "Content: a post's Link becomes its short link — kept code, switched off when cleared, a change of words under approvals" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 3: Copies get their own code

**Files:**
- Modify: `app/Services/Content/ContentLinks.php`, `app/Services/Content/ContentVersions.php`, `app/Services/Content/ContentRepeat.php`, `app/Http/Controllers/Api/V1/Admin/Content/PostController.php`
- Test: create `tests/Feature/Content/LinkCopiesTest.php`

**Interfaces:**
- Consumes: Task 2's `ContentLinks::ofPost`, `tagsFor`, `set`, `describe`; Task 1's `make`.
- Produces: `ContentLinks::copyTo(ContentPlannerPost $original, iterable<ContentPlannerPost> $copies): void`. Versions (`ContentVersions::make`), repeat copies (`ContentRepeat::copy`) and duplicates (`PostController::duplicate`) take the original's live address, each with its own code and tags.

- [ ] **Step 1: Write the failing test**

Write `tests/Feature/Content/LinkCopiesTest.php` with the Write tool:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentLink;
use App\Models\ContentPlannerPost;
use App\Services\Content\ContentLinks;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Each post its own code (spec 2026-10-19 §5.1): versions, repeat copies and duplicates. Today is Monday 5 October 2026. */
class LinkCopiesTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function postWithLink(): ContentPlannerPost
    {
        $post = $this->makePost(['scheduled_date' => '2026-10-07']);
        ContentLinks::set($post, 'https://lumiere.example/autumn');

        return $post;
    }

    public function test_versions_take_the_address_each_with_its_own_code_and_tags(): void
    {
        $post = $this->postWithLink();
        $made = $this->asManager()->postJson($this->api("posts/{$post->id}/versions"), ['platforms' => ['linkedin', 'x'], 'ai' => false])->assertCreated();

        $codes = [ContentLinks::ofPost($post)->code];
        foreach ($made->json('versions') as $card) {
            $link = ContentLinks::ofPost(ContentPlannerPost::findOrFail($card['id']));
            $this->assertSame('https://lumiere.example/autumn', $link->destination);
            $this->assertSame($card['platform'], $link->utm['utm_source']);
            $this->assertSame("post-{$card['id']}", $link->utm['utm_content']);
            $codes[] = $link->code;
        }
        $this->assertCount(3, array_unique($codes));
        // A click counts for the post it came through.
        $this->get('http://' . config('landing.host') . '/go/' . $codes[1])->assertStatus(302);
        $this->asManager()->getJson($this->api("posts/{$post->id}"))->assertJsonPath('post.link.clicks', 0);
        $this->asManager()->getJson($this->api("posts/{$made->json('versions.0.id')}"))->assertJsonPath('post.link.clicks', 1);
    }

    public function test_repeat_copies_and_a_duplicate_take_the_address_each_with_its_own_code(): void
    {
        $post = $this->postWithLink();
        $copies = $this->asManager()->postJson($this->api("posts/{$post->id}/repeat"), ['every' => 'week', 'until' => '2026-10-28'])->assertCreated()->json('copies.*.id');
        $duplicate = $this->asManager()->postJson($this->api("posts/{$post->id}/duplicate"))->assertCreated()->json('post.id');
        $this->assertNotEmpty($copies);

        $codes = [ContentLinks::ofPost($post)->code];
        foreach ([...$copies, $duplicate] as $id) {
            $link = ContentLinks::ofPost(ContentPlannerPost::findOrFail($id));
            $this->assertSame('https://lumiere.example/autumn', $link->destination, "post {$id}");
            $this->assertSame("post-{$id}", $link->utm['utm_content']);
            $codes[] = $link->code;
        }
        $this->assertCount(count($copies) + 2, array_unique($codes));
    }

    public function test_a_post_whose_link_is_off_or_unset_gives_copies_without_one(): void
    {
        $post = $this->postWithLink();
        ContentLinks::set($post, null);
        $this->asManager()->postJson($this->api("posts/{$post->id}/duplicate"))->assertCreated()->assertJsonPath('post.link', null);
        $plain = $this->makePost();
        $this->asManager()->postJson($this->api("posts/{$plain->id}/versions"), ['platforms' => ['linkedin'], 'ai' => false])->assertCreated();
        $this->assertSame(1, ContentLink::count());
    }
}
```

- [ ] **Step 2: Run it to see it fail**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-1; "$R/php.sh" tests/Feature/Content/LinkCopiesTest.php
```

Expected: `exit 1` — the versions and copies have no link (`ofPost` answers null; `->destination` on null fails).

- [ ] **Step 3: Copy the address to each copy**

In `app/Services/Content/ContentLinks.php`, replace:

```php
        ] + ContentLinkClicks::summary($link);
    }
```

with:

```php
        ] + ContentLinkClicks::summary($link);
    }

    /**
     * The original's address on each copy, each with its own code and tags (§5.1: versions, repeat copies, duplicates),
     * so clicks are counted per platform and per post. Nothing when the original's Link is unset or switched off.
     *
     * @param iterable<ContentPlannerPost> $copies
     */
    public static function copyTo(ContentPlannerPost $original, iterable $copies): void
    {
        $destination = self::ofPost($original)?->destination;
        if ($destination === null) {
            return;
        }
        foreach ($copies as $copy) {
            self::make((int) $copy->organization_id, (int) $copy->brand_id, (int) $copy->id, $destination, self::tagsFor($copy));
        }
    }
```

In `app/Services/Content/ContentVersions.php`, replace:

```php
            return collect($platforms)->map(function (string $platform) use ($original, $groupId, $userId, $brief) {
```

with:

```php
            $versions = collect($platforms)->map(function (string $platform) use ($original, $groupId, $userId, $brief) {
```

and replace:

```php
                return $version;
            });
        });
    }
```

with:

```php
                return $version;
            });
            // Each version gets its own short link to the same address (spec 2026-10-19 §5.1).
            ContentLinks::copyTo($original, $versions);

            return $versions;
        });
    }
```

In `app/Services/Content/ContentRepeat.php`, replace:

```php
            return collect($dates)->map(fn (string $date) => ContentPlannerPost::create($original->only(self::COPIED) + [
```

with:

```php
            $copies = collect($dates)->map(fn (string $date) => ContentPlannerPost::create($original->only(self::COPIED) + [
```

and replace:

```php
                'generated_by'       => 'repeat',
                'created_by'         => $userId,
            ]));
        });
```

with:

```php
                'generated_by'       => 'repeat',
                'created_by'         => $userId,
            ]));
            // Each copy gets its own short link to the same address (spec 2026-10-19 §5.1).
            ContentLinks::copyTo($original, $copies);

            return $copies;
        });
```

In `app/Http/Controllers/Api/V1/Admin/Content/PostController.php`, replace:

```php
        $copy = self::find($id)->replicate(['published_url', 'published_at', 'status', 'series_id', 'group_id']);
        $copy->status = 'draft';
        $copy->created_by = $request->user()->id;
        $copy->scheduled_date = CarbonImmutable::parse(VenueClock::today(ContentContext::orgId()))->addDays(7)->format('Y-m-d');
        $copy->save();
```

with:

```php
        $original = self::find($id);
        $copy = $original->replicate(['published_url', 'published_at', 'status', 'series_id', 'group_id']);
        $copy->status = 'draft';
        $copy->created_by = $request->user()->id;
        $copy->scheduled_date = CarbonImmutable::parse(VenueClock::today(ContentContext::orgId()))->addDays(7)->format('Y-m-d');
        $copy->save();
        // Its own short link to the same address (spec 2026-10-19 §5.1).
        ContentLinks::copyTo($original, [$copy]);
```

- [ ] **Step 4: Run the test, then the Content folders**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-1; "$R/php.sh" tests/Feature/Content/LinkCopiesTest.php tests/Feature/Content/ tests/Unit/Content/
```

Expected: `LinkCopiesTest | Tests:    3 passed`; both folders `exit 0` (Feature Content 239 + 3 = 242; Unit Content 82).

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app/Services/Content/ContentLinks.php app/Services/Content/ContentVersions.php app/Services/Content/ContentRepeat.php app/Http/Controllers/Api/V1/Admin/Content/PostController.php tests/Feature/Content/LinkCopiesTest.php && git commit -q -m "Content: versions, repeat copies and duplicates get their own short link to the same address" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 4: The link-in-bio page on the public host

**Files:**
- Create: `database/migrations/2026_10_19_100400_create_content_bio_pages_table.php`, `database/migrations/2026_10_19_100500_create_content_bio_buttons_table.php`, `app/Models/ContentBioPage.php`, `app/Models/ContentBioButton.php`, `app/Services/Content/ContentBioPublic.php`, `app/Http/Controllers/ContentPublic/BioPageController.php`, `resources/views/content-public/bio.blade.php`
- Modify: `public/landing/content-public.css`, `lang/{en,ru,de,fr,es}/content_public.php`, `config/landing.php`, `routes/landing.php`, `app/Http/Middleware/LandingHostGuard.php`, `tests/Concerns/SetsUpContentSchema.php`
- Test: create `tests/Feature/Content/BioPageTest.php`
- Eyes (not committed): `$R/bio-seed.php`, `$R/bio-unseed.php`, `$R/bio-eyes.mjs`, `$R/eyes.md`, `$R/shots/`

**Interfaces:**
- Consumes: Task 1's `ContentLinks::make`, `shortUrl`, `BUTTON_TAGS`, `ContentPublicLanguage::of`, the stylesheet; Task 2's `ContentLinks::set`, `ofPost`.
- Produces: tables `content_bio_pages` (`id`, `organization_id`, `brand_id`, `planner_profile_id` unique, `slug` varchar(63) unique, `is_on` default false, `title` varchar(60) null, `line` varchar(160) null, `show_posts` default true, timestamps) and `content_bio_buttons` (`id`, `bio_page_id`, `link_id`, `label` varchar(40), `position` smallint; index (`bio_page_id`, `position`)). Models `App\Models\ContentBioPage` (fillable `organization_id, brand_id, planner_profile_id, slug, is_on, title, line, show_posts`; `buttons(): HasMany` ordered by `position`) and `App\Models\ContentBioButton` (no timestamps; fillable `bio_page_id, link_id, label, position`; `link(): BelongsTo`). `ContentBioPublic::forName(string $name): ?array`. Route `GET /links/{name}` named `content.bio`. `links` in `config('landing.reserved_slugs')`. Lang keys `links`, `latest`, `logo`, `date_format`. Test schema: `brands.primary_color`, `organizations.logo_url`.

- [ ] **Step 1: Write the failing test**

Write `tests/Feature/Content/BioPageTest.php` with the Write tool:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentBioButton;
use App\Models\ContentBioPage;
use App\Models\ContentLink;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerVisualBrief;
use App\Services\Content\ContentLinks;
use App\Support\LandingSlug;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** A brand's link-in-bio page on the public host (spec 2026-10-19 §6.1–§6.3). Today is Monday 5 October 2026, 06:00 UTC. */
class BioPageTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    private function page(array $fields = []): ContentBioPage
    {
        return ContentBioPage::create($fields + ['planner_profile_id' => $this->profile->id, 'brand_id' => $this->brandId, 'slug' => 'lumiere', 'is_on' => true]);
    }

    /** A button; a null address makes one whose code is switched off (a removed button). */
    private function button(ContentBioPage $page, string $label, ?string $destination, int $position): ContentBioButton
    {
        $link = ContentLinks::make($this->org->id, $this->brandId, null, $destination ?? 'https://lumiere.example/old', ContentLinks::BUTTON_TAGS);
        if ($destination === null) {
            $link->update(['destination' => null]);
        }

        return ContentBioButton::create(['bio_page_id' => $page->id, 'link_id' => $link->id, 'label' => $label, 'position' => $position]);
    }

    /** A published post, with a live Link unless told not to. */
    private function published(array $fields, ?string $destination = 'https://lumiere.example/post'): ContentPlannerPost
    {
        $post = $this->makePost($fields + ['status' => 'published', 'published_at' => now()]);
        if ($destination !== null) {
            ContentLinks::set($post, $destination);
        }

        return $post;
    }

    private function visit(string $name)
    {
        return $this->get('http://' . config('landing.host') . '/links/' . $name);
    }

    public function test_an_off_page_or_an_unknown_name_is_the_hosts_404(): void
    {
        $this->page(['is_on' => false]);
        $this->visit('lumiere')->assertNotFound();
        $this->visit('nobody-here')->assertNotFound();
        $this->visit('Lumiere')->assertNotFound();
        $this->visit('lumiere/more')->assertNotFound();
        $this->assertTrue(LandingSlug::isReserved('links'), '"links" is a reserved landing name (spec D9)');
    }

    public function test_an_on_page_shows_its_head_and_live_buttons_in_order_and_is_cached_for_five_minutes(): void
    {
        $page = $this->page(['title' => 'Lumière', 'line' => 'Hair & colour in Riga']);
        $this->button($page, 'Gift cards', 'https://lumiere.example/gifts', 1);
        $this->button($page, 'Book now', 'https://lumiere.example/book', 0);
        $this->button($page, 'Old offer', null, 2);

        $response = $this->visit('lumiere')->assertOk()
            ->assertSee('<title>Lumière</title>', false)
            ->assertSee('<meta name="description" content="Hair &amp; colour in Riga">', false)
            ->assertSee('<meta property="og:title" content="Lumière">', false)
            ->assertSeeInOrder(['Book now', 'Gift cards'])
            ->assertDontSee('Old offer')
            ->assertDontSee('<script', false)
            ->assertDontSee('style="', false)
            ->assertSee('/landing/content-public.css?v=', false);
        $book = ContentLink::whereKey(ContentBioButton::where('label', 'Book now')->value('link_id'))->value('code');
        $response->assertSee('href="' . route('content.go', ['code' => $book]) . '"', false);
        $cache = (string) $response->headers->get('Cache-Control');
        $this->assertStringContainsString('public', $cache);
        $this->assertStringContainsString('max-age=300', $cache);
        $this->assertSame([], $response->headers->getCookies());
        $this->assertStringContainsString("default-src 'self'", (string) $response->headers->get('Content-Security-Policy'));

        // The title is the brand's name until a manager writes one.
        $page->update(['title' => null]);
        $this->visit('lumiere')->assertSee('<title>Lumière Salon</title>', false);
    }

    public function test_the_buttons_take_the_brand_colour_with_readable_text_through_the_nonce(): void
    {
        $this->page();
        $style = function (string $brand, string $on): void {
            $response = $this->visit('lumiere')->assertOk();
            preg_match("/'nonce-([^']+)'/", (string) $response->headers->get('Content-Security-Policy'), $m);
            $response->assertSee('<style nonce="' . $m[1] . '">:root{--cp-brand: ' . $brand . ';--cp-on-brand: ' . $on . ';}</style>', false);
        };
        DB::table('brands')->where('id', $this->brandId)->update(['primary_color' => '#1D4ED8']);
        $style('#1d4ed8', '#ffffff');
        DB::table('brands')->where('id', $this->brandId)->update(['primary_color' => '#f5d90a']);
        $style('#f5d90a', '#14161a');
        // No brand colour: Content's accent, then the platform's own.
        DB::table('brands')->where('id', $this->brandId)->update(['primary_color' => null]);
        DB::table('hotel_settings')->insert(['organization_id' => $this->org->id, 'key' => 'primary_color', 'value' => '#7c3aed', 'created_at' => now(), 'updated_at' => now()]);
        $style('#7c3aed', '#ffffff');
        DB::table('hotel_settings')->where('key', 'primary_color')->delete();
        $style('#2d6a4f', '#ffffff');
    }

    public function test_the_logo_is_the_brands_then_the_organisations_then_initials(): void
    {
        $this->page();
        DB::table('brands')->where('id', $this->brandId)->update(['logo_url' => 'https://cdn.example/brand.png']);
        DB::table('organizations')->where('id', $this->org->id)->update(['logo_url' => 'https://cdn.example/org.png']);
        $this->visit('lumiere')
            ->assertSee('<img class="cp-logo" src="https://cdn.example/brand.png" alt="Lumière Salon logo" width="88" height="88">', false)
            ->assertSee('<meta property="og:image" content="https://cdn.example/brand.png">', false);
        // A picture the page's policy would block (not https) is passed over.
        DB::table('brands')->where('id', $this->brandId)->update(['logo_url' => 'http://insecure.example/brand.png']);
        $this->visit('lumiere')->assertSee('src="https://cdn.example/org.png"', false)->assertDontSee('insecure.example', false);
        DB::table('organizations')->where('id', $this->org->id)->update(['logo_url' => null]);
        $this->visit('lumiere')->assertSee('<span class="cp-logo cp-initials" aria-hidden="true">LS</span>', false)->assertDontSee('og:image', false);
    }

    public function test_latest_posts_show_one_tile_per_version_group_and_only_published_posts_with_a_live_link(): void
    {
        $this->page();
        $original = $this->published(['title' => 'Autumn on Instagram', 'published_at' => now()->subDays(3)]);
        $this->published(['title' => 'Autumn on LinkedIn', 'platform' => 'linkedin', 'group_id' => $original->id, 'published_at' => now()->subDay()]);
        $original->forceFill(['group_id' => $original->id])->save();
        $cleared = $this->published(['title' => 'Cleared link', 'published_at' => now()->subHours(2)]);
        ContentLinks::set($cleared, null);
        $draft = $this->makePost(['status' => 'draft', 'title' => 'A draft']);
        ContentLinks::set($draft, 'https://lumiere.example/draft');
        $this->published(['title' => 'No link at all'], null);
        $pictured = $this->published(['title' => 'Gift cards are here', 'published_at' => now()->subHour()]);
        ContentPlannerVisualBrief::create(['post_id' => $pictured->id, 'image_url' => 'https://cdn.example/gift.jpg', 'image_status' => 'ready']);
        [$secondBrand, $secondProfile] = $this->secondBrand();
        $theirs = ContentPlannerPost::create(['planner_profile_id' => $secondProfile->id, 'brand_id' => $secondBrand, 'platform' => 'instagram', 'status' => 'published', 'title' => 'Second brand post', 'published_at' => now()]);
        ContentLinks::set($theirs, 'https://second.example/');

        $response = $this->visit('lumiere')->assertOk()
            ->assertSee('Latest posts')
            ->assertSeeInOrder(['Gift cards are here', 'Autumn on LinkedIn'])
            ->assertDontSee('Autumn on Instagram')->assertDontSee('Cleared link')->assertDontSee('A draft')
            ->assertDontSee('No link at all')->assertDontSee('Second brand post')
            ->assertSee('<img src="https://cdn.example/gift.jpg" alt="Gift cards are here" loading="lazy">', false)
            ->assertSee('<time datetime="2026-10-04">4 Oct 2026</time>', false);
        $response->assertSee('href="' . route('content.go', ['code' => ContentLinks::ofPost($pictured)->code, 'via' => 'bio']) . '"', false);
    }

    public function test_at_most_twelve_tiles_and_none_when_latest_posts_are_switched_off(): void
    {
        $page = $this->page();
        foreach (range(1, 13) as $n) {
            $this->published(['title' => "Post number {$n}", 'published_at' => now()->subMinutes(100 - $n)]);
        }
        $response = $this->visit('lumiere')->assertOk();
        $this->assertSame(12, substr_count((string) $response->getContent(), 'class="cp-tile"'));
        $response->assertSee('>Post number 13<', false)->assertDontSee('>Post number 1<', false);

        $page->update(['show_posts' => false]);
        $this->visit('lumiere')->assertOk()->assertDontSee('Latest posts')->assertDontSee('Post number 13');
    }

    public function test_the_words_are_in_the_brands_content_language(): void
    {
        $page = $this->page();
        $this->button($page, 'Записаться', 'https://lumiere.example/book', 0);
        $this->published(['title' => 'Осень']);
        $this->profile->update(['default_language' => 'ru']);
        $this->visit('lumiere')->assertSee('<html lang="ru">', false)->assertSee('Последние публикации')->assertSee('aria-label="Ссылки"', false);
        $this->profile->update(['default_language' => 'it']);
        $this->visit('lumiere')->assertSee('<html lang="en">', false)->assertSee('Latest posts');
    }
}
```

- [ ] **Step 2: Run it to see it fail**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-1; "$R/php.sh" tests/Feature/Content/BioPageTest.php
```

Expected: `exit 1` — `ContentBioPage` does not exist and `/links/…` is refused by the host.

- [ ] **Step 3: The tables, the models and the test schema**

Write `database/migrations/2026_10_19_100400_create_content_bio_pages_table.php` with the Write tool:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A brand's link-in-bio page (spec 2026-10-19 §6, §7.1): one per Content profile, at `/links/{slug}` on the public
 * host, off until a manager switches it on. The slug is unique among bio pages (its own namespace, not landing pages').
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('content_bio_pages')) {
            return;
        }
        Schema::create('content_bio_pages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('organization_id')->constrained('organizations')->cascadeOnDelete();
            $table->foreignId('brand_id')->constrained('brands')->cascadeOnDelete();
            $table->foreignId('planner_profile_id')->constrained('content_planner_profiles')->cascadeOnDelete();
            $table->string('slug', 63)->unique();
            $table->boolean('is_on')->default(false);
            $table->string('title', 60)->nullable();
            $table->string('line', 160)->nullable();
            $table->boolean('show_posts')->default(true);
            $table->timestamps();
            $table->unique('planner_profile_id');
            $table->index('brand_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_bio_pages');
    }
};
```

Write `database/migrations/2026_10_19_100500_create_content_bio_buttons_table.php` with the Write tool:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A link-in-bio page's buttons (spec 2026-10-19 §6.2, §7.1): a label and a tracked link each, in `position` order.
 * Removing a button deletes its row and switches its link's code off (the link row stays).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('content_bio_buttons')) {
            return;
        }
        Schema::create('content_bio_buttons', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bio_page_id')->constrained('content_bio_pages')->cascadeOnDelete();
            $table->foreignId('link_id')->constrained('content_links')->cascadeOnDelete();
            $table->string('label', 40);
            $table->smallInteger('position');
            $table->index(['bio_page_id', 'position']);
            $table->index('link_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('content_bio_buttons');
    }
};
```

Write `app/Models/ContentBioPage.php` with the Write tool:

```php
<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A brand's link-in-bio page (spec 2026-10-19 §6): `/links/{slug}` on the public host, off until a manager switches it
 * on. A public request has no tenant: the public host reads it with withoutGlobalScopes(), by slug.
 */
class ContentBioPage extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = ['organization_id', 'brand_id', 'planner_profile_id', 'slug', 'is_on', 'title', 'line', 'show_posts'];

    protected $casts = ['is_on' => 'boolean', 'show_posts' => 'boolean'];

    public function buttons(): HasMany
    {
        return $this->hasMany(ContentBioButton::class, 'bio_page_id')->orderBy('position');
    }
}
```

Write `app/Models/ContentBioButton.php` with the Write tool:

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A button on a link-in-bio page (spec 2026-10-19 §6.2): a label and a tracked link, in `position` order. */
class ContentBioButton extends Model
{
    public $timestamps = false;

    protected $fillable = ['bio_page_id', 'link_id', 'label', 'position'];

    public function link(): BelongsTo
    {
        return $this->belongsTo(ContentLink::class, 'link_id');
    }
}
```

In `tests/Concerns/SetsUpContentSchema.php`, replace:

```php
            'country'           => fn (Blueprint $t) => $t->string('country', 2)->nullable(),
        ];
```

with:

```php
            'country'           => fn (Blueprint $t) => $t->string('country', 2)->nullable(),
            // The link-in-bio page's logo falls back to the organisation's (spec 2026-10-19 §6.2).
            'logo_url'          => fn (Blueprint $t) => $t->string('logo_url')->nullable(),
        ];
```

and replace:

```php
        if (!Schema::hasTable('content_link_clicks')) {
            (require database_path('migrations/2026_10_19_100300_create_content_link_clicks_table.php'))->up();
        }
```

with:

```php
        if (!Schema::hasTable('content_link_clicks')) {
            (require database_path('migrations/2026_10_19_100300_create_content_link_clicks_table.php'))->up();
        }
        if (!Schema::hasTable('content_bio_pages')) {
            (require database_path('migrations/2026_10_19_100400_create_content_bio_pages_table.php'))->up();
        }
        if (!Schema::hasTable('content_bio_buttons')) {
            (require database_path('migrations/2026_10_19_100500_create_content_bio_buttons_table.php'))->up();
        }
        // The link-in-bio page's buttons take the brand's colour (spec 2026-10-19 §6.2).
        if (!Schema::hasColumn('brands', 'primary_color')) {
            Schema::table('brands', fn (Blueprint $t) => $t->string('primary_color', 7)->nullable());
        }
```

- [ ] **Step 4: What the page draws, its controller, route, host entry and reserved name**

Write `app/Services/Content/ContentBioPublic.php` with the Write tool:

```php
<?php

namespace App\Services\Content;

use App\Http\Controllers\Api\V1\Admin\Appointments\BootstrapController as AppointmentsBootstrap;
use App\Models\Brand;
use App\Models\ContentBioButton;
use App\Models\ContentBioPage;
use App\Models\ContentPlannerPost;
use App\Models\Organization;
use App\Services\Appointments\VenueClock;
use App\Support\Accent;
use App\Support\CssColor;
use App\Support\LandingSlug;
use Carbon\CarbonImmutable;
use Illuminate\Support\Str;

/**
 * What a brand's link-in-bio page draws (spec 2026-10-19 §6.2), read across tenants by name: the head (logo, title,
 * line), the live buttons in order, and the latest published posts with a live short link, one per group of versions,
 * in the brand's Content language. Null when there is no page by that name, it is off, or its brand is gone.
 */
final class ContentBioPublic
{
    public const TILES = 12;
    /** The text on a brand colour too light for white (the owner's button rule: white from 3:1, otherwise ink). */
    public const INK = '#14161a';

    /** @return array<string, mixed>|null */
    public static function forName(string $name): ?array
    {
        if (!LandingSlug::isValid($name)) {
            return null;
        }
        $page = ContentBioPage::withoutGlobalScopes()->where('slug', $name)->where('is_on', true)->first();
        $brand = $page ? Brand::withoutGlobalScopes()->find($page->brand_id) : null;
        if ($page === null || $brand === null || $brand->trashed()) {
            return null;
        }
        $orgId = (int) $page->organization_id;
        $language = ContentPublicLanguage::of((int) $page->brand_id);
        $title = $page->title ?: (string) $brand->name;
        $colour = CssColor::safe($brand->primary_color, '') ?: CssColor::safe(AppointmentsBootstrap::accent($orgId));

        return [
            'lang'     => $language,
            'title'    => $title,
            'line'     => $page->line,
            'logo'     => self::picture($brand->logo_url) ?? self::picture(Organization::withoutGlobalScopes()->whereKey($orgId)->value('logo_url')),
            'initials' => self::initials($title),
            'brand'    => $colour,
            'onBrand'  => Accent::contrast($colour, '#ffffff') >= 3 ? '#ffffff' : self::INK,
            'buttons'  => self::buttons($page),
            'tiles'    => $page->show_posts ? self::tiles($page, $language) : [],
        ];
    }

    /** The live buttons in order, each through its short link (§6.2). @return list<array{label: string, href: string}> */
    private static function buttons(ContentBioPage $page): array
    {
        return ContentBioButton::query()
            ->join('content_links', 'content_links.id', '=', 'content_bio_buttons.link_id')
            ->where('content_bio_buttons.bio_page_id', $page->id)
            ->whereNotNull('content_links.destination')
            ->orderBy('content_bio_buttons.position')
            ->get(['content_bio_buttons.label', 'content_links.code'])
            ->map(fn (ContentBioButton $button) => ['label' => (string) $button->label, 'href' => ContentLinks::shortUrl((string) $button->code)])
            ->all();
    }

    /**
     * Up to TILES published posts whose short link is on, newest first, one per group of versions (its newest
     * published). A tile is the post's picture when its brief has a ready one, else its words, with its date (§6.2).
     *
     * @return list<array{href: string, picture: ?string, text: string, date: ?string, date_label: ?string}>
     */
    private static function tiles(ContentBioPage $page, string $language): array
    {
        $zone = VenueClock::zone((int) $page->organization_id);
        $format = (string) __('content_public.date_format', [], $language);

        return ContentPlannerPost::withoutGlobalScopes()
            ->join('content_links', 'content_links.post_id', '=', 'content_planner_posts.id')
            ->where('content_planner_posts.organization_id', $page->organization_id)
            ->where('content_planner_posts.planner_profile_id', $page->planner_profile_id)
            ->where('content_planner_posts.status', 'published')
            ->whereNotNull('content_links.destination')
            // A post set to Published by a plain save has no published_at: its last change stands in.
            ->orderByRaw('COALESCE(content_planner_posts.published_at, content_planner_posts.updated_at) DESC')
            ->orderByDesc('content_planner_posts.id')
            // Enough rows for TILES groups even when every group has a version on every platform.
            ->limit(self::TILES * count(ContentRules::PLATFORMS))
            ->with('visualBrief')
            ->get(['content_planner_posts.*', 'content_links.code as link_code'])
            ->unique(fn (ContentPlannerPost $post) => $post->group_id ? 'group-' . $post->group_id : 'post-' . $post->id)
            ->take(self::TILES)
            ->map(function (ContentPlannerPost $post) use ($zone, $language, $format) {
                $brief = $post->visualBrief;
                $at = $post->published_at ?? $post->updated_at;
                $day = $at ? CarbonImmutable::parse($at)->setTimezone($zone) : null;

                return [
                    'href'       => route('content.go', ['code' => $post->link_code, 'via' => 'bio']),
                    'picture'    => $brief?->image_status === 'ready' ? self::picture($brief->image_url) : null,
                    'text'       => Str::limit((string) ($post->title ?: ($post->hook ?: $post->topic)), 120),
                    'date'       => $day?->format('Y-m-d'),
                    'date_label' => $day?->locale($language)->isoFormat($format),
                ];
            })
            ->values()
            ->all();
    }

    /** A picture the landing policy lets the page show (`img-src 'self' data: https:`): https, or a path on this host. */
    private static function picture(?string $url): ?string
    {
        $url = trim((string) $url);

        return str_starts_with($url, 'https://') || (str_starts_with($url, '/') && !str_starts_with($url, '//')) ? $url : null;
    }

    /** Up to two initials of the title, for a brand without a logo. */
    private static function initials(string $title): string
    {
        $words = preg_split('/\s+/u', trim($title), -1, PREG_SPLIT_NO_EMPTY) ?: [];

        return implode('', array_map(fn (string $word) => mb_strtoupper(mb_substr($word, 0, 1)), array_slice($words, 0, 2)));
    }
}
```

Write `app/Http/Controllers/ContentPublic/BioPageController.php` with the Write tool:

```php
<?php

namespace App\Http\Controllers\ContentPublic;

use App\Http\Controllers\Controller;
use App\Services\Content\ContentBioPublic;
use Symfony\Component\HttpFoundation\Response;

/**
 * A brand's link-in-bio page on the public host (spec 2026-10-19 §6.2, §6.3): no page by that name, or one switched
 * off, is the host's normal 404; a page that is on is cached for five minutes like a landing page. Served from
 * routes/landing.php: no `web` group, no session, the landing CSP (the brand colour comes in through its nonce).
 */
class BioPageController extends Controller
{
    public function show(string $name): Response
    {
        $page = ContentBioPublic::forName($name);
        abort_if($page === null, 404);

        return response()->view('content-public.bio', $page)->header('Cache-Control', 'public, max-age=300');
    }
}
```

In `routes/landing.php`, replace:

```php
use App\Http\Controllers\ContentPublic\GoController;
```

with:

```php
use App\Http\Controllers\ContentPublic\BioPageController;
use App\Http\Controllers\ContentPublic\GoController;
```

and replace:

```php
            ->where('code', '[a-z2-9]{7}')
            ->name('content.go');
```

with:

```php
            ->where('code', '[a-z2-9]{7}')
            ->name('content.go');

        // A brand's link-in-bio page (spec 2026-10-19 §6); `links` is a reserved landing name (config/landing.php).
        Route::get('/links/{name}', [BioPageController::class, 'show'])
            ->where('name', '[a-z0-9-]+')
            ->name('content.bio');
```

In `app/Http/Middleware/LandingHostGuard.php`, replace:

```php
        '#^go/[a-z2-9]{7}$#',  // content.go: HexaTech Content's short links (routes/landing.php, outside `web`)
```

with:

```php
        '#^go/[a-z2-9]{7}$#',  // content.go: HexaTech Content's short links (routes/landing.php, outside `web`)
        '#^links/[a-z0-9-]+$#', // content.bio: a brand's link-in-bio page (routes/landing.php, outside `web`)
```

In `config/landing.php`, replace:

```php
        // The framework health route. On the landing host /up matches
        // landing.show, so a tenant holding this slug would shadow it.
        'up',
```

with:

```php
        // The framework health route. On the landing host /up matches
        // landing.show, so a tenant holding this slug would shadow it.
        'up',
        // HexaTech Content's link-in-bio pages live under /links/{name} (spec
        // 2026-10-19 D9). Its short links' /go is two letters, below
        // LandingSlug::MIN, so no tenant can hold it anyway.
        'links',
```

- [ ] **Step 5: The page, its styles and its words**

Write `resources/views/content-public/bio.blade.php` with the Write tool:

```blade
{{--
  A brand's link-in-bio page (spec 2026-10-19 §6.2, §6.3), on the public host under the landing CSP: our own
  stylesheet, and the brand colour through the one nonce'd block. Its values come from CssColor::safe only, so none of
  them is a customer string. No scripts, no style attributes, {{ }} only.
--}}
<!doctype html>
<html lang="{{ $lang }}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ $title }}</title>
@if ($line)
<meta name="description" content="{{ $line }}">
@endif
<meta property="og:title" content="{{ $title }}">
@if ($logo)
<meta property="og:image" content="{{ $logo }}">
@endif
<link rel="stylesheet" href="{{ asset('landing/content-public.css') }}{{ \App\Support\AssetVersion::query('landing/content-public.css') }}">
<style nonce="{{ $cspNonce }}">:root{--cp-brand: {{ $brand }};--cp-on-brand: {{ $onBrand }};}</style>
</head>
<body class="cp">
<main class="cp-bio">
  <header class="cp-head">
    @if ($logo)
      <img class="cp-logo" src="{{ $logo }}" alt="{{ __('content_public.logo', ['name' => $title], $lang) }}" width="88" height="88">
    @else
      <span class="cp-logo cp-initials" aria-hidden="true">{{ $initials }}</span>
    @endif
    <h1 class="cp-title">{{ $title }}</h1>
    @if ($line)
      <p class="cp-line">{{ $line }}</p>
    @endif
  </header>
  @if ($buttons)
    <nav class="cp-buttons" aria-label="{{ __('content_public.links', [], $lang) }}">
      <ul>
        @foreach ($buttons as $button)
          <li><a class="cp-button" href="{{ $button['href'] }}">{{ $button['label'] }}</a></li>
        @endforeach
      </ul>
    </nav>
  @endif
  @if ($tiles)
    <section class="cp-posts" aria-labelledby="cp-posts-title">
      <h2 id="cp-posts-title">{{ __('content_public.latest', [], $lang) }}</h2>
      <ul class="cp-tiles">
        @foreach ($tiles as $tile)
          <li>
            <a class="cp-tile" href="{{ $tile['href'] }}">
              @if ($tile['picture'])
                <img src="{{ $tile['picture'] }}" alt="{{ $tile['text'] }}" loading="lazy">
              @else
                <span class="cp-tile-text">{{ $tile['text'] }}</span>
              @endif
              @if ($tile['date'])
                <time datetime="{{ $tile['date'] }}">{{ $tile['date_label'] }}</time>
              @endif
            </a>
          </li>
        @endforeach
      </ul>
    </section>
  @endif
</main>
</body>
</html>
```

In `public/landing/content-public.css`, replace:

```css
.cp-off h1 { margin: 0; font-size: 1.375rem; line-height: 1.3; font-weight: 600; }
```

with:

```css
.cp-off h1 { margin: 0; font-size: 1.375rem; line-height: 1.3; font-weight: 600; }

/* The link-in-bio page (spec §6.2): mobile first, at most 480 px wide, centred on wider screens. */
.cp-bio { max-width: 480px; margin: 0 auto; padding: 40px 20px 56px; }
.cp-head { text-align: center; }
.cp-logo {
  display: block;
  width: 88px;
  height: 88px;
  margin: 0 auto 16px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--cp-card);
  border: 1px solid var(--cp-line);
}
.cp-initials {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  background: var(--cp-brand);
  color: var(--cp-on-brand);
  font-size: 1.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}
.cp-title { margin: 0; font-size: 1.5rem; line-height: 1.25; font-weight: 650; overflow-wrap: anywhere; }
.cp-line { margin: 8px 0 0; color: var(--cp-muted); overflow-wrap: anywhere; }

.cp-buttons ul,
.cp-tiles { list-style: none; margin: 0; padding: 0; }
.cp-buttons { margin-top: 28px; }
.cp-buttons li + li { margin-top: 12px; }
.cp-button {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 52px;
  padding: 12px 20px;
  border-radius: 14px;
  background: var(--cp-brand);
  color: var(--cp-on-brand);
  font-weight: 600;
  text-align: center;
  text-decoration: none;
  overflow-wrap: anywhere;
}
.cp-button:hover { filter: brightness(1.06); }
.cp-button:focus-visible,
.cp-tile:focus-visible { outline: 3px solid var(--cp-ink); outline-offset: 3px; }

.cp-posts { margin-top: 40px; }
.cp-posts h2 {
  margin: 0 0 14px;
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--cp-muted);
}
.cp-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.cp-tile {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-radius: 14px;
  overflow: hidden;
  background: var(--cp-card);
  border: 1px solid var(--cp-line);
  color: var(--cp-ink);
  text-decoration: none;
}
.cp-tile img { display: block; width: 100%; aspect-ratio: 1 / 1; object-fit: cover; }
.cp-tile-text {
  display: flex;
  align-items: center;
  aspect-ratio: 1 / 1;
  padding: 14px;
  font-weight: 600;
  line-height: 1.35;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.cp-tile time { display: block; padding: 8px 12px 10px; font-size: 0.8125rem; color: var(--cp-muted); }
```

Write `lang/en/content_public.php` with the Write tool (it replaces Task 1's):

```php
<?php

// The words of HexaTech Content's pages on the public host (spec 2026-10-19 §5.3, §6.2), in the brand's Content language.
// Placeholder: :name. date_format is a Carbon isoFormat pattern for a tile's date.
return [
    'link_off'    => 'This link is no longer active',
    'links'       => 'Links',
    'latest'      => 'Latest posts',
    'logo'        => ':name logo',
    'date_format' => 'D MMM YYYY',
];
```

Write `lang/ru/content_public.php` with the Write tool (it replaces Task 1's):

```php
<?php

// The words of HexaTech Content's pages on the public host (spec 2026-10-19 §5.3, §6.2), in the brand's Content language.
// Placeholder: :name. date_format is a Carbon isoFormat pattern for a tile's date.
return [
    'link_off'    => 'Эта ссылка больше не действует',
    'links'       => 'Ссылки',
    'latest'      => 'Последние публикации',
    'logo'        => 'Логотип :name',
    'date_format' => 'D MMM YYYY',
];
```

Write `lang/de/content_public.php` with the Write tool (it replaces Task 1's):

```php
<?php

// The words of HexaTech Content's pages on the public host (spec 2026-10-19 §5.3, §6.2), in the brand's Content language.
// Placeholder: :name. date_format is a Carbon isoFormat pattern for a tile's date.
return [
    'link_off'    => 'Dieser Link ist nicht mehr aktiv',
    'links'       => 'Links',
    'latest'      => 'Neueste Beiträge',
    'logo'        => 'Logo von :name',
    'date_format' => 'D. MMM YYYY',
];
```

Write `lang/fr/content_public.php` with the Write tool (it replaces Task 1's):

```php
<?php

// The words of HexaTech Content's pages on the public host (spec 2026-10-19 §5.3, §6.2), in the brand's Content language.
// Placeholder: :name. date_format is a Carbon isoFormat pattern for a tile's date.
return [
    'link_off'    => 'Ce lien n’est plus actif',
    'links'       => 'Liens',
    'latest'      => 'Dernières publications',
    'logo'        => 'Logo de :name',
    'date_format' => 'D MMM YYYY',
];
```

Write `lang/es/content_public.php` with the Write tool (it replaces Task 1's):

```php
<?php

// The words of HexaTech Content's pages on the public host (spec 2026-10-19 §5.3, §6.2), in the brand's Content language.
// Placeholder: :name. date_format is a Carbon isoFormat pattern for a tile's date.
return [
    'link_off'    => 'Este enlace ya no está activo',
    'links'       => 'Enlaces',
    'latest'      => 'Últimas publicaciones',
    'logo'        => 'Logotipo de :name',
    'date_format' => 'D MMM YYYY',
];
```

- [ ] **Step 6: Run the test, then the Content folders and the host's own tests**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-1; cd /c/wamp64/www/Hexa-Tech-content && /c/wamp64/bin/php/php8.4.20/php.exe artisan view:clear < /dev/null && "$R/php.sh" tests/Feature/Content/BioPageTest.php tests/Feature/Content/ tests/Unit/Content/ tests/Feature/Landing/LandingHostIsolationTest.php tests/Feature/Landing/LandingRoutingTest.php tests/Unit/Support/
```

Expected: `BioPageTest | Tests:    7 passed`; every line `exit 0` (Feature Content 242 + 7 = 249; Unit Content 82; Unit Support 177).

- [ ] **Step 7: Eyes on the page (360 and 1440), and the count on PostgreSQL**

The local database is PostgreSQL, so this step also proves the click upsert there. Apply the four migrations locally (additive):

```bash
cd /c/wamp64/www/Hexa-Tech-content && ls bootstrap/cache/config.php 2>/dev/null; for m in 2026_10_19_100200_create_content_links_table 2026_10_19_100300_create_content_link_clicks_table 2026_10_19_100400_create_content_bio_pages_table 2026_10_19_100500_create_content_bio_buttons_table; do /c/wamp64/bin/php/php8.4.20/php.exe artisan migrate --path=database/migrations/$m.php --force < /dev/null | tail -1; done
```

Expected: no `config.php` listed (the server below reads `LANDING_HOST` from its environment); each migration `DONE` (or `Nothing to migrate`). Ledger the line.

Write `$R/bio-seed.php` with the Write tool:

```php
<?php
// Plan 5B-1 eyes: a release-check brand on local org 16 with a Content profile and its link-in-bio page switched on —
// three buttons (one switched off) and five published posts with links, two with pictures, one with a version that must
// not show. bio-unseed.php removes all of it.
use App\Models\ContentBioButton;
use App\Models\ContentBioPage;
use App\Models\ContentPlannerPost;
use App\Models\ContentPlannerProfile;
use App\Models\ContentPlannerVisualBrief;
use App\Services\Content\ContentLinks;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

$org = 16;
$name = 'Release check 5b: link-in-bio';
if (DB::table('brands')->where('organization_id', $org)->where('name', $name)->exists()) { echo "EXISTS\n"; return; }
$now = now();
$brand = DB::table('brands')->insertGetId([
    'organization_id' => $org, 'name' => $name, 'slug' => 'release-check-r5b', 'primary_color' => '#1f6f5c', 'widget_token' => Str::random(32),
    'is_default' => false, 'sort_order' => 99, 'created_at' => $now, 'updated_at' => $now,
]);
app()->instance('current_organization_id', $org);
app()->instance('current_brand_id', $brand);
$profile = ContentPlannerProfile::create(['name' => $name, 'brand_id' => $brand, 'default_language' => 'en', 'setup_completed_at' => $now]);
$page = ContentBioPage::create([
    'planner_profile_id' => $profile->id, 'brand_id' => $brand, 'slug' => 'release-check-5b', 'is_on' => true,
    'line' => 'Hair, colour and care in the heart of Riga. Book online in a minute.',
]);
foreach ([['Book an appointment', 'https://example.com/book'], ['Gift cards', 'https://example.com/gifts'], ['Old summer offer', null]] as $i => [$label, $to]) {
    $link = ContentLinks::make($org, $brand, null, $to ?? 'https://example.com/summer', ContentLinks::BUTTON_TAGS);
    if ($to === null) { $link->update(['destination' => null]); }
    ContentBioButton::create(['bio_page_id' => $page->id, 'link_id' => $link->id, 'label' => $label, 'position' => $i]);
}
$pictures = array_map(fn ($file) => '/landing/aera_reformer/assets/' . basename($file), array_slice(glob(public_path('landing/aera_reformer/assets/*.webp')), 0, 2));
$post = function (array $fields, ?string $picture = null) use ($profile, $brand) {
    $p = ContentPlannerPost::create($fields + ['planner_profile_id' => $profile->id, 'brand_id' => $brand, 'status' => 'published', 'language' => 'en', 'generated_by' => 'manual', 'hashtags' => []]);
    ContentLinks::set($p, 'https://example.com/post-' . $p->id);
    if ($picture) { ContentPlannerVisualBrief::create(['post_id' => $p->id, 'image_url' => $picture, 'image_status' => 'ready']); }
    return $p;
};
$autumn = $post(['platform' => 'instagram', 'title' => 'Autumn colour week: 20% off every colour service', 'published_at' => $now->copy()->subDays(1)], $pictures[0] ?? null);
$post(['platform' => 'linkedin', 'title' => 'Autumn colour week (LinkedIn version)', 'group_id' => $autumn->id, 'published_at' => $now->copy()->subDays(2)]);
$autumn->forceFill(['group_id' => $autumn->id])->save();
$post(['platform' => 'instagram', 'hook' => 'Meet Anna, our new senior stylist — ten years of balayage and a calm chair.', 'published_at' => $now->copy()->subDays(3)], $pictures[1] ?? null);
$post(['platform' => 'facebook', 'title' => 'Gift cards for every occasion', 'published_at' => $now->copy()->subDays(5)]);
$post(['platform' => 'instagram', 'title' => 'How to keep your colour bright through the winter', 'published_at' => $now->copy()->subDays(8)]);
$code = DB::table('content_links')->where('post_id', $autumn->id)->value('code');
echo "BRAND {$brand} PAGE {$page->id} CODE {$code}\n";
```

Write `$R/bio-unseed.php` with the Write tool:

```php
<?php
// Removes what bio-seed.php made: the brand, its profile, posts and briefs, its bio page and buttons, and its short
// links with their clicks.
use Illuminate\Support\Facades\DB;

$brand = DB::table('brands')->where('organization_id', 16)->where('name', 'Release check 5b: link-in-bio')->value('id');
if (!$brand) { echo "NOTHING\n"; return; }
$profiles = DB::table('content_planner_profiles')->where('brand_id', $brand)->pluck('id');
$posts = DB::table('content_planner_posts')->whereIn('planner_profile_id', $profiles)->pluck('id');
$pages = DB::table('content_bio_pages')->where('brand_id', $brand)->pluck('id');
DB::table('content_bio_buttons')->whereIn('bio_page_id', $pages)->delete();
DB::table('content_bio_pages')->whereIn('id', $pages)->delete();
$links = DB::table('content_links')->where('brand_id', $brand)->pluck('id');
DB::table('content_link_clicks')->whereIn('link_id', $links)->delete();
DB::table('content_links')->whereIn('id', $links)->delete();
DB::table('content_planner_visual_briefs')->whereIn('post_id', $posts)->delete();
DB::table('content_planner_posts')->whereIn('id', $posts)->delete();
DB::table('content_planner_profiles')->whereIn('id', $profiles)->delete();
DB::table('brands')->where('id', $brand)->delete();
echo "REMOVED brand {$brand}, posts {$posts->count()}, links {$links->count()}\n";
```

Write `$R/bio-eyes.mjs` with the Write tool:

```js
// Plan 5B-1 eyes (Task 4): the release-check link-in-bio page at 360 and 1440, as a visitor sees it (no sign-in), on the
// local server started with LANDING_HOST=sites.localhost. Prints status, sideways overflow and console errors (a CSP
// refusal shows up there).
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'file:///C:/wamp64/www/Hexa-Tech-content/.superpowers/sdd/archive/2026-10-19-content-release-5a-2/tools/node_modules/playwright-core/index.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PAGE = 'http://sites.localhost:8013/links/release-check-5b'
const CHROME = path.join(process.env.LOCALAPPDATA, 'ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe')
mkdirSync(path.join(HERE, 'shots'), { recursive: true })

const browser = await chromium.launch({ executablePath: CHROME, args: ['--disable-gpu', '--font-render-hinting=none', '--host-resolver-rules=MAP sites.localhost 127.0.0.1'] })
try {
  for (const [name, width, height] of [['bio-360', 360, 800], ['bio-1440', 1440, 900]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
    const errors = []
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    const response = await page.goto(PAGE, { waitUntil: 'networkidle' })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    await page.screenshot({ path: path.join(HERE, 'shots', `${name}.png`), fullPage: true })
    console.log(`${name}: ${response.status()} overflow=${overflow} console-errors=${errors.length}${errors.length ? ' ' + errors.join(' | ') : ''}`)
    await page.close()
  }
} finally {
  await browser.close()
}
```

Seed, then start the server (background — the Bash tool's `run_in_background`):

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-1; cd /c/wamp64/www/Hexa-Tech-content && /c/wamp64/bin/php/php8.4.20/php.exe artisan tinker "$R/bio-seed.php" < /dev/null | tail -1
```

Expected: `BRAND <id> PAGE <id> CODE <7 characters>`. Keep the code for the count check.

```bash
cd /c/wamp64/www/Hexa-Tech-content && LANDING_HOST=sites.localhost /c/wamp64/bin/php/php8.4.20/php.exe artisan serve --port=8013 --no-reload
```

Then the answers and the count on PostgreSQL (put the seed's code in `CODE`):

```bash
CODE=<the seed's code>; cd /c/wamp64/www/Hexa-Tech-content && H="--resolve sites.localhost:8013:127.0.0.1"; curl -s -o /dev/null -w "page %{http_code}\n" $H http://sites.localhost:8013/links/release-check-5b; for i in 1 2; do curl -s -o /dev/null -w "go %{http_code} %{redirect_url}\n" $H "http://sites.localhost:8013/go/$CODE"; done; curl -s -o /dev/null -w "css %{http_code}\n" $H http://sites.localhost:8013/landing/content-public.css; /c/wamp64/bin/php/php8.4.20/php.exe artisan tinker --execute="echo DB::table('content_link_clicks')->join('content_links','content_links.id','=','content_link_clicks.link_id')->where('content_links.code','$CODE')->sum('clicks');" < /dev/null | tail -1
```

Expected: `page 200`; twice `go 302 https://example.com/post-<id>?utm_source=instagram&utm_medium=social&utm_campaign=content-plan&utm_content=post-<id>`; `css 200`; then `2` (PostgreSQL's upsert counted both). A `page 404` means `LANDING_HOST` did not reach the server: stop it and start `LANDING_HOST=sites.localhost /c/wamp64/bin/php/php8.4.20/php.exe -S 127.0.0.1:8013 -t public vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php` (background) instead, with a ledger `Ruling:` line.

Then the screenshots:

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-1; node "$R/bio-eyes.mjs"
```

Expected: `bio-360: 200 overflow=0 console-errors=0` and `bio-1440: 200 overflow=0 console-errors=0`.

Read `$R/shots/bio-360.png` and `$R/shots/bio-1440.png` with the Read tool and look: the logo circle with initials "RC" in the brand green, the title and line centred; two green buttons with white text, full width at 360 and at most 480 px wide, centred at 1440; "Old summer offer" absent; "LATEST POSTS" with four tiles in two columns (two pictures, two text tiles, each with a date), the LinkedIn version absent; nothing cut off or overlapping. Write what you saw, line by line, into `$R/eyes.md`. A defect is fixed in the CSS or the view now, with a ledger `Ruling:` line, and both shots retaken.

Stop the server (TaskStop on the background task; then `netstat -ano | grep :8013` — any process left still listening: check its command line with `wmic process where processid=<pid> get commandline` and `taskkill //PID <pid> //F` only when it is this `artisan serve --port=8013`), then remove the seed:

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-1; cd /c/wamp64/www/Hexa-Tech-content && /c/wamp64/bin/php/php8.4.20/php.exe artisan tinker "$R/bio-unseed.php" < /dev/null | tail -1
```

Expected: `REMOVED brand <id>, posts 5, links 8`. Ledger one line: `Task 4: note: eyes 360+1440 clean (eyes.md); PostgreSQL upsert counted 2/2`.

- [ ] **Step 8: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add database/migrations/2026_10_19_100400_create_content_bio_pages_table.php database/migrations/2026_10_19_100500_create_content_bio_buttons_table.php app/Models/ContentBioPage.php app/Models/ContentBioButton.php app/Services/Content/ContentBioPublic.php app/Http/Controllers/ContentPublic/BioPageController.php resources/views/content-public/bio.blade.php public/landing/content-public.css lang/en/content_public.php lang/ru/content_public.php lang/de/content_public.php lang/fr/content_public.php lang/es/content_public.php config/landing.php routes/landing.php app/Http/Middleware/LandingHostGuard.php tests/Concerns/SetsUpContentSchema.php tests/Feature/Content/BioPageTest.php && git commit -q -m "Content: the link-in-bio page on the public host — buttons in the brand colour and the latest posts, one per version group" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 5: Editing the link-in-bio page

**Files:**
- Create: `app/Services/Content/ContentBio.php`, `app/Http/Controllers/Api/V1/Admin/Content/BioController.php`
- Modify: `app/Services/Content/ContentLinks.php`, `app/Services/Content/ContentLinkClicks.php`, `routes/api.php`, `tests/Concerns/SetsUpContentSchema.php`
- Test: create `tests/Feature/Content/BioEditorTest.php`

**Interfaces:**
- Consumes: Task 4's `ContentBioPage`, `ContentBioButton` (`buttons()`, `link()`), route `content.bio`; Task 1's `ContentLinks::make`, `shortUrl`, `BUTTON_TAGS`, `clean`.
- Produces: `ContentLinks::cleanRequired(mixed $value): string`; `ContentLinkClicks::since(list<int> $linkIds, string $from): array<int,int>`; `ContentBio::MAX_BUTTONS` (8), `CLICK_DAYS` (30), `ContentBio::of(ContentPlannerProfile): ?ContentBioPage`, `ContentBio::describe(ContentPlannerProfile): array{page, buttons, url, suggested_name}`, `ContentBio::suggestedName(ContentPlannerProfile, ?int $exceptPageId = null): string`, `ContentBio::save(ContentPlannerProfile, array $data): ContentBioPage`. `GET bio` (everyone) and `PUT bio` (managers) under `/api/v1/admin/content`.

- [ ] **Step 1: Write the failing test**

Write `tests/Feature/Content/BioEditorTest.php` with the Write tool:

```php
<?php

namespace Tests\Feature\Content;

use App\Models\ContentBioButton;
use App\Models\ContentBioPage;
use App\Models\ContentLink;
use App\Services\Content\ContentLinks;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SetsUpContentSchema;
use Tests\TestCase;

/** Editing the link-in-bio page on the Brand page (spec 2026-10-19 §6.1, §6.4, §7.2). Today is Monday 5 October 2026. */
class BioEditorTest extends TestCase
{
    use DatabaseTransactions, SetsUpContentSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpContent();
    }

    /** @param list<array<string, mixed>> $buttons */
    private function body(array $buttons = [], array $page = []): array
    {
        return $page + ['is_on' => true, 'slug' => 'lumiere', 'title' => null, 'line' => null, 'show_posts' => true, 'buttons' => $buttons];
    }

    private function save(array $body)
    {
        return $this->asManager()->putJson($this->api('bio'), $body);
    }

    /** Another organisation's page holding a name. */
    private function theirs(string $slug): void
    {
        $other = $this->otherOrganization();
        DB::table('content_bio_pages')->insert([
            'organization_id' => $other['org']->id, 'brand_id' => $other['brandId'], 'planner_profile_id' => $other['post']->planner_profile_id,
            'slug' => $slug, 'is_on' => true, 'show_posts' => true, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function landingPage(string $slug, ?int $brandId = null): void
    {
        DB::table('landing_pages')->insert([
            'organization_id' => $this->org->id, 'brand_id' => $brandId ?? $this->brandId, 'slug' => $slug, 'template_key' => 'aera_reformer',
            'industry' => 'beauty', 'status' => 'published', 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_a_brand_without_a_page_reads_none_and_the_name_its_landing_page_has(): void
    {
        $this->landingPage('lumiere-riga');
        $this->asStaffMember()->getJson($this->api('bio'))->assertOk()
            ->assertExactJson(['page' => null, 'buttons' => [], 'url' => null, 'suggested_name' => 'lumiere-riga']);
    }

    public function test_otherwise_the_name_is_the_brands_with_a_number_when_it_is_taken(): void
    {
        // The default brand's slug is "lumiere-salon" (the organisation makes it from its name).
        $this->asManager()->getJson($this->api('bio'))->assertJsonPath('suggested_name', 'lumiere-salon');
        $this->theirs('lumiere-salon');
        $this->asManager()->getJson($this->api('bio'))->assertJsonPath('suggested_name', 'lumiere-salon-2');
        $this->theirs('lumiere-salon-2');
        $this->asManager()->getJson($this->api('bio'))->assertJsonPath('suggested_name', 'lumiere-salon-3');
        // A landing-page name another bio page already has is passed over too.
        $this->landingPage('lumiere-salon-2');
        $this->asManager()->getJson($this->api('bio'))->assertJsonPath('suggested_name', 'lumiere-salon-3');
    }

    public function test_a_manager_saves_the_page_and_its_buttons_in_order_and_staff_only_read_it(): void
    {
        $saved = $this->save($this->body([
            ['label' => 'Book now', 'destination' => 'https://lumiere.example/book'],
            ['label' => 'Gift cards', 'destination' => 'https://lumiere.example/gifts'],
        ], ['title' => 'Lumière', 'line' => 'Hair and colour']))->assertOk()
            ->assertJsonPath('page', ['is_on' => true, 'slug' => 'lumiere', 'title' => 'Lumière', 'line' => 'Hair and colour', 'show_posts' => true])
            ->assertJsonPath('url', route('content.bio', ['name' => 'lumiere']))
            ->assertJsonPath('buttons.0.label', 'Book now')
            ->assertJsonPath('buttons.0.destination', 'https://lumiere.example/book')
            ->assertJsonPath('buttons.0.clicks_30d', 0)
            ->assertJsonPath('buttons.1.label', 'Gift cards');
        $link = ContentLink::whereKey(ContentBioButton::whereKey($saved->json('buttons.0.id'))->value('link_id'))->first();
        $saved->assertJsonPath('buttons.0.short_url', route('content.go', ['code' => $link->code]));
        $this->assertSame(ContentLinks::BUTTON_TAGS, $link->utm);
        $this->assertNull($link->post_id);

        $this->asStaffMember()->putJson($this->api('bio'), $this->body())->assertStatus(403)->assertJsonPath('error', 'manager_only');
        $this->asStaffMember()->getJson($this->api('bio'))->assertOk()->assertJsonPath('page.slug', 'lumiere')->assertJsonCount(2, 'buttons');
        // Another brand has its own page (none yet).
        [$second] = $this->secondBrand();
        $this->asManager()->getJson($this->api('bio') . '?brand_id=' . $second)->assertOk()->assertJsonPath('page', null);
    }

    // Review Focus 5
    public function test_a_button_keeps_its_code_across_saves_and_a_removed_button_is_switched_off(): void
    {
        $first = $this->save($this->body([
            ['label' => 'Book now', 'destination' => 'https://lumiere.example/book'],
            ['label' => 'Gift cards', 'destination' => 'https://lumiere.example/gifts'],
        ]))->assertOk();
        [$book, $gifts] = [$first->json('buttons.0'), $first->json('buttons.1')];

        $second = $this->save($this->body([
            ['id' => $gifts['id'], 'label' => 'Gift cards', 'destination' => 'https://lumiere.example/gift-cards'],
            ['label' => 'Prices', 'destination' => 'https://lumiere.example/prices'],
            ['id' => 999999, 'label' => 'From another tab', 'destination' => 'https://lumiere.example/tab'],
            ['id' => $gifts['id'], 'label' => 'Twice', 'destination' => 'https://lumiere.example/twice'],
        ]))->assertOk()
            ->assertJsonPath('buttons.0.id', $gifts['id'])
            ->assertJsonPath('buttons.0.short_url', $gifts['short_url'])
            ->assertJsonPath('buttons.0.destination', 'https://lumiere.example/gift-cards')
            ->assertJsonPath('buttons.1.label', 'Prices')
            ->assertJsonPath('buttons.2.label', 'From another tab')
            ->assertJsonPath('buttons.3.label', 'Twice');
        $this->assertCount(4, array_unique(array_column($second->json('buttons'), 'short_url')));
        $this->assertSame(4, ContentBioButton::count());
        // Book now was removed: its short link says so; Gift cards' leads to the new address.
        $this->get($book['short_url'])->assertNotFound()->assertSee('This link is no longer active');
        $this->get($gifts['short_url'])->assertStatus(302);
    }

    public function test_the_name_must_be_valid_not_reserved_and_free(): void
    {
        $this->save($this->body())->assertOk();
        $this->theirs('taken-name');
        foreach (['ab', 'Has Caps', 'with_underscore', '-lumiere', 'admin', 'links', str_repeat('a', 64)] as $bad) {
            $this->save($this->body([], ['slug' => $bad]))->assertStatus(422)->assertJsonPath('error', 'bio_name_invalid');
        }
        $this->save($this->body([], ['slug' => 'taken-name']))->assertStatus(409)->assertJsonPath('error', 'bio_name_taken');
        $this->assertSame('lumiere', ContentBioPage::query()->value('slug'));
        // Its own name again is fine.
        $this->save($this->body([], ['slug' => 'lumiere', 'is_on' => false]))->assertOk()->assertJsonPath('page.is_on', false);
    }

    public function test_at_most_eight_buttons_each_a_web_address_with_short_words(): void
    {
        $nine = array_fill(0, 9, ['label' => 'Button', 'destination' => 'https://lumiere.example/']);
        $this->save($this->body($nine))->assertStatus(422)->assertJsonPath('error', 'too_many_buttons');
        $this->save($this->body(array_slice($nine, 0, 8)))->assertOk()->assertJsonCount(8, 'buttons');
        $this->save($this->body([['label' => 'Bad', 'destination' => 'ftp://lumiere.example']]))->assertStatus(422)->assertJsonPath('error', 'bad_link');
        $this->save($this->body([['label' => str_repeat('a', 41), 'destination' => 'https://lumiere.example/']]))->assertStatus(422)->assertJsonValidationErrors('buttons.0.label');
        $this->save($this->body([], ['title' => str_repeat('a', 61)]))->assertStatus(422)->assertJsonValidationErrors('title');
        $this->save($this->body([], ['line' => str_repeat('a', 161)]))->assertStatus(422)->assertJsonValidationErrors('line');
        $this->assertSame(8, ContentBioButton::count());
    }

    public function test_each_button_shows_its_clicks_for_the_last_thirty_venue_days(): void
    {
        $saved = $this->save($this->body([['label' => 'Book now', 'destination' => 'https://lumiere.example/book']]))->assertOk();
        $linkId = ContentBioButton::whereKey($saved->json('buttons.0.id'))->value('link_id');
        DB::table('content_link_clicks')->insert([
            ['link_id' => $linkId, 'day' => '2026-10-05', 'via' => 'direct', 'clicks' => 4],
            ['link_id' => $linkId, 'day' => '2026-09-06', 'via' => 'bio', 'clicks' => 2],
            ['link_id' => $linkId, 'day' => '2026-09-05', 'via' => 'direct', 'clicks' => 9],
        ]);
        $this->asManager()->getJson($this->api('bio'))->assertOk()->assertJsonPath('buttons.0.clicks_30d', 6);
    }
}
```

- [ ] **Step 2: Run it to see it fail**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-1; "$R/php.sh" tests/Feature/Content/BioEditorTest.php
```

Expected: `exit 1` — `bio` answers 404 and there is no `landing_pages` table in the Content schema.

- [ ] **Step 3: The editor's service, endpoints and helpers**

In `tests/Concerns/SetsUpContentSchema.php`, replace:

```php
        // The link-in-bio page's buttons take the brand's colour (spec 2026-10-19 §6.2).
```

with:

```php
        // The link-in-bio page's default name reads the brand's landing page (spec 2026-10-19 §6.1).
        if (!Schema::hasTable('landing_pages')) {
            (require database_path('migrations/2026_08_21_100000_create_landing_pages_table.php'))->up();
        }
        // The link-in-bio page's buttons take the brand's colour (spec 2026-10-19 §6.2).
```

In `app/Services/Content/ContentLinks.php`, replace:

```php
    /** A post's tags (§5.2): its platform, social, its campaign's name as a slug (else content-plan), post-{id}. @return array<string, string> */
```

with:

```php
    /** As clean(), for an address that must be there (a link-in-bio button's). */
    public static function cleanRequired(mixed $value): string
    {
        return self::clean($value) ?? self::refuse();
    }

    /** A post's tags (§5.2): its platform, social, its campaign's name as a slug (else content-plan), post-{id}. @return array<string, string> */
```

In `app/Services/Content/ContentLinkClicks.php`, replace:

```php
            'clicks_bio' => (int) $rows->where('via', 'bio')->sum('clicks'),
            'days'       => $days,
        ];
    }
}
```

with:

```php
            'clicks_bio' => (int) $rows->where('via', 'bio')->sum('clicks'),
            'days'       => $days,
        ];
    }

    /**
     * Each link's clicks from `$from` (a venue date) on, both sources: the bio editor's last 30 days (§6.4).
     *
     * @param list<int> $linkIds
     * @return array<int, int>
     */
    public static function since(array $linkIds, string $from): array
    {
        if ($linkIds === []) {
            return [];
        }

        return DB::table('content_link_clicks')->whereIn('link_id', $linkIds)->where('day', '>=', $from)
            ->groupBy('link_id')->selectRaw('link_id, sum(clicks) as total')->pluck('total', 'link_id')
            ->mapWithKeys(fn ($total, $id) => [(int) $id => (int) $total])->all();
    }
}
```

Write `app/Services/Content/ContentBio.php` with the Write tool:

```php
<?php

namespace App\Services\Content;

use App\Models\Brand;
use App\Models\ContentBioButton;
use App\Models\ContentBioPage;
use App\Models\ContentPlannerProfile;
use App\Services\Appointments\VenueClock;
use App\Support\LandingSlug;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Editing a brand's link-in-bio page (spec 2026-10-19 §6.1, §6.4): one page per Content profile, saved whole with its
 * buttons in order. A button keeps its short link's code while it exists; removing it switches the code off. The name
 * follows the landing-page rules, is not reserved and is unique among bio pages.
 */
final class ContentBio
{
    public const MAX_BUTTONS = 8;
    /** The editor's clicks per button: the last 30 venue days (§6.4). */
    public const CLICK_DAYS = 30;

    public static function of(ContentPlannerProfile $profile): ?ContentBioPage
    {
        return ContentBioPage::where('planner_profile_id', $profile->id)->first();
    }

    /**
     * What the editor reads (§7.2): the page (null before its first save), its buttons with their clicks for the last
     * 30 venue days, its address, and a name to start from.
     *
     * @return array{page: ?array<string, mixed>, buttons: list<array<string, mixed>>, url: ?string, suggested_name: string}
     */
    public static function describe(ContentPlannerProfile $profile): array
    {
        $page = self::of($profile);
        $buttons = $page ? $page->buttons()->with('link')->get() : collect();
        $from = CarbonImmutable::parse(VenueClock::today((int) $profile->organization_id))->subDays(self::CLICK_DAYS - 1)->toDateString();
        $clicks = ContentLinkClicks::since($buttons->pluck('link_id')->map(fn ($id) => (int) $id)->all(), $from);

        return [
            'page'           => $page ? [
                'is_on'      => (bool) $page->is_on,
                'slug'       => (string) $page->slug,
                'title'      => $page->title,
                'line'       => $page->line,
                'show_posts' => (bool) $page->show_posts,
            ] : null,
            'buttons'        => $buttons->map(fn (ContentBioButton $button) => [
                'id'          => (int) $button->id,
                'label'       => (string) $button->label,
                'destination' => $button->link?->destination,
                'short_url'   => $button->link ? ContentLinks::shortUrl((string) $button->link->code) : null,
                'clicks_30d'  => $clicks[(int) $button->link_id] ?? 0,
            ])->values()->all(),
            'url'            => $page ? route('content.bio', ['name' => $page->slug]) : null,
            'suggested_name' => self::suggestedName($profile, $page?->id),
        ];
    }

    /**
     * The default name (§6.1): the brand's landing-page name when it is free, otherwise the brand's own slug (or one
     * made from its name) with -2, -3… on a clash.
     */
    public static function suggestedName(ContentPlannerProfile $profile, ?int $exceptPageId = null): string
    {
        $landing = DB::table('landing_pages')->where('organization_id', $profile->organization_id)
            ->where('brand_id', $profile->brand_id)->value('slug');
        if (is_string($landing) && self::free($landing, $exceptPageId)) {
            return $landing;
        }
        $brand = Brand::withoutGlobalScopes()->find($profile->brand_id);
        $base = LandingSlug::isValid((string) $brand?->slug) ? (string) $brand->slug : LandingSlug::normalise((string) $brand?->name);
        if (!LandingSlug::isValid($base)) {
            $base = 'brand-' . $profile->brand_id;
        }
        // Room for "-NNN" within the 63 characters.
        $base = rtrim(substr($base, 0, LandingSlug::MAX - 4), '-');
        for ($n = 1; $n < 1000; $n++) {
            $name = $n === 1 ? $base : "{$base}-{$n}";
            if (self::free($name, $exceptPageId)) {
                return $name;
            }
        }

        return $base . '-' . Str::lower(Str::random(6));
    }

    /**
     * Saves the page and its buttons in the order sent (§6.4). A sent id this page has keeps its button and code; an id
     * it does not have (removed in another tab), or one sent twice, is a new button. A button left out is removed and its
     * code switched off. Refused whole: `bio_name_invalid`, `too_many_buttons`, `bad_link`, `bio_name_taken`.
     *
     * @param array{is_on: bool, slug: string, title?: ?string, line?: ?string, show_posts: bool, buttons: array<int, array{id?: ?int, label: string, destination: string}>} $data
     */
    public static function save(ContentPlannerProfile $profile, array $data): ContentBioPage
    {
        $slug = trim((string) $data['slug']);
        if (!LandingSlug::isValid($slug) || LandingSlug::isReserved($slug)) {
            throw new ContentRefused('bio_name_invalid', 'The name must be 3 to 63 lowercase letters, digits and single hyphens, and not a word HexaTech keeps for itself.', 422);
        }
        $buttons = array_values($data['buttons']);
        if (count($buttons) > self::MAX_BUTTONS) {
            throw new ContentRefused('too_many_buttons', 'A link-in-bio page has at most ' . self::MAX_BUTTONS . ' buttons.', 422);
        }
        $destinations = array_map(fn (array $button) => ContentLinks::cleanRequired($button['destination'] ?? null), $buttons);

        try {
            return DB::transaction(function () use ($profile, $data, $slug, $buttons, $destinations) {
                $page = ContentBioPage::where('planner_profile_id', $profile->id)->lockForUpdate()->first();
                if (ContentBioPage::withoutGlobalScopes()->where('slug', $slug)->when($page, fn ($q) => $q->where('id', '!=', $page->id))->exists()) {
                    throw self::taken();
                }
                $fields = [
                    'slug'       => $slug,
                    'is_on'      => (bool) $data['is_on'],
                    'title'      => self::words($data['title'] ?? null),
                    'line'       => self::words($data['line'] ?? null),
                    'show_posts' => (bool) $data['show_posts'],
                ];
                if ($page) {
                    $page->update($fields);
                } else {
                    $page = ContentBioPage::create($fields + [
                        'organization_id'    => $profile->organization_id,
                        'brand_id'           => $profile->brand_id,
                        'planner_profile_id' => $profile->id,
                    ]);
                }
                $existing = $page->buttons()->with('link')->get()->keyBy('id');
                $kept = [];
                foreach ($buttons as $position => $sent) {
                    $id = isset($sent['id']) ? (int) $sent['id'] : null;
                    $button = $id !== null && !in_array($id, $kept, true) ? $existing->get($id) : null;
                    if ($button) {
                        $button->link->update(['destination' => $destinations[$position], 'utm' => ContentLinks::BUTTON_TAGS]);
                        $button->update(['label' => $sent['label'], 'position' => $position]);
                    } else {
                        $link = ContentLinks::make((int) $page->organization_id, (int) $page->brand_id, null, $destinations[$position], ContentLinks::BUTTON_TAGS);
                        $button = ContentBioButton::create(['bio_page_id' => $page->id, 'link_id' => $link->id, 'label' => $sent['label'], 'position' => $position]);
                    }
                    $kept[] = (int) $button->id;
                }
                foreach ($existing->except($kept) as $gone) {
                    $gone->link?->update(['destination' => null]);
                    $gone->delete();
                }

                return $page->fresh();
            });
        } catch (UniqueConstraintViolationException) {
            // Two pages saved the same name at the same moment: the second is refused as if it had seen the first.
            throw self::taken();
        }
    }

    /** A name a page may take: valid, not reserved, not another page's. */
    private static function free(string $name, ?int $exceptPageId): bool
    {
        return LandingSlug::isValid($name) && !LandingSlug::isReserved($name)
            && !ContentBioPage::withoutGlobalScopes()->where('slug', $name)
                ->when($exceptPageId, fn ($q) => $q->where('id', '!=', $exceptPageId))->exists();
    }

    private static function taken(): ContentRefused
    {
        return new ContentRefused('bio_name_taken', 'Another page already has this name. Please choose another one.', 409);
    }

    private static function words(?string $value): ?string
    {
        $value = trim((string) $value);

        return $value === '' ? null : $value;
    }
}
```

Write `app/Http/Controllers/Api/V1/Admin/Content/BioController.php` with the Write tool:

```php
<?php

namespace App\Http\Controllers\Api\V1\Admin\Content;

use App\Http\Controllers\Controller;
use App\Services\Content\ContentAccess;
use App\Services\Content\ContentBio;
use App\Services\Content\ContentContext;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** The brand's link-in-bio page on the Brand page (spec 2026-10-19 §6.4, §7.2): everyone reads it, managers save it. */
class BioController extends Controller
{
    public function show(): JsonResponse
    {
        return response()->json(ContentBio::describe(ContentContext::requireProfile()));
    }

    public function update(Request $request): JsonResponse
    {
        ContentAccess::requireManager($request->user());
        $profile = ContentContext::requireProfile();
        $data = $request->validate([
            'is_on'                 => 'required|boolean',
            // Its shape is ContentBio's rule (bio_name_invalid), not a validation message.
            'slug'                  => 'required|string|max:255',
            'title'                 => 'nullable|string|max:60',
            'line'                  => 'nullable|string|max:160',
            'show_posts'            => 'required|boolean',
            'buttons'               => 'present|array',
            'buttons.*.id'          => 'nullable|integer',
            'buttons.*.label'       => 'required|string|max:40',
            'buttons.*.destination' => 'required|string',
        ]);
        ContentBio::save($profile, $data);

        return response()->json(ContentBio::describe($profile));
    }
}
```

In `routes/api.php`, replace:

```php
                Route::put('me/morning-email', [\App\Http\Controllers\Api\V1\Admin\Content\MorningEmailController::class, 'update']);
```

with:

```php
                Route::put('me/morning-email', [\App\Http\Controllers\Api\V1\Admin\Content\MorningEmailController::class, 'update']);
                Route::get('bio', [\App\Http\Controllers\Api\V1\Admin\Content\BioController::class, 'show']);
                Route::put('bio', [\App\Http\Controllers\Api\V1\Admin\Content\BioController::class, 'update']);
```

- [ ] **Step 4: Run the test, then the Content folders and the access map**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-1; "$R/php.sh" tests/Feature/Content/BioEditorTest.php tests/Feature/Content/ tests/Unit/Content/ tests/Feature/AdminAccess/
```

Expected: `BioEditorTest | Tests:    7 passed`; every line `exit 0` (Feature Content 249 + 7 = 256; Unit Content 82; AdminAccess 51 — `admin/content` already covers `bio`).

- [ ] **Step 5: Commit**

```bash
cd /c/wamp64/www/Hexa-Tech-content && git add app/Services/Content/ContentBio.php app/Http/Controllers/Api/V1/Admin/Content/BioController.php app/Services/Content/ContentLinks.php app/Services/Content/ContentLinkClicks.php routes/api.php tests/Concerns/SetsUpContentSchema.php tests/Feature/Content/BioEditorTest.php && git commit -q -m "Content: edit the link-in-bio page — name rules, up to eight buttons that keep their codes, clicks for 30 days" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1
```

---

### Task 6: The runbook and the regression run

**Files:**
- Modify: `docs/content-workspace.md`, `docs/landing-page-builder.md`

- [ ] **Step 1: The runbook**

In `docs/content-workspace.md`:

1. Replace:

```markdown
  `approvals_off`, `wrong_status` and `not_yours`, and from release 5a `version_exists`.
```

with:

```markdown
  `approvals_off`, `wrong_status` and `not_yours`, from release 5a `version_exists`, and from release 5b `bad_link`,
  `bio_name_invalid`, `bio_name_taken` and `too_many_buttons`.
```

2. Replace:

```markdown
| Morning email | `PUT me/morning-email` (`on`); also `wants_content_morning_email` in `PUT admin/me/preferences` | each person, for themselves |
```

with:

```markdown
| Morning email | `PUT me/morning-email` (`on`); also `wants_content_morning_email` in `PUT admin/me/preferences` | each person, for themselves |
| Links | `link` (an address or null) on `POST posts` and `PUT posts/{id}`; `GET posts/{id}` carries `link`, cards carry `clicks` | everyone |
| Link-in-bio | `GET bio`; `PUT bio` (`is_on`, `slug`, `title`, `line`, `show_posts`, `buttons: [{id?, label, destination}]`) | read: everyone; save: owners and managers |
| Public host | `GET /go/{code}` (302; `?via=bio`), `GET /links/{name}` | visitors |
```

3. Replace:

```markdown
  `lang/*/content_morning.php`, links open the post on its brand (`?brand_id=`) (`MorningEmailTest`).
```

with:

```markdown
  `lang/*/content_morning.php`, links open the post on its brand (`?brand_id=`) (`MorningEmailTest`).
- **Tracked links** (release 5b; `ContentLinks`, `ContentLinkClicks`): a post's Link becomes a short link on the public
  host, `/go/{code}` (7 characters, no 0/o/1/l). Changing the address keeps the code; clearing it switches the code off
  (the row stays: a link already out answers 404 "This link is no longer active" in the brand's Content language);
  versions, repeat copies and duplicates get their own code; deleting a post keeps its link working. The UTM tags
  (`utm_source` the platform or `link-in-bio`, `utm_medium` social, `utm_campaign` the campaign's slug or
  `content-plan`, `utm_content` `post-{id}` or `button`) are worked out at save and when the platform or campaign
  changes, and never replace a tag the address carries. A new Link is a change of words under approvals and moves the
  post's version on. Clicks: one row per link, venue day and source (`direct` | `bio`), raised by one upsert; HEAD
  requests and robots are not counted; no IP address, cookie, user agent or referrer is stored (`LinkRedirectTest`,
  `LinksTest`, `LinkCopiesTest`).
- **Link-in-bio** (`ContentBio`, `ContentBioPublic`): one page per brand at `/links/{name}` on the public host, off
  (404) until a manager switches it on. The name follows the landing-page rules, is not reserved (`links` is, now) and
  is unique among bio pages; the default is the brand's landing-page name, else the brand's slug with `-2`, `-3`…. Up
  to eight buttons, each a tracked link that keeps its code across saves (removed: switched off); up to twelve latest
  published posts with a live link, one per group of versions. A Blade page with its own stylesheet
  (`public/landing/content-public.css`) and the brand colour in one nonce'd block; no scripts, no session, cached five
  minutes (`BioPageTest`, `BioEditorTest`).
```

4. Replace:

```markdown
  "Who posts it" is set or the posts are marked published; reload admin tabs left open.
```

with:

```markdown
  "Who posts it" is set or the posts are marked published; reload admin tabs left open.
- Release 5b (server, Plan 5B-1): four additive migrations (`content_links`, `content_link_clicks`,
  `content_bio_pages`, `content_bio_buttons`); two public routes on the landing host, `/go/{code}` and
  `/links/{name}`, both in `routes/landing.php` (outside the `web` group) and in `LandingHostGuard::ALLOWED`; one new
  reserved landing name, `links`; one new static file, `public/landing/content-public.css`. No queue or schedule change.
- Verify release 5b by content (after Plan 5B-2's deploy): `/api/v1/admin/content/bio` answers 401 when signed out
  (404 before release 5b); `https://sites.hexa-tech.uk/landing/content-public.css` answers 200 (404 before);
  `https://sites.hexa-tech.uk/go/zzzz222` and `https://sites.hexa-tech.uk/links/zzzz-none` answer 404 without a cookie.
```

In `docs/landing-page-builder.md` (whoever touches the landing host next reads it first), replace:

```markdown
- `routes/landing.php` — `GET /{slug}` (`landing.show`) and the signed `GET /preview/{page}`; both behind
  `landing.security` and a throttle.
```

with:

```markdown
- `routes/landing.php` — `GET /{slug}` (`landing.show`) and the signed `GET /preview/{page}`; both behind
  `landing.security` and a throttle. HexaTech Content shares the group with `GET /go/{code}` (tracked short links) and
  `GET /links/{name}` (link-in-bio pages; `links` is reserved), both in `LandingHostGuard::ALLOWED` and served by
  `app/Http/Controllers/ContentPublic/` with `public/landing/content-public.css` (`docs/content-workspace.md`).
```

- [ ] **Step 2: The regression run**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-1; cd /c/wamp64/www/Hexa-Tech-content && "$R/php.sh" tests/Feature/Content/ tests/Unit/Content/ tests/Feature/ContentCalendar/ tests/Feature/AdminAccess/ tests/Unit/Support/ tests/Feature/Landing/LandingHostIsolationTest.php tests/Feature/Landing/LandingRoutingTest.php tests/Feature/Landing/LandingSecurityHeadersTest.php | tee "$R/final-php.txt"
```

Expected: eight lines, each `exit 0` (Feature Content 225 at release 5a + 31 from this plan = 256; Unit Content 76 + 6 = 82; ContentCalendar 12; AdminAccess 51; Unit Support 177; the three landing files green).

- [ ] **Step 3: Commit and ledger**

```bash
R=/c/wamp64/www/Hexa-Tech-content/.superpowers/sdd/2026-10-19-content-release-5b-1; cd /c/wamp64/www/Hexa-Tech-content && git add docs/content-workspace.md docs/landing-page-builder.md && git commit -q -m "Runbook: release 5b's server (tracked links, the link-in-bio page)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" && git log --oneline -1 && echo "Task 6: note: regression $(grep -c 'exit 0' "$R/final-php.txt")/8 paths green (final-php.txt)" >> "$R/progress.md"
```
