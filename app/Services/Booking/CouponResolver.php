<?php

namespace App\Services\Booking;

use App\Models\LoyaltyMember;
use App\Models\MemberOffer;
use App\Models\RewardRedemption;
use App\Models\SpecialOffer;
use App\Services\DiscountService;
use Illuminate\Support\Facades\DB;

/**
 * Turns the member's coupon choice into a discount candidate the engine can
 * weigh, and consumes it once a booking is confirmed. Every lookup asserts
 * the row belongs to this member inside this organisation.
 */
final class CouponResolver
{
    public function candidate(LoyaltyMember $member, CouponSelection $sel, BookingScope $scope): array
    {
        return $sel->isOffer() ? $this->offerCandidate($member, $sel->memberOfferId, $scope) : $this->rewardCandidate($member, $sel->redemptionId, $scope);
    }

    /**
     * A member-typed code becomes the same summary the portal shows for a
     * claimed offer or a redeemed reward. Offer codes are claimed on the
     * spot (or the member's existing unused claim is reused); reward codes
     * were already claimed at redemption time, so this only looks one up.
     */
    public function resolveCode(LoyaltyMember $member, string $code): array
    {
        $code = strtoupper(trim($code));
        if ($code === '') {
            throw new CouponException('coupon_not_found', 'Enter a code.');
        }

        return str_starts_with($code, 'REW-')
            ? $this->resolveRewardCode($member, $code)
            : $this->resolveOfferCode($member, $code);
    }

    private function resolveOfferCode(LoyaltyMember $member, string $code): array
    {
        return DB::transaction(function () use ($member, $code) {
            $offer = SpecialOffer::withoutGlobalScopes()
                ->where('organization_id', $member->organization_id)
                ->active()
                ->whereRaw('UPPER(code) = ?', [$code])
                ->lockForUpdate()
                ->first();
            if (!$offer) {
                throw new CouponException('coupon_not_found', 'We do not recognise that code.');
            }

            $tierIds = array_map('intval', (array) ($offer->tier_ids ?? []));
            if ($tierIds !== [] && !in_array((int) $member->tier_id, $tierIds, true)) {
                throw new CouponException('coupon_wrong_tier', 'This code is for another membership level.');
            }

            $type = $this->moneyType($offer->type);
            if ($type === null) {
                throw new CouponException('coupon_untyped', 'This offer has no money value and cannot be used as a coupon.');
            }

            // per_member_limit (minimum 1) is enforced by construction, not by
            // counting: member_offers is unique on (member_id, offer_id), so
            // a member can hold at most one claim of this offer. An unused
            // claim is reused (never a second row); a used one is refused
            // below with coupon_used. If that unique index is ever dropped,
            // this method must start counting claims against
            // $offer->per_member_limit instead of relying on it implicitly.
            $claim = MemberOffer::where('member_id', $member->id)->where('offer_id', $offer->id)->first();
            if ($claim && ($claim->used_at !== null || $claim->status === 'used')) {
                throw new CouponException('coupon_used', 'You have already used this code.');
            }
            if (!$claim) {
                if (!app(DiscountService::class)->offerHasCapacity($offer)) {
                    throw new CouponException('coupon_no_capacity', 'This code has been fully claimed.');
                }
                $claim = MemberOffer::create([
                    'organization_id' => $member->organization_id,
                    'member_id' => $member->id,
                    'offer_id' => $offer->id,
                    'status' => 'claimed',
                    'claimed_at' => now(),
                    'expires_at' => $offer->end_date?->copy()->endOfDay(),
                ]);
                $offer->increment('times_used');
            }

            return [
                'kind' => 'offer',
                'coupon' => ['member_offer_id' => $claim->id],
                'label' => $offer->title,
                'value_label' => $this->valueLabel($type, (float) $offer->value),
                'valid_until' => $offer->end_date?->toDateString(),
                'type' => $type,
                'value' => (float) $offer->value,
            ];
        });
    }

    private function resolveRewardCode(LoyaltyMember $member, string $code): array
    {
        $red = RewardRedemption::with('reward')
            ->where('organization_id', $member->organization_id)
            ->where('member_id', $member->id)
            ->whereRaw('UPPER(code) = ?', [$code])
            ->first();
        if (!$red) {
            throw new CouponException('coupon_not_found', 'We do not recognise that code on your account.');
        }
        if ($red->status !== RewardRedemption::STATUS_PENDING) {
            throw new CouponException('coupon_used', 'This reward code has already been used.');
        }
        $type = $red->reward ? $this->moneyType($red->reward->discount_type) : null;
        if ($type === null || (float) $red->reward->discount_value <= 0) {
            throw new CouponException('coupon_untyped', 'This reward has no money value and cannot be used as a coupon.');
        }

        return [
            'kind' => 'reward',
            'coupon' => ['redemption_id' => $red->id],
            'label' => $red->reward->name,
            'value_label' => $this->valueLabel($type, (float) $red->reward->discount_value),
            'valid_until' => null,
            'type' => $type,
            'value' => (float) $red->reward->discount_value,
        ];
    }

    /** English fallback; the portal localises its own label from type/value. */
    private function valueLabel(string $type, float $value): string
    {
        return $type === DiscountService::PERCENT
            ? rtrim(rtrim(number_format($value, 2, '.', ''), '0'), '.') . '% off'
            : number_format($value, 2) . ' off';
    }

    public function consume(array $candidate, string $reference): void
    {
        if ($candidate['source'] === 'offer') {
            $claim = MemberOffer::whereKey($candidate['source_id'])->lockForUpdate()->first();
            if (!$claim || $claim->used_at !== null) throw new CouponException('coupon_used', 'This offer has already been used.');
            $claim->forceFill(['used_at' => now(), 'status' => 'used', 'used_reference' => $reference])->save();
            return;
        }
        $red = RewardRedemption::whereKey($candidate['source_id'])->lockForUpdate()->first();
        if (!$red || $red->status !== RewardRedemption::STATUS_PENDING) throw new CouponException('coupon_used', 'This reward code has already been used.');
        $red->forceFill(['status' => RewardRedemption::STATUS_FULFILLED, 'fulfilled_at' => now(), 'notes' => "Applied to {$reference}"])->save();
    }

    /**
     * Moves a coupon this request consumed from a provisional reference to
     * the booking's own. A stay is booked at the PMS inside the same
     * transaction that consumes the coupon, and its reference is the PMS's
     * to give — so the coupon is consumed first (a refusal then costs
     * nothing) under a reference made from the hold, and renamed here once
     * the booking exists. Touches nothing that does not carry $from.
     */
    public function rereference(array $candidate, string $from, string $to): void
    {
        if ($candidate['source'] === 'offer') {
            MemberOffer::whereKey($candidate['source_id'])->where('used_reference', $from)->update(['used_reference' => mb_substr($to, 0, 60)]);
            return;
        }
        RewardRedemption::whereKey($candidate['source_id'])->where('notes', "Applied to {$from}")->update(['notes' => "Applied to {$to}"]);
    }

    private function offerCandidate(LoyaltyMember $member, int $memberOfferId, BookingScope $scope): array
    {
        $claim = MemberOffer::with('offer')->whereKey($memberOfferId)->first();
        if (!$claim || (int) $claim->member_id !== (int) $member->id || (int) ($claim->organization_id ?? $member->organization_id) !== (int) $member->organization_id) {
            throw new CouponException('coupon_not_found', 'We could not find that offer on your account.');
        }
        if ($claim->used_at !== null || $claim->status === 'used') throw new CouponException('coupon_used', 'This offer has already been used.');
        $offer = $claim->offer;
        if (!$offer || !$offer->is_active) throw new CouponException('coupon_expired', 'This offer is no longer available.');
        if (($claim->expires_at && $claim->expires_at->isPast()) || ($offer->end_date && $offer->end_date->endOfDay()->isPast())) {
            throw new CouponException('coupon_expired', 'This offer has expired.');
        }
        $type = $this->moneyType($offer->type);
        if ($type === null) throw new CouponException('coupon_untyped', 'This offer has no money value and cannot be used as a coupon.');

        return ['source' => 'offer', 'source_id' => $claim->id, 'label' => $offer->title, 'type' => $type, 'value' => (float) $offer->value, 'applies' => $scope->admits($offer->applies_to)];
    }

    private function rewardCandidate(LoyaltyMember $member, int $redemptionId, BookingScope $scope): array
    {
        $red = RewardRedemption::with('reward')->whereKey($redemptionId)->first();
        if (!$red || (int) $red->member_id !== (int) $member->id || (int) $red->organization_id !== (int) $member->organization_id) {
            throw new CouponException('coupon_not_found', 'We could not find that reward code on your account.');
        }
        if ($red->status !== RewardRedemption::STATUS_PENDING) throw new CouponException('coupon_used', 'This reward code has already been used.');
        $reward = $red->reward;
        $type = $reward ? $this->moneyType($reward->discount_type) : null;
        if ($type === null || (float) $reward->discount_value <= 0) throw new CouponException('coupon_untyped', 'This reward has no money value and cannot be used as a coupon.');

        return ['source' => 'reward', 'source_id' => $red->id, 'label' => $reward->name, 'type' => $type, 'value' => (float) $reward->discount_value, 'applies' => $scope->admits($reward->applies_to)];
    }

    /** The engine's loose type match (DiscountService::quote) made explicit. */
    private function moneyType(?string $type): ?string
    {
        $t = strtolower((string) $type);
        if ($t === DiscountService::PERCENT || $t === 'discount' || str_contains($t, 'percent')) return DiscountService::PERCENT;
        if ($t === DiscountService::FIXED || str_contains($t, 'amount') || str_contains($t, 'fixed')) return DiscountService::FIXED;
        return null;
    }
}
