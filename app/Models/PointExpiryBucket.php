<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PointExpiryBucket extends Model
{
    protected $fillable = [
        'member_id', 'transaction_id', 'original_points',
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
