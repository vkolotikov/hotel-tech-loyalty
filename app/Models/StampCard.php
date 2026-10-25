<?php

namespace App\Models;

use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One of a member's stamp cards (release 7, spec 2026-10-25 §2): number 1, 2, … per member, the stamps it needs (the
 * venue's `stamps_per_card` when it was opened — a later change applies to new cards only), the stamps it has, and,
 * once full, when it was completed and what it gave (`reward_kind` `points` with its ledger line, or `reward` with the
 * free redemption). At most one card of a member is open (`completed_at` null).
 *
 * Written only by App\Services\Loyalty\Stamps\StampCards, under the member row lock, with the organisation named
 * explicitly: nothing is mass-assigned, so no request field can reach a column.
 */
class StampCard extends Model
{
    use BelongsToOrganization;

    public const KIND_POINTS = 'points';
    public const KIND_REWARD = 'reward';

    protected $table = 'stamp_cards';

    /** StampCards writes with forceFill(); nothing reaches a column by mass assignment. */
    protected $guarded = ['*'];

    protected $casts = [
        'number'                       => 'integer',
        'stamps_needed'                => 'integer',
        'stamps_count'                 => 'integer',
        'completed_at'                 => 'datetime',
        'reward_points_transaction_id' => 'integer',
        'reward_redemption_id'         => 'integer',
    ];

    public function member(): BelongsTo
    {
        return $this->belongsTo(LoyaltyMember::class, 'member_id');
    }

    public function stamps(): HasMany
    {
        return $this->hasMany(Stamp::class, 'stamp_card_id');
    }
}
