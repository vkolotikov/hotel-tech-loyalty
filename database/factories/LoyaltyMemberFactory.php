<?php

namespace Database\Factories;

use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Models\User;
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
            // NOT NULL in production: enrolment gives every member a user of the venue, its lowest tier, a QR token
            // and a referral code (both unique). A test that names a tier or a user passes it and these are not used.
            'user_id'            => fn (array $attributes) => User::create([
                'name'            => fake()->name(),
                'email'           => 'member-' . Str::lower(Str::random(12)) . '@example.test',
                'password'        => 'factory-member-password-hash',
                'user_type'       => 'member',
                'organization_id' => self::organizationId($attributes),
            ])->id,
            'tier_id'            => fn (array $attributes) => LoyaltyTier::withoutGlobalScopes()
                ->where('organization_id', self::organizationId($attributes))
                ->orderBy('min_points')
                ->value('id')
                ?? LoyaltyTierFactory::new()->bronze()->create(['organization_id' => self::organizationId($attributes)])->id,
            'qr_code_token'      => Str::random(64),
            'referral_code'      => Str::upper(Str::random(10)),
        ];
    }

    /** The member's organisation: the one given, else the bound tenant (which BelongsToOrganization stamps on create). */
    private static function organizationId(array $attributes): ?int
    {
        if (app()->bound('current_organization_id') && app('current_organization_id')) {
            return (int) app('current_organization_id');
        }

        return isset($attributes['organization_id']) ? (int) $attributes['organization_id'] : null;
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
