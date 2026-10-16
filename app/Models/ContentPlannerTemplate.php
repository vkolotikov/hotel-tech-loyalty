<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

/** A post template of a brand's Content profile (spec 2026-10-16 §5): its fields with [blanks]; the pillar by name. */
class ContentPlannerTemplate extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    /** A brand keeps at most this many templates. */
    public const MAX = 100;

    protected $fillable = ['planner_profile_id', 'brand_id', 'name', 'platform', 'pillar_name', 'topic', 'hook', 'main_copy', 'cta', 'hashtags', 'created_by'];

    protected $casts = ['hashtags' => 'array'];
}
