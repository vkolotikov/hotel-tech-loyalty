<?php
namespace Tests\Feature\Landing;

use App\Models\LandingPage;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\SetsUpLandingSchema;
use Tests\TestCase;

/**
 * `/{slug}` following a retired address to where the page lives today.
 *
 * Task 11 writes `landing_page_redirects` rows (90-day expiry, NOT NULL) and
 * enforces that no redirect row ever shares a slug with a live page. Nothing
 * served those rows until now. `show()` still answers a live published page
 * directly; only once that lookup misses does it consult the redirect table.
 */
class LandingRedirectTest extends TestCase
{
    use DatabaseTransactions, SetsUpLandingSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLandingSchema();
        // The self-referencing-redirect test resolves directly to a live
        // published page rather than redirecting, which renders the real
        // template -- and PageContent::for() reads services, team, reviews
        // and contact tables while doing so.
        $this->setUpLandingContentSchema();
    }

    protected function tearDown(): void
    {
        // Several tests below pin the clock to control expires_at.
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function host(): string
    {
        return config('landing.host');
    }

    private function url(string $slug): string
    {
        return 'http://' . $this->host() . '/' . $slug;
    }

    private function makePage(string $slug, string $status = 'published', int $brandId = 1): LandingPage
    {
        return LandingPage::create([
            'organization_id' => 1, 'brand_id' => $brandId, 'slug' => $slug,
            'template_key' => 'ruled_page', 'industry' => 'beauty', 'status' => $status,
            'published_at' => $status === 'published' ? now() : null,
        ]);
    }

    private function insertRedirect(string $slug, int $landingPageId, Carbon $expiresAt): void
    {
        DB::table('landing_page_redirects')->insert([
            'slug' => $slug, 'landing_page_id' => $landingPageId,
            'expires_at' => $expiresAt, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_a_live_redirect_301s_to_the_pages_current_slug(): void
    {
        $page = $this->makePage('new-address');
        $this->insertRedirect('old-address', $page->id, now()->addDays(30));

        $res = $this->get($this->url('old-address'));

        $res->assertStatus(301);
        $res->assertHeader('Location', $this->url('new-address'));
    }

    public function test_an_expired_redirect_404s_instead_of_redirecting(): void
    {
        $page = $this->makePage('current-address');
        $this->insertRedirect('stale-address', $page->id, now()->subDay());

        $this->get($this->url('stale-address'))->assertNotFound();
    }

    public function test_a_redirect_to_a_page_thats_now_a_draft_404s(): void
    {
        // Never redirect a visitor onto a 404, and never let the redirect
        // reveal that a draft exists behind the old address.
        $draft = $this->makePage('shh-not-ready', 'draft', brandId: 2);
        $this->insertRedirect('old-shop-address', $draft->id, now()->addDays(30));

        $this->get($this->url('old-shop-address'))->assertNotFound();
    }

    /**
     * This state is unreachable in production: the production migration
     * declares landing_page_redirects.landing_page_id with
     * ->cascadeOnDelete(), so deleting a target page removes its redirect
     * row along with it -- a redirect cannot outlive its target in Postgres.
     * It is reachable here only because the sqlite test schema
     * (SetsUpLandingSchema) declares the column as a plain
     * unsignedBigInteger with no foreign key at all. Kept anyway, and
     * commented as such, so this defensive branch stays covered without
     * anyone later reading this test as evidence the state occurs live.
     */
    public function test_a_redirect_to_a_deleted_page_404s(): void
    {
        $page = $this->makePage('about-to-vanish');
        $orphanedId = $page->id;
        $page->delete();

        $this->insertRedirect('long-gone-address', $orphanedId, now()->addDays(30));

        $this->get($this->url('long-gone-address'))->assertNotFound();
    }

    /**
     * a -> b -> c: two renames leave two redirect rows behind (one per hop),
     * both pointing at the same landing_page_id, whose live slug is now `c`.
     * A visitor holding the FIRST address must land on `c` directly, not on
     * `b` — the resolver reads the target's live slug, not anything cached
     * on the redirect row it matched.
     */
    public function test_a_rename_chain_resolves_in_one_hop(): void
    {
        $page = $this->makePage('gamma');
        $this->insertRedirect('alpha', $page->id, now()->addDays(30));
        $this->insertRedirect('beta', $page->id, now()->addDays(30));

        $res = $this->get($this->url('alpha'));

        $res->assertStatus(301);
        $res->assertHeader('Location', $this->url('gamma'));
    }

    /**
     * Task 11's invariant -- no redirect row shares a slug with a live page --
     * is supposed to make a self-referential row unreachable. This constructs
     * the bad row directly (bypassing the admin controller that enforces the
     * invariant) and proves the renderer does something safe rather than
     * looping: the live page at that slug still answers directly, because
     * show() tries the direct lookup before it ever consults the redirect
     * table.
     */
    public function test_a_redirect_sharing_its_targets_current_slug_does_not_loop(): void
    {
        $page = $this->makePage('stable-address');
        // Deliberately invalid: a live page already holds this exact slug.
        $this->insertRedirect('stable-address', $page->id, now()->addDays(30));

        $res = $this->get($this->url('stable-address'));

        $res->assertOk();
        $this->assertNull($res->headers->get('Location'));
    }

    /** @return array<string, array{0: string}> */
    public static function hostileTargetSlugs(): array
    {
        return [
            'scheme-relative (leading //)' => ['//evil.example.com'],
            'leading slash'                => ['/evil.example.com'],
            'embedded scheme (://)'        => ['https://evil.example.com'],
            'backslash'                    => ['\evil.example.com'],
            // Looks valid until you remember PCRE's `$` matches before a
            // trailing newline. Before LandingSlug carried the D modifier
            // this shape passed validation and put a raw control character
            // into the Location header value.
            'trailing newline'             => ["glamour-salon\n"],
            'trailing CRLF'                => ["glamour-salon\r\n"],
            'embedded newline'             => ["glamour\nsalon"],
        ];
    }

    /**
     * Not reachable through the admin API today: LandingSlug::isValid() and
     * the route's own `[a-z0-9-]+` constraint both forbid every shape below.
     * But neither is a database constraint, so this simulates the row a
     * migration, a manual UPDATE, or a bug in some future write path could
     * leave behind -- setting `slug` directly on the row, the way the admin
     * controller never would.
     *
     * The motivating case is the leading "//": redirect()->to() treats that
     * as an already-complete URL (Illuminate\Routing\UrlGenerator::
     * isValidUrl()) and passes it through untouched without ever prepending
     * this host, which is an open redirect off this origin. The other three
     * shapes are neighbours of that one, asserted alongside it so a narrower
     * fix that only catches "//" cannot pass by accident.
     */
    #[DataProvider('hostileTargetSlugs')]
    public function test_a_target_slug_that_is_not_a_valid_shape_404s_rather_than_redirecting(string $hostileSlug): void
    {
        $page = $this->makePage('innocent-current-slug');
        DB::table('landing_pages')->where('id', $page->id)->update(['slug' => $hostileSlug]);
        $this->insertRedirect('old-address-for-hostile-target', $page->id, now()->addDays(30));

        $res = $this->get($this->url('old-address-for-hostile-target'));

        $res->assertNotFound();
        $this->assertNull($res->headers->get('Location'),
            "A hostile target slug ({$hostileSlug}) must never reach a Location header.");
    }

    public function test_the_redirect_response_carries_the_landing_security_headers(): void
    {
        $page = $this->makePage('new-place');
        $this->insertRedirect('old-place', $page->id, now()->addDays(30));

        $res = $this->get($this->url('old-place'));

        $res->assertStatus(301);
        $this->assertNotNull($res->headers->get('Content-Security-Policy'));
        $this->assertSame('nosniff', $res->headers->get('X-Content-Type-Options'));

        $names = array_map(fn ($cookie) => $cookie->getName(), $res->headers->getCookies());
        $this->assertNotContains(config('session.cookie'), $names,
            'The redirect response started a session.');
    }
}
