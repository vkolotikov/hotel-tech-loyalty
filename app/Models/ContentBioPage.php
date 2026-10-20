<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A brand's link-in-bio page (spec 2026-10-19 §6): `/links/{slug}` on the public host, off until a manager switches it
 * on. A public request has no tenant: the public host reads it with withoutGlobalScopes(), by slug.
 */
class ContentBioPage extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = ['organization_id', 'brand_id', 'planner_profile_id', 'slug', 'is_on', 'title', 'line', 'show_posts'];

    protected $casts = ['is_on' => 'boolean', 'show_posts' => 'boolean'];

    public function buttons(): HasMany
    {
        return $this->hasMany(ContentBioButton::class, 'bio_page_id')->orderBy('position');
    }
}
