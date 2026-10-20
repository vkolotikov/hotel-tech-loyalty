<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** The brand's website as Content reads it (spec 2026-10-20 §3): one per profile. */
class ContentSite extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id', 'brand_id', 'planner_profile_id', 'url', 'status', 'error', 'scan_token', 'scan_queued_at',
        'scan_started_at', 'scanned_at', 'articles_count', 'pages_count', 'summary', 'summary_updated_at', 'summary_edited',
        'summary_note',
    ];

    protected $casts = [
        'scan_queued_at'     => 'datetime',
        'scan_started_at'    => 'datetime',
        'scanned_at'         => 'datetime',
        'summary_updated_at' => 'datetime',
        'summary_edited'     => 'boolean',
        'articles_count'     => 'integer',
        'pages_count'        => 'integer',
    ];

    protected $attributes = ['status' => 'new', 'summary_edited' => false, 'articles_count' => 0, 'pages_count' => 0];

    public function pages(): HasMany
    {
        return $this->hasMany(ContentSitePage::class, 'site_id');
    }
}
