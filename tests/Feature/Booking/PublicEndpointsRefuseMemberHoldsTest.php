<?php

namespace Tests\Feature\Booking;

use App\Models\BookingHold;
use App\Models\BookingMirror;
use App\Models\Organization;
use App\Services\SmoobuClient;
use App\Services\StripeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Str;
use Mockery;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\TestCase;

/**
 * The PUBLIC widget endpoints
 * (BookingPublicController::paymentIntent()/confirm()) look a hold up by
 * organisation + token only. A member's hold — quoted and priced by the
 * portal, its coupon still unconsumed — must not be payable or confirmable
 * through them: that would book it at the member's price without any of
 * the portal's own checks running and without the coupon ever being spent.
 *
 * Every Smoobu and Stripe touchpoint here is a Mockery mock; no test makes
 * a real HTTP call.
 */
class PublicEndpointsRefuseMemberHoldsTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpStayBookingSchema;

    protected Organization $org;
    protected $smoobu;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpStayBookingSchema();

        $this->org = Organization::create(['name' => 'Seaside Hotel', 'slug' => 'seaside-' . uniqid()]);
        app()->instance('current_organization_id', $this->org->id);

        $this->smoobu = Mockery::mock(SmoobuClient::class);
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

    /** A hold exactly as StayQuoteService::quote() writes it for a member: priced, discounted, and named. */
    protected function memberHold(): BookingHold
    {
        $checkIn = now()->addDays(10)->toDateString();
        $checkOut = now()->addDays(12)->toDateString();

        return BookingHold::create([
            'hold_token'   => Str::random(48),
            'status'       => 'active',
            'expires_at'   => now()->addMinutes(10),
            'payload_json' => [
                'unit_id' => '101', 'unit_name' => 'Sea view',
                'check_in' => $checkIn, 'check_out' => $checkOut, 'nights' => 2,
                'adults' => 2, 'children' => 0,
                'room_total' => 200.0, 'extras' => [], 'extras_total' => 0.0, 'gross_total' => 180.0,
                'currency' => 'EUR', 'price_per_night' => 100.0,
                'member_id' => 41, 'user_id' => 7, 'list_total' => 200.0, 'discount' => 20.0,
                'discount_source' => 'tier_benefit', 'discount_source_id' => 9,
                'discount_label' => 'Gold: 10% off stays', 'coupon' => ['member_offer_id' => 55],
                'channel_name' => 'Member portal',
            ],
        ]);
    }

    public function test_public_payment_intent_refuses_a_member_hold_and_makes_no_stripe_call(): void
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('currency')->andReturn('eur');
        $stripe->shouldReceive('publishableKey')->andReturn('pk_test_x');
        $stripe->shouldNotReceive('createPaymentIntent');
        $stripe->shouldNotReceive('retrievePaymentIntent');
        $this->app->instance(StripeService::class, $stripe);

        $hold = $this->memberHold();

        $res = $this->postJson('/api/v1/booking/payment-intent', ['hold_token' => $hold->hold_token]);

        $res->assertStatus(400)->assertJsonPath('error', 'Hold expired or not found. Please start over.');
        $this->assertSame('active', $hold->fresh()->status, "the member's own hold is untouched");
        $this->assertNull($hold->fresh()->payload_json['stripe_payment_intent_id'] ?? null);
    }

    public function test_public_confirm_refuses_a_member_hold_and_writes_no_mirror(): void
    {
        $this->smoobu->shouldNotReceive('createReservation');
        $hold = $this->memberHold();

        $res = $this->postJson('/api/v1/booking/confirm', [
            'hold_token' => $hold->hold_token,
            'guest' => ['first_name' => 'Ada', 'last_name' => 'Lovelace', 'email' => 'ada@example.test'],
        ]);

        $res->assertStatus(400)->assertJsonPath('error', 'Hold expired or not found');
        $this->assertSame(0, BookingMirror::withoutGlobalScopes()->where('organization_id', $this->org->id)->count());
        $this->assertSame('active', $hold->fresh()->status, "the member's own hold is untouched");
    }

    /**
     * A hold without a member — the widget's own — must still pay and
     * confirm exactly as before; neither guard changes anything for it.
     */
    public function test_public_payment_intent_still_works_for_a_hold_without_a_member(): void
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('currency')->andReturn('eur');
        $stripe->shouldReceive('publishableKey')->andReturn('pk_test_x');
        $stripe->shouldReceive('createPaymentIntent')->once()->andReturn(['payment_intent_id' => 'pi_1', 'client_secret' => 'secret_1']);
        $this->app->instance(StripeService::class, $stripe);

        $hold = BookingHold::create([
            'hold_token'   => Str::random(48),
            'status'       => 'active',
            'expires_at'   => now()->addMinutes(10),
            'payload_json' => [
                'unit_id' => '101', 'unit_name' => 'Sea view',
                'check_in' => now()->addDays(10)->toDateString(), 'check_out' => now()->addDays(12)->toDateString(), 'nights' => 2,
                'adults' => 2, 'children' => 0,
                'room_total' => 200.0, 'extras' => [], 'extras_total' => 0.0, 'gross_total' => 200.0,
                'currency' => 'EUR', 'price_per_night' => 100.0,
            ],
        ]);

        $this->postJson('/api/v1/booking/payment-intent', ['hold_token' => $hold->hold_token])
            ->assertOk()->assertJsonPath('payment_intent_id', 'pi_1');
    }
}
