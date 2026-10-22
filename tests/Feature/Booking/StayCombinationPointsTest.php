<?php

namespace Tests\Feature\Booking;

use App\Models\BookingMirror;
use App\Models\LoyaltyMember;
use App\Models\PointsTransaction;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\Concerns\SeedsPointsFixture;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\TestCase;

/**
 * Release 5, part C: each room of a member-portal combination is a stay row
 * with its own share of the one price (StayCombination::shares()), so the
 * daily `bookings:award-stay-points` earns on each room once, and the member
 * earns on what the whole combination cost. The payment is on the lead room
 * only; the other rooms are paid with it (the capture job marks every room
 * of the payment paid — CapturePendingPaymentIntents, GroupPayment), so they
 * earn although they carry no intent of their own.
 */
class StayCombinationPointsTest extends TestCase
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

        $this->seedVenue(); // 10 points per currency unit, tier rate 1.5
    }

    /**
     * SeedsPointsFixture::seedPointsFixture()'s venue, written so production's
     * schema accepts it too (the test runs on PostgreSQL as well):
     * `loyalty_members.qr_code_token` and `.referral_code`, `hotel_settings.type`
     * and `.group` are NOT NULL there.
     */
    private function seedVenue(): void
    {
        $this->ensurePointsBenefitTables();
        $this->orgId = \App\Models\Organization::create(['name' => 'Numa', 'slug' => 'org-' . uniqid('', true), 'industry' => 'beauty'])->id;
        app()->instance('current_organization_id', $this->orgId);
        $tier = \App\Models\LoyaltyTier::create(['organization_id' => $this->orgId, 'name' => 'Gold', 'min_points' => 0, 'earn_rate' => 1.5, 'is_active' => true]);
        $user = \App\Models\User::create(['name' => 'Ada', 'email' => 'ada_' . uniqid('', true) . '@example.test', 'password' => bcrypt('secret-pass-1'), 'user_type' => 'member', 'organization_id' => $this->orgId]);
        $this->member = LoyaltyMember::create(['organization_id' => $this->orgId, 'user_id' => $user->id, 'tier_id' => $tier->id, 'member_number' => 'HL-' . $user->id, 'current_points' => 0, 'lifetime_points' => 0]
            + (\Illuminate\Support\Facades\Schema::hasColumn('loyalty_members', 'qr_code_token') ? ['qr_code_token' => bin2hex(random_bytes(16))] : [])
            + (\Illuminate\Support\Facades\Schema::hasColumn('loyalty_members', 'referral_code') ? ['referral_code' => strtoupper(bin2hex(random_bytes(4)))] : []));
        \App\Models\HotelSetting::withoutGlobalScopes()->create(['organization_id' => $this->orgId, 'key' => 'points_per_currency', 'value' => '10', 'type' => 'string', 'group' => 'loyalty']);
        \App\Models\HotelSetting::flushCacheFor($this->orgId);
    }

    private function room(string $group, array $attrs): BookingMirror
    {
        return BookingMirror::withoutGlobalScopes()->create(array_merge([
            'organization_id' => $this->orgId, 'booking_group_id' => $group,
            'booking_state' => 'confirmed', 'internal_status' => 'checked-out', 'channel_name' => 'Member portal', 'member_id' => $this->member->id,
            'arrival_date' => now()->subDays(3)->toDateString(), 'departure_date' => now()->subDay()->toDateString(),
            'payment_status' => 'paid', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => null,
        ], $attrs));
    }

    public function test_each_room_earns_once_on_its_own_share_of_the_one_price(): void
    {
        $lead = $this->room('g-1', ['reservation_id' => 'R-C1', 'booking_reference' => 'BK-C1', 'apartment_id' => '101', 'price_total' => 180, 'stripe_payment_intent_id' => 'pi_combo']);
        $other = $this->room('g-1', ['reservation_id' => 'R-C2', 'booking_reference' => 'BK-C2', 'apartment_id' => '102', 'price_total' => 144]);
        $cancelled = $this->room('g-2', ['reservation_id' => 'R-X1', 'apartment_id' => '101', 'price_total' => 100, 'stripe_payment_intent_id' => 'pi_combo_2', 'internal_status' => 'cancelled', 'booking_state' => 'cancelled', 'cancelled_at' => now()]);
        $this->room('g-2', ['reservation_id' => 'R-X2', 'apartment_id' => '102', 'price_total' => 100, 'internal_status' => 'cancelled', 'booking_state' => 'cancelled', 'cancelled_at' => now()]);
        app()->forgetInstance('current_organization_id'); // the scheduler binds no tenant

        $this->artisan('bookings:award-stay-points')->assertExitCode(0);
        $this->artisan('bookings:award-stay-points')->assertExitCode(0);

        $this->assertSame([2700, 2160], PointsTransaction::withoutGlobalScopes()->where('reference_type', 'booking_mirror')->orderBy('reference_id')->pluck('points')->map(fn ($p) => (int) $p)->all());
        $this->assertSame(2700 + 2160, (int) LoyaltyMember::withoutGlobalScopes()->findOrFail($this->member->id)->current_points, '(180 + 144) × 10 × 1.5');
        $this->assertNotNull($lead->fresh()->points_awarded_at);
        $this->assertNotNull($other->fresh()->points_awarded_at);
        $this->assertNull($cancelled->fresh()->points_awarded_at);
    }
}
