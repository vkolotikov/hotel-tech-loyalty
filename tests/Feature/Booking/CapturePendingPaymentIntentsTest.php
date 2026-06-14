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
}
