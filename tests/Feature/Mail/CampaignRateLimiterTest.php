<?php

namespace Tests\Feature\Mail;

use App\Services\CampaignRateLimiter;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

/**
 * Hourly send ceilings for bulk mail.
 *
 * The thing this exists to prevent: chunk spacing paces ONE campaign, so it
 * reads like a rate limit and is not one. Two campaigns at once send twice as
 * much; ten tenants send ten times as much. The provider only ever sees the
 * total, and exceeding its ceiling gets mail deferred or the account throttled
 * — which looks like a spam run from the receiving side.
 */
class CampaignRateLimiterTest extends TestCase
{
    private CampaignRateLimiter $limiter;

    protected function setUp(): void
    {
        parent::setUp();
        config(['cache.default' => 'array']);
        Cache::store('array')->flush();
        config([
            'mail.campaign_hourly_limit_per_org' => 100,
            'mail.campaign_hourly_limit_global'  => 250,
        ]);
        $this->limiter = new CampaignRateLimiter();
    }

    public function test_a_fresh_org_may_send_up_to_its_limit(): void
    {
        $this->assertSame(100, $this->limiter->remaining(1));
        $this->assertSame(50, $this->limiter->allowance(1, 50));
        $this->assertSame(100, $this->limiter->allowance(1, 500),
            'Allowance is capped by the limit, not by what was asked for.');
    }

    public function test_recording_consumes_the_org_budget(): void
    {
        $this->limiter->record(1, 60);

        $this->assertSame(40, $this->limiter->remaining(1));
        $this->assertSame(40, $this->limiter->allowance(1, 100));
    }

    public function test_an_exhausted_org_gets_no_allowance(): void
    {
        $this->limiter->record(1, 100);

        $this->assertSame(0, $this->limiter->allowance(1, 1),
            'The caller must defer the chunk rather than send it.');
    }

    public function test_one_org_cannot_consume_another_orgs_budget(): void
    {
        // The whole point of a per-org ceiling: a tenant with a big stale list
        // must not spend everyone else's headroom, because bounce damage lands
        // on the shared sending domain.
        $this->limiter->record(1, 100);

        $this->assertSame(0, $this->limiter->allowance(1, 10));
        $this->assertSame(10, $this->limiter->allowance(2, 10),
            "A second tenant's sending must be unaffected by the first's exhaustion.");
    }

    public function test_the_global_ceiling_binds_even_when_each_org_is_under_its_own(): void
    {
        // Three orgs, each well within 100, but together over the global 250.
        $this->limiter->record(1, 90);
        $this->limiter->record(2, 90);
        $this->limiter->record(3, 90);

        $this->assertSame(10, $this->limiter->remaining(1),
            'Org 1 still has its own headroom…');
        $this->assertSame(0, $this->limiter->allowance(1, 10),
            '…but the global ceiling is what the provider sees, so nothing may go out.');
    }

    public function test_a_zero_limit_disables_that_ceiling(): void
    {
        config(['mail.campaign_hourly_limit_per_org' => 0]);
        $this->limiter->record(1, 10_000);

        // Global still binds; the org ceiling no longer does.
        $this->assertSame(PHP_INT_MAX, $this->limiter->remaining(1));
        $this->assertSame(0, $this->limiter->allowance(1, 5),
            'Disabling the per-org ceiling must not disable the global one.');
    }

    public function test_recording_zero_or_negative_is_a_no_op(): void
    {
        $this->limiter->record(1, 0);
        $this->limiter->record(1, -5);

        $this->assertSame(100, $this->limiter->remaining(1));
    }

    public function test_budgets_are_per_clock_hour(): void
    {
        $this->limiter->record(1, 100);
        $this->assertSame(0, $this->limiter->allowance(1, 1));

        // Next hour, fresh budget — the bucket key is the clock hour, so a
        // burst cannot straddle two windows.
        $this->travel(1)->hour();

        $this->assertSame(100, $this->limiter->remaining(1));
    }
}
