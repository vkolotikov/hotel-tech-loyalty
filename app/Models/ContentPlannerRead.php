<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;

/** When a person last opened a brand's "For you" list (spec 2026-10-16 §8); news after `seen_at` is new. */
class ContentPlannerRead extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    public $timestamps = false;

    protected $fillable = ['user_id', 'planner_profile_id', 'brand_id', 'seen_at'];

    protected $casts = ['seen_at' => 'datetime'];
}
