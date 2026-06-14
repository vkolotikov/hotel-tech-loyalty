<?php

namespace Database\Factories;

use App\Models\CustomField;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CustomField>
 *
 * organization_id intentionally OMITTED — BelongsToOrganization
 * auto-fills from bound tenant context.
 */
class CustomFieldFactory extends Factory
{
    protected $model = CustomField::class;

    public function definition(): array
    {
        return [
            'entity'       => 'inquiry',
            'key'          => 'field_' . fake()->unique()->numberBetween(1, 10000),
            'label'        => fake()->randomElement(['Allergies', 'Dietary', 'Notes', 'Reference']),
            'type'         => 'text',
            'config'       => null,
            'help_text'    => null,
            'required'     => false,
            'is_active'    => true,
            'show_in_list' => false,
            'sort_order'   => 0,
        ];
    }

    public function ofEntity(string $entity): static
    {
        return $this->state(['entity' => $entity]);
    }

    public function ofType(string $type, ?array $config = null): static
    {
        return $this->state([
            'type'   => $type,
            'config' => $config,
        ]);
    }

    public function withKey(string $key): static
    {
        return $this->state(['key' => $key]);
    }

    public function required(): static
    {
        return $this->state(['required' => true]);
    }

    public function inactive(): static
    {
        return $this->state(['is_active' => false]);
    }
}
