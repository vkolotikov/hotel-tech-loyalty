<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContentPlannerBrandVoice extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id',
        'brand_id',
        'planner_profile_id',
        'name',
        'tone',
        'style',
        'formality_level',
        'emoji_policy',
        'hashtag_policy',
        'preferred_words',
        'forbidden_words',
        'example_good_posts',
        'example_bad_posts',
        'active',
        'sentence_style',
        'point_of_view',
        'claims_to_avoid',
    ];

    protected $casts = [
        'preferred_words' => 'array',
        'forbidden_words' => 'array',
        'example_good_posts' => 'array',
        'example_bad_posts' => 'array',
        'active' => 'boolean',
        'claims_to_avoid' => 'array',
    ];

    public function profile(): BelongsTo
    {
        return $this->belongsTo(ContentPlannerProfile::class, 'planner_profile_id');
    }

    public function scopeActive($query)
    {
        return $query->where('active', true);
    }
}
