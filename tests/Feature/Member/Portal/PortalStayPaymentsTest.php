<?php

namespace Tests\Feature\Member\Portal;

use App\Http\Controllers\Api\V1\Member\Portal\PortalStayBookingController;
use App\Models\AuditLog;
use App\Models\BookingHold;
use App\Models\BookingMirror;
use App\Services\Booking\PayAtVenueFallback;
use Illuminate\Support\Facades\Crypt;
use Mockery;
use Stripe\PaymentIntent;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\Feature\Member\MemberEndpointTestCase;

/**
 * Release 4, part C — stays: one hold per card (a second `payment-intent`
 * call for the same hold reuses or releases the first intent), the cap on
 * how often a hold is extended, and paying at the venue when Stripe cannot
 * be reached (PayAtVenueFallback). Stripe is a Mockery mock throughout; no
 * test here makes a network call.
 */
class PortalStayPaymentsTest extends MemberEndpointTestCase
{
    use SetsUpStayBookingSchema, SeedsDiscountFixture, StayPortalFixture;

    private const QUOTE = '/api/v1/member/portal/stays/quote';
    private const INTENT = '/api/v1/member/portal/stays/payment-intent';
    private const CONFIRM = '/api/v1/member/portal/stays/confirm';

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpStayPortal();
        $this->smoobuRates(200.0);
    }

    /** A fresh request as $token (the auth guard remembers the last user between requests in one test). */
    private function as(?string $token): static
    {
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();

        return $this->withToken($token ?? $this->token);
    }

    private function quote(?string $token = null): string
    {

        return $this->as($token)->postJson(self::QUOTE, ['unit_id' => '101', 'check_in' => $this->checkIn, 'check_out' => $this->checkOut, 'adults' => 2, 'children' => 0])
            ->assertOk()->json('hold_token');
    }

    private function intent(string $hold, ?string $token = null)
    {
        return $this->as($token)->postJson(self::INTENT, ['hold_token' => $hold]);
    }

    private function confirm(string $hold, array $extra = [], ?string $token = null)
    {
        return $this->as($token)->postJson(self::CONFIRM, array_merge(['hold_token' => $hold], $extra));
    }

    private function hold(string $token): BookingHold
    {
        return BookingHold::withoutGlobalScopes()->where('hold_token', $token)->sole();
    }

    /** This member's own intent for $hold, 200.00 EUR, in $status, with the client secret Stripe returns to a secret-key retrieve. */
    private function pi(string $id, string $hold, string $status = 'requires_payment_method', array $top = [], array $meta = []): PaymentIntent
    {
        return PaymentIntent::constructFrom(array_merge(['id' => $id, 'status' => $status, 'amount' => 20000, 'currency' => 'eur', 'client_secret' => "{$id}_secret"], $top, [
            'metadata' => array_merge(['kind' => 'portal_stay_booking', 'org_id' => (string) $this->org->id, 'member_id' => (string) $this->member->id, 'portal_hold_token' => $hold], $meta),
        ]));
    }

    private function smoobuBooks(): void
    {
        $this->smoobu->shouldReceive('resolveDirectChannelId')->andReturn(7);
        $this->smoobu->shouldReceive('createReservation')->byDefault()->andReturn(['id' => 555001, 'reference-id' => 'BK-ABC12345']);
        $this->smoobu->shouldReceive('getPriceElements')->byDefault()->andReturn([]);
    }

    private function mirrors()
    {
        return BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id);
    }

    // ─── One hold per card ──────────────────────────────────────────────────

    public function test_a_second_call_for_the_same_hold_hands_back_the_intent_that_can_still_be_paid(): void
    {
        $stripe = $this->stripe();
        $hold = $this->quote();
        $stripe->shouldReceive('createPaymentIntent')->once()->andReturn(['client_secret' => 'pi_a_secret', 'payment_intent_id' => 'pi_a']);
        $stripe->shouldNotReceive('cancelPaymentIntent');

        $this->intent($hold)->assertOk()->assertJsonPath('payment_intent_id', 'pi_a')->assertJsonPath('reused', false);
        $this->assertSame('pi_a', $this->hold($hold)->payload_json[PortalStayBookingController::HOLD_INTENT_KEY]);
        $this->assertArrayNotHasKey('stripe_payment_intent_id', $this->hold($hold)->payload_json, 'never the public widget\'s key');

        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_a')->andReturn($this->pi('pi_a', $hold));
        $this->intent($hold)->assertOk()->assertJsonPath('payment_intent_id', 'pi_a')->assertJsonPath('client_secret', 'pi_a_secret')
            ->assertJsonPath('reused', true)->assertJsonPath('amount', 200);
    }

    public function test_an_earlier_intent_that_holds_money_or_another_amount_is_released_before_a_new_one_is_made(): void
    {
        $stripe = $this->stripe();
        $hold = $this->quote();
        $stripe->shouldReceive('createPaymentIntent')->once()->andReturn(['client_secret' => 'pi_a_secret', 'payment_intent_id' => 'pi_a']);
        $this->intent($hold)->assertOk();

        // Authorised (a card held) but no booking carries it: released, then a new one.
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_a')->andReturn($this->pi('pi_a', $hold, 'requires_capture'));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_a', 'abandoned');
        $stripe->shouldReceive('createPaymentIntent')->once()->andReturn(['client_secret' => 'pi_b_secret', 'payment_intent_id' => 'pi_b']);
        $this->intent($hold)->assertOk()->assertJsonPath('payment_intent_id', 'pi_b')->assertJsonPath('reused', false);
        $this->assertSame('pi_b', $this->hold($hold)->payload_json[PortalStayBookingController::HOLD_INTENT_KEY]);

        // Payable, but for another amount: released, then a new one.
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_b')->andReturn($this->pi('pi_b', $hold, 'requires_payment_method', ['amount' => 15000]));
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_b', 'abandoned');
        $stripe->shouldReceive('createPaymentIntent')->once()->andReturn(['client_secret' => 'pi_c_secret', 'payment_intent_id' => 'pi_c']);
        $this->intent($hold)->assertOk()->assertJsonPath('payment_intent_id', 'pi_c');
    }

    public function test_an_intent_a_booking_carries_or_another_members_is_never_touched_by_a_second_call(): void
    {
        $stripe = $this->stripe();
        $hold = $this->quote();
        $row = $this->hold($hold);

        // A booking already carries the hold's last intent: left alone (not even read), a new one is made.
        BookingMirror::withoutGlobalScopes()->create(['organization_id' => $this->org->id, 'reservation_id' => 'R-OLD', 'apartment_id' => '202', 'price_total' => 200, 'stripe_payment_intent_id' => 'pi_carried', 'member_id' => $this->member->id, 'arrival_date' => now()->addDays(40)->toDateString(), 'departure_date' => now()->addDays(42)->toDateString()]);
        $row->forceFill(['payload_json' => $row->payload_json + [PortalStayBookingController::HOLD_INTENT_KEY => 'pi_carried']])->save();
        $stripe->shouldNotReceive('retrievePaymentIntent')->with('pi_carried');
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $stripe->shouldReceive('createPaymentIntent')->once()->andReturn(['client_secret' => 'pi_n1_secret', 'payment_intent_id' => 'pi_n1']);
        $this->intent($hold)->assertOk()->assertJsonPath('payment_intent_id', 'pi_n1');

        // The pointer names another member's intent: read, never cancelled, never handed out.
        $row = $this->hold($hold);
        $row->forceFill(['payload_json' => array_merge($row->payload_json, [PortalStayBookingController::HOLD_INTENT_KEY => 'pi_stranger'])])->save();
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_stranger')->andReturn($this->pi('pi_stranger', $hold, 'requires_payment_method', [], ['member_id' => '999999']));
        $stripe->shouldReceive('createPaymentIntent')->once()->andReturn(['client_secret' => 'pi_n2_secret', 'payment_intent_id' => 'pi_n2']);
        $this->intent($hold)->assertOk()->assertJsonPath('payment_intent_id', 'pi_n2')->assertJsonPath('reused', false);
    }

    public function test_an_earlier_intent_stripe_cannot_read_stops_a_second_one_being_made(): void
    {
        $stripe = $this->stripe();
        $hold = $this->quote();
        $stripe->shouldReceive('createPaymentIntent')->once()->andReturn(['client_secret' => 'pi_a_secret', 'payment_intent_id' => 'pi_a']);
        $this->intent($hold)->assertOk();

        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_a')->andThrow(new \RuntimeException('stripe down'));
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $this->intent($hold)->assertStatus(503)->assertJsonPath('error', 'payment_unavailable');
        $this->assertSame('pi_a', $this->hold($hold)->payload_json[PortalStayBookingController::HOLD_INTENT_KEY]);
    }

    public function test_a_hold_is_extended_at_most_three_times(): void
    {
        $stripe = $this->stripe();
        $hold = $this->quote();
        $stripe->shouldReceive('createPaymentIntent')->once()->andReturn(['client_secret' => 'pi_a_secret', 'payment_intent_id' => 'pi_a']);
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_a')->andReturn($this->pi('pi_a', $hold));
        $start = now()->toImmutable();

        $this->intent($hold)->assertOk();                         // 1: until +15
        $this->travel(10)->minutes();
        $this->intent($hold)->assertOk()->assertJsonPath('reused', true); // 2: until +25
        $this->travel(10)->minutes();
        $this->intent($hold)->assertOk();                         // 3: until +35
        $this->assertSame(3, $this->hold($hold)->payload_json[PortalStayBookingController::HOLD_EXTENSIONS_KEY]);
        $this->assertEqualsWithDelta($start->addMinutes(35)->getTimestamp(), $this->hold($hold)->expires_at->getTimestamp(), 1);

        $this->travel(10)->minutes();
        $this->intent($hold)->assertOk();                         // 4: answered, not extended
        $this->assertEqualsWithDelta($start->addMinutes(35)->getTimestamp(), $this->hold($hold)->expires_at->getTimestamp(), 1, 'the cap holds');
        $this->assertSame(3, $this->hold($hold)->payload_json[PortalStayBookingController::HOLD_EXTENSIONS_KEY]);

        $this->travel(6)->minutes();
        $this->intent($hold)->assertStatus(409)->assertJsonPath('error', 'hold_expired');
    }

    public function test_an_extension_never_shortens_the_hold(): void
    {
        $stripe = $this->stripe();
        $hold = $this->quote();
        $row = $this->hold($hold);
        $row->forceFill(['expires_at' => now()->addMinutes(40)])->save();
        $stripe->shouldReceive('createPaymentIntent')->once()->andReturn(['client_secret' => 'pi_a_secret', 'payment_intent_id' => 'pi_a']);

        $this->intent($hold)->assertOk();
        $this->assertTrue($this->hold($hold)->expires_at->greaterThan(now()->addMinutes(39)));
    }

    // ─── Paying at the venue when Stripe cannot be reached ──────────────────

    public function test_stripe_down_with_the_setting_off_answers_503_as_before(): void
    {
        $stripe = $this->stripe();
        $hold = $this->quote();
        $stripe->shouldReceive('createPaymentIntent')->andThrow(new \RuntimeException('stripe down'));

        $this->intent($hold)->assertStatus(503)->assertJsonPath('error', 'payment_unavailable')->assertJsonMissingPath('pay_at_venue_grant');
        $this->confirm($hold)->assertStatus(422)->assertJsonPath('error', 'payment_required');
        $this->assertSame(0, $this->mirrors()->count());
    }

    public function test_stripe_down_with_the_setting_on_books_the_stay_to_pay_at_the_venue(): void
    {
        $this->smoobuBooks();
        $this->setting(PayAtVenueFallback::SETTING, 'true');
        $stripe = $this->stripe();
        $hold = $this->quote();
        $stripe->shouldReceive('createPaymentIntent')->andThrow(new \RuntimeException('stripe down'));

        $grant = $this->intent($hold)->assertStatus(409)->assertJsonPath('error', 'pay_at_venue')->assertJsonPath('reason', 'payment_unavailable')->json('pay_at_venue_grant');
        $this->assertIsString($grant);

        // Without the grant a confirm with no payment is still refused.
        $this->confirm($hold)->assertStatus(422)->assertJsonPath('error', 'payment_required');

        $this->confirm($hold, ['pay_at_venue_grant' => $grant])->assertStatus(201)
            ->assertJsonPath('booking.payment_status', 'open')->assertJsonPath('booking.paid_online', false);
        $m = $this->mirrors()->sole();
        $this->assertSame('pay_at_venue', $m->payment_method);
        $this->assertNull($m->stripe_payment_intent_id);
        $this->assertSame(1, AuditLog::withoutGlobalScopes()->where('action', 'portal.pay_at_venue_fallback')->where('subject_type', 'booking_mirror')->where('subject_id', $m->id)->count());
    }

    public function test_a_grant_works_only_for_its_own_hold_and_member_and_while_the_setting_is_on(): void
    {
        $this->smoobuBooks();
        $this->smoobu->shouldNotReceive('createReservation');
        $this->setting(PayAtVenueFallback::SETTING, 'true');
        $stripe = $this->stripe();
        $stripe->shouldReceive('createPaymentIntent')->andThrow(new \RuntimeException('stripe down'));
        $holdA = $this->quote();
        $grant = $this->intent($holdA)->assertStatus(409)->json('pay_at_venue_grant');

        // Another hold of the same member.
        $holdB = $this->quote();
        $this->confirm($holdB, ['pay_at_venue_grant' => $grant])->assertStatus(422)->assertJsonPath('error', 'payment_required');

        // Another member's own hold.
        ['token' => $strangerToken] = $this->member($this->org);
        $theirs = $this->quote($strangerToken);
        $this->confirm($theirs, ['pay_at_venue_grant' => $grant], $strangerToken)->assertStatus(422)->assertJsonPath('error', 'payment_required');

        // A grant written by anyone but this application.
        $this->confirm($holdA, ['pay_at_venue_grant' => 'not-a-grant'])->assertStatus(422)->assertJsonPath('error', 'payment_required');
        $forged = Crypt::encryptString(json_encode(['k' => 'stay', 'o' => $this->org->id, 'm' => $this->member->id, 't' => $holdA, 'x' => now()->subMinute()->getTimestamp()]));
        $this->confirm($holdA, ['pay_at_venue_grant' => $forged])->assertStatus(422)->assertJsonPath('error', 'payment_required');

        // The venue switched it off meanwhile.
        $this->setting(PayAtVenueFallback::SETTING, 'false');
        $this->confirm($holdA, ['pay_at_venue_grant' => $grant])->assertStatus(422)->assertJsonPath('error', 'payment_required');

        $this->assertSame(0, $this->mirrors()->count());
    }

    public function test_with_a_card_after_all_the_grant_is_ignored_and_the_card_pays(): void
    {
        $this->smoobuBooks();
        $this->setting(PayAtVenueFallback::SETTING, 'true');
        $stripe = $this->stripe();
        $hold = $this->quote();
        $grant = PayAtVenueFallback::grant('stay', $this->org->id, $this->member->id, $hold);
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_card')->andReturn($this->pi('pi_card', $hold, 'requires_capture'));

        $this->confirm($hold, ['payment_intent_id' => 'pi_card', 'pay_at_venue_grant' => $grant])->assertStatus(201)->assertJsonPath('booking.payment_status', 'authorized');
        $this->assertSame('stripe', $this->mirrors()->sole()->payment_method);
        $this->assertSame(0, AuditLog::withoutGlobalScopes()->where('action', 'portal.pay_at_venue_fallback')->count());
    }

    public function test_an_unreadable_earlier_intent_with_the_setting_on_offers_the_venue_too(): void
    {
        $this->setting(PayAtVenueFallback::SETTING, 'true');
        $stripe = $this->stripe();
        $hold = $this->quote();
        $stripe->shouldReceive('createPaymentIntent')->once()->andReturn(['client_secret' => 'pi_a_secret', 'payment_intent_id' => 'pi_a']);
        $this->intent($hold)->assertOk();
        $stripe->shouldReceive('retrievePaymentIntent')->with('pi_a')->andThrow(new \RuntimeException('stripe down'));
        $stripe->shouldNotReceive('cancelPaymentIntent', Mockery::any());

        $this->intent($hold)->assertStatus(409)->assertJsonPath('error', 'pay_at_venue')->assertJsonPath('reason', 'payment_unavailable');
    }
}
