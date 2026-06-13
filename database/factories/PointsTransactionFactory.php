<?php

namespace Database\Factories;

use App\Models\PointsTransaction;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<PointsTransaction>
 *
 * organization_id + brand_id intentionally omitted — the model's
 * BelongsToOrganization + BelongsToBrand traits fill them from
 * bound context on create.
 */
class PointsTransactionFactory extends Factory
{
    protected $model = PointsTransaction::class;

    public function definition(): array
    {
        return [
            'type'              => 'earn',
            'points'            => fake()->numberBetween(50, 1_000),
            'qualifying_points' => fake()->numberBetween(50, 1_000),
            'balance_after'     => 0,
            'description'       => 'Booking earn',
            'source_type'       => 'booking',
            'reference_type'    => 'booking_mirror',
            'idempotency_key'   => 'earn_' . Str::random(16),
            'reason_code'       => 'booking_earn',
            'approval_status'   => 'auto_approved',
            'approved_at'       => now(),
            'is_reversed'       => false,
        ];
    }

    public function reversed(): static
    {
        return $this->state(['is_reversed' => true]);
    }

    public function forMember(int $memberId): static
    {
        return $this->state(['member_id' => $memberId]);
    }

    public function withReferenceTo(string $type, int $id): static
    {
        return $this->state([
            'reference_type' => $type,
            'reference_id'   => $id,
        ]);
    }
}
