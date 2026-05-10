<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A sales pipeline — a named sequence of stages that deals (inquiries)
 * progress through. Most orgs only need one ("Sales"); hotel groups
 * commonly add a second for MICE / group / corporate sales since those
 * funnels look different.
 *
 * Phase 1 ships only the default pipeline; Phase 3 adds the admin UI
 * to rename/reorder stages and create additional pipelines.
 */
class Pipeline extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'brand_id', 'name', 'slug',
        'description', 'is_default', 'sort_order',
    ];

    protected $casts = [
        'is_default' => 'boolean',
        'sort_order' => 'integer',
    ];

    public function stages(): HasMany
    {
        return $this->hasMany(PipelineStage::class)->orderBy('sort_order');
    }

    public function inquiries(): HasMany
    {
        return $this->hasMany(Inquiry::class);
    }
}
