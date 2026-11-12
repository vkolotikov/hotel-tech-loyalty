<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Traits\BelongsToBrand;
use App\Traits\BelongsToOrganization;

class SpecialOffer extends Model
{
    use BelongsToOrganization, BelongsToBrand;

    /**
     * brand_id semantics: NULL = "applies to all brands in the org"
     * (the offer is org-wide), specific id = brand-targeted offer. An offer
     * created with no brand stays NULL (no default brand is filled in) and shows
     * in every brand's view (owner, 2026-10-25; BelongsToBrand, BrandScope).
     */
    public const EVERY_BRAND_WHEN_EMPTY = true;

    protected $fillable = [
        'organization_id', 'brand_id', 'title', 'description', 'type', 'value', 'code', 'applies_to',
        'tier_ids', 'audience', 'start_date', 'end_date',
        'usage_limit', 'times_used', 'per_member_limit', 'image_url', 'terms_conditions',
        'is_active', 'is_featured', 'ai_generated', 'created_by',
    ];

    protected $casts = [
        'tier_ids' => 'array',
        'start_date' => 'date',
        'end_date' => 'date',
        'is_active' => 'boolean',
        'is_featured' => 'boolean',
        'ai_generated' => 'boolean',
        'value' => 'decimal:2',
    ];

    public function memberOffers()
    {
        return $this->hasMany(MemberOffer::class, 'offer_id');
    }

    /** Unrestricted promotions stay independent of the package; level privileges require its current term. */
    public function allowsMembership(LoyaltyMember $member): bool
    {
        if (!$this->allowsRecipient($member)) return false;
        $ids = array_map('intval', (array) $this->tier_ids);
        return $ids === [] || (in_array((int) $member->tier_id, $ids, true)
            && \App\Services\Loyalty\Members\MembershipValidity::benefitsAvailable($member));
    }

    public function allowsRecipient(LoyaltyMember $member): bool
    {
        if ((int) $member->getAttribute('organization_id') !== (int) $this->getAttribute('organization_id')) return false;
        return $this->getAttribute('audience') !== 'members' || \Illuminate\Support\Facades\DB::table('special_offer_recipients')
            ->where('organization_id', $this->getAttribute('organization_id'))->where('offer_id', $this->id)->where('member_id', $member->id)->exists();
    }

    /** @return list<int> */
    public function recipientIds(): array
    {
        return $this->getAttribute('audience') === 'members' ? \Illuminate\Support\Facades\DB::table('special_offer_recipients')
            ->where('organization_id', $this->getAttribute('organization_id'))->where('offer_id', $this->id)->orderBy('member_id')->pluck('member_id')->map(fn ($id) => (int) $id)->all() : [];
    }

    /** Delivery may precede the start date, but stops on the venue's expiry day. */
    public function canDeliver(): bool
    {
        return (bool) $this->is_active && $this->getAttribute('end_date') !== null
            && $this->getAttribute('end_date')->toDateString() >= \App\Services\Appointments\VenueClock::today((int) $this->getAttribute('organization_id'));
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true)
            ->where('start_date', '<=', now()->toDateString())
            ->where('end_date', '>=', now()->toDateString());
    }

    public function scopeForTier($query, int $tierId)
    {
        return $query->where(function ($q) use ($tierId) {
            $q->whereNull('tier_ids')
              ->orWhereJsonContains('tier_ids', $tierId);
        });
    }
}
