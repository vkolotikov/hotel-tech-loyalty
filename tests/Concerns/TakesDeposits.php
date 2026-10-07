<?php

namespace Tests\Concerns;

use App\Models\HotelSetting;
use App\Models\ServiceBooking;
use App\Services\Appointments\Money\AppointmentMoney;
use App\Services\StripeService;
use Mockery;
use Stripe\PaymentIntent;

/**
 * Part H: a venue that takes deposits, for a test that also uses
 * SetsUpAppointmentsSchema. Provides its settings, a Stripe that is on in
 * euros (a Mockery mock), deposit intents as Stripe returns them, and
 * booking-page bookings that carry a deposit.
 */
trait TakesDeposits
{
    /** One setting of the test organisation, with the caches its readers keep dropped. */
    protected function setSetting(string $key, string $value): void
    {
        $row = HotelSetting::withoutGlobalScopes()->firstOrNew(['organization_id' => $this->org->id, 'key' => $key]);
        if (!$row->exists) {
            $row->forceFill(['organization_id' => $this->org->id, 'type' => 'string', 'group' => 'booking', 'label' => $key]);
        }
        $row->value = $value;
        $row->save();
        HotelSetting::flushCacheFor($this->org->id);
        app()->forgetScopedInstances();
    }

    /** Switched on the way Setup does it: the tick and the moment a manager switched it on (Deposits::SINCE). */
    protected function depositsOn(int $percent = 20, int $cancelHours = 24): void
    {
        $this->setSetting('services_require_deposit', 'true');
        $this->setSetting(\App\Services\Appointments\Money\Deposits::SINCE, '2026-10-05T06:00:00+00:00');
        $this->setSetting('services_deposit_percent', (string) $percent);
        $this->setSetting('services_cancel_hours', (string) $cancelHours);
    }

    protected function depositsOff(): void
    {
        $this->setSetting('services_require_deposit', 'false');
    }

    /** Stripe on, in euros, amounts in cents. Each test adds the calls it expects. */
    protected function stripeForDeposits(): Mockery\MockInterface
    {
        $stripe = Mockery::mock(StripeService::class);
        $stripe->shouldReceive('isEnabled')->andReturn(true)->byDefault();
        $stripe->shouldReceive('currency')->andReturn('eur')->byDefault();
        $stripe->shouldReceive('publishableKey')->andReturn('pk_test_deposits')->byDefault();
        $stripe->shouldReceive('toSmallestUnit')->andReturnUsing(fn ($amount, $currency = null) => (int) round((float) $amount * 100))->byDefault();
        $this->app->instance(StripeService::class, $stripe);

        return $stripe;
    }

    /** A deposit intent as Stripe returns it: this venue's, for the seeded service tomorrow at 10:00. */
    protected function depositIntent(string $id, float $amount = 12.0, array $meta = [], string $status = 'requires_capture'): PaymentIntent
    {
        $created = now()->subHours(2)->timestamp;

        return PaymentIntent::constructFrom([
            'id' => $id, 'status' => $status, 'amount' => (int) round($amount * 100), 'currency' => 'eur', 'created' => $created,
            'latest_charge' => ['id' => 'ch_' . $id, 'object' => 'charge', 'created' => $created, 'captured' => $status === 'succeeded'],
            'metadata' => array_merge([
                'kind' => 'service_deposit', 'org_id' => (string) $this->org->id, 'service_id' => (string) $this->service->id,
                'start_at' => '2026-10-06T10:00:00+00:00', 'source' => 'services_widget',
            ], $meta),
        ]);
    }

    /** A booking-page booking tomorrow 10:00 whose deposit is still only held on the card (nothing in the ledger yet). */
    protected function seedDepositBooking(array $attrs = [], float $deposit = 12.0, int $cancelHours = 24): ServiceBooking
    {
        return $this->seedBooking(array_merge([
            'source'                   => 'widget',
            'customer_email'           => 'ada@example.test',
            'payment_status'           => 'authorized',
            'stripe_payment_intent_id' => 'pi_dep_' . substr(md5(uniqid('', true)), 0, 10),
            'meta'                     => ['deposit' => ['amount' => $deposit, 'percent' => 20, 'cancel_hours' => $cancelHours]],
        ], $attrs));
    }

    /** The same booking with its deposit charged and recorded. */
    protected function takenDeposit(array $attrs = [], float $deposit = 12.0, int $cancelHours = 24): ServiceBooking
    {
        $b = $this->seedDepositBooking($attrs, $deposit, $cancelHours);
        app(AppointmentMoney::class)->recordDeposit($b);

        return $b->fresh();
    }
}
