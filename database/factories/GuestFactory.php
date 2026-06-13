<?php

namespace Database\Factories;

use App\Models\Guest;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Guest>
 */
class GuestFactory extends Factory
{
    protected $model = Guest::class;

    public function definition(): array
    {
        $first = fake()->firstName();
        $last  = fake()->lastName();
        return [
            // organization_id intentionally OMITTED — BelongsToOrganization's
            // creating hook fills it from `current_organization_id` if bound.
            // Tests that need cross-tenant rows must set the context first
            // OR override organization_id explicitly via ->state([...]) +
            // raw insert (sidestepping the tenant guard).
            'first_name'       => $first,
            'last_name'        => $last,
            'full_name'        => "{$first} {$last}",
            'email'            => fake()->unique()->safeEmail(),
            'phone'            => fake()->phoneNumber(),
            'company'          => fake()->company(),
            'country'          => fake()->countryCode(),
            'lifecycle_status' => 'lead',
            'importance'       => 'normal',
            'lead_source'      => fake()->randomElement(['website','referral','direct','partner']),
            'owner_name'       => fake()->name(),
            'notes'            => null,
            'custom_data'      => null,
        ];
    }

    public function vip(): static
    {
        return $this->state([
            'importance'       => 'vip',
            'lifecycle_status' => 'customer',
        ]);
    }

    public function fromSource(string $source): static
    {
        return $this->state(['lead_source' => $source]);
    }
}
