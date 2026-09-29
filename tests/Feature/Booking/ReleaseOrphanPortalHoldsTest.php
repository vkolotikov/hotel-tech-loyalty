<?php

namespace Tests\Feature\Booking;

use App\Models\HotelSetting;
use App\Models\Organization;
use App\Services\StripeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Mockery;
use Stripe\PaymentIntent;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\TestCase;

/**
 * A member's card was authorised, then the browser closed before the
 * booking was written: nothing in the database carries the payment, so
 * nothing looked for it and the hold sat on the card for a week.
 */
class ReleaseOrphanPortalHoldsTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpServiceBookingSchema;

    private Organization $org;
    private $stripe;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpCapturePendingSchema();
        $this->setUpServiceBookingSchema();
        $this->org = Organization::create(['name' => 'Seaside Hotel', 'slug' => 'seaside-' . uniqid()]);
        $row = new HotelSetting();
        $row->organization_id = $this->org->id;
        $row->key = 'booking_payment_enabled';
        $row->value = 'true';
        $row->save();

        $this->stripe = Mockery::mock(StripeService::class);
        $this->stripe->shouldReceive('isEnabled')->andReturn(true);
        $this->app->instance(StripeService::class, $this->stripe);
        $this->travelTo('2026-10-01 12:00:00');
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        Mockery::close();
        parent::tearDown();
    }

    private function intent(string $id, array $top = [], array $meta = []): PaymentIntent
    {
        $created = $top['created'] ?? now()->subHours(2)->timestamp;
        return PaymentIntent::constructFrom(array_merge([
            'id' => $id, 'status' => 'requires_capture', 'amount' => 18000, 'currency' => 'eur', 'created' => $created,
            // An expanded charge, as releaseOrphan() requests via
            // retrievePaymentIntent(..., ['latest_charge']) — authorizedAt()
            // fails closed without one, so every happy-path fixture needs a
            // real one by default; a test that wants "no expanded charge"
            // overrides this via $top.
            'latest_charge' => ['id' => 'ch_' . $id, 'object' => 'charge', 'created' => $created, 'captured' => false],
        ], $top, [
            'metadata' => array_merge(['kind' => 'portal_stay_booking', 'org_id' => (string) $this->org->id, 'member_id' => '41', 'portal_hold_token' => 'H'], $meta),
        ]));
    }

    private function run_(array $options = []): string
    {
        // Not $this->artisan(...): PendingCommand::run() drives the Kernel
        // through its own Mockery-wrapped OutputStyle (see
        // Illuminate\Testing\PendingCommand::mockConsoleOutput()), which is
        // a SEPARATE object from the one Illuminate\Console\Application
        // remembers as lastOutput — so a later Artisan::output() always
        // comes back empty, regardless of what the command printed.
        // Artisan::call() is the framework's own working pattern for
        // "run it and then read what it printed" (see
        // CapturePendingPaymentIntentsTest::runCron()), and asserting the
        // exit code straight off its return value checks exactly what
        // ->assertExitCode(0) would have.
        $exitCode = \Illuminate\Support\Facades\Artisan::call('bookings:release-orphan-portal-holds', $options);
        $this->assertSame(0, $exitCode);
        return \Illuminate\Support\Facades\Artisan::output();
    }

    public function test_a_held_card_no_booking_carries_is_released(): void
    {
        $orphan = $this->intent('pi_orphan');
        $orphanSvc = $this->intent('pi_orphan_svc', [], ['kind' => 'portal_service_booking']);
        $this->stripe->shouldReceive('listPaymentIntents')->once()->andReturn([$orphan, $orphanSvc]);
        // releaseOrphan() re-checks fresh under the lock — the list read
        // alone is only a cheap first pass.
        $this->stripe->shouldReceive('retrievePaymentIntent')->once()->with('pi_orphan', ['latest_charge'])->andReturn($orphan);
        $this->stripe->shouldReceive('retrievePaymentIntent')->once()->with('pi_orphan_svc', ['latest_charge'])->andReturn($orphanSvc);
        $this->stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_orphan', 'abandoned');
        $this->stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_orphan_svc', 'abandoned');

        $this->artisan('bookings:release-orphan-portal-holds')->assertExitCode(0);

        $this->assertSame(2, DB::table('audit_logs')->where('action', 'portal.hold.orphan_released')->where('organization_id', $this->org->id)->count());
    }

    public function test_a_payment_a_booking_carries_is_never_touched(): void
    {
        DB::table('booking_mirror')->insert(['organization_id' => $this->org->id, 'reservation_id' => 'R-1', 'stripe_payment_intent_id' => 'pi_stay', 'price_total' => 180, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('service_bookings')->insert(['organization_id' => $this->org->id, 'booking_reference' => 'SVC-1', 'service_id' => 1, 'customer_name' => 'A', 'customer_email' => 'a@example.test', 'start_at' => now(), 'end_at' => now(), 'duration_minutes' => 45, 'stripe_payment_intent_id' => 'pi_service', 'created_at' => now(), 'updated_at' => now()]);
        $this->stripe->shouldReceive('listPaymentIntents')->andReturn([$this->intent('pi_stay'), $this->intent('pi_service', [], ['kind' => 'portal_service_booking'])]);
        // carried() is checked BEFORE the fresh retrieve in releaseOrphan()
        // — a carried intent never even asks Stripe about itself again.
        $this->stripe->shouldNotReceive('retrievePaymentIntent');
        $this->stripe->shouldNotReceive('cancelPaymentIntent');

        $this->artisan('bookings:release-orphan-portal-holds')->assertExitCode(0);

        $this->assertSame(0, DB::table('audit_logs')->where('action', 'portal.hold.orphan_released')->count());
    }

    public function test_only_the_portals_own_old_held_intents_of_this_organisation(): void
    {
        $this->stripe->shouldReceive('listPaymentIntents')->andReturn([
            $this->intent('pi_widget', [], ['kind' => null, 'hold_token' => 'W']),                       // the public widget's
            // Passing an empty array as $top's 'metadata' is clobbered by
            // intent()'s own trailing `'metadata' => array_merge($defaults,
            // $meta)` (array_merge keeps the LAST occurrence of a string
            // key) — verified with `php -r`, so this is not a production
            // bug: passed as $top it silently reproduces the DEFAULT
            // metadata (same kind + org_id as a genuine orphan), which
            // would make this fixture indistinguishable from one and the
            // assertion below unsatisfiable by any implementation. Nulling
            // `kind` via $meta instead is the same "not the portal's" case
            // the comment describes, reached the way the helper actually
            // allows overriding metadata.
            $this->intent('pi_no_meta', [], ['kind' => null]),                                          // somebody else's integration
            $this->intent('pi_fresh', ['created' => now()->subMinutes(10)->timestamp]),                 // the member may still be paying
            $this->intent('pi_unfinished', ['status' => 'requires_payment_method']),                    // no card is held
            $this->intent('pi_taken', ['status' => 'succeeded']),                                       // captured: a refund is a person's decision
            $this->intent('pi_gone', ['status' => 'canceled']),
            $this->intent('pi_other_org', [], ['org_id' => (string) ($this->org->id + 1)]),
        ]);
        // None of these seven pass the command's own cheap pre-filter —
        // releaseOrphan() (and so a fresh retrieve) is never reached.
        $this->stripe->shouldNotReceive('retrievePaymentIntent');
        $this->stripe->shouldNotReceive('cancelPaymentIntent');

        $this->artisan('bookings:release-orphan-portal-holds')->assertExitCode(0);
    }

    /** A real Stripe intent with truly empty metadata (not the portal's, and not the public widget's either) is untouched. */
    public function test_a_real_no_metadata_intent_is_untouched(): void
    {
        $foreign = PaymentIntent::constructFrom([
            'id' => 'pi_foreign', 'status' => 'requires_capture', 'amount' => 5000, 'currency' => 'eur',
            'created' => now()->subHours(2)->timestamp, 'metadata' => [],
        ]);
        $this->stripe->shouldReceive('listPaymentIntents')->once()->andReturn([$foreign]);
        $this->stripe->shouldNotReceive('retrievePaymentIntent');
        $this->stripe->shouldNotReceive('cancelPaymentIntent');

        $this->artisan('bookings:release-orphan-portal-holds')->assertExitCode(0);

        $this->assertSame(0, DB::table('audit_logs')->where('action', 'portal.hold.orphan_released')->count());
    }

    public function test_a_dry_run_names_the_hold_and_releases_nothing(): void
    {
        $this->stripe->shouldReceive('listPaymentIntents')->andReturn([$this->intent('pi_orphan')]);
        $this->stripe->shouldNotReceive('retrievePaymentIntent');
        $this->stripe->shouldNotReceive('cancelPaymentIntent');

        $this->assertStringContainsString('[dry-run] would release pi_orphan', $this->run_(['--dry-run' => true]));
        $this->assertSame(0, DB::table('audit_logs')->count());
    }

    /** A service booking still awaiting staff confirmation carries its intent uncaptured for days by design — --dry-run must not report it. */
    public function test_a_dry_run_prints_nothing_for_a_carried_intent(): void
    {
        DB::table('service_bookings')->insert(['organization_id' => $this->org->id, 'booking_reference' => 'SVC-2', 'service_id' => 1, 'customer_name' => 'A', 'customer_email' => 'a@example.test', 'start_at' => now(), 'end_at' => now(), 'duration_minutes' => 45, 'stripe_payment_intent_id' => 'pi_carried', 'created_at' => now(), 'updated_at' => now()]);
        $carried = $this->intent('pi_carried', [], ['kind' => 'portal_service_booking']);
        $this->stripe->shouldReceive('listPaymentIntents')->once()->andReturn([$carried]);
        $this->stripe->shouldNotReceive('retrievePaymentIntent');
        $this->stripe->shouldNotReceive('cancelPaymentIntent');

        $output = $this->run_(['--dry-run' => true]);

        $this->assertStringNotContainsString('pi_carried', $output);
        $this->assertSame(0, DB::table('audit_logs')->count());
    }

    public function test_a_stripe_failure_for_one_venue_does_not_stop_the_run(): void
    {
        $this->stripe->shouldReceive('listPaymentIntents')->andThrow(new \RuntimeException('stripe down'));

        $this->artisan('bookings:release-orphan-portal-holds')->assertExitCode(0);
    }

    /** One org's list() failing must not stop the sweep of a second org. */
    public function test_a_stripe_failure_for_one_venue_still_sweeps_the_next(): void
    {
        $org2 = Organization::create(['name' => 'Harbor Spa', 'slug' => 'harbor-' . uniqid()]);
        $row = new HotelSetting();
        $row->organization_id = $org2->id;
        $row->key = 'booking_payment_enabled';
        $row->value = 'true';
        $row->save();

        $orphan2 = PaymentIntent::constructFrom([
            'id' => 'pi_org2', 'status' => 'requires_capture', 'amount' => 9000, 'currency' => 'eur',
            'created' => now()->subHours(2)->timestamp,
            'latest_charge' => ['id' => 'ch_org2', 'object' => 'charge', 'created' => now()->subHours(2)->timestamp, 'captured' => false],
            'metadata' => ['kind' => 'portal_service_booking', 'org_id' => (string) $org2->id, 'member_id' => '7'],
        ]);

        // Tied to whichever org is actually bound when the command asks —
        // robust regardless of the two orgs' sweep order.
        $this->stripe->shouldReceive('listPaymentIntents')->twice()->andReturnUsing(function () use ($orphan2) {
            if ((int) app('current_organization_id') === $this->org->id) {
                throw new \RuntimeException('stripe down');
            }
            return [$orphan2];
        });
        $this->stripe->shouldReceive('retrievePaymentIntent')->once()->with('pi_org2', ['latest_charge'])->andReturn($orphan2);
        $this->stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_org2', 'abandoned');

        $this->artisan('bookings:release-orphan-portal-holds')->assertExitCode(0);

        $this->assertSame(1, DB::table('audit_logs')->where('action', 'portal.hold.orphan_released')->where('organization_id', $org2->id)->count());
    }

    /** Stripe refusing the cancel must not write an audit row claiming a release that never happened. */
    public function test_a_failing_cancel_writes_no_audit_row(): void
    {
        $orphan = $this->intent('pi_fails');
        $this->stripe->shouldReceive('listPaymentIntents')->once()->andReturn([$orphan]);
        $this->stripe->shouldReceive('retrievePaymentIntent')->once()->with('pi_fails', ['latest_charge'])->andReturn($orphan);
        $this->stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_fails', 'abandoned')->andThrow(new \RuntimeException('stripe rejected the cancel'));

        $this->artisan('bookings:release-orphan-portal-holds')->assertExitCode(0);

        $this->assertSame(0, DB::table('audit_logs')->where('action', 'portal.hold.orphan_released')->count());
    }

    /**
     * --minutes is honoured, and floored at 20 (never sharper than the
     * default's safety margin).
     *
     * A 30-minute-old intent alone does not prove the floor — it is
     * released by --minutes=5 whether or not max(20, …) is applied. What
     * actually proves the floor is a 10-minute-old intent: --minutes=5
     * taken literally would release it (10 > 5 minutes old), but the
     * floored 20-minute cutoff must still refuse it.
     */
    public function test_minutes_option_is_honoured_and_floored_at_twenty(): void
    {
        $tenMinAgo = $this->intent('pi_ten', ['created' => now()->subMinutes(10)->timestamp]);
        $thirtyMinAgo = $this->intent('pi_thirty', ['created' => now()->subMinutes(30)->timestamp]);

        // Default 45 minutes: 30 minutes old is too fresh.
        $this->stripe->shouldReceive('listPaymentIntents')->once()->andReturn([$thirtyMinAgo]);
        $this->stripe->shouldNotReceive('retrievePaymentIntent');
        $this->stripe->shouldNotReceive('cancelPaymentIntent');
        $this->artisan('bookings:release-orphan-portal-holds')->assertExitCode(0);
        $this->assertSame(0, DB::table('audit_logs')->count());

        // --minutes=5 floors to 20: the 10-minute-old intent must still be
        // refused (the proof the floor is applied); the 30-minute-old one
        // clears the floored 20-minute bar.
        $this->stripe->shouldReceive('listPaymentIntents')->once()->andReturn([$tenMinAgo, $thirtyMinAgo]);
        $this->stripe->shouldReceive('retrievePaymentIntent')->once()->with('pi_thirty', ['latest_charge'])->andReturn($thirtyMinAgo);
        $this->stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_thirty', 'abandoned');
        $this->artisan('bookings:release-orphan-portal-holds', ['--minutes' => 5])->assertExitCode(0);
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'portal.hold.orphan_released')->count());
    }

    /**
     * Age is judged from the AUTHORISATION (the expanded latest_charge's
     * own `created`), never from the intent's own `created` alone — a
     * member who leaves the pay step open for two hours, then pays, is
     * never eligible however old the intent itself is.
     */
    public function test_an_old_intent_authorised_recently_is_not_released(): void
    {
        $charge = ['id' => 'ch_recent', 'object' => 'charge', 'created' => now()->subMinutes(2)->timestamp];
        // created two hours ago (left open at the pay step); authorised two
        // minutes ago.
        $stale = $this->intent('pi_stale_created', ['latest_charge' => $charge]);
        $this->stripe->shouldReceive('listPaymentIntents')->once()->andReturn([$stale]);
        $this->stripe->shouldReceive('retrievePaymentIntent')->once()->with('pi_stale_created', ['latest_charge'])->andReturn($stale);
        $this->stripe->shouldNotReceive('cancelPaymentIntent');

        $this->artisan('bookings:release-orphan-portal-holds')->assertExitCode(0);

        $this->assertSame(0, DB::table('audit_logs')->where('action', 'portal.hold.orphan_released')->count());
    }

    /**
     * authorizedAt() fails CLOSED. A requires_capture intent whose
     * latest_charge is not an expanded object — just the bare id string
     * Stripe returns when a caller doesn't ask for `expand`, or when
     * something upstream strips it — must never be released; a fallback to
     * the intent's own `created` here would defeat the whole point of
     * judging age from the authorisation.
     */
    public function test_an_unexpanded_charge_id_is_never_released(): void
    {
        $bare = $this->intent('pi_bare_charge', ['latest_charge' => 'ch_bare_123']);
        $this->stripe->shouldReceive('listPaymentIntents')->once()->andReturn([$bare]);
        $this->stripe->shouldReceive('retrievePaymentIntent')->once()->with('pi_bare_charge', ['latest_charge'])->andReturn($bare);
        $this->stripe->shouldNotReceive('cancelPaymentIntent');

        $this->artisan('bookings:release-orphan-portal-holds')->assertExitCode(0);

        $this->assertSame(0, DB::table('audit_logs')->where('action', 'portal.hold.orphan_released')->count());
    }

    /**
     * releaseOrphan()'s own fresh recheck under the lock, not just the
     * list's (possibly stale) view. In each case the
     * LIST result looks eligible — passes the command's cheap pre-filter —
     * but the FRESH retrieve taken under the lock tells a different story,
     * and must be believed instead.
     */
    public function test_the_fresh_recheck_refuses_an_intent_captured_since_the_list_was_read(): void
    {
        $listed = $this->intent('pi_race_succeeded');
        $fresh = $this->intent('pi_race_succeeded', ['status' => 'succeeded']);
        $this->stripe->shouldReceive('listPaymentIntents')->once()->andReturn([$listed]);
        $this->stripe->shouldReceive('retrievePaymentIntent')->once()->with('pi_race_succeeded', ['latest_charge'])->andReturn($fresh);
        $this->stripe->shouldNotReceive('cancelPaymentIntent');

        $this->artisan('bookings:release-orphan-portal-holds')->assertExitCode(0);

        $this->assertSame(0, DB::table('audit_logs')->where('action', 'portal.hold.orphan_released')->count());
    }

    public function test_the_fresh_recheck_refuses_an_intent_already_cancelled_since_the_list_was_read(): void
    {
        $listed = $this->intent('pi_race_cancelled');
        $fresh = $this->intent('pi_race_cancelled', ['status' => 'canceled']);
        $this->stripe->shouldReceive('listPaymentIntents')->once()->andReturn([$listed]);
        $this->stripe->shouldReceive('retrievePaymentIntent')->once()->with('pi_race_cancelled', ['latest_charge'])->andReturn($fresh);
        $this->stripe->shouldNotReceive('cancelPaymentIntent');

        $this->artisan('bookings:release-orphan-portal-holds')->assertExitCode(0);

        $this->assertSame(0, DB::table('audit_logs')->where('action', 'portal.hold.orphan_released')->count());
    }

    public function test_the_fresh_recheck_refuses_when_the_metadata_names_another_organisation(): void
    {
        $listed = $this->intent('pi_race_org');
        $fresh = $this->intent('pi_race_org', [], ['org_id' => (string) ($this->org->id + 1)]);
        $this->stripe->shouldReceive('listPaymentIntents')->once()->andReturn([$listed]);
        $this->stripe->shouldReceive('retrievePaymentIntent')->once()->with('pi_race_org', ['latest_charge'])->andReturn($fresh);
        $this->stripe->shouldNotReceive('cancelPaymentIntent');

        $this->artisan('bookings:release-orphan-portal-holds')->assertExitCode(0);

        $this->assertSame(0, DB::table('audit_logs')->where('action', 'portal.hold.orphan_released')->count());
    }

    public function test_the_fresh_recheck_refuses_when_the_kind_is_no_longer_the_portals(): void
    {
        $listed = $this->intent('pi_race_kind');
        $fresh = $this->intent('pi_race_kind', [], ['kind' => 'something_else']);
        $this->stripe->shouldReceive('listPaymentIntents')->once()->andReturn([$listed]);
        $this->stripe->shouldReceive('retrievePaymentIntent')->once()->with('pi_race_kind', ['latest_charge'])->andReturn($fresh);
        $this->stripe->shouldNotReceive('cancelPaymentIntent');

        $this->artisan('bookings:release-orphan-portal-holds')->assertExitCode(0);

        $this->assertSame(0, DB::table('audit_logs')->where('action', 'portal.hold.orphan_released')->count());
    }

    public function test_a_venue_without_online_payments_is_not_asked(): void
    {
        HotelSetting::withoutGlobalScopes()->where('organization_id', $this->org->id)->where('key', 'booking_payment_enabled')->update(['value' => 'false']);
        $this->stripe->shouldNotReceive('listPaymentIntents');

        $this->artisan('bookings:release-orphan-portal-holds')->assertExitCode(0);
    }

    /** The overlap lock outlasts the thirty-minute interval. */
    public function test_the_schedule_overlap_lock_outlasts_the_interval(): void
    {
        $event = collect(app(\Illuminate\Console\Scheduling\Schedule::class)->events())
            ->first(fn ($e) => str_contains((string) $e->command, 'bookings:release-orphan-portal-holds'));

        $this->assertNotNull($event);
        $this->assertSame('*/30 * * * *', $event->expression);
        $this->assertTrue($event->withoutOverlapping);
        $this->assertGreaterThan(30, $event->expiresAt);
    }
}
