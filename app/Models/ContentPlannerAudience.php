<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ContentPlannerAudience extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id',
        'brand_id',
        'planner_profile_id',
        'name',
        'description',
        'industry',
        'country',
        'language',
        'pain_points',
        'goals',
        'objections',
        'buying_triggers',
        'preferred_platforms',
        'preferred_tone',
        'active',
        'job_role',
        'business_size',
        'fears',
        'emotional_triggers',
        'rational_triggers',
        'questions',
        'content_they_trust',
        'desired_transformation',
        'is_ai_assumed',
    ];

    protected $casts = [
        'pain_points' => 'array',
        'goals' => 'array',
        'objections' => 'array',
        'buying_triggers' => 'array',
        'preferred_platforms' => 'array',
        'active' => 'boolean',
        'fears' => 'array',
        'emotional_triggers' => 'array',
        'rational_triggers' => 'array',
        'questions' => 'array',
        'is_ai_assumed' => 'boolean',
    ];

    public function profile(): BelongsTo
    {
        return $this->belongsTo(ContentPlannerProfile::class, 'planner_profile_id');
    }

    public function channels(): HasMany
    {
        return $this->hasMany(ContentPlannerChannel::class, 'audience_id');
    }

    public function posts(): HasMany
    {
        return $this->hasMany(ContentPlannerPost::class, 'audience_id');
    }

    public function campaigns(): HasMany
    {
        return $this->hasMany(ContentPlannerCampaign::class, 'audience_id');
    }

    public function scopeActive($query)
    {
        return $query->where('active', true);
    }
}
