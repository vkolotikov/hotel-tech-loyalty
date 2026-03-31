<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\BelongsToOrganization;

class SpecialOffer extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'title', 'description', 'type', 'value', 'tier_ids', 'start_date', 'end_date',
        'usage_limit', 'times_used', 'per_member_limit', 'image_url', 'terms_conditions',
        'is_active', 'is_featured', 'ai_generated', 'created_by',
    ];

    protected $casts = [
        'tier_ids' => 'array',
        'start_date' => 'date',
        'end_date' => 'date',
        'is_active' => 'boolean',
        'is_featured' => 'boolean',
        'ai_generated' => 'boolean',
        'value' => 'decimal:2',
    ];

    public function memberOffers()
    {
        return $this->hasMany(MemberOffer::class, 'offer_id');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true)
            ->where('start_date', '<=', now())
            ->where('end_date', '>=', now());
    }

    public function scopeForTier($query, int $tierId)
    {
        return $query->where(function ($q) use ($tierId) {
            $q->whereNull('tier_ids')
              ->orWhereJsonContains('tier_ids', $tierId);
        });
    }
}
