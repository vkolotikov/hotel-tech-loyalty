<?php

namespace Tests\Feature\Loyalty;

use App\Models\PointExpiryBucket;
use App\Models\PointsTransaction;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use App\Services\LoyaltyService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\Concerns\LoyaltyWorkspace\TierCountsSchema;
use Tests\Concerns\SetsUpLoyaltyWorkspace;
use Tests\TestCase;

/**
 * Points expiry 0 means never (release 7, spec 2026-10-25 §4.4; until then 0 expired points at once): an award or a
 * restored redemption writes its bucket without a date, the hourly sweep and the monthly report pass over it, and a
 * redemption spends points that expire before points that never do. The months are read through ProgrammeOptions for
 * the member's own organisation.
 */
class PointsNeverExpireTest extends TestCase
{
    use DatabaseTransactions, SetsUpLoyaltyWorkspace, TierCountsSchema;

    private LoyaltyService $loyalty;

    protected function setUp(): void
    {
        parent::setUp();
        // Before the shared schema, whose copy of the buckets table keeps the older NOT NULL date.
        $this->buildNeverExpiringBucketsSchema();
        $this->setUpLoyaltyWorkspace();
        $this->loyalty = app(LoyaltyService::class);
    }

    private function expiry(int $months): void
    {
        ProgrammeOptions::save($this->org->id, ['points_expiry_months' => $months], $this->manager);
    }

    public function test_with_expiry_zero_an_award_writes_a_bucket_that_never_expires(): void
    {
        $this->expiry(0);

        $tx = $this->loyalty->awardPoints($this->grace, 300, 'Welcome');

        $bucket = PointExpiryBucket::where('transaction_id', $tx->id)->firstOrFail();
        $this->assertNull($bucket->expires_at);
        $this->assertNull($this->loyalty->expiresOn($this->org->id));
    }

    public function test_months_still_date_the_bucket_and_the_default_is_24(): void
    {
        $tx = $this->loyalty->awardPoints($this->grace, 100, 'Earn');
        $this->assertSame(now()->addMonths(24)->toDateString(), PointExpiryBucket::where('transaction_id', $tx->id)->first()->expires_at?->toDateString());

        $this->expiry(6);
        $tx = $this->loyalty->awardPoints($this->grace, 100, 'Earn');
        $this->assertSame(now()->addMonths(6)->toDateString(), PointExpiryBucket::where('transaction_id', $tx->id)->first()->expires_at->toDateString());
    }

    public function test_the_expiry_sweep_passes_over_points_that_never_expire(): void
    {
        $this->expiry(0);
        $never = $this->loyalty->awardPoints($this->grace, 300, 'Never');
        $this->expiry(12);
        $dated = $this->loyalty->awardPoints($this->grace, 50, 'Dated');
        PointExpiryBucket::where('transaction_id', $never->id)->update(['earned_at' => now()->subYears(5)->toDateString()]);
        PointExpiryBucket::where('transaction_id', $dated->id)->update(['expires_at' => now()->subDay()->toDateString()]);
        $before = (int) $this->grace->fresh()->current_points;

        $expired = $this->loyalty->expirePoints();

        $this->assertSame(50, $expired);
        $this->assertSame($before - 50, (int) $this->grace->fresh()->current_points);
        $this->assertFalse((bool) PointExpiryBucket::where('transaction_id', $never->id)->value('is_expired'));
        $this->assertSame(300, (int) PointExpiryBucket::where('transaction_id', $never->id)->value('remaining_points'));
        $this->assertSame(1, PointsTransaction::where('member_id', $this->grace->id)->where('type', 'expire')->count());
    }

    public function test_a_redemption_spends_expiring_points_first_and_a_restored_one_never_expires(): void
    {
        $member = $this->makeMember('Lin Bo', 'lin@example.test');
        $this->expiry(0);
        $never = $this->loyalty->awardPoints($member, 100, 'Never');
        $this->expiry(12);
        $dated = $this->loyalty->awardPoints($member, 100, 'Dated');

        $redeem = $this->loyalty->redeemPoints($member->fresh(), 120, 'Reward');

        $this->assertSame(0, (int) PointExpiryBucket::where('transaction_id', $dated->id)->value('remaining_points'));
        $this->assertSame(80, (int) PointExpiryBucket::where('transaction_id', $never->id)->value('remaining_points'));

        $this->expiry(0);
        $this->loyalty->reverseTransaction($redeem, 'Cancelled');
        $restored = PointExpiryBucket::where('transaction_id', $redeem->id)->firstOrFail();
        $this->assertSame(120, (int) $restored->remaining_points);
        $this->assertNull($restored->expires_at);
    }

    public function test_the_monthly_report_counts_never_expiring_points_apart(): void
    {
        if (!Schema::hasColumn('loyalty_tiers', 'points_to_currency_rate')) {
            Schema::table('loyalty_tiers', fn (Blueprint $t) => $t->decimal('points_to_currency_rate', 8, 4)->default(0.01));
        }
        $this->expiry(0);
        $this->loyalty->awardPoints($this->grace, 300, 'Never');
        $this->expiry(2);
        $this->loyalty->awardPoints($this->grace, 40, 'Dated');

        $report = $this->loyalty->getPointLiability();

        $this->assertSame(300, $report['never_expiring_points']);
        $schedule = collect($report['expiry_schedule_by_month'])->map(fn ($p) => (int) $p)->all();
        $this->assertSame([now()->addMonths(2)->format('Y-m') => 40], $schedule);
        $this->assertSame(0, DB::table('point_expiry_buckets')->whereNull('expires_at')->where('is_expired', true)->count());
    }
}
