<?php

namespace Tests\Feature\Appointments;

use App\Services\Appointments\AppointmentActions;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class AppointmentActionsTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    /** @return array<string, mixed> key => the action row */
    private function actionsFor(array $attrs): array
    {
        return collect(app(AppointmentActions::class)->for($this->seedBooking($attrs)))->keyBy('key')->all();
    }

    /** @return array<string, array{0: string, 1: list<string>}> */
    public static function allowedByStatus(): array
    {
        return [
            'pending'     => ['pending',     ['confirm', 'cancel', 'move']],
            'confirmed'   => ['confirmed',   ['start', 'complete', 'no_show', 'cancel', 'mark_paid_at_venue', 'move']],
            'in_progress' => ['in_progress', ['complete', 'cancel', 'mark_paid_at_venue', 'move']],
            'completed'   => ['completed',   ['mark_paid_at_venue']],
            'cancelled'   => ['cancelled',   []],
            'no_show'     => ['no_show',     []],
        ];
    }

    #[DataProvider('allowedByStatus')]
    public function test_each_status_allows_exactly_its_actions(string $status, array $expected): void
    {
        $allowed = array_keys(array_filter($this->actionsFor(['status' => $status]), fn ($a) => $a['allowed']));

        sort($allowed);
        sort($expected);
        $this->assertSame($expected, $allowed);
    }

    public function test_the_list_always_names_every_action_in_one_order(): void
    {
        $this->assertSame(
            ['confirm', 'start', 'complete', 'no_show', 'cancel', 'mark_paid_at_venue', 'award_points', 'move'],
            array_column(app(AppointmentActions::class)->for($this->seedBooking()), 'key'),
        );
    }

    public function test_marking_paid_at_the_venue_is_never_offered_on_a_card_payment(): void
    {
        // One intent per booking: the table allows a payment on one booking only.
        $this->assertFalse($this->actionsFor(['payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_123'])['mark_paid_at_venue']['allowed']);
        $this->assertFalse($this->actionsFor(['payment_status' => 'unpaid', 'stripe_payment_intent_id' => 'pi_124'])['mark_paid_at_venue']['allowed']);
        $this->assertFalse($this->actionsFor(['payment_status' => 'paid'])['mark_paid_at_venue']['allowed']);
        $this->assertTrue($this->actionsFor(['payment_status' => 'unpaid'])['mark_paid_at_venue']['allowed']);
    }

    public function test_a_held_card_is_charged_on_confirm_and_released_on_cancel_or_no_show(): void
    {
        $pending = $this->actionsFor(['status' => 'pending', 'payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_123']);
        $this->assertSame('hold_will_be_charged', $pending['confirm']['consequences']['payment']);
        $this->assertSame('hold_will_be_released', $pending['cancel']['consequences']['payment']);

        $confirmed = $this->actionsFor(['status' => 'confirmed', 'payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_124']);
        $this->assertSame('hold_will_be_released', $confirmed['no_show']['consequences']['payment']);
    }

    public function test_a_hold_older_than_the_capture_jobs_window_is_neither_charged_nor_released(): void
    {
        // The job visits a hold for six days after the booking was made. Past
        // that, confirming charges nothing and cancelling releases nothing:
        // the authorisation lapses at Stripe on its own.
        $booking = $this->seedBooking(['status' => 'pending', 'payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_old_1']);
        DB::table('service_bookings')->where('id', $booking->id)->update(['created_at' => now()->subDays(AppointmentActions::HOLD_SWEEP_DAYS)->subHour()]);
        $old = collect(app(AppointmentActions::class)->for($booking->fresh()))->keyBy('key');

        $this->assertSame('hold_expired', $old['confirm']['consequences']['payment']);
        $this->assertSame('hold_expired', $old['cancel']['consequences']['payment']);
        $this->assertSame('hold_expired', $old['no_show']['consequences']['payment']);

        // One hour inside the window it is still the job's to charge or release.
        $recent = $this->seedBooking(['status' => 'pending', 'payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_recent_1']);
        DB::table('service_bookings')->where('id', $recent->id)->update(['created_at' => now()->subDays(AppointmentActions::HOLD_SWEEP_DAYS)->addHour()]);
        $inside = collect(app(AppointmentActions::class)->for($recent->fresh()))->keyBy('key');

        $this->assertSame('hold_will_be_charged', $inside['confirm']['consequences']['payment']);
        $this->assertSame('hold_will_be_released', $inside['cancel']['consequences']['payment']);
    }

    public function test_the_window_is_the_capture_jobs_own(): void
    {
        // The sentence the panel prints is only true while this number is the
        // job's. If the job's window changes, this fails and the two are
        // changed together.
        $this->assertStringContainsString(
            '$maxAge = now()->subDays(' . AppointmentActions::HOLD_SWEEP_DAYS . ');',
            (string) file_get_contents(app_path('Console/Commands/CapturePendingPaymentIntents.php')),
        );
    }

    public function test_a_captured_payment_is_not_refunded_by_a_cancellation(): void
    {
        $a = $this->actionsFor(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_123']);

        $this->assertSame('captured_not_refunded', $a['cancel']['consequences']['payment']);
        $this->assertSame('captured_not_refunded', $a['no_show']['consequences']['payment']);
    }

    public function test_a_booking_without_a_card_payment_has_no_payment_consequence(): void
    {
        $a = $this->actionsFor([]);

        $this->assertSame('none', $a['cancel']['consequences']['payment']);
        $this->assertSame('none', $a['confirm']['consequences']['payment']);
        $this->assertSame('marked_only', $a['mark_paid_at_venue']['consequences']['payment']);
        // A mock intent (demo mode) is not a card payment.
        $mock = $this->actionsFor(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_mock_abc']);
        $this->assertSame('none', $mock['cancel']['consequences']['payment']);
    }

    public function test_cancelling_says_a_coupon_is_not_returned(): void
    {
        $this->assertSame('not_returned', $this->actionsFor(['discount_source' => 'offer', 'discount_source_id' => 7])['cancel']['consequences']['coupon']);
        $this->assertSame('not_returned', $this->actionsFor(['discount_source' => 'reward', 'discount_source_id' => 7])['cancel']['consequences']['coupon']);
        $this->assertSame('none', $this->actionsFor(['discount_source' => 'tier_benefit', 'discount_source_id' => 7])['cancel']['consequences']['coupon']);
        $this->assertSame('none', $this->actionsFor([])['cancel']['consequences']['coupon']);
    }

    public function test_complete_carries_the_points_preview_and_nothing_sends_a_message(): void
    {
        $member = $this->actionsFor(['member_id' => $this->member->id, 'total_amount' => 60]);
        $this->assertSame(['points' => 900, 'reason' => null], $member['complete']['consequences']['points']); // floor(60 * 10 * 1.5)

        $walkIn = $this->actionsFor([]);
        $this->assertSame(['points' => 0, 'reason' => 'not_a_member'], $walkIn['complete']['consequences']['points']);

        foreach ($walkIn as $row) {
            $this->assertSame('none', $row['consequences']['message']);
        }
        $this->assertNull($walkIn['cancel']['consequences']['points']);
    }

    public function test_award_points_appears_only_when_a_completed_visits_award_is_still_due(): void
    {
        $due = $this->actionsFor(['status' => 'completed', 'member_id' => $this->member->id]);
        $this->assertTrue($due['award_points']['allowed']);
        $this->assertSame(900, $due['award_points']['consequences']['points']['points']);

        $this->assertFalse($this->actionsFor(['status' => 'completed', 'member_id' => $this->member->id, 'points_awarded_at' => now()])['award_points']['allowed']);
        $this->assertFalse($this->actionsFor(['status' => 'completed'])['award_points']['allowed']);
        $this->assertFalse($this->actionsFor(['status' => 'confirmed', 'member_id' => $this->member->id])['award_points']['allowed']);
    }
}
