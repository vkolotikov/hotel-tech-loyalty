<?php

namespace Tests\Feature\Booking;

use App\Models\HotelSetting;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\Organization;
use App\Models\PointsTransaction;
use App\Models\ServiceBooking;
use App\Services\Loyalty\BookingPointsService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\SeedsPointsFixture;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

class BookingPointsServiceTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema, SeedsPointsFixture;

    private int $orgId;
    private LoyaltyMember $member;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpMinimalSchema();
        $this->setUpLoyaltyAwardSchema(); // members, tiers, points_transactions, expiry buckets, audit, domain events
        $this->setUpServiceBookingSchema();

        $fixture = $this->seedPointsFixture();
        $this->orgId = $fixture['orgId'];
        $this->member = $fixture['member'];
    }

    private function booking(array $attrs = []): ServiceBooking
    {
        return $this->pointsBooking($this->orgId, $this->member, $attrs);
    }

    public function test_it_awards_floor_of_paid_amount_times_base_times_tier_rate_once(): void
    {
        $b = $this->booking();
        $svc = app(BookingPointsService::class);
        $tx = $svc->awardForServiceBooking($b);

        $this->assertNotNull($tx);
        $this->assertSame(810, $tx->points); // 54 x 10 x 1.5
        $this->assertSame('service_booking', $tx->reference_type);
        $this->assertNotNull($b->fresh()->points_awarded_at);
        $this->assertNull($svc->awardForServiceBooking($b->fresh()));
        $this->assertSame(1, PointsTransaction::where('member_id', $this->member->id)->count());
        $this->assertSame(810, (int) $this->member->fresh()->current_points);
    }

    public function test_nothing_is_awarded_unless_completed_and_enabled(): void
    {
        $svc = app(BookingPointsService::class);

        $this->assertNull($svc->awardForServiceBooking($this->booking(['status' => 'confirmed'])));

        HotelSetting::withoutGlobalScopes()->create([
            'organization_id' => $this->orgId,
            'key'             => 'points_on_bookings',
            'value'           => 'false',
        ]);
        HotelSetting::flushCacheFor($this->orgId);

        $this->assertNull($svc->awardForServiceBooking($this->booking()));
        $this->assertSame(0, PointsTransaction::count());
    }

    public function test_no_points_without_loyalty(): void
    {
        LoyaltyTier::where('organization_id', $this->orgId)->update(['is_active' => false]);
        Cache::flush();

        $this->assertNull(app(BookingPointsService::class)->awardForServiceBooking($this->booking()));
    }

    public function test_a_member_without_a_tier_still_earns_at_the_base_rate(): void
    {
        $this->member->forceFill(['tier_id' => null])->save();

        $tx = app(BookingPointsService::class)->awardForServiceBooking($this->booking());

        $this->assertNotNull($tx);
        $this->assertSame(540, $tx->points); // 54 x 10 x 1.0
    }

    /**
     * LoyaltyService::pointsForSpend() reads points_per_currency through
     * HotelSetting::getValue(), which reads off whatever org happens to be
     * bound to the container right now — not necessarily the booking's own
     * org. BookingPointsService must correct for that itself: a booking's
     * points always come from ITS org's rate, even when some other org's
     * context is what's bound when the service runs (e.g. an admin request
     * for a different tenant, a queued job, a console command mid-sweep).
     */
    public function test_the_rate_is_the_bookings_organisations_own(): void
    {
        $booking = $this->booking();

        $otherOrgId = Organization::create([
            'name'     => 'Other',
            'slug'     => 'org-' . uniqid('', true),
            'industry' => 'beauty',
        ])->id;
        // A raw insert, not HotelSetting::create(): BelongsToOrganization's
        // `creating` hook forces organization_id from whatever org is
        // CURRENTLY bound (this->orgId, still bound at this point) even
        // when withoutGlobalScopes() is used and a different organization_id
        // is passed explicitly -- that guard is what this whole test exists
        // to exercise, so the fixture has to sidestep it deliberately.
        DB::table('hotel_settings')->insert([
            'organization_id' => $otherOrgId,
            'key'             => 'points_per_currency',
            'value'           => '1000',
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        HotelSetting::flushCacheFor($otherOrgId);
        app()->instance('current_organization_id', $otherOrgId);

        $tx = app(BookingPointsService::class)->awardForServiceBooking($booking);

        $this->assertNotNull($tx);
        $this->assertSame(810, $tx->points); // this booking's own org: 54 x 10 x 1.5 -- never the other org's 1000
        $this->assertSame($this->orgId, (int) $tx->organization_id);
    }
}
