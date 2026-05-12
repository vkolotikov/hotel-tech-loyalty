<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Saved member-segment definition. The `definition` jsonb shape is
 * interpreted by MemberSegmentService::buildQuery.
 *
 * Example:
 *   {
 *     "operator": "AND",
 *     "filters": [
 *       {"type": "tier", "op": "in", "value": [1,2]},
 *       {"type": "activity", "op": "inactive_days", "value": 60}
 *     ]
 *   }
 */
class MemberSegment extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'name', 'description', 'definition',
        'member_count_cached', 'member_count_computed_at',
        'created_by_user_id', 'last_sent_at', 'total_sent_count',
    ];

    protected $casts = [
        'definition'               => 'array',
        'member_count_computed_at' => 'datetime',
        'last_sent_at'             => 'datetime',
        'total_sent_count'         => 'integer',
        'member_count_cached'      => 'integer',
    ];

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }
}
