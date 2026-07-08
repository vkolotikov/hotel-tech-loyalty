<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ContentPlannerPillar extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id',
        'brand_id',
        'planner_profile_id',
        'strategy_id',
        'name',
        'description',
        'purpose',
        'frequency_weight',
        'recommended_platforms',
        'example_topics',
        'cta_examples',
        'visual_direction',
        'active',
    ];

    protected $casts = [
        'recommended_platforms' => 'array',
        'example_topics' => 'array',
        'cta_examples' => 'array',
        'active' => 'boolean',
        'frequency_weight' => 'integer',
    ];

    public function profile(): BelongsTo
    {
        return $this->belongsTo(ContentPlannerProfile::class, 'planner_profile_id');
    }

    public function strategy(): BelongsTo
    {
        return $this->belongsTo(ContentPlannerStrategy::class, 'strategy_id');
    }

    public function posts(): HasMany
    {
        return $this->hasMany(ContentPlannerPost::class, 'pillar_id');
    }

    public function scopeActive($query)
    {
        return $query->where('active', true);
    }
}
