<?php

namespace App\Http\Controllers\Api\V1\Member;

use App\Http\Controllers\Controller;
use App\Models\MemberOffer;
use App\Models\SpecialOffer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OfferController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $member = $request->user()->loyaltyMember()->with('tier')->firstOrFail();

        // General offers available to this tier
        $offers = SpecialOffer::active()
            ->forTier($member->tier_id)
            ->orderByDesc('is_featured')
            ->orderByDesc('created_at')
            ->get();

        // Personalized AI offers
        $personalizedOffers = $member->memberOffers()
            ->where('status', 'available')
            ->where(function ($q) { $q->whereNull('expires_at')->orWhere('expires_at', '>', now()); })
            ->with('offer')
            ->get();

        return response()->json([
            'general'      => $offers,
            'personalized' => $personalizedOffers,
        ]);
    }

    public function claim(Request $request, int $offerId): JsonResponse
    {
        $member = $request->user()->loyaltyMember;
        $offer = SpecialOffer::active()->findOrFail($offerId);

        // Check per-member limit
        $existingClaims = MemberOffer::where('member_id', $member->id)
            ->where('offer_id', $offerId)
            ->count();

        if ($offer->per_member_limit && $existingClaims >= $offer->per_member_limit) {
            return response()->json(['message' => 'You have already claimed this offer'], 422);
        }

        $memberOffer = MemberOffer::updateOrCreate(
            ['member_id' => $member->id, 'offer_id' => $offerId],
            ['status' => 'claimed', 'claimed_at' => now()]
        );

        $offer->increment('times_used');

        return response()->json(['message' => 'Offer claimed!', 'member_offer' => $memberOffer]);
    }
}
