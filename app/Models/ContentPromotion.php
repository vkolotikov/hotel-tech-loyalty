<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One page of a promotion (spec 2026-10-20 §4.5): queued → writing → done | failed, or stopped. */
class ContentPromotion extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id', 'brand_id', 'planner_profile_id', 'site_page_id', 'batch', 'status', 'error', 'posts_wanted',
        'posts_made', 'slots', 'instructions', 'use_picture', 'created_by', 'started_at', 'finished_at',
    ];

    protected $casts = [
        'slots'        => 'array',
        'use_picture'  => 'boolean',
        'posts_wanted' => 'integer',
        'posts_made'   => 'integer',
        'started_at'   => 'datetime',
        'finished_at'  => 'datetime',
    ];

    protected $attributes = ['posts_made' => 0, 'use_picture' => true];

    public function page(): BelongsTo
    {
        return $this->belongsTo(ContentSitePage::class, 'site_page_id');
    }
}
