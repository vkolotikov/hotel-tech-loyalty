<?php

namespace Tests\Feature\Stripe;

use App\Models\AuditLog;
use App\Models\BookingHold;
use App\Models\BookingMirror;
use App\Models\HotelSetting;
use App\Models\Organization;
use App\Services\SmoobuClient;
use App\Services\StripeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Mockery;
use Stripe\PaymentIntent;
use Stripe\Refund;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\TestCase;

/**
 * Release 6, item 6: a stay's money read from Stripe is converted by the
 * payment's own currency (StripeService::fromSmallestUnit() / smallestUnitOf(),
 * one zero-decimal list), never a bare `/ 100` or `* 100`: 12 000 yen is
 * `amount: 12000`, not 120.00. EUR amounts are what they were. Covered: the
 * `payment_intent.succeeded` webhook's paid amount (markSucceededRows()), its
 * orphan recovery's stay, the widget payment step's cached amount, and the
 * confirm rescue's refund record (the refund and dispute events: RefundEventsOnceTest,
 * LostDisputeTest).
 */
class ZeroDecimalStayMoneyTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpStayBookingSchema;

    private Organization $org;
    private $stripe;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpStayBookingSchema();
        $this->setUpLoyaltySchema();
        if (!Schema::hasTable('stripe_webhook_events')) {
            Schema::create('stripe_webhook_events', function ($t) {
                $t->bigIncrements('id');
                $t->unsignedBigInteger('organization_id');
                $t->string('event_id', 80);
                $t->string('event_type', 80);
                $t->string('payment_intent_id', 80)->nullable();
                $t->string('charge_id', 80)->nullable();
                $t->timestamp('received_at')->useCurrent();
                $t->timestamps();
                $t->unique(['organization_id', 'event_id'], 'stripe_webhook_events_dedup_unique');
            });
        }
        Mail::fake();
        $this->org = Organization::create(['name' => 'Tokyo Inn', 'slug' => 'tokyo-' . uniqid()]);
        $this->org->forceFill(['widget_token' => 'wtok_' . Str::random(16)])->save();
        app()->instance('current_organization_id', $this->org->id);

        $this->stripe = Mockery::mock(StripeService::class);
        $this->stripe->shouldReceive('isEnabled')->andReturn(true);
        $this->stripe->shouldReceive('constructWebhookEvent')->andReturnUsing(fn (string $payload) => \Stripe\Event::constructFrom(json_decode($payload, true)));
        $this->app->instance(StripeService::class, $this->stripe);
        $this->app->instance(SmoobuClient::class, Mockery::mock(SmoobuClient::class));
    }

    protected function tearDown(): void
    {
        if (app()->bound('current_organization_id')) {
            app()->forgetInstance('current_organization_id');
        }
        Mockery::close();
        parent::tearDown();
    }

    private function deliver(string $type, array $object): void
    {
        $this->postJson('/api/v1/booking/webhooks/stripe', ['id' => 'evt_' . uniqid(), 'object' => 'event', 'type' => $type, 'data' => ['object' => $object]], ['Stripe-Signature' => 't=1,v1=test'])->assertOk();
    }

    private function yenIntent(string $id, string $status = 'succeeded', array $metadata = []): array
    {
        return ['id' => $id, 'object' => 'payment_intent', 'amount' => 12000, 'currency' => 'jpy', 'status' => $status, 'metadata' => ['org_id' => (string) $this->org->id] + $metadata];
    }

    private function hold(array $payload = []): BookingHold
    {
        return BookingHold::create(['hold_token' => Str::random(48), 'status' => 'active', 'expires_at' => now()->addMinutes(10), 'payload_json' => array_merge([
            'unit_id' => '101', 'unit_name' => 'Sakura', 'check_in' => now()->addDays(10)->toDateString(), 'check_out' => now()->addDays(12)->toDateString(),
            'nights' => 2, 'adults' => 2, 'children' => 0, 'room_total' => 12000.0, 'extras' => [], 'extras_total' => 0.0, 'gross_total' => 12000.0,
            'currency' => 'JPY', 'price_per_night' => 6000.0,
        ], $payload)]);
    }

    public function test_a_yen_payment_succeeded_records_the_paid_amount_in_yen(): void
    {
        $id = DB::table('booking_mirror')->insertGetId([
            'organization_id' => $this->org->id, 'reservation_id' => 'R-YEN-1', 'booking_state' => 'confirmed', 'internal_status' => 'confirmed',
            'price_total' => 12000, 'payment_status' => 'authorized', 'payment_method' => 'stripe', 'stripe_payment_intent_id' => 'pi_yen_paid',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->deliver('payment_intent.succeeded', $this->yenIntent('pi_yen_paid'));

        $row = DB::table('booking_mirror')->where('id', $id)->first();
        $this->assertSame('paid', $row->payment_status);
        $this->assertEquals(12000.0, (float) $row->price_paid, 'yen, not hundredths of a yen');
    }

    public function test_a_yen_orphan_recovered_from_its_payment_records_yen(): void
    {
        $hold = $this->hold(['guest' => ['first_name' => 'Ada', 'last_name' => 'Lovelace', 'email' => 'ada@example.test']]);

        $this->deliver('payment_intent.succeeded', $this->yenIntent('pi_yen_orphan', 'succeeded', ['hold_token' => $hold->hold_token]));

        $mirror = BookingMirror::withoutGlobalScopes()->where('stripe_payment_intent_id', 'pi_yen_orphan')->sole();
        $this->assertEquals(12000.0, (float) $mirror->price_total);
        $this->assertEquals(12000.0, (float) $mirror->price_paid);
    }

    public function test_the_widget_payment_step_keeps_a_yen_amount_as_yen_and_reuses_its_intent(): void
    {
        HotelSetting::withoutGlobalScopes()->create(['organization_id' => $this->org->id, 'key' => 'booking_currency', 'value' => 'JPY', 'type' => 'string', 'group' => 'booking']);
        HotelSetting::flushCacheFor($this->org->id);
        $this->stripe->shouldReceive('currency')->andReturn('jpy');
        $this->stripe->shouldReceive('publishableKey')->andReturn('pk_test_x');
        $this->stripe->shouldReceive('createPaymentIntent')->once()->andReturn(['payment_intent_id' => 'pi_yen_widget', 'client_secret' => 'secret_yen']);
        $this->stripe->shouldReceive('retrievePaymentIntent')->andReturn(PaymentIntent::constructFrom(['id' => 'pi_yen_widget', 'status' => 'requires_payment_method']));
        $hold = $this->hold();
        app()->forgetInstance('current_organization_id');

        $first = $this->postJson('/api/v1/booking/payment-intent', ['hold_token' => $hold->hold_token], ['X-Org-Token' => $this->org->widget_token]);
        $second = $this->postJson('/api/v1/booking/payment-intent', ['hold_token' => $hold->hold_token], ['X-Org-Token' => $this->org->widget_token]);
        app()->instance('current_organization_id', $this->org->id);

        $first->assertOk()->assertJsonPath('payment_intent_id', 'pi_yen_widget');
        $second->assertOk()->assertJsonPath('reused', true);
        $this->assertSame(12000, $hold->fresh()->payload_json['stripe_amount_cents'], 'the amount the intent was made for, in yen');
    }

    public function test_the_confirm_rescue_records_a_yen_refund_in_yen(): void
    {
        $hold = $this->hold();
        $this->stripe->shouldReceive('retrievePaymentIntent')->andReturn(PaymentIntent::constructFrom($this->yenIntent('pi_yen_rescue', 'succeeded', ['hold_token' => $hold->hold_token])));
        $this->stripe->shouldReceive('refund')->once()->andReturn(Refund::constructFrom(['id' => 're_yen_rescue', 'object' => 'refund', 'amount' => 12000, 'currency' => 'jpy']));
        app()->forgetInstance('current_organization_id');

        // A body that fails validation: the rescue gives this hold's own captured payment back.
        $this->postJson('/api/v1/booking/confirm', ['hold_token' => $hold->hold_token, 'guest' => ['first_name' => 'Ada'], 'payment_intent_id' => 'pi_yen_rescue'], ['X-Org-Token' => $this->org->widget_token])
            ->assertStatus(422);
        app()->instance('current_organization_id', $this->org->id);

        $row = AuditLog::withoutGlobalScopes()->where('action', 'booking.confirm.pi_refunded')->sole();
        $this->assertEquals(12000, $row->new_values['amount']);
    }
}
