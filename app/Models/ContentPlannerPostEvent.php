<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One approval step on a post (spec 2026-10-16 §6.4); kept when its author leaves (`user_id` null). */
class ContentPlannerPostEvent extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    public const KINDS = ['sent_for_approval', 'approved', 'sent_back', 'changed_after_approval'];

    /** A step happens once: it has no later version. */
    public const UPDATED_AT = null;

    protected $fillable = ['post_id', 'brand_id', 'user_id', 'kind', 'note'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function post(): BelongsTo
    {
        return $this->belongsTo(ContentPlannerPost::class, 'post_id');
    }
}
