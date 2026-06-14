<?php

namespace Database\Factories;

use App\Models\BookingRoom;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<BookingRoom>
 *
 * `organization_id` + `brand_id` intentionally OMITTED —
 * BelongsToOrganization + BelongsToBrand auto-fill from bound context.
 */
class BookingRoomFactory extends Factory
{
    protected $model = BookingRoom::class;

    public function definition(): array
    {
        return [
            'pms_id'          => 'pms_' . fake()->unique()->numberBetween(1_000_000, 9_999_999),
            'name'            => fake()->randomElement(['Forest Cabin', 'Beach Suite', 'Hilltop View', 'Garden Loft']),
            'slug'            => 'room-' . fake()->unique()->numberBetween(1, 9999),
            'description'     => fake()->paragraph(),
            'short_description' => fake()->sentence(),
            'max_guests'      => 2,
            'bedrooms'        => 1,
            'bed_type'        => 'queen',
            'base_price'      => 120.00,
            'inventory_count' => 1,
            'currency'        => 'EUR',
            'sort_order'      => 0,
            'is_active'       => true,
        ];
    }

    public function withPmsId(string $pmsId): static
    {
        return $this->state(['pms_id' => $pmsId]);
    }

    public function withBasePrice(float $price): static
    {
        return $this->state(['base_price' => $price]);
    }

    public function withMaxGuests(int $guests): static
    {
        return $this->state(['max_guests' => $guests]);
    }

    public function withInventory(int $count): static
    {
        return $this->state(['inventory_count' => $count]);
    }

    public function inactive(): static
    {
        return $this->state(['is_active' => false]);
    }
}
