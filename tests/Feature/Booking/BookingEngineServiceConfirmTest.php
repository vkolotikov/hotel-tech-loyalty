<?php

namespace Tests\Feature\Booking;

use App\Services\BookingEngineService;
use App\Services\SmoobuClient;
use Database\Factories\BookingHoldFactory;
use Database\Factories\BookingIdempotencyKeyFactory;
use Database\Factories\BookingMirrorFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Mockery;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * BookingEngineService::confirm() pre-flight contract tests.
 *
 * confirm() is the 890-line method audit'd as critical #4 — the
 * Forrest Glamp incident site. This class deliberately covers only
 * the PRE-FLIGHT branches that short-circuit before the DB
 * transaction body runs (Smoobu createReservation, advisory lock,
 * inventory recheck, price element persistence). Each branch here
 * exercises a clear contract the controller layer depends on:
 *
 *   1. Idempotency replay — caller retried with the same key →
 *      returns the cached response_json with replayed=true. Used
 *      every time the widget retries /confirm on flaky network.
 *
 *   2. Orphan-recovery via Stripe PaymentIntent — Stripe charged
 *      but /confirm crashed mid-write. Widget retries; confirm()
 *      finds the existing mirror by stripe_payment_intent_id and
 *      returns a response shape that lets the widget complete
 *      without double-creating or double-charging.
 *
 *   3. Hold not found — caller sent a bogus or never-issued hold
 *      token. confirm() throws "Hold expired or not found".
 *
 *   4. Hold expired — caller sent a valid but past-deadline token
 *      (sat too long in the Stripe Elements step). confirm()
 *      throws the same "Hold expired or not found" message so the
 *      widget restarts the quote flow.
 *
 * Why this is enough for a first pass: the four branches above are
 * the controller's contract for confirm() — every other downstream
 * branch sits behind these checks. Future test classes can layer
 * on Smoobu happy-path / advisory-lock contention / combo splits
 * once the schema + Smoobu-mocking patterns shipped here are
 * established. CRITICAL constraint from CLAUDE.md feedback: do
 * not break the live Smoobu integration — every Smoobu touchpoint
 * in this file is Mockery-mocked and never makes a real HTTP call.
 */
class BookingEngineServiceConfirmTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private BookingEngineService $service;
    private $smoobu;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpBookingConfirmSchema();

        // BookingEngineService's constructor takes only SmoobuClient.
        // Other downstream collaborators (Stripe, Loyalty, Availability)
        // are resolved via app() or called as method args. Every test
        // in this class short-circuits BEFORE the Smoobu surface is
        // touched, so a strict mock with no expectations + the CLAUDE
        // .md "don't break Smoobu" constraint hold.
        $this->smoobu  = Mockery::mock(SmoobuClient::class);
        $this->service = new BookingEngineService($this->smoobu);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        Mockery::close();
        parent::tearDown();
    }

    public function test_idempotency_replay_returns_cached_response_when_key_matches_valid_row(): void
    {
        // Widget retried /confirm with the same idempotency key.
        // confirm() must short-circuit BEFORE the hold lookup +
        // transaction and return the cached response_json with
        // replayed=true. No Smoobu call, no mirror create.
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $cached = [
            'reservation_id'    => 'SM-1234567',
            'booking_reference' => 'BKPREV01',
            'mirror_id'         => 42,
            'gross_total'       => 250.00,
            'currency'          => 'EUR',
        ];
        $idemKey = 'idem_test_replay_key_001';
        BookingIdempotencyKeyFactory::new()
            ->withKey($idemKey)
            ->withResponse($cached)
            ->create();

        $result = $this->service->confirm(
            data: ['hold_token' => 'irrelevant — should not be looked up'],
            idempotencyKey: $idemKey,
        );

        $this->assertTrue($result['replayed'] ?? false,
            'Replayed cache hit must stamp replayed=true on the response.');
        $this->assertSame('SM-1234567', $result['reservation_id'] ?? null,
            'Replayed response must mirror the cached response_json.');
        $this->assertSame('BKPREV01', $result['booking_reference'] ?? null);
        // Use loose equality on the float — the response_json round-trip
        // through Eloquent's array cast can normalise 250.00 → 250 (int)
        // depending on JSON-decode flags. Either is correct.
        $this->assertEquals(250.00, $result['gross_total'] ?? null);

        // The mocks were never set up with expectations, so any call
        // to them would fail. Reaching this assertion proves none of
        // Smoobu / Stripe / Loyalty / Availability were touched.
        $this->assertTrue(true);
    }

    public function test_idempotency_expired_row_does_not_short_circuit(): void
    {
        // Edge: an EXPIRED idempotency row (isValid()=false) must NOT
        // satisfy the pre-flight gate. confirm() must fall through to
        // the hold lookup, which then throws because no hold exists
        // — the canonical "expired idempotency window" behaviour.
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $idemKey = 'idem_test_expired_key';
        BookingIdempotencyKeyFactory::new()
            ->withKey($idemKey)
            ->expired()
            ->create();

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Hold expired or not found');

        $this->service->confirm(
            data: ['hold_token' => 'no_such_token'],
            idempotencyKey: $idemKey,
        );
    }

    public function test_orphan_recovery_returns_existing_mirror_shape_when_payment_intent_matches(): void
    {
        // Stripe webhook + the /confirm endpoint both got the same PI.
        // Widget retried /confirm AFTER the prior call already created
        // a BookingMirror with the PI stamped on it. confirm() must
        // look up by stripe_payment_intent_id and short-circuit with
        // the existing row's response shape — NOT throw, NOT create
        // a second mirror. Closes the double-charge gap.
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $piId = 'pi_test_orphan_recovery_001';
        $existing = BookingMirrorFactory::new()->create([
            'reservation_id'           => 'SM-7654321',
            'booking_reference'        => 'BKORPHAN1',
            'arrival_date'             => '2026-07-01',
            'departure_date'           => '2026-07-04',
            'price_total'              => 540.00,
            'stripe_payment_intent_id' => $piId,
            'internal_status'          => 'confirmed',
        ]);

        $result = $this->service->confirm(
            data: [
                'hold_token'        => 'doesnt_matter_short_circuits_first',
                'payment_intent_id' => $piId,
            ],
        );

        $this->assertTrue($result['replayed'] ?? false,
            'Orphan-recovery hit must stamp replayed=true.');
        $this->assertSame('payment_intent', $result['replay_source'] ?? null,
            'Orphan recovery must label its replay_source for ops visibility.');
        $this->assertSame('SM-7654321', $result['reservation_id'] ?? null);
        $this->assertSame('BKORPHAN1', $result['booking_reference'] ?? null);
        $this->assertSame($existing->id, $result['mirror_id'] ?? null,
            'Returned mirror_id must match the orphan-recovered row.');
        $this->assertEquals(540.00, $result['gross_total'] ?? null);
        $this->assertTrue($result['pms_synced'] ?? false,
            'internal_status=confirmed must surface as pms_synced=true so the widget shows the right state.');
    }

    public function test_orphan_recovery_surfaces_pending_pms_sync_as_pms_synced_false(): void
    {
        // Subtle invariant: a mirror with internal_status=pending_pms_sync
        // means "Stripe paid + we have a local mirror, but Smoobu hasn't
        // accepted it yet". The widget needs pms_synced=false so it can
        // surface "your booking will be in Smoobu shortly" copy instead
        // of claiming the reservation is fully synced.
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $piId = 'pi_test_pending_pms_001';
        BookingMirrorFactory::new()->create([
            'stripe_payment_intent_id' => $piId,
            'internal_status'          => 'pending_pms_sync',
        ]);

        $result = $this->service->confirm(
            data: ['hold_token' => 'irrelevant', 'payment_intent_id' => $piId],
        );

        $this->assertTrue($result['replayed'] ?? false);
        $this->assertFalse($result['pms_synced'] ?? null,
            'pending_pms_sync must surface as pms_synced=false to drive widget copy.');
    }

    public function test_missing_hold_token_throws_hold_expired_or_not_found(): void
    {
        // No idempotency key, no PI orphan hit — confirm() falls through
        // to the hold lookup, which finds nothing. Must throw with the
        // canonical user-facing message so the widget can restart the
        // quote flow cleanly.
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Hold expired or not found');

        $this->service->confirm(data: ['hold_token' => 'never_issued']);
    }

    public function test_expired_hold_throws_same_error_as_missing_hold(): void
    {
        // Hold exists but expires_at is in the past. isActive() returns
        // false (status=active but past deadline). confirm() must reject
        // with the SAME message as missing-hold so the widget UX is
        // identical — guests don't need a separate "your timer ran out"
        // surface, the "restart quote" CTA handles both.
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $token = 'hold_test_expired_token';
        BookingHoldFactory::new()->withToken($token)->expired()->create();

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Hold expired or not found');

        $this->service->confirm(data: ['hold_token' => $token]);
    }

    public function test_consumed_hold_throws_same_error_as_missing_hold(): void
    {
        // Hold was consumed by an earlier successful confirm() — caller
        // is trying to re-confirm an already-used token. isActive()
        // returns false (status=consumed regardless of expires_at).
        // Must throw the same canonical message.
        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        $token = 'hold_test_consumed_token';
        BookingHoldFactory::new()->withToken($token)->consumed()->create();

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Hold expired or not found');

        $this->service->confirm(data: ['hold_token' => $token]);
    }

    public function test_orphan_recovery_is_tenant_scoped(): void
    {
        // Critical multi-tenant invariant: orphan-recovery's PI lookup
        // MUST be scoped to the current org. Without this, a request
        // from org B carrying a colliding (or guessed) PI value would
        // happily replay org A's reservation — a cross-tenant data
        // leak masquerading as a happy-path retry.
        //
        // We seed a mirror in org A. We bind org B's context. We hit
        // confirm() with the same PI. Expected: orphan path doesn't
        // fire (because org B has no matching mirror); confirm() falls
        // through to the hold lookup and throws — exactly as if the
        // mirror didn't exist at all.
        $orgA = OrganizationFactory::new()->create();
        $orgB = OrganizationFactory::new()->create();

        $piId = 'pi_test_cross_tenant_leak';
        app()->instance('current_organization_id', $orgA->id);
        BookingMirrorFactory::new()->create([
            'stripe_payment_intent_id' => $piId,
            'reservation_id'           => 'SM-LEAK',
        ]);

        // Switch context to org B and try the same PI.
        app()->forgetInstance('current_organization_id');
        app()->instance('current_organization_id', $orgB->id);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Hold expired or not found');

        $this->service->confirm(
            data: ['hold_token' => 'no_hold_for_org_b', 'payment_intent_id' => $piId],
        );
    }
}
