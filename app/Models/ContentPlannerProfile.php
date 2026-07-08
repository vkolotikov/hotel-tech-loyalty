<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ContentPlannerProfile extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id',
        'brand_id',
        'name',
        'default_language',
        'default_tone',
        'primary_goal',
        'secondary_goals',
        'content_rules',
        'knowledge_sources',
        'knowledge_summary_long',
        'knowledge_summary_short',
        'last_knowledge_sync_at',
        'setup_completed_at',
        'created_by',
        'brand_summary',
        'usp',
        'mission',
        'brand_values',
        'brand_promise',
        'differentiators',
        'proof_points',
        'price_position',
        'main_cta',
        'important_links',
        'positioning',
        'key_messages',
        'content_mix',
        'weekly_rhythm',
        'engagement_goals',
        'visual_style',
        'trend_mode',
        'knowledge_score',
        'setup_step',
    ];

    protected $casts = [
        'secondary_goals' => 'array',
        'content_rules' => 'array',
        'knowledge_sources' => 'array',
        'setup_completed_at' => 'datetime',
        'last_knowledge_sync_at' => 'datetime',
        'brand_values' => 'array',
        'proof_points' => 'array',
        'important_links' => 'array',
        'positioning' => 'array',
        'key_messages' => 'array',
        'content_mix' => 'array',
        'weekly_rhythm' => 'array',
        'engagement_goals' => 'array',
        'visual_style' => 'array',
        'knowledge_score' => 'integer',
        'setup_step' => 'integer',
    ];

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function audiences(): HasMany
    {
        return $this->hasMany(ContentPlannerAudience::class, 'planner_profile_id');
    }

    public function channels(): HasMany
    {
        return $this->hasMany(ContentPlannerChannel::class, 'planner_profile_id');
    }

    public function brandVoices(): HasMany
    {
        return $this->hasMany(ContentPlannerBrandVoice::class, 'planner_profile_id');
    }

    public function strategies(): HasMany
    {
        return $this->hasMany(ContentPlannerStrategy::class, 'planner_profile_id');
    }

    public function pillars(): HasMany
    {
        return $this->hasMany(ContentPlannerPillar::class, 'planner_profile_id');
    }

    public function campaigns(): HasMany
    {
        return $this->hasMany(ContentPlannerCampaign::class, 'planner_profile_id');
    }

    public function posts(): HasMany
    {
        return $this->hasMany(ContentPlannerPost::class, 'planner_profile_id');
    }

    public function assets(): HasMany
    {
        return $this->hasMany(ContentPlannerAsset::class, 'planner_profile_id');
    }

    public function aiGenerations(): HasMany
    {
        return $this->hasMany(ContentPlannerAiGeneration::class, 'planner_profile_id');
    }
}
