<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Tenant-scoped via `organization_id`, backfilled from the member row.
 *
 * Without it, any aggregate that starts here rather than from
 * `loyalty_members` reads every tenant at once — which is exactly what
 * the points-liability and expiry-forecast figures did.
 */
class TierAssessment extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'member_id', 'old_tier_id', 'new_tier_id', 'reason',
        'qualifying_points_at_assessment', 'qualifying_nights_at_assessment',
        'qualifying_stays_at_assessment', 'qualifying_spend_at_assessment',
        'assessment_window_start', 'assessment_window_end',
        'assessed_by', 'notes',
    ];

    protected $casts = [
        'assessment_window_start' => 'date',
        'assessment_window_end'   => 'date',
    ];

    public function member(): BelongsTo
    {
        return $this->belongsTo(LoyaltyMember::class, 'member_id');
    }

    public function oldTier(): BelongsTo
    {
        return $this->belongsTo(LoyaltyTier::class, 'old_tier_id');
    }

    public function newTier(): BelongsTo
    {
        return $this->belongsTo(LoyaltyTier::class, 'new_tier_id');
    }

    public function assessedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assessed_by');
    }
}
