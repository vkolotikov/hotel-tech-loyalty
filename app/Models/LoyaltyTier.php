<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use App\Traits\BelongsToOrganization;

class LoyaltyTier extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'name', 'min_points', 'max_points', 'earn_rate', 'bonus_nights',
        'color_hex', 'icon', 'perks', 'sort_order', 'is_active',
    ];

    protected $casts = [
        'perks' => 'array',
        'is_active' => 'boolean',
        'earn_rate' => 'decimal:2',
    ];

    public function members()
    {
        return $this->hasMany(LoyaltyMember::class, 'tier_id');
    }

    public function tierBenefits(): HasMany
    {
        return $this->hasMany(TierBenefit::class, 'tier_id');
    }

    public function benefits(): BelongsToMany
    {
        return $this->belongsToMany(BenefitDefinition::class, 'tier_benefits', 'tier_id', 'benefit_id')
            ->withPivot('property_id', 'value', 'custom_description', 'is_active')
            ->withTimestamps();
    }

    public function getNextTier(): ?self
    {
        return self::where('min_points', '>', $this->min_points)
            ->where('is_active', true)
            ->orderBy('min_points')
            ->first();
    }
}
