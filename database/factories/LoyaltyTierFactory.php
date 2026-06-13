<?php

namespace Database\Factories;

use App\Models\LoyaltyTier;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<LoyaltyTier>
 */
class LoyaltyTierFactory extends Factory
{
    protected $model = LoyaltyTier::class;

    public function definition(): array
    {
        return [
            'name'                => fake()->randomElement(['Bronze','Silver','Gold','Platinum','Diamond']),
            'min_points'          => 0,
            'earn_rate'           => 1.0,
            'sort_order'          => 1,
            'color_hex'           => '#c9a84c',
            'qualification_model' => 'rolling_12',
        ];
    }

    public function bronze(): static
    {
        return $this->state([
            'name' => 'Bronze',
            'min_points' => 0,
            'earn_rate' => 1.0,
            'sort_order' => 1,
            'color_hex' => '#cd7f32',
        ]);
    }

    public function gold(): static
    {
        return $this->state([
            'name' => 'Gold',
            'min_points' => 10_000,
            'earn_rate' => 1.5,
            'sort_order' => 3,
            'color_hex' => '#d4af37',
        ]);
    }
}
