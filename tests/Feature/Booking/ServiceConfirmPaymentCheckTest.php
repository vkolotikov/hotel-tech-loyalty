<?php

namespace Tests\Feature\Booking;

use App\Http\Controllers\Api\V1\ServicePublicController;
use App\Models\Organization;
use App\Models\Service;
use App\Models\ServiceBooking;
use App\Models\ServiceBookingSubmission;
use App\Models\ServiceExtra;
use App\Models\ServiceMaster;
use App\Services\StripeService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Mockery;
use Stripe\PaymentIntent;
use Tests\Concerns\SetsUpServiceBookingSchema;
use Tests\Feature\Member\MemberEndpointTestCase;

/**
 * R4-2 (owner, 2026-10-22): the public services confirm (POST
 * /api/v1/services/confirm) accepts a payment only when it is this
 * booking's — the venue's own payment, marked by the services
 * payment-intent endpoint as a service booking (metadata `kind`), for this
 * service at this time, for the amount the server prices in the service's
 * currency, and carried by no booking of the venue (appointments and stays).
 * Any other payment is answered 422 `payment_mismatch` — the shape and
 * status of the endpoint's existing deposit refusal — and nothing is booked,
 * captured, cancelled or refunded. Stripe is a Mockery mock throughout.
 *
 * The seeded service is 60.00 EUR, 45 minutes, today (a Monday) at 10:00.
 */
class ServiceConfirmPaymentCheckTest extends MemberEndpointTestCase
{
    use SetsUpServiceBookingSchema;

    private const MISMATCH = ['error' => 'The payment does not match this booking. Please pay again.', 'code' => 'payment_mismatch'];
    private const USED = 'This payment has already been used for a booking.';

    private Organization $org;
    private Service $service;
    private ServiceMaster $master;
    /** @var array<string, PaymentIntent> what Stripe answers for each id */
    private array $intents = [];
    /** @var list<string> */
    private array $captured = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpServiceBookingSchema();
        $this->org = $this->tenant();
        ['service' => $this->service, 'master' => $this->master] = $this->seedBookableService($this->org->id);
        $this->travelTo(now()->next('Monday')->setTime(8, 0));
        Mail::fake();
        $this->stripe();
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    /** Stripe on, in euros: answers the intents the test put in $this->intents, held until captured. Never cancels or refunds. */
    private function stripe(): Mockery\MockInterface
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('currency')->andReturn('eur');
        $stripe->shouldReceive('toSmallestUnit')->passthru();
        $stripe->shouldReceive('retrievePaymentIntent')->andReturnUsing(function (string $id) {
            $intent = $this->intents[$id] ?? throw new \RuntimeException("No such payment_intent: '{$id}'");

            return in_array($id, $this->captured, true) ? PaymentIntent::constructFrom(['status' => 'succeeded'] + $intent->toArray()) : $intent;
        });
        $stripe->shouldReceive('capturePaymentIntent')->andReturnUsing(function (string $id) {
            $this->captured[] = $id;

            return PaymentIntent::constructFrom(['status' => 'succeeded'] + $this->intents[$id]->toArray());
        });
        $stripe->shouldNotReceive('cancelPaymentIntent');
        $stripe->shouldNotReceive('refund');
        $this->app->instance(StripeService::class, $stripe);

        return $stripe;
    }

    /**
     * A payment as Stripe returns it. By default it is this booking's own:
     * the venue's full payment for the seeded service today at 10:00, 60.00
     * EUR, held on the card. A metadata value of null leaves that key out.
     */
    private function pay(string $id, array $meta = [], array $attrs = []): string
    {
        $metadata = array_filter(array_merge([
            'org_id'     => (string) $this->org->id,
            'service_id' => (string) $this->service->id,
            'start_at'   => now()->setTime(10, 0)->toIso8601String(),
            'kind'       => 'service_booking',
        ], $meta), fn ($v) => $v !== null);
        $this->intents[$id] = PaymentIntent::constructFrom(array_merge([
            'id' => $id, 'status' => 'requires_capture', 'amount' => 6000, 'currency' => 'eur', 'metadata' => $metadata,
        ], $attrs));

        return $id;
    }

    private function confirm(array $extra = [], string $time = '10:00')
    {
        $this->flushHeaders();

        return $this->withHeader('Idempotency-Key', 'widget-' . uniqid('', true))
            ->postJson('/api/v1/services/confirm?org=' . $this->org->fresh()->widget_token, array_merge([
                'service_id'        => $this->service->id,
                'service_master_id' => $this->master->id,
                'start_at'          => now()->setTime(...explode(':', $time))->toIso8601String(),
                'party_size'        => 1,
                'customer_name'     => 'Ada Guest',
                'customer_email'    => 'ada@example.test',
            ], $extra));
    }

    private function failedReasons(): array
    {
        return ServiceBookingSubmission::withoutGlobalScopes()->where('outcome', 'failed')->orderBy('id')->pluck('error_message')->all();
    }

    /** A stay of $orgId that carries the payment. */
    private function stayCarries(string $intentId, int $orgId): void
    {
        DB::table('booking_mirror')->insert([
            'organization_id' => $orgId, 'reservation_id' => '555001', 'booking_reference' => 'BK-STAY0001',
            'booking_state' => 'confirmed', 'internal_status' => 'confirmed', 'apartment_id' => 101,
            'arrival_date' => now()->addDays(3)->toDateString(), 'departure_date' => now()->addDays(5)->toDateString(),
            'price_total' => 60, 'payment_status' => 'authorized', 'stripe_payment_intent_id' => $intentId,
            'channel_name' => 'Website', 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_this_bookings_own_payment_books_and_is_captured_as_before(): void
    {
        $res = $this->confirm(['payment_intent_id' => $this->pay('pi_own')]);

        $res->assertStatus(201);
        $this->assertSame(['booking_reference', 'booking', 'payment_capture_pending'], array_keys($res->json()));
        $this->assertFalse($res->json('payment_capture_pending'));
        $b = ServiceBooking::withoutGlobalScopes()->sole();
        $this->assertSame('pi_own', $b->stripe_payment_intent_id);
        $this->assertSame('paid', $b->payment_status);
        $this->assertSame('60.00', $b->total_amount);
        $this->assertSame(['pi_own'], $this->captured);
        $this->assertSame([], $this->failedReasons());
    }

    public function test_this_bookings_own_payment_already_taken_books_as_paid(): void
    {
        $this->confirm(['payment_intent_id' => $this->pay('pi_taken', [], ['status' => 'succeeded'])])->assertStatus(201);

        $this->assertSame('paid', ServiceBooking::withoutGlobalScopes()->sole()->payment_status);
        $this->assertSame([], $this->captured, 'already taken: nothing to capture');
    }

    public static function notThisBookings(): array
    {
        return [
            'another amount'               => [[], ['amount' => 5000]],
            'one cent short'               => [[], ['amount' => 5999]],
            'another currency'             => [[], ['currency' => 'usd']],
            'the stay widget\'s payment'   => [['kind' => null, 'hold_token' => 'hold-abc'], []],
            'a payment with no mark'       => [['kind' => null], []],
            'a portal appointment payment' => [['kind' => 'portal_service_booking', 'member_id' => '7'], []],
            'a portal stay payment'        => [['kind' => 'portal_stay_booking', 'portal_hold_token' => 'h'], []],
            'another kind'                 => [['kind' => 'invoice'], []],
            'another organisation'         => [['org_id' => '999999'], []],
            'no organisation'              => [['org_id' => null], []],
            'another service'              => [['service_id' => '999999'], []],
            'another time'                 => [['start_at' => '__11:00__'], []],
            'a time that is not a time'    => [['start_at' => 'soon'], []],
            'no metadata at all'           => [['org_id' => null, 'service_id' => null, 'start_at' => null, 'kind' => null], []],
        ];
    }

    #[\PHPUnit\Framework\Attributes\DataProvider('notThisBookings')]
    public function test_a_payment_that_is_not_this_bookings_is_refused_and_left_alone(array $meta, array $attrs): void
    {
        if (($meta['start_at'] ?? null) === '__11:00__') {
            $meta['start_at'] = now()->setTime(11, 0)->toIso8601String();
        }

        $res = $this->confirm(['payment_intent_id' => $this->pay('pi_other', $meta, $attrs)]);

        $res->assertStatus(422)->assertExactJson(self::MISMATCH);
        $this->assertSame(0, ServiceBooking::withoutGlobalScopes()->count());
        $this->assertSame([], $this->captured, 'nothing captured');
        $this->assertSame(['payment_mismatch'], $this->failedReasons());
        Mail::assertNothingQueued();
    }

    /** The price the payment must match is the server's for this request: the service and its extras. */
    public function test_the_extras_are_part_of_the_price_the_payment_must_match(): void
    {
        $towel = ServiceExtra::create(['organization_id' => $this->org->id, 'name' => 'Hot towel', 'price' => 5, 'price_type' => 'per_person', 'is_active' => true]);
        $body = ['party_size' => 2, 'extras' => [['id' => $towel->id, 'quantity' => 1]]];

        $this->confirm($body + ['payment_intent_id' => $this->pay('pi_service_only')])->assertStatus(422)->assertExactJson(self::MISMATCH);
        $this->confirm($body + ['payment_intent_id' => $this->pay('pi_with_extras', [], ['amount' => 7000])])->assertStatus(201);

        $b = ServiceBooking::withoutGlobalScopes()->sole();
        $this->assertSame('70.00', $b->total_amount);
        $this->assertSame('pi_with_extras', $b->stripe_payment_intent_id);
    }

    public function test_a_payment_a_stay_of_the_venue_carries_is_refused_as_used(): void
    {
        $this->stayCarries($this->pay('pi_stay'), $this->org->id);

        $this->confirm(['payment_intent_id' => 'pi_stay'])->assertStatus(409)->assertExactJson(['error' => self::USED]);

        $this->assertSame(0, ServiceBooking::withoutGlobalScopes()->count());
        $this->assertSame([], $this->captured);
        $this->assertSame(['payment already used'], $this->failedReasons());
    }

    /** The stays half of the rule is the venue's own, as the appointments half is. */
    public function test_a_stay_of_another_organisation_does_not_carry_this_venues_payment(): void
    {
        $other = Organization::create(['name' => 'Other Venue', 'slug' => 'other-' . uniqid()]);
        $this->stayCarries($this->pay('pi_elsewhere'), $other->id);

        $this->confirm(['payment_intent_id' => 'pi_elsewhere'])->assertStatus(201);
    }

    public function test_a_payment_an_appointment_carries_keeps_its_answer(): void
    {
        $this->confirm(['payment_intent_id' => $this->pay('pi_twice')])->assertStatus(201);

        $this->confirm(['payment_intent_id' => 'pi_twice'], '12:00')->assertStatus(409)->assertExactJson(['error' => self::USED]);
        $this->assertSame(['payment already used'], $this->failedReasons());
    }

    public function test_a_payment_that_is_not_completed_keeps_its_answer(): void
    {
        $this->confirm(['payment_intent_id' => $this->pay('pi_open', [], ['status' => 'requires_payment_method'])])
            ->assertStatus(400)->assertExactJson(['error' => 'Payment has not been completed.']);
        $this->assertSame(0, ServiceBooking::withoutGlobalScopes()->count());
    }

    /**
     * The mark confirm accepts is the one the services payment-intent
     * endpoint writes: a payment made there for this booking (its amount,
     * currency and metadata exactly as Stripe would hold them) books.
     */
    public function test_a_payment_made_by_the_payment_intent_endpoint_for_this_booking_books(): void
    {
        $stripe = $this->app->make(StripeService::class);
        $stripe->shouldReceive('createPaymentIntent')->once()->andReturnUsing(function (float $amount, string $description, array $meta) {
            $this->intents['pi_made'] = PaymentIntent::constructFrom([
                'id' => 'pi_made', 'status' => 'requires_capture', 'currency' => 'eur', 'metadata' => $meta,
                'amount' => app(StripeService::class)->toSmallestUnit($amount),
            ]);

            return ['client_secret' => 'cs_made', 'payment_intent_id' => 'pi_made'];
        });

        $this->postJson('/api/v1/services/payment-intent?org=' . $this->org->fresh()->widget_token, [
            'service_id' => $this->service->id, 'service_master_id' => $this->master->id,
            'start_at' => now()->setTime(10, 0)->toIso8601String(), 'party_size' => 1,
        ])->assertOk()->assertJsonPath('payment_intent_id', 'pi_made');
        $this->assertSame(ServicePublicController::PAYMENT_KIND, $this->intents['pi_made']->metadata['kind']);
        app()->forgetInstance('current_organization_id');

        $this->confirm(['payment_intent_id' => 'pi_made'])->assertStatus(201);
        $this->assertSame(['pi_made'], $this->captured);
    }
}
