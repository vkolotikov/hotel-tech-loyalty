<?php

namespace Tests\Feature\Member\Portal;

use App\Mail\AdminBookingCancelledMail;
use App\Mail\BookingCancelledMail;
use App\Mail\BookingRefundMail;
use App\Models\AuditLog;
use App\Models\BookingMirror;
use App\Models\MemberOffer;
use App\Models\ServiceBooking;
use App\Services\StripeService;
use Illuminate\Database\Events\TransactionBeginning;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Mail;
use Mockery;
use Stripe\PaymentIntent;
use Stripe\Refund;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\Feature\Member\MemberEndpointTestCase;

class PortalCancellationTest extends MemberEndpointTestCase
{
    use SetsUpServiceBookingSchema, SetsUpStayBookingSchema, SeedsDiscountFixture, StayPortalFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpStayPortal();
        $this->setUpServiceBookingSchema();
        // The venue's notification goes to its staff.
        DB::table('users')->insert(['name' => 'Front desk', 'email' => 'desk@seaside.test', 'password' => bcrypt('x'), 'user_type' => 'staff', 'organization_id' => $this->org->id, 'created_at' => now(), 'updated_at' => now()]);
    }

    private function appointment(array $attrs = []): ServiceBooking
    {
        app()->instance('current_organization_id', $this->org->id);
        ['service' => $service, 'master' => $master] = $this->seedBookableService($this->org->id);
        $b = ServiceBooking::create(array_merge([
            'organization_id' => $this->org->id, 'service_id' => $service->id, 'service_master_id' => $master->id, 'member_id' => $this->member->id,
            'customer_name' => 'App Member', 'customer_email' => $this->user->email,
            'start_at' => now()->addDays(3), 'end_at' => now()->addDays(3)->addMinutes(45), 'duration_minutes' => 45,
            'service_price' => 60, 'total_amount' => 54, 'list_amount' => 60, 'discount_amount' => 6, 'currency' => 'EUR',
            'status' => 'confirmed', 'payment_status' => 'unpaid', 'source' => 'member_portal',
        ], $attrs));
        app()->forgetInstance('current_organization_id');
        return $b;
    }

    private function stay(array $attrs = []): BookingMirror
    {
        static $n = 0;
        $n++;
        return BookingMirror::withoutGlobalScopes()->create(array_merge([
            'organization_id' => $this->org->id, 'reservation_id' => (string) (990000 + $n), 'booking_reference' => 'BK-PORTAL' . $n,
            'booking_state' => 'confirmed', 'internal_status' => 'confirmed', 'apartment_id' => '101', 'apartment_name' => 'Sea view',
            'channel_name' => 'Member portal', 'member_id' => $this->member->id, 'guest_name' => 'App Member', 'guest_email' => $this->user->email,
            'adults' => 2, 'children' => 0, 'arrival_date' => $this->checkIn, 'departure_date' => $this->checkOut,
            'price_total' => 180, 'payment_status' => 'open', 'payment_method' => 'pay_at_venue',
        ], $attrs));
    }

    private function cancel(string $kind, int $id, ?string $token = null)
    {
        $this->flushHeaders();
        return $this->withToken($token ?? $this->token)->postJson("/api/v1/member/portal/bookings/{$kind}/{$id}/cancel");
    }

    public function test_a_member_cancels_an_appointment_and_both_sides_hear_of_it(): void
    {
        $b = $this->appointment();

        $res = $this->cancel('service', $b->id)->assertOk();

        $res->assertJsonPath('booking.status', 'cancelled')->assertJsonPath('booking.can_cancel', false)->assertJsonPath('booking.id', $b->id)
            ->assertJsonPath('refund.outcome', 'none')->assertJsonPath('refund.coupon_released', false);
        $this->assertSame('cancelled', ServiceBooking::withoutGlobalScopes()->findOrFail($b->id)->status);

        Mail::assertQueued(BookingCancelledMail::class, fn (BookingCancelledMail $m) => $m->hasTo($this->user->email) && $m->bookingReference === $b->booking_reference && $m->money === 'none');
        Mail::assertQueued(AdminBookingCancelledMail::class, fn (AdminBookingCancelledMail $m) => $m->hasTo('desk@seaside.test') && $m->kind === 'service');
        $this->assertSame(1, AuditLog::withoutGlobalScopes()->where('action', 'service_booking.member_cancelled')->where('subject_id', $b->id)->count());
        $this->assertSame(1, DB::table('realtime_events')->where('organization_id', $this->org->id)->where('type', 'booking.cancelled')->count());
    }

    /**
     * An appointment's stored digits are the venue's wall clock; both
     * cancellation mails print them as they are (as the confirmation mail
     * does). At a Riga venue a 10:00 appointment reads 10:00, not 13:00.
     */
    public function test_the_cancellation_mails_give_the_appointments_time_on_the_venues_clock(): void
    {
        if (!\Illuminate\Support\Facades\Schema::hasColumn('organizations', 'timezone')) {
            \Illuminate\Support\Facades\Schema::table('organizations', fn ($t) => $t->string('timezone', 64)->nullable());
        }
        DB::table('organizations')->where('id', $this->org->id)->update(['timezone' => 'Europe/Riga']);
        $this->travelTo(\Carbon\CarbonImmutable::parse('2026-10-01 06:00:00', 'UTC'));
        $b = $this->appointment(['start_at' => '2026-10-05 10:00:00', 'end_at' => '2026-10-05 10:45:00']);

        $this->cancel('service', $b->id)->assertOk()->assertJsonPath('booking.starts_at', '2026-10-05T10:00:00+03:00');

        Mail::assertQueued(BookingCancelledMail::class, fn (BookingCancelledMail $m) => $m->when === 'Oct 5, 2026 · 10:00');
        Mail::assertQueued(AdminBookingCancelledMail::class, fn (AdminBookingCancelledMail $m) => $m->when === 'Oct 5, 2026 · 10:00');
    }

    public function test_a_paid_appointment_is_refunded_and_its_coupon_returned(): void
    {
        $claim = $this->claim(6);
        $b = $this->appointment(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_paid', 'discount_source' => 'offer', 'discount_source_id' => $claim->id]);
        $claim->forceFill(['used_at' => now(), 'status' => 'used', 'used_reference' => $b->booking_reference])->save();
        $stripe = $this->stripe();
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_paid', ['latest_charge'])->andReturn(PaymentIntent::constructFrom(['id' => 'pi_paid', 'status' => 'succeeded']));
        $stripe->shouldReceive('refund')->once()->andReturn(Refund::constructFrom(['id' => 're_1', 'status' => 'succeeded']));

        $this->cancel('service', $b->id)->assertOk()
            ->assertJsonPath('refund.outcome', 'refunded')->assertJsonPath('refund.amount', 54.0)->assertJsonPath('refund.currency', 'EUR')->assertJsonPath('refund.coupon_released', true)
            ->assertJsonPath('booking.payment_status', 'refunded');

        $this->assertNull(MemberOffer::findOrFail($claim->id)->used_at);
        Mail::assertQueued(BookingCancelledMail::class, fn (BookingCancelledMail $m) => $m->money === 'refunded' && $m->amount === 54.0);
    }

    public function test_a_member_cancels_a_stay(): void
    {
        $m = $this->stay();
        $this->smoobu->shouldReceive('cancelReservation')->once()->with($m->reservation_id)->andReturn([]);

        $this->cancel('stay', $m->id)->assertOk()
            ->assertJsonPath('booking.kind', 'stay')->assertJsonPath('booking.status', 'cancelled')->assertJsonPath('refund.outcome', 'none');

        Mail::assertQueued(BookingCancelledMail::class, fn (BookingCancelledMail $mail) => $mail->hasTo($this->user->email) && $mail->title === 'Sea view');
        Mail::assertQueued(AdminBookingCancelledMail::class, fn (AdminBookingCancelledMail $mail) => $mail->kind === 'stay');
        $this->assertSame(1, AuditLog::withoutGlobalScopes()->where('action', 'booking.member_cancelled')->where('subject_id', $m->id)->count());
    }

    /** When the PMS refuses, the venue's mail says the reservation must be cancelled there by hand. */
    public function test_the_venue_is_told_to_cancel_by_hand_when_the_pms_refused(): void
    {
        $refused = $this->stay();
        $ok = $this->stay();
        $this->smoobu->shouldReceive('cancelReservation')->with($refused->reservation_id)->andThrow(new \RuntimeException('Smoobu API error: 500'));
        $this->smoobu->shouldReceive('cancelReservation')->with($ok->reservation_id)->andReturn([]);

        $this->cancel('stay', $refused->id)->assertOk()->assertJsonMissingPath('refund.pms_cancelled');
        $this->cancel('stay', $ok->id)->assertOk();

        Mail::assertQueued(AdminBookingCancelledMail::class, fn (AdminBookingCancelledMail $m) => $m->bookingReference === $refused->booking_reference && $m->pmsFailed === true);
        Mail::assertQueued(AdminBookingCancelledMail::class, fn (AdminBookingCancelledMail $m) => $m->bookingReference === $ok->booking_reference && $m->pmsFailed === false);
    }

    /** A booking with no contact email still tells the member — at their own account email. */
    public function test_the_member_is_mailed_at_their_own_email_when_the_booking_has_none(): void
    {
        $b = $this->appointment(['customer_email' => '']);
        $m = $this->stay(['guest_email' => null]);
        $this->smoobu->shouldReceive('cancelReservation')->andReturn([]);

        $this->cancel('service', $b->id)->assertOk();
        $this->cancel('stay', $m->id)->assertOk();

        Mail::assertQueued(BookingCancelledMail::class, fn (BookingCancelledMail $mail) => $mail->hasTo($this->user->email) && $mail->bookingReference === $b->booking_reference);
        Mail::assertQueued(BookingCancelledMail::class, fn (BookingCancelledMail $mail) => $mail->hasTo($this->user->email) && $mail->bookingReference === $m->booking_reference);
    }

    public function test_a_refunded_stay_sends_the_member_one_mail_not_two(): void
    {
        $m = $this->stay(['payment_status' => 'paid', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_stay', 'price_paid' => 180]);
        $stripe = $this->stripe();
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_stay')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_stay', 'status' => 'succeeded']));
        $stripe->shouldReceive('refund')->once()->andReturn(Refund::constructFrom(['id' => 're_stay', 'status' => 'succeeded']));
        $this->smoobu->shouldReceive('cancelReservation')->once()->andReturn([]);

        $this->cancel('stay', $m->id)->assertOk()->assertJsonPath('refund.outcome', 'refunded')->assertJsonPath('refund.amount', 180.0);

        Mail::assertQueued(BookingRefundMail::class, 1);
        Mail::assertNotQueued(BookingCancelledMail::class);
        Mail::assertQueued(AdminBookingCancelledMail::class, 1);
    }

    public function test_cancelling_twice_refunds_once(): void
    {
        $b = $this->appointment(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_paid']);
        $stripe = $this->stripe();
        $stripe->shouldReceive('retrievePaymentIntent')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_paid', 'status' => 'succeeded']));
        $stripe->shouldReceive('refund')->once()->andReturn(Refund::constructFrom(['id' => 're_1', 'status' => 'succeeded']));

        $this->cancel('service', $b->id)->assertOk();
        $this->cancel('service', $b->id)->assertStatus(409)->assertJsonPath('error', 'already_cancelled');

        Mail::assertQueued(BookingCancelledMail::class, 1);
        Mail::assertQueued(AdminBookingCancelledMail::class, 1);
    }

    public function test_a_booking_staff_already_cancelled_cannot_be_cancelled_again(): void
    {
        $this->stripe()->shouldNotReceive('refund');
        $b = $this->appointment(['status' => 'cancelled', 'cancelled_at' => now(), 'cancellation_reason' => 'Staff: double booking']);

        $this->cancel('service', $b->id)->assertStatus(409)->assertJsonPath('error', 'already_cancelled');
        $this->assertSame('Staff: double booking', ServiceBooking::withoutGlobalScopes()->findOrFail($b->id)->cancellation_reason);
        Mail::assertNothingQueued();
    }

    public function test_outside_the_window_the_member_is_told_to_contact_the_venue(): void
    {
        $soon = $this->appointment(['start_at' => now()->addHours(5), 'end_at' => now()->addHours(6)]);
        $this->cancel('service', $soon->id)->assertStatus(422)->assertJsonPath('error', 'outside_policy');

        $stay = $this->stay(['arrival_date' => now()->addDay()->toDateString(), 'departure_date' => now()->addDays(3)->toDateString()]);
        $this->smoobu->shouldNotReceive('cancelReservation');
        $this->cancel('stay', $stay->id)->assertStatus(422)->assertJsonPath('error', 'outside_policy');

        $this->assertSame('confirmed', ServiceBooking::withoutGlobalScopes()->findOrFail($soon->id)->status);
        Mail::assertNothingQueued();
    }

    public function test_nobody_cancels_another_members_booking_or_another_venues(): void
    {
        $b = $this->appointment();
        $m = $this->stay();
        ['token' => $stranger] = $this->member($this->org);
        $elsewhere = $this->tenant('Other Venue');
        ['token' => $foreign] = $this->member($elsewhere);
        $this->smoobu->shouldNotReceive('cancelReservation');

        foreach ([$stranger, $foreign] as $token) {
            $this->cancel('service', $b->id, $token)->assertStatus(404)->assertJsonPath('error', 'not_found');
            $this->cancel('stay', $m->id, $token)->assertStatus(404)->assertJsonPath('error', 'not_found');
        }
        $this->assertSame('confirmed', ServiceBooking::withoutGlobalScopes()->findOrFail($b->id)->status);
        $this->assertSame('confirmed', BookingMirror::withoutGlobalScopes()->findOrFail($m->id)->internal_status);
    }

    /** The two remaining ownership cases — a booking with no member, and an id that does not exist — are 404 and touch nothing. */
    public function test_a_booking_with_no_member_and_a_missing_id_are_not_found_and_touch_nothing(): void
    {
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('retrievePaymentIntent');
        $stripe->shouldNotReceive('refund');
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $this->smoobu->shouldNotReceive('cancelReservation');
        $b = $this->appointment(['member_id' => null, 'customer_email' => 'walk-in@example.test', 'payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_walkin']);
        $m = $this->stay(['member_id' => null, 'channel_name' => 'Website', 'guest_email' => 'widget-guest@example.test', 'payment_status' => 'paid', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_widget']);
        $beforeB = ServiceBooking::withoutGlobalScopes()->findOrFail($b->id)->getAttributes();
        $beforeM = BookingMirror::withoutGlobalScopes()->findOrFail($m->id)->getAttributes();

        $this->cancel('service', $b->id)->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->cancel('stay', $m->id)->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->cancel('service', 999999999)->assertStatus(404)->assertJsonPath('error', 'not_found');
        $this->cancel('stay', 999999999)->assertStatus(404)->assertJsonPath('error', 'not_found');

        $this->assertSame($beforeB, ServiceBooking::withoutGlobalScopes()->findOrFail($b->id)->getAttributes());
        $this->assertSame($beforeM, BookingMirror::withoutGlobalScopes()->findOrFail($m->id)->getAttributes());
        Mail::assertNothingQueued();
    }

    public function test_a_refund_that_fails_answers_502_and_tells_nobody(): void
    {
        $b = $this->appointment(['payment_status' => 'paid', 'stripe_payment_intent_id' => 'pi_paid']);
        $stripe = $this->stripe();
        $stripe->shouldReceive('retrievePaymentIntent')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_paid', 'status' => 'succeeded']));
        $stripe->shouldReceive('refund')->andThrow(new \RuntimeException('stripe down'));

        $this->cancel('service', $b->id)->assertStatus(502)->assertJsonPath('error', 'refund_failed');

        $this->assertSame('confirmed', ServiceBooking::withoutGlobalScopes()->findOrFail($b->id)->status);
        Mail::assertNothingQueued();
    }

    public function test_an_unknown_kind_and_a_staff_token_are_refused(): void
    {
        $b = $this->appointment();
        $this->cancel('table', $b->id)->assertStatus(404);
    }

    /**
     * cancelService()/cancelStay() manage their own transaction phases —
     * cancelStay() in particular commits a captured payment's refund
     * record before it ever calls Stripe (see MemberCancellation's class
     * docblock). Wrapping the controller's call to either method in its
     * own DB::transaction() would undo that guarantee, so this asserts
     * the deepest transaction nesting reached during the request is
     * exactly what MemberCancellation itself opens — nothing more.
     */
    public function test_the_endpoint_adds_no_transaction_of_its_own_around_cancelling_a_service_booking(): void
    {
        $b = $this->appointment();
        $base = DB::transactionLevel();
        $max = $base;
        Event::listen(TransactionBeginning::class, function (TransactionBeginning $event) use (&$max): void {
            $max = max($max, $event->connection->transactionLevel());
        });

        $this->cancel('service', $b->id)->assertOk();

        // cancelService() opens exactly one DB::transaction() of its own
        // (it writes no nested audit row for a service booking); a
        // controller-level wrapper would nest a second level here.
        $this->assertSame($base + 1, $max, 'a controller-level transaction would nest one level deeper than cancelService() opens on its own');
    }

    public function test_the_endpoint_adds_no_transaction_of_its_own_around_cancelling_a_stay(): void
    {
        $m = $this->stay();
        $this->smoobu->shouldReceive('cancelReservation')->once()->andReturn([]);
        $base = DB::transactionLevel();
        $max = $base;
        Event::listen(TransactionBeginning::class, function (TransactionBeginning $event) use (&$max): void {
            $max = max($max, $event->connection->transactionLevel());
        });

        $this->cancel('stay', $m->id)->assertOk();

        // cancelStay() opens its own phase transaction, and — inside it —
        // auditMemberCancelled() takes a further nested SAVEPOINT by
        // design (so a failing audit insert cannot poison the
        // cancellation write); that is MemberCancellation's own nesting,
        // not the controller's. A controller-level wrapper would nest one
        // level deeper again.
        $this->assertSame($base + 2, $max, 'a controller-level transaction would nest one level deeper than cancelStay() + its own audit savepoint');
    }

    public function test_an_unexpected_failure_answers_500_without_claiming_nothing_happened(): void
    {
        $m = $this->stay(['stripe_payment_intent_id' => 'pi_live_x', 'payment_method' => 'stripe']);
        // A fresh mock, not the StayPortalFixture::stripe() one: that
        // fixture already stubs isEnabled() to return true, and a second
        // shouldReceive() on the same method does not reliably override
        // it — this needs isEnabled() itself to throw, unconditionally.
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andThrow(new \RuntimeException('stripe config exploded'));
        $this->app->instance(StripeService::class, $stripe);

        $res = $this->cancel('stay', $m->id)->assertStatus(500)->assertJsonPath('error', 'cancel_failed');
        $res->assertJsonPath('message', 'We could not finish cancelling this booking. If a refund was due it may already be on its way. Please try again, or contact the venue.');
        $res->assertJsonPath('booking.id', $m->id)->assertJsonPath('booking.kind', 'stay');

        Mail::assertNothingQueued();
    }
}
