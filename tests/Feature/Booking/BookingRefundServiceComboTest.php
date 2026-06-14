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

    /** Seed N mirrors sharing the same booking_group_id + PI. */
    private function makeComboMirrors(int $count, string $groupId, string $piId, float $perRoomPrice = 250.0): array
    {
        $mirrors = [];
        for ($i = 0; $i < $count; $i++) {
            $mirrors[] = BookingMirrorFactory::new()->paid()->create([
                'booking_group_id'          => $groupId,
                'stripe_payment_intent_id'  => $piId,
                'reservation_id'            => 'SM-COMBO-' . $i . '-' . uniqid(),
                'price_total'               => $perRoomPrice,
                'guest_email'               => 'combo-guest@example.test',
            ]);
        }
        return $mirrors;
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

        $tier = LoyaltyTierFactory::new()->bronze()->create();
        $member = LoyaltyMemberFactory::new()->inTier($tier->id)->withPoints(300)->create();

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
