<?php

namespace App\Http\Controllers\Api\V1\Member;

use App\Http\Controllers\Controller;
use App\Models\Reward;
use App\Models\RewardRedemption;
use App\Services\LoyaltyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Member self-serve rewards catalog.
 *
 *  - GET    /v1/member/rewards               → visible catalog
 *  - GET    /v1/member/rewards/{id}          → detail
 *  - POST   /v1/member/rewards/{id}/redeem   → atomic redeem
 *  - GET    /v1/member/my/redemptions        → my redemption history + codes
 *
 * Redemption is a single DB transaction wrapping: stock decrement
 * (skip when unlimited), per-member-limit check, points debit via
 * LoyaltyService::redeemPoints (idempotency-keyed), redemption row
 * insert with unique short code. The unique index on (org, code)
 * lets the retry loop pick a fresh code without race risk.
 */
class RewardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $rows = Reward::where('is_active', true)
            ->where(function ($q) {
                $q->whereNull('expires_at')->orWhere('expires_at', '>', now());
            })
            ->orderBy('sort_order')
            ->orderBy('points_cost')
            ->get(['id', 'name', 'description', 'category', 'image_url', 'points_cost', 'stock', 'per_member_limit', 'expires_at']);

        $member = $request->user()->loyaltyMember;
        $balance = $member?->current_points ?? 0;

        // Attach per-row affordability + member's own consumed count so
        // the mobile UI can render "Redeem" / "Need 250 more pts" /
        // "Already claimed (1/1)" without a second round-trip.
        $consumed = RewardRedemption::where('member_id', $member?->id)
            ->whereIn('status', [RewardRedemption::STATUS_PENDING, RewardRedemption::STATUS_FULFILLED])
            ->selectRaw('reward_id, COUNT(*) AS n')
            ->groupBy('reward_id')
            ->pluck('n', 'reward_id');

        $catalog = $rows->map(function (Reward $r) use ($balance, $consumed) {
            $claimed = (int) ($consumed[$r->id] ?? 0);
            return array_merge($r->toArray(), [
                'can_afford'          => $balance >= $r->points_cost,
                'claimed_by_me'       => $claimed,
                'remaining_for_me'    => $r->per_member_limit === null ? null : max(0, $r->per_member_limit - $claimed),
                'in_stock'            => $r->stock === null ? null : $r->stock > 0,
            ]);
        });

        return response()->json([
            'rewards'        => $catalog,
            'current_points' => $balance,
        ]);
    }

    public function show(int $id): JsonResponse
    {
        $reward = Reward::where('is_active', true)->findOrFail($id);
        return response()->json(['reward' => $reward]);
    }

    public function redeem(Request $request, int $id, LoyaltyService $loyalty): JsonResponse
    {
        $member = $request->user()->loyaltyMember;
        if (!$member) {
            return response()->json(['message' => 'No loyalty membership on this account.'], 422);
        }

        // Lock the reward row for the duration of the transaction so
        // a concurrent redemption can't both pass the stock check.
        try {
            $result = DB::transaction(function () use ($id, $member, $loyalty) {
                $reward = Reward::lockForUpdate()->findOrFail($id);

                if (!$reward->isRedeemable()) {
                    abort(422, 'This reward is no longer available.');
                }

                if ($member->current_points < $reward->points_cost) {
                    abort(422, "You need {$reward->points_cost} points; you currently have {$member->current_points}.");
                }

                if ($reward->per_member_limit !== null) {
                    $alreadyTaken = RewardRedemption::where('member_id', $member->id)
                        ->where('reward_id', $reward->id)
                        ->whereIn('status', [RewardRedemption::STATUS_PENDING, RewardRedemption::STATUS_FULFILLED])
                        ->count();
                    if ($alreadyTaken >= $reward->per_member_limit) {
                        abort(422, 'You have reached the per-member limit for this reward.');
                    }
                }

                if ($reward->stock !== null) {
                    if ($reward->stock <= 0) {
                        abort(422, 'Out of stock.');
                    }
                    $reward->decrement('stock');
                }

                $code = $this->generateUniqueCode($member->organization_id);

                $redemption = RewardRedemption::create([
                    'organization_id' => $member->organization_id,
                    'member_id'       => $member->id,
                    'reward_id'       => $reward->id,
                    'points_spent'    => $reward->points_cost,
                    'code'            => $code,
                    'status'          => RewardRedemption::STATUS_PENDING,
                ]);

                $loyalty->redeemPoints(
                    $member,
                    $reward->points_cost,
                    "Reward: {$reward->name}",
                    null,
                    null,
                    'catalog_redeem',
                    'reward_redemption_' . $redemption->id,
                );

                return $redemption;
            });
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            // Validation-style aborts above — surface the original message.
            return response()->json(['message' => $e->getMessage()], $e->getStatusCode());
        }

        return response()->json([
            'redemption' => $result->fresh(['reward']),
            'message'    => "Show code {$result->code} at the front desk to claim.",
        ], 201);
    }

    public function myRedemptions(Request $request): JsonResponse
    {
        $member = $request->user()->loyaltyMember;
        if (!$member) return response()->json(['redemptions' => []]);

        $rows = RewardRedemption::where('member_id', $member->id)
            ->with('reward:id,name,category,image_url,points_cost')
            ->orderByDesc('created_at')
            ->limit(100)
            ->get();

        return response()->json(['redemptions' => $rows]);
    }

    /**
     * Best-effort unique code generator. 1 in 256³ collision chance
     * per call (over ~16M codes per 8-char alphabet); the unique
     * index guarantees correctness either way. The retry budget is
     * 4 because by then something is structurally wrong (the index
     * is dropped, there's lock contention from a runaway script, etc).
     */
    private function generateUniqueCode(int $orgId): string
    {
        for ($i = 0; $i < 4; $i++) {
            $code = 'REW-' . strtoupper(Str::random(8));
            if (!RewardRedemption::where('organization_id', $orgId)->where('code', $code)->exists()) {
                return $code;
            }
        }
        return 'REW-' . strtoupper(Str::random(12));
    }
}
