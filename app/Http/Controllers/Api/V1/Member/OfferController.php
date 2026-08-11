<?php

namespace App\Http\Controllers\Api\V1\Member;

use App\Http\Controllers\Controller;
use App\Models\MemberOffer;
use App\Models\SpecialOffer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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

        // The member's own offers: AI-personalised ones they haven't acted
        // on yet, AND anything they have actually claimed.
        //
        // This filtered on status='available' alone, so the moment a member
        // claimed an offer it vanished from their list — the claim existed
        // in the database, was valid, and was invisible to the only person
        // who needed to see it. Recently-used claims stay in the list too,
        // greyed out, so "did I already use that?" has an answer.
        $personalizedOffers = $member->memberOffers()
            ->whereIn('status', ['available', 'claimed', 'used'])
            ->where(function ($q) {
                $q->whereNull('expires_at')->orWhere('expires_at', '>', now());
            })
            ->where(function ($q) {
                $q->whereNull('used_at')->orWhere('used_at', '>', now()->subDays(30));
            })
            ->with('offer')
            ->orderByRaw('used_at IS NULL DESC')
            ->orderByDesc('claimed_at')
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

        try {
            $memberOffer = DB::transaction(function () use ($member, $offer, $offerId) {
                // Lock the offer row before reading the counter. `times_used`
                // was previously incremented unconditionally with no check at
                // all, so a capped promotion had no cap — a "first 100 guests"
                // offer would sail past 100 and the admin list would read
                // "4,812 / 100 used". Under load, two claims could also both
                // read 99 and both proceed.
                $locked = SpecialOffer::whereKey($offer->id)->lockForUpdate()->firstOrFail();

                if ($locked->usage_limit !== null && (int) $locked->times_used >= (int) $locked->usage_limit) {
                    abort(422, 'This offer has been fully claimed.');
                }

                $existingClaims = MemberOffer::where('member_id', $member->id)
                    ->where('offer_id', $offerId)
                    ->count();

                if ($locked->per_member_limit && $existingClaims >= $locked->per_member_limit) {
                    abort(422, 'You have already claimed this offer.');
                }

                // A previously-used claim must not be silently revived into a
                // fresh one: updateOrCreate on (member_id, offer_id) — which
                // is a unique pair — meant a member could re-claim the same
                // offer forever, so `per_member_limit` above 1 could never
                // actually be reached.
                $existing = MemberOffer::where('member_id', $member->id)
                    ->where('offer_id', $offerId)
                    ->first();

                if ($existing && $existing->used_at === null) {
                    return $existing; // already holding an unused claim
                }
                if ($existing) {
                    abort(422, 'You have already used this offer.');
                }

                $claim = MemberOffer::create([
                    'member_id'  => $member->id,
                    'offer_id'   => $offerId,
                    'status'     => 'claimed',
                    'claimed_at' => now(),
                    'expires_at' => $locked->end_date?->endOfDay(),
                ]);

                $locked->increment('times_used');

                return $claim;
            });
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            return response()->json(['message' => $e->getMessage()], $e->getStatusCode());
        }

        return response()->json(['message' => 'Offer claimed!', 'member_offer' => $memberOffer]);
    }
}
