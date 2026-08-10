<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Deliberately NOT tenant-scoped — see MemberOfferModelTest.
 *
 * Every query site is anchored to a member (`where('member_id', …)`, the
 * `$member->memberOffers()` relation, or `SpecialOffer->memberOffers()` on
 * an already-scoped offer), so LoyaltyMember owns the tenant link and a
 * second scope here would only add a column to keep in sync.
 *
 * `organization_id` is populated by the tenant-scope migration so the
 * column is available for reporting, but nothing depends on it.
 */
class MemberOffer extends Model
{
    protected $fillable = [
        'organization_id', 'member_id', 'offer_id', 'ai_generated', 'ai_reason',
        'claimed_at', 'used_at', 'expires_at', 'status',
    ];

    protected $casts = [
        'ai_generated' => 'boolean',
        'claimed_at' => 'datetime',
        'used_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    public function member() { return $this->belongsTo(LoyaltyMember::class, 'member_id'); }
    public function offer() { return $this->belongsTo(SpecialOffer::class, 'offer_id'); }
}
