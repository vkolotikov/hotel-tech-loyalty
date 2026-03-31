<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use App\Traits\BelongsToOrganization;

class BenefitDefinition extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'name', 'code', 'description', 'category', 'fulfillment_mode',
        'usage_limit_per_stay', 'usage_limit_per_year', 'requires_active_stay',
        'operational_constraints', 'sort_order', 'is_active',
    ];

    protected $casts = [
        'operational_constraints' => 'array',
        'requires_active_stay'    => 'boolean',
        'is_active'               => 'boolean',
    ];

    public function tierBenefits(): HasMany
    {
        return $this->hasMany(TierBenefit::class, 'benefit_id');
    }

    public function entitlements(): HasMany
    {
        return $this->hasMany(BenefitEntitlement::class, 'benefit_id');
    }

    public function tiers(): BelongsToMany
    {
        return $this->belongsToMany(LoyaltyTier::class, 'tier_benefits', 'benefit_id', 'tier_id')
            ->withPivot('property_id', 'value', 'custom_description', 'is_active')
            ->withTimestamps();
    }
}
