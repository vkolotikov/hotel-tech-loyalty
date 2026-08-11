<?php

namespace App\Http\Controllers\Api\V1\Member;

use App\Http\Controllers\Controller;
use App\Models\BenefitEntitlement;
use App\Models\TierBenefit;
use App\Services\DiscountService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * The member's own tier benefits, and the ability to ask for the ones that
 * need a person.
 *
 * `BenefitEntitlement` models a request lifecycle — `requested_at`, then
 * pending → approved → fulfilled or declined — and `ScanController`
 * already shows staff a member's live entitlements at the counter. But
 * nothing in the codebase ever created a row, so the queue staff were
 * looking at was permanently empty and the whole approve/fulfil workflow
 * was unreachable.
 *
 * The missing half was the member's side. `fulfillment_mode` says which
 * benefits need it:
 *
 *   - `automatic` — applies itself (a tier discount; see DiscountService).
 *     Nothing to request.
 *   - `staff_approved` / `on_request` — someone has to say yes. A late
 *     checkout depends on tomorrow's arrivals; a room upgrade depends on
 *     what's free. These become entitlements.
 *   - `voucher` — issued rather than requested; shown, not actionable here.
 */
class BenefitController extends Controller
{
    /** Modes that a member can actively ask for. */
    private const REQUESTABLE = ['staff_approved', 'on_request'];

    /** Statuses that mean a request is still live. */
    private const OPEN_STATUSES = ['pending', 'eligible', 'approved'];

    public function __construct(private DiscountService $discounts)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $member = $request->user()->loyaltyMember()->with('tier')->first();
        if (!$member) {
            return response()->json(['message' => 'Your membership is not set up yet.'], 404);
        }

        $entitlements = BenefitEntitlement::where('member_id', $member->id)
            ->whereIn('status', array_merge(self::OPEN_STATUSES, ['fulfilled', 'declined']))
            ->orderByDesc('created_at')
            ->get()
            ->groupBy('benefit_id');

        $benefits = $this->discounts->benefitsFor($member)->map(function (TierBenefit $tb) use ($entitlements) {
            $mode = $tb->benefit->fulfillment_mode;
            $mine = $entitlements->get($tb->benefit_id, collect());
            $open = $mine->first(fn ($e) => in_array($e->status, self::OPEN_STATUSES, true));

            return [
                'tier_benefit_id' => $tb->id,
                'benefit_id'      => $tb->benefit_id,
                'name'            => $tb->benefit->name,
                'category'        => $tb->benefit->category,
                'description'     => $tb->custom_description ?? $tb->benefit->description,
                'display'         => $tb->value,
                'fulfillment_mode' => $mode,
                'requestable'     => in_array($mode, self::REQUESTABLE, true) && !$open,
                // The live request, if any — so the UI can say "requested"
                // instead of offering the button again.
                'request'         => $open ? [
                    'id'           => $open->id,
                    'status'       => $open->status,
                    'requested_at' => $open->requested_at?->toIso8601String(),
                ] : null,
                'last_fulfilled_at' => $mine->firstWhere('status', 'fulfilled')?->fulfilled_at?->toIso8601String(),
            ];
        })->values();

        return response()->json([
            'tier'     => $member->tier?->name,
            'benefits' => $benefits,
        ]);
    }

    /**
     * Ask for a benefit. Creates the entitlement staff then action.
     */
    public function requestBenefit(Request $request, int $tierBenefitId): JsonResponse
    {
        $member = $request->user()->loyaltyMember;
        if (!$member) {
            return response()->json(['message' => 'Your membership is not set up yet.'], 404);
        }

        $tierBenefit = TierBenefit::with('benefit')
            ->where('tier_id', $member->tier_id)
            ->where('is_active', true)
            ->find($tierBenefitId);

        if (!$tierBenefit || !$tierBenefit->benefit) {
            return response()->json(['message' => 'That benefit is not available on your tier.'], 404);
        }

        $benefit = $tierBenefit->benefit;

        if (!in_array($benefit->fulfillment_mode, self::REQUESTABLE, true)) {
            return response()->json([
                'message' => 'This benefit applies automatically — there is nothing to request.',
            ], 422);
        }

        try {
            $entitlement = DB::transaction(function () use ($member, $benefit) {
                // Serialise per member+benefit so a double-tapped Request
                // can't open two queue items for the same thing.
                $open = BenefitEntitlement::where('member_id', $member->id)
                    ->where('benefit_id', $benefit->id)
                    ->whereIn('status', self::OPEN_STATUSES)
                    ->lockForUpdate()
                    ->first();

                if ($open) {
                    abort(422, 'You have already requested this — we will be in touch.');
                }

                // Annual cap, where the benefit defines one.
                if ($benefit->usage_limit_per_year) {
                    $usedThisYear = BenefitEntitlement::where('member_id', $member->id)
                        ->where('benefit_id', $benefit->id)
                        ->where('status', 'fulfilled')
                        ->whereYear('fulfilled_at', now()->year)
                        ->count();

                    if ($usedThisYear >= (int) $benefit->usage_limit_per_year) {
                        abort(422, 'You have used this benefit the maximum number of times this year.');
                    }
                }

                return BenefitEntitlement::create([
                    'organization_id' => $member->organization_id,
                    'member_id'       => $member->id,
                    'benefit_id'      => $benefit->id,
                    'status'          => 'pending',
                    'requested_at'    => now(),
                ]);
            });
        } catch (\Symfony\Component\HttpKernel\Exception\HttpException $e) {
            return response()->json(['message' => $e->getMessage()], $e->getStatusCode());
        }

        return response()->json([
            'message'     => 'Requested. Reception will confirm shortly.',
            'entitlement' => $entitlement,
        ], 201);
    }

    /** Withdraw a request that hasn't been actioned yet. */
    public function cancelRequest(Request $request, int $id): JsonResponse
    {
        $member = $request->user()->loyaltyMember;
        if (!$member) {
            return response()->json(['message' => 'Your membership is not set up yet.'], 404);
        }

        $entitlement = BenefitEntitlement::where('member_id', $member->id)->find($id);

        if (!$entitlement) {
            return response()->json(['message' => 'Request not found.'], 404);
        }
        if (!in_array($entitlement->status, ['pending', 'eligible'], true)) {
            return response()->json([
                'message' => 'That request has already been actioned and can no longer be cancelled.',
            ], 422);
        }

        $entitlement->update(['status' => 'cancelled']);

        return response()->json(['message' => 'Request cancelled.']);
    }
}
