<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TierBenefit extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'tier_id', 'benefit_id', 'property_id', 'value',
        'custom_description', 'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];

    public function tier(): BelongsTo
    {
        return $this->belongsTo(LoyaltyTier::class, 'tier_id');
    }

    public function benefit(): BelongsTo
    {
        return $this->belongsTo(BenefitDefinition::class, 'benefit_id');
    }

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }
}
