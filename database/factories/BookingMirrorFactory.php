<?php

namespace Database\Factories;

use App\Models\BookingMirror;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<BookingMirror>
 *
 * Notes on the underlying table:
 *  - `booking_mirror` (SINGULAR — CLAUDE.md flags pluralisation as
 *    a footgun that has shipped twice and broken every prod deploy).
 *  - `organization_id` intentionally OMITTED — BelongsToOrganization
 *    auto-fills from the bound tenant context. Cross-tenant fixtures
 *    must raw-insert via DB::table('booking_mirror')->insert(...).
 */
class BookingMirrorFactory extends Factory
{
    protected $model = BookingMirror::class;

    public function definition(): array
    {
        $arrival = fake()->dateTimeBetween('+2 days', '+90 days');
        $departure = (clone $arrival)->modify('+3 days');

        return [
            'reservation_id'           => 'SM-' . fake()->unique()->numberBetween(1_000_000, 9_999_999),
            'booking_reference'        => 'BK' . Str::upper(Str::random(8)),
            'booking_state'            => 'confirmed',
            'apartment_id'             => fake()->numberBetween(1_000_000, 9_999_999),
            'apartment_name'           => fake()->randomElement(['Ocean Suite', 'Garden Loft', 'Penthouse', 'Forest Cabin']),
            'guest_name'               => fake()->name(),
            'guest_email'              => fake()->safeEmail(),
            'guest_phone'              => fake()->phoneNumber(),
            'arrival_date'             => $arrival->format('Y-m-d'),
            'departure_date'           => $departure->format('Y-m-d'),
            'price_total'              => fake()->randomFloat(2, 100, 2_000),
            'price_paid'               => null,
            'refunded_amount'          => null,
            'refunded_at'              => null,
            'last_refund_id'           => null,
            'payment_method'           => 'stripe',
            'payment_status'           => 'paid',
            'stripe_payment_intent_id' => 'pi_test_' . Str::random(24),
            'internal_status'          => 'synced',
        ];
    }

    public function paid(): static
    {
        return $this->state(fn () => [
            'payment_status' => 'paid',
            'price_paid'     => fake()->randomFloat(2, 100, 2_000),
        ]);
    }

    public function refunded(): static
    {
        return $this->state(fn (array $attrs) => [
            'payment_status'  => 'refunded',
            'refunded_amount' => $attrs['price_total'] ?? 500,
            'refunded_at'     => now(),
            'last_refund_id'  => 're_' . Str::random(24),
        ]);
    }

    public function partiallyRefunded(float $amount = 50.0): static
    {
        return $this->state(fn (array $attrs) => [
            'payment_status'  => 'partially_refunded',
            'refunded_amount' => $amount,
            'refunded_at'     => now(),
            'last_refund_id'  => 're_' . Str::random(24),
        ]);
    }

    public function disputed(): static
    {
        return $this->state(['payment_status' => 'disputed']);
    }

    public function mock(): static
    {
        return $this->state([
            'payment_method'           => 'mock',
            'stripe_payment_intent_id' => null,
        ]);
    }

    /** A booking without a Stripe PaymentIntent — represents the
     *  "no Stripe payment attached" branch of applyRefund. */
    public function noStripeAttached(): static
    {
        return $this->state([
            'payment_method'           => 'stripe',
            'stripe_payment_intent_id' => null,
        ]);
    }
}
