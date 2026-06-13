<?php

namespace Database\Factories;

use App\Models\LoyaltyMember;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<LoyaltyMember>
 *
 * organization_id intentionally omitted — BelongsToOrganization fills
 * it from the bound tenant context on create.
 */
class LoyaltyMemberFactory extends Factory
{
    protected $model = LoyaltyMember::class;

    public function definition(): array
    {
        return [
            'member_number'      => 'M-' . Str::upper(Str::random(8)),
            'lifetime_points'    => 0,
            'current_points'     => 0,
            'qualifying_points'  => 0,
            'qualifying_nights'  => 0,
            'qualifying_stays'   => 0,
            'qualifying_spend'   => 0,
            'is_active'          => true,
            'tier_locked'        => false,
            'tier_qualification_model' => 'rolling_12',
            'joined_at'          => now()->subMonths(2),
        ];
    }

    public function withPoints(int $current, ?int $lifetime = null): static
    {
        return $this->state([
            'current_points'  => $current,
            'lifetime_points' => $lifetime ?? $current,
        ]);
    }

    public function inTier(int $tierId): static
    {
        return $this->state(['tier_id' => $tierId]);
    }
}
