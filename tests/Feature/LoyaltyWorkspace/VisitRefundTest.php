<?php

namespace Tests\Feature\LoyaltyWorkspace;

use App\Models\CreditTransaction;
use App\Models\LoyaltyMember;
use App\Models\ServiceBookingPayment;
use App\Models\Stamp;
use App\Services\Appointments\AppointmentPresenter;
use App\Services\Appointments\Money\AppointmentMoney;
use App\Services\Loyalty\BookingPointsService;
use App\Services\Loyalty\Programme\ProgrammeOptions;
use App\Services\Portal\PortalBootstrap;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Tests\Concerns\LoyaltyWorkspace\CreditSchema;
use Tests\Concerns\LoyaltyWorkspace\TierCountsSchema;
use Tests\Concerns\LoyaltyWorkspace\VisitsSchema;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

/**
 * A completed appointment's visit (its stamp and its cashback, release 7) goes back when all its money goes back, whether
 * or not the venue gives points on bookings — and an appointment from before the venue switched a way on earns nothing
 * from it when it is touched again (found by the release 7 review).
 */
class VisitRefundTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema, CreditSchema, VisitsSchema, TierCountsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        $this->buildCreditSchema();
        $this->buildVisitsSchema();
        $this->buildTierCountsSchema();
    }

    /** @return array{earned: int, stamps: int, reversed: int, stamps_after: int, balance: string, awarded: bool} */
    private function refundedVisit(bool $pointsOn): array
    {
        ProgrammeOptions::save($this->org->id, [
            'points_on_bookings' => $pointsOn, 'cashback_enabled' => true, 'cashback_percent' => 5,
            'stamps_enabled' => true, 'stamps_per_card' => 10,
        ], $this->staff);
        $today = PortalBootstrap::venueToday($this->org->id)->toDateString();

        $b = $this->seedBooking(['member_id' => $this->member->id, 'status' => 'completed', 'payment_status' => 'paid',
            'start_at' => "{$today} 10:00:00", 'end_at' => "{$today} 10:45:00"]);
        ServiceBookingPayment::create(['service_booking_id' => $b->id, 'kind' => 'payment', 'method' => 'cash', 'amount' => 60, 'currency' => 'EUR', 'actor_user_id' => $this->staff->id]);

        app(BookingPointsService::class)->awardForServiceBooking($b->fresh());
        $earned = CreditTransaction::withoutGlobalScopes()->where('member_id', $this->member->id)->where('type', 'earn')->count();
        $stamps = Stamp::withoutGlobalScopes()->where('member_id', $this->member->id)->count();

        // The whole 60.00 back at the desk.
        app(AppointmentMoney::class)->refund($b->id, 60, 'cash', 'Client unhappy', AppointmentPresenter::revision($b->fresh()), $this->staff);

        return [
            'earned'       => $earned,
            'stamps'       => $stamps,
            'reversed'     => CreditTransaction::withoutGlobalScopes()->where('member_id', $this->member->id)->where('type', 'reverse')->count(),
            'stamps_after' => Stamp::withoutGlobalScopes()->where('member_id', $this->member->id)->count(),
            'balance'      => (string) LoyaltyMember::withoutGlobalScopes()->whereKey($this->member->id)->value('credit_balance'),
            'awarded'      => $b->fresh()->points_awarded_at !== null,
        ];
    }

    public function test_a_full_refund_takes_the_visit_back_with_points_on(): void
    {
        $r = $this->refundedVisit(true);

        $this->assertTrue($r['awarded']);
        $this->assertSame([1, 1], [$r['earned'], $r['stamps']]);
        $this->assertSame([1, 0], [$r['reversed'], $r['stamps_after']]);
        $this->assertEquals(0.0, (float) $r['balance']);
    }

    public function test_a_full_refund_takes_the_visit_back_with_points_off_too(): void
    {
        $r = $this->refundedVisit(false);

        $this->assertFalse($r['awarded'], 'no points were given');
        $this->assertSame([1, 1], [$r['earned'], $r['stamps']], 'the visit still earned its stamp and cashback');
        $this->assertSame(1, $r['reversed'], 'the cashback goes back');
        $this->assertSame(0, $r['stamps_after'], 'the stamp comes off its open card');
        $this->assertEquals(0.0, (float) $r['balance']);
    }

    public function test_an_appointment_from_before_the_switch_earns_nothing_when_touched_again(): void
    {
        // Completed and awarded in January, long before the venue used cashback or stamps.
        $b = $this->seedBooking(['member_id' => $this->member->id, 'status' => 'completed', 'payment_status' => 'paid',
            'start_at' => '2026-01-10 10:00:00', 'end_at' => '2026-01-10 10:45:00', 'total_amount' => 200]);
        DB::table('service_bookings')->where('id', $b->id)->update(['points_awarded_at' => '2026-01-10 12:00:00']);
        ProgrammeOptions::save($this->org->id, ['cashback_enabled' => true, 'cashback_percent' => 10, 'stamps_enabled' => true], $this->staff);

        // Any later call of the award: a status change to completed, the bulk mark-complete, "Award points".
        app(BookingPointsService::class)->awardForServiceBooking($b->fresh());

        $this->assertSame(0, CreditTransaction::withoutGlobalScopes()->where('member_id', $this->member->id)->count());
        $this->assertSame(0, Stamp::withoutGlobalScopes()->where('member_id', $this->member->id)->count());
    }
}
