<?php

namespace Tests\Feature\Booking;

use App\Models\BookingMirror;
use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\PointsTransaction;
use App\Services\Loyalty\BookingPointsService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Tests\Concerns\SeedsPointsFixture;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\TestCase;

class AwardStayPointsTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema, SetsUpStayBookingSchema, SeedsPointsFixture;

    private int $orgId;
    private LoyaltyMember $member;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        $this->setUpLoyaltyAwardSchema();
        $this->setUpServiceBookingSchema();
        $this->setUpStayBookingSchema();

        $fixture = $this->seedPointsFixture(); // 10 points per currency unit, tier rate 1.5
        $this->orgId = $fixture['orgId'];
        $this->member = $fixture['member'];
    }

    private function stay(array $attrs = []): BookingMirror
    {
        static $n = 0;
        return BookingMirror::withoutGlobalScopes()->create(array_merge([
            'organization_id' => $this->orgId, 'reservation_id' => 'R-' . (++$n), 'booking_reference' => 'BK-STAY' . $n,
            'booking_state' => 'confirmed', 'internal_status' => 'checked-out', 'apartment_id' => '101', 'apartment_name' => 'Sea view',
            'channel_name' => 'Member portal', 'member_id' => $this->member->id,
            'arrival_date' => now()->subDays(3)->toDateString(), 'departure_date' => now()->subDay()->toDateString(),
            'price_total' => 180, 'list_total' => 200, 'discount_amount' => 20, 'payment_status' => 'paid', 'payment_method' => 'stripe',
        ], $attrs));
    }

    public function test_a_finished_stay_earns_on_what_was_paid_once(): void
    {
        $stay = $this->stay();
        $svc = app(BookingPointsService::class);

        $tx = $svc->awardForStay($stay);

        $this->assertNotNull($tx);
        $this->assertSame(2700, $tx->points); // 180 x 10 x 1.5
        $this->assertSame('booking_mirror', $tx->reference_type);
        $this->assertSame($stay->id, (int) $tx->reference_id);
        $this->assertNotNull($stay->fresh()->points_awarded_at);
        $this->assertNull($svc->awardForStay($stay->fresh()));
        $this->assertSame(1, PointsTransaction::where('member_id', $this->member->id)->count());
    }

    public function test_nothing_is_earned_before_departure_or_on_a_cancelled_or_refunded_stay_or_without_a_member(): void
    {
        $svc = app(BookingPointsService::class);

        $this->assertNull($svc->awardForStay($this->stay(['departure_date' => now()->addDay()->toDateString(), 'internal_status' => 'checked-in'])));
        $this->assertNull($svc->awardForStay($this->stay(['departure_date' => now()->toDateString()])), 'the day of departure is not over');
        $this->assertNull($svc->awardForStay($this->stay(['internal_status' => 'cancelled'])));
        $this->assertNull($svc->awardForStay($this->stay(['booking_state' => 'cancelled'])));
        $this->assertNull($svc->awardForStay($this->stay(['payment_status' => 'refunded'])));
        $this->assertNull($svc->awardForStay($this->stay(['payment_status' => 'cancelled'])));
        $this->assertNull($svc->awardForStay($this->stay(['member_id' => null])));
        $this->assertSame(0, PointsTransaction::count());
    }

    public function test_no_points_when_the_venue_switched_them_off_or_runs_no_programme(): void
    {
        HotelSetting::withoutGlobalScopes()->create(['organization_id' => $this->orgId, 'key' => 'points_on_bookings', 'value' => 'false']);
        HotelSetting::flushCacheFor($this->orgId);
        $stayA = $this->stay();
        $this->assertNull(app(BookingPointsService::class)->awardForStay($stayA));
        $this->assertNull($stayA->fresh()->points_awarded_at);

        HotelSetting::withoutGlobalScopes()->where('organization_id', $this->orgId)->where('key', 'points_on_bookings')->delete();
        HotelSetting::flushCacheFor($this->orgId);
        LoyaltyTier::where('organization_id', $this->orgId)->update(['is_active' => false]);
        Cache::flush();
        $stayB = $this->stay();
        $this->assertNull(app(BookingPointsService::class)->awardForStay($stayB));
        $this->assertNull($stayB->fresh()->points_awarded_at);
    }

    public function test_a_stay_still_awaiting_capture_earns_nothing_and_is_not_stamped(): void
    {
        $svc = app(BookingPointsService::class);

        foreach (['authorized', 'pending', 'capture_expired'] as $status) {
            $stay = $this->stay(['payment_status' => $status]);
            $this->assertNull($svc->awardForStay($stay), $status);
            $this->assertNull($stay->fresh()->points_awarded_at, $status);
        }
        $this->assertSame(0, PointsTransaction::count());
    }

    public function test_pay_at_venue_earns_once_the_stay_is_open_for_payment_at_the_desk(): void
    {
        $svc = app(BookingPointsService::class);
        $stay = $this->stay(['payment_status' => 'open', 'payment_method' => 'pay_at_venue']);

        $tx = $svc->awardForStay($stay);

        $this->assertNotNull($tx);
        $this->assertNotNull($stay->fresh()->points_awarded_at);
    }

    public function test_an_open_stay_without_pay_at_venue_earns_nothing(): void
    {
        $svc = app(BookingPointsService::class);

        $this->assertNull($svc->awardForStay($this->stay(['payment_status' => 'open', 'payment_method' => null])));
        $this->assertNull($svc->awardForStay($this->stay(['payment_status' => 'open', 'payment_method' => 'stripe'])));
        $this->assertSame(0, PointsTransaction::count());
    }

    public function test_a_stay_captured_after_departure_earns_on_a_later_run(): void
    {
        $stay = $this->stay(['payment_status' => 'authorized']);
        app()->forgetInstance('current_organization_id'); // the scheduler binds no tenant

        $this->artisan('bookings:award-stay-points')->assertExitCode(0);
        $this->assertNull(BookingMirror::withoutGlobalScopes()->find($stay->id)->points_awarded_at);
        $this->assertSame(0, PointsTransaction::withoutGlobalScopes()->count());

        BookingMirror::withoutGlobalScopes()->where('id', $stay->id)->update(['payment_status' => 'paid']);

        $this->artisan('bookings:award-stay-points')->assertExitCode(0);
        $this->assertNotNull(BookingMirror::withoutGlobalScopes()->find($stay->id)->points_awarded_at);
        $this->assertSame(
            1,
            PointsTransaction::withoutGlobalScopes()->where('reference_type', 'booking_mirror')->where('reference_id', $stay->id)->count(),
        );
    }

    public function test_the_command_looks_back_sixty_days_and_no_further(): void
    {
        $withinWindow = $this->stay(['departure_date' => now()->subDays(60)->toDateString()]);
        $tooOld = $this->stay(['departure_date' => now()->subDays(61)->toDateString()]);
        app()->forgetInstance('current_organization_id'); // the scheduler binds no tenant

        $this->artisan('bookings:award-stay-points')->assertExitCode(0);

        $this->assertNotNull($withinWindow->fresh()->points_awarded_at);
        $this->assertNull($tooOld->fresh()->points_awarded_at);
    }

    public function test_the_org_option_limits_the_scan_to_one_organisation(): void
    {
        // BelongsToOrganization::creating() forces organization_id from
        // whatever tenant is currently bound in the container -- even under
        // withoutGlobalScopes() -- so "mine" has to be created before
        // seedPointsFixture() rebinds current_organization_id to the other org.
        $mine = $this->stay();
        $other = $this->seedPointsFixture('Other Co');
        $otherStay = BookingMirror::withoutGlobalScopes()->create([
            'organization_id' => $other['orgId'], 'reservation_id' => 'R-OTHER', 'booking_reference' => 'BK-OTHER',
            'booking_state' => 'confirmed', 'internal_status' => 'checked-out', 'apartment_id' => '101', 'apartment_name' => 'Sea view',
            'channel_name' => 'Member portal', 'member_id' => $other['member']->id,
            'arrival_date' => now()->subDays(3)->toDateString(), 'departure_date' => now()->subDay()->toDateString(),
            'price_total' => 180, 'list_total' => 200, 'discount_amount' => 20, 'payment_status' => 'paid', 'payment_method' => 'stripe',
        ]);
        app()->forgetInstance('current_organization_id'); // the scheduler binds no tenant

        $this->artisan('bookings:award-stay-points', ['--org' => $this->orgId])->assertExitCode(0);

        $this->assertNotNull(BookingMirror::withoutGlobalScopes()->find($mine->id)->points_awarded_at);
        $this->assertNull(BookingMirror::withoutGlobalScopes()->find($otherStay->id)->points_awarded_at);
        $this->assertSame(1, PointsTransaction::withoutGlobalScopes()->where('reference_type', 'booking_mirror')->count());
    }

    public function test_the_daily_command_awards_every_finished_member_stay_once(): void
    {
        $a = $this->stay();
        $b = $this->stay(['price_total' => 100]);
        $upcoming = $this->stay(['departure_date' => now()->addDays(5)->toDateString(), 'internal_status' => 'confirmed']);
        $guest = $this->stay(['member_id' => null]);
        app()->forgetInstance('current_organization_id'); // the scheduler binds no tenant

        $this->artisan('bookings:award-stay-points')->assertExitCode(0);
        $this->artisan('bookings:award-stay-points')->assertExitCode(0);

        $this->assertSame(2, PointsTransaction::withoutGlobalScopes()->where('reference_type', 'booking_mirror')->count());
        $this->assertSame(2700 + 1500, (int) LoyaltyMember::withoutGlobalScopes()->findOrFail($this->member->id)->current_points);
        $this->assertNotNull($a->fresh()->points_awarded_at);
        $this->assertNotNull($b->fresh()->points_awarded_at);
        $this->assertNull($upcoming->fresh()->points_awarded_at);
        $this->assertNull($guest->fresh()->points_awarded_at);
    }

    public function test_a_dry_run_awards_nothing(): void
    {
        $stay = $this->stay();
        app()->forgetInstance('current_organization_id');

        $this->artisan('bookings:award-stay-points', ['--dry-run' => true])->assertExitCode(0);

        $this->assertSame(0, PointsTransaction::withoutGlobalScopes()->count());
        $this->assertNull($stay->fresh()->points_awarded_at);
    }

    /**
     * Found by the live pass (task 23): the dry run printed every candidate
     * row — a stay the member had cancelled included — while the runbook
     * says it lists what would be awarded. It must answer with exactly the
     * stays the real run would award.
     */
    public function test_a_dry_run_lists_only_the_stays_the_real_run_would_award(): void
    {
        $awardable = $this->stay();
        $cancelled = $this->stay(['internal_status' => 'cancelled', 'booking_state' => 'cancelled', 'cancelled_at' => now()]);
        $awaitingCapture = $this->stay(['payment_status' => 'authorized']);
        app()->forgetInstance('current_organization_id');

        $this->artisan('bookings:award-stay-points', ['--dry-run' => true])
            ->expectsOutputToContain("stay #{$awardable->id} (")
            ->doesntExpectOutputToContain("stay #{$cancelled->id} (")
            ->doesntExpectOutputToContain("stay #{$awaitingCapture->id} (")
            ->expectsOutputToContain('1 stay(s) would be awarded')
            ->assertExitCode(0);

        $this->assertSame(0, PointsTransaction::withoutGlobalScopes()->count());
        $this->assertNull($awardable->fresh()->points_awarded_at);
    }
}
