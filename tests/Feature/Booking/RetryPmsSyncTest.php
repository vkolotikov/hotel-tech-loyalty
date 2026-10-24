<?php

namespace Tests\Feature\Booking;

use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Models\Organization;
use App\Services\SmoobuClient;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Mockery;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\TestCase;

/**
 * bookings:retry-pms-sync must never undo a member's cancellation — it
 * re-reads each row before asking Smoobu and writes only while the row is
 * still waiting. A booking without a member is pushed normally,
 * unaffected by this check.
 */
class RetryPmsSyncTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpStayBookingSchema;

    private Organization $org;
    private $smoobu;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpStayBookingSchema();
        $this->org = Organization::create(['name' => 'Seaside Hotel', 'slug' => 'seaside-' . uniqid()]);
        $this->smoobu = Mockery::mock(SmoobuClient::class);
        $this->smoobu->shouldReceive('resolveDirectChannelId')->andReturn(7);
        $this->app->instance(SmoobuClient::class, $this->smoobu);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        Mockery::close();
        parent::tearDown();
    }

    private function pending(array $attrs = []): BookingMirror
    {
        static $n = 0;
        $n++;
        return BookingMirror::withoutGlobalScopes()->create(array_merge([
            'organization_id' => $this->org->id, 'reservation_id' => 'LOCAL-RETRY' . $n, 'booking_reference' => 'LOC-RETRY' . $n,
            'booking_state' => 'confirmed', 'internal_status' => 'pending_pms_sync', 'apartment_id' => '101', 'apartment_name' => 'Sea view',
            'channel_name' => 'Website', 'guest_name' => 'Ada Lovelace', 'guest_email' => 'ada@example.test',
            'arrival_date' => now()->addDays(10)->toDateString(), 'departure_date' => now()->addDays(12)->toDateString(),
            'price_total' => 200, 'pms_sync_attempts' => 0,
        ], $attrs));
    }

    private function sweep(): void
    {
        $this->artisan('bookings:retry-pms-sync', ['--org' => $this->org->id])->assertSuccessful();
    }

    private function fresh(BookingMirror $m): BookingMirror
    {
        return BookingMirror::withoutGlobalScopes()->findOrFail($m->id);
    }

    public function test_a_plain_pending_booking_is_pushed_and_confirmed_as_before(): void
    {
        $m = $this->pending();
        $this->smoobu->shouldReceive('createReservation')->once()->andReturn(['id' => 777001, 'reference-id' => 'BK-RETRY01']);

        $this->sweep();

        $fresh = $this->fresh($m);
        $this->assertSame('777001', $fresh->reservation_id);
        $this->assertSame('BK-RETRY01', $fresh->booking_reference);
        $this->assertSame('confirmed', $fresh->internal_status);
        $this->assertSame(1, (int) $fresh->pms_sync_attempts);
        $this->assertNotNull($fresh->synced_at);
        $this->assertNull($fresh->pms_sync_last_error);
        $this->assertSame(1, AuditLog::withoutGlobalScopes()->where('action', 'booking.pms.sync_recovered')->where('subject_id', $m->id)->count());
    }

    public function test_a_plain_pending_booking_that_fails_again_counts_the_attempt_as_before(): void
    {
        $m = $this->pending(['pms_sync_attempts' => 1]);
        $this->smoobu->shouldReceive('createReservation')->once()->andThrow(new \RuntimeException('cURL error 28'));

        $this->sweep();

        $fresh = $this->fresh($m);
        $this->assertSame('pending_pms_sync', $fresh->internal_status);
        $this->assertSame(2, (int) $fresh->pms_sync_attempts);
        $this->assertSame('cURL error 28', $fresh->pms_sync_last_error);
    }

    public function test_a_booking_cancelled_after_the_scan_is_not_recreated_or_rewritten(): void
    {
        $first = $this->pending();
        $second = $this->pending(['member_id' => 41, 'channel_name' => 'Member portal']);
        $this->smoobu->shouldReceive('createReservation')->once()->andReturnUsing(function () use ($second) {
            // While the first row is being pushed, the member cancels the second.
            DB::table('booking_mirror')->where('id', $second->id)->update(['cancelled_at' => now(), 'cancellation_reason' => 'member_portal', 'internal_status' => 'cancelled', 'booking_state' => 'cancelled']);
            return ['id' => 777002, 'reference-id' => 'BK-RETRY02'];
        });

        $this->sweep();

        $this->assertSame('confirmed', $this->fresh($first)->internal_status);
        $cancelled = $this->fresh($second);
        $this->assertSame('cancelled', $cancelled->internal_status);
        $this->assertSame(0, (int) $cancelled->pms_sync_attempts);
        $this->assertStringStartsWith('LOCAL-', $cancelled->reservation_id);
    }

    /**
     * A booking WITHOUT a member cancellation is pushed normally, even when
     * its status/state say cancelled by the time its turn comes — the
     * reservation is created and the columns written regardless. Only
     * cancelled_at (a member's cancellation) stops it.
     */
    public function test_a_memberless_row_marked_cancelled_by_status_is_handled_exactly_as_before(): void
    {
        $first = $this->pending();
        $second = $this->pending();
        $sent = [];
        $this->smoobu->shouldReceive('createReservation')->twice()->andReturnUsing(function (array $payload) use ($second, &$sent) {
            $sent[] = $payload;
            if (count($sent) === 1) {
                // Staff cancel the second row by status while the first is pushed.
                DB::table('booking_mirror')->where('id', $second->id)->update(['internal_status' => 'cancelled', 'booking_state' => 'cancelled']);
                return ['id' => 777011, 'reference-id' => 'BK-RETRY11'];
            }
            return ['id' => 777012, 'reference-id' => 'BK-RETRY12'];
        });
        $this->smoobu->shouldNotReceive('cancelReservation');

        $this->sweep();

        $this->assertCount(2, $sent, 'the old code asked Smoobu for both');
        $this->assertSame(200.0, (float) $sent[1]['price']);
        $fresh = $this->fresh($second);
        $this->assertSame('777012', $fresh->reservation_id);
        $this->assertSame('BK-RETRY12', $fresh->booking_reference);
        $this->assertSame('confirmed', $fresh->internal_status, 'written as the old code wrote it');
        $this->assertSame(1, (int) $fresh->pms_sync_attempts);
        $this->assertNotNull($fresh->synced_at);
        $this->assertSame(1, AuditLog::withoutGlobalScopes()->where('action', 'booking.pms.sync_recovered')->where('subject_id', $second->id)->count());
    }

    /** A row the member cancelled (cancelled_at set) is skipped — no reservation, nothing written. */
    public function test_a_member_cancelled_row_is_skipped(): void
    {
        $m = $this->pending(['member_id' => 41, 'channel_name' => 'Member portal', 'cancelled_at' => now(), 'cancellation_reason' => 'member_portal']);
        $this->smoobu->shouldNotReceive('createReservation');

        $this->sweep();

        $fresh = $this->fresh($m);
        $this->assertSame('pending_pms_sync', $fresh->internal_status);
        $this->assertSame(0, (int) $fresh->pms_sync_attempts);
        $this->assertNull($fresh->pms_sync_last_attempt_at);
    }

    public function test_a_cancellation_made_while_smoobu_is_asked_is_kept_and_the_new_reservation_cancelled(): void
    {
        $m = $this->pending(['member_id' => 41, 'channel_name' => 'Member portal']);
        $this->smoobu->shouldReceive('createReservation')->once()->andReturnUsing(function () use ($m) {
            DB::table('booking_mirror')->where('id', $m->id)->update(['cancelled_at' => now(), 'cancellation_reason' => 'member_portal', 'internal_status' => 'cancelled', 'booking_state' => 'cancelled']);
            return ['id' => 777003, 'reference-id' => 'BK-RETRY03'];
        });
        $this->smoobu->shouldReceive('cancelReservation')->once()->with('777003')->andReturn([]);

        $this->sweep();

        $fresh = $this->fresh($m);
        $this->assertSame('cancelled', $fresh->internal_status);
        $this->assertNotNull($fresh->cancelled_at);
        $this->assertStringStartsWith('LOCAL-', $fresh->reservation_id);
        $this->assertSame(0, AuditLog::withoutGlobalScopes()->where('action', 'booking.pms.sync_recovered')->where('subject_id', $m->id)->count());
    }

    public function test_a_failure_for_a_booking_cancelled_meanwhile_does_not_bring_it_back_to_pending(): void
    {
        $m = $this->pending(['member_id' => 41, 'channel_name' => 'Member portal']);
        $this->smoobu->shouldReceive('createReservation')->once()->andReturnUsing(function () use ($m) {
            DB::table('booking_mirror')->where('id', $m->id)->update(['cancelled_at' => now(), 'internal_status' => 'cancelled', 'booking_state' => 'cancelled']);
            throw new \RuntimeException('cURL error 28');
        });

        $this->sweep();

        $fresh = $this->fresh($m);
        $this->assertSame('cancelled', $fresh->internal_status);
        $this->assertSame(0, (int) $fresh->pms_sync_attempts);
    }

    /** The Smoobu reservation the retry sends, captured. */
    private function sent(): \Closure
    {
        $sent = [];
        $this->smoobu->shouldReceive('createReservation')->andReturnUsing(function (array $p) use (&$sent) {
            $sent[] = $p;
            return ['id' => 777100 + count($sent), 'reference-id' => 'BK-RETRY' . (100 + count($sent))];
        });

        return function () use (&$sent) {
            return $sent;
        };
    }

    /** Release 6, item 10: a room that follows its group's lead (no payment of its own) names the group's payment too. */
    public function test_a_following_room_of_a_group_names_the_groups_stripe_reference_in_its_note(): void
    {
        $this->pending(['booking_group_id' => 'grp-retry', 'apartment_id' => '101', 'stripe_payment_intent_id' => 'pi_group_retry', 'payment_method' => 'stripe', 'payment_status' => 'paid', 'price_paid' => 200, 'internal_status' => 'confirmed', 'reservation_id' => '777050']);
        $this->pending(['booking_group_id' => 'grp-retry', 'apartment_id' => '102', 'apartment_name' => 'Garden', 'payment_method' => 'stripe', 'payment_status' => 'paid', 'price_total' => 160, 'price_paid' => 160]);
        $sent = $this->sent();

        $this->sweep();

        $this->assertCount(1, $sent(), 'only the room still waiting is pushed');
        $this->assertSame(102, $sent()[0]['apartmentId']);
        $this->assertStringContainsString('Stripe ref: pi_group_retry', $sent()[0]['assistant-notice']);
    }

    public function test_a_single_room_without_a_payment_names_none_and_a_eur_receipt_is_as_before(): void
    {
        $this->pending();
        $sent = $this->sent();

        $this->sweep();

        $notice = $sent()[0]['assistant-notice'];
        $this->assertStringNotContainsString('Stripe ref:', $notice);
        $this->assertStringContainsString('Payment: unpaid (€200.00 due)', $notice);
        $this->assertStringContainsString('Total: €200.00', $notice);
        $this->assertSame(['EUR'], array_values(array_unique(array_column($sent()[0]['priceElements'], 'currencyCode'))));
    }

    /** Release 6, item 7: the venue's own stay currency on the retry's receipt too. */
    public function test_a_usd_venues_retry_receipt_is_in_usd(): void
    {
        app()->instance('current_organization_id', $this->org->id); // the setting is the venue's own
        \App\Models\HotelSetting::withoutGlobalScopes()->create(['organization_id' => $this->org->id, 'key' => 'booking_currency', 'value' => 'USD', 'type' => 'string', 'group' => 'booking']);
        \App\Models\HotelSetting::flushCacheFor($this->org->id);
        app()->forgetInstance('current_organization_id'); // the command binds each row's venue itself
        $this->pending(['stripe_payment_intent_id' => 'pi_usd_retry', 'payment_method' => 'stripe', 'payment_status' => 'paid', 'price_paid' => 200]);
        $sent = $this->sent();

        $this->sweep();

        $notice = $sent()[0]['assistant-notice'];
        $this->assertStringContainsString('Stripe ref: pi_usd_retry', $notice);
        $this->assertStringContainsString('Payment: Stripe (USD 200.00 paid)', $notice);
        $this->assertStringContainsString('Total: USD 200.00', $notice);
        $this->assertSame(['USD'], array_values(array_unique(array_column($sent()[0]['priceElements'], 'currencyCode'))));
    }
}
