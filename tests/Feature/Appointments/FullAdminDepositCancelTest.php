<?php

namespace Tests\Feature\Appointments;

use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Queue;
use Mockery;
use Stripe\Refund;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\Concerns\TakesDeposits;
use Tests\TestCase;

/** Part H §6.1: the full admin's status change, delete and bulk cancel follow the deposit's window too. */
class FullAdminDepositCancelTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema, TakesDeposits;

    private $stripe;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments(enabled: false);
        Queue::fake();
        $this->stripe = $this->stripeForDeposits();
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    private function refundOk(string $pi): void
    {
        $this->stripe->shouldReceive('refund')->once()->withArgs(fn ($id) => $id === $pi)
            ->andReturn(Refund::constructFrom(['id' => 're_' . $pi, 'status' => 'succeeded']));
    }

    public function test_a_status_change_to_cancelled_refunds_in_time_and_keeps_late(): void
    {
        $inTime = $this->takenDeposit();
        $this->refundOk($inTime->stripe_payment_intent_id);
        $this->asStaff()->patchJson("/api/v1/admin/service-bookings/{$inTime->id}/status", ['status' => 'cancelled'])->assertOk();
        $this->assertSame(['cancelled', 'refunded'], [$inTime->fresh()->status, $inTime->fresh()->payment_status]);

        $late = $this->takenDeposit(['start_at' => '2026-10-05 15:00:00', 'end_at' => '2026-10-05 15:45:00']);
        $this->asStaff()->patchJson("/api/v1/admin/service-bookings/{$late->id}/status", ['status' => 'cancelled'])->assertOk();
        $this->assertSame(['cancelled', 'unpaid'], [$late->fresh()->status, $late->fresh()->payment_status]);
    }

    public function test_a_refused_refund_leaves_the_booking_as_it_was(): void
    {
        $b = $this->takenDeposit();
        $this->stripe->shouldReceive('refund')->andThrow(new \RuntimeException('card closed'));

        $this->asStaff()->patchJson("/api/v1/admin/service-bookings/{$b->id}/status", ['status' => 'cancelled'])
            ->assertStatus(422)->assertJsonPath('error', 'deposit_refund_failed');
        $this->assertSame('confirmed', $b->fresh()->status);
    }

    public function test_delete_follows_the_same_rule(): void
    {
        $b = $this->takenDeposit();
        $this->refundOk($b->stripe_payment_intent_id);

        $this->asStaff()->deleteJson("/api/v1/admin/service-bookings/{$b->id}")->assertOk();
        $this->assertSame(['cancelled', 'refunded'], [$b->fresh()->status, $b->fresh()->payment_status]);
    }

    public function test_a_bulk_cancel_keeps_only_the_booking_whose_refund_was_refused(): void
    {
        $refused = $this->takenDeposit();
        $refunded = $this->takenDeposit(['start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']);
        $plain = $this->seedBooking(['start_at' => '2026-10-06 14:00:00', 'end_at' => '2026-10-06 14:45:00']);
        $this->stripe->shouldReceive('refund')->withArgs(fn ($id) => $id === $refused->stripe_payment_intent_id)->andThrow(new \RuntimeException('card closed'));
        $this->refundOk($refunded->stripe_payment_intent_id);

        $res = $this->asStaff()->postJson('/api/v1/admin/service-bookings/bulk', ['ids' => [$refused->id, $refunded->id, $plain->id], 'action' => 'cancel'])
            ->assertOk()->assertJsonPath('updated', 2)->assertJsonPath('failed', [$refused->booking_reference]);
        $this->assertStringContainsString($refused->booking_reference, $res->json('message'));

        $this->assertSame('confirmed', $refused->fresh()->status);
        $this->assertSame(['cancelled', 'refunded'], [$refunded->fresh()->status, $refunded->fresh()->payment_status]);
        $this->assertSame('cancelled', $plain->fresh()->status);
    }

    // 2026-10-07: the workspace refuses to reopen a visit whose money went back (spec §6.4); the full admin's status
    // change and bulk status change now refuse it too. A kept deposit's cancellation can still be reopened.
    public function test_the_full_admin_cannot_reopen_a_cancellation_whose_money_went_back(): void
    {
        $refunded = $this->takenDeposit(['status' => 'cancelled', 'cancelled_at' => now(), 'refunded_amount' => 12]);
        $kept = $this->takenDeposit(['status' => 'cancelled', 'cancelled_at' => '2026-10-05 12:00:00', 'start_at' => '2026-10-06 12:00:00', 'end_at' => '2026-10-06 12:45:00']);

        $this->asStaff()->patchJson("/api/v1/admin/service-bookings/{$refunded->id}/status", ['status' => 'confirmed'])
            ->assertStatus(422)->assertJsonPath('error', 'money_returned');
        $this->assertSame('cancelled', $refunded->fresh()->status);

        $this->asStaff()->patchJson("/api/v1/admin/service-bookings/{$kept->id}/status", ['status' => 'confirmed'])->assertOk();
        $this->assertSame('confirmed', $kept->fresh()->status);
    }

    public function test_a_bulk_status_change_leaves_a_cancellation_whose_money_went_back(): void
    {
        $refunded = $this->takenDeposit(['status' => 'cancelled', 'cancelled_at' => now(), 'refunded_amount' => 12]);
        $plain = $this->seedBooking(['status' => 'cancelled', 'cancelled_at' => now(), 'start_at' => '2026-10-06 14:00:00', 'end_at' => '2026-10-06 14:45:00']);

        $this->asStaff()->postJson('/api/v1/admin/service-bookings/bulk', ['ids' => [$refunded->id, $plain->id], 'action' => 'mark_status', 'value' => 'confirmed'])
            ->assertOk()->assertJsonPath('updated', 1)->assertJsonPath('failed', [$refunded->booking_reference]);
        $this->assertSame(['cancelled', 'confirmed'], [$refunded->fresh()->status, $plain->fresh()->status]);
    }

    // 2026-10-07: an unexpected error on one deposit booking (not a refusal) used to answer 500 after the others were
    // already cancelled; it now leaves that one booking as it was, like a refusal, and the rest go ahead.
    public function test_a_bulk_cancel_survives_an_unexpected_error_on_one_deposit_booking(): void
    {
        $broken = $this->takenDeposit();
        $plain = $this->seedBooking(['start_at' => '2026-10-06 14:00:00', 'end_at' => '2026-10-06 14:45:00']);
        $this->stripe->shouldReceive('isEnabled')->andThrow(new \RuntimeException('stripe client blew up'));

        $this->asStaff()->postJson('/api/v1/admin/service-bookings/bulk', ['ids' => [$broken->id, $plain->id], 'action' => 'cancel'])
            ->assertOk()->assertJsonPath('updated', 1)->assertJsonPath('failed', [$broken->booking_reference]);
        $this->assertSame(['confirmed', 'cancelled'], [$broken->fresh()->status, $plain->fresh()->status]);
    }

    public function test_a_bulk_status_change_to_cancelled_follows_the_rule(): void
    {
        $b = $this->takenDeposit();
        $this->refundOk($b->stripe_payment_intent_id);

        $this->asStaff()->postJson('/api/v1/admin/service-bookings/bulk', ['ids' => [$b->id], 'action' => 'mark_status', 'value' => 'cancelled'])
            ->assertOk()->assertJsonMissingPath('failed');
        $this->assertSame(['cancelled', 'refunded'], [$b->fresh()->status, $b->fresh()->payment_status]);
    }
}
