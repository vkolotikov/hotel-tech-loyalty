<?php

namespace Tests\Feature\Appointments;

use App\Models\AuditLog;
use App\Models\LoyaltyTier;
use App\Models\PointsTransaction;
use App\Services\Appointments\AppointmentPresenter;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\TestCase;

class AppointmentPresenterTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
    }

    private function presenter(): AppointmentPresenter
    {
        return app(AppointmentPresenter::class);
    }

    public function test_the_summary_is_what_a_calendar_card_shows_and_nothing_more(): void
    {
        $booking = $this->seedBooking(['staff_notes' => 'Allergic to lavender', 'customer_email' => 'sophie@example.test']);

        $summary = $this->presenter()->summary($booking);

        $this->assertSame('2026-10-06T10:00', $summary['start']);
        $this->assertSame('2026-10-06T10:45', $summary['end']);
        $this->assertSame(45, $summary['duration_minutes']);
        $this->assertSame(['id' => $this->service->id, 'name' => 'Deep Tissue Massage'], $summary['service']);
        $this->assertSame(['id' => $this->master->id, 'name' => 'Mara Ilves'], $summary['master']);
        $this->assertSame(['id' => null, 'name' => 'Sophie Williams', 'is_member' => false], $summary['client']);
        $this->assertSame('confirmed', $summary['status']);
        $this->assertSame(['state' => 'not_paid_online'], $summary['payment']);
        $this->assertMatchesRegularExpression('/^[0-9a-f]{16}$/', $summary['revision']);

        // Privacy: no notes, no contact details, no loyalty on the calendar payload.
        $json = json_encode($summary);
        $this->assertStringNotContainsString('lavender', $json);
        $this->assertStringNotContainsString('sophie@example.test', $json);
        $this->assertStringNotContainsString('7700', $json);
        foreach (['notes', 'actions', 'loyalty', 'history', 'price'] as $key) {
            $this->assertArrayNotHasKey($key, $summary);
        }
    }

    /** @return array<string, array{0: array<string, mixed>, 1: string}> */
    public static function paymentStates(): array
    {
        return [
            'unpaid'                       => [['payment_status' => 'unpaid'], 'not_paid_online'],
            'card held'                    => [['payment_status' => 'authorized', 'stripe_payment_intent_id' => 'pi_1'], 'card_held'],
            'paid by card'                 => [['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_1'], 'paid_by_card'],
            'paid, no card behind it'      => [['payment_status' => 'paid'], 'marked_paid'],
            'paid, demo intent'            => [['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_mock_1'], 'marked_paid'],
            'refunded with an amount'      => [['payment_status' => 'refunded', 'refunded_amount' => 60], 'refunded'],
            'refunded, only a label'       => [['payment_status' => 'refunded'], 'marked_refunded'],
            'partially refunded'           => [['payment_status' => 'partially_refunded', 'refunded_amount' => 20], 'partially_refunded'],
            'failed'                       => [['payment_status' => 'failed'], 'failed'],
            'hold released by the job'     => [['payment_status' => 'cancelled', 'stripe_payment_intent_id' => 'pi_1'], 'hold_released'],
            'a value nobody planned for'   => [['payment_status' => 'disputed'], 'unknown'],
        ];
    }

    #[DataProvider('paymentStates')]
    public function test_the_payment_state_never_claims_more_than_the_row_shows(array $attrs, string $state): void
    {
        $this->assertSame($state, AppointmentPresenter::paymentState($this->seedBooking($attrs)));
    }

    public function test_the_revision_changes_with_anything_a_second_operator_could_change(): void
    {
        $booking = $this->seedBooking();
        $before = AppointmentPresenter::revision($booking);

        $this->assertSame($before, AppointmentPresenter::revision($booking->fresh()));

        foreach ([
            ['status' => 'in_progress'],
            ['payment_status' => 'paid'],
            ['start_at' => '2026-10-06 11:00:00', 'end_at' => '2026-10-06 11:45:00'],
            ['staff_notes' => 'Running late'],
        ] as $change) {
            $changed = $this->seedBooking($change);
            $changed->forceFill(['updated_at' => $booking->updated_at])->saveQuietly();
            $this->assertNotSame($before, AppointmentPresenter::revision($changed->fresh()), json_encode($change));
        }
    }

    public function test_the_detail_carries_the_client_the_price_the_actions_and_the_member(): void
    {
        $client = $this->seedMemberClient();
        $booking = $this->seedBooking([
            'guest_id' => $client->id, 'member_id' => $this->member->id,
            'customer_name' => 'Ada Member', 'customer_email' => 'ada@example.test', 'customer_phone' => null,
            'staff_notes' => 'Prefers firm pressure',
            'list_amount' => 60, 'discount_amount' => 6, 'discount_label' => 'Gold 10%', 'total_amount' => 54,
        ]);

        $detail = $this->presenter()->detail($booking);

        $this->assertSame($client->id, $detail['client']['id']);
        $this->assertSame('ada@example.test', $detail['client']['email']);
        $this->assertNull($detail['client']['phone']);
        $this->assertSame(['id' => $this->member->id, 'number' => $this->member->member_number, 'tier' => 'Gold', 'points' => 0], $detail['client']['member']);
        $this->assertSame(['total' => 54.0, 'list' => 60.0, 'discount_label' => 'Gold 10%', 'currency' => 'EUR'], $detail['price']);
        $this->assertSame(['customer' => null, 'staff' => 'Prefers firm pressure'], $detail['notes']);
        $this->assertSame('not_paid_online', $detail['payment']['state']);
        $this->assertFalse($detail['payment']['carries_card_payment']);
        $this->assertCount(8, $detail['actions']);
        $this->assertSame($this->member->id, $detail['loyalty']['member']['id']);
        $this->assertTrue($detail['loyalty']['points_on_bookings']);
        $this->assertNull($detail['loyalty']['awarded']);
        $this->assertSame([], $detail['history']);
    }

    public function test_a_phone_only_client_has_a_null_email_not_an_empty_string(): void
    {
        $detail = $this->presenter()->detail($this->seedBooking(['customer_email' => '']));

        $this->assertNull($detail['client']['email']);
        $this->assertSame('+44 7700 900123', $detail['client']['phone']);
        $this->assertNull($detail['client']['member']);
        $this->assertNull($detail['loyalty']['member']);
    }

    public function test_the_loyalty_card_is_absent_when_the_venue_runs_no_programme(): void
    {
        LoyaltyTier::withoutGlobalScopes()->where('organization_id', $this->org->id)->update(['is_active' => false]);

        $this->assertNull($this->presenter()->detail($this->seedBooking(['member_id' => $this->member->id]))['loyalty']);
    }

    public function test_awarded_points_come_from_the_ledger(): void
    {
        $booking = $this->seedBooking(['status' => 'completed', 'member_id' => $this->member->id, 'points_awarded_at' => now()]);
        PointsTransaction::create([
            'organization_id' => $this->org->id, 'member_id' => $this->member->id, 'points' => 900, 'type' => 'earn',
            'reference_type' => 'service_booking', 'reference_id' => $booking->id, 'description' => 'Appointment',
        ]);

        $this->assertSame(900, $this->presenter()->detail($booking)['loyalty']['awarded']);
    }

    public function test_history_lists_the_bookings_audit_rows_newest_first_with_the_actor(): void
    {
        $booking = $this->seedBooking();
        AuditLog::record('service_booking.created', $booking, ['status' => 'confirmed'], [], $this->staff, 'Created');
        AuditLog::record('service_booking.moved', $booking, ['start' => '2026-10-06T11:00'], ['start' => '2026-10-06T10:00'], $this->staff, 'Moved');
        AuditLog::record('service_booking.created', $this->seedBooking(), [], [], $this->staff, 'Someone else\'s');

        $history = $this->presenter()->detail($booking)['history'];

        $this->assertSame(['service_booking.moved', 'service_booking.created'], array_column($history, 'action'));
        $this->assertSame('Staff', $history[0]['actor']);
        $this->assertSame(['old' => ['start' => '2026-10-06T10:00'], 'new' => ['start' => '2026-10-06T11:00']], $history[0]['changes']);
        $this->assertStringEndsWith('+00:00', $history[0]['at']);
    }
}
