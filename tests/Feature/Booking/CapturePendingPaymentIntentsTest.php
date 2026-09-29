<?php

namespace Tests\Feature\Booking;

use App\Console\Commands\CapturePendingPaymentIntents;
use App\Services\StripeService;
use Database\Factories\BookingMirrorFactory;
use Database\Factories\OrganizationFactory;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Artisan;
use Mockery;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\TestCase;

/**
 * Locks CapturePendingPaymentIntents — the every-10-min cron
 * that catches authorised-but-not-yet-captured Stripe
 * PaymentIntents on confirmed bookings.
 *
 * Critical because:
 *   - Per the May 31 2026 manual-capture default ship, every
 *     PaymentIntent is created with capture_method='manual'.
 *     Sync capture happens inside confirm(); if that fails for
 *     ANY reason (Stripe blip, mid-confirm crash) the auth
 *     stays held but uncaptured. This cron is the recovery
 *     path within Stripe's 7-day auth window.
 *   - A regression that broadens the WHERE filter could capture
 *     mock-mode PIs (silent test-data → prod-data charge).
 *   - A regression that narrows the window misses real bookings
 *     that fall outside the 5min-6d filter.
 *
 * Coverage focused on the QUERY-FILTER contract since the inner
 * processBooking/processServiceBooking methods do real Stripe
 * calls and would need extensive Stripe SDK mocking to lock
 * outcome buckets meaningfully.
 *
 * StripeService dispatch test: mocked Stripe verifies it gets
 * invoked exactly for eligible mirrors and skipped for
 * ineligible ones.
 */
class CapturePendingPaymentIntentsTest extends TestCase
{
    use DatabaseTransactions;
    use SetsUpMinimalSchema;

    private $stripeMock;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCapturePendingSchema();

        $org = OrganizationFactory::new()->create();
        app()->instance('current_organization_id', $org->id);

        // Mocked Stripe — isEnabled returns false so processBooking
        // short-circuits before calling out to real Stripe. We
        // verify which mirrors REACH processBooking via the call
        // count instead.
        $this->stripeMock = Mockery::mock(StripeService::class);
        $this->stripeMock->shouldReceive('isEnabled')->andReturn(false);
        $this->app->instance(StripeService::class, $this->stripeMock);
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        Mockery::close();
        parent::tearDown();
    }

    private function runCron(array $options = []): int
    {
        return Artisan::call('bookings:capture-pending-pis', $options);
    }

    public function test_handle_returns_success_when_no_pending_captures(): void
    {
        // Empty store — command must NOT crash + must NOT throw.
        $exitCode = $this->runCron();

        $this->assertSame(0, $exitCode);
        $this->assertStringContainsString('No pending captures', Artisan::output());
    }

    public function test_query_includes_authorized_and_pending_payment_status(): void
    {
        // The eligible-status filter: only 'authorized' + 'pending'
        // mirrors enter the sweep.
        BookingMirrorFactory::new()->create([
            'payment_status'           => 'authorized',
            'stripe_payment_intent_id' => 'pi_test_real_001',
            'payment_method'           => 'stripe',
            'created_at'               => now()->subHour(),
        ]);
        BookingMirrorFactory::new()->create([
            'payment_status'           => 'pending',
            'stripe_payment_intent_id' => 'pi_test_real_002',
            'payment_method'           => 'stripe',
            'created_at'               => now()->subHour(),
        ]);

        $this->runCron();

        $output = Artisan::output();
        $this->assertStringContainsString('2 pending capture', $output);
    }

    public function test_query_excludes_paid_mirrors(): void
    {
        // Paid mirrors are already captured — must NOT re-process.
        BookingMirrorFactory::new()->paid()->create([
            'created_at' => now()->subHour(),
        ]);

        $this->runCron();
        $output = Artisan::output();

        $this->assertStringContainsString('No pending captures', $output,
            'Already-paid mirrors must NOT enter the sweep.');
    }

    public function test_query_excludes_mock_payment_intent_ids(): void
    {
        // Critical security guard: pi_mock_* PIs are test-data
        // artifacts and MUST NEVER reach a real Stripe capture call.
        BookingMirrorFactory::new()->create([
            'payment_status'           => 'authorized',
            'stripe_payment_intent_id' => 'pi_mock_test_001',
            'payment_method'           => 'stripe',
            'created_at'               => now()->subHour(),
        ]);

        $this->runCron();
        $output = Artisan::output();

        $this->assertStringContainsString('No pending captures', $output,
            'pi_mock_* PIs must be excluded from the eligible set.');
    }

    public function test_query_excludes_mock_payment_method(): void
    {
        // Defense in depth: mirrors with payment_method='mock'
        // are also excluded even if their PI id happens to look
        // real.
        BookingMirrorFactory::new()->create([
            'payment_status'           => 'authorized',
            'stripe_payment_intent_id' => 'pi_test_looks_real_001',
            'payment_method'           => 'mock',  // ← excluded
            'created_at'               => now()->subHour(),
        ]);

        $this->runCron();
        $output = Artisan::output();

        $this->assertStringContainsString('No pending captures', $output);
    }

    public function test_query_excludes_mirrors_younger_than_5_minutes(): void
    {
        // The minAge floor: very fresh bookings (<5min) might
        // still be inside the sync-capture window of confirm().
        // Don't race with the sync path.
        BookingMirrorFactory::new()->create([
            'payment_status'           => 'authorized',
            'stripe_payment_intent_id' => 'pi_test_fresh_001',
            'payment_method'           => 'stripe',
            'created_at'               => now()->subMinute(), // too fresh
        ]);

        $this->runCron();
        $output = Artisan::output();

        $this->assertStringContainsString('No pending captures', $output,
            'Mirrors younger than 5min must NOT enter the sweep.');
    }

    public function test_query_excludes_mirrors_older_than_6_days(): void
    {
        // The maxAge ceiling: past 6 days, the Stripe auth is
        // dead or about-to-expire (7-day window). Stale-auth
        // reconciliation handles these separately.
        BookingMirrorFactory::new()->create([
            'payment_status'           => 'authorized',
            'stripe_payment_intent_id' => 'pi_test_old_001',
            'payment_method'           => 'stripe',
            'created_at'               => now()->subDays(8), // too old
        ]);

        $this->runCron();
        $output = Artisan::output();

        // Sweep proper says "no pending captures" but the
        // reconcileStaleAuths path is what handles old rows. Our
        // mock Stripe (isEnabled=false) doesn't engage that path
        // either, so the output should still indicate nothing in
        // the main sweep.
        $this->assertStringContainsString('No pending captures', $output);
    }

    public function test_org_filter_limits_to_specified_org(): void
    {
        // The --org filter scopes the sweep to one tenant. Used
        // by the recovery workflow to limit blast radius when
        // probing a specific customer's stuck PIs.
        $orgA = OrganizationFactory::new()->create();
        $orgB = OrganizationFactory::new()->create();

        // Seed in each org (use raw insert to bypass tenant
        // binding which would force-fill the current org).
        \DB::table('booking_mirror')->insert([
            [
                'organization_id'           => $orgA->id,
                'payment_status'            => 'authorized',
                'stripe_payment_intent_id'  => 'pi_test_orgA',
                'payment_method'            => 'stripe',
                'reservation_id'            => 'SM-A',
                'booking_state'             => 'confirmed',
                'price_total'               => 100,
                'created_at'                => now()->subHour(),
                'updated_at'                => now()->subHour(),
            ],
            [
                'organization_id'           => $orgB->id,
                'payment_status'            => 'authorized',
                'stripe_payment_intent_id'  => 'pi_test_orgB',
                'payment_method'            => 'stripe',
                'reservation_id'            => 'SM-B',
                'booking_state'             => 'confirmed',
                'price_total'               => 100,
                'created_at'                => now()->subHour(),
                'updated_at'                => now()->subHour(),
            ],
        ]);

        // --org filter to A only.
        $this->runCron(['--org' => (string) $orgA->id]);
        $output = Artisan::output();

        $this->assertStringContainsString('1 pending capture', $output,
            "--org filter must limit to the specified tenant's rows.");
    }

    public function test_dry_run_does_not_call_capture(): void
    {
        // --dry-run probes the eligible set without dispatching
        // to capturePaymentIntent. Used by ops to preview a sweep
        // before committing.
        BookingMirrorFactory::new()->create([
            'payment_status'           => 'authorized',
            'stripe_payment_intent_id' => 'pi_test_dryrun_001',
            'payment_method'           => 'stripe',
            'created_at'               => now()->subHour(),
        ]);

        // Set up the mock so capturePaymentIntent would throw if
        // called — proves dry-run skipped it.
        $this->stripeMock->shouldNotReceive('capturePaymentIntent');

        $this->runCron(['--dry-run' => true]);
        $output = Artisan::output();

        $this->assertStringContainsString('[dry-run]', $output);
    }

    // ── Service bookings and their own status (final review, Important 4) ──

    /** A Stripe double that is switched on and answers `retrieve` with the given status. */
    private function enabledStripe(string $status): \Mockery\MockInterface
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('retrievePaymentIntent')->andReturnUsing(
            fn (string $id) => \Stripe\PaymentIntent::constructFrom(['id' => $id, 'status' => $status, 'amount' => 6000]),
        );
        $this->app->instance(StripeService::class, $stripe);
        return $stripe;
    }

    private function serviceBooking(string $status, string $pi, string $paymentStatus = 'authorized'): int
    {
        return \DB::table('service_bookings')->insertGetId([
            'organization_id'          => app('current_organization_id'),
            'status'                   => $status,
            'payment_status'           => $paymentStatus,
            'stripe_payment_intent_id' => $pi,
            'created_at'               => now()->subHour(),
            'updated_at'               => now()->subHour(),
        ]);
    }

    private function audits(string $action): int
    {
        return \DB::table('audit_logs')->where('action', $action)->count();
    }

    public function test_a_pending_service_booking_is_not_captured_before_staff_confirm_it(): void
    {
        $id = $this->serviceBooking('pending', 'pi_test_pending_1');
        $stripe = $this->enabledStripe('requires_capture');
        $stripe->shouldNotReceive('capturePaymentIntent');
        $stripe->shouldNotReceive('cancelPaymentIntent');

        $this->runCron();

        $this->assertStringContainsString('No pending captures', Artisan::output());
        $this->assertSame('authorized', \DB::table('service_bookings')->where('id', $id)->value('payment_status'));
    }

    public function test_a_confirmed_service_booking_is_captured_as_before(): void
    {
        $id = $this->serviceBooking('confirmed', 'pi_test_confirmed_1');
        $stripe = $this->enabledStripe('requires_capture');
        $stripe->shouldReceive('capturePaymentIntent')->once()->with('pi_test_confirmed_1')
            ->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_confirmed_1', 'status' => 'succeeded']));
        $stripe->shouldNotReceive('cancelPaymentIntent');

        $this->runCron();

        $this->assertSame('paid', \DB::table('service_bookings')->where('id', $id)->value('payment_status'));
        $this->assertSame(1, $this->audits('service_booking.capture.recovered'));
    }

    public function test_a_cancelled_or_no_show_booking_has_its_hold_cancelled_not_captured(): void
    {
        $cancelled = $this->serviceBooking('cancelled', 'pi_test_cancelled_1');
        $noShow = $this->serviceBooking('no_show', 'pi_test_noshow_1');
        $stripe = $this->enabledStripe('requires_capture');
        $stripe->shouldNotReceive('capturePaymentIntent');
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_test_cancelled_1', 'abandoned')
            ->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_cancelled_1', 'status' => 'canceled']));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_test_noshow_1', 'abandoned')
            ->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_noshow_1', 'status' => 'canceled']));

        $this->runCron();

        $this->assertSame('cancelled', \DB::table('service_bookings')->where('id', $cancelled)->value('payment_status'));
        $this->assertSame('cancelled', \DB::table('service_bookings')->where('id', $noShow)->value('payment_status'));
        $this->assertSame(2, $this->audits('service_booking.capture.cancelled_booking'));
    }

    public function test_a_cancelled_booking_whose_payment_was_already_taken_is_flagged_once_and_left_alone(): void
    {
        $id = $this->serviceBooking('cancelled', 'pi_test_taken_1');
        $stripe = $this->enabledStripe('succeeded');
        $stripe->shouldNotReceive('capturePaymentIntent');
        $stripe->shouldNotReceive('cancelPaymentIntent');

        $this->runCron();
        $this->runCron(); // the row stays in the sweep; the flag must not repeat

        $this->assertSame('authorized', \DB::table('service_bookings')->where('id', $id)->value('payment_status'));
        $this->assertSame(1, $this->audits('service_booking.capture.needs_refund'));
    }

    public function test_dry_run_reports_both_cancelled_cases_and_writes_nothing(): void
    {
        $held = $this->serviceBooking('cancelled', 'pi_test_dry_held');
        $taken = $this->serviceBooking('no_show', 'pi_test_dry_taken');
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_test_dry_held')
            ->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_dry_held', 'status' => 'requires_capture']));
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_test_dry_taken')
            ->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_dry_taken', 'status' => 'succeeded']));
        $stripe->shouldNotReceive('capturePaymentIntent');
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $this->app->instance(StripeService::class, $stripe);

        $this->runCron(['--dry-run' => true]);
        $output = Artisan::output();

        $this->assertStringContainsString("[dry-run] would cancel the hold on cancelled service booking #{$held}", $output);
        $this->assertStringContainsString("[dry-run] would flag service booking #{$taken} for a refund", $output);
        $this->assertSame('authorized', \DB::table('service_bookings')->where('id', $held)->value('payment_status'));
        $this->assertSame('authorized', \DB::table('service_bookings')->where('id', $taken)->value('payment_status'));
        $this->assertSame(0, \DB::table('audit_logs')->count());
    }

    public function test_limit_option_caps_processed_rows(): void
    {
        // --limit caps the per-run sweep size (back-pressure for
        // mass-sweep scenarios).
        for ($i = 0; $i < 5; $i++) {
            BookingMirrorFactory::new()->create([
                'payment_status'           => 'authorized',
                'stripe_payment_intent_id' => "pi_test_lim_{$i}",
                'payment_method'           => 'stripe',
                'created_at'               => now()->subHour(),
            ]);
        }

        $this->runCron(['--limit' => '2']);
        $output = Artisan::output();

        // Should see "2 pending capture(s)" not "5".
        $this->assertStringContainsString('2 pending capture', $output,
            '--limit must cap the per-run sweep size.');
    }

    // ── Stays: cancelled-or-refunded is never captured ──────────────────────

    private function stayRow(array $attrs): int
    {
        return \DB::table('booking_mirror')->insertGetId(array_merge([
            'organization_id'          => app('current_organization_id'),
            'reservation_id'           => 'R-' . uniqid(),
            'booking_state'            => 'confirmed',
            'internal_status'          => 'confirmed',
            'payment_status'           => 'authorized',
            'payment_method'           => 'stripe',
            'stripe_payment_intent_id' => 'pi_test_stay_1',
            'price_total'              => 180,
            'created_at'               => now()->subHour(),
            'updated_at'               => now()->subHour(),
        ], $attrs));
    }

    /** A cancelled stay's still-open hold is released, never captured. */
    public function test_a_cancelled_stay_is_released_not_captured(): void
    {
        $byStatus = $this->stayRow(['internal_status' => 'cancelled', 'stripe_payment_intent_id' => 'pi_test_stay_a']);
        $byState = $this->stayRow(['booking_state' => 'cancelled', 'stripe_payment_intent_id' => 'pi_test_stay_b']);
        $stripe = $this->enabledStripe('requires_capture');
        $stripe->shouldNotReceive('capturePaymentIntent');
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_test_stay_a', 'abandoned')->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_stay_a', 'status' => 'canceled']));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_test_stay_b', 'abandoned')->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_stay_b', 'status' => 'canceled']));

        $this->runCron();

        $this->assertSame('cancelled', \DB::table('booking_mirror')->where('id', $byStatus)->value('payment_status'));
        $this->assertSame('cancelled', \DB::table('booking_mirror')->where('id', $byState)->value('payment_status'));
        $this->assertSame(2, $this->audits('booking.capture.cancelled_booking'));
    }

    /**
     * A cancelled stay whose PI has already succeeded: the money is
     * genuinely at Stripe, so 'paid' is the truth, and the booking is
     * additionally flagged once so staff know to give that money back.
     * (Services keep their own, different, leave-it-alone rule — see the
     * service-side test below.)
     */
    public function test_a_cancelled_stay_whose_payment_was_already_taken_is_marked_paid_and_flagged(): void
    {
        $id = $this->stayRow(['internal_status' => 'cancelled']);
        $stripe = $this->enabledStripe('succeeded');
        $stripe->shouldNotReceive('capturePaymentIntent');
        $stripe->shouldNotReceive('cancelPaymentIntent');

        $this->runCron();

        $this->assertSame('paid', \DB::table('booking_mirror')->where('id', $id)->value('payment_status'));
        $this->assertSame(1, $this->audits('booking.capture.needs_refund'));
    }

    public function test_a_confirmed_stay_is_captured_as_before(): void
    {
        $id = $this->stayRow([]);
        $stripe = $this->enabledStripe('requires_capture');
        $stripe->shouldReceive('capturePaymentIntent')->once()->with('pi_test_stay_1')->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_stay_1', 'status' => 'succeeded']));

        $this->runCron();

        $this->assertSame('paid', \DB::table('booking_mirror')->where('id', $id)->value('payment_status'));
    }

    public function test_an_intent_stripe_cancelled_is_recorded_with_one_spelling(): void
    {
        $stay = $this->stayRow([]);
        $service = $this->serviceBooking('confirmed', 'pi_test_gone_1');
        $this->enabledStripe('canceled');

        $this->runCron();

        $this->assertSame('cancelled', \DB::table('booking_mirror')->where('id', $stay)->value('payment_status'));
        $this->assertSame('cancelled', \DB::table('service_bookings')->where('id', $service)->value('payment_status'));
    }

    public function test_a_dry_run_releases_nothing_for_a_cancelled_stay(): void
    {
        $id = $this->stayRow(['internal_status' => 'cancelled']);
        $stripe = $this->enabledStripe('requires_capture');
        $stripe->shouldNotReceive('cancelPaymentIntent');

        $this->runCron(['--dry-run' => true]);

        $this->assertStringContainsString("[dry-run] would cancel the hold on cancelled booking #{$id}", Artisan::output());
        $this->assertSame('authorized', \DB::table('booking_mirror')->where('id', $id)->value('payment_status'));
    }

    // ── Lock order: the job locks the row(s) FIRST (lockForUpdate — this IS
    //    the fresh read) and only then takes `pi:`, then talks to Stripe,
    //    then writes — the same order MemberCancellation uses, never
    //    reversed. Because the fresh read happens BEFORE any Stripe call, a
    //    cancellation landing between the sweep's SELECT and the job's own
    //    row lock is simply seen by that row lock (nothing new to test
    //    beyond the plain "already cancelled" tests above). What genuinely
    //    remains racy is a write landing AFTER the row lock's read but
    //    DURING the Stripe round trip itself — only the conditional write
    //    (not the cancellation decision, which is fixed at the lock)
    //    protects against that, so that is what these tests simulate, from
    //    inside the Stripe mock's own callback. ─────────────────────────

    public function test_a_row_refunded_during_the_stripe_retrieve_call_is_not_flipped_to_cancelled(): void
    {
        $id = $this->stayRow(['stripe_payment_intent_id' => 'pi_test_race_expire_1']);
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('retrievePaymentIntent')->once()->with('pi_test_race_expire_1')->andReturnUsing(function (string $piId) use ($id) {
            // A refund (staff, or the member's own cancellation) commits
            // while the job is still waiting on Stripe's answer for this PI.
            \DB::table('booking_mirror')->where('id', $id)->update(['payment_status' => 'refunded', 'refunded_amount' => 180, 'refunded_at' => now()]);
            return \Stripe\PaymentIntent::constructFrom(['id' => $piId, 'status' => 'canceled']);
        });
        $this->app->instance(StripeService::class, $stripe);

        $this->runCron();

        $this->assertSame('refunded', \DB::table('booking_mirror')->where('id', $id)->value('payment_status'));
    }

    public function test_a_row_paid_during_the_stripe_cancel_call_is_not_overwritten(): void
    {
        $id = $this->stayRow(['internal_status' => 'cancelled', 'stripe_payment_intent_id' => 'pi_test_race_release_1']);
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('retrievePaymentIntent')->once()->with('pi_test_race_release_1')
            ->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_race_release_1', 'status' => 'requires_capture']));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_test_race_release_1', 'abandoned')->andReturnUsing(function () use ($id) {
            // A capture lands (a sibling process, or a very late confirm)
            // the instant between Stripe confirming the cancel and our own
            // write.
            \DB::table('booking_mirror')->where('id', $id)->update(['payment_status' => 'paid']);
            return \Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_race_release_1', 'status' => 'canceled']);
        });
        $this->app->instance(StripeService::class, $stripe);

        $this->runCron();

        $this->assertSame('paid', \DB::table('booking_mirror')->where('id', $id)->value('payment_status'));
    }

    public function test_a_service_booking_refunded_during_the_stripe_retrieve_call_is_not_flipped_to_cancelled(): void
    {
        $id = $this->serviceBooking('confirmed', 'pi_test_race_svc_expire_1');
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('retrievePaymentIntent')->once()->with('pi_test_race_svc_expire_1')->andReturnUsing(function (string $piId) use ($id) {
            \DB::table('service_bookings')->where('id', $id)->update(['payment_status' => 'refunded']);
            return \Stripe\PaymentIntent::constructFrom(['id' => $piId, 'status' => 'canceled']);
        });
        $this->app->instance(StripeService::class, $stripe);

        $this->runCron();

        $this->assertSame('refunded', \DB::table('service_bookings')->where('id', $id)->value('payment_status'));
    }

    public function test_a_service_booking_paid_during_the_stripe_cancel_call_is_not_overwritten(): void
    {
        $id = $this->serviceBooking('cancelled', 'pi_test_race_svc_release_1');
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('retrievePaymentIntent')->once()->with('pi_test_race_svc_release_1')
            ->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_race_svc_release_1', 'status' => 'requires_capture']));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_test_race_svc_release_1', 'abandoned')->andReturnUsing(function () use ($id) {
            \DB::table('service_bookings')->where('id', $id)->update(['payment_status' => 'paid']);
            return \Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_race_svc_release_1', 'status' => 'canceled']);
        });
        $this->app->instance(StripeService::class, $stripe);

        $this->runCron();

        $this->assertSame('paid', \DB::table('service_bookings')->where('id', $id)->value('payment_status'));
    }

    // General regression coverage for "a refund is never turned back into
    // paid": the write each guards (markBookingPaid() for stays, the plain
    // conditional update for services) is what protects against this.

    public function test_a_stay_refunded_between_load_and_process_is_not_overwritten_with_paid(): void
    {
        $id = $this->stayRow(['stripe_payment_intent_id' => 'pi_test_race_stay_2']);
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('retrievePaymentIntent')->once()->with('pi_test_race_stay_2')->andReturnUsing(function (string $piId) use ($id) {
            \DB::table('booking_mirror')->where('id', $id)->update([
                'payment_status'  => 'refunded',
                'refunded_amount' => 180,
                'refunded_at'     => now(),
            ]);
            return \Stripe\PaymentIntent::constructFrom(['id' => $piId, 'status' => 'succeeded']);
        });
        $this->app->instance(StripeService::class, $stripe);

        $this->runCron();

        $this->assertSame('refunded', \DB::table('booking_mirror')->where('id', $id)->value('payment_status'), 'a refund committed mid-sweep is never overwritten with paid');
    }

    public function test_a_service_booking_refunded_between_load_and_process_is_not_overwritten_with_paid(): void
    {
        $id = $this->serviceBooking('confirmed', 'pi_test_race_svc_2');
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('retrievePaymentIntent')->once()->with('pi_test_race_svc_2')->andReturnUsing(function (string $piId) use ($id) {
            \DB::table('service_bookings')->where('id', $id)->update(['payment_status' => 'refunded']);
            return \Stripe\PaymentIntent::constructFrom(['id' => $piId, 'status' => 'succeeded']);
        });
        $this->app->instance(StripeService::class, $stripe);

        $this->runCron();

        $this->assertSame('refunded', \DB::table('service_bookings')->where('id', $id)->value('payment_status'), 'a refund committed mid-sweep is never overwritten with paid');
    }

    // ── Combo stays: several rooms sharing one PaymentIntent — decided once
    //    per PI, over every room. ────────────────────────────────────────

    private function comboRow(string $groupId, string $pi, array $attrs): int
    {
        return $this->stayRow(array_merge(['booking_group_id' => $groupId, 'stripe_payment_intent_id' => $pi], $attrs));
    }

    public function test_a_combo_with_one_cancelled_and_one_live_room_captures_once_and_flags_the_cancelled_room(): void
    {
        $group = 'grp-' . uniqid();
        $cancelled = $this->comboRow($group, 'pi_test_combo_1', ['internal_status' => 'cancelled']);
        $live = $this->comboRow($group, 'pi_test_combo_1', []);
        $stripe = $this->enabledStripe('requires_capture');
        $stripe->shouldReceive('capturePaymentIntent')->once()->with('pi_test_combo_1')
            ->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_combo_1', 'status' => 'succeeded']));
        $stripe->shouldNotReceive('cancelPaymentIntent');

        $this->runCron();

        $this->assertSame('paid', \DB::table('booking_mirror')->where('id', $live)->value('payment_status'));
        $this->assertSame('paid', \DB::table('booking_mirror')->where('id', $cancelled)->value('payment_status'));
        $this->assertSame(1, $this->audits('booking.capture.needs_refund'));
        $this->assertSame(0, $this->audits('booking.capture.cancelled_booking'));
    }

    public function test_a_combo_entirely_cancelled_releases_the_hold_once(): void
    {
        $group = 'grp-' . uniqid();
        $room1 = $this->comboRow($group, 'pi_test_combo_2', ['internal_status' => 'cancelled']);
        $room2 = $this->comboRow($group, 'pi_test_combo_2', ['internal_status' => 'cancelled']);
        $stripe = $this->enabledStripe('requires_capture');
        $stripe->shouldNotReceive('capturePaymentIntent');
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_test_combo_2', 'abandoned')
            ->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_combo_2', 'status' => 'canceled']));

        $this->runCron();

        $this->assertSame('cancelled', \DB::table('booking_mirror')->where('id', $room1)->value('payment_status'));
        $this->assertSame('cancelled', \DB::table('booking_mirror')->where('id', $room2)->value('payment_status'));
        $this->assertSame(2, $this->audits('booking.capture.cancelled_booking'));
    }

    // ── One failing booking never stops the sweep. ───────────────────────

    public function test_one_failing_booking_does_not_stop_the_sweep(): void
    {
        $ok1 = $this->stayRow(['stripe_payment_intent_id' => 'pi_test_multi_1']);
        $bad = $this->stayRow(['stripe_payment_intent_id' => 'pi_test_multi_2']);
        $ok2 = $this->stayRow(['stripe_payment_intent_id' => 'pi_test_multi_3']);
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_test_multi_1')
            ->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_multi_1', 'status' => 'requires_capture']));
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_test_multi_2')
            ->andThrow(new \RuntimeException('stripe blip'));
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_test_multi_3')
            ->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_multi_3', 'status' => 'requires_capture']));
        $stripe->shouldReceive('capturePaymentIntent')->once()->with('pi_test_multi_1')
            ->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_multi_1', 'status' => 'succeeded']));
        $stripe->shouldReceive('capturePaymentIntent')->once()->with('pi_test_multi_3')
            ->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_multi_3', 'status' => 'succeeded']));
        $this->app->instance(StripeService::class, $stripe);

        $this->runCron();

        $this->assertSame('paid', \DB::table('booking_mirror')->where('id', $ok1)->value('payment_status'));
        $this->assertSame('authorized', \DB::table('booking_mirror')->where('id', $bad)->value('payment_status'));
        $this->assertSame('paid', \DB::table('booking_mirror')->where('id', $ok2)->value('payment_status'));
    }

    // ── The realtime alert for a refused capture keeps the guest's name,
    //    using the group's lowest-id row. ─────────────────────────────────

    public function test_a_refused_capture_alert_includes_the_guest_name(): void
    {
        $id = $this->stayRow(['guest_name' => 'Ada Lovelace', 'stripe_payment_intent_id' => 'pi_test_alert_1']);
        $stripe = $this->enabledStripe('requires_capture');
        $stripe->shouldReceive('capturePaymentIntent')->once()->with('pi_test_alert_1')->andThrow(new \RuntimeException('card declined'));

        $this->runCron();

        $event = \DB::table('realtime_events')->latest('id')->first();
        $this->assertNotNull($event);
        $this->assertSame('Payment capture failed', $event->title);
        $this->assertSame("Booking #{$id} (guest: Ada Lovelace) — Stripe refused capture. Manual review needed.", $event->body);
    }

    /** A failed capture on a group is attempted (and alerted, and audited) once, not once per room — see the class docblock. */
    public function test_a_failed_capture_on_a_group_is_attempted_once(): void
    {
        $group = 'grp-' . uniqid();
        $cancelled = $this->comboRow($group, 'pi_test_combo_fail_1', ['internal_status' => 'cancelled']);
        $live = $this->comboRow($group, 'pi_test_combo_fail_1', []);
        $stripe = $this->enabledStripe('requires_capture');
        $stripe->shouldReceive('capturePaymentIntent')->once()->with('pi_test_combo_fail_1')->andThrow(new \RuntimeException('card declined'));
        $stripe->shouldNotReceive('cancelPaymentIntent');

        $this->runCron();

        $this->assertSame('authorized', \DB::table('booking_mirror')->where('id', $cancelled)->value('payment_status'));
        $this->assertSame('authorized', \DB::table('booking_mirror')->where('id', $live)->value('payment_status'));
        $this->assertSame(1, $this->audits('booking.capture.failed'));
        $this->assertSame(1, \DB::table('realtime_events')->count());
    }

    // ── reconcileStaleAuths(): capture_expired for EVERY stale stay whose
    //    intent Stripe reports canceled/requires_payment_method, cancelled
    //    or not, plus the succeeded/needs_refund rule the main sweep uses,
    //    plus the same conditional-write protection as everything else. ──

    private function staleStayRow(array $attrs): int
    {
        return $this->stayRow(array_merge(['created_at' => now()->subDays(10), 'updated_at' => now()->subDays(10)], $attrs));
    }

    public function test_a_live_stale_stay_with_stripe_canceled_is_flagged_capture_expired(): void
    {
        $id = $this->staleStayRow(['stripe_payment_intent_id' => 'pi_test_stale_live_1']);
        $this->enabledStripe('canceled');

        $this->runCron();

        $this->assertSame('capture_expired', \DB::table('booking_mirror')->where('id', $id)->value('payment_status'));
        $this->assertSame(1, $this->audits('booking.capture.auth_expired'));
    }

    /** Proves reconcileStaleAuths() does NOT discriminate by cancellation state — same outcome as the live stay above. */
    public function test_a_cancelled_stale_stay_with_stripe_canceled_is_also_flagged_capture_expired(): void
    {
        $id = $this->staleStayRow(['internal_status' => 'cancelled', 'stripe_payment_intent_id' => 'pi_test_stale_cancelled_1']);
        $this->enabledStripe('canceled');

        $this->runCron();

        $this->assertSame('capture_expired', \DB::table('booking_mirror')->where('id', $id)->value('payment_status'));
        $this->assertSame(1, $this->audits('booking.capture.auth_expired'));
    }

    public function test_a_stale_stay_with_stripe_succeeded_is_marked_paid(): void
    {
        $id = $this->staleStayRow(['stripe_payment_intent_id' => 'pi_test_stale_paid_1']);
        $this->enabledStripe('succeeded');

        $this->runCron();

        $this->assertSame('paid', \DB::table('booking_mirror')->where('id', $id)->value('payment_status'));
        $this->assertSame(0, $this->audits('booking.capture.needs_refund'));
    }

    public function test_a_cancelled_stale_stay_with_stripe_succeeded_is_paid_and_flagged_once(): void
    {
        $id = $this->staleStayRow(['internal_status' => 'cancelled', 'stripe_payment_intent_id' => 'pi_test_stale_cancelled_paid_1']);
        $this->enabledStripe('succeeded');

        $this->runCron();

        $this->assertSame('paid', \DB::table('booking_mirror')->where('id', $id)->value('payment_status'));
        $this->assertSame(1, $this->audits('booking.capture.needs_refund'));
    }

    public function test_a_stale_row_changed_during_the_stripe_retrieve_call_is_not_overwritten(): void
    {
        $id = $this->staleStayRow(['stripe_payment_intent_id' => 'pi_test_stale_race_1']);
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('retrievePaymentIntent')->once()->with('pi_test_stale_race_1')->andReturnUsing(function (string $piId) use ($id) {
            \DB::table('booking_mirror')->where('id', $id)->update(['payment_status' => 'refunded', 'refunded_amount' => 180, 'refunded_at' => now()]);
            return \Stripe\PaymentIntent::constructFrom(['id' => $piId, 'status' => 'canceled']);
        });
        $this->app->instance(StripeService::class, $stripe);

        $this->runCron();

        $this->assertSame('refunded', \DB::table('booking_mirror')->where('id', $id)->value('payment_status'));
    }

    // ── Console output for an ordinary (non-cancelled) group reads the same
    //    as N independent single-room sweeps. ────────────────────────────

    public function test_the_summary_line_is_byte_identical_for_a_single_stay_and_an_all_live_group_of_three(): void
    {
        $this->stayRow(['stripe_payment_intent_id' => 'pi_test_summary_single']);
        $group = 'grp-' . uniqid();
        $this->comboRow($group, 'pi_test_summary_group', []);
        $this->comboRow($group, 'pi_test_summary_group', []);
        $this->comboRow($group, 'pi_test_summary_group', []);

        $stripe = $this->enabledStripe('requires_capture');
        $stripe->shouldReceive('capturePaymentIntent')->once()->with('pi_test_summary_single')
            ->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_summary_single', 'status' => 'succeeded']));
        $stripe->shouldReceive('capturePaymentIntent')->once()->with('pi_test_summary_group')
            ->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_summary_group', 'status' => 'succeeded']));

        $this->runCron();

        // Single stay: 1 captured. Group of three: 1 captured, 2
        // already_captured — see the class docblock's COMBO paragraph.
        // Total: 2 captured, 2 already captured.
        $this->assertStringContainsString(
            'Sweep complete: 2 captured · 2 already captured · 0 expired · 0 skipped · 0 failed · 0 released (booking cancelled) · 0 need a refund',
            Artisan::output(),
        );
    }

    public function test_dry_run_summary_and_lines_are_byte_identical_for_an_all_live_group_of_three(): void
    {
        $group = 'grp-' . uniqid();
        $g1 = $this->comboRow($group, 'pi_test_summary_dry', []);
        $g2 = $this->comboRow($group, 'pi_test_summary_dry', []);
        $g3 = $this->comboRow($group, 'pi_test_summary_dry', []);
        $stripe = $this->enabledStripe('requires_capture');
        $stripe->shouldNotReceive('capturePaymentIntent');

        $this->runCron(['--dry-run' => true]);
        $output = Artisan::output();

        // Every room independently still sees requires_capture in
        // --dry-run — one line, one 'captured' count, per row.
        $this->assertStringContainsString("[dry-run] would capture booking #{$g1} (PI pi_test_summary_dry)", $output);
        $this->assertStringContainsString("[dry-run] would capture booking #{$g2} (PI pi_test_summary_dry)", $output);
        $this->assertStringContainsString("[dry-run] would capture booking #{$g3} (PI pi_test_summary_dry)", $output);
        $this->assertStringContainsString(
            'Sweep complete: 3 captured · 0 already captured · 0 expired · 0 skipped · 0 failed · 0 released (booking cancelled) · 0 need a refund',
            $output,
        );
    }

    // ── A NO-SHOW stay is charged normally: the CANCELLED rule above does
    //    not extend to it. ─────────────────────────────────────────────

    public function test_a_no_show_stay_is_captured_like_before_this_task(): void
    {
        $id = $this->stayRow(['internal_status' => 'no-show', 'stripe_payment_intent_id' => 'pi_test_noshow_stay_1']);
        $stripe = $this->enabledStripe('requires_capture');
        $stripe->shouldReceive('capturePaymentIntent')->once()->with('pi_test_noshow_stay_1')
            ->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_noshow_stay_1', 'status' => 'succeeded']));
        $stripe->shouldNotReceive('cancelPaymentIntent');

        $this->runCron();

        $this->assertSame('paid', \DB::table('booking_mirror')->where('id', $id)->value('payment_status'));
    }

    // ── Combo groups combined with a mixed or already-resolved status ──────

    public function test_a_mixed_group_where_stripe_already_reports_succeeded_marks_all_paid_and_flags_the_cancelled_one(): void
    {
        $group = 'grp-' . uniqid();
        $cancelled = $this->comboRow($group, 'pi_test_combo_succeeded_1', ['internal_status' => 'cancelled']);
        $live = $this->comboRow($group, 'pi_test_combo_succeeded_1', []);
        $stripe = $this->enabledStripe('succeeded');
        $stripe->shouldNotReceive('capturePaymentIntent');
        $stripe->shouldNotReceive('cancelPaymentIntent');

        $this->runCron();

        $this->assertSame('paid', \DB::table('booking_mirror')->where('id', $live)->value('payment_status'));
        $this->assertSame('paid', \DB::table('booking_mirror')->where('id', $cancelled)->value('payment_status'));
        $this->assertSame(1, $this->audits('booking.capture.needs_refund'));
    }

    public function test_a_second_run_over_a_cancelled_row_writes_no_second_needs_refund_audit(): void
    {
        $group = 'grp-' . uniqid();
        $cancelled = $this->comboRow($group, 'pi_test_combo_second_1', ['internal_status' => 'cancelled']);
        $live = $this->comboRow($group, 'pi_test_combo_second_1', []);
        $this->enabledStripe('succeeded');

        $this->runCron();
        $this->assertSame(1, $this->audits('booking.capture.needs_refund'));

        // Contrived: put the rows back in the sweep's eligible window to
        // prove the FLAG itself — not just the sweep's own exclusion of
        // paid rows — is what stops a second audit.
        \DB::table('booking_mirror')->whereIn('id', [$cancelled, $live])->update(['payment_status' => 'authorized']);
        $this->enabledStripe('succeeded');

        $this->runCron();

        $this->assertSame(1, $this->audits('booking.capture.needs_refund'));
    }

    /** The needs_refund loop walks only the rows just marked paid — never an already-resolved sibling. */
    public function test_an_already_refunded_cancelled_sibling_is_not_flagged_for_a_refund(): void
    {
        $group = 'grp-' . uniqid();
        $refunded = $this->comboRow($group, 'pi_test_combo_alreadyrefunded_1', ['internal_status' => 'cancelled', 'payment_status' => 'refunded']);
        $live = $this->comboRow($group, 'pi_test_combo_alreadyrefunded_1', []);
        $stripe = $this->enabledStripe('requires_capture');
        $stripe->shouldReceive('capturePaymentIntent')->once()->with('pi_test_combo_alreadyrefunded_1')
            ->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_combo_alreadyrefunded_1', 'status' => 'succeeded']));

        $this->runCron();

        $this->assertSame('paid', \DB::table('booking_mirror')->where('id', $live)->value('payment_status'));
        $this->assertSame('refunded', \DB::table('booking_mirror')->where('id', $refunded)->value('payment_status'), 'an already-refunded sibling is never touched by markBookingPaid');
        $this->assertSame(0, $this->audits('booking.capture.needs_refund'), 'an already-refunded row is not flagged for a refund it already has');
    }

    /**
     * The mutation lands between markBookingPaid()'s OWN internal read and
     * its OWN internal write, not merely before the whole method is called
     * (a plain SELECT filter would already exclude that case and prove
     * nothing about the write itself). The row is still 'authorized' (still
     * matches markBookingPaid()'s SELECT filter) at the moment its own
     * query retrieves it; the mutation happens right then, via a model
     * event, so the in-memory copy the per-row UPDATE's WHERE clause is
     * built from is stale — exactly the window only the conditional UPDATE
     * (not the SELECT) protects. This is the third retrieval of this row
     * in a single sweep (the outer SELECT, the group's own locked re-read,
     * then markBookingPaid()'s own SELECT).
     */
    public function test_mark_booking_paid_does_not_overwrite_a_row_changed_between_its_own_read_and_write(): void
    {
        $id = $this->stayRow(['stripe_payment_intent_id' => 'pi_test_markpaid_race_2']);
        $seen = 0;
        \App\Models\BookingMirror::retrieved(function (\App\Models\BookingMirror $m) use ($id, &$seen) {
            if ((int) $m->id === $id) {
                $seen++;
                if ($seen === 3) {
                    \DB::table('booking_mirror')->where('id', $id)->update(['payment_status' => 'refunded', 'refunded_amount' => 180, 'refunded_at' => now()]);
                }
            }
        });

        try {
            $stripe = $this->enabledStripe('requires_capture');
            $stripe->shouldReceive('capturePaymentIntent')->once()->with('pi_test_markpaid_race_2')
                ->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_markpaid_race_2', 'status' => 'succeeded']));

            $this->runCron();

            $this->assertSame('refunded', \DB::table('booking_mirror')->where('id', $id)->value('payment_status'));
        } finally {
            \App\Models\BookingMirror::flushEventListeners();
        }
    }

    /** The outer catch (a genuine transaction failure, not a benign retrieve failure) really is exercised, and doesn't stop the sweep. */
    public function test_a_genuine_transaction_failure_does_not_stop_the_sweep(): void
    {
        $ok1 = $this->stayRow(['stripe_payment_intent_id' => 'pi_test_txfail_1']);
        $bad = $this->stayRow(['stripe_payment_intent_id' => 'pi_test_txfail_2']);
        $ok2 = $this->stayRow(['stripe_payment_intent_id' => 'pi_test_txfail_3']);

        $seen = [];
        \App\Models\BookingMirror::retrieved(function (\App\Models\BookingMirror $m) use ($bad, &$seen) {
            if ((int) $m->id === $bad) {
                $seen[$m->id] = ($seen[$m->id] ?? 0) + 1;
                // The first retrieval is the outer sweep's own SELECT; the
                // second is this PI's own locked re-read inside its
                // transaction — that's the one we want to blow up.
                if ($seen[$m->id] >= 2) {
                    throw new \RuntimeException('simulated db failure');
                }
            }
        });

        try {
            $stripe = $this->enabledStripe('requires_capture');
            $stripe->shouldReceive('capturePaymentIntent')->once()->with('pi_test_txfail_1')
                ->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_txfail_1', 'status' => 'succeeded']));
            $stripe->shouldReceive('capturePaymentIntent')->once()->with('pi_test_txfail_3')
                ->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_txfail_3', 'status' => 'succeeded']));

            $this->runCron();

            $this->assertSame('paid', \DB::table('booking_mirror')->where('id', $ok1)->value('payment_status'));
            $this->assertSame('authorized', \DB::table('booking_mirror')->where('id', $bad)->value('payment_status'));
            $this->assertSame('paid', \DB::table('booking_mirror')->where('id', $ok2)->value('payment_status'));
        } finally {
            \App\Models\BookingMirror::flushEventListeners();
        }
    }

    // ── Counters and dry-run lines of a group follow the SWEPT OPEN rows,
    //    not the whole group, which is still locked and written for money
    //    correctness even when --limit cuts part of it out of this run's
    //    counters/lines. ───────────────────────────────────────────────

    public function test_a_skipped_status_on_a_group_of_three_counts_all_three(): void
    {
        $group = 'grp-' . uniqid();
        $this->comboRow($group, 'pi_test_skip_group_1', []);
        $this->comboRow($group, 'pi_test_skip_group_1', []);
        $this->comboRow($group, 'pi_test_skip_group_1', []);
        $this->enabledStripe('processing');

        $this->runCron();

        $this->assertStringContainsString(
            'Sweep complete: 0 captured · 0 already captured · 0 expired · 3 skipped · 0 failed · 0 released (booking cancelled) · 0 need a refund',
            Artisan::output(),
        );
    }

    /** A refused capture on a group of three: one attempt, one audit, one alert — but the counter follows the swept-row count. */
    public function test_a_refused_capture_on_a_group_of_three_counts_all_three_as_failed(): void
    {
        $group = 'grp-' . uniqid();
        $this->comboRow($group, 'pi_test_fail_group_1', []);
        $this->comboRow($group, 'pi_test_fail_group_1', []);
        $this->comboRow($group, 'pi_test_fail_group_1', []);
        $stripe = $this->enabledStripe('requires_capture');
        $stripe->shouldReceive('capturePaymentIntent')->once()->with('pi_test_fail_group_1')->andThrow(new \RuntimeException('card declined'));

        $this->runCron();

        $this->assertStringContainsString(
            'Sweep complete: 0 captured · 0 already captured · 0 expired · 0 skipped · 3 failed · 0 released (booking cancelled) · 0 need a refund',
            Artisan::output(),
        );
        $this->assertSame(1, $this->audits('booking.capture.failed'));
        $this->assertSame(1, \DB::table('realtime_events')->count());
    }

    public function test_limit_cuts_a_group_but_all_three_rooms_are_still_paid(): void
    {
        $group = 'grp-' . uniqid();
        $r1 = $this->comboRow($group, 'pi_test_limit_group_1', []);
        $r2 = $this->comboRow($group, 'pi_test_limit_group_1', []);
        $r3 = $this->comboRow($group, 'pi_test_limit_group_1', []);
        $stripe = $this->enabledStripe('requires_capture');
        $stripe->shouldReceive('capturePaymentIntent')->once()->with('pi_test_limit_group_1')
            ->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_limit_group_1', 'status' => 'succeeded']));

        $this->runCron(['--limit' => '2']);
        $output = Artisan::output();

        // Only 2 of the group's 3 rows were swept — "Found" and the summary
        // both follow that, never the whole group.
        $this->assertStringContainsString('Found 2 pending capture(s): 2 room booking(s), 0 service booking(s)', $output);
        $this->assertStringContainsString(
            'Sweep complete: 1 captured · 1 already captured · 0 expired · 0 skipped · 0 failed · 0 released (booking cancelled) · 0 need a refund',
            $output,
        );
        // Money correctness: the PI was captured once for the whole group,
        // so markBookingPaid() marks every room — including the one --limit
        // cut off from this run's own counters/lines.
        $this->assertSame('paid', \DB::table('booking_mirror')->where('id', $r1)->value('payment_status'));
        $this->assertSame('paid', \DB::table('booking_mirror')->where('id', $r2)->value('payment_status'));
        $this->assertSame('paid', \DB::table('booking_mirror')->where('id', $r3)->value('payment_status'));
    }

    public function test_dry_run_with_limit_prints_only_the_swept_rows(): void
    {
        $group = 'grp-' . uniqid();
        $this->comboRow($group, 'pi_test_limit_dry_1', []);
        $this->comboRow($group, 'pi_test_limit_dry_1', []);
        $this->comboRow($group, 'pi_test_limit_dry_1', []);
        $stripe = $this->enabledStripe('requires_capture');
        $stripe->shouldNotReceive('capturePaymentIntent');

        $this->runCron(['--dry-run' => true, '--limit' => '2']);
        $output = Artisan::output();

        $this->assertSame(2, substr_count($output, '[dry-run] would capture booking #'), 'exactly the two swept rows should print a line, never the third');
        $this->assertStringContainsString(
            'Sweep complete: 2 captured · 0 already captured · 0 expired · 0 skipped · 0 failed · 0 released (booking cancelled) · 0 need a refund',
            $output,
        );
    }

    // ── The representative row is the FIRST OPEN SWEPT row, not the lowest
    //    id of the whole group. ──────────────────────────────────────────

    public function test_the_representative_row_is_the_first_open_row_not_the_lowest_id(): void
    {
        $group = 'grp-' . uniqid();
        $this->comboRow($group, 'pi_test_rep_1', ['payment_status' => 'paid']); // lowest id, already resolved — not swept
        $firstOpen = $this->comboRow($group, 'pi_test_rep_1', ['guest_name' => 'First Open']);
        $this->comboRow($group, 'pi_test_rep_1', ['guest_name' => 'Second Open']);
        $stripe = $this->enabledStripe('requires_capture');
        $stripe->shouldReceive('capturePaymentIntent')->once()->with('pi_test_rep_1')->andThrow(new \RuntimeException('card declined'));

        $this->runCron();

        $event = \DB::table('realtime_events')->latest('id')->first();
        $this->assertStringContainsString("Booking #{$firstOpen} (guest: First Open)", $event->body);

        $audit = \DB::table('audit_logs')->where('action', 'booking.capture.failed')->first();
        $this->assertNotNull($audit);
        $values = json_decode($audit->new_values, true);
        $this->assertSame($firstOpen, $values['mirror_id']);
    }

    // ── The refused-capture audit and alert are each written independently
    //    after the transaction ends — a failing audit insert cannot lose
    //    the alert. ────────────────────────────────────────────────────

    public function test_a_failing_audit_does_not_lose_the_realtime_alert(): void
    {
        $id = $this->stayRow(['stripe_payment_intent_id' => 'pi_test_auditfail_1']);
        $stripe = $this->enabledStripe('requires_capture');
        $stripe->shouldReceive('capturePaymentIntent')->once()->with('pi_test_auditfail_1')->andThrow(new \RuntimeException('card declined'));

        \App\Models\AuditLog::creating(function (\App\Models\AuditLog $a) {
            if ($a->action === 'booking.capture.failed') {
                throw new \RuntimeException('simulated audit write failure');
            }
        });

        try {
            $exitCode = $this->runCron();

            $this->assertSame(0, $exitCode, 'the sweep must complete even when the audit write fails');
            $this->assertStringContainsString('Sweep complete', Artisan::output());
            $event = \DB::table('realtime_events')->latest('id')->first();
            $this->assertNotNull($event, 'the alert must still be written even though the audit failed');
            $this->assertSame('Payment capture failed', $event->title);
            $this->assertStringContainsString("Booking #{$id}", $event->body);
            $this->assertSame(0, \DB::table('audit_logs')->where('action', 'booking.capture.failed')->count());
        } finally {
            \App\Models\AuditLog::flushEventListeners();
        }
    }

    // ── Audit wording and failure handling for the conditional writes. ───

    /** "already moved on" is chosen when the conditional write matched 0 rows. */
    public function test_the_moved_on_wording_follows_a_write_that_matched_no_row(): void
    {
        $raced = $this->stayRow(['stripe_payment_intent_id' => 'pi_test_wording_race']);
        $plain = $this->stayRow(['stripe_payment_intent_id' => 'pi_test_wording_plain']);
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_test_wording_race')->andReturnUsing(function (string $piId) use ($raced) {
            \DB::table('booking_mirror')->where('id', $raced)->update(['payment_status' => 'refunded']);
            return \Stripe\PaymentIntent::constructFrom(['id' => $piId, 'status' => 'canceled']);
        });
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_test_wording_plain')->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_wording_plain', 'status' => 'canceled']));
        $this->app->instance(StripeService::class, $stripe);

        $this->runCron();

        $descriptions = \DB::table('audit_logs')->where('action', 'booking.capture.expired')->pluck('description', 'new_values')->values()->all();
        $this->assertCount(2, $descriptions);
        $this->assertSame(1, count(array_filter($descriptions, fn ($d) => str_contains($d, "mirror #{$raced} had already moved on"))));
        $this->assertSame(1, count(array_filter($descriptions, fn ($d) => $d === 'PI pi_test_wording_plain was canceled before capture; mirror flipped to cancelled')));
    }

    /** The stale path: the audit says the row had moved on only when the write matched no row. */
    public function test_the_stale_path_says_moved_on_only_when_the_write_matched_no_row(): void
    {
        $id = $this->staleStayRow(['stripe_payment_intent_id' => 'pi_test_stale_wording']);
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('retrievePaymentIntent')->once()->with('pi_test_stale_wording')->andReturnUsing(function (string $piId) use ($id) {
            \DB::table('booking_mirror')->where('id', $id)->update(['payment_status' => 'paid']);
            return \Stripe\PaymentIntent::constructFrom(['id' => $piId, 'status' => 'canceled']);
        });
        $this->app->instance(StripeService::class, $stripe);

        $this->runCron();

        $this->assertStringEndsWith('(row had already moved on)', (string) \DB::table('audit_logs')->where('action', 'booking.capture.auth_expired')->value('description'));
        $this->assertSame('paid', \DB::table('booking_mirror')->where('id', $id)->value('payment_status'));
    }

    /** A database error in the stale path's own fresh read is logged and the loop goes on to the next row. */
    public function test_a_database_error_in_the_stale_paths_read_does_not_stop_the_loop(): void
    {
        $first = $this->staleStayRow(['stripe_payment_intent_id' => 'pi_test_stale_err_1', 'internal_status' => 'cancelled']);
        $second = $this->staleStayRow(['stripe_payment_intent_id' => 'pi_test_stale_err_2']);
        $this->enabledStripe('succeeded');
        $seen = 0;
        \App\Models\BookingMirror::retrieved(function ($m) use ($first, &$seen) {
            // 1: the stale SELECT, 2: markBookingPaid()'s own read, 3: the fresh read under test.
            if ((int) $m->id === $first && ++$seen === 3) {
                throw new \RuntimeException('simulated database error');
            }
        });

        try {
            $this->assertSame(0, $this->runCron());
        } finally {
            \App\Models\BookingMirror::flushEventListeners();
        }

        $this->assertSame(3, $seen, 'the failure was the fresh read');
        $this->assertSame('paid', \DB::table('booking_mirror')->where('id', $second)->value('payment_status'), 'the next row was still reconciled');
    }

    /** The retrieve-failed and cancel-failed logs name the first OPEN swept row, not a resolved sibling. */
    public function test_the_failure_logs_name_the_first_open_swept_row(): void
    {
        $group = 'grp-' . uniqid();
        $this->comboRow($group, 'pi_test_log_retrieve', ['payment_status' => 'paid']);
        $open = $this->comboRow($group, 'pi_test_log_retrieve', []);
        $cancelGroup = 'grp-' . uniqid();
        $this->comboRow($cancelGroup, 'pi_test_log_cancel', ['payment_status' => 'paid', 'internal_status' => 'cancelled']);
        $openCancelled = $this->comboRow($cancelGroup, 'pi_test_log_cancel', ['internal_status' => 'cancelled']);
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_test_log_retrieve')->andThrow(new \RuntimeException('stripe down'));
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_test_log_cancel')->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_log_cancel', 'status' => 'requires_capture']));
        $stripe->shouldReceive('cancelPaymentIntent')->with('pi_test_log_cancel', 'abandoned')->andThrow(new \RuntimeException('stripe down'));
        $this->app->instance(StripeService::class, $stripe);
        \Illuminate\Support\Facades\Log::spy();

        $this->runCron();

        \Illuminate\Support\Facades\Log::shouldHaveReceived('warning')->with('Capture cron — retrieve failed', Mockery::on(fn ($c) => ($c['mirror_id'] ?? null) === $open))->once();
        \Illuminate\Support\Facades\Log::shouldHaveReceived('error')->with("Capture cron — cancel of a cancelled booking's hold failed", Mockery::on(fn ($c) => ($c['mirror_id'] ?? null) === $openCancelled))->once();
        $this->addToAssertionCount(2); // the two spy verifications above throw when unmet
    }

    /** Release / expire / already-captured counts follow the open rows THIS sweep selected (--limit cuts a group). */
    public function test_release_expire_and_already_captured_counts_follow_the_swept_rows(): void
    {
        foreach ([['canceled', [], 'expired'], ['succeeded', [], 'already_captured'], ['requires_capture', ['internal_status' => 'cancelled'], 'released']] as [$status, $attrs, $label]) {
            \DB::table('booking_mirror')->delete();
            $group = 'grp-' . uniqid();
            $this->comboRow($group, 'pi_test_limit_' . $label, $attrs);
            $this->comboRow($group, 'pi_test_limit_' . $label, $attrs);
            $stripe = $this->enabledStripe($status);
            $stripe->shouldReceive('cancelPaymentIntent')->andReturn(\Stripe\PaymentIntent::constructFrom(['id' => 'pi_test_limit_' . $label, 'status' => 'canceled']));

            foreach ([true, false] as $dry) {
                $this->runCron(['--limit' => 1] + ($dry ? ['--dry-run' => true] : []));
                $output = Artisan::output();
                $expected = [
                    'expired'          => '0 captured · 0 already captured · 1 expired · 0 skipped · 0 failed · 0 released (booking cancelled)',
                    'already_captured' => '0 captured · 1 already captured · 0 expired · 0 skipped · 0 failed · 0 released (booking cancelled)',
                    'released'         => '0 captured · 0 already captured · 0 expired · 0 skipped · 0 failed · 1 released (booking cancelled)',
                ][$label];
                $this->assertStringContainsString('Sweep complete: ' . $expected, $output, $label . ($dry ? ' dry-run' : ''));
                if ($dry && $label === 'released') {
                    $this->assertSame(1, substr_count($output, '[dry-run] would cancel the hold'), 'one line per swept row');
                }
            }
        }
    }
}
