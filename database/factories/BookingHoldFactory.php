<?php

namespace Database\Factories;

use App\Models\BookingHold;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<BookingHold>
 *
 * `organization_id` intentionally OMITTED — BelongsToOrganization
 * auto-fills from the bound tenant context. Tests that need a hold
 * for org A must bind `current_organization_id` before calling the
 * factory, exactly like every other multi-tenant factory in this
 * suite.
 */
class BookingHoldFactory extends Factory
{
    protected $model = BookingHold::class;

    public function definition(): array
    {
        return [
            'hold_token'    => 'hold_' . Str::random(32),
            'status'        => 'active',
            // Default: 10 minutes in the future. confirm() requires
            // an active + non-expired hold; expired() state below
            // backs up the past-expires_at branch.
            'expires_at'    => now()->addMinutes(10),
            'payload_json'  => [
                'unit_id'      => fake()->numberBetween(1_000_000, 9_999_999),
                'unit_name'    => fake()->randomElement(['Forest Cabin', 'Beach Suite', 'Hilltop View']),
                'check_in'     => now()->addDays(7)->format('Y-m-d'),
                'check_out'    => now()->addDays(10)->format('Y-m-d'),
                'nights'       => 3,
                'adults'       => 2,
                'children'     => 0,
                'gross_total'  => 450.00,
                'room_total'   => 450.00,
                'extras_total' => 0.00,
                'extras'       => [],
            ],
        ];
    }

    /** Hold whose expires_at is already in the past — confirm() must reject. */
    public function expired(): static
    {
        return $this->state(['expires_at' => now()->subMinutes(1)]);
    }

    /** Hold that's been consumed already (status=consumed). */
    public function consumed(): static
    {
        return $this->state(['status' => 'consumed']);
    }

    /** Override the hold_token with a known string for round-trip lookups. */
    public function withToken(string $token): static
    {
        return $this->state(['hold_token' => $token]);
    }

    /** Override the payload_json with caller-supplied fields. */
    public function withPayload(array $payload): static
    {
        return $this->state(fn (array $attrs) => [
            'payload_json' => array_merge($attrs['payload_json'] ?? [], $payload),
        ]);
    }
}
