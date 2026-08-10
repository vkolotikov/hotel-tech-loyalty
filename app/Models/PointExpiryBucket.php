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
class PointExpiryBucket extends Model
{
    use BelongsToOrganization;

    protected $fillable = [
        'organization_id', 'member_id', 'transaction_id', 'original_points',
        'remaining_points', 'earned_at', 'expires_at', 'is_expired',
    ];

    protected $casts = [
        'earned_at'  => 'date',
        'expires_at' => 'date',
        'is_expired' => 'boolean',
    ];

    public function member(): BelongsTo
    {
        return $this->belongsTo(LoyaltyMember::class, 'member_id');
    }

    public function transaction(): BelongsTo
    {
        return $this->belongsTo(PointsTransaction::class, 'transaction_id');
    }

    /**
     * Consume points from this bucket (oldest-first redemption).
     */
    public function consume(int $points): int
    {
        $available = min($points, $this->remaining_points);
        $this->decrement('remaining_points', $available);

        if ($this->remaining_points <= 0) {
            $this->update(['is_expired' => true]);
        }

        return $available;
    }
}
