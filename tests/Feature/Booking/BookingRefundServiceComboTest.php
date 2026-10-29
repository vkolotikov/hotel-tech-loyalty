<?php

namespace Tests\Feature\Booking;

use App\Mail\BookingRefundMail;
use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Models\PointsTransaction;
use App\Services\BookingRefundService;
use App\Services\LoyaltyService;
use App\Services\SmoobuClient;
use App\Services\StripeService;
use Database\Factories\BookingMirrorFactory;
use Database\Factories\OrganizationFactory;
use Database\Factories\PointsTransactionFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Mail;
use Mockery;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks the combo-aware refund contract — the June 1 2026 audit
 * fix (finding 10) on top of BookingRefundService::applyRefund.
 *
 * Why this matters:
 *   - Combo bookings (May 27 ship) share ONE Stripe PaymentIntent
 *     across N rooms via a shared booking_group_id. One refund =
 *     all N rooms must be reversed in lockstep.
 *   - Pre-fix, applyRefund touched ONLY the ->first() mirror in
 *     the group. The other N-1 rooms stayed payment_status='paid'
 *     with live Smoobu reservations after a "full refund" — guest
 *     received money back, but the hotel still showed N-1 rooms
 *     booked on the calendar, and loyalty points stayed credited.
 *   - The fix walks every sibling sharing booking_group_id, applies
 *     mirror-state + Smoobu-cancel + points-reversal per sibling,
 *     but issues exactly ONE Stripe refund + ONE confirmation email
 *     (the combined PI is single, the guest is single).
 *
 * Sister to BookingRefundServiceTest (single-mirror happy path +
 * pre-flight guards). This file focuses exclusively on
 * booking_group_id sibling walking.
 *
 * Smoobu + Stripe are fully Mockery-mocked; zero real API calls.
 */
class BookingRefundServiceComboTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private $stripe;
    private $smoobu;
    private $loyalty;
    private BookingRefundService $service;
    private int $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpLoyaltySchema(); // includes booking_mirror + brands + loyalty_*

        $org = OrganizationFactory::new()->create();
        $this->orgId = $org->id;
        app()->instance('current_organization_id', $org->id);

        $this->stripe  = Mockery::mock(StripeService::class);
        $this->smoobu  = Mockery::mock(SmoobuClient::class);
        $this->loyalty = Mockery::mock(LoyaltyService::class);

        $this->service = new BookingRefundService(
            $this->stripe,
            $this->smoobu,
            $this->loyalty,
        );

        Mail::fake();
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        Mockery::close();
        parent::tearDown();
    }

    /**
     * Seed N mirrors sharing the same booking_group_id and ONE PI. Release 5:
     * the first (the lead) carries the PI and the others none — production's
     * `booking_mirror_org_pi_unique` (now in the test schema too) refuses a
     * second row with it, so every room carrying it was never a real shape.
     */
    private function makeComboMirrors(int $count, string $groupId, string $piId, float $perRoomPrice = 250.0): array
    {
        $mirrors = [];
        for ($i = 0; $i < $count; $i++) {
            $mirrors[] = BookingMirrorFactory::new()->paid()->create([
                'booking_group_id'          => $groupId,
                'stripe_payment_intent_id'  => $i === 0 ? $piId : null,
                'reservation_id'            => 'SM-COMBO-' . $i . '-' . uniqid(),
                'price_total'               => $perRoomPrice,
                'guest_email'               => 'combo-guest@example.test',
            ]);
        }
        return $mirrors;
    }

    /**
     * A member as production's schema takes one (this file runs on
     * PostgreSQL too): a user, a tier, and the member's NOT NULL
     * `qr_code_token` / `referral_code` — the factories carry test-only
     * columns (`qualification_model`) PostgreSQL does not have.
     */
    private function loyaltyMember(int $points): \App\Models\LoyaltyMember
    {
        $tier = \App\Models\LoyaltyTier::create(['organization_id' => $this->orgId, 'name' => 'Bronze', 'min_points' => 0, 'is_active' => true]);
        $user = \App\Models\User::create(['name' => 'Combo Guest', 'email' => 'combo_' . uniqid('', true) . '@example.test', 'password' => bcrypt('secret-pass-1'), 'user_type' => 'member', 'organization_id' => $this->orgId]);
        $has = fn (string $c) => \Illuminate\Support\Facades\Schema::hasColumn('loyalty_members', $c);

        return \App\Models\LoyaltyMember::create(['organization_id' => $this->orgId, 'user_id' => $user->id, 'tier_id' => $tier->id, 'member_number' => 'M-' . strtoupper(uniqid()), 'current_points' => $points, 'lifetime_points' => $points, 'is_active' => true]
            + ($has('qr_code_token') ? ['qr_code_token' => bin2hex(random_bytes(16))] : [])
            + ($has('referral_code') ? ['referral_code' => strtoupper(bin2hex(random_bytes(4)))] : []));
    }

    private function fakeStripeRefund(string $id): \Stripe\Refund
    {
        return \Stripe\Refund::constructFrom([
            'id'       => $id,
            'object'   => 'refund',
            'status'   => 'succeeded',
            'currency' => 'eur',
        ]);
    }

    /* ─── The core invariant: walk all siblings on combo refund ─── */

    public function test_full_combo_refund_walks_every_sibling_mirror(): void
    {
        // 2 rooms in one combo. Pre-fix only the ->first() mirror
        // flipped to 'refunded'; the 2nd stayed 'paid'.
        $groupId = (string) \Illuminate\Support\Str::uuid();
        $piId = 'pi_test_combo_walk_' . uniqid();
        [$a, $b] = $this->makeComboMirrors(2, $groupId, $piId);

        $this->stripe->shouldReceive('refund')
            ->once() // exactly ONE Stripe refund for the whole combo
            ->andReturn($this->fakeStripeRefund('re_combo_walk_001'));
        $this->smoobu->shouldReceive('cancelReservation')
            ->twice() // per-sibling Smoobu cancel
            ->andReturn([]);
        $this->loyalty->shouldReceive('reverseTransaction')->andReturn(new PointsTransaction());

        $outcome = $this->service->applyRefund($a);

        // BOTH mirrors must end up flipped — that's the contract.
        $a->refresh();
        $b->refresh();
        $this->assertSame('refunded', $a->payment_status,
            'Refund-trigger mirror MUST flip to refunded.');
        $this->assertSame('refunded', $b->payment_status,
            'CRITICAL: sibling mirror sharing booking_group_id MUST also flip to refunded (June 1 audit finding 10).',
        );
    }

    public function test_combo_refund_issues_only_one_stripe_refund(): void
    {
        // The combo has ONE PaymentIntent. Issuing N Stripe refunds
        // would over-refund the guest. The ->once() expectation
        // above already proves this for 2 rooms; verify with 3
        // siblings to lock the invariant scales.
        $groupId = (string) \Illuminate\Support\Str::uuid();
        $piId = 'pi_test_combo_single_refund_' . uniqid();
        $mirrors = $this->makeComboMirrors(3, $groupId, $piId);

        $this->stripe->shouldReceive('refund')
            ->once() // STILL exactly once for 3 rooms — locks the invariant
            ->andReturn($this->fakeStripeRefund('re_combo_single_001'));
        $this->smoobu->shouldReceive('cancelReservation')->times(3)->andReturn([]);
        $this->loyalty->shouldReceive('reverseTransaction')->andReturn(new PointsTransaction());

        $this->service->applyRefund($mirrors[0]);

        // Sanity: all 3 mirrors flipped to refunded
        foreach ($mirrors as $m) {
            $m->refresh();
            $this->assertSame('refunded', $m->payment_status);
        }
    }

    public function test_combo_refund_cancels_smoobu_per_sibling(): void
    {
        // Each room in a combo has its OWN Smoobu reservation_id —
        // cancelling one wouldn't free the other rooms on the
        // hotel's calendar. Lock that cancelReservation is called
        // once per sibling with the matching id.
        $groupId = (string) \Illuminate\Support\Str::uuid();
        $piId = 'pi_test_combo_pms_' . uniqid();
        [$a, $b] = $this->makeComboMirrors(2, $groupId, $piId);

        $this->stripe->shouldReceive('refund')
            ->once()
            ->andReturn($this->fakeStripeRefund('re_combo_pms_001'));

        // Both reservation_ids must be cancelled — order doesn't matter.
        $cancelledIds = [];
        $this->smoobu->shouldReceive('cancelReservation')
            ->twice()
            ->andReturnUsing(function (string $resId) use (&$cancelledIds) {
                $cancelledIds[] = $resId;
                return [];
            });

        $this->loyalty->shouldReceive('reverseTransaction')->andReturn(new PointsTransaction());

        $this->service->applyRefund($a);

        sort($cancelledIds);
        $expected = [$a->reservation_id, $b->reservation_id];
        sort($expected);
        $this->assertSame($expected, $cancelledIds,
            'Each sibling reservation_id MUST be cancelled in Smoobu.');
    }

    /* ─── Points reversal per sibling ─── */

    public function test_combo_refund_reverses_loyalty_points_per_sibling(): void
    {
        // Each mirror has its own linked PointsTransaction (rooms
        // earn separately at booking time). Combo refund must
        // reverse ALL of them.
        $groupId = (string) \Illuminate\Support\Str::uuid();
        $piId = 'pi_test_combo_loyalty_' . uniqid();
        [$a, $b] = $this->makeComboMirrors(2, $groupId, $piId);

        $member = $this->loyaltyMember(300);

        // 2 earn rows, one per mirror.
        PointsTransactionFactory::new()
            ->forMember($member->id)
            ->withReferenceTo('booking_mirror', $a->id)
            ->state(['points' => 100])
            ->create();
        PointsTransactionFactory::new()
            ->forMember($member->id)
            ->withReferenceTo('booking_mirror', $b->id)
            ->state(['points' => 200])
            ->create();

        $this->stripe->shouldReceive('refund')
            ->once()
            ->andReturn($this->fakeStripeRefund('re_combo_loyalty_001'));
        $this->smoobu->shouldReceive('cancelReservation')->twice()->andReturn([]);

        // reverseTransaction called once per linked PointsTransaction
        // — two siblings, two linked earns, two reversal calls.
        $this->loyalty->shouldReceive('reverseTransaction')
            ->twice()
            ->andReturn(new PointsTransaction());

        $outcome = $this->service->applyRefund($a);

        $this->assertSame(300, $outcome['reversed_points'],
            'CRITICAL: reversed_points MUST sum across all sibling mirrors (100 + 200 = 300). Pre-fix only the first mirror\'s 100 reversed.');
    }

    /* ─── Single email per refund event ─── */

    public function test_combo_refund_sends_exactly_one_email(): void
    {
        // ONE Stripe PI = ONE guest refund = ONE email. Sending N
        // emails for N rooms in a combo would spam the guest with
        // identical refund confirmations.
        $groupId = (string) \Illuminate\Support\Str::uuid();
        $piId = 'pi_test_combo_email_' . uniqid();
        [$a, $b] = $this->makeComboMirrors(2, $groupId, $piId);

        $this->stripe->shouldReceive('refund')->once()->andReturn($this->fakeStripeRefund('re_combo_email_001'));
        $this->smoobu->shouldReceive('cancelReservation')->twice()->andReturn([]);
        $this->loyalty->shouldReceive('reverseTransaction')->andReturn(new PointsTransaction());

        $this->service->applyRefund($a);

        Mail::assertQueuedCount(1);
        Mail::assertQueued(BookingRefundMail::class, fn ($m) => true);
    }

    /* ─── Already-refunded siblings excluded ─── */

    public function test_combo_refund_skips_already_refunded_siblings(): void
    {
        // The sibling discovery query filters out mirrors already
        // in 'refunded' or 'cancelled' state. A re-fire of the
        // refund (defensive double-click, late webhook) must not
        // re-process siblings already done.
        $groupId = (string) \Illuminate\Support\Str::uuid();
        $piId = 'pi_test_combo_skip_done_' . uniqid();
        [$a, $b] = $this->makeComboMirrors(2, $groupId, $piId);

        // Manually mark B as already refunded.
        $b->update(['payment_status' => 'refunded']);

        // Stripe refund still happens for A (it's the trigger
        // mirror's primary path) — but Smoobu cancel runs only
        // for A (the only un-refunded sibling).
        $this->stripe->shouldReceive('refund')->once()->andReturn($this->fakeStripeRefund('re_combo_skip_001'));
        $this->smoobu->shouldReceive('cancelReservation')
            ->once() // ONLY for the still-paid sibling
            ->andReturn([]);
        $this->loyalty->shouldReceive('reverseTransaction')->andReturn(new PointsTransaction());

        $this->service->applyRefund($a);

        $a->refresh();
        $b->refresh();
        $this->assertSame('refunded', $a->payment_status);
        $this->assertSame('refunded', $b->payment_status,
            'Already-refunded sibling stays refunded (no double-process).');
    }

    /* ─── Audit-log sibling_count metric ─── */

    public function test_combo_refund_audit_log_records_sibling_count(): void
    {
        // The audit row includes `sibling_count` so ops can spot
        // combo refunds vs single-mirror refunds in the log.
        $groupId = (string) \Illuminate\Support\Str::uuid();
        $piId = 'pi_test_combo_audit_' . uniqid();
        $mirrors = $this->makeComboMirrors(3, $groupId, $piId);

        $this->stripe->shouldReceive('refund')->once()->andReturn($this->fakeStripeRefund('re_combo_audit_001'));
        $this->smoobu->shouldReceive('cancelReservation')->times(3)->andReturn([]);
        $this->loyalty->shouldReceive('reverseTransaction')->andReturn(new PointsTransaction());

        $this->service->applyRefund($mirrors[0]);

        // Inspect the booking_refunded audit row.
        $auditRow = AuditLog::where('action', 'booking_refunded')
            ->orderByDesc('id')
            ->first();
        $this->assertNotNull($auditRow);
        $newValues = is_string($auditRow->new_values) ? json_decode($auditRow->new_values, true) : $auditRow->new_values;
        $this->assertSame(3, (int) $newValues['sibling_count'],
            'sibling_count MUST reflect the actual combo size — gives ops a forensic signal.');
    }

    /* ─── Release 5: the payment is the lead room's ─── */

    public function test_a_refund_asked_on_a_room_that_carries_no_payment_is_the_lead_rooms(): void
    {
        // The admin's "Issue refund" on the second room of a combination:
        // that room carries no intent (the lead does), so the refund — its
        // lock, its attempt row, the one Stripe call — is the lead's, and
        // every room is recorded.
        $groupId = (string) \Illuminate\Support\Str::uuid();
        $piId = 'pi_test_combo_follower_' . uniqid();
        [$a, $b] = $this->makeComboMirrors(2, $groupId, $piId);

        $this->stripe->shouldReceive('refund')->once()->with($piId, null, null, \Mockery::any(), \Mockery::any(), \Mockery::any())->andReturn($this->fakeStripeRefund('re_follower_001'));
        $this->smoobu->shouldReceive('cancelReservation')->twice()->andReturn([]);
        $this->loyalty->shouldReceive('reverseTransaction')->andReturn(new PointsTransaction());

        $outcome = $this->service->applyRefund($b);

        $this->assertTrue($outcome['is_full']);
        foreach ([$a, $b] as $m) {
            $m->refresh();
            $this->assertSame('refunded', $m->payment_status);
            $this->assertEquals(250.0, (float) $m->refunded_amount, 'each room its own share');
        }
        $attempt = \App\Models\RefundAttempt::query()->sole();
        $this->assertSame($a->id, (int) $attempt->mirror_id, "the attempt row is the lead's — the charge.refunded webhook's freshness check finds it there");
        $this->assertSame($piId, $attempt->payment_intent_id);
        Mail::assertQueued(BookingRefundMail::class, fn (BookingRefundMail $m) => $m->refundAmount === 500.0 && str_contains($m->bookingReference, ', '));
    }

    public function test_a_partial_refund_of_a_combination_is_partial_on_every_room(): void
    {
        $groupId = (string) \Illuminate\Support\Str::uuid();
        $piId = 'pi_test_combo_partial_' . uniqid();
        [$a, $b] = $this->makeComboMirrors(2, $groupId, $piId);

        $this->stripe->shouldReceive('refund')->once()->with($piId, 300.0, null, \Mockery::any(), \Mockery::any(), \Mockery::any())->andReturn($this->fakeStripeRefund('re_partial_001'));
        $this->smoobu->shouldNotReceive('cancelReservation');
        $this->loyalty->shouldNotReceive('reverseTransaction');

        $outcome = $this->service->applyRefund($a, 300.0);

        $this->assertFalse($outcome['is_full'], '300 of the 500 payment is partial, though it covers the lead room\'s 250');
        foreach ([$a, $b] as $m) {
            $m->refresh();
            $this->assertSame('partially_refunded', $m->payment_status);
            $this->assertEquals(150.0, (float) $m->refunded_amount);
        }
    }

    /* ─── Single-mirror path unchanged ─── */

    public function test_single_mirror_without_booking_group_id_only_refunds_itself(): void
    {
        // Defensive: the combo-walking code path must NOT engage
        // when booking_group_id IS NULL. A solo booking refund
        // continues to behave exactly as before — refunds itself,
        // nothing else.
        $solo = BookingMirrorFactory::new()->paid()->create([
            'booking_group_id'          => null,
            'stripe_payment_intent_id'  => 'pi_test_solo_' . uniqid(),
            'reservation_id'            => 'SM-SOLO-' . uniqid(),
            'price_total'               => 200.0,
        ]);

        // A "noise" mirror in another (unrelated) combo with a
        // different group_id must NOT be touched.
        $noiseGroup = (string) \Illuminate\Support\Str::uuid();
        $noiseMirror = BookingMirrorFactory::new()->paid()->create([
            'booking_group_id' => $noiseGroup,
            'reservation_id'   => 'SM-NOISE-' . uniqid(),
        ]);

        $this->stripe->shouldReceive('refund')->once()->andReturn($this->fakeStripeRefund('re_solo_001'));
        $this->smoobu->shouldReceive('cancelReservation')->once()->andReturn([]);
        $this->loyalty->shouldReceive('reverseTransaction')->andReturn(new PointsTransaction());

        $this->service->applyRefund($solo);

        $solo->refresh();
        $noiseMirror->refresh();
        $this->assertSame('refunded', $solo->payment_status);
        $this->assertSame('paid', $noiseMirror->payment_status,
            'Unrelated mirrors (different / null booking_group_id) MUST NOT be touched.');
    }
}
