<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Self-serve redemption-catalog item. Org-scoped + optionally
 * brand-scoped (null brand_id = visible to every brand under the org).
 *
 * Stock semantics:
 *  - null → unlimited supply
 *  - 0    → out of stock (not redeemable, still shown for transparency)
 *  - >0   → decremented atomically on redemption
 *
 * Categories are free-form strings so admins can match their own
 * taxonomy. No FK / enum table — keeps the surface small.
 */
class Reward extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id', 'brand_id',
        'name', 'description', 'terms', 'image_url', 'category',
        'points_cost', 'stock', 'per_member_limit',
        'expires_at', 'is_active', 'sort_order',
    ];

    protected $casts = [
        'expires_at'       => 'datetime',
        'is_active'        => 'boolean',
        'points_cost'      => 'integer',
        'stock'            => 'integer',
        'per_member_limit' => 'integer',
        'sort_order'       => 'integer',
    ];

    public function redemptions(): HasMany
    {
        return $this->hasMany(RewardRedemption::class);
    }

    /**
     * True when the reward is currently obtainable by a member:
     * active, not expired, has stock (or unlimited).
     */
    public function isRedeemable(): bool
    {
        if (!$this->is_active) return false;
        if ($this->expires_at && $this->expires_at->isPast()) return false;
        if ($this->stock !== null && $this->stock <= 0) return false;
        return true;
    }
}
