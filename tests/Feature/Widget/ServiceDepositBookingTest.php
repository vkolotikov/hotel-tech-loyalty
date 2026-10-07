<?php

namespace Tests\Feature\Widget;

use App\Mail\ServiceBookingConfirmationMail;
use App\Models\ServiceBooking;
use App\Models\ServiceBookingPayment;
use App\Services\Appointments\Money\AppointmentMoney;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Mail;
use Illuminate\Testing\TestResponse;
use Mockery;
use Tests\Concerns\SetsUpAppointmentsSchema;
use Tests\Concerns\TakesDeposits;
use Tests\TestCase;

/**
 * Part H: the booking page's API at a venue that takes a 20% deposit. The
 * seeded service is 60.00 EUR, tomorrow at 10:00 with the seeded team
 * member. Stripe is a Mockery mock.
 */
class ServiceDepositBookingTest extends TestCase
{
    use DatabaseTransactions, SetsUpAppointmentsSchema, TakesDeposits;

    private $stripe;
    private array $captured = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpAppointments();
        Mail::fake();
        $this->stripe = $this->stripeForDeposits();
        $this->depositsOn(20, 24);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    private function body(array $extra = []): array
    {
        return array_merge([
            'service_id' => $this->service->id, 'service_master_id' => $this->master->id,
            'start_at' => '2026-10-06T10:00:00+00:00', 'party_size' => 1,
        ], $extra);
    }

    private function confirm(array $extra = [], ?string $key = null): TestResponse
    {
        return $this->withHeader('Idempotency-Key', $key ?? 'dep-' . uniqid('', true))
            ->postJson('/api/v1/services/confirm', $this->body(['customer_name' => 'Ada Guest', 'customer_email' => 'ada@example.test'] + $extra));
    }

    /** Stripe holds $intent until it is captured, then reports it succeeded. */
    private function holds($intent): void
    {
        $this->stripe->shouldReceive('retrievePaymentIntent')->andReturnUsing(function (string $id) use ($intent) {
            return in_array($id, $this->captured, true) ? $this->depositIntent($id, $intent->amount / 100, [], 'succeeded') : $intent;
        });
        $this->stripe->shouldReceive('capturePaymentIntent')->andReturnUsing(function (string $id) {
            $this->captured[] = $id;
            return $this->depositIntent($id, 12.0, [], 'succeeded');
        });
    }

    public function test_the_quote_names_the_deposit(): void
    {
        // JSON carries 12.0 as 12 (no JSON_PRESERVE_ZERO_FRACTION), and assertJsonPath compares with assertSame.
        $this->postJson('/api/v1/services/quote', $this->body())->assertOk()
            ->assertJsonPath('deposit', ['amount' => 12, 'percent' => 20, 'cancel_hours' => 24, 'currency' => 'EUR']);

        $this->depositsOff();
        $this->assertArrayNotHasKey('deposit', $this->postJson('/api/v1/services/quote', $this->body())->assertOk()->json());
    }

    public function test_the_payment_intent_is_for_the_deposit_only(): void
    {
        $orgId = (string) $this->org->id;
        $this->stripe->shouldReceive('createPaymentIntent')->once()
            ->withArgs(fn ($amount, $description, $meta, $options) => $amount === 12.0
                && $meta['kind'] === 'service_deposit' && $meta['source'] === 'services_widget' && $meta['org_id'] === $orgId
                && $meta['service_id'] === (string) $this->service->id && ($options['allow_redirects'] ?? null) === 'never')
            ->andReturn(['client_secret' => 'cs_1', 'payment_intent_id' => 'pi_dep_1']);

        $this->postJson('/api/v1/services/payment-intent', $this->body())->assertOk()
            ->assertJsonPath('payment_intent_id', 'pi_dep_1')
            ->assertJsonPath('deposit.amount', 12);
    }

    public function test_a_booking_without_its_deposit_is_refused(): void
    {
        $this->confirm()->assertStatus(422)->assertJsonPath('code', 'deposit_required');
        $this->assertSame(0, ServiceBooking::count());
    }

    public function test_a_held_deposit_books_and_is_charged_and_recorded(): void
    {
        $this->holds($this->depositIntent('pi_dep_ok'));
        $this->stripe->shouldNotReceive('cancelPaymentIntent');

        $this->confirm(['payment_intent_id' => 'pi_dep_ok'])->assertStatus(201)
            ->assertJsonPath('deposit.amount', 12)
            ->assertJsonPath('deposit.refund_until', 'Mon 5 Oct 2026, 10:00')
            ->assertJsonPath('payment_capture_pending', false);

        $b = ServiceBooking::sole();
        $this->assertSame(['pi_dep_ok'], $this->captured);
        $this->assertSame(['amount' => 12, 'percent' => 20, 'cancel_hours' => 24], $b->meta['deposit']);
        $this->assertSame('unpaid', $b->payment_status, 'a deposit never marks the booking paid');
        $this->assertSame(['payment', 'online_card', 12.0], [ServiceBookingPayment::sole()->kind, ServiceBookingPayment::sole()->method, ServiceBookingPayment::sole()->amount]);
        $this->assertSame(48.0, AppointmentMoney::summary($b)['owed']);
        Mail::assertQueued(ServiceBookingConfirmationMail::class, fn ($m) => $m->depositAmount === 12.0 && $m->depositRefundUntil === 'Mon 5 Oct 2026, 10:00');
    }

    public function test_a_deposit_for_another_amount_is_refused_and_released(): void
    {
        $this->service->update(['price' => 80]); // repriced after the card form was filled: the deposit is now 16.00
        $this->holds($this->depositIntent('pi_dep_old'));
        $this->stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_dep_old', 'abandoned');

        $this->confirm(['payment_intent_id' => 'pi_dep_old'])->assertStatus(422)->assertJsonPath('code', 'deposit_mismatch');
        $this->assertSame(0, ServiceBooking::count());
        $this->assertSame([], $this->captured);
    }

    public function test_a_deposit_for_another_time_is_refused_and_released(): void
    {
        $this->holds($this->depositIntent('pi_dep_11', 12.0, ['start_at' => '2026-10-06T11:00:00+00:00']));
        $this->stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_dep_11', 'abandoned');

        $this->confirm(['payment_intent_id' => 'pi_dep_11'])->assertStatus(422)->assertJsonPath('code', 'deposit_mismatch');
        $this->assertSame(0, ServiceBooking::count());
    }

    public function test_a_time_taken_meanwhile_releases_the_deposit(): void
    {
        $this->seedBooking(); // the same person, tomorrow 10:00
        $this->holds($this->depositIntent('pi_dep_late'));
        $this->stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_dep_late', 'abandoned');

        $res = $this->confirm(['payment_intent_id' => 'pi_dep_late'])->assertStatus(409)->assertJsonPath('code', 'slot_taken');
        $this->assertStringEndsWith('Your card was not charged.', $res->json('error'));
        $this->assertSame([], $this->captured);
    }

    public function test_the_same_deposit_books_once_and_its_payment_is_never_released(): void
    {
        $this->holds($this->depositIntent('pi_dep_twice'));
        $this->stripe->shouldNotReceive('cancelPaymentIntent');

        $this->confirm(['payment_intent_id' => 'pi_dep_twice'], 'key-1')->assertStatus(201);
        $this->confirm(['payment_intent_id' => 'pi_dep_twice'], 'key-1')->assertOk()->assertJsonPath('replayed', true);
        $this->confirm(['payment_intent_id' => 'pi_dep_twice', 'start_at' => '2026-10-06T11:00:00+00:00'], 'key-2')
            ->assertStatus(409)->assertJsonPath('error', 'This payment has already been used for a booking.');
        $this->confirm(['payment_intent_id' => 'pi_dep_twice'], 'key-3')->assertStatus(409); // the same time again: taken, nothing released

        $this->assertSame(1, ServiceBooking::count());
    }

    public function test_a_capture_that_does_not_go_through_leaves_the_deposit_to_the_job(): void
    {
        $this->stripe->shouldReceive('retrievePaymentIntent')->andReturn($this->depositIntent('pi_dep_slow'));
        $this->stripe->shouldReceive('capturePaymentIntent')->andThrow(new \RuntimeException('stripe busy'));

        $this->confirm(['payment_intent_id' => 'pi_dep_slow'])->assertStatus(201)->assertJsonPath('payment_capture_pending', true);

        $b = ServiceBooking::sole();
        $this->assertSame('authorized', $b->payment_status);
        $this->assertSame(12, $b->meta['deposit']['amount']);
        $this->assertSame(0, ServiceBookingPayment::count());
    }

    // Final review I1: a made-up `pi_mock_` id only counts while the venue's test mode is really on.
    public function test_a_made_up_mock_payment_does_not_skip_the_deposit(): void
    {
        $this->stripe->shouldNotReceive('retrievePaymentIntent');

        $this->confirm(['payment_intent_id' => 'pi_mock_forged'])->assertStatus(422)->assertJsonPath('code', 'deposit_required');
        $this->assertSame(0, ServiceBooking::count());
    }

    // Final review I2: deposits switched off between the card form and confirm — the deposit must not pass for the whole price.
    public function test_a_deposit_intent_never_pays_a_booking_that_takes_no_deposit(): void
    {
        $this->depositsOff();
        $this->holds($this->depositIntent('pi_dep_stale'));
        $this->stripe->shouldReceive('cancelPaymentIntent')->once()->with('pi_dep_stale', 'abandoned');

        $this->confirm(['payment_intent_id' => 'pi_dep_stale'])->assertStatus(422)->assertJsonPath('code', 'deposit_mismatch');
        $this->assertSame(0, ServiceBooking::count());
        $this->assertSame([], $this->captured);
    }

    // Final review I7: a mistyped email is caught before the card is held, not after.
    public function test_the_clients_details_are_checked_before_the_card_is_held(): void
    {
        $this->stripe->shouldNotReceive('createPaymentIntent');

        $this->postJson('/api/v1/services/payment-intent', $this->body(['customer_name' => 'Ada Guest', 'customer_email' => 'jane.gmail.com']))
            ->assertStatus(422)->assertJsonValidationErrors('customer_email');
    }

    public function test_with_deposits_off_a_booking_needs_no_card(): void
    {
        $this->depositsOff();
        $this->stripe->shouldNotReceive('createPaymentIntent');

        $this->confirm()->assertStatus(201);
        $b = ServiceBooking::sole();
        $this->assertSame('unpaid', $b->payment_status);
        $this->assertNull($b->meta['deposit'] ?? null);
    }

    public function test_a_free_service_takes_no_deposit(): void
    {
        $this->service->update(['price' => 0]);

        $this->confirm()->assertStatus(201);
        $this->assertNull(ServiceBooking::sole()->meta['deposit'] ?? null);
    }
}
