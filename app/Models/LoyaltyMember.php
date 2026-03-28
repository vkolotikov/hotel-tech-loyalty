<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class LoyaltyMember extends Model
{
    protected $fillable = [
        'user_id', 'member_number', 'tier_id', 'lifetime_points', 'current_points',
        'qualifying_points', 'tier_review_date', 'tier_effective_from', 'tier_effective_until',
        'tier_qualification_model', 'qualifying_nights', 'qualifying_stays', 'qualifying_spend',
        'tier_locked', 'property_id',
        'points_expiry_date', 'qr_code_token', 'nfc_uid', 'nfc_card_issued_at',
        'referral_code', 'referred_by', 'is_active', 'marketing_consent',
        'email_notifications', 'push_notifications', 'expo_push_token',
        'joined_at', 'last_activity_at',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'marketing_consent' => 'boolean',
        'email_notifications' => 'boolean',
        'push_notifications' => 'boolean',
        'points_expiry_date' => 'date',
        'nfc_card_issued_at' => 'datetime',
        'joined_at' => 'datetime',
        'last_activity_at' => 'datetime',
        'tier_review_date' => 'date',
        'tier_effective_from' => 'date',
        'tier_effective_until' => 'date',
        'tier_locked' => 'boolean',
        'qualifying_spend' => 'decimal:2',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function tier(): BelongsTo
    {
        return $this->belongsTo(LoyaltyTier::class);
    }

    public function pointsTransactions(): HasMany
    {
        return $this->hasMany(PointsTransaction::class, 'member_id');
    }

    public function bookings(): HasMany
    {
        return $this->hasMany(Booking::class, 'member_id');
    }

    public function memberOffers(): HasMany
    {
        return $this->hasMany(MemberOffer::class, 'member_id');
    }

    public function nfcCards(): HasMany
    {
        return $this->hasMany(NfcCard::class, 'member_id');
    }

    public function aiConversations(): HasMany
    {
        return $this->hasMany(AiConversation::class, 'member_id');
    }

    public function referredBy(): BelongsTo
    {
        return $this->belongsTo(LoyaltyMember::class, 'referred_by');
    }

    public function referrals(): HasMany
    {
        return $this->hasMany(Referral::class, 'referrer_id');
    }

    public function identities(): HasMany
    {
        return $this->hasMany(MemberIdentity::class, 'member_id');
    }

    public function expiryBuckets(): HasMany
    {
        return $this->hasMany(PointExpiryBucket::class, 'member_id');
    }

    public function tierAssessments(): HasMany
    {
        return $this->hasMany(TierAssessment::class, 'member_id');
    }

    public function benefitEntitlements(): HasMany
    {
        return $this->hasMany(BenefitEntitlement::class, 'member_id');
    }

    public function scanEvents(): HasMany
    {
        return $this->hasMany(ScanEvent::class, 'member_id');
    }

    public function property(): BelongsTo
    {
        return $this->belongsTo(Property::class);
    }

    public function guests(): HasMany
    {
        return $this->hasMany(Guest::class, 'member_id');
    }

    public function activeExpiryBuckets(): HasMany
    {
        return $this->hasMany(PointExpiryBucket::class, 'member_id')
            ->where('is_expired', false)
            ->where('remaining_points', '>', 0)
            ->orderBy('expires_at');
    }

    public function getProgressToNextTier(): array
    {
        $nextTier = $this->tier->getNextTier();
        if (!$nextTier) {
            return ['percentage' => 100, 'points_needed' => 0, 'next_tier' => null];
        }
        $pointsNeeded = $nextTier->min_points - $this->lifetime_points;
        $rangeSize = $nextTier->min_points - $this->tier->min_points;
        $progress = min(100, (($this->lifetime_points - $this->tier->min_points) / $rangeSize) * 100);
        return [
            'percentage' => round($progress, 1),
            'points_needed' => max(0, $pointsNeeded),
            'next_tier' => $nextTier,
        ];
    }
}
