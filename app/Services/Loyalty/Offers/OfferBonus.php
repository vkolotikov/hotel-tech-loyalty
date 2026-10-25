<?php

namespace App\Services\Loyalty\Offers;

use App\Models\LoyaltyMember;
use App\Models\MemberOffer;
use App\Models\PointsTransaction;
use App\Models\SpecialOffer;
use App\Models\User;
use App\Services\LoyaltyService;
use Illuminate\Support\Str;

/**
 * A `bonus_points` offer gives its points when it is claimed (release 7, spec 2026-10-25 §4.1): one ledger line through
 * LoyaltyService — type `bonus`, not qualifying (a bonus pads the balance, it does not climb a tier), the offer named in
 * its description, key `offer_bonus_{member_offer_id}` — and the claim is marked used at once, since there is nothing
 * left to show at the desk. The key makes it once per claim whichever path pays it: the member's claim
 * (Member\OfferController) or staff marking an older, unpaid claim used (Admin\DiscountController::useOffer).
 *
 * Called inside the claim's own transaction (the offer row locked first), so a failed award leaves no claim behind.
 * The offer's value is the points; anything else (`discount`, `fixed_amount`, the perks) is not this class's.
 */
final class OfferBonus
{
    public const TYPE = 'bonus_points';

    public function __construct(private readonly LoyaltyService $loyalty)
    {
    }

    /** Whether claiming this offer pays points. */
    public static function paysPoints(?SpecialOffer $offer): bool
    {
        return $offer !== null && $offer->type === self::TYPE && self::points($offer) > 0;
    }

    /** The points the offer gives (its value, whole). */
    public static function points(SpecialOffer $offer): int
    {
        return (int) round((float) $offer->value);
    }

    /** The idempotency key of a claim's points line. */
    public static function key(MemberOffer $claim): string
    {
        return "offer_bonus_{$claim->id}";
    }

    /**
     * Pays the claim's points (once, by its key) and marks it used. Null when the offer pays no points.
     */
    public function pay(MemberOffer $claim, SpecialOffer $offer, LoyaltyMember $member, ?User $by = null): ?PointsTransaction
    {
        if (!self::paysPoints($offer)) {
            return null;
        }

        $line = $this->loyalty->awardPoints(
            $member,
            self::points($offer),
            Str::limit('Offer: ' . $offer->title, 250, ''),
            'bonus',
            $by,
            referenceType: 'member_offer',
            referenceId: (int) $claim->id,
            reasonCode: 'offer_bonus',
            sourceType: $by ? 'admin' : 'system',
            sourceId: (string) $offer->id,
            idempotencyKey: self::key($claim),
            qualifying: false,
        );

        if ($claim->used_at === null || $claim->status !== 'used') {
            $claim->forceFill(['status' => 'used', 'used_at' => $claim->used_at ?? now(), 'claimed_at' => $claim->claimed_at ?? now()])->save();
        }

        return $line;
    }

    /** The points line a claim already paid, if any. */
    public static function paidLine(MemberOffer $claim): ?PointsTransaction
    {
        return PointsTransaction::withoutGlobalScopes()->where('idempotency_key', self::key($claim))->first();
    }
}
