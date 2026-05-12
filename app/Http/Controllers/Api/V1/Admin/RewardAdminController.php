<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\Reward;
use App\Models\RewardRedemption;
use App\Services\AnalyticsService;
use App\Services\LoyaltyService;
use App\Services\MediaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Admin CRUD for the redemption catalog + redemption-fulfilment ledger.
 *
 *  - /v1/admin/rewards                — list / create / update / delete
 *  - /v1/admin/rewards/{id}/toggle    — flip is_active without form
 *  - /v1/admin/rewards/redemptions    — pending + history table
 *  - /v1/admin/rewards/redemptions/{id}/fulfill | cancel
 *
 * Cancel on a still-pending redemption refunds the points to the
 * member via LoyaltyService::awardPoints (type='adjust'). Cancel on
 * an already-fulfilled redemption only updates status — value is
 * gone and a refund would be theft.
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

    public function fulfill(Request $request, int $id): JsonResponse
    {
        $row = RewardRedemption::with('reward')->findOrFail($id);
        if ($row->status !== RewardRedemption::STATUS_PENDING) {
            return response()->json(['message' => "Redemption is already {$row->status}."], 422);
        }
        $row->update([
            'status'               => RewardRedemption::STATUS_FULFILLED,
            'fulfilled_at'         => now(),
            'fulfilled_by_user_id' => $request->user()->id,
            'notes'                => $request->input('notes', $row->notes),
        ]);

        AuditLog::record('reward_redemption_fulfilled', $row,
            ['status' => 'fulfilled'], ['status' => 'pending'],
            $request->user(), "Redemption {$row->code} fulfilled for {$row->reward?->name}");

        AnalyticsService::clearDashboardCache();
        return response()->json(['redemption' => $row->fresh(['reward', 'member.user'])]);
    }

    public function cancel(Request $request, int $id, LoyaltyService $loyalty): JsonResponse
    {
        $request->validate(['notes' => 'nullable|string|max:500']);

        $row = RewardRedemption::with('reward', 'member')->findOrFail($id);
        if ($row->status === RewardRedemption::STATUS_CANCELLED) {
            return response()->json(['message' => 'Redemption is already cancelled.'], 422);
        }

        DB::transaction(function () use ($row, $request, $loyalty) {
            // Only refund points if the redemption hadn't been fulfilled.
            // A cancel on a fulfilled redemption is bookkeeping — staff
            // adjust separately if they want to give the points back.
            if ($row->status === RewardRedemption::STATUS_PENDING) {
                if ($row->member && $row->points_spent > 0) {
                    $loyalty->awardPoints(
                        $row->member,
                        $row->points_spent,
                        "Refund: cancelled reward redemption {$row->code}",
                        'adjust',
                    );
                }
                // Return stock if the reward tracks it.
                if ($row->reward && $row->reward->stock !== null) {
                    $row->reward->increment('stock');
                }
            }

            $row->update([
                'status'               => RewardRedemption::STATUS_CANCELLED,
                'cancelled_at'         => now(),
                'cancelled_by_user_id' => $request->user()->id,
                'notes'                => $request->input('notes', $row->notes),
            ]);
        });

        AuditLog::record('reward_redemption_cancelled', $row,
            ['status' => 'cancelled'], ['status' => $row->getOriginal('status')],
            $request->user(), "Redemption {$row->code} cancelled");

        AnalyticsService::clearDashboardCache();
        return response()->json(['redemption' => $row->fresh(['reward', 'member.user'])]);
    }

    private function validatePayload(Request $request, ?int $id = null): array
    {
        return $request->validate([
            'name'             => 'required|string|max:191',
            'description'      => 'nullable|string',
            'terms'            => 'nullable|string',
            'category'         => 'nullable|string|max:60',
            'points_cost'      => 'required|integer|min:1|max:1000000',
            'stock'            => 'nullable|integer|min:0|max:1000000',
            'per_member_limit' => 'nullable|integer|min:1|max:1000',
            'expires_at'       => 'nullable|date',
            'is_active'        => 'sometimes|boolean',
            'sort_order'       => 'sometimes|integer|min:0|max:10000',
            'image'            => 'nullable|image|mimes:jpeg,png,jpg,webp|max:5120',
        ]);
    }
}
