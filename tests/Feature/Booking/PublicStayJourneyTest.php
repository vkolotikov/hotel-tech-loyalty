<?php

namespace Tests\Feature\Booking;

use App\Models\BookingHold;
use Stripe\PaymentIntent;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\Feature\Member\MemberEndpointTestCase;
use Tests\Feature\Member\Portal\StayPortalFixture;

class PublicStayJourneyTest extends MemberEndpointTestCase
{
    use SetsUpStayBookingSchema, SeedsDiscountFixture, StayPortalFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpStayPortal();
        $this->smoobuRates();
    }

    private function endpoint(string $path): string
    {
        return '/api/v1/booking/' . $path . '?org=' . $this->org->widget_token;
    }

    private function quote(): BookingHold
    {
        $q = $this->postJson($this->endpoint('quote'), ['unit_id' => '101', 'check_in' => $this->checkIn, 'check_out' => $this->checkOut, 'adults' => 2])->assertOk();
        return BookingHold::withoutGlobalScopes()->where('hold_token', $q->json('hold_token'))->sole();
    }

    private function cachedHold(): BookingHold
    {
        $h = $this->quote();
        $h->update(['payload_json' => $h->payload_json + ['stripe_payment_intent_id' => 'pi_journey', 'stripe_client_secret' => 'fixture_secret', 'stripe_amount_cents' => 20000]]);
        return $h;
    }

    public function test_a_manipulated_quote_cannot_skip_the_venues_night_limits(): void
    {
        $this->setting('booking_min_nights', '3');
        $this->postJson($this->endpoint('quote'), ['unit_id' => '101', 'check_in' => $this->checkIn, 'check_out' => $this->checkOut])->assertStatus(422)->assertJsonPath('code', 'invalid_stay');
        $this->assertSame(0, BookingHold::withoutGlobalScopes()->count());
        $this->setting('booking_min_nights', '1');
        $this->setting('booking_max_nights', '1');
        $this->postJson($this->endpoint('quote'), ['unit_id' => '101', 'check_in' => $this->checkIn, 'check_out' => $this->checkOut])->assertStatus(422);
    }

    public function test_config_and_quote_agree_on_the_venues_day_across_utc_midnight(): void
    {
        if (!\Illuminate\Support\Facades\Schema::hasColumn('organizations', 'timezone')) {
            \Illuminate\Support\Facades\Schema::table('organizations', fn ($t) => $t->string('timezone')->nullable());
        }
        $this->org->forceFill(['timezone' => 'America/Los_Angeles'])->save();
        $this->travelTo('2026-11-14 02:00:00');
        $this->getJson($this->endpoint('config'))->assertOk()->assertJsonPath('today', '2026-11-13');
        $this->postJson($this->endpoint('quote'), ['unit_id' => '101', 'check_in' => '2026-11-13', 'check_out' => '2026-11-15'])->assertOk();
    }

    public function test_contact_and_requests_are_saved_before_any_card_authorisation(): void
    {
        $h = $this->quote();
        $stripe = $this->stripe();
        $stripe->shouldReceive('createPaymentIntent')->once()->andReturnUsing(function () use ($h) {
            $p = $h->fresh()->payload_json;
            $this->assertSame('guest@example.test', $p['guest']['email']);
            $this->assertSame('Late arrival', $p['guest']['special_requests']);
            $this->assertSame(2, $p['widget_checkout_version']);
            return ['client_secret' => 'fixture_secret', 'payment_intent_id' => 'pi_journey'];
        });
        $this->postJson($this->endpoint('payment-intent'), ['hold_token' => $h->hold_token, 'guest' => ['first_name' => 'Test', 'last_name' => 'Guest', 'email' => 'guest@example.test'], 'special_requests' => 'Late arrival'])->assertOk();
    }

    public function test_a_completed_payment_is_resumed_even_when_the_client_requests_a_new_intent(): void
    {
        $h = $this->cachedHold();
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('createPaymentIntent');
        $stripe->shouldReceive('retrievePaymentIntent')->once()->with('pi_journey')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_journey', 'status' => 'requires_capture']));
        $this->postJson($this->endpoint('payment-intent'), ['hold_token' => $h->hold_token, 'force_new' => true])->assertOk()->assertJsonPath('payment_received', true)->assertJsonPath('payment_intent_id', 'pi_journey');
    }

    public function test_a_card_form_retry_reuses_the_unfunded_payment_instead_of_making_another(): void
    {
        $h = $this->cachedHold();
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('createPaymentIntent');
        $stripe->shouldReceive('retrievePaymentIntent')->once()->andReturn(PaymentIntent::constructFrom(['id' => 'pi_journey', 'status' => 'requires_payment_method']));
        $this->postJson($this->endpoint('payment-intent'), ['hold_token' => $h->hold_token, 'force_new' => true])->assertOk()->assertJsonPath('reused', true);
    }

    public function test_an_unknown_earlier_payment_never_causes_a_second_intent(): void
    {
        $h = $this->cachedHold();
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('createPaymentIntent');
        $stripe->shouldReceive('retrievePaymentIntent')->once()->andThrow(new \RuntimeException('Private provider diagnostic: SELECT secret'));
        $r = $this->postJson($this->endpoint('payment-intent'), ['hold_token' => $h->hold_token])->assertStatus(503)->assertJsonPath('code', 'payment_check_failed');
        $this->assertStringNotContainsString('SELECT secret', $r->getContent());
        $this->assertSame('pi_journey', $h->fresh()->payload_json['stripe_payment_intent_id']);
    }

    public function test_a_bank_processing_response_never_causes_a_second_intent(): void
    {
        $h = $this->cachedHold();
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('createPaymentIntent');
        $stripe->shouldReceive('retrievePaymentIntent')->once()->andReturn(PaymentIntent::constructFrom(['id' => 'pi_journey', 'status' => 'processing']));
        $this->postJson($this->endpoint('payment-intent'), ['hold_token' => $h->hold_token])->assertStatus(409)->assertJsonPath('code', 'payment_pending');
    }

    public function test_a_cancelled_intent_requires_a_new_quote_instead_of_replaying_stripes_creation_key(): void
    {
        $h = $this->cachedHold();
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('createPaymentIntent');
        $stripe->shouldReceive('retrievePaymentIntent')->once()->andReturn(PaymentIntent::constructFrom(['id' => 'pi_journey', 'status' => 'canceled']));
        $this->postJson($this->endpoint('payment-intent'), ['hold_token' => $h->hold_token])->assertStatus(409)->assertJsonPath('code', 'payment_restart_required');
    }

    public function test_a_completed_booking_can_be_resumed_after_its_hold_is_consumed(): void
    {
        $h = $this->cachedHold();
        $h->update(['status' => 'confirmed', 'expires_at' => now()->subMinute()]);
        \App\Models\BookingMirror::create(['organization_id' => $this->org->id, 'reservation_id' => 'JOURNEY-COMMITTED', 'booking_state' => 'confirmed', 'internal_status' => 'confirmed', 'guest_name' => 'Guest',
            'apartment_id' => '101', 'arrival_date' => $this->checkIn, 'departure_date' => $this->checkOut, 'price_total' => 200, 'stripe_payment_intent_id' => 'pi_journey', 'payment_status' => 'paid', 'raw_json' => ['currency' => 'EUR']]);
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('createPaymentIntent');
        $stripe->shouldNotReceive('retrievePaymentIntent');
        $this->postJson($this->endpoint('payment-intent'), ['hold_token' => $h->hold_token])->assertOk()->assertJsonPath('payment_received', true)->assertJsonMissingPath('client_secret');
    }

    public function test_a_pay_at_venue_request_is_visible_in_the_booking_and_in_smoobu(): void
    {
        $h = $this->quote();
        $this->stripe(false);
        $this->smoobu->shouldReceive('resolveDirectChannelId')->andReturn(7);
        $this->smoobu->shouldReceive('getPriceElements')->andReturn([]);
        $this->smoobu->shouldReceive('createReservation')->once()->with(\Mockery::on(fn ($p) => $p['notice'] === 'Late arrival'))->andReturn(['id' => 955101, 'reference-id' => 'JOURNEY-NOTE']);
        $this->postJson($this->endpoint('confirm'), ['hold_token' => $h->hold_token, 'guest' => ['first_name' => 'Test', 'last_name' => 'Guest', 'email' => 'guest@example.test'], 'special_requests' => 'Late arrival'])->assertCreated();
        $this->assertSame('Late arrival', \App\Models\BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->sole()->notice);
    }

    public function test_an_invalid_contact_is_rejected_before_payment_creation(): void
    {
        $h = $this->quote();
        $this->stripe()->shouldNotReceive('createPaymentIntent');
        $this->postJson($this->endpoint('payment-intent'), ['hold_token' => $h->hold_token, 'guest' => ['first_name' => 'Test', 'last_name' => 'Guest', 'email' => 'a@']])->assertStatus(422);
        $this->assertArrayNotHasKey('guest', $h->fresh()->payload_json);
    }

    public function test_combination_reservations_do_not_duplicate_the_whole_party_on_every_room(): void
    {
        app()->instance('current_organization_id', $this->org->id);
        $this->seedRoom($this->org->id, ['pms_id' => '102', 'name' => 'Garden', 'slug' => 'garden']);
        app()->forgetInstance('current_organization_id');
        $this->smoobu->shouldReceive('getRates')->andReturn(['data' => ['101' => ['available' => true, 'price' => 200, 'currency' => 'EUR'], '102' => ['available' => true, 'price' => 300, 'currency' => 'EUR']]]);
        $this->smoobu->shouldReceive('checkAvailability')->andReturn(['available' => ['101', '102'], 'prices' => ['101' => ['price' => 200], '102' => ['price' => 300]]]);
        $q = $this->postJson($this->endpoint('quote'), ['unit_ids' => ['101', '102'], 'check_in' => $this->checkIn, 'check_out' => $this->checkOut, 'adults' => 4])->assertOk();
        $this->assertSame([2, 2], array_column($q->json('rooms'), 'adults'));
        $parties = [];
        $this->stripe(false);
        $this->smoobu->shouldReceive('resolveDirectChannelId')->andReturn(7);
        $this->smoobu->shouldReceive('getPriceElements')->andReturn([]);
        $this->smoobu->shouldReceive('createReservation')->twice()->andReturnUsing(function ($p) use (&$parties) {
            $parties[] = $p['adults'];
            return ['id' => 950000 + count($parties), 'reference-id' => 'JOURNEY-COMBO-' . count($parties)];
        });
        $this->postJson($this->endpoint('confirm'), ['hold_token' => $q->json('hold_token'), 'guest' => ['first_name' => 'Test', 'last_name' => 'Guest', 'email' => 'guest@example.test']])->assertCreated();
        $this->assertSame([2, 2], $parties);
        $this->assertEquals(4, \App\Models\BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->sum('adults'));
    }

    public function test_new_public_checkout_webhook_recovers_through_the_booking_writer_with_saved_contact(): void
    {
        if (!\Illuminate\Support\Facades\Schema::hasTable('stripe_webhook_events')) {
            \Illuminate\Support\Facades\Schema::create('stripe_webhook_events', function ($t) {
                $t->id(); $t->unsignedBigInteger('organization_id'); $t->string('event_id'); $t->string('event_type');
                $t->string('payment_intent_id')->nullable(); $t->string('charge_id')->nullable(); $t->timestamp('received_at'); $t->timestamps();
                $t->unique(['organization_id', 'event_id']);
            });
        }
        $h = $this->cachedHold();
        $h->update(['payload_json' => $h->payload_json + ['widget_checkout_version' => 2, 'guest' => ['first_name' => 'Test', 'last_name' => 'Guest', 'email' => 'guest@example.test', 'special_requests' => 'Late arrival']]]);
        $event = ['id' => 'evt_journey_recovery', 'type' => 'payment_intent.succeeded', 'data' => ['object' => ['id' => 'pi_journey', 'object' => 'payment_intent', 'amount' => 20000, 'currency' => 'eur', 'metadata' => ['org_id' => (string) $this->org->id, 'hold_token' => $h->hold_token]]]];
        $this->stripe()->shouldReceive('constructWebhookEvent')->andReturn(\Stripe\Event::constructFrom($event));
        $engine = \Mockery::mock(\App\Services\BookingEngineService::class);
        $engine->shouldReceive('confirm')->once()->with(\Mockery::on(fn ($data) => $data['hold_token'] === $h->hold_token && $data['guest']['email'] === 'guest@example.test' && $data['special_requests'] === 'Late arrival' && $data['payment_intent_id'] === 'pi_journey'), \Mockery::type('string'))->andReturn(['success' => true]);
        $this->app->instance(\App\Services\BookingEngineService::class, $engine);
        $this->postJson('/api/v1/booking/webhooks/stripe', $event)->assertOk()->assertJsonPath('received', true);
    }
}
