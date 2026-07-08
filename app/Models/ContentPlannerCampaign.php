<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ContentPlannerCampaign extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id',
        'brand_id',
        'planner_profile_id',
        'name',
        'goal',
        'audience_id',
        'start_date',
        'end_date',
        'platforms',
        'offer',
        'landing_page',
        'key_message',
        'cta',
        'status',
        'notes',
        'ai_output',
    ];

    protected $casts = [
        'platforms' => 'array',
        'ai_output' => 'array',
        'start_date' => 'date',
        'end_date' => 'date',
    ];

    public function profile(): BelongsTo
    {
        return $this->belongsTo(ContentPlannerProfile::class, 'planner_profile_id');
    }

    public function audience(): BelongsTo
    {
        return $this->belongsTo(ContentPlannerAudience::class, 'audience_id');
    }

    public function posts(): HasMany
    {
        return $this->hasMany(ContentPlannerPost::class, 'campaign_id');
    }

    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    public function scopeByStatus($query, string $status)
    {
        return $query->where('status', $status);
    }
}
