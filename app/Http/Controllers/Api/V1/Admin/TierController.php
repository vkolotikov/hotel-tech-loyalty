<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\LoyaltyMember;
use App\Models\LoyaltyTier;
use App\Services\AnalyticsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TierController extends Controller
{
    public function index(): JsonResponse
    {
        $tiers = LoyaltyTier::orderBy('sort_order')->get();

        $tiersWithStats = $tiers->map(function (LoyaltyTier $tier) {
            $memberCount = LoyaltyMember::where('tier_id', $tier->id)->where('is_active', true)->count();
            return array_merge($tier->toArray(), ['member_count' => $memberCount]);
        });

        return response()->json(['tiers' => $tiersWithStats]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'                 => 'required|string|max:255',
            'min_points'           => 'required|integer|min:0',
            'max_points'           => 'nullable|integer',
            'earn_rate'            => 'required|numeric|min:0',
            'color_hex'            => 'nullable|string|max:7',
            'description'          => 'nullable|string',
            'min_nights'           => 'nullable|integer|min:0',
            'min_stays'            => 'nullable|integer|min:0',
            'min_spend'            => 'nullable|numeric|min:0',
            'qualification_window' => 'nullable|in:rolling_12,calendar_year,anniversary_year',
            'grace_period_days'    => 'nullable|integer|min:0',
            'soft_landing'         => 'boolean',
            'invitation_only'      => 'boolean',
            'sort_order'           => 'nullable|integer',
        ]);

        $tier = LoyaltyTier::create($validated);

        AuditLog::record('tier_created', $tier, $validated, [], $request->user(), "Tier '{$tier->name}' created");
        AnalyticsService::clearDashboardCache();

        return response()->json(['message' => 'Tier created', 'tier' => $tier], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $tier = LoyaltyTier::findOrFail($id);

        $validated = $request->validate([
            'name'                 => 'sometimes|string|max:255',
            'min_points'           => 'sometimes|integer|min:0',
            'max_points'           => 'nullable|integer',
            'earn_rate'            => 'sometimes|numeric|min:0',
            'color_hex'            => 'nullable|string|max:7',
            'description'          => 'nullable|string',
            'min_nights'           => 'nullable|integer|min:0',
            'min_stays'            => 'nullable|integer|min:0',
            'min_spend'            => 'nullable|numeric|min:0',
            'qualification_window' => 'nullable|in:rolling_12,calendar_year,anniversary_year',
            'grace_period_days'    => 'nullable|integer|min:0',
            'soft_landing'         => 'sometimes|boolean',
            'invitation_only'      => 'sometimes|boolean',
            'is_active'            => 'sometimes|boolean',
            'sort_order'           => 'nullable|integer',
        ]);

        $oldValues = $tier->only(array_keys($validated));
        $tier->update($validated);

        AuditLog::record('tier_updated', $tier, $validated, $oldValues, $request->user(), "Tier '{$tier->name}' updated");
        AnalyticsService::clearDashboardCache();

        return response()->json(['message' => 'Tier updated', 'tier' => $tier]);
    }
}
