<?php

namespace Tests\Feature\Booking;

use App\Models\AuditLog;
use App\Models\BookingHold;
use App\Models\Organization;
use App\Models\RealtimeEvent;
use App\Services\RealtimeEventService;
use App\Services\SmoobuClient;
use App\Services\StripeService;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Mockery;
use Stripe\PaymentIntent;
use Tests\Concerns\SetsUpMinimalSchema;
use Tests\Concerns\SetsUpStayBookingSchema;
use Tests\TestCase;

/**
 * Release 6, item 9: when the public confirm's payment rescue refuses to give
 * a payment back (`booking.confirm.pi_rescue_refused`), the venue's staff are
 * also told as it happens — a realtime event `booking.pi_rescue_refused` beside
 * the audit row, in its own try (and savepoint), so it can never change the
 * request's answer or the rescue's record. The rescue's rules are unchanged
 * (PublicConfirmRescueGuardTest); a payment it gives back raises no alert, and
 * neither does an id Stripe cannot read (anyone can post one) or a payment a
 * booking carries (a double submit) — their audit rows record them.
 */
class RescueRefusalAlertTest extends TestCase
{
    use DatabaseTransactions, SetsUpMinimalSchema, SetsUpStayBookingSchema;

    private Organization $org;
    private array $intents = [];
    private array $cancelled = [];

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpStayBookingSchema();
        $this->setUpLoyaltySchema();
        $this->setUpRealtimeEventsSchema();
        Mail::fake();
        $this->org = Organization::create(['name' => 'Seaside Hotel', 'slug' => 'seaside-' . uniqid()]);
        $this->org->forceFill(['widget_token' => 'wtok_' . Str::random(16)])->save();

        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true);
        $stripe->shouldReceive('retrievePaymentIntent')->andReturnUsing(fn (string $id) => $this->intents[$id]
            ?? throw \Stripe\Exception\InvalidRequestException::factory("No such payment_intent: '{$id}'", 404, null, null, null, 'resource_missing'));
        $stripe->shouldReceive('cancelPaymentIntent')->andReturnUsing(function (string $id) {
            $this->cancelled[] = $id;
            return PaymentIntent::constructFrom(['id' => $id, 'status' => 'canceled']);
        });
        $stripe->shouldNotReceive('refund');
        $this->app->instance(StripeService::class, $stripe);
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

    private function hold(): BookingHold
    {
        app()->instance('current_organization_id', $this->org->id);

        return BookingHold::create(['hold_token' => Str::random(48), 'status' => 'active', 'expires_at' => now()->addMinutes(10), 'payload_json' => [
            'unit_id' => '101', 'unit_name' => 'Sea view', 'check_in' => now()->addDays(10)->toDateString(), 'check_out' => now()->addDays(12)->toDateString(),
            'nights' => 2, 'adults' => 2, 'children' => 0, 'room_total' => 200.0, 'extras' => [], 'extras_total' => 0.0, 'gross_total' => 200.0, 'currency' => 'EUR',
        ]]);
    }

    private function intent(string $id, string $holdToken): void
    {
        $this->intents[$id] = PaymentIntent::constructFrom(['id' => $id, 'status' => 'requires_capture', 'amount' => 20000, 'currency' => 'eur', 'metadata' => [
            'hold_token' => $holdToken, 'org_id' => (string) $this->org->id,
        ]]);
    }

    /** A body that fails validation (no last name or email): the rescue runs on the payment it names. */
    private function failedConfirm(BookingHold $hold, string $pi)
    {
        app()->forgetInstance('current_organization_id');
        $res = $this->postJson('/api/v1/booking/confirm', ['hold_token' => $hold->hold_token, 'guest' => ['first_name' => 'Ada'], 'payment_intent_id' => $pi], ['X-Org-Token' => $this->org->widget_token]);
        app()->instance('current_organization_id', $this->org->id);

        return $res;
    }

    private function alerts()
    {
        return RealtimeEvent::withoutGlobalScopes()->where('type', 'booking.pi_rescue_refused')->get();
    }

    public function test_a_refusal_alerts_the_venues_staff_beside_its_audit_row(): void
    {
        $hold = $this->hold();
        $this->intent('pi_other_hold', 'another-hold-token');

        $this->failedConfirm($hold, 'pi_other_hold')->assertStatus(422);

        $this->assertSame([], $this->cancelled, 'the rescue still refuses');
        $this->assertSame(1, AuditLog::withoutGlobalScopes()->where('action', 'booking.confirm.pi_rescue_refused')->count());
        $alert = $this->alerts()->sole();
        $this->assertSame($this->org->id, (int) $alert->organization_id);
        $this->assertStringContainsString('pi_other_hold', (string) $alert->body);
        $this->assertSame('pi_other_hold', $alert->data['payment_intent_id']);
        $this->assertSame('other_hold', $alert->data['reason']);
        $this->assertSame('validation', $alert->data['stage']);
        $this->assertSame('/audit?action=booking.confirm.pi_rescue_refused', $alert->data['action_url']);
    }

    public function test_a_payment_given_back_raises_no_alert(): void
    {
        $hold = $this->hold();
        $this->intent('pi_own', $hold->hold_token);

        $this->failedConfirm($hold, 'pi_own')->assertStatus(422);

        $this->assertSame(['pi_own'], $this->cancelled);
        $this->assertCount(0, $this->alerts());
    }

    public function test_an_id_stripe_cannot_read_or_a_payment_a_booking_carries_raises_no_alert(): void
    {
        $hold = $this->hold();
        $this->intent('pi_carried', $hold->hold_token);
        \App\Models\BookingMirror::withoutGlobalScopes()->create([
            'organization_id' => $this->org->id, 'reservation_id' => 'R-' . uniqid(), 'booking_state' => 'confirmed', 'internal_status' => 'confirmed',
            'apartment_id' => '101', 'arrival_date' => now()->addDays(10)->toDateString(), 'departure_date' => now()->addDays(12)->toDateString(),
            'price_total' => 200, 'stripe_payment_intent_id' => 'pi_carried',
        ]);

        $this->failedConfirm($hold, 'pi_made_up_by_anyone')->assertStatus(422);
        $this->failedConfirm($hold, 'pi_carried')->assertStatus(422);

        $this->assertSame([], $this->cancelled);
        $this->assertEqualsCanonicalizing(['unreadable', 'carried_by_booking'], AuditLog::withoutGlobalScopes()
            ->where('action', 'booking.confirm.pi_rescue_refused')->get()->map(fn ($a) => $a->new_values['reason'] ?? null)->all());
        $this->assertCount(0, $this->alerts());
    }

    public function test_an_alert_that_cannot_be_sent_never_changes_the_answer_or_the_record(): void
    {
        $hold = $this->hold();
        $this->intent('pi_other_hold', 'another-hold-token');
        $sent = $this->failedConfirm($hold, 'pi_other_hold');

        $realtime = Mockery::mock(RealtimeEventService::class);
        $realtime->shouldReceive('dispatch')->andThrow(new \RuntimeException('realtime store down'));
        $this->app->instance(RealtimeEventService::class, $realtime);
        Log::spy();
        $failed = $this->failedConfirm($hold, 'pi_other_hold');

        $this->assertSame($sent->getStatusCode(), $failed->getStatusCode());
        $this->assertSame($sent->getContent(), $failed->getContent());
        $this->assertSame(2, AuditLog::withoutGlobalScopes()->where('action', 'booking.confirm.pi_rescue_refused')->count(), 'the refusal is recorded all the same');
        Log::shouldHaveReceived('warning')->withArgs(fn ($message, $context = []) => $message === 'booking.confirm.pi_rescue_refused realtime alert failed' && ($context['payment_intent_id'] ?? null) === 'pi_other_hold')->once();
    }
}
