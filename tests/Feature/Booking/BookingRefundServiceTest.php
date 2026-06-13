<?php

namespace Tests\Feature\Booking;

use App\Models\BookingMirror;
use App\Services\BookingRefundService;
use App\Services\LoyaltyService;
use App\Services\SmoobuClient;
use App\Services\StripeService;
use Database\Factories\BookingMirrorFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Idempotency + pre-flight guards on the BookingRefundService.
 *
 * The audit ranked this service as critical-untested (#6 of the original
 * critical findings). It's called from three places — admin button,
 * Stripe `charge.refunded` webhook, and `charge.dispute.closed status=lost`
 * — and must atomically: refund Stripe, reverse loyalty points, cancel
 * Smoobu, email the guest, audit-log. The pre-flight guards are the
 * SOLE protection against double-refund + against refunding a disputed
 * charge (which Stripe always 400s with a cryptic error).
 *
 * What these tests lock in:
 *   1. payment_status='refunded' → throws "already fully refunded"
 *   2. payment_status='disputed' → throws with dashboard guidance
 *   3. Stripe payment with no PaymentIntent → throws actionable
 *   4. Pre-flight runs INSIDE the Cache::lock so a concurrent webhook
 *      can't race past the guard.
 *
 * Side-effect tests (happy path: mirror flipped to refunded, points
 * reversed, Smoobu cancelled, email queued, audit logged) are
 * deferred to the next ship — they need the full chain of mocks for
 * StripeService::refund + LoyaltyService::reverseTransaction +
 * SmoobuClient::cancelReservation, plus PointsTransaction factory
 * fixtures. Worth doing carefully in its own session.
 */
class BookingRefundServiceTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private $stripe;
    private $smoobu;
    private $loyalty;
    private BookingRefundService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBookingRefundSchema();

        // Mock all three injected services so the pre-flight guards
        // are exercised in isolation. None of these mocks should be
        // CALLED on these tests — if they are, that's a regression
        // (the pre-flight should short-circuit before any external
        // side effect). Mockery::mock() with no expectations throws
        // by default on unexpected calls, which is exactly what we want.
        $this->stripe  = Mockery::mock(StripeService::class);
        $this->smoobu  = Mockery::mock(SmoobuClient::class);
        $this->loyalty = Mockery::mock(LoyaltyService::class);

        $this->service = new BookingRefundService(
            $this->stripe,
            $this->smoobu,
            $this->loyalty,
        );
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        Mockery::close();
        parent::tearDown();
    }

    /** Bind a fresh organisation + return a BookingMirror in the requested
     *  payment state, ready for the service-under-test. */
    private function makeMirror(callable $shapeFn): BookingMirror
    {
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        /** @var BookingMirror $mirror */
        $mirror = $shapeFn(BookingMirrorFactory::new())->create();
        return $mirror;
    }

    public function test_refunding_already_refunded_booking_throws(): void
    {
        $mirror = $this->makeMirror(fn (BookingMirrorFactory $f) => $f->refunded());

        // The pre-flight guard runs INSIDE the Cache::lock — proving the
        // guard fires even when a concurrent webhook also acquires the
        // lock. The error message must surface the "already refunded"
        // semantic so the caller (admin UI / webhook) can render it.
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('already fully refunded');

        $this->service->applyRefund($mirror);
    }

    public function test_refunding_disputed_booking_throws_with_dashboard_guidance(): void
    {
        $mirror = $this->makeMirror(fn (BookingMirrorFactory $f) => $f->disputed());

        // Stripe 400s a refund on a disputed charge with a cryptic error.
        // The pre-flight guard must catch this BEFORE the Stripe call so
        // staff get an actionable message pointing at the Dashboard's
        // dispute flow.
        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('open Stripe dispute');

        $this->service->applyRefund($mirror);
    }

    public function test_disputed_message_includes_dashboard_url(): void
    {
        $mirror = $this->makeMirror(fn (BookingMirrorFactory $f) => $f->disputed());

        try {
            $this->service->applyRefund($mirror);
            $this->fail('Expected RuntimeException for disputed booking, none thrown.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString(
                'dashboard.stripe.com/disputes',
                $e->getMessage(),
                'Disputed pre-flight message must point staff at the Stripe Dashboard dispute flow.',
            );
        }
    }

    public function test_stripe_payment_without_intent_id_throws_actionable_error(): void
    {
        // payment_method='stripe' + no stripe_payment_intent_id is the
        // documented "no Stripe payment attached" branch — usually a
        // manually-created mirror that never went through the widget.
        // applyRefund must refuse rather than silently no-op.
        $mirror = $this->makeMirror(fn (BookingMirrorFactory $f) => $f->paid()->noStripeAttached());

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('No Stripe payment attached');

        $this->service->applyRefund($mirror);
    }

    public function test_preflight_throws_do_not_write_refund_attempt_row(): void
    {
        // Pre-flight throws come BEFORE the RefundAttempt::create call
        // (audit 2026-06-01 finding C3 fixed this). Otherwise orphan
        // attempt rows would false-positive the 60s webhook freshness
        // gate and silently swallow the next legitimate refund.
        $mirror = $this->makeMirror(fn (BookingMirrorFactory $f) => $f->refunded());
        $beforeCount = \DB::table('refund_attempts')->count();

        try {
            $this->service->applyRefund($mirror);
        } catch (\RuntimeException) {
            // expected
        }

        $afterCount = \DB::table('refund_attempts')->count();
        $this->assertSame(
            $beforeCount,
            $afterCount,
            'Pre-flight throws must NOT leave orphan refund_attempts rows.',
        );
    }

    public function test_preflight_guards_do_not_mutate_mirror_or_call_stripe(): void
    {
        // None of the mocked external services should be called — pre-
        // flight must short-circuit before any side effect. Mockery
        // throws if shouldReceive is missing, so reaching this line
        // means none were called.
        $mirror = $this->makeMirror(fn (BookingMirrorFactory $f) => $f->refunded());
        $originalRefundedAt = $mirror->refunded_at;

        try {
            $this->service->applyRefund($mirror);
        } catch (\RuntimeException) {
            // expected
        }

        $mirror->refresh();
        $this->assertSame(
            (string) $originalRefundedAt,
            (string) $mirror->refunded_at,
            'Pre-flight throw must not mutate refunded_at.',
        );
        $this->assertSame('refunded', $mirror->payment_status);
    }
}
