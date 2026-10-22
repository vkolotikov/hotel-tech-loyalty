<?php

namespace Tests\Feature\Member\Portal;

use App\Models\MemberOffer;
use App\Models\Organization;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceMaster;
use App\Models\SpecialOffer;
use App\Services\StripeService;
use Mockery;
use Stripe\PaymentIntent;
use Tests\Concerns\SeedsDiscountFixture;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\Feature\Member\MemberEndpointTestCase;

/**
 * Release 4, part C — the return from a bank redirect for an appointment:
 * the server rebuilds the booking from the intent's own metadata (service,
 * start, person, party, extras, coupon — written by payment-intent), and
 * the ordinary services confirm books it at the server's own price, or
 * refuses and releases under its usual rules. Stripe is a Mockery mock.
 */
class PortalServicePaymentReturnTest extends MemberEndpointTestCase
{
    use SetsUpServiceBookingSchema, SeedsDiscountFixture;

    private Organization $org;
    private string $token;
    private Service $service;
    private ServiceMaster $master;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpServiceBookingSchema();
        $this->setUpLoyaltySchema();
        $this->setUpDiscountTables();
        $this->org = $this->tenant();
        ['token' => $this->token, 'member' => $this->member] = $this->member($this->org);
        ['service' => $this->service, 'master' => $this->master] = $this->seedBookableService($this->org->id);
        $this->travelTo(now()->next('Monday')->setTime(8, 0));
    }

    private function stripe(): Mockery\MockInterface
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('currency')->andReturn('eur');
        $stripe->shouldReceive('publishableKey')->andReturn('pk_test_x');
        $stripe->shouldReceive('toSmallestUnit')->passthru();
        $this->app->instance(StripeService::class, $stripe);

        return $stripe;
    }

    private function body(array $extra = []): array
    {
        return array_merge(['service_id' => $this->service->id, 'master_id' => $this->master->id, 'start_at' => now()->setTime(10, 0)->toIso8601String(), 'party_size' => 1], $extra);
    }

    private function claim(float $value): MemberOffer
    {
        $offer = SpecialOffer::withoutGlobalScopes()->create(['organization_id' => $this->org->id, 'title' => "$value off", 'description' => '-', 'type' => 'fixed_amount', 'value' => $value, 'start_date' => now()->subDay()->toDateString(), 'end_date' => now()->addDays(3)->toDateString(), 'is_active' => true]);

        return MemberOffer::create(['organization_id' => $this->org->id, 'member_id' => $this->member->id, 'offer_id' => $offer->id, 'status' => 'claimed', 'claimed_at' => now()]);
    }

    /** The payment-intent call, as the Pay step makes it; returns the metadata the server wrote. */
    private function paid(Mockery\MockInterface $stripe, array $body, string $id = 'pi_bank'): array
    {
        $meta = null;
        $stripe->shouldReceive('createPaymentIntent')->once()->withArgs(function (float $amount, string $desc, array $m) use (&$meta) {
            $meta = $m;

            return true;
        })->andReturn(['client_secret' => "{$id}_secret", 'payment_intent_id' => $id]);
        $this->flushHeaders();
        $this->withToken($this->token)->postJson('/api/v1/member/portal/services/payment-intent', $body)->assertOk();

        return array_map('strval', $meta);
    }

    private function bankSays(Mockery\MockInterface $stripe, string $id, array $meta, int $amount, string $status = 'requires_capture'): void
    {
        $stripe->shouldReceive('retrievePaymentIntent')->with($id)->andReturn(PaymentIntent::constructFrom(['id' => $id, 'status' => $status, 'amount' => $amount, 'currency' => 'eur', 'metadata' => $meta]));
    }

    private function back(string $pi)
    {
        $this->flushHeaders();

        return $this->withToken($this->token)->getJson("/api/v1/member/portal/payments/{$pi}");
    }

    private function confirm(array $body, string $key = 'return-pi_bank')
    {
        $this->flushHeaders();

        return $this->withToken($this->token)->withHeader('Idempotency-Key', $key)->postJson('/api/v1/member/portal/services/confirm', $body);
    }

    public function test_the_return_rebuilds_the_booking_from_the_server_and_the_confirm_books_it(): void
    {
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $claim = $this->claim(10);
        $meta = $this->paid($stripe, $this->body(['party_size' => 2, 'coupon' => ['member_offer_id' => $claim->id]]));
        $this->bankSays($stripe, 'pi_bank', $meta, 5000);

        $answer = $this->back('pi_bank')->assertOk()
            ->assertJsonPath('kind', 'service')->assertJsonPath('state', 'authorised')->assertJsonPath('amount', 50)
            ->assertJsonPath('service.name', 'Deep Tissue Massage')->assertJsonPath('service.master', 'Mara Ilves')
            ->assertJsonPath('service.body.service_id', $this->service->id)->assertJsonPath('service.body.master_id', $this->master->id)
            ->assertJsonPath('service.body.party_size', 2)->assertJsonPath('service.body.extras', [])
            ->assertJsonPath('service.body.coupon', ['member_offer_id' => $claim->id])
            ->json('service.body');

        $this->confirm($answer + ['payment_intent_id' => 'pi_bank', 'notes' => 'From the bank'])->assertStatus(201)
            ->assertJsonPath('booking.total', 50)->assertJsonPath('booking.payment_status', 'authorized')->assertJsonPath('booking.party_size', 2);
        $b = ServiceBooking::withoutGlobalScopes()->sole();
        $this->assertSame([$this->master->id, 'pi_bank', 'From the bank'], [(int) $b->service_master_id, $b->stripe_payment_intent_id, $b->customer_notes]);
        $this->assertNotNull(MemberOffer::findOrFail($claim->id)->used_at, 'the coupon the member chose, consumed once');

        // A reload: the same key replays, and the return answers the booking.
        $this->confirm($answer + ['payment_intent_id' => 'pi_bank', 'notes' => 'From the bank'])->assertOk()->assertJsonPath('replayed', true);
        $this->back('pi_bank')->assertOk()->assertJsonPath('state', 'booked')->assertJsonPath('booking.id', $b->id);
    }

    public function test_a_return_to_a_slot_taken_meanwhile_releases_the_card(): void
    {
        $stripe = $this->stripe();
        $meta = $this->paid($stripe, $this->body());
        $this->bankSays($stripe, 'pi_bank', $meta, 6000);
        $answer = $this->back('pi_bank')->assertOk()->json('service.body');

        ServiceBooking::create(['organization_id' => $this->org->id, 'service_id' => $this->service->id, 'service_master_id' => $this->master->id, 'customer_name' => 'X', 'customer_email' => 'x@example.test', 'start_at' => now()->setTime(10, 0), 'end_at' => now()->setTime(10, 45), 'duration_minutes' => 45, 'service_price' => 60, 'total_amount' => 60, 'currency' => 'EUR', 'status' => 'confirmed', 'payment_status' => 'unpaid']);
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_bank', 'abandoned');

        $this->confirm($answer + ['payment_intent_id' => 'pi_bank'])->assertStatus(409)->assertJsonPath('error', 'slot_taken');
        $this->assertSame(1, ServiceBooking::withoutGlobalScopes()->count());
    }

    public function test_a_body_changed_on_the_way_back_does_not_match_the_payment(): void
    {
        $stripe = $this->stripe();
        $meta = $this->paid($stripe, $this->body());
        $this->bankSays($stripe, 'pi_bank', $meta, 6000);
        $answer = $this->back('pi_bank')->assertOk()->json('service.body');

        // A client that edits the time: the payment is for 10:00, so the server refuses it.
        $stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_bank', 'abandoned');
        $this->confirm(array_merge($answer, ['start_at' => now()->setTime(11, 0)->toIso8601String(), 'payment_intent_id' => 'pi_bank']))->assertStatus(409)->assertJsonPath('error', 'payment_mismatch');
        $this->assertSame(0, ServiceBooking::withoutGlobalScopes()->count());
    }

    public function test_a_payment_made_before_the_return_existed_has_nothing_to_restore(): void
    {
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $this->bankSays($stripe, 'pi_old', [
            'kind' => 'portal_service_booking', 'org_id' => (string) $this->org->id, 'member_id' => (string) $this->member->id,
            'service_id' => (string) $this->service->id, 'start_at' => now()->setTime(10, 0)->toIso8601String(), 'total' => '60.00',
        ], 6000);

        $this->back('pi_old')->assertOk()->assertJsonPath('state', 'authorised')->assertJsonPath('service', null);
    }

    public function test_another_members_appointment_payment_is_unknown_and_untouched(): void
    {
        $stripe = $this->stripe();
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $meta = $this->paid($stripe, $this->body());
        $this->bankSays($stripe, 'pi_theirs', array_merge($meta, ['member_id' => '999999']), 6000);

        $this->back('pi_theirs')->assertStatus(404)->assertJsonPath('error', 'payment_not_found');
    }
}
