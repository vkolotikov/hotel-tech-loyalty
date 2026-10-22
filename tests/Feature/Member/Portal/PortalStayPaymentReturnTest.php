<?php

namespace Tests\Feature\Member\Portal;

use App\Models\BookingHold;
use App\Models\BookingMirror;
use Stripe\PaymentIntent;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\Feature\Member\MemberEndpointTestCase;

/**
 * Release 4, part C — the return from a bank redirect for a stay:
 * `GET member/portal/payments/{id}` answers what the payment is for from its
 * own metadata (`portal_hold_token`), and the ordinary stays confirm books
 * it — or refuses and releases it under its usual rules. Another member's or
 * organisation's payment is answered as unknown and never touched. Stripe
 * is a Mockery mock; no network call is made.
 */
class PortalStayPaymentReturnTest extends MemberEndpointTestCase
{
    use SetsUpStayBookingSchema, SeedsDiscountFixture, StayPortalFixture;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpStayPortal();
        $this->smoobuRates(200.0);
    }

    private function as(?string $token = null): static
    {
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();

        return $this->withToken($token ?? $this->token);
    }

    private function quote(): string
    {
        return $this->as()->postJson('/api/v1/member/portal/stays/quote', ['unit_id' => '101', 'check_in' => $this->checkIn, 'check_out' => $this->checkOut, 'adults' => 2, 'children' => 0])
            ->assertOk()->json('hold_token');
    }

    private function back(string $pi, ?string $token = null)
    {
        return $this->as($token)->getJson("/api/v1/member/portal/payments/{$pi}");
    }

    private function confirm(string $hold, string $pi)
    {
        return $this->as()->postJson('/api/v1/member/portal/stays/confirm', ['hold_token' => $hold, 'payment_intent_id' => $pi, 'special_requests' => 'Late arrival']);
    }

    private function pi(string $id, string $hold, string $status = 'requires_capture', array $meta = []): PaymentIntent
    {
        return PaymentIntent::constructFrom(['id' => $id, 'status' => $status, 'amount' => 20000, 'currency' => 'eur', 'client_secret' => "{$id}_secret",
            'metadata' => array_merge(['kind' => 'portal_stay_booking', 'org_id' => (string) $this->org->id, 'member_id' => (string) $this->member->id, 'portal_hold_token' => $hold, 'total' => '200.00'], $meta)]);
    }

    private function smoobuBooks(): void
    {
        $this->smoobu->shouldReceive('resolveDirectChannelId')->andReturn(7);
        $this->smoobu->shouldReceive('createReservation')->byDefault()->andReturn(['id' => 555001, 'reference-id' => 'BK-ABC12345']);
        $this->smoobu->shouldReceive('getPriceElements')->byDefault()->andReturn([]);
    }

    public function test_a_return_to_a_valid_hold_names_the_hold_and_the_confirm_books_it(): void
    {
        $this->smoobuBooks();
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $hold = $this->quote();
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_ret')->andReturn($this->pi('pi_ret', $hold));

        $this->back('pi_ret')->assertOk()
            ->assertJsonPath('kind', 'stay')->assertJsonPath('state', 'authorised')->assertJsonPath('amount', 200)->assertJsonPath('currency', 'EUR')
            ->assertJsonPath('stay.hold_token', $hold)->assertJsonPath('stay.hold_active', true)->assertJsonPath('stay.room.name', 'Sea view')
            ->assertJsonPath('stay.check_in', $this->checkIn)->assertJsonPath('stay.adults', 2)->assertJsonPath('booking', null);
        $this->assertSame('active', BookingHold::withoutGlobalScopes()->where('hold_token', $hold)->value('status'), 'the return itself books nothing');

        $id = $this->confirm($hold, 'pi_ret')->assertStatus(201)->assertJsonPath('booking.payment_status', 'authorized')->json('booking.id');
        $this->assertSame('Late arrival', BookingMirror::withoutGlobalScopes()->findOrFail($id)->notice);

        // A reload of the return page after the confirm: the booking it became.
        $this->back('pi_ret')->assertOk()->assertJsonPath('state', 'booked')->assertJsonPath('booking.id', $id)->assertJsonPath('booking.kind', 'stay');
    }

    public function test_a_return_to_an_expired_hold_is_refused_at_confirm_and_the_card_released(): void
    {
        $this->smoobu->shouldNotReceive('createReservation');
        $stripe = $this->stripe();
        $hold = $this->quote();
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_late')->andReturn($this->pi('pi_late', $hold));
        $this->travel(11)->minutes();

        $this->back('pi_late')->assertOk()->assertJsonPath('state', 'authorised')->assertJsonPath('stay.hold_active', false);

        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_late', 'abandoned');
        $this->confirm($hold, 'pi_late')->assertStatus(409)->assertJsonPath('error', 'hold_expired');
        $this->assertSame(0, BookingMirror::withoutGlobalScopes()->count());
    }

    public function test_a_return_whose_hold_is_gone_has_nothing_to_restore(): void
    {
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $hold = $this->quote();
        BookingHold::withoutGlobalScopes()->where('hold_token', $hold)->delete();
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_gone')->andReturn($this->pi('pi_gone', $hold));

        $this->back('pi_gone')->assertOk()->assertJsonPath('state', 'authorised')->assertJsonPath('stay', null);
    }

    public function test_another_members_or_organisations_or_the_widgets_payment_is_unknown_and_untouched(): void
    {
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $hold = $this->quote();

        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_member')->andReturn($this->pi('pi_member', $hold, 'requires_capture', ['member_id' => '999999']));
        $this->back('pi_member')->assertStatus(404)->assertJsonPath('error', 'payment_not_found')->assertJsonMissingPath('stay');

        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_org')->andReturn($this->pi('pi_org', $hold, 'requires_capture', ['org_id' => '424242']));
        $this->back('pi_org')->assertStatus(404)->assertJsonPath('error', 'payment_not_found');

        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_widget')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_widget', 'status' => 'requires_capture', 'amount' => 20000, 'currency' => 'eur',
            'metadata' => ['org_id' => (string) $this->org->id, 'member_id' => (string) $this->member->id, 'hold_token' => $hold]]));
        $this->back('pi_widget')->assertStatus(404)->assertJsonPath('error', 'payment_not_found');

        // The other member asking about this member's payment.
        ['token' => $stranger] = $this->member($this->org);
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_mine')->andReturn($this->pi('pi_mine', $hold));
        $this->back('pi_mine', $stranger)->assertStatus(404)->assertJsonPath('error', 'payment_not_found');

        $this->back('pi_mock_123')->assertStatus(404);
        $this->as()->getJson('/api/v1/member/portal/payments/not-an-intent')->assertStatus(404);
    }

    public function test_the_bank_still_processing_and_a_failed_payment_are_reported_as_such(): void
    {
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $hold = $this->quote();

        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_wait')->andReturn($this->pi('pi_wait', $hold, 'processing'));
        $this->back('pi_wait')->assertOk()->assertJsonPath('state', 'processing');

        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_no')->andReturn($this->pi('pi_no', $hold, 'requires_payment_method'));
        $this->back('pi_no')->assertOk()->assertJsonPath('state', 'failed');

        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_off')->andReturn($this->pi('pi_off', $hold, 'canceled'));
        $this->back('pi_off')->assertOk()->assertJsonPath('state', 'failed');
    }

    public function test_stripe_unreachable_or_an_unknown_payment(): void
    {
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_down')->andThrow(new \RuntimeException('stripe down'));
        $this->back('pi_down')->assertStatus(503)->assertJsonPath('error', 'payment_check_failed');

        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_missing')->andThrow(
            \Stripe\Exception\InvalidRequestException::factory("No such payment_intent: 'pi_missing'", 404, null, null, null, 'resource_missing'),
        );
        $this->back('pi_missing')->assertStatus(404)->assertJsonPath('error', 'payment_not_found');
    }

    public function test_the_return_is_for_members_only(): void
    {
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/member/portal/payments/pi_any')->assertStatus(401);
    }
}
