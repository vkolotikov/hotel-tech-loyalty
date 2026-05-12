<?php

namespace App\Models;

use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * Time-bounded earn-rate multiplier. Active when:
 *   - now() is between starts_at and ends_at
 *   - is_active = true
 *   - (optional) today's weekday is in days_of_week
 *   - (optional) member tier in tier_ids
 *   - (optional) property_id matches the earn context
 *
 * LoyaltyService::calculateEarnedPoints picks the HIGHEST matching
 * multiplier so a Gold member earning at a Saturday spa event with
 * one event matching (2x) and another matching (3x) gets 3x, not 6x.
 */
class EarnRateEvent extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    protected $fillable = [
        'organization_id', 'brand_id', 'name', 'description',
        'multiplier', 'starts_at', 'ends_at',
        'days_of_week', 'tier_ids', 'property_id', 'is_active',
    ];

    protected $casts = [
        'multiplier'   => 'decimal:2',
        'starts_at'    => 'datetime',
        'ends_at'      => 'datetime',
        'days_of_week' => 'array',
        'tier_ids'     => 'array',
        'is_active'    => 'boolean',
    ];

    public function scopeActiveNow(Builder $q): Builder
    {
        $now = now();
        return $q->where('is_active', true)
            ->where('starts_at', '<=', $now)
            ->where('ends_at',   '>=', $now);
    }

    /**
     * Does this event apply to a transaction with the given member +
     * property + timestamp?
     */
    public function appliesTo(?LoyaltyMember $member, ?int $propertyId, ?\DateTimeInterface $when = null): bool
    {
        $when = $when ? \Carbon\Carbon::instance($when) : now();
        if (!$this->is_active) return false;
        if ($this->starts_at && $when->lt($this->starts_at)) return false;
        if ($this->ends_at   && $when->gt($this->ends_at))   return false;

        $dow = $this->days_of_week;
        if (is_array($dow) && !empty($dow) && !in_array((int) $when->dayOfWeek, $dow, true)) {
            return false;
        }

        if ($this->property_id !== null && $this->property_id !== $propertyId) {
            return false;
        }

        $tierIds = $this->tier_ids;
        if (is_array($tierIds) && !empty($tierIds)) {
            $memberTierId = $member?->tier_id;
            if ($memberTierId === null || !in_array((int) $memberTierId, array_map('intval', $tierIds), true)) {
                return false;
            }
        }

        return true;
    }
}
