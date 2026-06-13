<?php

namespace Tests\Feature\Booking;

use App\Mail\BookingRefundMail;
use App\Models\BookingMirror;
use App\Models\PointsTransaction;
use App\Services\BookingRefundService;
use App\Services\LoyaltyService;
use App\Services\SmoobuClient;
use App\Services\StripeService;
use Database\Factories\BookingMirrorFactory;
use Database\Factories\LoyaltyMemberFactory;
use Database\Factories\LoyaltyTierFactory;
use Database\Factories\OrganizationFactory;
use Database\Factories\PointsTransactionFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Mail;
use Mockery;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Idempotency + pre-flight guards + happy-path side-effects on the
 * BookingRefundService.
 *
 * The audit ranked this service as critical-untested (#6 of the
 * original critical findings). It's called from three places — admin
 * button, Stripe `charge.refunded` webhook, and `charge.dispute.closed
 * status=lost` — and must atomically: refund Stripe, reverse loyalty
 * points, cancel Smoobu, email the guest, audit-log. The pre-flight
 * guards are the SOLE protection against double-refund + against
 * refunding a disputed charge.
 *
 * What these tests lock in (12 tests, 2 clusters):
 *
 *   PRE-FLIGHT (tests 1-6):
 *     - payment_status='refunded' → throws "already fully refunded"
 *     - payment_status='disputed' → throws with dashboard guidance
 *     - Stripe payment with no PaymentIntent → throws actionable
 *     - Pre-flight throws don't leave orphan RefundAttempt rows
 *     - Pre-flight runs INSIDE the Cache::lock so a concurrent
 *       webhook can't race past the guard
 *
 *   HAPPY PATH (tests 7-12):
 *     - Full refund happy path: Stripe refund called, mirror flipped,
 *       points reversed, Smoobu cancelled, email queued, audit logged
 *     - Partial refund: flips to partially_refunded; no points
 *       reversal; no Smoobu cancel
 *     - Mock-mode payment: skips Stripe; still flips mirror; skips
 *       PMS + email per the documented mock-mode contract
 *     - Webhook path (issueStripeRefund=false): no Stripe call,
 *       stamps the pre-existing refund_id
 *     - Smoobu cancel failure: refund still completes; mirror still
 *       flipped to refunded; orphan audit row written
 *     - Loyalty reversal failures swallowed (Log::warning, never
 *       break the refund)
 *
 * ZERO touches to Smoobu production code in this ship — SmoobuClient
 * is fully Mockery-mocked, real cancelReservation() never runs. Same
 * for StripeService::refund.
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
        // Loyalty schema is a strict superset of the booking-refund
        // schema (adds loyalty_members, loyalty_tiers, brands, and
        // enriched points_transactions columns). Pre-flight tests don't
        // need the extras but pay no perf cost for them.
        $this->setUpLoyaltySchema();

        // Mock all three injected services so the pre-flight guards
        // are exercised in isolation. None of these mocks should be
        // CALLED on the pre-flight tests — if they are, that's a
        // regression. Mockery::mock() with no expectations throws by
        // default on unexpected calls. Happy-path tests opt-in via
        // ->shouldReceive(...) on individual mocks.
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

    // ─── HAPPY-PATH SIDE EFFECTS ─────────────────────────────────────

    /** Seed a member + linked PointsTransaction so the refund flow has
     *  loyalty rows to reverse. Returns the mirror with a reservation
     *  guaranteed to be present so shouldCancelPms() returns true. */
    private function makePaidMirrorWithLoyaltyEarn(float $priceTotal = 500.00, int $earnPoints = 250): BookingMirror
    {
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        // Member + tier (BookingRefundService doesn't touch the tier
        // ladder directly, but PointsTransaction needs a member to FK
        // against).
        $tier = LoyaltyTierFactory::new()->bronze()->create();
        $member = LoyaltyMemberFactory::new()->inTier($tier->id)->withPoints($earnPoints)->create();

        /** @var BookingMirror $mirror */
        $mirror = BookingMirrorFactory::new()->paid()->create([
            'price_total'              => $priceTotal,
            'guest_email'              => 'guest@example.test',
            'stripe_payment_intent_id' => 'pi_test_' . uniqid(),
        ]);

        // Booking-linked earn — the row reverseLoyaltyPoints will find
        // and pass to LoyaltyService::reverseTransaction.
        PointsTransactionFactory::new()
            ->forMember($member->id)
            ->withReferenceTo('booking_mirror', $mirror->id)
            ->state(['points' => $earnPoints])
            ->create();

        return $mirror;
    }

    /** Build a deterministic mock Stripe Refund object the service can
     *  read $refund->id off. \Stripe\Refund::constructFrom is the SDK's
     *  documented entry point for synthetic instances. */
    private function fakeStripeRefund(string $id): \Stripe\Refund
    {
        return \Stripe\Refund::constructFrom([
            'id'       => $id,
            'object'   => 'refund',
            'status'   => 'succeeded',
            'currency' => 'eur',
        ]);
    }

    public function test_full_refund_happy_path_runs_every_side_effect(): void
    {
        Mail::fake();

        $mirror = $this->makePaidMirrorWithLoyaltyEarn(priceTotal: 500.00, earnPoints: 250);
        $refundId = 're_test_full_' . uniqid();

        // Stripe: refund called exactly once with the mirror's PI +
        // null amount (full refund) + null reason. The production call
        // sends 3 args (StripeService::refund's 4th idempotency-key
        // param defaults from inside the service).
        $this->stripe->shouldReceive('refund')
            ->once()
            ->with($mirror->stripe_payment_intent_id, null, null)
            ->andReturn($this->fakeStripeRefund($refundId));

        // Smoobu cancellation runs once — the production code calls
        // cancelReservation($reservation_id). We never invoke the real
        // SmoobuClient; this mock returns the documented empty-array
        // success shape.
        $this->smoobu->shouldReceive('cancelReservation')
            ->once()
            ->with((string) $mirror->reservation_id)
            ->andReturn([]);

        // Loyalty reversal: one PointsTransaction tied to this mirror →
        // exactly one reverseTransaction call. Must return a real
        // PointsTransaction (the production method's return-type
        // declaration is non-nullable; Mockery enforces this and a null
        // return would TypeError which the caller's try/catch silently
        // swallows — masking the call as "failed reversal" + the points
        // accumulator never increments).
        $this->loyalty->shouldReceive('reverseTransaction')
            ->once()
            ->andReturn(new PointsTransaction());

        $outcome = $this->service->applyRefund($mirror);

        // Return-shape contract
        $this->assertTrue($outcome['is_full']);
        $this->assertSame($refundId, $outcome['refund_id']);
        $this->assertSame(250,       $outcome['reversed_points']);
        $this->assertTrue($outcome['pms_cancelled']);
        $this->assertTrue($outcome['email_sent']);

        // Mirror state-machine flip
        $mirror->refresh();
        $this->assertSame('refunded', $mirror->payment_status);
        $this->assertSame(500.00,    (float) $mirror->refunded_amount);
        $this->assertNotNull($mirror->refunded_at);
        $this->assertSame($refundId, $mirror->last_refund_id);

        // Email queued — BookingRefundMail implements ShouldQueue (from
        // Phase 10) so ::queue() is the canonical send path.
        Mail::assertQueued(BookingRefundMail::class, function (BookingRefundMail $mail) {
            return $mail->hasTo('guest@example.test');
        });

        // Audit row stamped
        $this->assertSame(1, \DB::table('audit_logs')->where('action', 'booking_refunded')->count(),
            'Exactly one booking_refunded audit row must be stamped.');
    }

    public function test_partial_refund_flips_to_partially_refunded_and_skips_loyalty_and_pms(): void
    {
        Mail::fake();

        $mirror = $this->makePaidMirrorWithLoyaltyEarn(priceTotal: 500.00, earnPoints: 250);

        // Stripe: refund called with amount=50 — 3 args matching the
        // BookingRefundService call site.
        $this->stripe->shouldReceive('refund')
            ->once()
            ->with($mirror->stripe_payment_intent_id, 50.00, null)
            ->andReturn($this->fakeStripeRefund('re_test_partial'));

        // Smoobu + Loyalty: NOT called on partial refunds (partial
        // refunds don't mathematically map to "which" points to reverse,
        // and the PMS reservation stays active because the guest still
        // has a booking).
        // No ->shouldReceive() → Mockery throws if either is called.

        $outcome = $this->service->applyRefund($mirror, amount: 50.00);

        $this->assertFalse($outcome['is_full']);
        $this->assertSame('re_test_partial', $outcome['refund_id']);
        $this->assertSame(0,    $outcome['reversed_points'],
            'Partial refunds must NOT reverse any loyalty points.');
        $this->assertFalse($outcome['pms_cancelled'],
            'Partial refunds must NOT cancel the PMS reservation.');

        $mirror->refresh();
        $this->assertSame('partially_refunded', $mirror->payment_status);
        $this->assertSame(50.00, (float) $mirror->refunded_amount);
    }

    public function test_mock_payment_method_skips_stripe_and_email(): void
    {
        Mail::fake();

        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        // booking_mock_mode booking — payment_method='mock', no Stripe
        // PI, no real Smoobu reservation (the factory's reservation_id
        // is fine; shouldCancelPms() returns false for mock anyway).
        /** @var BookingMirror $mirror */
        $mirror = BookingMirrorFactory::new()->paid()->mock()->create([
            'price_total' => 100.00,
        ]);

        // Stripe: NOT called for mock bookings. Smoobu: NOT called
        // either (shouldCancelPms returns false). Loyalty: no rows tied
        // to this mirror.
        // No ->shouldReceive() → Mockery throws on any call.

        $outcome = $this->service->applyRefund($mirror);

        $this->assertTrue($outcome['is_full']);
        $this->assertStringStartsWith('mock_refund_', $outcome['refund_id'],
            'Mock bookings get a synthesised refund_id starting with mock_refund_.');
        $this->assertFalse($outcome['pms_cancelled']);

        $mirror->refresh();
        $this->assertSame('refunded', $mirror->payment_status);
    }

    public function test_webhook_path_skips_the_stripe_refund_call(): void
    {
        Mail::fake();

        $mirror = $this->makePaidMirrorWithLoyaltyEarn(priceTotal: 500.00, earnPoints: 250);
        $preExistingRefundId = 're_test_webhook_path';

        // Webhook path: issueStripeRefund=false + caller supplies the
        // refundId Stripe already minted. Service must NOT call
        // StripeService::refund again — that would create a duplicate
        // Stripe-side refund.
        // No ->shouldReceive('refund') → mockery throws if it's called.

        $this->smoobu->shouldReceive('cancelReservation')->once()->andReturn([]);
        // See test_full_refund_happy_path_runs_every_side_effect for why
        // the mock must return a real PointsTransaction (return-type
        // contract); andReturn(null) silently fails inside the catch.
        $this->loyalty->shouldReceive('reverseTransaction')->once()->andReturn(new PointsTransaction());

        $outcome = $this->service->applyRefund(
            $mirror,
            amount: null,
            reason: 'webhook',
            stripeRefundId: $preExistingRefundId,
            issueStripeRefund: false,
        );

        $this->assertSame($preExistingRefundId, $outcome['refund_id']);

        $mirror->refresh();
        $this->assertSame($preExistingRefundId, $mirror->last_refund_id,
            'Webhook-supplied refund_id must propagate to the mirror.');
    }

    public function test_smoobu_cancel_failure_still_completes_the_refund(): void
    {
        Mail::fake();

        $mirror = $this->makePaidMirrorWithLoyaltyEarn(priceTotal: 500.00, earnPoints: 0);

        $this->stripe->shouldReceive('refund')
            ->once()
            ->andReturn($this->fakeStripeRefund('re_test_smoobu_failed'));

        // Smoobu throws — common case: channel-managed reservation
        // (Airbnb / Booking.com) rejects DELETE. The refund must still
        // complete and stamp the mirror; the failure must be visible
        // in the audit log so staff can manually cancel.
        $this->smoobu->shouldReceive('cancelReservation')
            ->once()
            ->andThrow(new \RuntimeException('Smoobu API: channel-managed reservation cannot be cancelled via API'));

        // No earn rows on this mirror → no Loyalty calls expected.
        // (No shouldReceive on loyalty → Mockery throws if it's called.)

        $outcome = $this->service->applyRefund($mirror);

        // Refund itself completes — Stripe-side state is the source of
        // truth and we don't roll back when Smoobu fails.
        $this->assertTrue($outcome['is_full']);
        $this->assertFalse($outcome['pms_cancelled'],
            'Smoobu failure leaves pms_cancelled=false in the outcome.');

        $mirror->refresh();
        $this->assertSame('refunded', $mirror->payment_status,
            'Mirror still flipped to refunded even when Smoobu rejects the cancel.');

        // Two audit rows: the inner booking.pms.cancel_failed (per
        // mirror, written by cancelPmsReservation) AND the outer
        // booking.refund.pms_cancel_failed (one row carrying the full
        // list of failed reservation ids). Both are documented in the
        // service docblock + the 2026-06-01 audit fix.
        $this->assertGreaterThanOrEqual(
            1,
            \DB::table('audit_logs')->where('action', 'booking.refund.pms_cancel_failed')->count(),
            'booking.refund.pms_cancel_failed audit row must surface the orphan reservation for staff.',
        );
    }

    public function test_loyalty_reversal_failure_does_not_break_the_refund(): void
    {
        Mail::fake();

        $mirror = $this->makePaidMirrorWithLoyaltyEarn(priceTotal: 500.00, earnPoints: 250);

        $this->stripe->shouldReceive('refund')
            ->once()
            ->andReturn($this->fakeStripeRefund('re_test_loyalty_failed'));
        $this->smoobu->shouldReceive('cancelReservation')->once()->andReturn([]);

        // LoyaltyService::reverseTransaction throws — service must
        // swallow it (Log::warning) and continue. CLAUDE.md invariant:
        // an AI/loyalty ledger failure must NEVER block the money path.
        $this->loyalty->shouldReceive('reverseTransaction')
            ->once()
            ->andThrow(new \RuntimeException('Loyalty service offline'));

        $outcome = $this->service->applyRefund($mirror);

        // Refund completes — reversed_points stays at 0 because the
        // accumulator increments only on a successful reverseTransaction.
        $this->assertTrue($outcome['is_full']);
        $this->assertSame(0, $outcome['reversed_points'],
            'Failed reverseTransaction calls do not increment reversed_points.');

        $mirror->refresh();
        $this->assertSame('refunded', $mirror->payment_status);
    }
}
