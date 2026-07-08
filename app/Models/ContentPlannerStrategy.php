<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ContentPlannerStrategy extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id',
        'brand_id',
        'planner_profile_id',
        'title',
        'summary',
        'goals',
        'platform_strategy',
        'content_mix',
        'visual_direction',
        'ai_output',
        'status',
        'created_by',
    ];

    protected $casts = [
        'goals' => 'array',
        'platform_strategy' => 'array',
        'content_mix' => 'array',
        'ai_output' => 'array',
    ];

    public function profile(): BelongsTo
    {
        return $this->belongsTo(ContentPlannerProfile::class, 'planner_profile_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function pillars(): HasMany
    {
        return $this->hasMany(ContentPlannerPillar::class, 'strategy_id');
    }

    public function posts(): HasMany
    {
        return $this->hasMany(ContentPlannerPost::class, 'strategy_id');
    }

    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    public function scopeRecent($query)
    {
        return $query->orderByDesc('created_at');
    }
}
