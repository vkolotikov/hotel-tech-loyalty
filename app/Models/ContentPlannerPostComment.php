<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A comment on a post (spec 2026-10-16 §7.1): its author edits or deletes it; managers delete anyone's. */
class ContentPlannerPostComment extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    /** A comment holds 1–2,000 characters. */
    public const MAX_LENGTH = 2000;

    protected $fillable = ['post_id', 'brand_id', 'user_id', 'body', 'edited_at'];

    protected $casts = ['edited_at' => 'datetime'];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function post(): BelongsTo
    {
        return $this->belongsTo(ContentPlannerPost::class, 'post_id');
    }
}
