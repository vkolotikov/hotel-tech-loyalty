<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OfferRule extends Model
{
    protected $fillable = [
        'offer_id', 'rule_type', 'operator', 'value', 'is_active',
    ];

    protected $casts = [
        'value'     => 'array',
        'is_active' => 'boolean',
    ];

    public function offer(): BelongsTo
    {
        return $this->belongsTo(SpecialOffer::class, 'offer_id');
    }

    /**
     * Evaluate this rule against a member.
     */
    public function evaluate(LoyaltyMember $member): bool
    {
        if (!$this->is_active) {
            return true;
        }

        $actual = $this->getMemberValue($member);

        return match ($this->operator) {
            'eq'      => $actual == $this->value[0],
            'neq'     => $actual != $this->value[0],
            'gt'      => $actual > $this->value[0],
            'gte'     => $actual >= $this->value[0],
            'lt'      => $actual < $this->value[0],
            'lte'     => $actual <= $this->value[0],
            'in'      => in_array($actual, $this->value),
            'not_in'  => !in_array($actual, $this->value),
            'between' => $actual >= $this->value[0] && $actual <= $this->value[1],
            default   => true,
        };
    }

    private function getMemberValue(LoyaltyMember $member): mixed
    {
        $member->loadMissing(['tier', 'user', 'bookings']);

        return match ($this->rule_type) {
            'tier'               => $member->tier_id,
            'property'           => $member->property_id,
            'point_balance'      => $member->current_points,
            'lifetime_value'     => $member->lifetime_points,
            'nationality'        => $member->user?->nationality,
            'language'           => $member->user?->language,
            'visit_frequency'    => $member->bookings->count(),
            'days_since_last_stay' => $member->last_activity_at
                ? now()->diffInDays($member->last_activity_at)
                : 9999,
            'qualifying_nights'  => $member->qualifying_nights,
            'qualifying_spend'   => $member->qualifying_spend,
            'birthday'           => $member->user?->date_of_birth
                ? $member->user->date_of_birth->format('m')
                : null,
            default              => null,
        };
    }
}
