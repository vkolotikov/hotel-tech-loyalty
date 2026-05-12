<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A single member's claim against a Reward.
 *
 * Ledger-style row. `points_spent` is denormalised so reward edits
 * don't rewrite history; `code` is the short human-friendly string
 * (e.g. REW-7K3P9V2A) the member shows staff at pickup; staff
 * flip `status` to fulfilled or cancelled.
 *
 * Cancelling a pending redemption refunds the points via
 * LoyaltyService::awardPoints with type='adjust'. Once fulfilled,
 * a cancel becomes a manual write-off rather than an automatic
 * refund (the value has already been consumed).
 */
class RewardRedemption extends Model
{
    use BelongsToOrganization;

    public const STATUS_PENDING   = 'pending';
    public const STATUS_FULFILLED = 'fulfilled';
    public const STATUS_CANCELLED = 'cancelled';

    protected $fillable = [
        'organization_id', 'member_id', 'reward_id',
        'fulfilled_by_user_id', 'cancelled_by_user_id',
        'points_spent', 'code', 'status', 'notes',
        'fulfilled_at', 'cancelled_at',
    ];

    protected $casts = [
        'points_spent' => 'integer',
        'fulfilled_at' => 'datetime',
        'cancelled_at' => 'datetime',
    ];

    public function reward(): BelongsTo
    {
        return $this->belongsTo(Reward::class);
    }

    public function member(): BelongsTo
    {
        return $this->belongsTo(LoyaltyMember::class, 'member_id');
    }

    public function fulfilledBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'fulfilled_by_user_id');
    }

    public function cancelledBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by_user_id');
    }
}
