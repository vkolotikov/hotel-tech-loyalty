<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ContentPlannerChannel extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id',
        'brand_id',
        'planner_profile_id',
        'platform',
        'label',
        'url',
        'goal',
        'audience_id',
        'default_language',
        'tone_override',
        'frequency',
        'preferred_formats',
        'emoji_policy',
        'hashtag_policy',
        'max_length',
        'active',
        'settings',
        'role',
        'posts_per_week',
        'cta_style',
        'visual_style',
        'link_policy',
    ];

    protected $casts = [
        'frequency' => 'array',
        'preferred_formats' => 'array',
        'settings' => 'array',
        'active' => 'boolean',
        'max_length' => 'integer',
        'posts_per_week' => 'integer',
    ];

    public function profile(): BelongsTo
    {
        return $this->belongsTo(ContentPlannerProfile::class, 'planner_profile_id');
    }

    public function audience(): BelongsTo
    {
        return $this->belongsTo(ContentPlannerAudience::class, 'audience_id');
    }

    public function scopeActive($query)
    {
        return $query->where('active', true);
    }

    public function scopeByPlatform($query, string $platform)
    {
        return $query->where('platform', $platform);
    }
}
