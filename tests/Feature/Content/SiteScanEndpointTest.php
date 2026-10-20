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

    /** Final review: the daily cap is counted in the cache every server shares, not one server's own. */
    public function test_the_daily_cap_is_counted_in_the_cache_every_server_shares(): void
    {
        config(['cache.stores.this_server' => ['driver' => 'array'], 'cache.default' => 'this_server']);
        app()->forgetInstance(\Illuminate\Cache\RateLimiter::class);
        \Illuminate\Support\Facades\RateLimiter::clearResolvedInstances();
        $shared = new \Illuminate\Cache\RateLimiter(\App\Support\SharedCache::store());
        for ($i = 0; $i < 20; $i++) {
            $shared->hit('content:site-scan:' . $this->org->id, 86400);
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
