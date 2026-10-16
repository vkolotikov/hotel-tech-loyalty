<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

/** A saved hashtag group or text snippet of a brand's Content profile (spec 2026-10-15 §6). */
class ContentPlannerSnippet extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    public const KINDS = ['hashtags', 'text'];

    /** A brand keeps at most this many of each kind. */
    public const MAX_PER_KIND = 50;

    protected $fillable = ['planner_profile_id', 'brand_id', 'kind', 'name', 'body', 'sort_order'];

    protected $casts = ['sort_order' => 'integer'];
}
