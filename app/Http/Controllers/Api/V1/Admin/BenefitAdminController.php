<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\BenefitDefinition;
use App\Models\BenefitEntitlement;
use App\Models\TierBenefit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BenefitAdminController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = BenefitDefinition::orderBy('sort_order');

        if ($request->boolean('active_only')) {
            $query->where('is_active', true);
        }

        return response()->json(['benefits' => $query->get()]);
    }

    public function toggle(int $id): JsonResponse
    {
        $benefit = BenefitDefinition::findOrFail($id);
        $benefit->update(['is_active' => !$benefit->is_active]);

        return response()->json([
            'message'   => $benefit->is_active ? 'Benefit activated' : 'Benefit deactivated',
            'benefit'   => $benefit,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name'                 => 'required|string|max:255',
            'code'                 => 'required|string|max:50|unique:benefit_definitions,code',
            'description'          => 'nullable|string',
            'category'             => 'required|in:accommodation,dining,wellness,transport,recognition,points,access,other',
            'fulfillment_mode'     => 'required|in:automatic,staff_approved,pms_linked,voucher,on_request',
            'usage_limit_per_stay' => 'nullable|integer|min:1',
            'usage_limit_per_year' => 'nullable|integer|min:1',
            'requires_active_stay' => 'boolean',
            'sort_order'           => 'nullable|integer',
        ]);

        $benefit = BenefitDefinition::create($validated);

        return response()->json(['message' => 'Benefit created', 'benefit' => $benefit], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $benefit = BenefitDefinition::findOrFail($id);

        $validated = $request->validate([
            'name'                 => 'sometimes|string|max:255',
            'description'          => 'nullable|string',
            'category'             => 'sometimes|in:accommodation,dining,wellness,transport,recognition,points,access,other',
            'fulfillment_mode'     => 'sometimes|in:automatic,staff_approved,pms_linked,voucher,on_request',
            'usage_limit_per_stay' => 'nullable|integer|min:1',
            'usage_limit_per_year' => 'nullable|integer|min:1',
            'requires_active_stay' => 'sometimes|boolean',
            'is_active'            => 'sometimes|boolean',
            'sort_order'           => 'nullable|integer',
        ]);

        $benefit->update($validated);

        return response()->json(['message' => 'Benefit updated', 'benefit' => $benefit]);
    }

    public function destroy(int $id): JsonResponse
    {
        $benefit = BenefitDefinition::findOrFail($id);
        $benefit->update(['is_active' => false]);

        return response()->json(['message' => 'Benefit deactivated']);
    }

    // ─── Tier Benefits (mapping benefits to tiers) ──────────────────────────

    public function tierBenefits(int $tierId): JsonResponse
    {
        $benefits = TierBenefit::where('tier_id', $tierId)
            ->with('benefit')
            ->where('is_active', true)
            ->get();

        return response()->json(['tier_benefits' => $benefits]);
    }

    public function assignTierBenefit(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'tier_id'            => 'required|exists:loyalty_tiers,id',
            'benefit_id'         => 'required|exists:benefit_definitions,id',
            'property_id'        => 'nullable|exists:properties,id',
            'value'              => 'nullable|string|max:255',
            'custom_description' => 'nullable|string',
        ]);

        $tierBenefit = TierBenefit::updateOrCreate(
            [
                'tier_id'     => $validated['tier_id'],
                'benefit_id'  => $validated['benefit_id'],
                'property_id' => $validated['property_id'] ?? null,
            ],
            [
                'value'              => $validated['value'] ?? null,
                'custom_description' => $validated['custom_description'] ?? null,
                'is_active'          => true,
            ]
        );

        return response()->json(['message' => 'Benefit assigned to tier', 'tier_benefit' => $tierBenefit]);
    }

    public function removeTierBenefit(int $id): JsonResponse
    {
        $tierBenefit = TierBenefit::findOrFail($id);
        $tierBenefit->update(['is_active' => false]);

        return response()->json(['message' => 'Benefit removed from tier']);
    }

    // ─── Entitlement fulfillment workflow ────────────────────────────────────

    public function entitlements(Request $request): JsonResponse
    {
        $query = BenefitEntitlement::with(['member.user', 'benefit', 'property'])
            ->when($request->status, fn($q, $s) => $q->where('status', $s))
            ->when($request->member_id, fn($q, $m) => $q->where('member_id', $m))
            ->orderByDesc('created_at');

        return response()->json($query->paginate($request->get('per_page', 25)));
    }

    public function actionEntitlement(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'action'         => 'required|in:approve,fulfill,decline',
            'decline_reason' => 'required_if:action,decline|nullable|string|max:255',
        ]);

        $entitlement = BenefitEntitlement::findOrFail($id);

        match ($validated['action']) {
            'approve' => $entitlement->approve($request->user()),
            'fulfill' => $entitlement->fulfill($request->user()),
            'decline' => $entitlement->decline($request->user(), $validated['decline_reason'] ?? 'Declined by staff'),
        };

        return response()->json(['message' => "Entitlement {$validated['action']}d", 'entitlement' => $entitlement->fresh()]);
    }
}
