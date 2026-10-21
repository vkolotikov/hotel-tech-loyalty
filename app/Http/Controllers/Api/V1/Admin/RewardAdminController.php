<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\Reward;
use App\Models\RewardRedemption;
use App\Services\Loyalty\RedemptionActions;
use App\Services\Loyalty\RedemptionStateException;
use App\Services\MediaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * Admin CRUD for the redemption catalog + redemption-fulfilment ledger.
 *
 *  - /v1/admin/rewards                — list / create / update / delete
 *  - /v1/admin/rewards/{id}/toggle    — flip is_active without form
 *  - /v1/admin/rewards/redemptions    — pending + history table
 *  - /v1/admin/rewards/redemptions/{id}/fulfill | cancel
 *
 * Fulfil and cancel are RedemptionActions', which HexaTech Loyalty calls
 * too: a cancel on a still-pending redemption gives the points back by
 * reversing the debit; a cancel on an already-fulfilled redemption only
 * updates status — value is gone and a refund would be theft.
 */
class RewardAdminController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $rows = Reward::query()
            ->when($request->filled('q'), function ($q) use ($request) {
                $s = '%' . trim((string) $request->input('q')) . '%';
                $q->where(fn ($qq) => $qq->where('name', 'ilike', $s)->orWhere('category', 'ilike', $s));
            })
            ->when($request->filled('is_active'), fn ($q) => $q->where('is_active', $request->boolean('is_active')))
            ->withCount(['redemptions as redemption_count', 'redemptions as fulfilled_count' => fn ($q) => $q->where('status', 'fulfilled')])
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json(['rewards' => $rows]);
    }

    public function show(int $id): JsonResponse
    {
        $reward = Reward::with(['redemptions' => fn ($q) => $q->latest()->limit(20),
                                'redemptions.member.user:id,name,email'])
            ->findOrFail($id);
        return response()->json(['reward' => $reward]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validatePayload($request);
        // Not sent by the caller: fall back to the column default explicitly
        // so the in-memory model returned below (not re-fetched) carries it —
        // Eloquent::create() never backfills a DB column default onto the
        // instance it hands back.
        $data['applies_to'] = $data['applies_to'] ?? 'all';
        $this->clearDiscountValueWhenTypeCleared($request, $data);

        if ($request->hasFile('image')) {
            $data['image_url'] = MediaService::upload($request->file('image'), 'rewards');
        }
        unset($data['image']);

        $reward = Reward::create($data);

        AuditLog::record('reward_created', $reward, $reward->toArray(), [], $request->user(),
            "Reward '{$reward->name}' created");

        return response()->json(['reward' => $reward], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $reward = Reward::findOrFail($id);
        $old = $reward->toArray();

        $data = $this->validatePayload($request, $reward->id);
        $this->clearDiscountValueWhenTypeCleared($request, $data);

        if ($request->hasFile('image')) {
            $data['image_url'] = MediaService::upload($request->file('image'), 'rewards');
        }
        unset($data['image']);

        $reward->update($data);

        AuditLog::record('reward_updated', $reward, $reward->toArray(), $old, $request->user(),
            "Reward '{$reward->name}' updated");

        return response()->json(['reward' => $reward->fresh()]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $reward = Reward::findOrFail($id);
        // Soft-protection: refuse delete if there's a pending redemption.
        $pending = RewardRedemption::where('reward_id', $id)
            ->where('status', RewardRedemption::STATUS_PENDING)
            ->count();
        if ($pending > 0) {
            return response()->json([
                'message' => "Cannot delete — {$pending} pending redemption(s). Fulfil or cancel them first, or deactivate the reward instead.",
            ], 422);
        }

        $name = $reward->name;
        $reward->delete();

        AuditLog::record('reward_deleted', null, ['reward_id' => $id, 'name' => $name], [],
            $request->user(), "Reward '{$name}' deleted");

        return response()->json(['success' => true]);
    }

    public function toggleActive(Request $request, int $id): JsonResponse
    {
        $reward = Reward::findOrFail($id);
        $reward->is_active = !$reward->is_active;
        $reward->save();

        AuditLog::record('reward_toggled', $reward, ['is_active' => $reward->is_active],
            ['is_active' => !$reward->is_active], $request->user(),
            "Reward '{$reward->name}' " . ($reward->is_active ? 'activated' : 'deactivated'));

        return response()->json(['reward' => $reward]);
    }

    /**
     * GET /v1/admin/rewards/redemptions
     */
    public function redemptions(Request $request): JsonResponse
    {
        $rows = RewardRedemption::with([
                'reward:id,name,category,points_cost,image_url',
                'member.user:id,name,email,phone',
                'fulfilledBy:id,name',
            ])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')))
            ->when($request->filled('q'), function ($q) use ($request) {
                $s = '%' . trim((string) $request->input('q')) . '%';
                $q->where(function ($q) use ($s) {
                    $q->where('code', 'ilike', $s)
                      ->orWhereHas('member.user', fn ($qq) => $qq->where('name', 'ilike', $s)->orWhere('email', 'ilike', $s));
                });
            })
            ->orderByDesc('created_at')
            ->paginate(25);

        return response()->json($rows);
    }

    public function fulfill(Request $request, int $id, RedemptionActions $actions): JsonResponse
    {
        try {
            $row = $actions->fulfil($id, $request->user(), $request->exists('notes') ? $request->input('notes') : false);
        } catch (RedemptionStateException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['redemption' => $row->fresh(['reward', 'member.user'])]);
    }

    public function cancel(Request $request, int $id, RedemptionActions $actions): JsonResponse
    {
        $request->validate(['notes' => 'nullable|string|max:500']);

        try {
            $row = $actions->cancel($id, $request->user(), $request->exists('notes') ? $request->input('notes') : false);
        } catch (RedemptionStateException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json(['redemption' => $row->fresh(['reward', 'member.user'])]);
    }

    /**
     * A reward's discount couldn't be cleared once set: sending
     * `discount_type: null` left `discount_value` in place, because
     * `discount_value` simply wasn't present in the request the client sent
     * to clear it, so `$reward->update($data)` never touched that column.
     * Only clear when `discount_type` was actually SENT and is empty — a
     * request that omits the field entirely (e.g. "just rename this
     * reward") must leave the discount exactly as it was, the same
     * has()-gated pattern `BenefitAdminController::assignTierBenefit` uses
     * for its own typed fields.
     */
    private function clearDiscountValueWhenTypeCleared(Request $request, array &$data): void
    {
        if ($request->has('discount_type') && !$request->filled('discount_type')) {
            $data['discount_type'] = null;
            $data['discount_value'] = null;
        }
    }

    private function validatePayload(Request $request, ?int $id = null): array
    {
        return Validator::make($request->all(), [
            'name'             => 'required|string|max:191',
            'description'      => 'nullable|string',
            'terms'            => 'nullable|string',
            'category'         => 'nullable|string|max:60',
            'points_cost'      => 'required|integer|min:1|max:1000000',
            'stock'            => 'nullable|integer|min:0|max:1000000',
            'per_member_limit' => 'nullable|integer|min:1|max:1000',
            // Typed discount: what makes a reward's redemption enforceable
            // against a real booking total, not just a catalog description.
            'discount_type'    => 'nullable|in:percent_discount,fixed_amount',
            'discount_value'   => 'nullable|numeric|min:0.01|max:100000|required_with:discount_type',
            // Booking scope: which kind of booking this reward's discount is
            // allowed to apply to (see BookingScope).
            'applies_to'       => 'nullable|in:all,services,stays',
            'expires_at'       => 'nullable|date',
            'is_active'        => 'sometimes|boolean',
            'sort_order'       => 'sometimes|integer|min:0|max:10000',
            'image'            => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
        ])->after(function ($validator) use ($request) {
            // A percentage above 100 would hand money back — the same guard
            // BenefitAdminController applies to tier benefits.
            if ($request->input('discount_type') === 'percent_discount'
                && (float) $request->input('discount_value', 0) > 100) {
                $validator->errors()->add('discount_value', 'A percentage discount cannot exceed 100%.');
            }
        })->validate();
    }
}
