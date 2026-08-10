<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\MemberOffer;
use App\Services\DiscountService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The counter-facing side of the discount engine.
 *
 * Staff scan a member, type the bill, and get a number they can defend:
 * what comes off, which rule produced it, and what else was eligible. Then
 * they mark the offer used so it can't be presented twice — `used_at` was
 * previously written by no code path at all, so a claimed offer was good
 * forever.
 */
class DiscountController extends Controller
{
    public function __construct(private DiscountService $discounts)
    {
    }

    /**
     * Quote a bill for a member. Read-only — nothing is consumed here, so
     * staff can re-quote as the order changes.
     */
    public function quote(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'member_id'   => 'required|integer',
            'amount'      => 'required|numeric|min:0',
            'property_id' => 'nullable|integer',
        ]);

        // TenantScope narrows this to the caller's organisation.
        $member = LoyaltyMember::with('tier')->find($validated['member_id']);
        if (!$member) {
            return response()->json(['error' => 'Member not found.'], 404);
        }

        $quote = $this->discounts->quote(
            $member,
            (float) $validated['amount'],
            $validated['property_id'] ?? null,
        );

        return response()->json([
            'member' => [
                'id'            => $member->id,
                'member_number' => $member->member_number,
                'name'          => $member->user?->name,
                'tier'          => $member->tier?->name,
            ],
            'quote'             => $quote,
            'points_multiplier' => $this->discounts->pointsMultiplierFor(
                $member,
                $validated['property_id'] ?? null
            ),
        ]);
    }

    /**
     * Burn a claimed offer.
     *
     * Locked and re-checked: without it a double-tapped "Apply" would let
     * the same offer be used twice.
     */
    public function useOffer(Request $request, int $memberOfferId): JsonResponse
    {
        try {
            $claim = DB::transaction(function () use ($memberOfferId) {
                $claim = MemberOffer::whereKey($memberOfferId)->lockForUpdate()->first();

                if (!$claim) {
                    abort(404, 'Offer claim not found.');
                }
                if ($claim->used_at !== null) {
                    abort(422, 'This offer has already been used.');
                }

                $claim->forceFill([
                    'used_at' => now(),
                    'status'  => 'used',
                ])->save();

                return $claim;
            });
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            return response()->json(['message' => $e->getMessage()], $e->getStatusCode());
        }

        AuditLog::record(
            'member_offer_used',
            $claim,
            ['member_id' => $claim->member_id, 'offer_id' => $claim->offer_id],
            [],
            $request->user(),
            'Offer marked used at the counter'
        );

        return response()->json(['message' => 'Offer marked as used.', 'member_offer' => $claim]);
    }

    /** What a member is entitled to right now, with no bill attached. */
    public function benefits(Request $request, int $memberId): JsonResponse
    {
        $member = LoyaltyMember::with('tier')->find($memberId);
        if (!$member) {
            return response()->json(['error' => 'Member not found.'], 404);
        }

        $propertyId = $request->integer('property_id') ?: null;

        return response()->json([
            'tier'     => $member->tier?->name,
            'benefits' => $this->discounts->benefitsFor($member, $propertyId)->map(fn ($tb) => [
                'id'           => $tb->id,
                'name'         => $tb->benefit->name,
                'category'     => $tb->benefit->category,
                'description'  => $tb->custom_description ?? $tb->benefit->description,
                // Both forms: the sentence staff read out, and the number
                // the engine computed with.
                'display'      => $tb->value,
                'value_type'   => $tb->value_type,
                'value_amount' => $tb->value_amount !== null ? (float) $tb->value_amount : null,
                'enforceable'  => in_array($tb->value_type, [
                    DiscountService::PERCENT,
                    DiscountService::FIXED,
                    DiscountService::MULTIPLIER,
                ], true),
            ])->values(),
            'points_multiplier' => $this->discounts->pointsMultiplierFor($member, $propertyId),
        ]);
    }
}
