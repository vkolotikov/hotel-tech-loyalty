<?php

namespace Database\Factories;

use App\Models\BookingIdempotencyKey;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<BookingIdempotencyKey>
 *
 * `organization_id` intentionally OMITTED — BelongsToOrganization
 * auto-fills from the bound tenant context.
 */
class BookingIdempotencyKeyFactory extends Factory
{
    protected $model = BookingIdempotencyKey::class;

    public function definition(): array
    {
        return [
            'idempotency_key' => 'idem_' . Str::random(32),
            'request_hash'    => hash('sha256', Str::random(16)),
            'response_json'   => [
                'reservation_id'    => 'SM-' . fake()->numberBetween(1_000_000, 9_999_999),
                'booking_reference' => 'BK' . Str::upper(Str::random(8)),
                'mirror_id'         => fake()->numberBetween(1, 1_000),
                'gross_total'       => 450.00,
                'currency'          => 'EUR',
            ],
            'status_code'   => 200,
            // 24 hours future — covers the typical retry window.
            'expires_at'    => now()->addDay(),
        ];
    }

    /** Idempotency row that's already expired — isValid() returns false. */
    public function expired(): static
    {
        return $this->state(['expires_at' => now()->subMinute()]);
    }

    /** Bind a known key string for round-trip lookups. */
    public function withKey(string $key): static
    {
        return $this->state(['idempotency_key' => $key]);
    }

    /** Set the cached response payload. */
    public function withResponse(array $response): static
    {
        return $this->state(['response_json' => $response]);
    }
}
