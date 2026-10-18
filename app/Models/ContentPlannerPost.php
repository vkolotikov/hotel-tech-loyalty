<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ContentPlannerPost extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id',
        'brand_id',
        'planner_profile_id',
        'campaign_id',
        'strategy_id',
        'pillar_id',
        'audience_id',
        'platform',
        'scheduled_date',
        'scheduled_time',
        'language',
        'topic',
        'title',
        'goal',
        'format',
        'status',
        'main_copy',
        'short_copy',
        'alternative_copy',
        'hook',
        'cta',
        'hashtags',
        'visual_brief_id',
        'quality_score',
        'source_context',
        'published_url',
        'published_at',
        'created_by',
        'weekday_role',
        'funnel_stage',
        'post_type',
        'strategic_reason',
        'engagement_mechanic',
        'generated_by',
        'series_id',
    ];

    protected $casts = [
        'hashtags' => 'array',
        'quality_score' => 'array',
        'source_context' => 'array',
        'scheduled_date' => 'date:Y-m-d',
        'scheduled_time' => 'string',
        'published_at' => 'datetime',
        'engagement_mechanic' => 'array',
    ];

    public function profile(): BelongsTo
    {
        return $this->belongsTo(ContentPlannerProfile::class, 'planner_profile_id');
    }

    public function campaign(): BelongsTo
    {
        return $this->belongsTo(ContentPlannerCampaign::class, 'campaign_id');
    }

    public function strategy(): BelongsTo
    {
        return $this->belongsTo(ContentPlannerStrategy::class, 'strategy_id');
    }

    public function pillar(): BelongsTo
    {
        return $this->belongsTo(ContentPlannerPillar::class, 'pillar_id');
    }

    public function audience(): BelongsTo
    {
        return $this->belongsTo(ContentPlannerAudience::class, 'audience_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function visualBrief(): HasOne
    {
        return $this->hasOne(ContentPlannerVisualBrief::class, 'post_id');
    }

    public function variations(): HasMany
    {
        return $this->hasMany(ContentPlannerPostVariation::class, 'post_id');
    }

    /** Its approval steps (spec 2026-10-16 §6.4). */
    public function events(): HasMany
    {
        return $this->hasMany(ContentPlannerPostEvent::class, 'post_id');
    }

    public function comments(): HasMany
    {
        return $this->hasMany(ContentPlannerPostComment::class, 'post_id');
    }

    /**
     * Cards' review facts in the list's own query (spec 2026-10-16 §6.3, §7.1): the comment count and the latest
     * approval step, so a card never asks again.
     */
    public function scopeWithReview($query)
    {
        $latest = fn (string $column) => ContentPlannerPostEvent::select($column)
            ->whereColumn('post_id', 'content_planner_posts.id')->orderByDesc('id')->limit(1);

        return $query->withCount('comments')->addSelect(['last_event_kind' => $latest('kind'), 'last_event_at' => $latest('created_at')]);
    }

    public function scopeByStatus($query, string $status)
    {
        return $query->where('status', $status);
    }

    public function scopeByPlatform($query, string $platform)
    {
        return $query->where('platform', $platform);
    }

    public function scopeScheduledBetween($query, $from, $to)
    {
        return $query->whereBetween('scheduled_date', [$from, $to]);
    }

    public function scopePublished($query)
    {
        return $query->where('status', 'published')->whereNotNull('published_at');
    }

    public function scopeReadyToPublish($query)
    {
        return $query->where('status', 'ready_to_publish');
    }

    public function scopeRecent($query)
    {
        return $query->orderByDesc('created_at');
    }
}
